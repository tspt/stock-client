/**
 * 打包前设置国内镜像环境变量（electron-builder 的 nsis、winCodeSign 等）
 * 注意：不要在此设置 ELECTRON_MIRROR，否则 app-builder 会把 winCodeSign 误从
 * mirrors/electron/ 拉取（404）。Electron 本体已在 node_modules 中；若需装包加速可
 * 在全局或本机 npm 配置 electron_mirror，勿与打包脚本混用。
 * 若已手动设置 ELECTRON_BUILDER_BINARIES_MIRROR，则不会覆盖。
 */
const { spawnSync } = require('child_process');
const path = require('path');

if (!process.env.ELECTRON_BUILDER_BINARIES_MIRROR) {
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR =
    'https://npmmirror.com/mirrors/electron-builder-binaries/';
}

// 全局 npm 常设 electron_mirror，app-builder 会用它拼 winCodeSign URL（npmmirror 上为 404），打包时必须去掉
delete process.env.ELECTRON_MIRROR;

const ebCli = path.join(__dirname, '..', 'node_modules', 'electron-builder', 'cli.js');
const r = spawnSync(process.execPath, [ebCli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});
process.exit(r.status !== null && r.status !== undefined ? r.status : 1);
