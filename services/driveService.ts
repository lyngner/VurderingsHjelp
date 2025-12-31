/**
 * Google Drive integrasjon v4.10.0
 * Bruker den eksisterende API-nøkkelen for å aksessere offentlige mapper.
 */

export const extractFolderId = (url: string): string | null => {
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
};

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export const fetchImagesFromDriveFolder = async (folderId: string): Promise<DriveFile[]> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API-nøkkel mangler.");

  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)&key=${apiKey}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Kunne ikke hente filer fra Drive.");
  }

  const data = await response.json();
  // Filtrer for bilder og PDFer
  return (data.files || []).filter((f: DriveFile) => 
    f.mimeType.startsWith('image/') || f.mimeType === 'application/pdf'
  );
};

export const downloadDriveFile = async (fileId: string): Promise<{ data: string, mimeType: string }> => {
  const apiKey = process.env.API_KEY;
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error("Kunne ikke laste ned fil fra Drive.");
  
  const blob = await response.blob();
  const mimeType = blob.type;
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve({ data: reader.result as string, mimeType });
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
