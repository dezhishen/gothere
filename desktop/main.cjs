// gothere 桌面端主进程：一个窗口，装的是构建好的单文件游戏。
// 安全默认值：不开 node 集成、开上下文隔离与沙箱；外链一律交给系统浏览器，不在应用内开新窗口。
'use strict';

const { app, BrowserWindow, Menu, dialog, session, shell } = require('electron');
const { join } = require('node:path');

const isMac = process.platform === 'darwin';
const HOME = 'https://github.com/dezhishen/gothere';

// 同一时间只允许一个实例；第二次启动就把已有窗口提到前面。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    title: '一定要到达那里',
    backgroundColor: '#f6f1e3',
    show: false,
    autoHideMenuBar: !isMac,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.loadFile(join(__dirname, 'index.html'));

  // 窗口内不允许开新窗口；导航到外部地址也是交给系统浏览器。
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file:')) return;
    event.preventDefault();
    openExternal(url);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    dialog.showErrorBox('游戏进程异常退出', '渲染进程退出了（' + details.reason + '）。重开一次试试。');
  });

  return window;
}

function buildMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '游戏',
      submenu: [
        { role: 'reload', label: '重新载入' },
        { role: 'forceReload', label: '强制重新载入' },
        { type: 'separator' },
        { role: isMac ? 'close' : 'quit', label: isMac ? '关闭窗口' : '退出' },
      ],
    },
    { label: '编辑', submenu: [{ role: 'copy', label: '复制' }, { role: 'selectAll', label: '全选' }] },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '项目主页', click: () => openExternal(HOME) },
        { label: '关于', click: () => dialog.showMessageBox({
          type: 'info',
          title: '关于',
          message: '一定要到达那里 ' + app.getVersion(),
          detail: '一个数据驱动的 2D 环境解谜原型。关卡都是 JSON，画面和逻辑都在这一个窗口里。',
        }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  // 这个游戏不需要摄像头、麦克风、通知之类的任何权限。
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
