import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { buildCss } from './css.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Package this app's named ES modules into isolated scopes; reject unsupported module syntax. */
export async function buildPortable() {
  await buildCss({ quiet: true });
  const identifiers = new Map(), visiting = new Set(), chunks = [];
  async function moduleFor(file) {
    const filename = resolve(file);
    const local = relative(resolve(ROOT, 'src'), filename);
    if (local.startsWith('..' + sep) || local === '..' || !filename.endsWith('.js')) throw new Error('Only local source modules may be packaged.');
    if (visiting.has(filename)) throw new Error('Circular module dependency: ' + local);
    if (identifiers.has(filename)) return identifiers.get(filename);
    const identifier = '__module' + identifiers.size;
    identifiers.set(filename, identifier); visiting.add(filename);
    let source = await readFile(filename, 'utf8');
    const exported = new Set();
    for (const match of source.matchAll(/^export\s+(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)) exported.add(match[1]);
    const imported = new Set();
    for (const match of [...source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm)]) {
      const names = match[1].split(',').map(name => name.trim());
      if (names.some(name => !/^[A-Za-z_$][\w$]*$/.test(name)) || !match[2].startsWith('.')) throw new Error('Unsupported import: ' + match[0]);
      names.forEach(name => imported.add(name));
      const dependency = await moduleFor(resolve(dirname(filename), match[2]));
      source = source.replace(match[0], 'const { ' + names.join(', ') + ' } = ' + dependency + ';\n');
    }
    source = source.replace(/^export\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"];?\s*$/gm, (_, list) => {
      for (const name of list.split(',').map(item=>item.trim())) {
        if (!imported.has(name)) throw new Error('Re-export must refer to an imported binding: ' + name);
        exported.add(name);
      }
      return '';
    });
    source = source.replace(/^export\s+(?=(?:const|let|function)\b)/gm, '');
    if (/^(?:import|export)\s/m.test(source)) throw new Error('Unsupported module syntax in ' + local);
    chunks.push('const ' + identifier + ' = (() => {\n' + source +
      '\nreturn Object.freeze({ ' + [...exported].join(', ') + ' });\n})();');
    visiting.delete(filename);
    return identifier;
  }
  await moduleFor(resolve(ROOT, 'src/main.js'));
  const [template, css, icon] = await Promise.all([
    readFile(resolve(ROOT,'index.html'),'utf8'), readFile(resolve(ROOT,'src/style.css'),'utf8'),
    readFile(resolve(ROOT,'favicon.svg'),'utf8'),
  ]);
  const project = '# 一定要到达那里\n\n## 项目愿景\n一个认准目的地就一定要过去的小旅行者，一路鸡飞狗跳的轻松解谜。\n\n## 怎么玩\n点击「出发！」，然后点击场景中的编号机关，或下方的同名按钮。木桥、风扇都有自己的脾气：看准位置和时机再操作。\n\n## 操作\n可以暂停、重来、单步或回放。关卡数据面板支持 JSON 导入导出。所有试玩数据都在当前浏览器中处理，无需登录。\n\n## 保存试玩\n这个版本的画面、规则和三张地图都包含在同一个 HTML 文件中，可以保存或转交测试。';
  const safeData = JSON.stringify({ project }).replace(/</g, '\\u003c');
  const script = chunks.join('\n\n').replace(/<\/script/gi, '<\\/script');
  const html = template
    .replace('<link rel="stylesheet" href="/src/style.css">', '<style>\n' + css.replace(/^@charset[^;]+;\s*/, '') + '\n</style>')
    .replace('href="/favicon.svg"', 'href="data:image/svg+xml,' + encodeURIComponent(icon) + '"')
    .replace('id="open-project">项目路线', 'id="open-project">试玩说明')
    .replace('id="project-title">项目路线', 'id="project-title">试玩说明')
    .replace('<script type="module" src="/src/main.js"></script>',
      '<script id="portable-data" type="application/json">' + safeData + '</script>\n<script type="module">\n' + script + '\n</script>');
  if (html === template || /<script[^>]+src=/i.test(html) || /<link[^>]+rel="stylesheet"/i.test(html)) throw new Error('Portable packaging left external app assets.');
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
  return { path:resolve(out,'gothere-play.html'), bytes:Buffer.byteLength(html), modules:identifiers.size };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const built = await buildPortable();
  console.log('Portable game: ' + built.path + ' (' + Math.round(built.bytes/1024) + ' KiB, ' + built.modules + ' modules)');
}
