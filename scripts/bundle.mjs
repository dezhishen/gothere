// 极简打包器：把一组本地 ES 模块包进互不干扰的 IIFE 作用域，得到单文件制品。
// 支持的语法很窄，够用就好：
//   import { a, b } from './x.ts';        （单行、具名）
//   export const|let|function NAME ...    （行首）
//   export { x } from './y.ts';           （同名 binding 必须已经 import 过）
// 不支持：默认导入、export *、多行 import、裸包名、node:*（制品外壳自己写那几行）。

import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const SOURCE_EXTENSIONS = ['.ts', '.js'];

/** 擦除类型：产物里只剩下运行时需要的 JS（不做降级，ES2023 原样保留）。 */
function stripTypes(source, filename) {
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: false,
      isolatedModules: true,
      removeComments: false,
    },
  });
  return outputText;
}

/** 打包一个入口模块，返回 IIFE 源码块与模块数量。 */
export async function bundleModules({ entry, root }) {
  const identifiers = new Map();
  const visiting = new Set();
  const chunks = [];

  const moduleFor = async (file) => {
    const filename = resolve(file);
    const local = relative(resolve(root, 'src'), filename);
    if (local.startsWith('..' + sep) || local === '..' || !SOURCE_EXTENSIONS.includes(filename.slice(filename.lastIndexOf('.')))) {
      throw new Error('Only local source modules may be packaged.');
    }
    if (visiting.has(filename)) throw new Error('Circular module dependency: ' + local);
    if (identifiers.has(filename)) return identifiers.get(filename);
    const identifier = '__module' + identifiers.size;
    identifiers.set(filename, identifier);
    visiting.add(filename);
    let source = stripTypes(await readFile(filename, 'utf8'), filename);
    const exported = new Set();
    for (const match of source.matchAll(/^export\s+(?:const|let|function|async function)\s+([A-Za-z_$][\w$]*)/gm)) exported.add(match[1]);
    const imported = new Set();
    for (const match of [...source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm)]) {
      const names = match[1].split(',').map((name) => name.trim());
      if (names.some((name) => !/^[A-Za-z_$][\w$]*$/.test(name)) || !match[2].startsWith('.')) {
        throw new Error('Unsupported import: ' + match[0]);
      }
      names.forEach((name) => imported.add(name));
      const dependency = await moduleFor(resolve(dirname(filename), match[2]));
      source = source.replace(match[0], 'const { ' + names.join(', ') + ' } = ' + dependency + ';\n');
    }
    source = source.replace(/^export\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"];?\s*$/gm, (_, list) => {
      for (const name of list.split(',').map((item) => item.trim())) {
        if (!imported.has(name)) throw new Error('Re-export must refer to an imported binding: ' + name);
        exported.add(name);
      }
      return '';
    });
    source = source.replace(/^export\s+(?=(?:const|let|function|async function)\b)/gm, '');
    if (/^(?:import|export)\s/m.test(source)) throw new Error('Unsupported module syntax in ' + local);
    chunks.push('const ' + identifier + ' = (() => {\n' + source +
      '\nreturn Object.freeze({ ' + [...exported].join(', ') + ' });\n})();');
    visiting.delete(filename);
    return identifier;
  };

  const entryIdentifier = await moduleFor(entry);
  return { chunks, modules: identifiers.size, entry: entryIdentifier };
}
