// Drive headless Chrome over CDP and capture PDFDesk screenshots.
// Usage: node shoot.mjs <debugPort> <appUrl> <pdfPath> <outDir>
import { writeFileSync } from "node:fs";
const [port, app, pdf, out] = process.argv.slice(2);
const wait = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, m => m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async expr => { const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || expr); return r.result.value; };
const shot = async name => { const r = await cdp("Page.captureScreenshot", { format: "png" }); writeFileSync(`${out}/${name}.png`, Buffer.from(r.data, "base64")); console.log("saved", name); };
const scheme = v => cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: v }] });
const click = sel => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error("no " + ${JSON.stringify(sel)}); el.click(); return true; })()`);

await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("DOM.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
await scheme("light");
await cdp("Page.navigate", { url: app }); await wait(2500);
await shot("overview");
await scheme("dark"); await wait(400); await shot("overview-dark"); await scheme("light");
await click('[data-act="filter"][data-v="all"]'); await wait(600); await shot("library");

// Import the sample PDF and open it.
const { root } = await cdp("DOM.getDocument");
const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "#fileIn" });
await cdp("DOM.setFileInputFiles", { nodeId, files: [pdf] });
await wait(2500);
await js(`(() => { const b = [...document.querySelectorAll('[data-act="open"]')].find(e => /Reading Logs/.test(e.textContent)); b.click(); return true; })()`);
await wait(3500);

// Highlight lines by selecting text-layer spans, as a reader would.
const highlight = async (phrase, lines, color) => {
  const ok = await js(`(() => {
    const spans = [...document.querySelectorAll('.textLayer span')].filter(s => s.firstChild && s.firstChild.nodeType === 3);
    const i = spans.findIndex(s => s.textContent.includes(${JSON.stringify(phrase)})); if (i < 0) return false;
    const a = spans[i], b = spans[Math.min(spans.length - 1, i + ${lines} - 1)];
    const r = document.createRange(); r.setStart(a.firstChild, a.textContent.indexOf(${JSON.stringify(phrase)})); r.setEnd(b.firstChild, b.textContent.length);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    a.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); return true; })()`);
  if (!ok) { console.log("phrase not found:", phrase); return; }
  await wait(150); await click(`[data-act="hl"][data-v="${color}"]`); await wait(300);
};
await highlight("Only active time counts", 2, "green");
await highlight("Coverage tells the reader", 2, "yellow");
await highlight("Highlights carry a colour", 2, "blue");
await highlight("neither records the reading itself", 1, "pink");

// Write notes with page links.
await click('[data-act="tab"][data-v="notes"]'); await wait(200);
await click('[data-act="nmode"][data-v="edit"]'); await wait(200);
await js(`(() => { const ta = document.querySelector('#noteTa'); ta.value = ${JSON.stringify(
"## Takeaway\nThe reading log, not the highlights, is what brings a paper back months later (p. 1).\n\n## Method\n- Sessions store page range, active minutes and a takeaway\n- Active time pauses after 3 min idle, p. 1\n- Coverage = union of page ranges / pages (p. 1)\n\n> Notes link back to the page they cite.\n\n## Follow up\n- Compare with spaced repetition for highlights, p. 2"
)}; ta.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await click('[data-act="nmode"][data-v="preview"]'); await wait(300);
await js(`document.querySelector('#pages').scrollTop = 0`); await js(`document.querySelectorAll(".toast").forEach(t => t.hidden = true)`); await wait(600);
console.log("h-overflow:", await js(`(() => { const e = document.querySelector("#pages"); return e.scrollWidth - e.clientWidth; })()`));
await shot("reader-notes");
await click('[data-act="tab"][data-v="highlights"]'); await wait(400); await js(`document.querySelectorAll(".toast").forEach(t => t.hidden = true)`); await shot("reader-highlights");
await scheme("dark"); await wait(500); await shot("reader-dark"); await scheme("light");
ws.close();
