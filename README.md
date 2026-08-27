# MagicHat

本地 Electron 开发工具箱. 项目由 Vue 3 renderer, Electron main 和共享 RPC 协议层组成.

## 环境

- 开发环境需要 Node.js 18 或更高版本.
- Electron 安装包包含所需 Chromium 和 Node.js runtime.
- npm registry 统一由根目录 `.npmrc` 配置.

## 常用命令

```bash
npm install
npm run typecheck
npm run build
npm start
```

- `npm start`: 构建 renderer, main 和 preload, 然后启动 Electron.
- `npm run debug`: 通过 `start.bat debug` 在 `127.0.0.1:9229` 开启 Electron main inspector.
- `npm run package`: 使用 Electron Builder 构建 `dist-release/MagicHat Setup 1.0.0.exe`.

Windows 下也可以使用 `start.bat` 和 `package.bat`. `start.bat debug` 开启 Node.js inspector.

## VS Code

- `Electron Main: Attach to start.bat debug`: 附加到 `start.bat debug` 启动的 inspector.
- 工作区任务 `debug` 执行 `start.bat debug`.

## 目录

- `client/`: Vue 3 renderer.
- `common/`: renderer/main 共享类型, serializer, RPC 协议和 MessagePort bridge.
- `main/`: Electron main, preload 和本地业务服务.
- `build/`: main 和 preload bundle 脚本.
- `scripts/`: Windows 批处理共享实现. 根目录 `.bat` 文件是稳定入口.
- `.github/`: Copilot instructions, agents 和 skills.
- `data/`: 本地运行数据, 不提交到仓库.

依赖由根 npm workspace 统一安装, 只保留根 `package-lock.json` 和根 `.npmrc`.

开发环境继续使用仓库 `data/` 目录. 安装包的数据目录策略尚未确定, 当前不迁移旧数据.