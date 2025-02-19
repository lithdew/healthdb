import React from "react";
import { createDatabase, type DB } from "../../db";

const DBContext = React.createContext<DBState>([null, false]);
type DBState = [DB, true] | [null, false];

export const DBProvider = ({ children }: React.PropsWithChildren) => {
  const [db, setDb] = React.useState<DB>();
  React.useEffect(() => {
    createDatabase().then(setDb);
  }, []);

  const value = React.useMemo(() => [db ?? null, !!db] as DBState, [db]);

  return <DBContext.Provider value={value}>{children}</DBContext.Provider>;
};

export const useDb = () => {
  return React.useContext(DBContext);
};
