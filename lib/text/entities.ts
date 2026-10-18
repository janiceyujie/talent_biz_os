const named: Record<string, string> = {amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",ndash:"–",mdash:"—",hellip:"…",lsquo:"‘",rsquo:"’",ldquo:"“",rdquo:"”",bull:"•",copy:"©",reg:"®",trade:"™"};
/** Decode one layer without interpreting the result as markup. Unknown entities stay intact. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if(entity[0]!=="#") return named[entity.toLowerCase()] ?? whole;
    const code=/^#x/i.test(entity)?parseInt(entity.slice(2),16):Number(entity.slice(1));
    return Number.isInteger(code)&&code>0&&code<0x110000&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):whole;
  });
}
/** Some public feeds escape twice. Keep the work bounded and always render as text. */
export function decodeSourceText(text: string): string {
  let value=text;
  for(let i=0;i<3;i++){const next=decodeEntities(value);if(next===value)break;value=next;}
  return value;
}
