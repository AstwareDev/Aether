import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setSetting, useSetting } from "../lib/settings";
import { SidebarIcon, TerminalIcon } from "../lib/icons/ui";
import { MinimizeIcon, MaximizeIcon, RestoreIcon, TopCloseIcon } from "../icons";
import type { TopbarProps } from "../types";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const appWindow = isTauri ? getCurrentWindow() : null;

export default function Topbar({ hasWorkspace }: TopbarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const sidebarVisible = useSetting("sidebarVisible");
  const terminalVisible = useSetting("terminalVisible");

  useEffect(() => {
    if (!appWindow) return;
    appWindow.isMaximized().then(setIsMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={() => appWindow?.toggleMaximize()}
      className="flex h-9 w-full shrink-0 select-none items-center justify-between border-b border-white/[0.04] bg-black text-zinc-400"
    >
      <div data-tauri-drag-region className="pointer-events-none flex h-full items-center gap-2.5 pl-4 pr-3">
        <img
          src="/logo.svg"
          alt="Aether"
          className="h-3.5 w-3.5 select-none object-contain opacity-90 brightness-0 invert"
        />
        <span className="text-[11px] font-medium tracking-wide text-zinc-300">Aether</span>
      </div>

      <div data-tauri-drag-region className="flex-1 h-full" />

      {hasWorkspace && (
        <div className="flex h-full items-center pr-1">
          <button
            type="button"
            onClick={() => setSetting("sidebarVisible", !sidebarVisible)}
            aria-label="Toggle Sidebar"
            aria-pressed={sidebarVisible}
            title="Toggle Sidebar (Ctrl+B)"
            className={`flex h-6 w-7 items-center justify-center rounded transition-colors hover:bg-white/[0.08] hover:text-white ${
              sidebarVisible ? "text-white" : "text-zinc-500"
            }`}
          >
            <SidebarIcon size={15} />
          </button>
          <button
            type="button"
            onClick={() => setSetting("terminalVisible", !terminalVisible)}
            aria-label="Toggle Terminal"
            aria-pressed={terminalVisible}
            title="Toggle Terminal (Ctrl+`)"
            className={`flex h-6 w-7 items-center justify-center rounded transition-colors hover:bg-white/[0.08] hover:text-white ${
              terminalVisible ? "text-white" : "text-zinc-500"
            }`}
          >
            <TerminalIcon size={15} />
          </button>
        </div>
      )}

      <div className="flex h-full items-center">
        <button
          type="button"
          onClick={() => appWindow?.minimize()}
          aria-label="Minimize"
          className="flex h-full w-[46px] items-center justify-center text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          onClick={() => appWindow?.toggleMaximize()}
          aria-label={isMaximized ? "Restore" : "Maximize"}
          className="flex h-full w-[46px] items-center justify-center text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          onClick={() => appWindow?.close()}
          aria-label="Close"
          className="flex h-full w-[46px] items-center justify-center text-zinc-400 transition-colors hover:bg-white/[0.1] hover:text-white"
        >
          <TopCloseIcon />
        </button>
      </div>
    </div>
  );
}