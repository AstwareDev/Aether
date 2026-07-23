import { motion } from "motion/react";
import { useSetting, setSetting } from "../lib/settings";
import { iconThemes } from "../lib/icons";
import type { SettingsPanelProps, LayoutMode } from "../types";

const LAYOUT_OPTIONS: { id: LayoutMode; label: string; description: string }[] = [
  { id: "aether", label: "Aether", description: "Activity bar at the top of the sidebar." },
  { id: "vscode", label: "VSCode", description: "Activity bar on the left edge with standard icons." },
  { id: "compact", label: "Compact", description: "VSCode layout with small, compact icons." },
];

export default function SettingsPanel({ section }: SettingsPanelProps) {
  const iconTheme = useSetting("iconTheme");
  const layoutMode = useSetting("layoutMode");

  return (
    <div className="scroll-thin h-full overflow-y-auto p-8 bg-canvas">
      <motion.div
        key={section}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="mx-auto max-w-2xl"
      >
        {section === "appearance" && (
          <div className="space-y-8">
            <SectionHeader title="Appearance" description="Customize the look and feel of the editor." />

            <Field label="File Icon Theme">
              <div className="flex gap-2">
                {iconThemes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSetting("iconTheme", t.id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                      iconTheme === t.id
                        ? "border-accent/60 bg-accent/15 text-white"
                        : "border-white/[0.08] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                    }`}
                  >
                    <ThemePreview id={t.id} />
                    {t.label}
                  </button>
                ))}
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
                      layoutMode === opt.id
                        ? "border-accent/60 bg-accent/15"
                        : "border-white/[0.08] hover:border-white/20"
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
        )}

        {section === "models" && <PlaceholderSection title="Models & Providers" />}
        {section === "ai-tools" && <PlaceholderSection title="AI Tools" />}
        {section === "ai-config" && <PlaceholderSection title="AI Configuration" />}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function PlaceholderSection({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-sm font-medium text-zinc-400">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">Coming soon.</p>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-white/90">{title}</h3>
      <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function ThemePreview({ id }: { id: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      {id === "aether" ? (
        <>
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 5h6M5 8h4M5 11h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="5.5" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1" />
          <circle cx="10.5" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1" />
          <circle cx="8" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1" />
        </>
      )}
    </svg>
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
