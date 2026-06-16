import { PerpDetail } from "@/components/PerpDetail";

type Props = { params: Promise<{ ticker: string }> };

export default async function PerpTickerPage({ params }: Props) {
  const { ticker } = await params;
  return <PerpDetail ticker={ticker} />;
}
