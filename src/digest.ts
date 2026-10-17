import { glmJson } from "./glm";
import { DAILY_SYSTEM, WEEKLY_SYSTEM, CATEGORIES, CATEGORY_ORDER } from "./prompts";
import { storiesBetween, saveDigest, storiesByIds, type StoryRow } from "./db";
import { shDate, shDayStart, isoWeek, minScore, siteName, type Env } from "./env";
import { esc, sendTelegram } from "./telegram";
import { hasXCreds, postTweet, tweetLength } from "./x";

export interface Tweet { sid: string; text: string; posted?: string; error?: string }
export interface Daily {
  date: string; headline: string; lede: string; highlights: string[];
  sections: { cat: string; ids: string[] }[];
  tweets: Tweet[]; study_idea: string;
  stats: { stories: number; sources: number; firstParty: number };
}
export interface Weekly {
  key: string; from: string; to: string; headline: string; lede: string;
  sections: { name: string; intro: string; ids: string[] }[];
  observation: string; thread: { text: string; posted?: string; error?: string }[]; study_tasks: string[];
  stats: { stories: number; picked: number };
}

const storyLine = (s: StoryRow, i: number, withDate = false) =>
  `[${i}] ${withDate ? shDate(s.created_at) + " " : ""}${CATEGORIES[s.category] ?? s.category} 分数${s.score}\n标题:${s.title}\n摘要:${s.summary}\n来源:${s.source}${s.first_party ? "（一手）" : ""}${s.item_count > 1 ? `，另有 ${s.item_count - 1} 家报道` : ""}`;

const validIdx = (idx: unknown, n: number) => typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < n;

export async function buildDaily(env: Env, date = shDate()): Promise<{ issue: number; daily: Daily } | null> {
  const to = Date.now();
  const stories = (await storiesBetween(env, to - 24 * 3600 * 1000, to, minScore(env), 40)).sort((a, b) => b.score - a.score).slice(0, 12);
  if (!stories.length) return null;

  const r = await glmJson<{ headline: string; lede: string; highlights: number[]; tweets: { idx: number; text: string }[]; study_idea: string }>(
    env, DAILY_SYSTEM, stories.map((s, i) => storyLine(s, i)).join("\n\n"),
  );
  const sections = CATEGORY_ORDER.map((cat) => ({ cat, ids: stories.filter((s) => s.category === cat).map((s) => s.id) })).filter((x) => x.ids.length);
  const daily: Daily = {
    date,
    headline: r.headline || stories[0].title,
    lede: r.lede || "",
    highlights: [...new Set((r.highlights ?? []).filter((i) => validIdx(i, stories.length)))].slice(0, 3).map((i) => stories[i].id),
    sections,
    tweets: (r.tweets ?? []).filter((t) => validIdx(t.idx, stories.length) && t.text).slice(0, 3).map((t) => ({ sid: stories[t.idx].id, text: t.text.trim() })),
    study_idea: r.study_idea || "",
    stats: { stories: stories.length, sources: new Set(stories.map((s) => s.source)).size, firstParty: stories.filter((s) => s.first_party).length },
  };
  if (!daily.highlights.length) daily.highlights = stories.slice(0, 3).map((s) => s.id);
  const issue = await saveDigest(env, "daily", date, daily);
  return { issue, daily };
}

export async function buildWeekly(env: Env, today = shDate()): Promise<{ issue: number; weekly: Weekly } | null> {
  // 周一运行时汇总上一周（周一到周日）
  const thisMonday = isoWeek(today).monday;
  const fromDate = new Date(Date.parse(`${thisMonday}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10);
  const { key } = isoWeek(fromDate);
  const from = shDayStart(fromDate);
  const to = shDayStart(thisMonday);
  const stories = (await storiesBetween(env, from, to, minScore(env), 200)).sort((a, b) => b.score - a.score).slice(0, 40);
  if (!stories.length) return null;

  const r = await glmJson<{ headline: string; lede: string; sections: { name: string; intro: string; idx: number[] }[]; observation: string; thread: string[]; study_tasks: string[] }>(
    env, WEEKLY_SYSTEM, stories.map((s, i) => storyLine(s, i, true)).join("\n\n"),
  );
  const used = new Set<number>();
  const sections = (r.sections ?? [])
    .map((sec) => ({
      name: sec.name, intro: sec.intro || "",
      ids: (sec.idx ?? []).filter((i) => validIdx(i, stories.length) && !used.has(i) && used.add(i)).map((i) => stories[i].id),
    }))
    .filter((sec) => sec.name && sec.ids.length);
  const weekly: Weekly = {
    key, from: fromDate, to: new Date(to - 86400000 + 8 * 3600 * 1000).toISOString().slice(0, 10),
    headline: r.headline || stories[0].title, lede: r.lede || "", sections,
    observation: r.observation || "", thread: (r.thread ?? []).filter(Boolean).slice(0, 4).map((text) => ({ text: text.trim() })),
    study_tasks: (r.study_tasks ?? []).filter(Boolean).slice(0, 3),
    stats: { stories: stories.length, picked: used.size },
  };
  const issue = await saveDigest(env, "weekly", key, weekly);
  return { issue, weekly };
}

// —— 发布：自动发推（可选）+ Telegram ——

const url = (env: Env, path: string) => (env.SITE_URL ? env.SITE_URL.replace(/\/$/, "") + path : path);

export async function publishDaily(env: Env, issue: number, d: Daily) {
  if (env.AUTO_POST === "true" && hasXCreds(env) && d.tweets[0]) {
    const t = d.tweets[0];
    if (tweetLength(t.text) > 280) t.error = "超过 280 字符，未发";
    else {
      try { t.posted = await postTweet(env, t.text); } catch (e) { t.error = String((e as Error).message).slice(0, 200); }
    }
    await saveDigest(env, "daily", d.date, d);
  }
  const stories = await storiesByIds(env, d.tweets.map((t) => t.sid));
  const parts = [
    `<b>${esc(siteName(env))} · 日报第 ${issue} 期</b>\n<b>${esc(d.headline)}</b>\n${esc(d.lede)}\n${esc(url(env, `/daily/${d.date}`))}`,
    "<b>📝 推文草稿</b>",
    ...d.tweets.map((t, i) => {
      const s = stories.get(t.sid);
      const status = t.posted ? " ✅已发" : t.error ? ` ⚠️${esc(t.error)}` : "";
      return `<b>${i + 1}.</b> <i>${tweetLength(t.text)}/280</i>${status}\n<pre>${esc(t.text)}</pre>${s ? `\n来源：${esc(s.link)}` : ""}`;
    }),
  ];
  if (d.study_idea) parts.push(`<b>📚 学习选题</b>\n${esc(d.study_idea)}`);
  await sendTelegram(env, parts.join("\n\n"));
}

export async function publishWeekly(env: Env, issue: number, w: Weekly) {
  if (env.AUTO_POST === "true" && hasXCreds(env) && w.thread.length) {
    let prev: string | undefined;
    for (const t of w.thread) {
      if (tweetLength(t.text) > 280) { t.error = "超过 280 字符，thread 中断"; break; }
      try { prev = t.posted = await postTweet(env, t.text, prev); } catch (e) { t.error = String((e as Error).message).slice(0, 200); break; }
    }
    await saveDigest(env, "weekly", w.key, w);
  }
  const parts = [
    `<b>${esc(siteName(env))} · 周报第 ${issue} 期（${w.from} — ${w.to}）</b>\n<b>${esc(w.headline)}</b>\n${esc(w.lede)}\n${esc(url(env, `/weekly/${w.key}`))}`,
    "<b>🧵 Thread 草稿</b>",
    ...w.thread.map((t, i) => `<b>${i + 1}/${w.thread.length}</b> <i>${tweetLength(t.text)}/280</i>${t.posted ? " ✅已发" : t.error ? ` ⚠️${esc(t.error)}` : ""}\n<pre>${esc(t.text)}</pre>`),
  ];
  if (w.study_tasks.length) parts.push(`<b>📚 本周学习任务</b>\n${w.study_tasks.map((s, i) => `${i + 1}. ${esc(s)}`).join("\n")}`);
  await sendTelegram(env, parts.join("\n\n"));
}
