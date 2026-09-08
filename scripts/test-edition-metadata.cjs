const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const sourceWork = "/works/OL991000W";
function edition(id, extra = {}) {
  return {
    key: `/books/${id}`,
    title: "Fixture edition",
    works: [{ key: sourceWork }],
    publishers: ["Fixture Press"],
    publish_date: "2001",
    physical_format: "Paperback",
    number_of_pages: 250,
    languages: [{ key: "/languages/eng" }],
    ...extra,
  };
}
const french = edition("OL991001M", {
  title: "The French Copy",
  isbn_13: ["9780140328721"],
  languages: [{ key: "/languages/fre" }],
  contributors: [
    { name: "Synthetic Translator", role: "Translator" },
    { name: "Not a translator", role: "Editor" },
  ],
});
const legacy = edition("OL991003M", {
  isbn_13: ["9780804429573"],
  number_of_pages: 999,
});
const japanese = edition("OL991021M", {
  title: "The Japanese Copy",
  languages: [{ key: "/languages/jpn" }],
  physical_format: "",
  contributors: [{ name: "Second Translator", role: "translated by" }],
});
const records = new Map([
  [french.key, french],
  [legacy.key, legacy],
  [japanese.key, japanese],
  [
    "/books/OL992000M",
    edition("OL992000M", { works: [{ key: "/works/OL992000W" }] }),
  ],
  [
    "/books/OL992001M",
    edition("OL992001M", {
      works: [{ key: sourceWork }, { key: "/works/OL992000W" }],
    }),
  ],
  ["/books/OL992003M", edition("OL992003M", { isbn_13: ["9780306406157"] })],
]);
const pageOne = [
  french,
  legacy,
  ...Array.from({ length: 18 }, (_, n) => edition(`OL${991100 + n}M`)),
];
let failures = 0;
const fixture = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/__fail_next") {
    failures = 1;
    res.end("{}");
    return;
  }
  if (failures) {
    failures--;
    res.statusCode = 503;
    res.end("{}");
    return;
  }
  if (url.pathname === "/works/OL991000W/editions.json") {
    res.end(
      JSON.stringify({
        size: 22,
        entries:
          Number(url.searchParams.get("offset")) === 0
            ? pageOne
            : [
                japanese,
                edition("OL999998M", { works: [{ key: "/works/OL999998W" }] }),
              ],
      }),
    );
    return;
  }
  if (url.pathname === "/isbn/9780679783268.json") {
    res.end(
      JSON.stringify(
        edition("OL993001M", {
          isbn_13: ["9780679783268"],
          works: [{ key: "/works/OL993000W" }],
        }),
      ),
    );
    return;
  }
  if (url.pathname === "/works/OL993000W/editions.json") {
    res.end(JSON.stringify({ size: 0, entries: [] }));
    return;
  }
  const record = records.get(url.pathname.replace(/\.json$/, ""));
  if (record) {
    res.end(JSON.stringify(record));
    return;
  }
  res.statusCode = 404;
  res.end("{}");
});
(async () => {
  let app;
  let output = "";
  try {
    fixture.listen(0, "127.0.0.1");
    await once(fixture, "listening");
    const reserve = http.createServer();
    reserve.listen(0, "127.0.0.1");
    await once(reserve, "listening");
    const port = reserve.address().port;
    await new Promise((resolve) => reserve.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    const provider = `http://127.0.0.1:${fixture.address().port}`;
    const env = {
      ...process.env,
      OPEN_LIBRARY_BASE: provider,
      NEXTAUTH_URL: base,
      PLAYWRIGHT_BASE_URL: base,
      METADATA_FIXTURE: provider,
    };
    app = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    app.stdout.on("data", (c) => {
      output = (output + c).slice(-4000);
    });
    app.stderr.on("data", (c) => {
      output = (output + c).slice(-4000);
    });
    let ready = false;
    for (let n = 0; n < 50; n++) {
      if (app.exitCode !== null) throw new Error(output);
      try {
        const res = await fetch(`${base}/login`, {
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error(`Fixture app did not start. ${output}`);
    const test = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "tests/e2e/edition-metadata.spec.ts",
      ],
      { cwd: root, env, windowsHide: true, stdio: "inherit" },
    );
    const [code] = await once(test, "exit");
    process.exitCode = code ?? 1;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (app && app.exitCode === null) {
      app.kill();
      await once(app, "exit");
    }
    fixture.closeAllConnections();
    await new Promise((resolve) => fixture.close(resolve));
  }
})();
