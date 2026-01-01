
import { Page } from '../types';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { saveMedia } from './storageService';

/**
 * GENERERER HASH FOR CACHING
 */
export const generateHash = (str: string): string => {
  if (!str) return Math.random().toString(36).substring(7);
  const sample = str.length > 2000 
    ? str.substring(500, 1000) + str.substring(str.length / 2, str.length / 2 + 500) + str.substring(str.length - 1000, str.length - 500)
    : str;
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    hash = ((hash << 5) - hash) + sample.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
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
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = base64;
  });
};

/**
 * GREEDY XML EXTRACTION v4.40.0
 * Henter tekst fra alle headers og footers for å finne kandidatnummer.
 */
const extractWordMetadata = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const metaFiles = Object.keys(zip.files).filter(name => 
      name.startsWith('word/header') || name.startsWith('word/footer')
    );
    
    let metaText = "";
    for (const fileName of metaFiles) {
      const content = await zip.files[fileName].async('text');
      // Mer robust parsing av tekstnoder som håndterer splittede ord
      const matches = content.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
      if (matches) {
        const fileText = matches.map(m => {
          const text = m.replace(/<[^>]+>/g, '');
          // HTML-entity decoding (enkel versjon for tall/bokstaver)
          return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        }).join('');
        metaText += fileText + "\n";
      }
    }
    return metaText.trim();
  } catch (e) {
    console.warn("Metadata-ekstraksjon feilet:", e);
    return "";
  }
};

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
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = reject;
    img.src = base64;
  });
};

export const splitA3Spread = async (base64: string, side: 'LEFT' | 'RIGHT', rotation: number = 0): Promise<{ fullRes: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      const rotatedBase64 = rotation !== 0 ? await processImageRotation(base64, rotation) : base64;
      const rotatedImg = new Image();
      rotatedImg.onload = () => {
        const splitCanvas = document.createElement('canvas');
        const sCtx = splitCanvas.getContext('2d');
        if (!sCtx) return reject("Split error");
        splitCanvas.width = rotatedImg.width / 2;
        splitCanvas.height = rotatedImg.height;
        const offsetX = side === 'LEFT' ? 0 : rotatedImg.width / 2;
        sCtx.drawImage(rotatedImg, offsetX, 0, rotatedImg.width / 2, rotatedImg.height, 0, 0, splitCanvas.width, splitCanvas.height);
        resolve({ fullRes: splitCanvas.toDataURL('image/jpeg', 0.95) });
      };
      rotatedImg.src = rotatedBase64;
    };
    img.src = base64;
  });
};

export const processFileToImages = async (file: File): Promise<Page[]> => {
  return new Promise(async (resolve) => {
    if (file.name.endsWith('.docx')) {
      try {
        const buffer = await file.arrayBuffer();
        const metaText = await extractWordMetadata(buffer);
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        const bodyText = result.value;
        
        // Forsterket innpakning for KI-analyse
        const combinedText = `[METADATA-SØK]:\n${metaText}\n\n[DOKUMENT-BODY]:\n${bodyText}`;
        
        const id = Math.random().toString(36).substring(7);
        const hash = generateHash(combinedText);
        
        resolve([{ 
          id, 
          fileName: file.name, 
          contentHash: hash, 
          mimeType: 'text/plain', 
          status: 'pending', 
          rawText: combinedText, 
          transcription: combinedText, 
          candidateId: "Ukjent", 
          rotation: 0 
        }]);
      } catch (e) { 
        console.error("Word error:", e);
        resolve([]); 
      }
      return;
    }
    
    if (file.type === 'application/pdf') {
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await (window as any).pdfjsLib.getDocument({ data: buffer }).promise;
        const pages: Page[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.5 });
          const canvas = document.createElement('canvas');
          canvas.height = viewport.height; canvas.width = viewport.width;
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
          const b64 = canvas.toDataURL('image/jpeg', 0.95);
          const id = Math.random().toString(36).substring(7);
          await saveMedia(id, b64);
          const thumb = await createThumbnail(b64);
          pages.push({ id, fileName: `${file.name} (S${i})`, imagePreview: thumb, contentHash: generateHash(b64), mimeType: 'image/jpeg', status: 'pending', rotation: 0 });
        }
        resolve(pages);
      } catch (e) { resolve([]); }
      return;
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          canvas.getContext('2d')!.drawImage(img, 0, 0);
          const b64 = canvas.toDataURL('image/jpeg', 0.95);
          const id = Math.random().toString(36).substring(7);
          await saveMedia(id, b64);
          const thumb = await createThumbnail(b64);
          resolve([{ id, fileName: file.name, imagePreview: thumb, contentHash: generateHash(b64), mimeType: 'image/jpeg', status: 'pending', rotation: 0 }]);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  });
};
