// End-to-end test of export/import in headless Chrome over CDP.
// Usage: node exim-test.mjs <debugPort> <appUrl> <samplePdf> <workDir>
import { readdirSync, writeFileSync, existsSync } from "node:fs";
const [port, app, pdf, work] = process.argv.slice(2);
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
let fails = 0; const check = (ok, what) => { log(ok ? "PASS" : "FAIL", what); if (!ok) fails++; };

const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(r => bws.addEventListener("open", r, { once: true }));
let id = 0; const pend = new Map();
bws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pend.set(i, m => m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)); bws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });

// A fresh, isolated browser profile (own localStorage/IndexedDB) with one page.
async function profile(name, dl){
  const { browserContextId } = await send("Target.createBrowserContext");
  const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const c = (m, p) => send(m, p, sessionId);
  await c("Page.enable"); await c("Runtime.enable"); await c("DOM.enable");
  await c("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  if (dl) await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dl, browserContextId, eventsEnabled: true });
  const js = async e => { const r = await c("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(name + ": " + (r.exceptionDetails.exception?.description || e)); return r.result.value; };
  const setFile = async (sel, path) => { const { root } = await c("DOM.getDocument"); const { nodeId } = await c("DOM.querySelector", { nodeId: root.nodeId, selector: sel }); await c("DOM.setFileInputFiles", { nodeId, files: [path] }); };
  const click = sel => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error("missing " + ${JSON.stringify(sel)}); el.click(); return true; })()`);
  const lib = () => js(`JSON.parse(localStorage.getItem("researchdesk.v1"))`);
  const toastText = () => js(`document.querySelector("#toast").textContent`);
  const shot = async file => writeFileSync(file, Buffer.from((await c("Page.captureScreenshot", { format: "png" })).data, "base64"));
  await c("Page.navigate", { url: app }); await wait(1800);
  return { c, js, setFile, click, lib, toastText, shot };
}
const waitFor = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await wait(150); } return null; };
const newFile = (dir, re) => waitFor(async () => { const f = readdirSync(dir).find(n => re.test(n) && !n.endsWith(".crdownload")); return f ? `${dir}\\${f}` : null; });

// ---------- Profile A: build a library and export it ----------
const dlA = `${work}\\dlA`;
const A = await profile("A", dlA);
check(await A.js(`!!document.querySelector('.side-io [data-act="exp"]')`), "sidebar shows Export library / Import library");
await A.setFile("#fileIn", pdf); await wait(2500);
await A.js(`[...document.querySelectorAll('[data-act="open"]')].find(e => /Reading Logs/.test(e.textContent)).click()`); await wait(3000);
await A.js(`(() => { const s = [...document.querySelectorAll('.textLayer span')].find(s => s.textContent.includes("Coverage tells the reader")); const r = document.createRange(); r.selectNodeContents(s); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); s.dispatchEvent(new MouseEvent("mouseup", {bubbles:true})); })()`);
await wait(200); await A.click('[data-act="hl"][data-v="yellow"]'); await wait(300);
await A.click('[data-act="tab"][data-v="notes"]'); await A.click('[data-act="nmode"][data-v="edit"]');
await A.js(`(() => { const t = document.querySelector('#noteTa'); t.value = "Note from A (p. 1)."; t.dispatchEvent(new Event("input", {bubbles:true})); })()`); await wait(700);
await A.click('[data-act="home"]'); await wait(400);
await A.click('.side-io [data-act="exp"]');
const zipPath = await newFile(dlA, /^pdfdesk-export-\d{4}-\d\d-\d\d\.zip$/);
check(!!zipPath, `export downloads a zip (${zipPath})`);
log("  toast:", await A.toastText());
await A.click('[data-act="about"].nav-i'); await wait(300);
check(/Last export:/.test(await A.js(`document.querySelector('.data p').textContent`)), "About shows the last export date");
await A.click('[data-act="exp-lite"]');
const jsonPath = await newFile(dlA, /^pdfdesk-backup-.*\.json$/);
check(!!jsonPath, `export without PDFs downloads a json (${jsonPath})`);
writeFileSync(`${work}\\paths.json`, JSON.stringify({ zipPath, jsonPath }));

// ---------- Profile B: import, re-import, merge, replace ----------
const B = await profile("B");
const before = (await B.lib())?.papers?.length ?? 0;
await B.setFile("#impIn", zipPath); await wait(800);
const sum = await B.js(`document.querySelector('#modal:not([hidden]) .mdl-sum')?.textContent.replace(/\\s+/g," ").trim()`);
check(/1 paper: 1 new, 0 already/.test(sum || "") && /1 PDF/.test(sum) && /1 highlight/.test(sum), `import dialog summary: "${sum}"`);
await B.shot(`${work}\\modal.png`);
await B.click('[data-act="imp-add"]');
await waitFor(async () => /Added/.test(await B.toastText()));
log("  toast:", await B.toastText());
let L = await B.lib(); let P = L.papers.find(p => /Reading Logs/.test(p.title));
check(L.papers.filter(p => !p.sample).length === 1 && P && P.hasFile, `paper added with its PDF (${L.papers.filter(p => !p.sample).length} own + ${L.papers.filter(p => p.sample).length} examples)`);
check(P.highlights.length === 1 && P.notes === "Note from A (p. 1).", "highlights and notes came across");
await B.js(`[...document.querySelectorAll('[data-act="open"]')].find(e => /Reading Logs/.test(e.textContent)).click()`); await wait(3000);
check(await B.js(`document.querySelectorAll('#pages .page canvas').length > 0 && !/missing|couldn/i.test(document.querySelector('#pages').textContent)`), "imported PDF opens and renders in the reader");
check(await B.js(`document.querySelectorAll('.hl-layer .hl, .hl-layer div').length > 0`), "imported highlight is drawn on the page");
// local edit, then re-import the zip: no duplicates, notes merged once
await B.click('[data-act="tab"][data-v="notes"]'); await B.click('[data-act="nmode"][data-v="edit"]');
await B.js(`(() => { const t = document.querySelector('#noteTa'); t.value = "Note from B."; t.dispatchEvent(new Event("input", {bubbles:true})); })()`); await wait(700);
await B.click('[data-act="home"]'); await wait(300);
for (let i = 0; i < 2; i++){ await B.setFile("#impIn", zipPath); await wait(800); await B.click('[data-act="imp-add"]'); await waitFor(async () => /Added 0/.test(await B.toastText())); }
L = await B.lib(); P = L.papers.find(p => /Reading Logs/.test(p.title));
check(L.papers.filter(p => /Reading Logs/.test(p.title)).length === 1, "re-import adds no duplicate paper");
check(P.highlights.length === 1, "re-import adds no duplicate highlight");
check(P.notes.startsWith("Note from B.") && (P.notes.match(/--- Imported/g) || []).length === 1 && P.notes.endsWith("Note from A (p. 1)."), `different notes are appended once, never overwritten: ${JSON.stringify(P.notes)}`);
// replace
await B.setFile("#impIn", jsonPath); await wait(800);
await B.click('[data-act="imp-replace"]'); await wait(200);
check(/Replace your library/.test(await B.js(`document.querySelector('#mdl-h').textContent`)), "replace asks for confirmation");
await B.shot(`${work}\\modal-replace.png`);
await B.click('[data-act="imp-replace-go"]');
await waitFor(async () => /Added/.test(await B.toastText()));
L = await B.lib();
check(L.papers.length === 1 && !L.papers.some(p => p.sample), `replace leaves only the imported papers (${L.papers.length})`);
check(L.papers[0].hasFile === false, "json backup without PDFs marks the paper as having no PDF");

// ---------- Profile C: deflate-compressed zip from another tool, and a bad file ----------
const C = await profile("C");
const defl = `${work}\\deflated.zip`;
if (existsSync(defl)){
  await C.setFile("#impIn", defl); await wait(800); await C.click('[data-act="imp-add"]');
  await waitFor(async () => /Added/.test(await C.toastText()));
  const LC = await C.lib(); const PC = LC.papers.find(p => /Reading Logs/.test(p.title));
  await C.js(`[...document.querySelectorAll('[data-act="open"]')].find(e => /Reading Logs/.test(e.textContent)).click()`); await wait(3000);
  check(PC && PC.hasFile && await C.js(`document.querySelectorAll('#pages .page canvas').length > 0`), "deflate-compressed zip imports and its PDF renders");
} else log("SKIP deflate test (no deflated.zip yet)");
await C.setFile("#impIn", `${work}\\bad.json`); await wait(800);
check(/isn't a PDFDesk export/.test(await C.toastText()) && await C.js(`document.querySelector('#modal').hidden`), `bad file refused: "${await C.toastText()}"`);

log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
bws.close(); process.exit(fails ? 1 : 0);
