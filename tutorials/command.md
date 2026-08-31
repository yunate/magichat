# Command 教程

Command 用于保存和运行 PowerShell, Node.js/TypeScript, Python 与 CMD 脚本. 每个 Command Item 包含脚本类型, 脚本内容和参数组, 并可以继承上级 Folder 参数与当前选中的 Workspace Env 参数组.

## 创建和运行 Command

1. 在左侧 Command Tree 中创建 Folder 或 Item.
2. 打开 Item, 选择脚本类型并编写脚本.
3. 根据需要展开 Parameter Group, 添加 Macro 参数.
4. 保存 Item.
5. 点击 Run. MagicHat 会在当前 Item 的 Terminal 中同步执行脚本.

Command 支持以下脚本类型:

- `powershell`: PowerShell 脚本.
- `node`: JavaScript 或 TypeScript 编译后的 JavaScript 脚本.
- `python`: Python 脚本.
- `cmd`: Windows batch 脚本.

## 设置自定义 Root

Command Root 是包含一个或多个 Workspace 目录的绝对路径. Root 本身不是 Workspace; Root 下的每个一级目录才是一个 Workspace.

1. 进入 Command 页面, 点击标题栏右侧的设置按钮.
2. 在 `Root paths` 中点击 `Add root`.
3. 在 `Key` 中填写一个唯一名称, 例如 `tutorial`.
4. 在 `Path` 中填写 Root 的绝对目录. 路径不能为空.
5. 选中新 Root 左侧的单选框.
6. 关闭设置面板. MagicHat 会保存设置并切换到选中的 Root.

只有当前选中的 Root 会显示在 Command Tree 中. 内置 `default` Root 的 Key 和 Path 不能修改或删除; 自定义 Root 需要先切换到其他 Root 后才能删除.

仓库提供了一个可直接使用的教程 Root:

```text
<MagicHat repository>\tutorials\command-root
```

设置时应选择 `command-root` 目录, 不要选择它下面的 `tutorial` 目录. 配置成功后, Workspace 选择器中会出现 `tutorial`.

### 教程 Root 内容

`tutorial` Workspace 包含以下示例:

- `set-env`: 分别使用 PowerShell, CMD, Node.js 和 Python 调用 `mhsetenv`.
- `targets/show env.mh`: 显示当前选中的 Workspace Env 参数组中的 `tutorial.name` 和 `tutorial.source`.
- `call`: 分别使用四种脚本调用路径中包含空格的 `targets/show env.mh`.

建议按以下顺序体验:

1. 运行 `targets/show env.mh`, 查看初始选中的 Workspace Env 参数组.
2. 运行 `set-env` 中任意一个脚本, 更新 `tutorial.source`.
3. 再次运行 `targets/show env.mh`, 确认环境变量已持久化.
4. 运行 `call` 中任意一个脚本, 查看 `mhcall` 的同步调用与后续脚本行为.

## Macro

在脚本或参数值中使用 `mh{key}` 引用 Macro:

```text
mh{project.root}
mh{build-target}
```

`{}` 内允许首尾空格, 例如 `mh{ project.root }`. key 必须以字母或 `_` 开头, 后续可以使用字母, 数字, `_`, `.` 和 `-`.

编辑器在输入 `mh{` 后会显示当前作用域可用的 Macro. 鼠标悬停在 Macro 上可以查看来源和解析值.

Macro 按以下顺序覆盖, 越靠后的作用域优先级越高:

1. 上级 Folder, 从最外层到最近一层.
2. 当前 Item 选中的 Parameter Group.
3. 当前选中的 Workspace Env 参数组.

禁用的参数不会参与解析. 参数值也可以引用其他 Macro, 但不能引用不存在的 key 或形成循环依赖.

## CLI

`mhcall` 和 `mhsetenv` 只在 MagicHat 创建的 Terminal 或由其中启动的脚本中可用. Node.js/TypeScript, Python 和 PowerShell 可以直接调用 helper; CMD 必须使用 **`call`** 调用 `mhxxx.cmd`, 否则执行完 helper 后可能无法返回当前 batch 脚本. 单参数 `mhcall` 在前三种语言中都可以写成 `mhcall("...")`.

调用形式概览:

```javascript
// Node.js / TypeScript
mhcall("default/tools/build project.mh");
```

```python
# Python
mhcall("default/tools/build project.mh")
```

```powershell
# PowerShell
mhcall("default/tools/build project.mh")
```

```bat
rem CMD
call mhcall("default/tools/build project.mh")
```

路径包含空格时必须保留引号. CMD 也支持标准 batch 参数形式:

```bat
call mhcall "default/tools/build project.mh"
```

### mhsetenv

`mhsetenv` 立即更新选中的 Macro 参数组. 省略 path 时仍更新当前 Command Workspace 中选中的 Workspace Env 参数组. 指定 path 时, `.` 和 `./` 表示当前执行的 Command, 一个或多个 `../` 表示祖先 Folder, `__root__` 表示当前 Workspace. 普通路径仍从 Workspace root 解析.

Node.js/TypeScript 使用对象:

```javascript
mhsetenv({
  BUILD_MODE: "release",
  OUTPUT_DIR: "D:\\Build Output",
}, ".");
```

Python 使用字典:

```python
mhsetenv({
    "BUILD_MODE": "release",
    "OUTPUT_DIR": r"D:\Build Output",
}, "../../")
```

PowerShell 使用连续的 key/value 参数:

```powershell
mhsetenv "--path=__root__" "BUILD_MODE" "release" "OUTPUT_DIR" "D:\Build Output"
```

CMD 同样使用连续的 key/value 参数, 并且必须使用 **`call`**:

```bat
call mhsetenv "--path=../" "BUILD_MODE" "release" "OUTPUT_DIR" "D:\Build Output"
```

Node.js/TypeScript, Python 和 PowerShell 中, `mhsetenv` 失败时会抛出异常. CMD 中, `mhsetenv.cmd` 会输出错误并返回非零错误码, 调用方可以使用与 `mhcall.cmd` 相同的 `if errorlevel 1` 或 `|| exit /b %ERRORLEVEL%` 处理方式.

更新成功后, 后续 Command 可以从选中的 Workspace Env 参数组中读取这些 Macro:

```text
mh{BUILD_MODE}
mh{OUTPUT_DIR}
```

### mhcall

`mhcall` 根据当前 Workspace 中的持久化路径查找 Command Item, 解析 Folder, Item 和选中的 Workspace Env 参数组中的 Macro, 然后同步执行目标脚本.

注意以下行为:

- `mhcall` 只读取已经保存的 Command 内容, 不会执行编辑器中尚未保存的修改.
- 相对路径必须包含 Workspace 名称, 例如 `default/tools/build project.mh`.
- 目标必须是 Item, 不能是 Folder.
- 目标 Command 内容不能为空.
- 调用会等待目标脚本执行结束后再继续.

Node.js/TypeScript, Python 和 PowerShell 中, `mhcall` 准备失败时会抛出异常. 如果调用方不捕获异常, 当前脚本会停止, 后续语句不会执行.

```javascript
try {
  mhcall("default/tools/build project.mh");
} catch (error) {
  console.error("Build Command failed:", error);
}
```

```python
try:
    mhcall("default/tools/build project.mh")
except RuntimeError as error:
    print(f"Build Command failed: {error}")
```

```powershell
try {
  mhcall("default/tools/build project.mh")
}
catch {
  Write-Error "Build Command failed: $_"
}
```

CMD 没有异常机制. `mhcall.cmd` 会把具体错误写入 stderr, 通过 `exit /b` 返回非零错误码, 然后由调用方决定停止还是继续. CMD 默认会继续执行后续语句.

失败时停止当前 batch 脚本:

```bat
call mhcall("default/tools/build project.mh") || exit /b %ERRORLEVEL%

echo This line runs only when mhcall succeeds.
```

自行处理错误并继续:

```bat
call mhcall("default/tools/build project.mh")
if errorlevel 1 (
  echo Build Command failed with exit code %ERRORLEVEL%. 1>&2
)

echo Continue current script.
```

不要在 helper 内使用普通 `exit` 代替 `exit /b`. 普通 `exit` 会关闭整个 CMD 进程, 包括当前 MagicHat Terminal.

## 常见问题

### Command path does not identify an Item

确认路径属于当前选中的 Workspace, 包含 Workspace 名称, 并且指向一个已保存的 Item.

### Called Command has no content

目标 Item 已找到, 但其持久化脚本内容为空. 填写并保存目标 Item 后重新调用.

### Macro 解析失败

检查 Macro key 是否存在并启用, 参数值之间是否形成循环引用, 以及当前 Item 是否选中了正确的 Parameter Group.