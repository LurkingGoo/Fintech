import { Client } from "xrpl";

let clientSingleton: Client | null = null;
let connectInFlight: Promise<void> | null = null;

export function getXrplClient(): Client {
  if (clientSingleton) return clientSingleton;

  const endpoint =
    process.env.NEXT_PUBLIC_XRPL_TESTNET_ENDPOINT ??
    "wss://s.altnet.rippletest.net:51233";

  clientSingleton = new Client(endpoint);
  return clientSingleton;
}

export async function ensureXrplConnected(client: Client): Promise<void> {
  if (client.isConnected()) return;

  if (!connectInFlight) {
    connectInFlight = client
      .connect()
      .then(() => {
        connectInFlight = null;
      })
      .catch((error) => {
        connectInFlight = null;
        throw error;
      });
  }

  await connectInFlight;
}
