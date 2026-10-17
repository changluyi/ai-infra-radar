// 用 Node 自带的 node:sqlite 模拟 Cloudflare D1 的接口，让 Worker 代码原样跑在 Node 上（不需要编译原生模块）
import { DatabaseSync } from "node:sqlite";

type Val = null | number | bigint | string | Uint8Array;

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private params: unknown[] = []) {}
  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, params);
  }
  // D1 用 ?1 ?2 编号参数，这里统一展开成匿名 ? 并按编号取值
  private prepared() {
    const order: number[] = [];
    const sql = this.sql.replace(/\?(\d+)/g, (_, n) => (order.push(Number(n) - 1), "?"));
    const raw = order.length ? order.map((i) => this.params[i]) : this.params;
    const args = raw.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v)) as Val[];
    return { stmt: this.db.prepare(sql), args };
  }
  async all<T>() {
    const { stmt, args } = this.prepared();
    return { results: stmt.all(...args) as T[], success: true, meta: {} };
  }
  async first<T>(): Promise<T | null> {
    const { stmt, args } = this.prepared();
    return ((stmt.get(...args) as T | undefined) ?? null);
  }
  async run() {
    return this.runSync();
  }
  runSync() {
    const { stmt, args } = this.prepared();
    const r = stmt.run(...args);
    return { success: true, results: [], meta: { changes: Number(r.changes) } };
  }
}

export class D1Shim {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  }
  exec(sql: string) {
    this.db.exec(sql);
  }
  prepare(sql: string) {
    return new Stmt(this.db, sql);
  }
  async batch(stmts: Stmt[]) {
    this.db.exec("BEGIN");
    try {
      const out = stmts.map((s) => s.runSync());
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
