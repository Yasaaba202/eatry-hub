import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  IDEMPOTENCY_HEADER,
  getIdempotencyExpiry,
  hashIdempotencyPayload,
  normalizeIdempotencyKey,
} from "@/lib/security/idempotency-core";

type RecordRow = {
  id: string;
  status: string;
  requestHash: string;
  responseCode: number | null;
  responseBody: unknown;
  expiresAt: Date;
};

export type IdempotencyResult = { status: number; body: unknown };

export type IdempotencyHandle = {
  replay: Response | null;
  complete: (result: IdempotencyResult, resourceId?: string) => Promise<void>;
  fail: () => Promise<void>;
};

const noopHandle: IdempotencyHandle = {
  replay: null,
  complete: async () => {},
  fail: async () => {},
};

function replayResponse(row: RecordRow) {
  return Response.json(row.responseBody, {
    status: row.responseCode ?? 200,
    headers: { "Idempotent-Replay": "true", "Cache-Control": "no-store" },
  });
}

function conflictResponse(message: string) {
  return Response.json({ error: message }, { status: 409, headers: { "Cache-Control": "no-store" } });
}

async function findRecord(scope: string, actorKey: string, key: string): Promise<RecordRow | null> {
  const rows = await prisma.$queryRaw<RecordRow[]>`
    SELECT "id", "status", "requestHash", "responseCode", "responseBody", "expiresAt"
    FROM "IdempotencyRecord"
    WHERE "scope" = ${scope} AND "actorKey" = ${actorKey} AND "idempotencyKey" = ${key}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function hashIdempotencyRequest(payload: unknown): string {
  return hashIdempotencyPayload(payload);
}

export function readIdempotencyKey(request: Request): string | null {
  return normalizeIdempotencyKey(request.headers.get(IDEMPOTENCY_HEADER));
}

export async function beginIdempotency(params: {
  request: Request;
  scope: string;
  actorKey: string;
  requestHash: string;
  now?: number;
}): Promise<IdempotencyHandle> {
  const key = readIdempotencyKey(params.request);
  if (!key) return noopHandle;

  const now = params.now ?? Date.now();
  const expiresAt = getIdempotencyExpiry(now);

  try {
    const existing = await findRecord(params.scope, params.actorKey, key);
    if (existing) {
      if (existing.expiresAt.getTime() <= now) {
        await prisma.idempotencyRecord.deleteMany({ where: { id: existing.id } });
      } else if (existing.status === "completed") {
        if (existing.requestHash !== params.requestHash) {
          return {
            ...noopHandle,
            replay: conflictResponse("This Idempotency-Key was already used with a different request."),
          };
        }
        return { ...noopHandle, replay: replayResponse(existing) };
      } else if (existing.requestHash !== params.requestHash) {
        return {
          ...noopHandle,
          replay: conflictResponse("This Idempotency-Key is already being used for a different request."),
        };
      } else {
        return {
          ...noopHandle,
          replay: conflictResponse("This request is already being processed. Wait for it to finish and retry."),
        };
      }
    }

    const id = randomUUID();
    const inserted = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "IdempotencyRecord"
        ("id", "scope", "actorKey", "idempotencyKey", "requestHash", "status", "expiresAt", "createdAt", "updatedAt")
      VALUES
        (${id}, ${params.scope}, ${params.actorKey}, ${key}, ${params.requestHash}, ${'processing'}, ${expiresAt}, NOW(), NOW())
      ON CONFLICT ("scope", "actorKey", "idempotencyKey") DO NOTHING
      RETURNING "id"
    `;

    if (!inserted[0]) {
      const concurrent = await findRecord(params.scope, params.actorKey, key);
      if (concurrent && concurrent.status === "completed" && concurrent.requestHash === params.requestHash) {
        return { ...noopHandle, replay: replayResponse(concurrent) };
      }
      return {
        ...noopHandle,
        replay: conflictResponse("This request is already being processed. Wait for it to finish and retry."),
      };
    }

    const recordId = inserted[0].id;
    return {
      replay: null,
      complete: async (result, resourceId) => {
        try {
          await prisma.idempotencyRecord.update({
            where: { id: recordId },
            data: {
              status: "completed",
              responseCode: result.status,
              responseBody: result.body as object,
              resourceId: resourceId ?? null,
            },
          });
        } catch (error) {
          console.error("Idempotency record could not be completed.", error);
        }
      },
      fail: async () => {
        try {
          await prisma.idempotencyRecord.deleteMany({ where: { id: recordId } });
        } catch (error) {
          console.error("Idempotency record could not be released.", error);
        }
      },
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2021") {
      console.warn("Idempotency is disabled because the security tables are missing. Apply the P0 security migration to enable it.");
      return noopHandle;
    }
    console.error("Idempotency check failed.", error);
    return noopHandle;
  }
}