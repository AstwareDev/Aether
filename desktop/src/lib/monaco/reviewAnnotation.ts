import { monaco } from "./setup";
import type { ReviewIssue } from "../../types";

export interface AnnotationActions {
  onFix: (issue: ReviewIssue) => void;
  onDismiss: (issue: ReviewIssue) => void;
  onVote: (issue: ReviewIssue, vote: "up" | "down") => void;
}

const SEVERITY_LABEL: Record<ReviewIssue["severity"], string> = {
  bug: "Bug",
  security: "Security",
  performance: "Performance",
  improvement: "Improvement",
};

/** Renders `backtick`-quoted spans as inline code, escaping everything else. */
function renderInlineCode(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return text
    .split(/(`[^`]+`)/g)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 2
        ? `<code>${escape(part.slice(1, -1))}</code>`
        : escape(part),
    )
    .join("");
}

function icon(paths: string[], size = 14): string {
  const body = paths.map((d) => `<path stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${body}</svg>`;
}

const THUMB_UP = [
  "M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z",
  "M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3",
];
const THUMB_DOWN = [
  "M10 15V19a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z",
  "M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17",
];

/**
 * The inline review annotation: a card rendered in a Monaco view zone directly
 * beneath the flagged line, plus a line highlight and a gutter marker.
 */
export class ReviewAnnotation {
  private zoneId: string | null = null;
  private decorations: monaco.editor.IEditorDecorationsCollection | null = null;
  private root: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private issue: ReviewIssue | null = null;

  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    private actions: AnnotationActions,
  ) {}

  get current(): ReviewIssue | null {
    return this.issue;
  }

  show(issue: ReviewIssue) {
    this.clear();
    const model = this.editor.getModel();
    if (!model) return;

    this.issue = issue;
    const line = Math.min(Math.max(issue.line, 1), model.getLineCount());

    this.decorations = this.editor.createDecorationsCollection([
      {
        range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
        options: {
          isWholeLine: true,
          className: "aether-review-line",
          linesDecorationsClassName: `aether-review-gutter aether-review-gutter-${issue.severity}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
    ]);

    this.root = this.buildCard(issue);
    const container = document.createElement("div");
    container.className = "aether-review-zone";
    container.appendChild(this.root);

    this.editor.changeViewZones((accessor) => {
      this.zoneId = accessor.addZone({
        afterLineNumber: line,
        heightInPx: 0,
        domNode: container,
      });
    });

    // The card's height is only known once it is laid out, so the zone is
    // sized from the rendered element and kept in sync as it reflows.
    this.resizeObserver = new ResizeObserver(() => this.syncZoneHeight(line, container));
    this.resizeObserver.observe(this.root);
    this.syncZoneHeight(line, container);

    this.editor.revealLineInCenter(line);
    this.editor.setPosition({ lineNumber: line, column: 1 });
  }

  private syncZoneHeight(line: number, container: HTMLElement) {
    const height = this.root?.getBoundingClientRect().height ?? 0;
    if (height === 0 || this.zoneId === null) return;
    this.editor.changeViewZones((accessor) => {
      if (this.zoneId !== null) accessor.removeZone(this.zoneId);
      this.zoneId = accessor.addZone({
        afterLineNumber: line,
        heightInPx: height + 12,
        domNode: container,
      });
    });
  }

  private buildCard(issue: ReviewIssue): HTMLDivElement {
    const card = document.createElement("div");
    card.className = "aether-review-card";
    card.addEventListener("mousedown", (e) => e.stopPropagation());

    const header = document.createElement("div");
    header.className = "aether-review-header";

    const badge = document.createElement("span");
    badge.className = `aether-review-badge aether-review-badge-${issue.severity}`;
    badge.textContent = SEVERITY_LABEL[issue.severity];

    const title = document.createElement("span");
    title.className = "aether-review-title";
    title.textContent = issue.title;

    header.append(badge, title);

    const body = document.createElement("p");
    body.className = "aether-review-body";
    body.innerHTML = renderInlineCode(issue.description);

    const footer = document.createElement("div");
    footer.className = "aether-review-footer";

    const fix = document.createElement("button");
    fix.type = "button";
    fix.className = "aether-review-btn primary";
    fix.textContent = "Fix with Agent";
    fix.addEventListener("click", () => this.actions.onFix(issue));

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "aether-review-btn";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => this.actions.onDismiss(issue));

    const spacer = document.createElement("div");
    spacer.className = "aether-review-spacer";

    const votes = document.createElement("div");
    votes.className = "aether-review-votes";
    for (const vote of ["up", "down"] as const) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "aether-review-vote";
      btn.title = vote === "up" ? "Helpful" : "Not helpful";
      btn.innerHTML = icon(vote === "up" ? THUMB_UP : THUMB_DOWN);
      btn.addEventListener("click", () => {
        votes.querySelectorAll(".aether-review-vote").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.actions.onVote(issue, vote);
      });
      votes.appendChild(btn);
    }

    footer.append(fix, dismiss, spacer, votes);
    card.append(header, body, footer);
    return card;
  }

  clear() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.zoneId !== null) {
      const zoneId = this.zoneId;
      this.editor.changeViewZones((accessor) => accessor.removeZone(zoneId));
      this.zoneId = null;
    }
    this.decorations?.clear();
    this.decorations = null;
    this.root = null;
    this.issue = null;
  }
}

let styleInjected = false;

export function ensureReviewStyles(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
.aether-review-line { background: rgba(139, 147, 255, 0.07); }
.aether-review-gutter { width: 3px !important; margin-left: 3px; }
.aether-review-gutter-bug { background: #f87171; }
.aether-review-gutter-security { background: #fb923c; }
.aether-review-gutter-performance { background: #facc15; }
.aether-review-gutter-improvement { background: #8b93ff; }
.aether-review-zone { display: flex; padding: 6px 0 6px 0; }
.aether-review-card {
  width: min(760px, calc(100% - 24px));
  margin-left: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #0d0d0f;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  font-family: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #d4d4d8;
}
.aether-review-header { display: flex; align-items: center; gap: 8px; }
.aether-review-badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.aether-review-badge-bug { background: rgba(248, 113, 113, 0.15); color: #fca5a5; }
.aether-review-badge-security { background: rgba(251, 146, 60, 0.15); color: #fdba74; }
.aether-review-badge-performance { background: rgba(250, 204, 21, 0.15); color: #fde047; }
.aether-review-badge-improvement { background: rgba(139, 147, 255, 0.15); color: #a0a7ff; }
.aether-review-title { font-size: 13px; font-weight: 600; color: #f4f4f5; }
.aether-review-body { margin: 0; font-size: 12.5px; line-height: 1.6; color: #a1a1aa; }
.aether-review-body code {
  font-family: 'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 4px;
  padding: 1px 4px;
  color: #e4e4e7;
}
.aether-review-footer { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
.aether-review-spacer { flex: 1; }
.aether-review-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #d4d4d8;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.aether-review-btn:hover { background: rgba(255, 255, 255, 0.1); color: #ffffff; }
.aether-review-btn.primary {
  border-color: rgba(139, 147, 255, 0.35);
  background: rgba(139, 147, 255, 0.15);
  color: #a0a7ff;
}
.aether-review-btn.primary:hover { background: rgba(139, 147, 255, 0.25); color: #c4c9ff; }
.aether-review-votes { display: flex; align-items: center; gap: 2px; }
.aether-review-vote {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #52525b;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.aether-review-vote:hover { background: rgba(255, 255, 255, 0.06); color: #a1a1aa; }
.aether-review-vote.active { color: #a0a7ff; }
`;
  document.head.appendChild(style);
}
