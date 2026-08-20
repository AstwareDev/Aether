import { useCallback, useEffect, useRef } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  Separator,
  UndoRedo,
  codeBlockPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import type { MDXEditorMethods } from "@mdxeditor/editor";
import { previewImageSrc } from "../lib/markdown/images";
import "@mdxeditor/editor/style.css";
import "../styles/richtext.css";

interface RichTextEditorProps {
  path: string;
  content: string;
  onChange: (markdown: string) => void;
  onSave: () => void;
}

export default function RichTextEditor({ path, content, onChange, onSave }: RichTextEditorProps) {
  const ref = useRef<MDXEditorMethods>(null);
  // Markdown this editor produced. Echoes of our own edits must not be pushed
  // back in, or the caret jumps to the start on every keystroke.
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    if (content === lastEmitted.current) return;
    if (ref.current && ref.current.getMarkdown() !== content) ref.current.setMarkdown(content);
  }, [content]);

  /**
   * Display-only URL resolution. MDXEditor serializes the node's original src,
   * so the blob URL returned here never reaches the file.
   */
  const previewImage = useCallback((src: string) => previewImageSrc(src, path), [path]);

  const handleChange = useCallback(
    (markdown: string) => {
      lastEmitted.current = markdown;
      onChange(markdown);
    },
    [onChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave();
      }
    },
    [onSave],
  );

  return (
    <div className="aether-rte scroll-thin h-full min-h-0 overflow-auto bg-canvas" onKeyDown={onKeyDown}>
      <MDXEditor
        ref={ref}
        markdown={content}
        onChange={handleChange}
        className="dark-theme"
        contentEditableClassName="aether-rte-body"
        placeholder="Start writing…"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          imagePlugin({ imagePreviewHandler: previewImage }),
          tablePlugin(),
          thematicBreakPlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <Separator />
                <BoldItalicUnderlineToggles />
                <CodeToggle />
                <Separator />
                <BlockTypeSelect />
                <Separator />
                <ListsToggle />
                <Separator />
                <CreateLink />
                <InsertImage />
                <Separator />
                <InsertTable />
                <InsertThematicBreak />
                <InsertCodeBlock />
              </>
            ),
          }),
        ]}
      />
    </div>
  );
}
