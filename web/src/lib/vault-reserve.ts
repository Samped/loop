import { createPublicClient, formatUnits, http } from "viem";
import { arcTestnet } from "@/lib/arc-chain";
import { getStockVaultAddress } from "@/lib/config";
import { stockVaultAbi } from "@/lib/contracts/stock-vault";

export type VaultReserveStatus = {
  configured: boolean;
  reserveUsdc: number;
  liabilities: number;
  reserveRatioPct: number;
  solvent: boolean;
  message: string;
};

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

export async function getVaultReserveStatus(): Promise<VaultReserveStatus> {
  const vault = getStockVaultAddress();
  if (!vault) {
    return {
      configured: false,
      reserveUsdc: 0,
      liabilities: 0,
      reserveRatioPct: 0,
      solvent: true,
      message: "StockVault not configured",
    };
  }

  try {
    const [reserveRaw, liabilitiesRaw, solvent] = await Promise.all([
      client.readContract({
        address: vault,
        abi: stockVaultAbi,
        functionName: "reserveBalance",
      }),
      client.readContract({
        address: vault,
        abi: stockVaultAbi,
        functionName: "totalLiabilities",
      }),
      client.readContract({
        address: vault,
        abi: stockVaultAbi,
        functionName: "isSolvent",
      }),
    ]);

    const reserveUsdc = Number(formatUnits(reserveRaw, 6));
    const liabilities = Number(formatUnits(liabilitiesRaw, 6));
    const reserveRatioPct = liabilities === 0 ? 100 : (reserveUsdc / liabilities) * 100;

    return {
      configured: true,
      reserveUsdc,
      liabilities,
      reserveRatioPct,
      solvent,
      message: solvent
        ? "USDC-reserved synthetic vault on Arc"
        : "Vault undercollateralized — deposits needed after price updates",
    };
  } catch {
    return {
      configured: true,
      reserveUsdc: 0,
      liabilities: 0,
      reserveRatioPct: 0,
      solvent: false,
      message: "Vault reserve unavailable",
    };
  }
}
