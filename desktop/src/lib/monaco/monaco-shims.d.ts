// monaco-editor only ships real types for its per-language subpath modules
// through the full aggregated "monaco-editor" bundle (editor.main.d.ts),
// which we deliberately avoid importing at runtime to keep the bundle
// lightweight (see setup.ts). These modules' own .d.ts files are empty
// (`export {}`), even though the .js already exports these bindings, so we
// declare the small slice of their shape we actually use.

declare module "monaco-editor/esm/vs/language/json/monaco.contribution.js" {
  export interface JsonDiagnosticsOptions {
    validate?: boolean;
    allowComments?: boolean;
    schemas?: unknown[];
    enableSchemaRequest?: boolean;
    schemaRequest?: "error" | "warning" | "ignore";
    schemaValidation?: "error" | "warning" | "ignore";
    comments?: "error" | "warning" | "ignore";
    trailingCommas?: "error" | "warning" | "ignore";
  }
  export interface JsonLanguageServiceDefaults {
    readonly diagnosticsOptions: JsonDiagnosticsOptions;
    setDiagnosticsOptions(options: JsonDiagnosticsOptions): void;
  }
  export const jsonDefaults: JsonLanguageServiceDefaults;
}

declare module "monaco-editor/esm/vs/language/css/monaco.contribution.js" {
  export interface CssLanguageServiceDefaults {
    readonly options: Record<string, unknown>;
    setOptions(options: Record<string, unknown>): void;
  }
  export const cssDefaults: CssLanguageServiceDefaults;
  export const scssDefaults: CssLanguageServiceDefaults;
  export const lessDefaults: CssLanguageServiceDefaults;
}

declare module "monaco-editor/esm/vs/language/typescript/monaco.contribution.js" {
  export const ScriptTarget: {
    ES3: 0;
    ES5: 1;
    ES2015: 2;
    ES2016: 3;
    ES2017: 4;
    ES2018: 5;
    ES2019: 6;
    ES2020: 7;
    ESNext: 99;
    JSON: 100;
    Latest: 99;
  };
  export const JsxEmit: {
    None: 0;
    Preserve: 1;
    React: 2;
    ReactNative: 3;
    ReactJSX: 4;
    ReactJSXDev: 5;
  };
  export const ModuleResolutionKind: {
    Classic: 1;
    NodeJs: 2;
  };
  export interface TsCompilerOptions {
    target?: number;
    jsx?: number;
    allowNonTsExtensions?: boolean;
    moduleResolution?: number;
    allowJs?: boolean;
  }
  export interface TsLanguageServiceDefaults {
    setCompilerOptions(options: TsCompilerOptions): void;
    addExtraLib(content: string, filePath?: string): { dispose(): void };
  }
  export const typescriptDefaults: TsLanguageServiceDefaults;
  export const javascriptDefaults: TsLanguageServiceDefaults;
}
