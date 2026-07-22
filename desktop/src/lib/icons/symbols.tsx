import { lazy, Suspense, type ComponentType } from "react";
import type { FileIconProps, FolderIconProps, IconTheme } from "./types";

// The Symbols set ships ~640 KB of SVG components. It's opt-in, so we split it
// into its own chunk that's only fetched once the user selects this theme.
const LazyFile = lazy(async () => {
  const { getIconForFile } = await import("@react-symbols/icons/utils");
  const Comp: ComponentType<{ name: string; size?: number }> = ({ name, size = 16 }) => (
    <>{getIconForFile({ fileName: name, autoAssign: true, width: size, height: size })}</>
  );
  return { default: Comp };
});

const LazyFolder = lazy(async () => {
  const { getIconForFolder } = await import("@react-symbols/icons/utils");
  const Comp: ComponentType<{ name: string; size?: number }> = ({ name, size = 16 }) => (
    <>{getIconForFolder({ folderName: name, width: size, height: size })}</>
  );
  return { default: Comp };
});

/** Blank placeholder keeps row layout stable while the chunk loads. */
function Blank({ size }: { size: number }) {
  return <span style={{ display: "inline-block", width: size, height: size }} />;
}

function SymbolsFileIcon({ name, size = 16, className }: FileIconProps) {
  return (
    <span className={className} style={{ display: "inline-flex", width: size, height: size }}>
      <Suspense fallback={<Blank size={size} />}>
        <LazyFile name={name} size={size} />
      </Suspense>
    </span>
  );
}

function SymbolsFolderIcon({ name, size = 16, className }: FolderIconProps) {
  // The Symbols matcher has no open/closed variant; the tree's chevron conveys state.
  return (
    <span className={className} style={{ display: "inline-flex", width: size, height: size }}>
      <Suspense fallback={<Blank size={size} />}>
        <LazyFolder name={name} size={size} />
      </Suspense>
    </span>
  );
}

export const symbolsTheme: IconTheme = {
  id: "symbols",
  label: "Symbols",
  FileIcon: SymbolsFileIcon,
  FolderIcon: SymbolsFolderIcon,
};
