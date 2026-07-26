# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aether is a desktop code editor built with Tauri 2, React 19, and Monaco Editor. It features an integrated terminal, Git integration, AI-powered code completion, and supports multiple icon themes.

## Architecture

### Monorepo Structure

The project uses a workspace-focused structure with all primary code in `desktop/`:
- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS 4 + Motion (Framer Motion)
- **Backend**: Rust (Tauri 2) with native filesystem, Git, terminal (PTY), and AI streaming
- **No root package.json**: All Node dependencies live in `desktop/package.json`

### Key Subsystems

**Monaco Editor Integration** (`desktop/src/lib/monaco/`)
- Lazy-loaded to defer the large bundle until a file is opened
- `setup.ts`: Registers 50+ language contributions
- `workspaceModels.ts`: Powers cross-file IntelliSense by creating background Monaco models for all workspace files
- `aiEdit.ts`: In-editor AI chat/edit widget with streaming support
- `reactTypes.ts`, `prefetch.ts`: Type definitions and preloading for React projects

**Rust Backend** (`desktop/src-tauri/src/`)
- `lib.rs`: File I/O (read/write text and base64), directory listing with `ignore` crate (respects .gitignore), Git commands (status, diff, log, commit, branch)
- `terminal.rs`: PTY sessions via `portable-pty` with streaming output over Tauri channels
- `ai.rs`: Streaming AI completions over two wire protocols (Anthropic Messages, OpenAI chat-completions) using `reqwest` with SSE. Supports native tool calling and reasoning effort on both.

**Icon System** (`desktop/src/lib/icons/`)
- Generated Material Design icons in `desktop/src/generated/aetherManifest.json`
- `aether.tsx`: Dynamic icon loader using manifest
- `registry.ts`: Icon theme registry (supports switching between themes)
- Dependencies live in `desktop/` only; no icon assets in root

**State Management**
- Settings: Custom React external store (`desktop/src/lib/settings.ts`) with localStorage persistence
- File buffers: Local component state in `Workspace.tsx` with dirty tracking
- Terminal sessions: Managed in Rust `PtyMap` state, event streaming to React

**Layout Modes**
- `vscode`: Traditional sidebar + editor + terminal
- `aether`: Custom layout (default)
- `compact`: Space-optimized view

### Critical Patterns

**Tauri Commands**
All Rust functions exposed to frontend use `#[tauri::command]` and are registered in `lib.rs::run()`. Async file operations use `spawn_blocking` to avoid blocking the Tauri runtime.

**Streaming Architecture**
Terminal output and AI completions use Tauri's `Channel<T>` for server-to-client streaming. The Rust side emits typed events (e.g., `PtyEvent::Output`, `AiEvent::Delta`) that React consumes via `listen()`.

**File Path Handling**
- Rust: Native OS paths with `std::path::Path`
- TypeScript: Always normalized to forward slashes for display (`replace(/\\/g, "/")`)
- Diff views use virtual URIs: `diff:` prefix for git diffs

**Workspace-Wide IntelliSense**
When a workspace is opened, `list_files()` indexes all files (max 50k), then `scheduleWorkspaceModelSync()` creates Monaco models in the background. This enables auto-imports across files without opening them.

## Development Commands

### Setup
```bash
cd desktop
pnpm install
```

### Development
```bash
cd desktop
pnpm dev          # Start Vite dev server only (for frontend-only work)
pnpm tauri dev    # Start Tauri app with hot reload (full app)
```

### Build
```bash
cd desktop
pnpm build        # Build frontend (outputs to desktop/dist)
pnpm tauri build  # Build desktop app (creates installer in src-tauri/target/release)
```

### Type Checking
```bash
cd desktop
pnpm typecheck        # tsc --noEmit
```

### Build Verification
```bash
cd desktop
pnpm build:check      # pnpm tauri build + error parsing (the pass/fail gate)
```

## Working with Specific Features

### Adding Tauri Commands
1. Write Rust function in `desktop/src-tauri/src/lib.rs` (or relevant module) with `#[tauri::command]`
2. Register in `lib.rs::run()` invoke_handler via `tauri::generate_handler![]`
3. Call from TypeScript using `invoke<T>("command_name", { args })`

### Icon Theme Changes
- Icon manifests are generated and live in `desktop/src/generated/`
- User-owned file: `desktop/src-tauri/tauri.conf.json` contains window config and app metadata — **edit carefully**
- Theme switching is user-configurable; avoid hardcoding theme assumptions

### Monaco Language Support
New language support requires adding the contribution in `desktop/src/lib/monaco/setup.ts` (follow existing pattern of importing from `monaco-editor/esm/vs/basic-languages/`).

### AI Providers

**Two wire protocols, many providers.** `ai.rs` speaks only `anthropic` (`<base>/v1/messages`) and `openai` (`<base>/v1/chat/completions`), both streaming over SSE with **native tool calling** — tool calls round-trip as structured `tool_use`/`tool_result` blocks (Anthropic) or `tool_calls` + `role: "tool"` messages (OpenAI), never flattened into prose. Providers are *data*, not code paths: adding one means adding a `ProviderTemplate` in `desktop/src/lib/ai/providers.ts`, never a new branch in Rust. Built-ins are Omniroute, OpenCode Zen, Anthropic, and LM Studio; users can add their own Anthropic- or OpenAI-compatible endpoint with its own model list from the settings panel.

The frontend passes provider config (API key, base URL, model, effort) on each request — no credentials are stored in Rust. Omniroute build-time defaults come from `VITE_OMNIROUTE_BASE_URL` / `VITE_OMNIROUTE_API_KEY` (see `desktop/.env.example`; `.env` is gitignored); everything is overridable at runtime via localStorage.

**Per-task routing.** Each flow is a `TaskId` (`default`, `inline`, `commit`, `review`, `chat`) mapped to a `TaskAssignment { inherit, providerId, model, effort, maxTokens }`. `resolveTask(id)` (`lib/ai/tasks.ts`) resolves one to a concrete provider+model, following `default` when `inherit` is set. It never silently swaps the provider — a misconfigured one surfaces through `taskSetupMessage()` rather than quietly billing a different endpoint. Use `isTaskReady(id)` before starting a flow; there are no pinned model constants.

**Reasoning effort** maps to `thinking.budget_tokens` on the Anthropic wire and `reasoning_effort` on the OpenAI wire. Reasoning output must never reach the `Delta` stream: inline edit mode applies model output to the editor buffer verbatim, so `thinking_delta` and `reasoning_content` are routed to `AiEvent::Reasoning` instead. Anthropic also requires signed `thinking`/`redacted_thinking` blocks be replayed *before* `tool_use` in a follow-up turn — `agent.ts` does this, and `runAgent`'s `onStepStart` callback exists so consumers accumulating tokens reset per step (step narration is not the final answer).

**Module layout.** `lib/ai/` splits into `providers` (templates) → `store` (persisted config + v1 migration) → `tasks` (resolution) → `transport` (payloads + streaming) → `agent`/`review`/`commit`. `index.ts` re-exports all of it, so `import { … } from "../lib/ai"` keeps working; submodules import each other directly to avoid cycles. Agent tools are declared once in `CODING_TOOLS` (`lib/ai/tools.ts`), filtered by user preference via `enabledTools()`, and executed by `exec_tool` in `lib.rs`, which resolves every path against the workspace root and rejects paths that escape it.

Both stores are built on the `createStore` factory in `desktop/src/lib/store.ts` (localStorage-backed, `useSyncExternalStore`-compatible). When adding a field to a persisted shape, extend the `hydrate` function — it must tolerate configs written by older builds rather than resetting missing fields to empty.

## Important Files

### User-Owned (Edit Carefully)
- `desktop/src-tauri/tauri.conf.json`: Window config, bundle settings, app metadata
- `desktop/src/components/Welcome.tsx`: User-facing first-run experience

### Generated (Do Not Edit Manually)
- `desktop/src/generated/aetherManifest.json`: Icon mappings

## Testing Notes

- No unit test suite currently exists
- **Verification is build-based, not dynamic.** Do not launch or exercise the app to verify changes. Run `pnpm build:check` (wraps `pnpm tauri build` and parses its output for errors); a failing build blocks with the offending error lines, a clean build passes.
- `pnpm typecheck` for a fast frontend-only check before the full build
- Test on Windows (primary target) given the `#[cfg(windows)]` specific code paths

## Tech Stack Summary

**Frontend**: React 19, TypeScript 5.8, Vite 7, TailwindCSS 4, Monaco Editor 0.55, Framer Motion 12, xterm.js 6
**Backend**: Tauri 2, Rust 2021, reqwest (HTTP), portable-pty (terminal), ignore (gitignore), serde (JSON)
**Build**: pnpm, Tauri CLI, cargo

## Knowledge Base

Use NotebookLM (via `notebooklm-ai-plugin:notebooklm` skill) for detailed project context instead of reading docs into the context window. The Aether NotebookLM notebook contains architecture details, design decisions, and implementation patterns.

## Notes
- The project previously had a CLI component but it has been removed (commit 00fb3b1)
- Windows is the primary development platform (see `create_command` with `CREATE_NO_WINDOW` flag)
- Monaco and language grammars are the heaviest dependencies; lazy loading is critical for startup performance
- No inline code comments unless absolutely necessary for non-obvious behavior
- Never create `/docs` folders or standalone documentation files — use NotebookLM instead
