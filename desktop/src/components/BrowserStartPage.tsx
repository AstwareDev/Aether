import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "../lib/icons/ui";
import { browserLabel } from "../lib/browser";
import Favicon from "./Favicon";
import type { BrowserStartPageProps } from "../types";

const SUGGESTED_PORTS = [3000, 5173, 8080, 4200];

/**
 * What a pane shows before anything is loaded: the mark, one address field and
 * a row of places worth a click.
 *
 * A browser tab that opens onto a dev server nobody asked for is a surprise, so
 * a new pane still starts empty. Recents are session-scoped, so on a cold start
 * there are none — the row falls back to the local ports an editor is most
 * likely to want, rather than sitting empty.
 */
export default function BrowserStartPage({ recents, onNavigate }: BrowserStartPageProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const shortcuts = recents.length
    ? recents.map((entry) => ({
        key: entry.url,
        url: entry.url,
        label: entry.title || browserLabel(entry.url),
        hint: entry.url,
        glyph: <Favicon src={entry.icon} size={20} />,
      }))
    : SUGGESTED_PORTS.map((port) => ({
        key: `localhost:${port}`,
        url: `localhost:${port}`,
        label: `localhost:${port}`,
        hint: `localhost:${port}`,
        glyph: <span className="font-mono text-[11px] leading-none text-zinc-400">{port}</span>,
      }));

  return (
    // `m-auto` rather than `justify-center` so a short pane scrolls from the top
    // instead of clipping the mark off the edge.
    <div className="scroll-thin flex h-full flex-col overflow-y-auto bg-canvas px-6">
      <div className="m-auto flex w-full max-w-xl flex-col items-center py-16">
        <img
          src="/logo.svg"
          alt=""
          className="h-14 w-14 select-none object-contain opacity-90 brightness-0 invert"
        />
        <h1 className="mt-5 text-[21px] font-medium tracking-tight text-zinc-200">Agent Browser</h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = draft.trim();
            if (value) onNavigate(value);
          }}
          className="relative mt-9 w-full"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500"
          >
            <SearchIcon size={16} />
          </span>
          <input
            ref={inputRef}
            value={draft}
            spellCheck={false}
            aria-label="Address or search"
            placeholder="Enter an address, or search the web"
            onChange={(e) => setDraft(e.target.value)}
            className="h-12 w-full rounded-full border border-white/[0.07] bg-white/[0.03] pl-13 pr-5 text-[13px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 hover:border-white/[0.11] hover:bg-white/[0.05] focus:border-accent/40 focus:bg-white/[0.05]"
          />
        </form>

        {shortcuts.length > 0 && (
          <nav aria-label={recents.length ? "Recently visited" : "Local servers"} className="mt-10">
            <ul className="flex flex-wrap justify-center gap-3">
              {shortcuts.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onNavigate(item.url)}
                    title={item.hint}
                    aria-label={item.label}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03] text-zinc-400 transition-colors hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-zinc-200 focus-visible:border-accent/40 focus-visible:outline-none"
                  >
                    {item.glyph}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
