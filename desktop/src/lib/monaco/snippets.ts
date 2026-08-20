import type { editor, languages, IRange } from "monaco-editor/esm/vs/editor/editor.api.js";

type Monaco = typeof import("monaco-editor/esm/vs/editor/editor.api.js");

/**
 * The ES7+/React snippet prefixes people expect from VS Code — `rfc`, `rafce`,
 * `useState`, `imr` — which Monaco ships nothing equivalent to.
 */

interface Snippet {
  prefix: string;
  description: string;
  /** `$NAME` expands to the file's base name, so `rfc` names the component. */
  body: string[];
  /** Restricted to files that can hold JSX. */
  jsxOnly?: boolean;
}

const SNIPPETS: Snippet[] = [
  {
    prefix: "rfc",
    description: "Function component",
    jsxOnly: true,
    body: [
      "export default function $NAME() {",
      "  return (",
      "    <div>$0</div>",
      "  );",
      "}",
      "",
    ],
  },
  {
    prefix: "rfce",
    description: "Function component with named export",
    jsxOnly: true,
    body: [
      "function $NAME() {",
      "  return (",
      "    <div>$0</div>",
      "  );",
      "}",
      "",
      "export default $NAME;",
      "",
    ],
  },
  {
    prefix: "rafce",
    description: "Arrow function component with export",
    jsxOnly: true,
    body: [
      "const $NAME = () => {",
      "  return (",
      "    <div>$0</div>",
      "  );",
      "};",
      "",
      "export default $NAME;",
      "",
    ],
  },
  {
    prefix: "rafc",
    description: "Arrow function component",
    jsxOnly: true,
    body: ["export const $NAME = () => {", "  return (", "    <div>$0</div>", "  );", "};", ""],
  },
  {
    prefix: "rtsc",
    description: "Typed function component with props",
    jsxOnly: true,
    body: [
      "interface ${1:$NAME}Props {",
      "  $2",
      "}",
      "",
      "export default function $NAME({ $3 }: ${1:$NAME}Props) {",
      "  return (",
      "    <div>$0</div>",
      "  );",
      "}",
      "",
    ],
  },
  {
    prefix: "rcc",
    description: "Class component",
    jsxOnly: true,
    body: [
      "import { Component } from \"react\";",
      "",
      "export default class $NAME extends Component {",
      "  render() {",
      "    return (",
      "      <div>$0</div>",
      "    );",
      "  }",
      "}",
      "",
    ],
  },
  {
    prefix: "useState",
    description: "useState hook",
    body: ["const [${1:state}, set${2:State}] = useState(${3:null});$0"],
  },
  {
    prefix: "useEffect",
    description: "useEffect hook",
    body: ["useEffect(() => {", "  $0", "}, [$1]);"],
  },
  {
    prefix: "useEffectCleanup",
    description: "useEffect with cleanup",
    body: ["useEffect(() => {", "  $0", "  return () => {", "    $2", "  };", "}, [$1]);"],
  },
  {
    prefix: "useCallback",
    description: "useCallback hook",
    body: ["const ${1:handler} = useCallback(($2) => {", "  $0", "}, [$3]);"],
  },
  { prefix: "useMemo", description: "useMemo hook", body: ["const ${1:value} = useMemo(() => $0, [$2]);"] },
  { prefix: "useRef", description: "useRef hook", body: ["const ${1:ref} = useRef(${2:null});$0"] },
  { prefix: "useContext", description: "useContext hook", body: ["const ${1:value} = useContext(${2:Context});$0"] },
  {
    prefix: "useReducer",
    description: "useReducer hook",
    body: ["const [${1:state}, ${2:dispatch}] = useReducer(${3:reducer}, ${4:initialState});$0"],
  },
  { prefix: "imr", description: "Import React", body: ['import React from "react";$0'] },
  { prefix: "imrs", description: "Import React and useState", body: ['import React, { useState } from "react";$0'] },
  {
    prefix: "imrse",
    description: "Import React, useState and useEffect",
    body: ['import React, { useState, useEffect } from "react";$0'],
  },
  { prefix: "imp", description: "Import module", body: ['import ${1:module} from "${2:path}";$0'] },
  { prefix: "imd", description: "Import named", body: ['import { ${1:name} } from "${2:path}";$0'] },
  { prefix: "exp", description: "Export default", body: ["export default $0;"] },
  { prefix: "clg", description: "console.log", body: ["console.log($0);"] },
  { prefix: "cle", description: "console.error", body: ["console.error($0);"] },
  { prefix: "anfn", description: "Arrow function", body: ["const ${1:name} = ($2) => {", "  $0", "};"] },
  { prefix: "tryc", description: "try / catch", body: ["try {", "  $0", "} catch (error) {", "  $1", "}"] },
];

const JSX_FILE = /\.(?:jsx|tsx)$/i;

function componentNameFor(model: editor.ITextModel): string {
  const base = model.uri.path.slice(model.uri.path.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
  const cleaned = base.replace(/[^\w$]+(.)?/g, (_, c: string) => (c ? c.toUpperCase() : ""));
  const named = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /^[A-Za-z_$]/.test(named) ? named : "Component";
}

export function registerSnippets(monaco: Monaco): void {
  monaco.languages.registerCompletionItemProvider(["javascript", "typescript"], {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range: IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const allowsJsx = JSX_FILE.test(model.uri.path);
      const name = componentNameFor(model);

      const suggestions = SNIPPETS.filter((snippet) => allowsJsx || !snippet.jsxOnly).map((snippet) => ({
        label: snippet.prefix,
        kind: 27 as languages.CompletionItemKind,
        detail: snippet.description,
        documentation: { value: "```tsx\n" + snippet.body.join("\n").replace(/\$NAME/g, name) + "\n```" },
        insertText: snippet.body.join("\n").replace(/\$NAME/g, name),
        insertTextRules: 4 as languages.CompletionItemInsertTextRule,
        range,
      })) satisfies languages.CompletionItem[];

      return { suggestions };
    },
  });
}
