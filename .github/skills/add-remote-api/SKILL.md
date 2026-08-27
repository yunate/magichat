---
name: add-remote-api
description: >
  在本项目新增或修改基于 createRemoteObj 的对象化 MessagePort RPC API. 适用于 client 调 main
  或 main 调 client: 定义领域 RPC interface, 由领域 owner 直接实现或按需增加适配对象, 注册本地对象, 创建和缓存远端对象代理,
  处理 registerName 路由, 远端对象工厂和连接生命周期.
---

# 新增对象化 RPC API

本项目的业务 RPC 统一使用 `BridgeRouter.registerRemoteObj` 和 `BridgeRouter.createRemoteObj`.
业务代码不直接维护 method 常量, Params/Result 传输包装或 `BridgeRouter.send` 调用.

## 方向与命名

RPC API 名称使用 `领域 + 提供方 + RpcApi`:

- `*ServerRpcApi`: 对象实现在 main, client 创建代理并调用.
- `*ClientRpcApi`: 对象实现在 client, main 创建代理并调用.
- 本地实现类把 `RpcApi` 改为 `RpcObject`.

文件与接口示例:

- `common/config/configRpcApi.ts` -> `ConfigServerRpcApi`.
- `common/tasks/tasksRpcApi.ts` -> `TasksServerRpcApi`, `TaskEventsClientRpcApi`.
- `main/src/infra/configManager.ts` -> `ConfigManager implements ConfigServerRpcApi`.
- `main/src/services/tasks/taskManager.ts` -> `TaskManager implements TasksServerRpcApi`.
- `client/src/pages/main/features/taskCenter/taskEventsClientRpcObject.ts`.

## registerName

- `registerName` 是 RPC interface 的运行时字符串标识, 必须与 interface 名称完全一致.
- registerName 只允许出现在 bridge create/register 边界, 不放入领域 interface 或页面代码.
- 一个 registerName 只注册一个 creator.

## 1. 定义共享接口

RPC interface 与领域模型共置, 每个领域统一使用一个 `*RpcApi.ts` 文件. 该文件可定义由 main 或 client 提供的多个 interface:

```ts
export interface FooServerRpcApi {
  getItem(id: string): FooItem | null;
  saveItem(item: FooItem): FooItem;
}
```

- 方法使用领域值, 不额外包装 `{ item }`, `{ items }` 或 `{ result }`.
- interface 只描述方法, 不包含 static 字段, registerName 常量或 transport 类型.
- 同步返回签名表示远端实现语义; `RemoteObject<T>` 自动映射为 Promise 返回值.

## 2. 实现本地 RPC API

优先让已经拥有这些行为的 manager 或 service 直接实现 interface:

```ts
export class FooManager implements FooServerRpcApi {
  public getItem(id: string): FooItem | null { /* domain behavior */ }
  public saveItem(item: FooItem): FooItem { /* domain behavior */ }
}
```

- 不为 RPC 增加只做透传或重复 validate 的包装类.
- 只有 RPC interface 与现有领域 owner 确实不匹配时, 才在对应业务领域目录增加 `*RpcObject` 适配类.
- 领域 owner 内已有的 serializer, 持久化和路径不变量继续保留, 不属于 RPC 适配层.
- 若需要连接身份, 从注册 creator 收到的 `peer.getConnectId()` 获取, 不从方法参数推断.

## 3. 注册本地对象

在提供方 `bridge/rpc_object_registry/registerRpcObjects.ts` 聚合注册领域实现:

```ts
router.registerRemoteObj(
  "FooServerRpcApi",
  (): FooServerRpcApi => gFooManager,
);
```

- 同一 registerName 只能注册一次.
- 注册在创建 listener/peer 之前完成.
- 注册器使用类封装相关注册操作, 不散落独立注册函数.

## 4. 创建远端对象

在调用方 `bridge/remote_rpc_objects/` 提供 create 工厂:

```ts
export function createFooServerRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<FooServerRpcApi>> {
  return BridgeRouter.createRemoteObj<FooServerRpcApi>(
    peer,
    "FooServerRpcApi",
  );
}
```

- registerName 字符串只写在 create 工厂和 register 聚合边界.
- 连接级 API 每个 peer 只创建一次, 缓存 proxy Promise, 不为每次业务调用创建对象.
- 页面和 service 使用语义对象, 不直接调用 `BridgeRouter`.

## 5. 使用远端结果

调用方信任 RPC interface 的返回类型, 不为对象方法结果增加重复 validate 或 Params/Result transport 包装. 配置 JSON 等需要转换为领域值的内容仍使用目标 `ISerializer<T>` 解析, 这是领域转换而不是 RPC 结果校验.

## 6. Main 调 Client

- client 在创建 WebSocket peer 前注册 `*ClientRpcApi` 本地对象.
- main 在 connection dispatch 启动后创建该 Session 的 client proxy.
- proxy 由 Session 持有, 断线后随 Session 释放.
- 广播逐 Session 调用并隔离错误; 不自动重试, 不切换备用路径.
- client RPC 对象验证 payload 后再投递事件中心; Vue 订阅在卸载时注销.

## 7. 生命周期

- 连接级 Config/Tasks/Event API 依赖断线自动释放, 正常流程不显式 destroy.
- 临时远端对象使用 `destroyRemoteObj` 显式释放.
- destroy 失败不重试, 不恢复 proxy active 状态, 失败继续向上传播.
- 已开始执行的远端方法不会因 destroy 被取消.

## 验证清单

- [ ] RPC interface 与领域模型共置, 命名方向正确.
- [ ] registerName 等于 interface 名称.
- [ ] 优先注册直接实现接口的领域 owner, 不增加纯透传或重复 validate 的包装类.
- [ ] 远端对象工厂封装 registerName 并按 peer 缓存.
- [ ] 调用方直接使用 RPC interface 返回类型, 不增加重复结果 validate.
- [ ] 业务代码不调用 `BridgeRouter.send` 或 `registerMessageHandler`.
- [ ] client 与 main typecheck 通过.
- [ ] client build 通过.
- [ ] 真实 WebSocket smoke 覆盖创建, 调用和断线释放.
- [ ] 相关 `AI_CONTEXT.md` 反映当前对象化 RPC 边界.
