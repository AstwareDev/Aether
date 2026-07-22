import { invoke, Channel } from "@tauri-apps/api/core";
import type { PtyEvent, ShellKind, PtyCallbacks } from "../types";
export type { ShellKind } from "../types";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Spawn `shell` for `id` in `cwd`, sized to `cols`x`rows`. Resolves once the session is registered. */
export async function spawnPty(
  id: string,
  shell: ShellKind,
  cwd: string,
  cols: number,
  rows: number,
  { onOutput, onExit }: PtyCallbacks,
): Promise<void> {
  const decoder = new TextDecoder();
  const channel = new Channel<PtyEvent>();
  channel.onmessage = (event) => {
    if (event.type === "output") {
      onOutput(decoder.decode(base64ToBytes(event.data), { stream: true }));
    } else {
      onExit(event.code);
    }
  };
  await invoke("pty_spawn", { id, shell, cwd, cols, rows, onEvent: channel });
}

export async function writePty(id: string, data: string): Promise<void> {
  await invoke("pty_write", { id, data });
}

export async function resizePty(id: string, cols: number, rows: number): Promise<void> {
  await invoke("pty_resize", { id, cols, rows });
}

export async function killPty(id: string): Promise<void> {
  await invoke("pty_kill", { id });
}
