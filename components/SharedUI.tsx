
import React, { useEffect, useRef, useMemo } from 'react';

export const Spinner: React.FC<{ size?: string; color?: string }> = ({ size = "w-4 h-4", color = "text-indigo-600" }) => (
  <svg className={`animate-spin ${size} ${color}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export const LatexRenderer: React.FC<{ content: string; className?: string }> = ({ content, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const processedHtml = useMemo(() => {
    if (!content) return "";
    return content.split('\n').map(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return "<br/>";
      const hasMath = /[=^+\-*/]|ln|lg|log|lim|sin|cos|tan|\\|\[|\]|root|int|[0-9][a-z]/i.test(trimmedLine);
      if (hasMath) {
        let cleanLine = trimmedLine.replace(/\$/g, "");
        cleanLine = cleanLine.replace(/=>/g, '\\Rightarrow ').replace(/->/g, '\\to ').replace(/\*/g, '\\cdot ').replace(/\^(\d+)/g, '^{$1}');
        return `<div><span class="math-inline">$${cleanLine}$</span></div>`;
      }
      return `<div>${line}</div>`;
    }).join('');
  }, [content]);

  useEffect(() => {
    if (containerRef.current && (window as any).MathJax) {
      setTimeout(() => { (window as any).MathJax.typesetPromise([containerRef.current]).catch(() => {}); }, 50);
    }
  }, [processedHtml]);

  return <div ref={containerRef} className={`leading-relaxed prose prose-slate max-w-none break-words ${className}`} dangerouslySetInnerHTML={{ __html: processedHtml }} />;
};
