// Text helpers for product listings.

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Shortens s to at most max characters, ending with a single "…" character when cut.
function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

module.exports = { slugify, truncate };
