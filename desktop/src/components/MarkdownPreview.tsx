import { useEffect, useState } from "react";
import { marked } from "marked";
import { convertFileSrc } from "@tauri-apps/api/core";
import { dirName, joinPath } from "../lib/fs";

interface MarkdownPreviewProps {
  path: string;
  content: string;
}

export default function MarkdownPreview({ path, content }: MarkdownPreviewProps) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    const processMarkdown = async () => {
      const renderer = new marked.Renderer();

      renderer.image = function (token) {
        const href = token.href;
        let src = href;

        if (href.startsWith("http://") || href.startsWith("https://")) {
          src = href;
        } else if (href.startsWith("data:")) {
          src = href;
        } else {
          const fileDir = dirName(path);
          const resolvedPath = href.startsWith("/") ? href : joinPath(fileDir, href);
          src = convertFileSrc(resolvedPath);
        }

        const title = token.title ? ` title="${token.title}"` : "";
        const alt = token.text || "";
        return `<img src="${src}" alt="${alt}"${title} />`;
      };

      const originalLink = renderer.link.bind(renderer);
      renderer.link = function (token) {
        const href = token.href;
        if (href.startsWith("http://") || href.startsWith("https://")) {
          return `<a href="${href}" target="_blank" rel="noopener noreferrer">${token.text}</a>`;
        }
        return originalLink(token);
      };

      marked.setOptions({
        renderer,
        breaks: true,
        gfm: true,
      });

      const rendered = await marked.parse(content);
      setHtml(rendered);
    };

    processMarkdown();
  }, [content, path]);

  return (
    <div className="h-full overflow-auto bg-canvas">
      <div
        className="prose prose-invert mx-auto max-w-4xl px-8 py-12"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .prose {
          color: #d4d4d8;
          font-size: 15px;
          line-height: 1.7;
        }
        .prose h1 {
          color: #fafafa;
          font-size: 2em;
          font-weight: 700;
          margin-top: 0;
          margin-bottom: 1em;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 0.3em;
        }
        .prose h2 {
          color: #fafafa;
          font-size: 1.5em;
          font-weight: 600;
          margin-top: 1.5em;
          margin-bottom: 0.75em;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 0.3em;
        }
        .prose h3 {
          color: #fafafa;
          font-size: 1.25em;
          font-weight: 600;
          margin-top: 1.25em;
          margin-bottom: 0.5em;
        }
        .prose h4, .prose h5, .prose h6 {
          color: #fafafa;
          font-weight: 600;
          margin-top: 1em;
          margin-bottom: 0.5em;
        }
        .prose p {
          margin-top: 1em;
          margin-bottom: 1em;
        }
        .prose a {
          color: #60a5fa;
          text-decoration: none;
        }
        .prose a:hover {
          text-decoration: underline;
        }
        .prose strong {
          color: #fafafa;
          font-weight: 600;
        }
        .prose code {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
          padding: 0.2em 0.4em;
          font-size: 0.9em;
          color: #fca5a5;
          font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
        }
        .prose pre {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 1em;
          overflow-x: auto;
          margin-top: 1.5em;
          margin-bottom: 1.5em;
        }
        .prose pre code {
          background: transparent;
          padding: 0;
          color: #d4d4d8;
        }
        .prose blockquote {
          border-left: 4px solid rgba(255, 255, 255, 0.2);
          padding-left: 1em;
          margin-left: 0;
          color: #a1a1aa;
          font-style: italic;
        }
        .prose ul, .prose ol {
          padding-left: 1.5em;
          margin-top: 1em;
          margin-bottom: 1em;
        }
        .prose li {
          margin-top: 0.5em;
          margin-bottom: 0.5em;
        }
        .prose img {
          max-width: 100%;
          height: auto;
          border-radius: 6px;
          margin-top: 1.5em;
          margin-bottom: 1.5em;
        }
        .prose table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1.5em;
          margin-bottom: 1.5em;
        }
        .prose th, .prose td {
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 0.5em 0.75em;
          text-align: left;
        }
        .prose th {
          background: rgba(255, 255, 255, 0.05);
          font-weight: 600;
          color: #fafafa;
        }
        .prose hr {
          border: none;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          margin: 2em 0;
        }
        .prose input[type="checkbox"] {
          margin-right: 0.5em;
        }
      `}</style>
    </div>
  );
}
