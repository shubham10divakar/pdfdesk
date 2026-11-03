// Adding papers by arXiv id or DOI, end to end. NEEDS INTERNET: talks to the real arXiv and Crossref.
// Starts its own pdfdesk (throwaway folder) and static server. From the repo root:
//   node scripts/e2e/add-by-id.mjs <chromeDebugPort> <abs empty work dir>
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [dport, work] = process.argv.slice(2);
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (ok, what) => { console.log(ok ? "PASS" : "FAIL", what); if (!ok) fails++; };
rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
const D = join(work, "lib"), procs = [];
const serve = (args, cmd = "python") => { const p = spawn(cmd, args, { stdio: "ignore" }); procs.push(p); return p; };
const up = async port => { for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${port}/`); return; } catch { await wait(150); } } throw new Error("no server on " + port); };
serve(["-m", "pdfdesk", "--no-browser", "--port", "5201", "--data-dir", D]); serve(["scripts/serve.mjs", "5202"], process.execPath);
await up(5201); await up(5202);

const list = await (await fetch(`http://127.0.0.1:${dport}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, m => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => { const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || e); return r.result.value; };
const click = sel => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error("missing " + ${JSON.stringify(sel)}); el.click(); return true; })()`);
const toast = () => js(`document.querySelector('#toast').textContent`);
const lib = () => JSON.parse(readFileSync(join(D, "library.json"), "utf8")).papers;
const addId = async q => {
  await click('[data-act="add-id"]'); await wait(200);
  await js(`(() => { const i = document.querySelector('#idIn'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", bubbles:true})); })()`);
  for (let i = 0; i < 120; i++) { await wait(250); const st = await js(`(() => { const m = document.querySelector('#modal'); return m.hidden ? "closed" : (document.querySelector('#idMsg')?.textContent || ""); })()`); if (st){ await wait(1200); return st; } }   // let the save (300 ms debounce) reach library.json
  return "timeout";
};
await cdp("Page.enable"); await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
try {
  await cdp("Page.navigate", { url: "http://localhost:5201/" }); await wait(2000);
  check(await js(`!!document.querySelector('.side [data-act="add-id"]')`), "the sidebar offers Add by arXiv ID or DOI");

  // ---------- arXiv, with its PDF ----------
  let st = await addId("arXiv:1706.03762");
  const ax = lib().find(p => p.arxiv === "1706.03762");
  check(st === "closed" && !!ax, `an arXiv id adds the paper (${await toast()})`);
  check(ax && ax.title === "Attention Is All You Need" && /^Vaswani, Shazeer/.test(ax.authors) && ax.year === 2017 && ax.status === "inbox", "with title, authors, year, in the Inbox");
  const pdf = ax && join(D, "pdfs", `${ax.id}.pdf`);
  check(ax && ax.hasFile && existsSync(pdf) && readFileSync(pdf).subarray(0, 5).toString() === "%PDF-", "and its PDF is in the library folder");
  await js(`[...document.querySelectorAll('tr[data-act="open"]')].find(r => /Attention Is All You Need/.test(r.textContent) && !/example/i.test(r.textContent)).click()`); await wait(4000);
  check(await js(`document.querySelectorAll('#pages .page canvas').length > 0`), "the downloaded PDF opens in the reader");
  await click('[data-act="tab"][data-v="details"]'); await wait(200);
  check(await js(`document.querySelector('.src-link')?.textContent`) === "arXiv 1706.03762 ↗" && await js(`document.querySelector('.src-link').href`) === "https://arxiv.org/abs/1706.03762", "Details links to the arXiv page");
  await click('[data-act="home"]'); await wait(300);

  // ---------- the same paper again ----------
  const n0 = lib().length, files0 = readdirSync(join(D, "pdfs")).length;
  st = await addId("https://arxiv.org/abs/1706.03762v7");
  await wait(600);
  check(st === "closed" && /already in your library/.test(await toast()) && lib().length === n0 && readdirSync(join(D, "pdfs")).length === files0, "adding it again opens the one you have, and downloads nothing");
  await click('[data-act="home"]'); await wait(300);

  // ---------- DOI, no PDF ----------
  st = await addId("https://doi.org/10.1145/3292500.3330701");
  const dp = lib().find(p => p.doi === "10.1145/3292500.3330701");
  check(st === "closed" && dp && dp.title === "Optuna: A Next-generation Hyperparameter Optimization Framework" && dp.year === 2019 && !dp.hasFile, `a DOI adds the paper without a PDF (${await toast()})`);
  check(dp && /Knowledge Discovery & Data Mining/.test(dp.venue), `venue comes through without HTML (${dp && dp.venue})`);

  // ---------- mistakes ----------
  st = await addId("attention is all you need");
  check(/doesn't look like an arXiv id/.test(st), `text that isn't an id is refused in the dialog: "${st}"`);
  await click('[data-act="modal-close"]'); await wait(200);
  st = await addId("9999.99999");
  check(/arXiv has no paper 9999\.99999/.test(st), `an unknown arXiv id says so: "${st}"`);
  await click('[data-act="modal-close"]'); await wait(200);

  // ---------- without the pdfdesk server ----------
  await cdp("Page.navigate", { url: "http://localhost:5202/" }); await wait(1800);
  await click('[data-act="add-id"]'); await wait(200);
  check(!(await js(`!!document.querySelector('#idIn')`)) && /needs PDFDesk started with the/.test(await js(`document.querySelector('.mdl').textContent`)), "on a plain static server, the dialog explains it needs the pdfdesk command");
} catch (e) { console.log("ERROR", e.message); fails++; }
finally { for (const p of procs) try { p.kill(); } catch {} }
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
ws.close(); process.exit(fails ? 1 : 0);
