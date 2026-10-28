#!/usr/bin/env node
// 源码树上的 CLI shell：只负责把 process 与文件系统接给 src/app/cli.js。
// 真正的产品是独立制品 dist/gothere-cli.mjs（`pnpm build:cli`），它不依赖这个文件。
// 纪律：--json 时 stdout 只有协议对象，日志一律走 stderr；退出码见 src/app/cli.js。

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTextSource } from '../src/app/levelSource.js';
import { runCli } from '../src/app/cli.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PACKAGE = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));

// Agent 常把输出接给 head / jq：下游提前关闭管道不应让 CLI 崩掉。
process.stdout.on('error', (error) => { if (error.code === 'EPIPE') process.exit(0); });

process.exitCode = await runCli(process.argv.slice(2), {
  loadDocs: () => createTextSource({ readText: (path) => readFile(resolve(ROOT, path), 'utf8') }).all(),
  readText: (path) => readFile(path, 'utf8'),
  resolvePath: (path) => resolve(process.cwd(), path),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  version: PACKAGE.version,
});
