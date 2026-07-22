import { monaco } from "./setup";
import { languageLabelForPath } from "../languageLabel";
import { dirName } from "../fs";
import { resolveWorkspaceImport, getWorkspaceModelText } from "./workspaceModels";
import { renderMarkdown, colorizeCodeBlocks } from "./markdown";
import { computeLineDiff, type DiffHunk } from "./lineDiff";
import {
  runCompletion,
  getAiSettings,
  setAiSetting,
  isBrainReady,
  subscribeAiSettings,
  CLAUDE_MODELS,
  buildSystemPrompt,
} from "../ai";
import type { ChatMessage } from "../../types";
import type { Mode, AiState } from "../../types";
import { MERCURY_ICON_SVG, ANTHROPIC_ICON_SVG, LM_STUDIO_ICON_SVG } from "../../icons";

/** Minimal external store — Monaco has no built-in place to stash UI state. */
class AiStore {
  private state: AiState | null = null;
  private listeners = new Set<() => void>();

  get(): AiState | null {
    return this.state;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: AiState | null) {
    this.state = next;
    for (const l of this.listeners) l();
  }

  open(mode: Mode, from: number, to: number, originalText: string) {
    this.set({
      gen: (this.state?.gen ?? 0) + 1,
      mode,
      from,
      to,
      originalFrom: from,
      originalTo: to,
      originalText,
      status: "input",
      turns: [],
      streamingText: "",
      error: "",
    });
  }

  close() {
    this.set(null);
  }

  setMode(mode: Mode) {
    if (!this.state || this.state.turns.length > 0 || this.state.mode === mode) return;
    this.set({ ...this.state, mode, status: "input", error: "" });
  }

  submitUserTurn(content: string) {
    if (!this.state) return;
    this.set({
      ...this.state,
      turns: [...this.state.turns, { role: "user", content }],
      status: "streaming",
      streamingText: "",
      error: "",
    });
  }

  /** Re-run the last (already-pushed) user turn without duplicating it. */
  retryStream() {
    if (!this.state) return;
    this.set({ ...this.state, status: "streaming", streamingText: "", error: "" });
  }

  cancelStream() {
    if (!this.state || this.state.status !== "streaming") return;
    this.set({
      ...this.state,
      gen: this.state.gen + 1,
      status: "input",
      streamingText: "",
    });
  }

  appendStreaming(text: string) {
    if (!this.state) return;
    this.set({ ...this.state, streamingText: this.state.streamingText + text });
  }

  /** Diffusion models (Mercury) send the whole message-so-far per chunk. */
  replaceStreaming(text: string) {
    if (!this.state) return;
    this.set({ ...this.state, streamingText: text });
  }

  finishTurn() {
    if (!this.state) return;
    const content = this.state.streamingText;
    const code = this.state.mode === "edit" ? stripFences(content) : undefined;
    this.set({
      ...this.state,
      turns: [...this.state.turns, { role: "assistant", content, code }],
      streamingText: "",
      status: "done",
    });
  }

  fail(message: string) {
    if (!this.state) return;
    this.set({ ...this.state, status: "error", error: message });
  }

  /** Record the proposed range after a diff apply (edit mode). */
  updateRange(from: number, to: number) {
    if (!this.state) return;
    this.set({ ...this.state, from, to });
  }

  /** Keep all four anchor offsets valid across edits made elsewhere while the widget is open. */
  remap(changes: readonly monaco.editor.IModelContentChange[]) {
    if (!this.state) return;
    this.set({
      ...this.state,
      from: remapOffset(this.state.from, changes),
      to: remapOffset(this.state.to, changes),
      originalFrom: remapOffset(this.state.originalFrom, changes),
      originalTo: remapOffset(this.state.originalTo, changes),
    });
  }
}

function remapOffset(offset: number, changes: readonly monaco.editor.IModelContentChange[]): number {
  let delta = 0;
  for (const c of [...changes].sort((a, b) => a.rangeOffset - b.rangeOffset)) {
    const start = c.rangeOffset;
    const end = start + c.rangeLength;
    if (end <= offset) {
      delta += c.text.length - c.rangeLength;
    } else if (start <= offset) {
      return start + delta + c.text.length;
    } else {
      break;
    }
  }
  return offset + delta;
}

/** Ctrl/Cmd-K: open the inline AI prompt for the current selection. */
function openAiEdit(editor: monaco.editor.ICodeEditor, store: AiStore) {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) return;
  const from = model.getOffsetAt(selection.getStartPosition());
  const to = model.getOffsetAt(selection.getEndPosition());
  store.open("edit", from, to, model.getValueInRange(selection));
}

const MAX_FULL_DOC = 8000;

function withLineNumbers(text: string, startLine: number): string {
  return text
    .split("\n")
    .map((line, i) => `${startLine + i}: ${line}`)
    .join("\n");
}

/** The current file's body (or a 60-line window around the selection), line-numbered. */
function buildFileBody(model: monaco.editor.ITextModel, from: number, to: number): string {
  const fullText = model.getValue();
  if (fullText.length <= MAX_FULL_DOC) {
    return withLineNumbers(fullText, 1);
  }
  const startLine = model.getPositionAt(from).lineNumber;
  const endLine = model.getPositionAt(to).lineNumber;
  const winFromLine = Math.max(1, startLine - 30);
  const winToLine = Math.min(model.getLineCount(), endLine + 30);
  const winFrom = model.getOffsetAt({ lineNumber: winFromLine, column: 1 });
  const winTo = model.getOffsetAt({ lineNumber: winToLine, column: model.getLineMaxColumn(winToLine) });
  return withLineNumbers(fullText.slice(winFrom, winTo), winFromLine);
}

const MAX_RELATED_FILES = 5;
const MAX_RELATED_FILE_CHARS = 2000;

// Good enough to spot related files without a full parser: matches the
// specifier in both `import ... from "x"` and `require("x")`.
const IMPORT_SPECIFIER_RE = /(?:import\s[^'"]*?from\s*|import\s*|require\s*\()\s*['"]([^'"]+)['"]/g;

function scanImportSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER_RE)].map((m) => m[1]);
}

/**
 * One-hop related-file context: files the current one statically imports,
 * resolved against the workspace-wide background models (see
 * lib/monaco/workspaceModels.ts) so the AI isn't limited to whatever text
 * the user manually pasted in. Bounded by file count and per-file size —
 * same truncation philosophy as `buildFileBody`'s MAX_FULL_DOC — so this
 * stays a targeted one-hop lookup, not a whole-repo dump.
 */
function buildRelatedFilesContext(model: monaco.editor.ITextModel, path: string): string {
  if (!path) return "";
  const dir = dirName(path);

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const spec of scanImportSpecifiers(model.getValue())) {
    const target = resolveWorkspaceImport(dir, spec);
    if (!target || target === path || seen.has(target)) continue;
    seen.add(target);
    resolved.push(target);
    if (resolved.length >= MAX_RELATED_FILES) break;
  }
  if (resolved.length === 0) return "";

  return (
    resolved
      .map((relPath) => {
        const text = getWorkspaceModelText(relPath) ?? "";
        const truncated =
          text.length > MAX_RELATED_FILE_CHARS ? `${text.slice(0, MAX_RELATED_FILE_CHARS)}\n…(truncated)` : text;
        return `Related file: ${relPath}\n${truncated}`;
      })
      .join("\n\n") + "\n\n"
  );
}

/**
 * Build the request for the LATEST turn in `state.turns` (already pushed).
 * Only the first message of a session carries file/selection context —
 * Cursor doesn't re-send full file context on every follow-up either, and
 * neither should we; subsequent turns are just the raw follow-up text.
 */
function buildRequest(
  model: monaco.editor.ITextModel,
  path: string,
  state: AiState,
): { system: string; messages: ChatMessage[] } {
  const latest = state.turns[state.turns.length - 1];
  const isFirst = state.turns.length === 1;

  let body = latest.content;
  if (isFirst) {
    const lang = path ? languageLabelForPath(path) : "code";
    const relatedContext = buildRelatedFilesContext(model, path);
    const fileBody = buildFileBody(model, state.originalFrom, state.originalTo);
    const startPos = model.getPositionAt(state.originalFrom);
    const endPos = model.getPositionAt(state.originalTo);
    const empty = state.originalFrom === state.originalTo;
    const selectionHeading = empty
      ? `Cursor position: line ${startPos.lineNumber}, column ${startPos.column}`
      : `Selection (lines ${startPos.lineNumber}-${endPos.lineNumber}):\n${state.originalText}`;
    const label = state.mode === "edit" ? "Instruction" : "Question";
    body =
      `${relatedContext}Current file: ${path || "(untitled)"} (${lang})\n${fileBody}\n\n` +
      `${selectionHeading}\n\n${label}: ${latest.content}`;
  }

  const messages: ChatMessage[] = [
    ...state.turns.slice(0, -1).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: body },
  ];
  return { system: buildSystemPrompt(state.mode), messages };
}

/** Strip a wrapping markdown code fence, if the model added one anyway. */
function stripFences(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  if (fenced) return fenced[1];
  return t;
}

function kbd(text: string): HTMLElement {
  const el = document.createElement("kbd");
  el.className = "aether-ai-kbd";
  el.textContent = text;
  return el;
}

// ---------------------------------------------------------------------------
// Selection popover — the little pill that floats near the caret end of a
// selection ("Add to Chat Ctrl+L" / "Quick Edit Ctrl+K").
// ---------------------------------------------------------------------------

class SelectionPopover implements monaco.editor.IContentWidget {
  allowEditorOverflow = true;

  private root: HTMLDivElement;

  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    onQuickEdit: () => void,
  ) {
    this.root = document.createElement("div");
    this.root.className = "aether-ai-popover";
    // Keep the editor's selection and focus when the pill is clicked.
    this.root.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    const addToChat = document.createElement("button");
    addToChat.type = "button";
    addToChat.className = "aether-ai-popover-btn";
    addToChat.disabled = true; // no chat panel exists yet
    addToChat.title = "Chat panel coming soon";
    addToChat.append(document.createTextNode("Add to Chat"), kbd("Ctrl+L"));

    const quickEdit = document.createElement("button");
    quickEdit.type = "button";
    quickEdit.className = "aether-ai-popover-btn";
    quickEdit.title = "Edit selection with AI";
    quickEdit.append(document.createTextNode("Quick Edit"), kbd("Ctrl+K"));
    quickEdit.addEventListener("click", onQuickEdit);

    this.root.append(addToChat, quickEdit);
  }

  getId(): string {
    return "aether.aiEdit.selectionPopover";
  }

  getDomNode(): HTMLElement {
    return this.root;
  }

  getPosition(): monaco.editor.IContentWidgetPosition | null {
    const selection = this.editor.getSelection();
    if (!selection || selection.isEmpty()) return null;
    // Anchor at the selection's ACTIVE end (where the caret is): dragging
    // down puts the popover near the bottom line, dragging up near the top.
    const pos = selection.getPosition();
    return {
      position: { lineNumber: pos.lineNumber, column: pos.column },
      preference: [
        monaco.editor.ContentWidgetPositionPreference.ABOVE,
        monaco.editor.ContentWidgetPositionPreference.BELOW,
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Per-hunk action pill — the tiny ✓/✕ control floating above each diff hunk.
// ---------------------------------------------------------------------------

interface HunkUi {
  addedCount: number;
  removedLines: string[];
  insertAtEof: boolean;
  decorationIds: string[];
  zoneId: string | null;
  actionWidget: HunkActionWidget | null;
  resolved: boolean;
}

class HunkActionWidget implements monaco.editor.IContentWidget {
  allowEditorOverflow = true;

  private static seq = 0;
  private readonly id = `aether.aiEdit.hunk.${++HunkActionWidget.seq}`;
  private root: HTMLDivElement;
  private layoutListener: monaco.IDisposable;

  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    index: number,
    total: number,
    private getAnchor: () => monaco.Range | null,
    onApprove: () => void,
    onReject: () => void,
  ) {
    this.root = document.createElement("div");
    this.root.className = "aether-ai-hunk-actions";
    this.root.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    const pill = document.createElement("div");
    pill.className = "aether-ai-hunk-pill";

    const label = document.createElement("span");
    label.className = "aether-ai-hunk-label";
    label.innerHTML = `${index + 1} of ${total} <span class="aether-ai-chevron">⌄</span>`;

    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "aether-ai-hunk-btn reject";
    reject.title = "Undo this change (Ctrl+N)";
    reject.append(document.createTextNode("Undo"), kbd("Ctrl+N"));
    reject.addEventListener("click", onReject);

    const approve = document.createElement("button");
    approve.type = "button";
    approve.className = "aether-ai-hunk-btn approve";
    approve.title = "Keep this change (Ctrl+Shift+Y)";
    approve.append(document.createTextNode("Keep"), kbd("Ctrl+Shift+Y"));
    approve.addEventListener("click", onApprove);

    pill.append(label, reject, approve);
    this.root.appendChild(pill);

    this.updateWidth();
    this.layoutListener = this.editor.onDidLayoutChange(() => this.updateWidth());
  }

  private updateWidth() {
    const info = this.editor.getLayoutInfo();
    const width = info.contentWidth - 32;
    this.root.style.width = `${width}px`;
  }

  dispose() {
    this.layoutListener.dispose();
  }

  getId(): string {
    return this.id;
  }

  getDomNode(): HTMLElement {
    return this.root;
  }

  getPosition(): monaco.editor.IContentWidgetPosition | null {
    const anchor = this.getAnchor();
    if (!anchor) return null;
    return {
      position: { lineNumber: anchor.startLineNumber, column: 1 },
      preference: [
        monaco.editor.ContentWidgetPositionPreference.ABOVE,
        monaco.editor.ContentWidgetPositionPreference.BELOW,
      ],
    };
  }
}



class AiWidget implements monaco.editor.IContentWidget {
  allowEditorOverflow = true;

  private root: HTMLDivElement;
  private input!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private transcript!: HTMLDivElement;
  private breadcrumb!: HTMLDivElement;
  private footer!: HTMLDivElement;
  private modeDropdownBtn!: HTMLButtonElement;
  private modeLabel!: HTMLSpanElement;
  private modeMenu!: HTMLDivElement;
  private brainSelect!: HTMLSelectElement;
  private brainSelectWrapper!: HTMLDivElement;
  private brainIcon!: HTMLSpanElement;
  private brainSelectLabel!: HTMLSpanElement;
  private builtForGen = -1;
  private lastStreamRenderAt = 0;

  /** Edit-mode per-hunk diff bookkeeping. */
  private diffActive = false;
  private hunks: HunkUi[] = [];
  /** Set when the model's proposal is identical to the original text. */
  private noChanges = false;
  private appliedAssistantCount = 0;

  private viewZoneId: string | null = null;
  private resizeObserver: ResizeObserver | null = null;

  /** Suppresses `store.remap()` for content-change events caused by our own diff edits. */
  public isApplyingOwnEdit = false;

  private outsideClickHandler = (e: MouseEvent) => {
    if (!this.modeMenu.contains(e.target as Node) && e.target !== this.modeDropdownBtn) {
      this.closeMenu();
    }
  };

  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    private store: AiStore,
    private getPath: () => string,
  ) {
    this.root = document.createElement("div");
    this.root.className = "aether-ai-widget";
    this.root.addEventListener("mousedown", (e) => e.stopPropagation());
    this.root.addEventListener("keydown", this.onKeyDown);

    this.resizeObserver = new ResizeObserver(() => {
      this.updateViewZone();
    });
    this.resizeObserver.observe(this.root);
  }

  public rejectFirstUnresolved() {
    const first = this.hunks.find((h) => !h.resolved);
    if (first) this.rejectHunk(first);
  }

  public approveFirstUnresolved() {
    const first = this.hunks.find((h) => !h.resolved);
    if (first) this.approveHunk(first);
  }

  public clearViewZone() {
    if (this.viewZoneId !== null) {
      this.editor.changeViewZones((accessor) => {
        accessor.removeZone(this.viewZoneId!);
      });
      this.viewZoneId = null;
    }
  }

  private updateViewZone() {
    const state = this.store.get();
    const model = this.editor.getModel();
    if (!state || !model) {
      this.clearViewZone();
      return;
    }

    const rect = this.root.getBoundingClientRect();
    const height = rect.height;
    if (height === 0) return;

    const anchorOffset = Math.min(state.from, model.getValueLength());
    const pos = model.getPositionAt(anchorOffset);

    this.editor.changeViewZones((accessor) => {
      if (this.viewZoneId !== null) {
        accessor.removeZone(this.viewZoneId);
      }
      this.viewZoneId = accessor.addZone({
        afterLineNumber: pos.lineNumber - 1,
        heightInPx: height + 12,
        domNode: document.createElement("div"),
      });
    });
  }

  getId(): string {
    return "aether.aiEdit.widget";
  }

  getDomNode(): HTMLElement {
    return this.root;
  }

  getPosition(): monaco.editor.IContentWidgetPosition | null {
    const state = this.store.get();
    const model = this.editor.getModel();
    if (!state || !model) return null;
    // The prompt bar always floats at the TOP of the selected / edited code.
    const anchorOffset = Math.min(state.from, model.getValueLength());
    return {
      position: model.getPositionAt(anchorOffset),
      preference: [
        monaco.editor.ContentWidgetPositionPreference.ABOVE,
        monaco.editor.ContentWidgetPositionPreference.BELOW,
      ],
    };
  }

  /** Called by installAiEdit whenever the store changes. */
  onStateChange(state: AiState | null) {
    if (!state) return;

    if (this.builtForGen !== state.gen) {
      this.build(state);
    } else if (state.status === "streaming") {
      // Throttle re-renders during streaming by elapsed time rather than an
      // requestAnimationFrame-gated flag: rAF can be suspended indefinitely
      // (e.g. the window loses focus mid-generation), which would otherwise
      // permanently wedge the render pipeline for the rest of the session.
      const now = Date.now();
      if (now - this.lastStreamRenderAt > 50) {
        this.lastStreamRenderAt = now;
        this.render(state);
      }
    } else {
      this.render(state);
    }

    if (state.mode === "edit" && state.status === "done") {
      const assistantCount = state.turns.filter((t) => t.role === "assistant").length;
      if (assistantCount > this.appliedAssistantCount) {
        this.appliedAssistantCount = assistantCount;
        this.applyDiff(state);
      }
    }

    this.editor.layoutContentWidget(this);
  }

  /** Revert + clean up hunk UI left on a model this widget is about to lose (tab switch). */
  discardStaleDiff(oldModel: monaco.editor.ITextModel | null) {
    if (!this.diffActive || !oldModel) return;
    for (const ui of this.hunks) {
      if (!ui.resolved && ui.decorationIds.length) {
        const decRange = oldModel.getDecorationRange(ui.decorationIds[0]);
        if (decRange) {
          const edit = this.hunkRejectEdit(oldModel, decRange, ui);
          oldModel.pushEditOperations(null, [{ range: edit.range, text: edit.text }], () => null);
        }
      }
      // Decorations live on the OLD model; zones/widgets are editor-level.
      if (ui.decorationIds.length) {
        oldModel.deltaDecorations(ui.decorationIds, []);
        ui.decorationIds = [];
      }
      if (ui.zoneId) {
        const zoneId = ui.zoneId;
        this.editor.changeViewZones((accessor) => accessor.removeZone(zoneId));
        ui.zoneId = null;
      }
      if (ui.actionWidget) {
        ui.actionWidget.dispose();
        this.editor.removeContentWidget(ui.actionWidget);
        ui.actionWidget = null;
      }
    }
    this.hunks = [];
    this.diffActive = false;
  }

  private model(): monaco.editor.ITextModel | null {
    return this.editor.getModel();
  }

  private field(): AiState | null {
    return this.store.get();
  }

  private withOwnEdit<T>(fn: () => T): T {
    this.isApplyingOwnEdit = true;
    try {
      return fn();
    } finally {
      this.isApplyingOwnEdit = false;
    }
  }

  // --- per-hunk inline diff (edit mode) -------------------------------------

  private applyDiff(state: AiState) {
    const model = this.model();
    if (!model) return;
    const assistantTurns = state.turns.filter((t) => t.role === "assistant");
    const code = assistantTurns[assistantTurns.length - 1]?.code ?? "";

    // Drop the previous round's hunk UI; the text itself is re-based below.
    this.clearHunkUi();

    this.withOwnEdit(() => {
      if (this.diffActive) {
        const curRange = monaco.Range.fromPositions(model.getPositionAt(state.from), model.getPositionAt(state.to));
        this.editor.executeEdits("aether-ai-diff-revert", [{ range: curRange, text: state.originalText }]);
      }
      const baseEnd = state.from + state.originalText.length;
      const baseRange = monaco.Range.fromPositions(model.getPositionAt(state.from), model.getPositionAt(baseEnd));
      this.editor.executeEdits("aether-ai-diff-apply", [{ range: baseRange, text: code }]);
    });

    const hunks = computeLineDiff(state.originalText, code);
    // Set the flags BEFORE updateRange emits — the render it triggers reads them.
    this.diffActive = hunks.length > 0;
    this.noChanges = hunks.length === 0;
    this.store.updateRange(state.from, state.from + code.length);

    if (hunks.length > 0) {
      const baseLine = model.getPositionAt(state.from).lineNumber;
      hunks.forEach((hunk, index) => {
        this.renderHunk(baseLine, hunk, index, hunks.length);
      });
    }
  }

  private renderHunk(baseLine: number, hunk: DiffHunk, index: number, total: number) {
    const model = this.model();
    if (!model) return;
    const lineCount = model.getLineCount();
    const rawFirstLine = baseLine + hunk.proposedStartLine;
    const firstLine = Math.min(rawFirstLine, lineCount);
    const pureDeletionAtEof = hunk.addedCount === 0 && rawFirstLine > lineCount;

    const ui: HunkUi = {
      addedCount: hunk.addedCount,
      removedLines: hunk.removedLines,
      insertAtEof: pureDeletionAtEof,
      decorationIds: [],
      zoneId: null,
      actionWidget: null,
      resolved: false,
    };

    if (hunk.addedCount > 0) {
      const lastLine = Math.min(firstLine + hunk.addedCount - 1, lineCount);
      ui.decorationIds = this.editor.deltaDecorations([], [
        {
          range: new monaco.Range(firstLine, 1, lastLine, model.getLineMaxColumn(lastLine)),
          options: {
            isWholeLine: true,
            className: "aether-ai-diff-added",
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        },
      ]);
    } else {
      // Pure deletion: track the re-insertion point with an invisible marker.
      // Mid-document deletions anchor at the start of the following line;
      // EOF deletions anchor at the end of the last line.
      const marker = pureDeletionAtEof
        ? new monaco.Range(firstLine, model.getLineMaxColumn(firstLine), firstLine, model.getLineMaxColumn(firstLine))
        : new monaco.Range(firstLine, 1, firstLine, 1);
      ui.decorationIds = this.editor.deltaDecorations([], [
        {
          range: marker,
          options: { stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
        },
      ]);
    }

    if (hunk.removedLines.length > 0) {
      this.editor.changeViewZones((accessor) => {
        const dom = document.createElement("div");
        dom.className = "aether-ai-diff-zone";
        dom.textContent = hunk.removedLines.join("\n");
        ui.zoneId = accessor.addZone({
          afterLineNumber: pureDeletionAtEof ? lineCount : Math.max(0, firstLine - 1),
          heightInLines: hunk.removedLines.length,
          domNode: dom,
        });
      });
    }

    ui.actionWidget = new HunkActionWidget(
      this.editor,
      index,
      total,
      () => {
        const m = this.model();
        return m && ui.decorationIds.length ? m.getDecorationRange(ui.decorationIds[0]) : null;
      },
      () => this.approveHunk(ui),
      () => this.rejectHunk(ui),
    );
    this.editor.addContentWidget(ui.actionWidget);

    this.hunks.push(ui);
  }

  /**
   * Compute the text edit that undoes one hunk, given the hunk's CURRENT
   * (decoration-remapped) position. Added lines are swapped for the hunk's
   * removed lines whole-line; pure deletions re-insert at the marker.
   */
  private hunkRejectEdit(
    model: monaco.editor.ITextModel,
    decRange: monaco.Range,
    ui: HunkUi,
  ): { range: monaco.Range; text: string } {
    const replacement = ui.removedLines.join("\n");
    const lineCount = model.getLineCount();

    if (ui.addedCount > 0) {
      const startLine = decRange.startLineNumber;
      const endLine = decRange.endLineNumber;
      if (endLine < lineCount) {
        return {
          range: new monaco.Range(startLine, 1, endLine + 1, 1),
          text: ui.removedLines.length > 0 ? replacement + "\n" : "",
        };
      }
      if (startLine > 1) {
        // Hunk reaches EOF: fold the previous line's newline into the range.
        return {
          range: new monaco.Range(
            startLine - 1,
            model.getLineMaxColumn(startLine - 1),
            endLine,
            model.getLineMaxColumn(endLine),
          ),
          text: ui.removedLines.length > 0 ? "\n" + replacement : "",
        };
      }
      // Hunk spans the whole document.
      return {
        range: new monaco.Range(1, 1, endLine, model.getLineMaxColumn(endLine)),
        text: replacement,
      };
    }

    // Pure deletion: re-insert the removed lines at the tracked point.
    const pos = decRange.getStartPosition();
    return {
      range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
      text: ui.insertAtEof ? "\n" + replacement : replacement + "\n",
    };
  }

  private approveHunk(ui: HunkUi) {
    if (ui.resolved) return;
    ui.resolved = true;
    this.dropHunkUi(ui);
    this.afterHunkResolve();
  }

  private rejectHunk(ui: HunkUi) {
    const model = this.model();
    if (!model || ui.resolved) return;
    const decRange = ui.decorationIds.length ? model.getDecorationRange(ui.decorationIds[0]) : null;
    if (decRange) {
      const edit = this.hunkRejectEdit(model, decRange, ui);
      this.withOwnEdit(() => {
        this.editor.executeEdits("aether-ai-hunk-reject", [{ range: edit.range, text: edit.text }]);
      });
    }
    ui.resolved = true;
    this.dropHunkUi(ui);
    this.afterHunkResolve();
  }

  /** Re-anchor the surviving pills + prompt bar after a hunk resolve moved text. */
  private afterHunkResolve() {
    for (const h of this.hunks) {
      if (!h.resolved && h.actionWidget) this.editor.layoutContentWidget(h.actionWidget);
    }
    this.editor.layoutContentWidget(this);
  }

  /** Remove one hunk's decorations/zone/pill from the CURRENT model. */
  private dropHunkUi(ui: HunkUi) {
    if (ui.decorationIds.length) {
      ui.decorationIds = this.editor.deltaDecorations(ui.decorationIds, []);
    }
    if (ui.zoneId) {
      const zoneId = ui.zoneId;
      this.editor.changeViewZones((accessor) => accessor.removeZone(zoneId));
      ui.zoneId = null;
    }
    if (ui.actionWidget) {
      ui.actionWidget.dispose();
      this.editor.removeContentWidget(ui.actionWidget);
      ui.actionWidget = null;
    }
  }

  private clearHunkUi() {
    for (const ui of this.hunks) this.dropHunkUi(ui);
    this.hunks = [];
  }

  /** Approve all: keep the text, drop every hunk's UI, close. */
  private accept = () => {
    this.clearHunkUi();
    this.diffActive = false;
    this.clearViewZone();
    this.store.close();
    this.editor.focus();
  };

  /** Reject all: revert every unresolved hunk, then close (also Esc / corner ✕). */
  private close = () => {
    if (this.diffActive) {
      for (const ui of [...this.hunks]) {
        if (!ui.resolved) this.rejectHunk(ui);
      }
    }
    this.clearHunkUi();
    this.diffActive = false;
    this.clearViewZone();
    this.store.close();
    this.editor.focus();
  };

  // --- submit / retry --------------------------------------------------------

  private async submit() {
    const st = this.field();
    if (!st || st.status === "streaming") return;
    const text = this.input.value.trim();
    if (!text) return;

    if (!isBrainReady()) {
      this.store.fail("This brain isn't configured yet. Open AI Settings to finish setup.");
      window.dispatchEvent(new CustomEvent("aether:open-ai-settings"));
      return;
    }

    this.input.value = "";
    this.autoGrow();
    this.noChanges = false;
    this.store.submitUserTurn(text);
    await this.runTurn();
  }

  private async retry() {
    const st = this.field();
    if (!st || st.status === "streaming") return;
    this.store.retryStream();
    await this.runTurn();
  }

  private async runTurn() {
    const st = this.field();
    const model = this.model();
    if (!st || !model) return;
    const gen = st.gen;
    const alive = () => this.store.get()?.gen === gen;
    const { system, messages } = buildRequest(model, this.getPath(), st);

    try {
      await runCompletion({
        system,
        messages,
        onToken: (text) => {
          if (alive()) this.store.appendStreaming(text);
        },
        onReplace: (text) => {
          if (alive()) this.store.replaceStreaming(text);
        },
      });
      if (alive()) this.store.finishTurn();
    } catch (err) {
      if (alive()) this.store.fail(err instanceof Error ? err.message : String(err));
    }
  }

  // --- DOM -------------------------------------------------------------------

  private build(state: AiState) {
    this.root.replaceChildren();
    this.builtForGen = state.gen;
    this.clearHunkUi();
    this.diffActive = false;
    this.noChanges = false;
    this.appliedAssistantCount = 0;

    const closeCorner = document.createElement("button");
    closeCorner.className = "aether-ai-close-corner";
    closeCorner.type = "button";
    closeCorner.title = "Close (Esc)";
    closeCorner.textContent = "✕";
    closeCorner.addEventListener("click", this.close);

    this.transcript = document.createElement("div");
    this.transcript.className = "aether-ai-transcript scroll-thin";

    this.breadcrumb = document.createElement("div");
    this.breadcrumb.className = "aether-ai-breadcrumb";

    const inputRow = document.createElement("div");
    inputRow.className = "aether-ai-input-row";

    this.input = document.createElement("textarea");
    this.input.className = "aether-ai-input";
    this.input.rows = 1;
    this.input.spellcheck = false;
    this.input.addEventListener("input", () => {
      this.autoGrow();
      this.sendBtn.disabled = this.input.value.trim().length === 0;
    });

    // Model Selector (placed inside inputRow, bottom-left)
    this.brainSelectWrapper = document.createElement("div");
    this.brainSelectWrapper.className = "aether-ai-brain-wrapper";

    this.brainIcon = document.createElement("span");
    this.brainIcon.className = "aether-ai-brain-icon";

    this.brainSelectLabel = document.createElement("span");
    this.brainSelectLabel.className = "aether-ai-brain-label";

    this.brainSelect = document.createElement("select");
    this.brainSelect.className = "aether-ai-brain";
    this.brainSelect.title = "Model";
    this.brainSelect.addEventListener("change", this.onBrainChange);
    this.brainSelect.addEventListener("click", (e) => e.stopPropagation());
    this.brainSelect.addEventListener("mousedown", (e) => e.stopPropagation());

    const brainChevron = document.createElement("span");
    brainChevron.className = "aether-ai-brain-chevron";
    brainChevron.textContent = "⌄";

    this.brainSelectWrapper.append(this.brainIcon, this.brainSelectLabel, this.brainSelect, brainChevron);
    this.renderBrainOptions();

    this.modeDropdownBtn = document.createElement("button");
    this.modeDropdownBtn.className = "aether-ai-mode-dropdown";
    this.modeDropdownBtn.type = "button";
    this.modeLabel = document.createElement("span");
    const chevron = document.createElement("span");
    chevron.className = "aether-ai-chevron";
    chevron.textContent = "⌄";
    this.modeDropdownBtn.append(this.modeLabel, chevron);
    this.modeDropdownBtn.addEventListener("click", () => this.toggleMenu());

    this.modeMenu = document.createElement("div");
    this.modeMenu.className = "aether-ai-mode-menu";
    this.modeMenu.hidden = true;

    this.sendBtn = document.createElement("button");
    this.sendBtn.className = "aether-ai-send";
    this.sendBtn.type = "button";
    this.sendBtn.addEventListener("click", () => {
      const st = this.field();
      if (st && st.status === "streaming") {
        this.store.cancelStream();
      } else {
        void this.submit();
      }
    });

    inputRow.append(this.input, this.brainSelectWrapper, this.modeDropdownBtn, this.modeMenu, this.sendBtn);

    this.footer = document.createElement("div");
    this.footer.className = "aether-ai-footer";

    // closeCorner is appended last to ensure it sits on top in DOM order
    this.root.append(this.transcript, this.breadcrumb, inputRow, this.footer, closeCorner);

    this.render(state);
    requestAnimationFrame(() => {
      this.autoGrow();
      this.input.focus();
    });
  }

  private toggleMenu() {
    if (this.modeMenu.hidden) {
      this.modeMenu.hidden = false;
      document.addEventListener("mousedown", this.outsideClickHandler, true);
    } else {
      this.closeMenu();
    }
  }

  private closeMenu() {
    this.modeMenu.hidden = true;
    document.removeEventListener("mousedown", this.outsideClickHandler, true);
  }

  private renderMenu() {
    this.modeMenu.replaceChildren();
    const st = this.field();

    const modeRow = (label: string, mode: Mode, shortcut: string) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "aether-ai-mode-menu-item";

      const text = document.createElement("span");
      text.textContent = label;

      const right = document.createElement("span");
      right.className = "aether-ai-mode-menu-right";
      right.appendChild(kbd(shortcut));
      if (st && st.mode === mode) {
        const check = document.createElement("span");
        check.className = "aether-ai-check";
        check.textContent = "✓";
        right.appendChild(check);
      }

      btn.append(text, right);
      btn.addEventListener("click", () => {
        this.store.setMode(mode);
        this.closeMenu();
        this.input.focus();
      });
      return btn;
    };

    const divider = () => {
      const d = document.createElement("div");
      d.className = "aether-ai-mode-menu-divider";
      return d;
    };

    const settingsBtn = document.createElement("button");
    settingsBtn.type = "button";
    settingsBtn.className = "aether-ai-mode-menu-item";
    const settingsLabel = document.createElement("span");
    settingsLabel.textContent = "⚙ AI Settings";
    settingsBtn.appendChild(settingsLabel);
    settingsBtn.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("aether:open-ai-settings"));
      this.closeMenu();
    });

    this.modeMenu.append(
      modeRow("Edit Selection", "edit", "↵"),
      modeRow("Quick Question", "question", "Alt+↵"),
      divider(),
      settingsBtn,
    );
  }

  private onBrainChange = () => {
    const value = this.brainSelect.value;
    if (value === "mercury") {
      setAiSetting("brain", "mercury");
    } else if (value.startsWith("claude:")) {
      setAiSetting("brain", "claude");
      setAiSetting("claudeModel", value.slice("claude:".length));
    } else {
      setAiSetting("brain", "lmstudio");
      if (!getAiSettings().lmStudioModel) {
        window.dispatchEvent(new CustomEvent("aether:open-ai-settings"));
      }
    }
    this.renderBrainOptions();
  };

  private updateBrainIcon() {
    if (!this.brainIcon || !this.brainSelectLabel) return;
    const s = getAiSettings();
    if (s.brain === "mercury") {
      this.brainIcon.innerHTML = MERCURY_ICON_SVG;
      this.brainSelectLabel.textContent = "Mercury 2";
    } else if (s.brain === "claude") {
      this.brainIcon.innerHTML = ANTHROPIC_ICON_SVG;
      const activeModel = CLAUDE_MODELS.find(m => m.id === s.claudeModel);
      this.brainSelectLabel.textContent = activeModel ? activeModel.label : s.claudeModel;
    } else {
      this.brainIcon.innerHTML = LM_STUDIO_ICON_SVG;
      this.brainSelectLabel.textContent = s.lmStudioModel ? `LM Studio · ${s.lmStudioModel}` : "LM Studio…";
    }
  }

  private renderBrainOptions() {
    const s = getAiSettings();
    this.brainSelect.replaceChildren();

    const mercury = document.createElement("option");
    mercury.value = "mercury";
    mercury.textContent = "Mercury 2";
    this.brainSelect.appendChild(mercury);

    for (const m of CLAUDE_MODELS) {
      const opt = document.createElement("option");
      opt.value = `claude:${m.id}`;
      opt.textContent = m.label;
      this.brainSelect.appendChild(opt);
    }

    const lm = document.createElement("option");
    lm.value = "lmstudio";
    lm.textContent = s.lmStudioModel ? `LM Studio · ${s.lmStudioModel}` : "LM Studio…";
    this.brainSelect.appendChild(lm);

    this.brainSelect.value =
      s.brain === "mercury" ? "mercury" : s.brain === "claude" ? `claude:${s.claudeModel}` : "lmstudio";

    this.updateBrainIcon();
  }

  /** Re-sync the model dropdown when settings are changed in AI Settings. */
  public refreshBrain() {
    if (this.builtForGen < 0 || !this.brainSelect) return;
    this.renderBrainOptions();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    const st = this.field();
    if (!st) return;
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (st.status === "streaming") return;
    const text = this.input.value.trim();
    if (e.altKey) {
      // Alt+⏎ = Quick Question (mode switch is only possible before turn 1).
      if (!text) return;
      if (st.turns.length === 0 && st.mode !== "question") this.store.setMode("question");
      void this.submit();
      return;
    }
    if (!text && st.mode === "edit" && this.diffActive) {
      this.accept();
    } else if (text) {
      void this.submit();
    }
  };

  private autoGrow = () => {
    this.input.style.height = "auto";
    this.input.style.height = Math.min(this.input.scrollHeight, 160) + "px";
  };

  private renderTranscript(state: AiState) {
    const wasAtBottom =
      this.transcript.scrollTop + this.transcript.clientHeight >= this.transcript.scrollHeight - 20;

    const rows: HTMLElement[] = state.turns.map((turn) => {
      const el = document.createElement("div");
      el.className = `aether-ai-turn ${turn.role}`;
      if (turn.role === "assistant") {
        el.innerHTML = renderMarkdown(turn.content);
        void colorizeCodeBlocks(el);
      } else {
        el.textContent = turn.content;
      }
      return el;
    });

    if (state.status === "streaming") {
      const el = document.createElement("div");
      el.className = "aether-ai-turn assistant streaming";
      el.innerHTML = renderMarkdown(state.streamingText) || "&hellip;";
      rows.push(el);
    }

    this.transcript.replaceChildren(...rows);
    if (wasAtBottom) this.transcript.scrollTop = this.transcript.scrollHeight;
  }

  private renderBreadcrumb(state: AiState) {
    const instructions = state.turns.filter((t) => t.role === "user");
    if (instructions.length === 0) {
      this.breadcrumb.replaceChildren();
      this.breadcrumb.style.display = "none";
      return;
    }
    this.breadcrumb.style.display = "";
    this.breadcrumb.textContent = instructions.map((t, i) => `${i + 1}. ${t.content}`).join("   ");
  }

  private actionButton(label: string, variant: "primary" | "ghost", onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `aether-ai-action ${variant}`;
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  private render(state: AiState) {
    const idle = state.turns.length === 0 && state.status === "input";
    this.root.classList.toggle("idle", idle);

    this.modeLabel.textContent = state.mode === "edit" ? "Edit Selection" : "Quick Question";
    this.renderMenu();

    if (state.mode === "question") {
      this.transcript.style.display = state.turns.length > 0 || state.status === "streaming" ? "" : "none";
      this.breadcrumb.style.display = "none";
      this.renderTranscript(state);
    } else {
      this.transcript.style.display = "none";
      this.renderBreadcrumb(state);
    }

    const hasHistory = state.turns.length > 0;
    this.input.placeholder = hasHistory
      ? "Add a follow-up…"
      : state.mode === "edit"
        ? state.originalFrom === state.originalTo
          ? "Describe the code to generate…"
          : "Edit selected code"
        : "Ask quick question";
    const isStreaming = state.status === "streaming";
    this.input.readOnly = isStreaming;
    this.sendBtn.disabled = !isStreaming && this.input.value.trim().length === 0;

    if (isStreaming) {
      this.sendBtn.classList.add("streaming");
      this.sendBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>`;
      this.sendBtn.title = "Stop generating";
    } else {
      this.sendBtn.classList.remove("streaming");
      this.sendBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
      this.sendBtn.title = "Send (Enter)";
    }

    this.footer.replaceChildren();
    const isBrainDisabled = state.status === "streaming";
    this.brainSelect.disabled = isBrainDisabled;
    this.brainSelectWrapper.classList.toggle("disabled", isBrainDisabled);

    if (state.status === "error") {
      this.footer.append(
        hint(state.error, "error"),
        spacerEl(),
        this.actionButton("Retry", "ghost", () => void this.retry()),
        this.actionButton("Close  Esc", "primary", this.close),
      );
    } else if (state.status === "streaming") {
      this.footer.append(hint("Generating…  Esc to dismiss"));
    } else if (state.mode === "edit" && this.diffActive) {
      this.footer.append(
        spacerEl(),
        this.actionButton("Reject all  Esc", "ghost", this.close),
        this.actionButton("Approve all  ⏎", "primary", this.accept),
      );
    } else if (state.mode === "edit" && this.noChanges && state.turns.length > 0) {
      this.footer.append(hint("No changes proposed"));
    }
  }
}

function hint(text: string, variant: "normal" | "error" = "normal"): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = variant === "error" ? "aether-ai-hint error" : "aether-ai-hint";
  el.textContent = text;
  return el;
}

function spacerEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "aether-ai-spacer";
  return el;
}

let styleInjected = false;
function ensureStyleInjected() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
.aether-ai-widget {
  position: relative;
  width: min(460px, calc(100vw - 16px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #09090b;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.6);
  font-family: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #d4d4d8;
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none !important;
}
.aether-ai-widget:focus-within {
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08);
}
.aether-ai-close-corner {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: #52525b;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.12s;
  padding: 0;
  z-index: 100 !important;
  pointer-events: auto !important;
  outline: none !important;
}
.aether-ai-close-corner:hover {
  color: #a1a1aa;
}
.aether-ai-transcript {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 220px;
  overflow-y: auto;
  scroll-behavior: smooth;
  padding-right: 20px;
}
.aether-ai-transcript::-webkit-scrollbar {
  width: 6px;
}
.aether-ai-transcript::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 999px;
}
.aether-ai-transcript::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
.aether-ai-transcript::-webkit-scrollbar-track {
  background: transparent;
}
.aether-ai-turn { font-size: 13px; line-height: 1.55; }
.aether-ai-turn.user {
  align-self: flex-end;
  max-width: 85%;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 6px 10px;
  white-space: pre-wrap;
  word-break: break-word;
  color: #e4e4e7;
}
.aether-ai-turn.assistant { color: #d4d4d8; }
.aether-ai-turn.assistant p { margin: 0 0 8px; }
.aether-ai-turn.assistant p:last-child { margin-bottom: 0; }
.aether-ai-turn.assistant ul, .aether-ai-turn.assistant ol { margin: 0 0 8px; padding-left: 20px; }
.aether-ai-turn.assistant code {
  font-family: 'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  padding: 1px 4px;
}
.aether-ai-turn.assistant pre {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  padding: 8px 10px;
  overflow-x: auto;
  margin: 0 0 8px;
}
.aether-ai-turn.assistant pre code {
  background: none;
  padding: 0;
  font-size: 12px;
}
.aether-ai-turn.assistant a { color: #a0a7ff; }
.aether-ai-breadcrumb {
  font-size: 11px;
  color: #71717a;
  overflow-x: auto;
  white-space: nowrap;
}
.aether-ai-input-row { position: relative; }
.aether-ai-input {
  width: 100%;
  resize: none;
  padding: 0 24px 32px 0;
  border: none;
  background: transparent;
  color: #e4e4e7;
  font-family: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.5;
  outline: none !important;
  box-shadow: none !important;
  box-sizing: border-box;
}
.aether-ai-input::placeholder { color: #52525b; }
.aether-ai-mode-dropdown {
  position: absolute;
  right: 32px;
  bottom: 0;
  height: 24px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  border: none;
  background: transparent;
  color: #a1a1aa;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.12s;
  outline: none !important;
  box-shadow: none !important;
}
.aether-ai-mode-dropdown:hover:not(:disabled) { color: #ffffff; }
.aether-ai-mode-dropdown:disabled { cursor: default; opacity: 0.45; }
.aether-ai-chevron { font-size: 10px; opacity: 0.8; }
.aether-ai-mode-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  z-index: 1000 !important;
  display: flex;
  flex-direction: column;
  min-width: 170px;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #09090b;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
}
.aether-ai-mode-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  padding: 6px 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #a1a1aa;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  outline: none !important;
}
.aether-ai-mode-menu-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
}
.aether-ai-mode-menu-right { display: flex; align-items: center; gap: 6px; }
.aether-ai-check { color: #ffffff; font-size: 11px; }
.aether-ai-mode-menu-divider { height: 1px; margin: 4px 2px; background: rgba(255, 255, 255, 0.08); }
.aether-ai-brain-wrapper {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 24px;
  display: flex !important;
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 6px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  font-family: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #a1a1aa;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  outline: none !important;
  box-shadow: none !important;
}
.aether-ai-brain-wrapper:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}
.aether-ai-brain-wrapper.disabled {
  opacity: 0.45;
  cursor: default;
}
.aether-ai-brain-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}
.aether-ai-brain-chevron {
  font-size: 10px;
  opacity: 0.8;
  pointer-events: none;
}
.aether-ai-brain-label {
  font-size: 11.5px;
  font-weight: 500;
  color: inherit;
  white-space: nowrap;
  pointer-events: none;
}
.aether-ai-brain {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  font-size: 11px;
  outline: none !important;
  box-shadow: none !important;
}
.aether-ai-brain-wrapper:not(.disabled):focus-within {
  border-color: rgba(255, 255, 255, 0.16);
}
.aether-ai-brain:disabled { opacity: 0.5; cursor: default; }
.aether-ai-send {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.3);
  cursor: not-allowed;
  display: flex !important;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  padding: 0;
}
.aether-ai-send:not(:disabled), .aether-ai-send.streaming {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  cursor: pointer;
}
.aether-ai-send:not(:disabled):hover, .aether-ai-send.streaming:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}
.aether-ai-footer { display: flex; align-items: center; gap: 6px; min-height: 18px; }
.aether-ai-hint { font-size: 11px; color: #71717a; }
.aether-ai-hint.error { color: #fca5a5; }
.aether-ai-spacer { flex: 1; }
.aether-ai-action {
  padding: 4px 10px;
  border-radius: 7px;
  border: none;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.aether-ai-action.primary { background: #8b93ff; color: #0e0e11; }
.aether-ai-action.primary:hover { background: #a0a7ff; }
.aether-ai-action.ghost { background: rgba(255,255,255,0.06); color: #d4d4d8; }
.aether-ai-action.ghost:hover { background: rgba(255,255,255,0.12); }
.aether-ai-diff-added { background: rgba(74,222,128,0.10); }
.aether-ai-diff-zone {
  font-family: 'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
  color: #fca5a5;
  text-decoration: line-through;
  background: rgba(248,113,113,0.08);
  overflow: hidden;
}
.aether-ai-kbd {
  font-family: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 10px;
  line-height: 1.4;
  color: #a1a1aa;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 4px;
  padding: 1.5px 5px;
}
.aether-ai-popover {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  width: max-content !important;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: #09090b;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  padding: 3px 4px;
  gap: 2px;
  font-family: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.aether-ai-popover-btn {
  display: flex !important;
  align-items: center !important;
  gap: 6px;
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #e4e4e7;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.aether-ai-popover-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
}
.aether-ai-popover-btn:disabled {
  color: #4b5563;
  cursor: not-allowed;
}
.aether-ai-popover-btn:disabled .aether-ai-kbd {
  color: #3f3f46;
  background: rgba(255, 255, 255, 0.02);
}
.aether-ai-hunk-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-family: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  pointer-events: none;
}
.aether-ai-hunk-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #09090b;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  pointer-events: auto;
}
.aether-ai-hunk-label {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  color: #a1a1aa;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}
.aether-ai-hunk-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s;
}
.aether-ai-hunk-btn .aether-ai-kbd {
  font-size: 9px;
  padding: 1px 4px;
}
.aether-ai-hunk-btn.reject {
  background: transparent;
  color: #a1a1aa;
}
.aether-ai-hunk-btn.reject:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e4e4e7;
}
.aether-ai-hunk-btn.approve {
  background: rgba(139, 147, 255, 0.15);
  color: #a0a7ff;
}
.aether-ai-hunk-btn.approve:hover {
  background: rgba(139, 147, 255, 0.25);
  color: #c4c9ff;
}
`;
  document.head.appendChild(style);
}

/**
 * Install the Ctrl/Cmd-K inline AI editor on a Monaco editor instance.
 * `getPath` is read at request time (not captured once), since the editor
 * instance is persistent and outlives many file switches.
 */
export function installAiEdit(editor: monaco.editor.IStandaloneCodeEditor, getPath: () => string): void {
  ensureStyleInjected();

  const store = new AiStore();
  const widget = new AiWidget(editor, store, getPath);
  let added = false;

  // Selection popover — shown only while a non-empty selection exists and the
  // prompt bar is closed.
  const popover = new SelectionPopover(editor, () => openAiEdit(editor, store));
  let popoverAdded = false;
  const updatePopover = () => {
    const selection = editor.getSelection();
    const show = !!selection && !selection.isEmpty() && store.get() === null;
    if (show && !popoverAdded) {
      editor.addContentWidget(popover);
      popoverAdded = true;
    } else if (!show && popoverAdded) {
      editor.removeContentWidget(popover);
      popoverAdded = false;
    } else if (show) {
      editor.layoutContentWidget(popover);
    }
  };
  editor.onDidChangeCursorSelection(updatePopover);

  store.subscribe(() => {
    const state = store.get();
    if (state && !added) {
      editor.addContentWidget(widget);
      added = true;
    } else if (!state && added) {
      editor.removeContentWidget(widget);
      added = false;
      widget.clearViewZone();
    }
    if (state) widget.onStateChange(state);
    updatePopover();
  });

  editor.addAction({
    id: "aether.aiEdit.open",
    label: "Aether: Edit with AI",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
    run: (ed) => openAiEdit(ed, store),
  });

  editor.addAction({
    id: "aether.aiEdit.rejectHunk",
    label: "Aether: Reject Current Hunk",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN],
    run: () => {
      widget.rejectFirstUnresolved();
    },
  });

  editor.addAction({
    id: "aether.aiEdit.approveHunk",
    label: "Aether: Approve Current Hunk",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyY],
    run: () => {
      widget.approveFirstUnresolved();
    },
  });

  // Keep the anchored ranges valid across edits made while the widget is open
  // (but not for our own diff-apply edits, which manage their own offsets).
  editor.onDidChangeModelContent((e) => {
    if (!widget.isApplyingOwnEdit) store.remap(e.changes);
  });

  // The widget's anchor offsets belong to one file; auto-close (reverting any
  // unresolved hunks first) on tab switch rather than leaving it dangling.
  editor.onDidChangeModel((e) => {
    const oldModel = e.oldModelUrl ? monaco.editor.getModel(e.oldModelUrl) : null;
    widget.discardStaleDiff(oldModel);
    store.close();
    updatePopover();
  });

  // Keep the footer model dropdown in sync with the AI Settings dialog.
  subscribeAiSettings(() => widget.refreshBrain());

  // Dev-only: lets the browser preview simulate a completed assistant turn to
  // exercise the hunk UI without a Tauri backend.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__aetherAiDebug = { store, widget };
  }
}
