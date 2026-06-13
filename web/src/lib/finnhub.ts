const BASE_URL = "https://finnhub.io/api/v1";

export type FinnhubNewsArticle = {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
};

function getApiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY is not configured");
  return key;
}

export function finnhubDateRange(days = 7): { from: string; to: string } {
  const to = new Date();
  const from = new Date(Date.now() - days * 86_400_000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export async function getFinnhubCompanyNews(
  ticker: string,
  from?: string,
  to?: string,
): Promise<FinnhubNewsArticle[]> {
  const range = finnhubDateRange(7);
  const start = from ?? range.from;
  const end = to ?? range.to;
  const symbol = ticker.toUpperCase();

  const url = `${BASE_URL}/company-news?symbol=${symbol}&from=${start}&to=${end}&token=${getApiKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Finnhub API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as FinnhubNewsArticle[] | { error?: string };
  if (!Array.isArray(json)) {
    throw new Error(typeof json === "object" && json && "error" in json ? String(json.error) : "Finnhub API error");
  }
  return json;
}
