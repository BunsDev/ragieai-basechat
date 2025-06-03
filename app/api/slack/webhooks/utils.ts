import { openai } from "@ai-sdk/openai";
import { GenericMessageEvent } from "@slack/web-api";
import { generateObject } from "ai";
import Handlebars from "handlebars";
import { z } from "zod";

import { auth } from "@/auth";
import { ConversationMessageResponse } from "@/lib/server/conversation-context";
import {
  createProfile,
  findProfileByTenantIdAndUserId,
  findUserById,
  findUserBySlackUserId,
  getTenantBySlackTeamId,
} from "@/lib/server/service";

// TODO: Clean this up and add tests
export async function slackSignIn(teamId: string, slackUserId: string) {
  const tenant = await getTenantBySlackTeamId(teamId);
  let user = await findUserBySlackUserId(slackUserId);
  if (!user) {
    const data = await auth.api.signInAnonymous();
    if (!data) {
      throw new Error("Could not sign in");
    }
    user = await findUserById(data.user.id);
    if (!user) {
      throw new Error("Could not find user");
    }
  }
  let profile = await findProfileByTenantIdAndUserId(tenant.id, user!.id);
  if (!profile) {
    profile = await createProfile(tenant.id, user.id, "guest");
  }
  return { tenant, profile };
}

export async function shouldReplyToMessage(question?: string) {
  if (!question) {
    console.log(`Skipping message with no text`);
    return false;
  }
  return await isQuestion(question);
}

const IS_QUESTION_PROMPT = Handlebars.compile(`Is the follow text a question?

<text>{{text}}</text>

Answer in the form of a json object.  If the text is a question, answer with:
{"isQuestion": true}

If the text is NOT a question, answer with:
{"isQuestion:" false}`);

const isQuestionSchema = z.object({ isQuestion: z.boolean() });

async function isQuestion(text: string) {
  const { object } = await generateObject({
    model: openai("gpt-4.1-nano-2025-04-14"),
    prompt: IS_QUESTION_PROMPT({ text }),
    schema: isQuestionSchema,
  });
  return object.isQuestion;
}

export function formatMessageWithSources(object: ConversationMessageResponse, replyContext: ReplyContext): string {
  let messageText = object.message;
  if (object.usedSourceIndexes && object.usedSourceIndexes.length > 0) {
    messageText += "\n\n📚 *Sources:*";
    object.usedSourceIndexes.forEach((index) => {
      const source = replyContext.sources[index];
      messageText += `\n• <${source.source_url}|${source.documentName}>`;
    });
  }
  return messageText;
}
