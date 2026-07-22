import { useEffect, useRef } from "react";
import { monaco } from "../lib/monaco/setup";
import type { DiffEditorProps } from "../types";

export default function DiffEditor({ diff }: DiffEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const model = monaco.editor.createModel(diff, "diff");
    modelRef.current = model;

    const editor = monaco.editor.create(hostRef.current, {
      model,
      theme: "aether-dark",
      automaticLayout: true,
      fontSize: 13,
      lineHeight: 21,
      fontFamily:
        "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      readOnly: true,
      renderLineHighlight: "none",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: "on",
      bracketPairColorization: { enabled: false },
      matchBrackets: "never",
      autoClosingBrackets: "never",
      autoClosingQuotes: "never",
      folding: false,
      lineNumbers: "off",
      glyphMargin: false,
      foldingHighlight: false,
    });
    editorRef.current = editor;

    return () => {
      editor.dispose();
      editorRef.current = null;
      model.dispose();
      modelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || model.getValue() === diff) return;
    model.setValue(diff);
  }, [diff]);

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />;
}
