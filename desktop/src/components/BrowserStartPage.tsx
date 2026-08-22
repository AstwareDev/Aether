import { useEffect, useRef, useState } from "react";
import { BrowserIcon, SearchIcon } from "../lib/icons/ui";
import { browserLabel } from "../lib/browser";
import Favicon from "./Favicon";
import type { BrowserStartPageProps } from "../types";

const SUGGESTED_PORTS = [3000, 5173, 8080, 4200];

/**
 * What a pane shows before anything is loaded. A browser tab that opens onto a
 * dev server nobody asked for is a surprise, so a new pane starts empty and
 * offers the addresses actually worth one click in an editor.
 */
export default function BrowserStartPage({ recents, onNavigate }: BrowserStartPageProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="scroll-thin flex h-full flex-col items-center overflow-y-auto bg-canvas px-6 py-14">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5 text-zinc-400">
          <BrowserIcon size={20} />
          <h2 className="text-sm">Browser</h2>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = draft.trim();
            if (value) onNavigate(value);
          }}
          className="relative"
        >
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">
            <SearchIcon size={14} />
          </span>
          <input
            ref={inputRef}
            value={draft}
            spellCheck={false}
            aria-label="Address or search"
            placeholder="Enter an address, or search the web"
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-lg border border-white/[0.07] bg-white/[0.03] py-2 pl-9 pr-3 text-[13px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-accent/40 focus:bg-white/[0.05]"
          />
        </form>

        <section className="mt-8">
          <h3 className="mb-2 text-[10px] uppercase tracking-wide text-zinc-600">Local servers</h3>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_PORTS.map((port) => (
              <button
                key={port}
                type="button"
                onClick={() => onNavigate(`localhost:${port}`)}
                className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 font-mono text-[11px] text-zinc-400 transition-colors hover:border-accent/30 hover:bg-white/[0.05] hover:text-zinc-200"
              >
                localhost:{port}
              </button>
            ))}
          </div>
        </section>

        {recents.length > 0 && (
          <section className="mt-7">
            <h3 className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Recent</h3>
            <ul>
              {recents.map((entry) => (
                <li key={entry.url}>
                  <button
                    type="button"
                    onClick={() => onNavigate(entry.url)}
                    title={entry.url}
                    className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <Favicon src={entry.icon} size={14} />
                    <span className="truncate text-[12px] text-zinc-300">
                      {entry.title || browserLabel(entry.url)}
                    </span>
                    <span className="truncate text-[11px] text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">
                      {entry.url}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-8 text-[11px] leading-relaxed text-zinc-600">
          Pages open here from the address bar, from “Open in Browser” on an HTML file, or by clicking a
          link the terminal prints.
        </p>
      </div>
    </div>
  );
}
