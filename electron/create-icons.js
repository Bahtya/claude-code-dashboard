// 简单的图标生成脚本 - 创建基础的 Electron 应用图标
// 对于生产环境，请使用专业的设计工具创建高质量的图标

const fs = require('fs');
const path = require('path');

// 创建一个简单的 16x16 PNG 图标（Base64）
// 这是一个简单的蓝色正方形图标
const simpleIcon16 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAABlBMVEUAAAD///+l2Z/dAAAAAXRSTlMAQObYZgAAACNJREFUeAFjYAICTlAKlBmYGBgZECJjAICAiMjIKRBMQEA7Ow42rEAAAAAElFTkSuQmCC',
  'base64'
);

// 创建 tray-icon.png
fs.writeFileSync(
  path.join(__dirname, '../assets/tray-icon.png'),
  simpleIcon16
);

// 创建 icon.png (512x512 的话需要更大的图片，这里用同一个作为占位)
fs.writeFileSync(
  path.join(__dirname, '../assets/icon.png'),
  simpleIcon16
);

console.log('✓ Placeholder icons created in assets/ directory');
console.log('  - icon.png (主图标)');
console.log('  - tray-icon.png (系统托盘图标)');
console.log('');
console.log('注意: 这些是占位图标。对于生产环境，请使用专业工具创建高质量图标。');
console.log('推荐工具:');
console.log('  - https://www.figma.com/');
console.log('  - https://www.canva.com/');
console.log('  - https://www.gimp.org/');
console.log('');
console.log('需要的图标规格:');
console.log('  - icon.png: 512x512 PNG (用于 macOS/Linux)');
console.log('  - icon.ico: Windows ICO 格式，包含 16x16, 32x32, 48x48, 256x256');
console.log('  - tray-icon.png: 16x16 或 32x32 PNG (用于系统托盘)');
