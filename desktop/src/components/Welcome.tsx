import { useState } from "react";
import { addRecentFolder, folderName, getRecentFolders, removeRecentFolder } from "../lib/recentFolders";
import { joinPath } from "../lib/fs";
import { WelcomeFolderIcon, CloneIcon, WelcomeCloseIcon, ArrowRightIcon } from "../icons";
import type { WelcomeProps } from "../types";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  const last = trimmed.split(/[\\/]/).pop() ?? "repository";
  return last.replace(/\.git$/, "") || "repository";
}

export default function Welcome({ onOpenFolder }: WelcomeProps) {
  const [recent, setRecent] = useState<string[]>(() => getRecentFolders());
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);

  function unavailable() {
    setCloneError("This action is only available in the desktop app.");
  }

  async function handleOpenFolder() {
    if (!isTauri) return unavailable();
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      addRecentFolder(selected);
      onOpenFolder(selected);
    }
  }

  async function handleClone() {
    if (!cloneUrl.trim()) return;
    if (!isTauri) return unavailable();
    setCloneError(null);

    const { open } = await import("@tauri-apps/plugin-dialog");
    const parentDir = await open({ directory: true, multiple: false });
    if (typeof parentDir !== "string") return;

    const { invoke } = await import("@tauri-apps/api/core");
    // joinPath preserves the parent's separator style so downstream string
    // comparisons (activePath === entry.path, remapPaths) stay consistent.
    const dest = joinPath(parentDir, repoNameFromUrl(cloneUrl));

    setCloning(true);
    try {
      await invoke("clone_repository", { url: cloneUrl.trim(), dest });
      addRecentFolder(dest);
      onOpenFolder(dest);
    } catch (err) {
      setCloneError(typeof err === "string" ? err : "Clone failed.");
    } finally {
      setCloning(false);
    }
  }

  function handleRemoveRecent(e: React.MouseEvent, path: string) {
    e.stopPropagation();
    removeRecentFolder(path);
    setRecent(getRecentFolders());
  }

  return (
    <>
      <style>
        {`
          @keyframes subtlyFadeInUp {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-up {
            animation: subtlyFadeInUp 0.4s ease-out forwards;
            opacity: 0;
          }
        `}
      </style>
      <div className="flex h-screen w-screen flex-col md:flex-row bg-black text-zinc-300 font-sans antialiased selection:bg-white/[0.1] selection:text-white">
        
        {/* Left Column - Actions (Vertically Centered) */}
        <div className="flex flex-1 flex-col justify-center px-12 md:pl-[12%] md:pr-16 lg:pr-24 py-12 h-full z-10">
          <div className="flex flex-col max-w-md w-full mx-auto md:mx-0 md:ml-auto">
            
            <div className="flex items-center gap-4 mb-16 select-none cursor-default animate-fade-in-up" style={{ animationDelay: '0ms' }}>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-b from-white/[0.12] to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] ring-1 ring-white/[0.05]">
                <img src="/logo.svg" alt="Aether" className="h-6 w-6 object-contain opacity-100 brightness-0 invert drop-shadow-md" />
              </div>
              <div className="flex flex-col justify-center">
                <h1 className="text-xl font-medium tracking-tight text-white mb-0.5">Aether</h1>
                <p className="text-[13px] font-medium text-zinc-500">The Most Lightweight AI Code Editor</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
              <button
                type="button"
                onClick={handleOpenFolder}
                className="group relative flex items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.015] p-4 text-left transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.04] active:scale-[0.98] outline-none focus-visible:ring-1 focus-visible:ring-white/20"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.05] bg-black text-zinc-400 transition-all duration-300 group-hover:scale-105 group-hover:text-zinc-100 group-hover:border-white/[0.1] group-hover:shadow-[0_0_12px_rgba(255,255,255,0.05)]">
                  <WelcomeFolderIcon />
                </div>
                <div className="flex flex-col">
                  <span className="text-[14px] font-medium text-zinc-200 transition-colors group-hover:text-white">Open Project</span>
                  <span className="text-[12px] text-zinc-500 transition-colors group-hover:text-zinc-400">Open a local directory or workspace</span>
                </div>
              </button>

              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => {
                    setCloneOpen((v) => !v);
                    setCloneError(null);
                  }}
                  className={`group relative flex items-center gap-4 rounded-xl border p-4 text-left transition-all duration-300 active:scale-[0.98] outline-none focus-visible:ring-1 focus-visible:ring-white/20 ${
                    cloneOpen 
                      ? "border-white/[0.1] bg-white/[0.04]" 
                      : "border-white/[0.05] bg-white/[0.015] hover:border-white/[0.1] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-black transition-all duration-300 ${cloneOpen ? "border-white/[0.1] text-zinc-100 scale-105 shadow-[0_0_12px_rgba(255,255,255,0.05)]" : "border-white/[0.05] text-zinc-400 group-hover:scale-105 group-hover:text-zinc-100 group-hover:border-white/[0.1] group-hover:shadow-[0_0_12px_rgba(255,255,255,0.05)]"}`}>
                    <CloneIcon />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[14px] font-medium text-zinc-200 transition-colors group-hover:text-white">Clone Repository</span>
                    <span className="text-[12px] text-zinc-500 transition-colors group-hover:text-zinc-400">Clone a project from a remote URL</span>
                  </div>
                </button>

                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${cloneOpen ? "max-h-40 opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"}`}>
                  <div className="flex flex-col gap-2 rounded-xl border border-white/[0.05] bg-black p-1.5 focus-within:border-white/[0.12] focus-within:ring-1 focus-within:ring-white/10 transition-all shadow-inner">
                    <div className="flex items-center w-full">
                      <input
                        type="text"
                        value={cloneUrl}
                        onChange={(e) => setCloneUrl(e.target.value)}
                        placeholder="https://github.com/user/repo.git"
                        className="w-full bg-transparent px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleClone()}
                      />
                      <button
                        type="button"
                        onClick={handleClone}
                        disabled={cloning || !cloneUrl.trim()}
                        className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] px-4 text-[12px] font-medium text-zinc-300 transition-all hover:bg-white/[0.1] hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-40 mr-0.5"
                      >
                        {cloning ? "Cloning..." : "Clone"}
                        {!cloning && <ArrowRightIcon />}
                      </button>
                    </div>
                  </div>
                  {cloneError && <p className="mt-2 px-2 text-[12px] font-medium text-red-400/90 animate-fade-in-up">{cloneError}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center Divider */}
        <div className="w-px bg-gradient-to-b from-transparent via-white/[0.06] to-transparent hidden md:block" />

        {/* Right Column - Recent Projects (Aligned to top/fluid) */}
        <div className="flex flex-1 flex-col pt-12 pb-12 px-12 md:pr-[12%] md:pl-16 lg:pl-24 md:pt-[22vh] h-full bg-black md:bg-transparent overflow-y-auto">
          <div className="flex flex-col max-w-lg w-full mx-auto md:mx-0 md:mr-auto">
            
            <div className="flex items-center justify-between mb-6 px-1 select-none animate-fade-in-up" style={{ animationDelay: '100ms' }}>
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Recent Projects</h2>
            </div>

            {recent.length > 0 ? (
              <div className="flex flex-col -mx-2">
                {recent.map((path, idx) => (
                  <button
                    key={path}
                    onClick={() => onOpenFolder(path)}
                    className="group relative flex items-center justify-between rounded-lg px-3 py-2.5 transition-all duration-200 hover:bg-white/[0.04] text-left outline-none focus-visible:bg-white/[0.05] animate-fade-in-up"
                    style={{ animationDelay: `${150 + idx * 30}ms` }}
                  >
                    <div className="flex flex-col min-w-0 pr-6 transform transition-transform duration-200 group-hover:translate-x-1">
                      <span className="text-[13px] font-medium text-zinc-300 transition-colors group-hover:text-white truncate">
                        {folderName(path)}
                      </span>
                      <span className="text-[11px] text-zinc-600 font-mono tracking-tight truncate mt-0.5 transition-colors group-hover:text-zinc-400">
                        {path}
                      </span>
                    </div>
                    <div 
                      onClick={(e) => handleRemoveRecent(e, path)}
                      className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 opacity-0 transition-all duration-200 hover:bg-white/[0.08] hover:text-zinc-200 group-hover:opacity-100 active:scale-95"
                      title="Remove from recent"
                    >
                      <WelcomeCloseIcon />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 rounded-xl border border-dashed border-white/[0.05] bg-white/[0.01] select-none animate-fade-in-up" style={{ animationDelay: '150ms' }}>
                <span className="text-[13px] font-medium text-zinc-600">No recent projects</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}