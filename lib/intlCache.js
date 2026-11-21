// Building an Intl formatter is slow (tens of microseconds each); using one is fast.
// Screens and reports format thousands of dates, so formatters are made once per
// locale + options and reused. Works the same in the browser and on the server.

const dateFormats = new Map();
const numberFormats = new Map();
const relativeFormats = new Map();

function cached(store, Ctor, loc, opts) {
  const key = `${loc}|${opts ? JSON.stringify(opts) : ""}`;
  let f = store.get(key);
  if (!f) {
    f = new Ctor(loc, opts);
    store.set(key, f);
  }
  return f;
}

export const dateFormat = (loc, opts) => cached(dateFormats, Intl.DateTimeFormat, loc, opts);
export const numberFormat = (loc, opts) => cached(numberFormats, Intl.NumberFormat, loc, opts);
export const relativeFormat = (loc, opts) => cached(relativeFormats, Intl.RelativeTimeFormat, loc, opts);
