import { useStore } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import Dexie from "dexie";
import { createContext, useContext, useMemo, useState } from "react";
import { type DexieSchema } from "../db";
import { HNSWVectorStore } from "../memory/vector";
import { MemoryStore } from "../memory";
import { Embedder } from "../memory/embedder";
import { AccountUtils, Ed25519Account } from "@aptos-labs/ts-sdk";
import { askWithGemini, readAll } from "../ai/gemini.client";
import { generateUserResponse, MCTSNode, mctsSearch } from "./mcts";

interface State {
  account: Ed25519Account;
  hello: "world";
  messages: { completed: boolean; value: string }[];
}

export class GlobalStore {
  state: Store<State>;
  db: Dexie & DexieSchema;
  embedder: Embedder;
  vector: HNSWVectorStore;
  memory: MemoryStore;

  constructor() {
    // NOTE(kenta): lol yes this is unsafe but the sign message
    // api's in aptos wallet adapter really needs improvement

    let account: Ed25519Account;

    const encoded = window.localStorage.getItem("healthdb_keys");
    if (encoded === null) {
      account = Ed25519Account.generate();
      window.localStorage.setItem(
        "healthdb_keys",
        AccountUtils.toHexString(account),
      );
    } else {
      account = AccountUtils.ed25519AccountFromHex(encoded);
    }

    this.state = new Store<State>({ account, hello: "world", messages: [] });

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

  async askAndSaveToMemory(question: string) {
    void this.memory.add(question);

    return askWithGemini({
      contents: [
        {
          role: "user",
          parts: [{ text: question }],
        },
      ],
    });
  }

  async runMCTS(question: string) {
    const rootNode = new MCTSNode([question]);

    const bestResponse = await mctsSearch(rootNode, 500);
    console.log(`AI: ${bestResponse}`);

    const userPrompt = askWithGemini(
      generateUserResponse([...rootNode.conversationState], bestResponse).body,
    );

    const userResponse = await readAll(userPrompt);
    console.log(`User: ${userResponse}`);

    return bestResponse;
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
  selector?: (state: GlobalStore["state"]["state"]) => TSelected,
): TSelected {
  const store = useContext(GlobalStoreContext);
  if (store === null) {
    throw new Error("useGlobalStore must be used within a GlobalStoreProvider");
  }

  return useStore(store.state, selector);
}

export function useGlobals() {
  const store = useContext(GlobalStoreContext);

  if (store === null) {
    throw new Error("useGlobals must be used within a GlobalStoreProvider");
  }

  return store;
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
