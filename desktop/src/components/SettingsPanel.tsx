import { motion } from "motion/react";
import AppearanceSection from "./settings/AppearanceSection";
import ProvidersSection from "./settings/ProvidersSection";
import RoutingSection from "./settings/RoutingSection";
import ToolsSection from "./settings/ToolsSection";
import { settingsSectionMeta } from "../lib/settings";
import type { SettingsPanelProps } from "../types";

export default function SettingsPanel({ section }: SettingsPanelProps) {
  const meta = settingsSectionMeta(section);

  return (
    <section aria-labelledby="settings-title" className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex h-7 shrink-0 items-center gap-1 border-b border-white/[0.05] px-3 text-[12px] text-zinc-500">
        <span>Settings</span>
        <span aria-hidden className="text-zinc-700">
          ›
        </span>
        <h1 id="settings-title" className="truncate font-medium text-zinc-300">
          {meta.label}
        </h1>
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
          {section === "models" && <ProvidersSection />}
          {section === "ai-tools" && <ToolsSection />}
          {section === "ai-config" && <RoutingSection />}
        </motion.div>
      </div>
    </section>
  );
}
