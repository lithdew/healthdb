import {
  Aptos,
  AptosConfig,
  Network,
  type ClientRequest,
} from "@aptos-labs/ts-sdk";

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

const aptos = new Aptos(config);

const moduleAddress =
  "0x3f29e3c1990daec326eb7a210cb7b30fe1369d5c3a44b27870c782508fea93e1";

const [module] = await aptos.getAccountModules({
  accountAddress: moduleAddress,
});

if (module === undefined || module.abi === undefined) {
  throw new Error(`Module not found for address ${moduleAddress}`);
}

await Bun.write(
  "./abi.ts",
  `export const ABI = ${JSON.stringify(module.abi, null, 2)} as const`
);

console.log("Done!");
