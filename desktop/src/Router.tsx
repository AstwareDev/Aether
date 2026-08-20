import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import Topbar from "./components/Topbar";
import Welcome from "./components/Welcome";
import Workspace from "./components/Workspace";
import { prefetchCodeEditor } from "./lib/monaco/prefetch";
import { getLastProject, setLastProject } from "./lib/recentFolders";

export default function Router() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(() => getLastProject());

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
        <Topbar hasWorkspace={workspacePath !== null} />
        <div className="min-h-0 flex-1 overflow-hidden">
          {workspacePath ? (
            <Workspace path={workspacePath} onClose={handleCloseWorkspace} onChangeWorkspace={handleOpenFolder} />
          ) : (
            <Welcome onOpenFolder={handleOpenFolder} />
          )}
        </div>
      </div>
    </MotionConfig>
  );
}
