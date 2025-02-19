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

  const request = {
    headers,
    body: JSON.stringify(body),
    method,
  };

  let path = url;
  if (params !== null || params !== undefined) {
    path = `${url}?${params}`;
  }

  const response = await fetch(path, request);
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
    provider: fetchClient,
  },
  clientConfig: {
    API_KEY: process.env.APTOS_API_KEY_TESTNET,
  },
});

export const aptos = new Aptos(config);
export const surf = createSurfClient(aptos).useABI(ABI);
