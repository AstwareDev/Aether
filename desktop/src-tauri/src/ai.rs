use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::ipc::Channel;

#[derive(Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        text: String,
    },
    /// Extended-thinking block. Anthropic requires the original signed block to be
    /// replayed verbatim when an assistant turn containing tool_use is sent back.
    Thinking {
        thinking: String,
        #[serde(default)]
        signature: String,
    },
    /// Thinking the API encrypted rather than returned as plaintext. It still has to be
    /// replayed, or the follow-up turn is rejected for starting with tool_use.
    RedactedThinking {
        data: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(default)]
        is_error: bool,
    },
}

#[derive(Deserialize, Clone)]
#[serde(untagged)]
pub enum MessageContent {
    Text(String),
    Blocks(Vec<ContentBlock>),
}

#[derive(Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: MessageContent,
}

#[derive(Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    pub provider: String,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub model: String,
    pub system: String,
    pub messages: Vec<ChatMessage>,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default)]
    pub effort: Option<String>,
    #[serde(default)]
    pub tools: Option<Vec<ToolDefinition>>,
}

fn default_max_tokens() -> u32 {
    4096
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AiEvent {
    Delta { text: String },
    Reasoning { text: String },
    ThinkingBlock { thinking: String, signature: String },
    RedactedThinkingBlock { data: String },
    ToolUse { id: String, name: String, input: Value },
    Done,
    Error { message: String },
}

/// Thinking-token budget per effort level for the Anthropic wire protocol.
/// `None` means the caller asked for no extended thinking.
fn thinking_budget(effort: Option<&str>) -> Option<u32> {
    match effort {
        Some("low") => Some(2048),
        Some("medium") => Some(8192),
        Some("high") => Some(16384),
        _ => None,
    }
}

/// OpenAI-compatible gateways take a `reasoning_effort` string; ones that don't
/// support it ignore the unknown field.
fn reasoning_effort(effort: Option<&str>) -> Option<&'static str> {
    match effort {
        Some("low") => Some("low"),
        Some("medium") => Some("medium"),
        Some("high") => Some("high"),
        _ => None,
    }
}

#[tauri::command]
pub async fn ai_complete(request: AiRequest, on_event: Channel<AiEvent>) -> Result<(), String> {
    let result = match request.provider.as_str() {
        "anthropic" => stream_anthropic(&request, &on_event).await,
        "openai" => stream_openai(&request, &on_event).await,
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

/// Accepts both `http://host/v1` and `http://host`, since users paste either.
fn chat_completions_url(base: &str) -> String {
    let trimmed = base.trim_end_matches('/');
    if trimmed.ends_with("/v1") {
        format!("{trimmed}/chat/completions")
    } else {
        format!("{trimmed}/v1/chat/completions")
    }
}

/// Same tolerance as `chat_completions_url`: a custom Anthropic-compatible base pasted
/// as `https://host/v1` must not become `/v1/v1/messages`.
fn messages_url(base: &str) -> String {
    let trimmed = base.trim_end_matches('/');
    if trimmed.ends_with("/v1") {
        format!("{trimmed}/messages")
    } else {
        format!("{trimmed}/v1/messages")
    }
}

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

fn anthropic_content(content: &MessageContent) -> Value {
    match content {
        MessageContent::Text(text) => json!(text),
        MessageContent::Blocks(blocks) => json!(blocks
            .iter()
            .map(|b| match b {
                ContentBlock::Text { text } => json!({ "type": "text", "text": text }),
                ContentBlock::Thinking {
                    thinking,
                    signature,
                } => {
                    let mut block = json!({ "type": "thinking", "thinking": thinking });
                    // Anthropic-compatible gateways may stream thinking without signing
                    // it; sending an empty signature is worse than omitting the field.
                    if !signature.is_empty() {
                        block["signature"] = json!(signature);
                    }
                    block
                }
                ContentBlock::RedactedThinking { data } => json!({
                    "type": "redacted_thinking",
                    "data": data,
                }),
                ContentBlock::ToolUse { id, name, input } => json!({
                    "type": "tool_use",
                    "id": id,
                    "name": name,
                    "input": input,
                }),
                ContentBlock::ToolResult {
                    tool_use_id,
                    content,
                    is_error,
                } => json!({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": content,
                    "is_error": is_error,
                }),
            })
            .collect::<Vec<_>>()),
    }
}

async fn stream_anthropic(req: &AiRequest, on_event: &Channel<AiEvent>) -> Result<(), String> {
    let api_key = req
        .api_key
        .as_deref()
        .filter(|k| !k.is_empty())
        .ok_or("Missing Anthropic API key. Open AI Settings to add one.")?;

    // The API rejects budget_tokens >= max_tokens, so the ceiling is raised to leave
    // room for a visible answer on top of the thinking budget.
    let budget = thinking_budget(req.effort.as_deref());
    let max_tokens = match budget {
        Some(b) if req.max_tokens <= b => b + req.max_tokens.max(1024),
        _ => req.max_tokens,
    };

    let mut body = json!({
        "model": req.model,
        "max_tokens": max_tokens,
        "system": req.system,
        "messages": req.messages.iter().map(|m| json!({
            "role": m.role,
            "content": anthropic_content(&m.content),
        })).collect::<Vec<_>>(),
        "stream": true,
    });

    if let Some(b) = budget {
        body["thinking"] = json!({ "type": "enabled", "budget_tokens": b });
    }

    if let Some(tools) = req.tools.as_ref().filter(|t| !t.is_empty()) {
        body["tools"] = json!(tools
            .iter()
            .map(|t| json!({
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema,
            }))
            .collect::<Vec<_>>());
    }

    let base = req
        .base_url
        .as_deref()
        .map(|b| b.trim_end_matches('/'))
        .filter(|b| !b.is_empty())
        .unwrap_or("https://api.anthropic.com");

    let resp = reqwest::Client::new()
        .post(messages_url(base))
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

    let mut tool_id = String::new();
    let mut tool_name = String::new();
    let mut tool_args = String::new();
    let mut thinking_text = String::new();
    let mut thinking_signature = String::new();
    let mut in_thinking = false;

    parse_sse(resp, |data| {
        let v: Value = match serde_json::from_str(data) {
            Ok(v) => v,
            Err(_) => return Ok(false),
        };
        match v.get("type").and_then(|x| x.as_str()) {
            Some("content_block_start") => {
                match v.pointer("/content_block/type").and_then(|x| x.as_str()) {
                    Some("tool_use") => {
                        tool_id = str_at(&v, "/content_block/id");
                        tool_name = str_at(&v, "/content_block/name");
                        tool_args.clear();
                    }
                    Some("thinking") => {
                        in_thinking = true;
                        thinking_text.clear();
                        thinking_signature.clear();
                    }
                    // Arrives complete in the start event rather than as deltas.
                    Some("redacted_thinking") => {
                        let data = str_at(&v, "/content_block/data");
                        if !data.is_empty() {
                            let _ = on_event.send(AiEvent::RedactedThinkingBlock { data });
                        }
                    }
                    _ => {}
                }
                Ok(false)
            }
            Some("content_block_delta") => {
                match v.pointer("/delta/type").and_then(|x| x.as_str()) {
                    Some("text_delta") => {
                        if let Some(text) = v.pointer("/delta/text").and_then(|x| x.as_str()) {
                            let _ = on_event.send(AiEvent::Delta {
                                text: text.to_string(),
                            });
                        }
                    }
                    // Thinking never joins the text stream: inline edit mode applies the
                    // response to the buffer verbatim.
                    Some("thinking_delta") => {
                        if let Some(text) = v.pointer("/delta/thinking").and_then(|x| x.as_str()) {
                            thinking_text.push_str(text);
                            let _ = on_event.send(AiEvent::Reasoning {
                                text: text.to_string(),
                            });
                        }
                    }
                    Some("signature_delta") => {
                        if let Some(sig) = v.pointer("/delta/signature").and_then(|x| x.as_str()) {
                            thinking_signature.push_str(sig);
                        }
                    }
                    Some("input_json_delta") => {
                        if let Some(part) = v.pointer("/delta/partial_json").and_then(|x| x.as_str())
                        {
                            tool_args.push_str(part);
                        }
                    }
                    _ => {}
                }
                Ok(false)
            }
            Some("content_block_stop") => {
                if !tool_id.is_empty() {
                    let _ = on_event.send(AiEvent::ToolUse {
                        id: std::mem::take(&mut tool_id),
                        name: std::mem::take(&mut tool_name),
                        input: parse_tool_args(&tool_args),
                    });
                    tool_args.clear();
                }
                if in_thinking {
                    in_thinking = false;
                    // Emitted even when unsigned: dropping it guarantees the next turn
                    // is rejected for starting with tool_use.
                    if !thinking_text.is_empty() {
                        let _ = on_event.send(AiEvent::ThinkingBlock {
                            thinking: std::mem::take(&mut thinking_text),
                            signature: std::mem::take(&mut thinking_signature),
                        });
                    }
                    thinking_text.clear();
                    thinking_signature.clear();
                }
                Ok(false)
            }
            Some("error") => Err(format!(
                "Anthropic error: {}",
                v.pointer("/error/message")
                    .and_then(|x| x.as_str())
                    .unwrap_or("unknown error")
            )),
            _ => Ok(false),
        }
    })
    .await
}

fn str_at(v: &Value, pointer: &str) -> String {
    v.pointer(pointer)
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string()
}

/// Tool calls with no arguments stream as `""`, which is not valid JSON.
fn parse_tool_args(raw: &str) -> Value {
    if raw.trim().is_empty() {
        return json!({});
    }
    serde_json::from_str(raw).unwrap_or_else(|_| json!({}))
}

/// OpenAI represents a tool result as its own `role: "tool"` message rather than
/// a block inside the following user turn, so one Anthropic-shaped message can
/// expand into several here.
fn push_openai_messages(out: &mut Vec<Value>, role: &str, content: &MessageContent) {
    let blocks = match content {
        MessageContent::Text(text) => {
            out.push(json!({ "role": role, "content": text }));
            return;
        }
        MessageContent::Blocks(blocks) => blocks,
    };

    let mut text = String::new();
    let mut tool_calls: Vec<Value> = Vec::new();
    let mut tool_results: Vec<Value> = Vec::new();

    for block in blocks {
        match block {
            ContentBlock::Text { text: t } => {
                if !text.is_empty() {
                    text.push('\n');
                }
                text.push_str(t);
            }
            // Anthropic-signed thinking has no OpenAI equivalent; replaying it would be
            // rejected as an unknown content type.
            ContentBlock::Thinking { .. } | ContentBlock::RedactedThinking { .. } => {}
            ContentBlock::ToolUse { id, name, input } => tool_calls.push(json!({
                "id": id,
                "type": "function",
                "function": { "name": name, "arguments": input.to_string() },
            })),
            ContentBlock::ToolResult {
                tool_use_id,
                content,
                ..
            } => tool_results.push(json!({
                "role": "tool",
                "tool_call_id": tool_use_id,
                "content": content,
            })),
        }
    }

    if !tool_calls.is_empty() {
        out.push(json!({
            "role": "assistant",
            "content": if text.is_empty() { Value::Null } else { json!(text) },
            "tool_calls": tool_calls,
        }));
    } else if !text.is_empty() || tool_results.is_empty() {
        out.push(json!({ "role": role, "content": text }));
    }

    out.extend(tool_results);
}

async fn stream_openai(req: &AiRequest, on_event: &Channel<AiEvent>) -> Result<(), String> {
    let base = req
        .base_url
        .as_deref()
        .filter(|b| !b.is_empty())
        .unwrap_or("http://localhost:1234");

    let mut messages = vec![json!({ "role": "system", "content": req.system })];
    for m in &req.messages {
        push_openai_messages(&mut messages, &m.role, &m.content);
    }

    let mut body = json!({
        "model": req.model,
        "messages": messages,
        "max_tokens": req.max_tokens,
        "stream": true,
    });

    if let Some(effort) = reasoning_effort(req.effort.as_deref()) {
        body["reasoning_effort"] = json!(effort);
    }

    if let Some(tools) = req.tools.as_ref().filter(|t| !t.is_empty()) {
        body["tools"] = json!(tools
            .iter()
            .map(|t| json!({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.input_schema,
                },
            }))
            .collect::<Vec<_>>());
        body["tool_choice"] = json!("auto");
    }

    let mut builder = reqwest::Client::new()
        .post(chat_completions_url(base))
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
        return Err(format!("API error ({status}): {}", brief(&text)));
    }

    // Arguments arrive as fragments keyed by call index, so calls are buffered
    // until the stream ends and only then emitted as whole tool_use events.
    let mut calls: std::collections::BTreeMap<u64, (String, String, String)> =
        std::collections::BTreeMap::new();
    let flush = |calls: &mut std::collections::BTreeMap<u64, (String, String, String)>| {
        for (_, (id, name, args)) in std::mem::take(calls) {
            if !name.is_empty() {
                let _ = on_event.send(AiEvent::ToolUse {
                    id,
                    name,
                    input: parse_tool_args(&args),
                });
            }
        }
    };

    parse_sse(resp, |data| {
        if data == "[DONE]" {
            flush(&mut calls);
            return Ok(true);
        }
        let v: Value = match serde_json::from_str(data) {
            Ok(v) => v,
            Err(_) => return Ok(false),
        };

        if let Some(message) = v.pointer("/error/message").and_then(|x| x.as_str()) {
            return Err(format!("API error: {message}"));
        }

        if let Some(text) = v
            .pointer("/choices/0/delta/content")
            .and_then(|x| x.as_str())
        {
            if !text.is_empty() {
                let _ = on_event.send(AiEvent::Delta {
                    text: text.to_string(),
                });
            }
        }

        // GLM/DeepSeek-style gateways stream chain-of-thought in a sibling field;
        // it must not be concatenated into the answer.
        for key in ["reasoning_content", "reasoning"] {
            if let Some(text) = v
                .pointer(&format!("/choices/0/delta/{key}"))
                .and_then(|x| x.as_str())
            {
                if !text.is_empty() {
                    let _ = on_event.send(AiEvent::Reasoning {
                        text: text.to_string(),
                    });
                }
            }
        }

        if let Some(deltas) = v
            .pointer("/choices/0/delta/tool_calls")
            .and_then(|x| x.as_array())
        {
            for tc in deltas {
                let idx = tc.get("index").and_then(|x| x.as_u64()).unwrap_or(0);
                let entry = calls.entry(idx).or_default();
                if let Some(id) = tc.get("id").and_then(|x| x.as_str()) {
                    if !id.is_empty() {
                        entry.0 = id.to_string();
                    }
                }
                if let Some(name) = tc.pointer("/function/name").and_then(|x| x.as_str()) {
                    if !name.is_empty() {
                        entry.1 = name.to_string();
                    }
                }
                if let Some(args) = tc.pointer("/function/arguments").and_then(|x| x.as_str()) {
                    entry.2.push_str(args);
                }
            }
        }

        Ok(false)
    })
    .await?;

    flush(&mut calls);
    Ok(())
}

pub fn models_url(base: &str) -> String {
    let trimmed = base.trim_end_matches('/');
    if trimmed.ends_with("/v1") {
        format!("{trimmed}/models")
    } else {
        format!("{trimmed}/v1/models")
    }
}

#[tauri::command]
pub async fn ai_list_models(
    base_url: String,
    wire: Option<String>,
    api_key: Option<String>,
) -> Result<Vec<String>, String> {
    let base = base_url.trim_end_matches('/');
    if base.is_empty() {
        return Err("Set a base URL first.".into());
    }
    let url = models_url(base);

    let mut builder = reqwest::Client::new().get(&url);
    if let Some(key) = api_key.as_deref().filter(|k| !k.is_empty()) {
        builder = if wire.as_deref() == Some("anthropic") {
            builder
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01")
        } else {
            builder.header("authorization", format!("Bearer {key}"))
        };
    }

    let resp = builder
        .send()
        .await
        .map_err(|e| format!("Couldn't reach {base}: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Couldn't list models ({status}): {}", brief(&text)));
    }

    let v: Value = resp.json().await.map_err(|e| format!("bad response: {e}"))?;

    // OpenAI-compatible endpoints return `{ data: [...] }`; some gateways return a
    // bare array of model objects.
    let entries = v
        .get("data")
        .and_then(|d| d.as_array())
        .or_else(|| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut models: Vec<String> = entries
        .iter()
        .filter_map(|m| {
            m.get("id")
                .or_else(|| m.get("name"))
                .and_then(|x| x.as_str())
                .map(String::from)
        })
        .collect();
    models.sort();
    models.dedup();
    Ok(models)
}

fn brief(text: &str) -> String {
    let t = text.trim();
    match t.char_indices().nth(300) {
        Some((idx, _)) => format!("{}…", &t[..idx]),
        None => t.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn openai_messages(messages: &[ChatMessage]) -> Vec<Value> {
        let mut out = Vec::new();
        for m in messages {
            push_openai_messages(&mut out, &m.role, &m.content);
        }
        out
    }

    #[test]
    fn base_url_with_v1_is_not_doubled() {
        assert_eq!(
            chat_completions_url("http://localhost:20218/v1"),
            "http://localhost:20218/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url("http://localhost:1234"),
            "http://localhost:1234/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url("http://localhost:20218/v1/"),
            "http://localhost:20218/v1/chat/completions"
        );
    }

    #[test]
    fn tool_use_becomes_native_openai_tool_calls() {
        let messages = openai_messages(&[ChatMessage {
            role: "assistant".into(),
            content: MessageContent::Blocks(vec![ContentBlock::ToolUse {
                id: "call_1".into(),
                name: "read_file".into(),
                input: json!({ "path": "src/App.tsx" }),
            }]),
        }]);

        assert_eq!(messages.len(), 1);
        let call = &messages[0]["tool_calls"][0];
        assert_eq!(messages[0]["role"], "assistant");
        assert_eq!(call["type"], "function");
        assert_eq!(call["id"], "call_1");
        assert_eq!(call["function"]["name"], "read_file");
        // Arguments must be a JSON *string*, not an object.
        assert_eq!(call["function"]["arguments"], "{\"path\":\"src/App.tsx\"}");
    }

    #[test]
    fn tool_result_becomes_its_own_tool_role_message() {
        let messages = openai_messages(&[ChatMessage {
            role: "user".into(),
            content: MessageContent::Blocks(vec![ContentBlock::ToolResult {
                tool_use_id: "call_1".into(),
                content: "1: import React".into(),
                is_error: false,
            }]),
        }]);

        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["role"], "tool");
        assert_eq!(messages[0]["tool_call_id"], "call_1");
        assert_eq!(messages[0]["content"], "1: import React");
    }

    #[test]
    fn anthropic_keeps_structured_blocks() {
        let content = anthropic_content(&MessageContent::Blocks(vec![
            ContentBlock::Text { text: "checking".into() },
            ContentBlock::ToolUse {
                id: "tu_1".into(),
                name: "search_code".into(),
                input: json!({ "query": "foo" }),
            },
        ]));

        assert_eq!(content[0]["type"], "text");
        assert_eq!(content[1]["type"], "tool_use");
        assert_eq!(content[1]["id"], "tu_1");
        assert_eq!(content[1]["input"]["query"], "foo");
    }

    #[test]
    fn empty_tool_arguments_parse_to_empty_object() {
        assert_eq!(parse_tool_args(""), json!({}));
        assert_eq!(parse_tool_args("   "), json!({}));
        assert_eq!(parse_tool_args("{\"a\":1}"), json!({ "a": 1 }));
        assert_eq!(parse_tool_args("not json"), json!({}));
    }

    #[test]
    fn brief_does_not_split_multibyte_chars() {
        let text = "é".repeat(400);
        assert!(brief(&text).ends_with('…'));
    }

    #[test]
    fn effort_maps_to_each_wire_protocol() {
        assert_eq!(thinking_budget(None), None);
        assert_eq!(thinking_budget(Some("off")), None);
        assert_eq!(thinking_budget(Some("low")), Some(2048));
        assert_eq!(thinking_budget(Some("high")), Some(16384));

        assert_eq!(reasoning_effort(Some("off")), None);
        assert_eq!(reasoning_effort(None), None);
        assert_eq!(reasoning_effort(Some("medium")), Some("medium"));
    }

    #[test]
    fn thinking_budget_never_exceeds_max_tokens() {
        // Anthropic rejects budget_tokens >= max_tokens, so a small ceiling must grow.
        let budget = thinking_budget(Some("high")).unwrap();
        let requested = 1024u32;
        let effective = if requested <= budget {
            budget + requested.max(1024)
        } else {
            requested
        };
        assert!(effective > budget);

        // A ceiling that already clears the budget is left alone.
        let generous = 32_000u32;
        let untouched = if generous <= budget {
            budget + generous.max(1024)
        } else {
            generous
        };
        assert_eq!(untouched, generous);
    }

    #[test]
    fn thinking_blocks_round_trip_for_anthropic() {
        let content = anthropic_content(&MessageContent::Blocks(vec![
            ContentBlock::Thinking {
                thinking: "let me check".into(),
                signature: "sig123".into(),
            },
            ContentBlock::ToolUse {
                id: "tu_1".into(),
                name: "read_file".into(),
                input: json!({ "path": "a.ts" }),
            },
        ]));

        assert_eq!(content[0]["type"], "thinking");
        assert_eq!(content[0]["thinking"], "let me check");
        assert_eq!(content[0]["signature"], "sig123");
        assert_eq!(content[1]["type"], "tool_use");
    }

    #[test]
    fn thinking_blocks_are_dropped_on_the_openai_wire() {
        let messages = openai_messages(&[ChatMessage {
            role: "assistant".into(),
            content: MessageContent::Blocks(vec![
                ContentBlock::Thinking {
                    thinking: "hidden".into(),
                    signature: "sig".into(),
                },
                ContentBlock::Text {
                    text: "visible".into(),
                },
            ]),
        }]);

        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["content"], "visible");
        assert!(!messages[0].to_string().contains("hidden"));
    }

    #[test]
    fn anthropic_base_with_v1_is_not_doubled() {
        assert_eq!(
            messages_url("https://gateway.example.com/v1"),
            "https://gateway.example.com/v1/messages"
        );
        assert_eq!(
            messages_url("https://api.anthropic.com"),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            messages_url("https://api.anthropic.com/v1/"),
            "https://api.anthropic.com/v1/messages"
        );
    }

    #[test]
    fn unsigned_thinking_omits_the_signature_field() {
        let content = anthropic_content(&MessageContent::Blocks(vec![ContentBlock::Thinking {
            thinking: "reasoning".into(),
            signature: String::new(),
        }]));

        assert_eq!(content[0]["type"], "thinking");
        assert_eq!(content[0]["thinking"], "reasoning");
        assert!(content[0].get("signature").is_none());
    }

    #[test]
    fn redacted_thinking_round_trips_and_is_dropped_for_openai() {
        let content = anthropic_content(&MessageContent::Blocks(vec![
            ContentBlock::RedactedThinking {
                data: "encrypted".into(),
            },
            ContentBlock::ToolUse {
                id: "tu_1".into(),
                name: "read_file".into(),
                input: json!({}),
            },
        ]));
        assert_eq!(content[0]["type"], "redacted_thinking");
        assert_eq!(content[0]["data"], "encrypted");
        assert_eq!(content[1]["type"], "tool_use");

        let messages = openai_messages(&[ChatMessage {
            role: "assistant".into(),
            content: MessageContent::Blocks(vec![
                ContentBlock::RedactedThinking {
                    data: "encrypted".into(),
                },
                ContentBlock::Text {
                    text: "visible".into(),
                },
            ]),
        }]);
        assert_eq!(messages[0]["content"], "visible");
        assert!(!messages[0].to_string().contains("encrypted"));
    }

    #[test]
    fn models_url_matches_chat_completions_base_handling() {
        assert_eq!(
            models_url("https://opencode.ai/zen/v1"),
            "https://opencode.ai/zen/v1/models"
        );
        assert_eq!(
            models_url("http://localhost:1234"),
            "http://localhost:1234/v1/models"
        );
        assert_eq!(
            models_url("http://localhost:20218/v1/"),
            "http://localhost:20218/v1/models"
        );
    }
}
