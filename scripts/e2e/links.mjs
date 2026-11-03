// Links inside PDFs: internal destinations land on the exact spot, web links open in a new tab.
// Usage: node scripts/e2e/links.mjs <chromeDebugPort> <appUrl> <abs path>/links-paper.pdf [outDir]
// links-paper.pdf: print scripts/e2e/fixtures/links-paper.html with Chrome (see DEVELOPMENT.md).
import { writeFileSync } from "node:fs";
const [port, app, pdf, out] = process.argv.slice(2);
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (ok, what) => { console.log(ok ? "PASS" : "FAIL", what); if (!ok) fails++; };
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, m => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => { const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || e); return r.result.value; };
const shot = async n => { if (out) writeFileSync(`${out}/${n}.png`, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64")); };
const mouse = (type, x, y) => cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 });
const realClick = async (x, y) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); };
const page = () => js(`+document.querySelector('#pgIn').value`);
// the n-th link on a page (document order), scrolled into view, clicked with a real mouse
const clickLink = async (pg, i) => {
  const [x, y] = await js(`(() => { const a = document.querySelectorAll('#pages .page[data-n="${pg}"] .pdf-link')[${i}]; a.scrollIntoView({block:"center"}); const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await wait(300); await realClick(x, y); await wait(1400);
};
// is the text-layer span containing `s` inside the visible part of the reader?
const inView = s => js(`(() => { const box = document.querySelector('#pages').getBoundingClientRect(); const sp = [...document.querySelectorAll('.textLayer span')].find(e => e.textContent.includes(${JSON.stringify(s)})); if (!sp) return false; const r = sp.getBoundingClientRect(); return r.top >= box.top && r.bottom <= box.bottom; })()`);

await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("DOM.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: app }); await wait(1800);
await js(`try { localStorage.clear() } catch(e){}`); await cdp("Page.reload"); await wait(1800);
const { root } = await cdp("DOM.getDocument"); const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "#fileIn" });
await cdp("DOM.setFileInputFiles", { nodeId, files: [pdf] }); await wait(2500);
await js(`[...document.querySelectorAll('[data-act="open"]')].find(e => /Links in Papers/.test(e.textContent)).click()`); await wait(3000);

// ---------- links are drawn ----------
const p1 = await js(`[...document.querySelectorAll('#pages .page[data-n="1"] .pdf-link')].map(a => ({href: a.getAttribute("href"), target: a.target}))`);
check(p1.length === 5, `page 1 has its 5 links (${p1.length})`);
const web = p1.find(l => l.href.startsWith("http"));
check(web && web.href === "https://github.com/shubham10divakar/pdfdesk" && web.target === "_blank", `the web link opens ${web && web.href} in a new tab`);
await shot("links-page1");

// ---------- internal links land on the exact spot ----------
await clickLink(1, 0);   // [1]
check(await page() === 4 && await inView("A. Reader. Reading logs"), "[1] jumps to page 4 with reference 1 in view");
await shot("links-ref1");
await js(`document.querySelector('#pages').scrollTop = 0`); await wait(500);
await clickLink(1, 3);   // Figure 1
check(await page() === 3 && await inView("[ figure placeholder ]"), "Figure 1 jumps to page 3 with the figure in view");
await clickLink(3, 0);   // Section 1 (in the caption)
check(await page() === 1 && await inView("1 Introduction"), "the caption's Section 1 link jumps back to the introduction");
await js(`document.querySelector('#pages').scrollTop = document.querySelectorAll('#pages .page')[1].offsetTop`); await wait(800);
await clickLink(2, 0);   // [3] in the middle of page 2
check(await page() === 4 && await inView("C. Linker. Why citations"), "a citation in the middle of a page ([3]) works too");

// ---------- links don't break the rest ----------
await js(`document.querySelector('#pages').scrollTop = 0`); await wait(600);
const linkOverText = await js(`(() => { const a = document.querySelector('#pages .page[data-n="1"] .pdf-link'), r = a.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === a; })()`);
check(linkOverText, "the link area is on top of the text layer, so a click reaches it");
const textFree = await js(`(() => { const sp = [...document.querySelectorAll('#pages .page[data-n="1"] .textLayer span')].find(e => e.textContent.includes("Readers follow citations")); const r = sp.getBoundingClientRect(); const el = document.elementFromPoint(r.left + 5, r.top + r.height / 2); return !!el && !el.closest('.pdf-link'); })()`);
check(textFree, "text outside the links is still reachable for selecting and highlighting");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
ws.close(); process.exit(fails ? 1 : 0);
