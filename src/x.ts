// X (Twitter) API v2 发推，OAuth 1.0a 用户上下文签名
export interface XEnv {
  X_API_KEY?: string;
  X_API_SECRET?: string;
  X_ACCESS_TOKEN?: string;
  X_ACCESS_SECRET?: string;
}

export function hasXCreds(env: XEnv): boolean {
  return !!(env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET);
}

// 按 twitter-text 的权重规则计算长度：大部分拉丁字符算 1，中日韩等算 2，上限 280
export function tweetLength(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const light = c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247);
    n += light ? 1 : 2;
  }
  return n;
}

const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function oauthHeader(env: XEnv, method: string, url: string, nonce?: string, ts?: string): Promise<string> {
  const params: Record<string, string> = {
    oauth_consumer_key: env.X_API_KEY!,
    oauth_nonce: nonce ?? crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: ts ?? Math.floor(Date.now() / 1000).toString(),
    oauth_token: env.X_ACCESS_TOKEN!,
    oauth_version: "1.0",
  };
  const paramStr = Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join("&");
  const base = [method.toUpperCase(), enc(url), enc(paramStr)].join("&");
  const signature = await hmacSha1Base64(`${enc(env.X_API_SECRET!)}&${enc(env.X_ACCESS_SECRET!)}`, base);
  const all = { ...params, oauth_signature: signature };
  return "OAuth " + Object.keys(all).sort().map((k) => `${enc(k)}="${enc((all as any)[k])}"`).join(", ");
}

export async function postTweet(env: XEnv, text: string, replyTo?: string): Promise<string> {
  const url = "https://api.x.com/2/tweets";
  const payload: Record<string, unknown> = { text };
  if (replyTo) payload.reply = { in_reply_to_tweet_id: replyTo };
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: await oauthHeader(env, "POST", url), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X API ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body?.data?.id as string;
}
