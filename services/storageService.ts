
import { Project, Page, Candidate } from "../types";

const DB_NAME = "ElevVurderingDB";
const STORE_NAME = "projects";
const CANDIDATE_STORE = "candidates";
const CACHE_STORE = "global_cache";
const MEDIA_STORE = "media_blobs";
const DB_VERSION = 4; // Oppgradert for normalisering

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION); 
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "contentHash" });
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CANDIDATE_STORE)) {
        const candidateStore = db.createObjectStore(CANDIDATE_STORE, { keyPath: "id" });
        candidateStore.createIndex("projectId", "projectId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveMedia = async (id: string, base64: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE, "readwrite");
    const store = transaction.objectStore(MEDIA_STORE);
    store.put({ id, data: base64 });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getMedia = async (id: string): Promise<string | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE, "readonly");
    const store = transaction.objectStore(MEDIA_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ? request.result.data : null);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Normalisert lagring: Splitter prosjekt og kandidater
 */
export const saveProject = async (project: Project): Promise<void> => {
  const db = await openDB();
  
  // 1. Lagre alle kandidater separat (Delta-updates)
  if (project.candidates && project.candidates.length > 0) {
    const candTx = db.transaction(CANDIDATE_STORE, "readwrite");
    const candStore = candTx.objectStore(CANDIDATE_STORE);
    project.candidates.forEach(c => {
      // Sikre at base64 ikke blir med i metadata-lagringen
      const cleanCand = JSON.parse(JSON.stringify(c));
      cleanCand.pages.forEach((p: Page) => { delete p.base64Data; });
      candStore.put({ ...cleanCand, projectId: project.id });
    });
  }

  // 2. Lagre prosjekt-metadata uten den tunge kandidat-listen
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    
    const cleanProject = JSON.parse(JSON.stringify(project));
    const stripData = (p: Page) => { delete p.base64Data; };
    cleanProject.taskFiles.forEach(stripData);
    cleanProject.unprocessedPages?.forEach(stripData);
    
    // Cache antall kandidater for dashboardet
    cleanProject.candidateCount = project.candidates?.length || 0;
    delete cleanProject.candidates; // Fjern selve listen fra prosjekt-storen

    const request = store.put({ ...cleanProject, updatedAt: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Ny funksjon for å lagre én enkelt kandidat (Ekte delta-update)
 */
export const saveCandidate = async (candidate: Candidate): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CANDIDATE_STORE, "readwrite");
    const store = transaction.objectStore(CANDIDATE_STORE);
    const cleanCand = JSON.parse(JSON.stringify(candidate));
    cleanCand.pages.forEach((p: Page) => { delete p.base64Data; });
    const request = store.put(cleanCand);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Henter et fullstendig prosjekt med alle dets normaliserte kandidater
 */
export const loadFullProject = async (projectId: string): Promise<Project | null> => {
  const db = await openDB();
  
  // Hent prosjekt-metadata
  const project: Project | null = await new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(projectId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });

  if (!project) return null;

  // Hent alle kandidater via indeksen
  const candidates: Candidate[] = await new Promise((resolve) => {
    const tx = db.transaction(CANDIDATE_STORE, "readonly");
    const index = tx.objectStore(CANDIDATE_STORE).index("projectId");
    const request = index.getAll(projectId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });

  return { ...project, candidates };
};

export const getAllProjects = async (): Promise<Project[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const deleteProject = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, CANDIDATE_STORE], "readwrite");
    
    // Slett prosjekt
    transaction.objectStore(STORE_NAME).delete(id);
    
    // Slett alle kandidater tilhørende prosjektet
    const candStore = transaction.objectStore(CANDIDATE_STORE);
    const index = candStore.index("projectId");
    const request = index.getAllKeys(id);
    request.onsuccess = () => {
      const keys = request.result;
      keys.forEach(key => candStore.delete(key));
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const saveToGlobalCache = async (contentHash: string, data: any): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CACHE_STORE, "readwrite");
    const store = transaction.objectStore(CACHE_STORE);
    store.put({ contentHash, data, updatedAt: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getFromGlobalCache = async (contentHash: string): Promise<any | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CACHE_STORE, "readonly");
    const store = transaction.objectStore(CACHE_STORE);
    const request = store.get(contentHash);
    request.onsuccess = () => resolve(request.result ? request.result.data : null);
    request.onerror = () => reject(request.error);
  });
};
