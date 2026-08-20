# Aether

<img src="/aether-refs/preview.png">

> A lightweight code editor built from scratch — the parts of VS Code / Cursor an average developer actually uses, without the bloat.

## What is Aether?

Aether is a desktop code editor built with **Tauri 2**, **React 19**, and **Monaco**. It ships at a fraction of the size of Electron-based editors because it uses the OS's native webview instead of bundling a full Chromium + Node runtime with every install.

The goal isn't to match every feature of a full IDE. It's to scope down to what developers reach for daily and make that fast.

**Where it's at:** still in the stage of rebuilding VS Code's core workbench. The shell — explorer, tabs, editor, terminal, source control, search, AI — is in place and usable. What's missing is the layer underneath: real cross-language code intelligence, a persistent index, and a proper extension story. That's the current focus, and the [What Needs Work](#what-needs-work) section below is honest about it.

---

## Features (working today)

### Explorer
Rewritten to match VS Code's tree, and in places to go past it.

- **Virtualized tree** — only visible rows render, so large repos scroll at full speed
- **Full keyboard control** — `↑↓` navigate, `Shift+↑↓` range-select, `Ctrl+↑↓` move focus without selecting, `←/→` collapse / expand / jump to parent or child, `Home`/`End`, `PageUp`/`PageDown`, `Enter` open, `F2` rename, `Del` delete, `Ctrl+A` select all
- **Type-ahead jump** — start typing to jump to a file, with a live prefix indicator
- **Git decorations** — changed files coloured by status (modified / added / deleted / renamed / untracked / conflicted), rolled up so folders containing changes are marked
- **Compact folders** — a folder holding nothing but one subfolder collapses into a single `src/lib/icons` row, each segment individually targetable
- **Multi-select** with real Ctrl / Shift semantics, multi-item drag, `Ctrl`-drag to copy
- **Drop files in from the OS** — dragging from Windows Explorer lands them in whichever folder is under the cursor, not just the workspace root
- **System clipboard interop** — `Ctrl+V` pastes files copied in Explorer, and images copied from a browser or the Snipping Tool are written out as PNG; `Ctrl+C` in the tree publishes the selection so it can be pasted back into Explorer
- **Cut / copy / paste** handled natively, with Finder-style collision naming (`file copy`, `file copy 2`)
- **Undo / redo** for create, rename, move, and copy; single-file deletes are reversible because contents are captured first
- **Auto-reveal** — the active editor's file expands its ancestors and scrolls into view
- **Live refresh** — visible folders revalidate on a timer and on window focus, so on-disk changes appear without hitting Refresh
- **Open Editors** — a collapsible list of every open tab above the tree, with per-tab and close-all buttons; collapsed by default so it doesn't eat space
- Inline create / rename / delete (no modal dialogs), keyboard-navigable context menu, Reveal in File Explorer, Open in Integrated Terminal, Find in Folder

### Editor
- **Monaco** with 80+ language grammars, lazy-loaded so the bundle doesn't hit startup
- **JSX / TSX highlighting** — Monaco ships no JSX rules at all, so markup inside `return (…)` rendered as flat text; Aether layers tag, component, attribute and embedded-expression tokenization on top of the stock grammar, with lookahead tuned to keep TypeScript generics (`useState<State | null>(…)`, `Map<string, V>`) out of markup
- **Auto-import suggestions** — every workspace module's exports are indexed, so typing a component name offers it in the completion list and writes the `import` line for you; unresolved names get an "Add import from …" quick fix
- **React snippets** — `rfc`, `rfce`, `rafce`, `rafc`, `rtsc`, `rcc`, `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`, `imr`, `imd`, `clg` and friends, with the component named after the file
- **Emmet** in JSX, HTML and CSS
- **Cross-file IntelliSense** for JS/TS — workspace files are loaded as background Monaco models so completions and go-to-definition work without opening them first
- Editor tabs with drag-reorder and dirty-state indicators
- Path breadcrumbs, status bar with cursor position and language
- Configurable font, size, word wrap, minimap, and line numbers (absolute / relative / off)

### Browser
- A built-in **Simple Browser** tab with an address bar, back/forward/reload and "open externally" — handy for watching a dev server next to the code that drives it
- Opens from the Explorer toolbar or the command palette (`Browser: Open Simple Browser`); appears in Open Editors alongside your files

### Viewers & editors
- **Markdown** — three modes per file: rendered preview, visual (WYSIWYG) editor, and raw source
- **draw.io** — fully embedded for `.drawio`, `.drawio.svg`, and `.drawio.png` files
- **Images** and **PDFs** open natively in a tab
- **Diff editor** — Monaco side-by-side diff for git changes

### Source control
- Changes view with per-file status, staging, and commit
- Commit history with a rendered commit graph
- Push, set-upstream, checkout file, branch display, clone a repository from the welcome screen
- **Agent Review** — an AI pass over the diff that surfaces issues as inline, jump-to-line annotations

### Search
- Full-text workspace search with regex, case-sensitivity, and whole-word toggles
- Include / exclude glob filters, with "Find in Folder…" seeding the scope from the explorer
- Find and replace across results

### Terminal
- Real PTY sessions (not a shim) via `portable-pty`, streamed over Tauri channels
- Multiple tabs, PowerShell and CMD, resizable panel that survives hide/show without killing the shell

### AI
- **Inline editing** — `Ctrl+K` for an in-editor edit or question with streaming diffs, `Alt+Enter` for a quick question
- **Agent Review** — an AI pass over the diff, surfaced as inline annotations
- AI-generated commit messages
- **Being rebuilt.** The provider layer is mid-migration to the Vercel AI SDK with an OpenAI-compatible transport, Inception Labs (Mercury 2) and Kimi K3, each with its own base URL and key. Until that lands there is no configuration UI, so these flows run on whatever settings were saved previously.

### Workbench
- Command palette — `Ctrl+P` go to file, `Ctrl+Shift+P` all commands, fuzzy-matched
- **Settings as a modal** — `Ctrl+,` opens it over the workbench instead of taking an editor tab
- Three layout modes — Aether (activity bar on top), VS Code (activity bar on the left), Compact
- Two file icon themes, switchable at runtime
- Recent folders, resizable sidebar and terminal, live editor preview in settings

### Keyboard
| Shortcut | Action |
| --- | --- |
| `Ctrl+P` | Go to file |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+S` | Save |
| `Ctrl+W` | Close editor |
| `Ctrl+B` | Toggle sidebar |
| `` Ctrl+` `` | Toggle terminal |
| `Ctrl+,` | Settings |
| `Ctrl+K` | Inline AI edit |
| `Alt+Enter` | Inline AI question |

---

## What Needs Work

This is the honest list. Most of it is the layer that makes an editor good at *writing code*, rather than just displaying it.

### Code intelligence — the main gap
- **File indexing is shallow and volatile.** The workspace index is a flat list of paths rebuilt from scratch on every open, capped at 50k files, held only in memory. There's no persistence, no incremental update on file change, and no symbol table. Everything downstream — quick-open ranking, AI context selection, go-to-definition — is limited by this.
- **Cross-file IntelliSense only covers JS/TS**, capped at 3000 files / 15 MB, and works by loading file *contents* into Monaco models. It needs to become a real index (symbols, references, imports) instead of brute-forcing text into the editor.
- **The export index behind auto-import is regex-based**, not parsed. It reads `export` declarations well enough for everyday React work but doesn't understand re-exports (`export * from`), barrel files, or `package.json` entry points, and it can't rank suggestions by how often a symbol is actually used.
- **JSX highlighting is a heuristic grammar, not a parser.** Monarch has no syntactic context, so `<` is classified by lookahead. It handles the generics that show up in real code, but a construct that looks like both will occasionally be coloured wrong — TextMate grammars or a proper parser would fix this class of bug for good.
- **No language server support.** Every language except TypeScript gets syntax highlighting and nothing else — no diagnostics, no hover types, no go-to-definition, no rename-symbol, no find-all-references. Wiring an LSP client is the single highest-value thing left.
- **No Problems panel** — there's nowhere for diagnostics to land even once they exist.
- **No outline / symbol view.** Breadcrumbs show the file path, not the symbol path.
- **AI context selection is naive** — it can't yet reason about which files actually matter to a request, because there's no dependency graph to ask.

### Editor
- **No split editors or editor groups** — one editor at a time, no side-by-side
- **No preview tabs or tab pinning** — every open is a permanent tab
- No debugging (DAP), no task runner
- Large files (>5 MB) are refused rather than opened read-only or streamed

### Filesystem
- Refresh is **polling-based** (visible folders every 4s, plus on focus). It should be a native filesystem watcher — cheaper, instant, and correct for changes outside the visible set.
- **Deletes are permanent** — they should go to the OS trash
- **System clipboard file lists are Windows-only** — on macOS and Linux, pasting files copied from the OS file manager falls back to the in-app buffer
- No multi-root workspaces

### Source control
- No branch management UI (create, switch, merge), no stash, no pull/fetch
- Staging is whole-file only — no per-hunk or per-line staging
- No merge conflict resolution UI
- Diff viewer is functional but plain

### AI
- **The provider layer is being rebuilt on the Vercel AI SDK.** Until it lands there is no settings UI for models or keys, so the inline agent and Agent Review can't be reconfigured from inside the app.

### Configuration & extensibility
- Settings are UI-only and stored in localStorage — **no `settings.json`, no `keybindings.json`**, so nothing is portable or version-controllable
- **Keybindings are hardcoded** and not remappable
- **No extension system.** Matching VS Code's extension API is a genuinely hard problem; a lighter-weight approach is being explored rather than a direct clone.
- No theming beyond the built-in palette

### Performance & polish
- First-load is still slow; Monaco and the language grammars dominate the bundle
- Not yet packaged as a distributable build or installer
- No test suite — verification is build-based today

---

## Roadmap

Roughly in priority order:

- [ ] **Persistent, incremental file index** with symbol extraction — the foundation for everything below
- [ ] **LSP client** so languages other than TypeScript get real intelligence
- [ ] **Problems panel** and diagnostics surface
- [ ] **Native filesystem watcher** to replace polling
- [ ] `settings.json` + `keybindings.json`, with remappable keys
- [ ] Split editors / editor groups
- [ ] Outline view and symbol breadcrumbs
- [ ] Per-hunk staging and a better diff viewer
- [ ] Delete to OS trash
- [ ] **Rebuild the AI provider layer on the Vercel AI SDK** — OpenAI-compatible transport, Inception Labs Mercury 2, Kimi K3, each with custom base URL and key
- [ ] Deeper AI context using the new index
- [ ] An extension story that isn't a VS Code API clone
- [ ] Faster cold start
- [ ] Packaged installer

---

## Why Tauri instead of Electron?

Electron ships a full Chromium + Node runtime with every app, which is why editors built on it routinely exceed 100 MB. Tauri uses the OS's native webview, which keeps Aether small while still building the UI with web tech.

## Architecture

```
desktop/
├── src/                    React 19 + TypeScript frontend
│   ├── components/         Workbench UI (explorer, tabs, terminal, SCM, search)
│   ├── lib/
│   │   ├── explorer/       Tree model, directory cache, git decorations, fs history
│   │   ├── monaco/         Editor setup, workspace models, inline AI, diffing
│   │   ├── ai/             Provider layer (mid-migration to the Vercel AI SDK)
│   │   └── icons/          Icon theme registry
│   └── generated/          Generated icon manifest — do not edit by hand
└── src-tauri/src/          Rust backend
    ├── lib.rs              File I/O, directory listing, search, git commands
    ├── terminal.rs         PTY sessions over Tauri channels
    └── ai.rs               Streaming completions (SSE) with native tool calling
```

All Node dependencies live in `desktop/package.json`; there is no root `package.json`.

## Tech Stack

**Frontend** — React 19, TypeScript 5.8, Vite 7, TailwindCSS 4, Monaco 0.55, Motion 12, xterm.js 6
**Backend** — Tauri 2, Rust 2021, `reqwest`, `portable-pty`, `ignore`, `serde`
**Tooling** — pnpm, Tauri CLI, cargo

## Running Locally

```bash
cd desktop
pnpm install
pnpm tauri dev
```

Other commands:

```bash
pnpm dev           # Vite dev server only (frontend work)
pnpm typecheck     # tsc --noEmit
pnpm build         # Build the frontend to desktop/dist
pnpm tauri build   # Build the desktop app + installer
pnpm build:check   # Full build with error parsing — the pass/fail gate
```

Windows is the primary development target; there are `#[cfg(windows)]` code paths in the Rust layer.
