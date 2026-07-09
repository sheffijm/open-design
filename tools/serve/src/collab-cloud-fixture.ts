import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

// TEMPORARY local collab-cloud fixture. A self-contained, in-memory, infra-free
// stand-in for the real cross-daemon collaboration hub (C-lane spec §D4, which
// will live in the vela repo as `services/collab`). It lets teammates develop
// the daemon's comment-sync + member-directory features locally without standing
// up vela + postgres: point OD_COLLAB_CLOUD_URL at this fixture and two daemons
// converge.
//
// It speaks the SAME wire contract the daemon client speaks (bearer auth,
// team-scoped paths, append-only comment stream with a monotonic seq cursor,
// member directory). The daemon runs its real client against this exactly as it
// would against vela — no mock concessions.
//
// SCOPE (§D4.1): the hub is (④) an APPEND-ONLY comment store and a light member
// directory. It does NOT propagate comment edits/deletes, does not do presence,
// and stores comments opaquely — it is a relay, not a validator. Auth is a
// single shared bearer token (a local stub principal; the real hub verifies B's
// token — §D4.4).
//
// DISPOSABLE: this whole file is deleted once vela `services/collab` is stood
// up; the only migration is repointing OD_COLLAB_CLOUD_URL at the real service.

export type CollabCloudFixtureOptions = {
  host?: string;
  port?: number;
  token?: string;
};

export type CollabCloudFixtureInfo = {
  origin: string;
  endpointUrl: string;
  token: string;
};

export type CollabCloudFixtureServer = {
  close(): Promise<void>;
  info: CollabCloudFixtureInfo;
  reset(): void;
};

export const DEFAULT_COLLAB_CLOUD_PORT = 18096;
const DEFAULT_TOKEN = "dev-internal-token";
const MEMBER_ROLES = new Set(["owner", "admin", "member"]);

type MemberEntry = {
  memberId: string;
  displayName: string;
  role: string;
};

// A comment is stored opaquely (the hub is a relay, not a validator); only `seq`
// is hub-owned, everything else is the daemon's serialized preview_comment.
type StoredComment = Record<string, unknown> & { id: string; seq: number };

type ProjectStream = {
  comments: StoredComment[];
  seq: number;
};

type Team = {
  members: Map<string, MemberEntry>;
  projects: Map<string, ProjectStream>;
};

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
  });
}

function serverOrigin(server: Server): string {
  const address = server.address();
  if (address == null || typeof address === "string") {
    throw new Error("collab cloud fixture did not listen on TCP");
  }
  return `http://127.0.0.1:${address.port}`;
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise<Buffer>((resolveRead, rejectRead) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("error", rejectRead);
    request.on("end", () => resolveRead(Buffer.concat(chunks)));
  });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request);
  if (body.byteLength === 0) return {};
  return JSON.parse(body.toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(body);
}

function header(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0]?.trim() ?? null;
  return typeof value === "string" ? value.trim() || null : null;
}

/** Extract the bearer token from an `Authorization: Bearer <token>` header. */
function bearerToken(request: IncomingMessage): string | null {
  const raw = header(request, "authorization");
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match ? match[1].trim() : null;
}

function normalizeRole(value: unknown): string | null {
  return typeof value === "string" && MEMBER_ROLES.has(value) ? value : null;
}

export async function startCollabCloudFixtureServer(
  options: CollabCloudFixtureOptions = {},
): Promise<CollabCloudFixtureServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const token = options.token ?? DEFAULT_TOKEN;

  // In-memory state, isolated per team (§D4.4 authorization scope).
  const teams = new Map<string, Team>();

  function reset(): void {
    teams.clear();
  }

  function teamFor(teamId: string): Team {
    let team = teams.get(teamId);
    if (!team) {
      team = { members: new Map(), projects: new Map() };
      teams.set(teamId, team);
    }
    return team;
  }

  function streamFor(team: Team, projectId: string): ProjectStream {
    let stream = team.projects.get(projectId);
    if (!stream) {
      stream = { comments: [], seq: 0 };
      team.projects.set(projectId, stream);
    }
    return stream;
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      sendJson(response, 500, {
        error: "fixture_error",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://fixture.local");
    const path = url.pathname;
    const method = request.method ?? "GET";

    if (path === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    // Bearer auth — a single shared stub token (the real hub verifies B's
    // signed token). Missing or mismatched → 401.
    const presented = bearerToken(request);
    if (!presented || presented !== token) {
      sendJson(response, 401, { error: "untrusted_caller" });
      return;
    }

    const segments = path.split("/").filter((s) => s.length > 0);
    // /teams/:teamId/members
    // /teams/:teamId/members/:memberId
    // /teams/:teamId/projects/:projectId/comments
    if (segments[0] !== "teams" || segments[1] === undefined) {
      sendJson(response, 404, { error: "not_found" });
      return;
    }
    const teamId = decodeURIComponent(segments[1]);

    // ---- member directory --------------------------------------------------
    if (segments[2] === "members" && segments[3] === undefined && method === "GET") {
      const team = teamFor(teamId);
      sendJson(response, 200, { members: [...team.members.values()] });
      return;
    }

    if (segments[2] === "members" && segments[3] !== undefined && method === "PUT") {
      const memberId = decodeURIComponent(segments[3]);
      const body = (await readJson(request)) as { displayName?: unknown; role?: unknown };
      const displayName =
        typeof body.displayName === "string" && body.displayName.trim()
          ? body.displayName.trim()
          : memberId;
      const role = normalizeRole(body.role) ?? "member";
      const member: MemberEntry = { memberId, displayName, role };
      teamFor(teamId).members.set(memberId, member);
      sendJson(response, 200, { ok: true, member });
      return;
    }

    // ---- project comment stream -------------------------------------------
    if (
      segments[2] === "projects" &&
      segments[3] !== undefined &&
      segments[4] === "comments" &&
      segments[5] === undefined
    ) {
      const projectId = decodeURIComponent(segments[3]);
      const team = teamFor(teamId);
      const stream = streamFor(team, projectId);

      if (method === "POST") {
        const body = (await readJson(request)) as { comment?: unknown };
        const comment = body.comment;
        if (!comment || typeof comment !== "object") {
          sendJson(response, 400, { error: "invalid_request", message: "comment is required" });
          return;
        }
        const record = comment as Record<string, unknown>;
        const id = typeof record.id === "string" && record.id ? record.id : null;
        if (!id) {
          sendJson(response, 400, { error: "invalid_request", message: "comment.id is required" });
          return;
        }
        // Append-only + idempotent by author-assigned id: re-pushing the same
        // comment id (e.g. after a retry) does not create a duplicate. Keeps the
        // seq stream monotonic and gap-free.
        const existing = stream.comments.find((c) => c.id === id);
        if (existing) {
          sendJson(response, 200, { ok: true, seq: existing.seq });
          return;
        }
        stream.seq += 1;
        const stored: StoredComment = { ...record, id, seq: stream.seq };
        stream.comments.push(stored);
        sendJson(response, 200, { ok: true, seq: stored.seq });
        return;
      }

      if (method === "GET") {
        const sinceSeqRaw = url.searchParams.get("sinceSeq");
        const sinceSeq = sinceSeqRaw != null ? Number(sinceSeqRaw) : 0;
        const since = Number.isFinite(sinceSeq) ? sinceSeq : 0;
        // ETag/304 bandwidth guard (§D4.5): the whole stream is addressed by its
        // head seq, so a poller that already saw `latestSeq` gets an empty 304.
        const etag = `W/"seq-${stream.seq}"`;
        if (header(request, "if-none-match") === etag && since >= stream.seq) {
          response.statusCode = 304;
          response.setHeader("etag", etag);
          response.end();
          return;
        }
        const comments = stream.comments
          .filter((c) => c.seq > since)
          .sort((a, b) => a.seq - b.seq);
        response.setHeader("etag", etag);
        sendJson(response, 200, { comments, latestSeq: stream.seq });
        return;
      }
    }

    sendJson(response, 404, { error: "not_found" });
  }

  await listen(server, port, host);
  const origin = serverOrigin(server);

  return {
    close: () => close(server),
    info: { origin, endpointUrl: origin, token },
    reset,
  };
}
