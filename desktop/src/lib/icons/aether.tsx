import rawManifest from "../../generated/aetherManifest.json";
import type { FileIconProps, FolderIconProps, IconTheme } from "./types";

interface AetherManifest {
  file: string;
  folder: string;
  folderExpanded: string;
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
}

const F = rawManifest as unknown as AetherManifest;

const BASE = "/icons/aether/";

function fileSvg(name: string): string {
  const lower = name.toLowerCase();
  if (F.fileNames[lower]) return F.fileNames[lower];

  const parts = lower.split(".");
  for (let i = 1; i < parts.length; i++) {
    const ext = parts.slice(i).join(".");
    if (F.fileExtensions[ext]) return F.fileExtensions[ext];
  }
  return F.file;
}

function folderSvg(name: string, open: boolean): string {
  const lower = name.toLowerCase();
  const specific = open ? F.folderNamesExpanded[lower] : F.folderNames[lower];
  if (specific) return specific;
  return open ? F.folderExpanded : F.folder;
}

function AetherFileIcon({ name, size = 16, className }: FileIconProps) {
  return (
    <img
      src={BASE + fileSvg(name)}
      width={size}
      height={size}
      className={className}
      alt=""
      draggable={false}
      style={{ width: size, height: size }}
    />
  );
}

function AetherFolderIcon({ name, open, size = 16, className }: FolderIconProps) {
  return (
    <img
      src={BASE + folderSvg(name, open)}
      width={size}
      height={size}
      className={className}
      alt=""
      draggable={false}
      style={{ width: size, height: size }}
    />
  );
}

export const aetherTheme: IconTheme = {
  id: "aether",
  label: "Aether",
  FileIcon: AetherFileIcon,
  FolderIcon: AetherFolderIcon,
};
