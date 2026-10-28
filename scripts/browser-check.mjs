import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { makeServer } from '../server.mjs';
import { buildPortable } from './build.mjs';
import { launchOptions } from './browser.mjs';

const baseLevel = JSON.parse(await readFile(new URL('../levels/first-bridge.level.json', import.meta.url), 'utf8'));

await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const artifact = (name) => new URL('../artifacts/' + name, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const server = makeServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
await buildPortable();
let browser;
const errors = [];
const check = (condition, message) => assert.ok(condition, message);
const settle = async(page, ms) => { await page.clock.runFor(ms); };
const status = (page) => page.locator('#status-text').textContent();
async function open(context, url = base) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.clock.install({ time: new Date('2026-10-26T12:00:00Z') });
  await page.goto(url, { waitUntil:'networkidle' });
  await page.locator('.hotspot').first().waitFor();
  await settle(page, 100);
  return page;
}
try {
  const launch = launchOptions();
  browser = await chromium.launch({ headless: true, ...launch });
  const desktop = await browser.newContext({ viewport:{width:1440,height:1200}, reducedMotion:'reduce' });
  const page = await open(desktop);
  check(await page.title() === '一定要到达那里', 'new game name is used');
  check(!/梦游|梦醒|晚安/.test(await page.locator('body').innerText()), 'sleepwalking setting is removed');
  await page.screenshot({ path:artifact('desktop.png'),fullPage:true });
  check(await status(page) === '准备出发', 'initial scene is ready');
  check(await page.locator('.level-tab').count() === 6, 'six levels available');
  await page.locator('#speed').click(); await page.locator('#speed').click();
  await page.getByRole('button',{name:'出发！',exact:true}).click();
  await page.getByRole('button',{name:'操作：木桥开关',exact:true}).click();
  await settle(page, 4200);
  check(await status(page) === '终于到了', 'first level is playable');
  await page.screenshot({ path:artifact('desktop-win.png'),fullPage:true });
  await page.locator('#replay').click(); await settle(page, 4200);
  check(await status(page) === '终于到了', 'visual replay reaches same ending');
  await page.locator('#reset').click();
  check(await status(page) === '准备出发', 'reset returns to ready');
  check(await page.locator('#clock').textContent() === '00:00', 'reset restores timer');
  await page.locator('#play').click(); await settle(page, 1900);
  check(await status(page) === '暂时没到', 'failure is visible without bridge');
  console.log('PASS desktop: start, bridge, win, replay, reset and failure');

  await page.getByRole('button',{name:'关卡 2：借过一下',exact:true}).click();
  await page.locator('#play').click(); await settle(page, 1250);
  await page.getByRole('button',{name:'操作：旧风扇',exact:true}).click();
  await settle(page, 3000);
  check(await status(page) === '终于到了', 'timed hazard and pressure plate work');
  await page.getByRole('button',{name:'关卡 3：赶个巧',exact:true}).click();
  await page.locator('#play').click(); await settle(page, 750);
  await page.getByRole('button',{name:'操作：限时桥开关',exact:true}).click();
  await settle(page, 1333);
  await page.getByRole('button',{name:'操作：旧风扇',exact:true}).click();
  await settle(page, 2100);
  check(await status(page) === '终于到了', 'combined timed level can be completed');
  console.log('PASS desktop: second and third level solutions');

  // 前面的第一关把倍速调到了 4×（1→2→4），这里点一次回到 1×，按真实时间验证可携带物品。
  await page.locator('#speed').click();
  await page.getByRole('button',{name:'关卡 4：斧头与锤子',exact:true}).click();
  await page.locator('#play').click();
  await settle(page, 4200);
  check(await page.locator('.hotspot').count() === 2, 'capability-driven hotspots appear for the axe and the hammer');
  await page.getByRole('button',{name:'操作：生锈的斧头',exact:true}).click();
  await settle(page, 4800);
  await page.getByRole('button',{name:'操作：木柄锤子',exact:true}).click();
  await settle(page, 8500);
  check(await status(page) === '终于到了', 'portable items open the way');
  console.log('PASS desktop: portable items (axe / hammer)');

  await page.getByRole('button',{name:'关卡 5：上下两趟',exact:true}).click();
  await page.locator('#play').click();
  await settle(page, 3300);
  await page.getByRole('button',{name:'操作：电梯开关',exact:true}).click();
  await settle(page, 14000);
  check(await status(page) === '终于到了', 'the lift and the stairs carry the traveller');
  console.log('PASS desktop: multi-floor map (stairs / lift)');

  // 时间轴按 60 tick/秒换算：150 tick≈2500ms、200≈3333ms、520≈8667ms、800≈13333ms。
  await page.getByRole('button',{name:'关卡 6：全都来一遍',exact:true}).click();
  await page.locator('#play').click();
  await settle(page, 2500);
  await page.getByRole('button',{name:'操作：旧斧头',exact:true}).click();
  await settle(page, 850);
  await page.getByRole('button',{name:'操作：巡逻机关',exact:true}).click();
  await settle(page, 5330);
  await page.getByRole('button',{name:'操作：桥开关',exact:true}).click();
  await settle(page, 4670);
  await page.getByRole('button',{name:'操作：电梯按钮',exact:true}).click();
  await settle(page, 4700);
  check(await status(page) === '终于到了', 'every mechanic in one run');
  console.log('PASS desktop: combined level (items + guard + bridge + lift + stairs)');

  await page.locator('#reset').click(); await page.locator('#play').click(); await settle(page, 250);
  await page.locator('#play').click();
  const pausedTime = await page.locator('#clock').textContent();
  await settle(page, 1500);
  check(await page.locator('#clock').textContent() === pausedTime, 'pause freezes time');
  await page.locator('#step').click(); check(await status(page) === '已暂停', 'single step preserves paused state');
  await page.locator('#hint').click(); check(await page.locator('#hint-text').isVisible(), 'hint expands');
  await page.locator('#open-data').click();
  await page.locator('#level-json').fill('{');
  await page.locator('#apply-level').click();
  check(await page.locator('#data-error').isVisible(), 'malformed JSON displays an error');
  check(await page.locator('#data-dialog').evaluate(e=>e.open), 'invalid data does not close editor');
  const invalid=structuredClone(baseLevel);invalid.rules[0].actions[0].target='missing';
  await page.locator('#level-json').fill(JSON.stringify(invalid));
  await page.locator('#apply-level').click();
  check((await page.locator('#data-error').textContent()).includes('无效'), 'invalid references are rejected');
  const custom=structuredClone(baseLevel);custom.id='my-first-map';custom.name='我的第一张地图';
  await page.locator('#level-file').setInputFiles({name:'my-map.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(custom))});
  const downloadPromise=page.waitForEvent('download'); await page.locator('#export-level').click();
  const download=await downloadPromise;await download.saveAs(artifact('exported-level.json'));
  const exported=JSON.parse(await readFile(artifact('exported-level.json'),'utf8'));
  assert.deepEqual(exported,custom);
  await page.locator('#apply-level').click();
  check(await page.locator('#scene-title').textContent() === custom.name, 'custom level loads from JSON');
  check(await status(page) === '准备出发', 'custom level starts fresh');
  await page.locator('#open-project').click();await page.locator('#project-content').filter({hasText:'项目愿景'}).waitFor();
  await page.locator('#close-project').click();
  console.log('PASS authoring: pause, single-step, hints, JSON validation, file import/export, custom map, project document');

  // 编辑器：调色板与面板必须来自已注册工厂的回调，而不是页面里的硬编码。
  await page.locator('#open-editor').click();
  await page.locator('#editor-palette .palette-item').first().waitFor();
  const paletteLabels = await page.locator('#editor-palette .palette-item').allTextContents();
  check(paletteLabels.includes('门') && paletteLabels.includes('钥匙'), 'palette labels come from the factories');
  const editorDoc = () => page.evaluate(() => window.gothere.editor().doc);
  check(await page.evaluate(() => window.gothere.editor().editing), 'editor mode is on');
  check((await editorDoc()).entities.length === 0, 'editor starts from a blank draft');

  await page.locator('#editor-palette .palette-item', { hasText: '门' }).click();
  await page.locator('#editor-palette .palette-item', { hasText: '开关' }).click();
  let draft = await editorDoc();
  check(draft.entities.length === 2, 'placing from the palette adds entities');
  check(draft.entities[0].kind === 'gate' && draft.entities[1].kind === 'switch', 'palette places the chosen kind');
  const beforeDrag = draft.entities[0].x;
  const gateBox = page.locator('#edit-layer [data-entity="' + draft.entities[0].id + '"]');
  const boxDescription = await gateBox.boundingBox();
  await page.mouse.move(boxDescription.x + boxDescription.width / 2, boxDescription.y + boxDescription.height / 2);
  await page.mouse.down();
  await page.mouse.move(boxDescription.x + boxDescription.width / 2 - 60, boxDescription.y + boxDescription.height / 2, { steps: 6 });
  await page.mouse.up();
  check((await editorDoc()).entities[0].x < beforeDrag, 'dragging on the canvas moves the entity');
  await page.locator('#editor-undo').click();
  check((await editorDoc()).entities[0].x === beforeDrag, 'undo restores the dragged position');
  await page.locator('#editor-redo').click();

  await page.locator('#editor-inspector').getByRole('button', { name: '+ 加一条连线' }).click();
  draft = await editorDoc();
  check(draft.rules.length === 1, 'a rule can be wired from the inspector');
  check(draft.rules[0].on.source === 'switch-1', 'the rule source is an entity that accepts input');
  check(await page.locator('#editor-status').textContent() !== '', 'editor reports its state');
  await page.screenshot({ path: artifact('editor.png'), fullPage: true });

  await page.locator('#editor-play').click();
  await page.locator('#game-controls').waitFor();
  check(!(await page.evaluate(() => window.gothere.editor().editing)), 'playing the draft leaves edit mode');
  await page.locator('#speed').click(); await page.locator('#speed').click();
  await page.getByRole('button', { name: '操作：开关 2', exact: true }).click();
  await settle(page, 5000);
  check(await status(page) === '终于到了', 'a draft built only in the editor can be won');
  await page.locator('#open-editor').click();
  check((await editorDoc()).entities.length === 2, 'returning to the editor keeps the draft');
  await page.locator('#editor-save').click();
  check(await page.evaluate(() => Boolean(localStorage.getItem('gothere.draft.v1'))), 'draft is stored in the browser');
  await page.locator('#editor-exit').click();
  console.log('PASS editor: factory-driven palette, drag, undo/redo, rule wiring, draft play, draft persistence');

  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const phone=await open(mobile);
  check(await phone.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile has no horizontal overflow');
  await phone.screenshot({path:artifact('mobile.png'),fullPage:true});
  await phone.locator('#speed').tap();await phone.locator('#speed').tap();
  await phone.locator('#play').tap();
  await phone.getByRole('button',{name:'操作：木桥开关',exact:true}).tap();
  await settle(phone,4200);
  check(await status(phone)==='终于到了','touch controls complete first level');
  await phone.locator('#open-data').tap();
  check(await phone.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile dialog fits viewport');
  await phone.locator('#close-data').tap();
  await phone.screenshot({path:artifact('mobile-win.png'),fullPage:true});
  await mobile.close();
  const portable = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',offline:true});
  const file = await open(portable,pathToFileURL(artifact('../dist/gothere-play.html')).href);
  await file.locator('#speed').tap();await file.locator('#speed').tap();
  await file.locator('#play').tap();await file.getByRole('button',{name:'操作：木桥开关',exact:true}).tap();
  await settle(file,4200);
  check(await status(file)==='终于到了','single HTML works offline without a server');
  await file.locator('#open-project').tap();
  await file.locator('#project-content').filter({hasText:'项目愿景'}).waitFor();
  await file.locator('#close-project').tap();
  await file.screenshot({path:artifact('portable-mobile.png'),fullPage:true});
  await portable.close();
  const publicPreview=makeServer({portableOnly:true});
  await new Promise(resolve=>publicPreview.listen(0,'127.0.0.1',resolve));
  try {
    const publicPage=await open(desktop,'http://127.0.0.1:'+publicPreview.address().port);
    await publicPage.locator('#speed').click();await publicPage.locator('#speed').click();
    await publicPage.locator('#play').click();await publicPage.getByRole('button',{name:'操作：木桥开关',exact:true}).click();
    await settle(publicPage,4200);
    check(await status(publicPage)==='终于到了','read-only public preview works with its CSP');
    await publicPage.close();
  } finally { await new Promise(resolve=>publicPreview.close(resolve)); }
  check(errors.length===0,'browser has no uncaught errors: '+errors.join('; '));
  console.log('PASS mobile: touch gameplay, responsive page and data dialog');
  console.log('PASS distribution: offline single-file game and restricted public preview');
  console.log('PASS no browser console errors. Screenshots saved in artifacts/.');
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
