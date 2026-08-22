import { useId } from "react";
import { SCM_VIEW_LABELS, setSetting, useSetting } from "../../lib/settings";
import { Group, Select, SegmentedControl, SettingRow } from "./primitives";
import type { ScmView } from "../../types";

const VIEW_OPTIONS = (Object.keys(SCM_VIEW_LABELS) as ScmView[]).map((value) => ({
  value,
  label: SCM_VIEW_LABELS[value],
}));

export default function SourceControlSection() {
  const switcher = useSetting("scmViewSwitcher");
  const defaultView = useSetting("scmDefaultView");

  const defaultViewId = useId();

  return (
    <div className="space-y-9">
      <Group
        label="Views"
        footnote="Changes, History, and Agent Review share one pane. The switcher decides how you move between them."
      >
        <SettingRow
          label="View switcher"
          description="A single dropdown keeps the header compact; tabs put all three views one click away."
          control={
            <SegmentedControl
              value={switcher}
              onChange={(value) => setSetting("scmViewSwitcher", value)}
              options={[
                { value: "dropdown", label: "Dropdown" },
                { value: "tabs", label: "Tabs" },
              ]}
              label="View switcher"
            />
          }
        />

        <SettingRow
          label="Default view"
          description="Which view the Source Control panel opens on."
          htmlFor={defaultViewId}
          control={
            <div className="w-44">
              <Select
                id={defaultViewId}
                value={defaultView}
                onChange={(value) => setSetting("scmDefaultView", value)}
                options={VIEW_OPTIONS}
                label="Default view"
              />
            </div>
          }
        />
      </Group>
    </div>
  );
}
