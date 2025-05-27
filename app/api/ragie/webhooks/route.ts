import assert from "assert";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import db from "@/lib/server/db";
import * as schema from "@/lib/server/db/schema";
import { saveConnection } from "@/lib/server/service";
import { RAGIE_WEBHOOK_SECRET } from "@/lib/server/settings";
import { validateSignature } from "@/lib/server/utils";

interface WebhookEvent {
  type: string;
  payload: any;
}

async function handleConnectionSyncEvent(event: WebhookEvent) {
  const status =
    event.type === "connection_sync_started" || event.type === "connection_sync_progress" ? "syncing" : "ready";

  const rs = await db
    .select()
    .from(schema.connections)
    .where(eq(schema.connections.ragieConnectionId, event.payload.connection_id));

  // Not one we know about. We return a successful status because otherwise it is considered a failure
  // and webhooks stop being called upon enough failures.
  if (rs.length === 0) {
    return Response.json({ message: "unknown connection" });
  }

  assert(rs.length === 1, "Failed connection lookup. More than one connection.");

  await saveConnection(rs[0].tenantId, event.payload.connection_id, status);

  return Response.json({ message: "success" });
}

async function handlePartitionLimitEvent(event: WebhookEvent) {
  // First check if this partition exists in our tenants table
  const tenantResult = await db.select().from(schema.tenants).where(eq(schema.tenants.id, event.payload.partition));

  // If no tenant found with this partition ID, log and return success
  if (tenantResult.length === 0) {
    console.log(`Partition ${event.payload.partition} not found in tenants table - likely a custom API key case`);
    return Response.json({ message: "success" });
  }

  assert(tenantResult.length === 1, "Failed tenant lookup. More than one tenant.");

  try {
    await db
      .update(schema.tenants)
      .set({ partitionLimitExceeded: true })
      .where(eq(schema.tenants.id, event.payload.partition));
  } catch (error) {
    console.error("Failed to update tenant:", error);
    return Response.json({ error: "Failed to update tenant settings" }, { status: 500 });
  }

  return Response.json({ message: "success" });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-signature");
  if (!signature) {
    return Response.json({ message: "missing signature" }, { status: 400 });
  }

  const buffer = await request.arrayBuffer();

  const isValid = await validateSignature(RAGIE_WEBHOOK_SECRET, buffer, signature);
  if (!isValid) {
    return Response.json({ message: "invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(new TextDecoder("utf-8").decode(buffer)) as WebhookEvent;

  if (
    event.type === "connection_sync_started" ||
    event.type === "connection_sync_progress" ||
    event.type === "connection_sync_finished"
  ) {
    return handleConnectionSyncEvent(event);
  } else if (event.type === "partition_limit_exceeded") {
    return handlePartitionLimitEvent(event);
  } else {
    // Ignore all other webhooks
    return Response.json({ message: "success" });
  }
}
