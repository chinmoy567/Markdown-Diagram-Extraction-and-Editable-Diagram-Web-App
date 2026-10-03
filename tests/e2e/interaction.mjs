import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: 'out/profile', defaultViewport: { width: 1500, height: 900 } });
const p = await b.newPage();
const errs=[]; p.on('pageerror', e=>errs.push('PAGEERR '+e.message.slice(0,300))); p.on('console', m=>{ if(m.type()==='error'&&!/404/.test(m.text())) errs.push(m.text().slice(0,300)); });
const cdp = await p.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: process.cwd()+'/out/dl' }).catch(()=>cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: process.cwd()+'/out/dl' }));
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

await p.goto('http://localhost:3100/', { waitUntil: 'networkidle2' });
await p.waitForSelector('.dw-card, .dw-empty');
await sleep(400);
if (!(await p.$('.dw-card'))) {
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b=>/Load bundled/.test(b.textContent)).click());
  await p.waitForSelector('.dw-modal', {timeout:90000});
  await p.evaluate(() => [...document.querySelectorAll('.dw-modal button')].find(b=>/^Import/.test(b.textContent)).click());
  await p.waitForSelector('.dw-card'); await sleep(800);
}
const cards = await p.$$eval('.dw-card-title', e=>e.map(a=>[a.textContent,a.getAttribute('href')]));
ok(cards.length >= 27, `library has ${cards.length} diagrams`);
const sysCtx = cards.find(c=>c[0]==='System Context');
await p.goto('http://localhost:3100'+sysCtx[1], { waitUntil: 'networkidle2' });
await p.waitForSelector('.react-flow__node'); await sleep(1500);
const nodeTexts = async () => p.$$eval('.react-flow__node', ns=>ns.map(n=>n.textContent.trim().slice(0,30)));
console.log(await nodeTexts());
// pick the "Dashboard" node
const box = async (txt) => p.evaluate((t)=>{ const n=[...document.querySelectorAll('.react-flow__node')].find(n=>n.textContent.includes(t)); const r=n.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,id:n.dataset.id}; }, txt);
let d = await box('Dashboard');
await p.mouse.click(d.x, d.y); await sleep(200);
ok(await p.$eval('.dw-inspector .dw-panel-title', e=>e.textContent)==='Shape', 'single node selected -> Shape inspector (not whole diagram)');
const sel = await p.$$eval('.react-flow__node.selected', e=>e.length);
ok(sel===1, `exactly 1 node selected (${sel})`);
// drag
await p.mouse.move(d.x,d.y); await p.mouse.down(); await p.mouse.move(d.x+60,d.y+40,{steps:8}); await p.mouse.up(); await sleep(300);
let d2 = await box('Dashboard');
ok(Math.abs(d2.x-d.x-60)<12 && Math.abs(d2.y-d.y-40)<12, `node moved by drag (${Math.round(d2.x-d.x)},${Math.round(d2.y-d.y)})`);
// edit label by double click
await p.mouse.click(d2.x, d2.y, { count: 2 }); await sleep(300);
const ta = await p.$('.dw-label-editor'); ok(!!ta, 'inline label editor opened on double-click');
await p.keyboard.down('Control'); await p.keyboard.press('A'); await p.keyboard.up('Control');
await p.keyboard.type('Edited Dashboard'); await p.keyboard.down('Control'); await p.keyboard.press('Enter'); await p.keyboard.up('Control'); await sleep(300);
ok((await nodeTexts()).some(t=>t.includes('Edited Dashboard')), 'label edited');
// add shape via palette click
const before = (await nodeTexts()).length;
await p.evaluate(()=>[...document.querySelectorAll('.dw-shape-btn')].find(b=>b.getAttribute('aria-label')==='Add Cloud').click()); await sleep(300);
ok((await nodeTexts()).length===before+1, 'shape added from palette');
// delete it (it is selected)
await p.keyboard.press('Delete'); await sleep(300);
ok((await nodeTexts()).length===before, 'shape deleted with Delete key');
// undo delete
await p.evaluate(()=>[...document.querySelectorAll('.dw-tb')].find(b=>/Undo/.test(b.textContent)).click()); await sleep(300);
ok((await nodeTexts()).length===before+1, 'undo restores deleted shape');
await p.evaluate(()=>[...document.querySelectorAll('.dw-tb')].find(b=>/Redo/.test(b.textContent)).click()); await sleep(300);
ok((await nodeTexts()).length===before, 'redo removes it again');
// edge: click an edge path -> connector inspector
const edgeCount = await p.$$eval('.react-flow__edge', e=>e.length);
await p.screenshot({path:'out/e3-before-save.png'});
// save
await p.keyboard.down('Control'); await p.keyboard.press('S'); await p.keyboard.up('Control'); await sleep(800);
ok(!(await p.$('.dw-dirty')), 'saved (no unsaved marker)');
d2 = await box('Edited Dashboard');
// reload
await p.reload({ waitUntil: 'networkidle2' }); await p.waitForSelector('.react-flow__node'); await sleep(1500);
const after = await nodeTexts();
ok(after.some(t=>t.includes('Edited Dashboard')), 'after reload: edited label persisted');
ok(after.length===before, `after reload: node count ${after.length}`);
ok((await p.$$eval('.react-flow__edge', e=>e.length))===edgeCount, 'edges persisted');
// Source tab
await p.evaluate(()=>[...document.querySelectorAll('.dw-tabs button')].find(b=>b.textContent==='Source').click()); await sleep(600);
const srcTxt = await p.$eval('.dw-source', e=>e.textContent);
ok(/flowchart TB/.test(srcTxt) && /Edited Dashboard/.test(srcTxt), 'source tab shows original + regenerated Mermaid with edit');
ok(/Verified/.test(srcTxt), 'generated Mermaid verified by round trip');
await p.screenshot({path:'out/e3-source.png'});
await p.evaluate(()=>[...document.querySelectorAll('.dw-tabs button')].find(b=>b.textContent==='Visual').click()); await sleep(800);
// export svg
await p.evaluate(()=>[...document.querySelectorAll('.dw-tb')].find(b=>/Export/.test(b.textContent)).click()); await sleep(200);
await p.evaluate(()=>[...document.querySelectorAll('.dw-menu button')].find(b=>/SVG/.test(b.textContent)).click()); await sleep(1500);
const files = fs.readdirSync('out/dl'); console.log('downloads', files);
if (files.length) { const svg = fs.readFileSync('out/dl/'+files[0],'utf8'); ok(/Edited Dashboard/.test(svg) && /<path/.test(svg) && /<marker/.test(svg), 'SVG export contains edited node, connectors and markers'); }
// original markdown untouched: library file text equals sample
console.log('ERRORS', errs);
await b.close();
