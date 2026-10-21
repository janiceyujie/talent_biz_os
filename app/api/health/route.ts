/** Render's health check (render.yaml): the server is up. Touches nothing else, so a database outage shows as errors on pages rather than the service being restarted. */
export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
