// Masking a bank or payment-app notice before any model reads it (decision
// 0013, the restricted path, step 2): done in code, never by a model. Account
// and card numbers keep only their last four digits; balances, ID numbers,
// verification codes, and links are replaced. Amounts, dates, and names stay:
// they're what the notice is read for. Pure, no server-only imports.

const balance =
  /(可用餘額|帳戶餘額|帳戶結餘|餘額|結餘|available balance|current balance|balance)([^\d\n]{0,12}?)((?:NT\$|NTD|TWD|US\$|USD|\$)?\s*-?\d[\d,]*(?:\.\d+)?)/gi;
const code = /(驗證碼|認證碼|動態密碼|交易密碼|一次性密碼|OTP|verification code|security code|passcode)([^\d\n]{0,8}?)(\d{4,8})/gi;
// A Taiwan national ID or resident certificate number: a letter, then nine digits or a letter and eight.
const nationalId = /(?<![A-Za-z0-9])[A-Z][A-D1289]\d{8}(?![A-Za-z0-9])/g;
const link = /\b(?:https?:\/\/|www\.)\S+/gi;
// Card numbers written in groups of four.
const cardGroups = /(?<!\d)\d{4}(?: \d{4}){2,3}(?!\d)/g;
// A run of digits (or the bank's own * masking) joined by dashes: an account number when it's long.
const digitRun = /[\d*]+(?:-[\d*]+)*/g;
const isoDate = /^\d{4}-\d{1,2}-\d{1,2}$/;

const lastFour = (run: string) => {
  const digits = run.replace(/[^\d*]/g, "");
  const tail = digits.slice(-4);
  return /^\d{4}$/.test(tail) ? `****${tail}` : "****";
};

/** The notice's text with what it must not pass on masked. Full-width characters are read as their plain forms. */
export function maskNotice(text: string): string {
  return text
    .normalize("NFKC")
    .replace(link, "[link]")
    .replace(balance, (_, label: string, between: string) => `${label}${between}[balance]`)
    .replace(code, (_, label: string, between: string) => `${label}${between}[code]`)
    .replace(nationalId, "[id]")
    .replace(cardGroups, lastFour)
    .replace(digitRun, (run) => (isoDate.test(run) || run.replace(/[^\d*]/g, "").length < 8 ? run : lastFour(run)));
}
