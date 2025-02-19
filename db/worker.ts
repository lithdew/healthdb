import sqlite3InitModule, {
  Database,
  type Sqlite3Static,
} from "@sqlite.org/sqlite-wasm";
import { migrations } from "./migrations";

const log = console.log;
const error = console.error;

const start = (sqlite3: Sqlite3Static) => {
  log("Running SQLite3 version", sqlite3.version.libVersion);
  const db =
    "opfs" in sqlite3
      ? new sqlite3.oo1.OpfsDb("/mydb.sqlite3")
      : new sqlite3.oo1.DB("/mydb.sqlite3", "ct");
  log(
    "opfs" in sqlite3
      ? `OPFS is available, created persisted database at ${db.filename}`
      : `OPFS is not available, created transient database ${db.filename}`,
  );
  // Your SQLite code here.

  return db;
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

  console.info(`migration start: ${currentVersion}`);
  for (const migration of migrations) {
    if (currentVersion < migration.version) {
      console.info("migrating");
      db.transaction((db) => {
        db.exec(migration.migration);
        updateVersion(db, migration.version + 1);
      });
    }
  }

  console.info("migration complete");
  console.info(`current version: ${getVersion(db)}`);
  window.postMessage({ type: "completed" });
};

const initializeSQLite = async () => {
  try {
    log("Loading and initializing SQLite3 module from worker...");
    const sqlite3 = await sqlite3InitModule({ print: log, printErr: error });
    log("Done initializing. Running demo...");
    const db = start(sqlite3);
    migrate(db);
  } catch (err) {
    error("Initialization error:", err);
  }
};

initializeSQLite().then(console.log).catch(console.error);
