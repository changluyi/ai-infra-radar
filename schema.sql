-- 所有抓到的条目
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,            -- 链接哈希
  link TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  first_party INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL,     -- ms；未知时用抓取时间
  fetched_at INTEGER NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',  -- new | kept | dropped | error
  score INTEGER,
  category TEXT,
  title_zh TEXT,
  summary TEXT,
  reason TEXT,
  unverified TEXT,                -- 摘要里在原文找不到的数字，逗号分隔
  story_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status, fetched_at);
CREATE INDEX IF NOT EXISTS idx_items_story ON items(story_id);

-- 事件：同一件事的多篇报道合并到一个 story
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  score INTEGER NOT NULL,
  lead_item TEXT NOT NULL,        -- 代表条目（优先一手来源）
  item_count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stories_updated ON stories(updated_at);

-- 日报 / 周报
CREATE TABLE IF NOT EXISTS digests (
  kind TEXT NOT NULL,             -- daily | weekly
  key TEXT NOT NULL,              -- 2026-10-17 | 2026-W42
  issue INTEGER NOT NULL,
  data TEXT NOT NULL,             -- JSON
  created_at INTEGER NOT NULL,
  PRIMARY KEY (kind, key)
);
