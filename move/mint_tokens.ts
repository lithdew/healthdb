import { surf } from "./aptos";

import {
  Ed25519Account,
  Ed25519PrivateKey,
  PrivateKey,
  PrivateKeyVariants,
} from "@aptos-labs/ts-sdk";
import { $ } from "bun";
import { z } from "zod";

const ACCOUNT =
  "0xa73a87737fa2b1510b32a59709640de12e249361429e67c86d7e7c51b25240d4";
const AMOUNT = 100n * 1_000_000_000n;

const profileSchema = z.object({
  has_private_key: z.boolean(),
  public_key: z.string(),
  private_key: z.string().optional(),
  account: z.string(),
  rest_url: z.string(),
});

const showProfileResultSchema = z.object({
  Result: z.record(z.string(), profileSchema),
});

async function getProfile(profileName: string) {
  const result = await $`aptos config show-profiles`.json();
  const profiles = showProfileResultSchema.parse(result);
  const profile = profiles.Result["default"];
  if (profile === undefined) {
    throw new Error("Profile not found");
  }
  if (!profile.has_private_key) {
    throw new Error("Profile does not have a private key");
  }

  return { name: profileName, data: profile };
}

async function getProfilePrivateKey(profileName: string) {
  const result =
    await $`aptos config show-private-key --profile ${profileName}`.json();
  const parsed = z.object({ Result: z.string() }).parse(result);
  const privateKey = PrivateKey.formatPrivateKey(
    parsed.Result,
    PrivateKeyVariants.Ed25519
  );
  return new Ed25519PrivateKey(privateKey);
}

const profile = await getProfile("default");
const privateKey = await getProfilePrivateKey(profile.name);

const account = new Ed25519Account({
  privateKey,
  address: `0x${profile.data.account}`,
});

console.log(account.accountAddress.toString());

const response = await surf.entry.mint({
  typeArguments: [],
  functionArguments: [ACCOUNT, AMOUNT],
  account,
});

console.dir(response, { depth: Infinity });
