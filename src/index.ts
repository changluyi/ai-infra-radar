import type { Env } from "./env";

import { collect } from "./collect";
import { processNew } from "./process";
import { buildDaily, buildWeekly, publishDaily, publishWeekly } from "./digest";
import { homePage, storyPage, dailyPage, dailyArchive, weeklyPage, aboutPage, feedXml, notFound } from "./web";

const CRON_COLLECT = "*/30 * * * *";
const CRON_DIGEST = "0 0 * * *"; // UTC 00:00 = 北京时间 08:00

async function tick(env: Env) {
  const c = await collect(env);
  const p = await processNew(env);
  console.log(JSON.stringify({ collect: c, process: p }));
  return { collect: c, process: p };
}

async function daily(env: Env) {
  await tick(env); // 出刊前先把最新的抓一遍
  const d = await buildDaily(env);
  if (d) await publishDaily(env, d.issue, d.daily);
  return d;
}

async function weekly(env: Env) {
  const w = await buildWeekly(env);
  if (w) await publishWeekly(env, w.issue, w.weekly);
  return w;
}

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === CRON_DIGEST) {
      ctx.waitUntil(
        (async () => {
          await daily(env);
          if (new Date(Date.now() + 8 * 3600 * 1000).getUTCDay() === 1) await weekly(env); // 北京时间周一
        })(),
      );
    } else if (event.cron === CRON_COLLECT) {
      const t = new Date(event.scheduledTime);
      if (t.getUTCHours() === 0 && t.getUTCMinutes() === 0) return; // 和出刊任务撞车时让出，出刊任务自己会先抓一遍
      ctx.waitUntil(tick(env));
    }
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/$/, "") || "/";

    // 手动触发：POST /run/{tick|daily|weekly}，Header: Authorization: Bearer <RUN_TOKEN>
    if (p.startsWith("/run/") && req.method === "POST") {
      if (!env.RUN_TOKEN || req.headers.get("Authorization") !== `Bearer ${env.RUN_TOKEN}`) return new Response("unauthorized", { status: 401 });
      const job = p.slice(5);
      const fn = job === "tick" ? tick : job === "daily" ? daily : job === "weekly" ? weekly : null;
      if (!fn) return new Response("unknown job", { status: 404 });
      const result = await fn(env);
      return Response.json(result ?? { message: "没有可用的内容" });
    }

    if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
    if (p === "/") return homePage(env, url);
    if (p === "/about") return aboutPage(env);
    if (p === "/feed.xml") return feedXml(env, env.SITE_URL?.replace(/\/$/, "") || url.origin);
    if (p === "/daily") return dailyPage(env);
    if (p === "/daily/archive") return dailyArchive(env);
    let m = p.match(/^\/daily\/(\d{4}-\d{2}-\d{2})$/);
    if (m) return dailyPage(env, m[1]);
    if (p === "/weekly") return weeklyPage(env);
    m = p.match(/^\/weekly\/(\d{4}-W\d{2})$/);
    if (m) return weeklyPage(env, m[1]);
    m = p.match(/^\/story\/([0-9a-f]{20})$/);
    if (m) return storyPage(env, m[1]);
    return notFound(env);
  },
} satisfies ExportedHandler<Env>;

