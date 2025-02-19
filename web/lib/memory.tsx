import React from "react";
import { createMemoryStore, MemoryStore } from "../../memory";

type MemoryStoreState = [MemoryStore, true] | [null, false];

const MemoryContext = React.createContext<MemoryStoreState>([null, false]);

export const MemoryStoreProvider = ({ children }: React.PropsWithChildren) => {
  const [memory, setMemory] = React.useState<MemoryStore>();

  React.useEffect(() => {
    createMemoryStore().then(setMemory);
  }, []);

  return (
    <MemoryContext.Provider
      value={[memory ?? null, !!memory] as MemoryStoreState}
    >
      {children}
    </MemoryContext.Provider>
  );
};

export const useMemoryStore = () => {
  const store = React.useContext(MemoryContext);

  return store;
};
