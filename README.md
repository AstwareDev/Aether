# Aether

> A lightweight code editor built from scratch — aiming for the parts of Cursor an average developer actually uses, without the bloat.

## What is Aether?

Aether is a desktop code editor built with **Tauri**, currently sitting at roughly **7 MB** — a fraction of the size of Electron-based editors. The goal isn't to replicate every feature of Cursor or VS Code, but to ship a fast, lightweight editor with the subset of features most developers reach for day to day.

Currently mid-migration from JavaScript to **TypeScript**.

## Status: Early / Work in Progress

This is an active, early-stage build — not yet feature-complete or packaged for general use. Right now:

- [ ] TypeScript migration — *in progress*
- [ ] Core editing experience
- [ ] *(fill in what's actually working today, e.g. file tree, syntax highlighting, tabs)*
- [ ] Packaged builds / installer

*(Replace the checklist above with your real progress — even 2-3 honest "done" items plus a couple "not yet" items reads better than a vague status line.)*

## Why Tauri instead of Electron?

Electron ships a full Chromium + Node runtime with every app, which is why editors built on it often run 100MB+. Tauri uses the OS's native webview instead, which is what keeps Aether's footprint small while still using web tech (HTML/CSS/TypeScript) for the UI.

## Tech Stack

- **Tauri** — desktop shell / native bindings
- **TypeScript** *(migrating from JavaScript)*
- *(add your frontend framework here if you're using one — React, Svelte, vanilla, etc.)*

## Philosophy

Not every IDE feature earns its place. Aether is scoped deliberately to what an average developer needs day-to-day, rather than trying to match a full-featured editor's surface area feature-for-feature.

## Running Locally

```bash
# fill in once you have a stable dev command, e.g.:
npm install
npm run tauri dev
```

## Roadmap

- [ ] Finish TypeScript migration
- [ ] *(add your next 2-3 real milestones)*

## License

*(add a license if you want this reused/forked — MIT is a common default)*
