'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            
            // Check if it's an inline code or code block
            const isInline = !match && !codeString.includes('\n');
            
            if (isInline) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            
            return (
              <div className="relative group">
                {match && (
                  <div className="absolute top-0 right-0 px-3 py-1 text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] rounded-bl-lg rounded-tr-lg">
                    {match[1]}
                  </div>
                )}
                <SyntaxHighlighter
                  style={oneDark}
                  language={match ? match[1] : 'text'}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: '8px',
                    background: 'var(--code-bg)',
                    fontSize: '13px',
                  }}
                >
                  {codeString}
                </SyntaxHighlighter>
                <button
                  onClick={() => navigator.clipboard.writeText(codeString)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  title="Copy code"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                </button>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
