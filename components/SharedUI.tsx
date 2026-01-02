import React, { useEffect, useRef, useState } from 'react';

export const Spinner: React.FC<{ size?: string; color?: string }> = ({ size = "w-4 h-4", color = "text-indigo-600" }) => (
  <svg className={`animate-spin ${size} ${color}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

/**
 * LatexRenderer v2.12: Forbedret for v5.5.8 "Interleaved Flow"
 * Rendrer figur-bokser inline der de forekommer i tekststrømmen.
 * Terminal-liknende profil for digitalt arbeid og CAS.
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
    // Regex som fanger opp ulike figur-tagger, nå inkludert inline i teksten
    const figureRegex = /\[\s*(?:AI-TOLKNING AV FIGUR|FIGURTOLKNING|BESKRIVELSE AV BILDE|VISUAL-EVIDENCE)\s*:?\s*(.*?)\s*\]/gi;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = figureRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      parts.push(
        <div key={match.index} className="my-10 p-0 bg-slate-900 border-l-[6px] border-indigo-500 rounded-r-3xl shadow-2xl overflow-hidden ring-1 ring-white/10 animate-in fade-in zoom-in duration-300">
          <div className="bg-slate-800/80 px-6 py-3 flex items-center justify-between border-b border-white/5">
            <div className="text-[10px] font-black uppercase text-indigo-300 tracking-[0.2em] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
              Visuelt bevis: CAS / Graf / Figur
            </div>
            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">v5.5.8 Context Flow</div>
          </div>
          <div className="p-8 text-[13px] text-slate-100 font-medium leading-[1.8] font-mono whitespace-pre-wrap">
            {match[1].split('\n').map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return <br key={i} />;
              
              // Marker CAS kommandoer (linjer som starter med $ eller In:)
              const isCommand = /^(?:\$|In:|Linje|\d+:)/.test(trimmed);
              const isResult = /^->/.test(trimmed);
              
              return (
                <div key={i} className={`flex gap-4 ${isCommand ? 'text-indigo-300 mt-2 font-bold' : isResult ? 'text-emerald-400 pl-4 border-l border-white/10' : 'text-slate-300 opacity-80 italic'}`}>
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