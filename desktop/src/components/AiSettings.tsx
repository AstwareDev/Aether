import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useFocusTrap } from "../lib/useFocusTrap";
import {
  useAiSettings,
  setAiSetting,
  listLmStudioModels,
  CLAUDE_MODELS,
} from "../lib/ai";
import type { Brain } from "../types";
import type { AiSettingsProps } from "../types";

/** Configure the inline AI editor (Ctrl+K): which brain, models, credentials. */
export default function AiSettings({ open, onClose }: AiSettingsProps) {
  const s = useAiSettings();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

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

  // Pull the LM Studio model list when the dialog opens on that brain.
  useEffect(() => {
    if (open && s.brain === "lm-studio") void refreshModels();
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
          className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={onClose}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
          <motion.div
            className="relative w-full max-w-md"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 460, damping: 34 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="aether-ai-title"
              className="overflow-hidden rounded-xl border border-white/10 bg-abyss shadow-2xl shadow-black/60"
            >
              <div
                id="aether-ai-title"
                className="border-b border-white/[0.06] px-4 py-3 text-sm font-medium text-white/90"
              >
                AI Settings
              </div>

              <div className="max-h-[65vh] space-y-4 overflow-y-auto p-4 scroll-thin">
                <Field label="Brain">
                  <div className="flex gap-2">
                    <BrainOption
                      active={s.brain === "mercury"}
                      label="Mercury"
                      onClick={() => setAiSetting("brain", "mercury" as Brain)}
                    />
                    <BrainOption
                      active={s.brain === "claude"}
                      label="Claude"
                      onClick={() => setAiSetting("brain", "claude" as Brain)}
                    />
                    <BrainOption
                      active={s.brain === "lmstudio"}
                      label="LM Studio"
                      onClick={() => setAiSetting("brain", "lmstudio" as Brain)}
                    />
                  </div>
                </Field>

                {s.brain === "mercury" ? (
                  <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs leading-relaxed text-zinc-500">
                    Mercury 2 by Inception Labs — a diffusion LLM that streams fast, progressively
                    refined answers. Runs through the public playground endpoint, so no API key is
                    required.
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
                          {models.length === 0 && <option value="">{s.lmStudioModel || "No models loaded"}</option>}
                          {models.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={refreshModels}
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

              <div className="flex justify-end border-t border-white/[0.06] px-4 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-accent/90 px-3 py-1.5 text-xs font-semibold text-void transition-colors hover:bg-accent"
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

const inputClass =
  "w-full rounded-lg border border-white/10 bg-void px-3 py-2 font-mono text-sm text-zinc-100 outline-none transition-shadow placeholder:text-zinc-500 focus:border-accent/60 focus:ring-2 focus:ring-accent/25";
const selectClass =
  "w-full rounded-lg border border-white/10 bg-void px-3 py-2 text-sm text-zinc-100 outline-none focus:border-accent/60";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

function BrainOption({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-accent/60 bg-accent/15 text-white"
          : "border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}
