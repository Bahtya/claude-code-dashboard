const { contextBridge } = require('electron');

// 暴露受保护的 API 到 renderer 进程
contextBridge.exposeInMainWorld('electronAPI', {
  getPlatform: () => process.platform,
  getVersion: () => process.versions.electron,
  getNodeVersion: () => process.versions.node,
  getChromeVersion: () => process.versions.chrome,

  // 打开外部链接
  openExternal: (url) => {
    const { shell } = require('electron');
    return shell.openExternal(url);
  },

  // 获取应用信息
  getAppInfo: () => {
    return {
      name: 'Claude Code Dashboard',
      version: '1.0.0',
      electronVersion: process.versions.electron,
      platform: process.platform,
      arch: process.arch
    };
  },

  // 显示应用消息（可选）
  showMessage: (title, message) => {
    const { ipcRenderer } = require('electron');
    // 可以通过 IPC 与主进程通信来显示系统通知
    console.log('Message:', title, message);
  }
});

// 在控制台暴露 API 用于调试
if (process.env.NODE_ENV === 'development') {
  console.log('Electron API exposed:', window.electronAPI);
}
