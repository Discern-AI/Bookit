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

const {
  validDate,
  shiftDay,
  readingStats,
  estimateDays,
  parseReadingIntent,
} = require("../lib/reading.ts");
assert.equal(validDate("2026-02-31"), false);
assert.equal(validDate("2024-02-29"), true);
assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
const session = (id, date, start, end) => ({
  id,
  date: `${date}T12:00:00.000Z`,
  pageStart: start,
  pageEnd: end,
  note: null,
  timeStart: null,
  timeEnd: null,
});
const history = [
  session("3", "2026-09-08", 45, 60),
  session("2", "2026-09-07", 20, 45),
  session("1", "2026-09-06", 0, 20),
];
assert.deepEqual(
  readingStats(
    history,
    [{ dateFinished: "2026-09-08T12:00:00Z" }],
    "2026-09-08",
  ),
  { pages: 60, books: 1, streak: 3, averageSession: 20, pagesThisWeek: 60 },
);
assert.equal(readingStats(history, [], "2026-09-09").streak, 3);
assert.equal(readingStats(history, [], "2026-09-10").streak, 0);
assert.equal(
  readingStats(
    [session("1", "2025-12-31", 0, 20), session("2", "2026-01-01", 20, 45)],
    [],
    "2026-01-01",
  ).pages,
  25,
);
assert.equal(estimateDays(history, 60, 100, "2026-09-08"), 2);
assert.equal(estimateDays(history.slice(0, 1), 60, 100, "2026-09-08"), null);
assert.equal(parseReadingIntent("What should I read next?"), null);
assert.equal(parseReadingIntent("I read another 30 pages").pages, 30);
assert.equal(parseReadingIntent("Read to page 214").pageEnd, 214);
assert.equal(parseReadingIntent("Stopped at 214").pageEnd, 214);
assert.equal(parseReadingIntent("Log 37 pages - stopped at 214").pages, 37);
assert.equal(parseReadingIntent("Log 37 pages - stopped at 214").pageEnd, 214);
assert.equal(
  parseReadingIntent("I read from page 10 to page 42 yesterday").pageStart,
  10,
);
assert.equal(
  parseReadingIntent("I read from page 10 to page 42 yesterday").yesterday,
  true,
);
assert.equal(parseReadingIntent("Finished chapter 12").pageEnd, undefined);
console.log(
  "Passed reading dates, yearly totals, streaks, pace and logging-intent tests.",
);

const { pathSchema } = require("../lib/path-schema.ts");
const draftPath = { title: "  Into a subject  ", description: "", isPublic: false, entries: [] };
assert.equal(pathSchema.parse(draftPath).title, "Into a subject");
assert.equal(pathSchema.safeParse({ ...draftPath, isPublic: true }).success, false);
assert.equal(pathSchema.safeParse({ ...draftPath, entries: [{ workId: "a", note: "" }, { workId: "a", note: "again" }] }).success, false);
const pathEntries = Array.from({ length: 100 }, (_, i) => ({ workId: `work-${i}`, note: "" }));
assert.equal(pathSchema.safeParse({ ...draftPath, isPublic: true, entries: pathEntries }).success, true);
assert.equal(pathSchema.safeParse({ ...draftPath, entries: [...pathEntries, { workId: "extra", note: "" }] }).success, false);
assert.equal(pathSchema.safeParse({ ...draftPath, entries: [{ workId: "a", note: "x".repeat(2001) }] }).success, false);
console.log("Passed reading-path publishing, duplicate-work and size validation.");

const { parseEdition, languageName } = require("../lib/edition-metadata.ts");
const sourceEdition = { key: "/books/OL123M", title: "A translated edition", works: [{ key: "/works/OL123W" }], languages: [{ key: "/languages/fre" }, { key: "/languages/fre" }], isbn_10: ["0-14-032872-6"], physical_format: "Hardcover", number_of_pages: 200, contributors: [{ name: "A Translator", role: "Translator" }, { name: "An Editor", role: "Editor" }] };
const metadata = parseEdition(sourceEdition);
assert.equal(metadata.isbn13, "9780140328721");assert.deepEqual(metadata.languages, ["fre"]);assert.deepEqual(metadata.translators, ["A Translator"]);assert.equal(metadata.format, "hardback");assert.equal(languageName("fre"), "French");
assert.equal(parseEdition({ ...sourceEdition, physical_format: "Unrecognised", number_of_pages: -1 }).format, "unknown");assert.equal(parseEdition({ ...sourceEdition, number_of_pages: -1 }).pageCount, null);
assert.equal(parseEdition({ key: "/books/../../secret", title: "Bad" }), null);assert.equal(parseEdition(null), null);
assert.deepEqual(parseEdition({ ...sourceEdition, languages: [{ key: "eng" }], contributors: [{ name: "Editor", role: "Translation editor" }] }).translators, []);
console.log("Passed edition identifiers, ISBNs, languages, translator roles and unknown metadata checks.");

const { parsePounds, nextOccasion, giftSchema } = require("../lib/gifts.ts");
assert.equal(parsePounds("12.34"),1234);assert.equal(parsePounds("0"),0);assert.equal(parsePounds(""),null);assert.equal(parsePounds("1.234"),undefined);assert.equal(parsePounds("-1"),undefined);assert.equal(parsePounds("1e2"),undefined);
const leapOccasion={id:"00000000-0000-4000-8000-000000000001",label:"Birthday",date:"2000-02-29",annual:true,dismissedFor:null};
assert.equal(nextOccasion(leapOccasion,"2027-02-27").occurrence,"2027-02-28");assert.equal(nextOccasion(leapOccasion,"2028-02-28").occurrence,"2028-02-29");assert.equal(nextOccasion(leapOccasion,"2027-03-01").occurrence,"2028-02-29");assert.equal(nextOccasion({...leapOccasion,annual:false},"2026-09-09"),null);
assert.equal(nextOccasion({...leapOccasion,date:"2027-12-25"},"2026-01-01").occurrence,"2027-12-25");
assert.equal(giftSchema.safeParse({name:"Recipient",tasteNotes:"",budgetPence:100,occasions:[],items:[]}).success,true);assert.equal(giftSchema.safeParse({name:"Recipient",tasteNotes:"",budgetPence:0.5,occasions:[],items:[]}).success,false);
console.log("Passed gift money, recurring occasions, leap dates and validation checks.");

const { giftReturnPath } = require("../lib/auth-return.ts");
const sharePath = "/gift/" + "a".repeat(64);
assert.equal(giftReturnPath("?next=" + encodeURIComponent(sharePath)), sharePath);
for (const unsafe of ["https://example.com", "//example.com", "/gift/../admin", "/chat", sharePath + "?next=https://example.com"]) assert.equal(giftReturnPath("?next=" + encodeURIComponent(unsafe)), "/chat");
console.log("Passed shared-gift sign-in return validation.");

const {
  parseArticleContent,
  articleText,
  escapeXml,
} = require("../lib/articles.ts");
const articleDoc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Title", marks: [{ type: "bold" }] }],
    },
    { type: "paragraph", content: [{ type: "text", text: "Body <script>" }] },
  ],
};
assert.equal(
  articleText(parseArticleContent(articleDoc)),
  "Title\nBody <script>\n",
);
for (const content of [
  { type: "doc", content: [{ type: "html", text: "<script>" }] },
  { type: "doc", content: [{ type: "paragraph", attrs: { onclick: "bad" } }] },
  { type: "doc", content: [{ type: "text", text: "bad nesting" }] },
  {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "a".repeat(50001) }],
      },
    ],
  },
])
  assert.throws(() => parseArticleContent(content));
assert.equal(escapeXml('<a & "b">'), "&lt;a &amp; &quot;b&quot;&gt;");
console.log("Article validation and XML escaping passed");

const validImage={type:"articleImage",attrs:{imageId:"a087c3a8-290c-4aab-bc65-eaa8c5bb10c9",alt:"Description",caption:"Caption"}};
assert.doesNotThrow(()=>parseArticleContent({type:"doc",content:[validImage]}));
assert.throws(()=>parseArticleContent({type:"doc",content:[{...validImage,attrs:{...validImage.attrs,src:"https://example.com/tracker"}}]}));
assert.throws(()=>parseArticleContent({type:"doc",content:[{...validImage,attrs:{...validImage.attrs,alt:" "}}]}));
assert.throws(()=>parseArticleContent({type:"doc",content:Array(21).fill(validImage)}));
assert.throws(()=>parseArticleContent({type:"doc",content:[{...validImage,content:[{type:"text",text:"Invalid child"}]}]}));
assert.throws(()=>parseArticleContent({type:"doc",content:[{type:"bookCard",attrs:{editionId:"abc",workId:"abc",title:"Title",authorName:"Author",coverUrl:"javascript:alert(1)"}}]}));
console.log("Article image and book-card schema checks passed");

const {articleFingerprint}=require("../lib/articles.ts");
assert.equal(articleFingerprint({type:"doc",content:[{type:"articleImage",attrs:{alt:"Text",imageId:"id",caption:""}}]}),articleFingerprint({content:[{attrs:{caption:"",imageId:"id",alt:"Text"},type:"articleImage"}],type:"doc"}));
assert.notEqual(articleFingerprint({content:["a","b"]}),articleFingerprint({content:["b","a"]}));
