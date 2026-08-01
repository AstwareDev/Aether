import { useEffect, useRef, useState } from "react";
import { monaco } from "../../lib/monaco/setup";
import { useSetting } from "../../lib/settings";

const SAMPLES: { id: string; name: string; language: string; code: string }[] = [
  {
    id: "js",
    name: "orbit.js",
    language: "javascript",
    code: `import { clamp } from "./math";

const G = 6.6743e-11;

/** Positions a body on its orbit at time t. */
export function orbit({ mass, radius, phase = 0 }, t) {
  const period = 2 * Math.PI * Math.sqrt(radius ** 3 / (G * mass));
  const theta = phase + (t / period) * 2 * Math.PI;

  return {
    x: Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
    period: clamp(period, 0, Number.MAX_SAFE_INTEGER),
  };
}

export const bodies = [
  { name: "Aether", mass: 5.97e24, radius: 1.496e11 },
  { name: "Vesper", mass: 6.42e23, radius: 2.279e11 },
];
`,
  },
  {
    id: "md",
    name: "notes.md",
    language: "markdown",
    code: `# Release notes

A quick look at how prose sets in the editor.

## Highlights

- **Word wrap** reflows long paragraphs instead of scrolling sideways, which matters most in files like this one where lines run past the edge of the pane.
- *Line numbers* can count from the cursor.
- \`Minimap\` shows the shape of the file.

> Set the font to whatever you read best at 2am.

| Setting | Default |
| ------- | ------- |
| Size    | 14px    |
| Wrap    | On      |
`,
  },
];

export default function EditorPreview() {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [sampleId, setSampleId] = useState(SAMPLES[0].id);

  const fontFamily = useSetting("editorFontFamily");
  const fontSize = useSetting("editorFontSize");
  const wordWrap = useSetting("editorWordWrap");
  const minimap = useSetting("editorMinimap");
  const lineNumbers = useSetting("editorLineNumbers");

  const appearance: monaco.editor.IEditorOptions = {
    fontFamily,
    fontSize,
    lineHeight: Math.round(fontSize * 1.6),
    wordWrap: wordWrap ? "on" : "off",
    minimap: { enabled: minimap },
    lineNumbers,
  };
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;

  useEffect(() => {
    if (!hostRef.current) return;
    const editor = monaco.editor.create(hostRef.current, {
      theme: "aether-dark",
      automaticLayout: true,
      ...appearanceRef.current,
      readOnly: true,
      domReadOnly: true,
      renderLineHighlight: "all",
      bracketPairColorization: { enabled: true },
      scrollBeyondLastLine: false,
      overviewRulerLanes: 0,
      scrollbar: { alwaysConsumeMouseWheel: false },
    });
    editorRef.current = editor;
    return () => {
      editor.getModel()?.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    editorRef.current?.updateOptions(appearance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily, fontSize, wordWrap, minimap, lineNumbers]);

  // The sample owns its model so switching files keeps the same editor, and
  // the preview never touches a workspace model.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sample = SAMPLES.find((s) => s.id === sampleId) ?? SAMPLES[0];
    const previous = editor.getModel();
    editor.setModel(monaco.editor.createModel(sample.code, sample.language));
    previous?.dispose();
  }, [sampleId]);

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.06]">
      <div className="flex items-center gap-1 border-b border-white/[0.05] bg-abyss px-2 py-1.5">
        {SAMPLES.map((sample) => {
          const active = sample.id === sampleId;
          return (
            <button
              key={sample.id}
              type="button"
              onClick={() => setSampleId(sample.id)}
              aria-pressed={active}
              className={`focus-ring rounded px-2 py-1 font-mono text-[11px] transition-colors ${
                active ? "bg-white/[0.08] text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {sample.name}
            </button>
          );
        })}
        <span className="ml-auto pr-1 text-[11px] text-zinc-500">Preview · read-only</span>
      </div>
      <div ref={hostRef} className="h-[260px] w-full" />
    </div>
  );
}
