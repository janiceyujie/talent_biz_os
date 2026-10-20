// What Google posts to the add-on endpoint (HTTP runtime): the open message's
// ids and tokens, the person's tokens, and a button's parameters and form
// fields. Only shape is checked here; who sent it is checked in ./request.ts.
// Pure, no server-only imports.
import { z } from "zod";
import type { Action } from "./cards";

const strings = z.object({ stringInputs: z.object({ value: z.array(z.string()) }).optional() });

const schema = z.object({
  commonEventObject: z
    .object({
      parameters: z.record(z.string(), z.string()).optional(),
      formInputs: z.record(z.string(), strings).optional(),
    })
    .optional(),
  authorizationEventObject: z.object({
    userOAuthToken: z.string().optional(),
    userIdToken: z.string().optional(),
    systemIdToken: z.string().optional(),
  }),
  gmail: z.object({ messageId: z.string().optional(), threadId: z.string().optional(), accessToken: z.string().optional() }).optional(),
});

export type AddonEvent = {
  action: Action | null; // null: the card is opening (homepage or an email opened)
  params: Record<string, string>;
  field: (name: string) => string; // a form field's value, "" when empty
  userToken: string;
  userIdToken: string;
  systemIdToken: string;
  // The open email; null on the homepage. Its thread id when Google sends one (else read from Gmail).
  email: { messageId: string; threadId: string | null; accessToken: string } | null;
};

const actions: Action[] = ["send", "confirmLink", "cancelLink", "unlink", "pickArtist"];

export function parseEvent(body: unknown): AddonEvent | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) return null;
  const e = parsed.data;
  const params = e.commonEventObject?.parameters ?? {};
  const inputs = e.commonEventObject?.formInputs ?? {};
  const g = e.gmail;
  return {
    action: actions.find((a) => a === params.action) ?? null,
    params,
    field: (name) => inputs[name]?.stringInputs?.value[0] ?? params[name] ?? "",
    userToken: e.authorizationEventObject.userOAuthToken ?? "",
    userIdToken: e.authorizationEventObject.userIdToken ?? "",
    systemIdToken: e.authorizationEventObject.systemIdToken ?? "",
    email: g?.messageId && g.accessToken ? { messageId: g.messageId, threadId: g.threadId || null, accessToken: g.accessToken } : null,
  };
}
