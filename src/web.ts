import { CATEGORIES, CATEGORY_ORDER } from "./prompts";
import { storiesBetween, storiesByIds, story as getStory, getDigest, listDigests, stats, type StoryRow } from "./db";
import { siteName, minScore, shDate, shTime, type Env } from "./env";
import { getSources } from "./collect";
import type { Daily, Weekly } from "./digest";

const h = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
:root{--bg:#F2F4F3;--surface:#FFFFFF;--ink:#13201E;--muted:#5A6866;--line:#D5DDDB;--accent:#1F55D6;--signal:#C27A0E;--ok:#1E8A55;--warn:#B3412F;
--sans:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;--mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Consolas,monospace;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0F1615;--surface:#162120;--ink:#E4ECEA;--muted:#93A3A0;--line:#28363A;--accent:#7FA2FF;--signal:#F0AE48;--ok:#5CCB8F;--warn:#F08A78;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 var(--sans)}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
.wrap{max-width:780px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:28px 64px}
header.top{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:10px 20px;padding-bottom:16px;border-bottom:1px solid var(--line);margin-bottom:28px}
.brand{font-family:var(--mono);font-weight:600;font-size:15px;color:var(--ink)}
.brand b{color:var(--signal);font-weight:500}
nav{display:flex;gap:4px;flex-wrap:wrap}
nav a{font-family:var(--mono);font-size:13px;color:var(--muted);padding:4px 10px;border-radius:6px}
nav a.on{color:var(--ink);background:var(--surface);border:1px solid var(--line)}
h1{font-size:clamp(26px,5vw,36px);line-height:1.25;margin:6px 0 10px;font-weight:900;text-wrap:balance}
h2{font-family:var(--mono);font-size:13px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:36px 0 12px;display:flex;gap:10px;align-items:center}
h2::after{content:"";flex:1;height:1px;background:var(--line)}
.eyebrow{font-family:var(--mono);font-size:12px;color:var(--muted);letter-spacing:.04em}
.lede{font-size:17px;margin:0 0 6px;max-width:42em}
.statbar{display:flex;flex-wrap:wrap;gap:6px 18px;font-family:var(--mono);font-size:12px;color:var(--muted);margin:12px 0 0;font-variant-numeric:tabular-nums}
.statbar b{color:var(--ink);font-weight:600}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 20px}
.filters a{font-size:13px;padding:3px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);background:var(--surface)}
.filters a.on{border-color:var(--accent);color:var(--accent)}
.day{font-family:var(--mono);font-size:12px;color:var(--signal);margin:26px 0 4px;letter-spacing:.04em}
.story{padding:16px 0;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:6px;min-width:0}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-family:var(--mono);font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.chip{font-size:11px;padding:0 7px;border:1px solid currentColor;border-radius:999px;line-height:18px}
.chip.fp{color:var(--ok)}.chip.cat{color:var(--accent)}
.score{color:var(--signal)}
.story h3{margin:0;font-size:18px;line-height:1.45;font-weight:700}
.story h3 a{color:var(--ink)}
.story p{margin:0;color:var(--ink)}
.why{color:var(--muted);font-size:14px}
.foot{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--muted)}
.warn{color:var(--warn);font-size:12px;font-family:var(--mono)}
.hot{list-style:none;margin:0;padding:0;counter-reset:h}
.hot li{display:grid;grid-template-columns:1.6em 1fr auto;gap:10px;padding:8px 0;border-top:1px solid var(--line);counter-increment:h;align-items:baseline}
.hot li::before{content:counter(h);font-family:var(--mono);color:var(--signal);font-size:13px}
.hot a{color:var(--ink);font-weight:500}
.hot .n{font-family:var(--mono);font-size:12px;color:var(--muted)}
.box{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:16px 18px}
.toc{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.toc li{display:flex;justify-content:space-between;gap:10px;font-size:15px}
.toc .n{font-family:var(--mono);color:var(--muted);font-size:13px}
.secno{font-family:var(--mono);color:var(--signal);margin-right:8px}
.intro{color:var(--muted);margin:-4px 0 6px;font-size:15px}
.timeline{list-style:none;margin:0;padding:0}
.timeline li{display:grid;grid-template-columns:7.5em 1fr;gap:12px;padding:10px 0;border-top:1px solid var(--line)}
.timeline .t{font-family:var(--mono);font-size:12px;color:var(--muted);padding-top:3px}
.archive{list-style:none;margin:0;padding:0}
.archive li{display:grid;grid-template-columns:7.5em 1fr;gap:12px;padding:10px 0;border-top:1px solid var(--line)}
.archive .k{font-family:var(--mono);font-size:13px;color:var(--muted)}
.pager{display:flex;justify-content:space-between;gap:12px;margin-top:28px;font-family:var(--mono);font-size:13px}
.empty{color:var(--muted);padding:28px 0}
footer{margin-top:48px;padding-top:16px;border-top:1px solid var(--line);font-family:var(--mono);font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:6px 16px}
@media (max-width:520px){.timeline li,.archive li{grid-template-columns:1fr;gap:2px}}
`;

function layout(env: Env, o: { title: string; active?: string; body: string; desc?: string }): Response {
  const name = siteName(env);
  const nav = [["/", "精选"], ["/daily", "日报"], ["/weekly", "周报"], ["/about", "关于"]]
    .map(([href, label]) => `<a href="${href}"${o.active === href ? ' class="on"' : ""}>${label}</a>`).join("");
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${h(o.title === name ? name : `${o.title} · ${name}`)}</title>
<meta name="description" content="${h(o.desc ?? "AI 基础设施与 AI 生意的每日精选、日报和周报，模型自动整理，每条附原文。")}">
<link rel="alternate" type="application/rss+xml" title="${h(name)}" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;700;900&display=swap">
<style>${CSS}</style></head><body><div class="wrap">
<header class="top"><a class="brand" href="/">~/<b>${h(name)}</b></a><nav>${nav}</nav></header>
${o.body}
<footer><span>由模型根据公开来源自动整理，每条附原文</span><a href="/feed.xml">RSS</a><a href="/about">信源与方法</a></footer>
</div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

function storyCard(s: StoryRow, o: { time?: "time" | "date" } = {}): string {
  const when = o.time === "date" ? shDate(s.created_at).slice(5).replace("-", ".") : shTime(s.created_at);
  return `<article class="story" id="s-${h(s.id)}">
<div class="meta"><span>${when}</span><span>${h(s.source)}</span>${s.first_party ? '<span class="chip fp">一手</span>' : ""}<span class="chip cat">${h(CATEGORIES[s.category] ?? s.category)}</span><span class="score">AI 评分 ${s.score}</span></div>
<h3><a href="/story/${h(s.id)}">${h(s.title)}</a></h3>
<p>${h(s.summary)}</p>
${s.reason ? `<div class="why">推荐理由：${h(s.reason)}</div>` : ""}
<div class="foot"><a href="${h(s.link)}" target="_blank" rel="noopener">原文 ↗</a>${s.item_count > 1 ? `<a href="/story/${h(s.id)}">另有 ${s.item_count - 1} 家信源报道</a>` : ""}${s.unverified ? `<span class="warn">⚠ 数字 ${h(s.unverified)} 未在原文摘要中找到</span>` : ""}</div>
</article>`;
}

const empty = (msg: string) => `<p class="empty">${h(msg)}</p>`;

// —— 首页：精选流 + 当前热点 ——
export async function homePage(env: Env, url: URL): Promise<Response> {
  const cat = url.searchParams.get("category") ?? "";
  const now = Date.now();
  const list = await storiesBetween(env, now - 7 * 86400000, now + 1, minScore(env), 120, cat in CATEGORIES ? cat : undefined);
  const recent = await storiesBetween(env, now - 48 * 3600000, now + 1, minScore(env), 80);
  const heat = (s: StoryRow) => s.score + 6 * (s.item_count - 1) - (now - s.created_at) / 3600000 * 0.8;
  const hot = recent.sort((a, b) => heat(b) - heat(a)).slice(0, 5);
  const st = await stats(env);

  const filters = [["", "全部"], ...CATEGORY_ORDER.map((c) => [c, CATEGORIES[c]])]
    .map(([c, l]) => `<a href="${c ? `/?category=${c}` : "/"}"${c === cat ? ' class="on"' : ""}>${h(l)}</a>`).join("");

  let feed = "";
  let lastDay = "";
  for (const s of list) {
    const d = shDate(s.created_at);
    if (d !== lastDay) { feed += `<div class="day">${d}</div>`; lastDay = d; }
    feed += storyCard(s);
  }

  const body = `
<div class="eyebrow">AI Infra · AI 生意 · 每 30 分钟更新</div>
<h1>${h(siteName(env))}</h1>
<p class="lede">盯住 GPU、推理引擎、集群网络和 AI 商业化的信源，模型打分、合并同一件事的报道，每天早上 8 点出日报，每周一出周报。</p>
<div class="statbar"><span>24 小时抓取 <b>${st.items24 ?? 0}</b></span><span>新事件 <b>${st.stories24 ?? 0}</b></span><span>累计收录 <b>${st.kept ?? 0}</b> / ${st.items ?? 0}</span></div>
${hot.length ? `<h2>当前热点</h2><ol class="hot">${hot.map((s) => `<li><a href="/story/${h(s.id)}">${h(s.title)}</a><span class="n">${s.item_count > 1 ? `${s.item_count} 家报道` : h(s.source)}</span></li>`).join("")}</ol>` : ""}
<h2>最新精选</h2>
<div class="filters">${filters}</div>
${feed || empty("这几天还没有入选的内容。抓取每 30 分钟跑一次，稍后再来看。")}`;
  return layout(env, { title: siteName(env), active: "/", body });
}

// —— 事件详情 ——
export async function storyPage(env: Env, id: string): Promise<Response> {
  const r = await getStory(env, id);
  if (!r) return notFound(env);
  const { story: s, items } = r;
  const body = `${storyCard(s, { time: "date" }).replace('<article class="story"', '<article class="story" style="border-top:0"')}
<h2>报道时间线 · ${items.length}</h2>
<ul class="timeline">${items.map((i) => `<li><span class="t">${shDate(i.published).slice(5)} ${shTime(i.published)}</span><div><div class="meta"><span>${h(i.source)}</span>${i.first_party ? '<span class="chip fp">一手</span>' : ""}</div><a href="${h(i.link)}" target="_blank" rel="noopener">${h(i.title_zh || i.title)}</a>${i.title_zh && i.title_zh !== i.title ? `<div class="why">${h(i.title)}</div>` : ""}</div></li>`).join("")}</ul>`;
  return layout(env, { title: s.title, body, desc: s.summary });
}

// —— 日报 ——
export async function dailyPage(env: Env, key?: string): Promise<Response> {
  const d = await getDigest<Daily>(env, "daily", key);
  if (!d) return layout(env, { title: "日报", active: "/daily", body: `<h1>日报</h1>${empty("第一期日报会在明天早上 8 点生成。")}` });
  const data = d.data;
  const ids = [...new Set(data.sections.flatMap((s) => s.ids))];
  const map = await storiesByIds(env, ids);
  const all = await listDigests(env, "daily", 400);
  const pos = all.findIndex((x) => x.key === d.key);
  const prev = all[pos + 1], next = pos > 0 ? all[pos - 1] : undefined;
  const weekday = "日一二三四五六"[new Date(`${data.date}T00:00:00Z`).getUTCDay()];

  const body = `
<div class="eyebrow">AI Infra · 每日要闻 · 第 ${d.issue} 期 · ${data.date}（星期${weekday}）08:00</div>
<h1>${h(data.headline)}</h1>
<p class="lede">${h(data.lede)}</p>
<div class="statbar"><span><b>${data.stats.stories}</b> 件事</span><span><b>${data.stats.sources}</b> 个信源</span><span><b>${data.stats.firstParty}</b> 条一手</span><span>约 ${Math.max(1, Math.round(data.stats.stories * 0.4))} 分钟读完</span></div>
<h2>今日看点</h2>
<ol class="hot">${data.highlights.map((id) => map.get(id)).filter(Boolean).map((s) => `<li><a href="#s-${h(s!.id)}">${h(s!.title)}</a><span class="n">${h(s!.source)}</span></li>`).join("")}</ol>
<h2>本期版面</h2>
<div class="box"><ul class="toc">${data.sections.map((s, i) => `<li><a href="#sec-${i + 1}"><span class="secno">${String(i + 1).padStart(2, "0")}</span>${h(CATEGORIES[s.cat] ?? s.cat)}</a><span class="n">${s.ids.length} 条</span></li>`).join("")}</ul></div>
${data.sections.map((sec, i) => `<h2 id="sec-${i + 1}">${String(i + 1).padStart(2, "0")} ${h(CATEGORIES[sec.cat] ?? sec.cat)}</h2>${sec.ids.map((id) => map.get(id)).filter(Boolean).map((s) => storyCard(s!)).join("")}`).join("")}
${data.study_idea ? `<h2>学习选题</h2><div class="box">${h(data.study_idea)}</div>` : ""}
<div class="pager"><span>${prev ? `<a href="/daily/${prev.key}">← ${prev.key}</a>` : ""}</span><a href="/daily/archive">日报合订本</a><span>${next ? `<a href="/daily/${next.key}">${next.key} →</a>` : ""}</span></div>`;
  return layout(env, { title: `日报 ${data.date}`, active: "/daily", body, desc: data.lede });
}

export async function dailyArchive(env: Env): Promise<Response> {
  const all = await listDigests(env, "daily", 400);
  const body = `<h1>日报合订本</h1>${all.length ? `<ul class="archive">${all.map((d) => `<li><span class="k">第 ${d.issue} 期 · ${d.key.slice(5)}</span><a href="/daily/${d.key}">${h((d.data as Daily).headline)}</a></li>`).join("")}</ul>` : empty("还没有日报。")}`;
  return layout(env, { title: "日报合订本", active: "/daily", body });
}

// —— 周报 ——
export async function weeklyPage(env: Env, key?: string): Promise<Response> {
  const w = await getDigest<Weekly>(env, "weekly", key);
  const all = await listDigests(env, "weekly", 200);
  if (!w) return layout(env, { title: "周报", active: "/weekly", body: `<h1>周报</h1>${empty("第一期周报会在下周一早上 8 点生成。")}` });
  const data = w.data;
  const map = await storiesByIds(env, data.sections.flatMap((s) => s.ids));
  const body = `
<div class="eyebrow">AI Infra · 周报 · 第 ${w.issue} 期 · ${data.key}（${data.from.slice(5).replace("-", ".")} — ${data.to.slice(5).replace("-", ".")}）</div>
<h1>${h(data.headline)}</h1>
<p class="lede">${h(data.lede)}</p>
<div class="statbar"><span><b>${data.stats.picked}</b> 件事入选</span><span>候选 <b>${data.stats.stories}</b></span><span><b>${data.sections.length}</b> 个版块</span></div>
<h2>本期版面</h2>
<div class="box"><ul class="toc">${data.sections.map((s, i) => `<li><a href="#sec-${i + 1}"><span class="secno">${String(i + 1).padStart(2, "0")}</span>${h(s.name)}</a><span class="n">${s.ids.length} 条</span></li>`).join("")}</ul></div>
${data.sections.map((sec, i) => `<h2 id="sec-${i + 1}">${String(i + 1).padStart(2, "0")} ${h(sec.name)}</h2>${sec.intro ? `<p class="intro">${h(sec.intro)}</p>` : ""}${sec.ids.map((id) => map.get(id)).filter(Boolean).map((s) => storyCard(s!, { time: "date" })).join("")}`).join("")}
${data.observation ? `<h2>本周观察</h2><div class="box">${h(data.observation)}<div class="eyebrow" style="margin-top:8px">由模型根据本周事件生成</div></div>` : ""}
${data.study_tasks.length ? `<h2>本周学习任务</h2><div class="box"><ol style="margin:0;padding-left:1.2em">${data.study_tasks.map((t) => `<li>${h(t)}</li>`).join("")}</ol></div>` : ""}
${all.length > 1 ? `<h2>往期</h2><ul class="archive">${all.filter((x) => x.key !== w.key).map((x) => `<li><span class="k">第 ${x.issue} 期 · ${x.key}</span><a href="/weekly/${x.key}">${h((x.data as Weekly).headline)}</a></li>`).join("")}</ul>` : ""}`;
  return layout(env, { title: `周报 ${data.key}`, active: "/weekly", body, desc: data.lede });
}

// —— 关于 ——
export async function aboutPage(env: Env): Promise<Response> {
  const st = await stats(env);
  const sources = getSources(env);
  const body = `<h1>信源与方法</h1>
<p class="lede">这个站全自动运行，没有人工编辑。每条内容都附原文链接，请以原文为准。</p>
<h2>怎么做的</h2>
<div class="box"><ol style="margin:0;padding-left:1.2em">
<li>每 30 分钟抓一次下面的 ${sources.length} 个信源。</li>
<li>模型判断每条是否和 AI 基础设施或 AI 生意相关、有没有实质信息，写中文标题、摘要和推荐理由，打 0-100 分。营销稿和重复转载丢弃。</li>
<li>同一件事的多篇报道合并成一个事件，优先用一手来源代表它。</li>
<li>摘要里的数字会和原文对照，对不上的会标出来。</li>
<li>${minScore(env)} 分以上进入精选。每天 08:00 生成日报，每周一 08:00 生成上一周的周报。</li>
</ol></div>
<h2>数据</h2>
<div class="statbar"><span>累计抓取 <b>${st.items ?? 0}</b></span><span>收录 <b>${st.kept ?? 0}</b></span><span>已出刊 <b>${st.digests ?? 0}</b> 期</span></div>
<h2>信源 · ${sources.length}</h2>
<ul class="archive">${sources.map((s) => `<li><span class="k">${s.firstParty ? "一手" : "媒体/社区"}</span><span>${h(s.name)}</span></li>`).join("")}</ul>
<h2>订阅</h2>
<p>RSS：<a href="/feed.xml">/feed.xml</a>（日报和周报）</p>`;
  return layout(env, { title: "信源与方法", active: "/about", body });
}

export function notFound(env: Env): Response {
  const r = layout(env, { title: "找不到", body: `<h1>找不到这个页面</h1><p><a href="/">回到首页</a></p>` });
  return new Response(r.body, { status: 404, headers: r.headers });
}

// —— RSS ——
export async function feedXml(env: Env, base: string): Promise<Response> {
  const daily = await listDigests(env, "daily", 30);
  const weekly = await listDigests(env, "weekly", 10);
  const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const items = [
    ...daily.map((d) => ({ t: d.created_at, title: `日报第 ${d.issue} 期：${(d.data as Daily).headline}`, link: `${base}/daily/${d.key}`, desc: (d.data as Daily).lede })),
    ...weekly.map((w) => ({ t: w.created_at, title: `周报第 ${w.issue} 期：${(w.data as Weekly).headline}`, link: `${base}/weekly/${w.key}`, desc: (w.data as Weekly).lede })),
  ].sort((a, b) => b.t - a.t);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${x(siteName(env))}</title><link>${base}/</link><description>AI 基础设施与 AI 生意的日报和周报</description><language>zh-CN</language>
${items.map((i) => `<item><title>${x(i.title)}</title><link>${i.link}</link><guid>${i.link}</guid><pubDate>${new Date(i.t).toUTCString()}</pubDate><description>${x(i.desc)}</description></item>`).join("\n")}
</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
