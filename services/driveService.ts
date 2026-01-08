
/**
 * Google Drive Integration - DEACTIVATED
 * Denne funksjonaliteten er fjernet etter instruks om lokal-only workflow.
 * Filen beholdes tom for å ikke bryte eventuelle imports før full refaktorering,
 * men inneholder ingen logikk.
 */

export const extractFolderId = (url: string): string | null => null;
export const fetchImagesFromDriveFolder = async (folderId: string): Promise<any[]> => [];
export const downloadDriveFile = async (fileId: string): Promise<Blob> => new Blob();
