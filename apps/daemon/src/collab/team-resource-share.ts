// Team resource sharing. A member with publish rights promotes a personal
// resource — a design system, plugin, or skill — into the team scope: the
// resource's directory is packed and pushed to the resource hub under its kind,
// so teammates can pull it into their own workspace. This reuses the same
// content-addressed publish machinery as project sync — only the resource kind
// and id namespace differ — and degrades to a no-op when there is no team
// identity or the hub is not configured (the same identity gate as the rest of
// the collab surface).

import {
  createResourceHubClient,
  readResourceHubConfig,
  type ResourceHubClient,
  type ResourceHubPrincipal,
} from '../integrations/resource-hub.js';
import { createResourceHubPublishAdapter } from './resource-hub-publish-adapter.js';
import {
  createVelaCliResourceAdapter,
  shouldUseVelaCliResourceTransport,
} from './vela-cli-resource-adapter.js';
import type { ResourcePublishAdapter } from './publish-scheduler.js';

/** Thrown when a team member without share rights attempts to share a resource. */
export class TeamResourceShareForbiddenError extends Error {
  constructor() {
    super('workspace_resource_share_denied');
    this.name = 'TeamResourceShareForbiddenError';
  }
}

export interface TeamResourceShareService {
  /** Share a resource to the team. Returns the published version, or null off-team. */
  share(resourceId: string): Promise<{ version: number } | null>;
  /** Ids of resources shared to the team in this session. */
  sharedIds(): string[];
  /** True once a resource has been shared to the team. */
  isShared(resourceId: string): boolean;
  /** Whether the hub is reachable (share is a no-op otherwise). */
  readonly configured: boolean;
}

export interface CreateTeamResourceShareOptions {
  /** Resource hub kind, e.g. `design_system` | `plugin` | `skill`. */
  kind: string;
  /** Colon-free id-namespace prefix distinguishing this kind on the shared hub. */
  idPrefix: string;
  /** Resolve a resource's source directory (what gets packed and pushed). May be
   *  async: the skill resolver awaits the skill index, and the publish adapter
   *  awaits this before packing. */
  resolveDir: (resourceId: string) => string | Promise<string>;
  /** Resolve the current principal (null = no team identity → share no-ops). */
  getPrincipal: () => ResourceHubPrincipal | null | Promise<ResourceHubPrincipal | null>;
  /**
   * Whether the current member may manage shared resources (`canManageShared
   * Resources`). When it resolves false but the member IS on a team, the share is
   * refused (a non-owner/admin cannot share). Omitted → no permission gate (the
   * caller is trusted to have pre-checked).
   */
  getCanShare?: () => boolean | Promise<boolean>;
  /** Injectable client for tests; built from env when omitted. */
  client?: ResourceHubClient;
  env?: NodeJS.ProcessEnv;
}

export function createTeamResourceShareService(
  options: CreateTeamResourceShareOptions,
): TeamResourceShareService {
  const env = options.env ?? process.env;
  // Distinct, colon-free id namespace on the shared hub. The caller's id (e.g.
  // `user:palette-x`) is sanitized to path-safe chars — the hub routes the
  // resource id as a path param, so a colon would 404.
  const resourceIdFor = (id: string) => `${options.idPrefix}-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  // Ids shared this session. The published resources are the durable record on
  // the hub; this is the fast local view the team collection reads until a hub
  // listing query lands.
  const shared = new Set<string>();

  let adapter: ResourcePublishAdapter;
  if (shouldUseVelaCliResourceTransport(env)) {
    // Vela CLI transport (收口): the CLI drives the hub with the same vela login
    // session AMR uses, so sharing needs no daemon-held internal token. Its
    // configured-ness is the CLI's presence, not a hub URL, so this branch is
    // always "configured" — the identity gate below still no-ops off-team.
    adapter = createVelaCliResourceAdapter({
      resolveProjectDir: options.resolveDir,
      resourceIdFor,
      kind: options.kind,
      hasTeamIdentity: async () => (await options.getPrincipal()) != null,
    });
  } else {
    const client =
      options.client ??
      (env.OD_RESOURCE_HUB_URL?.trim()
        ? createResourceHubClient({ config: readResourceHubConfig(env) })
        : null);
    if (!client) {
      return {
        share: async () => null,
        sharedIds: () => [],
        isShared: () => false,
        configured: false,
      };
    }
    adapter = createResourceHubPublishAdapter({
      client,
      getPrincipal: options.getPrincipal,
      resolveProjectDir: options.resolveDir,
      resourceIdFor,
      kind: options.kind,
    });
  }

  return {
    async share(resourceId) {
      // Permission gate: only a member who can manage shared resources may
      // promote one to the team. No team identity stays a silent no-op
      // (shared:false); a team member who lacks the permission is refused so the
      // gate cannot be bypassed by calling the route directly.
      if (options.getCanShare && !(await options.getCanShare())) {
        if (await options.getPrincipal()) throw new TeamResourceShareForbiddenError();
        return null;
      }
      const result = await adapter.publish({ projectId: resourceId, reason: 'share' });
      if (result) shared.add(resourceId);
      return result;
    },
    sharedIds: () => [...shared],
    isShared: (resourceId) => shared.has(resourceId),
    configured: true,
  };
}
