import { setSetting, useSetting } from "../../lib/settings";
import { Field, SectionHeader, selectClass } from "./primitives";
import type { LayoutMode } from "../../types";

const LAYOUT_OPTIONS: { id: LayoutMode; label: string; description: string }[] = [
  { id: "aether", label: "Aether", description: "Activity bar at the top of the sidebar." },
  { id: "vscode", label: "VSCode", description: "Activity bar on the left edge with standard icons." },
  { id: "compact", label: "Compact", description: "VSCode layout with small, compact icons." },
];

const COMMON_FONTS = [
  "Consolas, 'Courier New', monospace",
  "'Fira Code', monospace",
  "'JetBrains Mono', monospace",
  "'Cascadia Code', monospace",
  "'Source Code Pro', monospace",
  "'SF Mono', Consolas, monospace",
];

export default function AppearanceSection() {
  const layoutMode = useSetting("layoutMode");
  const editorFontFamily = useSetting("editorFontFamily");
  const editorFontSize = useSetting("editorFontSize");

  return (
    <div className="space-y-8">
      <SectionHeader title="Appearance" description="Customize the look and feel of the editor." />

      <Field label="Editor Font Family">
        <select
          value={editorFontFamily}
          onChange={(e) => setSetting("editorFontFamily", e.target.value)}
          className={selectClass}
        >
          {COMMON_FONTS.map((font) => (
            <option key={font} value={font} className="bg-[#1a1a1a] text-white">
              {font.split(",")[0].replace(/['"]/g, "")}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Editor Font Size">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="10"
            max="24"
            value={editorFontSize}
            onChange={(e) => setSetting("editorFontSize", Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-12 text-right text-sm font-medium text-white">{editorFontSize}px</span>
        </div>
      </Field>

      <div className="space-y-3">
        <SectionHeader title="Sidebar Layout" description="Choose the sidebar layout style." />
        <div className="flex flex-col gap-2">
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSetting("layoutMode", opt.id)}
              className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors ${
                layoutMode === opt.id ? "border-accent/60 bg-accent/15" : "border-white/[0.08] hover:border-white/20"
              }`}
            >
              <LayoutPreview mode={opt.id} active={layoutMode === opt.id} />
              <div className="min-w-0">
                <span className={`text-sm font-medium ${layoutMode === opt.id ? "text-white" : "text-zinc-300"}`}>
                  {opt.label}
                </span>
                <p className="mt-0.5 text-[11px] text-zinc-500">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LayoutPreview({ mode, active }: { mode: string; active: boolean }) {
  const c = active ? "var(--color-accent)" : "currentColor";
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" fill="none" className="shrink-0">
      {mode === "aether" ? (
        <>
          <rect x="1" y="1" width="12" height="26" rx="2" stroke={c} strokeWidth="1.2" />
          <rect x="3" y="3" width="8" height="4" rx="0.75" fill={c} opacity="0.15" />
          <rect x="3" y="9" width="8" height="2" rx="0.5" fill={c} opacity="0.3" />
          <rect x="3" y="13" width="8" height="2" rx="0.5" fill={c} opacity="0.3" />
          <rect x="14" y="1" width="21" height="26" rx="2" stroke={c} strokeWidth="1.2" />
        </>
      ) : mode === "vscode" ? (
        <>
          <rect x="1" y="1" width="4" height="26" rx="1" stroke={c} strokeWidth="1.2" />
          <rect x="1" y="24" width="4" height="3" rx="0.5" fill={c} opacity="0.25" />
          <rect x="6" y="1" width="10" height="26" rx="2" stroke={c} strokeWidth="1.2" />
          <rect x="8" y="4" width="6" height="2" rx="0.5" fill={c} opacity="0.3" />
          <rect x="8" y="8" width="6" height="2" rx="0.5" fill={c} opacity="0.3" />
          <rect x="8" y="12" width="6" height="2" rx="0.5" fill={c} opacity="0.3" />
          <rect x="17" y="1" width="18" height="26" rx="2" stroke={c} strokeWidth="1.2" />
        </>
      ) : (
        <>
          <rect x="1" y="1" width="3" height="26" rx="1" stroke={c} strokeWidth="1.2" />
          <rect x="5" y="1" width="8" height="26" rx="2" stroke={c} strokeWidth="1.2" />
          <rect x="14" y="1" width="21" height="26" rx="2" stroke={c} strokeWidth="1.2" />
        </>
      )}
    </svg>
  );
}
