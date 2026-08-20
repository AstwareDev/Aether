import { useId } from "react";
import { setSetting, useSetting } from "../../lib/settings";
import { Group, SettingRow, Toggle } from "./primitives";

export default function ExplorerSection() {
  const compactFolders = useSetting("explorerCompactFolders");
  const autoReveal = useSetting("explorerAutoReveal");
  const gitDecorations = useSetting("explorerGitDecorations");
  const openEditors = useSetting("explorerOpenEditors");

  const compactId = useId();
  const revealId = useId();
  const decorationsId = useId();
  const openEditorsId = useId();

  return (
    <div className="space-y-9">
      <Group label="File tree">
        <SettingRow
          label="Compact folders"
          description="Collapse a folder that holds nothing but one subfolder into a single row."
          htmlFor={compactId}
          control={
            <Toggle
              id={compactId}
              checked={compactFolders}
              onChange={(value) => setSetting("explorerCompactFolders", value)}
              label="Compact folders"
            />
          }
        />

        <SettingRow
          label="Reveal the open file"
          description="Expand and scroll to the active editor's file as you move between tabs."
          htmlFor={revealId}
          control={
            <Toggle
              id={revealId}
              checked={autoReveal}
              onChange={(value) => setSetting("explorerAutoReveal", value)}
              label="Reveal the open file"
            />
          }
        />

        <SettingRow
          label="Git decorations"
          description="Colour changed files and mark folders that contain them."
          htmlFor={decorationsId}
          control={
            <Toggle
              id={decorationsId}
              checked={gitDecorations}
              onChange={(value) => setSetting("explorerGitDecorations", value)}
              label="Git decorations"
            />
          }
        />
      </Group>

      <Group label="Open Editors">
        <SettingRow
          label="Show the Open Editors list"
          description="A collapsible list of every open tab above the file tree."
          htmlFor={openEditorsId}
          control={
            <Toggle
              id={openEditorsId}
              checked={openEditors}
              onChange={(value) => setSetting("explorerOpenEditors", value)}
              label="Show the Open Editors list"
            />
          }
        />
      </Group>
    </div>
  );
}
