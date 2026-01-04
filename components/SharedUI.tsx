
import React, { useEffect, useRef, useState } from 'react';
import { SYSTEM_VERSION } from '../types';

export const Spinner: React.FC<{ size?: string; color?: string }> = ({ size = "w-4 h-4", color = "text-indigo-600" }) => (
  <svg className={`animate-spin ${size} ${color}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

/**
 * LatexRenderer v2.17: Literal Newline Fix (v7.9.4)
 * - Utvidet regex for å fange opp 'BILDEVEDLEGG'
 * - Automatisk konvertering av literal '\n' strenger til faktiske linjeskift
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
    // FIX v7.9.4: Erstatt litteære "\n" tegnsekvenser med faktiske linjeskift
    // Dette retter problemet der KI returnerer dobbel-escaped newlines ("\\n")
    const cleanText = text.replace(/\\n/g, '\n');

    // Regex oppdatert i v7.8.8: Inkluderer 'BILDEVEDLEGG' som gyldig trigger
    const figureRegex = /\[\s*(?:AI-TOLKNING AV FIGUR|FIGURTOLKNING|BESKRIVELSE AV BILDE|VISUAL-EVIDENCE|BILDEVEDLEGG)\s*:?\s*([\s\S]*?)\s*\]/gi;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = figureRegex.exec(cleanText)) !== null) {
      if (match.index > lastIndex) {
        parts.push(cleanText.substring(lastIndex, match.index));
      }

      const innerContent = match[1].trim();
      
      // REGEL v5.8.6: Skjul boks dersom den bare inneholder meldinger om fravær av figurer
      const isNegativeEvidence = 
        innerContent.length < 2 || // Ignorer hvis det bare er et tall (f.eks "[BILDEVEDLEGG 1]") uten tekst
        /^(?:ingen|ikke|nei|tom|mangler|fant ikke|no figures|no images|ingen bilder|ingen figurer|ingen cas)/i.test(innerContent) ||
        innerContent.toLowerCase().includes("er inkludert i tekstdokumentet");

      if (!isNegativeEvidence) {
        parts.push(
          <div key={match.index} className="my-6 p-0 bg-slate-100 border-l-[4px] border-indigo-500 rounded-r-xl shadow-md overflow-hidden ring-1 ring-slate-300/50 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="bg-slate-200/80 px-4 py-2 flex items-center justify-between border-b border-slate-300">
              <div className="text-[10px] font-black uppercase text-indigo-800 tracking-[0.15em] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-600 shadow-sm"></span>
                Tolkning av Gemini (Flash)
              </div>
              <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest bg-white/50 px-2 py-0.5 rounded">{SYSTEM_VERSION}</div>
            </div>
            <div className="p-5 text-[12px] text-slate-900 font-medium leading-[1.7] font-mono whitespace-pre-wrap bg-slate-50/50">
              {innerContent.split('\n').map((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={i} className="h-2"></div>;
                
                const isCommand = /^(?:\$|In:|Linje|\d+:)/.test(trimmed);
                const isResult = /^->|Out:/.test(trimmed);
                
                return (
                  <div key={i} className={`flex gap-3 mb-1 ${isCommand ? 'text-indigo-900 mt-2 font-bold bg-indigo-50/30 -mx-2 px-2 py-0.5 rounded' : isResult ? 'text-emerald-800 pl-4 border-l-2 border-emerald-200' : 'text-slate-700 italic'}`}>
                    <span className="flex-1">{trimmed}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
      
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < cleanText.length) {
      parts.push(cleanText.substring(lastIndex));
    }

    return parts.length > 0 ? parts : [cleanText];
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
