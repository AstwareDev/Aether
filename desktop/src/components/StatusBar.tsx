import { ErrorIcon, WarningIcon, SyncIcon, BotIcon } from "../lib/icons/ui";
import type { StatusBarProps } from "../types";

function Segment({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const cls =
    "flex items-center gap-1.5 px-2 h-full text-[11px] transition-colors " +
    (onClick ? "hover:bg-white/[0.09] cursor-pointer" : "");
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={cls}>
      {children}
    </button>
  ) : (
    <span title={title} className={cls}>
      {children}
    </span>
  );
}

export default function StatusBar({ cursor, language, iconThemeLabel, onPickIconTheme }: StatusBarProps) {
  return (
    <div className="flex h-6 shrink-0 items-stretch justify-between border-t border-white/[0.06] bg-void text-zinc-400">
      <div className="flex items-stretch">
        <Segment title="Current branch">
          <span className="text-accent">
            <SyncIcon size={12} />
          </span>
          main
        </Segment>
        <Segment title="Problems">
          <span className="flex items-center gap-0.5">
            <ErrorIcon size={12} /> 0
          </span>
          <span className="flex items-center gap-0.5">
            <WarningIcon size={12} /> 0
          </span>
        </Segment>
      </div>

      <div className="flex items-stretch">
        {cursor && <Segment title="Line and column">Ln {cursor.line}, Col {cursor.col}</Segment>}
        <Segment title="Indentation">Spaces: 2</Segment>
        <Segment title="Encoding">UTF-8</Segment>
        {language && <Segment title="Language mode">{language}</Segment>}
        <Segment title="File icon theme" onClick={onPickIconTheme}>
          {iconThemeLabel}
        </Segment>
        <Segment title="Aether AI">
          <span className="text-accent">
            <BotIcon size={13} />
          </span>
        </Segment>
      </div>
    </div>
  );
}
