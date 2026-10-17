// 用 better-sqlite3 模拟 Cloudflare D1 的接口，让 Worker 代码原样跑在 Node 上
import Database from "better-sqlite3";

class Stmt {
  constructor(private db: Database.Database, private sql: string, private params: unknown[] = []) {}
  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, params);
  }
  // D1 用 ?1 ?2 编号参数，better-sqlite3 只认匿名 ? 的位置，这里按编号展开
  private prepared() {
    const order: number[] = [];
    const sql = this.sql.replace(/\?(\d+)/g, (_, n) => (order.push(Number(n) - 1), "?"));
    const args = order.length ? order.map((i) => this.params[i]) : this.params;
    return { stmt: this.db.prepare(sql), args: args.map((v) => (typeof v === "boolean" ? Number(v) : v)) };
  }
  async all<T>() {
    const { stmt, args } = this.prepared();
    return { results: stmt.all(...args) as T[], success: true, meta: {} };
  }
  async first<T>(): Promise<T | null> {
    const { stmt, args } = this.prepared();
    return (stmt.get(...args) as T) ?? null;
  }
  async run() {
    return this.runSync();
  }
  runSync() {
    const { stmt, args } = this.prepared();
    const r = stmt.run(...args);
    return { success: true, results: [], meta: { changes: r.changes } };
  }
}

export class D1Shim {
  private db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
  }
  exec(sql: string) {
    this.db.exec(sql);
  }
  prepare(sql: string) {
    return new Stmt(this.db, sql);
  }
  async batch(stmts: Stmt[]) {
    return this.db.transaction(() => stmts.map((s) => s.runSync()))();
  }
}
