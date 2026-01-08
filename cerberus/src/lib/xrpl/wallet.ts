import type { Client, Wallet } from "xrpl";

export async function generateAndFundWallet(client: Client): Promise<Wallet> {
  if (!client.isConnected()) {
    await client.connect();
  }

  const { wallet, balance } = await client.fundWallet();

  console.log("[Cerberus] Funded Testnet wallet", {
    address: wallet.classicAddress,
    balance,
  });

  return wallet;
}
