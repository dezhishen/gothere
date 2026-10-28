import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
const server = makeServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = 'http://127.0.0.1:' + server.address().port;
test.after(()=>new Promise(resolve=>server.close(resolve)));
test('serves the actual app, modules, project document and correct MIME types', async () => {
  for(const [path,mime] of [['/','text/html'],['/src/main.js','text/javascript'],['/src/style.css','text/css'],['/favicon.svg','image/svg+xml'],['/project.md','text/plain'],['/levels/manifest.json','application/json'],['/levels/first-bridge.level.json','application/json']]) {
    const response=await fetch(base+path);
    assert.equal(response.status,200);assert.ok(response.headers.get('content-type').startsWith(mime));
    assert.ok((await response.text()).length>50);
  }
});
test('does not expose arbitrary workspace files or traversal paths', async () => {
  for(const path of ['/package.json','/server.mjs','/.git/config','/src/%2e%2e/package.json','/src/%2e%2e%5cpackage.json','/src/%00','/src/%ZZ','/src/does-not-exist.js']) {
    assert.equal((await fetch(base+path)).status,404,path);
  }
});
test('supports HEAD and rejects write requests', async () => {
  const response=await fetch(base+'/',{method:'HEAD'});assert.equal(response.status,200);assert.equal(await response.text(),'');
  assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
});

test('public preview serves only the self-contained game and its download', async () => {
  const { buildPortable } = await import('../scripts/build.mjs');
  await buildPortable();
  const preview = makeServer({ portableOnly: true });
  await new Promise(resolve=>preview.listen(0,'127.0.0.1',resolve));
  const publicBase='http://127.0.0.1:'+preview.address().port;
  try {
    const page=await fetch(publicBase+'/');
    assert.equal(page.status,200);assert.ok((await page.text()).includes('id="portable-data"'));
    assert.ok(page.headers.get('content-security-policy').includes("connect-src 'none'"));
    const download=await fetch(publicBase+'/play.html');
    assert.equal(download.status,200);assert.ok(download.headers.get('content-disposition').includes('attachment'));
    for(const path of ['/project.md','/src/main.js','/package.json','/artifacts/share.json']) {
      assert.equal((await fetch(publicBase+path)).status,404,path);
    }
  } finally { await new Promise(resolve=>preview.close(resolve)); }
});
