import { memo, useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";
import { getIconForFile } from "../lib/icons/registry";
import {
  SearchIcon,
  CaseSensitiveIcon,
  WholeWordIcon,
  RegexIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  RefreshIcon,
  ClearIcon,
  ReplaceIcon,
  ReplaceAllIcon,
} from "../lib/icons/ui";

interface SearchMatch {
  path: string;
  rel: string;
  line: number;
  column: number;
  text: string;
  before: string[];
  after: string[];
}

interface SearchResult {
  matches: SearchMatch[];
  file_count: number;
  match_count: number;
  truncated: boolean;
}

interface FileMatches {
  path: string;
  rel: string;
  matches: SearchMatch[];
  expanded: boolean;
}

interface SearchProps {
  rootPath: string;
  /** Absolute folder the search should be limited to, from "Find in Folder…". */
  scope?: string | null;
  onOpenFile?: (filePath: string, line?: number, column?: number) => void;
}

export default memo(function Search({ rootPath, scope, onOpenFile }: SearchProps) {
  const [query, setQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [includePattern, setIncludePattern] = useState("");
  const [excludePattern, setExcludePattern] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [fileMatches, setFileMatches] = useState<FileMatches[]>([]);
  const searchTimeoutRef = useRef<number | null>(null);

  const performSearch = useCallback(async () => {
    if (!query.trim() || !rootPath) {
      setResults(null);
      setFileMatches([]);
      return;
    }

    setSearching(true);
    try {
      const result = await invoke<SearchResult>("search_files", {
        root: rootPath,
        query,
        caseSensitive,
        wholeWord,
        useRegex,
        includePattern: includePattern || null,
        excludePattern: excludePattern || null,
        contextLines: 1,
      });

      setResults(result);

      const grouped = new Map<string, SearchMatch[]>();
      result.matches.forEach((match) => {
        const existing = grouped.get(match.rel);
        if (existing) {
          existing.push(match);
        } else {
          grouped.set(match.rel, [match]);
        }
      });

      const files: FileMatches[] = Array.from(grouped.entries()).map(([rel, matches]) => ({
        path: matches[0].path,
        rel,
        matches,
        expanded: true,
      }));

      setFileMatches(files);
    } catch (error) {
      console.error("Search failed:", error);
      setResults(null);
      setFileMatches([]);
    } finally {
      setSearching(false);
    }
  }, [query, rootPath, caseSensitive, wholeWord, useRegex, includePattern, excludePattern]);

  // "Find in Folder…" hands over an absolute folder; turn it into the glob the
  // backend expects and reveal the filter row so the scope is visible.
  useEffect(() => {
    if (!scope) return;
    const root = rootPath.replace(/[/\\]+$/, "");
    const rel = scope.startsWith(root) ? scope.slice(root.length).replace(/^[/\\]/, "") : "";
    setIncludePattern(rel ? `${rel.replace(/\\/g, "/")}/**` : "");
    setShowFilters(true);
  }, [scope, rootPath]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch();
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [performSearch]);

  const toggleFileExpanded = useCallback((rel: string) => {
    setFileMatches((prev) =>
      prev.map((file) => (file.rel === rel ? { ...file, expanded: !file.expanded } : file))
    );
  }, []);

  const handleMatchClick = useCallback(
    (match: SearchMatch) => {
      onOpenFile?.(match.path, match.line, match.column);
    },
    [onOpenFile]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setResults(null);
    setFileMatches([]);
  }, []);

  const highlightMatch = useCallback(
    (text: string, matchText: string) => {
      if (!matchText) return text;

      try {
        let pattern: RegExp;
        if (useRegex) {
          pattern = new RegExp(matchText, caseSensitive ? "g" : "gi");
        } else {
          const escaped = matchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const boundedPattern = wholeWord ? `\\b${escaped}\\b` : escaped;
          pattern = new RegExp(boundedPattern, caseSensitive ? "g" : "gi");
        }

        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(text)) !== null) {
          if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
          }
          parts.push(
            <span key={match.index} className="bg-accent/30 text-accent">
              {match[0]}
            </span>
          );
          lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
          parts.push(text.slice(lastIndex));
        }

        return parts.length > 0 ? parts : text;
      } catch {
        return text;
      }
    },
    [caseSensitive, wholeWord, useRegex]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-white/[0.05] p-3">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 pr-20 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors focus:border-accent/50 focus:bg-white/[0.05]"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            <ToggleButton
              active={caseSensitive}
              onClick={() => setCaseSensitive(!caseSensitive)}
              label="Match Case"
            >
              <CaseSensitiveIcon size={14} />
            </ToggleButton>
            <ToggleButton
              active={wholeWord}
              onClick={() => setWholeWord(!wholeWord)}
              label="Match Whole Word"
            >
              <WholeWordIcon size={14} />
            </ToggleButton>
            <ToggleButton active={useRegex} onClick={() => setUseRegex(!useRegex)} label="Use Regular Expression">
              <RegexIcon size={14} />
            </ToggleButton>
            {query && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                type="button"
                onClick={handleClear}
                className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-200"
                title="Clear"
              >
                <ClearIcon size={12} />
              </motion.button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showReplace && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="relative overflow-hidden"
            >
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replace"
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 pr-16 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors focus:border-accent/50 focus:bg-white/[0.05]"
              />
              <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-200"
                  title="Replace"
                >
                  <ReplaceIcon size={13} />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-200"
                  title="Replace All"
                >
                  <ReplaceAllIcon size={13} />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-1">
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
          >
            {showFilters ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            <span>Filters</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={() => setShowReplace(!showReplace)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
          >
            <ReplaceIcon size={12} />
            <span>Replace</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={performSearch}
            disabled={searching}
            className="ml-auto flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200 disabled:opacity-50"
          >
            <RefreshIcon size={12} className={searching ? "animate-spin" : ""} />
            <span>Refresh</span>
          </motion.button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex flex-col gap-2 overflow-hidden"
            >
              <input
                type="text"
                value={includePattern}
                onChange={(e) => setIncludePattern(e.target.value)}
                placeholder="Files to include (e.g., *.ts, src/**)"
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors focus:border-accent/50 focus:bg-white/[0.05]"
              />
              <input
                type="text"
                value={excludePattern}
                onChange={(e) => setExcludePattern(e.target.value)}
                placeholder="Files to exclude (e.g., *.min.js, dist/**)"
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors focus:border-accent/50 focus:bg-white/[0.05]"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        {searching && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <RefreshIcon size={14} className="animate-spin" />
              <span>Searching...</span>
            </div>
          </div>
        )}

        {!searching && results && (
          <div className="p-2">
            <div className="mb-2 px-2 text-xs text-zinc-500">
              {results.match_count} {results.match_count === 1 ? "result" : "results"} in {results.file_count}{" "}
              {results.file_count === 1 ? "file" : "files"}
              {results.truncated && " (truncated)"}
            </div>

            <div className="space-y-0.5">
              {fileMatches.map((file) => (
                <FileMatchGroup
                  key={file.rel}
                  file={file}
                  query={query}
                  onToggle={toggleFileExpanded}
                  onMatchClick={handleMatchClick}
                  highlightMatch={highlightMatch}
                />
              ))}
            </div>
          </div>
        )}

        {!searching && !results && query && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <SearchIcon size={24} className="text-zinc-600" />
            <p className="text-xs text-zinc-500">No results found</p>
          </div>
        )}

        {!searching && !query && (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <SearchIcon size={28} className="text-zinc-600" />
            <div>
              <p className="text-sm font-medium text-zinc-400">Search your workspace</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                Find text across all files with support for regex, case sensitivity, and file filters
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      type="button"
      onClick={onClick}
      className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
        active ? "bg-accent/20 text-accent" : "text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200"
      }`}
      title={label}
    >
      {children}
    </motion.button>
  );
}

function FileMatchGroup({
  file,
  query,
  onToggle,
  onMatchClick,
  highlightMatch,
}: {
  file: FileMatches;
  query: string;
  onToggle: (rel: string) => void;
  onMatchClick: (match: SearchMatch) => void;
  highlightMatch: (text: string, query: string) => React.ReactNode;
}) {
  const Icon = getIconForFile(file.rel);

  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02]">
      <motion.button
        whileTap={{ scale: 0.98 }}
        type="button"
        onClick={() => onToggle(file.rel)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        {file.expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
        <Icon name={file.rel} size={14} />
        <span className="flex-1 truncate text-xs text-zinc-300">{file.rel}</span>
        <span className="text-[10px] text-zinc-600">{file.matches.length}</span>
      </motion.button>

      <AnimatePresence>
        {file.expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/[0.05]"
          >
            {file.matches.map((match, idx) => (
              <motion.button
                key={idx}
                whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.04)" }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => onMatchClick(match)}
                className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left transition-colors"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-mono text-zinc-600">{match.line}:</span>
                  <code className="flex-1 truncate text-xs font-mono text-zinc-400">
                    {highlightMatch(match.text, query)}
                  </code>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
