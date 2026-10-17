// 智谱 GLM（OpenAI 兼容接口）
export interface GlmEnv {
  GLM_API_KEY: string;
  GLM_MODEL?: string;
  GLM_BASE_URL?: string;
}

export async function glmJson<T>(env: GlmEnv, system: string, user: string, retries = 2): Promise<T> {
  const base = env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GLM_API_KEY}` },
        body: JSON.stringify({
          model: env.GLM_MODEL || "glm-4.6",
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`GLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data: any = await res.json();
      const text: string = data?.choices?.[0]?.message?.content ?? "";
      return parseJsonLoose<T>(text);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

export function parseJsonLoose<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(cleaned.slice(s, e + 1)) as T;
    throw new Error(`GLM 返回的不是 JSON：${cleaned.slice(0, 200)}`);
  }
}
