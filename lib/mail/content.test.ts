import test from "node:test";
import assert from "node:assert/strict";
import { plainText } from "./content";
const part = (text:string) => ({mimeType:"text/plain",body:{data:Buffer.from(text).toString("base64url")}});
test("plain text import rejects oversized, invalid, HTML-only and unsupported charset content",()=>{
  for(const input of [{mimeType:"text/html",body:{data:"SGk"}},part("a".repeat(50_001)),{...part("Hi"),headers:[{name:"Content-Type",value:"text/plain; charset=Big5"}]},{mimeType:"text/plain",body:{data:"!bad"}},{mimeType:"text/plain",body:{data:"_w"}}])assert.throws(()=>plainText(input));
});
test("MIME import excludes attachments, HTML, and attached forwarded messages",()=>{
  assert.equal(plainText({mimeType:"multipart/mixed",parts:[part("Work invite"),{...part("private file"),filename:"private.txt"},{mimeType:"message/rfc822",parts:[part("forwarded private mail")]},{mimeType:"text/html",body:{data:Buffer.from("<script>bad</script>").toString("base64url")}}]}),"Work invite");
  assert.equal(plainText(part("合作邀約\r\n請確認")),"合作邀約\n請確認");
  assert.throws(()=>plainText({mimeType:"multipart/mixed",parts:Array.from({length:101},()=>part("Hi"))}));
  let nested:unknown=part("Hi");for(let i=0;i<12;i++)nested={mimeType:"multipart/mixed",parts:[nested]};assert.throws(()=>plainText(nested));
});
