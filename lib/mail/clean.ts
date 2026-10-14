// An email's text as the analysis should read it (decision 0013): plain text
// from HTML, and only what this email adds, with the quoted history of earlier
// replies stripped. The signature stays: it often carries the sender's company
// and phone. Pure, no server-only imports.

const blockTags = /<\/?(p|div|br|li|ul|ol|tr|table|h[1-6]|blockquote|section|article|header|footer)\b[^>]*>/gi;
const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HTML to readable text: blocks become line breaks, scripts and styles go, entities are decoded. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) =>
        // Keep where a link goes when its label doesn't say: a contract or a form often is the link.
        /^https?:/i.test(href) && !label.replace(/<[^>]+>/g, "").includes(href) ? `${label} (${href})` : label,
      )
      .replace(blockTags, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] !== "#") return named[e.toLowerCase()] ?? whole;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
  });
}

// Where a reply's quoted history starts, in the forms mail apps write it.
const historyHeaders = [
  /^On .{4,200}wrote:\s*$/, // Gmail, Apple Mail; may wrap onto two lines, so it's also tried joined
  /^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}\s*$/i,
  /^-{2,}\s*(原始郵件|轉寄的郵件|原始邮件|转发的邮件)\s*-{2,}\s*$/,
  /^.{0,80}(於|在).{4,80}(寫道|写道)[:：]\s*$/, // Gmail in Chinese: on <date>, <name> wrote
  /^\d{4}[年/-]\d{1,2}[月/-]\d{1,2}.{0,60}(寫道|写道)[:：]\s*$/,
];
// Outlook's header block: a From line directly followed by a Sent or Date line.
const outlookFrom = /^(From|寄件者|發件人)[:：]/;
const outlookSent = /^(Sent|Date|寄件日期|日期|發送時間)[:：]/;

/**
 * The new part of a reply: everything before its quoted history. A message
 * that is only a forward keeps the forwarded text, which is then what it says.
 */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const starts = (i: number) => {
    const line = lines[i].trim();
    const next = lines[i + 1]?.trim() ?? "";
    if (historyHeaders.some((p) => p.test(line) || p.test(`${line} ${next}`))) return true;
    if (outlookFrom.test(line) && outlookSent.test(next)) return true;
    return line.startsWith(">") && lines.slice(i).every((l) => !l.trim() || l.trim().startsWith(">")); // a trailing quote block
  };
  const cut = lines.findIndex((_, i) => starts(i));
  const kept = (cut < 0 ? lines : lines.slice(0, cut)).join("\n").trim();
  // Only a forward or a quote, with nothing new: keep it all rather than nothing.
  return kept || text.trim();
}
