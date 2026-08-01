import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";

import "monaco-editor/esm/vs/basic-languages/abap/abap.contribution.js";
import "monaco-editor/esm/vs/basic-languages/apex/apex.contribution.js";
import "monaco-editor/esm/vs/basic-languages/azcli/azcli.contribution.js";
import "monaco-editor/esm/vs/basic-languages/bat/bat.contribution.js";
import "monaco-editor/esm/vs/basic-languages/bicep/bicep.contribution.js";
import "monaco-editor/esm/vs/basic-languages/cameligo/cameligo.contribution.js";
import "monaco-editor/esm/vs/basic-languages/clojure/clojure.contribution.js";
import "monaco-editor/esm/vs/basic-languages/coffee/coffee.contribution.js";
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/csp/csp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/css/css.contribution.js";
import "monaco-editor/esm/vs/basic-languages/cypher/cypher.contribution.js";
import "monaco-editor/esm/vs/basic-languages/dart/dart.contribution.js";
import "monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution.js";
import "monaco-editor/esm/vs/basic-languages/ecl/ecl.contribution.js";
import "monaco-editor/esm/vs/basic-languages/elixir/elixir.contribution.js";
import "monaco-editor/esm/vs/basic-languages/flow9/flow9.contribution.js";
import "monaco-editor/esm/vs/basic-languages/freemarker2/freemarker2.contribution.js";
import "monaco-editor/esm/vs/basic-languages/fsharp/fsharp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/go/go.contribution.js";
import "monaco-editor/esm/vs/basic-languages/graphql/graphql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/handlebars/handlebars.contribution.js";
import "monaco-editor/esm/vs/basic-languages/hcl/hcl.contribution.js";
import "monaco-editor/esm/vs/basic-languages/html/html.contribution.js";
import "monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js";
import "monaco-editor/esm/vs/basic-languages/java/java.contribution.js";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js";
import "monaco-editor/esm/vs/basic-languages/julia/julia.contribution.js";
import "monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution.js";
import "monaco-editor/esm/vs/basic-languages/less/less.contribution.js";
import "monaco-editor/esm/vs/basic-languages/lexon/lexon.contribution.js";
import "monaco-editor/esm/vs/basic-languages/liquid/liquid.contribution.js";
import "monaco-editor/esm/vs/basic-languages/lua/lua.contribution.js";
import "monaco-editor/esm/vs/basic-languages/m3/m3.contribution.js";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js";
import "monaco-editor/esm/vs/basic-languages/mdx/mdx.contribution.js";
import "monaco-editor/esm/vs/basic-languages/mips/mips.contribution.js";
import "monaco-editor/esm/vs/basic-languages/msdax/msdax.contribution.js";
import "monaco-editor/esm/vs/basic-languages/mysql/mysql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/objective-c/objective-c.contribution.js";
import "monaco-editor/esm/vs/basic-languages/pascal/pascal.contribution.js";
import "monaco-editor/esm/vs/basic-languages/pascaligo/pascaligo.contribution.js";
import "monaco-editor/esm/vs/basic-languages/perl/perl.contribution.js";
import "monaco-editor/esm/vs/basic-languages/pgsql/pgsql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/php/php.contribution.js";
import "monaco-editor/esm/vs/basic-languages/pla/pla.contribution.js";
import "monaco-editor/esm/vs/basic-languages/postiats/postiats.contribution.js";
import "monaco-editor/esm/vs/basic-languages/powerquery/powerquery.contribution.js";
import "monaco-editor/esm/vs/basic-languages/powershell/powershell.contribution.js";
import "monaco-editor/esm/vs/basic-languages/protobuf/protobuf.contribution.js";
import "monaco-editor/esm/vs/basic-languages/pug/pug.contribution.js";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution.js";
import "monaco-editor/esm/vs/basic-languages/qsharp/qsharp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/r/r.contribution.js";
import "monaco-editor/esm/vs/basic-languages/razor/razor.contribution.js";
import "monaco-editor/esm/vs/basic-languages/redis/redis.contribution.js";
import "monaco-editor/esm/vs/basic-languages/redshift/redshift.contribution.js";
import "monaco-editor/esm/vs/basic-languages/restructuredtext/restructuredtext.contribution.js";
import "monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution.js";
import "monaco-editor/esm/vs/basic-languages/rust/rust.contribution.js";
import "monaco-editor/esm/vs/basic-languages/sb/sb.contribution.js";
import "monaco-editor/esm/vs/basic-languages/scala/scala.contribution.js";
import "monaco-editor/esm/vs/basic-languages/scheme/scheme.contribution.js";
import "monaco-editor/esm/vs/basic-languages/scss/scss.contribution.js";
import "monaco-editor/esm/vs/basic-languages/shell/shell.contribution.js";
import "monaco-editor/esm/vs/basic-languages/solidity/solidity.contribution.js";
import "monaco-editor/esm/vs/basic-languages/sophia/sophia.contribution.js";
import "monaco-editor/esm/vs/basic-languages/sparql/sparql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/st/st.contribution.js";
import "monaco-editor/esm/vs/basic-languages/swift/swift.contribution.js";
import "monaco-editor/esm/vs/basic-languages/systemverilog/systemverilog.contribution.js";
import "monaco-editor/esm/vs/basic-languages/tcl/tcl.contribution.js";
import "monaco-editor/esm/vs/basic-languages/twig/twig.contribution.js";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js";
import "monaco-editor/esm/vs/basic-languages/typespec/typespec.contribution.js";
import "monaco-editor/esm/vs/basic-languages/vb/vb.contribution.js";
import "monaco-editor/esm/vs/basic-languages/wgsl/wgsl.contribution.js";
import "monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js";
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js";

import { jsonDefaults } from "monaco-editor/esm/vs/language/json/monaco.contribution.js";
import {
  ScriptTarget,
  JsxEmit,
  ModuleResolutionKind,
  typescriptDefaults,
  javascriptDefaults,
} from "monaco-editor/esm/vs/language/typescript/monaco.contribution.js";
import { cssDefaults } from "monaco-editor/esm/vs/language/css/monaco.contribution.js";
import "monaco-editor/esm/vs/language/html/monaco.contribution.js";

import packageJsonSchema from "./schemas/package.schema.json";
import tsconfigSchema from "./schemas/tsconfig.schema.json";
import { registerReactTypes } from "./reactTypes";
import { configureMonacoTailwindcss } from "monaco-tailwind";
import { emmetHTML, emmetCSS, emmetJSX } from "emmet-monaco-es";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker.js?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker.js?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker.js?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker.js?worker";
import tailwindWorker from "monaco-tailwind/tailwind.worker?worker";

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case "json":
        return new jsonWorker();
      case "css":
      case "scss":
      case "less":
        return new cssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new htmlWorker();
      case "typescript":
      case "javascript":
        return new tsWorker();
      case "tailwindcss":
        return new tailwindWorker();
      default:
        return new editorWorker();
    }
  },
};

jsonDefaults.setDiagnosticsOptions({
  validate: true,
  enableSchemaRequest: false,
  schemas: [
    {
      uri: "https://json.schemastore.org/package.json",
      fileMatch: ["**/package.json"],
      schema: packageJsonSchema,
    },
    {
      uri: "https://json.schemastore.org/tsconfig.json",
      fileMatch: ["**/tsconfig.json", "**/jsconfig.json"],
      schema: tsconfigSchema,
    },
  ],
});

const tsCompilerOptions = {
  target: ScriptTarget.ES2020,
  jsx: JsxEmit.ReactJSX,
  allowNonTsExtensions: true,
  moduleResolution: ModuleResolutionKind.NodeJs,
  allowJs: true,
};
typescriptDefaults.setCompilerOptions(tsCompilerOptions);
javascriptDefaults.setCompilerOptions(tsCompilerOptions);

registerReactTypes(typescriptDefaults);
registerReactTypes(javascriptDefaults);

(monaco.languages as unknown as { css: { cssDefaults: typeof cssDefaults } }).css = { cssDefaults };

configureMonacoTailwindcss(monaco as any, {
  languageSelector: ["css", "scss", "less", "html", "javascript", "typescript"],
});

emmetHTML(monaco as any, ["html"]);
emmetCSS(monaco as any, ["css", "scss", "less"]);
emmetJSX(monaco as any, ["javascript", "typescript"]);

monaco.editor.defineTheme("aether-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    // --- Comments & Meta ---
    { token: "comment", foreground: "5c6370", fontStyle: "italic" },
    { token: "meta", foreground: "7f848e" },

    // --- Keywords & Control Flow ---
    { token: "keyword", foreground: "c678dd", fontStyle: "bold" },
    { token: "keyword.flow", foreground: "c678dd" },
    { token: "storage", foreground: "c678dd" },
    { token: "operator", foreground: "56b6c2" },
    { token: "delimiter", foreground: "abb2bf" },

    // --- Literals & Constants ---
    { token: "string", foreground: "98c379" },
    { token: "string.escape", foreground: "56b6c2" },
    { token: "number", foreground: "d19a66" },
    { token: "regexp", foreground: "56b6c2" },
    { token: "constant", foreground: "d19a66", fontStyle: "bold" },

    // --- Identifiers, Types & Functions ---
    { token: "type", foreground: "e5c07b" },
    { token: "class", foreground: "e5c07b", fontStyle: "bold" },
    { token: "interface", foreground: "e5c07b", fontStyle: "italic" },
    { token: "function", foreground: "61afef" },
    { token: "variable", foreground: "e06c75" },
    { token: "variable.parameter", foreground: "e06c75", fontStyle: "italic" },
    { token: "property", foreground: "e5c07b" },
    { token: "identifier", foreground: "abb2bf" },

    // --- JSX & TSX Highlighting (Cursor-Style) ---
    { token: "tag", foreground: "e06c75" },                          // Standard HTML tags (div, span)
    { token: "tag.identifier", foreground: "e06c75" },               // Tag names
    { token: "type.identifier.tag", foreground: "e5c07b" },          // React Components (<Header />)
    { token: "tag.component", foreground: "e5c07b" },                // Component tag scope
    { token: "attribute.name", foreground: "d19a66" },               // Props (className, onClick)
    { token: "attribute.value", foreground: "98c379" },              // Prop string values
    { token: "delimiter.html", foreground: "56b6c2" },               // Angle brackets < >
    { token: "delimiter.xml", foreground: "56b6c2" },                // Self-closing />
    { token: "punctuation.definition.tag", foreground: "56b6c2" },   // Tag braces

    // --- Cursor Markdown Syntax Polish ---
    { token: "keyword.md", foreground: "e06c75", fontStyle: "bold" },       // Markdown Headings (#, ##)
    { token: "string.md", foreground: "abb2bf" },                         // Normal Markdown body text
    { token: "variable.md", foreground: "61afef" },                       // Link URLs
    { token: "string.link.md", foreground: "61afef", fontStyle: "underline" }, // Link Text
    { token: "strong.md", foreground: "d19a66", fontStyle: "bold" },       // **Bold**
    { token: "emphasis.md", foreground: "c678dd", fontStyle: "italic" },   // *Italics*
    { token: "variable.source.md", foreground: "98c379" },                 // Blockquotes
    { token: "keyword.symbol.md", foreground: "56b6c2" }                   // Inline Code (`code`)
  ],
  colors: {
    // --- Canvas & Surfaces ---
    "editor.background": "#0b0d10",
    "editor.foreground": "#abb2bf",
    "editorGutter.background": "#0b0d10",

    // --- Line Numbers ---
    "editorLineNumber.foreground": "#3b4048",
    "editorLineNumber.activeForeground": "#636d83",

    // --- Active Line & Selection ---
    "editor.lineHighlightBackground": "#16191f80",
    "editor.lineHighlightBorder": "#00000000",
    "editorCursor.foreground": "#528bff",
    "editor.selectionBackground": "#3e445155",
    "editor.inactiveSelectionBackground": "#3e445133",
    "editor.selectionHighlightBackground": "#2c313a40",
    "editor.wordHighlightBackground": "#2c313a60",

    // --- Indent Guides & Whitespace ---
    "editorIndentGuide.background1": "#ffffff0a",
    "editorIndentGuide.activeBackground1": "#ffffff20",
    "editorWhitespace.foreground": "#ffffff10",

    // --- Popups, Autocomplete & Scrollbars ---
    "editorWidget.background": "#12151a",
    "editorWidget.border": "#1e222b",
    "editorSuggestWidget.background": "#12151a",
    "editorSuggestWidget.border": "#1e222b",
    "editorSuggestWidget.selectedBackground": "#2c313a80",
    "scrollbarSlider.background": "#ffffff0d",
    "scrollbarSlider.hoverBackground": "#ffffff1a",
    "scrollbarSlider.activeBackground": "#ffffff26"
  }
});

monaco.languages.register({ id: "diff" });
monaco.languages.setMonarchTokensProvider("diff", {
  tokenizer: {
    root: [
      [/^diff.*/, "comment"],
      [/^index.*/, "comment"],
      [/^---.*/, "comment"],
      [/^\+\+\+.*/, "comment"],
      [/^@@.*/, "keyword"],
      [/^\+.*/, "string"],
      [/^\-.*/, "keyword"],
    ],
  },
});

export { monaco };
