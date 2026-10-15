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

const {parseArticleRecovery}=require("../lib/article-recovery.ts");
const recovery={version:0,title:"",excerpt:"",content:{type:"doc",content:[{type:"paragraph"}]},updatedAt:Date.now()};
assert.equal(parseArticleRecovery(JSON.stringify(recovery)).version,0);
assert.throws(()=>parseArticleRecovery(JSON.stringify({...recovery,updatedAt:Date.now()-8*24*60*60*1000})));
assert.throws(()=>parseArticleRecovery(JSON.stringify({...recovery,updatedAt:Date.now()+120000})));
assert.throws(()=>parseArticleRecovery(JSON.stringify({...recovery,content:{type:"script"}})));
assert.throws(()=>parseArticleRecovery("x".repeat(350001)));
console.log("Article recovery validation and expiry checks passed");

const {reviewArticleContent}=require("../lib/review-article.ts");
const converted=reviewArticleContent("First line\ncontinued.\n\n<script>literal text</script>");
assert.equal(converted.content.length,2);
assert.equal(articleText(converted),"First line continued.\n<script>literal text</script>\n");
assert.throws(()=>reviewArticleContent("   "));
console.log("Review-to-article text and paragraph conversion checks passed");

const {wrapCardText,shareCardDescription}=require("../lib/share-cards.ts");
assert.deepEqual(wrapCardText("one two three",7,t=>t.length),["one two","three"]);
assert.deepEqual(wrapCardText("abcdefgh",3,t=>t.length),["abc","def","gh"]);
assert.deepEqual(wrapCardText("first\n\nlast",10,t=>t.length),["first","","last"]);
const cardDescription=shareCardDescription({kind:"book",format:"square",theme:"paper",book:{editionId:"e",workId:"w",title:"Book",authorName:"Author",coverUrl:"https://example.test/cover"},quote:"UNUSED_QUOTE",caption:"My pick",page:"UNUSED_PAGE",byline:""});
assert.equal(cardDescription,"My pick / Book / Author");
console.log("Share-card wrapping and exported-field description checks passed");

const {recapPeriod,recapCounts}=require("../lib/reading-recap.ts");
assert.deepEqual(recapPeriod("2024","2026-09-16"),{year:2024,through:"2024-12-31"});
for(const value of [undefined,"oops","2027","1899","2024x"]) assert.deepEqual(recapPeriod(value,"2026-09-16"),{year:2026,through:"2026-09-16"});
assert.deepEqual(recapCounts([{date:new Date("2024-02-29T12:00Z"),pageStart:0,pageEnd:20},{date:new Date("2024-02-29T23:00Z"),pageStart:20,pageEnd:25},{date:new Date("2024-03-01T12:00Z"),pageStart:25,pageEnd:25}]),{pages:25,days:1});
assert.deepEqual(recapCounts([]),{pages:0,days:0});
console.log("Reading recap year boundaries and progress totals passed");

assert.equal(shareCardDescription({kind:"shelfie",format:"square",theme:"paper",heading:"",books:[{title:"First",authorName:"Author",workId:"PRIVATE_ID",editionId:"e",coverUrl:"PRIVATE_URL"}],byline:""}),"On my shelf / First / Author");
console.log("Shelfie exported description excludes catalogue identifiers");

const {localSessionTime,sessionTimeValue}=require("../lib/session-times.ts");
const originalTZ=process.env.TZ;
process.env.TZ="Europe/London";
assert.equal(localSessionTime("2024-07-01T12:34:56.789Z"),"2024-07-01T13:34:56.789");
assert.equal(sessionTimeValue("2024-07-01T13:34",null),"2024-07-01T12:34:00.000Z");
assert.throws(()=>sessionTimeValue("2024-03-31T01:30",null),/does not exist/);
assert.throws(()=>sessionTimeValue("2024-02-30T12:00",null));
const repeatedTime="2024-10-27T01:30:00.123Z";
assert.equal(sessionTimeValue(localSessionTime(repeatedTime),repeatedTime),repeatedTime);
assert.equal(sessionTimeValue("",repeatedTime),null);
if(originalTZ===undefined) delete process.env.TZ; else process.env.TZ=originalTZ;
console.log("Session local times, daylight-saving gaps and unchanged timestamp precision passed");

const { mentionedWork, entrySchema } = require("../lib/book-journal.ts");
const works = [{id:"a",title:"The Long Way Home"},{id:"b",title:"Another Story"},{id:"c",title:"It"}];
assert.equal(mentionedWork("I loved The Long Way Home!",works),"a");
assert.equal(mentionedWork("The Long Way Home and Another Story",works),null);
assert.equal(mentionedWork("It was good",works),null);
assert.equal(mentionedWork("The Long Way Homeward",works),null);
assert.equal(mentionedWork("Another Story",[...works,{id:"d",title:"Another Story"}]),null);
assert.equal(entrySchema.safeParse({id:"11111111-1111-4111-8111-111111111111",workId:"a",kind:"link",text:"Post",url:"javascript:alert(1)"}).success,false);
assert.equal(entrySchema.safeParse({id:"11111111-1111-4111-8111-111111111111",workId:null,kind:"note",text:"Unfiled"}).success,false);
console.log("Book journal association ambiguity and link validation passed");

const { createClubSchema, scheduleSchema, clubActionSchema } = require("../lib/clubs.ts");
const clubId = "22222222-2222-4222-8222-222222222222";
assert.equal(createClubSchema.safeParse({id:clubId,name:"Readers",description:"",isPublic:false,alias:""}).success,false);
assert.equal(scheduleSchema.safeParse({action:"reading",id:clubId,workId:"book",version:0,startsOn:"2026-10-10",endsOn:"2026-10-01"}).success,false);
assert.equal(scheduleSchema.safeParse({action:"reading",id:clubId,workId:"book",version:0,startsOn:"2026-02-30",endsOn:null}).success,false);
assert.equal(scheduleSchema.safeParse({action:"reading",id:clubId,workId:"book",version:0,startsOn:null,endsOn:null}).success,true);
assert.equal(clubActionSchema.safeParse({action:"post",id:clubId,readingId:clubId,version:0,body:"   ",spoilerPage:null}).success,false);
console.log("Book club privacy input, schedules and discussion validation passed");

const { challengeSchema, challengeMatches } = require("../lib/challenges.ts");
const challengeFixture = {id:"e31acccd-9591-40d1-a557-7b7633336754",title:"A year",target:12,startsOn:"2026-01-01",endsOn:"2026-12-31",genre:"fantasy"};
assert.equal(challengeSchema.safeParse(challengeFixture).success,true);
assert.equal(challengeSchema.safeParse({...challengeFixture,startsOn:"2026-02-30"}).success,false);
assert.equal(challengeSchema.safeParse({...challengeFixture,endsOn:"2025-01-01"}).success,false);
assert.equal(challengeSchema.safeParse({...challengeFixture,target:0}).success,false);
assert.equal(challengeMatches(challengeFixture,[{date:"2026-01-01",genres:["Fantasy"]},{date:"2026-12-31",genres:["Fantasy"]},{date:"2025-12-31",genres:["Fantasy"]},{date:"2026-02-01",genres:["Crime"]}]).length,2);
console.log("Reading challenge validation and inclusive genre/date matching passed");

const { bingoLines, squareSchema } = require("../lib/challenges.ts");
assert.equal(bingoLines(Array(9).fill(true)),8);
assert.equal(bingoLines([true,false,false,false,true,false,false,false,true]),1);
assert.equal(bingoLines([true,true,true,false,false,false,false,false,false]),1);
assert.equal(bingoLines([true,false,false,true,false,false,true,false,false]),1);
assert.equal(bingoLines([true,true,false,false,false,false,false,false,false]),0);
assert.equal(challengeSchema.safeParse({...challengeFixture,kind:"bingo",target:9,genre:null,prompts:Array(9).fill("A theme")}).success,true);
assert.equal(challengeSchema.safeParse({...challengeFixture,kind:"bingo",target:9,genre:null,prompts:Array(8).fill("A theme")}).success,false);
assert.equal(challengeSchema.safeParse({...challengeFixture,kind:"bingo",target:9,genre:null,prompts:Array(9).fill(" ")}).success,false);
assert.equal(squareSchema.safeParse({id:challengeFixture.id,squareId:"square",version:-1,workId:null}).success,false);
console.log("Bingo shape, prompt, version and line checks passed");

const {shareChallengeSchema,joinChallengeSchema,publicChallengeSelect}=require("../lib/community-challenges.ts");
assert.equal(shareChallengeSchema.safeParse({id:challengeFixture.id,version:0,isPublic:true}).success,true);
assert.equal(shareChallengeSchema.safeParse({id:challengeFixture.id,version:-1,isPublic:true}).success,false);
assert.equal(joinChallengeSchema.safeParse({id:challengeFixture.id,sourceId:"invalid",version:0}).success,false);
assert.deepEqual(Object.keys(publicChallengeSelect).sort(),["id","title","kind","target","startsOn","endsOn","genre","shareVersion","squares"].sort());
console.log("Community challenge sharing, joining and public field checks passed");

const {fundraisingSchema,pledgeTotals}=require("../lib/fundraising.ts");
assert.deepEqual(pledgeTotals({mode:"per_book",amountPence:125,capPence:300,receivedPence:50},3),{expectedPence:300,outstandingPence:250,excessPence:0});
assert.deepEqual(pledgeTotals({mode:"per_book",amountPence:125,capPence:null,receivedPence:200},1),{expectedPence:125,outstandingPence:0,excessPence:75});
assert.equal(pledgeTotals({mode:"flat",amountPence:500,capPence:null,receivedPence:0},0).expectedPence,500);
assert.equal(pledgeTotals({mode:"per_book",amountPence:1,capPence:null,receivedPence:0},3).expectedPence,3);
assert.equal(fundraisingSchema.safeParse({action:"campaign",version:null,charityName:"Local charity",targetPence:null}).success,true);
const pledgeFixture={action:"pledge",id:challengeFixture.id,version:0,label:"A sponsor",mode:"per_book",amountPence:100,capPence:null,receivedPence:0};
assert.equal(fundraisingSchema.safeParse(pledgeFixture).success,true);
for(const changes of [{amountPence:1.2},{receivedPence:-1},{capPence:0},{mode:"flat",capPence:100},{amountPence:100000000}]) assert.equal(fundraisingSchema.safeParse({...pledgeFixture,...changes}).success,false);
console.log("Charity pledge precision, caps, receipts and validation checks passed");

assert.equal(createClubSchema.safeParse({id:challengeFixture.id,name:"Pair",description:"",alias:"Reader",isPublic:false,isPair:true}).success,true);
assert.equal(createClubSchema.safeParse({id:challengeFixture.id,name:"Pair",description:"",alias:"Reader",isPublic:true,isPair:true}).success,false);
console.log("Reading Together privacy validation passed");

const {discussionPostSchema,discussionActionSchema,discussionModerationSchema}=require("../lib/book-discussions.ts");
const discussionFixture={action:"post",id:challengeFixture.id,workId:"work",parentId:null,title:"A question",body:"My thought",alias:"Reader",spoilers:false,version:0};
assert.equal(discussionPostSchema.safeParse(discussionFixture).success,true);
for(const change of [{body:" "},{title:""},{alias:""},{version:-1},{body:"x".repeat(5001)}])assert.equal(discussionPostSchema.safeParse({...discussionFixture,...change}).success,false);
assert.equal(discussionPostSchema.safeParse({...discussionFixture,parentId:challengeFixture.id,title:""}).success,true);
assert.equal(discussionActionSchema.safeParse({action:"report",id:challengeFixture.id,postId:challengeFixture.id,reason:" "}).success,false);
assert.equal(discussionModerationSchema.safeParse({id:challengeFixture.id,version:0,decision:"remove"}).success,true);
console.log("Book discussion, reply and report validation passed");

assert.equal(discussionPostSchema.parse(discussionFixture).communityId, null);
assert.equal(discussionPostSchema.safeParse({...discussionFixture,communityId:"translation"}).success,true);
assert.equal(discussionPostSchema.safeParse({...discussionFixture,communityId:"invented"}).success,false);
console.log("Discussion community compatibility and validation passed");

const { giftAiRequestSchema, giftAiPrompt, parseGiftSuggestions } = require("../lib/gift-ai.ts");
const aiInput = giftAiRequestSchema.parse({version:1,tasteNotes:"Historical mysteries",budgetPence:1500,excludeWorkIds:["old"],name:"PRIVATE_NAME",occasions:["PRIVATE_DATE"]});
const candidates = [{id:"candidate",title:"Catalogue title",authorName:"Author",genres:["Mystery"],themes:[]}];
const aiPrompt = JSON.parse(giftAiPrompt(aiInput,candidates));
assert.deepEqual(Object.keys(aiPrompt).sort(),["preferences","budgetPence","currency","candidates"].sort());
assert.equal(JSON.stringify(aiPrompt).includes("PRIVATE_NAME"),false);
assert.equal(giftAiRequestSchema.safeParse({...aiInput,tasteNotes:" "}).success,false);
assert.equal(giftAiRequestSchema.safeParse({...aiInput,budgetPence:1.5}).success,false);
const proposed = {workId:"candidate",priority:"might_like",reason:"May suit the stated preferences."};
assert.equal(parseGiftSuggestions(JSON.stringify({suggestions:[proposed]}),candidates,[])[0].work.title,"Catalogue title");
assert.deepEqual(parseGiftSuggestions('{"suggestions":[]}',candidates,[]),[]);
for (const value of [{suggestions:[{...proposed,workId:"invented"}]},{suggestions:[proposed,proposed]},{suggestions:[{...proposed,pricePence:100}]},{suggestions:[{...proposed,reason:""}]}]) assert.throws(() => parseGiftSuggestions(JSON.stringify(value),candidates,[]));
assert.throws(() => parseGiftSuggestions(JSON.stringify({suggestions:[proposed]}),candidates,["candidate"]));
assert.throws(() => parseGiftSuggestions("not JSON",candidates,[]));
console.log("Gift AI privacy allowlist, candidate identity, duplicate and output validation passed");

const {cardProjectSchema,cardProjectAction}=require("../lib/card-projects.ts");
const cardDraft={title:"My card",kind:"book",format:"square",theme:"paper",caption:"",quote:"",reference:"",heading:"",includeByline:false,books:[{workId:"work",editionId:"edition"}]};
assert.equal(cardProjectSchema.safeParse(cardDraft).success,true);
for(const change of [{title:" "},{books:[]},{caption:"x".repeat(181)},{kind:"recap"},{books:[...cardDraft.books,...cardDraft.books]}]) assert.equal(cardProjectSchema.safeParse({...cardDraft,...change}).success,false);
assert.equal(cardProjectSchema.safeParse({...cardDraft,kind:"shelfie",books:Array.from({length:6},(_,i)=>({workId:`w${i}`,editionId:`e${i}`}))}).success,true);
assert.equal(cardProjectAction.safeParse({action:"save",id:challengeFixture.id,version:-1,project:cardDraft}).success,false);
console.log("Private card project shape, bounds, work uniqueness and version validation passed");

const {videoProjectSchema,videoProjectAction}=require("../lib/video-projects.ts");
const videoDraft={title:"Video plan",platform:"youtube",status:"scripting",script:"A script",notes:"Filming notes",publishedUrl:"",books:[{workId:"work"}]};
assert.equal(videoProjectSchema.safeParse(videoDraft).success,true);
assert.equal(videoProjectSchema.safeParse({...videoDraft,status:"published",publishedUrl:"https://example.test/video"}).success,true);
for(const change of [{title:" "},{books:[]},{books:[{workId:"work"},{workId:"work"}]},{script:"x".repeat(20001)},{status:"published"},{publishedUrl:"https://example.test/video"},{status:"published",publishedUrl:"javascript:alert(1)"},{status:"published",publishedUrl:"https://name:password@example.test/video"}]) assert.equal(videoProjectSchema.safeParse({...videoDraft,...change}).success,false);
assert.equal(videoProjectAction.safeParse({action:"save",id:challengeFixture.id,version:-1,project:videoDraft}).success,false);
console.log("Video plan text bounds, book identity, version and posted-link validation passed");

const {videoRange,videoMime}=require("../lib/video-clips.ts");
assert.deepEqual(videoRange("bytes=2-5",10),{start:2,end:5});
assert.deepEqual(videoRange("bytes=-3",10),{start:7,end:9});
assert.deepEqual(videoRange("bytes=7-",10),{start:7,end:9});
for(const range of ["bytes=10-","bytes=-0","bytes=4-2","bytes=0-1,3-4","bytes=-","bytes=99999999999999999999-"]) assert.equal(videoRange(range,10),false);
assert.equal(videoMime(Buffer.from("fake video")),null);
console.log("Video container rejection and byte range validation passed");

const {normalizeCaptions}=require("../lib/video-captions.ts");
const captionFixture="WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nHello reader.\n";
assert.equal(normalizeCaptions(captionFixture),captionFixture);
assert.equal(normalizeCaptions(captionFixture.replace(/\n/g,"\r\n")),captionFixture);
assert.equal(normalizeCaptions("  "),"");
for(const value of ["not vtt","WEBVTT",captionFixture.replace("03.000","00.000"),captionFixture.replace("Hello reader.","<script>bad</script>"),captionFixture.replace("03.000","63.000"),captionFixture+"\n00:00:00.000 --> 00:00:03.000\n", "x".repeat(100001)])assert.throws(()=>normalizeCaptions(value));
console.log("Caption normalization, timing, bounds and plain text validation passed");

const {storedZip,crc32}=require("../lib/stored-zip.ts");
assert.equal(crc32(Buffer.from("123456789")),0xcbf43926);
assert.equal(crc32(Buffer.alloc(0)),0);
const archive=storedZip([{name:"book-credits.txt",data:Buffer.from("A book")}]);
const archiveBytes=Buffer.concat(archive.parts);
assert.equal(archive.size,archiveBytes.length);
assert.equal(archiveBytes.readUInt32LE(0),0x04034b50);
assert.equal(archiveBytes.readUInt32LE(archiveBytes.length-22),0x06054b50);
assert.equal(archiveBytes.readUInt16LE(archiveBytes.length-12),1);
for(const name of ["../notes.txt","a/b.txt","a\\b.txt",""])assert.throws(()=>storedZip([{name,data:Buffer.alloc(0)}]));
assert.throws(()=>storedZip([{name:"a.txt",data:Buffer.alloc(0)},{name:"a.txt",data:Buffer.alloc(0)}]));
console.log("Stored ZIP CRC, directory, size and filename bounds passed");

const multiPosted={...videoDraft,status:"published",publishedUrl:"https://example.test/primary",additionalLinks:[{platform:"tiktok",url:"https://example.test/second"}]};
assert.equal(videoProjectSchema.safeParse(multiPosted).success,true);
for(const change of [{status:"editing"},{additionalLinks:[{platform:"tiktok",url:"javascript:alert(1)"}]},{additionalLinks:[{platform:"other",url:"https://name:password@example.test"}]},{additionalLinks:[{platform:"tiktok",url:"https://example.test/primary"}]},{additionalLinks:Array.from({length:6},(_,i)=>({platform:"other",url:`https://example.test/${i}`}))},{additionalLinks:[{platform:"other",url:"https://example.test"},{platform:"other",url:"https://example.test/"}]}])assert.equal(videoProjectSchema.safeParse({...multiPosted,...change}).success,false);
assert.deepEqual(videoProjectSchema.parse(videoDraft).additionalLinks,[]);
console.log("Multi-platform video link bounds, duplicate URLs and legacy defaults passed");

const {shopDraftSchema}=require("../lib/curator-shop.ts");
const shopFixture={title:"My books",introduction:"",isPublic:false,entries:[{workId:"work",note:"My recommendation",retailerUrl:"https://example.test/book",affiliate:true}]};
assert.equal(shopDraftSchema.safeParse(shopFixture).success,true);
for(const change of [{title:" "},{entries:[...shopFixture.entries,...shopFixture.entries]},{isPublic:true,entries:[]},{entries:[{...shopFixture.entries[0],retailerUrl:""}]},{entries:[{...shopFixture.entries[0],retailerUrl:"https://name:password@example.test/book"}]},{entries:[{...shopFixture.entries[0],retailerUrl:"javascript:alert(1)"}]}])assert.equal(shopDraftSchema.safeParse({...shopFixture,...change}).success,false);
console.log("Curator shop publication, book uniqueness and affiliate URL validation passed");
