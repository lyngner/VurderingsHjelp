
import React, { useEffect, useRef, useState } from 'react';
import { SYSTEM_VERSION } from '../types';
import { renderAsync } from 'docx-preview';
import { getMedia } from '../services/storageService';

export const Spinner: React.FC<{ size?: string; color?: string }> = ({ size = "w-4 h-4", color = "text-indigo-600" }) => (
  <svg className={`animate-spin ${size} ${color}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// v8.5.7: Docx Visual Renderer
export const DocxRenderer: React.FC<{ pageId: string, className?: string }> = ({ pageId, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const renderDoc = async () => {
            if (!containerRef.current) return;
            setLoading(true);
            try {
                const base64 = await getMedia(pageId);
                if (!base64) throw new Error("Filen finnes ikke lokalt");
                
                // Convert base64 to Blob
                const byteCharacters = atob(base64.split(',')[1]);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
                
                containerRef.current.innerHTML = ''; // Clear previous
                await renderAsync(blob, containerRef.current, undefined, {
                    inWrapper: false,
                    ignoreWidth: false,
                    ignoreHeight: false,
                    ignoreFonts: false,
                    breakPages: true,
                    useBase64URL: true,
                    experimental: true
                });
            } catch (e: any) {
                console.error("Docx render error:", e);
                setError("Kunne ikke vise dokumentet: " + e.message);
            } finally {
                setLoading(false);
            }
        };
        renderDoc();
    }, [pageId]);

    return (
        <div className={`bg-white rounded-xl border border-slate-200 shadow-md p-4 min-h-[400px] relative overflow-auto custom-scrollbar ${className}`}>
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                    <Spinner size="w-8 h-8" />
                </div>
            )}
            {error ? (
                <div className="flex flex-col items-center justify-center h-full text-rose-500 gap-2">
                    <span className="text-2xl">📄❌</span>
                    <p className="text-xs font-bold uppercase tracking-widest">{error}</p>
                </div>
            ) : (
                <div ref={containerRef} className="docx-container" />
            )}
        </div>
    );
};

/**
 * LatexRenderer v8.2.11: The Formatter
 * - Fixes red backslash issue (invalid line breaks before aligned)
 * - Improved verbatim/code block detection
 */
export const LatexRenderer: React.FC<{ content: string; className?: string }> = ({ content, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRendered, setIsRendered] = useState(false);
  
  useEffect(() => {
    const mathjax = (window as any).MathJax;
    
    if (containerRef.current && mathjax && mathjax.typesetPromise) {
      setIsRendered(false);
      
      const timer = setTimeout(() => {
        // Only typeset elements that are NOT code blocks (marked with data-no-math)
        const mathElements = containerRef.current?.querySelectorAll('.tex2jax_process');
        
        if (mathElements && mathElements.length > 0) {
            mathjax.typesetClear(mathElements);
            mathjax.typesetPromise(mathElements)
            .then(() => setIsRendered(true))
            .catch((err: any) => {
                console.warn("MathJax error:", err);
                setIsRendered(true);
            });
        } else {
            setIsRendered(true);
        }
      }, 50);
      
      return () => clearTimeout(timer);
    } else {
      setIsRendered(true);
    }
  }, [content]);

  const sanitizeLatex = (text: string): string => {
    if (!text) return "";
    let clean = text;

    // v8.2.10: Unicode Decode Fix (e.g. Skr\u00e5 -> Skrå)
    clean = clean.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    // v8.2.11: Enhanced Verbatim Fix (Allow spaces)
    // Convert \begin{verbatim} ... \end{verbatim} to Markdown Code Block
    clean = clean.replace(/\\begin\s*\{verbatim\}([\s\S]*?)\\end\s*\{verbatim\}/g, "\n```\n$1\n```\n");

    // v8.2.11: Fix Red Backslash (Remove \\ before \begin{aligned} or other environments)
    // AI often writes "Text \\ \begin{aligned}", which is invalid in inline math.
    clean = clean.replace(/\\\\\s*(\\begin\{)/g, "\n$1");

    // 1. Literal Newline Fix
    clean = clean.replace(/\\n/g, '\n');

    // 2. Double Exponent Fix (Strict Guard)
    clean = clean.replace(/([\w\)\}\]]+\^\{[^\}]+\})'/g, "{$1}'");
    clean = clean.replace(/([\w\)\}\]]+\^[\w\d]+)'/g, "{$1}'");

    // 3. Bold Fix
    clean = clean.replace(/\\bold\{/g, '\\mathbf{');

    // \b -> \begin (Repair only if it looks like corrupted 'egin')
    clean = clean.replace(/[\x08\s]*egin\{/g, '\\begin{'); 
    
    // \t -> \text (Repair corrupted 'ext')
    clean = clean.replace(/[\x0c\s]*rac\{/g, '\\frac{'); // Formfeed + rac -> frac
    clean = clean.replace(/[\t\s]*ext\{/g, '\\text{'); // Tab + ext -> text
    
    // v8.0.40 - v8.0.44: Aggressive Shorthand Repair
    clean = clean.replace(/\\f\s*\{/g, '\\frac{');
    clean = clean.replace(/\\f\s+(\d)/g, '\\frac $1');
    clean = clean.replace(/\\f(?![a-zA-Z])/g, '');

    clean = clean.replace(/\\t\s*\{/g, '\\text{');
    clean = clean.replace(/\\t\s*([A-ZÆØÅ][a-zæøå]*)/g, '\\mathrm{$1}');
    clean = clean.replace(/\\t(?!(ext|imes|heta|au|an|op|o))/g, '');

    clean = clean.replace(/\\b\s*\{aligned\}/g, '\\begin{aligned}');
    clean = clean.replace(/\\b(?!(eta|inom|egin|ar|f|ullet))/g, '');
    
    clean = clean.replace(/\\r\s*([\}\)\]\|\.\/])/g, '\\right$1');
    clean = clean.replace(/\\r(?!(ight|ho))/g, '');

    clean = clean.replace(/\\begin\{align\}/g, '\\begin{aligned}');
    clean = clean.replace(/\\end\{align\}/g, '\\end{aligned}');

    clean = clean.replace(/(^|[^\\])\\\s+\[/g, '$1\\['); 
    clean = clean.replace(/(^|[^\\])\\\s+\]/g, '$1\\]');
    clean = clean.replace(/(^|[^\\])\\\s+\(/g, '$1\\('); 
    clean = clean.replace(/(^|[^\\])\\\s+\)/g, '$1\\)');

    clean = clean.replace(/(\\begin\{aligned\}[\s\S]*?\\end\{aligned\})/g, (match, p1, offset, string) => {
        const prefix = string.substring(Math.max(0, offset - 5), offset);
        if (/(\\\)|\\\]|\$\$)$/.test(prefix.trimEnd())) return match;
        if (/(\\\(|\\\[|\$\$)$/.test(prefix.trimEnd())) return match;
        return `\\[\n${match}\n\\]`;
    });

    clean = clean.replace(/(\\\[|\\\()([\s\S]*?)(\\\)|\\\])/g, (match, open, content, close) => {
        let fixedContent = content;
        const beginCount = (fixedContent.match(/\\begin\{aligned\}/g) || []).length;
        const endCount = (fixedContent.match(/\\end\{aligned\}/g) || []).length;
        
        if (beginCount > endCount) {
            const missing = beginCount - endCount;
            fixedContent += "\n\\end{aligned}".repeat(missing);
        }
        return `${open}${fixedContent}${close}`;
    });

    return clean;
  };

  const processContent = (text: string) => {
    const cleanText = sanitizeLatex(text);

    // v8.5.3: Balanced Bracket Parser
    // Replaces regex split to handle nested brackets in visual evidence.
    const splitByImagesBalanced = (input: string) => {
        const parts: { type: 'text' | 'image', content: string }[] = [];
        const triggers = ["AI-TOLKNING AV FIGUR", "FIGURTOLKNING", "BESKRIVELSE AV BILDE", "VISUAL-EVIDENCE", "BILDEVEDLEGG"];
        // Regex to match the start of a tag: [TRIGGER...
        const triggerRegex = new RegExp(`^\\s*(?:${triggers.join('|')})(?:\\s*\\d*)?\\s*:?\\s*`, 'i');
    
        let currentIndex = 0;
        let textBufferStart = 0;
    
        while (currentIndex < input.length) {
            if (input[currentIndex] === '[') {
                // Check if this bracket starts a known tag
                const substring = input.substring(currentIndex + 1);
                const match = substring.match(triggerRegex);
                
                if (match) {
                    // It is a tag!
                    // 1. Flush existing text buffer
                    if (currentIndex > textBufferStart) {
                        parts.push({ type: 'text', content: input.substring(textBufferStart, currentIndex) });
                    }
                    
                    // 2. Find the matching closing bracket (handling nesting)
                    let balance = 1;
                    let searchIndex = currentIndex + 1;
                    
                    while (searchIndex < input.length && balance > 0) {
                        if (input[searchIndex] === '[') balance++;
                        else if (input[searchIndex] === ']') balance--;
                        searchIndex++;
                    }
                    
                    if (balance === 0) {
                        // Found complete block
                        const fullInnerContent = input.substring(currentIndex + 1, searchIndex - 1);
                        // Strip the trigger prefix to get pure content
                        const cleanContent = fullInnerContent.substring(match[0].length);
                        
                        const isNegative = cleanContent.length < 2 || /^(?:ingen|ikke|nei|tom|mangler|fant ikke)/i.test(cleanContent.trim());
                
                        if (!isNegative) {
                            parts.push({ type: 'image', content: cleanContent });
                        }
                        
                        // Advance cursor
                        currentIndex = searchIndex;
                        textBufferStart = searchIndex;
                        continue; 
                    }
                }
            }
            currentIndex++;
        }
        
        // Flush remaining text
        if (textBufferStart < input.length) {
            parts.push({ type: 'text', content: input.substring(textBufferStart) });
        }
        
        return parts;
    };

    // v8.2.10: Code Block Regex (Markdown style ``` ... ```)
    const codeRegex = /```(?:\w+)?\s*([\s\S]*?)```/g;

    const splitByCode = (input: string) => {
        const parts = [];
        let lastIndex = 0;
        let match;
        while ((match = codeRegex.exec(input)) !== null) {
            if (match.index > lastIndex) parts.push({ type: 'latex', content: input.substring(lastIndex, match.index) });
            
            // Add Code Block
            parts.push({ type: 'code', content: match[1].trim() });
            
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < input.length) parts.push({ type: 'latex', content: input.substring(lastIndex) });
        return parts;
    };

    const initialParts = splitByImagesBalanced(cleanText);
    const finalElements: React.ReactNode[] = [];

    initialParts.forEach((part, idx) => {
        if (part.type === 'image') {
            finalElements.push(
                <div key={`img-${idx}`} className="my-6 p-0 bg-slate-100 border-l-[4px] border-indigo-500 rounded-r-xl shadow-md overflow-hidden ring-1 ring-slate-300/50 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-200/80 px-4 py-2 flex items-center justify-between border-b border-slate-300">
                        <div className="text-[10px] font-black uppercase text-indigo-800 tracking-[0.15em] flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-600 shadow-sm"></span>
                            Tolkning av Gemini (Flash)
                        </div>
                    </div>
                    <div className="p-5 text-[12px] text-slate-900 font-medium leading-[1.7] font-mono whitespace-pre-wrap bg-slate-50/50">
                        {part.content.split('\n').map((line, i) => {
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
        } else {
            // Text part - Check for Code Blocks inside
            const subParts = splitByCode(part.content);
            subParts.forEach((sub, subIdx) => {
                if (sub.type === 'code') {
                    finalElements.push(
                        <div key={`code-${idx}-${subIdx}`} className="my-4 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                            <div className="bg-slate-800 text-slate-400 px-3 py-1 text-[9px] font-mono font-bold border-b border-slate-700 flex justify-between">
                                <span>KODE / UTREGNING</span>
                            </div>
                            <pre className="bg-[#1e1e1e] text-emerald-400 p-4 text-xs font-mono overflow-x-auto whitespace-pre">
                                <code>{sub.content}</code>
                            </pre>
                        </div>
                    );
                } else {
                    // Standard LaTeX Text
                    finalElements.push(
                        <span key={`text-${idx}-${subIdx}`} className="tex2jax_process">
                            {sub.content}
                        </span>
                    );
                }
            });
        }
    });

    return finalElements;
  };

  return (
    <div 
      ref={containerRef} 
      className={`math-content transition-opacity duration-300 ${isRendered ? 'opacity-100' : 'opacity-0'} ${className}`}
    >
      {processContent(content)}
    </div>
  );
};
