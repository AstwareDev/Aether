//! LLM bridge for the inline AI editor (Ctrl+K).
//!
//! All network calls happen here in Rust rather than the webview so that the
//! API key never crosses a browser fetch/CORS boundary and stays on-device.
//! Tokens are streamed back to the frontend over a `tauri::ipc::Channel`.

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

#[derive(Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    /// `"anthropic"` (Claude) or `"openai"` (LM Studio / OpenAI-compatible).
    pub provider: String,
    /// Base URL for OpenAI-compatible providers (e.g. `http://localhost:1234`).
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub model: String,
    pub system: String,
    pub messages: Vec<ChatMessage>,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
}

fn default_max_tokens() -> u32 {
    4096
}

/// Streamed back to the frontend. `done` fires once at the end of a successful
/// stream; `error` carries a human-readable message on failure. `replace`
/// carries the FULL message text so far (not an increment) — used by diffusion
/// models (Mercury), whose chunks are progressively denoised whole messages.
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiEvent {
    Delta { text: String },
    Replace { text: String },
    Done,
    Error { message: String },
}

/// Stream a completion. Deltas arrive on `on_event`; the returned `Result`
/// mirrors success/failure so the JS `invoke` promise resolves or rejects.
#[tauri::command]
pub async fn ai_complete(request: AiRequest, on_event: Channel<AiEvent>) -> Result<(), String> {
    let result = match request.provider.as_str() {
        "anthropic" => stream_anthropic(&request, &on_event).await,
        "openai" => stream_openai(&request, &on_event).await,
        "mercury" => stream_mercury(&request, &on_event).await,
        other => Err(format!("Unknown AI provider: {other}")),
    };

    match &result {
        Ok(()) => {
            let _ = on_event.send(AiEvent::Done);
        }
        Err(message) => {
            let _ = on_event.send(AiEvent::Error {
                message: message.clone(),
            });
        }
    }

    result
}

/// Parse an SSE byte stream line by line, handing each `data:` payload to `f`.
/// `f` returns `Ok(true)` to stop early (e.g. on `[DONE]`).
async fn parse_sse<F>(resp: reqwest::Response, mut f: F) -> Result<(), String>
where
    F: FnMut(&str) -> Result<bool, String>,
{
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("stream error: {e}"))?;
        buf.extend_from_slice(&chunk);

        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line_bytes);
            let line = line.trim_end_matches(['\r', '\n']);
            if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if data.is_empty() {
                    continue;
                }
                if f(data)? {
                    return Ok(());
                }
            }
        }
    }

    Ok(())
}

async fn stream_anthropic(req: &AiRequest, on_event: &Channel<AiEvent>) -> Result<(), String> {
    let api_key = req
        .api_key
        .as_deref()
        .filter(|k| !k.is_empty())
        .ok_or("Missing Anthropic API key. Open AI Settings to add one.")?;

    let body = serde_json::json!({
        "model": req.model,
        "max_tokens": req.max_tokens,
        "system": req.system,
        "messages": req.messages.iter().map(|m| {
            serde_json::json!({ "role": m.role, "content": m.content })
        }).collect::<Vec<_>>(),
        "stream": true,
    });

    let resp = reqwest::Client::new()
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error ({status}): {}", brief(&text)));
    }

    parse_sse(resp, |data| {
        let v: serde_json::Value = match serde_json::from_str(data) {
            Ok(v) => v,
            Err(_) => return Ok(false),
        };
        match v.get("type").and_then(|x| x.as_str()) {
            Some("content_block_delta") => {
                if let Some(text) = v.pointer("/delta/text").and_then(|x| x.as_str()) {
                    let _ = on_event.send(AiEvent::Delta {
                        text: text.to_string(),
                    });
                }
                Ok(false)
            }
            Some("error") => {
                let msg = v
                    .pointer("/error/message")
                    .and_then(|x| x.as_str())
                    .unwrap_or("unknown error");
                Err(format!("Anthropic error: {msg}"))
            }
            _ => Ok(false),
        }
    })
    .await
}

async fn stream_openai(req: &AiRequest, on_event: &Channel<AiEvent>) -> Result<(), String> {
    let base = req
        .base_url
        .as_deref()
        .filter(|b| !b.is_empty())
        .unwrap_or("http://localhost:1234")
        .trim_end_matches('/');
    let url = format!("{base}/v1/chat/completions");

    // OpenAI-compatible servers take the system prompt as the first message.
    let mut messages = vec![serde_json::json!({ "role": "system", "content": req.system })];
    for m in &req.messages {
        messages.push(serde_json::json!({ "role": m.role, "content": m.content }));
    }

    let body = serde_json::json!({
        "model": req.model,
        "messages": messages,
        "max_tokens": req.max_tokens,
        "stream": true,
    });

    let mut builder = reqwest::Client::new()
        .post(&url)
        .header("content-type", "application/json")
        .json(&body);
    if let Some(key) = req.api_key.as_deref().filter(|k| !k.is_empty()) {
        builder = builder.header("authorization", format!("Bearer {key}"));
    }

    let resp = builder
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("LM Studio API error ({status}): {}", brief(&text)));
    }

    parse_sse(resp, |data| {
        if data == "[DONE]" {
            return Ok(true);
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
            if let Some(text) = v
                .pointer("/choices/0/delta/content")
                .and_then(|x| x.as_str())
            {
                let _ = on_event.send(AiEvent::Delta {
                    text: text.to_string(),
                });
            }
        }
        Ok(false)
    })
    .await
}

async fn stream_mercury(req: &AiRequest, on_event: &Channel<AiEvent>) -> Result<(), String> {
    let base = req
        .base_url
        .as_deref()
        .filter(|b| !b.is_empty())
        .unwrap_or("https://web-api-proxy.inceptionlabs.ai")
        .trim_end_matches('/');
    let url = format!("{base}/v1/playground");

    // Mercury takes the system prompt as the first message (OpenAI-compatible).
    let mut messages = vec![serde_json::json!({ "role": "system", "content": req.system })];
    for m in &req.messages {
        messages.push(serde_json::json!({ "role": m.role, "content": m.content }));
    }

    let body = serde_json::json!({
        "model": req.model,
        "messages": messages,
        "max_tokens": req.max_tokens,
        "stream": true,
        "diffusing": true,
        "reasoning_effort": "instant",
    });

    let mut builder = reqwest::Client::new()
        .post(&url)
        .header("content-type", "application/json")
        .json(&body);
    if let Some(key) = req.api_key.as_deref().filter(|k| !k.is_empty()) {
        builder = builder.header("authorization", format!("Bearer {key}"));
    }

    let resp = builder
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Mercury API error ({status}): {}", brief(&text)));
    }

    // Mercury streams diffusion chunks — each `content` is the full
    // progressively-denoised message (garbled → clean), so we emit `Replace`
    // instead of `Delta`.
    parse_sse(resp, |data| {
        if data == "[DONE]" {
            return Ok(true);
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
            if let Some(text) = v
                .pointer("/choices/0/delta/content")
                .and_then(|x| x.as_str())
            {
                let _ = on_event.send(AiEvent::Replace {
                    text: text.to_string(),
                });
            }
        }
        Ok(false)
    })
    .await
}

/// List models from an OpenAI-compatible server (`GET /v1/models`).
#[tauri::command]
pub async fn ai_list_models(base_url: String) -> Result<Vec<String>, String> {
    let base = base_url.trim_end_matches('/');
    let url = format!("{base}/v1/models");

    let resp = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Couldn't reach {base}: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Couldn't list models ({})", resp.status()));
    }

    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;

    let ids = v
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|x| x.as_str()).map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(ids)
}

/// Trim an error body to something short enough for a toast.
fn brief(text: &str) -> String {
    let t = text.trim();
    if t.len() > 300 {
        format!("{}…", &t[..300])
    } else {
        t.to_string()
    }
}
