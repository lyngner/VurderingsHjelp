
import { Page } from '../types';
import mammoth from 'mammoth';

/**
 * Genererer en unik hash basert på innholdet i en streng/bilde.
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

/**
 * Beskjærer et bilde basert på normaliserte koordinater [ymin, xmin, ymax, xmax] (0-1000).
 */
export const cropImageFromBase64 = async (base64: string, box: number[]): Promise<{ preview: string, data: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("Kunne ikke opprette canvas context");

      const [ymin, xmin, ymax, xmax] = box;
      const left = (xmin / 1000) * img.width;
      const top = (ymin / 1000) * img.height;
      const width = ((xmax - xmin) / 1000) * img.width;
      const height = ((ymax - ymin) / 1000) * img.height;

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, left, top, width, height, 0, 0, width, height);
      
      const croppedBase64 = canvas.toDataURL('image/jpeg', 0.8);
      resolve({
        preview: croppedBase64,
        data: croppedBase64.split(',')[1]
      });
    };
    img.onerror = reject;
    img.src = base64;
  });
};

export const processFileToImages = async (file: File): Promise<Page[]> => {
  return new Promise(async (resolve) => {
    if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        resolve([{ 
          id: Math.random().toString(36).substring(7), 
          fileName: file.name, 
          imagePreview: "", 
          base64Data: "", 
          contentHash: generateHash(result.value), 
          mimeType: 'text/plain', 
          status: 'pending', 
          transcription: result.value, 
          rotation: 0 
        }]);
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
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;
          canvas.height = viewport.height; 
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;
          const b64 = canvas.toDataURL('image/jpeg', 0.7);
          pages.push({ 
            id: Math.random().toString(36).substring(7), 
            fileName: `${file.name} (S${i})`, 
            imagePreview: b64, 
            base64Data: b64.split(',')[1], 
            contentHash: generateHash(b64), 
            mimeType: 'image/jpeg', 
            status: 'pending', 
            rotation: 0 
          });
        }
        resolve(pages);
      } catch (e) { resolve([]); }
      return;
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve([]); return; }
          canvas.width = img.width; 
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          const b64 = canvas.toDataURL('image/jpeg', 0.7);
          resolve([{ 
            id: Math.random().toString(36).substring(7), 
            fileName: file.name, 
            imagePreview: b64, 
            base64Data: b64.split(',')[1], 
            contentHash: generateHash(b64), 
            mimeType: 'image/jpeg', 
            status: 'pending', 
            rotation: 0 
          }]);
        };
        img.onerror = () => resolve([]);
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
      return;
    }
    resolve([]);
  });
};
