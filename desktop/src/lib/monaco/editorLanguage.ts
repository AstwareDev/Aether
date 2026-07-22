import { baseName, extensionOf } from "../fs";

/**
 * Pick a Monaco language id from a file path, or "plaintext" for none.
 *
 * Known gaps: TOML and Vue/Svelte single-file components aren't in Monaco's
 * bundled basic-languages set (no third-party tokenizer added for them here),
 * so those extensions fall back to plaintext.
 */
export function languageForPath(path: string): string {
  if (baseName(path) === "Dockerfile") return "dockerfile";

  switch (extensionOf(path)) {
    case "js":
    case "cjs":
    case "mjs":
    case "jsx":
      return "javascript";
    case "ts":
    case "cts":
    case "mts":
    case "tsx":
      return "typescript";
    case "json":
    case "jsonc":
      return "json";
    case "html":
    case "htm":
      return "html";
    case "css":
      return "css";
    case "scss":
      return "scss";
    case "less":
      return "less";
    case "md":
    case "markdown":
      return "markdown";
    case "rs":
      return "rust";
    case "py":
    case "pyi":
      return "python";
    case "yaml":
    case "yml":
      return "yaml";
    case "xml":
      return "xml";
    case "sh":
    case "bash":
    case "zsh":
      return "shell";
    case "sql":
      return "sql";
    case "graphql":
    case "gql":
      return "graphql";
    case "php":
      return "php";
    case "java":
      return "java";
    case "kt":
    case "kts":
      return "kotlin";
    case "swift":
      return "swift";
    case "cs":
      return "csharp";
    case "go":
      return "go";
    case "rb":
      return "ruby";
    case "lua":
      return "lua";
    case "pl":
    case "pm":
      return "perl";
    case "r":
      return "r";
    case "c":
    case "h":
    case "cpp":
    case "cc":
    case "hpp":
      return "cpp";
    case "m":
    case "mm":
      return "objective-c";
    case "dockerfile":
      return "dockerfile";
    case "ini":
    case "cfg":
      return "ini";
    case "bat":
    case "cmd":
      return "bat";
    case "ps1":
      return "powershell";
    case "dart":
      return "dart";
    case "scala":
      return "scala";
    case "clj":
    case "cljs":
      return "clojure";
    case "ex":
    case "exs":
      return "elixir";
    case "fs":
    case "fsx":
      return "fsharp";
    case "coffee":
      return "coffee";
    case "hbs":
    case "handlebars":
      return "handlebars";
    case "tf":
    case "hcl":
      return "hcl";
    case "proto":
      return "protobuf";
    default:
      return "plaintext";
  }
}
