/** Never let the local template import touch a remote database or bucket. */
export function assertLocalTemplateStore(database: string | undefined, storage: string | undefined) {
  const local = new Set(["localhost", "127.0.0.1", "[::1]"]);
  try {
    const db = new URL(database ?? "");
    const files = new URL(storage ?? "");
    if (["postgres:", "postgresql:"].includes(db.protocol) && ["http:", "https:"].includes(files.protocol)
      && local.has(db.hostname) && local.has(files.hostname)) return;
  } catch { /* Invalid or absent configuration fails closed. */ }
  throw new Error("Template import requires a local PostgreSQL database and local storage endpoint");
}
