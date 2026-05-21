import path from "node:path";
import { pathToFileURL } from "node:url";

import { createCli } from "./cli.js";
import { formatError } from "./errors.js";

export {
  addBundleToStore,
  deleteBundleFromStore,
  listBundleStore,
  packBundle,
  packBundleToStore,
  publishBundle,
  resolveBundleFromStore,
  validateBundlePath,
  type PackBundleInput,
  type PackBundleToStoreInput,
  type PackBundleToStoreResult,
  type PublishBundleInput,
  type PublishBundleResult,
  type StoreBundleInput,
} from "./operations.js";

export { createCli };

export async function main(): Promise<void> {
  createCli().parse();
}

if (process.argv[1] != null && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main().catch((error) => {
    process.stderr.write(`${formatError(error)}\n`);
    process.exit(1);
  });
}
