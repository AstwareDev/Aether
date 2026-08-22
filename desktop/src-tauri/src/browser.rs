//! The in-app browser pane.
//!
//! An iframe can only show pages that opt in with permissive frame headers,
//! which rules out most of the web. Instead each browser tab gets a real child
//! webview parented to the main window and positioned over a placeholder
//! element in the React tree, so YouTube, a dev server on `localhost:3000` and
//! anything else behave exactly as they would in a browser.
//!
//! Remote content cannot reach Tauri's IPC (the ACL rejects any non-local
//! origin), so the injected probe reports back over a custom URI scheme
//! instead. Whatever it sends is forwarded to the main webview as an event and
//! is treated as untrusted data there.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Runtime, Url, Webview, WebviewBuilder,
    WebviewUrl,
};

/// Browser arguments every webview in the app has to agree on.
///
/// WebView2 shares one browser process per user-data folder, and only between
/// webviews created with identical arguments — set them on some webviews and
/// not others and the odd ones out land in a browser process of their own,
/// where the debugging endpoint (and so the inspector) does not reach them.
///
/// The `--disable-features` half is wry's own default, which naming any
/// argument at all would otherwise drop.
pub const BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=0";

/// Applies the shared arguments. A no-op off Windows, where they mean nothing.
fn with_browser_args<R: Runtime>(builder: WebviewBuilder<R>) -> WebviewBuilder<R> {
    #[cfg(windows)]
    return builder.additional_browser_args(BROWSER_ARGS);
    #[cfg(not(windows))]
    builder
}

/// Label of the window browser views are parented to.
const HOST_WINDOW: &str = "main";

/// Only webviews with this label prefix are ours; signals from anything else
/// (the app's own webview, say) are dropped.
const VIEW_PREFIX: &str = "aether-browser-";

/// Custom URI scheme the injected probe posts to. Must stay lowercase and
/// alphanumeric to be a valid scheme on every platform.
pub const SIGNAL_SCHEME: &str = "aetherdt";

/// Event the main webview listens on for probe traffic.
const SIGNAL_EVENT: &str = "browser://signal";

const PROBE: &str = include_str!("browser_probe.js");

#[derive(Clone, Serialize)]
struct Signal {
    label: String,
    events: Value,
}

/// Origin the probe posts to. Windows maps custom schemes onto
/// `https://<scheme>.localhost` when the webview uses the https scheme;
/// elsewhere the scheme is used directly.
fn signal_base() -> String {
    if cfg!(windows) {
        format!("https://{SIGNAL_SCHEME}.localhost/")
    } else {
        format!("{SIGNAL_SCHEME}://localhost/")
    }
}

/// The probe, with its endpoint filled in.
///
/// WebView2 registers document-start scripts as NUL-terminated strings, so a
/// stray control character truncates the source mid-statement and the whole
/// script silently fails to parse. Strip them rather than trust the file.
fn probe_script() -> String {
    PROBE
        .replace("__AETHER_SIGNAL_BASE__", &signal_base())
        .chars()
        .filter(|c| !c.is_control() || matches!(c, '\n' | '\r' | '\t'))
        .collect()
}

fn emit<R: Runtime>(app: &AppHandle<R>, label: &str, events: Value) {
    let _ = app.emit_to(
        HOST_WINDOW,
        SIGNAL_EVENT,
        Signal {
            label: label.to_string(),
            events,
        },
    );
}

/// Forwards a probe payload to the main webview. Called from the URI scheme
/// handler, so the body is arbitrary bytes from a remote page.
pub fn handle_signal<R: Runtime>(app: &AppHandle<R>, webview_label: &str, body: &[u8]) {
    if !webview_label.starts_with(VIEW_PREFIX) {
        return;
    }
    const MAX_BODY: usize = 512 * 1024;
    if body.is_empty() || body.len() > MAX_BODY {
        return;
    }
    let Ok(events) = serde_json::from_slice::<Value>(body) else {
        return;
    };
    if !events.is_array() {
        return;
    }
    emit(app, webview_label, events);
}

fn view<R: Runtime>(app: &AppHandle<R>, label: &str) -> Result<Webview<R>, String> {
    if !label.starts_with(VIEW_PREFIX) {
        return Err(format!("not a browser view: {label}"));
    }
    app.get_webview(label)
        .ok_or_else(|| format!("browser view {label} is not open"))
}

fn parse(url: &str) -> Result<Url, String> {
    url.parse::<Url>()
        .map_err(|e| format!("invalid url {url}: {e}"))
}

/// Creates the child webview if it does not exist yet, otherwise just moves it
/// into place. Bounds are logical (CSS) pixels relative to the window client
/// area, which is what `getBoundingClientRect` gives us on the other side.
#[tauri::command]
pub async fn browser_attach<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if !label.starts_with(VIEW_PREFIX) {
        return Err(format!("not a browser view: {label}"));
    }
    let size = LogicalSize::new(width.max(1.0), height.max(1.0));
    let position = LogicalPosition::new(x, y);

    if let Some(existing) = app.get_webview(&label) {
        let _ = existing.set_position(position);
        let _ = existing.set_size(size);
        let _ = existing.show();
        return Ok(());
    }

    record_baseline(&app).await;

    let target = parse(&url)?;
    let window = app
        .get_window(HOST_WINDOW)
        .ok_or_else(|| "main window is not available".to_string())?;

    let nav_app = app.clone();
    let nav_label = label.clone();

    let builder = with_browser_args(WebviewBuilder::new(label.clone(), WebviewUrl::External(target)))
        .initialization_script(probe_script())
        // Windows needs the https scheme so the probe's POST from an https page
        // is not blocked as mixed content.
        .use_https_scheme(cfg!(windows))
        .zoom_hotkeys_enabled(true)
        .on_navigation(move |url| {
            // Fires even when the probe cannot reach us, so the address bar
            // stays accurate on pages that block the custom scheme.
            emit(
                &nav_app,
                &nav_label,
                json!([{ "t": "nav", "url": url.to_string() }]),
            );
            true
        });

    window
        .add_child(builder, position, size)
        .map_err(|e| format!("failed to open browser view: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn browser_set_bounds<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let view = view(&app, &label)?;
    view.set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    view.set_size(LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_set_visible<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    visible: bool,
) -> Result<(), String> {
    // A hidden pane is a normal state, not an error — the view may already be
    // gone because its tab was closed.
    let Ok(view) = view(&app, &label) else {
        return Ok(());
    };
    if visible {
        view.show().map_err(|e| e.to_string())
    } else {
        view.hide().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn browser_navigate<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    url: String,
) -> Result<(), String> {
    view(&app, &label)?
        .navigate(parse(&url)?)
        .map_err(|e| e.to_string())
}

/// `delta` follows `history.go`: -1 back, 1 forward, 0 reload.
#[tauri::command]
pub async fn browser_history<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    delta: i32,
) -> Result<(), String> {
    let view = view(&app, &label)?;
    let script = if delta == 0 {
        "location.reload()".to_string()
    } else {
        format!("history.go({delta})")
    };
    view.eval(script).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_eval<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    script: String,
) -> Result<(), String> {
    view(&app, &label)?.eval(script).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_close<R: Runtime>(app: AppHandle<R>, label: String) -> Result<(), String> {
    // The inspector is a separate webview, so it has to be torn down
    // explicitly or it would outlive the tab it belongs to.
    let _ = browser_inspector_close(app.clone(), label.clone()).await;
    let Ok(view) = view(&app, &label) else {
        return Ok(());
    };
    view.close().map_err(|e| e.to_string())
}

/// Label prefix for inspector webviews.
///
/// It keeps the pane prefix so inspectors go through the same guard, and the
/// same bounds/visibility/close commands, as the pages they inspect.
const INSPECTOR_PREFIX: &str = "aether-browser-dt-";

pub fn inspector_label(pane: &str) -> String {
    format!("{INSPECTOR_PREFIX}{}", &pane[VIEW_PREFIX.len()..])
}

/// A page Chromium is willing to let us debug.
#[derive(serde::Deserialize)]
struct CdpTarget {
    id: String,
    url: String,
    #[serde(rename = "type")]
    kind: String,
}

/// Targets that already existed before the first browser pane opened - the
/// app's own webview, mainly. Never candidates for an inspector.
static BASELINE: OnceLock<Vec<String>> = OnceLock::new();

/// Which target each pane's inspector is attached to, so two panes on the same
/// URL do not both claim the same page.
fn claims() -> &'static Mutex<HashMap<String, String>> {
    static CLAIMS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CLAIMS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The port Chromium's debugging endpoint is on right now.
///
/// `--remote-debugging-port=0` lets it pick a free one and write it next to the
/// browser profile, which beats hard-coding a port that could already be taken
/// or shared with another copy of the app.
///
/// Deliberately re-read every time rather than cached: the browser process is
/// shared between every webview in the app and outlives none of them in
/// particular, so if it is ever restarted the port changes underneath us.
pub fn debug_port<R: Runtime>(app: &AppHandle<R>) -> Result<u16, String> {
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("EBWebView")
        .join("DevToolsActivePort");
    let text = std::fs::read_to_string(&path)
        .map_err(|_| "the webview is not exposing an inspector endpoint".to_string())?;
    text.lines()
        .next()
        .unwrap_or_default()
        .trim()
        .parse::<u16>()
        .map_err(|_| "could not read the inspector port".to_string())
}

async fn cdp_targets(port: u16) -> Result<Vec<CdpTarget>, String> {
    reqwest::get(format!("http://127.0.0.1:{port}/json/list"))
        .await
        .map_err(|e| e.to_string())?
        .json::<Vec<CdpTarget>>()
        .await
        .map_err(|e| e.to_string())
}

/// Trailing slashes differ between what the webview reports and what Chromium
/// does, and mean nothing here.
fn same_page(a: &str, b: &str) -> bool {
    a.trim_end_matches('/') == b.trim_end_matches('/')
}

/// Remembers what was already being debugged, so later panes can be told apart
/// from the app itself. Called before the first pane webview exists.
pub async fn record_baseline<R: Runtime>(app: &AppHandle<R>) {
    if BASELINE.get().is_some() {
        return;
    }
    let ids = match debug_port(app) {
        Ok(port) => cdp_targets(port)
            .await
            .map(|targets| targets.into_iter().map(|t| t.id).collect())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    };
    let _ = BASELINE.set(ids);
}

/// The page this pane should be inspecting.
///
/// Prefers the target it is already attached to, so a page that navigates or
/// reloads keeps the same inspector. Falls back to matching on URL among the
/// pages no other pane has claimed.
pub async fn resolve_target(pane: &str, page_url: &str, port: u16) -> Option<String> {
    let targets = cdp_targets(port).await.ok()?;

    let claimed = claims().lock().ok()?.get(pane).cloned();
    if let Some(id) = claimed {
        // Still there and still the same page: nothing to re-point.
        if targets
            .iter()
            .any(|t| t.id == id && same_page(&t.url, page_url))
        {
            return Some(id);
        }
    }

    let taken: Vec<String> = claims()
        .lock()
        .map(|c| {
            c.iter()
                .filter(|(other, _)| *other != pane)
                .map(|(_, id)| id.clone())
                .collect()
        })
        .unwrap_or_default();
    let baseline = BASELINE.get().cloned().unwrap_or_default();

    let usable: Vec<&CdpTarget> = targets
        .iter()
        .filter(|t| t.kind == "page")
        .filter(|t| !baseline.contains(&t.id) && !taken.contains(&t.id))
        // An inspector is a page too, and not one to inspect.
        .filter(|t| !t.url.contains("/devtools/inspector.html"))
        .collect();

    // The URL identifies the page; with several panes on the same address the
    // unclaimed one is the right one. A lone candidate is taken on trust.
    let target = usable
        .iter()
        .find(|t| same_page(&t.url, page_url))
        .or(if usable.len() == 1 { usable.first() } else { None })?;

    if let Ok(mut map) = claims().lock() {
        map.insert(pane.to_string(), target.id.clone());
    }
    Some(target.id.clone())
}

/// Opens the inspector for a pane as a webview of our own.
///
/// WebView2 has no API for embedding its inspector - `OpenDevToolsWindow` puts
/// it in a window of its own and that is the whole of the offer. But Chromium
/// serves the very same DevTools front-end over its debugging endpoint, so a
/// child webview pointed at it gives us the real inspector as an ordinary part
/// of the window: same bounds handling as the page, no foreign top-level
/// window, nothing of it in the taskbar.
///
/// What it is pointed at is Aether's own host rather than Chromium directly -
/// see [`crate::devtools_host`] for why that matters. The address it hands over
/// stays valid for the life of the pane, so nothing here has to keep the
/// inspector in step with a page that navigates or a browser process that
/// restarts.
///
/// Returns false when no debuggable page was found for this pane.
#[tauri::command]
pub async fn browser_inspector_open<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<bool, String> {
    let pane = view(&app, &label)?;
    let port = debug_port(&app)?;
    let page_url = pane.url().map_err(|e| e.to_string())?.to_string();

    // Only to answer "is there anything to inspect" - the host resolves it
    // again, for real, when the front-end connects.
    if resolve_target(&label, &page_url, port).await.is_none() {
        return Ok(false);
    }

    let view_label = inspector_label(&label);
    if let Some(existing) = app.get_webview(&view_label) {
        let _ = existing.set_position(LogicalPosition::new(x, y));
        let _ = existing.set_size(LogicalSize::new(width.max(1.0), height.max(1.0)));
        let _ = existing.show();
        return Ok(true);
    }

    let front_end = crate::devtools_host::front_end_url(
        crate::devtools_host::ensure_started(&app)?,
        &label,
    );
    let window = app
        .get_window(HOST_WINDOW)
        .ok_or_else(|| "main window is not available".to_string())?;
    // No probe here: this webview is ours, not a page being browsed.
    let builder = with_browser_args(WebviewBuilder::new(
        view_label,
        WebviewUrl::External(parse(&front_end)?),
    ))
    .zoom_hotkeys_enabled(true);
    window
        .add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width.max(1.0), height.max(1.0)),
        )
        .map_err(|e| format!("failed to open the inspector: {e}"))?;
    Ok(true)
}

/// Closes a pane's inspector. Safe to call for a pane that never opened one.
#[tauri::command]
pub async fn browser_inspector_close<R: Runtime>(
    app: AppHandle<R>,
    label: String,
) -> Result<(), String> {
    if let Ok(mut map) = claims().lock() {
        map.remove(&label);
    }
    if let Some(view) = app.get_webview(&inspector_label(&label)) {
        view.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Copies text through the OS clipboard.
///
/// The pane cannot use `navigator.clipboard` for this: clicking inside the
/// browser's child webview moves focus off the app's own webview, and the
/// clipboard API rejects writes from an unfocused document.
#[tauri::command]
pub async fn browser_copy_text(text: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        clipboard_win::set_clipboard_string(&text).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = text;
        Err("unsupported".to_string())
    }
}

/// Why a page did not load.
///
/// WebView2 answers a failed navigation with its own Edge error page, which has
/// no place in an editor. Asking Rust whether the URL is reachable lets the pane
/// draw its own state instead — and gives a far better message than "can't
/// reach this page", since the usual cause is a dev server that is not running.
#[derive(Serialize)]
pub struct UrlCheck {
    reachable: bool,
    status: u16,
    error: String,
}

#[tauri::command]
pub async fn browser_check_url(url: String) -> Result<UrlCheck, String> {
    let target = parse(&url)?;
    if !matches!(target.scheme(), "http" | "https") {
        // Nothing to probe for file:// and friends; let the webview try.
        return Ok(UrlCheck {
            reachable: true,
            status: 0,
            error: String::new(),
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(target).send().await {
        Ok(response) => Ok(UrlCheck {
            reachable: true,
            status: response.status().as_u16(),
            error: String::new(),
        }),
        Err(e) => Ok(UrlCheck {
            reachable: false,
            status: 0,
            error: describe_request_error(&e),
        }),
    }
}

fn describe_request_error(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        return "The server took too long to respond.".to_string();
    }

    // The useful detail is in the innermost source; `is_connect` covers both a
    // refused connection and a name that does not resolve, which need very
    // different advice.
    let mut source: &dyn std::error::Error = e;
    while let Some(inner) = source.source() {
        source = inner;
    }
    let detail = source.to_string();
    let lowered = detail.to_lowercase();

    // Windows reports an unknown host as "No such host is known. (os error 11001)".
    let unresolved = ["dns", "lookup", "resolve", "no such host", "name not known", "11001"];
    if unresolved.iter().any(|needle| lowered.contains(needle)) {
        return "That address doesn't resolve. Check the host name, or your network connection."
            .to_string();
    }
    if e.is_connect() {
        return "Nothing is listening at this address. If it's a dev server, it may not be running yet."
            .to_string();
    }
    detail
}

#[tauri::command]
pub async fn browser_clear_data<R: Runtime>(app: AppHandle<R>, label: String) -> Result<(), String> {
    view(&app, &label)?
        .clear_all_browsing_data()
        .map_err(|e| e.to_string())
}
