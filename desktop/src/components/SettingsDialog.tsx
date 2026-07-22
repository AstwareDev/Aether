import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useFocusTrap } from "../lib/useFocusTrap";
import { useSetting, setSetting } from "../lib/settings";
import { iconThemes } from "../lib/icons";
import {
  useAiSettings,
  setAiSetting,
  listLmStudioModels,
  CLAUDE_MODELS,
} from "../lib/ai";
import type { Brain } from "../types";
import { SectionIcon } from "../icons";
import type { SettingsDialogProps, SettingsSection } from "../types";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "layout", label: "Layout" },
  { id: "ai", label: "AI" },
];

export default function SettingsDialog({ open, onClose, initialSection }: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection ?? "appearance");

  useEffect(() => {
    if (open && initialSection) setSection(initialSection);
  }, [open, initialSection]);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  const iconTheme = useSetting("iconTheme");
  const sidebarVisible = useSetting("sidebarVisible");
  const terminalVisible = useSetting("terminalVisible");
  const sidebarWidth = useSetting("sidebarWidth");

  const s = useAiSettings();
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const refreshModels = async () => {
    setLoadingModels(true);
    setModelError(null);
    try {
      const list = await listLmStudioModels(s.lmStudioBaseUrl);
      setModels(list);
      if (list.length && !list.includes(s.lmStudioModel)) {
        setAiSetting("lmStudioModel", list[0]);
      }
    } catch (err) {
      setModelError(err instanceof Error ? err.message : String(err));
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (open && s.brain === "lmstudio") void refreshModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, s.brain]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={onClose}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" />
          <motion.div
            className="relative w-full max-w-2xl"
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="aether-settings-title"
              className="overflow-hidden rounded-xl border border-white/[0.08] bg-abyss shadow-2xl shadow-black/60"
            >
              <div
                id="aether-settings-title"
                className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3"
              >
                <span className="text-sm font-medium text-white/90">Settings</span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close settings"
                  className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="flex max-h-[65vh] min-h-[380px]">
                {/* Navigation sidebar */}
                <nav className="w-40 shrink-0 border-r border-white/[0.05] p-3">
                  {SECTIONS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSection(id)}
                      className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                        section === id
                          ? "bg-white/[0.08] text-white"
                          : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                      }`}
                    >
                      <SectionIcon section={id} />
                      {label}
                    </button>
                  ))}
                </nav>

                {/* Content */}
                <div className="scroll-thin flex-1 overflow-y-auto p-5">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={section}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.12 }}
                    >
                      {section === "appearance" && (
                        <AppearanceSection current={iconTheme} />
                      )}
                      {section === "layout" && (
                        <LayoutSection
                          sidebarVisible={sidebarVisible}
                          terminalVisible={terminalVisible}
                          sidebarWidth={sidebarWidth}
                        />
                      )}
                      {section === "ai" && (
                        <AiSection
                          s={s}
                          models={models}
                          loadingModels={loadingModels}
                          modelError={modelError}
                          onRefreshModels={refreshModels}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex justify-end border-t border-white/[0.06] px-5 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-accent/90 px-4 py-1.5 text-xs font-semibold text-void transition-colors hover:bg-accent"
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

function AppearanceSection({ current }: { current: string }) {
  return (
    <div className="space-y-5">
      <SectionHeader title="Appearance" description="Customize the look and feel of the editor." />
      <Field label="File Icon Theme">
        <div className="flex gap-2">
          {iconThemes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSetting("iconTheme", t.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                current === t.id
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
    </div>
  );
}

function ThemePreview({ id }: { id: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      {id === "flow-deep" ? (
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

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function LayoutSection({
  sidebarVisible,
  terminalVisible,
  sidebarWidth,
}: {
  sidebarVisible: boolean;
  terminalVisible: boolean;
  sidebarWidth: number;
}) {
  return (
    <div className="space-y-5">
      <SectionHeader title="Layout" description="Control the editor's window layout." />
      <ToggleField
        label="Show Sidebar"
        description="Toggle the explorer/source control sidebar."
        checked={sidebarVisible}
        onChange={(v) => setSetting("sidebarVisible", v)}
      />
      <ToggleField
        label="Show Terminal"
        description="Toggle the integrated terminal panel."
        checked={terminalVisible}
        onChange={(v) => setSetting("terminalVisible", v)}
      />
      <Field label="Sidebar Width">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={180}
            max={480}
            value={sidebarWidth}
            onChange={(e) => setSetting("sidebarWidth", Number(e.target.value))}
            className="range-accent flex-1"
          />
          <span className="w-10 text-right text-xs text-zinc-500">{sidebarWidth}px</span>
        </div>
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

function AiSection({
  s,
  models,
  loadingModels,
  modelError,
  onRefreshModels,
}: {
  s: ReturnType<typeof useAiSettings>;
  models: string[];
  loadingModels: boolean;
  modelError: string | null;
  onRefreshModels: () => void;
}) {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="AI"
        description="Configure which AI brain powers the inline editor (Ctrl+K)."
      />
      <Field label="Brain">
        <div className="flex gap-2">
          {(["mercury", "claude", "lmstudio"] as Brain[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setAiSetting("brain", b)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                s.brain === b
                  ? "border-accent/60 bg-accent/15 text-white"
                  : "border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              {b === "mercury" ? "Mercury" : b === "claude" ? "Claude" : "LM Studio"}
            </button>
          ))}
        </div>
      </Field>

      {s.brain === "mercury" ? (
        <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs leading-relaxed text-zinc-500">
          Mercury 2 by Inception Labs — a diffusion LLM that streams fast,
          progressively refined answers. Runs through the public playground
          endpoint, so no API key is required.
        </p>
      ) : s.brain === "claude" ? (
        <>
          <Field label="Model">
            <select
              value={s.claudeModel}
              onChange={(e) => setAiSetting("claudeModel", e.target.value)}
              className={selectClass}
            >
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Anthropic API key" hint="Stored locally; used only from the Rust backend.">
            <input
              type="password"
              value={s.apiKey}
              spellCheck={false}
              placeholder="sk-ant-…"
              onChange={(e) => setAiSetting("apiKey", e.target.value)}
              className={inputClass}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Server URL">
            <input
              value={s.lmStudioBaseUrl}
              spellCheck={false}
              placeholder="http://localhost:1234"
              onChange={(e) => setAiSetting("lmStudioBaseUrl", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Model">
            <div className="flex gap-2">
              <select
                value={s.lmStudioModel}
                onChange={(e) => setAiSetting("lmStudioModel", e.target.value)}
                className={selectClass}
              >
                {models.length === 0 && (
                  <option value="">{s.lmStudioModel || "No models loaded"}</option>
                )}
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onRefreshModels}
                disabled={loadingModels}
                className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
              >
                {loadingModels ? "Loading…" : "Refresh"}
              </button>
            </div>
            {modelError && <p className="mt-2 text-xs text-red-400">{modelError}</p>}
          </Field>
        </>
      )}

      <Field label="Max output tokens">
        <input
          type="number"
          min={256}
          max={128000}
          value={s.maxTokens}
          onChange={(e) => setAiSetting("maxTokens", Math.max(256, Number(e.target.value) || 4096))}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-white/90">{title}</h3>
      <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div>
        <span className="text-sm text-zinc-200">{label}</span>
        <p className="mt-0.5 text-[11px] text-zinc-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-white/[0.12]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-white/10 bg-void px-3 py-2 font-mono text-sm text-zinc-100 outline-none transition-shadow placeholder:text-zinc-500 focus:border-accent/60 focus:ring-2 focus:ring-accent/25";
const selectClass =
  "w-full rounded-lg border border-white/10 bg-void px-3 py-2 text-sm text-zinc-100 outline-none focus:border-accent/60";
