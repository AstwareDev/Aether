import { useEffect, useState } from "react";
import { baseName, extensionOf, readFileBase64 } from "../lib/fs";

interface PdfViewerProps {
  path: string;
}

export default function PdfViewer({ path }: PdfViewerProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The asset protocol is not enabled, so the bytes come through the Rust
  // command and become a blob URL the webview's PDF plugin can load.
  useEffect(() => {
    let revoked = false;
    let objectUrl = "";

    readFileBase64(path)
      .then((b64) => {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
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

  if (!url) return <div className="h-full w-full bg-canvas" />;

  return (
    <object data={url} type="application/pdf" aria-label={baseName(path)} className="h-full w-full bg-canvas">
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-sm text-zinc-400">No PDF viewer available</p>
        <p className="text-xs text-zinc-500">
          This webview can’t render .{extensionOf(path)} files inline.
        </p>
      </div>
    </object>
  );
}
