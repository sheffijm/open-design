import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createProjectFileVersion,
  ensureCurrentProjectFileVersion,
  isProjectFileVersionPath,
  listProjectFileVersions,
  readProjectFileVersion,
} from '../src/project-file-versions.js';
import { ensureProject } from '../src/projects.js';

describe('project file versions', () => {
  async function withProject(fn: (projectsRoot: string, projectId: string) => Promise<void>) {
    const projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-file-versions-'));
    try {
      const projectId = 'versioned-project';
      await ensureProject(projectsRoot, projectId);
      await fn(projectsRoot, projectId);
    } finally {
      await rm(projectsRoot, { recursive: true, force: true });
    }
  }

  it('snapshots HTML content, dedupes unchanged current content, and marks the latest version current', async () => {
    await withProject(async (projectsRoot, projectId) => {
      const first = await ensureCurrentProjectFileVersion(
        projectsRoot,
        projectId,
        'brand.html',
        '<html><body>v1</body></html>',
        { prompt: 'first prompt', promptSource: 'message' },
      );
      expect(first).toMatchObject({
        version: 1,
        current: true,
        source: 'ai',
        prompt: 'first prompt',
        promptSource: 'message',
      });
      if (!first) throw new Error('expected first version');

      const duplicate = await ensureCurrentProjectFileVersion(
        projectsRoot,
        projectId,
        'brand.html',
        '<html><body>v1</body></html>',
        { prompt: 'ignored prompt', promptSource: 'manual' },
      );
      expect(duplicate?.id).toBe(first.id);

      const second = await ensureCurrentProjectFileVersion(
        projectsRoot,
        projectId,
        'brand.html',
        '<html><body>v2</body></html>',
        { prompt: 'second prompt', promptSource: 'message' },
      );
      expect(second).toMatchObject({
        version: 2,
        current: true,
        source: 'ai',
        prompt: 'second prompt',
      });

      const versions = await listProjectFileVersions(projectsRoot, projectId, 'brand.html');
      expect(versions).toHaveLength(2);
      expect(versions.map((version) => version.current)).toEqual([false, true]);

      const prior = await readProjectFileVersion(projectsRoot, projectId, 'brand.html', first.id);
      expect(prior.content).toBe('<html><body>v1</body></html>');
      expect(prior.version.current).toBe(false);

      const restored = await createProjectFileVersion(
        projectsRoot,
        projectId,
        'brand.html',
        prior.content,
        {
          prompt: prior.version.prompt,
          promptSource: 'restore',
          source: 'restore',
          restoreFromVersionId: prior.version.id,
        },
      );
      expect(restored).toMatchObject({
        version: 3,
        current: true,
        source: 'restore',
        restoreFromVersionId: prior.version.id,
      });

      const afterRestore = await listProjectFileVersions(projectsRoot, projectId, 'brand.html');
      expect(afterRestore.map((version) => version.current)).toEqual([false, false, true]);
      expect(afterRestore.at(-1)?.id).toBe(restored.id);
    });
  });

  it('records manual provenance and ignores non-HTML files', async () => {
    await withProject(async (projectsRoot, projectId) => {
      const textVersion = await ensureCurrentProjectFileVersion(
        projectsRoot,
        projectId,
        'notes.txt',
        'plain text',
        { source: 'manual', promptSource: 'manual' },
      );
      expect(textVersion).toBeNull();

      const manual = await ensureCurrentProjectFileVersion(
        projectsRoot,
        projectId,
        'brand.html',
        '<html><body>manual</body></html>',
        { source: 'manual', promptSource: 'manual', label: 'Manual text edit' },
      );

      expect(manual).toMatchObject({
        version: 1,
        current: true,
        source: 'manual',
        promptSource: 'manual',
        label: 'Manual text edit',
      });
    });
  });

  it('recognizes internal version storage paths', () => {
    expect(isProjectFileVersionPath('.file-versions/abc/manifest.json')).toBe(true);
    expect(isProjectFileVersionPath('nested/.file-versions/abc/content.html')).toBe(true);
    expect(isProjectFileVersionPath('brand.html')).toBe(false);
  });

  it('rejects unsafe version identifiers', async () => {
    await withProject(async (projectsRoot, projectId) => {
      await expect(
        readProjectFileVersion(projectsRoot, projectId, 'brand.html', '../manifest.json'),
      ).rejects.toThrow(/version id required/);
    });
  });
});
