import { acceptsInput, stateLabel, typeDescriptor } from './core/contract/registry.js';
import { validateLevel } from './core/contract/validate.js';
import { createGame, describePlatform, parseBundle, replayLevel } from './core/interpreters/index.js';
import { createDocSource, createTextSource } from './app/levelSource.js';
import { resetFactories } from './core/interpreters/factories/index.js';
import { parseTypes } from './core/interpreters/factories/types.js';
import { createRenderer } from './scene.js';

const $ = (id) => document.getElementById(id);
const renderer = createRenderer($('scene'));
const completed = new Set();
const subtitles = ['THE BRIDGE SITUATION', 'A SMALL INCONVENIENCE', 'TIMING IS EVERYTHING'];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let levels = [];
let selected = 0, level = null, game = null;
let speed = 1, accumulator = 0, lastFrame = performance.now(), lastHud = '', lastEventKey = '';
let replay = null, replayIndex = 0, terminalAt = null, toastTimer;
const mechanismButtons = new Map();
const timeLabel = (tick) => {
  const total = Math.floor(tick / 60);
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
};
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
}
function renderTabs() {
  $('level-tabs').replaceChildren();
  levels.forEach((item, index) => {
    const button = document.createElement('button');
    button.className = 'level-tab';
    button.setAttribute('aria-selected', String(index === selected));
    button.setAttribute('aria-label', '关卡 ' + (index + 1) + '：' + item.name);
    // Only static scaffolding is HTML; authored or imported strings are always textContent.
    button.innerHTML = '<span class="tab-number"></span><span class="tab-copy"><span class="tab-title"></span><span class="tab-subtitle"></span></span>';
    button.querySelector('.tab-number').textContent = String(index + 1).padStart(2, '0');
    button.querySelector('.tab-title').textContent = item.name + (completed.has(item.id) ? ' ✓' : '');
    button.querySelector('.tab-subtitle').textContent = subtitles[index] ?? 'SOMETHING IN THE WAY';
    button.addEventListener('click', () => loadLevel(item, index)); $('level-tabs').append(button);
  });
}
function loadLevel(next, index = -1) {
  if (!next) return;
  level = structuredClone(next); game = createGame(level); selected = index;
  replay = null; replayIndex = 0; accumulator = 0; terminalAt = null; lastHud = ''; lastEventKey = '';
  $('scene-title').textContent = level.name;
  $('level-description').textContent = level.description;
  $('hint-text').textContent = level.hint ?? '观察前方的地形和机关。暂停时可以用单步检查变化。';
  $('hint-text').hidden = true; $('hint').setAttribute('aria-expanded', 'false');
  $('hint').textContent = '需要一点提示？ ↗';
  $('hotspots').replaceChildren(); $('mechanism-actions').replaceChildren(); mechanismButtons.clear();
  level.entities.filter((e) => acceptsInput(e)).forEach((entity, index) => {
    const hotspot = document.createElement('button');
    hotspot.className = 'hotspot'; hotspot.dataset.entity = entity.id;
    hotspot.setAttribute('aria-label', '操作：' + entity.label);
    hotspot.style.left = ((entity.x + (entity.width ?? 28) / 2) / 1200 * 100) + '%';
    const iconOffset = typeDescriptor(entity.kind)?.iconOffset ?? 91;
    hotspot.style.top = (((entity.y ?? 440) - iconOffset) / 640 * 100) + '%';
    const number = document.createElement('span'); number.textContent = String(index + 1); hotspot.append(number);
    const label = document.createElement('span'); label.className = 'hotspot-label'; label.textContent = entity.label; hotspot.append(label);
    const action = document.createElement('button'); action.className = 'mechanism-action'; action.dataset.action = entity.id;
    action.innerHTML = '<span></span><span></span>';
    action.children[0].textContent = String(index + 1).padStart(2, '0');
    for (const button of [hotspot, action]) button.addEventListener('click', () => {
      if (replay) return;
      if (game.click(entity.id)) { lastHud = ''; updateHud(game.snapshot()); }
    });
    mechanismButtons.set(entity.id, { hotspot, action });
    $('hotspots').append(hotspot); $('mechanism-actions').append(action);
  });
  renderTabs(); updateHud(game.snapshot());
}
function resetGame(start = false) {
  if (!game) return;
  replay = null; game.reset(); accumulator = 0; terminalAt = null; lastHud = ''; lastEventKey = '';
  if (start) game.start();
  updateHud(game.snapshot());
}
function togglePlay() {
  if (!game) return;
  const status = game.snapshot().status;
  if (['won', 'lost'].includes(status)) resetGame(true);
  else if (status === 'running') game.pause();
  else game.start();
  accumulator = 0; lastHud = ''; updateHud(game.snapshot());
}
function updateHud(state) {
  const key = [Math.floor(state.tick / 6), state.status, state.clicks, state.events.at(-1)?.tick, state.events.at(-1)?.message, Boolean(replay)].join('|');
  if (key === lastHud) return;
  lastHud = key;
  const terminal = ['won', 'lost'].includes(state.status);
  const running = state.status === 'running';
  const names = { ready: '准备出发', running: replay ? '回放中' : '赶路中', paused: '已暂停', won: '终于到了', lost: '暂时没到' };
  const labels = { ready: '出发！', running: '暂停一下', paused: '继续赶路', won: '再走一次', lost: '再试一次' };
  $('play-label').textContent = labels[state.status]; $('play').setAttribute('aria-label', labels[state.status]);
  $('play-icon').textContent = running ? 'Ⅱ' : '▶';
  $('status-text').textContent = names[state.status]; $('status-dot').className = 'status-dot ' + state.status;
  $('clock').textContent = timeLabel(state.tick);
  $('step').disabled = running || terminal || Boolean(replay);
  $('replay').disabled = state.tick === 0 || Boolean(replay);
  $('replay').textContent = replay ? '↶ 回放中…' : '↶ 回放本次';
  $('scene-tag-text').textContent = state.status === 'won' ? '就说能到吧' : state.status === 'lost' ? '再来一次' : selected === 2 ? '把握时机' : '前方有点情况';
  const percent = Math.max(0, Math.min(100, Math.round((state.actor.x - level.actor.x) / (level.goal.x - level.actor.x) * 100)));
  $('progress-fill').style.width = percent + '%'; $('progress-label').textContent = percent + '%';
  $('progress-track').setAttribute('aria-valuenow', String(percent));
  const notes = {
    ready: '认准那里了。准备好就出发！', running: replay ? '再看看刚才是怎么折腾过去的。' : '轻点编号机关，帮这个倔家伙开路。',
    paused: '歇一下，倔劲儿先存着。', won: '那里到了，下一个那里呢？', lost: '问题不大，至少方向没错。',
  };
  $('stage-note').textContent = '✦  ' + notes[state.status];
  for (const [id, buttons] of mechanismButtons) {
    const entity = state.entities[id];
    const enabled = running && !replay;
    buttons.hotspot.disabled = !enabled; buttons.action.disabled = !enabled;
    // 被拿起的物体会跟着角色走，热点位置必须每帧重算，否则会留在原地。
    buttons.hotspot.style.left = ((entity.x + entity.width / 2) / 1200 * 100) + '%';
    const type = typeDescriptor(entity.kind);
    buttons.hotspot.classList.toggle('active', type ? entity.state !== type.states[0].id : false);
    let label = entity.label + ' · ' + stateLabel(entity.state);
    const timer = state.timers.find((t) => t.actions.some((a) => a.type === 'set' && a.target === id));
    if (timer) label += ' · ' + Math.max(0, (timer.due - state.tick) / 60).toFixed(1) + 's';
    buttons.hotspot.title = label; buttons.action.children[1].textContent = label;
    buttons.action.setAttribute('aria-label', label);
  }
  const eventKey = state.events.map((e) => e.tick + e.message).join('|');
  if (eventKey !== lastEventKey || (!state.events.length && !$('event-log').querySelector('.empty-event'))) {
    lastEventKey = eventKey; $('event-log').replaceChildren();
    if (!state.events.length) {
      const li = document.createElement('li'); li.className = 'empty-event'; li.textContent = '机关就位，就差他迈出第一步。'; $('event-log').append(li);
    } else state.events.slice(-4).reverse().forEach((event) => {
      const li = document.createElement('li'), time = document.createElement('time'), text = document.createElement('span');
      time.textContent = timeLabel(event.tick); text.textContent = event.message; li.append(time, text); $('event-log').append(li);
    });
  }
  $('result-panel').hidden = !terminal;
  if (terminal) {
    if (terminalAt === null) terminalAt = performance.now();
    const won = state.status === 'won';
    $('result-symbol').textContent = won ? '⚑' : '✧';
    $('result-title').textContent = won ? '就说能到吧！' : '差一点点。大概。';
    $('result-description').textContent = won ? '多亏你搭把手，他的倔劲儿这次有了着落。' : state.events.at(-1)?.message;
    $('result-action').textContent = won && selected >= 0 && selected < levels.length - 1 ? '下一段旅程 →' : won ? '再去一趟 ↶' : '再试一次 ↶';
    if (won && selected >= 0 && !completed.has(level.id)) { completed.add(level.id); renderTabs(); }
  }
}
$('play').addEventListener('click', togglePlay);
$('reset').addEventListener('click', () => resetGame());
$('step').addEventListener('click', () => { if (!game) return; game.singleStep(); lastHud = ''; updateHud(game.snapshot()); });
$('speed').addEventListener('click', () => { speed = speed === 4 ? 1 : speed * 2; $('speed').textContent = speed + '×'; $('speed').setAttribute('aria-label', '当前 ' + speed + ' 倍速，点击切换'); });
$('hint').addEventListener('click', () => {
  const shown = $('hint-text').hidden; $('hint-text').hidden = !shown;
  $('hint').setAttribute('aria-expanded', String(shown)); $('hint').textContent = shown ? '收起提示 ↑' : '需要一点提示？ ↗';
});
$('result-action').addEventListener('click', () => {
  if (!game) return;
  if (game.snapshot().status === 'won' && selected >= 0 && selected < levels.length - 1) loadLevel(levels[selected + 1], selected + 1);
  else resetGame();
});
$('replay').addEventListener('click', () => {
  if (!game) return;
  const recording = game.recording();
  try { replayLevel(level, recording); } catch (error) { toast('无法回放：' + error.message); return; }
  replay = recording; replayIndex = 0; game = createGame(level); game.start(); terminalAt = null; accumulator = 0; lastHud = ''; lastEventKey = '';
  updateHud(game.snapshot());
});
function tickReplay() {
  const next = game.snapshot().tick + 1;
  while (replay.inputs[replayIndex]?.tick === next) game.click(replay.inputs[replayIndex++].source);
  game.step();
  if (game.snapshot().tick >= replay.untilTick) {
    if (game.snapshot().status === 'running') game.pause();
    replay = null; toast('回放结束。这一路折腾，原样重走了一遍。');
  }
}
function openData() {
  if (!game) return;
  if (game.snapshot().status === 'running') game.pause();
  $('level-json').value = JSON.stringify(level, null, 2); $('data-error').hidden = true;
  $('data-dialog').showModal(); lastHud = ''; updateHud(game.snapshot());
}
$('open-data').addEventListener('click', openData);
$('close-data').addEventListener('click', () => $('data-dialog').close());
function showDataError(message) { $('data-error').textContent = message; $('data-error').hidden = false; }
$('apply-level').addEventListener('click', () => {
  try {
    if ($('level-json').value.length > 131072) throw new Error('关卡文件不能超过 128 KiB。');
    const input = JSON.parse($('level-json').value);
    const result = validateLevel(input); if (!result.valid) throw new Error(result.messages.join('\n'));
    loadLevel(input); $('data-dialog').close(); toast('关卡已加载，可以开始新的旅程。');
  } catch (error) { showDataError(error instanceof SyntaxError ? 'JSON 格式有误，请检查引号、逗号和括号。\n' + error.message : error.message); }
});
$('import-level').addEventListener('click', () => $('level-file').click());
$('level-file').addEventListener('change', async (event) => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 131072) throw new Error('关卡文件不能超过 128 KiB。');
    $('level-json').value = await file.text(); $('data-error').hidden = true;
  } catch (error) { showDataError('无法导入：' + error.message); }
  event.target.value = '';
});
$('export-level').addEventListener('click', () => {
  try {
    const input = JSON.parse($('level-json').value);
    const result = validateLevel(input); if (!result.valid) throw new Error(result.messages.join('\n'));
    const url = URL.createObjectURL(new Blob([JSON.stringify(input, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = input.id + '.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { showDataError('无法导出：' + error.message); }
});
$('open-project').addEventListener('click', async () => {
  if (game && game.snapshot().status === 'running') game.pause();
  $('project-dialog').showModal(); lastHud = ''; updateHud(game.snapshot());
  try {
    const embedded = $('portable-data');
    if (embedded) $('project-content').textContent = JSON.parse(embedded.textContent).project;
    else { const response = await fetch('/project.md'); if (!response.ok) throw new Error('HTTP ' + response.status); $('project-content').textContent = await response.text(); }
  }
  catch (error) { $('project-content').textContent = '项目路线读取失败：' + error.message; }
});
$('close-project').addEventListener('click', () => $('project-dialog').close());
document.addEventListener('keydown', (event) => {
  if ($('data-dialog').open || $('project-dialog').open || ['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(event.target.tagName) || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
  if (event.key.toLowerCase() === 'r') resetGame();
  const index = Number(event.key) - 1;
  if (Number.isInteger(index) && index >= 0 && index < levels.length) loadLevel(levels[index], index);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && game.snapshot().status === 'running') { game.pause(); accumulator = 0; }
});
function frame(now) {
  if (!game) { requestAnimationFrame(frame); return; }
  const dt = Math.min(100, Math.max(0, now - lastFrame)); lastFrame = now;
  if (game.snapshot().status === 'running') {
    accumulator += dt * speed;
    const count = Math.min(24, Math.floor(accumulator / (1000 / 60)));
    accumulator -= count * (1000 / 60);
    if (replay) { for (let i = 0; i < count && replay; i++) tickReplay(); }
    else game.step(count);
  } else accumulator = 0;
  const state = game.snapshot(); updateHud(state);
  renderer.draw(level, state, { time: reducedMotion ? 0 : now / 1000, reducedMotion, fallAge: terminalAt === null ? 0 : (now - terminalAt) / 1000 });
  requestAnimationFrame(frame);
}
// 主线程把解析器支持的 schema 暴露出去：调试、自动化与浏览器内 Agent 都能发现平台能力。
window.gothere = Object.freeze({
  platform: () => describePlatform(),
  levels: () => levels.map((item) => ({ id: item.id, name: item.name })),
  validate: (doc) => validateLevel(doc),
});

// 类型源：与关卡一样，单文件产物读内联 JSON 块，开发态走 HTTP 读 types/*.type.json。
// 类型是纯数据，所以这里只是“读 JSON + 装上”，没有任何生成物或代码分支。
async function loadTypes() {
  const embedded = $('types-data');
  const files = [];
  if (embedded) {
    for (const file of JSON.parse(embedded.textContent).files) files.push(file);
  } else {
    const manifestResponse = await fetch('/types/manifest.json', { cache: 'no-store' });
    if (!manifestResponse.ok) throw new Error('HTTP ' + manifestResponse.status + ' /types/manifest.json');
    const manifest = await manifestResponse.json();
    for (const name of manifest.files) {
      const response = await fetch('/types/' + name, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status + ' /types/' + name);
      files.push({ name, data: await response.json() });
    }
  }
  const parsed = parseTypes(files);
  if (!parsed.ok) throw new Error('类型数据校验失败：' + parsed.errors.map((error) => error.path + '：' + error.message).join('；'));
  return parsed.types;
}

// 内容源：单文件产物读内联 JSON 块（零外部请求），开发态走 HTTP 读 levels/*.level.json。
async function loadContent() {
  const embedded = $('levels-data');
  if (embedded) {
    const bundle = parseBundle(embedded.textContent);
    if (!bundle.ok) throw new Error(bundle.errors[0].message);
    return createDocSource(bundle.levels).all();
  }
  const source = createTextSource({
    readText: async (path) => {
      const response = await fetch('/' + path, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    },
  });
  return source.all();
}

async function boot() {
  // 关卡校验与模拟都依赖类型，所以必须先装类型。
  resetFactories(await loadTypes());
  levels = await loadContent();
  loadLevel(levels[0], 0);
  requestAnimationFrame(frame);
}

boot().catch((error) => {
  console.error('关卡读取失败：', error);
  toast('关卡读取失败：' + error.message);
});
