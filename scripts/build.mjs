import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { bundleModules } from './bundle.mjs';
import { buildCss } from './css.mjs';
import { readLevelsContent } from './content.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export async function buildPortable() {
  await buildCss({ quiet: true });
  const { chunks, modules } = await bundleModules({ entry: resolve(ROOT, 'src/main.js'), root: ROOT });
  const [template, css, icon, levelData] = await Promise.all([
    readFile(resolve(ROOT,'index.html'),'utf8'), readFile(resolve(ROOT,'src/style.css'),'utf8'),
    readFile(resolve(ROOT,'favicon.svg'),'utf8'), readLevelsContent(),
  ]);
  const project = '# 一定要到达那里\n\n## 项目愿景\n一个认准目的地就一定要过去的小旅行者，一路鸡飞狗跳的轻松解谜。\n\n## 怎么玩\n点击「出发！」，然后点击场景中的编号机关，或下方的同名按钮。木桥、风扇都有自己的脾气：看准位置和时机再操作。\n\n## 操作\n可以暂停、重来、单步或回放。关卡数据面板支持 JSON 导入导出。所有试玩数据都在当前浏览器中处理，无需登录。\n\n## 保存试玩\n这个版本的画面、规则和 ' + levelData.levels.length + ' 张地图都包含在同一个 HTML 文件中，可以保存或转交测试。';
  const safeData = JSON.stringify({ project }).replace(/</g, '\\u003c');
  const levelsData = JSON.stringify(levelData).replace(/</g, '\\u003c');
  const script = chunks.join('\n\n').replace(/<\/script/gi, '<\\/script');
  const html = template
    .replace('<link rel="stylesheet" href="/src/style.css">', '<style>\n' + css.replace(/^@charset[^;]+;\s*/, '') + '\n</style>')
    .replace('href="/favicon.svg"', 'href="data:image/svg+xml,' + encodeURIComponent(icon) + '"')
    .replace('id="open-project">项目路线', 'id="open-project">试玩说明')
    .replace('id="project-title">项目路线', 'id="project-title">试玩说明')
    .replace('<script type="module" src="/src/main.js"></script>',
      '<script id="portable-data" type="application/json">' + safeData + '</script>\n' +
      '<script id="levels-data" type="application/json">' + levelsData + '</script>\n' +
      '<script type="module">\n' + script + '\n</script>');
  if (html === template || /<script[^>]+src=/i.test(html) || /<link[^>]+rel="stylesheet"/i.test(html)) throw new Error('Portable packaging left external app assets.');
  const embedded = html.match(/<script id="levels-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!embedded || JSON.parse(embedded[1]).levels.length === 0) throw new Error('Portable packaging must inline the levels JSON block.');
  const out = resolve(ROOT,'dist'); await mkdir(out,{recursive:true});
  const save = async (name) => {
    const target = resolve(out,name), temporary = target + '.tmp-' + process.pid + '-' + randomUUID();
    try { if (await readFile(target,'utf8') === html) return; }
    catch (error) { if(error.code !== 'ENOENT') throw error; }
    await writeFile(temporary,html);
    for(let attempt=0;;attempt++) {
      try { await rename(temporary,target); return; }
      catch(error) {
        if(!['EPERM','EBUSY','EACCES'].includes(error.code) || attempt>=5) throw error;
        await delay(30 * 2 ** attempt);
      }
    }
  };
  await Promise.all([save('index.html'),save('gothere-play.html')]);
  return { path:resolve(out,'gothere-play.html'), bytes:Buffer.byteLength(html), modules };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const built = await buildPortable();
  console.log('Portable game: ' + built.path + ' (' + Math.round(built.bytes/1024) + ' KiB, ' + built.modules + ' modules)');
}
