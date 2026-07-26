import { useEffect, useRef } from "react";
import { monaco } from "../lib/monaco/setup";
import { languageForPath } from "../lib/monaco/editorLanguage";
import { installAiEdit } from "../lib/monaco/aiEdit";
import { ReviewAnnotation, ensureReviewStyles } from "../lib/monaco/reviewAnnotation";
import { toUri, isWorkspaceSourceExtension } from "../lib/monaco/workspaceModels";
import { useSetting } from "../lib/settings";
import type { CodeEditorProps, ReviewIssue } from "../types";

export default function CodeEditor({ path, value, onChange, onSave, onCursor, openPaths }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const annotationRef = useRef<ReviewAnnotation | null>(null);
  const pendingAnnotationRef = useRef<(ReviewIssue & { path: string }) | null>(null);
  const modelsRef = useRef(new Map<string, monaco.editor.ITextModel>());
  const viewStatesRef = useRef(new Map<string, monaco.editor.ICodeEditorViewState>());
  const currentPathRef = useRef<string | null>(null);

  const editorFontFamily = useSetting("editorFontFamily");
  const editorFontSize = useSetting("editorFontSize");

  // Keep the latest callbacks without rebuilding the editor on every render.
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onCursorRef = useRef(onCursor);
  const pathRef = useRef(path);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onCursorRef.current = onCursor;
  pathRef.current = path;

  // Create the persistent editor once.
  useEffect(() => {
    if (!hostRef.current) return;

    const editor = monaco.editor.create(hostRef.current, {
      theme: "aether-dark",
      automaticLayout: true,
      fontSize: editorFontSize,
      lineHeight: Math.round(editorFontSize * 1.6),
      fontFamily: editorFontFamily,
      wordWrap: "on",
      renderLineHighlight: "all",
      bracketPairColorization: { enabled: true },
      matchBrackets: "always",
      autoClosingBrackets: "always",
      autoClosingQuotes: "always",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
    });
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current?.();
    });

    editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      if (model) onChangeRef.current(model.getValue());
    });

    editor.onDidChangeCursorPosition((e) => {
      onCursorRef.current?.({ line: e.position.lineNumber, col: e.position.column });
    });

    const aiEdit = installAiEdit(editor, () => pathRef.current);

    ensureReviewStyles();
    const annotation = new ReviewAnnotation(editor, {
      onFix: (issue) => {
        annotation.clear();
        aiEdit.openEditAtLine(
          issue.line,
          `${issue.title}. ${issue.description}${issue.suggested_fix ? ` Suggested fix: ${issue.suggested_fix}` : ""}`,
        );
      },
      onDismiss: (issue) => {
        annotation.clear();
        window.dispatchEvent(new CustomEvent("aether:dismiss-review-issue", { detail: issue }));
      },
      onVote: (issue, vote) => {
        window.dispatchEvent(new CustomEvent("aether:vote-review-issue", { detail: { issue, vote } }));
      },
    });
    annotationRef.current = annotation;

    // The file may still be mid-swap when the event arrives (Workspace opens
    // the file, then asks for the card), so hold it until the model matches.
    const showAnnotation = (e: Event) => {
      const detail = (e as CustomEvent).detail as (ReviewIssue & { path: string }) | undefined;
      if (!detail) return;
      if (detail.path !== pathRef.current) {
        pendingAnnotationRef.current = detail;
        return;
      }
      pendingAnnotationRef.current = null;
      annotation.show(detail);
      editor.focus();
    };
    window.addEventListener("aether:show-review-annotation", showAnnotation);

    return () => {
      window.removeEventListener("aether:show-review-annotation", showAnnotation);
      annotation.clear();
      annotationRef.current = null;
      editor.dispose();
      editorRef.current = null;
      for (const model of modelsRef.current.values()) model.dispose();
      modelsRef.current.clear();
      viewStatesRef.current.clear();
      currentPathRef.current = null;
    };
  }, [editorFontFamily, editorFontSize]);

  // Swap in the model for the current file when `path` changes.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const prevPath = currentPathRef.current;
    if (prevPath && prevPath !== path) {
      const prevModel = modelsRef.current.get(prevPath);
      if (prevModel) viewStatesRef.current.set(prevPath, editor.saveViewState()!);
      // The card is anchored to a line in the outgoing file.
      annotationRef.current?.clear();
    }

    let model = modelsRef.current.get(path);
    if (!model) {
      const uri = toUri(path);
      model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(value, languageForPath(path), uri);
      modelsRef.current.set(path, model);
    }
    editor.setModel(model);
    currentPathRef.current = path;

    const savedState = viewStatesRef.current.get(path);
    if (savedState) editor.restoreViewState(savedState);
    editor.focus();

    const pos = editor.getPosition();
    if (pos) onCursorRef.current?.({ line: pos.lineNumber, col: pos.column });

    const pending = pendingAnnotationRef.current;
    if (pending && pending.path === path) {
      pendingAnnotationRef.current = null;
      annotationRef.current?.show(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Sync external value changes (e.g. tab restore) into the matching model.
  useEffect(() => {
    const model = modelsRef.current.get(path);
    if (!model || model.getValue() === value) return;
    const edit = { range: model.getFullModelRange(), text: value };
    const editor = editorRef.current;
    if (editor && editor.getModel() === model) {
      editor.executeEdits("external-sync", [edit]);
    } else {
      model.pushEditOperations([], [edit], () => null);
    }
  }, [path, value]);

  // Dispose models for tabs that have been closed. Source files (js/ts/jsx/tsx)
  // are left alive instead — they keep contributing to the workspace-wide
  // IntelliSense graph (cross-file auto-import) after their tab closes.
  // `workspaceModels.ts` is the sole owner of disposing those, pruning only
  // once a fresh directory listing confirms the file is really gone.
  useEffect(() => {
    if (!openPaths) return;
    const open = new Set(openPaths);
    for (const [p, model] of modelsRef.current) {
      if (open.has(p)) continue;
      if (!isWorkspaceSourceExtension(p)) model.dispose();
      modelsRef.current.delete(p);
      viewStatesRef.current.delete(p);
    }
  }, [openPaths]);

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />;
}
