// Re-anchoring highlights when a paper's PDF is replaced.
// Prints its own fixtures (scripts/e2e/fixtures/reanchor-v1.html and -v2.html). From the repo root:
//   node scripts/e2e/reanchor.mjs <chromeDebugPort> <appUrl> <outDir>      (static server is fine)
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [port, app, out] = process.argv.slice(2);
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (ok, what) => { console.log(ok ? "PASS" : "FAIL", what); if (!ok) fails++; };
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, m => m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => { const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || e); return r.result.value; };
const click = sel => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error("missing " + ${JSON.stringify(sel)}); el.click(); return true; })()`);
const lib = () => js(`JSON.parse(localStorage.getItem("researchdesk.v1"))`);
const paper = async () => (await lib()).papers.find(p => /Re-anchoring Test/.test(p.title));
const setFile = async (sel, f) => { const { root } = await cdp("DOM.getDocument"); const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector: sel }); await cdp("DOM.setFileInputFiles", { nodeId, files: [f] }); };
const printFixture = async name => {
  await cdp("Page.navigate", { url: pathToFileURL(resolve(`scripts/e2e/fixtures/${name}.html`)).href }); await wait(1000);
  const { data } = await cdp("Page.printToPDF", { preferCSSPageSize: true }); const f = resolve(out, `${name}.pdf`); writeFileSync(f, Buffer.from(data, "base64")); return f;
};
// select the n-th occurrence of a phrase in the text layer (across spans), then pick a colour
const highlight = async (phrase, nth, color) => {
  const ok = await js(`(() => {
    const nodes = [], walk = (el) => { for (const c of el.childNodes) c.nodeType === 3 ? nodes.push(c) : walk(c); };
    document.querySelectorAll('#pages .textLayer').forEach(walk);
    let text = "", at = []; nodes.forEach(n => { at.push(text.length); text += n.data; });
    const norm = s => s.replace(/\\s+/g, " "), want = ${JSON.stringify(phrase)};
    let i = -1; for (let k = 0; k <= ${nth}; k++){ i = text.indexOf(want, i + 1); if (i < 0) return false; }
    const pos = x => { let k = at.length - 1; while (at[k] > x) k--; return [nodes[k], x - at[k]]; };
    const [sn, so] = pos(i), [en, eo] = pos(i + want.length);
    const r = document.createRange(); r.setStart(sn, so); r.setEnd(en, eo);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    sn.parentElement.dispatchEvent(new MouseEvent("mouseup", {bubbles:true})); return true; })()`);
  if (!ok) throw new Error("phrase not found: " + phrase);
  await wait(200); await click(`[data-act="hl"][data-v="${color}"]`); await wait(300);
};
// which text is under the middle of each of a highlight's rectangles, on its page
const textUnder = h => js(`(() => { const pg = document.querySelector('#pages .page[data-n="${h.page}"]'); pg.scrollIntoView({block:"start"}); const b = pg.getBoundingClientRect();
  return ${JSON.stringify(h.rects || [])}.map(q => { const x = b.left + (q.x + q.w / 2) * b.width, y = b.top + (q.y + q.h / 2) * b.height; const el = document.elementFromPoint(x, y); return el && el.closest('.textLayer') ? el.textContent : ""; }).join(" | "); })()`);
const iou = (A, B) => { const a = A[0], b = B[0]; if (!a || !b) return 0; const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); return x * y / (a.w * a.h + b.w * b.h - x * y); };
const replacePdf = async f => { await click('[data-act="tab"][data-v="details"]'); await wait(200); await setFile("#attachIn", f); await wait(6000); };

await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("DOM.enable");
const v1 = await printFixture("reanchor-v1"), v2 = await printFixture("reanchor-v2");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: "about:blank" }); await wait(300);
await cdp("Storage.clearDataForOrigin", { origin: new URL(app).origin, storageTypes: "all" });
await cdp("Page.navigate", { url: app }); await wait(1800);
await setFile("#fileIn", v1); await wait(2500);
await js(`[...document.querySelectorAll('[data-act="open"]')].find(e => /Re-anchoring Test/.test(e.textContent)).click()`); await wait(3000);

const A = "Reading logs are cheap to collect and valuable to keep.";
const B = "highlights carry a colour with a fixed meaning";                       // appears twice; we highlight the second
const C1 = "Only active time counts: the clock pauses when the window is hidden.";
const D = "This sentence is removed in the second version.";
await highlight(A, 0, "yellow"); await highlight(B, 1, "blue"); await highlight(C1, 0, "green"); await highlight(D, 0, "pink");
let p = await paper();
const byText = (pp, t) => pp.highlights.find(h => h.text.startsWith(t.slice(0, 20)));
const orig = Object.fromEntries([["A", A], ["B", B], ["C", C1], ["D", D]].map(([k, t]) => [k, byText(p, t)]));
check(p.highlights.length === 4 && Object.values(orig).every(h => h.prefix !== undefined && (h.prefix + h.suffix).length > 10), "new highlights store the text around them");
check(/rule from the introduction/.test(orig.B.prefix), `the second "${B}" knows it follows "…${orig.B.prefix.slice(-30)}"`);

// ---------- replace with the very same file: everything comes back in place ----------
await replacePdf(v1);
p = await paper();
check(p.highlights.every(h => !h.lost && h.rects && h.rects.length), "replacing with the same file finds all 4 highlights");
check(["A", "B", "C", "D"].every(k => iou(orig[k].rects, byText(p, k === "C" ? C1 : { A, B, D }[k]).rects) > 0.6), "and puts them where they were (overlap > 60%)");

// ---------- replace with version 2 ----------
await replacePdf(v2);
p = await paper();
const nA = byText(p, A), nB = byText(p, B), nC = byText(p, C1), nD = byText(p, D);
const summary = await js(`document.querySelector('#toast').textContent`); console.log("  toast:", summary);
check(nA && !nA.lost && nA.page === 2 && /cheap to collect/.test(await textUnder(nA)), `a sentence that moved to page 2 is found there (page ${nA && nA.page})`);
check(nB && !nB.lost && /rule from the introduction|highlights carry/.test(await textUnder(nB)) && nB.page === 2, `the repeated phrase lands on the second occurrence, not the first (page ${nB && nB.page})`);
const firstB = await js(`(() => { const sp = [...document.querySelectorAll('#pages .page[data-n="1"] .textLayer span')].find(s => s.textContent.includes("As noted earlier")); return !!sp; })()`);
check(firstB, "(the first occurrence is still on page 1, so the context did the choosing)");
check(nC && !nC.lost && /clock stops when the window/.test(await textUnder(nC)), "a slightly reworded sentence is still found (pauses → stops)");
check(nC && /the clock stops when the window is hidden/.test(nC.text), `and its text is updated to the new wording: "${nC && nC.text}"`);
check(byText(p, A).text === A, "exact matches keep their text unchanged");
check(nD && nD.lost && !nD.rects, "a removed sentence is marked as not found, and kept");
await click('[data-act="tab"][data-v="highlights"]'); await wait(300);
check(await js(`[...document.querySelectorAll('.hl-item')].filter(i => i.querySelector('.lost')).length`) === 1 && /Not found in this PDF/.test(await js(`document.querySelector('.hl-item .lost').textContent`)), "the Highlights tab marks it “Not found in this PDF”");
check(/Found 3 of 4 highlights in the new PDF\. One couldn't be found; it's kept in the Highlights tab\./.test(summary), "a message says how many were found and where the missing one is");
writeFileSync(`${out}/reanchor.png`, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
ws.close(); process.exit(fails ? 1 : 0);
