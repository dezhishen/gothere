import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const installedEdge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

/**
 * 选择可用的 Chromium 内核：
 * 1. Playwright 已下载的 Chromium（`pnpm exec playwright install chromium`）；
 * 2. Windows 上标准位置的 Edge；
 * 3. 都没有时给出可执行的修复命令。
 * 显式传入 executablePath，避免 Playwright 在只装了完整 Chromium、
 * 却缺少 chrome-headless-shell 时去找不存在的 headless shell。
 */
export function launchOptions() {
  const executablePath = chromium.executablePath();
  if (existsSync(executablePath)) return { executablePath };
  if (existsSync(installedEdge)) return { channel: 'msedge' };
  throw new Error('No Chromium build found. Run: pnpm exec playwright install chromium');
}
