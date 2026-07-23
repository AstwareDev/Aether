import { useEffect, useRef } from "react";
import { monaco } from "../lib/monaco/setup";
import { languageForPath } from "../lib/monaco/editorLanguage";
import type { MonacoDiffEditorProps } from "../types";

export default function MonacoDiffEditor({ original, modified, filePath }: MonacoDiffEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const lang = languageForPath(filePath);
    const originalModel = monaco.editor.createModel(original, lang);
    const modifiedModel = monaco.editor.createModel(modified, lang);

    const editor = monaco.editor.createDiffEditor(hostRef.current, {
      theme: "aether-dark",
      automaticLayout: true,
      fontSize: 13,
      lineHeight: 21,
      fontFamily:
        "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      readOnly: true,
      renderSideBySide: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      diffCodeLens: false,
      originalEditable: false,
      enableSplitViewResizing: false,
      renderMarginRevertIcon: false,
      hideUnchangedRegions: {
        enabled: true,
        minimumLineCount: 5,
      },
    });
    editor.getOriginalEditor().updateOptions({ lineNumbers: "off" });
    editorRef.current = editor;

    editor.setModel({ original: originalModel, modified: modifiedModel });

    return () => {
      editor.dispose();
      editorRef.current = null;
      originalModel.dispose();
      modifiedModel.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const lang = languageForPath(filePath);
    const origVal = model.original.getValue();
    const modVal = model.modified.getValue();
    if (origVal !== original || modVal !== modified) {
      model.original.setValue(original);
      model.modified.setValue(modified);
      monaco.editor.setModelLanguage(model.original, lang);
      monaco.editor.setModelLanguage(model.modified, lang);
    }
  }, [original, modified, filePath]);

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />;
}
