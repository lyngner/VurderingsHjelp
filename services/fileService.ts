
import { Page } from '../types';
import mammoth from 'mammoth';

/**
 * Genererer en unik hash basert på innholdet i en streng/bilde.
 * Brukes for caching i IndexedDB.
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
 * Konverterer filer (PDF, DOCX, JPG) til et format appen kan jobbe med (Page-objekter).
 */
export const processFileToImages = async (file: File): Promise<Page[]> => {
  return new Promise(async (resolve) => {
    // DOCX-håndtering
    if (file.name.endsWith('.docx')) {
      try {
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        resolve([{ 
          id: Math.random().toString(36).substring(7), 
          fileName: file.name, imagePreview: "", base64Data: "", contentHash: generateHash(result.value), mimeType: 'text/plain', status: 'pending', transcription: result.value, rotation: 0 
        }]);
      } catch (e) { resolve([]); }
      return;
    }
    
    // PDF-håndtering (bruker pdf.js fra index.html)
    if (file.type === 'application/pdf') {
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await (window as any).pdfjsLib.getDocument({ data: buffer }).promise;
        const pages: Page[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.height = viewport.height; canvas.width = viewport.width;
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
          const b64 = canvas.toDataURL('image/jpeg', 0.6);
          pages.push({ 
            id: Math.random().toString(36).substring(7), fileName: `${file.name} (S${i})`, imagePreview: b64, base64Data: b64.split(',')[1], contentHash: generateHash(b64), mimeType: 'image/jpeg', status: 'pending', rotation: 0 
          });
        }
        resolve(pages);
      } catch (e) { resolve([]); }
      return;
    }

    // Bildefiler (JPG, PNG)
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = img.width; canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const b64 = canvas.toDataURL('image/jpeg', 0.6);
        resolve([{ id: Math.random().toString(36).substring(7), fileName: file.name, imagePreview: b64, base64Data: b64.split(',')[1], contentHash: generateHash(b64), mimeType: 'image/jpeg', status: 'pending', rotation: 0 }]);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};
