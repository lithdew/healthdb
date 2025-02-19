import { surf } from "./aptos";

import {
  Ed25519Account,
  Ed25519PublicKey,
  Ed25519Signature,
} from "@aptos-labs/ts-sdk";
import { getProfile, getProfilePrivateKey } from "./aptos.utils";

const USER_ADDRESS = `0xa73a87737fa2b1510b32a59709640de12e249361429e67c86d7e7c51b25240d4`;
const USER_PUBLIC_KEY = `0xa1233daa796b269e4fccb81acb8eb6e6df66e46936d31bf56845892aa6266931`;
const USER_SIGNATURE = `0x6d25cc43af3c617a5b57a494e493b801e7770e45fc4ce6cdabc7d0782e3e1caaca1a6710cde94eff9cf2712f1e49ea2f8a9cdec978e7d36558bdb728d095dc0f`;
const AMOUNT = 10n * 1_000_000_000n;

const profile = await getProfile("default");
const privateKey = await getProfilePrivateKey(profile.name);

const account = new Ed25519Account({
  privateKey,
  address: `0x${profile.data.account}`,
});

console.log(account.accountAddress.toString());

console.log(new Ed25519PublicKey(USER_PUBLIC_KEY).toUint8Array().byteLength);

const response = await surf.entry.acknowledge_receipt({
  typeArguments: [],
  functionArguments: [
    USER_ADDRESS,
    0,
    new Ed25519PublicKey(USER_PUBLIC_KEY).toUint8Array(),
    account.accountAddress.toString(),
    new Ed25519Signature(USER_SIGNATURE).toUint8Array(),
    AMOUNT,
  ],
  account,
  // isSimulation: true,
});

console.dir(response, { depth: Infinity });
