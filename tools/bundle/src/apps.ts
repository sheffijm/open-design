import { parseBundleEpochVersion } from "@open-design/bundle";

import { fail } from "./errors.js";

export const WEB_APP = "web";
export const DAEMON_APP = "daemon";
export const WEB_BUNDLE_KEY = "od:sidecar:web";
export const DAEMON_BUNDLE_KEY = "od:sidecar:daemon";
export const WEB_PACKAGE_NAME = "@open-design/web";
export const DAEMON_PACKAGE_NAME = "@open-design/daemon";

export type BundleApp = typeof WEB_APP | typeof DAEMON_APP;

export function requireSupportedApp(app: string): BundleApp {
  if (app === WEB_APP) return app;
  if (app === DAEMON_APP) return app;
  fail(`unsupported bundle app: ${app} (expected: daemon or web)`);
}

export function defaultKeyForApp(app: BundleApp): string {
  return app === WEB_APP ? WEB_BUNDLE_KEY : DAEMON_BUNDLE_KEY;
}

export function slugForApp(app: BundleApp): string {
  return app;
}

export function requireAppBundleVersion(app: BundleApp, version: string): string {
  const parsed = parseBundleEpochVersion(version);
  const expectedSlug = slugForApp(app);
  if (parsed.slug !== expectedSlug) {
    fail(`bundle version slug must be ${expectedSlug} for ${app}: ${version}`);
  }
  return parsed.version;
}
