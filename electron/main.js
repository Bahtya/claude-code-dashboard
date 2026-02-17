const path = require('path');

// For Electron 15+, we need to use proper module syntax
const electron = require('electron');
const { app, BrowserWindow, Tray, Menu, nativeImage } = electron;

let mainWindow = null;
let tray = null;

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// 启动 Express 服务器
function startServer() {
  try {
    require('../server');
    console.log('Express server started on port 3200');
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'Claude Code Dashboard',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });

  // 等待服务器启动后加载页面
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3200');
  }, 500);

  // 开发模式下打开 DevTools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 点击关闭时最小化到托盘
  mainWindow.on('close', (e) => {
    if (!app.isQuitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // 创建托盘图标
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAABlBMVEUAAAD///+l2Z/dAAAAAXRSTlMAQObYZgAAACNJREFUeAFjYKAQMFKon2GgDGD8//8/w38GMQMRw48Y9j48Y9gwkEGMgRjBpYGJgMlH9AwAyUf0ADLF6RQAAAABJRU5ErkJggg==');
    }
  } catch (e) {
    trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAABlBMVEUAAAD///+l2Z/dAAAAAXRSTlMAQObYZgAAACNJREFUeAFjYKAQMFKon2GgDGD8//8/w38GMQMRw48Y9j48Y9gwkEGMgRjBpYGJgMlH9AwAyUf0ADLF6RQAAAABJRU5ErkJggg==');
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: '刷新页面',
      click: () => {
        if (mainWindow) {
          mainWindow.reload();
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Claude Code Dashboard - 实时监控你的 Claude Code 会话');
  tray.setContextMenu(contextMenu);

  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });
}

app.whenReady().then(() => {
  startServer();
  createWindow();
  createTray();
  console.log('Electron app is ready');
});

app.on('window-all-closed', () => {
  // Windows 上保持后台运行
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
