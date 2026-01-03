
import { Project, Page, Candidate } from "../types";

const DB_NAME = "ElevVurderingDB";
const STORE_NAME = "projects";
const CANDIDATE_STORE = "candidates";
const CACHE_STORE = "global_cache";
const MEDIA_STORE = "media_blobs";
const DB_VERSION = 4;

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

export const clearAllData = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getStorageStats = async (): Promise<{ projects: number, candidates: number, media: number }> => {
  const db = await openDB();
  
  const countStore = (storeName: string): Promise<number> => {
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  };

  const [projects, candidates, media] = await Promise.all([
    countStore(STORE_NAME),
    countStore(CANDIDATE_STORE),
    countStore(MEDIA_STORE)
  ]);

  return { projects, candidates, media };
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

export const deleteMedia = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE, "readwrite");
    transaction.objectStore(MEDIA_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getMedia = async (id: string): Promise<string | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE, "readonly");
    const request = transaction.objectStore(MEDIA_STORE).get(id);
    request.onsuccess = () => resolve(request.result ? request.result.data : null);
    request.onerror = () => reject(request.error);
  });
};

export const deleteCandidate = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CANDIDATE_STORE, "readwrite");
    transaction.objectStore(CANDIDATE_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const saveCandidate = async (candidate: Candidate): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CANDIDATE_STORE, "readwrite");
    const cleanCand = JSON.parse(JSON.stringify(candidate));
    cleanCand.pages.forEach((p: Page) => { delete p.base64Data; });
    transaction.objectStore(CANDIDATE_STORE).put(cleanCand);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const saveProject = async (project: Project): Promise<void> => {
  const db = await openDB();
  
  // 1. Lagre/Oppdater eksisterende kandidater
  if (project.candidates && project.candidates.length > 0) {
    const candTx = db.transaction(CANDIDATE_STORE, "readwrite");
    const candStore = candTx.objectStore(CANDIDATE_STORE);
    project.candidates.forEach(c => {
      const cleanCand = JSON.parse(JSON.stringify(c));
      cleanCand.pages.forEach((p: Page) => { delete p.base64Data; });
      candStore.put({ ...cleanCand, projectId: project.id });
    });
  }

  // 2. RYDDING v6.2.1: Slett foreldreløse kandidater i databasen som ikke lenger er i prosjektet
  const allStoredCandidates: Candidate[] = await new Promise((resolve) => {
    const tx = db.transaction(CANDIDATE_STORE, "readonly");
    const index = tx.objectStore(CANDIDATE_STORE).index("projectId");
    const req = index.getAll(project.id);
    req.onsuccess = () => resolve(req.result || []);
  });

  const currentIds = new Set(project.candidates.map(c => c.id));
  const orphans = allStoredCandidates.filter(c => !currentIds.has(c.id));
  
  if (orphans.length > 0) {
    const delTx = db.transaction(CANDIDATE_STORE, "readwrite");
    const delStore = delTx.objectStore(CANDIDATE_STORE);
    orphans.forEach(o => delStore.delete(o.id));
  }

  // 3. Lagre prosjekt-metadata
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const cleanProject = JSON.parse(JSON.stringify(project));
    const stripData = (p: Page) => { delete p.base64Data; };
    cleanProject.taskFiles.forEach(stripData);
    cleanProject.unprocessedPages?.forEach(stripData);
    cleanProject.candidateCount = project.candidates?.length || 0;
    delete cleanProject.candidates;
    transaction.objectStore(STORE_NAME).put({ ...cleanProject, updatedAt: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const loadFullProject = async (projectId: string): Promise<Project | null> => {
  const db = await openDB();
  const project: Project | null = await new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(projectId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
  if (!project) return null;
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
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const deleteProject = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, CANDIDATE_STORE], "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
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
    transaction.objectStore(CACHE_STORE).put({ contentHash, data, updatedAt: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getFromGlobalCache = async (contentHash: string): Promise<any | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CACHE_STORE, "readonly");
    const request = transaction.objectStore(CACHE_STORE).get(contentHash);
    request.onsuccess = () => resolve(request.result ? request.result.data : null);
    request.onerror = () => reject(request.error);
  });
};
