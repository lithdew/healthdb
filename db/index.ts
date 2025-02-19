import sqlite3InitModule, {
  Database,
  type Sqlite3Static,
} from "@sqlite.org/sqlite-wasm";
import { schema } from "./schema";

let db: Database | null = null;

const createDbConn = (sqlite3: Sqlite3Static) => {
  console.info("Running SQLite3 version", sqlite3.version.libVersion);
  // Your SQLite code here.
  if (db === null) {
    db = new sqlite3.oo1.DB("/mydb.sqlite3", "ct");
  }
  return db;
};

export const initializeSQLite = async () => {
  try {
    console.info("Loading and initializing SQLite3 module...");
    const sqlite3 = await sqlite3InitModule({
      print: console.info,
      printErr: console.error,
    });
    console.info("Done initializing. Running demo...");
    db = createDbConn(sqlite3);
    db.exec(schema);
    console.info("migration complete");
    return db;
  } catch (err) {
    console.error("Initialization error:", err);
    throw err;
  }
};
