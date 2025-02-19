import { surf } from "./aptos";

import { Ed25519Account } from "@aptos-labs/ts-sdk";
import { getProfile, getProfilePrivateKey } from "./aptos.utils";

const ADDRESS = `0xa73a87737fa2b1510b32a59709640de12e249361429e67c86d7e7c51b25240d4`;
const AMOUNT = 100n * 1_000_000_000n;

const profile = await getProfile("default");
const privateKey = await getProfilePrivateKey(profile.name);

const account = new Ed25519Account({
  privateKey,
  address: `0x${profile.data.account}`,
});

console.log(account.accountAddress.toString());

const response = await surf.entry.mint({
  typeArguments: [],
  functionArguments: [ADDRESS, AMOUNT],
  account,
});

console.dir(response, { depth: Infinity });
