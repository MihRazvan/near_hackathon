import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { assert, canonical, hashObject, nowIso } from "./core.mjs";

export class Store {
  constructor(path = ":memory:") {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      chmodSync(dirname(path), 0o700);
    }
    this.db = new DatabaseSync(path, {
      enableForeignKeyConstraints: true,
      timeout: 5000,
    });
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS objects(kind TEXT NOT NULL,id TEXT NOT NULL,owner TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS objects_owner ON objects(kind,owner);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,entity_id TEXT NOT NULL,actor TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,kind TEXT NOT NULL,scope TEXT NOT NULL,plan_hash TEXT NOT NULL,plan TEXT NOT NULL,phase TEXT NOT NULL,transaction_hash TEXT UNIQUE,result TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS budget_entries(operation_id TEXT NOT NULL REFERENCES operations(id),category TEXT NOT NULL,reserved TEXT NOT NULL,actual TEXT,status TEXT NOT NULL,PRIMARY KEY(operation_id,category));
      CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,origin TEXT NOT NULL,nonce TEXT NOT NULL,message TEXT NOT NULL,expires_ms INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,wallet TEXT NOT NULL,expires_ms INTEGER NOT NULL);
    `);
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      assert(
        !result?.then,
        "ASYNC_SQL_TRANSACTION",
        "SQL transaction callback must be synchronous",
      );
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  get(kind, id) {
    const row = this.db
      .prepare("SELECT * FROM objects WHERE kind=? AND id=?")
      .get(kind, id);
    return row
      ? {
          ...JSON.parse(row.data),
          id: row.id,
          owner: row.owner,
          version: row.version,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;
  }
  list(kind, owner) {
    const rows =
      owner === undefined
        ? this.db
            .prepare(
              "SELECT id FROM objects WHERE kind=? ORDER BY created_at,id",
            )
            .all(kind)
        : this.db
            .prepare(
              "SELECT id FROM objects WHERE kind=? AND owner=? ORDER BY created_at,id",
            )
            .all(kind, owner);
    return rows.map((row) => this.get(kind, row.id));
  }
  insert(kind, id, owner, data) {
    const now = nowIso();
    this.db
      .prepare(
        "INSERT INTO objects(kind,id,owner,data,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
      )
      .run(kind, id, owner, canonical(data), now, now);
    return this.get(kind, id);
  }
  update(kind, id, owner, version, data) {
    const result = this.db
      .prepare(
        "UPDATE objects SET data=?,version=version+1,updated_at=? WHERE kind=? AND id=? AND owner=? AND version=?",
      )
      .run(canonical(data), nowIso(), kind, id, owner, version);
    assert(
      result.changes === 1,
      "STALE_OR_FORBIDDEN",
      "Record changed or belongs to another wallet",
    );
    return this.get(kind, id);
  }
  event(kind, entityId, actor, data) {
    this.db
      .prepare(
        "INSERT INTO events(kind,entity_id,actor,data,created_at) VALUES(?,?,?,?,?)",
      )
      .run(kind, entityId, actor, canonical(data), nowIso());
  }
  operation(id) {
    const row = this.db.prepare("SELECT * FROM operations WHERE id=?").get(id);
    return row
      ? {
          ...row,
          plan: JSON.parse(row.plan),
          result: row.result ? JSON.parse(row.result) : null,
        }
      : null;
  }
  transition(id, expected, next, { transactionHash, result } = {}) {
    const op = this.operation(id);
    assert(
      op && expected.includes(op.phase),
      "INVALID_OPERATION_PHASE",
      "Operation must be reconciled before another send",
    );
    if (op.transaction_hash && transactionHash)
      assert(
        op.transaction_hash === transactionHash,
        "TRANSACTION_CHANGED",
        "Signed transaction cannot be replaced silently",
      );
    this.db
      .prepare(
        "UPDATE operations SET phase=?,transaction_hash=?,result=?,updated_at=? WHERE id=?",
      )
      .run(
        next,
        transactionHash ?? op.transaction_hash,
        result ? canonical(result) : op.result ? canonical(op.result) : null,
        nowIso(),
        id,
      );
    return this.operation(id);
  }
  digest(kind, id) {
    const record = this.get(kind, id);
    return record ? hashObject(record) : null;
  }
  close() {
    this.db.close();
  }
}
