# AI Infra 雷达

参照 news.coderfather.com 的做法，做一个 AI Infra 方向的全自动资讯站。全部跑在 Cloudflare Workers + D1 上。

- **每 30 分钟**：抓取信源 → GLM 判断是否相关、写中文标题、摘要和推荐理由、打分 → 同一件事的多篇报道合并成一个事件 → 摘要里的数字与原文对照，对不上的会标出来
- **每天 08:00**：生成日报（导语、今日看点、分版块、学习选题、3 条推文草稿），推送到 Telegram
- **每周一 08:00**：生成上一周的周报（按本周主题分版块、本周观察、学习任务、thread 草稿）
- **网页**：`/` 精选和当前热点，`/story/:id` 事件和报道时间线，`/daily`、`/daily/archive`、`/weekly`、`/about`，以及 `/feed.xml`

## 部署到 Railway（推荐，Hobby 套餐自带 $5 用量，够用）

同一套代码，`src/node/` 用 SQLite 模拟 D1，Node 进程里自己跑定时任务。

1. 把这个目录推到你的 GitHub 私有仓库
2. Railway → New Project → Deploy from GitHub repo，选这个仓库（会读 `railway.json`，启动命令 `npm start`）
3. 服务 → Settings → **Volumes** → Add Volume，挂载路径填 `/data`
4. 服务 → **Variables** 添加：
   ```
   DATA_DIR=/data
   GLM_API_KEY=你的智谱 Key
   GLM_MODEL=glm-4.6
   RUN_TOKEN=随便一串
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=...
   MIN_SCORE=60
   ```
5. 服务 → Settings → Networking → **Generate Domain**，拿到网址后加一个变量 `SITE_URL=https://xxx.up.railway.app`
6. 确认 Settings 里 **Serverless（App Sleeping）是关的**，否则进程休眠，定时任务不会跑

部署后手动跑一次：

```bash
BASE=https://xxx.up.railway.app
curl -X POST -H "Authorization: Bearer <RUN_TOKEN>" $BASE/run/tick    # 每次处理 30 条，积压多就多跑几次
curl -X POST -H "Authorization: Bearer <RUN_TOKEN>" $BASE/run/daily
```

本地用 Node 跑：`DATA_DIR=./data GLM_API_KEY=... RUN_TOKEN=t npm start`，打开 http://localhost:8080

## 部署到 Cloudflare Workers（备选）

```bash
npm install
npx wrangler login
npx wrangler d1 create ai-infra-radar          # 把输出的 database_id 填进 wrangler.toml
npx wrangler d1 execute ai-infra-radar --remote --file schema.sql
npx wrangler secret put GLM_API_KEY
npx wrangler secret put RUN_TOKEN              # 随便一串，用于手动触发
npx wrangler secret put TELEGRAM_BOT_TOKEN     # @BotFather 建 bot
npx wrangler secret put TELEGRAM_CHAT_ID       # 给 bot 发条消息，再看 https://api.telegram.org/bot<TOKEN>/getUpdates
npx wrangler deploy
```

> Workers 免费版每次运行只有 10ms CPU，解析 20 多个 RSS 大概率超限，建议开 Workers Paid（$5/月）。D1 免费额度够用。

部署后手动跑一遍，不用等定时：

```bash
BASE=https://ai-infra-radar.<你的子域>.workers.dev
curl -X POST -H "Authorization: Bearer <RUN_TOKEN>" $BASE/run/tick     # 抓取+处理，可连续跑几次把积压处理完
curl -X POST -H "Authorization: Bearer <RUN_TOKEN>" $BASE/run/daily    # 立刻出一期日报
```

绑定自己的域名后，把 `SITE_URL` 填上，推送和 RSS 里的链接会用它。

## 本地联调

`dev/mock.mjs` 提供假信源和假 GLM，不花钱、不联网就能跑通整条链路：

```bash
node dev/mock.mjs &                                   # 端口 8799
npx wrangler d1 execute ai-infra-radar --local --file schema.sql
npx wrangler dev --test-scheduled                      # 读 .dev.vars
curl -X POST -H "Authorization: Bearer t" localhost:8787/run/tick
curl -X POST -H "Authorization: Bearer t" localhost:8787/run/daily
```

`.dev.vars` 示例：

```
GLM_API_KEY=dummy
GLM_BASE_URL=http://127.0.0.1:8799/glm
RUN_TOKEN=t
SOURCES_JSON=[{"name":"Vendor Blog","url":"http://127.0.0.1:8799/feed/vendor.xml","firstParty":true},{"name":"Some News","url":"http://127.0.0.1:8799/feed/news.xml"}]
```

把 `GLM_BASE_URL` 去掉、填真 Key、删掉 `SOURCES_JSON`，就是用真信源在本地跑。

## 自动发推

1. developer.x.com 建 App，权限 Read and Write，生成 API Key/Secret 和 Access Token/Secret
2. 设置 secret：`X_API_KEY`、`X_API_SECRET`、`X_ACCESS_TOKEN`、`X_ACCESS_SECRET`
3. `AUTO_POST = "true"`，重新部署

开启后：日报第一条推文自动发，周报 thread 整串自动发。超过 280 字符的不发，Telegram 里会标出来。发推额度和费用以 X 开发者后台为准。

## 常用调整

| 想改的 | 在哪改 |
|---|---|
| 信源 | `src/sources.ts` |
| 收录标准、摘要要求、推文风格 | `src/prompts.ts` |
| 分类 | `src/prompts.ts` 的 `CATEGORIES` |
| 精选分数线 | `MIN_SCORE` |
| 每次处理条数 | `BATCH_SIZE`（GLM 调用量随之变化） |
| 页面样式 | `src/web.ts` 顶部的 `CSS` |
