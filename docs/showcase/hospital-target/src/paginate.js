// Pages are numbered from 1.

function paginate(items, page, size) {
  const start = page * size;
  return {
    items: items.slice(start, start + size),
    page,
    totalPages: Math.floor(items.length / size),
  };
}

module.exports = { paginate };
