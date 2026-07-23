import { useCallback, useEffect, useState, useRef } from "react";
import { motion } from "motion/react";
import { setAiSetting, useAiSettings, CLAUDE_MODELS, EFFORT_LEVELS, runCompletion } from "../lib/ai";
import type { AiMessage, Brain, ReasoningEffort } from "../types";

interface AiSession {
  id: string;
  name: string;
  messages: AiMessage[];
  workspace?: string;
  createdAt: number;
  updatedAt: number;
}

interface NewSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreateSession: (name: string) => void;
}

function NewSessionDialog({ open, onClose, onCreateSession }: NewSessionDialogProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreateSession(name.trim());
      setName("");
    }
  };

  useEffect(() => {
    if (!open) setName("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md rounded-xl border border-white/10 bg-abyss p-6 shadow-2xl"
      >
        <h2 className="mb-4 text-lg font-medium text-zinc-200">New session</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Session name"
            autoFocus
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-white/20"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/[0.15] disabled:opacity-50 disabled:hover:bg-white/10"
            >
              Create
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function AiIdeWindow() {
  const aiSettings = useAiSettings();
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showEffortDropdown, setShowEffortDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  useEffect(() => {
    const stored = localStorage.getItem("aether:ai-sessions");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSessions(parsed.sessions || []);
        setActiveSessionId(parsed.activeSessionId || null);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (sessions.length > 0 || activeSessionId) {
      localStorage.setItem(
        "aether:ai-sessions",
        JSON.stringify({ sessions, activeSessionId })
      );
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages]);

  const createSession = useCallback((name: string) => {
    const newSession: AiSession = {
      id: Date.now().toString(),
      name,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setShowNewSessionDialog(false);
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setActiveSessionId((current) => (current === id ? null : current));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || !activeSessionId || isStreaming) return;

      const userMessage: AiMessage = { role: "user", content: input.trim() };
      const sessionIndex = sessions.findIndex((s) => s.id === activeSessionId);
      if (sessionIndex === -1) return;

      setSessions((prev) => {
        const updated = [...prev];
        updated[sessionIndex] = {
          ...updated[sessionIndex],
          messages: [...updated[sessionIndex].messages, userMessage],
          updatedAt: Date.now(),
        };
        return updated;
      });

      setInput("");
      setIsStreaming(true);

      let assistantContent = "";
      const assistantMessage: AiMessage = { role: "assistant", content: "" };

      setSessions((prev) => {
        const updated = [...prev];
        updated[sessionIndex] = {
          ...updated[sessionIndex],
          messages: [...updated[sessionIndex].messages, assistantMessage],
        };
        return updated;
      });

      try {
        await runCompletion({
          system: "You are a helpful AI assistant integrated into Aether code editor. Provide clear, concise, and accurate responses.",
          messages: sessions[sessionIndex].messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          onToken: (token) => {
            assistantContent += token;
            setSessions((prev) => {
              const updated = [...prev];
              const msgs = [...updated[sessionIndex].messages];
              msgs[msgs.length - 1] = { role: "assistant", content: assistantContent };
              updated[sessionIndex] = { ...updated[sessionIndex], messages: msgs };
              return updated;
            });
          },
        });
      } catch (err) {
        setSessions((prev) => {
          const updated = [...prev];
          const msgs = [...updated[sessionIndex].messages];
          msgs[msgs.length - 1] = {
            role: "assistant",
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          };
          updated[sessionIndex] = { ...updated[sessionIndex], messages: msgs };
          return updated;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [input, activeSessionId, isStreaming, sessions]
  );

  const selectBrain = useCallback((brain: Brain) => {
    setAiSetting("brain", brain);
    setShowModelDropdown(false);
  }, []);

  const selectClaudeModel = useCallback((modelId: string) => {
    setAiSetting("claudeModel", modelId);
    setShowModelDropdown(false);
  }, []);

  const selectEffort = useCallback((effort: ReasoningEffort) => {
    setAiSetting("reasoningEffort", effort);
    setShowEffortDropdown(false);
  }, []);

  const handleSelectWorkspace = useCallback(async () => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri || !activeSessionId) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, workspace: selected } : s))
      );
    }
  }, [activeSessionId]);

  return (
    <div className="flex h-screen flex-col bg-canvas text-zinc-200">
      {/* Top bar with session tabs */}
      <div className="flex items-center border-b border-white/[0.05] bg-abyss px-4">
        <div className="flex flex-1 items-center gap-2 overflow-x-auto py-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                session.id === activeSessionId
                  ? "bg-white/[0.08] text-zinc-200"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              <span className="max-w-[120px] truncate">{session.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(session.id);
                }}
                className="opacity-0 transition-opacity group-hover:opacity-100"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <button
            onClick={() => setShowNewSessionDialog(true)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New session
          </button>
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-1">
          <button className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </button>
          <button className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-red-500/20 hover:text-red-400">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {!activeSession ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="rounded-full bg-white/[0.05] p-4">
              <svg className="h-8 w-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <p className="text-sm text-zinc-400">Create a new session to get started</p>
          </div>
        ) : activeSession.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-500">Ask anything, / for commands, @ for context...</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {activeSession.messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08]">
                    <span className="text-xs font-medium text-zinc-400">A</span>
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-white/[0.08] text-zinc-200"
                      : "bg-white/[0.03] text-zinc-300"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      {activeSession && (
        <div className="border-t border-white/[0.05] bg-abyss px-4 py-3">
          <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
            <div className="flex items-center gap-2">
              {/* Model selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-white/20"
                >
                  <span className="text-xs text-zinc-400">
                    {aiSettings.brain === "mercury"
                      ? "Mercury 2"
                      : aiSettings.brain === "claude"
                        ? CLAUDE_MODELS.find((m) => m.id === aiSettings.claudeModel)?.label
                        : "LM Studio"}
                  </span>
                  <svg className="h-3 w-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showModelDropdown && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-white/10 bg-abyss p-2 shadow-2xl">
                    <div className="mb-2 px-2 py-1 text-xs text-zinc-500">Provider</div>
                    <button
                      type="button"
                      onClick={() => selectBrain("mercury")}
                      className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                        aiSettings.brain === "mercury"
                          ? "bg-white/[0.08] text-zinc-200"
                          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      Mercury 2
                    </button>
                    <button
                      type="button"
                      onClick={() => selectBrain("claude")}
                      className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                        aiSettings.brain === "claude"
                          ? "bg-white/[0.08] text-zinc-200"
                          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      Claude (Anthropic)
                    </button>
                    <button
                      type="button"
                      onClick={() => selectBrain("lm-studio")}
                      className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                        aiSettings.brain === "lm-studio"
                          ? "bg-white/[0.08] text-zinc-200"
                          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      LM Studio
                    </button>
                    {aiSettings.brain === "claude" && (
                      <>
                        <div className="mb-2 mt-3 px-2 py-1 text-xs text-zinc-500">Claude Model</div>
                        {CLAUDE_MODELS.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => selectClaudeModel(model.id)}
                            className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                              aiSettings.claudeModel === model.id
                                ? "bg-white/[0.08] text-zinc-200"
                                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                            }`}
                          >
                            {model.label}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Effort selector (Mercury only) */}
              {aiSettings.brain === "mercury" && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEffortDropdown(!showEffortDropdown)}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-white/20"
                  >
                    <span className="text-xs text-zinc-400">
                      {EFFORT_LEVELS.find((e) => e.id === aiSettings.reasoningEffort)?.label || "Medium"}
                    </span>
                    <svg className="h-3 w-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showEffortDropdown && (
                    <div className="absolute bottom-full left-0 mb-2 w-40 rounded-lg border border-white/10 bg-abyss p-2 shadow-2xl">
                      <div className="mb-2 px-2 py-1 text-xs text-zinc-500">Effort</div>
                      {EFFORT_LEVELS.map((effort) => (
                        <button
                          key={effort.id}
                          type="button"
                          onClick={() => selectEffort(effort.id as ReasoningEffort)}
                          className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                            aiSettings.reasoningEffort === effort.id
                              ? "bg-white/[0.08] text-zinc-200"
                              : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                          }`}
                        >
                          {effort.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Workspace selector */}
              <button
                type="button"
                onClick={handleSelectWorkspace}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
                title={activeSession.workspace || "No workspace selected"}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                {activeSession.workspace ? activeSession.workspace.split(/[\\/]/).pop() : "main"}
              </button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything, / for commands, @ for context..."
                disabled={isStreaming}
                className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-white/20 disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/[0.15] disabled:opacity-50 disabled:hover:bg-white/10"
              >
                {isStreaming ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </div>
      )}

      <NewSessionDialog
        open={showNewSessionDialog}
        onClose={() => setShowNewSessionDialog(false)}
        onCreateSession={createSession}
      />
    </div>
  );
}
