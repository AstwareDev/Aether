//! A loopback host for the DevTools front-end.
//!
//! Chromium serves the real inspector over its debugging endpoint, and pointing
//! a webview straight at it very nearly works — but the page then talks to that
//! endpoint itself, which is a poor arrangement:
//!
//! * Chromium rejects debugging sockets whose request carries an `Origin` it was
//!   not told to allow, and a page always sends one. Rust does not.
//! * The endpoint's port moves whenever the shared browser process restarts,
//!   which strands any URL already baked into a loaded page.
//! * A URL naming one page target goes stale the moment that target does.
//!
//! So the front-end is served from here instead, and its CDP socket is bridged
//! from here too. The URL a pane's inspector loads never changes: the page it
//! should be attached to is worked out afresh on every connection.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::{
    body::Body,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, RawQuery, State,
    },
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Manager, Runtime};
use tokio_tungstenite::tungstenite;

use crate::browser;

/// Port the host is listening on, once it has been started.
static PORT: Mutex<Option<u16>> = Mutex::new(None);

/// Starts the host if it is not already up, and returns its port.
///
/// The listener is bound synchronously so the caller gets a port it can put in
/// a URL straight away, then handed to the async runtime to serve.
pub fn ensure_started<R: Runtime>(app: &AppHandle<R>) -> Result<u16, String> {
    let mut slot = PORT
        .lock()
        .map_err(|_| "the devtools host is unavailable".to_string())?;
    if let Some(port) = *slot {
        return Ok(port);
    }

    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("could not start the devtools host: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("could not start the devtools host: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Ok(listener) = tokio::net::TcpListener::from_std(listener) else {
            return;
        };
        let _ = axum::serve(listener, router(app)).await;
    });

    *slot = Some(port);
    Ok(port)
}

fn router<R: Runtime>(app: AppHandle<R>) -> Router {
    Router::new()
        .route("/devtools/{*path}", get(asset::<R>))
        .route("/pane/{label}", get(pane_socket::<R>))
        .route("/aether/{file}", get(own_file))
        .route("/aether/fonts/{file}", get(own_file))
        .with_state(app)
}

/// Where a pane's inspector loads from. Stable for the life of the pane.
pub fn front_end_url(port: u16, pane: &str) -> String {
    format!("http://127.0.0.1:{port}/devtools/inspector.html?ws=127.0.0.1:{port}/pane/{pane}")
}

// ── serving the front-end ─────────────────────────────────────────────

/// Passes a front-end file through from Chromium.
///
/// The port is looked up per request rather than remembered, so a restarted
/// browser process is picked up without anything else having to notice.
async fn asset<R: Runtime>(
    State(app): State<AppHandle<R>>,
    Path(path): Path<String>,
    RawQuery(query): RawQuery,
) -> Response {
    let Ok(port) = browser::debug_port(&app) else {
        return (
            StatusCode::BAD_GATEWAY,
            "the webview is not exposing an inspector endpoint",
        )
            .into_response();
    };

    let query = query.map(|q| format!("?{q}")).unwrap_or_default();
    let Ok(upstream) = reqwest::get(format!("http://127.0.0.1:{port}/devtools/{path}{query}")).await
    else {
        return (StatusCode::BAD_GATEWAY, "the inspector endpoint did not answer").into_response();
    };

    let status = StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::OK);
    let content_type = upstream
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let Ok(bytes) = upstream.bytes().await else {
        return (StatusCode::BAD_GATEWAY, "the inspector endpoint cut the response").into_response();
    };

    let body = if content_type.starts_with("text/html") {
        Body::from(themed(&String::from_utf8_lossy(&bytes)))
    } else {
        Body::from(bytes)
    };

    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .body(body)
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

/// Aether's own files: the two faces and the mark the theme names, which the
/// front-end cannot reach any other way — it is a different origin from the app
/// that bundles them — and the script that carries the theme into shadow DOM.
///
/// The mark is the same file the app itself renders, so a change to the logo
/// reaches the inspector without anyone remembering to copy it.
async fn own_file(Path(file): Path<String>) -> Response {
    let (content_type, bytes): (&str, &'static [u8]) = match file.as_str() {
        "inter.woff2" => ("font/woff2", include_bytes!("../assets/fonts/inter.woff2")),
        "jetbrains-mono.woff2" => (
            "font/woff2",
            include_bytes!("../assets/fonts/jetbrains-mono.woff2"),
        ),
        "logo.svg" => ("image/svg+xml", include_bytes!("../../public/logo.svg")),
        "inject.js" => ("text/javascript; charset=utf-8", INJECT.as_bytes()),
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    (
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        bytes,
    )
        .into_response()
}

const THEME: &str = include_str!("devtools_theme.css");
const THEME_MARKER: &str = "aether-devtools-theme";
const INJECT: &str = include_str!("devtools_inject.js");

/// Dresses a front-end page in Aether's colours and type.
///
/// The style is inline because the front-end's CSP allows inline styles; the
/// script has to come from a URL because the same CSP allows scripts only from
/// this origin. The style goes first — the script reads the sheet back out of it
/// rather than fetching it again.
fn themed(html: &str) -> String {
    if html.contains(THEME_MARKER) {
        return html.to_string();
    }
    let payload = format!(
        "<style id=\"{THEME_MARKER}\">{THEME}</style><script src=\"/aether/inject.js\"></script>"
    );
    let at = insertion_point(html);
    format!("{}{payload}{}", &html[..at], &html[at..])
}

/// Where injected markup can go without changing how the page is parsed.
///
/// `</head>` when there is one. Otherwise after the doctype — putting anything
/// before that would drop the page into quirks mode. A classic script runs
/// during parsing either way, so it still goes before DevTools' own modules,
/// which are deferred.
fn insertion_point(html: &str) -> usize {
    let lowered = html.to_ascii_lowercase();
    if let Some(at) = lowered.find("</head>") {
        return at;
    }
    if let Some(start) = lowered.find("<!doctype") {
        if let Some(end) = lowered[start..].find('>') {
            return start + end + 1;
        }
    }
    0
}

// ── bridging the protocol socket ──────────────────────────────────────

async fn pane_socket<R: Runtime>(
    State(app): State<AppHandle<R>>,
    Path(pane): Path<String>,
    upgrade: WebSocketUpgrade,
) -> Response {
    upgrade.on_upgrade(move |socket| bridge(app, pane, socket))
}

/// Undoes everything DevTools can leave behind on a page.
///
/// Device emulation, touch emulation and screencasting are applied to the
/// *page*, not to the panel, and the page keeps them after the panel is gone —
/// stranding it inside a phone-shaped frame with nothing left to clear it.
///
/// These have to go out on the socket that set them. A later connection can
/// send the same commands and Chromium answers `{"result":{}}` to every one of
/// them, but the page does not budge; clearing only undoes overrides belonging
/// to the session doing the clearing.
const RESET: [&str; 3] = [
    r#"{"id":2147483001,"method":"Emulation.clearDeviceMetricsOverride"}"#,
    r#"{"id":2147483002,"method":"Emulation.setTouchEmulationEnabled","params":{"enabled":false}}"#,
    r#"{"id":2147483003,"method":"Page.stopScreencast"}"#,
];

type Upstream = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

/// Joins the front-end's socket to the page's, for as long as both live.
///
/// Written as one loop rather than two tasks so the upstream sink is still in
/// hand when the panel goes away, which is the only moment the page can be put
/// back to normal.
async fn bridge<R: Runtime>(app: AppHandle<R>, pane: String, client: WebSocket) {
    let Some(upstream) = dial(&app, &pane).await else {
        return;
    };

    let (mut to_page, mut from_page) = upstream.split();
    let (mut to_front_end, mut from_front_end) = client.split();
    let mut page_hung_up = false;

    loop {
        tokio::select! {
            from_panel = from_front_end.next() => {
                let Some(Ok(message)) = from_panel else { break };
                let relayed = match message {
                    Message::Text(text) => tungstenite::Message::Text(text.as_str().into()),
                    Message::Binary(bytes) => tungstenite::Message::Binary(bytes),
                    Message::Close(_) => break,
                    // Ping/pong are the transport's own business on each side.
                    _ => continue,
                };
                if to_page.send(relayed).await.is_err() {
                    page_hung_up = true;
                    break;
                }
            }
            from_target = from_page.next() => {
                let Some(Ok(message)) = from_target else {
                    page_hung_up = true;
                    break;
                };
                let relayed = match message {
                    tungstenite::Message::Text(text) => Message::Text(text.as_str().into()),
                    tungstenite::Message::Binary(bytes) => Message::Binary(bytes),
                    tungstenite::Message::Close(_) => {
                        page_hung_up = true;
                        break;
                    }
                    _ => continue,
                };
                if to_front_end.send(relayed).await.is_err() {
                    break;
                }
            }
        }
    }

    // Which side hung up first decides what this means. The page going away is
    // what leaves DevTools reporting a closed connection, and is worth
    // recovering from. The panel going away is ordinary — but it is also the
    // last chance to hand the page back the way we found it.
    if page_hung_up {
        recover(&app, &pane).await;
        return;
    }

    for command in RESET {
        if to_page
            .send(tungstenite::Message::Text(command.into()))
            .await
            .is_err()
        {
            return;
        }
    }
    // Let them land before the socket closes under them.
    tokio::time::sleep(Duration::from_millis(250)).await;
    let _ = to_page.close().await;
}

async fn dial<R: Runtime>(app: &AppHandle<R>, pane: &str) -> Option<Upstream> {
    let port = browser::debug_port(app).ok()?;
    let page_url = app.get_webview(pane)?.url().ok()?.to_string();
    let target = browser::resolve_target(pane, &page_url, port).await?;
    let (socket, _) = tokio_tungstenite::connect_async(format!(
        "ws://127.0.0.1:{port}/devtools/page/{target}"
    ))
    .await
    .ok()?;
    Some(socket)
}

/// How often a pane's inspector may be reloaded before we stop trying.
const MAX_ATTEMPTS: u32 = 3;
const ATTEMPT_WINDOW: Duration = Duration::from_secs(30);

fn attempts() -> &'static Mutex<HashMap<String, (u32, Instant)>> {
    static ATTEMPTS: std::sync::OnceLock<Mutex<HashMap<String, (u32, Instant)>>> =
        std::sync::OnceLock::new();
    ATTEMPTS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Reloads a pane's inspector so it reconnects to wherever the page is now.
///
/// The front-end cannot be re-attached in place: it negotiated its session over
/// the socket that just died, and nothing would make it send that again. A
/// reload is cheap and lands back on the Elements panel, which beats a dead one.
async fn recover<R: Runtime>(app: &AppHandle<R>, pane: &str) {
    if !allowed(pane) {
        return;
    }
    // The page may simply be gone, in which case there is nothing to attach to
    // and reloading would only spin.
    let Ok(port) = browser::debug_port(app) else {
        return;
    };
    let Some(page_url) = app.get_webview(pane).and_then(|v| v.url().ok()) else {
        return;
    };
    if browser::resolve_target(pane, &page_url.to_string(), port)
        .await
        .is_none()
    {
        return;
    }

    // Let the page settle before asking the front-end to come back.
    tokio::time::sleep(Duration::from_millis(400)).await;
    if let Some(view) = app.get_webview(&browser::inspector_label(pane)) {
        let _ = view.eval("location.reload()");
    }
}

fn allowed(pane: &str) -> bool {
    let Ok(mut map) = attempts().lock() else {
        return false;
    };
    let now = Instant::now();
    let entry = map.entry(pane.to_string()).or_insert((0, now));
    if now.duration_since(entry.1) > ATTEMPT_WINDOW {
        *entry = (0, now);
    }
    if entry.0 >= MAX_ATTEMPTS {
        return false;
    }
    entry.0 += 1;
    true
}
