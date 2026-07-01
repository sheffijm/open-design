import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getProjectFileVersionRootStats } from '../src/project-file-versions.js';
import { startServer } from '../src/server.js';

describe('project file version routes', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const id of projectsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/projects/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createProject(): Promise<string> {
    const id = `file-versions-${randomUUID()}`;
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'File version route project' }),
    });
    expect(response.status).toBe(200);
    projectsToClean.push(id);
    return id;
  }

  async function writeProjectFile(projectId: string, name: string, content: string): Promise<void> {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    expect(response.status).toBe(200);
  }

  function projectsRoot(): string {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    return path.join(dataDir, 'projects');
  }

  async function blockVersionRoot(projectId: string): Promise<void> {
    const projectDir = path.join(projectsRoot(), projectId);
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, '.file-versions'), 'blocked');
  }

  it('lists and restores HTML history after the working file is deleted', async () => {
    const projectId = await createProject();
    await writeProjectFile(projectId, 'brand.html', '<html><body>recover me</body></html>');

    const createResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Known good checkpoint', source: 'manual' }),
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { version: { id: string; size: number } };

    const deleteResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/brand.html`, {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`);
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      file: { name: string; size: number; kind: string; mime: string };
      versions: Array<{ id: string; current: boolean; label: string }>;
    };
    expect(listed.file).toMatchObject({
      name: 'brand.html',
      size: created.version.size,
      kind: 'html',
      mime: 'text/html; charset=utf-8',
    });
    expect(listed.versions.length).toBeGreaterThanOrEqual(1);
    const listedCheckpoint = listed.versions.find((version) => version.id === created.version.id);
    expect(listedCheckpoint).toMatchObject({
      id: created.version.id,
      current: true,
      label: 'Known good checkpoint',
    });

    const restoreResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/files/brand.html/versions/${created.version.id}/restore`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
    );
    expect(restoreResponse.status).toBe(200);

    const rawResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/brand.html`);
    expect(rawResponse.status).toBe(200);
    expect(await rawResponse.text()).toBe('<html><body>recover me</body></html>');
  });

  it('does not mix deleted HTML history into a recreated file at the same path', async () => {
    const projectId = await createProject();
    await writeProjectFile(projectId, 'brand.html', '<html><body>old file</body></html>');

    const oldResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Deleted file checkpoint', source: 'manual' }),
    });
    expect(oldResponse.status).toBe(200);

    const deleteResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/brand.html`, {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(200);

    await writeProjectFile(projectId, 'brand.html', '<html><body>new file</body></html>');
    const newResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Recreated file checkpoint', source: 'manual' }),
    });
    expect(newResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`);
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      versions: Array<{ label: string; current: boolean }>;
    };
    expect(listed.versions.some((version) => version.label === 'Deleted file checkpoint')).toBe(false);
    expect(listed.versions.some((version) => version.label === 'Recreated file checkpoint')).toBe(true);
    expect(listed.versions.filter((version) => version.current)).toHaveLength(1);
  });

  it('returns a typed warning when JSON HTML write succeeds but version capture fails', async () => {
    const projectId = await createProject();
    await blockVersionRoot(projectId);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'brand.html', content: '<html><body>saved</body></html>' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      file: { name: string };
      versionWarning?: { code: string; message: string };
    };
    expect(body.file.name).toBe('brand.html');
    expect(body.versionWarning).toMatchObject({
      code: 'PROJECT_FILE_VERSION_CAPTURE_FAILED',
    });

    const rawResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/brand.html`);
    expect(rawResponse.status).toBe(200);
    expect(await rawResponse.text()).toBe('<html><body>saved</body></html>');
  });

  it('returns a typed warning when multipart HTML upload succeeds but version capture fails', async () => {
    const projectId = await createProject();
    await blockVersionRoot(projectId);
    const form = new FormData();
    form.append('file', new Blob(['<html><body>uploaded</body></html>'], { type: 'text/html' }), 'upload.html');

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      file: { name: string };
      versionWarning?: { code: string; message: string };
    };
    expect(body.file.name).toBe('upload.html');
    expect(body.versionWarning).toMatchObject({
      code: 'PROJECT_FILE_VERSION_CAPTURE_FAILED',
    });

    const rawResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/upload.html`);
    expect(rawResponse.status).toBe(200);
    expect(await rawResponse.text()).toBe('<html><body>uploaded</body></html>');
  });

  it('returns a typed warning when restore writes the file but cannot append the restore version', async () => {
    const projectId = await createProject();
    await writeProjectFile(projectId, 'brand.html', '<html><body>old</body></html>');
    const createResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Old checkpoint', source: 'manual' }),
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { version: { id: string } };
    await writeProjectFile(projectId, 'brand.html', '<html><body>new</body></html>');

    const stats = await getProjectFileVersionRootStats(projectsRoot(), projectId, 'brand.html');
    await fs.chmod(stats.root, 0o555);
    try {
      const restoreResponse = await fetch(
        `${baseUrl}/api/projects/${projectId}/files/brand.html/versions/${created.version.id}/restore`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
      );
      expect(restoreResponse.status).toBe(200);
      const restored = (await restoreResponse.json()) as {
        file: { name: string };
        version: null;
        versionWarning?: { code: string; message: string };
      };
      expect(restored.file.name).toBe('brand.html');
      expect(restored.version).toBeNull();
      expect(restored.versionWarning).toMatchObject({
        code: 'PROJECT_FILE_VERSION_CAPTURE_FAILED',
      });

      const rawResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/brand.html`);
      expect(rawResponse.status).toBe(200);
      expect(await rawResponse.text()).toBe('<html><body>old</body></html>');
    } finally {
      await fs.chmod(stats.root, 0o755).catch(() => {});
    }
  });
});
