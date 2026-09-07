const fs = require("node:fs");
const ts = require("typescript");
const assert = require("node:assert/strict");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
const { normalizeIsbn } = require("../lib/isbn.ts");
const { parseCsv, parseGoodreads } = require("../lib/goodreads.ts");
assert.equal(normalizeIsbn('="9780140328721"'), "9780140328721");
assert.equal(normalizeIsbn("0-14-032872-6"), "9780140328721");
assert.equal(normalizeIsbn("080442957X"), "9780804429573");
assert.equal(normalizeIsbn("9780140328722"), undefined);
assert.equal(normalizeIsbn("not-an-isbn"), undefined);
assert.deepEqual(
  parseCsv('\uFEFFTitle,Review\r\n"A, book","Line one\nHe said ""yes"""\r\n'),
  [
    ["Title", "Review"],
    ["A, book", 'Line one\nHe said "yes"'],
  ],
);
assert.throws(() => parseCsv('"unfinished'), /quoted field/);
assert.throws(() => parseCsv('"closed"oops'), /closing quote/);
assert.throws(() => parseGoodreads("Something,Else\n1,2"), /Goodreads export/);
const result = parseGoodreads(
  'Title,Author,Exclusive Shelf,ISBN13,My Rating,Date Read,Bookshelves,My Review\nBook,Writer,read,9780140328721,4,2026/09/01,"read, favourites","A thoughtful, lovely book"\n,Missing,read,,0,,,\n',
);
assert.equal(result.rows.length, 1);
assert.equal(result.errors.length, 1);
assert.equal(result.rows[0].shelf, "read");
assert.equal(result.rows[0].rating, 4);
assert.equal(result.rows[0].dateFinished, "2026-09-01T12:00:00.000Z");
assert.deepEqual(result.rows[0].customShelves, ["favourites"]);
assert.equal(result.rows[0].importedReview, "A thoughtful, lovely book");
const invalidDate = parseGoodreads(
  "Title,Author,Exclusive Shelf,Date Read\nBook,Writer,to-read,2026/02/31",
);
assert.equal(invalidDate.rows[0].dateFinished, null);
console.log(
  "Passed ISBN checks and CSV parsing, date, shelf, review and malformed-row tests.",
);
