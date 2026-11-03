// End-to-end test of the library on disk (docs/disk-storage.md), in headless Chrome over CDP.
// Starts its own servers: two pdfdesk processes sharing one folder, plus the static dev server for migration.
// Usage (from the repo root): node scripts/e2e/disk-storage.mjs <chromeDebugPort> <samplePdf> <workDir>
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const [dport, pdf, work] = process.argv.slice(2);
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (ok, what) => { console.log(ok ? "PASS" : "FAIL", what); if (!ok) fails++; };
const sha = b => createHash("sha256").update(b).digest("hex");
const D = join(work, "libD"), E = join(work, "libE");
rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
const readLib = dir => JSON.parse(readFileSync(join(dir, "library.json"), "utf8"));
const find = (lib, re) => lib.papers.find(p => re.test(p.title));

// ---------- servers ----------
const procs = [];
function serve(kind, port, dataDir){
  const args = kind === "pdfdesk" ? ["-m", "pdfdesk", "--no-browser", "--port", String(port), "--data-dir", dataDir] : ["scripts/serve.mjs", String(port)];
  const p = spawn(kind === "pdfdesk" ? "python" : process.execPath, args, { stdio: "ignore" });
  procs.push(p); return p;
}
async function up(port){ for (let i = 0; i < 60; i++){ try { await fetch(`http://localhost:${port}/`); return; } catch { await wait(150); } } throw new Error("server on " + port + " did not start"); }
async function stop(p){ p.kill(); await new Promise(r => p.once("exit", r)); await wait(300); }

// ---------- browser ----------
const ver = await (await fetch(`http://127.0.0.1:${dport}/json/version`)).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(r => bws.addEventListener("open", r, { once: true }));
let id = 0; const pend = new Map();
bws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pend.set(i, m => m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)); bws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
async function profile(name){
  const { browserContextId } = await send("Target.createBrowserContext");
  const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const c = (m, p) => send(m, p, sessionId);
  await c("Page.enable"); await c("Runtime.enable"); await c("DOM.enable");
  await c("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const js = async e => { const r = await c("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(name + ": " + (r.exceptionDetails.exception?.description || e)); return r.result.value; };
  const P = {
    js,
    go: async url => { await c("Page.navigate", { url }); await wait(1800); },
    setFile: async (sel, path) => { const { root } = await c("DOM.getDocument"); const { nodeId } = await c("DOM.querySelector", { nodeId: root.nodeId, selector: sel }); await c("DOM.setFileInputFiles", { nodeId, files: [path] }); },
    click: sel => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error("missing " + ${JSON.stringify(sel)}); el.click(); return true; })()`),
    open: async re => { await js(`(() => { document.querySelector('[data-act="filter"][data-v="all"]').click(); const row = [...document.querySelectorAll('tr[data-act="open"]')].find(r => ${re}.test(r.textContent)); if (!row) throw new Error("no paper " + ${JSON.stringify(String(re))}); row.click(); })()`); await wait(1800); },
    tag: async t => { await P.click('[data-act="tab"][data-v="details"]'); await js(`(() => { const i = document.querySelector('#tagIn'); i.value = ${JSON.stringify(t)}; i.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", bubbles:true})); })()`); await wait(200); },
    note: async text => { await P.click('[data-act="tab"][data-v="notes"]'); await P.click('[data-act="nmode"][data-v="edit"]'); await js(`(() => { const t = document.querySelector('#noteTa'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event("input", {bubbles:true})); })()`); await P.click('[data-act="nmode"][data-v="preview"]'); },
    highlight: async phrase => { await js(`(() => { const s = [...document.querySelectorAll('.textLayer span')].find(s => s.textContent.includes(${JSON.stringify(phrase)})); const r = document.createRange(); r.selectNodeContents(s); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); s.dispatchEvent(new MouseEvent("mouseup", {bubbles:true})); })()`); await wait(200); await P.click('[data-act="hl"][data-v="yellow"]'); },
    home: () => P.click('[data-act="home"]'),
    toast: () => js(`document.querySelector("#toast").textContent`),
  };
  return P;
}
const settle = () => wait(1500); // > save debounce + request

try {
  const pdfBytes = readFileSync(pdf);

  // ---------- 1. a fresh folder ----------
  const A = serve("pdfdesk", 5194, D), B = serve("pdfdesk", 5195, D);
  await up(5194); await up(5195);
  const P1 = await profile("P1");
  await P1.go("http://localhost:5194/"); await settle();
  check(existsSync(join(D, "library.json")) && readLib(D).papers.length === 10, "empty folder starts with the 10 example papers, saved to library.json");
  check((await P1.js(`document.querySelector('.side-foot .path')?.textContent`)) === D, "sidebar shows the library folder");

  // ---------- 2. PDFs and edits land on disk ----------
  await P1.setFile("#fileIn", pdf); await wait(2500);
  let lib = readLib(D), mine = find(lib, /Reading Logs/);
  check(mine && mine.hasFile && existsSync(join(D, "pdfs", `${mine.id}.pdf`)), "imported PDF is saved as pdfs/<id>.pdf");
  check(mine && sha(readFileSync(join(D, "pdfs", `${mine.id}.pdf`))) === sha(pdfBytes), "saved PDF is byte-identical to the original");
  await P1.open(/Reading Logs/); await P1.highlight("Coverage tells the reader"); await P1.note("Note from window 1."); await P1.home(); await settle();
  mine = find(readLib(D), /Reading Logs/);
  check(mine.highlights.length === 1 && mine.notes === "Note from window 1.", "highlight and note are in library.json");

  // ---------- 3. another port, another browser profile: same library ----------
  const P2 = await profile("P2");
  await P2.go("http://localhost:5195/");
  await P2.open(/Reading Logs/);
  check(await P2.js(`document.querySelectorAll('#pages .page canvas').length > 0 && document.querySelectorAll('.hl-layer .hl').length > 0`), "port 5195 in a fresh profile shows the same paper, PDF and highlight");
  await P2.home();

  // ---------- 4. two windows editing at once ----------
  await P1.open(/Attention Is All You Need/); await P1.tag("from-window-1"); await P1.home(); await settle();
  await P2.open(/BERT/); await P2.tag("from-window-2"); await P2.home(); await settle(); // P2 is stale: its save conflicts and merges
  lib = readLib(D);
  check(find(lib, /Attention Is All You Need/).tags.includes("from-window-1") && find(lib, /BERT/).tags.includes("from-window-2"), "edits to different papers from two windows are both kept");
  await P1.open(/Graph Attention Networks/); await P1.click('[data-act="tab"][data-v="details"]'); await P1.click('[data-act="remove"]'); await P1.click('[data-act="remove-yes"]'); await settle();
  await P2.open(/BERT/); await P2.tag("again-2"); await P2.home(); await settle();
  lib = readLib(D);
  check(!find(lib, /Graph Attention Networks/) && find(lib, /BERT/).tags.includes("again-2"), "a paper removed in one window stays removed when a stale window saves");
  // window 2 has the paper open (and up to date) when window 1 changes the note, then writes its own: a real clash
  await P2.open(/Reading Logs/); await settle();
  await P1.open(/Reading Logs/); await P1.note("Window 1 rewrote this."); await P1.home(); await settle();
  await P2.note("Window 2 wrote this."); await P2.home(); await settle();
  const notes = find(readLib(D), /Reading Logs/).notes;
  check(notes.includes("Window 1 rewrote this.") && notes.includes("Window 2 wrote this.") && !notes.includes("Note from window 1."), `notes edited in both windows keep both: ${JSON.stringify(notes)}`);
  await P1.js(`window.dispatchEvent(new Event("focus"))`); await wait(800);
  await P1.open(/BERT/); await P1.click('[data-act="tab"][data-v="details"]');
  check(await P1.js(`document.querySelector('.r-panel').textContent.includes("again-2")`), "coming back to window 1 picks up window 2's changes");
  await P1.home();
  check(existsSync(join(D, "backups")) && readFileSync(join(D, "library.json")).length > 0, "backups folder exists");

  // ---------- 5. server stopped while open ----------
  await stop(B);
  await P2.open(/BERT/); await P2.tag("while-down"); await P2.home(); await wait(1200);
  check(!(await P2.js(`document.querySelector('#netbar').hidden`)), "when pdfdesk stops, the page says changes aren't being saved");
  const B2 = serve("pdfdesk", 5195, D); await up(5195); await wait(5000);
  check(await P2.js(`document.querySelector('#netbar').hidden`) && find(readLib(D), /BERT/).tags.includes("while-down"), "when pdfdesk is back, the page saves and the warning clears");

  // ---------- 6. moving a 0.1.x browser library into an empty folder ----------
  const S1 = serve("static", 5196); await up(5196);
  const P3 = await profile("P3");
  await P3.go("http://localhost:5196/");
  check((await P3.js(`document.querySelector('.side-foot').textContent`)).includes("stay in this browser"), "static server still uses browser storage");
  await P3.setFile("#fileIn", pdf); await wait(2500); await P3.open(/Reading Logs/); await P3.note("Written in the browser library."); await P3.home(); await wait(900);
  await stop(S1);
  const C = serve("pdfdesk", 5196, E); await up(5196);
  await P3.go("http://localhost:5196/"); await wait(1500);
  check(/Moved your library \(1 paper\)/.test(await P3.toast()), `first run moves the browser library in: "${await P3.toast()}"`);
  const libE = readLib(E), moved = find(libE, /Reading Logs/);
  check(moved && moved.notes === "Written in the browser library." && sha(readFileSync(join(E, "pdfs", `${moved.id}.pdf`))) === sha(pdfBytes), "moved paper keeps its notes, and its PDF is on disk");
  check(libE.papers.filter(p => p.sample).length === 10, "the example papers moved too (they were in that browser library)");

  // ---------- 7. a browser library on another port, when the folder already has one ----------
  const S2 = serve("static", 5197); await up(5197);
  const P4 = await profile("P4");
  await P4.go("http://localhost:5197/");
  await P4.setFile("#fileIn", pdf); await wait(2500); await P4.open(/Reading Logs/); await P4.note("From the 5197 browser library."); await P4.home(); await wait(900);
  await stop(S2);
  const before = readLib(D).papers.length;
  const C2 = serve("pdfdesk", 5197, D); await up(5197);
  await P4.go("http://localhost:5197/"); await wait(1200);
  check(!(await P4.js(`document.querySelector('#leftbar').hidden`)) && /1<\/b> paper/.test(await P4.js(`document.querySelector('#leftbar').innerHTML`)), "folder already has a library: banner offers to add this browser's paper");
  await P4.click('[data-act="left-add"]'); await settle();
  lib = readLib(D);
  check(lib.papers.length === before + 1 && lib.papers.some(p => p.notes === "From the 5197 browser library."), "Add them merges the browser's paper into the folder");
  await P4.go("http://localhost:5197/"); await wait(1000);
  check(await P4.js(`document.querySelector('#leftbar').hidden`), "the banner doesn't come back after adding");
} catch (e){ console.log("ERROR", e.message); fails++; }
finally {
  for (const p of procs) try { p.kill(); } catch {}
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
bws.close(); process.exit(fails ? 1 : 0);
