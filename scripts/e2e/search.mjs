// Search inside the library: highlights, note lines and session takeaways, and where each result leads.
// Usage: node scripts/e2e/search.mjs <chromeDebugPort> <appUrl>   (static server; uses the example papers)
const [port, app] = process.argv.slice(2);
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
const search = async q => { await js(`(() => { const i = document.querySelector('#q'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event("input", {bubbles:true})); })()`); await wait(400); };
const results = () => js(`[...document.querySelectorAll('.sr-i')].map(b => ({act: b.dataset.act, tab: b.dataset.tab || "", text: b.querySelector('.sr-t').textContent, marks: b.querySelectorAll('mark').length, where: b.querySelector('.sr-p').textContent, paper: b.closest('.sr-g').querySelector('.sr-h').firstChild.textContent}))`);
const page = () => js(`+document.querySelector('#pgIn').value`);
const tabOn = () => js(`document.querySelector('.tab.on').dataset.v`);

await cdp("Page.enable"); await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: app }); await wait(1500);
await cdp("Page.navigate", { url: "about:blank" }); await wait(300);   // leave first: the app saves on unload
await cdp("Storage.clearDataForOrigin", { origin: new URL(app).origin, storageTypes: "all" });
await cdp("Page.navigate", { url: app }); await wait(1800);
check(await js(`document.querySelector('#q').placeholder`) === "Search papers, notes, highlights", "the search box says it searches notes and highlights");

// a note with a page reference and accents, written the normal way
await js(`[...document.querySelectorAll('[data-act="open"]')].find(e => /Attention Is All You Need/.test(e.textContent)).click()`); await wait(1500);
await click('[data-act="tab"][data-v="notes"]'); await click('[data-act="nmode"][data-v="edit"]');
await js(`(() => { const t = document.querySelector('#noteTa'); t.value = t.value + "\\n\\n## Follow-ups\\n- Compare the sinusoidal positional encoding with learned ones, p. 6\\n- A naïve baseline for the café dataset"; t.dispatchEvent(new Event("input", {bubbles:true})); })()`); await wait(700);
await click('[data-act="home"]'); await wait(400);

// ---------- highlights ----------
await search("softmax");
let r = await results();
const hl = r.find(x => x.act === "open-hl" && /softmax does not saturate/.test(x.text));
check(!!hl && hl.paper === "Attention Is All You Need" && hl.where === "p. 4" && hl.marks >= 1, `a highlight matches, under its paper, with its page and the word marked (${hl && hl.where})`);
check(await js(`document.querySelector('.eyebrow').textContent.includes("softmax")`) && await js(`!!document.querySelector('#sr-h')`), "results show in the library under “In your notes and highlights”");
await search("saturate SOFTMAX");
check((await results()).some(x => /softmax does not saturate/.test(x.text)), "word order and case don't matter");
await js(`[...document.querySelectorAll('.sr-i')].find(b => /softmax does not saturate/.test(b.textContent)).click()`); await wait(1500);
check(await tabOn() === "highlights" && await page() === 4, "clicking it opens the paper's Highlights at page 4");

// ---------- notes ----------
await search("positional sinusoidal");
r = await results();
const note = r.find(x => x.tab === "notes" && /sinusoidal positional encoding/.test(x.text));
check(!!note && note.where === "p. 6", `a line in the notes matches, with the page it cites (${note && note.where})`);
await js(`[...document.querySelectorAll('.sr-i')].find(b => b.dataset.tab === "notes" && /sinusoidal positional/.test(b.textContent)).click()`); await wait(1600);
check(await tabOn() === "notes" && await page() === 6, "clicking it opens Notes at page 6");
check(await js(`(() => { const f = document.querySelector('#mdView .found'); return !!f && f.textContent.includes("sinusoidal positional"); })()`), "and the matching line in the notes is scrolled to and flashed");
await search("naive cafe");
check((await results()).some(x => /café dataset/.test(x.text)), "accents don't matter (naive cafe finds naïve … café)");

// ---------- session takeaways ----------
await search("divided scores");
r = await results();
const ses = r.find(x => x.tab === "sessions");
check(!!ses && /divided by/.test(ses.text), `a session takeaway matches (${ses && ses.text.slice(0, 60)})`);
await js(`[...document.querySelectorAll('.sr-i')].find(b => b.dataset.tab === "sessions").click()`); await wait(1500);
check(await tabOn() === "sessions", "clicking it opens the paper's Sessions");

// ---------- scope and nothing found ----------
await click('[data-act="home"]'); await wait(300);
await click('[data-act="filter"][data-v="completed"]'); await wait(300);
await js(`(() => { const i = document.querySelector('#q'); i.value = "softmax"; i.dispatchEvent(new Event("input", {bubbles:true})); })()`); await wait(400);
check(!(await results()).some(x => x.paper === "Attention Is All You Need"), "inside the Completed filter, a Reading paper's highlights aren't listed");
await search("zebra quantum");
check(/Nothing in your notes, highlights or session takeaways matches/.test(await js(`document.querySelector('#sr-h').parentElement.parentElement.textContent`)), "a search with no matches says so");
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
ws.close(); process.exit(fails ? 1 : 0);
