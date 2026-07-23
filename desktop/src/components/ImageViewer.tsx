import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface ImageViewerProps {
  path: string;
}

export default function ImageViewer({ path }: ImageViewerProps) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      setSrc(convertFileSrc(path));
      setError(false);
    } catch {
      setError(true);
    }
  }, [path]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-500">
        <span>Could not preview image</span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-canvas p-4">
      <img
        src={src}
        alt=""
        className="max-h-full max-w-full object-contain"
        draggable={false}
      />
    </div>
  );
}
