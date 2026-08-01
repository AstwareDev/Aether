import { useEffect, useState } from "react";
import { baseName, extensionOf, readFileBase64 } from "../lib/fs";

interface ImageViewerProps {
  path: string;
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

export default function ImageViewer({ path }: ImageViewerProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // The asset protocol is not enabled, so bytes arrive through the Rust
  // command and become a blob URL.
  useEffect(() => {
    let revoked = false;
    let objectUrl = "";
    setSize(null);

    readFileBase64(path)
      .then((b64) => {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const type = MIME[extensionOf(path)] ?? "application/octet-stream";
        objectUrl = URL.createObjectURL(new Blob([bytes], { type }));
        if (revoked) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 bg-canvas px-6 text-center">
        <p className="text-sm text-zinc-400">Can’t open {baseName(path)}</p>
        <p className="max-w-md text-xs text-zinc-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="scroll-thin flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        {url && (
          <img
            src={url}
            alt={baseName(path)}
            draggable={false}
            onLoad={(e) =>
              setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-white/[0.05] px-4 py-1.5 text-[11px] text-zinc-500">
        <span className="truncate font-mono">{baseName(path)}</span>
        {size && (
          <span className="ml-auto shrink-0 font-mono">
            {size.w} × {size.h}
          </span>
        )}
      </div>
    </div>
  );
}
