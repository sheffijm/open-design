import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { Project } from '../types';

export type WorkspaceProjectVisibility = 'personal' | 'team';
export type WorkspaceProjectSyncState =
  | 'local_only'
  | 'pending_upload'
  | 'synced'
  | 'sync_failed'
  | 'remote_deleted';

export interface WorkspaceProjectAccess {
  canOpen: boolean;
  canRename: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canMoveToTeam: boolean;
  canMoveToPersonal: boolean;
  canExport: boolean;
  canSendTo: boolean;
  canRestoreVersion: boolean;
  disabledReason?: string;
}

export interface WorkspaceProjectSummary {
  id: string;
  name: string;
  workspaceId: string;
  visibility: WorkspaceProjectVisibility;
  resourceState: 'active' | 'frozen' | 'deleted';
  createdByWorkspaceMemberId: string | null;
  updatedByWorkspaceMemberId: string | null;
  resourceHubResourceId: string | null;
  cloudTombstonedAt: number | null;
  currentUserAccess: WorkspaceProjectAccess;
  syncState: WorkspaceProjectSyncState;
  createdAt: number;
  updatedAt: number;
  metadata?: Project['metadata'];
  project: Project;
}

export interface WorkspaceProjectsResponse {
  projects: WorkspaceProjectSummary[];
}

function workspaceContextHeaders(context: WorkspaceCollabContext): Record<string, string> {
  return {
    'x-od-workspace-id': context.workspaceId,
    'x-od-workspace-member-id': context.workspaceMemberId,
    'x-od-workspace-role': context.role,
    'x-od-workspace-member-status': context.memberStatus,
    'x-od-workspace-lifecycle-state': context.lifecycleState,
    'x-od-workspace-can-share-projects': String(context.permissions.canShareProjects),
    'x-od-workspace-can-write-synced-files': String(context.permissions.canWriteSyncedFiles),
  };
}

export async function listWorkspaceProjects(input: {
  workspaceId: string;
  context: WorkspaceCollabContext;
  view?: 'all' | 'drafts' | 'team';
  owner?: 'all' | 'mine' | 'others';
  visibility?: 'all' | WorkspaceProjectVisibility;
}): Promise<WorkspaceProjectSummary[]> {
  const params = new URLSearchParams();
  if (input.view) params.set('view', input.view);
  if (input.owner) params.set('owner', input.owner);
  if (input.visibility) params.set('visibility', input.visibility);

  const query = params.toString();
  const resp = await fetch(
    `/api/workspaces/${encodeURIComponent(input.workspaceId)}/projects${query ? `?${query}` : ''}`,
    { headers: workspaceContextHeaders(input.context) },
  );
  if (!resp.ok) throw new Error(`workspace projects ${resp.status}`);
  const body = (await resp.json()) as WorkspaceProjectsResponse;
  return Array.isArray(body.projects) ? body.projects : [];
}

export async function moveWorkspaceProject(input: {
  workspaceId: string;
  context: WorkspaceCollabContext;
  projectId: string;
  visibility: WorkspaceProjectVisibility;
}): Promise<WorkspaceProjectSummary> {
  const resp = await fetch(
    `/api/workspaces/${encodeURIComponent(input.workspaceId)}/projects/${encodeURIComponent(input.projectId)}/move`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceContextHeaders(input.context),
      },
      body: JSON.stringify({ visibility: input.visibility }),
    },
  );
  if (!resp.ok) throw new Error(`workspace project move ${resp.status}`);
  const body = (await resp.json()) as { project?: WorkspaceProjectSummary };
  if (!body.project) throw new Error('workspace project move returned no project');
  return body.project;
}
