import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { peekMail } from "@/lib/mail/peek";
import { authorized, PEEK_PATH, peekRequest } from "@/lib/mail/worker-api";

// The worker's private endpoint (lib/mail/worker-api.ts): sender and subject
// for Intake's Filtered out and Waiting, read live from Gmail. Locally it
// listens on 127.0.0.1; deployed, on the private network only. Without
// WORKER_SECRET it doesn't start.

const MAX_BODY = 16 * 1024;

export function startHttp(env = process.env) {
  const secret = env.WORKER_SECRET;
  if (!secret) {
    console.warn("worker http: WORKER_SECRET not set; Filtered out and Waiting can't show senders and subjects");
    return null;
  }
  const port = Number(env.WORKER_HTTP_PORT || 3001);
  const host = env.WORKER_HTTP_HOST || "127.0.0.1";
  const server = createServer((req, res) => {
    handle(req, res, secret).catch((e) => {
      console.error("worker http", (e as Error)?.name);
      send(res, 500, { error: "internal" });
    });
  });
  server.listen(port, host, () => console.log(`worker http: listening on ${host}:${port}`));
  return server;
}

async function handle(req: IncomingMessage, res: ServerResponse, secret: string) {
  if (req.method === "GET" && req.url === "/healthz") return send(res, 200, { ok: true });
  if (req.method !== "POST" || req.url !== PEEK_PATH) return send(res, 404, { error: "not_found" });
  if (!authorized(req.headers.authorization, secret)) return send(res, 401, { error: "unauthorized" });
  const parsed = peekRequest.safeParse(await readJson(req));
  if (!parsed.success) return send(res, 400, { error: "invalid" });
  send(res, 200, await peekMail(parsed.data.connectionId, parsed.data.ids));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) return null;
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}
