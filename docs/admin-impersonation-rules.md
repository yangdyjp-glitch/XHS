# 管理员代理登录用户功能规则

本文档用于在其他项目中复现“管理员从后台登录每个用户”的功能。

在 Matrix Compass 中，该功能叫“负责人代理登录”或“登录该账户”。其他项目可以把 `leader` 替换为 `admin`、`super_admin` 或实际管理员角色。

## 1. 功能目标

管理员可以在后台用户管理页点击“登录该账户”，临时切换到目标用户身份，查看和操作目标用户可见的内容。

这个功能的核心不是获取用户密码，而是由系统签发一张“目标用户身份”的会话令牌，并在令牌里记录原管理员身份。

一句话原则：

```text
代理登录 = 目标用户权限 + 管理员身份留痕
```

不要做成“管理员万能权限套壳”，也不要读取、修改或重置目标用户密码。

## 2. 核心规则

### 2.1 权限规则

1. 只有管理员角色可以发起代理登录。
2. 管理员不能代理登录自己。
3. 管理员不能在已经代理登录状态下继续切换另一个用户。
4. 如需切换到另一个用户，必须先退出当前代理登录，返回管理员本人账户。
5. 只能代理登录启用状态的用户。
6. 停用、删除、冻结或不存在的用户不可代理登录。
7. 代理登录后，系统权限按目标用户角色计算，而不是继续按管理员角色计算。

### 2.2 密码规则

1. 代理登录不需要知道目标用户密码。
2. 不读取目标用户密码。
3. 不修改目标用户密码。
4. 不重置目标用户密码。
5. 目标用户原密码继续有效。
6. 代理登录期间不应触发目标用户的首次登录强制改密流程。

原因：管理员只是代为排查或代为操作，不应被引导去替别人改密码。

### 2.3 会话规则

正常登录令牌包含：

```text
userId: 当前登录用户 ID
email: 当前登录用户账号
role: 当前登录用户角色
```

代理登录令牌包含：

```text
userId: 目标用户 ID
email: 目标用户账号
role: 目标用户角色
impersonatorId: 原管理员 ID
```

服务端读取会话时：

1. 用 `userId` 加载当前有效用户，即目标用户。
2. 如果令牌里有 `impersonatorId`，再加载原管理员信息。
3. 在 `auth.me` 返回值中附带 `impersonator`。

前端判断：

```text
impersonator 不为空 => 当前处于代理登录状态
impersonator 为空 => 当前是正常登录状态
```

## 3. 审计规则

所有代理登录行为必须写入审计日志。

建议数据库表：

```sql
impersonation_logs
- id
- actor_id        -- 发起操作的管理员 ID
- target_user_id  -- 被代理登录的用户 ID
- action          -- start / stop
- created_at      -- 操作时间
```

开始代理登录时写入：

```text
actorId: 当前管理员 ID
targetUserId: 目标用户 ID
action: start
createdAt: 当前时间
```

退出代理登录时写入：

```text
actorId: 原管理员 ID
targetUserId: 当前目标用户 ID
action: stop
createdAt: 当前时间
```

审计日志只允许管理员查看。

日志展示建议包括：

```text
操作类型：开始代理 / 退出代理
管理员：actorName
目标用户：targetName
时间：createdAt
```

## 4. 后端接口设计

最少需要 4 个接口。

### 4.1 发起代理登录

```text
POST /auth/impersonate
```

入参：

```json
{
  "userId": 123
}
```

权限：

```text
仅管理员
```

处理流程：

1. 判断当前用户是否为管理员。
2. 判断当前是否已处于代理登录状态。
3. 判断目标用户不是自己。
4. 查询目标用户。
5. 判断目标用户存在且启用。
6. 写入审计日志 `action = start`。
7. 签发目标用户身份令牌，令牌中附带 `impersonatorId`。
8. 写入 Cookie 或返回令牌。
9. 返回目标用户基础信息。

伪代码：

```ts
impersonate(userId) {
  requireAdmin(currentUser);

  if (currentSession.impersonatorId) {
    throw new Error("请先退出当前代理登录，再切换到其他用户");
  }

  if (userId === currentUser.id) {
    throw new Error("无需登录自己的账户");
  }

  const target = findUserById(userId);
  if (!target || !target.isActive) {
    throw new Error("目标用户不存在或已停用");
  }

  insertImpersonationLog({
    actorId: currentUser.id,
    targetUserId: target.id,
    action: "start",
  });

  const token = createToken({
    userId: target.id,
    email: target.email,
    role: target.role,
    impersonatorId: currentUser.id,
  });

  setAuthCookie(token);
  return target;
}
```

### 4.2 退出代理登录

```text
POST /auth/stop-impersonating
```

权限：

```text
已登录且处于代理登录状态
```

处理流程：

1. 判断当前会话是否包含 `impersonatorId`。
2. 查询原管理员。
3. 判断原管理员仍存在且启用。
4. 写入审计日志 `action = stop`。
5. 重新签发管理员本人身份令牌。
6. 写入 Cookie 或返回令牌。
7. 返回管理员用户信息。

伪代码：

```ts
stopImpersonating() {
  if (!currentSession.impersonatorId) {
    throw new Error("当前不处于代理登录状态");
  }

  const admin = findUserById(currentSession.impersonatorId);
  if (!admin || !admin.isActive) {
    throw new Error("原管理员账户不可用，请重新登录");
  }

  insertImpersonationLog({
    actorId: admin.id,
    targetUserId: currentUser.id,
    action: "stop",
  });

  const token = createToken({
    userId: admin.id,
    email: admin.email,
    role: admin.role,
  });

  setAuthCookie(token);
  return admin;
}
```

### 4.3 获取当前登录用户

```text
GET /auth/me
```

返回示例：

```json
{
  "id": 45,
  "name": "目标用户",
  "email": "target@example.com",
  "role": "teacher",
  "mustChangePassword": false,
  "impersonator": {
    "id": 1,
    "name": "管理员"
  }
}
```

注意：

```text
代理登录期间 mustChangePassword 建议强制返回 false。
```

### 4.4 查看代理登录审计日志

```text
GET /auth/impersonation-logs
```

权限：

```text
仅管理员
```

返回字段建议：

```json
[
  {
    "id": 1,
    "action": "start",
    "actorId": 1,
    "actorName": "管理员",
    "targetUserId": 45,
    "targetName": "目标用户",
    "createdAt": "2026-07-07T00:00:00.000Z"
  }
]
```

## 5. 前端交互规则

### 5.1 用户管理页

在用户列表中，每个非当前管理员本人的用户旁边显示：

```text
登录该账户
```

按钮显示条件：

1. 当前登录者是管理员。
2. 当前行用户不是自己。
3. 当前行用户处于启用状态。
4. 当前没有正在提交的用户管理操作。

点击按钮前必须弹确认框。

建议确认文案：

```text
将以「用户名」的身份登录其账户，期间你看到和操作的都是该用户的内容。

此操作会被记入审计日志（谁、登录了谁、何时），不会修改对方密码。
完成后可点击底部横幅「返回我的账户」。

确定继续吗？
```

确认后调用：

```text
POST /auth/impersonate
```

成功后建议：

```text
window.location.assign("/")
```

这样页面会重新加载当前用户信息和权限菜单。

### 5.2 全局代理登录横幅

代理登录期间，所有已登录页面都应该显示固定横幅。

显示条件：

```text
auth.me 返回 impersonator 不为空
```

建议文案：

```text
你（管理员名）正在以 用户名 的身份操作
```

按钮：

```text
返回我的账户
```

点击按钮调用：

```text
POST /auth/stop-impersonating
```

成功后建议：

```text
window.location.assign("/")
```

### 5.3 权限菜单

代理登录后，导航菜单、页面权限、数据范围都按目标用户角色显示。

例如：

```text
管理员代理登录老师账号后，只看到老师能看到的菜单和数据。
```

不要因为 `impersonatorId` 存在，就继续开放管理员菜单。

## 6. 安全边界

必须做到：

1. 代理登录行为可审计。
2. 不接触用户密码。
3. 不绕过目标用户角色权限。
4. 不允许嵌套代理登录。
5. 不允许代理停用用户。
6. 退出代理登录时重新确认原管理员仍然有效。
7. 审计日志不可由普通用户查看。

建议额外增强：

1. 审计日志中记录 IP、User-Agent。
2. 审计日志中记录原因字段，例如 `reason`。
3. 高风险项目可以要求管理员二次确认或输入自己的密码。
4. 对代理登录操作做频率限制。
5. 在横幅中使用醒目颜色，避免管理员忘记自己正在代操作。

## 7. 数据结构建议

### 7.1 用户表

至少需要：

```sql
users
- id
- email
- name
- role
- password_hash
- is_active
- must_change_password
```

### 7.2 审计表

```sql
impersonation_logs
- id
- actor_id
- target_user_id
- action
- created_at
```

可选增强字段：

```sql
- ip_address
- user_agent
- reason
```

## 8. 迁移到其他项目的清单

后端：

- [ ] 用户表有角色字段。
- [ ] 用户表有启用/停用字段。
- [ ] 登录令牌支持额外字段 `impersonatorId`。
- [ ] 认证中间件能根据 `impersonatorId` 加载原管理员。
- [ ] 有管理员专用权限中间件。
- [ ] 新增代理登录接口。
- [ ] 新增退出代理登录接口。
- [ ] `auth.me` 返回 `impersonator`。
- [ ] 新增审计日志表。
- [ ] 每次 start/stop 都写审计日志。

前端：

- [ ] 用户管理页增加“登录该账户”按钮。
- [ ] 点击前显示确认弹窗。
- [ ] 成功代理登录后刷新页面。
- [ ] 全局显示代理登录横幅。
- [ ] 横幅提供“返回我的账户”按钮。
- [ ] 菜单和权限按目标用户角色显示。
- [ ] 代理登录期间不触发目标用户强制改密。

测试：

- [ ] 普通用户不能发起代理登录。
- [ ] 管理员不能代理自己。
- [ ] 管理员不能代理停用用户。
- [ ] 管理员不能嵌套代理登录。
- [ ] 代理登录后权限变成目标用户权限。
- [ ] 代理登录后能看到横幅。
- [ ] 点击返回后恢复管理员账户。
- [ ] start 和 stop 都有审计日志。
- [ ] 目标用户密码不受影响。

## 9. Matrix Compass 当前实现参考

后端代理登录逻辑：

```text
server/routers/auth.router.ts
```

JWT 与 Cookie：

```text
server/_core/auth.ts
```

认证上下文与权限中间件：

```text
server/_core/trpc.ts
```

用户管理页按钮：

```text
client/src/pages/UsersPage.tsx
```

代理登录横幅：

```text
client/src/components/ImpersonationBanner.tsx
```

前端登录状态：

```text
client/src/hooks/useAuth.ts
```

审计表：

```text
drizzle/schema.ts
```

## 10. 推荐错误提示

```text
仅管理员可执行此操作
请先退出当前代理登录，再切换到其他用户
无需登录自己的账户
目标用户不存在或已停用
当前不处于代理登录状态
原管理员账户不可用，请重新登录
代理登录失败
退出代理登录失败
```

## 11. 推荐命名

后端接口：

```text
impersonate
stopImpersonating
listImpersonationLogs
```

数据库表：

```text
impersonation_logs
```

令牌字段：

```text
impersonatorId
```

前端组件：

```text
ImpersonationBanner
```
