# MagicHat

本地 Electron 开发工具箱. 项目由 Vue 3 renderer, Electron main 和共享 RPC 协议层组成.

## 许可与隐私

- MagicHat 自有代码采用 [MIT License](LICENSE), 版权持有人为 yunate. 第三方组件保留各自的授权条件, 见 [Third-Party Notices](THIRD_PARTY_NOTICES.md).
- [Privacy policy](PRIVACY.md) 说明本地数据, 默认开启的更新检查, OCR 资源下载和用户脚本的联网边界. MagicHat 不是完全不联网的应用.
- 文件占用功能使用的 ddwhouses 源码位于 https://github.com/yunate/ddwhouses, 其 ddbase 依赖来自 https://github.com/yunate/dd. 两个上游的许可状态及签名申请前待办见 [Code signing policy](CODE_SIGNING.md).

## Code signing policy

当前尚未获得 SignPath Foundation 的开源签名支持. 开发自签名或未签名构建不能视为已经过 SignPath 验证的发布版本. 维护者, 审阅与批准职责, 申请准备清单以及签名范围见 [Code signing policy](CODE_SIGNING.md).

## 构建与发布

只保留一份 [Build and publish](.github/workflows/build-and-publish.yml) GitHub Actions 入口, 主要流程为取代码, 打包, 发布. 打包步骤先执行 `npm ci`, 然后调用 [package.bat](package.bat), 成功后调用 [publish.bat](publish.bat). 不再设置 Node 版本, 单独执行类型检查, 上传 Actions Artifacts 或提供发布确认参数.

打包前增加一个下载缓存步骤, 缓存 npm, Electron 和 electron-builder 的下载目录, 按系统, 架构和 `package-lock.json` 区分. 首次需要下载, 成功保存缓存后供后续运行复用; lockfile 变化会使用新的缓存键. 不缓存 `node_modules`, 开发证书或发布凭据, 命中缓存也仍执行 `npm ci`.

构建使用 GitHub-hosted Windows runner 自带的 Node.js/npm. ddwhouses 直接使用仓库中的 `native-tools/ddwhouses/bin/ddwhouses.exe`, 不拉取或编译 ddwhouses 和 ddbase; MagicHat 自有的原生工具仍由现有打包入口构建.

每次手动运行都会在打包成功后发布, 不提供只构建模式. 签名行为完全沿用 `package.bat`, 当前使用开发自签名证书, 不是公开信任或 SignPath 签名. 工作流不额外生成来源报告和哈希清单.

发布前需要在源码仓库的 GitHub 设置中:

1. 创建名为 `release` 的 Environment, 配置发布批准者, 并限制仅允许 `main` 部署.
2. 在该 Environment 中添加 Secret `MAGICHAT_RELEASE_TOKEN`. 令牌所属账号必须有 `ddmagichat/magichat-release` 的写权限; 细粒度令牌需要选择该目标仓库并授予 `Contents: Read and write`, 必要时完成组织批准. 源码仓库默认的 `GITHUB_TOKEN` 不具备跨仓库写权限.
3. 将工作流推送到默认分支后, 在 Actions 中打开 `Build and publish`, 从 `main` 手动运行, 并完成已配置的 Environment 审批.

单个 job 使用 `release` Environment, 分支限制和审批由该环境的设置控制.

发布直接使用同一 job 中 `package.bat` 的输出, 沿用 `publish.bat` 和底层发布脚本. 它会覆盖目标仓库 `latest` 的同名附件, 并在发布成功后删除其他版本的附件, 旧 Release 和 tag. 不希望执行这些清理时不要运行该工作流.

`publish.bat` 保持原有登录行为, 认证失败时仍可能进入网页登录分支. CI 不适合交互登录, 请在运行前确认发布令牌有效. 不要将令牌写入 YAML, 提交到仓库或发到聊天中.

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

`package.bat` 不接受参数, 当前固定使用开发自签名证书; 证书文件不存在时调用项目的开发证书生成脚本. CI 与本地使用同一个入口. 开发自签名不等于用户电脑默认信任的发行签名, 私钥和证书文件不应提交到仓库或附加到发布产物. 签名失败仍由现有脚本报告失败, 不在工作流中增加降级逻辑.

```powershell
.\package.bat
.\publish.bat
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
- `.github/`: GitHub Actions, Copilot instructions, agents 和 skills.
- `data/`: 本地运行数据, 不提交到仓库.

依赖由根 npm workspace 统一安装, 只保留根 `package-lock.json` 和根 `.npmrc`.

开发环境使用仓库 `data/` 目录并直接读取源码主题. 安装版配置和可编辑主题位于 Electron 用户数据目录的 `data/` 下; 安装程序将非默认主题写入 `data/themes/`, 重装或升级时覆盖同名主题文件.