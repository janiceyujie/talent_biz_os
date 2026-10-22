/**
 * Render's health check (render.yaml), and the deploy's smoke check (scripts/render-deploy.mjs): the server is up,
 * and which commit it runs. Touches nothing else, so a database outage shows as errors on pages rather than the
 * service being restarted.
 */
export function GET() {
  return Response.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT ?? null }, { headers: { "Cache-Control": "no-store" } });
}
