"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "../lib/cn";

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

// rehype-highlight only puts a "language-*" class on the <code> inside a
// fenced code block's <pre> — inline `code` spans get no className — so
// that's how we tell the two apart without a v6-era `inline` prop (removed
// upstream in react-markdown v7+).
const MARKDOWN_COMPONENTS: Components = {
  a: ({ ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2" />
  ),
  p: ({ ...props }) => <p {...props} className="m-0 mb-2 last:mb-0" />,
  ul: ({ ...props }) => <ul {...props} className="m-0 mb-2 pl-4 list-disc" />,
  ol: ({ ...props }) => <ol {...props} className="m-0 mb-2 pl-4 list-decimal" />,
  li: ({ ...props }) => <li {...props} className="mb-0.5" />,
  h1: ({ ...props }) => <p {...props} className="text-[15px] font-bold mb-1.5" />,
  h2: ({ ...props }) => <p {...props} className="text-[14.5px] font-bold mb-1.5" />,
  h3: ({ ...props }) => <p {...props} className="text-[14px] font-bold mb-1" />,
  h4: ({ ...props }) => <p {...props} className="text-[13.5px] font-bold mb-1" />,
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="px-1 py-0.5 rounded bg-surface-subtle text-[0.9em] font-mono" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ ...props }) => (
    <pre
      {...props}
      className="cc-scroll overflow-x-auto rounded-lg bg-surface-subtle border border-border p-2.5 my-2 text-[12.5px] leading-snug font-mono"
    />
  ),
  blockquote: ({ ...props }) => (
    <blockquote {...props} className="border-l-2 border-border pl-2.5 my-2 italic opacity-90" />
  ),
  table: ({ ...props }) => (
    <div className="cc-scroll overflow-x-auto my-2">
      <table {...props} className="text-[13px] border-collapse" />
    </div>
  ),
  th: ({ ...props }) => <th {...props} className="border border-border px-2 py-1 bg-surface-subtle text-left" />,
  td: ({ ...props }) => <td {...props} className="border border-border px-2 py-1" />,
};

interface Props {
  content: string;
  className?: string;
}

export default function MarkdownContent({ content, className }: Props) {
  return (
    <div className={cn("cc-markdown", className)}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
