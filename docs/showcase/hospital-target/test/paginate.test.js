const test = require("node:test");
const assert = require("node:assert/strict");
const { paginate } = require("../src/paginate");

const items = Array.from({ length: 25 }, (_, i) => i + 1);

test("a page keeps the number it was asked for", () => {
  assert.equal(paginate(items, 2, 10).page, 2);
});

// Exposes HOSP-5. Remove `todo` when fixing it.
test("page 1 starts at the first item", { todo: "HOSP-5" }, () => {
  assert.deepEqual(paginate(items, 1, 10).items, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

// Exposes HOSP-5. Remove `todo` when fixing it.
test("a partly full last page is counted", { todo: "HOSP-5" }, () => {
  assert.equal(paginate(items, 1, 10).totalPages, 3);
  assert.deepEqual(paginate(items, 3, 10).items, [21, 22, 23, 24, 25]);
});
