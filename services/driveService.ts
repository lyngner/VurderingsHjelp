import { Page } from "../types";
import { generateHash } from "./fileService";

/**
 * Trekker ut mappe-ID fra en Google Drive URL.
 */
export const extractFolderId = (url: string): string | null => {
  const match = url.match(/folders\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  
  // Sjekk om de har limt inn bare ID-en
  if (url.length > 20 && !url.includes('/')) return url;
  
  return null;
};

/**
 * Henter liste over bilder fra en offentlig delt Google Drive-mappe.
 */
export const fetchImagesFromDriveFolder = async (folderId: string): Promise<Page[]> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API-nøkkel mangler for Google Drive-oppslag.");
  }

  // 1. Hent liste over filer i mappen
  // Vi spør etter filer som ikke er i papirkurven og som er i den gitte mappen.
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType = 'application/pdf')`);
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&key=${apiKey}&fields=files(id,name,mimeType)`;

  const response = await fetch(listUrl);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Drive API Error: ${err.error?.message || 'Kunne ikke hente mappeinnhold'}`);
  }

  const data = await response.json();
  const files = data.files || [];

  if (files.length === 0) return [];

  const pages: Page[] = [];

  // 2. Behandle hver fil
  // Merk: For PDF-er må vi egentlig laste ned hele fila og splitte den.
  // Her fokuserer vi på JPG som læreren spesifiserte.
  for (const file of files) {
    if (file.mimeType.startsWith('image/')) {
      // Hent selve bilde-dataen
      const mediaUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`;
      
      try {
        const mediaRes = await fetch(mediaUrl);
        if (!mediaRes.ok) continue;
        
        const blob = await mediaRes.blob();
        const base64 = await blobToBase64(blob);
        const base64Data = base64.split(',')[1];
        
        pages.push({
          id: Math.random().toString(36).substring(7),
          fileName: file.name,
          imagePreview: base64,
          base64Data: base64Data,
          contentHash: generateHash(base64),
          mimeType: file.mimeType,
          status: 'pending',
          rotation: 0
        });
      } catch (e) {
        console.error(`Kunne ikke laste ned bilde ${file.name}:`, e);
      }
    }
  }

  return pages;
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
