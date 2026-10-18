/** Parse explicit numeric calendar input without guessing month/day order or changing zones. */
export function parseDateInput(input: string): string | null {
  const text=input.normalize("NFKC").trim();
  if (!text) return "";
  const m=/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text) || /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (!m) return null;
  const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
  if(y<1000 || y>9999 || month<1 || month>12 || day<1) return null;
  const count=new Date(Date.UTC(y,month,0)).getUTCDate();
  return day<=count ? `${y}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}` : null;
}
export function parseTimeInput(input: string): string | null {
  const text=input.normalize("NFKC").trim().toLowerCase().replace(/\s+/g,"");
  if (!text) return "";
  const m=/^(\d{1,4})(?::(\d{1,2}))?(am|pm)?$/.exec(text);
  if(!m)return null;
  let hour:number,minute:number;
  if(m[2] !== undefined) {if(m[1].length>2)return null;hour=Number(m[1]);minute=Number(m[2]);}
  else if(m[1].length>2) {hour=Number(m[1].slice(0,-2));minute=Number(m[1].slice(-2));}
  else {hour=Number(m[1]);minute=0;}
  if(m[3]) {if(hour<1||hour>12)return null;hour=hour%12+(m[3]==="pm"?12:0);}
  if(hour>23||minute>59)return null;
  return `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
}
export function addDateDays(date: string, days: number) {
  const next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+days);
  const value=next.toISOString().slice(0,10);return parseDateInput(value) ? value : date;
}
export function addDateMonths(date: string, months: number) {
  const d=new Date(`${date}T12:00:00Z`), day=d.getUTCDate();
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
  const count=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(day,count));const value=d.toISOString().slice(0,10);return parseDateInput(value) ? value : date;
}
export const halfHourTimes=Array.from({length:48},(_,i)=>`${String(Math.floor(i/2)).padStart(2,"0")}:${i%2?"30":"00"}`);
