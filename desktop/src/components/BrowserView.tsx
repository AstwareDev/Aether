import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  HomeIcon,
  InspectIcon,
  PickerIcon,
  RefreshIcon,
} from "../lib/icons/ui";
import { isTauri } from "../lib/fs";
import { blankBrowserUrl, isBlankBrowserUrl, normalizeUrl } from "../lib/browser";
import { elementReport } from "../lib/browserReport";
import {
  attachBrowserView,
  browserViewHistory,
  checkUrl,
  closeBrowserInspector,
  copyText,
  inspectorLabelFor,
  isNewView,
  openBrowserInspector,
  navStateFor,
  navigateBrowserView,
  onBrowserSignal,
  paneUiFor,
  recentVisits,
  rememberVisit,
  setBrowserPicker,
  setBrowserViewBounds,
  setBrowserViewVisible,
  viewLabelFor,
} from "../lib/browserHost";
import BrowserErrorPage from "./BrowserErrorPage";
import BrowserStartPage from "./BrowserStartPage";
import type {
  BrowserElement,
  BrowserSignal,
  BrowserViewBounds,
  BrowserViewProps,
} from "../types";

const MIN_DEVTOOLS_WIDTH = 300;

function boundsOf(el: HTMLElement): BrowserViewBounds {
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function sameBounds(a: BrowserViewBounds | null, b: BrowserViewBounds): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Agent Browser, the in-app browser: backed by a real child webview rather
 * than an iframe — pages that set frame-blocking
 * headers (YouTube and most of the web) load normally. The webview is an
 * OS-level layer positioned over `hostRef`, so it has to be hidden whenever
 * something in the React tree would sit on top of it.
 *
 * The inspector is the real DevTools front-end in a second webview of ours,
 * positioned over `devtoolsRef` the same way — the genuine article, and as much
 * a part of the window as the page beside it.
 *
 * Outside Tauri (`pnpm dev` in a plain browser) it degrades to an iframe.
 */
export default function BrowserView({
  viewKey,
  url,
  visible,
  onUrlChange,
  onMetaChange,
}: BrowserViewProps) {
  const label = viewLabelFor(viewKey);
  const hostRef = useRef<HTMLDivElement>(null);
  const devtoolsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // History and pane chrome live outside React so they survive the remount a
  // tab switch causes — the webview and its inspector both outlive it.
  const fresh = isNewView(label);
  const nav = navStateFor(label, url);
  const ui = paneUiFor(label);

  const [stack, setStack] = useState<string[]>(nav.stack);
  const [cursor, setCursor] = useState(nav.cursor);
  const [draft, setDraft] = useState(() => {
    const start = nav.stack[nav.cursor] ?? url;
    return isBlankBrowserUrl(start) ? "" : start;
  });
  const [loading, setLoading] = useState(fresh);
  const [reloadKey, setReloadKey] = useState(0);

  const [devtoolsOpen, setDevtoolsOpen] = useState(ui.devtoolsOpen);
  const [devtoolsWidth, setDevtoolsWidth] = useState(ui.devtoolsWidth);
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  /** Set when the address could not be reached at all, so the pane draws its own failure. */
  const [failure, setFailure] = useState<string | null>(null);

  const current = stack[cursor] ?? url;
  const blank = isBlankBrowserUrl(current);

  // Signals arrive outside React's render cycle, so navigation state is mirrored
  // into refs and read from there.
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const currentRef = useRef(current);
  currentRef.current = current;
  const devtoolsWidthRef = useRef(devtoolsWidth);
  devtoolsWidthRef.current = devtoolsWidth;
  const devtoolsOpenRef = useRef(devtoolsOpen);
  devtoolsOpenRef.current = devtoolsOpen;
  /** Set while a back/forward request is in flight, so the resulting navigation moves the cursor instead of forking history. */
  const pendingDelta = useRef(0);
  /** Guards against a slow reachability check landing after a newer navigation. */
  const checkSeq = useRef(0);

  useEffect(() => {
    nav.stack = stack;
    nav.cursor = cursor;
  }, [nav, stack, cursor]);

  useEffect(() => {
    ui.devtoolsOpen = devtoolsOpen;
    ui.devtoolsWidth = devtoolsWidth;
  }, [ui, devtoolsOpen, devtoolsWidth]);

  useEffect(() => {
    setDraft(isBlankBrowserUrl(current) ? "" : current);
    onUrlChange?.(current);
  }, [current, onUrlChange]);

  useEffect(() => {
    verifyReachable(current);
    // `verifyReachable` is stable; `current` is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // ── native view lifecycle ───────────────────────────────────────────

  useLayoutEffect(() => {
    // Nothing to position over while the start or error page is up.
    if (!isTauri || blank || failure) return;
    let attached = false;
    let lastBounds: BrowserViewBounds | null = null;

    const sync = (force = false) => {
      const el = hostRef.current;
      if (!el) return;
      const next = boundsOf(el);
      if (!visible || next.width < 2 || next.height < 2) {
        if (attached) void setBrowserViewVisible(label, false);
        lastBounds = null;
        return;
      }
      if (!force && sameBounds(lastBounds, next)) return;
      lastBounds = next;
      if (attached) {
        void setBrowserViewBounds(label, next).then(() => setBrowserViewVisible(label, true));
      } else {
        attached = true;
        void attachBrowserView(label, currentRef.current, next).catch(() => {
          attached = false;
          lastBounds = null;
        });
      }
    };

    sync(true);

    // Position changes (sidebar drag, terminal toggle) do not always resize the
    // host element, so poll alongside the observer — comparing rects is cheap
    // and only a real change reaches the backend.
    const observer = new ResizeObserver(() => sync());
    if (hostRef.current) observer.observe(hostRef.current);
    const poll = window.setInterval(() => sync(), 200);
    const onResize = () => sync(true);
    window.addEventListener("resize", onResize);

    return () => {
      observer.disconnect();
      window.clearInterval(poll);
      window.removeEventListener("resize", onResize);
      // The view outlives this component so the page survives a tab switch;
      // Workspace closes it when the tab itself is closed.
      void setBrowserViewVisible(label, false);
    };
  }, [label, visible, blank, failure]);

  // ── inspector ───────────────────────────────────────────────────────
  // The real DevTools front-end, in a webview of our own — so it is positioned
  // over its placeholder exactly like the page is, and is as much a part of the
  // window as any other pane.

  useLayoutEffect(() => {
    if (!isTauri || !devtoolsOpen) return;
    const view = inspectorLabelFor(label);
    let opened = false;
    let dropped = false;
    let lastBounds: BrowserViewBounds | null = null;

    const sync = (force = false) => {
      const el = devtoolsRef.current;
      if (!el || dropped) return;
      const next = boundsOf(el);
      if (!visible || blank || failure || next.width < 2 || next.height < 2) {
        if (opened) void setBrowserViewVisible(view, false);
        lastBounds = null;
        return;
      }
      if (!force && sameBounds(lastBounds, next)) return;
      lastBounds = next;
      if (opened) {
        // Still opening on the first few passes, so a miss here is expected.
        void setBrowserViewBounds(view, next)
          .then(() => setBrowserViewVisible(view, true))
          .catch(() => {});
        return;
      }
      opened = true;
      void openBrowserInspector(label, next)
        .then((ok) => {
          if (ok || dropped) return;
          // Nothing to reserve room for if there is no page to inspect.
          dropped = true;
          setDevtoolsOpen(false);
        })
        .catch(() => {
          opened = false;
          lastBounds = null;
        });
    };

    sync(true);

    const observer = new ResizeObserver(() => sync());
    if (devtoolsRef.current) observer.observe(devtoolsRef.current);
    const poll = window.setInterval(() => sync(), 200);
    const onResize = () => sync(true);
    window.addEventListener("resize", onResize);

    return () => {
      dropped = true;
      observer.disconnect();
      window.clearInterval(poll);
      window.removeEventListener("resize", onResize);
      // Stays open but hidden, so switching back to this tab brings the
      // inspector back exactly as it was.
      void setBrowserViewVisible(view, false);
    };
  }, [label, devtoolsOpen, visible, blank, failure]);

  const toggleDevtools = useCallback(() => {
    const next = !devtoolsOpenRef.current;
    devtoolsOpenRef.current = next;
    setDevtoolsOpen(next);
    if (!next) void closeBrowserInspector(label);
  }, [label]);

  // ── probe signals ───────────────────────────────────────────────────

  const recordNavigation = useCallback((next: string) => {
    setLoading(false);
    const prev = stackRef.current;
    const at = cursorRef.current;
    if (prev[at] === next) return;

    const delta = pendingDelta.current;
    if (delta !== 0) {
      pendingDelta.current = 0;
      const target = at + delta;
      if (prev[target] === next) {
        cursorRef.current = target;
        setCursor(target);
        return;
      }
    }

    const forked = [...prev.slice(0, at + 1), next];
    stackRef.current = forked;
    cursorRef.current = forked.length - 1;
    setStack(forked);
    setCursor(forked.length - 1);
  }, []);

  // `applySignal` is memoised on `onMetaChange` alone, so the copy action is
  // reached through a ref rather than widening its dependencies.
  const copyRef = useRef<(target: BrowserElement) => void>(() => {});

  const applySignal = useCallback(
    (event: BrowserSignal) => {
      switch (event.t) {
        case "newdoc":
          setPicking(false);
          break;
        case "inspect":
          setPicking(!!event.active);
          break;
        case "pick": {
          const { t: _kind, time: _time, ...node } = event;
          setPicking(false);
          // The picker exists to hand the element to an agent, so copying is
          // the action rather than a step that follows it.
          copyRef.current(node);
          break;
        }
        case "meta":
          if (!isBlankBrowserUrl(String(event.url))) {
            rememberVisit({
              url: String(event.url),
              title: String(event.title ?? ""),
              icon: event.icon ? String(event.icon) : undefined,
            });
          }
          onMetaChange?.({
            url: String(event.url),
            title: String(event.title ?? ""),
            icon: event.icon ? String(event.icon) : null,
          });
          break;
      }
    },
    [onMetaChange],
  );

  useEffect(() => {
    if (!isTauri) return;
    return onBrowserSignal(label, (events) => {
      for (const event of events) {
        // `nav` comes from the host, everything else from the injected probe.
        if (event.t === "nav") {
          recordNavigation(String(event.url));
          continue;
        }
        // The page ran our script, so whatever the reachability check thought,
        // it is loaded.
        if (event.t === "newdoc" || event.t === "meta") {
          setFailure(null);
          recordNavigation(String(event.url));
        }
        applySignal(event);
      }
    });
  }, [label, applySignal, recordNavigation]);

  // ── actions ─────────────────────────────────────────────────────────

  /**
   * Reports a failure only if the page has not meanwhile loaded — a site can be
   * perfectly fine while refusing our probe, so the check never overrides
   * evidence that the page is alive.
   */
  const verifyReachable = useCallback((target: string) => {
    if (!isTauri || isBlankBrowserUrl(target)) return;
    const attempt = ++checkSeq.current;
    void checkUrl(target)
      .then((result) => {
        if (attempt !== checkSeq.current || result.reachable) return;
        setFailure(result.error || "The address could not be reached.");
        setLoading(false);
      })
      .catch(() => {});
  }, []);

  const navigate = useCallback(
    (next: string) => {
      const target = normalizeUrl(next);
      setLoading(true);
      setFailure(null);

      const at = cursorRef.current;
      const prev = stackRef.current;

      if (!isTauri) {
        if (target === prev[at]) {
          setReloadKey((k) => k + 1);
          return;
        }
        const forked = [...prev.slice(0, at + 1), target];
        setStack(forked);
        setCursor(forked.length - 1);
        return;
      }

      pendingDelta.current = 0;
      verifyReachable(target);

      // Changing `current` makes the layout effect create a webview pointed at
      // the new address. If Home put the start page over a view that already
      // exists, that effect only re-shows it — so the address has to be sent
      // too. Whichever lands first, the view ends up on the target.
      if (isBlankBrowserUrl(prev[at])) {
        const forked = [...prev.slice(0, at + 1), target];
        stackRef.current = forked;
        cursorRef.current = forked.length - 1;
        setStack(forked);
        setCursor(forked.length - 1);
        void navigateBrowserView(label, target).catch(() => {});
        return;
      }

      if (target === prev[at]) void browserViewHistory(label, 0);
      else void navigateBrowserView(label, target);
    },
    [label, verifyReachable],
  );

  const go = useCallback(
    (delta: number) => {
      const prev = stackRef.current;
      const at = cursorRef.current;
      const target = at + delta;
      if (target < 0 || target >= prev.length) return;

      // The start page is ours, not something the webview ever loaded, so its
      // history knows nothing about it. Stepping into or out of it moves our
      // own cursor and leaves that history alone — which keeps the two lined
      // up for the entries that *are* real pages.
      if (isBlankBrowserUrl(prev[at]) || isBlankBrowserUrl(prev[target])) {
        setFailure(null);
        cursorRef.current = target;
        setCursor(target);
        return;
      }

      setLoading(true);
      if (!isTauri) {
        setCursor(target);
        return;
      }
      pendingDelta.current = delta;
      void browserViewHistory(label, delta);
    },
    [label],
  );

  /** Back to the start page, keeping the page behind it reachable with Back. */
  const goHome = useCallback(() => {
    const prev = stackRef.current;
    const at = cursorRef.current;
    if (isBlankBrowserUrl(prev[at])) return;
    setLoading(false);
    setFailure(null);
    const forked = [...prev.slice(0, at + 1), blankBrowserUrl()];
    stackRef.current = forked;
    cursorRef.current = forked.length - 1;
    setStack(forked);
    setCursor(forked.length - 1);
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setFailure(null);
    if (!isTauri) {
      setReloadKey((k) => k + 1);
      return;
    }
    verifyReachable(currentRef.current);
    // Reloads the view if one exists; if the first attempt never created one,
    // clearing `failure` lets the layout effect build it instead.
    void browserViewHistory(label, 0).catch(() => {});
  }, [label, verifyReachable]);

  const copyTimer = useRef(0);
  /** Puts the element on the clipboard as Markdown a coding agent can act on. */
  const copyElement = useCallback((target: BrowserElement) => {
    void copyText(elementReport(target))
      .then(() => {
        setCopied(true);
        window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(false), 2200);
      })
      .catch(() => {});
  }, []);

  copyRef.current = copyElement;

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const onDevtoolsDragStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = devtoolsWidthRef.current;
    const onMove = (move: MouseEvent) => {
      const room = Math.max(MIN_DEVTOOLS_WIDTH, window.innerWidth - 240);
      setDevtoolsWidth(Math.min(room, Math.max(MIN_DEVTOOLS_WIDTH, startWidth + (startX - move.clientX))));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const canGoBack = cursor > 0;
  const canGoForward = cursor < stack.length - 1;
  const showDevtools = isTauri && devtoolsOpen && !blank && !failure;

  const controlClass =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.05] px-2">
        <button type="button" title="Back" aria-label="Back" disabled={!canGoBack} onClick={() => go(-1)} className={controlClass}>
          <ArrowLeftIcon size={15} />
        </button>
        <button type="button" title="Forward" aria-label="Forward" disabled={!canGoForward} onClick={() => go(1)} className={controlClass}>
          <ArrowRightIcon size={15} />
        </button>
        <button type="button" title="Reload" aria-label="Reload" disabled={blank} onClick={reload} className={controlClass}>
          <RefreshIcon size={14} />
        </button>
        <button type="button" title="Home" aria-label="Home" disabled={blank} onClick={goHome} className={controlClass}>
          <HomeIcon size={15} />
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
            placeholder={blank ? "Enter an address" : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDraft(blank ? "" : current);
                inputRef.current?.blur();
              }
            }}
            className="w-full rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 font-mono text-[12px] text-zinc-300 outline-none transition-colors focus:border-accent/40 focus:bg-white/[0.05]"
          />
        </form>

        {copied && (
          <span role="status" className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
            Copied
          </span>
        )}
        {isTauri && !blank && !failure && (
          <>
            <button
              type="button"
              title="Pick an element and copy it for an AI agent"
              aria-label="Pick an element and copy it for an AI agent"
              aria-pressed={picking}
              onClick={() => {
                const next = !picking;
                setPicking(next);
                void setBrowserPicker(label, next);
              }}
              className={`${controlClass} ${picking ? "bg-accent/20 text-accent" : ""}`}
            >
              <PickerIcon size={14} />
            </button>
            <button
              type="button"
              title="Toggle developer tools"
              aria-label="Toggle developer tools"
              aria-pressed={devtoolsOpen}
              onClick={toggleDevtools}
              className={`${controlClass} ${devtoolsOpen ? "bg-white/[0.07] text-zinc-200" : ""}`}
            >
              <InspectIcon size={14} />
            </button>
          </>
        )}
        <button
          type="button"
          title="Open in default browser"
          aria-label="Open in default browser"
          disabled={blank}
          onClick={() => void import("@tauri-apps/plugin-opener").then((m) => m.openUrl(current))}
          className={controlClass}
        >
          <ExternalLinkIcon size={14} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          {loading && !blank && !failure && (
            <div className="absolute inset-x-0 top-0 z-10 h-[2px] animate-pulse bg-accent/40" />
          )}
          {blank ? (
            <BrowserStartPage recents={recentVisits()} onNavigate={navigate} />
          ) : failure ? (
            <BrowserErrorPage
              url={current}
              message={failure}
              onRetry={reload}
              onOpenExternally={() => void import("@tauri-apps/plugin-opener").then((m) => m.openUrl(current))}
            />
          ) : isTauri ? (
            // Placeholder the native webview is positioned over.
            <div ref={hostRef} className="h-full w-full bg-white" />
          ) : (
            <iframe
              key={`${current}#${reloadKey}`}
              src={current}
              title={current}
              onLoad={() => setLoading(false)}
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              className="h-full w-full border-0 bg-white"
            />
          )}
        </div>

        {showDevtools && (
          <div className="flex shrink-0 border-l border-white/[0.06]" style={{ width: devtoolsWidth }}>
            <div
              onMouseDown={onDevtoolsDragStart}
              role="separator"
              aria-orientation="vertical"
              className="w-1 shrink-0 cursor-col-resize hover:bg-white/[0.08]"
            />
            {/* Placeholder the inspector webview is positioned over. */}
            <div ref={devtoolsRef} className="min-w-0 flex-1 bg-[#242424]" />
          </div>
        )}
      </div>
    </div>
  );
}
