// Railway / 任意 Node 环境的入口：网页 + 定时任务 + SQLite
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { D1Shim } from "./d1shim";
import worker from "../index";
import type { Env } from "../env";

const dataDir = process.env.DATA_DIR || "./data";
fs.mkdirSync(dataDir, { recursive: true });
const db = new D1Shim(path.join(dataDir, "radar.sqlite"));
db.exec(fs.readFileSync(path.join(__dirname, "../../schema.sql"), "utf8"));

const env = { ...process.env, DB: db } as unknown as Env;
const pending = new Set<Promise<unknown>>();
const ctx = {
  waitUntil(p: Promise<unknown>) {
    const q = p.catch((e) => console.error("[job]", e)).finally(() => pending.delete(q));
    pending.add(q);
  },
  passThroughOnException() {},
} as any;

// 同一时间只跑一个定时任务，避免重复处理
let busy = false;
async function scheduled(cronExpr: string) {
  if (busy) return console.log(`[cron] ${cronExpr} 跳过：上一个任务还在跑`);
  busy = true;
  const t0 = Date.now();
  try {
    await worker.scheduled!({ cron: cronExpr, scheduledTime: Date.now(), noRetry() {} } as any, env, ctx);
    await Promise.all(pending);
    console.log(`[cron] ${cronExpr} 完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.error(`[cron] ${cronExpr} 失败`, e);
  } finally {
    busy = false;
  }
}
// 和 wrangler.toml 保持一致，按 UTC 计时
cron.schedule("*/30 * * * *", () => scheduled("*/30 * * * *"), { timezone: "UTC" });
cron.schedule("0 0 * * *", () => scheduled("0 0 * * *"), { timezone: "UTC" });

const port = Number(process.env.PORT || 8080);
http
  .createServer(async (req, res) => {
    try {
      const host = req.headers.host || `localhost:${port}`;
      const proto = (req.headers["x-forwarded-proto"] as string) || "http";
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const request = new Request(`${proto}://${host}${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined,
      });
      const r = await worker.fetch!(request as any, env, ctx);
      const headers: Record<string, string> = {};
      r.headers.forEach((v, k) => (headers[k] = v));
      res.writeHead(r.status, headers);
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      console.error("[http]", e);
      res.writeHead(500).end("internal error");
    }
  })
  .listen(port, () => console.log(`AI Infra 雷达 listening on :${port}，数据目录 ${dataDir}`));
