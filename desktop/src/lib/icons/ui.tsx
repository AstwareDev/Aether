import {
  FluentFiles,
  FluentSearch,
  FluentScm,
  FluentExtensions,
  FluentSettings,
  FluentNewFile,
  FluentNewFolder,
  FluentRefresh,
  FluentCollapseAll,
  FluentGoToFile,
  FluentError,
  FluentWarning,
  FluentSync,
  FluentBot,
  FluentSidebarLeft,
  FluentSplitVertical,
  FluentTrash,
  FluentEditorLayout,
  FluentTerminal,
  FluentAdd,
} from "@react-symbols/icons/fluent";
import type { UIIconProps, SvgComp } from "../../types";

// The Fluent set is monochrome (currentColor), so color follows CSS `color`
// (Tailwind text-*). We normalize sizing behind a small wrapper.

function make(Icon: SvgComp) {
  return function UIIcon({ size = 16, className }: UIIconProps) {
    return <Icon width={size} height={size} style={{ width: size, height: size }} className={className} />;
  };
}

export const FilesIcon = make(FluentFiles);
export const SearchIcon = make(FluentSearch);
export const ScmIcon = make(FluentScm);
export const ExtensionsIcon = make(FluentExtensions);
export const SettingsIcon = make(FluentSettings);
export const NewFileIcon = make(FluentNewFile);
export const NewFolderIcon = make(FluentNewFolder);
export const RefreshIcon = make(FluentRefresh);
export const CollapseAllIcon = make(FluentCollapseAll);
export const GoToFileIcon = make(FluentGoToFile);
export const ErrorIcon = make(FluentError);
export const WarningIcon = make(FluentWarning);
export const SyncIcon = make(FluentSync);
export const BotIcon = make(FluentBot);
export const SidebarIcon = make(FluentSidebarLeft);
export const TerminalIcon = make(FluentTerminal);
export const AddIcon = make(FluentAdd);
export const SplitIcon = make(FluentSplitVertical);
export const TrashIcon = make(FluentTrash);
export const LayoutIcon = make(FluentEditorLayout);
