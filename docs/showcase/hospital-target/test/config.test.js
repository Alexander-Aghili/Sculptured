const test = require("node:test");
const assert = require("node:assert/strict");
const { parseBool, readConfig } = require("../src/config");

test("a missing value uses the fallback", () => {
  assert.equal(parseBool(undefined, true), true);
  assert.equal(parseBool("", false), false);
});

test("true means true", () => {
  assert.equal(parseBool("true"), true);
  assert.equal(readConfig({ SHOP_PAGE_SIZE: "50" }).pageSize, 50);
});

// Exposes HOSP-6. Remove `todo` when fixing it.
test("false, 0, no and off mean false", { todo: "HOSP-6" }, () => {
  for (const v of ["false", "FALSE", "0", "no", "off"]) assert.equal(parseBool(v, true), false, v);
  assert.equal(readConfig({ SHOP_OPEN_SUNDAYS: "false" }).openOnSundays, false);
});
