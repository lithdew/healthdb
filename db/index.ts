import sqlite3InitModule, {
  Database,
  type Sqlite3Static,
} from "@sqlite.org/sqlite-wasm";
import { migrations } from "./migrations";

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

    migrate(db);
    return db;
  } catch (err) {
    console.error("Initialization error:", err);
    throw err;
  }
};

const getVersion = (db: Database) => {
  const result = db.exec("PRAGMA user_version", {
    returnValue: "resultRows",
    rowMode: "object",
  });

  const version = result[0]?.user_version;
  return version as number;
};

const updateVersion = (db: Database, version: number) => {
  db.exec(`PRAGMA user_version = ${version}`);
};

const migrate = (db: Database) => {
  const currentVersion = getVersion(db);

  for (const migration of migrations) {
    if (currentVersion < migration.version) {
      console.info({ currentVersion });
      console.info("migrating");
      db.transaction((db) => {
        db.exec(migration.migration);
        updateVersion(db, migration.version + 1);
      });
    }
  }

  console.info(getVersion(db));
  console.info("migration complete");
};
