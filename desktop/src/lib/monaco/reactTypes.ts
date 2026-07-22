// Relative (not bare-specifier) paths, because @types/react's package.json
// `exports` map doesn't list these subpaths — Vite/Rollup enforce that map
// strictly for bare specifiers but not for plain relative file paths.
import reactGlobalTypes from "../../../node_modules/@types/react/global.d.ts?raw";
import reactTypes from "../../../node_modules/@types/react/index.d.ts?raw";
import reactJsxRuntimeTypes from "../../../node_modules/@types/react/jsx-runtime.d.ts?raw";
import reactDomTypes from "../../../node_modules/@types/react-dom/index.d.ts?raw";
import reactDomClientTypes from "../../../node_modules/@types/react-dom/client.d.ts?raw";
import type { TsLanguageServiceDefaults } from "monaco-editor/esm/vs/language/typescript/monaco.contribution.js";

/**
 * Real React/ReactDOM types for Monaco's bundled TS language service, so
 * hovering `useState`/JSX elements shows real signatures instead of `any`.
 * `index.d.ts` references `global.d.ts` via a relative triple-slash path, so
 * that file is registered too, at the matching virtual path, for the
 * reference to resolve.
 */
export function registerReactTypes(defaults: TsLanguageServiceDefaults): void {
  defaults.addExtraLib(reactGlobalTypes, "file:///node_modules/@types/react/global.d.ts");
  defaults.addExtraLib(reactTypes, "file:///node_modules/@types/react/index.d.ts");
  defaults.addExtraLib(reactJsxRuntimeTypes, "file:///node_modules/@types/react/jsx-runtime.d.ts");
  defaults.addExtraLib(reactDomTypes, "file:///node_modules/@types/react-dom/index.d.ts");
  defaults.addExtraLib(reactDomClientTypes, "file:///node_modules/@types/react-dom/client.d.ts");
}
