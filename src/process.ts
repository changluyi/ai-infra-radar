import { glmJson } from "./glm";
import { PROCESS_SYSTEM, CLUSTER_SYSTEM, CATEGORIES } from "./prompts";
import { hashId, type Env } from "./env";

interface ItemRow {
  id: string; link: string; title: string; source: string; first_party: number; published: number; snippet: string;
}
interface Processed { id: string; keep: boolean; score: number; category: string; title_zh: string; summary: string; reason: string }

const NUM = /\d[\d,]*(?:\.\d+)?/g;
const sig = (n: string) => n.replace(/[.,]/g, "").replace(/^0+/, "").replace(/0+$/, "");

/** 找出摘要里在原文中对不上的数字（按有效数字比较，兼容“20 亿”对“2 billion”这类换算） */
export function unverifiedNumbers(summary: string, sourceText: string): string[] {
  const have = new Set((sourceText.match(NUM) ?? []).map(sig));
  const bad: string[] = [];
  for (const n of summary.match(NUM) ?? []) {
    if (Number(n.replace(/,/g, "")) < 10) continue; // 个位数常是“三款”“两家”这类翻译，不查
    if (!have.has(sig(n))) bad.push(n);
  }
  return [...new Set(bad)];
}

export interface ProcessResult { processed: number; kept: number; storiesNew: number; storiesUpdated: number; errors: string[] }

export async function processNew(env: Env): Promise<ProcessResult> {
  const limit = Number(env.BATCH_SIZE || 30);
  const { results: rows } = await env.DB.prepare(
    `SELECT id, link, title, source, first_party, published, snippet FROM items WHERE status = 'new' ORDER BY published DESC LIMIT ?1`,
  ).bind(limit).all<ItemRow>();
  const out: ProcessResult = { processed: 0, kept: 0, storiesNew: 0, storiesUpdated: 0, errors: [] };
  if (!rows.length) return out;

  // 1. 打分 + 摘要，每批 15 条
  const kept: (ItemRow & Processed)[] = [];
  for (let i = 0; i < rows.length; i += 15) {
    const chunk = rows.slice(i, i + 15);
    const input = chunk
      .map((r) => `id: ${r.id}\n来源: ${r.source}${r.first_party ? "（一手）" : ""}\n标题: ${r.title}\n内容: ${r.snippet.slice(0, 400)}`)
      .join("\n\n---\n\n");
    let res: Processed[] = [];
    try {
      res = (await glmJson<{ items: Processed[] }>(env, PROCESS_SYSTEM, input)).items ?? [];
    } catch (e) {
      out.errors.push(`处理批次失败：${String((e as Error).message).slice(0, 120)}`);
      continue; // 留在 new，下次重试
    }
    const byId = new Map(res.map((p) => [p.id, p]));
    const stmts: D1PreparedStatement[] = [];
    for (const r of chunk) {
      const p = byId.get(r.id);
      out.processed++;
      if (!p) {
        stmts.push(env.DB.prepare(`UPDATE items SET status = 'error' WHERE id = ?1`).bind(r.id));
        continue;
      }
      if (!p.keep || !p.title_zh || !(p.category in CATEGORIES)) {
        stmts.push(env.DB.prepare(`UPDATE items SET status = 'dropped', score = ?2 WHERE id = ?1`).bind(r.id, p.score || 0));
        continue;
      }
      const bad = unverifiedNumbers(`${p.title_zh} ${p.summary}`, `${r.title} ${r.snippet}`);
      stmts.push(
        env.DB.prepare(
          `UPDATE items SET status = 'kept', score = ?2, category = ?3, title_zh = ?4, summary = ?5, reason = ?6, unverified = ?7 WHERE id = ?1`,
        ).bind(r.id, Math.round(p.score), p.category, p.title_zh, p.summary, p.reason, bad.length ? bad.join(",") : null),
      );
      kept.push({ ...r, ...p });
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
  out.kept = kept.length;
  if (!kept.length) return out;

  // 2. 归入事件
  const now = Date.now();
  const { results: recent } = await env.DB.prepare(
    `SELECT id, title FROM stories WHERE updated_at > ?1 ORDER BY updated_at DESC LIMIT 80`,
  ).bind(now - 72 * 3600 * 1000).all<{ id: string; title: string }>();
  const recentIds = new Set(recent.map((s) => s.id));

  let assign: { iid: string; sid: string }[] = [];
  try {
    const input =
      `已有事件：\n${recent.map((s) => `${s.id}: ${s.title}`).join("\n") || "（无）"}\n\n新收录的新闻：\n` +
      kept.map((k) => `${k.id}: ${k.title_zh}｜${k.summary.slice(0, 120)}`).join("\n");
    assign = (await glmJson<{ assign: typeof assign }>(env, CLUSTER_SYSTEM, input)).assign ?? [];
  } catch (e) {
    out.errors.push(`事件归并失败，每条单独成事件：${String((e as Error).message).slice(0, 120)}`);
  }
  const sidOf = new Map(assign.map((a) => [a.iid, a.sid]));

  // 新事件按临时编号分组；归不到已有事件的也各自成组
  const groups = new Map<string, (ItemRow & Processed)[]>();
  const toExisting: [string, ItemRow & Processed][] = [];
  for (const k of kept) {
    const sid = sidOf.get(k.id);
    if (sid && recentIds.has(sid)) toExisting.push([sid, k]);
    else {
      const key = sid && /^new/.test(sid) ? sid : `solo:${k.id}`;
      groups.set(key, [...(groups.get(key) ?? []), k]);
    }
  }

  const better = (a: ItemRow & Processed, b: ItemRow & Processed) =>
    a.first_party !== b.first_party ? b.first_party - a.first_party : b.score - a.score;
  const stmts: D1PreparedStatement[] = [];

  for (const members of groups.values()) {
    members.sort(better);
    const lead = members[0];
    const sid = await hashId(`story:${lead.id}`);
    stmts.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO stories (id, title, summary, reason, category, score, lead_item, item_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
      ).bind(sid, lead.title_zh, lead.summary, lead.reason, lead.category, Math.max(...members.map((m) => Math.round(m.score))), lead.id, members.length, now),
    );
    for (const m of members) stmts.push(env.DB.prepare(`UPDATE items SET story_id = ?2 WHERE id = ?1`).bind(m.id, sid));
    out.storiesNew++;
  }

  for (const [sid, k] of toExisting) {
    stmts.push(env.DB.prepare(`UPDATE items SET story_id = ?2 WHERE id = ?1`).bind(k.id, sid));
    // 新报道是一手来源而原代表不是，或者分数更高时，用它来代表这个事件
    const leadFp = `(SELECT first_party FROM items WHERE items.id = stories.lead_item)`;
    const swap = `((?8 = 1 AND ${leadFp} = 0) OR (?8 >= ${leadFp} AND ?3 > score))`;
    stmts.push(
      env.DB.prepare(
        `UPDATE stories SET item_count = item_count + 1, updated_at = ?2,
           title = CASE WHEN ${swap} THEN ?4 ELSE title END,
           summary = CASE WHEN ${swap} THEN ?5 ELSE summary END,
           reason = CASE WHEN ${swap} THEN ?6 ELSE reason END,
           category = CASE WHEN ${swap} THEN ?9 ELSE category END,
           lead_item = CASE WHEN ${swap} THEN ?7 ELSE lead_item END,
           score = MAX(score, ?3)
         WHERE id = ?1`,
      ).bind(sid, now, Math.round(k.score), k.title_zh, k.summary, k.reason, k.id, k.first_party, k.category),
    );
    out.storiesUpdated++;
  }
  if (stmts.length) await env.DB.batch(stmts);
  return out;
}
