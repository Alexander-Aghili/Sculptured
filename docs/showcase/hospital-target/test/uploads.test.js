const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { resolveUpload } = require("../src/uploads");

const base = path.resolve("/srv/shop/uploads");

test("a plain file name lands inside the uploads folder", () => {
  assert.equal(resolveUpload(base, "tea.jpg"), path.join(base, "tea.jpg"));
});

// Exposes HOSP-7. Remove `todo` when fixing it.
test("a name that climbs out of the uploads folder is refused", { todo: "HOSP-7" }, () => {
  assert.throws(() => resolveUpload(base, "../../etc/passwd"));
  assert.throws(() => resolveUpload(base, "/etc/passwd"));
});
