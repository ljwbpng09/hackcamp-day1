import {
  createPublicClient,
  formatEther,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";

const ETH_USD_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

const aggregatorAbi = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

type WalletTarget = {
  label: string;
  ens?: string;
  address?: Address;
};

type WalletRow = {
  label: string;
  address: string;
  balance: string;
  value: string;
};

const WALLETS: WalletTarget[] = [
  { label: "vitalik.eth", ens: "vitalik.eth" },
  { label: "binance7.eth", ens: "binance7.eth" },
  {
    label: "Beacon Deposit",
    address: "0x00000000219ab540356cBB839Cbe05303d7705Fa",
  },
];

function boxLine(content: string, innerWidth: number): void {
  console.log(`  │ ${content.padEnd(innerWidth)}│`);
}

function formatUsdValue(balanceEth: number, usdPrice: number | null): string {
  if (usdPrice === null) {
    return "N/A";
  }
  return `~ $${(balanceEth * usdPrice).toFixed(2)}`;
}

function formatTable(rows: WalletRow[]): string[] {
  const labelWidth = Math.max(
    "Label".length,
    ...rows.map((row) => row.label.length),
  );
  const addressWidth = Math.max(
    "Address".length,
    ...rows.map((row) => row.address.length),
  );
  const balanceWidth = Math.max(
    "Balance".length,
    ...rows.map((row) => row.balance.length),
  );
  const valueWidth = Math.max(
    "Value".length,
    ...rows.map((row) => row.value.length),
  );

  const formatRow = (label: string, address: string, balance: string, value: string) =>
    `${label.padEnd(labelWidth)}  ${address.padEnd(addressWidth)}  ${balance.padEnd(balanceWidth)}  ${value.padEnd(valueWidth)}`;

  return [
    formatRow("Label", "Address", "Balance", "Value"),
    `${"-".repeat(labelWidth)}  ${"-".repeat(addressWidth)}  ${"-".repeat(balanceWidth)}  ${"-".repeat(valueWidth)}`,
    ...rows.map((row) => formatRow(row.label, row.address, row.balance, row.value)),
  ];
}

async function fetchEthUsdPrice(client: PublicClient): Promise<number | null> {
  try {
    const [, answer] = await client.readContract({
      address: ETH_USD_FEED,
      abi: aggregatorAbi,
      functionName: "latestRoundData",
    });
    return Number(answer) / 1e8;
  } catch (error) {
    console.error("Chainlink price feed failed:", error);
    return null;
  }
}

async function resolveAddress(
  client: PublicClient,
  target: WalletTarget,
): Promise<Address | null> {
  if (target.address) {
    return target.address;
  }

  if (!target.ens) {
    console.error(`No address or ENS configured for ${target.label}`);
    return null;
  }

  try {
    const address = await client.getEnsAddress({ name: target.ens });
    if (!address) {
      console.error(`ENS resolution returned empty for ${target.ens}`);
      return null;
    }
    return address;
  } catch (error) {
    console.error(`ENS resolution failed for ${target.ens}:`, error);
    return null;
  }
}

async function fetchWalletRow(
  client: PublicClient,
  target: WalletTarget,
  usdPrice: number | null,
): Promise<WalletRow | null> {
  const address = await resolveAddress(client, target);
  if (!address) {
    return null;
  }

  try {
    const balance = await client.getBalance({ address });
    const balanceEth = Number.parseFloat(formatEther(balance));

    return {
      label: target.label,
      address,
      balance: `${balanceEth.toFixed(4)} ETH`,
      value: formatUsdValue(balanceEth, usdPrice),
    };
  } catch (error) {
    console.error(`Balance query failed for ${target.label} (${address}):`, error);
    return null;
  }
}

const client = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com"),
});

const usdPrice = await fetchEthUsdPrice(client);

const rows: WalletRow[] = [];
for (const wallet of WALLETS) {
  const row = await fetchWalletRow(client, wallet, usdPrice);
  if (row) {
    rows.push(row);
  }
}

if (rows.length === 0) {
  console.error("No wallet data available.");
  process.exit(1);
}

const tableLines = formatTable(rows);
const innerWidth = Math.max(...tableLines.map((line) => line.length));
const border = "─".repeat(innerWidth + 1);

console.log(`  ╭${border}╮`);
boxLine(" Day 1 · On-chain Hello World", innerWidth);
console.log(`  ├${border}┤`);
for (const line of tableLines) {
  boxLine(` ${line}`, innerWidth);
}
console.log(`  ╰${border}╯`);
