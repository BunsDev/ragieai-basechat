import { CoreMessage } from "ai";
import assertNever from "assert-never";
import { NextRequest } from "next/server";

import ConversationManager from "@/app/api/slack/webhooks/conversation-manager";
import { generatorFactory } from "@/app/api/slack/webhooks/generator";
import MessageDAO from "@/app/api/slack/webhooks/message-dao";
import { conversationMessagesResponseSchema, createConversationMessageRequestSchema } from "@/lib/api";
import { DEFAULT_MODEL, DEFAULT_PROVIDER, getProviderForModel } from "@/lib/llm/types";
import { createConversationMessage, getConversation, getConversationMessages } from "@/lib/server/service";
import { requireAuthContextFromRequest } from "@/lib/server/utils";

import { generate, renderGroundingSystemPrompt, getRetrievalSystemPrompt, FAILED_MESSAGE_CONTENT } from "./utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const { profile, tenant } = await requireAuthContextFromRequest(request);
  const { conversationId } = await params;
  const messages = await getConversationMessages(tenant.id, profile.id, conversationId);

  return Response.json(conversationMessagesResponseSchema.parse(messages));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const { profile, tenant } = await requireAuthContextFromRequest(request);
  const { conversationId } = await params;
  const json = await request.json();

  const {
    content,
    model: modelInJson,
    isBreadth,
    rerankEnabled,
    prioritizeRecent,
  } = createConversationMessageRequestSchema.parse(json);

  let provider = getProviderForModel(modelInJson);
  let model = modelInJson;
  if (!provider || !tenant.enabledModels.includes(modelInJson)) {
    console.log(`Invalid model or model not enabled for tenant: ${model}`);
    console.log(`Using default model: ${DEFAULT_MODEL} and default provider: ${DEFAULT_PROVIDER}`);
    provider = DEFAULT_PROVIDER;
    model = DEFAULT_MODEL;
  }

  const conversation = await getConversation(tenant.id, profile.id, conversationId);
  const generator = generatorFactory(model);
  const manager = new ConversationManager(tenant, new MessageDAO(tenant.id), conversation, generator);
  await manager.add(profile, content);
  const [stream, messageId] = await manager.generateStream();

  if (!stream) {
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(JSON.stringify({ usedSourceIndexes: [], message: FAILED_MESSAGE_CONTENT })),
          );
          controller.close();
        },
      }),
      {
        headers: {
          "x-message-id": messageId,
          "x-model": model,
        },
      },
    );
  }
  return stream.toTextStreamResponse({ headers: { "x-message-id": messageId, "x-model": model } });
}
