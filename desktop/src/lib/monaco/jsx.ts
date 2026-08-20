import type { languages } from "monaco-editor/esm/vs/editor/editor.api.js";
import { language as javascriptLanguage } from "monaco-editor/esm/vs/basic-languages/javascript/javascript.js";
import { language as typescriptLanguage } from "monaco-editor/esm/vs/basic-languages/typescript/typescript.js";

/**
 * Monaco's stock TypeScript/JavaScript Monarch grammars have no JSX rules at
 * all, so markup inside `return (…)` falls through to the operator and
 * identifier rules and renders as flat text. These states add the missing
 * tag/attribute/expression tokenization on top of the built-in grammar.
 *
 * Monarch has no parser context, so opening a tag is decided by lookahead. The
 * guards below are tuned to keep TypeScript generics — `useState<User>(…)`,
 * `Map<string, V>`, `Set<Item> = …` — out of JSX, which is where a naive
 * `<identifier` rule goes wrong and corrupts the rest of the file.
 */

const HTML_TAGS =
  "a|abbr|address|area|article|aside|audio|b|base|bdi|bdo|big|blockquote|body|br|button|canvas|caption|cite|code|col|colgroup|data|datalist|dd|del|details|dfn|dialog|div|dl|dt|em|embed|fieldset|figcaption|figure|footer|form|h1|h2|h3|h4|h5|h6|head|header|hgroup|hr|html|i|iframe|img|input|ins|kbd|label|legend|li|link|main|map|mark|menu|meta|meter|nav|noscript|object|ol|optgroup|option|output|p|param|picture|pre|progress|q|rp|rt|ruby|s|samp|script|section|select|slot|small|source|span|strong|style|sub|summary|sup|table|tbody|td|template|textarea|tfoot|th|thead|time|title|tr|track|u|ul|var|video|wbr" +
  "|circle|clipPath|defs|ellipse|feBlend|feColorMatrix|feGaussianBlur|filter|foreignObject|g|line|linearGradient|marker|mask|path|pattern|polygon|polyline|radialGradient|rect|stop|svg|text|tspan|use";

/**
 * What may follow a tag name for the `<` to be markup rather than a type
 * argument list: end of line, a self-close, a `>` that isn't followed by an
 * operator or call, or whitespace leading into an attribute. The last branch is
 * what separates `<Panel onClose={…}` from `useState<State | null>(…)`.
 */
const TAG_SUFFIX =
  `(?:$|\\s*/>|>(?!\\s*[=;,)\\]}(])|\\s+(?!extends\\b|implements\\b)[A-Za-z_$@{/>])`;

const DOTTED_NAME = `[A-Za-z_$][\\w$]*(?:\\.[\\w$]+)+`;
const COMPONENT_NAME = `[A-Z][\\w$]*`;

/** `<Component`, `<Foo.Bar`, `<motion.div` — but not `useState<User>(…)`. */
const COMPONENT_OPEN = new RegExp(`<(?=(?:${DOTTED_NAME}|${COMPONENT_NAME})${TAG_SUFFIX})`);

/** `<div`, `<svg` — a known element name only, so `Map<string, V>` stays a generic. */
const ELEMENT_OPEN = new RegExp(`<(?=(?:${HTML_TAGS})${TAG_SUFFIX})`);

const JSX_ROOT_RULES: languages.IMonarchLanguageRule[] = [
  [/<>/, { token: "delimiter.html", next: "@jsxChildren" }],
  [COMPONENT_OPEN, { token: "delimiter.html", next: "@jsxTagName" }],
  [ELEMENT_OPEN, { token: "delimiter.html", next: "@jsxTagName" }],
];

const JSX_STATES: Record<string, languages.IMonarchLanguageRule[]> = {
  jsxTagName: [
    [/[A-Za-z_$][\w$]*(?:\.[\w$]+)+/, { token: "type.identifier", switchTo: "@jsxTagAttributes" }],
    [/[A-Z][\w$]*/, { token: "type.identifier", switchTo: "@jsxTagAttributes" }],
    [/[a-z][\w$-]*/, { token: "tag", switchTo: "@jsxTagAttributes" }],
    [/./, { token: "delimiter.html", switchTo: "@jsxTagAttributes" }],
  ],

  jsxTagAttributes: [
    [/\s+/, ""],
    [/\/>/, { token: "delimiter.html", next: "@pop" }],
    [/>/, { token: "delimiter.html", switchTo: "@jsxChildren" }],
    [/\{/, { token: "delimiter.html", next: "@jsxExpression" }],
    [/[\w$][\w$.-]*(?=\s*=)/, "attribute.name"],
    [/"[^"]*"/, "attribute.value"],
    [/'[^']*'/, "attribute.value"],
    [/=/, "delimiter"],
    [/[\w$][\w$.-]*/, "attribute.name"],
  ],

  jsxChildren: [
    [/<\//, { token: "delimiter.html", switchTo: "@jsxClosingTag" }],
    [/<>/, { token: "delimiter.html", next: "@jsxChildren" }],
    [COMPONENT_OPEN, { token: "delimiter.html", next: "@jsxTagName" }],
    [ELEMENT_OPEN, { token: "delimiter.html", next: "@jsxTagName" }],
    [/\{/, { token: "delimiter.html", next: "@jsxExpression" }],
    [/[^<{]+/, ""],
  ],

  jsxClosingTag: [
    [/[A-Za-z_$][\w$]*(?:\.[\w$]+)+/, "type.identifier"],
    [/[A-Z][\w$]*/, "type.identifier"],
    [/[a-z][\w$-]*/, "tag"],
    [/>/, { token: "delimiter.html", next: "@pop" }],
    [/./, ""],
  ],

  // Braces nest, so an object literal prop like `{{ opacity: 0 }}` closes at
  // the right brace instead of leaking back into markup.
  jsxExpression: [
    [/\}/, { token: "delimiter.html", next: "@pop" }],
    [/\{/, { token: "delimiter.html", next: "@jsxExpression" }],
    { include: "@root" },
  ],
};

function withJsx(base: languages.IMonarchLanguage): languages.IMonarchLanguage {
  const tokenizer = base.tokenizer as Record<string, languages.IMonarchLanguageRule[]>;
  return {
    ...base,
    tokenizer: {
      ...tokenizer,
      ...JSX_STATES,
      root: [...JSX_ROOT_RULES, ...tokenizer.root],
    },
  };
}

/**
 * Installs the JSX grammars over the stock ones. The basic-languages
 * contribution registers a lazy *factory* for these language ids; re-registering
 * the factory disposes theirs, and the concrete provider then takes precedence
 * over any factory at all. Doing both means the JSX grammar wins whichever path
 * Monaco takes to resolve a tokenizer.
 */
export function registerJsxGrammars(monaco: typeof import("monaco-editor/esm/vs/editor/editor.api.js")): void {
  for (const [languageId, base] of [
    ["typescript", typescriptLanguage],
    ["javascript", javascriptLanguage],
  ] as const) {
    const grammar = withJsx(base);
    monaco.languages.registerTokensProviderFactory(languageId, { create: () => grammar });
    monaco.languages.setMonarchTokensProvider(languageId, grammar);
  }
}
