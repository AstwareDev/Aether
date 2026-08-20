import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  RefreshIcon,
} from "../lib/icons/ui";
import { normalizeUrl } from "../lib/browser";
import type { BrowserViewProps } from "../types";

/**
 * A minimal in-app browser, in the spirit of VS Code's Simple Browser. The page
 * runs in an iframe, which is cross-origin for anything but a local dev server,
 * so history is tracked here rather than read back from the frame.
 */
export default function BrowserView({ url, onUrlChange }: BrowserViewProps) {
  const [history, setHistory] = useState<string[]>([url]);
  const [cursor, setCursor] = useState(0);
  const [draft, setDraft] = useState(url);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = history[cursor];

  useEffect(() => {
    setDraft(current);
    setLoading(true);
    onUrlChange?.(current);
  }, [current, onUrlChange]);

  const navigate = useCallback(
    (next: string) => {
      const target = normalizeUrl(next);
      setLoading(true);
      if (target === history[cursor]) {
        setReloadKey((k) => k + 1);
        return;
      }
      const forked = [...history.slice(0, cursor + 1), target];
      setHistory(forked);
      setCursor(forked.length - 1);
    },
    [history, cursor],
  );

  const canGoBack = cursor > 0;
  const canGoForward = cursor < history.length - 1;

  const controlClass =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.05] px-2">
        <button
          type="button"
          title="Back"
          aria-label="Back"
          disabled={!canGoBack}
          onClick={() => setCursor((c) => Math.max(0, c - 1))}
          className={controlClass}
        >
          <ArrowLeftIcon size={15} />
        </button>
        <button
          type="button"
          title="Forward"
          aria-label="Forward"
          disabled={!canGoForward}
          onClick={() => setCursor((c) => Math.min(history.length - 1, c + 1))}
          className={controlClass}
        >
          <ArrowRightIcon size={15} />
        </button>
        <button
          type="button"
          title="Reload"
          aria-label="Reload"
          onClick={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
          className={controlClass}
        >
          <RefreshIcon size={14} />
        </button>

        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(draft);
            inputRef.current?.blur();
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            spellCheck={false}
            aria-label="Address"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDraft(current);
                inputRef.current?.blur();
              }
            }}
            className="w-full rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 font-mono text-[12px] text-zinc-300 outline-none transition-colors focus:border-accent/40 focus:bg-white/[0.05]"
          />
        </form>

        <button
          type="button"
          title="Open in default browser"
          aria-label="Open in default browser"
          onClick={() => void import("@tauri-apps/plugin-opener").then((m) => m.openUrl(current))}
          className={controlClass}
        >
          <ExternalLinkIcon size={14} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {loading && <div className="absolute inset-x-0 top-0 h-[2px] animate-pulse bg-accent/40" />}
        <iframe
          key={`${current}#${reloadKey}`}
          src={current}
          title={current}
          onLoad={() => setLoading(false)}
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          className="h-full w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
