/** Only allow cancellation back to a workspace screen, never an external URL or onboarding loop. */
export function roleReturnHref(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !/^\/(?:$|(?:inbox|projects|drafts|finance|assistant|contacts|files|calendar|partners|settings)(?:[/?#]|$))/.test(value) || /[\\\s]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://workspace.invalid");
    if (url.origin !== "https://workspace.invalid" || !/^\/(?:$|(?:inbox|projects|drafts|finance|assistant|contacts|files|calendar|partners|settings)(?:[/?#]|$))/.test(url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch { return "/"; }
}
