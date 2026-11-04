// Tag picker: suggestions from the library, typing, keys, mouse, new tags, removing. Uses the example library, so run Chrome with a fresh --user-data-dir.
//   node scripts/e2e/tags.mjs <chromeDebugPort> <appUrl> [outDir]     (static server is fine)
import { writeFileSync } from "node:fs";
const [port, app, out] = process.argv.slice(2);
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
const KEYS = { Enter: 13, Escape: 27, Backspace: 8, ArrowDown: 40, ArrowUp: 38, ",": 188 };
const key = async k => { for (const type of ["keyDown", "keyUp"]) await cdp("Input.dispatchKeyEvent", { type, key: k, windowsVirtualKeyCode: KEYS[k], ...(k === "," && type === "keyDown" ? { text: "," } : {}) }); await wait(120); };
const type = async s => { await cdp("Input.insertText", { text: s }); await wait(120); };
const opts = () => js(`[...document.querySelectorAll('#tagSug-paper .ts-i')].map(b => b.textContent.replace(/\\d+$/, "").replace(/^#/, "").replace(/^New tag /, "+"))`);
const sel = () => js(`(document.querySelector('#tagSug-paper .ts-i.on')?.dataset.v) ?? null`);
const tags = () => js(`[...document.querySelectorAll('[data-tags-of="paper"] .tag')].map(t => t.firstChild.textContent)`);
const open = () => js(`!document.querySelector('#tagSug-paper').hidden`);
const focused = () => js(`document.activeElement?.id`);

await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: app }); await wait(1800);   // run with a fresh --user-data-dir: starts on the example library
try {
  await js(`document.querySelector('[data-act="filter"][data-v="all"]').click()`); await wait(300);
  await js(`[...document.querySelectorAll('tr[data-act="open"]')].find(r => /Swin Transformer/.test(r.textContent)).click()`); await wait(1200);
  await js(`document.querySelector('[data-act="tab"][data-v="details"]').click()`); await wait(300);
  check(JSON.stringify(await tags()) === '["vision","transformers"]', `Swin starts with its two tags (${await tags()})`);

  await js(`document.querySelector('#tagIn-paper').focus()`); await wait(200);
  let o = await opts();
  check(await open() && o.length > 0 && !o.includes("vision") && !o.includes("transformers"), `clicking into the box lists the library's other tags (${o.join(", ")})`);
  check(o[0] === "recurrence" && o[1] === "adaptive-computation" && o[2] === "attention", "most used first (recurrence on 3 papers), then by count and A–Z");
  check(await sel() === null, "nothing is pre-selected while the box is empty, so Enter does nothing by accident");
  await shot("tags-empty");

  await type("rec"); o = await opts();
  check(JSON.stringify(o) === '["recurrence","+rec"]' && await sel() === "recurrence", `typing "rec" narrows to recurrence and selects it (${o.join(", ")})`);
  await shot("tags-typing");
  await key("Enter");
  check(JSON.stringify(await tags()) === '["vision","transformers","recurrence"]', "Enter adds the selected tag");
  check(await focused() === "tagIn-paper" && await js(`document.querySelector('#tagIn-paper').value`) === "" && await open(), "the box stays focused and open for the next tag");
  check(await js(`[...document.querySelectorAll('.tagsnav .nav-i')].find(b => /recurrence/.test(b.textContent))?.querySelector('.ct').textContent`) === "4", "the sidebar count for #recurrence goes up to 4");

  await type("at"); o = await opts();
  check(o[0] === "attention" && o.includes("adaptive-computation") && await sel() === "attention", `"at" matches inside words too, tags starting with it first (${o.join(", ")})`);
  await key("ArrowDown"); const s2 = await sel(); await key("ArrowUp");
  check(s2 !== "attention" && await sel() === "attention", `arrow keys move the selection (${s2} then back)`);
  const r = await js(`(() => { const b = [...document.querySelectorAll('#tagSug-paper .ts-i')].find(b => b.dataset.v === "adaptive-computation").getBoundingClientRect(); return {x:b.x + 20, y:b.y + b.height / 2}; })()`);
  for (const t of ["mouseMoved", "mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type: t, x: r.x, y: r.y, button: "left", clickCount: 1 });
  await wait(300);
  check((await tags()).includes("adaptive-computation") && await focused() === "tagIn-paper", "clicking a suggestion with the mouse adds it and keeps focus in the box");

  await type("Diffusion Models"); o = await opts();
  check(JSON.stringify(o) === '["+diffusion-models"]' && await sel() === "diffusion-models", `a new tag is offered as "New tag diffusion-models" and selected (${o})`);
  await key("Enter");
  check((await tags()).at(-1) === "diffusion-models", "Enter creates it (lower case, spaces become dashes)");

  await type("graphs"); await key(",");
  check((await tags()).at(-1) === "graphs", "a comma adds the tag too");
  await js(`(() => { const i = document.querySelector('#tagIn-paper'); i.value = "nlp, Pretraining ,"; i.dispatchEvent(new Event("input", {bubbles:true})); })()`); await wait(200);
  check(JSON.stringify((await tags()).slice(-2)) === '["nlp","pretraining"]', "pasting a comma-separated list adds each tag");

  await key("Backspace");
  check(!(await tags()).includes("pretraining"), "Backspace in the empty box removes the last tag");
  await type("vis"); o = await opts();
  check(!o.includes("vision"), "tags the paper already has are never suggested");
  await key("Escape");
  check(!(await open()) && await js(`document.querySelector('#modal').hidden`) && await js(`!!document.querySelector('#panel .tags-ed')`), "Escape closes the list and nothing else");
  await js(`document.querySelector('#tagIn-paper').value = ""; document.querySelector('#tagIn-paper').blur()`); await wait(150);
  check(!(await open()), "leaving the box closes the list");
  await js(`document.querySelector('[data-act="tag-del"][data-v="graphs"]').click()`); await wait(150);
  check(!(await tags()).includes("graphs"), "× still removes a tag");

  await wait(600); await cdp("Page.reload"); await wait(1800);
  const saved = await js(`JSON.parse(localStorage.getItem("researchdesk.v1")).papers.find(p => /Swin/.test(p.title)).tags`);
  check(JSON.stringify(saved) === '["vision","transformers","recurrence","adaptive-computation","diffusion-models","nlp"]', `tags are saved (${saved})`);
} catch (e) { console.log("ERROR", e.message); fails++; }
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
ws.close(); process.exit(fails ? 1 : 0);
