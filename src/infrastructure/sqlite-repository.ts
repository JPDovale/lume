import initSqlJs, { type Database } from "sql.js";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  copyFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { Ledger } from "../domain/model";
import { emptyLedger } from "../domain/model";
import type { LedgerRepository } from "../application/ports";
export class SqliteLedgerRepository implements LedgerRepository {
  private db: Database;
  private file: string;
  private constructor(db: Database, file: string) {
    this.db = db;
    this.file = file;
    db.run(
      "CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, data TEXT NOT NULL)",
    );
  }
  static async open(file: string, wasmPath: string) {
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    return new SqliteLedgerRepository(
      new SQL.Database(existsSync(file) ? readFileSync(file) : undefined),
      file,
    );
  }
  read(): Ledger {
    const row = this.db.exec("SELECT data FROM ledger WHERE id=1")[0]
      ?.values[0]?.[0];
    return row ? JSON.parse(String(row)) : emptyLedger();
  }
  save(state: Ledger) {
    const before = this.read();
    try {
      this.db.run("INSERT OR REPLACE INTO ledger VALUES(1,1,?)", [
        JSON.stringify(state),
      ]);
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, this.db.export(), { mode: 0o600, flush: true });
      if (existsSync(this.file)) copyFileSync(this.file, `${this.file}.bak`);
      renameSync(tmp, this.file);
    } catch (error) {
      this.db.run("INSERT OR REPLACE INTO ledger VALUES(1,1,?)", [
        JSON.stringify(before),
      ]);
      throw error;
    }
  }
}
