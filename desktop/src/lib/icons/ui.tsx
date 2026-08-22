import {
  FluentFiles,
  FluentSearch,
  FluentScm,
  FluentExtensions,
  FluentSettings,
  FluentNewFile,
  FluentNewFolder,
  FluentRefresh,
  FluentCollapseAll,
  FluentGoToFile,
  FluentError,
  FluentWarning,
  FluentSync,
  FluentBot,
  FluentSidebarLeft,
  FluentSplitVertical,
  FluentTrash,
  FluentEditorLayout,
  FluentTerminal,
  FluentAdd,
} from "@react-symbols/icons/fluent";
import type { UIIconProps, SvgComp } from "../../types";

function make(Icon: SvgComp) {
  return function UIIcon({ size = 16, className }: UIIconProps) {
    return <Icon width={size} height={size} style={{ width: size, height: size }} className={className} />;
  };
}

export const FilesIcon = make(FluentFiles);
export const SearchIcon = make(FluentSearch);
export const ScmIcon = make(FluentScm);
export const ExtensionsIcon = make(FluentExtensions);
export const SettingsIcon = make(FluentSettings);
export const NewFileIcon = make(FluentNewFile);
export const NewFolderIcon = make(FluentNewFolder);
export const RefreshIcon = make(FluentRefresh);
export const CollapseAllIcon = make(FluentCollapseAll);
export const GoToFileIcon = make(FluentGoToFile);
export const ErrorIcon = make(FluentError);
export const WarningIcon = make(FluentWarning);
export const SyncIcon = make(FluentSync);
export const BotIcon = make(FluentBot);
export const SidebarIcon = make(FluentSidebarLeft);
export const TerminalIcon = make(FluentTerminal);
export const AddIcon = make(FluentAdd);
export const SplitIcon = make(FluentSplitVertical);
export const TrashIcon = make(FluentTrash);
export const LayoutIcon = make(FluentEditorLayout);

export const CaseSensitiveIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path d="M3.5 4h2l2.5 7h-1.5l-.5-1.5h-2.5l-.5 1.5h-1.5l2.5-7zm1 1.5l-.75 2.5h1.5l-.75-2.5zm6.5-1.5h1.5v2h.5c.83 0 1.5.67 1.5 1.5v2c0 .83-.67 1.5-1.5 1.5h-2v-7zm1.5 3.5v2h.5c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-.5z"/>
  </svg>
);

export const WholeWordIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path d="M1 4h2l1 4 1-4h2l1 4 1-4h2l-2 7h-2l-1-4-1 4h-2l-2-7z"/>
  </svg>
);

export const RegexIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path d="M2 4.5c0-.28.22-.5.5-.5h1c.28 0 .5.22.5.5v1c0 .28-.22.5-.5.5h-1c-.28 0-.5-.22-.5-.5v-1zm3 0c0-.28.22-.5.5-.5h1c.28 0 .5.22.5.5v1c0 .28-.22.5-.5.5h-1c-.28 0-.5-.22-.5-.5v-1zm-3 3c0-.28.22-.5.5-.5h1c.28 0 .5.22.5.5v1c0 .28-.22.5-.5.5h-1c-.28 0-.5-.22-.5-.5v-1zm3 0c0-.28.22-.5.5-.5h1c.28 0 .5.22.5.5v1c0 .28-.22.5-.5.5h-1c-.28 0-.5-.22-.5-.5v-1zm3-3c0-.28.22-.5.5-.5h1c.28 0 .5.22.5.5v1c0 .28-.22.5-.5.5h-1c-.28 0-.5-.22-.5-.5v-1zm3 0c0-.28.22-.5.5-.5h1c.28 0 .5.22.5.5v1c0 .28-.22.5-.5.5h-1c-.28 0-.5-.22-.5-.5v-1z"/>
  </svg>
);

export const ChevronDownIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/>
  </svg>
);

export const ChevronRightIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path d="M7.427 4.427l3.396 3.396a.25.25 0 010 .354l-3.396 3.396A.25.25 0 017 11.396V4.604a.25.25 0 01.427-.177z"/>
  </svg>
);

export const ClearIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.707L8 8.707z"/>
  </svg>
);

export const ReplaceIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path d="M3 3h8v1.5h-8v-1.5zm0 3h8v1.5h-8v-1.5zm0 3h5v1.5h-5v-1.5zm9-2.5v3.5h1.5v-3.5h1.5l-2.25-2.25-2.25 2.25h1.5z"/>
  </svg>
);

export const BrowserIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className={className}>
    <circle cx="8" cy="8" r="6.2" />
    <ellipse cx="8" cy="8" rx="2.6" ry="6.2" />
    <path d="M2 6h12M2 10h12" />
  </svg>
);

export const HomeIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2.5 7L8 2.5 13.5 7" />
    <path d="M3.75 8v5a.75.75 0 00.75.75h7a.75.75 0 00.75-.75V8" />
  </svg>
);

export const ArrowLeftIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M10 3L5 8l5 5" />
  </svg>
);

export const ArrowRightIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 3l5 5-5 5" />
  </svg>
);

export const ExternalLinkIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 2.5h4.5V7" />
    <path d="M13.5 2.5L7.5 8.5" />
    <path d="M12 9.5v3a1 1 0 01-1 1H3.5a1 1 0 01-1-1V5a1 1 0 011-1h3" />
  </svg>
);

export const ReplaceAllIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path d="M2 2h8v1h-8v-1zm0 2h8v1h-8v-1zm0 2h5v1h-5v-1zm9-1.5v3h1v-3h1l-1.5-1.5-1.5 1.5h1zm-9 4.5h8v1h-8v-1zm0 2h8v1h-8v-1zm0 2h5v1h-5v-1zm9-1.5v3h1v-3h1l-1.5-1.5-1.5 1.5h1z"/>
  </svg>
);

export const InspectIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M6.5 2.5v11" />
    <path d="M9 6l2 2-2 2" />
  </svg>
);

export const PickerIcon = ({ size = 16, className }: UIIconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2.5 6V3.5a1 1 0 011-1H6" />
    <path d="M10 2.5h2.5a1 1 0 011 1V6" />
    <path d="M2.5 10v2.5a1 1 0 001 1H6" />
    <path d="M7.5 7.5l5.5 2-2.2.9-.9 2.2-2.4-5.1z" fill="currentColor" stroke="none" />
  </svg>
);
