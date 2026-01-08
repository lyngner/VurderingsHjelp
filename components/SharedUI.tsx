
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { SYSTEM_VERSION } from '../types';
import { renderAsync } from 'docx-preview';
import { getMedia } from '../services/storageService';

export const Spinner: React.FC<{ size?: string; color?: string }> = ({ size = "w-4 h-4", color = "text-indigo-600" }) => (
  <svg className={`animate-spin ${size} ${color}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// --- Visual Engine Components ---

const VectorGrid: React.FC<{ commandStr: string }> = ({ commandStr }) => {
  const { vectors, labels } = useMemo(() => {
    // Vectors: vec(name, dx, dy, startX?, startY?)
    const vecRegex = /vec\s*\(\s*([^,]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)(?:\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+))?\s*\)/gi;
    // Labels: label("text", x, y)
    const labelRegex = /label\s*\(\s*"([^"]+)"\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/gi;

    const v = [...commandStr.matchAll(vecRegex)].map(m => ({
      name: m[1].trim(),
      dx: parseFloat(m[2]),
      dy: parseFloat(m[3]),
      startX: m[4] ? parseFloat(m[4]) : 0,
      startY: m[5] ? parseFloat(m[5]) : 0,
      color: ['u', 'a'].some(char => m[1].toLowerCase().includes(char)) ? '#4f46e5' : '#059669' 
    }));

    const l = [...commandStr.matchAll(labelRegex)].map(m => ({
      text: m[1],
      x: parseFloat(m[2]),
      y: parseFloat(m[3])
    }));

    return { vectors: v, labels: l };
  }, [commandStr]);

  if (vectors.length === 0 && labels.length === 0) return null;

  // Calculate ViewBox dynamic range
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  
  vectors.forEach(v => {
    minX = Math.min(minX, v.startX, v.startX + v.dx);
    maxX = Math.max(maxX, v.startX, v.startX + v.dx);
    minY = Math.min(minY, v.startY, v.startY + v.dy);
    maxY = Math.max(maxY, v.startY, v.startY + v.dy);
  });

  labels.forEach(l => {
    minX = Math.min(minX, l.x);
    maxX = Math.max(maxX, l.x);
    minY = Math.min(minY, l.y);
    maxY = Math.max(maxY, l.y);
  });
  
  const padding = 2;
  const startX = Math.floor(minX - padding);
  const endX = Math.ceil(maxX + padding);
  const startY = Math.floor(minY - padding);
  const endY = Math.ceil(maxY + padding);
  
  const width = endX - startX;
  const height = endY - startY;
  const scale = 40; 

  // v8.9.7: Cleaner for vector labels (strips LaTeX)
  const cleanLabel = (str: string) => {
      // Remove \vec{}, \mathbf{}, {}, $
      return str.replace(/\\[a-zA-Z]+\s*\{?/g, '').replace(/[\{\}\$\^]/g, '');
  };

  return (
    <div className="my-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
      <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 self-start">Vektorisering</div>
      <svg width={width * scale} height={height * scale} viewBox={`${startX * scale} ${-endY * scale} ${width * scale} ${height * scale}`} className="overflow-visible font-mono text-xs">
        <defs>
          <marker id="arrowhead-indigo" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#4f46e5" /></marker>
          <marker id="arrowhead-emerald" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#059669" /></marker>
        </defs>
        
        {/* Grid Lines */}
        {Array.from({ length: width + 1 }).map((_, i) => (<line key={`v${i}`} x1={(startX + i) * scale} y1={-startY * scale} x2={(startX + i) * scale} y2={-endY * scale} stroke="#e2e8f0" strokeWidth="1" />))}
        {Array.from({ length: height + 1 }).map((_, i) => (<line key={`h${i}`} x1={startX * scale} y1={-(startY + i) * scale} x2={endX * scale} y2={-(startY + i) * scale} stroke="#e2e8f0" strokeWidth="1" />))}
        
        {/* Axes (if visible) */}
        {startY <= 0 && endY >= 0 && <line x1={startX * scale} y1={0} x2={endX * scale} y2={0} stroke="#94a3b8" strokeWidth="2" />}
        {startX <= 0 && endX >= 0 && <line x1={0} y1={-startY * scale} x2={0} y2={-endY * scale} stroke="#94a3b8" strokeWidth="2" />}
        
        {/* Vectors */}
        {vectors.map((v, i) => {
          const isIndigo = v.color === '#4f46e5';
          const x1 = v.startX * scale;
          const y1 = -v.startY * scale;
          const x2 = (v.startX + v.dx) * scale;
          const y2 = -(v.startY + v.dy) * scale;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          return (
            <g key={`vec-${i}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={v.color} strokeWidth="3" markerEnd={`url(#arrowhead-${isIndigo ? 'indigo' : 'emerald'})`} />
              <text x={midX} y={midY - 10} fill={v.color} fontWeight="bold" fontSize="14" textAnchor="middle">{cleanLabel(v.name)}</text>
            </g>
          );
        })}

        {/* Custom Labels */}
        {labels.map((l, i) => (
           <text key={`lbl-${i}`} x={l.x * scale} y={-l.y * scale} fill="#334155" fontWeight="bold" fontSize="12" textAnchor="middle">{cleanLabel(l.text)}</text>
        ))}
      </svg>
    </div>
  );
};

const FunctionPlot: React.FC<{ commandStr: string }> = ({ commandStr }) => {
  // Format: [FUNCTION_PLOT: formula="x^2 - 2*x", xMin=-2, xMax=4]
  const [error, setError] = useState<string | null>(null);
  
  const params = useMemo(() => {
    try {
      const formulaMatch = commandStr.match(/formula="([^"]+)"/);
      const xMinMatch = commandStr.match(/xMin=([-\d\.]+)/);
      const xMaxMatch = commandStr.match(/xMax=([-\d\.]+)/);
      
      if (!formulaMatch) return null;
      
      let jsFormula = formulaMatch[1].replace(/\^/g, '**'); // Convert power syntax
      // Safety: Only allow basic Math functions and x
      if (!/^[\d\.\s\+\-\*\/\(\)xMath\.sincostanlogexpsqrtPIE\*\*]+$/.test(jsFormula)) {
         throw new Error("Ugyldig funksjonssyntaks");
      }
      // Add 'Math.' prefix to common functions if missing
      jsFormula = jsFormula.replace(/(sin|cos|tan|log|sqrt|exp)\(/g, 'Math.$1(');

      return {
        func: new Function('x', `return ${jsFormula}`),
        xMin: xMinMatch ? parseFloat(xMinMatch[1]) : -5,
        xMax: xMaxMatch ? parseFloat(xMaxMatch[1]) : 5,
        expression: formulaMatch[1]
      };
    } catch (e: any) {
      setError(e.message);
      return null;
    }
  }, [commandStr]);

  if (error || !params) return error ? <div className="text-rose-500 text-xs">{error}</div> : null;

  const width = 300;
  const height = 200;
  const points = [];
  const step = (params.xMax - params.xMin) / 100;
  
  let yMin = Infinity, yMax = -Infinity;

  for (let x = params.xMin; x <= params.xMax; x += step) {
    try {
      const y = params.func(x);
      if (isFinite(y)) {
        points.push({ x, y });
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
      }
    } catch {}
  }

  // Add padding to Y
  const yPadding = (yMax - yMin) * 0.1 || 1;
  yMin -= yPadding;
  yMax += yPadding;

  const mapX = (x: number) => ((x - params.xMin) / (params.xMax - params.xMin)) * width;
  const mapY = (y: number) => height - ((y - yMin) / (yMax - yMin)) * height;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${mapX(p.x).toFixed(1)} ${mapY(p.y).toFixed(1)}`).join(' ');

  return (
    <div className="my-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
      <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 self-start">Funksjonsgraf</div>
      <svg width={width} height={height} className="overflow-visible border border-slate-100 bg-slate-50/30">
        {/* Axes */}
        {yMin < 0 && yMax > 0 && <line x1={0} y1={mapY(0)} x2={width} y2={mapY(0)} stroke="#cbd5e1" strokeWidth="1.5" />}
        {params.xMin < 0 && params.xMax > 0 && <line x1={mapX(0)} y1={0} x2={mapX(0)} y2={height} stroke="#cbd5e1" strokeWidth="1.5" />}
        
        <path d={pathD} fill="none" stroke="#4f46e5" strokeWidth="2.5" />
        
        {/* Labels */}
        <text x={2} y={height - 2} fontSize="9" fill="#94a3b8">{params.xMin}</text>
        <text x={width - 20} y={height - 2} fontSize="9" fill="#94a3b8">{params.xMax}</text>
      </svg>
      <div className="mt-2 text-xs font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded">f(x) = {params.expression}</div>
    </div>
  );
};

const SignChart: React.FC<{ commandStr: string }> = ({ commandStr }) => {
  // Format: [SIGN_CHART: Points: -2, 1 | Line: x+2, -, 0, +, + | Line: f(x), +, 0, -, 0, +]
  const parsed = useMemo(() => {
    try {
      const parts = commandStr.split('|').map(s => s.trim());
      const pointsPart = parts.find(p => p.startsWith('Points:'));
      if (!pointsPart) return null;
      
      const criticalPoints = pointsPart.replace('Points:', '').split(',').map(s => s.trim());
      
      const rows = parts.filter(p => p.startsWith('Line:') || p.startsWith('Sum:')).map(p => {
        const content = p.replace(/^(Line|Sum):/, '').trim();
        const [label, ...values] = content.split(',').map(s => s.trim());
        return { label, values, isSum: p.startsWith('Sum:') };
      });

      return { criticalPoints, rows };
    } catch { return null; }
  }, [commandStr]);

  if (!parsed) return null;

  const colWidth = 60;
  const labelWidth = 80;
  const rowHeight = 40;
  const totalWidth = labelWidth + (parsed.criticalPoints.length * colWidth) + (parsed.rows[0].values.length * colWidth); // Approx

  return (
    <div className="my-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
      <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Fortegnsskjema</div>
      <div className="flex flex-col gap-2 min-w-max">
        {/* Header Row (Critical Points) */}
        <div className="flex items-end h-8 relative pl-[80px]">
           {parsed.criticalPoints.map((pt, i) => (
             <div key={i} className="absolute text-xs font-bold text-slate-700 -translate-x-1/2" style={{ left: `${80 + (i + 1) * colWidth}px` }}>
               {pt}
             </div>
           ))}
        </div>

        {/* Rows */}
        {parsed.rows.map((row, rIdx) => (
          <div key={rIdx} className={`flex items-center h-10 relative ${row.isSum ? 'border-t-2 border-slate-800 mt-2 pt-2' : ''}`}>
            <div className="w-[80px] font-mono text-sm font-bold text-slate-800 shrink-0">{row.label}</div>
            
            {/* Draw lines */}
            <div className="flex-1 relative h-full">
               {/* Vertical Critical Lines */}
               {parsed.criticalPoints.map((_, i) => (
                 <div key={`vl-${i}`} className="absolute top-0 bottom-0 border-l border-slate-300 border-dashed" style={{ left: `${(i + 1) * colWidth}px` }}></div>
               ))}

               {/* Sign Segments */}
               {row.values.map((val, vIdx) => {
                  const centerX = vIdx * colWidth + (colWidth / 2); // Start at half col width (interval)
                  const startX = centerX; // Actually segments are between critical points
                  // Simplified Rendering: Just place symbols or lines based on index
                  // Logic: Indices 0, 2, 4 are intervals. Indices 1, 3 are critical points.
                  
                  // Let's use absolute positioning based on slots
                  // Slot 0: Interval (-inf to x1) -> width colWidth
                  // Slot 1: Point x1 -> width 0 (on line)
                  // Slot 2: Interval (x1 to x2) -> width colWidth
                  
                  // Since parsed values include the points: values length should be (points * 2) + 1
                  
                  const isPointSlot = vIdx % 2 !== 0; // 1, 3, 5 are points
                  const leftPos = (Math.ceil(vIdx / 2)) * colWidth + (isPointSlot ? 0 : 0); // Logic is tricky without exact mapping
                  // Better approach:
                  // The AI sends values list: [interval, point, interval, point, interval]
                  // e.g. ["-", "0", "+", "X", "+"]
                  
                  const xPos = vIdx * 0.5 * colWidth + (colWidth/2); // Distributed roughly
                  
                  // Proper grid Logic:
                  // Grid starts at 0. Critical points are at 1*W, 2*W, 3*W.
                  // Intervals are 0-1, 1-2, 2-3.
                  // Value 0 is Interval 1. Value 1 is Point 1. Value 2 is Interval 2.
                  
                  let element = null;
                  const slotWidth = colWidth;
                  const slotLeft = (vIdx * colWidth / 2) + (colWidth/2); 

                  if (val === '0') return <div key={vIdx} className="absolute w-3 h-3 rounded-full border-2 border-slate-800 bg-white z-10 -translate-x-1/2 top-1/2 -translate-y-1/2" style={{ left: `${slotLeft}px` }}></div>;
                  if (val === 'X' || val === 'x') return <div key={vIdx} className="absolute text-xs font-black text-rose-500 z-10 -translate-x-1/2 top-1/2 -translate-y-1/2" style={{ left: `${slotLeft}px` }}>X</div>;
                  
                  const lineStyle = val === '+' ? 'border-b-2 border-emerald-500' : 'border-b-2 border-dashed border-rose-400';
                  // Only draw lines for intervals (even indices)
                  if (!isPointSlot) {
                      return <div key={vIdx} className={`absolute top-1/2 -translate-y-1/2 w-[${colWidth}px] ${lineStyle}`} style={{ left: `${slotLeft - (colWidth/2)}px`, width: `${colWidth}px` }}></div>
                  }
                  return null;
               })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// v8.5.7: Docx Visual Renderer (Unchanged)
export const DocxRenderer: React.FC<{ pageId: string, className?: string }> = ({ pageId, className }) => {
    // ... code omitted for brevity as it is unchanged ...
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
                const byteCharacters = atob(base64.split(',')[1]);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
                
                containerRef.current.innerHTML = ''; 
                await renderAsync(blob, containerRef.current, undefined, {
                    inWrapper: false, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, breakPages: true, useBase64URL: true, experimental: true
                });
            } catch (e: any) { setError("Kunne ikke vise dokumentet: " + e.message); } finally { setLoading(false); }
        };
        renderDoc();
    }, [pageId]);

    return (
        <div className={`bg-white rounded-xl border border-slate-200 shadow-md p-4 min-h-[400px] relative overflow-auto custom-scrollbar ${className}`}>
            {loading && <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10"><Spinner size="w-8 h-8" /></div>}
            {error ? <div className="flex flex-col items-center justify-center h-full text-rose-500 gap-2"><span className="text-2xl">📄❌</span><p className="text-xs font-bold uppercase tracking-widest">{error}</p></div> : <div ref={containerRef} className="docx-container" />}
        </div>
    );
};

export const LatexRenderer: React.FC<{ content: string; className?: string }> = ({ content, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRendered, setIsRendered] = useState(false);
  
  useEffect(() => {
    const mathjax = (window as any).MathJax;
    if (containerRef.current && mathjax && mathjax.typesetPromise) {
      setIsRendered(false);
      const timer = setTimeout(() => {
        const mathElements = containerRef.current?.querySelectorAll('.tex2jax_process');
        if (mathElements && mathElements.length > 0) {
            mathjax.typesetClear(mathElements);
            mathjax.typesetPromise(mathElements).then(() => setIsRendered(true)).catch(() => setIsRendered(true));
        } else { setIsRendered(true); }
      }, 50);
      return () => clearTimeout(timer);
    } else { setIsRendered(true); }
  }, [content]);

  // Sanitize logic
  const sanitizeLatex = (text: string): string => {
      // v8.0.44: Clean up \t, \r, \f shorthands which cause MathJax errors
      let clean = text.replace(/\\t(?!(ext|imes|heta|an|au))/g, (match) => {
          if (/^\\t[A-Z]/.test(match)) return match.replace('\\t', '\\mathrm{');
          return '';
      });
      clean = clean.replace(/\\f(?![a-zA-Z])/g, '');
      clean = clean.replace(/\\r(?![h])/g, ''); // \rho is valid
      
      // v8.0.37: Double exponent fix e^x' -> {e^x}'
      clean = clean.replace(/(\^\{?[^{}]+\}?)\'/g, '{$1}\'');
      
      // v8.0.39: \f replacement
      clean = clean.replace(/\\f([^a-zA-Z])/g, '\\frac$1');
      
      // v8.2.3: Fix space after line break
      clean = clean.replace(/\\\\ \[/g, '\\\\[');
      clean = clean.replace(/\\ \[/g, '\\[');

      // v8.0.51: Auto-balance environments
      const beginCount = (clean.match(/\\begin\{aligned\}/g) || []).length;
      const endCount = (clean.match(/\\end\{aligned\}/g) || []).length;
      if (beginCount > endCount) {
          clean += '\\end{aligned}'.repeat(beginCount - endCount);
      }

      // v8.9.23: Promote inline aligned to display math to fix "Misplaced &"
      clean = clean.replace(/\\\(\s*\\begin\{aligned\}/g, '\\[\\begin{aligned}');
      clean = clean.replace(/\\end\{aligned\}\s*\\\)/g, '\\end{aligned}\\]');

      // v8.9.22: Stronger Auto-wrap for aligned environments (Global Fix for "Misplaced &")
      clean = clean.replace(/(\\begin\{aligned\}[\s\S]*?\\end\{aligned\})/g, (match, p1, offset, string) => {
          // Check context before to see if it's already wrapped in \[ or \(
          const before = string.substring(0, offset).trimEnd();
          if (before.endsWith('\\[') || before.endsWith('\\(') || before.endsWith('\\begin{equation}')) {
              return match; // Already wrapped
          }
          // Also strip empty lines inside aligned blocks as they break MathJax
          const stripped = match.replace(/\n\s*\n/g, '\n');
          return `\\[\n${stripped}\n\\]`;
      });

      return clean.replace(/\\n/g, '\n');
  };

  const processContent = (text: string) => {
    // v8.9.7: Unicode Fix (Decode \u00e5 to å)
    const unicodeFixed = text.replace(/\\u([a-fA-F0-9]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16)));
    
    const cleanText = sanitizeLatex(unicodeFixed);

    // Updated Parser for new Tags
    const splitByImagesBalanced = (input: string) => {
        const parts: { type: 'text' | 'image' | 'vector' | 'func' | 'sign', content: string }[] = [];
        const triggers = ["AI-TOLKNING AV FIGUR", "BILDEVEDLEGG", "VECTOR_PLOT", "FUNCTION_PLOT", "SIGN_CHART"];
        const triggerRegex = new RegExp(`^\\s*(?:${triggers.join('|')})(?:\\s*\\d*)?\\s*:?\\s*`, 'i');
    
        let currentIndex = 0;
        let textBufferStart = 0;
    
        while (currentIndex < input.length) {
            if (input[currentIndex] === '[') {
                const substring = input.substring(currentIndex + 1);
                const match = substring.match(triggerRegex);
                
                if (match) {
                    if (currentIndex > textBufferStart) parts.push({ type: 'text', content: input.substring(textBufferStart, currentIndex) });
                    
                    let balance = 1;
                    let searchIndex = currentIndex + 1;
                    while (searchIndex < input.length && balance > 0) {
                        if (input[searchIndex] === '[') balance++;
                        else if (input[searchIndex] === ']') balance--;
                        searchIndex++;
                    }
                    
                    if (balance === 0) {
                        const fullInnerContent = input.substring(currentIndex + 1, searchIndex - 1);
                        const cleanContent = fullInnerContent.substring(match[0].length);
                        const tag = match[0].toUpperCase();
                        
                        if (tag.includes("VECTOR_PLOT")) parts.push({ type: 'vector', content: cleanContent });
                        else if (tag.includes("FUNCTION_PLOT")) parts.push({ type: 'func', content: cleanContent });
                        else if (tag.includes("SIGN_CHART")) parts.push({ type: 'sign', content: cleanContent });
                        else parts.push({ type: 'image', content: cleanContent });
                        
                        currentIndex = searchIndex;
                        textBufferStart = searchIndex;
                        continue; 
                    }
                }
            }
            currentIndex++;
        }
        if (textBufferStart < input.length) parts.push({ type: 'text', content: input.substring(textBufferStart) });
        return parts;
    };

    const initialParts = splitByImagesBalanced(cleanText);
    const finalElements: React.ReactNode[] = [];

    initialParts.forEach((part, idx) => {
        if (part.type === 'vector') finalElements.push(<VectorGrid key={`vec-${idx}`} commandStr={part.content} />);
        else if (part.type === 'func') finalElements.push(<FunctionPlot key={`func-${idx}`} commandStr={part.content} />);
        else if (part.type === 'sign') finalElements.push(<SignChart key={`sign-${idx}`} commandStr={part.content} />);
        else if (part.type === 'image') {
            // v8.9.0: Recursively parse content inside the image box to catch nested VECTOR_PLOTs
            const nestedParts = splitByImagesBalanced(part.content);
            const nestedElements: React.ReactNode[] = [];
            
            nestedParts.forEach((subPart, sIdx) => {
                if (subPart.type === 'vector') nestedElements.push(<VectorGrid key={`sub-vec-${sIdx}`} commandStr={subPart.content} />);
                else if (subPart.type === 'func') nestedElements.push(<FunctionPlot key={`sub-func-${sIdx}`} commandStr={subPart.content} />);
                else if (subPart.type === 'sign') nestedElements.push(<SignChart key={`sub-sign-${sIdx}`} commandStr={subPart.content} />);
                else nestedElements.push(<span key={`sub-txt-${sIdx}`}>{subPart.content}</span>);
            });

            finalElements.push(
                <div key={`img-${idx}`} className="my-6 p-0 bg-slate-100 border-l-[4px] border-indigo-500 rounded-r-xl shadow-md overflow-hidden ring-1 ring-slate-300/50">
                    <div className="bg-slate-200/80 px-4 py-2 flex items-center justify-between border-b border-slate-300">
                        <div className="text-[10px] font-black uppercase text-indigo-800 tracking-[0.15em] flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-600 shadow-sm"></span>
                            Tolkning av Gemini ({SYSTEM_VERSION})
                        </div>
                    </div>
                    <div className="p-5 text-[12px] text-slate-900 font-medium leading-[1.7] font-mono whitespace-pre-wrap bg-slate-50/50">
                        {nestedElements}
                    </div>
                </div>
            );
        } else {
            finalElements.push(<span key={`txt-${idx}`} className="tex2jax_process">{part.content}</span>);
        }
    });

    return finalElements;
  };

  return (
    <div ref={containerRef} className={`math-content transition-opacity duration-300 ${isRendered ? 'opacity-100' : 'opacity-0'} ${className}`}>
      {processContent(content)}
    </div>
  );
};
