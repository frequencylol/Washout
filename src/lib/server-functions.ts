import { createServerFn } from "@tanstack/react-start";

const PUMP_IPFS = "https://pump.fun/api/ipfs";

export interface IpfsResponse {
  metadataUri: string;
  metadata: { name: string; symbol: string; image: string };
}

export const uploadMetadataServer = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }) => {
    const response = await fetch(PUMP_IPFS, {
      method: "POST",
      body: data,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`IPFS upload failed: ${response.status} ${text}`);
    }

    return response.json() as Promise<IpfsResponse>;
  });
