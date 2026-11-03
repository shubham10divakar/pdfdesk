// Editing and deleting reading sessions, and the overview following along.
// Usage: node scripts/e2e/sessions.mjs <chromeDebugPort> <appUrl>   (static server; uses the example papers)
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
const key = async (sel, k) => js(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new KeyboardEvent("keydown", {key:${JSON.stringify(k)}, bubbles:true}))`);
const lib = () => js(`JSON.parse(localStorage.getItem("researchdesk.v1"))`);
const paper = async () => (await lib()).papers.find(p => /Attention Is All You Need/.test(p.title));
const rows = () => js(`[...document.querySelectorAll('.sess')].map(r => r.querySelector('.main-l')?.textContent.replace(/\\s+/g, " ").trim() || "editing")`);
// "Read this week" on the overview, in minutes
const weekMin = async () => { await click('[data-act="home"]'); await wait(400); const t = await js(`[...document.querySelectorAll('.stat')].find(s => /Read this week/.test(s.textContent)).querySelector('.v').textContent`); const h = /(\d+)\s*h/.exec(t), m = /(\d+)\s*m/.exec(t); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); };
const openSessions = async () => { await js(`[...document.querySelectorAll('[data-act="open"]')].find(e => /Attention Is All You Need/.test(e.textContent)).click()`); await wait(1500); await click('[data-act="tab"][data-v="sessions"]'); await wait(300); };

await cdp("Page.enable"); await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: app }); await wait(1500);
await cdp("Page.navigate", { url: "about:blank" }); await wait(300);   // leave first: the app saves on unload
await cdp("Storage.clearDataForOrigin", { origin: new URL(app).origin, storageTypes: "all" });
await cdp("Page.navigate", { url: app }); await wait(1800);
const week0 = await weekMin();
await openSessions();
const p0 = await paper(), first = p0.sessions[0];
check((await rows()).length === p0.sessions.length && p0.sessions.length >= 3, `the Sessions tab lists ${p0.sessions.length} sessions, each with Edit and Delete`);

// ---------- edit ----------
await click(`[data-act="sess-edit"][data-v="${first.id}"]`); await wait(200);
check(await js(`document.activeElement.id`) === "seFrom", "Edit opens the form with the first field focused");
await js(`(() => { seFrom.value = 9; seTo.value = 4; })()`); await click(`[data-act="sess-save"][data-v="${first.id}"]`); await wait(200);
check(/last page is between 9/.test(await js(`seErr.textContent`)) && (await paper()).sessions[0].from === first.from, `a range that ends before it starts is refused: "${await js(`seErr.textContent`)}"`);
await key("#seFrom", "Escape"); await wait(200);
check(!(await js(`!!document.querySelector('.sess-form')`)) && (await paper()).sessions[0].to === first.to, "Escape cancels without saving");
await click(`[data-act="sess-edit"][data-v="${first.id}"]`); await wait(200);
await js(`(() => { seFrom.value = 3; seTo.value = 7; seMin.value = ${first.minutes - 10}; seNote.value = "Corrected: I was away for ten minutes."; })()`);
await key("#seMin", "Enter"); await wait(300);
let s0 = (await paper()).sessions[0];
check(s0.from === 3 && s0.to === 7 && s0.minutes === first.minutes - 10 && s0.note === "Corrected: I was away for ten minutes.", "Enter saves the new pages, minutes and takeaway");
check((await rows())[0].includes("3–7") && (await rows())[0].includes(`${first.minutes - 10} min`), "the list shows the edited session");
const week1 = await weekMin();
check(week1 === week0 - 10, `the overview's weekly time follows the edit (${week0} -> ${week1} min)`);

// ---------- delete ----------
await openSessions();
const second = (await paper()).sessions[1];
await click(`[data-act="sess-del"][data-v="${second.id}"]`); await wait(200);
check(/Delete this session\?/.test(await js(`document.querySelector('.sess-acts.confirm').textContent`)), "Delete asks first");
await click('[data-act="sess-del-no"]'); await wait(200);
check((await paper()).sessions.some(x => x.id === second.id), "Keep leaves it alone");
await click(`[data-act="sess-del"][data-v="${second.id}"]`); await wait(200); await click(`[data-act="sess-del-yes"][data-v="${second.id}"]`); await wait(300);
const p2 = await paper();
check(!p2.sessions.some(x => x.id === second.id) && p2.sessions.length === p0.sessions.length - 1, "Delete removes it");
check(/Deleted the session from/.test(await js(`document.querySelector('#toast').textContent`)), "and says which one was deleted");

// ---------- the list keeps its place ----------
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 520, deviceScaleFactor: 1, mobile: false }); await wait(500);   // short window, so the list scrolls
await js(`document.querySelector('.pbody').scrollTop = 99999`); await wait(200);
const sc = await js(`document.querySelector('.pbody').scrollTop`);
const last = p2.sessions[p2.sessions.length - 1];
await click(`[data-act="sess-edit"][data-v="${last.id}"]`); await wait(200);
check(sc > 0 && await js(`document.querySelector('.pbody').scrollTop`) >= sc - 2, `editing a session far down the list doesn't jump back to the top (scroll ${Math.round(sc)})`);
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
ws.close(); process.exit(fails ? 1 : 0);
