(function(){
"use strict";
const PDFJS = window.pdfjsLib || window['pdfjs-dist/build/pdf'] || null;
if (PDFJS) { try { PDFJS.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; } catch(e){} }

const $ = (s, r=document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const DAY = 864e5;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const day0 = (t=Date.now()) => { const d = new Date(t); d.setHours(0,0,0,0); return d.getTime(); };
const weekStart = (t=Date.now()) => { const d = new Date(day0(t)); const w = (d.getDay()+6)%7; return d.getTime() - w*DAY; };
const fmtDate = t => new Date(t).toLocaleDateString(undefined, {month:"short", day:"numeric"});
const fmtDay = t => new Date(t).toLocaleDateString(undefined, {weekday:"short", month:"short", day:"numeric"});
const fmtTime = t => new Date(t).toLocaleTimeString(undefined, {hour:"2-digit", minute:"2-digit"});
const fmtMin = m => m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;
const rel = t => { if(!t) return "Never"; const d = Math.round((day0()-day0(t))/DAY); return d===0?"Today":d===1?"Yesterday":d<7?`${d} days ago`:fmtDate(t); };
const isoDay = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

const STATUSES = [["inbox","Inbox"],["planned","Planned"],["reading","Reading"],["paused","Paused"],["completed","Completed"],["revisit","Revisit"]];
const SLABEL = Object.fromEntries(STATUSES);
const scol = s => `var(--s-${s})`;
const pill = s => `<span class="pill" style="--c:${scol(s)}">${SLABEL[s]}</span>`;
const HLC = {yellow:"Key idea", green:"Method / result", blue:"Definition", pink:"Question"};

/* ---------------- storage ---------------- */
const KEY = "researchdesk.v1";
let S;
function load(){ try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch(e){ return null; } }
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} }
let saveT; function saveSoon(){ clearTimeout(saveT); saveT = setTimeout(save, 500); }

const memFiles = new Map();
const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try { const r = indexedDB.open("researchdesk", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch(e){ rej(e); }
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction("files", mode); const req = fn(t.objectStore("files")); t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); }); };
  return {
    put: (k,v) => { memFiles.set(k,v); return tx("readwrite", s => s.put(v,k)).catch(()=>{}); },
    get: async k => { if (memFiles.has(k)) return memFiles.get(k); try { return await tx("readonly", s => s.get(k)); } catch(e){ return null; } },
    del: k => { memFiles.delete(k); return tx("readwrite", s => s.delete(k)).catch(()=>{}); }
  };
})();

/* ---------------- example library ---------------- */
function seed(){
  const now = Date.now(), T = day0();
  const at = (daysAgo, h=21, m=0) => T - daysAgo*DAY + (h*60+m)*6e4;
  const ss = (daysAgo, from, to, min, note, h) => ({id:uid(), date:at(daysAgo, h ?? (20 + daysAgo%3), (daysAgo*17)%60), from, to, minutes:min, note:note||""});
  const hl = (page, color, text, comment) => ({id:uid(), page, color, text, comment:comment||"", rects:null, at:now});
  const P = (o) => Object.assign({id:uid(), sample:true, hasFile:false, tags:[], notes:"", highlights:[], sessions:[], bookmarks:[], target:null, addedAt:now-40*DAY, lastOpened:0, lastPage:1, maxPage:1}, o);
  const papers = [
    P({title:"Attention Is All You Need", authors:"Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin", year:2017, venue:"NeurIPS", pages:15, status:"reading", tags:["transformers","attention"],
      lastPage:12, maxPage:12, lastOpened:at(0,9,40), bookmarks:[5],
      summary:"The paper drops recurrence and convolution entirely and builds a sequence transducer out of stacked self-attention and feed-forward blocks. Every position can attend to every other position in a single step, which shortens the path between distant tokens and makes training far more parallel. The model sets new machine-translation results while training in a fraction of the time of earlier recurrent systems.",
      target:{page:13, date:isoDay(now+DAY)},
      sessions:[ss(0,9,12,35,"Scaled dot-product attention. Why the scores are divided by √d_k.",9), ss(1,5,8,40,"Multi-head attention and the sinusoidal positional encoding."), ss(3,1,4,25,"Introduction and motivation.")],
      highlights:[hl(4,"yellow","Scores are scaled by 1/√d_k so the softmax does not saturate when the key dimension is large."), hl(5,"blue","Multi-head attention: several attention functions run in parallel on learned projections, then concatenate."), hl(6,"pink","Is the sinusoidal encoding actually better than learned positions, or just equivalent?","They report near-identical BLEU. Check later work."), hl(2,"green","Self-attention gives a constant number of sequential operations per layer, versus O(n) for recurrence.")],
      notes:"## Core idea\nReplace recurrence with attention only. Every position attends to every other in one step. p. 2\n\n## Scaled dot-product attention\n- Scores are divided by √d_k so softmax doesn't saturate for large d_k. p. 4\n- Decoder masking keeps generation autoregressive.\n\n## Multi-head\n- h = 8 heads, d_k = d_v = 64. p. 5\n- Each head can specialise; output projection mixes them.\n\n## Open questions\n- How does this compare with a weight-shared, looped block? See **Universal Transformers** in the queue.\n"}),
    P({title:"BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", authors:"Devlin, Chang, Lee, Toutanova", year:2019, venue:"NAACL", pages:16, status:"completed", tags:["transformers","nlp","pretraining"], lastPage:16, maxPage:16, lastOpened:at(2),
      summary:"BERT pre-trains a bidirectional Transformer encoder with two self-supervised objectives, masked language modelling and next-sentence prediction, then fine-tunes the same network for each downstream task with one extra output layer. The approach lifts results across eleven language-understanding benchmarks.",
      sessions:[ss(2,13,16,30,"Ablations. NSP matters less than claimed?"), ss(5,9,12,45,"Fine-tuning setup for GLUE and SQuAD."), ss(6,5,8,40,"Pre-training data and masking strategy (80/10/10)."), ss(8,1,4,30,"Motivation: unidirectional LMs limit fine-tuning.")],
      highlights:[hl(4,"yellow","15% of tokens are chosen for prediction; most are replaced with [MASK], some with random tokens, some left unchanged."), hl(5,"green","Fine-tuning reuses all pre-trained parameters and adds a single task-specific output layer.")],
      notes:"## Takeaways\n- Masked LM gives deep bidirectional context. p. 4\n- Fine-tuning is cheap: one output layer. p. 5\n"}),
    P({title:"An Image Is Worth 16x16 Words: Transformers for Image Recognition at Scale", authors:"Dosovitskiy, Beyer, Kolesnikov, Weissenborn, Zhai, Unterthiner, et al.", year:2021, venue:"ICLR", pages:22, status:"reading", tags:["vision","transformers"], lastPage:8, maxPage:8, lastOpened:at(1,22),
      summary:"ViT splits an image into fixed-size patches, embeds each patch linearly and feeds the sequence to a standard Transformer encoder with a learnable class token. With enough pre-training data the plain Transformer matches or beats strong convolutional networks while needing less compute to train.",
      target:{page:9, date:isoDay(now+2*DAY)},
      sessions:[ss(1,5,8,50,"Inductive bias discussion. ViT needs large-scale pre-training."), ss(4,1,4,35,"Patch embedding and class token.")],
      highlights:[hl(3,"blue","Patches are flattened and linearly projected; a learnable class token is prepended to the sequence."), hl(6,"pink","Why does ViT underperform ResNets on mid-sized datasets? Lack of locality bias.")],
      notes:"## Architecture\n- 16×16 patches → linear projection → + position embeddings. p. 3\n- [class] token output feeds the MLP head.\n"}),
    P({title:"Universal Transformers", authors:"Dehghani, Gouws, Vinyals, Uszkoreit, Kaiser", year:2019, venue:"ICLR", pages:23, status:"planned", tags:["transformers","recurrence","adaptive-computation"], addedAt:now-5*DAY,
      summary:"The Universal Transformer applies one shared Transformer block repeatedly over depth, refining every position in parallel at each step. A per-position adaptive halting mechanism lets the model decide how many refinement steps each symbol needs.",
      target:{page:1, date:isoDay(now+3*DAY)}}),
    P({title:"Graph Attention Networks", authors:"Veličković, Cucurull, Casanova, Romero, Liò, Bengio", year:2018, venue:"ICLR", pages:12, status:"revisit", tags:["graphs","attention"], lastPage:12, maxPage:12, lastOpened:at(20),
      summary:"GAT layers let each node attend over its neighbours with learned, masked self-attention coefficients, so different neighbours receive different weights without any costly matrix operation or prior knowledge of the graph structure.",
      sessions:[ss(20,7,12,40,"Multi-head averaging in the final layer."), ss(22,1,6,45,"Attention coefficients and LeakyReLU scoring.")],
      highlights:[hl(3,"yellow","Attention is masked to the first-order neighbourhood, so the layer works directly on graph structure."), hl(4,"green","Final layer averages heads instead of concatenating them.")],
      notes:"Revisit for the loop-carried graph attention idea. p. 3\n"}),
    P({title:"Looped Transformers as Programmable Computers", authors:"Giannou, Rajput, Sohn, Lee, Lee, Papailiopoulos", year:2023, venue:"ICML", pages:30, status:"paused", tags:["transformers","recurrence"], lastPage:11, maxPage:11, lastOpened:at(9),
      summary:"The authors show that a fixed, shallow Transformer placed in a loop can emulate a general-purpose computer, implementing basic instructions and simple algorithms by reading and writing to a scratchpad held in its input sequence.",
      sessions:[ss(9,6,11,55,"Instruction set construction. Dense; pause and come back."), ss(11,1,5,40,"Overview of the looped construction.")],
      highlights:[hl(7,"pink","How sensitive is the construction to numerical precision once loops get long?")]}),
    P({title:"Swin Transformer: Hierarchical Vision Transformer using Shifted Windows", authors:"Liu, Lin, Cao, Hu, Wei, Zhang, Lin, Guo", year:2021, venue:"ICCV", pages:14, status:"inbox", tags:["vision","transformers"], addedAt:now-DAY,
      summary:"Swin computes self-attention inside local windows and shifts the window grid between layers so information flows across windows. The result is a hierarchical backbone with cost linear in image size that works for classification, detection and segmentation."}),
    P({title:"Using Deep Learning for Image-Based Plant Disease Detection", authors:"Mohanty, Hughes, Salathé", year:2016, venue:"Frontiers in Plant Science", pages:10, status:"completed", tags:["vision","plant-disease"], lastPage:10, maxPage:10, lastOpened:at(30),
      summary:"A convolutional network trained on a large public dataset of leaf images identifies many crop–disease pairs with high accuracy on held-out data, while the authors caution that performance drops on images taken in real field conditions.",
      sessions:[ss(30,6,10,40,"Results and the field-image caveat."), ss(33,1,5,35,"Dataset and training setup.")],
      highlights:[hl(7,"pink","Accuracy falls sharply on images from other sources. Domain shift is the real problem.")]}),
    P({title:"Deep Residual Learning for Image Recognition", authors:"He, Zhang, Ren, Sun", year:2016, venue:"CVPR", pages:12, status:"planned", tags:["vision"], addedAt:now-3*DAY,
      summary:"Residual networks learn functions relative to their input through identity shortcut connections, which makes very deep networks easier to optimise and lets depth translate into accuracy gains.",
      target:{page:1, date:isoDay(now+6*DAY)}}),
    P({title:"Adaptive Computation Time for Recurrent Neural Networks", authors:"Graves", year:2016, venue:"arXiv", pages:19, status:"inbox", tags:["adaptive-computation","recurrence"], addedAt:now-2*DAY,
      summary:"ACT lets a recurrent network decide how many computation steps to take per input by emitting a halting probability at each step, with a ponder cost that discourages unnecessary computation."})
  ];
  // older reading history so the calendar shows a real habit
  const filler = [[12,"Swin Transformer"],[14,"Graph Attention"],[16,"BERT"],[18,"Deep Learning for Image"],[24,"Graph Attention"],[26,"Looped"],[28,"Deep Learning for Image"],[35,"BERT"],[38,"Attention Is"],[41,"Deep Residual"],[44,"Graph Attention"],[47,"BERT"],[52,"Deep Learning for Image"],[55,"Attention Is"],[60,"Graph Attention"],[63,"BERT"],[67,"Looped"],[70,"Deep Learning"],[74,"BERT"],[78,"Graph Attention"],[81,"Attention Is"],[86,"Deep Residual"],[90,"BERT"],[95,"Graph Attention"],[99,"Attention Is"],[104,"Deep Learning"]];
  filler.forEach(([d, t], i) => { const p = papers.find(x => x.title.startsWith(t) || x.title.includes(t)); if (p) p.sessions.push(ss(d, 1+(i%4), 3+(i%5), 20 + (i*13)%45, "", 19)); });
  papers.forEach(p => p.sessions.sort((a,b) => b.date - a.date));
  return {papers, ui:{view:"home", filter:"all", tab:"notes", nmode:"preview", hlFilter:"all", zoom:1, q:""}};
}

S = load() || seed();
S.ui = Object.assign({view:"home", filter:"all", tab:"notes", nmode:"preview", hlFilter:"all", zoom:1, q:""}, S.ui||{});
if (S.ui.view === "reader") S.ui.view = "home";
const getP = id => S.papers.find(p => p.id === id);
const progress = p => p.pages ? Math.min(1, (p.maxPage||0)/p.pages) : 0;

/* ---------------- sidebar ---------------- */
function renderSide(){
  const counts = {}; STATUSES.forEach(([k]) => counts[k] = 0);
  const tags = {};
  S.papers.forEach(p => { counts[p.status]++; p.tags.forEach(t => tags[t] = (tags[t]||0)+1); });
  const f = S.ui.view === "library" ? S.ui.filter : null;
  const hasEx = S.papers.some(p => p.sample);
  $("#side").innerHTML = `
    <div class="brand"><b>PDFDesk</b><span>local</span></div>
    <button class="btn primary" data-act="add">+ Add PDFs</button>
    <input class="search" id="q" type="search" placeholder="Search title, author, tag" value="${esc(S.ui.q)}" aria-label="Search papers">
    <nav class="nav">
      <button class="nav-i ${S.ui.view==="home"?"on":""}" data-act="home">Overview</button>
      <button class="nav-i ${f==="all"?"on":""}" data-act="filter" data-v="all">All papers <span class="ct">${S.papers.length}</span></button>
    </nav>
    <div>
      <div class="nav-h">Reading lifecycle</div>
      <nav class="nav lifecycle">
        ${STATUSES.map(([k,l]) => `<button class="nav-i ${f===k?"on":""}" data-act="filter" data-v="${k}"><span class="dot" style="--c:${scol(k)}"></span>${l}<span class="ct">${counts[k]}</span></button>`).join("")}
      </nav>
    </div>
    <div class="nav tagsnav">
      <div class="nav-h">Tags</div>
      ${Object.entries(tags).sort((a,b)=>b[1]-a[1]).map(([t,c]) => `<button class="nav-i ${f==="tag:"+t?"on":""}" data-act="filter" data-v="tag:${esc(t)}"><span class="num" style="color:var(--faint)">#</span>${esc(t)}<span class="ct">${c}</span></button>`).join("")}
    </div>
    <div class="side-foot">
      ${hasEx ? `<span>Showing example papers so you can try things out.</span><button data-act="clear-examples">Remove examples</button>` : ""}
      <span>PDFs, notes and history stay in this browser.</span>
    </div>`;
}

/* ---------------- overview ---------------- */
function allSessions(){ const out = []; S.papers.forEach(p => p.sessions.forEach(s => out.push(Object.assign({paper:p}, s)))); return out.sort((a,b) => b.date - a.date); }

function homeHTML(){
  const ses = allSessions();
  const ws = weekStart();
  const week = ses.filter(s => s.date >= ws);
  const wMin = week.reduce((a,s) => a+s.minutes, 0);
  const wPages = week.reduce((a,s) => a + Math.max(1, s.to - s.from + 1), 0);
  const cnt = k => S.papers.filter(p => p.status === k).length;

  const reading = S.papers.filter(p => p.status === "reading").sort((a,b) => (b.lastOpened||0)-(a.lastOpened||0));
  const cont = reading.length ? `<div class="cont">${reading.slice(0,4).map(p => `
      <button class="cont-i" data-act="open" data-v="${p.id}">
        <span class="t">${esc(p.title)}${p.sample?'<span class="ex">example</span>':""}</span>
        <span class="go">Resume p. ${p.lastPage} →</span>
        <span class="m">${rel(p.lastOpened)} · page ${p.lastPage} of ${p.pages} · ${Math.round(progress(p)*100)}%</span>
        <span class="bar"><i style="width:${progress(p)*100}%"></i></span>
      </button>`).join("")}</div>` : `<div class="empty">Nothing in progress. Open a paper from your Inbox or Planned list to start.</div>`;

  // heatmap: 17 weeks ending this week
  const WEEKS = 17, start = ws - (WEEKS-1)*7*DAY, today = day0();
  const perDay = {}; ses.forEach(s => { const k = day0(s.date); perDay[k] = (perDay[k]||0) + s.minutes; });
  let cells = "", activeDays = 0, totalMin = 0, streak = 0;
  for (let i = 0; i < WEEKS*7; i++){
    const d = start + i*DAY; const m = perDay[d]||0;
    if (d <= today){ if (m) { activeDays++; totalMin += m; } }
    const lv = m===0?0:m<25?1:m<45?2:m<70?3:4;
    cells += `<span class="d ${d>today?"fut":"l"+lv} ${d===today?"today":""}" title="${fmtDay(d)}: ${m?fmtMin(m):"no reading"}"></span>`;
  }
  for (let d = today; ; d -= DAY){ if (perDay[d]) streak++; else if (d !== today) break; else continue; if (streak > 400) break; }

  const upcoming = S.papers.filter(p => p.status === "planned" || p.status === "paused" || (p.status==="reading" && p.target))
    .map(p => ({p, due: p.target ? new Date(p.target.date+"T00:00").getTime() : Infinity}))
    .sort((a,b) => a.due - b.due).slice(0,6);
  const upHTML = upcoming.length ? `<div class="list">${upcoming.map(({p,due}) => {
      const dd = due===Infinity ? null : Math.round((due - today)/DAY);
      const lbl = dd===null ? (p.status==="paused"?`paused at p. ${p.lastPage}`:"no date") : dd<0?`${-dd}d overdue`:dd===0?"today":dd===1?"tomorrow":fmtDate(due);
      return `<button class="li" data-act="open" data-v="${p.id}"><span class="dot" style="--c:${scol(p.status)};margin-top:6px"></span><span style="min-width:0"><div class="li-t">${esc(p.title)}</div><div class="li-m">${SLABEL[p.status]}${p.target?` · target p. ${p.target.page}`:""}</div></span><span class="due ${dd!==null&&dd<=1?"soon":""}">${lbl}</span></button>`;
    }).join("")}</div>` : `<div class="empty">No planned papers. Set a status of Planned and a target date from a paper's Details tab.</div>`;

  // revision queue: highlights from completed / revisit papers, rotated daily
  const pool = []; S.papers.filter(p => p.status==="completed"||p.status==="revisit").forEach(p => p.highlights.forEach(h => pool.push({p,h})));
  const seedN = Math.floor(today/DAY);
  const rev = pool.length ? Array.from({length:Math.min(3,pool.length)}, (_,i) => pool[(seedN*7 + i*5) % pool.length]).filter((v,i,a) => a.indexOf(v)===i) : [];
  const revHTML = rev.length ? rev.map(({p,h}) => `<button class="quote" style="--qc:var(--hl-${h.color})" data-act="open-hl" data-v="${p.id}" data-h="${h.id}"><p>${esc(h.text)}</p><span>${esc(p.title)} · p. ${h.page}</span></button>`).join("") : `<div class="empty">Highlights from finished papers will resurface here for review.</div>`;

  // reading log grouped by day
  const byDay = []; ses.slice(0, 14).forEach(s => { const k = day0(s.date); let g = byDay.find(x => x.k === k); if (!g) byDay.push(g = {k, items:[]}); g.items.push(s); });
  const logHTML = byDay.length ? `<div class="log">${byDay.slice(0,6).map(g => `<div class="log-day"><div class="dt">${rel(g.k)==="Today"||rel(g.k)==="Yesterday"?rel(g.k):fmtDay(g.k)}</div><div>${g.items.map(s => `
      <div class="log-e"><b>${esc(s.paper.title)}</b><span class="li-m">pp. <span class="num">${s.from}–${s.to}</span> · <span class="num">${s.minutes}</span> min${s.note?"":""}</span>${s.note?`<q>${esc(s.note)}</q>`:""}</div>`).join("")}</div></div>`).join("")}</div>` : `<div class="empty">Each time you read, a session is recorded here: pages, minutes and what you took away.</div>`;

  const done30 = S.papers.filter(p => p.status==="completed").length;
  return `<div class="wrap">
    <div class="head-row"><div><div class="eyebrow">${new Date().toLocaleDateString(undefined,{weekday:"long", month:"long", day:"numeric"})}</div><h1 class="page-h">Your reading desk</h1></div>
      <button class="btn" data-act="filter" data-v="all">Open library</button></div>
    <div class="stats">
      <div class="stat"><div class="v">${S.papers.length}</div><div class="l">Papers in library</div></div>
      <div class="stat"><div class="v">${cnt("reading")}</div><div class="l">Reading now</div></div>
      <div class="stat"><div class="v">${done30}</div><div class="l">Completed</div></div>
      <div class="stat"><div class="v">${Math.floor(wMin/60)}<small>h</small> ${wMin%60}<small>m</small></div><div class="l">Read this week</div></div>
      <div class="stat"><div class="v">${wPages}</div><div class="l">Pages this week</div></div>
    </div>
    <div class="grid2">
      <section class="sec"><div class="sec-h"><h2>Continue reading</h2><span class="meta">${reading.length} in progress</span></div>${cont}</section>
      <section class="sec"><div class="sec-h"><h2>Reading calendar</h2><span class="meta">last ${WEEKS} weeks</span></div>
        <div class="heat-wrap"><div class="heat-scroll"><div class="heat">${cells}</div></div>
          <div class="heat-foot"><span><span class="num">${activeDays}</span> reading days · <span class="num">${fmtMin(totalMin)}</span> total · streak <span class="num">${streak}</span>d</span>
          <span class="heat-legend">less <span class="d" style="background:var(--h0)"></span><span class="d" style="background:var(--h1)"></span><span class="d" style="background:var(--h2)"></span><span class="d" style="background:var(--h3)"></span><span class="d" style="background:var(--h4)"></span> more</span></div>
        </div></section>
    </div>
    <div class="grid2">
      <section class="sec"><div class="sec-h"><h2>Up next</h2><span class="meta">planned and paused</span></div>${upHTML}</section>
      <section class="sec"><div class="sec-h"><h2>Revision queue</h2><span class="meta">from finished papers, rotates daily</span></div>${revHTML}</section>
    </div>
    <section class="sec"><div class="sec-h"><h2>Reading log</h2><span class="meta">${ses.length} sessions recorded</span></div>${logHTML}</section>
  </div>`;
}

/* ---------------- library ---------------- */
function libHTML(){
  const f = S.ui.filter, q = S.ui.q.trim().toLowerCase();
  let ps = S.papers.slice();
  let title = "All papers", sub = "Everything you've imported.";
  if (f.startsWith("tag:")) { const t = f.slice(4); ps = ps.filter(p => p.tags.includes(t)); title = "#"+t; sub = "Papers with this tag."; }
  else if (f !== "all") { ps = ps.filter(p => p.status === f); title = SLABEL[f]; sub = {inbox:"Imported, not yet evaluated.", planned:"You intend to read these.", reading:"Currently open on your desk.", paused:"Started, then set aside.", completed:"Finished.", revisit:"Worth reading again."}[f]; }
  if (q) ps = ps.filter(p => (p.title+" "+p.authors+" "+p.tags.join(" ")+" "+p.venue).toLowerCase().includes(q));
  ps.sort((a,b) => (b.lastOpened||b.addedAt||0) - (a.lastOpened||a.addedAt||0));
  const rows = ps.map(p => `<tr data-act="open" data-v="${p.id}">
      <td style="max-width:420px"><div class="t">${esc(p.title)}${p.sample?'<span class="ex">example</span>':""}</div><div class="a">${esc(p.authors)} · ${esc(p.venue)} ${p.year||""}</div></td>
      <td>${pill(p.status)}</td>
      <td><div class="prog"><span class="bar" style="--c:${scol(p.status)}"><i style="width:${progress(p)*100}%"></i></span><span class="num">${p.maxPage||0}/${p.pages||"?"}</span></div></td>
      <td class="num" style="font-size:12px;color:var(--muted);white-space:nowrap">${rel(p.lastOpened)}</td>
      <td><div class="row">${p.tags.slice(0,3).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div></td>
    </tr>`).join("");
  return `<div class="wrap">
    <div class="head-row"><div><div class="eyebrow">Library${q?` · matching “${esc(q)}”`:""}</div><h1 class="page-h">${esc(title)}</h1><p class="sub">${sub} <span class="num">${ps.length}</span> ${ps.length===1?"paper":"papers"}.</p></div>
      <button class="btn" data-act="add">+ Add PDFs</button></div>
    ${ps.length ? `<div class="tbl-wrap"><table><thead><tr><th>Paper</th><th>Status</th><th>Progress</th><th>Last read</th><th>Tags</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="empty">No papers here yet. Drop PDFs anywhere on this page, or use Add PDFs.</div>`}
  </div>`;
}

function renderMain(){
  const m = $("#main"); m.classList.remove("is-reader");
  m.innerHTML = S.ui.view === "library" ? libHTML() : homeHTML();
  m.scrollTop = 0;
}
function renderAll(){ renderSide(); if (S.ui.view === "reader" && R) renderPanel(); else renderMain(); }

/* ---------------- reader ---------------- */
let R = null;
const ICON = {
  back:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 3 5 8l5 5"/></svg>',
  minus:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3.5 8h9"/></svg>',
  plus:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3.5 8h9M8 3.5v9"/></svg>',
  bm:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 2.5h8v11L8 10.5l-4 3z"/></svg>',
  bmOn:'<svg viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.6"><path d="M4 2.5h8v11L8 10.5l-4 3z"/></svg>'
};

async function openReader(id, jump){
  closeReader();
  const p = getP(id); if (!p) return;
  if (p.status === "inbox" || p.status === "planned" || p.status === "paused") p.status = "reading";
  p.lastOpened = Date.now();
  S.ui.view = "reader"; S.ui.open = id;
  R = {id, pdf:null, gen:0, current:p.lastPage||1, numPages:p.pages||1, baseW:612, baseH:792, scale:1, rendered:new Set(), obs:null, pending:null,
       session:{start:Date.now(), active:0, from:p.lastPage||1, max:p.lastPage||1}};
  renderSide();
  const m = $("#main"); m.classList.add("is-reader");
  m.innerHTML = `<div class="reader">
    <div class="r-center">
      <div class="r-bar">
        <button class="icon-b" data-act="home" title="Back to overview" aria-label="Back">${ICON.back}</button>
        <div class="r-title" title="${esc(p.title)}">${esc(p.title)}</div>
        <div class="r-group"><input class="pg-in" id="pgIn" inputmode="numeric" aria-label="Page number" value="${R.current}"><span class="r-of" id="pgOf">/ ${p.pages||"…"}</span></div>
        <div class="r-group"><button class="icon-b" data-act="zoom" data-v="-1" aria-label="Zoom out">${ICON.minus}</button><span class="r-of" id="zoomLbl" style="min-width:38px;text-align:center">${Math.round(S.ui.zoom*100)}%</span><button class="icon-b" data-act="zoom" data-v="1" aria-label="Zoom in">${ICON.plus}</button></div>
        <button class="icon-b" id="bmBtn" data-act="bookmark" title="Bookmark this page" aria-label="Bookmark this page">${ICON.bm}</button>
        <span class="timer" id="timer" title="Active reading time this session"><i></i><span id="timerT">0:00</span></span>
      </div>
      <div class="r-banner" id="banner" hidden></div>
      <div class="pages" id="pages"><div class="empty" style="background:var(--raised)">Opening…</div></div>
    </div>
    <aside class="r-panel" id="panel"></aside>
  </div>`;
  renderPanel();
  await loadDoc(p);
  if (jump) goPage(jump.page, jump.hl);
  updateBanner(); updateBm();
}

async function loadDoc(p){
  const gen = ++R.gen;
  if (p.hasFile && PDFJS){
    try {
      const blob = await idb.get(p.id);
      if (!blob) throw new Error("missing");
      const data = new Uint8Array(await blob.arrayBuffer());
      const pdf = await PDFJS.getDocument({data}).promise;
      if (!R || gen !== R.gen) return;
      R.pdf = pdf; R.numPages = pdf.numPages;
      if (p.pages !== pdf.numPages){ p.pages = pdf.numPages; saveSoon(); $("#pgOf").textContent = "/ "+p.pages; }
      const first = await pdf.getPage(1); const vp = first.getViewport({scale:1});
      R.baseW = vp.width; R.baseH = vp.height;
    } catch(e){
      $("#pages").innerHTML = `<div class="empty" style="background:var(--raised);max-width:460px">The PDF file for this paper isn't in this browser any more (it may have been cleared). Your notes and history are safe. Attach the PDF again from the Details tab.</div>`;
      return;
    }
  } else if (p.hasFile && !PDFJS){
    $("#pages").innerHTML = `<div class="empty" style="background:var(--raised);max-width:460px">The PDF renderer didn't load. Check your connection and reopen the paper.</div>`;
    return;
  }
  buildPages();
}

function computeScale(){
  const el = $("#pages"); const avail = Math.max(260, el.clientWidth - 40);
  return Math.min(avail / R.baseW, 1.55) * S.ui.zoom;
}
function buildPages(){
  const el = $("#pages"); if (!el || !R) return;
  const p = getP(R.id); R.gen++; R.rendered = new Set(); if (R.obs) R.obs.disconnect();
  R.scale = computeScale();
  const w = Math.round(R.baseW*R.scale), h = Math.round(R.baseH*R.scale);
  let html = "";
  for (let i = 1; i <= R.numPages; i++) html += `<div class="page" data-n="${i}" style="width:${w}px;height:${h}px;--scale-factor:${R.scale}"><div class="loading">${i}</div><div class="hl-layer"></div><span class="pnum">${i}</span></div>`;
  el.innerHTML = html;
  R.obs = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) renderPage(+en.target.dataset.n); }), {root:el, rootMargin:"900px 0px"});
  el.querySelectorAll(".page").forEach(pg => R.obs.observe(pg));
  goPage(R.current, null, true);
  drawBookmarks();
}
const pageEl = n => $(`#pages .page[data-n="${n}"]`);

async function renderPage(n){
  if (!R || R.rendered.has(n)) return; R.rendered.add(n);
  const gen = R.gen, el = pageEl(n); if (!el) return;
  const p = getP(R.id);
  if (!R.pdf){
    el.querySelector(".loading")?.remove();
    const s = document.createElement("div"); s.className = "sample"; s.innerHTML = sampleHTML(p, n);
    el.prepend(s); drawHighlights(n); return;
  }
  try {
    const page = await R.pdf.getPage(n); if (gen !== R.gen) return;
    const vp = page.getViewport({scale:R.scale});
    el.style.width = Math.round(vp.width)+"px"; el.style.height = Math.round(vp.height)+"px";
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement("canvas"); c.width = Math.floor(vp.width*dpr); c.height = Math.floor(vp.height*dpr);
    c.style.width = vp.width+"px"; c.style.height = vp.height+"px";
    await page.render({canvasContext:c.getContext("2d"), viewport:vp, transform: dpr!==1?[dpr,0,0,dpr,0,0]:null}).promise;
    if (gen !== R.gen) return;
    el.querySelector(".loading")?.remove(); el.prepend(c);
    const tl = document.createElement("div"); tl.className = "textLayer"; el.appendChild(tl);
    const tc = await page.getTextContent();
    if (gen !== R.gen) return;
    try { await PDFJS.renderTextLayer({textContentSource:tc, container:tl, viewport:vp}).promise; } catch(e){}
    drawHighlights(n);
  } catch(e){ R.rendered.delete(n); }
}

function sampleHTML(p, n){
  if (n === 1) return `<div class="v">${esc(p.venue)} ${p.year||""}</div><h1>${esc(p.title)}</h1><div class="au">${esc(p.authors)}</div>
    <h2>Summary</h2><p>${esc(p.summary||"")}</p>
    <div class="note">Example paper. This page stands in for the real PDF so you can try highlighting (select any text above), notes and reading sessions. Use Details → Attach PDF to read the actual paper.</div>`;
  let h = `<div class="rh"><span>${esc(p.title.split(":")[0])}</span><span>${n}</span></div>`;
  let r = n*9301;
  const rnd = () => (r = (r*9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 34; i++){
    if (i === 8 && n % 3 === 0){ h += `<div class="fig">Figure ${Math.ceil(n/3)}</div>`; i += 7; continue; }
    if (rnd() < .08){ h += `<div class="gap"></div>`; continue; }
    h += `<div class="ln" style="width:${rnd()<.15? 40+rnd()*40 : 96+rnd()*4}%"></div>`;
  }
  return h;
}

function drawHighlights(n){
  const el = pageEl(n); if (!el) return; const layer = el.querySelector(".hl-layer"); if (!layer) return;
  const p = getP(R.id);
  layer.innerHTML = p.highlights.filter(h => h.page === n && h.rects).map(h => h.rects.map(r =>
    `<div class="hl c-${h.color}" data-h="${h.id}" style="left:${r.x*100}%;top:${r.y*100}%;width:${r.w*100}%;height:${r.h*100}%"></div>`).join("")).join("");
}
function drawBookmarks(){
  if (!R) return; const p = getP(R.id);
  document.querySelectorAll("#pages .bm").forEach(b => b.remove());
  p.bookmarks.forEach(n => { const el = pageEl(n); if (el){ const b = document.createElement("span"); b.className = "bm"; el.appendChild(b); } });
}

function goPage(n, hlId, instant){
  if (!R) return; n = Math.max(1, Math.min(R.numPages, n|0 || 1));
  const el = pageEl(n), box = $("#pages"); if (!el || !box) return;
  box.scrollTo({top: el.offsetTop - 14, behavior: instant ? "auto" : "smooth"});
  setCurrent(n);
  if (hlId){
    const tryFlash = (k=0) => { const ds = document.querySelectorAll(`.hl[data-h="${hlId}"]`); if (ds.length) ds.forEach(d => { d.classList.remove("flash"); void d.offsetWidth; d.classList.add("flash"); }); else if (k < 20) setTimeout(() => tryFlash(k+1), 150); };
    tryFlash();
  }
}
function setCurrent(n){
  if (!R) return; const p = getP(R.id);
  R.current = n; p.lastPage = n;
  if (n > (p.maxPage||0)) p.maxPage = n;
  if (R.session && n > R.session.max) R.session.max = n;
  const pi = $("#pgIn"); if (pi && document.activeElement !== pi) pi.value = n;
  updateBm(); updateBanner(); updateLive(); saveSoon();
}
function onPagesScroll(){
  if (!R) return; const box = $("#pages"); const top = box.scrollTop + box.clientHeight*0.3;
  let best = R.current;
  for (const el of box.querySelectorAll(".page")){ if (el.offsetTop <= top) best = +el.dataset.n; else break; }
  if (best !== R.current) setCurrent(best);
}
function updateBm(){ if (!R) return; const b = $("#bmBtn"); if (!b) return; const on = getP(R.id).bookmarks.includes(R.current); b.classList.toggle("on", on); b.innerHTML = on ? ICON.bmOn : ICON.bm; }
function updateBanner(){
  if (!R) return; const p = getP(R.id), b = $("#banner"); if (!b) return;
  if (p.pages && p.maxPage >= p.pages && p.status !== "completed" && p.status !== "revisit"){
    b.hidden = false; b.innerHTML = `<span>You've reached the last page.</span><button class="btn sm primary" data-act="status" data-v="completed">Mark as completed</button><button class="btn sm ghost" data-act="status" data-v="revisit">Mark to revisit</button>`;
  } else b.hidden = true;
}

/* sessions */
let lastAct = Date.now();
["mousemove","keydown","touchstart","wheel"].forEach(ev => window.addEventListener(ev, () => lastAct = Date.now(), {passive:true}));
setInterval(() => {
  if (!R || !R.session) return;
  const active = document.visibilityState === "visible" && Date.now() - lastAct < 180000;
  if (active) R.session.active += 1000;
  const t = $("#timer"); if (t) t.classList.toggle("idle", !active);
  const s = Math.floor(R.session.active/1000); const tt = $("#timerT"); if (tt) tt.textContent = `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  updateLive();
}, 1000);
function updateLive(){
  if (!R || !R.session) return; const e = $("#liveSess"); if (!e) return;
  const m = Math.floor(R.session.active/60000);
  e.innerHTML = `Started ${fmtTime(R.session.start)} · <span class="num">${m}</span> min active · pp. <span class="num">${R.session.from}–${R.session.max}</span>`;
}
function endSession(note){
  if (!R || !R.session) return null;
  const s = R.session, p = getP(R.id); R.session = null;
  const min = Math.round(s.active/60000);
  if (min >= 1 || s.max !== s.from || note){
    const rec = {id:uid(), date:s.start, from:s.from, to:Math.max(s.from, s.max), minutes:Math.max(1,min), note:note||""};
    p.sessions.unshift(rec); save(); return rec;
  }
  return null;
}
function closeReader(){
  if (!R) return;
  endSession();
  if (R.obs) R.obs.disconnect();
  try { R.pdf && R.pdf.destroy(); } catch(e){}
  R = null; hidePop(); save();
}
window.addEventListener("pagehide", () => { if (R) { endSession(); if (R) R.session = null; } save(); });

/* ---------------- panel ---------------- */
function renderPanel(){
  if (!R) return; const p = getP(R.id), el = $("#panel"); if (!el) return;
  const tab = S.ui.tab;
  const tabs = [["notes","Notes",""],["highlights","Highlights",p.highlights.length],["sessions","Sessions",p.sessions.length],["details","Details",""]];
  let body = "";
  if (tab === "notes"){
    const mode = S.ui.nmode;
    body = `<div class="row" style="justify-content:space-between"><div class="seg"><button class="${mode==="edit"?"on":""}" data-act="nmode" data-v="edit">Write</button><button class="${mode==="preview"?"on":""}" data-act="nmode" data-v="preview">Read</button></div>
      <div class="row"><button class="btn sm" data-act="cite">Cite p. <span id="citeN" class="num">${R.current}</span></button><button class="btn sm" data-act="ins-hl">Insert highlights</button><button class="btn sm ghost" data-act="copy-notes">Copy</button></div></div>
      ${mode==="edit" ? `<textarea class="note-ta" id="noteTa" spellcheck="true" placeholder="Your notes on this paper. Markdown works: ## headings, - bullets, > quotes. Write p. 4 to link a page.">${esc(p.notes)}</textarea>`
        : `<div class="md" id="mdView">${p.notes.trim() ? md(p.notes) : `<p style="color:var(--muted)">No notes yet. Switch to Write, or select text in the paper and choose Add note.</p>`}</div>`}
      <div class="hint">Saved automatically. Page references like p. 12 become links back into the PDF.</div>`;
  } else if (tab === "highlights"){
    const f = S.ui.hlFilter;
    const hs = p.highlights.filter(h => f==="all" || h.color===f).sort((a,b) => a.page - b.page || a.at - b.at);
    body = `<div class="row"><div class="seg"><button class="${f==="all"?"on":""}" data-act="hlf" data-v="all">All</button>${Object.keys(HLC).map(c => `<button class="${f===c?"on":""}" data-act="hlf" data-v="${c}" title="${HLC[c]}"><span class="dot" style="--c:var(--hl-${c})"></span></button>`).join("")}</div>
      <button class="btn sm" data-act="ins-hl" style="margin-left:auto">Extract to notes</button></div>
      <div class="hint">Yellow key idea · green method/result · blue definition · pink question</div>
      ${hs.length ? hs.map((h,i) => `${i?'<div class="hl-sep"></div>':""}<div class="hl-item" style="--c:var(--hl-${h.color})"><span class="stripe"></span><div class="body">
          <p class="txt">${esc(h.text)}</p>
          <textarea class="hl-cm" data-cm="${h.id}" rows="1" placeholder="Add a comment">${esc(h.comment)}</textarea>
          <div class="acts"><button class="pref" data-act="goto" data-v="${h.page}" data-h="${h.id}">p. ${h.page}</button><span>${HLC[h.color]}</span><button data-act="hl-del" data-v="${h.id}" style="margin-left:auto">Remove</button></div>
        </div></div>`).join("") : `<div class="empty">Select text in the paper and pick a colour to highlight it.</div>`}`;
  } else if (tab === "sessions"){
    const tot = p.sessions.reduce((a,s) => a+s.minutes, 0);
    body = `<div class="card"><h3>This session</h3><div id="liveSess" style="font-size:13px"></div>
        <label class="lbl" for="sessNote">What did you get out of it?<textarea class="in" id="sessNote" placeholder="e.g. Understood why scores are scaled by √d_k"></textarea></label>
        <div class="row"><button class="btn sm primary" data-act="log-session">Log session</button><span class="hint">A session is also logged automatically when you leave the paper.</span></div></div>
      <div class="row" style="justify-content:space-between"><b style="font-size:13px">History</b><span class="hint num">${p.sessions.length} sessions · ${fmtMin(tot)}</span></div>
      <div>${p.sessions.length ? p.sessions.map(s => `<div class="sess"><span class="dt">${fmtDate(s.date)}<br>${fmtTime(s.date)}</span>
          <span class="main-l">Pages <button class="pref" data-act="goto" data-v="${s.from}">${s.from}–${s.to}</button> · <span class="num">${s.minutes}</span> min</span>
          ${s.note?`<span class="nt">${esc(s.note)}</span>`:""}</div>`).join("") : `<div class="empty">No sessions yet. Keep reading; time and pages are tracked while this tab is active.</div>`}</div>`;
  } else {
    body = `<div class="card"><h3>Status</h3><div class="status-grid">${STATUSES.map(([k,l]) => `<button class="${p.status===k?"on":""}" style="--c:${scol(k)}" data-act="status" data-v="${k}"><span class="dot" style="--c:${scol(k)}"></span>${l}</button>`).join("")}</div>
        <dl class="kv"><dt>Progress</dt><dd>${p.maxPage||0} / ${p.pages||"?"} pages (${Math.round(progress(p)*100)}%)</dd><dt>Last read</dt><dd>${rel(p.lastOpened)}</dd><dt>Added</dt><dd>${fmtDate(p.addedAt)}</dd></dl></div>
      <div class="card"><h3>Next reading target</h3><div class="two">
        <label class="lbl" for="tgPage">From page<input class="in num" id="tgPage" type="number" min="1" max="${p.pages||999}" value="${p.target?p.target.page:Math.min((p.lastPage||1)+1, p.pages||999)}"></label>
        <label class="lbl" for="tgDate">On<input class="in" id="tgDate" type="date" value="${p.target?p.target.date:""}"></label></div>
        <div class="row"><button class="btn sm" data-act="target-save">Set target</button>${p.target?`<button class="btn sm ghost" data-act="target-clear">Clear</button>`:""}</div></div>
      <div class="card"><h3>Paper</h3>
        <label class="lbl" for="mTitle">Title<input class="in" id="mTitle" data-meta="title" value="${esc(p.title)}"></label>
        <label class="lbl" for="mAuth">Authors<input class="in" id="mAuth" data-meta="authors" value="${esc(p.authors)}"></label>
        <div class="two"><label class="lbl" for="mVenue">Venue<input class="in" id="mVenue" data-meta="venue" value="${esc(p.venue)}"></label><label class="lbl" for="mYear">Year<input class="in num" id="mYear" data-meta="year" value="${esc(p.year)}"></label></div>
        <div class="lbl">Tags<div class="tags-ed">${p.tags.map(t => `<span class="tag">${esc(t)}<button data-act="tag-del" data-v="${esc(t)}" aria-label="Remove tag ${esc(t)}">×</button></span>`).join("")}<input class="in" id="tagIn" placeholder="add tag, Enter" style="width:130px;height:24px"></div></div></div>
      <div class="card"><h3>Bookmarks</h3>${p.bookmarks.length ? `<div class="row">${p.bookmarks.slice().sort((a,b)=>a-b).map(n => `<button class="pref" data-act="goto" data-v="${n}">p. ${n}</button>`).join("")}</div>` : `<span class="hint">Use the bookmark button in the toolbar to mark a page.</span>`}</div>
      <div class="card"><h3>File</h3>
        <span style="font-size:13px;color:var(--muted)">${p.sample ? "This is an example entry without a real PDF." : p.hasFile ? "PDF stored in this browser." : "No PDF attached."}</span>
        <div class="row"><button class="btn sm" data-act="attach">${p.hasFile?"Replace PDF":"Attach PDF"}</button>
        <span id="rmWrap"><button class="btn sm ghost danger" data-act="remove">Remove from library</button></span></div></div>`;
  }
  el.innerHTML = `<div class="tabs" role="tablist">${tabs.map(([k,l,c]) => `<button class="tab ${tab===k?"on":""}" role="tab" aria-selected="${tab===k}" data-act="tab" data-v="${k}">${l}${c!==""?` <span class="ct">${c}</span>`:""}</button>`).join("")}</div><div class="pbody">${body}</div>`;
  updateLive();
}

function md(src){
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/(^|[^*])\*([^*]+)\*/g,"$1<i>$2</i>").replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/\b[pP]p?\.\s?(\d{1,4})(?:[–-](\d{1,4}))?/g, (m,a,b) => `<button class="pref" data-act="goto" data-v="${a}">p. ${a}${b?"–"+b:""}</button>`);
  const out = []; let list = null, para = [];
  const flushP = () => { if (para.length){ out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushL = () => { if (list){ out.push(`<ul>${list.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`); list = null; } };
  src.split("\n").forEach(line => {
    const l = line.trimEnd(); let m;
    if (!l.trim()){ flushP(); flushL(); return; }
    if ((m = l.match(/^(#{1,3})\s+(.*)/))){ flushP(); flushL(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); return; }
    if ((m = l.match(/^\s*[-*]\s+(.*)/))){ flushP(); (list = list || []).push(m[1]); return; }
    if ((m = l.match(/^>\s?(.*)/))){ flushP(); flushL(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); return; }
    flushL(); para.push(l);
  });
  flushP(); flushL(); return out.join("");
}

/* ---------------- selection → highlight ---------------- */
function mergeRects(rs){
  rs = rs.map(r => ({x:Math.max(0,r.x), y:Math.max(0,r.y), w:Math.min(r.w, 1-Math.max(0,r.x)), h:r.h})).sort((a,b) => a.y-b.y || a.x-b.x);
  const out = [];
  for (const r of rs){
    const last = out[out.length-1];
    if (last && Math.abs(r.y - last.y) < 0.006 && r.x <= last.x + last.w + 0.012){ const right = Math.max(last.x+last.w, r.x+r.w); last.h = Math.max(last.h, r.h); last.w = right - last.x; }
    else if (!out.some(o => r.x >= o.x-0.001 && r.y >= o.y-0.001 && r.x+r.w <= o.x+o.w+0.001 && r.y+r.h <= o.y+o.h+0.001)) out.push({...r});
  }
  return out.slice(0, 80);
}
function onSelEnd(){
  setTimeout(() => {
    if (!R) return hidePop();
    const sel = getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return hidePop();
    const txt = sel.toString().replace(/\s+/g, " ").trim(); if (txt.length < 2) return hidePop();
    const range = sel.getRangeAt(0);
    const sc = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const pg = sc && sc.closest && sc.closest(".page"); if (!pg || !$("#pages").contains(pg)) return hidePop();
    const pr = pg.getBoundingClientRect();
    const rects = mergeRects([...range.getClientRects()].filter(r => r.width > 1 && r.height > 1 && r.bottom > pr.top && r.top < pr.bottom)
      .map(r => ({x:(r.left-pr.left)/pr.width, y:(r.top-pr.top)/pr.height, w:r.width/pr.width, h:r.height/pr.height})));
    R.pending = {page:+pg.dataset.n, text:txt.slice(0, 1500), rects};
    const b = range.getBoundingClientRect(), pop = $("#selpop");
    pop.hidden = false;
    const top = b.top > 60 ? b.top - 46 : b.bottom + 8;
    const left = Math.max(120, Math.min(window.innerWidth - 120, b.left + b.width/2));
    pop.style.top = top+"px"; pop.style.left = left+"px";
  }, 10);
}
function hidePop(){ const p = $("#selpop"); if (p) p.hidden = true; if (R) R.pending = null; }
function addHighlight(color, withNote){
  if (!R || !R.pending) return; const p = getP(R.id);
  const h = {id:uid(), page:R.pending.page, color, text:R.pending.text, rects:R.pending.rects, comment:"", at:Date.now()};
  p.highlights.push(h); drawHighlights(h.page);
  try { getSelection().removeAllRanges(); } catch(e){}
  hidePop(); save();
  if (withNote){ S.ui.tab = "highlights"; S.ui.hlFilter = "all"; renderPanel(); const ta = document.querySelector(`[data-cm="${h.id}"]`); if (ta){ ta.scrollIntoView({block:"center"}); ta.focus(); } }
  else { renderPanel(); toast(`Highlighted on p. ${h.page}`); }
}

/* ---------------- import ---------------- */
async function readPdfMeta(file){
  const meta = {pages:0, title:"", authors:""};
  if (!PDFJS) return meta;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await PDFJS.getDocument({data}).promise; meta.pages = pdf.numPages;
    try { const md = await pdf.getMetadata(); const info = md && md.info || {}; if (info.Title && info.Title.trim().length > 4 && !/^microsoft|untitled|\.(docx?|tex)$/i.test(info.Title.trim())) meta.title = info.Title.trim(); if (info.Author) meta.authors = info.Author.trim(); } catch(e){}
    pdf.destroy();
  } catch(e){}
  return meta;
}
async function importFiles(files){
  const pdfs = [...files].filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  if (!pdfs.length) return toast("Only PDF files can be added.");
  toast(`Adding ${pdfs.length} ${pdfs.length===1?"PDF":"PDFs"}…`);
  for (const f of pdfs){
    const m = await readPdfMeta(f);
    const id = uid();
    await idb.put(id, f);
    S.papers.unshift({id, sample:false, hasFile:true, title:m.title || f.name.replace(/\.pdf$/i,"").replace(/[_-]+/g," "), authors:m.authors || "Unknown authors", year:"", venue:"", pages:m.pages||0,
      status:"inbox", tags:[], notes:"", highlights:[], sessions:[], bookmarks:[], target:null, addedAt:Date.now(), lastOpened:0, lastPage:1, maxPage:0});
  }
  save();
  if (S.ui.view === "reader" && R) renderSide(); else { S.ui.view = "library"; S.ui.filter = "inbox"; renderAll(); }
  toast(`${pdfs.length} added to Inbox. Click a paper to start reading.`);
}
async function attachFile(file){
  if (!R || !file) return; const p = getP(R.id);
  const m = await readPdfMeta(file);
  await idb.put(p.id, file);
  p.hasFile = true; p.sample = false; if (m.pages) p.pages = m.pages;
  p.highlights.forEach(h => h.rects = null); // positions from the example page don't apply to the real PDF
  if (p.maxPage > p.pages) p.maxPage = p.pages; if (p.lastPage > p.pages) p.lastPage = 1;
  save(); const id = p.id; toast("PDF attached."); openReader(id);
}

/* ---------------- toast ---------------- */
let toastT;
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }

/* ---------------- events ---------------- */
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const a = t.dataset.act, v = t.dataset.v;
  const p = R ? getP(R.id) : null;
  switch (a){
    case "home": closeReader(); S.ui.view = "home"; save(); renderAll(); break;
    case "filter": closeReader(); S.ui.view = "library"; S.ui.filter = v; save(); renderAll(); break;
    case "open": openReader(v); break;
    case "open-hl": { const pp = getP(v), h = pp && pp.highlights.find(x => x.id === t.dataset.h); S.ui.tab = "highlights"; openReader(v, h ? {page:h.page, hl:h.id} : null); break; }
    case "add": $("#fileIn").click(); break;
    case "attach": $("#attachIn").click(); break;
    case "tab": S.ui.tab = v; save(); renderPanel(); break;
    case "nmode": S.ui.nmode = v; save(); renderPanel(); if (v==="edit") $("#noteTa")?.focus(); break;
    case "goto": goPage(+v, t.dataset.h); break;
    case "zoom": S.ui.zoom = Math.max(0.5, Math.min(2.5, Math.round((S.ui.zoom + (+v)*0.15)*100)/100)); $("#zoomLbl").textContent = Math.round(S.ui.zoom*100)+"%"; save(); buildPages(); break;
    case "bookmark": { const i = p.bookmarks.indexOf(R.current); if (i>=0) p.bookmarks.splice(i,1); else p.bookmarks.push(R.current); save(); drawBookmarks(); updateBm(); if (S.ui.tab==="details") renderPanel(); toast(i>=0?`Bookmark removed from p. ${R.current}`:`Bookmarked p. ${R.current}`); break; }
    case "status": p.status = v; if (v==="completed" && p.pages) p.maxPage = p.pages; save(); renderSide(); renderPanel(); updateBanner(); toast(`Marked as ${SLABEL[v]}`); break;
    case "hl": addHighlight(v, false); break;
    case "hl-note": addHighlight("yellow", true); break;
    case "hl-del": p.highlights = p.highlights.filter(h => h.id !== v); save(); renderPanel(); document.querySelectorAll("#pages .page").forEach(el => drawHighlights(+el.dataset.n)); break;
    case "hlf": S.ui.hlFilter = v; renderPanel(); break;
    case "cite": { S.ui.nmode = "edit"; renderPanel(); const ta = $("#noteTa"); ta.selectionStart = ta.selectionEnd = ta.value.length; const ins = ` (p. ${R.current})`; ta.setRangeText(ins, ta.selectionStart, ta.selectionEnd, "end"); ta.focus(); p.notes = ta.value; save(); break; }
    case "ins-hl": {
      const hs = p.highlights.slice().sort((x,y) => x.page-y.page); if (!hs.length) return toast("No highlights yet.");
      const block = "\n## Highlights\n" + hs.map(h => `> ${h.text} p. ${h.page}${h.comment?`\n- ${h.comment}`:""}`).join("\n\n") + "\n";
      p.notes = (p.notes||"").trimEnd() + "\n" + block; save(); S.ui.tab = "notes"; renderPanel(); toast(`${hs.length} highlights added to notes`); break; }
    case "copy-notes": try { await navigator.clipboard.writeText(`# ${p.title}\n${p.authors}\n\n${p.notes}`); toast("Notes copied as Markdown"); } catch(err){ S.ui.nmode = "edit"; renderPanel(); $("#noteTa").select(); toast("Press Ctrl+C to copy"); } break;
    case "log-session": { const note = ($("#sessNote")?.value||"").trim(); const rec = endSession(note); R.session = {start:Date.now(), active:0, from:R.current, max:R.current}; renderPanel(); toast(rec ? `Logged ${rec.minutes} min, pp. ${rec.from}–${rec.to}` : "Nothing to log yet. Read a little first."); break; }
    case "target-save": { const pg = +$("#tgPage").value || 1, dt = $("#tgDate").value; if (!dt) return toast("Pick a date for the target."); p.target = {page:pg, date:dt}; if (p.status==="inbox") p.status = "planned"; save(); renderPanel(); toast(`Target set: p. ${pg} on ${fmtDate(new Date(dt+"T00:00"))}`); break; }
    case "target-clear": p.target = null; save(); renderPanel(); break;
    case "tag-del": p.tags = p.tags.filter(x => x !== v); save(); renderSide(); renderPanel(); break;
    case "remove": $("#rmWrap").innerHTML = `<span style="font-size:12px">Remove paper, notes and history?</span> <button class="btn sm danger" data-act="remove-yes">Remove</button> <button class="btn sm ghost" data-act="tab" data-v="details">Cancel</button>`; break;
    case "remove-yes": { const id = R.id; R.session = null; closeReader(); S.papers = S.papers.filter(x => x.id !== id); idb.del(id); S.ui.view = "library"; save(); renderAll(); toast("Removed from library"); break; }
    case "clear-examples": closeReader(); S.papers = S.papers.filter(x => !x.sample); S.ui.view = S.papers.length ? "library" : "home"; S.ui.filter = "all"; save(); renderAll(); toast("Examples removed"); break;
  }
});

document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "q"){ S.ui.q = t.value; if (S.ui.view !== "library"){ closeReader(); S.ui.view = "library"; S.ui.filter = "all"; renderMain(); renderSide(); const q = $("#q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } else renderMain(); saveSoon(); return; }
  if (!R) return; const p = getP(R.id);
  if (t.id === "noteTa"){ p.notes = t.value; saveSoon(); }
  else if (t.dataset.cm){ const h = p.highlights.find(x => x.id === t.dataset.cm); if (h){ h.comment = t.value; saveSoon(); } }
  else if (t.dataset.meta){ p[t.dataset.meta] = t.value; saveSoon(); if (t.dataset.meta === "title") document.querySelector(".r-title").textContent = t.value; }
});
document.addEventListener("keydown", e => {
  const t = e.target;
  if (t.id === "pgIn" && e.key === "Enter"){ goPage(+t.value); t.blur(); return; }
  if (t.id === "tagIn" && e.key === "Enter" && R){ const v = t.value.trim().toLowerCase().replace(/\s+/g,"-"); const p = getP(R.id); if (v && !p.tags.includes(v)){ p.tags.push(v); save(); renderSide(); renderPanel(); $("#tagIn")?.focus(); } return; }
  if (!R || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
  if (e.key === "j" || e.key === "ArrowRight"){ goPage(R.current+1); e.preventDefault(); }
  if (e.key === "k" || e.key === "ArrowLeft"){ goPage(R.current-1); e.preventDefault(); }
  if (e.key === "b"){ document.querySelector('[data-act="bookmark"]')?.click(); }
  if (e.key === "Escape") hidePop();
});
document.addEventListener("mouseup", e => { if (!e.target.closest("#selpop")) onSelEnd(); });
document.addEventListener("touchend", e => { if (!e.target.closest("#selpop")) setTimeout(onSelEnd, 250); });
document.addEventListener("mousedown", e => { if (!e.target.closest("#selpop") && !e.target.closest(".page")) hidePop(); });
document.addEventListener("scroll", e => { if (e.target && e.target.id === "pages" && R){ hidePop(); if (!R._raf){ R._raf = requestAnimationFrame(() => { if (R){ R._raf = 0; onPagesScroll(); } }); } } }, true);
let rzT; window.addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { if (R && $("#pages .page")) buildPages(); }, 250); });

$("#fileIn").addEventListener("change", e => { importFiles(e.target.files); e.target.value = ""; });
$("#attachIn").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) attachFile(f); });
let dragN = 0;
window.addEventListener("dragenter", e => { if ([...(e.dataTransfer?.types||[])].includes("Files")){ dragN++; $("#drop").hidden = false; } });
window.addEventListener("dragleave", () => { dragN = Math.max(0, dragN-1); if (!dragN) $("#drop").hidden = true; });
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", e => { e.preventDefault(); dragN = 0; $("#drop").hidden = true; if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files); });

renderAll();
})();
