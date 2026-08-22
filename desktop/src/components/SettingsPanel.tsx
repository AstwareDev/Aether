import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import AppearanceSection from "./settings/AppearanceSection";
import ExplorerSection from "./settings/ExplorerSection";
import SourceControlSection from "./settings/SourceControlSection";
import { SETTINGS_SECTIONS, settingsSectionMeta } from "../lib/settings";
import { SectionIcon } from "../icons";
import { CloseGlyph } from "../icons";
import { useFocusTrap } from "../lib/useFocusTrap";
import type { SettingsPanelProps } from "../types";

export default function SettingsPanel({ open, section, onSelectSection, onClose }: SettingsPanelProps) {
  const meta = settingsSectionMeta(section);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onMouseDown={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            initial={{ opacity: 0, scale: 0.985, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="relative flex h-full max-h-[720px] w-full max-w-[980px] overflow-hidden rounded-xl border border-white/[0.07] bg-abyss shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
          >
            <nav
              aria-label="Settings sections"
              className="flex w-[208px] shrink-0 flex-col gap-1 border-r border-white/[0.05] bg-panel p-3"
            >
              <p className="px-2.5 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Settings
              </p>
              {SETTINGS_SECTIONS.map(({ id, label }) => {
                const active = section === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => onSelectSection(id)}
                    className={`focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                      active ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                    }`}
                  >
                    <SectionIcon section={id} />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </nav>

            <section className="flex min-w-0 flex-1 flex-col bg-canvas">
              <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.05] px-5">
                <h1 id="settings-title" className="truncate text-sm font-medium text-zinc-200">
                  {meta.label}
                </h1>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close settings"
                  className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
                >
                  <CloseGlyph size={12} />
                </button>
              </header>

              <div className="scroll-thin @container min-h-0 flex-1 overflow-y-auto">
                <motion.div
                  key={section}
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.12 }}
                  className="mx-auto w-full max-w-[760px] px-5 py-6 @lg:px-8"
                >
                  <p className="mb-7 max-w-[62ch] text-[12px] leading-relaxed text-zinc-400">
                    {meta.description}
                  </p>

                  {section === "appearance" && <AppearanceSection />}
                  {section === "explorer" && <ExplorerSection />}
                  {section === "source-control" && <SourceControlSection />}
                </motion.div>
              </div>
            </section>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
