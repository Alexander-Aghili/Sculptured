const test = require("node:test");
const assert = require("node:assert/strict");
const { isWeekend, addDays } = require("../src/dates");

test("Saturday is a weekend day and Wednesday is not", () => {
  assert.equal(isWeekend(new Date(2026, 9, 10)), true); // Sat 10 Oct 2026
  assert.equal(isWeekend(new Date(2026, 9, 14)), false); // Wed 14 Oct 2026
});

test("addDays returns a new date and leaves the original alone", () => {
  const start = new Date(2026, 9, 10);
  const later = addDays(start, 3);
  assert.equal(later.getDate(), 13);
  assert.equal(start.getDate(), 10);
});

// Exposes HOSP-3. Remove `todo` when fixing it.
test("Sunday is a weekend day", { todo: "HOSP-3" }, () => {
  assert.equal(isWeekend(new Date(2026, 9, 11)), true); // Sun 11 Oct 2026
});
