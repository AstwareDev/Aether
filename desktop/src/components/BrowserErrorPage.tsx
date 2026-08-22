import { ErrorIcon, ExternalLinkIcon, RefreshIcon } from "../lib/icons/ui";
import type { BrowserErrorPageProps } from "../types";

/**
 * Shown in place of the page when a URL cannot be reached. WebView2 would
 * otherwise put up its own Edge error page, which looks nothing like the editor
 * and never mentions the thing that is almost always wrong: the dev server is
 * not running yet.
 */
export default function BrowserErrorPage({ url, message, onRetry, onOpenExternally }: BrowserErrorPageProps) {
  const buttonClass =
    "flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-zinc-100";

  return (
    <div className="flex h-full flex-col items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md">
        <span className="text-amber-400">
          <ErrorIcon size={20} />
        </span>
        <h2 className="mt-3 text-sm text-zinc-200">This page didn’t load</h2>
        <p className="mt-1 break-all font-mono text-[11px] text-zinc-500">{url}</p>
        <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">{message}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={onRetry} className={buttonClass}>
            <RefreshIcon size={13} />
            Try again
          </button>
          <button type="button" onClick={onOpenExternally} className={buttonClass}>
            <ExternalLinkIcon size={13} />
            Open in default browser
          </button>
        </div>
      </div>
    </div>
  );
}
