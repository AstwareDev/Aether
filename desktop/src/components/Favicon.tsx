import { useEffect, useState } from "react";
import { BrowserIcon } from "../lib/icons/ui";
import type { FaviconProps } from "../types";

/**
 * A browser tab's favicon, falling back to the generic globe when the page has
 * none or the image fails to load. The URL comes from the page itself, so it is
 * only ever used as an `<img>` source.
 */
export default function Favicon({ src, size = 14, className }: FaviconProps) {
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [src]);

  if (!src || broken) return <BrowserIcon size={size} className={className} />;

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-[2px] object-contain ${className ?? ""}`}
    />
  );
}
