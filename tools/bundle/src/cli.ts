import path from "node:path";

import { cac } from "cac";
import {
  type BundleArtifact,
  type BundleEntry,
  type BundlePublicationResolved,
  type BundleResolved,
} from "@open-design/bundle";

import { DAEMON_BUNDLE_KEY, WEB_BUNDLE_KEY } from "./apps.js";
import {
  addBundleToStore,
  deleteBundleFromStore,
  listBundleStore,
  packBundle,
  packBundleToStore,
  publishBundle,
  requireOption,
  resolveBundleFromStore,
  validateBundlePath,
  type PackBundleToStoreResult,
  type PublishBundleResult,
} from "./operations.js";

type JsonOption = {
  json?: boolean;
};

type BasePathOption = JsonOption & {
  bundleBasePath?: string;
};

type KeyOption = {
  key?: string;
};

type PackOptions = JsonOption & {
  bundleBasePath?: string;
  bundleVersion?: string;
  epoch?: string;
  key?: string;
  out?: string;
  replace?: boolean;
  replaceOutput?: boolean;
  replaceStore?: boolean;
  version?: string;
};

type AddOptions = BasePathOption & KeyOption & {
  replace?: boolean;
  version?: string;
};

type RefOptions = BasePathOption & KeyOption;

type PublishOptions = JsonOption & KeyOption & {
  bundleBasePath?: string;
  bundleVersion?: string;
  channel?: string;
  displayVersion?: string;
  pathKey?: string;
  platform?: string;
  publicationVersion?: string;
  registryBasePath?: string;
  summary?: string;
  tag?: string;
  title?: string;
  version?: string;
};

function output(payload: unknown, options: JsonOption, heading: string): void {
  if (options.json === true) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${heading}\n`);
  if (isBundleArtifact(payload)) {
    process.stdout.write(`bundle: ${payload.bundlePath}\n`);
    process.stdout.write(`descriptor: ${payload.descriptorPath}\n`);
    process.stdout.write(`entry: ${payload.descriptor.entry.kind} ${payload.entryPath}\n`);
    return;
  }
  if (isBundleResolved(payload)) {
    process.stdout.write(`bundle: ${payload.ref.key}@${payload.ref.version}\n`);
    process.stdout.write(`path: ${payload.path}\n`);
    process.stdout.write(`metadata: ${payload.metadataPath}\n`);
    return;
  }
  if (isStoredPackResult(payload)) {
    process.stdout.write(`bundle: ${payload.ref.key}@${payload.ref.version}\n`);
    process.stdout.write(`path: ${payload.resolved.path}\n`);
    process.stdout.write(`entry: ${payload.artifact.descriptor.entry.kind} ${payload.artifact.entryPath}\n`);
    process.stdout.write(`metadata: ${payload.resolved.metadataPath}\n`);
    return;
  }
  if (isPublishResult(payload)) {
    process.stdout.write(`publication: ${payload.publication.bundle.key}\n`);
    process.stdout.write(`channel: ${payload.publication.metadata.channel}\n`);
    process.stdout.write(`version: ${payload.publication.metadata.version}\n`);
    process.stdout.write(`raw: ${payload.raw.ref.key}@${payload.raw.ref.version}\n`);
    process.stdout.write(`path: ${payload.versioned.paths.publicationPath}\n`);
    if (payload.tagged != null) {
      process.stdout.write(`tag: ${payload.tagged.paths.publicationPath}\n`);
    }
    return;
  }
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      process.stdout.write("(no bundles)\n");
      return;
    }
    for (const entry of payload) {
      const bundle = entry as BundleEntry;
      process.stdout.write(`- ${bundle.ref.key}@${bundle.ref.version} · ${bundle.path}\n`);
    }
    return;
  }
  if (typeof payload === "boolean") {
    process.stdout.write(`deleted: ${payload ? "yes" : "no"}\n`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isBundleArtifact(value: unknown): value is BundleArtifact {
  return isRecord(value) && typeof value.bundlePath === "string" && typeof value.entryPath === "string";
}

function isBundleResolved(value: unknown): value is BundleResolved {
  return isRecord(value) && isRecord(value.ref) && typeof value.path === "string" && typeof value.metadataPath === "string";
}

function isStoredPackResult(value: unknown): value is PackBundleToStoreResult {
  return isRecord(value) && isBundleArtifact(value.artifact) && isBundleResolved(value.resolved) && isRecord(value.ref);
}

function isPublicationResolved(value: unknown): value is BundlePublicationResolved {
  return isRecord(value) && isRecord(value.paths) && typeof value.paths.publicationPath === "string";
}

function isPublishResult(value: unknown): value is PublishBundleResult {
  return isRecord(value)
    && isRecord(value.publication)
    && isBundleResolved(value.raw)
    && isPublicationResolved(value.versioned);
}

function resolveBasePath(options: BasePathOption): string {
  return path.resolve(requireOption(options.bundleBasePath, "--bundle-base-path"));
}

export function createCli(): ReturnType<typeof cac> {
  const cli = cac("tools-bundle");

  cli.command("validate <bundlePath>", "Validate a direct bundle root containing bundle.json")
    .option("--json", "print JSON")
    .action(async (bundlePath: string, options: JsonOption) => {
      output(await validateBundlePath(bundlePath), options, "tools-bundle validate");
    });

  cli.command("pack <app> <sourcePath>", "Create a raw app bundle, optionally adding it to a packages/bundle store")
    .option("--bundle-base-path <path>", "bundle store base path; with --epoch, stores the next raw bundle version")
    .option("--epoch <epoch>", "host epoch X.Y.Z or X.Y.Z-<channel>.N for stored raw bundle versions")
    .option("--out <path>", "bundle output path")
    .option("--bundle-version <version>", "emit schemaVersion=2 descriptor ref using <epoch>.<bundle_slug>.M")
    .option("--key <key>", "bundle key for schemaVersion=2 descriptor ref")
    .option("--replace", "replace an existing output path")
    .option("--replace-output", "replace an existing --out path when storing a raw bundle")
    .option("--replace-store", "replace store entry if the computed key/version already exists")
    .option("--json", "print JSON")
    .action(async (app: string, sourcePath: string, options: PackOptions) => {
      if (options.bundleBasePath != null || options.epoch != null) {
        output(await packBundleToStore({
          app,
          basePath: resolveBasePath(options),
          epoch: requireOption(options.epoch, "--epoch"),
          outPath: options.out,
          replace: options.replaceStore,
          replaceOutput: options.replaceOutput ?? options.replace,
          sourcePath,
        }), options, "tools-bundle pack");
        return;
      }

      output(await packBundle({
        app,
        key: options.key,
        outPath: requireOption(options.out, "--out"),
        replace: options.replace,
        sourcePath,
        version: options.bundleVersion ?? options.version,
      }), options, "tools-bundle pack");
    });

  cli.command("publish <app>", "Publish a registry publication record for an existing raw bundle version")
    .option("--bundle-base-path <path>", "bundle store base path containing the raw bundle version")
    .option("--registry-base-path <path>", "bundle publication registry base path")
    .option("--bundle-version <version>", "raw bundle version <epoch>.<bundle_slug>.M")
    .option("--channel <channel>", "publication channel, e.g. beta")
    .option("--publication-version <version>", "publication metadata version")
    .option("--path-key <pathKey>", "explicit registry path key, e.g. od-sidecar-web")
    .option("--platform <platform>", "publication platform variant, e.g. any or darwin-arm64 (default: any)")
    .option("--key <key>", "bundle key for the publication record")
    .option("--display-version <version>", "user-facing display version")
    .option("--title <text>", "default display title")
    .option("--summary <text>", "default display summary")
    .option("--tag <tag>", "also write the publication under a tag such as latest")
    .option("--json", "print JSON")
    .action(async (app: string, options: PublishOptions) => {
      output(await publishBundle({
        app,
        bundleBasePath: resolveBasePath(options),
        bundleVersion: requireOption(options.bundleVersion, "--bundle-version"),
        channel: requireOption(options.channel, "--channel"),
        displayVersion: options.displayVersion,
        key: options.key,
        pathKey: requireOption(options.pathKey, "--path-key"),
        platform: options.platform,
        registryBasePath: path.resolve(requireOption(options.registryBasePath, "--registry-base-path")),
        summary: options.summary,
        tag: options.tag,
        title: options.title,
        version: requireOption(options.publicationVersion ?? options.version, "--publication-version"),
      }), options, "tools-bundle publish");
    });

  cli.command("add <bundlePath>", "Add a direct bundle to a packages/bundle store")
    .option("--bundle-base-path <path>", "bundle store base path")
    .option("--version <version>", "bundle version; optional when bundle.json contains schemaVersion=2 ref metadata")
    .option("--key <key>", `bundle key (default: ${WEB_BUNDLE_KEY}; daemon convention: ${DAEMON_BUNDLE_KEY})`)
    .option("--replace", "replace an existing bundle with the same key/version")
    .option("--json", "print JSON")
    .action(async (bundlePath: string, options: AddOptions) => {
      output(await addBundleToStore({
        basePath: resolveBasePath(options),
        bundlePath,
        key: options.key,
        replace: options.replace,
        version: options.version,
      }), options, "tools-bundle add");
    });

  cli.command("list", "List bundles in a packages/bundle store")
    .option("--bundle-base-path <path>", "bundle store base path")
    .option("--json", "print JSON")
    .action(async (options: BasePathOption) => {
      output(await listBundleStore(resolveBasePath(options)), options, "tools-bundle list");
    });

  cli.command("resolve <ref>", "Resolve and validate a bundle from a packages/bundle store")
    .option("--bundle-base-path <path>", "bundle store base path")
    .option("--key <key>", `bundle key used when <ref> is a version only (default: ${WEB_BUNDLE_KEY})`)
    .option("--json", "print JSON")
    .action(async (ref: string, options: RefOptions) => {
      output(await resolveBundleFromStore({
        basePath: resolveBasePath(options),
        key: options.key,
        refOrVersion: ref,
      }), options, "tools-bundle resolve");
    });

  cli.command("delete <ref>", "Delete a bundle from a packages/bundle store")
    .option("--bundle-base-path <path>", "bundle store base path")
    .option("--key <key>", `bundle key used when <ref> is a version only (default: ${WEB_BUNDLE_KEY})`)
    .option("--json", "print JSON")
    .action(async (ref: string, options: RefOptions) => {
      output(await deleteBundleFromStore({
        basePath: resolveBasePath(options),
        key: options.key,
        refOrVersion: ref,
      }), options, "tools-bundle delete");
    });

  cli.help();
  return cli;
}
