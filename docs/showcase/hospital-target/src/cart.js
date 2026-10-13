// A shopping cart: a list of { id, price (cents), qty } lines.

function addItem(cart, item) {
  const line = cart.find((l) => l.id === item.id);
  if (line) line.qty += item.qty || 1;
  else cart.push({ id: item.id, price: item.price, qty: item.qty || 1 });
  return cart;
}

function removeItem(cart, id) {
  const index = cart.findIndex((l) => l.id === id);
  cart.splice(index, 1);
  return cart;
}

// Total in cents.
function total(cart) {
  return cart.reduce((sum, l) => sum + l.price, 0);
}

module.exports = { addItem, removeItem, total };
