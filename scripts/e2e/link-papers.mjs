// Papers saved as a link, without the PDF: the form (BibTeX, tags, notes), the paper page, no sessions,
// attaching the PDF later, arXiv fill-in (NEEDS INTERNET), and browser-storage mode.
// Starts its own pdfdesk (throwaway folder) and static server. Run Chrome with a fresh --user-data-dir. From the repo root:
//   node scripts/e2e/link-papers.mjs <chromeDebugPort> <abs path>/sample-paper.pdf <abs empty work dir> [outDir]
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [dport, pdf, work, out] = process.argv.slice(2);
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (ok, what) => { console.log(ok ? "PASS" : "FAIL", what); if (!ok) fails++; };
rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
const D = join(work, "lib"), procs = [];
const serve = (args, cmd = "python") => { const p = spawn(cmd, args, { stdio: "ignore" }); procs.push(p); return p; };
const up = async port => { for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${port}/`); return; } catch { await wait(150); } } throw new Error("no server on " + port); };
serve(["-m", "pdfdesk", "--no-browser", "--port", "5211", "--data-dir", D]); serve(["scripts/serve.mjs", "5212"], process.execPath);
await up(5211); await up(5212);

const list = await (await fetch(`http://127.0.0.1:${dport}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, m => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => { const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || e); return r.result.value; };
const click = sel => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error("missing " + ${JSON.stringify(sel)}); el.click(); return true; })()`);
const shot = async n => { if (out) writeFileSync(`${out}/${n}.png`, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64")); };
const setVal = (sel, v) => js(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event("input", {bubbles:true})); })()`);
const val = sel => js(`document.querySelector(${JSON.stringify(sel)}).value`);
const txt = sel => js(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
const KEYS = { Enter: 13, Escape: 27 };
const key = async k => { for (const type of ["keyDown", "keyUp"]) await cdp("Input.dispatchKeyEvent", { type, key: k, windowsVirtualKeyCode: KEYS[k] }); await wait(150); };
const type = async s => { await cdp("Input.insertText", { text: s }); await wait(150); };
const lib = () => JSON.parse(readFileSync(join(D, "library.json"), "utf8")).papers;
const openRow = re => js(`[...document.querySelectorAll('tr[data-act="open"]')].find(r => ${re}.test(r.textContent)).click()`);
const setFile = async (sel, path) => { const { root } = await cdp("DOM.getDocument"); const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector: sel }); await cdp("DOM.setFileInputFiles", { nodeId, files: [path] }); };

const BIB = `@article{schmidhuber2015deep,
  title={Deep learning in neural networks: An overview},
  author={Schmidhuber, J{\\"u}rgen and Veli{\\v{c}}kovi{\\'c}, Petar and others},
  journal={Neural networks},
  volume={61},
  pages={85--117},
  year={2015},
  publisher={Elsevier}
}`;
const URL1 = "https://www.sciencedirect.com/science/article/pii/S0893608014002135";
const ABS = "In recent years, deep artificial neural networks have won numerous contests in pattern recognition.\n\nThis historical survey compactly summarizes relevant work, much of it from the previous millennium.";

await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("DOM.enable"); await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
await cdp("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
try {
  await cdp("Page.navigate", { url: "http://localhost:5211/" }); await wait(2200);
  check(await js(`!!document.querySelector('.side [data-act="add-link"]')`), "the sidebar offers Add by link, without the PDF");

  // ---------- the form ----------
  await click('.side [data-act="add-link"]'); await wait(250);
  check(await js(`document.activeElement.id`) === "lkUrl", "the form opens with the link box focused");
  await type(URL1);
  check(await js(`document.querySelector('#lkFound').hidden`), "a publisher link with no arXiv id or DOI offers no lookup (nothing is fetched)");
  await setVal("#lkBib", BIB); await wait(150);
  check(await val("#lkTitle") === "Deep learning in neural networks: An overview" && await val("#lkYear") === "2015" && await val("#lkVenue") === "Neural networks",
    "pasting Scholar's BibTeX fills title, year and venue");
  check(await val("#lkAuth") === "Schmidhuber, Veličković, et al.", `authors: last names, LaTeX accents decoded, "others" becomes et al. (${await val("#lkAuth")})`);
  await setVal("#lkAbs", ABS);
  await js(`document.querySelector('#tagIn-draft').focus()`); await wait(150);
  const sug = await js(`[...document.querySelectorAll('#tagSug-draft .ts-i')].map(b => b.dataset.v)`);
  check(sug.length > 3 && sug[0] === "transformers", `the tag box suggests the library's tags here too (${sug.slice(0, 4).join(", ")}…)`);
  await type("vis"); await key("Enter"); await type("deep learning survey"); await key("Enter");
  check(JSON.stringify(await js(`[...document.querySelectorAll('[data-tags-of="draft"] .tag')].map(t => t.firstChild.textContent)`)) === '["vision","deep-learning-survey"]', "an existing tag and a new one are added in the form");
  await setVal("#lkNotes", "Background reading for the related-work section.\n- check the LSTM history");
  await shot("link-form");
  await js(`document.querySelector('#lkNotes').focus()`); await key("Escape");
  check(!(await js(`document.querySelector('#modal').hidden`)) && /Cancel to discard/.test(await txt("#lkMsg")), "Escape doesn't throw away a filled-in form");
  await js(`document.querySelector('#modal').click()`); await wait(150);
  check(!(await js(`document.querySelector('#modal').hidden`)), "neither does clicking outside it");
  await click('[data-act="lk-save"]'); await wait(1200);
  const lp = lib().find(p => p.url === URL1);
  check(await js(`document.querySelector('#modal').hidden`) && !!lp, `Add paper saves it (${await txt("#toast")})`);
  check(lp && !lp.hasFile && lp.abstract === ABS && lp.status === "inbox" && JSON.stringify(lp.tags) === '["vision","deep-learning-survey"]' && /related-work/.test(lp.notes) && lp.year === 2015,
    "library.json has it without a PDF, with abstract, tags, notes, year");
  check(await js(`document.querySelector('.page-h').textContent`) === "No PDF yet" && /No PDF yet\s*1/.test(await js(`document.querySelector('[data-act="filter"][data-v="nopdf"]').textContent`)),
    "the library shows the No PDF yet list, with a count in the sidebar");
  check(await js(`[...document.querySelectorAll('tr[data-act="open"]')][0].textContent.includes("link")`) && await js(`[...document.querySelectorAll('tr[data-act="open"]')][0].textContent.includes("No PDF")`), "the row is marked as a link, with No PDF instead of progress");

  // ---------- the paper page ----------
  await openRow(`/Deep learning in neural networks/`); await wait(800);
  check(await txt("#linkPage h1") === "Deep learning in neural networks: An overview" && await js(`document.querySelectorAll('#linkPage .link-paper > p').length`) === 2, "opening it shows the details and the abstract (two paragraphs)");
  check(await js(`document.querySelector('#linkPage a.btn').href`) === URL1 && await js(`document.querySelector('#linkPage a.btn').target`) === "_blank", "Open paper links to the page, in a new tab");
  check(!(await js(`!!document.querySelector('#timer, #pages, #pgIn')`)), "no timer, page box or pages");
  check(JSON.stringify(await js(`[...document.querySelectorAll('.tabs .tab')].map(t => t.dataset.v)`)) === '["notes","details"]', "the panel has Notes and Details only");
  await click('[data-act="tab"][data-v="notes"]'); await click('[data-act="nmode"][data-v="edit"]'); await wait(150);
  check(!(await js(`!!document.querySelector('[data-act="cite"], [data-act="ins-hl"]')`)) && /related-work/.test(await val("#noteTa")), "notes are there to edit, without Cite p. / Insert highlights");
  await shot("link-paper");
  await js(`document.querySelector('#noteTa').focus()`); await type("\n- add to the survey table"); await wait(500);
  await click('[data-act="tab"][data-v="details"]'); await wait(150);
  check(/Saved as a link/.test(await js(`document.querySelector('#panel').textContent`)) && !(await js(`!!document.querySelector('#tgPage')`)), "Details says it's saved as a link, with no reading target or bookmarks");
  await setVal("#mAbs", ABS + "\n\nEdited."); await wait(150);
  check(await js(`document.querySelectorAll('#linkPage .link-paper > p').length`) === 3, "editing the abstract in Details updates the page");
  await click('[data-act="home"]'); await wait(1200);
  const lp2 = lib().find(p => p.url === URL1);
  check(lp2.sessions.length === 0 && lp2.status === "inbox" && /survey table/.test(lp2.notes) && /Edited\.$/.test(lp2.abstract), "leaving records no session, keeps the status, saves notes and abstract");
  await setVal("#q", "millennium"); await wait(300);
  check(await js(`[...document.querySelectorAll('tr[data-act="open"]')].some(r => /Deep learning in neural networks/.test(r.textContent))`), "searching a word from the abstract finds the paper");
  await setVal("#q", ""); await wait(200);

  // ---------- attach the PDF later ----------
  await click('[data-act="filter"][data-v="nopdf"]'); await wait(200);
  await openRow(`/Deep learning in neural networks/`); await wait(600);
  await setFile("#attachIn", pdf); await wait(3500);
  const lp3 = lib().find(p => p.url === URL1);
  check(await js(`document.querySelectorAll('#pages .page canvas').length > 0`) && await js(`!!document.querySelector('#timer')`), "Attach PDF turns it into a normal paper: pages and the session timer appear");
  check(lp3.hasFile && existsSync(join(D, "pdfs", `${lp3.id}.pdf`)) && JSON.stringify(lp3.tags) === '["vision","deep-learning-survey"]' && /survey table/.test(lp3.notes), "the PDF is in the folder; tags and notes stayed");
  check(!(await js(`!!document.querySelector('[data-act="filter"][data-v="nopdf"]')`)), "the No PDF yet list goes away when it's empty");
  await click('[data-act="home"]'); await wait(500);

  // ---------- an arXiv link: fill in, cancel, then add ----------
  await click('.side [data-act="add-link"]'); await wait(200);
  await setVal("#lkUrl", "https://arxiv.org/abs/1810.04805"); await wait(150);
  check(/arXiv 1810\.04805/.test(await txt("#lkFound")) && await js(`!!document.querySelector('[data-act="lk-fill"]')`), "an arXiv link offers Fill in from arXiv");
  const n0 = readdirSync(join(D, "pdfs")).length;
  await click('[data-act="lk-fill"]');
  for (let i = 0; i < 80 && !(await val("#lkTitle")); i++) await wait(250);
  check(/^BERT/.test(await val("#lkTitle")) && /^Devlin/.test(await val("#lkAuth")) && /PDF was downloaded/.test(await txt("#lkMsg")), `the details are filled in (${await val("#lkTitle")})`);
  check(readdirSync(join(D, "pdfs")).length === n0 + 1, "and the PDF is downloaded");
  await click('[data-act="modal-close"]'); await wait(800);
  check(readdirSync(join(D, "pdfs")).length === n0, "Cancel deletes the downloaded PDF again");
  await click('.side [data-act="add-link"]'); await wait(200);
  await setVal("#lkUrl", "https://arxiv.org/abs/1810.04805"); await click('[data-act="lk-fill"]');
  for (let i = 0; i < 80 && !(await val("#lkTitle")); i++) await wait(250);
  await click('[data-act="lk-save"]'); await wait(1200);
  const bert = lib().find(p => p.arxiv === "1810.04805");
  check(bert && bert.hasFile && existsSync(join(D, "pdfs", `${bert.id}.pdf`)) && bert.url === "https://arxiv.org/abs/1810.04805", "added with its PDF, as a normal paper");
  await click('.side [data-act="add-link"]'); await wait(200);
  await setVal("#lkUrl", "https://arxiv.org/abs/1810.04805v2"); await wait(150);
  check(/already in your library/.test(await txt("#lkFound")), "the same arXiv paper again is spotted before you fill anything in");
  await click('[data-act="modal-close"]'); await wait(200);

  // ---------- mistakes ----------
  await click('.side [data-act="add-link"]'); await wait(200);
  await setVal("#lkTitle", "Some paper"); await click('[data-act="lk-save"]'); await wait(150);
  check(/starting with https/.test(await txt("#lkMsg")) && await js(`document.activeElement.id`) === "lkUrl", "no link: asks for one");
  await setVal("#lkUrl", "https://example.org/paper"); await setVal("#lkTitle", ""); await click('[data-act="lk-save"]'); await wait(150);
  check(/Give the paper a title/.test(await txt("#lkMsg")), "no title: asks for one");
  await setVal("#lkBib", "not bibtex"); await wait(100);
  check(/doesn't look like BibTeX/.test(await txt("#lkMsg")), "text that isn't BibTeX says so");
  await click('[data-act="modal-close"]'); await wait(200);

  // ---------- browser-storage mode ----------
  await cdp("Page.navigate", { url: "http://localhost:5212/" }); await wait(1800);
  await click('.side [data-act="add-link"]'); await wait(200);
  await setVal("#lkUrl", "https://doi.org/10.1145/3292500.3330701"); await wait(150);
  check(/Start PDFDesk with the/.test(await txt("#lkFound")), "on a static server a DOI link explains that lookup needs the pdfdesk command");
  await setVal("#lkTitle", "Optuna"); await click('[data-act="lk-save"]'); await wait(800);
  const st = await js(`JSON.parse(localStorage.getItem("researchdesk.v1")).papers.find(p => p.title === "Optuna")`);
  check(st && !st.hasFile && st.doi === "10.1145/3292500.3330701", "it can still be added by hand, with the DOI kept for spotting duplicates");
} catch (e) { console.log("ERROR", e.message); fails++; }
finally { for (const p of procs) try { p.kill(); } catch {} }
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
ws.close(); process.exit(fails ? 1 : 0);
