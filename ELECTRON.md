# Electron Desktop Application

## 概述

Claude Code Dashboard 已配置为使用 Electron 打包为桌面应用程序。

## 功能特性

- ✅ 系统托盘图标（右键菜单、双击显示/隐藏）
- ✅ 单实例运行（防止多次启动）
- ✅ 关闭窗口最小化到托盘
- ✅ 内置 Express 服务器（端口 3200）
- ✅ Windows NSIS 安装包

## 安装依赖

由于网络问题，可能需要配置镜像：

```bash
# 方法1: 使用环境变量
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# 方法2: 使用 .npmrc 文件
echo electron_mirror=https://npmmirror.com/mirrors/electron/ > .npmrc

# 然后安装依赖
npm install
```

## 开发

```bash
# 启动 Web 服务器（普通模式）
npm start

# 启动 Electron 应用（开发模式，带 DevTools）
npm run electron-dev
```

## 构建

```bash
# 构建 Windows 安装包
npm run build:win

# 或使用
npm run dist
```

构建完成后，安装包位于：
```
dist/Claude Code Dashboard Setup 1.0.0.exe
```

## 目录结构

```
dashboard/
├── electron/              # Electron 主进程文件
│   ├── main.js           # 主进程入口
│   ├── preload.js        # 预加载脚本
│   └── create-icons.js   # 图标生成脚本
├── public/               # 前端静态文件
│   ├── index.html
│   ├── css/
│   └── js/
├── assets/               # 资源文件
│   ├── icon.png         # 主图标 (512x512)
│   ├── icon.ico         # Windows 图标
│   └── tray-icon.png    # 托盘图标 (16x16)
├── server.js             # Express 服务器
├── package.json          # 项目配置
└── dist/                 # 构建输出（生成）
```

## 自定义图标

当前使用的是占位图标。要使用自定义图标：

1. **创建图标文件：**
   - `icon.png`: 512x512 PNG 格式
   - `icon.ico`: Windows ICO 格式（包含多个尺寸）
   - `tray-icon.png`: 16x16 或 32x32 PNG 格式

2. **替换占位图标：**
   将新图标放到 `assets/` 目录

3. **推荐工具：**
   - [Figma](https://www.figma.com/) - 专业设计工具
   - [Canva](https://www.canva.com/) - 在线设计工具
   - [GIMP](https://www.gimp.org/) - 开源图像编辑器
   - [ImageMagick](https://imagemagick.org/) - 命令行转换工具

4. **ICO 文件生成：**
   - [ICO Converter](https://www.icoconverter.com/)
   - [ImageMagick](https://imagemagick.org/): `convert icon.png -define icon:auto-resize=256,48,32,16 icon.ico`

## 系统托盘功能

- **右键菜单**：显示 Dashboard、刷新页面、退出
- **双击图标**：显示/隐藏窗口
- **关闭窗口**：最小化到托盘而不是退出
- **开机启动**：可在 `electron/main.js` 中启用（默认注释）

## 故障排除

### 问题：Electron 下载失败

**解决方案：**
```bash
# 设置镜像
npm config set registry https://registry.npmmirror.com
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install electron electron-builder --save-dev
```

### 问题：窗口打开但页面空白

**解决方案：**
检查 Express 服务器是否正常启动（查看控制台输出），端口 3200 是否可用。

### 问题：托盘图标不显示

**解决方案：**
1. 检查 `assets/tray-icon.png` 是否存在
2. 确保图标文件是有效的 PNG 格式
3. 在 Windows 上，ICO 格式可能更可靠

### 问题：打包后应用无法启动

**解决方案：**
1. 检查 `package.json` 的 `build.files` 是否包含所有必要文件
2. 确保没有使用绝对路径访问文件
3. 使用 `npm run electron-dev` 测试打包前的功能

## 打包大小

- **安装包**: ~150MB
- **安装后**: ~200MB
- **内存占用**: ~100-200MB
- **启动时间**: <3秒

## 许可证

MIT
