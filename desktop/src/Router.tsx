import { useEffect, useRef, useState } from "react";
import { MotionConfig } from "motion/react";
import Topbar from "./components/Topbar";
import Welcome from "./components/Welcome";
import Workspace from "./components/Workspace";
import { prefetchCodeEditor } from "./lib/monaco/prefetch";
import { getLastProject, setLastProject } from "./lib/recentFolders";

export default function Router() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(() => getLastProject());
  // The topbar sits above the workspace, so the browser action is handed up
  // rather than reached down for.
  const openBrowserRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    prefetchCodeEditor();
  }, []);

  function handleOpenFolder(path: string) {
    setLastProject(path);
    setWorkspacePath(path);
  }

  function handleCloseWorkspace() {
    setLastProject(null);
    setWorkspacePath(null);
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-screen w-full flex-col bg-black text-zinc-300">
        <Topbar
          hasWorkspace={workspacePath !== null}
          onOpenBrowser={() => openBrowserRef.current?.()}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          {workspacePath ? (
            <Workspace
              path={workspacePath}
              onClose={handleCloseWorkspace}
              onChangeWorkspace={handleOpenFolder}
              registerOpenBrowser={(open) => {
                openBrowserRef.current = open;
              }}
            />
          ) : (
            <Welcome onOpenFolder={handleOpenFolder} />
          )}
        </div>
      </div>
    </MotionConfig>
  );
}
