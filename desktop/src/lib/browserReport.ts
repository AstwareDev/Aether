import type { BrowserElement } from "../types";

/**
 * Renders an inspected element as Markdown meant to be pasted into a coding
 * agent. The goal is that a reader who cannot see the page can still tell what
 * the element *is*, where it lives in the source, and how it is styled — so it
 * leads with identity and component provenance rather than raw geometry.
 */
export function elementReport(element: BrowserElement): string {
  const lines: string[] = [];
  const section = (title: string) => {
    lines.push("", `## ${title}`);
  };

  lines.push(`# ${element.label}`);
  lines.push("");
  lines.push(`- Page: ${element.pageUrl}${element.pageTitle ? ` — "${element.pageTitle}"` : ""}`);
  lines.push(`- Selector: \`${element.selector}\``);
  if (element.selector !== element.path) lines.push(`- DOM path: \`${element.path}\``);
  lines.push(
    `- Box: ${element.rect.width}×${element.rect.height} at (${element.rect.x}, ${element.rect.y})` +
      ` · margin ${element.box.margin.join("/")} · border ${element.box.border.join("/")}` +
      ` · padding ${element.box.padding.join("/")}`,
  );

  const { component } = element;
  if (component?.framework) {
    section("Component");
    lines.push(`- Framework: ${component.framework}`);
    if (component.stack.length) lines.push(`- Tree: ${component.stack.join(" > ")}`);
    if (component.source) lines.push(`- Source: ${component.source}`);
    if (component.props.length) {
      lines.push("- Props:");
      for (const [name, value] of component.props) lines.push(`  - \`${name}\`: ${value}`);
    }
  }

  if (element.ancestors.length) {
    section("Ancestors");
    lines.push(element.ancestors.map((a) => a.label).join(" > ") + ` > **${element.label}**`);
  }

  if (element.attrs.length) {
    section("Attributes");
    for (const [name, value] of element.attrs) lines.push(`- \`${name}\` = ${JSON.stringify(value)}`);
  }

  if (element.text) {
    section("Text content");
    lines.push(`> ${element.text}`);
  }

  if (element.html) {
    section("HTML");
    lines.push("```html", element.html, "```");
  }

  if (element.css.length) {
    section("Matching CSS rules");
    lines.push("```css");
    for (const rule of element.css) {
      lines.push(`/* ${rule.origin} */`);
      lines.push(rule.text);
    }
    lines.push("```");
  } else {
    section("Matching CSS rules");
    lines.push("_None readable — the page's stylesheets are served from another origin._");
  }

  if (element.styles.length) {
    section("Computed styles");
    lines.push("```");
    for (const [prop, value] of element.styles) lines.push(`${prop}: ${value}`);
    lines.push("```");
  }

  return lines.join("\n");
}
