import {
  type ClientRequest,
  Aptos,
  AptosConfig,
  Network,
} from "@aptos-labs/ts-sdk";
import { createSurfClient } from "@thalalabs/surf";
import { ABI } from "./abi";

async function fetchClient<Req>(requestOptions: ClientRequest<Req>) {
  const { params, method, url, headers, body } = requestOptions;

  let path = url;
  if (params !== null || params !== undefined) {
    path = `${url}?${params}`;
  }

  const request = new Request(path, {
    method,
    headers,
    body:
      headers?.["content-type"] === "application/x.aptos.signed_transaction+bcs"
        ? (body as BodyInit)
        : JSON.stringify(body),
  });

  const response = await fetch(request);
  const data = await response.json();

  return {
    status: response.status,
    statusText: response.statusText,
    data,
    headers: response.headers,
    config: response,
    request,
  };
}

const config = new AptosConfig({
  network: Network.TESTNET,
  client: {
    provider: (opts) => fetchClient(opts),
    binaryProvider: (opts) => fetchClient(opts),
  },
  clientConfig: {
    API_KEY: process.env.VITE_APTOS_API_KEY_TESTNET,
  },
});

export const aptos = new Aptos(config);
export const surf = createSurfClient(aptos).useABI(ABI);
