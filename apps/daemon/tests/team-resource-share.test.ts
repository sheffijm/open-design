import { describe, expect, it } from 'vitest';
import {
  TeamResourceShareForbiddenError,
  createTeamResourceShareService,
} from '../src/collab/team-resource-share.js';
import type { ResourceHubClient, ResourceHubPrincipal } from '../src/integrations/resource-hub.js';

// The client is never reached when the permission gate refuses or no-ops, so a
// bare stub suffices for the gate cases.
const stubClient = {} as unknown as ResourceHubClient;
const principal: ResourceHubPrincipal = {
  memberId: 'wm-1',
  teamId: 't-1',
  role: 'member',
  lifecycleState: 'active',
};

describe('team resource share permission gate', () => {
  it('refuses a team member who cannot manage shared resources (403 marker)', async () => {
    const service = createTeamResourceShareService({
      kind: 'design_system',
      idPrefix: 'ds',
      resolveDir: () => '/tmp/ds',
      getPrincipal: () => principal,
      getCanShare: () => false,
      client: stubClient,
    });
    await expect(service.share('ds-1')).rejects.toBeInstanceOf(TeamResourceShareForbiddenError);
    expect(service.isShared('ds-1')).toBe(false);
  });

  it('stays a silent no-op when there is no team identity, without a permission error', async () => {
    const service = createTeamResourceShareService({
      kind: 'design_system',
      idPrefix: 'ds',
      resolveDir: () => '/tmp/ds',
      getPrincipal: () => null,
      getCanShare: () => false,
      client: stubClient,
    });
    expect(await service.share('ds-1')).toBeNull();
  });
});
