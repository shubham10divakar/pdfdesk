// Contents tab from the PDF's outline: entries, page numbers, jumping (with Back), current section.
// Prints its own fixture: scripts/e2e/fixtures/links-paper.html with Chrome's document outline turned on.
// Usage (from the repo root): node scripts/e2e/outline.mjs <chromeDebugPort> <appUrl> <outDir> <abs path>/links-paper.pdf
//   links-paper.pdf = the same fixture printed without an outline (see links.mjs), to check the tab stays hidden.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [port, app, out, plainPdf] = process.argv.slice(2);
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (ok, what) => { console.log(ok ? "PASS" : "FAIL", what); if (!ok) fails++; };
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, m => m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => { const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || e); return r.result.value; };
const shot = async n => writeFileSync(`${out}/${n}.png`, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
const page = () => js(`+document.querySelector('#pgIn').value`);
const inView = s => js(`(() => { const box = document.querySelector('#pages').getBoundingClientRect(); const sp = [...document.querySelectorAll('.textLayer span')].find(e => e.textContent.includes(${JSON.stringify(s)})); if (!sp) return false; const r = sp.getBoundingClientRect(); return r.top >= box.top && r.bottom <= box.bottom; })()`);
await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("DOM.enable");

// ---------- fixture with an outline ----------
await cdp("Page.navigate", { url: pathToFileURL(resolve("scripts/e2e/fixtures/links-paper.html")).href }); await wait(1200);
const { data } = await cdp("Page.printToPDF", { generateDocumentOutline: true, displayHeaderFooter: false, preferCSSPageSize: true });
const outlinedPdf = resolve(out, "outlined-paper.pdf"); writeFileSync(outlinedPdf, Buffer.from(data, "base64"));

await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: app }); await wait(1800);
await js(`try { localStorage.clear() } catch(e){}`); await cdp("Page.reload"); await wait(1800);
const add = async f => { const { root } = await cdp("DOM.getDocument"); const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "#fileIn" }); await cdp("DOM.setFileInputFiles", { nodeId, files: [f] }); await wait(2500); };
const open = async nth => { await js(`[...document.querySelectorAll('tr[data-act="open"]')].filter(e => /Links in Papers/.test(e.textContent))[${nth}].click()`); await wait(3000); };
await add(outlinedPdf); await add(plainPdf);
await js(`document.querySelector('[data-act="filter"][data-v="all"]').click()`); await wait(300);
const ids = await js(`[...document.querySelectorAll('tr[data-act="open"]')].filter(e => /Links in Papers/.test(e.textContent)).map(e => e.dataset.v)`);

// the most recently added (plain) is first in the list
await open(0);
check(!(await js(`!!document.querySelector('.tab[data-v="contents"]')`)), "a PDF without an outline has no Contents tab");
await js(`document.querySelector('[data-act="filter"][data-v="all"]').click()`); await wait(300);
await open(1);
check(await js(`!!document.querySelector('.tab[data-v="contents"]')`), "a PDF with an outline gets a Contents tab");
await js(`document.querySelector('.tab[data-v="contents"]').click()`); await wait(300);
const toc = await js(`[...document.querySelectorAll('.toc-i')].map(b => [b.querySelector('.toc-t').textContent, b.querySelector('.toc-p')?.textContent || "", getComputedStyle(b).getPropertyValue('--d').trim()])`);
console.log("  contents:", JSON.stringify(toc));
const want = [["1 Introduction", "1"], ["2 Background", "2"], ["3 Method", "3"], ["References", "4"]];
check(want.every(([t, p]) => toc.some(([tt, pp]) => tt === t && pp === p)), "it lists the sections with their page numbers");
check(await js(`document.querySelector('.toc-i.on .toc-t')?.textContent`) !== "3 Method", "the current section is marked (not Method while on page 1)");
await shot("outline-tab");

// jump, Back, current section follows scrolling
await js(`[...document.querySelectorAll('.toc-i')].find(b => b.textContent.includes("3 Method")).click()`); await wait(1400);
check(await page() === 3 && await inView("3 Method"), "clicking 3 Method jumps to it on page 3");
check(await js(`document.querySelector('.toc-i.on .toc-t').textContent`) === "3 Method", "and marks 3 Method as the current section");
check(await js(`document.querySelector('#backBtn').textContent`) === "← Back to p. 1", "Back offers the way back to page 1");
await shot("outline-jump");
await js(`document.querySelector('#pages').scrollTop = document.querySelectorAll('#pages .page')[1].offsetTop + 10`); await wait(800);
check(await js(`document.querySelector('.toc-i.on .toc-t').textContent`) === "2 Background", "scrolling to page 2 marks 2 Background");
// the tab survives reopening the paper; typing in notes isn't interrupted by the outline loading
await js(`document.querySelector('[data-act="home"]').click()`); await wait(400);
await js(`document.querySelector('[data-act="filter"][data-v="all"]').click()`); await wait(300);
await js(`document.querySelector('tr[data-act="open"][data-v="${ids[1]}"]').click()`); await wait(2500);
check(await js(`document.querySelector('.tab.on').dataset.v`) === "contents", "reopening the paper comes back to the Contents tab");
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
ws.close(); process.exit(fails ? 1 : 0);
