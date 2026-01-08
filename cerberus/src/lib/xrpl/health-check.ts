import { getXrplClient } from "@/lib/xrpl/client";

export async function xrplHealthCheck() {
  const client = getXrplClient();

  if (!client.isConnected()) {
    await client.connect();
  }

  const resp = await client.request({ command: "server_info" });
  return resp.result;
}
