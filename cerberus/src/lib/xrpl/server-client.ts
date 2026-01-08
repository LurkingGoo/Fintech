import { Client } from "xrpl";

let serverClientSingleton: Client | null = null;

function getEndpoint(): string {
  // Explicitly default to XRPL Testnet WS endpoint required by spec.
  return process.env.XRPL_WS_URL || "wss://s.altnet.rippletest.net:51233";
}

export function getServerXrplClient(): Client {
  if (serverClientSingleton) return serverClientSingleton;
  serverClientSingleton = new Client(getEndpoint(), { connectionTimeout: 20000 });
  return serverClientSingleton;
}

export async function ensureServerXrplConnected(): Promise<Client> {
  const client = getServerXrplClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  return client;
}
