// Network constants for Celo mainnet and Celo Sepolia. Everything else reads from here.
import { getAddress } from "viem";

export const NETWORKS = {
  celo: {
    name: "celo",
    chainId: 42220,
    caip2: "eip155:42220",
    rpc: process.env.CELO_RPC || "https://forno.celo.org",
    explorer: "https://celoscan.io",
    identityRegistry: getAddress("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"),
    reputationRegistry: getAddress("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"),
    tokens: {
      USDT: { address: getAddress("0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"), decimals: 6 },
      USDC: { address: getAddress("0xcebA9300f2b948710d2653dD7B07f33A8B32118C"), decimals: 6 },
      USAT: { address: getAddress("0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771"), decimals: 6 },
    },
  },
  "celo-sepolia": {
    name: "celo-sepolia",
    chainId: 11142220,
    caip2: "eip155:11142220",
    rpc: process.env.CELO_SEPOLIA_RPC || "https://forno.celo-sepolia.celo-testnet.org",
    explorer: "https://sepolia.celoscan.io",
    identityRegistry: getAddress("0x8004A818BFB912233c491871b3d84c89A494BD9e"),
    reputationRegistry: getAddress("0x8004B663056A597Dffe9eCcC1965A193B7388713"),
    tokens: {
      USDC: { address: getAddress("0x01C5C0122039549AD1493B8220cABEdD739BC44E"), decimals: 6 },
    },
  },
};

export function network(name = process.env.SPENDGUARD_NETWORK || "celo") {
  const n = NETWORKS[name];
  if (!n) throw new Error(`unknown network ${name} (use celo or celo-sepolia)`);
  return n;
}

// buy (usebuy.ai) gateway: Celo Core Co.'s agent service marketplace. Paid per request over x402.
export const BUY_GATEWAY = "https://gateway.usebuy.ai";

// ERC-8021 attribution code issued by Loops House at enrollment. Every tx we send carries it.
export function attributionCode() {
  const c = process.env.SPENDGUARD_ATTRIBUTION_CODE || "";
  if (c && !/^[a-z0-9_]{1,32}$/.test(c)) throw new Error("SPENDGUARD_ATTRIBUTION_CODE must be lowercase letters, digits, underscores (max 32)");
  return c;
}
