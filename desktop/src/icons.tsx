import { extensionOf } from "./lib/fs";

// ─────────────────────────────────────────────────────────────────────
// colour helper (used by FileGlyph)
// ─────────────────────────────────────────────────────────────────────

function colorFor(name: string): string {
  const ext = extensionOf(name);
  switch (ext) {
    case "ts":
    case "tsx":
    case "cts":
    case "mts":
      return "#3b82f6";
    case "js":
    case "jsx":
    case "cjs":
    case "mjs":
      return "#eab308";
    case "json":
    case "jsonc":
      return "#f59e0b";
    case "rs":
      return "#f97316";
    case "py":
      return "#22c55e";
    case "css":
    case "scss":
    case "less":
      return "#38bdf8";
    case "html":
    case "htm":
      return "#fb7185";
    case "md":
    case "markdown":
      return "#94a3b8";
    case "drawio":
    case "svg":
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
      return "#a78bfa";
    default:
      return "#71717a";
  }
}

// ─────────────────────────────────────────────────────────────────────
// File / Folder glyphs (FileIcon.tsx)
// ─────────────────────────────────────────────────────────────────────

interface FileGlyphInnerProps {
  name: string;
  className?: string;
}

export function FileGlyph({ name, className }: FileGlyphInnerProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M4 1.5h4.2L12 5.2V13a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 3 13V3a1.5 1.5 0 0 1 1-1.5Z"
        fill={colorFor(name)} fillOpacity="0.18"
        stroke={colorFor(name)} strokeWidth="1.1" strokeLinejoin="round"
      />
      <path d="M8 1.75V5a.5.5 0 0 0 .5.5h3.2" stroke={colorFor(name)} strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

export function FolderGlyph({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {open ? (
        <path
          d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.3c.4 0 .78.16 1.06.44l.7.7c.28.28.66.44 1.06.44H12.5A1.5 1.5 0 0 1 14 6.1l-.2.4H4.4a1.5 1.5 0 0 0-1.4 1L2 11.5V4.5Z"
          fill="#60a5fa" fillOpacity="0.25"
          stroke="#60a5fa" strokeWidth="1.1" strokeLinejoin="round"
        />
      ) : (
        <path
          d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.3c.4 0 .78.16 1.06.44l.7.7c.28.28.66.44 1.06.44H12.5A1.5 1.5 0 0 1 14 6.1v5.4A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7Z"
          fill="#60a5fa" fillOpacity="0.2"
          stroke="#60a5fa" strokeWidth="1.1" strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Diff glyph (EditorTabs.tsx)
// ─────────────────────────────────────────────────────────────────────

export function DiffGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-sky-500">
      <rect x="2" y="1" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Source control icons (SourceControl.tsx)
// ─────────────────────────────────────────────────────────────────────

export function RefreshSvg({ spinning }: { spinning: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className={spinning ? "animate-spin" : ""}>
      <path d="M13.65 2.35A7 7 0 1 0 15 8h-2a5 5 0 1 1-1.06-3.1L10 7h5V2l-1.35.35Z" fill="currentColor" />
    </svg>
  );
}

export function BranchSvg() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="shrink-0 text-zinc-500">
      <path d="M5 3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-1.5 3A3.5 3.5 0 0 0 7 10v1.5a1.5 1.5 0 1 0 2 0V10a3.5 3.5 0 0 0 3.5-3.5V5a1.5 1.5 0 1 0-2 0v1.5A1.5 1.5 0 0 1 9 8H7a1.5 1.5 0 0 1-1.5-1.5V5a1.5 1.5 0 1 0-2 0v1.5Z" fill="currentColor" />
    </svg>
  );
}

export function CheckSvg() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" fill="currentColor" />
    </svg>
  );
}

export function SparkSvg() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1Z" fill="currentColor" />
    </svg>
  );
}

export function AgentSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false" className="shrink-0 text-zinc-500">
      <ellipse cx="10" cy="7.5" rx="3.6" ry="3.1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="10" cy="7" rx="2.1" ry="2.1" fill="#8ef7da" opacity="0.7" />
      <circle cx="10" cy="7" r="0.7" fill="#00fff7" />
      <rect x="7" y="11.1" width="6" height="2.3" rx="1.15" stroke="currentColor" strokeWidth="1.2" fill="#0f172a" />
      <path d="M4.4 17c.7-3.1 3.2-5.1 5.6-5.1s4.9 2 5.6 5.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <rect x="6.7" y="13.8" width="1.4" height="1.2" rx="0.45" fill="#8ef7da" opacity="0.7" />
      <rect x="11.9" y="13.8" width="1.4" height="1.2" rx="0.45" fill="#8ef7da" opacity="0.7" />
    </svg>
  );
}

export function QuestionSvg() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 6a2 2 0 1 1 2.5 1.936C8 8.5 8 9 8 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r=".75" fill="currentColor" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Settings section icon (SettingsPanel.tsx)
// ─────────────────────────────────────────────────────────────────────

import type { SettingsSection } from "./types";

export function SectionIcon({ section }: { section: SettingsSection }) {
  switch (section) {
    case "appearance":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2 8h12M8 2a9.5 9.5 0 010 12 9.5 9.5 0 010-12z" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case "explorer":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M1.75 3.5h4l1.25 1.5h7.25v7.5a.75.75 0 01-.75.75H2.5a.75.75 0 01-.75-.75V3.5z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "source-control":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="4" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="4" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="12" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M4 5v6M4 6.5c0 3 2.5 3 8 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Topbar window control icons (Topbar.tsx)
// ─────────────────────────────────────────────────────────────────────

export function MinimizeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 5.5H10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function MaximizeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="1.5" width="8" height="8" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function RestoreIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.5 2.5H8.5V7.5" stroke="currentColor" strokeWidth="1" />
      <path d="M2.5 3.5V8.5H7.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function TopCloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 1.5L9.5 9.5M9.5 1.5L1.5 9.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Welcome page icons (Welcome.tsx)
// ─────────────────────────────────────────────────────────────────────

export function WelcomeFolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 13.5V3.5C1.5 2.94772 1.94772 2.5 2.5 2.5H6.08579C6.351 2.5 6.60536 2.60536 6.79289 2.79289L8.20711 4.20711C8.39464 4.39464 8.649 4.5 8.91421 4.5H13.5C14.0523 4.5 14.5 4.94772 14.5 5.5V13.5C14.5 14.0523 14.0523 14.5 13.5 14.5H2.5C1.94772 14.5 1.5 14.0523 1.5 13.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="4.5" cy="4.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4.5" cy="11.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12.5" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 6V11.5M4.5 11.5C4.5 9 6.5 7.5 11 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function WelcomeCloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 6H9.5M9.5 6L6 2.5M9.5 6L6 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Terminal icons (TerminalPanel.tsx)
// ─────────────────────────────────────────────────────────────────────

type TerminalShellKind = "powershell" | "cmd";

export function PowerShellIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: size, height: size, flexShrink: 0 }}>
      <rect width="16" height="16" rx="3" fill="#012456" />
      <text x="1.5" y="12" fontFamily="Consolas, monospace" fontSize="10" fontWeight="bold" fill="#ffffff">PS</text>
    </svg>
  );
}

export function CmdIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: size, height: size, flexShrink: 0 }}>
      <rect width="16" height="16" rx="3" fill="#1e1e1e" />
      <path d="M3 5.5 L7 8 L3 10.5" stroke="#c8c8c8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10.5 L12 10.5" stroke="#c8c8c8" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ShellIcon({ shell, size = 14 }: { shell: TerminalShellKind; size?: number }) {
  return shell === "powershell" ? <PowerShellIcon size={size} /> : <CmdIcon size={size} />;
}

// ─────────────────────────────────────────────────────────────────────
// UI icons extracted from lib/icons/ui.tsx
// ─────────────────────────────────────────────────────────────────────

export function Chevron({ open, size = 12 }: { open: boolean; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-150 ease-out ${open ? "rotate-90" : ""}`}
      style={{ width: size, height: size }}
    >
      <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: size, height: size }}>
      <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function CheckGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: size, height: size }}>
      <path d="M2.5 6.5L5 9L9.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// AI provider icon SVG strings (lib/monaco/aiEdit.ts)
// Used as innerHTML on brain selector elements.
// ─────────────────────────────────────────────────────────────────────

export const OMNIROUTE_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a0a7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12l2 2 4-4"/></svg>`;

export const ANTHROPIC_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-16h8l4 20M6 14h12"></path></svg>`;

export const LM_STUDIO_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line></svg>`;
