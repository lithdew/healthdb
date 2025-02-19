import React from "react";
import { type DB, createDatabase } from "../../db";
import { Store } from "@tanstack/store";
import { useStore as useTanstackStore } from "@tanstack/react-store";

interface State {
  hello: "world";
}

export class MainStore extends Store<State> {
  private db: DB;

  constructor(db: DB) {
    super({ hello: "world" });
    this.db = db;
  }
}

const StoreContext = React.createContext<MainStore | null>(null);

export const StoreProvider = ({ children }: React.PropsWithChildren) => {
  const [store, setStore] = React.useState<MainStore | null>(null);
  React.useEffect(() => {
    createDatabase().then((db) => {
      setStore(new MainStore(db));
    });
  }, []);

  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
};

export function useStore(): MainStore["state"];
export function useStore<const TSelected>(
  selector: (state: MainStore["state"]) => TSelected,
): TSelected;

export function useStore<TSelected>(
  selector?: (state: MainStore["state"]) => TSelected,
): TSelected | MainStore["state"] {
  const mainStore = React.useContext(StoreContext);
  if (mainStore === null) {
    throw new Error("useStore must be used within a StoreProvider");
  }

  return useTanstackStore(mainStore, selector);
}
