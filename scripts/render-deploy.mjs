// Deploys one commit to one environment on Render, in the order that keeps the
// running version working (docs/setup/render.md): the worker first, whose
// pre-deploy step migrates the database, then the web service once the worker
// is live, then a check that the web service answers with that commit.
//
//   RENDER_API_KEY=… WORKER_SERVICE_ID=srv-… WEB_SERVICE_ID=srv-… WEB_URL=https://… \
//     node scripts/render-deploy.mjs <commit>
//
// Run by .github/workflows/deploy.yml. Any failure exits non-zero; what's already
// live stays live, and Render keeps the previous version of a service whose
// deploy failed.

const API = process.env.RENDER_API_URL || "https://api.render.com/v1"; // a stand-in Render in tests
const POLL_MS = Number(process.env.RENDER_POLL_MS || 10_000);
const DEPLOY_LIMIT_MS = 30 * 60_000; // a build, pre-deploy, and switch over
const SMOKE_LIMIT_MS = 3 * 60_000; // Render moves traffic once the new instance is healthy

const DONE = new Set(["live"]);
const FAILED = new Set(["build_failed", "update_failed", "pre_deploy_failed", "canceled", "deactivated"]);

const commit = process.argv[2];
const env = (name) => process.env[name] || fail(`${name} is not set`);

function fail(message) {
  console.error(`deploy: ${message}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function render(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env("RENDER_API_KEY")}`, accept: "application/json", "content-type": "application/json" },
  });
  if (!res.ok && res.status !== 202) fail(`Render answered ${res.status} for ${init.method ?? "GET"} ${path}`);
  return res.status === 202 ? null : res.json();
}

/** Starts a deploy of the commit and returns its id. */
async function trigger(serviceId) {
  const since = Date.now();
  const deploy = await render(`/services/${serviceId}/deploys`, { method: "POST", body: JSON.stringify({ commitId: commit }) });
  if (deploy?.id) return deploy.id;
  // 202: queued behind a deploy already running, without an id. Find it by its commit.
  for (let waited = 0; waited < DEPLOY_LIMIT_MS; waited += POLL_MS) {
    const list = await render(`/services/${serviceId}/deploys?limit=10`);
    const found = list.map((row) => row.deploy).find((d) => d.commit?.id === commit && Date.parse(d.createdAt) >= since - 60_000);
    if (found) return found.id;
    await sleep(POLL_MS);
  }
  fail(`${serviceId}: the queued deploy of ${commit} never appeared`);
}

/** Waits for the deploy to go live; fails on anything else. */
async function untilLive(serviceId, deployId, label) {
  let last;
  for (let waited = 0; waited < DEPLOY_LIMIT_MS; waited += POLL_MS) {
    const { status } = await render(`/services/${serviceId}/deploys/${deployId}`);
    if (status !== last) console.log(`deploy: ${label} ${status}`);
    last = status;
    if (DONE.has(status)) return;
    if (FAILED.has(status)) fail(`${label} ${status}; its previous version keeps running`);
    await sleep(POLL_MS);
  }
  fail(`${label} not live after ${DEPLOY_LIMIT_MS / 60_000} minutes`);
}

/** The web service answers its health check with the deployed commit. */
async function smoke() {
  const url = `${env("WEB_URL").replace(/\/$/, "")}/api/health`;
  let seen;
  for (let waited = 0; waited < SMOKE_LIMIT_MS; waited += POLL_MS) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      seen = res.ok ? (await res.json()).commit : `HTTP ${res.status}`;
      if (seen === commit) return console.log(`deploy: ${url} serves ${commit}`);
    } catch (e) {
      seen = e.name;
    }
    await sleep(POLL_MS);
  }
  fail(`${url} still answers ${seen}, not ${commit}`);
}

if (!/^[0-9a-f]{40}$/.test(commit ?? "")) fail("give the full commit SHA");
for (const [label, id] of [["worker", env("WORKER_SERVICE_ID")], ["web", env("WEB_SERVICE_ID")]]) {
  console.log(`deploy: ${label} ← ${commit}`);
  await untilLive(id, await trigger(id), label);
}
await smoke();
