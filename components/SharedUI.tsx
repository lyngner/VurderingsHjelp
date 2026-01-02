import React, { useEffect, useRef, useState } from 'react';

export const Spinner: React.FC<{ size?: string; color?: string }> = ({ size = "w-4 h-4", color = "text-indigo-600" }) => (
  <svg className={`animate-spin ${size} ${color}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

/**
 * LatexRenderer v2.13: Visual Clarity Update (v5.6.8)
 * Rendrer figur-bokser i en lys grå stil for bedre lesbarhet.
 * Integrert tettere i tekststrømmen for naturlig "inline" følelse.
 */
export const LatexRenderer: React.FC<{ content: string; className?: string }> = ({ content, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRendered, setIsRendered] = useState(false);
  
  useEffect(() => {
    const mathjax = (window as any).MathJax;
    
    if (containerRef.current && mathjax && mathjax.typesetPromise) {
      setIsRendered(false);
      
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

  const processContent = (text: string) => {
    const figureRegex = /\[\s*(?:AI-TOLKNING AV FIGUR|FIGURTOLKNING|BESKRIVELSE AV BILDE|VISUAL-EVIDENCE)\s*:?\s*(.*?)\s*\]/gi;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = figureRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      parts.push(
        <div key={match.index} className="my-6 p-0 bg-slate-100 border-l-[4px] border-indigo-500 rounded-r-2xl shadow-sm overflow-hidden ring-1 ring-slate-200 animate-in fade-in slide-in-from-left-2 duration-300">
          <div className="bg-slate-200/50 px-4 py-1.5 flex items-center justify-between border-b border-slate-300/50">
            <div className="text-[9px] font-black uppercase text-indigo-700 tracking-[0.15em] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              Visuelt bevis: CAS / Figur
            </div>
            <div className="text-[7px] font-black text-slate-400 uppercase tracking-widest">v5.6.8 Context Flow</div>
          </div>
          <div className="p-5 text-[12px] text-slate-800 font-medium leading-[1.6] font-mono whitespace-pre-wrap">
            {match[1].split('\n').map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return <br key={i} />;
              
              const isCommand = /^(?:\$|In:|Linje|\d+:)/.test(trimmed);
              const isResult = /^->|Out:/.test(trimmed);
              
              return (
                <div key={i} className={`flex gap-3 ${isCommand ? 'text-indigo-800 mt-1 font-bold' : isResult ? 'text-emerald-700 pl-4 border-l border-slate-200' : 'text-slate-600 italic opacity-90'}`}>
                  <span className="flex-1">{trimmed}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
  };

  return (
    <div 
      ref={containerRef} 
      className={`math-content tex2jax_process transition-opacity duration-300 ${isRendered ? 'opacity-100' : 'opacity-0'} ${className}`}
    >
      {processContent(content)}
    </div>
  );
};