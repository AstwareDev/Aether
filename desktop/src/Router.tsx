import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import Topbar from "./components/Topbar";
import Welcome from "./components/Welcome";
import Workspace from "./components/Workspace";
import AiIdeWindow from "./components/AiIdeWindow";
import { prefetchCodeEditor } from "./lib/monaco/prefetch";
import { getLastProject, setLastProject } from "./lib/recentFolders";

export default function Router() {
  const [windowLabel, setWindowLabel] = useState<string>("main");
  const [workspacePath, setWorkspacePath] = useState<string | null>(() => getLastProject());

  useEffect(() => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauri) {
      const currentWindow = getCurrentWebviewWindow();
      setWindowLabel(currentWindow.label);
    }
  }, []);

  useEffect(() => {
    if (windowLabel === "main") {
      prefetchCodeEditor();
    }
  }, [windowLabel]);

  function handleOpenFolder(path: string) {
    setLastProject(path);
    setWorkspacePath(path);
  }

  function handleCloseWorkspace() {
    setLastProject(null);
    setWorkspacePath(null);
  }

  // Render AI IDE window
  if (windowLabel === "ai-ide") {
    return (
      <MotionConfig reducedMotion="user">
        <AiIdeWindow />
      </MotionConfig>
    );
  }

  // Render main editor window
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
