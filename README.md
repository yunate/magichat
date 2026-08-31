# MagicHat

本地 Electron 开发工具箱. 项目由 Vue 3 renderer, Electron main 和共享 RPC 协议层组成.

## 环境

- 开发环境需要 Node.js 20 或更高版本.
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
- `npm run build:native`: 检查 native 项目表中的源码和 target 哈希, 只编译源码或 target 已变化以及 target 缺失的项目.
- `native-tools/cli-helper/bin/magichat-cli.exe test [arguments...]`: 从开发版 MagicHat Terminal 向当前 Main 实例发送诊断命令.
- `native-tools/cli-helper/bin/magichat-cli.exe set-env [--path=<path>] <key> <value> [<key> <value> ...]`: 批量更新 Macro. 省略 path 时更新当前 Workspace Environment; `.` 和 `./` 指向当前 Command, 多级 `../` 指向祖先 Folder, `__root__` 指向当前 Workspace. 包含空格的参数需要使用引号.
- `native-tools/cli-helper/bin/magichat-cli.exe prepare <path>`: 为发起请求的 MagicHat Terminal 准备已持久化 Command Item, 并返回脚本类型和临时脚本路径. 通常应通过对应的 `mhcall` 入口调用, 而不是直接使用此底层命令.
- MagicHat 创建的 PowerShell Terminal 会自动导入 `MagicHat.psm1`. `mhcall <path>` 通过 `Invoke-MagicHatRun` 在当前 PowerShell 中同步执行目标脚本, `mhsetenv [--path=<path>] <key> <value> [<key> <value> ...]` 批量更新目标 Macro 组.
- MagicHat 创建的 CMD Terminal 会自动将 CLI Helper 目录加入 `PATH`. 交互式 CMD 和批处理使用 `call mhcall "<path>"` 或 `call mhcall("<path>")` 通过 `mhrun.cmd` 同步执行目标脚本, 使用 `call mhsetenv <key> <value> [<key> <value> ...]` 更新环境变量.
- MagicHat 启动的 Node.js 脚本会自动预加载 `MagicHat.js`, 可以调用 `mhsetenv({ KEY: "value" }, ".")` 更新目标 Macro, 或在 MagicHat Terminal 中调用 `mhcall("./path.mh")` 同步执行相对当前脚本的 Command Item. 需要模块对象时仍可使用 `require(process.env.MAGICHAT_CLI_NODE_HELPER)`.
- MagicHat 启动的 Python 脚本会通过 `sitecustomize.py` 自动加载 `MagicHat.py`, 可以调用 `mhsetenv({"KEY": "value"}, "../")` 更新目标 Macro, 或在 MagicHat Terminal 中调用 `mhcall("./path.mh")` 同步执行相对当前脚本的 Command Item. 需要显式导入时可以使用 `from MagicHat import mhcall, mhsetenv`.
- `npm run package`: 使用 Electron Builder 构建未签名的 `dist-release/MagicHat Setup 1.0.0.exe`.

Windows 下也可以使用 `start.bat` 和 `package.bat`. 两个入口都通过 `npm run build` 进入唯一的 `npm run build:native` 步骤, 不会重复检查. 统一构建读取 `native-tools/native-projects.json`, 仅在源码或 target 哈希变化以及 target 缺失时调用项目构建脚本, 并只在成功后更新表. Native 项目使用 MSVC 编译; 构建脚本优先使用 `PATH` 中的 `cl.exe`, 否则通过 Visual Studio Installer 定位并加载已安装的 x64 C++ build tools.

`package.bat [certificate-path] [certificate-password]` 接受可选的 `.pfx` 或 `.p12` 代码签名证书路径和密码. 省略证书参数时, 主程序, 安装包和输出目录中的 CLI Helper 均不签名. 提供证书时, Electron Builder 使用该证书签署主程序和安装包, `afterPack` 使用同一证书签署输出目录中的 CLI Helper 副本, 不修改仓库中的 executable. 证书无效, 密码错误或任一签名步骤失败时, 打包直接失败, 不会降级为未签名包. 密码参数可能保留在 PowerShell 命令历史中.

```powershell
.\package.bat
.\package.bat "C:\Certificates\MagicHat.pfx" "certificate-password"
```

## 教程

- [Command 教程](tutorials/command.md): Command, Macro, `mhsetenv` 和 `mhcall` 的使用方法与错误行为.

## VS Code

- `Electron Main: Attach to start.bat debug`: 附加到 `start.bat debug` 启动的 inspector.
- 工作区任务 `debug` 执行 `start.bat debug`.

## 目录

- `client/`: Vue 3 renderer.
- `native-tools/`: 原生 executable 及其按运行时分类的辅助集成, 包括 CLI Helper 和 UAC Broker.
- `common/`: renderer/main 共享类型, serializer, RPC 协议和 MessagePort bridge.
- `main/`: Electron main, preload 和本地业务服务.
- `build/`: main 和 preload bundle 脚本.
- `scripts/`: Windows 批处理共享实现. 根目录 `.bat` 文件是稳定入口.
- `.github/`: Copilot instructions, agents 和 skills.
- `data/`: 本地运行数据, 不提交到仓库.

依赖由根 npm workspace 统一安装, 只保留根 `package-lock.json` 和根 `.npmrc`.

开发环境使用仓库 `data/` 目录并直接读取源码主题. 安装版配置和可编辑主题位于 Electron 用户数据目录的 `data/` 下; 安装程序将非默认主题写入 `data/themes/`, 重装或升级时覆盖同名主题文件.