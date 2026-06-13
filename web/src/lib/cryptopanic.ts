const BASE_URL = "https://cryptopanic.com/api/v1";

export type CryptoPanicCurrency = {
  code: string;
  title: string;
};

export type CryptoPanicPost = {
  id: number;
  title: string;
  url: string;
  published_at: string;
  source?: { title?: string; domain?: string };
  currencies?: CryptoPanicCurrency[];
};

type CryptoPanicResponse = {
  results?: CryptoPanicPost[];
};

function getApiKey(): string {
  const key = process.env.CRYPTOPANIC_API_KEY;
  if (!key) throw new Error("CRYPTOPANIC_API_KEY is not configured");
  return key;
}

export async function getCryptoPanicPosts(options?: {
  currencies?: string[];
  filter?: "rising" | "hot" | "bullish" | "bearish" | "important" | "lol";
  kind?: "news" | "media" | "all";
}): Promise<CryptoPanicPost[]> {
  const params = new URLSearchParams({
    auth_token: getApiKey(),
    public: "true",
    kind: options?.kind ?? "news",
  });

  if (options?.filter) params.set("filter", options.filter);
  if (options?.currencies?.length) params.set("currencies", options.currencies.join(","));

  const res = await fetch(`${BASE_URL}/posts/?${params}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`CryptoPanic API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as CryptoPanicResponse;
  return json.results ?? [];
}
