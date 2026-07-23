import { aetherTheme } from "./aether";
import { symbolsTheme } from "./symbols";
import type { IconTheme, FileIconProps } from "./types";
import type { ComponentType } from "react";

export const iconThemes: IconTheme[] = [aetherTheme, symbolsTheme];

export function getIconTheme(id: string): IconTheme {
  return iconThemes.find((t) => t.id === id) ?? aetherTheme;
}

export function getIconForFile(_fileName: string): ComponentType<FileIconProps> {
  return aetherTheme.FileIcon;
}
