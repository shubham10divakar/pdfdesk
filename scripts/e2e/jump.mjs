// Jumping between the panel and the page: highlight cards, note links, and clicking highlights on the page.
// Usage: node scripts/e2e/jump.mjs <chromeDebugPort> <appUrl> <abs path>/sample-paper.pdf   (static server is fine)
const [port, app, pdf] = process.argv.slice(2);
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (ok, what) => { console.log(ok ? "PASS" : "FAIL", what); if (!ok) fails++; };
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, m => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => { const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || e); return r.result.value; };
const click = sel => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error("missing " + ${JSON.stringify(sel)}); el.click(); return true; })()`);
const mouse = async (type, x, y) => cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mouseReleased" ? 0 : 1 });
const realClick = async (x, y) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); };
const page = () => js(`+document.querySelector('#pgIn').value`);
const awayToPage2 = async () => { await js(`document.querySelector('#pages').scrollTop = document.querySelectorAll('#pages .page')[1].offsetTop`); await wait(700); };
const flashing = hid => js(`document.querySelectorAll('.hl.flash[data-h="${hid}"]').length > 0`);
const center = hid => js(`(() => { const r = document.querySelector('.hl[data-h="${hid}"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);

await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("DOM.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: app }); await wait(1800);
await cdp("Page.navigate", { url: "about:blank" }); await wait(300);   // leave first: the app saves on unload
await cdp("Storage.clearDataForOrigin", { origin: new URL(app).origin, storageTypes: "all" });
await cdp("Page.navigate", { url: app }); await wait(1800);
const { root } = await cdp("DOM.getDocument"); const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "#fileIn" });
await cdp("DOM.setFileInputFiles", { nodeId, files: [pdf] }); await wait(2500);
await js(`[...document.querySelectorAll('[data-act="open"]')].find(e => /Reading Logs/.test(e.textContent)).click()`); await wait(2500);
const highlight = async (phrase, color) => {
  await js(`(() => { const s = [...document.querySelectorAll('.textLayer span')].find(s => s.textContent.includes(${JSON.stringify(phrase)})); const r = document.createRange(); r.selectNodeContents(s); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); s.dispatchEvent(new MouseEvent("mouseup", {bubbles:true})); })()`);
  await wait(200); await click(`[data-act="hl"][data-v="${color}"]`); await wait(300);
  return js(`[...document.querySelectorAll('.hl[data-h]')].map(d => d.dataset.h).filter((v, i, a) => a.indexOf(v) === i).pop()`);
};
const hY = await highlight("Coverage tells the reader", "yellow");
const hG = await highlight("Only active time counts", "green");

// ---------- 1. click the highlight's text in the panel ----------
await click('[data-act="tab"][data-v="highlights"]'); await wait(200);
await awayToPage2();
await click(`.hl-item[data-hl="${hY}"] .txt`); await wait(900);
check(await page() === 1 && await flashing(hY), "clicking a highlight's text in the panel goes to its page and flashes it");

// ---------- 2. note links that quote a highlight ----------
await click('[data-act="ins-hl"]'); await wait(300);
await click('[data-act="nmode"][data-v="edit"]');
await js(`(() => { const t = document.querySelector('#noteTa'); t.value += "\\n\\nThe table is on p. 2."; t.dispatchEvent(new Event("input", {bubbles:true})); })()`);
await click('[data-act="nmode"][data-v="preview"]'); await wait(300);
const links = await js(`[...document.querySelectorAll('#mdView .pref')].map(b => ({v: b.dataset.v, h: b.dataset.h || null, hl: b.classList.contains("to-hl")}))`);
check(links.filter(l => l.hl).length === 2 && links.some(l => l.h === hY) && links.some(l => l.h === hG), `Insert highlights' quotes link to their exact highlights (${JSON.stringify(links)})`);
check(links.some(l => l.v === "2" && !l.h && !l.hl), "a plain p. 2 with no quoted highlight stays a page link");
await awayToPage2();
await click(`#mdView .pref[data-h="${hG}"]`); await wait(900);
check(await page() === 1 && await flashing(hG), "clicking the quote's p. 1 jumps to that highlight and flashes it");

// ---------- 3. click a highlight on the page ----------
await js(`document.querySelector('#pages').scrollTop = 0`); await wait(500);
let [x, y] = await center(hG);
await mouse("mouseMoved", x, y); await wait(120);
check(await js(`document.querySelector('#pages .page[data-n="1"]').classList.contains("on-hl")`), "the pointer turns into a hand over a highlight");
await click('[data-act="tab"][data-v="notes"]'); await wait(200);
const top0 = await js(`document.querySelector('#pages').scrollTop`);
await realClick(x, y); await wait(600);
check(await js(`document.querySelector('.tab.on').dataset.v`) === "highlights" && await js(`!!document.querySelector('.hl-item.picked[data-hl="${hG}"]')`), "clicking a highlight on the page opens the Highlights tab at its card");
check(Math.abs((await js(`document.querySelector('#pages').scrollTop`)) - top0) < 2 && await flashing(hG), "the page doesn't scroll away; the highlight flashes");
// with the panel hidden
await js(`document.body.dispatchEvent(new KeyboardEvent("keydown", {key:"]", bubbles:true}))`); await wait(900);
check(await js(`getComputedStyle(document.querySelector('.r-panel')).display === "none"`), "notes panel hidden");
[x, y] = await center(hY);
await realClick(x, y); await wait(1500);
check(await js(`getComputedStyle(document.querySelector('.r-panel')).display !== "none"`) && await js(`!!document.querySelector('.hl-item.picked[data-hl="${hY}"]')`), "clicking a highlight with the panel hidden opens the panel at its card");
const vis = await js(`(() => { const b = document.querySelector('#pages').getBoundingClientRect(), r = document.querySelector('.hl[data-h="${hY}"]').getBoundingClientRect(); return r.top >= b.top && r.bottom <= b.bottom; })()`);
check(vis, "after the pages re-fit, the clicked highlight is still on screen");
// After a drag, the browser sends a click while text is selected. That click must not open the card.
// (Headless Chrome's synthetic drag doesn't select PDF text, so make the selection directly, then click for real.)
await click('[data-act="tab"][data-v="notes"]'); await wait(200);
[x, y] = await center(hY);
await js(`(() => { const s = [...document.querySelectorAll('.textLayer span')].find(s => s.textContent.includes("Coverage tells the reader")); const r = document.createRange(); r.selectNodeContents(s); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); })()`);
await js(`document.querySelector('#pages').dispatchEvent(new MouseEvent("mousedown", {bubbles:true}))`);
await js(`(() => { const el = document.elementFromPoint(${x}, ${y}); el.dispatchEvent(new MouseEvent("click", {bubbles:true, clientX:${x}, clientY:${y}, button:0})); })()`); await wait(400);
check(await js(`document.querySelector('.tab.on').dataset.v`) === "notes" && await js(`getSelection().toString().length > 0`), "a click that ends a text selection over a highlight keeps the selection and doesn't open the card");
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
ws.close(); process.exit(fails ? 1 : 0);
