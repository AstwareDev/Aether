/**
 * Fetches + evaluates the CodeEditor chunk (Monaco core, all language grammars,
 * worker wiring, Tailwind IntelliSense, React types) during browser idle time,
 * well before the user opens their first file. Workspace.tsx's `React.lazy`
 * import of the same specifier then resolves from Vite's module cache instead
 * of triggering a fresh fetch+evaluate inside the Suspense boundary.
 */
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
