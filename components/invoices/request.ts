export async function invoiceRequest<T>(
  url: string,
  data?: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method: data ? "POST" : "GET",
    cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || "unavailable");
  return value;
}
