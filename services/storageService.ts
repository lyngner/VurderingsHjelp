
import { Project, Rubric, Candidate, Page } from "../types";
import { DEMO_IMAGES } from "./demoData";

const DB_NAME = "ElevVurderingDB";
const STORE_NAME = "projects";
const CACHE_STORE = "global_cache";
const DB_VERSION = 2;

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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const DEMO_PROJECT_ID = "demo-r1-heldagsprøve";

const createDemoProject = (): Project => {
  // Fix: commonErrors changed from [] to "" to match RubricCriterion interface (string | undefined)
  const criteria = [
    { name: "1a", part: "Del 1", tema: "Logaritmer", suggestedSolution: "2ln x + 2ln 2 + 2", maxPoints: 2, commonErrors: "", description: "" },
    { name: "1b", part: "Del 1", tema: "Logaritmelikning", suggestedSolution: "x = e^2 / 2", maxPoints: 2, commonErrors: "", description: "" },
    { name: "2a", part: "Del 1", tema: "Grenseverdi", suggestedSolution: "0", maxPoints: 2, commonErrors: "", description: "" },
    { name: "2c", part: "Del 1", tema: "Asymptoter", suggestedSolution: "y = -x - 1", maxPoints: 2, commonErrors: "", description: "" },
    { name: "3c", part: "Del 1", tema: "Kvotientregel", suggestedSolution: "(2 - 4x^2) / e^{x^2+1}", maxPoints: 2, commonErrors: "", description: "" }
  ];

  const rubric: Rubric = {
    title: "Heldagsprøve R1 (Eksempel)",
    totalMaxPoints: 10,
    criteria: criteria
  };

  const createPage = (cId: string, pNum: number, hash: string, text: string): Page => {
    const imgData = DEMO_IMAGES[hash] || "";
    return {
      id: `demo-${cId}-p${pNum}`,
      fileName: `kandidat${cId}_side${pNum}.jpg`,
      imagePreview: imgData,
      base64Data: imgData.split(',')[1] || "",
      contentHash: hash,
      mimeType: "image/jpeg",
      status: "completed",
      part: "Del 1",
      pageNumber: pNum,
      transcription: text
    };
  };

  const cand101: Candidate = {
    id: "101", name: "Kandidat 101", status: "evaluated",
    pages: [
      createPage("101", 1, "h101-1", "1a) ln 2x^2 - ln (1/2) + ln e^2 = 2ln x + 2ln 2 + 2\n1b) 3ln(2x)=6 => x=e^2/2"),
      createPage("101", 2, "h101-2", "2c) f(x) = (x^2-3x-5)/(2-x). Skrå asymptote: y = -x-1"),
      createPage("101", 3, "h101-3", "2d) Kontinuitet: k=4\n3a) f'(x)=4x+3/x^2+1/x"),
      createPage("101", 4, "h101-4", "3c) h'(x)=(2-4x^2)/e^{x^2+1}"),
      createPage("101", 5, "h101-5", "4a) f'(x)=0 => x=3/4"),
      createPage("101", 6, "h101-6", "4b) Punktet er på (-1/2, 2/e + 1/2)")
    ],
    evaluation: { 
        grade: "5", 
        score: 9, 
        feedback: "Veldig god forståelse for derivasjon og logaritmer. Ryddige utregninger med gode forklaringer.", 
        vekstpunkter: ["Sjekk fortegn i 1c"], 
        taskBreakdown: [
            // Fix: taskBreakdown objects now match TaskEvaluation interface (tema added to interface)
            { taskName: "1a", part: "Del 1", score: 2, max: 2, tema: "Logaritmer", comment: "Helt korrekt." },
            { taskName: "1b", part: "Del 1", score: 2, max: 2, tema: "Logaritmelikning", comment: "God bruk av definisjonen." }
        ] 
    }
  };

  const cand102: Candidate = {
    id: "102", name: "Kandidat 102", status: "completed",
    pages: [
      createPage("102", 1, "h102-1", "1a) ln 4x^2 + 2"),
      createPage("102", 2, "h102-2", "2c) Skrå asymptote fordi teller har høyere grad enn nevner."),
      createPage("102", 3, "h102-3", "4a) f(x)=e^{2x}(2-x). Har toppunkt i x=-1 og bunnpunkt i y=3")
    ]
  };

  const johannes: Candidate = {
    id: "J13", name: "Johannes 13", status: "completed",
    pages: [
      createPage("J13", 1, "hJ13-1", "2a) lim x -> -1 (x^2+2x+1)/(x+1) = 0")
    ]
  };

  return {
    id: DEMO_PROJECT_ID,
    name: "EKSEMPEL: Heldagsprøve R1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    taskDescription: "Vurdering av heldagsprøve i R1.",
    taskFiles: [],
    candidates: [cand101, cand102, johannes],
    unprocessedPages: [],
    rubric: rubric,
    status: "completed"
    // Fix: removed properties totalTasks and totalParts as they are not defined in Project interface
  };
};

export const saveProject = async (project: Project): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ ...project, updatedAt: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllProjects = async (): Promise<Project[]> => {
  const db = await openDB();
  const projects: Project[] = await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  if (projects.length === 0) {
    const demo = createDemoProject();
    await saveProject(demo);
    return [demo];
  }
  return projects;
};

export const deleteProject = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
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

export const getCacheStats = async (): Promise<{ count: number }> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CACHE_STORE, "readonly");
    const store = transaction.objectStore(CACHE_STORE);
    const request = store.count();
    request.onsuccess = () => resolve({ count: request.result });
    request.onerror = () => reject(request.error);
  });
};

export const clearGlobalCache = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CACHE_STORE, "readwrite");
    const store = transaction.objectStore(CACHE_STORE);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
