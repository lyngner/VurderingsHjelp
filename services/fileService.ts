
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
      const maxDim = 1200;
      let w = img.width;
      let h = img.height;
      if (w > h) {
        if (w > maxDim) { h *= maxDim / w; w = maxDim; }
      } else {
        if (h > maxDim) { w *= maxDim / h; h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
      }
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = base64;
  });
};

/**
 * Splitter et bilde i to (Venstre/Høyre eller Topp/Bunn)
 * Bruker ren GEOMETRISK 50/50-deling for å garantere at ingen marger beskjæres.
 */
export const splitA3Spread = async (base64: string, side: 'LEFT' | 'RIGHT'): Promise<{ preview: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("Canvas context error");

      const isLandscape = img.width > img.height;
      
      // Vi bruker nøyaktig halvparten av arealet for å unngå "smart" cropping som feiler.
      if (isLandscape) {
        canvas.width = img.width / 2;
        canvas.height = img.height;
        const offsetX = side === 'LEFT' ? 0 : img.width / 2;
        ctx.drawImage(img, offsetX, 0, img.width / 2, img.height, 0, 0, canvas.width, canvas.height);
      } else {
        // Noen ganger skannes A3-oppslag som portrett (to sider over hverandre)
        canvas.width = img.width;
        canvas.height = img.height / 2;
        const offsetY = side === 'LEFT' ? 0 : img.height / 2;
        ctx.drawImage(img, 0, offsetY, img.width, img.height / 2, 0, 0, canvas.width, canvas.height);
      }

      const splitBase64 = canvas.toDataURL('image/jpeg', 0.9);
      resolve({ preview: splitBase64 });
    };
    img.onerror = reject;
    img.src = base64;
  });
};

const createTextPlaceholderImage = (text: string, fileName: string): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return "";
  canvas.width = 800;
  canvas.height = 1131;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, 100);
  ctx.strokeStyle = '#e2e8f0';
  ctx.strokeRect(0, 0, canvas.width, 100);
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText(`DIGITAL BESVARELSE: ${fileName.toUpperCase()}`, 40, 55);
  ctx.fillStyle = '#1e293b';
  ctx.font = '16px Inter, sans-serif';
  const lines = text.split('\n').slice(0, 40);
  let y = 160;
  lines.forEach(line => {
    if (y < canvas.height - 40) {
      const cleanLine = line.length > 80 ? line.substring(0, 80) + "..." : line;
      ctx.fillText(cleanLine, 60, y);
      y += 24;
    }
  });
  return canvas.toDataURL('image/jpeg', 0.8);
};

export const processFileToImages = async (file: File): Promise<Page[]> => {
  return new Promise(async (resolve) => {
    if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        const text = result.value;
        const visualPreview = createTextPlaceholderImage(text, file.name);
        const id = Math.random().toString(36).substring(7);
        await saveMedia(id, visualPreview);
        const thumb = await createThumbnail(visualPreview);
        resolve([{ id, fileName: file.name, imagePreview: thumb, contentHash: generateHash(text), mimeType: 'text/plain', status: 'pending', transcription: text, rotation: 0 }]);
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
          const context = canvas.getContext('2d');
          if (!context) continue;
          canvas.height = viewport.height; 
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;
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
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve([]); return; }
          canvas.width = img.width; canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          const b64 = canvas.toDataURL('image/jpeg', 0.9);
          const id = Math.random().toString(36).substring(7);
          await saveMedia(id, b64);
          const thumb = await createThumbnail(b64);
          resolve([{ id, fileName: file.name, imagePreview: thumb, contentHash: generateHash(b64), mimeType: 'image/jpeg', status: 'pending', rotation: 0 }]);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
      return;
    }
    resolve([]);
  });
};
