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
    { token: "comment", foreground: "7f848e", fontStyle: "italic" },
    { token: "keyword", foreground: "c678dd" },
    { token: "string", foreground: "98c379" },
    { token: "number", foreground: "d19a66" },
    { token: "regexp", foreground: "56b6c2" },
    { token: "type", foreground: "e5c07b" },
    { token: "class", foreground: "e5c07b" },
    { token: "interface", foreground: "e5c07b" },
    { token: "function", foreground: "61afef" },
    { token: "variable", foreground: "e06c75" },
    { token: "variable.predefined", foreground: "e06c75" },
    { token: "variable.parameter", foreground: "e06c75" },
    { token: "constant", foreground: "d19a66" },
    { token: "operator", foreground: "56b6c2" },
    { token: "delimiter", foreground: "abb2bf" },
    { token: "property", foreground: "e5c07b" },
    { token: "identifier", foreground: "abb2bf" },
    { token: "type.identifier", foreground: "e5c07b" },
    { token: "tag", foreground: "e06c75" },
    { token: "attribute.name", foreground: "d19a66" },
    { token: "attribute.value", foreground: "98c379" },
    { token: "meta.tag", foreground: "abb2bf" },
  ],
  colors: {
    "editor.background": "#0a0a0a",
    "editorGutter.background": "#0a0a0a",
    "editorLineNumber.foreground": "#495162",
    "editorLineNumber.activeForeground": "#abb2bf",
    "editor.lineHighlightBackground": "#ffffff08",
    "editor.lineHighlightBorder": "#00000000",
    "editorCursor.foreground": "#528bff",
    "editor.selectionBackground": "#3e445180",
    "editorIndentGuide.background": "#ffffff0c",
    "editorIndentGuide.activeBackground": "#ffffff24",
  },
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
