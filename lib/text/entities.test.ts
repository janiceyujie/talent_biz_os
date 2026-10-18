import assert from "node:assert/strict";
import {test} from "node:test";
import {decodeEntities,decodeSourceText} from "./entities";
test("public source decimal, hexadecimal and nested escapes become readable text",()=>{
 assert.equal(decodeSourceText("116&#40;Reading&#41; &amp; Culture &#x2014; &#x1f3b5;"),"116(Reading) & Culture — 🎵");
 assert.equal(decodeSourceText("&amp;#40;116&amp;#41; &amp;amp;"),"(116) &");
 assert.equal(decodeEntities("&amp;lt;title&amp;gt;"),"&lt;title&gt;");
});
test("unknown entities and invalid scalar values never crash decoding",()=>{
 for(const text of ["&unknown;","&#0;","&#xD800;","&#1114112;","&#9999999999999999999999;"])assert.equal(decodeEntities(text),text);
 assert.equal(decodeSourceText("&lt;img src=x onerror=alert(1)&gt;"),"<img src=x onerror=alert(1)>");
});
