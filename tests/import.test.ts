import { it, expect } from "vitest";
import initSqlJs from "sql.js";
import { zipSync } from "fflate";
import { resolve } from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { ActualImporter } from "../src/infrastructure/actual-importer";
import { SqliteLedgerRepository } from "../src/infrastructure/sqlite-repository";
import { LedgerService } from "../src/application/ledger-service";
import { report } from "../src/domain/reports";
const wasm = resolve("node_modules/sql.js/dist/sql-wasm.wasm");
export async function fixture() {
  const SQL = await initSqlJs({ locateFile: () => wasm }),
    db = new SQL.Database();
  db.run(`CREATE TABLE accounts(id TEXT,name TEXT,tombstone INTEGER);INSERT INTO accounts VALUES('a','Banco',0),('b','Reserva',0);
 CREATE TABLE categories(id TEXT,name TEXT,tombstone INTEGER);INSERT INTO categories VALUES('food','Alimentação',0);
 CREATE TABLE category_mapping(id TEXT,transferId TEXT);INSERT INTO category_mapping VALUES('old-food','food');
 CREATE TABLE payees(id TEXT,name TEXT,transfer_acct TEXT);INSERT INTO payees VALUES('p','Mercado',NULL);
 CREATE TABLE payee_mapping(id TEXT,targetId TEXT);INSERT INTO payee_mapping VALUES('old-p','p');
 CREATE TABLE transactions(id TEXT,isParent INTEGER,isChild INTEGER,parent_id TEXT,acct TEXT,amount INTEGER,category TEXT,description TEXT,date INTEGER,notes TEXT,transferred_id TEXT,starting_balance_flag INTEGER,tombstone INTEGER);
 INSERT INTO transactions VALUES
 ('parent',1,0,NULL,'a',-10000,NULL,'old-p',20260910,'',NULL,0,0),
 ('child-1',0,1,'parent',NULL,-6000,'old-food','old-p',NULL,'#viagem',NULL,0,0),
 ('child-2',0,1,'parent',NULL,-4000,'food','old-p',NULL,'',NULL,0,0),
 ('transfer-out',0,0,NULL,'a',-50000,NULL,NULL,20260911,'','transfer-in',0,0),
 ('transfer-in',0,0,NULL,'b',50000,NULL,NULL,20260911,'','transfer-out',0,0),
 ('opening',0,0,NULL,'a',100000,NULL,NULL,20260901,'',NULL,1,0),
 ('deleted',0,0,NULL,'a',-99000,'food','p',20260901,'',NULL,0,1);`);
  const zip = zipSync({
    "db.sqlite": db.export(),
    "metadata.json": new TextEncoder().encode("{}"),
  });
  db.close();
  return zip;
}
it("imports Actual ZIP with splits, mapping, tags, transfer and opening balance semantics", async () => {
  const { ledger } = await new ActualImporter(wasm).parse(await fixture());
  expect(ledger.transactions).toHaveLength(5);
  expect(
    ledger.transactions.find((t) => t.id === "actual:child-1"),
  ).toMatchObject({
    description: "Mercado",
    date: "2026-09-10",
    accountId: "actual:a",
    categoryId: "actual:food",
    amount: -6000,
    tagIds: ["actual-tag:viagem"],
  });
  const r = report(ledger, "2026-09-18");
  expect(r.expenses).toBe(10000);
  expect(r.income).toBe(0);
  expect(r.balance).toBe(90000);
});
it("persists, creates backup and deduplicates a repeated import after reopening", async () => {
  const folder = mkdtempSync(resolve(tmpdir(), "lume-test-")),
    file = resolve(folder, "lume.sqlite");
  try {
    const ledger = (await new ActualImporter(wasm).parse(await fixture()))
      .ledger;
    const repo = await SqliteLedgerRepository.open(file, wasm),
      service = new LedgerService(repo, { today: () => "2026-09-18" });
    service.import(ledger);
    const original = readFileSync(file);
    service.import(ledger);
    expect(service.snapshot().transactions).toHaveLength(5);
    expect(readFileSync(file + ".bak")).toEqual(original);
    const reopened = await SqliteLedgerRepository.open(file, wasm);
    expect(reopened.read()).toEqual(service.snapshot());
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
it("rejects an incompatible database before producing an import", async () => {
  const SQL = await initSqlJs({ locateFile: () => wasm }),
    db = new SQL.Database();
  await expect(new ActualImporter(wasm).parse(db.export())).rejects.toThrow(
    "incompatível",
  );
  db.close();
});
