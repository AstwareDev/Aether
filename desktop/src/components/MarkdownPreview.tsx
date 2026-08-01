import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { hydrateImages } from "../lib/markdown/images";
import { renderDocument } from "../lib/markdown/render";
import "../styles/markdown.css";

interface MarkdownPreviewProps {
  path: string;
  content: string;
}

export default function MarkdownPreview({ path, content }: MarkdownPreviewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");

  useEffect(() => {
    // A markdown file is untrusted input and the app runs without a CSP, so
    // raw HTML in the document is sanitized before it reaches the DOM.
    setHtml(DOMPurify.sanitize(renderDocument(content)));
  }, [content]);

  useEffect(() => {
    const host = bodyRef.current;
    if (!host || !html) return;
    let cancelled = false;
    void hydrateImages(host, path).catch(() => {
      if (!cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [html, path]);

  return (
    <div className="scroll-thin h-full overflow-auto bg-canvas">
      <div
        ref={bodyRef}
        className="aether-md mx-auto max-w-3xl px-8 py-10"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
