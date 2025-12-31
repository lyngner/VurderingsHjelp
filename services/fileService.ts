import { Page } from '../types';
import mammoth from 'mammoth';
import { saveMedia } from './storageService';

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

export const processImageRotation = async (base64: string, rotation: number): Promise<string> => {
  if (rotation === 0) return base64;
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
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = reject;
    img.src = base64;
  });
};

export const splitA3Spread = async (base64: string, side: 'LEFT' | 'RIGHT', rotation: number = 0): Promise<{ preview: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const rotateCanvas = document.createElement('canvas');
      const rCtx = rotateCanvas.getContext('2d');
      if (!rCtx) return reject("Canvas error");

      const is90or270 = rotation % 180 !== 0;
      rotateCanvas.width = is90or270 ? img.height : img.width;
      rotateCanvas.height = is90or270 ? img.width : img.height;

      rCtx.translate(rotateCanvas.width / 2, rotateCanvas.height / 2);
      rCtx.rotate((rotation * Math.PI) / 180);
      rCtx.drawImage(img, -img.width / 2, -img.height / 2);

      const splitCanvas = document.createElement('canvas');
      const sCtx = splitCanvas.getContext('2d');
      if (!sCtx) return reject("Split error");

      splitCanvas.width = rotateCanvas.width / 2;
      splitCanvas.height = rotateCanvas.height;
      const offsetX = side === 'LEFT' ? 0 : rotateCanvas.width / 2;
      
      sCtx.drawImage(rotateCanvas, offsetX, 0, rotateCanvas.width / 2, rotateCanvas.height, 0, 0, splitCanvas.width, splitCanvas.height);
      resolve({ preview: splitCanvas.toDataURL('image/jpeg', 0.9) });
    };
    img.src = base64;
  });
};

export const processFileToImages = async (file: File): Promise<Page[]> => {
  return new Promise(async (resolve) => {
    if (file.name.endsWith('.docx')) {
      try {
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        const text = result.value;
        const id = Math.random().toString(36).substring(7);
        const hash = generateHash(text);
        resolve([{ id, fileName: file.name, contentHash: hash, mimeType: 'text/plain', status: 'pending', transcription: text, candidateId: "Ukjent", rotation: 0 }]);
      } catch (e) { resolve([]); }
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
          const b64 = canvas.toDataURL('image/jpeg', 0.9);
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
          const b64 = canvas.toDataURL('image/jpeg', 0.9);
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