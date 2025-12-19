
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
}

export const extractFolderId = (url: string): string | null => {
  if (!url) return null;
  const folderMatch = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  
  return null;
};

export const fetchFilesFromFolder = async (folderId: string): Promise<DriveFile[]> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("Vennligst velg en API-nøkkel først ved å trykke på 'Velg API-nøkkel'.");

  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType contains 'image/'`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,thumbnailLink)&key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      if (data.error?.message?.includes("API key not valid") || data.error?.status === "PERMISSION_DENIED") {
        throw new Error("Denne API-nøkkelen har ikke tilgang til Google Drive. Du må aktivere 'Google Drive API' i Google Cloud Console for prosjektet nøkkelen tilhører.");
      }
      throw new Error(data.error?.message || "Kunne ikke hente filer fra Drive.");
    }
    
    return data.files || [];
  } catch (error: any) {
    throw error;
  }
};

export const getFileBase64 = async (fileId: string): Promise<string> => {
  const apiKey = process.env.API_KEY;
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Filnedlasting feilet for ${fileId}. Sjekk Drive-tilgangen.`);
    }
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Feil ved lesing av bilde-data."));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    throw error;
  }
};
