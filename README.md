# Aether

> A lightweight code editor built from scratch — the parts of Cursor / VS Code an average developer actually uses, without the bloat.

## What is Aether?

Aether is a desktop code editor built with **Tauri**, currently around **7 MB** — a fraction of the size of Electron-based editors, since it uses the OS's native webview instead of shipping a full Chromium + Node runtime with every install.

The goal isn't to match every feature of a full-featured IDE. It's to scope down to what developers reach for on a daily basis and make that fast and lightweight.

Also notable: this is the first project built in **TypeScript** from the start, rather than JavaScript.

## Features (working today)

- **File explorer & workspace view** — sidebar tree with folder/file navigation
- **Command palette** — `Ctrl+P` go to file, `Ctrl+Shift+P` show all commands, `Ctrl+B` toggle sidebar, `Ctrl+S` save
- **Markdown preview** — live rendered preview alongside raw markdown editing
- **Diagram editing** — draw.io fully embedded in-editor for `.drawio` files (shapes, styles, full toolbar)
- **Source control** — git changes view with diff status indicators, commit message + commit button, history tab, and an "Agent Review" tab
- **Workspace search** — full-text search across files with regex, case-sensitivity, filters, and find/replace
- **AI-assisted editing** — Cursor-style inline AI: `Ctrl+K` quick edit / add to chat, an "Edit Selection" flow with model picker, `Alt+Enter` quick question, and dedicated AI settings

## Known Limitations

- AI integration is functional but still early — output quality and reliability need more work
- Limited language support so far — more languages planned
- No custom file icons yet
- First-time load speed is slow and needs optimization
- No extension system yet — matching VS Code/Cursor-style extensions turned out to be a genuinely hard problem, so a lighter-weight alternative approach is being explored instead of a direct clone
- Source control diff viewer is basic and needs more work
- Many smaller issues throughout, as expected at this stage
- Not yet packaged as a distributable build/installer

## Why Tauri instead of Electron?

Electron ships a full Chromium + Node runtime with every app, which is why editors built on it often run 100MB+. Tauri uses the OS's native webview, which is what keeps Aether small while still building the UI with web tech.

## Tech Stack

- **Tauri** — desktop shell / native bindings
- **TypeScript** — first project built in TS from the start
- **React** — UI layer
- **pnpm** — package manager

## Running Locally

```bash
# fill in your actual dev command, e.g.:
npm install
npm run tauri dev
```

## Roadmap

- [ ] Deepen AI integration
- [ ] Add support for more languages
- [ ] File icons
- [ ] Faster first-time load speed
- [ ] Figure out an extension system alternative (VS Code/Cursor-style extension compatibility is a hard problem — exploring a different approach)
- [ ] Improve the source control diff viewer
- [ ] **Agent Diff Reviewer** — an AI agent that reviews diffs to find and fix issues, likely built on GLM 5
- [ ] Package a distributable build
