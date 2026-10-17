import { SOURCES, type Source } from "./sources";
import { fetchSource } from "./rss";
import { hashId, type Env } from "./env";

const MAX_AGE_MS = 3 * 24 * 3600 * 1000; // 只收 3 天内的

function normLink(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) if (/^utm_|^ref$|^source$/i.test(k)) url.searchParams.delete(k);
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

export function getSources(env: Env): Source[] {
  if (env.SOURCES_JSON) {
    try {
      return JSON.parse(env.SOURCES_JSON);
    } catch {}
  }
  return SOURCES;
}

export interface CollectResult { fetched: number; inserted: number; failed: string[] }

export async function collect(env: Env): Promise<CollectResult> {
  const now = Date.now();
  const failed: string[] = [];
  const results = await Promise.all(
    getSources(env).map((s) => fetchSource(s).catch((e) => (failed.push(`${s.name}: ${String(e?.message ?? e).slice(0, 80)}`), []))),
  );
  const all = results.flat();
  const stmt = env.DB.prepare(
    `INSERT OR IGNORE INTO items (id, link, title, source, first_party, published, fetched_at, snippet)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  );
  const batch: D1PreparedStatement[] = [];
  const seen = new Set<string>();
  for (const it of all) {
    const published = it.published && it.published <= now + 3600000 ? it.published : now;
    if (now - published > MAX_AGE_MS) continue;
    const link = normLink(it.link);
    const id = await hashId(link);
    if (seen.has(id)) continue;
    seen.add(id);
    batch.push(stmt.bind(id, link, it.title.slice(0, 300), it.source, it.firstParty ? 1 : 0, published, now, it.snippet));
  }
  let inserted = 0;
  for (let i = 0; i < batch.length; i += 50) {
    const res = await env.DB.batch(batch.slice(i, i + 50));
    inserted += res.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
  }
  return { fetched: all.length, inserted, failed };
}
