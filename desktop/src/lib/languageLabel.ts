import { baseName, extensionOf } from "./fs";

export function languageLabelForPath(path: string): string {
  if (baseName(path) === "Dockerfile") return "Dockerfile";

  switch (extensionOf(path)) {
    case "js":
    case "cjs":
    case "mjs":
      return "JavaScript";
    case "jsx":
      return "JavaScript React";
    case "ts":
    case "cts":
    case "mts":
      return "TypeScript";
    case "tsx":
      return "TypeScript React";
    case "json":
    case "jsonc":
      return "JSON";
    case "html":
    case "htm":
      return "HTML";
    case "css":
      return "CSS";
    case "scss":
      return "SCSS";
    case "less":
      return "Less";
    case "md":
    case "markdown":
      return "Markdown";
    case "rs":
      return "Rust";
    case "py":
    case "pyi":
      return "Python";
    case "png":
      return "PNG Image";
    case "jpg":
    case "jpeg":
      return "JPEG Image";
    case "gif":
      return "GIF Image";
    case "webp":
      return "WebP Image";
    case "svg":
      return "SVG Image";
    case "bmp":
      return "BMP Image";
    case "ico":
      return "Icon";
    case "yaml":
    case "yml":
      return "YAML";
    case "drawio":
      return "Drawio";
    case "xml":
      return "XML";
    case "sh":
    case "bash":
    case "zsh":
      return "Shell Script";
    case "sql":
      return "SQL";
    case "graphql":
    case "gql":
      return "GraphQL";
    case "php":
      return "PHP";
    case "java":
      return "Java";
    case "kt":
    case "kts":
      return "Kotlin";
    case "swift":
      return "Swift";
    case "cs":
      return "C#";
    case "go":
      return "Go";
    case "rb":
      return "Ruby";
    case "lua":
      return "Lua";
    case "pl":
    case "pm":
      return "Perl";
    case "r":
      return "R";
    case "c":
    case "h":
      return "C";
    case "cpp":
    case "cc":
    case "hpp":
      return "C++";
    case "m":
    case "mm":
      return "Objective-C";
    case "dockerfile":
      return "Dockerfile";
    case "ini":
    case "cfg":
      return "INI";
    case "bat":
    case "cmd":
      return "Batch";
    case "ps1":
      return "PowerShell";
    case "dart":
      return "Dart";
    case "scala":
      return "Scala";
    case "clj":
    case "cljs":
      return "Clojure";
    case "ex":
    case "exs":
      return "Elixir";
    case "fs":
    case "fsx":
      return "F#";
    case "coffee":
      return "CoffeeScript";
    case "hbs":
    case "handlebars":
      return "Handlebars";
    case "tf":
    case "hcl":
      return "HCL";
    case "proto":
      return "Protocol Buffers";
    default:
      return "Plain Text";
  }
}
