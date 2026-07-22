import { useSetting } from "../settings";
import { getIconTheme } from "./registry";
import type { FileIconProps, FolderIconProps } from "./types";

/** File icon rendered with the user's active icon theme. */
export function FileTypeIcon(props: FileIconProps) {
  const themeId = useSetting("iconTheme");
  const { FileIcon } = getIconTheme(themeId);
  return <FileIcon {...props} />;
}

/** Folder icon rendered with the user's active icon theme. */
export function FolderTypeIcon(props: FolderIconProps) {
  const themeId = useSetting("iconTheme");
  const { FolderIcon } = getIconTheme(themeId);
  return <FolderIcon {...props} />;
}

export { iconThemes, getIconTheme } from "./registry";
export type { IconTheme } from "./types";
