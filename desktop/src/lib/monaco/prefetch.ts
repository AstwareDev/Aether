export function prefetchCodeEditor(): () => void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  const schedule = w.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
  const cancel = w.cancelIdleCallback ?? clearTimeout;
  const handle = schedule(() => {
    void import("../../components/CodeEditor");
  }, { timeout: 2000 });
  return () => cancel(handle as never);
}
