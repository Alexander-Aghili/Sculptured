// Small date helpers. Days are local-time calendar days.

function isWeekend(date) {
  const day = date.getDay();
  return day === 6 || day === 7;
}

function addDays(date, days) {
  const out = new Date(date.getTime());
  out.setDate(out.getDate() + days);
  return out;
}

module.exports = { isWeekend, addDays };
