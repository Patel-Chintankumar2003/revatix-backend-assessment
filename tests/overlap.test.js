const test = require("node:test");
const assert = require("node:assert/strict");
const overlaps = (a, b) => a.start < b.end && a.end > b.start;
test("overlap algorithm rejects identical, partial, contained and containing intervals", () => {
  const x = { start: 9, end: 17 };
  assert(overlaps(x, { start: 9, end: 17 }));
  assert(overlaps(x, { start: 16, end: 20 }));
  assert(overlaps(x, { start: 10, end: 12 }));
  assert(overlaps({ start: 8, end: 18 }, x));
});
test("adjacent and overnight intervals are correctly handled", () => {
  assert(!overlaps({ start: 9, end: 17 }, { start: 17, end: 22 }));
  const overnight = {
    start: Date.parse("2026-10-12T22:00Z"),
    end: Date.parse("2026-10-13T06:00Z"),
  };
  assert(
    overlaps(overnight, {
      start: Date.parse("2026-10-13T05:00Z"),
      end: Date.parse("2026-10-13T07:00Z"),
    }),
  );
});
