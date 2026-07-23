import { useCallback, useEffect, useRef, useState } from "react";
import {
  extensionOf,
  readFileBase64,
  readFileText,
  writeFileBase64,
  writeFileText,
} from "../lib/fs";

const EMBED_URL =
  "https://embed.diagrams.net/?embed=1&ui=atlas&spin=1&modified=unsavedChanges&proto=json&lang=en";

const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Aether">
  <diagram name="Page-1" id="aether-init">
    <mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

function extractXmlFromSvg(svg: string): string | null {
  const m = svg.match(/<mxfile[^>]*>[\s\S]*?<\/mxfile>/i);
  if (m) return m[0];

  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "text/xml");
  const fo = doc.querySelector("foreignObject");
  if (fo) {
    const inner = fo.innerHTML.match(/<mxfile[^>]*>[\s\S]*?<\/mxfile>/i);
    if (inner) return inner[0];
    const div = fo.querySelector("[data-content]");
    if (div) {
      try {
        return atob(div.getAttribute("data-content") || "");
      } catch { /* ignore */ }
    }
  }
  return null;
}

async function extractXmlFromPng(base64: string): Promise<string | null> {
  const raw = base64.includes("base64,") ? base64.split("base64,")[1] : base64;
  try {
    const bin = atob(raw);
    let off = 8;
    while (off < bin.length) {
      const len =
        (bin.charCodeAt(off) << 24) |
        (bin.charCodeAt(off + 1) << 16) |
        (bin.charCodeAt(off + 2) << 8) |
        bin.charCodeAt(off + 3);
      off += 4;
      const type = bin.slice(off, off + 4);
      off += 4;
      const data = bin.slice(off, off + len);
      off += len + 4;
      if (type === "tEXt") {
        const nullIdx = data.indexOf("\0");
        const kw = data.slice(0, nullIdx);
        const txt = data.slice(nullIdx + 1);
        if (kw === "mxfile" || kw === "drawio-config")
          return decodeURIComponent(escape(txt));
      }
      if (type === "IEND") break;
    }
  } catch { /* ignore */ }
  return null;
}

interface DrawioEditorProps {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
}

export default function DrawioEditor({ path, onDirtyChange }: DrawioEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const readyRef = useRef(false);
  const pendingXmlRef = useRef<string | null>(null);
  const savedXmlRef = useRef<string>("");
  const pathRef = useRef(path);
  pathRef.current = path;

  const doSave = useCallback(
    async (xml: string) => {
      const ext = extensionOf(pathRef.current);
      try {
        if (ext === "drawio") {
          await writeFileText(pathRef.current, xml);
        } else if (ext === "svg") {
          const w = iframeRef.current?.contentWindow;
          if (w)
            w.postMessage(
              JSON.stringify({
                action: "export",
                format: "svg",
                xml,
                spin: "Exporting SVG…",
              }),
              "*",
            );
          else throw new Error("Editor not ready");
        } else if (ext === "png") {
          const w = iframeRef.current?.contentWindow;
          if (w)
            w.postMessage(
              JSON.stringify({
                action: "export",
                format: "png",
                xml,
                spin: "Exporting PNG…",
              }),
              "*",
            );
          else throw new Error("Editor not ready");
        }
        savedXmlRef.current = xml;
        onDirtyChange?.(false);
      } catch (err) {
        setError(`Save failed: ${err}`);
      }
    },
    [onDirtyChange],
  );

  const loadFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ext = extensionOf(path);
      let xml: string | null = null;

      if (ext === "drawio") {
        const text = await readFileText(path);
        xml = text.trim() || EMPTY_DIAGRAM;
      } else if (ext === "svg") {
        const svg = await readFileText(path);
        xml = extractXmlFromSvg(svg);
        if (!xml) throw new Error("No embedded drawio data found in SVG");
      } else if (ext === "png") {
        const b64 = await readFileBase64(path);
        xml = await extractXmlFromPng(b64);
        if (!xml) throw new Error("No embedded drawio data found in PNG");
      } else {
        throw new Error(`Unsupported: .${ext}`);
      }

      savedXmlRef.current = xml;
      pendingXmlRef.current = xml;

      if (readyRef.current && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ action: "load", xml, autosave: 1, modified: "unsavedChanges" }),
          "*",
        );
        pendingXmlRef.current = null;
        setLoading(false);
      }
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    loadFile();
  }, [loadFile]);

  // Store latest XML when file changes so we can re-send after iframe init
  const reloadCountRef = useRef(0);
  const currentKey = path;
  useEffect(() => {
    reloadCountRef.current++;
  }, [currentKey]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === "init") {
          readyRef.current = true;
          const pending = pendingXmlRef.current;
          if (pending && iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({
                action: "load",
                xml: pending,
                autosave: 1,
                modified: "unsavedChanges",
              }),
              "*",
            );
            pendingXmlRef.current = null;
            setLoading(false);
          }
        } else if (msg.event === "save") {
          void doSave(msg.xml);
        } else if (msg.event === "autosave") {
          if (msg.xml !== savedXmlRef.current) onDirtyChange?.(true);
        } else if (msg.event === "export") {
          (async () => {
            try {
              if (msg.format === "svg") {
                await writeFileText(pathRef.current, msg.data);
              } else if (msg.format === "png") {
                const b64 = msg.data.includes("base64,")
                  ? msg.data.split("base64,")[1]
                  : msg.data;
                await writeFileBase64(pathRef.current, b64);
              }
              onDirtyChange?.(false);
            } catch (err) {
              setError(`Export write failed: ${err}`);
            }
          })();
        } else if (msg.event === "exit") {
          // user closed the editor — noop
        }
      } catch { /* not a JSON message */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [doSave, onDirtyChange]);

  return (
    <div className="relative h-full w-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-canvas text-sm text-zinc-500">
          Loading draw.io editor…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-canvas px-6 text-center">
          <p className="text-sm text-zinc-400">Could not open diagram</p>
          <p className="max-w-md text-xs text-zinc-500">{error}</p>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={EMBED_URL}
        className="h-full w-full border-0"
        title="draw.io"
        allow="fullscreen"
      />
    </div>
  );
}
