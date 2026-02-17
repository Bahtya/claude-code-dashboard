const path = require('path');
const { app, BrowserWindow } = require('electron');

let mainWindow = null;

// 启动 Express 服务器
function startServer() {
  try {
    require('../server');
    console.log('Express server started on port 3200');
  } catch (error) {
    console.log('Server note:', error.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'Claude Code Dashboard',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });

  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3200');
  }, 500);

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  console.log('Electron app is ready');
  startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  // Windows 上保持后台运行
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
