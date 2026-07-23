import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export async function openAiIdeWindow(): Promise<void> {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (!isTauri) return;

  const existing = await WebviewWindow.getByLabel("ai-ide");
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const aiWindow = new WebviewWindow("ai-ide", {
    title: "Aether Code",
    width: 1200,
    height: 800,
    decorations: false,
    center: true,
  });

  await aiWindow.once("tauri://created", () => {
    console.log("AI IDE window created");
  });

  await aiWindow.once("tauri://error", (e) => {
    console.error("Failed to create AI IDE window:", e);
  });
}
