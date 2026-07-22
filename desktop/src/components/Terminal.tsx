import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { killPty, resizePty, spawnPty, writePty } from "../lib/pty";
import type { TerminalProps } from "../types";

export default function Terminal({ rootPath, shell, visible }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const id = crypto.randomUUID();

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: "'Cascadia Code', 'Cascadia Mono', 'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1,
      letterSpacing: 0,
      theme: {
        background: "#0a0a0a",
        foreground: "#d4d4d8",
        cursor: "#e0e0e0",
        cursorAccent: "#0a0a0a",
        selectionBackground: "rgba(255,255,255,0.15)",
        black: "#1e1e1e",
        red: "#f44747",
        green: "#6a9955",
        yellow: "#d7ba7d",
        blue: "#569cd6",
        magenta: "#c586c0",
        cyan: "#4ec9b0",
        white: "#d4d4d4",
        brightBlack: "#808080",
        brightRed: "#f44747",
        brightGreen: "#b5cea8",
        brightYellow: "#d7ba7d",
        brightBlue: "#9cdcfe",
        brightMagenta: "#c586c0",
        brightCyan: "#4ec9b0",
        brightWhite: "#ffffff",
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    spawnPty(id, shell, rootPath, term.cols, term.rows, {
      onOutput: (text) => {
        if (!disposed) term.write(text);
      },
      onExit: (code) => {
        if (!disposed) term.write(`\r\n\x1b[2m[process exited with code ${code}]\x1b[0m\r\n`);
      },
    }).catch((err) => {
      if (!disposed) term.write(`\r\n\x1b[31mFailed to start terminal: ${String(err)}\x1b[0m\r\n`);
    });

    const dataDisposable = term.onData((data) => {
      void writePty(id, data);
    });
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      void resizePty(id, cols, rows);
    });
    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      termRef.current = null;
      fitAddonRef.current = null;
      resizeObserver.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      term.dispose();
      void killPty(id);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden px-2 py-1" />;
}
