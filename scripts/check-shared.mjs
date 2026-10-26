import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';

const info=JSON.parse(await readFile(new URL('../artifacts/share.json',import.meta.url),'utf8'));
const launch=launchOptions();
const browser=await chromium.launch({headless:true,...launch});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.clock.install();
  const response=await page.goto(info.url,{waitUntil:'networkidle',timeout:45000});
  assert.equal(response.status(),200);
  assert.equal(await page.title(),'一定要到达那里');
  await page.locator('#play').waitFor();
  await page.screenshot({path:new URL('../artifacts/public-mobile.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
  await page.locator('#speed').tap();await page.locator('#speed').tap();
  await page.locator('#play').tap();
  await page.getByRole('button',{name:'操作：木桥开关',exact:true}).tap();
  await page.clock.runFor(4200);
  assert.equal(await page.locator('#status-text').textContent(),'终于到了');
  assert.deepEqual(errors,[]);
  console.log('PASS public HTTPS URL: '+info.url);
  console.log('PASS mobile browser: full game loads and touch controls win the first level.');
} finally { await browser.close(); }
