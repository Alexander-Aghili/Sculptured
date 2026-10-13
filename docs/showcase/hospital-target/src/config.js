// Reads shop settings from environment-style strings.

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return Boolean(value);
}

function readConfig(env) {
  return {
    openOnSundays: parseBool(env.SHOP_OPEN_SUNDAYS),
    pageSize: Number(env.SHOP_PAGE_SIZE) || 20,
  };
}

module.exports = { parseBool, readConfig };
