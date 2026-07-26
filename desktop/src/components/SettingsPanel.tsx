import { motion } from "motion/react";
import AppearanceSection from "./settings/AppearanceSection";
import ProvidersSection from "./settings/ProvidersSection";
import RoutingSection from "./settings/RoutingSection";
import ToolsSection from "./settings/ToolsSection";
import type { SettingsPanelProps } from "../types";

export default function SettingsPanel({ section }: SettingsPanelProps) {
  return (
    <div className="scroll-thin h-full overflow-y-auto bg-canvas p-8">
      <motion.div
        key={section}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="mx-auto max-w-2xl"
      >
        {section === "appearance" && <AppearanceSection />}
        {section === "models" && <ProvidersSection />}
        {section === "ai-tools" && <ToolsSection />}
        {section === "ai-config" && <RoutingSection />}
      </motion.div>
    </div>
  );
}
