const test = require("node:test");
const assert = require("node:assert/strict");
const { addItem, removeItem, total } = require("../src/cart");

test("adding the same product twice raises its quantity", () => {
  const cart = addItem(addItem([], { id: "tea", price: 450 }), { id: "tea", price: 450 });
  assert.deepEqual(cart, [{ id: "tea", price: 450, qty: 2 }]);
});

test("removing a product takes its line out", () => {
  const cart = removeItem([{ id: "tea", price: 450, qty: 1 }, { id: "jam", price: 300, qty: 1 }], "tea");
  assert.deepEqual(cart.map((l) => l.id), ["jam"]);
});

// Exposes HOSP-1. Remove `todo` when fixing it.
test("the total counts every unit, not one per line", { todo: "HOSP-1" }, () => {
  assert.equal(total([{ id: "tea", price: 450, qty: 3 }, { id: "jam", price: 300, qty: 1 }]), 1650);
});

// Exposes HOSP-2. Remove `todo` when fixing it.
test("removing a product that is not in the cart changes nothing", { todo: "HOSP-2" }, () => {
  const cart = removeItem([{ id: "tea", price: 450, qty: 1 }, { id: "jam", price: 300, qty: 1 }], "bread");
  assert.deepEqual(cart.map((l) => l.id), ["tea", "jam"]);
});
