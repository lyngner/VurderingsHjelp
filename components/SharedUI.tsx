
import React, { useEffect, useRef, useState } from 'react';

export const Spinner: React.FC<{ size?: string; color?: string }> = ({ size = "w-4 h-4", color = "text-indigo-600" }) => (
  <svg className={`animate-spin ${size} ${color}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

/**
 * LatexRenderer v2: Bruker en enkelt container med pre-wrap for å unngå
 * at React-noder splitter opp LaTeX-delimitere.
 */
export const LatexRenderer: React.FC<{ content: string; className?: string }> = ({ content, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRendered, setIsRendered] = useState(false);
  
  // Vi trigger rendring hver gang innholdet endres
  useEffect(() => {
    const mathjax = (window as any).MathJax;
    
    if (containerRef.current && mathjax && mathjax.typesetPromise) {
      setIsRendered(false);
      
      // Vi bruker en liten timeout for å sikre at React har oppdatert DOM-en ferdig
      const timer = setTimeout(() => {
        mathjax.typesetClear([containerRef.current]);
        mathjax.typesetPromise([containerRef.current])
          .then(() => {
            setIsRendered(true);
          })
          .catch((err: any) => {
            console.warn("MathJax error:", err);
            setIsRendered(true);
          });
      }, 50);
      
      return () => clearTimeout(timer);
    } else {
      setIsRendered(true);
    }
  }, [content]);

  return (
    <div 
      ref={containerRef} 
      className={`math-content tex2jax_process transition-opacity duration-300 ${isRendered ? 'opacity-100' : 'opacity-0'} ${className}`}
    >
      {content}
    </div>
  );
};
