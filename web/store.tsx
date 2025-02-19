import { useStore } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import Dexie from "dexie";
import { createContext, useContext, useMemo, useState } from "react";
import { type DexieSchema } from "../db";
import { HNSWVectorStore } from "../memory/vector";
import { MemoryStore } from "../memory";
import { Embedder } from "../memory/embedder";

interface State {
  hello: "world";
}

export class GlobalStore {
  state: Store<State>;
  db: Dexie & DexieSchema;
  embedder: Embedder;
  vector: HNSWVectorStore;
  memory: MemoryStore;

  constructor() {
    this.state = new Store({ hello: "world" });

    this.db = new Dexie("my-db") as Dexie & DexieSchema;
    this.db.version(1).stores({
      hnswNodes: "++id",
      measurements: "++id",
      conversations: "++id",
      memories: "++id",
      events: "++id",
    });
    void this.db.open();

    this.embedder = new Embedder();
    this.vector = new HNSWVectorStore(this.db, 384);
    this.memory = new MemoryStore({
      vector: this.vector,
      db: this.db,
      embedder: this.embedder,
    });
  }
}

const GlobalStoreContext = createContext<GlobalStore | null>(null);

export const GlobalStoreProvider = ({ children }: React.PropsWithChildren) => {
  const [store] = useState(new GlobalStore());

  const value = useMemo(() => {
    return store;
  }, [store]);

  return (
    <GlobalStoreContext.Provider value={value}>
      {children}
    </GlobalStoreContext.Provider>
  );
};

export function useGlobalStore<TSelected = GlobalStore["state"]>(
  selector?: (state: GlobalStore["state"]["state"]) => TSelected
): TSelected {
  const store = useContext(GlobalStoreContext);
  if (store === null) {
    throw new Error("useGlobalStore must be used within a GlobalStoreProvider");
  }

  return useStore(store.state, selector);
}

export function useVectorStore() {
  const store = useContext(GlobalStoreContext);
  if (store === null) {
    throw new Error("useVectorStore must be used within a GlobalStoreProvider");
  }
  return store.vector;
}

export function useMemoryStore() {
  const store = useContext(GlobalStoreContext);
  if (store === null) {
    throw new Error("useMemoryStore must be used within a GlobalStoreProvider");
  }
  return store.memory;
}

export function useEmbedder() {
  const store = useContext(GlobalStoreContext);
  if (store === null) {
    throw new Error("useEmbedder must be used within a GlobalStoreProvider");
  }
  return store.embedder;
}

export function useDexie() {
  const store = useContext(GlobalStoreContext);
  if (store === null) {
    throw new Error("useDexie must be used within a GlobalStoreProvider");
  }
  return store.db;
}