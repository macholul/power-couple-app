/**
 * Sends whatever the database has queued, and runs the daily reminder sweep.
 *
 * Postgres decides what to send (migration 20261030000000): triggers write
 * rows into private.push_outbox, and this function is the only thing that
 * drains them. It claims a batch, hands the notifications to Expo's push
 * service, and reports back what happened, so a notification is either sent
 * or still queued — never half of both.
 *
 * It is called two ways:
 *
 *   {} or {"task":"drain"}   by the app, right after an action that would
 *                            notify the partner, so the notification lands in
 *                            seconds instead of waiting for the next tick. Any
 *                            signed-in caller may ask for this; all it does is
 *                            send what the database already decided to send,
 *                            and the body it sends is not theirs to choose.
 *
 *   {"task":"reminders"}     by the schedule, every 15 minutes, holding the
 *                            secret key. Queues "goals left today" for anyone
 *                            whose own clock just reached their reminder hour,
 *                            tidies the queue, and then drains as usual. This
 *                            is also the safety net for anything the app
 *                            failed to flush.
 *
 * Expo's push service needs no credentials by default. Turning on enhanced
 * security in the EAS dashboard makes it require an access token; set
 * EXPO_ACCESS_TOKEN as a function secret and it is sent.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { secretKey } from '../_shared/secret-key.ts';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo takes at most 100 messages per request. */
const MESSAGES_PER_REQUEST = 100;

/** How many notifications to claim at a time, and how many rounds to do. */
const BATCH_SIZE = 50;
const MAX_ROUNDS = 20;

/** A notification claimed from the queue, with every phone it has to reach. */
interface Claimed {
  id: number;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  tokens: string[];
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  priority: 'high';
  ttl: number;
  interruptionLevel: 'active';
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * A reminder is only about today, and a proof waiting to be confirmed stops
 * being news once the day it belongs to is over. Neither is worth redelivering
 * to a phone that has been off for a week, which is Expo's default.
 */
const ttlFor = (kind: string) => (kind === 'reminder' ? 3 * 60 * 60 : 6 * 60 * 60);

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let at = 0; at < items.length; at += size) chunks.push(items.slice(at, at + size));
  return chunks;
}

/** What one claimed notification turns into: one message per phone. */
function messagesFor(notification: Claimed): ExpoMessage[] {
  return notification.tokens.map((token) => ({
    to: token,
    title: notification.title,
    body: notification.body,
    data: notification.payload,
    sound: 'default',
    priority: 'high',
    ttl: ttlFor(notification.kind),
    interruptionLevel: 'active',
  }));
}

async function askExpo(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  const response = await fetch(EXPO_SEND_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(messages),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`expo ${response.status}: ${text.slice(0, 160)}`);

  let parsed: { data?: ExpoTicket[]; errors?: { message?: string }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`expo sent back something that is not json: ${text.slice(0, 160)}`);
  }
  if (parsed.errors?.length) {
    throw new Error(`expo refused the request: ${parsed.errors[0].message ?? 'no reason given'}`);
  }
  if (!parsed.data || parsed.data.length !== messages.length) {
    throw new Error('expo answered with a different number of tickets than messages sent');
  }
  return parsed.data;
}

interface Outcome {
  sent: number;
  failed: number;
  forgotten: number;
}

/**
 * Claims one batch and sends it. Returns null when the queue is empty, which
 * is how the caller knows to stop.
 *
 * A notification counts as sent once Expo has accepted it for at least one of
 * the recipient's phones, or once every phone it had has turned out to be
 * gone — retrying would only produce the same answer. Anything else leaves it
 * queued for the next round, and claim_push_batch() gives up on it after five
 * tries.
 */
async function drainOnce(db: SupabaseClient): Promise<Outcome | null> {
  const { data, error } = await db.rpc('claim_push_batch', { p_limit: BATCH_SIZE });
  if (error) throw new Error(`could not claim notifications: ${error.message}`);

  const claimed = (data ?? []) as Claimed[];
  if (claimed.length === 0) return null;

  // Notifications nobody can receive any more: finish them without a request.
  const sent = claimed.filter((one) => one.tokens.length === 0).map((one) => one.id);
  const failed: number[] = [];
  const deadTokens = new Set<string>();
  let lastError: string | null = null;

  const addressed = claimed.filter((one) => one.tokens.length > 0);
  const results = new Map(addressed.map((one) => [one.id, { ok: 0, dead: 0, broken: 0 }]));
  const messages = addressed.flatMap((one) =>
    messagesFor(one).map((message) => ({ id: one.id, message })),
  );

  for (const group of chunk(messages, MESSAGES_PER_REQUEST)) {
    let tickets: ExpoTicket[];
    try {
      tickets = await askExpo(group.map((entry) => entry.message));
    } catch (thrown) {
      // The whole request failed, so nothing in it was delivered. Leave every
      // notification it covered queued and stop asking for now.
      lastError = thrown instanceof Error ? thrown.message : String(thrown);
      for (const entry of group) results.get(entry.id)!.broken += 1;
      break;
    }

    tickets.forEach((ticket, at) => {
      const entry = group[at];
      const result = results.get(entry.id)!;
      if (ticket.status === 'ok') {
        result.ok += 1;
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        result.dead += 1;
        deadTokens.add(entry.message.to);
      } else {
        result.broken += 1;
        lastError = ticket.details?.error ?? ticket.message ?? 'expo rejected the notification';
      }
    });
  }

  for (const one of addressed) {
    const result = results.get(one.id)!;
    // A notification nothing was heard back about was never sent: when a
    // request throws, the chunks after it are never made at all, and marking
    // those as sent would lose them silently.
    const answered = result.ok + result.dead + result.broken;
    if (answered > 0 && (result.ok > 0 || result.broken === 0)) sent.push(one.id);
    else failed.push(one.id);
  }

  const { error: finishError } = await db.rpc('finish_push', {
    p_sent: sent,
    p_failed: failed,
    p_error: lastError,
    p_dead_tokens: [...deadTokens],
  });
  if (finishError) throw new Error(`could not record the batch: ${finishError.message}`);

  return { sent: sent.length, failed: failed.length, forgotten: deadTokens.size };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'method not allowed' });

  let task = 'drain';
  if (request.headers.get('content-length') !== '0') {
    try {
      const body = await request.json();
      if (body && typeof body.task === 'string') task = body.task;
    } catch {
      // an empty or unreadable body means "just drain", which is the default
    }
  }
  if (task !== 'drain' && task !== 'reminders') {
    return reply(400, { error: 'task must be "drain" or "reminders"' });
  }

  const key = secretKey();
  // The platform has already verified the token; this only asks whether the
  // caller is the schedule rather than somebody's phone.
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (task === 'reminders' && bearer !== key) {
    return reply(403, { error: 'only the schedule may run the reminder sweep' });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let queued = 0;
  if (task === 'reminders') {
    const [reminders, pruned] = await Promise.all([
      db.rpc('enqueue_streak_reminders'),
      db.rpc('prune_push_outbox'),
    ]);
    if (reminders.error) {
      console.error('reminder sweep failed', reminders.error.message);
      return reply(500, { error: 'could not queue reminders' });
    }
    if (pruned.error) console.error('pruning the queue failed', pruned.error.message);
    queued = (reminders.data as number | null) ?? 0;
  }

  const total: Outcome = { sent: 0, failed: 0, forgotten: 0 };
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const outcome = await drainOnce(db);
      if (!outcome) break;
      total.sent += outcome.sent;
      total.failed += outcome.failed;
      total.forgotten += outcome.forgotten;
      // Expo could not be reached, or refused: the rest stays queued for the
      // next tick rather than being hammered now.
      if (outcome.failed > 0) break;
    }
  } catch (thrown) {
    console.error('draining failed', thrown instanceof Error ? thrown.message : thrown);
    return reply(500, { error: 'could not send notifications', queued, ...total });
  }

  return reply(200, { queued, ...total });
});
