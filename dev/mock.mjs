// 本地联调用：假信源 + 假 GLM。启动：node dev/mock.mjs（端口 8799）
import http from "node:http";

const now = Date.now();
const item = (title, link, desc, minsAgo) =>
  `<item><title>${title}</title><link>${link}</link><pubDate>${new Date(now - minsAgo * 60000).toUTCString()}</pubDate><description>${desc}</description></item>`;

const FEEDS = {
  "/feed/vendor.xml": `<rss><channel>
${item("vLLM v0.9 adds disaggregated prefill, 2.1x throughput on H200", "https://example.com/vllm-09", "The release separates prefill and decode across 8 GPUs and reports 2.1x higher throughput.", 30)}
${item("NCCL 2.25 brings faster all-reduce over RoCE", "https://example.com/nccl-225", "New algorithms cut all-reduce latency by 35% on 400G RoCE fabrics.", 90)}
${item("Join our webinar next week!", "https://example.com/webinar", "Register now for our marketing webinar.", 60)}
</channel></rss>`,
  "/feed/news.xml": `<feed>
<entry><title>Startup raises $300 million to build inference cloud</title><link rel="alternate" href="https://example.org/inference-cloud?utm_source=x"/><published>${new Date(now - 120 * 60000).toISOString()}</published><summary>The company plans to deploy 20,000 GPUs across three regions.</summary></entry>
<entry><title>vLLM disaggregated prefill explained</title><link rel="alternate" href="https://example.org/vllm-explained"/><published>${new Date(now - 20 * 60000).toISOString()}</published><summary>A look at the vLLM v0.9 release and its 2.1x throughput claim.</summary></entry>
<entry><title>API price cut: model now costs $0.5 per million tokens</title><link rel="alternate" href="https://example.org/price-cut"/><published>${new Date(now - 200 * 60000).toISOString()}</published><summary>The provider halved prices to $0.5 per million input tokens.</summary></entry>
</feed>`,
};

const cats = ["inference", "cluster", "business", "chips", "model", "research"];

function glm(system, user) {
  if (system.includes("你是资讯编辑")) {
    const blocks = user.split("\n\n---\n\n");
    return {
      items: blocks.map((b, i) => {
        const id = b.match(/^id: (\S+)/m)[1];
        const title = b.match(/^标题: (.*)$/m)[1];
        const content = b.match(/^内容: (.*)$/m)?.[1] ?? "";
        const junk = /webinar/i.test(title);
        const cat = /vLLM/i.test(title) ? "inference" : /NCCL/.test(title) ? "cluster" : /raise|price/i.test(title) ? "business" : cats[i % cats.length];
        const nums = content.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
        return {
          id, keep: !junk, score: junk ? 5 : 70 + ((i * 7) % 25), category: cat,
          title_zh: junk ? "" : `【示例】${title}`,
          // 故意塞一个原文没有的数字，测试数字校验
          summary: junk ? "" : `示例摘要：${content}${i === 0 ? " 另据称成本下降 47%。" : ""}${nums.length ? "" : ""}`,
          reason: junk ? "" : "示例推荐理由：和推理成本直接相关。",
        };
      }),
    };
  }
  if (system.includes("归到“事件”")) {
    const lines = user.split("新收录的新闻：\n")[1].split("\n");
    const existing = [...user.split("新收录的新闻：")[0].matchAll(/^([0-9a-f]{20}): (.*)$/gm)].map((m) => ({ sid: m[1], t: m[2] }));
    return {
      assign: lines.map((l) => {
        const [iid, rest] = [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1)];
        const ex = existing.find((e) => /vLLM/.test(e.t) && /vLLM/.test(rest));
        return { iid, sid: ex ? ex.sid : /vLLM/.test(rest) ? "new1" : `new${iid.slice(0, 4)}` };
      }),
    };
  }
  if (system.includes("日报主编")) {
    const n = (user.match(/^\[\d+\]/gm) ?? []).length;
    return {
      headline: "【示例】vLLM 拆分 prefill，吞吐翻倍", lede: "示例导语：推理引擎和集群通信同时有更新。",
      highlights: [0, 1, 2].filter((i) => i < n),
      tweets: [0, 1, 2].filter((i) => i < n).map((i) => ({ idx: i, text: `示例推文 ${i + 1}：发生了一件事。\n\n我的理解是这会影响推理成本。` })),
      study_idea: "示例：去读 vLLM 的 disaggregated prefill 调度代码。",
    };
  }
  if (system.includes("周报主编")) {
    const n = (user.match(/^\[\d+\]/gm) ?? []).length;
    const idx = [...Array(n).keys()];
    return {
      headline: "【示例】推理成本继续下探", lede: "示例导读：本周推理引擎、网络和价格都有变化。",
      sections: [
        { name: "推理引擎提速", intro: "示例版块导读。", idx: idx.filter((i) => i % 2 === 0) },
        { name: "钱和价格", intro: "示例版块导读。", idx: idx.filter((i) => i % 2 === 1) },
      ],
      observation: "示例本周观察：一段 200 字左右的判断。",
      thread: ["示例 thread 1/3", "示例 thread 2/3", "完整周报见主页"],
      study_tasks: ["示例：读 NCCL 的 ring all-reduce 实现。"],
    };
  }
  return {};
}

http.createServer((req, res) => {
  if (FEEDS[req.url]) {
    res.writeHead(200, { "Content-Type": "application/xml" });
    return res.end(FEEDS[req.url]);
  }
  if (req.url === "/glm/chat/completions" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { messages } = JSON.parse(body);
      const out = glm(messages[0].content, messages[1].content);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
    });
    return;
  }
  if (req.url.startsWith("/tg/")) { // 假 Telegram
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => { console.log("TELEGRAM:", JSON.parse(body).text.slice(0, 300)); res.end("{}"); });
    return;
  }
  res.writeHead(404); res.end();
}).listen(8799, () => console.log("mock on :8799"));
