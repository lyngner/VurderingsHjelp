
import React, { useEffect, useRef, useMemo } from 'react';

export const Spinner: React.FC<{ size?: string; color?: string }> = ({ size = "w-4 h-4", color = "text-indigo-600" }) => (
  <svg className={`animate-spin ${size} ${color}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export const LatexRenderer: React.FC<{ content: string; className?: string }> = ({ content, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const processedContent = useMemo(() => {
    if (!content) return "";
    return content
      .split('\n')
      .map(line => line.trim() ? `<p class="mb-2 last:mb-0">${line}</p>` : '<div class="h-4"></div>')
      .join('');
  }, [content]);

  useEffect(() => {
    const mathjax = (window as any).MathJax;
    if (containerRef.current && mathjax && mathjax.typesetPromise) {
      // Vi bruker en timeout eller requestAnimationFrame for å sikre at React 
      // har skrevet til DOM-en før MathJax prøver å finne formlene.
      requestAnimationFrame(() => {
        try {
          // Viktig: Fjern gammel "prosessert" status for denne containeren
          mathjax.typesetClear([containerRef.current]);
          // Kjør ny rendring
          mathjax.typesetPromise([containerRef.current]).catch((err: any) => {
            console.debug("MathJax error (expected during fast switching):", err);
          });
        } catch (e) {
          console.warn("MathJax failed to clear or typeset:", e);
        }
      });
    }
  }, [processedContent]);

  return (
    <div 
      ref={containerRef} 
      className={`math-container leading-relaxed break-words overflow-x-auto custom-scrollbar tex2jax_process ${className}`}
      dangerouslySetInnerHTML={{ __html: processedContent }} 
    />
  );
};
