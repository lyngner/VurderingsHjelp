
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
      if (!trimmedLine) return "<div class='h-3'></div>"; // Mer kontrollert linjeavstand
      
      // En linje regnes som matematikk hvis den inneholder spesifikke tegn
      const hasMath = /[=^+\-*/]|ln|lg|log|lim|sin|cos|tan|\\|\[|\]|root|int|[0-9][a-z]/i.test(trimmedLine);
      
      if (hasMath) {
        // Rens teksten for eventuelle eksisterende dollartegn og legg til nye for blokkvisning
        let cleanLine = trimmedLine.replace(/\$/g, "");
        // Standardiser vanlige tegn
        cleanLine = cleanLine
          .replace(/=>/g, '\\Rightarrow ')
          .replace(/->/g, '\\to ')
          .replace(/\*/g, '\\cdot ')
          .replace(/\^(\d+)/g, '^{$1}');
          
        return `<div class="my-2 py-1"><span class="math-display">$$${cleanLine}$$</span></div>`;
      }
      
      return `<div class="mb-1">${trimmedLine}</div>`;
    }).join('');
  }, [content]);

  useEffect(() => {
    if (containerRef.current && (window as any).MathJax) {
      // Bruk en liten delay for å sikre at DOM er klar før MathJax prosesserer
      const timer = setTimeout(() => { 
        if (containerRef.current) {
          (window as any).MathJax.typesetPromise([containerRef.current]).catch((err: any) => {
            console.warn("MathJax typeset failed:", err);
          }); 
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [processedHtml]);

  return (
    <div 
      ref={containerRef} 
      className={`leading-relaxed prose prose-slate max-w-none break-words overflow-x-auto ${className}`} 
      dangerouslySetInnerHTML={{ __html: processedHtml }} 
    />
  );
};
