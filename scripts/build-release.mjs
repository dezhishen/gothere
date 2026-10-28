// 一个目标平台的全套制品：单二进制 + Agent 技能包 + 桌面客户端。
// 关键点：这三个都能在**任何**宿主平台上产出目标平台的产物（见 targets.mjs / rcodesign.mjs），
// 所以 CI 只需要一台 ubuntu runner 就能构建全部平台。

import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildBinary } from './build-binary.mjs';
import { buildDesktop } from './build-desktop.mjs';
import { buildAgentPackage } from './build-skill.mjs';
import { nativeTarget, targetFromArgv } from './targets.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export async function buildRelease({ target = nativeTarget(), quiet = false } = {}) {
  const binary = await buildBinary({ quiet, target });
  const agent = await buildAgentPackage({ quiet, binary: binary.path, target });
  const desktop = await buildDesktop({ quiet, target });
  return { binary, agent, desktop, target };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const result = await buildRelease({ quiet: argv.includes('--quiet'), target: targetFromArgv(argv) });
  if (!result.binary) throw new Error('构建没有返回产物。');
}
