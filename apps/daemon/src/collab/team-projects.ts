// Team-wide shared-project discovery. A member with an empty local project list
// still needs to SEE the projects the owner (or any teammate) shared to the
// team: those live on the resource hub as `kind: 'project'` resources until the
// member pulls one down. This reads the hub's resource index for the caller's
// team and maps each shared project back to the local projectId a member pulls +
// opens. It reuses the same principal-from-context + env-configured hub client
// the team-resource share path uses, and degrades to an empty list when there is
// no team identity or the hub is not configured — the single identity gate shared
// with the rest of the collab surface.
//
// OWNERSHIP / TEMPORARY: the source of truth for team project visibility (which
// projects are in the team space) is the D-lane directory service on vela, NOT
// this C-lane hub read. This lister exists so the team edition is locally
// point-and-click debuggable before D's vela endpoint lands: it derives the list
// from the projects C already publishes to the hub on a share. When D's service
// is ready, the daemon should proxy vela here (daemon as the cache/收口 layer)
// and this hub-derived read becomes the offline fallback. Keep the data source
// swap contained to this file + the version helper below.

import type { TeamProject } from '@open-design/contracts';
import {
  createResourceHubClient,
  readResourceHubConfig,
  type ResourceHubClient,
  type ResourceRecord,
} from '../integrations/resource-hub.js';
import { contextToResourceHubPrincipal } from './resource-hub-publish-adapter.js';
import type { WorkspaceContextProvider } from './workspace-context.js';

const PROJECT_KIND = 'project';
const PROJECT_ID_PREFIX = /^project-/;

// TODO(D-lane): when this read proxies vela over the CLI (a slower cross-network
// call), the web poll should first probe a cheap change tag — vela's version /
// last-modified on the team project list — and only pull the full list when it
// moved. While the read is daemon-local (the hub stub below), that probe would
// save nothing, so the client just refetches the whole list on its interval.

/** Map a `kind: 'project'` hub resource to the team-project discovery DTO. The
 *  hub id namespaces projects under a `project-` prefix; strip it back to the
 *  local projectId a member pulls then opens. */
export function toTeamProject(record: ResourceRecord): TeamProject {
  return {
    projectId: record.id.replace(PROJECT_ID_PREFIX, ''),
    ownerMemberId: record.ownerMemberId,
    sharedAt: record.createdAt,
  };
}

export interface CreateTeamProjectsListerOptions {
  /** The one workspace context the collab surface reads; the principal derives
   *  from it so a single signed-in identity drives discovery + share + pull. */
  workspaceContext: WorkspaceContextProvider;
  /** Injectable client for tests; built from env (OD_RESOURCE_HUB_URL) otherwise. */
  client?: ResourceHubClient;
  env?: NodeJS.ProcessEnv;
}

/**
 * Build a lister that returns every project shared to the caller's team, read
 * from the resource hub. Filters the hub's resource index to live
 * `kind: 'project'` records and strips the `project-` id prefix. Returns [] when
 * there is no team principal (off-team / signed out) or the hub is not configured.
 */
export function createTeamProjectsLister(
  options: CreateTeamProjectsListerOptions,
): () => Promise<TeamProject[]> {
  const env = options.env ?? process.env;
  return async () => {
    const principal = contextToResourceHubPrincipal(
      await options.workspaceContext.current({}),
    );
    if (!principal) return [];
    const client =
      options.client ??
      (env.OD_RESOURCE_HUB_URL?.trim()
        ? createResourceHubClient({ config: readResourceHubConfig(env) })
        : null);
    if (!client) return [];
    const resources = await client.listResources(principal);
    return resources
      .filter((record) => record.kind === PROJECT_KIND && record.deletedAt == null)
      .map(toTeamProject);
  };
}
