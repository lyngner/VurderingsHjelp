
/**
 * Google Drive Integration v6.4.0
 * Lar læreren hente filer direkte fra en delt mappe via API-nøkkel.
 * Merk: API-nøkkelen må ha 'Google Drive API' aktivert i Google Cloud Console.
 */

const API_KEY = process.env.API_KEY;
const DRIVE_BASE_URL = 'https://www.googleapis.com/drive/v3';

export const extractFolderId = (url: string): string | null => {
  // Støtter formater:
  // https://drive.google.com/drive/folders/1A2B3C...
  // https://drive.google.com/drive/u/0/folders/1A2B3C...
  // id=1A2B3C...
  
  const regex = /[-\w]{25,}/;
  const match = url.match(regex);
  return match ? match[0] : null;
};

export const fetchImagesFromDriveFolder = async (folderId: string): Promise<any[]> => {
  if (!API_KEY) throw new Error("Mangler API-nøkkel for Google Drive.");

  // Query: Forelder er mappen, ikke i søppelbøtta, og er bilde eller PDF eller Word
  const q = `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType = 'application/pdf' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')`;
  const fields = 'files(id, name, mimeType, size)';
  const url = `${DRIVE_BASE_URL}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&key=${API_KEY}&pageSize=1000`;

  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json();
    console.error("Drive Error:", err);
    throw new Error(`Kunne ikke hente fil-liste: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.files || [];
};

export const downloadDriveFile = async (fileId: string): Promise<Blob> => {
  if (!API_KEY) throw new Error("Mangler API-nøkkel.");

  const url = `${DRIVE_BASE_URL}/files/${fileId}?alt=media&key=${API_KEY}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Kunne ikke laste ned fil ${fileId}`);
  }

  return await response.blob();
};
