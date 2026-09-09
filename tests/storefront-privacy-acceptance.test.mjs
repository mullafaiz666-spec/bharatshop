import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src=readFileSync(new URL("../scripts/storefront-privacy-acceptance.mjs",import.meta.url),"utf8");

test("storefront acceptance validates fashion only when fashion is published",()=>{
  assert.match(src,/find\(p=>p\.madeToOrder\)/);
  assert.match(src,/fashion gallery validation is conditional/);
  assert.match(src,/no made-to-order fashion is currently published/);
  assert.doesNotMatch(src,/fashion products exist for gallery test/);
});
