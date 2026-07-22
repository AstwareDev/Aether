import { flowTheme } from "./flow";
import { symbolsTheme } from "./symbols";
import type { IconTheme } from "./types";

/** All selectable file-icon themes, in picker order. */
export const iconThemes: IconTheme[] = [flowTheme, symbolsTheme];

export function getIconTheme(id: string): IconTheme {
  return iconThemes.find((t) => t.id === id) ?? flowTheme;
}
