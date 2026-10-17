import type { Env } from "./env";

export interface StoryRow {
  id: string; title: string; summary: string; reason: string; category: string; score: number;
  lead_item: string; item_count: number; created_at: number; updated_at: number;
  source: string; link: string; first_party: number; published: number; unverified: string | null;
}
export interface ItemRow {
  id: string; link: string; title: string; title_zh: string | null; source: string; first_party: number;
  published: number; summary: string | null; score: number | null; status: string; unverified: string | null;
}

const STORY_SELECT = `SELECT s.*, i.source, i.link, i.first_party, i.published, i.unverified
  FROM stories s JOIN items i ON i.id = s.lead_item`;

export async function storiesBetween(env: Env, from: number, to: number, minScore: number, limit: number, category?: string) {
  const cat = category ? `AND s.category = ?5` : "";
  const stmt = env.DB.prepare(
    `${STORY_SELECT} WHERE s.created_at >= ?1 AND s.created_at < ?2 AND s.score >= ?3 ${cat} ORDER BY s.created_at DESC LIMIT ?4`,
  );
  const bound = category ? stmt.bind(from, to, minScore, limit, category) : stmt.bind(from, to, minScore, limit);
  return (await bound.all<StoryRow>()).results;
}

export async function storiesByIds(env: Env, ids: string[]): Promise<Map<string, StoryRow>> {
  if (!ids.length) return new Map();
  const ph = ids.map((_, i) => `?${i + 1}`).join(",");
  const { results } = await env.DB.prepare(`${STORY_SELECT} WHERE s.id IN (${ph})`).bind(...ids).all<StoryRow>();
  return new Map(results.map((r) => [r.id, r]));
}

export async function story(env: Env, id: string) {
  const s = (await storiesByIds(env, [id])).get(id);
  if (!s) return null;
  const { results: items } = await env.DB.prepare(
    `SELECT id, link, title, title_zh, source, first_party, published, summary, score, status, unverified
     FROM items WHERE story_id = ?1 ORDER BY published ASC`,
  ).bind(id).all<ItemRow>();
  return { story: s, items };
}

export interface DigestRow { kind: string; key: string; issue: number; data: string; created_at: number }

export async function getDigest<T>(env: Env, kind: string, key?: string): Promise<{ key: string; issue: number; data: T } | null> {
  const row = key
    ? await env.DB.prepare(`SELECT * FROM digests WHERE kind = ?1 AND key = ?2`).bind(kind, key).first<DigestRow>()
    : await env.DB.prepare(`SELECT * FROM digests WHERE kind = ?1 ORDER BY key DESC LIMIT 1`).bind(kind).first<DigestRow>();
  return row ? { key: row.key, issue: row.issue, data: JSON.parse(row.data) as T } : null;
}

export async function listDigests(env: Env, kind: string, limit = 60) {
  const { results } = await env.DB.prepare(`SELECT kind, key, issue, data, created_at FROM digests WHERE kind = ?1 ORDER BY key DESC LIMIT ?2`)
    .bind(kind, limit).all<DigestRow>();
  return results.map((r) => ({ key: r.key, issue: r.issue, created_at: r.created_at, data: JSON.parse(r.data) }));
}

export async function saveDigest(env: Env, kind: string, key: string, data: unknown): Promise<number> {
  const existing = await env.DB.prepare(`SELECT issue FROM digests WHERE kind = ?1 AND key = ?2`).bind(kind, key).first<{ issue: number }>();
  const issue = existing?.issue ?? ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM digests WHERE kind = ?1`).bind(kind).first<{ n: number }>())?.n ?? 0) + 1;
  await env.DB.prepare(`INSERT OR REPLACE INTO digests (kind, key, issue, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(kind, key, issue, JSON.stringify(data), Date.now()).run();
  return issue;
}

export async function stats(env: Env) {
  const since = Date.now() - 24 * 3600 * 1000;
  const r = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM items) AS items,
            (SELECT COUNT(*) FROM items WHERE status = 'kept') AS kept,
            (SELECT COUNT(*) FROM items WHERE fetched_at > ?1) AS items24,
            (SELECT COUNT(*) FROM stories WHERE created_at > ?1) AS stories24,
            (SELECT COUNT(*) FROM digests) AS digests`,
  ).bind(since).first<Record<string, number>>();
  return r ?? {};
}
