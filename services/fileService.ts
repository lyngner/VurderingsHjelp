
import { Page } from '../types';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { saveMedia } from './storageService';

// v7.9.30: Speed Optimization Strategy
const COMPRESSION_QUALITY = 0.60; 
const MAX_DIMENSION = 1600; 

export const generateHash = (str: string): string => {
  if (!str) return Math.random().toString(36).substring(7);
  
  let hash = 0;
  if (str.length === 0) return hash.toString(36);

  hash = str.length;

  if (str.length < 50000) {
      for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(i);
          hash |= 0; 
      }
  } else {
      const step = Math.max(32, Math.floor(str.length / 1000));
      for (let i = 0; i < str.length; i += step) {
          const end = Math.min(i + 10, str.length);
          for (let j = i; j < end; j++) {
             hash = ((hash << 5) - hash) + str.charCodeAt(j);
             hash |= 0;
          }
      }
      const tailStart = Math.max(0, str.length - 500);
      for (let i = tailStart; i < str.length; i++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(i);
          hash |= 0;
      }
  }

  return (hash >>> 0).toString(36) + "-" + str.length.toString(36);
};

const createThumbnail = async (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 800;
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } }
      else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7)); // Thumbnails can keep decent quality
    };
    img.src = base64;
  });
};

export const getImageDimensions = async (base64: string): Promise<{ width: number, height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error("Kunne ikke laste bilde for dimensjonssjekk"));
    img.src = base64;
  });
};

// v9.0.5: Helper to optimize base64 images (Resize & Compress)
// v9.1.9: Added safety timeout and mime-check to prevent hanging on EMF/WMF vectors
const optimizeImage = async (base64Data: string, mimeType: string): Promise<{ data: string, mimeType: string }> => {
    // Only attempt to optimize standard web images. Word often has wmf/emf which crash/hang Canvas.
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/bmp'].includes(mimeType.toLowerCase())) {
        return { data: base64Data, mimeType };
    }

    return new Promise((resolve) => {
        let isResolved = false;
        
        const safeResolve = (res: { data: string, mimeType: string }) => {
            if (!isResolved) {
                isResolved = true;
                resolve(res);
            }
        };

        // v9.1.9: Safety Timeout. If browser struggles to render image in 1.5s, give up and use raw.
        const timer = setTimeout(() => {
            if (!isResolved) {
                console.warn(`Bildeoptimalisering timet ut (${mimeType}), bruker original.`);
                safeResolve({ data: base64Data, mimeType });
            }
        }, 1500);

        const img = new Image();
        img.onload = () => {
            clearTimeout(timer);
            if (isResolved) return;

            let width = img.width;
            let height = img.height;
            
            // Check if resize is needed
            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                // Always convert to JPEG for consistency and compression
                const optimizedBase64 = canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY);
                // Strip prefix for data storage
                safeResolve({ data: optimizedBase64.split(',')[1], mimeType: 'image/jpeg' });
            } else {
                // Fallback if canvas fails
                safeResolve({ data: base64Data, mimeType });
            }
        };
        img.onerror = () => {
            clearTimeout(timer);
            console.warn("Failed to optimize image (load error), using raw.");
            safeResolve({ data: base64Data, mimeType });
        };
        // Add prefix if missing for Image loading
        img.src = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;
    });
};

// v8.9.38: Improved Deep Math Extraction (Handles attributes in tags)
const extractRawMathFromXML = async (zip: JSZip): Promise<string> => {
    try {
        const docXml = await zip.file("word/document.xml")?.async("text");
        if (!docXml) return "";

        // Find all Office Math (OMML) blocks: <m:oMath>...</m:oMath>
        // Regex adjusted to handle namespaces better if needed, but standard is m:oMath
        const mathBlocks = docXml.match(/<m:oMath(?:[^>]*)>(.*?)<\/m:oMath>/g);
        if (!mathBlocks) return "";

        let extractedMath = "";
        mathBlocks.forEach((block, index) => {
            // Extract text content from <m:t> tags. 
            // v8.9.38: Updated regex to allow attributes inside <m:t ...> (e.g. xml:space="preserve")
            const textMatches = block.match(/<m:t(?:[^>]*)>(.*?)<\/m:t>/g);
            if (textMatches) {
                const cleanText = textMatches.map(t => t.replace(/<\/?m:t(?:[^>]*)>/g, '')).join('');
                if (cleanText.trim()) {
                    extractedMath += `[MATH_BLOCK_${index + 1}]: ${cleanText}\n`;
                }
            }
        });
        
        if (extractedMath) {
            return "\n\n[DETECTED_RAW_MATH_FROM_XML (CRITICAL EVIDENCE)]:\n" + extractedMath + "\n[END_RAW_MATH]\n";
        }
        return "";
    } catch (e) {
        console.warn("Math extraction failed", e);
        return "";
    }
};

const extractWordMetadata = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // 1. Headers & Footers
    const metaFiles = Object.keys(zip.files).filter(name => 
      name.startsWith('word/header') || name.startsWith('word/footer')
    );
    let metaText = "";
    for (const fileName of metaFiles) {
      const content = await zip.files[fileName].async('text');
      const matches = content.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
      if (matches) {
        metaText += matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ') + "\n";
      }
    }

    // 2. v8.9.31: Math Content
    const mathContent = await extractRawMathFromXML(zip);

    return (metaText + mathContent).trim();
  } catch (e) {
    console.warn("Klarte ikke å hente metadata fra Word-fil (header/footer/math):", e);
    return "";
  }
};

/**
 * CRITICAL: Fysisk rotasjon brenner inn orientering i bildet.
 */
export const processImageRotation = async (base64: string, rotation: number): Promise<string> => {
  if (rotation === 0 || !rotation) return base64;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("Canvas error");
      const is90or270 = rotation % 180 !== 0;
      canvas.width = is90or270 ? img.height : img.width;
      canvas.height = is90or270 ? img.width : img.height;
      
      // Ensure we don't create massive canvases during rotation
      if (canvas.width > MAX_DIMENSION || canvas.height > MAX_DIMENSION) {
         const ratio = Math.min(MAX_DIMENSION / canvas.width, MAX_DIMENSION / canvas.height);
         canvas.width = Math.round(canvas.width * ratio);
         canvas.height = Math.round(canvas.height * ratio);
      }

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      
      // Draw image scaled to new canvas
      const drawW = is90or270 ? img.height : img.width;
      const drawH = is90or270 ? img.width : img.height;
      
      const scale = canvas.width / (is90or270 ? img.height : img.width);
      ctx.scale(scale, scale);
      
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY));
    };
    img.onerror = reject;
    img.src = base64;
  });
};

/**
 * SPLIT IMAGE IN HALF v6.7.1
 * Kutter alltid bildet i to på den lengste aksen.
 */
export const splitImageInHalf = async (base64: string, part: 1 | 2): Promise<{ fullRes: string, isLandscapeSplit: boolean }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("Split error");
      
      const isLandscape = img.width > img.height;
      
      let targetWidth, targetHeight, sx, sy, sWidth, sHeight;

      if (isLandscape) {
        // LANDSKAP: Klipp vertikalt (Venstre / Høyre)
        sWidth = Math.floor(img.width / 2);
        sHeight = img.height;
        sx = part === 1 ? 0 : sWidth;
        sy = 0;
      } else {
        // PORTRETT: Klipp horisontalt (Topp / Bunn)
        sWidth = img.width;
        sHeight = Math.floor(img.height / 2);
        sx = 0;
        sy = part === 1 ? 0 : sHeight;
      }
      
      // Scale down if target is still huge
      let finalWidth = sWidth;
      let finalHeight = sHeight;
      
      if (finalWidth > MAX_DIMENSION || finalHeight > MAX_DIMENSION) {
         const ratio = Math.min(MAX_DIMENSION / finalWidth, MAX_DIMENSION / finalHeight);
         finalWidth = Math.round(finalWidth * ratio);
         finalHeight = Math.round(finalHeight * ratio);
      }

      canvas.width = finalWidth;
      canvas.height = finalHeight;
      
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, finalWidth, finalHeight);
      resolve({ fullRes: canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY), isLandscapeSplit: isLandscape });
    };
    img.onerror = reject;
    img.src = base64;
  });
};

// v7.9.34: Filename Sanitizer (Removes extra dots like in 12.10.25.docx)
const sanitizeFilename = (name: string): string => {
  const lastDotIndex = name.lastIndexOf('.');
  if (lastDotIndex === -1) return name;
  const namePart = name.substring(0, lastDotIndex);
  const extPart = name.substring(lastDotIndex);
  // Replace dots in name part with underscore
  return namePart.replace(/\./g, '_') + extPart;
};

// Helper to convert array buffer to base64
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};

export const processFileToImages = async (file: File): Promise<Page[]> => {
  // v7.9.34: Use sanitized name for processing logic to avoid regex confusion
  const safeName = sanitizeFilename(file.name);
  const lowerName = safeName.toLowerCase();
  
  return new Promise(async (resolve) => {
    
    // 1. DOCX Processing
    if (lowerName.endsWith('.docx')) {
      try {
        console.log(`Starter behandling av Word-fil: ${file.name} (Sanitized: ${safeName})`);
        
        // v7.9.34: Local Watchdog - Timeout for local processing
        const processPromise = async () => {
            const buffer = await file.arrayBuffer();
            const metaText = await extractWordMetadata(buffer);
            
            let attachedImages: { data: string, mimeType: string }[] = [];
            
            const options = {
                ignoreEmptyParagraphs: false, // v8.0.19: Catch spacing in tables
                convertImage: mammoth.images.inline((element) => {
                    return element.read("base64").then(async (imageBuffer) => {
                        const mime = element.contentType;
                        // v9.0.5: OPTIMIZE IMAGE IMMEDIATELY
                        // This prevents massive payloads from reaching the AI queue.
                        // v9.1.9: optimizeImage now has internal safety timeout
                        const optimized = await optimizeImage(imageBuffer, mime);
                        attachedImages.push({ data: optimized.data, mimeType: optimized.mimeType });
                        return { src: "", alt: `[BILDEVEDLEGG ${attachedImages.length}]` };
                    });
                })
            };
            
            const result = await mammoth.convertToHtml({ arrayBuffer: buffer }, options);
            
            let cleanText = result.value
                // v9.1.1: Use single newlines to avoid massive gaps around images
                .replace(/<img[^>]*alt="([^"]+)"[^>]*>/gi, "\n$1\n") 
                // v9.0.9: Reduced double newline to single newline for less "airy" text
                .replace(/<\/p>/gi, "\n") 
                .replace(/<\/(li|div|tr|h[1-6]|pre|blockquote)>/gi, "\n")
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/td>/gi, " \t ")
                .replace(/<[^>]+>/g, "");
                
            let txt = new DOMParser().parseFromString(cleanText, 'text/html').body.textContent || "";
            
            // v8.0.19: TABLE RESCUE FALLBACK
            if (!txt || txt.trim().length === 0) {
               console.warn("Mammoth fant ingen tekst (mulig kompleks tabell), forsøker XML-redning...");
               try {
                 const zip = await JSZip.loadAsync(buffer);
                 const docXml = await zip.file("word/document.xml")?.async("text");
                 if (docXml) {
                    txt = docXml.replace(/<w:p.*?>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    txt = "[RÅ XML-UTTREKK - FORMATERING KAN VÆRE TAPT]\n" + txt;
                 }
               } catch (fallbackErr) {
                 console.error("XML-redning feilet:", fallbackErr);
               }
            }

            // v7.9.34: Payload Safety Cap
            if (txt.length > 500000) {
               console.warn("Word-dokument for stort, kutter innhold.");
               txt = txt.substring(0, 500000) + "\n\n[TEKST KUTTET - FOR LANG FIL]";
            }

            const combinedText = `[METADATA & MATH]:\n${metaText}\n\n[INNHOLD]:\n${txt}`;
            const id = Math.random().toString(36).substring(7);
            
            // v8.5.7: Save original binary for Visual Preview
            const base64Doc = arrayBufferToBase64(buffer);
            await saveMedia(id, `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64Doc}`);

            return [{ 
              id, 
              fileName: safeName, // Use sanitized name
              contentHash: generateHash(combinedText), 
              mimeType: 'text/plain', 
              status: 'pending', 
              rawText: combinedText, 
              transcription: combinedText, 
              candidateId: "UKJENT", 
              rotation: 0,
              attachedImages: attachedImages.length > 0 ? attachedImages : undefined
            } as Page];
        };

        const timeoutPromise = new Promise<Page[]>((_, reject) => 
            // v9.0.4: Increased to 180s for huge documents
            setTimeout(() => reject(new Error("Timeout ved lesing av Word-fil (lokal)")), 180000)
        );

        const pages = await Promise.race([processPromise(), timeoutPromise]);
        resolve(pages);

      } catch (e: any) { 
        console.error(`Feil ved behandling av Word-fil ${file.name}:`, e);
        resolve([{
            id: Math.random().toString(36).substring(7),
            fileName: safeName,
            contentHash: generateHash(file.name),
            mimeType: 'text/plain', // Set to text/plain so we see the error text in Preview
            rawText: `Feil ved lesing av fil: ${e.message}`, 
            status: 'error',
            statusLabel: e.message?.includes("Timeout") ? 'Tidsavbrudd (Lokal)' : 'Filfeil (Word)',
            rotation: 0
        }]); 
      }
      return;
    }
    
    // 2. PDF Processing
    if (file.type === 'application/pdf') {
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await (window as any).pdfjsLib.getDocument({ data: buffer }).promise;
        const pages: Page[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 }); 
          
          let scale = 2.0;
          if (viewport.width > MAX_DIMENSION || viewport.height > MAX_DIMENSION) {
             const ratio = Math.min(MAX_DIMENSION / viewport.width, MAX_DIMENSION / viewport.height);
             scale = 2.0 * ratio;
          }
          const finalViewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.height = finalViewport.height; canvas.width = finalViewport.width;
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: finalViewport }).promise;
          
          const b64 = canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY);
          const id = Math.random().toString(36).substring(7);
          await saveMedia(id, b64);
          const thumb = await createThumbnail(b64);
          pages.push({ id, fileName: `${safeName} (S${i})`, imagePreview: thumb, contentHash: generateHash(b64), mimeType: 'image/jpeg', status: 'pending', rotation: 0 });
        }
        resolve(pages);
      } catch (e) { 
        console.error(`Feil ved behandling av PDF ${file.name}:`, e);
        resolve([]); 
      }
      return;
    }

    // 3. Image Processing
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          
          let width = img.width;
          let height = img.height;
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
             const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
             width = Math.round(width * ratio);
             height = Math.round(height * ratio);
          }

          canvas.width = width; 
          canvas.height = height;
          canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
          
          const b64 = canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY);
          const id = Math.random().toString(36).substring(7);
          await saveMedia(id, b64);
          const thumb = await createThumbnail(b64);
          resolve([{ id, fileName: safeName, imagePreview: thumb, contentHash: generateHash(b64), mimeType: 'image/jpeg', status: 'pending', rotation: 0 }]);
        };
        img.onerror = () => {
          console.error(`Kunne ikke lese bilde: ${file.name}`);
          resolve([]);
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve([]);
      reader.readAsDataURL(file);
      return;
    }

    // 4. Fallback for unsupported files
    console.warn(`Filtype støttes ikke: ${file.name} (${file.type})`);
    const id = Math.random().toString(36).substring(7);
    resolve([{
        id,
        fileName: safeName,
        contentHash: generateHash(file.name),
        mimeType: file.type || 'application/unknown',
        status: 'error',
        statusLabel: 'Filtype støttes ikke',
        rotation: 0
    }]);
  });
};
