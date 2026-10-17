// 信源列表：RSS / Atom。抓取失败的源会在报告末尾列出，按需增删。
export interface Source {
  name: string;
  url: string;
  firstParty?: boolean; // 一手来源（厂商/项目官方）
}

export const SOURCES: Source[] = [
  // —— AI Infra：芯片、推理引擎、集群 ——
  { name: "NVIDIA Blog", url: "https://blogs.nvidia.com/feed/", firstParty: true },
  { name: "NVIDIA Developer", url: "https://developer.nvidia.com/blog/feed/", firstParty: true },
  { name: "vLLM Blog", url: "https://vllm.ai/blog/rss.xml", firstParty: true },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", firstParty: true },
  { name: "PyTorch Blog", url: "https://pytorch.org/blog/feed/", firstParty: true },
  { name: "Kubernetes Blog", url: "https://kubernetes.io/feed.xml", firstParty: true },
  { name: "CNCF Blog", url: "https://www.cncf.io/feed/", firstParty: true },
  { name: "AWS ML Blog", url: "https://aws.amazon.com/blogs/machine-learning/feed/", firstParty: true },
  { name: "Google Research", url: "https://research.google/blog/rss/", firstParty: true },
  { name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", firstParty: true },
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml", firstParty: true },
  { name: "SemiAnalysis", url: "https://newsletter.semianalysis.com/feed" },
  { name: "ServeTheHome", url: "https://www.servethehome.com/feed/" },
  { name: "The Next Platform", url: "https://www.nextplatform.com/feed/" },
  // —— 项目发版（GitHub Releases）——
  { name: "vLLM Releases", url: "https://github.com/vllm-project/vllm/releases.atom", firstParty: true },
  { name: "SGLang Releases", url: "https://github.com/sgl-project/sglang/releases.atom", firstParty: true },
  { name: "NCCL Releases", url: "https://github.com/NVIDIA/nccl/releases.atom", firstParty: true },
  { name: "HAMi Releases", url: "https://github.com/Project-HAMi/HAMi/releases.atom", firstParty: true },
  // —— AI 商业化 / 行业新闻 ——
  { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { name: "The Decoder", url: "https://the-decoder.com/feed/" },
  { name: "Ars Technica AI", url: "https://arstechnica.com/ai/feed/" },
  // —— 中文 ——
  { name: "量子位", url: "https://www.qbitai.com/feed" },
  { name: "36氪", url: "https://36kr.com/feed" },
  // —— 社区热度（Hacker News 关键词，50 分以上）——
  {
    name: "Hacker News",
    url: "https://hnrss.org/newest?points=50&q=GPU+OR+vLLM+OR+inference+OR+CUDA+OR+NVIDIA+OR+RDMA+OR+LLM",
  },
];
