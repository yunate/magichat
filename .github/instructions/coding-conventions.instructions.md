---
description: "TypeScript 与 Vue 的稳定编码约定. 适用于命名, 全局与单例前缀, public/private 可见性, 文件名, 私有成员, 成员顺序, 变更范围和注释底线."
applyTo: "**/*.ts,**/*.vue"
---
# TypeScript 与 Vue 编码约定

本文件只包含对所有 TS 和 Vue 改动稳定生效的规则. 设计取舍使用 `clean-code-design` skill, 注释工作流使用 `concise-comments` skill, 类型细节使用 `typescript-strict` skill.

## 命名

- 变量, 函数和方法使用 `camelCase`.
- 类型, 接口, 类和 Vue 组件使用 `PascalCase`.
- 方法常量和枚举值使用 `UPPER_SNAKE_CASE`.
- 函数和方法优先使用动词加名词, 例如 `createTask`, `resolveBridgeUrl`, `registerTasksRouter`.
- 布尔值和布尔返回值使用 `is`, `has`, `can` 或 `should` 前缀.
- 事件处理器使用 `on` 或 `handle` 前缀.
- 模块级共享可变状态和导出的进程级单例实例使用 `g` 前缀, 例如 `gTaskManager` 和 `gMessageStore`.
- `g` 前缀不用于局部变量, 不可变常量, 类型, serializer, 纯函数或普通模块导出.
- 名称表达领域含义, 避免无意义缩写和 `foo`, `tmp`, `misc` 等含糊名称.
- 同一概念在 `client/`, `common/` 和 `main/` 使用一致术语.
- 只在当前改动范围内修正命名不一致, 不做无关的全局重命名.

## 文件与目录

- TypeScript 文件使用 `camelCase`, 文件名应表达主要职责.
- Vue 组件使用 `PascalCase`, 并与组件名一致.
- Composable 使用 `useXxx.ts`.
- RPC API interface 与领域模型共置, 每个领域统一放在一个 `领域 + RpcApi` 文件中, 例如 `tasksRpcApi.ts`; 同一文件可包含该领域不同提供方的多个 RPC interface.
- 现有 manager 或 service 能完整承担 RPC API 时直接 `implements` 并注册该 owner; 只有接口与领域 owner 不匹配时才在对应领域目录新增 `*RpcObject` 适配类.
- bridge 的 `rpc_object_registry/` 只负责聚合注册, 对端代理工厂放在 `remote_rpc_objects/`.
- `*ServerRpcApi` 表示对象由 server 实现并由 client 调用, `*ClientRpcApi` 表示对象由 client 实现并由 server 调用; 本地实现类把 `RpcApi` 改为 `RpcObject`.
- 远端对象 registerName 必须等于 RPC interface 名称, 并且只出现在 bridge create/register 边界.
- 保留项目既有 bridge 目录 snake_case 风格, 包括 `rpc_object_registry`, `remote_rpc_objects` 和 `ws_bridge`.
- 不使用 `util.ts`, `misc.ts` 或 `temp.ts` 等无法表达职责的文件名.
- 所有测试, probe, smoke test, 验证脚本, 验证夹具和辅助断言统一放在相关模块的 `.test/` 目录, 不得散落在产品源码, 根目录或 `scripts/`.
- `.test/` 由 `.gitignore` 忽略, 不提交其中内容.

## 私有成员与成员顺序

- 类, 方法和字段默认使用满足当前调用方的最小可见性. 只有真实的模块外调用方需要时才使用 public.
- 私有字段和方法同时使用 TypeScript `private` 与 `_` 前缀, 禁止使用 `#` 私有字段.
- 函数和方法排列在字段之前.
- 同类成员中, public 在 private 之前, static 在实例成员之前.
- 完整顺序为: static public 方法, public 实例方法, static private 方法, private 实例方法, static public 字段, public 实例字段, static private 字段, private 实例字段.

## 结构与依赖

- 一个模块保持清楚职责, 避免循环依赖和模块级可变状态扩散.
- 前后端共享的数据结构和协议契约放在 `common/`.
- 新抽象必须解决当前可观察的重复, 耦合或变化需求. 不为假设需求预留空扩展点.
- 围绕同一状态, 生命周期或不变量的一组常量与操作优先封装为类, 不以多个独立导出函数和常量散落在模块中.
- 单一且真正无状态的纯计算可以保持函数, 不为满足形式强行创建无职责的工具类.
- 需要选择设计模式或评估扩展性时遵循 `clean-code-design` skill.
- strict record serializer 的 expected keys 从权威完整默认对象 `Object.keys(XxxSerializer._DEFAULT)` 派生, 不另建手写 `KEYS` 常量. 嵌套 record 同样使用其权威 default, 必要时定义 private static readonly nested default. 泛型数据使 default 依赖 serializer 实例时, 使用 constructor 构造的 private readonly 实例 default, 并确保 `getDefault()` 返回 structured clone 或全新对象, 避免共享嵌套数据. 仅当不存在完整默认对象或 schema 动态变化时允许手写 expected keys, 并说明原因.

## 注释

- 新增或修改的注释, 错误消息和用户可见字符串使用英文半角标点.
- 注释只解释非显然原因, 安全约束, 兼容性, 并发或顺序要求.
- 不复述代码, 不记录任务或变更历史, 不保留被注释掉的废弃代码.
- 不为本次未改动的代码补充注释.
- 新增或清理注释时遵循 `concise-comments` skill.

## 变更范围

- 新增符号必须遵循 `g` 前缀和最小可见性规则. 既有符号只在本次改动触及时调整, 不做无关全局重命名.
- 保持现有公开 API 和模块边界, 除非需求明确要求改变.
- 不在功能改动中夹带无关重构, 格式化或元数据调整.
- 优先沿用当前模块的实现模式, 新模式必须带来可验证的维护收益.

## 兼容性

- 默认只实现当前最新设计.
- 不主动添加旧数据格式迁移, 旧 API alias, deprecated 字段, 兼容分支, fallback 解析或双写.
- 只有用户或需求明确提出兼容目标, 版本范围或迁移策略时才实现兼容.
- 外部不可信输入的当前 schema 运行时校验和安全 fallback 不是兼容层, 应继续保留.
- 仅在本次需求触及且用户明确要求移除时删除已有兼容代码, 不默认清理无关范围.
