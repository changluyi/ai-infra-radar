import type { GlmEnv } from "./glm";
import type { TgEnv } from "./telegram";
import type { XEnv } from "./x";

export interface Env extends GlmEnv, TgEnv, XEnv {
  DB: D1Database;
  SITE_NAME?: string;     // 站点名
  SITE_URL?: string;      // 例如 https://radar.example.com，用于推送里的链接和 RSS
  RUN_TOKEN?: string;
  MIN_SCORE?: string;     // 进入精选的分数线
  BATCH_SIZE?: string;    // 每次处理多少条新条目
  AUTO_POST?: string;     // "true" 时日报第一条推文、周报 thread 自动发到 X
  SOURCES_JSON?: string;  // 可选：用 JSON 覆盖信源列表（本地测试用）
}

export const siteName = (env: Env) => env.SITE_NAME || "AI Infra 雷达";
export const minScore = (env: Env) => Number(env.MIN_SCORE || 60);

const SH = 8 * 3600 * 1000;
export const shDate = (t = Date.now()) => new Date(t + SH).toISOString().slice(0, 10);
export const shTime = (t: number) => new Date(t + SH).toISOString().slice(11, 16);
/** 上海时区某天 00:00 的时间戳 */
export const shDayStart = (date: string) => Date.parse(`${date}T00:00:00Z`) - SH;

/** ISO 周，例如 2026-W42，以及这一周（上海时区）周一的日期 */
export function isoWeek(date: string): { key: string; monday: string } {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // 周一=0
  const monday = new Date(d.getTime() - day * 86400000);
  const thursday = new Date(monday.getTime() + 3 * 86400000);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / 86400000 + 1) / 7);
  return { key: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`, monday: monday.toISOString().slice(0, 10) };
}

export async function hashId(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("");
}
