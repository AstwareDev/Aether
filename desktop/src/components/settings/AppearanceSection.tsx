import { Suspense, lazy, useId } from "react";
import {
  EDITOR_FONT_SIZE_RANGE,
  SETTINGS_DEFAULTS,
  SIDEBAR_WIDTH_RANGE,
  setSetting,
  useSetting,
} from "../../lib/settings";
import { iconThemes } from "../../lib/icons/registry";
import {
  Field,
  Group,
  OptionCard,
  SegmentedControl,
  Select,
  SettingRow,
  Slider,
  Toggle,
  buttonClass,
} from "./primitives";
import type { EditorLineNumbers, LayoutMode } from "../../types";

// Monaco is heavy; the preview loads only once Appearance is opened.
const EditorPreview = lazy(() => import("./EditorPreview"));

const LAYOUT_OPTIONS: { id: LayoutMode; label: string; description: string }[] = [
  { id: "aether", label: "Aether", description: "Activity bar at the top of the sidebar." },
  { id: "vscode", label: "VSCode", description: "Activity bar on the left edge with standard icons." },
  { id: "compact", label: "Compact", description: "VSCode layout with small, compact icons." },
];

const LINE_NUMBER_OPTIONS: { value: EditorLineNumbers; label: string }[] = [
  { value: "on", label: "On" },
  { value: "relative", label: "Relative" },
  { value: "off", label: "Off" },
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
  const iconTheme = useSetting("iconTheme");
  const sidebarWidth = useSetting("sidebarWidth");
  const editorFontFamily = useSetting("editorFontFamily");
  const editorFontSize = useSetting("editorFontSize");
  const editorWordWrap = useSetting("editorWordWrap");
  const editorMinimap = useSetting("editorMinimap");
  const editorLineNumbers = useSetting("editorLineNumbers");

  const fontId = useId();
  const sizeId = useId();
  const iconId = useId();
  const widthId = useId();
  const wrapId = useId();
  const minimapId = useId();

  return (
    <div className="space-y-9">
      <Group label="Editor">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.012] px-4 py-3">
          <div className="grid gap-3 @md:grid-cols-2">
            <Field label="Font" hint="Installed fonts only — Aether can't install one for you." htmlFor={fontId}>
              <Select
                id={fontId}
                value={editorFontFamily}
                onChange={(value) => setSetting("editorFontFamily", value)}
                options={COMMON_FONTS.map((font) => ({
                  value: font,
                  label: font.split(",")[0].replace(/['"]/g, ""),
                }))}
              />
            </Field>
            <Field label="Size" htmlFor={sizeId}>
              <Slider
                id={sizeId}
                value={editorFontSize}
                min={EDITOR_FONT_SIZE_RANGE.min}
                max={EDITOR_FONT_SIZE_RANGE.max}
                onChange={(value) => setSetting("editorFontSize", value)}
                label="Editor font size"
                format={(v) => `${v}px`}
              />
            </Field>
          </div>

        </div>

        <SettingRow
          label="Word wrap"
          description="Wrap long lines to the width of the editor instead of scrolling sideways."
          htmlFor={wrapId}
          control={
            <Toggle
              id={wrapId}
              checked={editorWordWrap}
              onChange={(value) => setSetting("editorWordWrap", value)}
              label="Word wrap"
            />
          }
        />

        <SettingRow
          label="Minimap"
          description="Show a scaled overview of the file along the right edge."
          htmlFor={minimapId}
          control={
            <Toggle
              id={minimapId}
              checked={editorMinimap}
              onChange={(value) => setSetting("editorMinimap", value)}
              label="Minimap"
            />
          }
        />

        <SettingRow
          label="Line numbers"
          description="Relative numbers count from the cursor, which suits keyboard-driven jumps."
          control={
            <SegmentedControl
              value={editorLineNumbers}
              onChange={(value) => setSetting("editorLineNumbers", value)}
              options={LINE_NUMBER_OPTIONS}
              label="Line numbers"
            />
          }
        />

        <Suspense
          fallback={<div className="h-[297px] rounded-lg border border-white/[0.06] bg-abyss" />}
        >
          <EditorPreview />
        </Suspense>
      </Group>

      <Group label="Interface">
        <SettingRow label="File icons" description="Icon set used across the explorer and tabs." htmlFor={iconId}>
          <Select
            id={iconId}
            value={iconTheme}
            onChange={(value) => setSetting("iconTheme", value)}
            options={iconThemes.map((theme) => ({ value: theme.id, label: theme.label }))}
          />
        </SettingRow>

        <SettingRow
          label="Sidebar width"
          description="Drag the sidebar edge, or set it here."
          htmlFor={widthId}
          control={
            sidebarWidth === SETTINGS_DEFAULTS.sidebarWidth ? undefined : (
              <button
                type="button"
                onClick={() => setSetting("sidebarWidth", SETTINGS_DEFAULTS.sidebarWidth)}
                className={buttonClass}
              >
                Reset
              </button>
            )
          }
        >
          <Slider
            id={widthId}
            value={sidebarWidth}
            min={SIDEBAR_WIDTH_RANGE.min}
            max={SIDEBAR_WIDTH_RANGE.max}
            step={2}
            onChange={(value) => setSetting("sidebarWidth", value)}
            label="Sidebar width"
            format={(v) => `${v}px`}
          />
        </SettingRow>
      </Group>

      <Group label="Layout">
        <div role="radiogroup" aria-label="Sidebar layout" className="flex flex-col gap-2">
          {LAYOUT_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.id}
              selected={layoutMode === opt.id}
              onSelect={() => setSetting("layoutMode", opt.id)}
              title={opt.label}
              description={opt.description}
              visual={<LayoutPreview mode={opt.id} active={layoutMode === opt.id} />}
            />
          ))}
        </div>
      </Group>
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
