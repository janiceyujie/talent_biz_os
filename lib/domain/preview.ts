/** Preview fixtures must never reach a workspace mutation. */
export async function runWorkspaceMutation(preview: boolean, action: () => Promise<string | null>, blocked: string) {
  if (preview) return blocked;
  return action();
}
