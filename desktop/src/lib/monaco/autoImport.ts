import type { editor, languages, IRange } from "monaco-editor/esm/vs/editor/editor.api.js";

type Monaco = typeof import("monaco-editor/esm/vs/editor/editor.api.js");

/**
 * Monaco's bundled TypeScript worker calls `getCompletionsAtPosition` without
 * preferences, so `includeCompletionsForModuleExports` is off and it can never
 * offer a symbol it hasn't already seen imported. This module supplies the
 * missing half: a lightweight index of what every workspace module exports,
 * surfaced as completions that write their own import statement and as a quick
 * fix on "cannot find name".
 */

type SymbolKind = "default" | "named" | "type";

interface ExportSymbol {
  name: string;
  kind: SymbolKind;
  /** Monaco URI path of the declaring module. */
  file: string;
}

const LANGUAGES = ["javascript", "typescript"];
const REINDEX_DEBOUNCE_MS = 400;
const MAX_SUGGESTIONS = 50;
const SOURCE_SUFFIX = /\.(?:tsx?|jsx?|mjs|cjs)$/i;

const index = new Map<string, ExportSymbol[]>();

// ── extraction ───────────────────────────────────────────────────────────────

const DECLARATION = /^[ \t]*export[ \t]+(?:declare[ \t]+)?(?:async[ \t]+)?(function\*?|class|const|let|var|interface|type|enum)[ \t]+([A-Za-z_$][\w$]*)/gm;
const NAMED_BLOCK = /^[ \t]*export[ \t]*\{([^}]*)\}/gm;
const DEFAULT_NAMED = /^[ \t]*export[ \t]+default[ \t]+(?:async[ \t]+)?(?:function\*?|class)[ \t]+([A-Za-z_$][\w$]*)/m;
const DEFAULT_ANY = /^[ \t]*export[ \t]+default[ \t]+/m;

const TYPE_DECLARATIONS = new Set(["interface", "type"]);

/** Filename without directories or extension, used to name anonymous defaults. */
function moduleBaseName(file: string): string {
  const name = file.slice(file.lastIndexOf("/") + 1).replace(SOURCE_SUFFIX, "");
  return name === "index" ? file.slice(0, file.lastIndexOf("/")).split("/").pop() ?? name : name;
}

function toIdentifier(name: string): string {
  const cleaned = name.replace(/[^\w$]/g, " ").replace(/\s+(.)/g, (_, c: string) => c.toUpperCase());
  return /^[A-Za-z_$]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

function extractExports(file: string, text: string): ExportSymbol[] {
  const symbols: ExportSymbol[] = [];
  const seen = new Set<string>();

  const add = (name: string, kind: SymbolKind) => {
    if (!name || seen.has(name + kind)) return;
    seen.add(name + kind);
    symbols.push({ name, kind, file });
  };

  for (const match of text.matchAll(DECLARATION)) {
    add(match[2], TYPE_DECLARATIONS.has(match[1]) ? "type" : "named");
  }

  for (const match of text.matchAll(NAMED_BLOCK)) {
    for (const part of match[1].split(",")) {
      const alias = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (alias && alias !== "default" && /^[A-Za-z_$][\w$]*$/.test(alias)) add(alias, "named");
    }
  }

  const namedDefault = DEFAULT_NAMED.exec(text);
  if (namedDefault) add(namedDefault[1], "default");
  else if (DEFAULT_ANY.test(text)) add(toIdentifier(moduleBaseName(file)), "default");

  return symbols;
}

// ── module specifiers ────────────────────────────────────────────────────────

function specifierBetween(fromFile: string, toFile: string): string {
  const from = fromFile.slice(0, fromFile.lastIndexOf("/")).split("/");
  const to = toFile.replace(SOURCE_SUFFIX, "").split("/");

  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared++;

  const up = from.slice(shared).map(() => "..");
  let down = to.slice(shared);
  if (down[down.length - 1] === "index" && down.length > 1) down = down.slice(0, -1);

  const parts = [...up, ...down];
  if (!parts.length) return "./index";
  return parts[0].startsWith(".") ? parts.join("/") : `./${parts.join("/")}`;
}

// ── existing imports ─────────────────────────────────────────────────────────

const IMPORT_STATEMENT = /^[ \t]*import[ \t]+(?:type[ \t]+)?([^;'"]*?)[ \t]*from[ \t]*["']([^"']+)["'][ \t]*;?/gm;

interface ExistingImport {
  specifier: string;
  clause: string;
  line: number;
  text: string;
}

function readImports(text: string): { imports: ExistingImport[]; bound: Set<string>; lastLine: number } {
  const imports: ExistingImport[] = [];
  const bound = new Set<string>();
  let lastLine = 0;

  for (const match of text.matchAll(IMPORT_STATEMENT)) {
    const line = text.slice(0, match.index ?? 0).split("\n").length;
    lastLine = Math.max(lastLine, line);
    imports.push({ specifier: match[2], clause: match[1].trim(), line, text: match[0] });

    const braces = /\{([^}]*)\}/.exec(match[1]);
    if (braces) {
      for (const part of braces[1].split(",")) {
        const alias = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (alias) bound.add(alias);
      }
    }
    const head = match[1].replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+([\w$]+)/, "$1").trim();
    for (const part of head.split(",")) {
      const name = part.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) bound.add(name);
    }
  }

  return { imports, bound, lastLine };
}

/** Edit that brings `symbol` into `model`, extending an import when one exists. */
function importEdit(
  model: editor.ITextModel,
  symbol: ExportSymbol,
): languages.TextEdit | null {
  const text = model.getValue();
  const specifier = specifierBetween(model.uri.path, symbol.file);
  const { imports, lastLine } = readImports(text);
  const existing = imports.find((i) => i.specifier === specifier);

  if (existing) {
    const braces = /\{([^}]*)\}/.exec(existing.clause);
    let clause: string;
    if (symbol.kind === "default") {
      if (/^[A-Za-z_$][\w$]*\s*(,|$)/.test(existing.clause)) return null;
      clause = `${symbol.name}, ${existing.clause}`;
    } else if (braces) {
      clause = existing.clause.replace(/\{([^}]*)\}/, (_, inner: string) => {
        const entries = inner.split(",").map((s) => s.trim()).filter(Boolean);
        entries.push(symbol.name);
        return `{ ${entries.join(", ")} }`;
      });
    } else {
      clause = `${existing.clause}, { ${symbol.name} }`;
    }
    const replacement = `import ${clause} from "${specifier}";`;
    return {
      range: {
        startLineNumber: existing.line,
        startColumn: 1,
        endLineNumber: existing.line,
        endColumn: model.getLineMaxColumn(existing.line),
      },
      text: replacement,
    };
  }

  const clause = symbol.kind === "default" ? symbol.name : `{ ${symbol.name} }`;
  const keyword = symbol.kind === "type" ? "import type" : "import";
  const line = lastLine;
  return {
    range: {
      startLineNumber: line + 1,
      startColumn: 1,
      endLineNumber: line + 1,
      endColumn: 1,
    },
    text: `${keyword} ${clause} from "${specifier}";\n`,
  };
}

// ── indexing ─────────────────────────────────────────────────────────────────

function indexModel(model: editor.ITextModel): void {
  const file = model.uri.path;
  if (!SOURCE_SUFFIX.test(file)) return;
  const symbols = extractExports(file, model.getValue());
  if (symbols.length) index.set(file, symbols);
  else index.delete(file);
}

function candidatesFor(currentFile: string, prefix: string, bound: Set<string>): ExportSymbol[] {
  const needle = prefix.toLowerCase();
  const out: ExportSymbol[] = [];
  for (const [file, symbols] of index) {
    if (file === currentFile) continue;
    for (const symbol of symbols) {
      if (bound.has(symbol.name)) continue;
      if (needle && !symbol.name.toLowerCase().startsWith(needle)) continue;
      out.push(symbol);
      if (out.length >= MAX_SUGGESTIONS) return out;
    }
  }
  return out;
}

const COMPLETION_KINDS: Record<SymbolKind, languages.CompletionItemKind> = {
  default: 12 as languages.CompletionItemKind,
  named: 12 as languages.CompletionItemKind,
  type: 7 as languages.CompletionItemKind,
};

// "Cannot find name 'X'" / "Cannot find name 'X'. Did you mean …"
const MISSING_NAME_CODES = new Set(["2304", "2552", "2686"]);

export function registerAutoImports(monaco: Monaco): void {
  for (const model of monaco.editor.getModels()) indexModel(model);

  const timers = new Map<string, number>();
  monaco.editor.onDidCreateModel((model) => {
    indexModel(model);
    const key = model.uri.toString();
    model.onDidChangeContent(() => {
      window.clearTimeout(timers.get(key));
      timers.set(key, window.setTimeout(() => indexModel(model), REINDEX_DEBOUNCE_MS));
    });
    model.onWillDispose(() => {
      window.clearTimeout(timers.get(key));
      timers.delete(key);
      index.delete(model.uri.path);
    });
  });

  monaco.languages.registerCompletionItemProvider(LANGUAGES, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      if (word.word.length < 1) return { suggestions: [] };

      const range: IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const { bound } = readImports(model.getValue());

      const suggestions = candidatesFor(model.uri.path, word.word, bound).map((symbol) => {
        const specifier = specifierBetween(model.uri.path, symbol.file);
        const edit = importEdit(model, symbol);
        return {
          label: symbol.name,
          kind: COMPLETION_KINDS[symbol.kind],
          detail: `Add import from "${specifier}"`,
          insertText: symbol.name,
          range,
          // Auto-imports rank below anything already in scope, as in VS Code.
          sortText: `￿${symbol.name}`,
          additionalTextEdits: edit ? [edit] : undefined,
        } satisfies languages.CompletionItem;
      });

      return { suggestions };
    },
  });

  monaco.languages.registerCodeActionProvider(LANGUAGES, {
    provideCodeActions(model, _range, context) {
      const actions: languages.CodeAction[] = [];

      for (const marker of context.markers) {
        const code = typeof marker.code === "object" ? marker.code?.value : marker.code;
        if (!MISSING_NAME_CODES.has(String(code ?? ""))) continue;
        const name = model.getValueInRange(marker);
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;

        for (const [file, symbols] of index) {
          if (file === model.uri.path) continue;
          for (const symbol of symbols) {
            if (symbol.name !== name) continue;
            const edit = importEdit(model, symbol);
            if (!edit) continue;
            actions.push({
              title: `Add import from "${specifierBetween(model.uri.path, file)}"`,
              kind: "quickfix",
              diagnostics: [marker],
              edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: edit }] },
            });
          }
        }
      }

      return { actions, dispose: () => {} };
    },
  });
}
