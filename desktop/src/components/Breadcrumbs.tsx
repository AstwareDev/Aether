import { Fragment, memo } from "react";
import { FileTypeIcon, FolderTypeIcon } from "../lib/icons";
import type { BreadcrumbsProps } from "../types";

export default memo(function Breadcrumbs({ relPath }: BreadcrumbsProps) {
  if (!relPath) return null;
  const segments = relPath.split("/").filter(Boolean);

  return (
    <div className="flex h-7 shrink-0 items-center gap-1 border-b border-white/[0.05] bg-canvas px-3 text-[12px] text-zinc-500">
      {segments.map((segment, i) => {
        const isFile = i === segments.length - 1;
        return (
          <Fragment key={`${segment}-${i}`}>
            {i > 0 && <span className="text-zinc-700">›</span>}
            <span className={`flex items-center gap-1.5 ${isFile ? "text-zinc-300" : ""}`}>
              {isFile ? (
                <FileTypeIcon name={segment} size={14} />
              ) : (
                <FolderTypeIcon name={segment} open size={14} />
              )}
              {segment}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
});
