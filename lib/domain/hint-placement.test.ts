import { test } from "node:test";
import assert from "node:assert/strict";
import { placeHint } from "./hint-placement";

test("help stays within both screen edges and flips above a low trigger", () => {
  const viewport = { left: 0, top: 0, width: 390, height: 600 };
  const size = { width: 358, height: 120 };
  for (const left of [0, 200, 380]) {
    const point = placeHint({ left, top: 540, bottom: 568 }, size, viewport);
    assert.ok(point.left >= 16 && point.left + size.width <= 374);
    assert.ok(point.top + point.maxHeight <= 534);
  }
});
test("long help is height-limited in a short viewport", () => {
  const point = placeHint({ left: 160, top: 100, bottom: 128 }, { width: 280, height: 900 }, { left: 0, top: 0, width: 320, height: 240 });
  assert.equal(point.maxHeight, 90);
  assert.ok(point.top >= 16 && point.top + point.maxHeight <= 224);
});
test("zoomed visual viewport offsets and a preferred upper placement are respected", () => {
  const point = placeHint({ left: 650, top: 450, bottom: 478 }, { width: 250, height: 100 }, { left: 400, top: 200, width: 300, height: 400 }, true);
  assert.ok(point.left >= 416 && point.left + 250 <= 684);
  assert.equal(point.top, 344);
});
test("an upper preference falls below when the top has no room", () => {
  const point = placeHint({ left: 20, top: 20, bottom: 48 }, { width: 250, height: 150 }, { left: 0, top: 0, width: 390, height: 600 }, true);
  assert.equal(point.top, 54);
  assert.equal(point.maxHeight, 150);
});
