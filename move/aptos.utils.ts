import {
  PrivateKey,
  PrivateKeyVariants,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import { $ } from "bun";
import { z } from "zod";

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

export async function getProfile(profileName: string) {
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

export async function getProfilePrivateKey(profileName: string) {
  const result =
    await $`aptos config show-private-key --profile ${profileName}`.json();
  const parsed = z.object({ Result: z.string() }).parse(result);
  const privateKey = PrivateKey.formatPrivateKey(
    parsed.Result,
    PrivateKeyVariants.Ed25519
  );
  return new Ed25519PrivateKey(privateKey);
}
