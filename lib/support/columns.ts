import { aiCall, auditLog, calendarConnection, mailConnection, mailDecision, membership, message, person, talent } from "@/lib/db/schema";

// The columns each of the Support page's reads takes (./index.ts), and nothing
// else: ids, statuses, codes, counts, and times. support.test.ts checks none of
// them holds mail or free text: no sender, recipients, subject, body, attachment
// names, audit details, or a job's error text. A new column here is reviewed
// against that.

/** How many of each kind of event the timeline shows, newest first. */
export const TIMELINE_LIMIT = 50;

export const personColumns = { id: person.id, email: person.email, displayName: person.displayName, locale: person.locale, createdAt: person.createdAt };
export const workspaceColumns = { talentId: talent.id, name: talent.name, vertical: talent.vertical, role: membership.role, status: membership.status, joinedAt: membership.createdAt };
export const mailConnectionColumns = {
  id: mailConnection.id,
  talentId: mailConnection.talentId,
  accountEmail: mailConnection.accountEmail, // the person's own mailbox, to check it's the one they meant
  status: mailConnection.status,
  failure: mailConnection.failure,
  historyMode: mailConnection.historyMode,
  historyDoneAt: mailConnection.historyDoneAt,
  watchExpiresAt: mailConnection.watchExpiresAt,
  syncRequestedAt: mailConnection.syncRequestedAt,
  lastSyncedAt: mailConnection.lastSyncedAt,
  createdAt: mailConnection.createdAt,
};
export const calendarConnectionColumns = {
  id: calendarConnection.id,
  talentId: calendarConnection.talentId,
  status: calendarConnection.status,
  lastError: calendarConnection.lastError,
  lastSyncedAt: calendarConnection.lastSyncedAt,
  createdAt: calendarConnection.createdAt,
};
export const auditColumns = { id: auditLog.id, at: auditLog.createdAt, action: auditLog.action, targetType: auditLog.targetType, targetId: auditLog.targetId, actorPersonId: auditLog.actorPersonId };
export const aiCallColumns = { id: aiCall.id, at: aiCall.createdAt, task: aiCall.task, provider: aiCall.provider, model: aiCall.model, status: aiCall.status, failureCode: aiCall.failureCode, latencyMs: aiCall.latencyMs, flags: aiCall.flags, messageId: aiCall.messageId };
export const mailDecisionColumns = {
  id: mailDecision.id,
  at: mailDecision.receivedAt,
  connectionId: mailDecision.connectionId,
  outcome: mailDecision.outcome,
  decidedBy: mailDecision.decidedBy,
  score: mailDecision.score,
  kind: mailDecision.kind,
  fetchFailure: mailDecision.fetchFailure,
  messageId: mailDecision.messageId,
};
export const messageColumns = { id: message.id, at: message.receivedAt, channel: message.channel, kind: message.kind, direction: message.direction, status: message.status, relevance: message.relevance, failure: message.failure, projectId: message.projectId };
/**
 * Graphile Worker's columns for a job that gave up, as output name and source:
 * its private tables, since the public view leaves out the payload. Never
 * last_error, whose text can quote content.
 */
export const failedJobColumns = {
  id: "j.id",
  task_identifier: "t.identifier",
  attempts: "j.attempts",
  max_attempts: "j.max_attempts",
  payload: "j.payload",
  updated_at: "j.updated_at",
} as const;
