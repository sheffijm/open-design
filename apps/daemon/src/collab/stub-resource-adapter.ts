import type { ResourcePublishAdapter } from './publish-scheduler.js';

/**
 * Placeholder resource-hub adapter until E's `services/resource-hub` (沅锡,
 * OPEND-446) ships its client. It assigns a monotonic in-memory version per
 * project so the author-side publish flow (coalesce → publish → notify) is
 * exercisable end-to-end locally, but it does NOT durably store content. Swap
 * for the real E client (E v1.0 §2.4 = createVersion + setRef('published')) when
 * it lands; the {@link ResourcePublishAdapter} interface is the seam.
 */
export function createStubResourcePublishAdapter(): ResourcePublishAdapter {
  const versions = new Map<string, number>();
  return {
    async publish({ projectId }) {
      const next = (versions.get(projectId) ?? 0) + 1;
      versions.set(projectId, next);
      return { version: next };
    },
  };
}
