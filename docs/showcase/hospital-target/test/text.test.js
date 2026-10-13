const test = require("node:test");
const assert = require("node:assert/strict");
const { slugify, truncate } = require("../src/text");

test("slugify makes lowercase, dash-separated slugs", () => {
  assert.equal(slugify("  Earl Grey -- Loose Leaf! "), "earl-grey-loose-leaf");
});

test("short text is not truncated", () => {
  assert.equal(truncate("Tea", 10), "Tea");
});

test("a cut ends with the single ellipsis character", () => {
  assert.ok(truncate("Earl Grey loose leaf tea", 10).endsWith("…"));
});

// Exposes HOSP-4. Remove `todo` when fixing it.
test("truncated text is never longer than max", { todo: "HOSP-4" }, () => {
  assert.equal(truncate("Earl Grey loose leaf tea", 10).length, 10);
});
