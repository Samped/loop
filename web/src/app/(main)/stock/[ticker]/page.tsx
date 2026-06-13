import { StockDetail } from "@/components/StockDetail";

type Props = { params: Promise<{ ticker: string }> };

export default async function StockPage({ params }: Props) {
  const { ticker } = await params;
  return <StockDetail ticker={ticker} />;
}
