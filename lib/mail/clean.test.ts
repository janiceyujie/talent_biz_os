// Cleaning an email for analysis. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { htmlToText, stripQuoted } from "./clean";

describe("HTML to text", () => {
  test("blocks become lines; scripts, styles, and tags go; entities decode", () => {
    const html = `<html><head><style>p{color:red}</style></head><body><p>Hi&nbsp;Mei,</p><div>Fee: NT$12,000 &amp; travel</div><script>x()</script><br>Thanks</body></html>`;
    assert.equal(htmlToText(html), "Hi Mei,\n\nFee: NT$12,000 & travel\n\nThanks");
  });
  test("a link's address is kept when its label doesn't show it", () => {
    assert.equal(htmlToText(`<p>Please <a href="https://sign.example/abc">sign here</a></p>`), "Please sign here (https://sign.example/abc)");
    assert.equal(htmlToText(`<a href="https://x.example">https://x.example</a>`), "https://x.example");
  });
});

describe("quoted history", () => {
  test("Gmail in English, the header wrapped onto two lines", () => {
    const text = "Sounds good, Friday works.\n\nOn Mon, Oct 6, 2026 at 3:14 PM Lin <lin@venue.example>\nwrote:\n> Can you do Friday?";
    assert.equal(stripQuoted(text), "Sounds good, Friday works.");
  });
  test("Gmail in Chinese", () => {
    const text = "好的，那就週五。\n\n林經理 <lin@venue.example> 於 2026年10月6日 週一 下午3:14寫道：\n> 週五可以嗎？";
    assert.equal(stripQuoted(text), "好的，那就週五。");
  });
  test("Outlook's header block, in either language", () => {
    assert.equal(stripQuoted("Confirmed.\n\nFrom: Lin\nSent: Monday\nSubject: Re: show"), "Confirmed.");
    assert.equal(stripQuoted("確認。\n\n寄件者: 林經理\n寄件日期: 2026年10月6日\n主旨: 演出"), "確認。");
  });
  test("a signature stays; a lone From: line in the text doesn't cut", () => {
    const text = "Rate is USD 2,000.\n\n--\nSara Kim\nHarbour Lights Festival\n+1 555 0100\nFrom: the festival team";
    assert.equal(stripQuoted(text), text);
  });
  test("a trailing block of > lines", () => {
    assert.equal(stripQuoted("Yes.\n\n> earlier\n> more"), "Yes.");
  });
  test("a bare forward keeps the forwarded text", () => {
    const text = "---------- Forwarded message ---------\nFrom: Brand <pr@brand.example>\nWe'd like to work with you.";
    assert.equal(stripQuoted(text), text);
  });
});
