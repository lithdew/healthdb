import { ABI } from "./abi";
import { aptos } from "./aptos";

const [module] = await aptos.getAccountModules({
  accountAddress:
    "0xb37472066d5c19a3815b265357bb1b3e1d7825685c05b22c08707ecbac6b1a64",
});

if (module === undefined || module.abi === undefined) {
  throw new Error(`Module not found for address ${ABI.address}`);
}

await Bun.write(
  "./abi.ts",
  `export const ABI = ${JSON.stringify(module.abi, null, 2)} as const`
);

console.log("Done!");
