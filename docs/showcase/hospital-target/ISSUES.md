# Open issues

Each issue below is one dispatch item for the coding-hospital team. The Triage Nurse dispatches one
item per issue (id, title, context). Issues HOSP-1 to HOSP-7 each have a test marked
`{ todo: "HOSP-n" }` that fails today; `npm test` stays green on `main` because todo tests don't fail
the run. Fixing an issue means removing that `todo` and making the test pass.

## HOSP-1: Cart total ignores quantity
A customer with 3 boxes of tea (450 each) and 1 jam (300) is charged 750 instead of 1650.
`total()` in `src/cart.js` adds one price per line. Test: `test/cart.test.js`.

## HOSP-2: Removing a product that isn't in the cart deletes the last line
Clicking "remove" on a stale cart row (product already gone) removes a different product.
`removeItem()` in `src/cart.js`. Test: `test/cart.test.js`.

## HOSP-3: Sunday isn't treated as a weekend day
Weekend opening hours never apply on Sundays. `isWeekend()` in `src/dates.js`.
Test: `test/dates.test.js`.

## HOSP-4: Truncated product titles are one character too long
Listing cards overflow: `truncate(s, 10)` returns 11 characters. The single "…" character is
intended (see HOSP-8), but the whole result must fit in `max`. `src/text.js`. Test: `test/text.test.js`.

## HOSP-5: Pagination skips the first page and loses the last one
Page 1 shows items 11–20, and a catalogue of 25 items reports 2 pages, so items 21–25 can't be
reached. Pages are numbered from 1. `src/paginate.js`. Tests: `test/paginate.test.js` (two).

## HOSP-6: SHOP_OPEN_SUNDAYS=false opens the shop on Sundays
`parseBool("false")` returns `true`. "false", "0", "no" and "off" (any case) should be false.
`src/config.js`. Test: `test/config.test.js`.

## HOSP-7: Upload names can escape the uploads folder
`resolveUpload(base, "../../etc/passwd")` returns a path outside `base`; so does an absolute
name. It should throw for any name that resolves outside `base`. Security-relevant.
`src/uploads.js`. Test: `test/uploads.test.js`.

## HOSP-8: Truncated titles end with "…" instead of "..."
A user reports that cut titles end with the single ellipsis character rather than three dots.
This is the documented behaviour (comment on `truncate()` in `src/text.js`, and the passing test
"a cut ends with the single ellipsis character"). Expected triage: not a bug.
