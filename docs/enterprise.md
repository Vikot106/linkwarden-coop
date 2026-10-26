# Linkwarden 企业版开发和部署

本定制版在原项目上增加企业用户组、收藏夹授权和自动展示。当前交付第一阶段 MVP，并加入基于轮询的同步和链接版本冲突检测。原有用户、收藏夹、链接和直接共享记录由增量迁移保留。

## 当前功能

- 系统管理员创建、修改、删除用户组，批量加入和移除成员；一个用户可属于多个组。
- 默认用户组只在创建账号时分配，覆盖密码注册、SSO 和移动端 Apple/Google 账号创建。关闭默认组不会移除已有成员；已有员工可以批量加入。
- 收藏夹区分个人、部门、企业公共。企业公共收藏夹对所有已登录员工只读可见，不依赖默认组；用户和组可以获得额外编辑或管理权限。
- 直接授权和组授权叠加，子收藏夹动态继承父级权限。移组或撤销授权后，后续 API 请求重新计算权限。同一个收藏夹只显示一次，不复制链接。
- 系统管理员能管理部门和企业公共资源。个人收藏夹仍需所有权或明确授权，管理员身份本身不授予私人数据读取权限。
- 编辑者可以编辑链接和子收藏夹信息、创建子收藏夹及删除有权限的子收藏夹。管理者可以调整授权；跨收藏夹移动链接需要源删除权限和目标新增权限。收藏夹移动需要两端管理权限和相同所有者，并禁止循环。
- 收藏夹、链接列表和仪表盘的活动查询每 2 秒刷新。正常网络下目标为 3 秒内更新，实际延迟和 50–100 人规模容量仍需部署环境验收。后台标签页暂停轮询，重新聚焦或恢复网络后重新获取。
- 链接返回 `version`。共享内容更新必须提交读取时的版本；SQL 原子比较并递增，冲突返回 409。置顶使用 `pinOnly: true`，只修改当前用户的置顶关系。
- 归档签名 URL 绑定签发用户，下载时再次检查当前授权；撤权或资源移动后旧 URL 失效。升级前签发且未绑定用户的私人归档 URL 需要重新获取。
- 新增中英文界面文本、收藏夹名称搜索和共享来源提示；原有链接搜索、标签、导入和归档入口继续使用。

## 管理员操作

系统管理员仍使用原项目的 `NEXT_PUBLIC_ADMIN` 用户 ID，未配置时为 1。

1. 在系统管理侧栏打开“企业管理”（`/admin/enterprise`）。
2. 在“用户组与默认配置”中创建“全体员工”“研发部”等组。按需勾选默认组，再批量选择员工加入。
3. 在“收藏夹与授权”中新建或选择收藏夹，设置“企业公共”或“部门”分类。分类只允许系统管理员修改根收藏夹；子级继承根分类。
4. 给组或用户名授予“只读”“编辑”“管理”权限。需要降权时修改对应授权；撤销一项授权后，其他组、直接授权和父级授权仍有效。
5. 收藏夹页面的“共享与协作”也提供授权面板，具有管理权限的部门成员可操作。

企业公共可见性与互联网公开共享独立。“公开共享”允许匿名访问公开 URL；仅需公司员工访问时保留该选项关闭。

共享根收藏夹的原有 DELETE 行为仍为退出直接共享；组或公司分配的根收藏夹需要管理者撤销授权。有删除权限的共享子收藏夹使用删除确认并实际删除其子树。

旧版本曾复制到子收藏夹的直接授权会保留。调整父级授权不会自动删除这些独立旧记录；如要完全撤销，请检查子级的直接授权。兼容 API 的 `propagateToSubcollections: true` 会清除子级直接授权，让其动态继承父级；子级组授权仍独立保留。

## 配置标题和版本

在 `.env` 中设置：

```dotenv
SITE_TITLE=企业知识库
INSTANCE_VERSION=v2.16.3-enterprise.1
```

未配置时使用 Linkwarden 标题和上游 package 版本。建议版本以数字语义版本开头，保持移动端版本比较兼容。页面标题和版本文字在构建时写入前端，修改后需要重新构建；Compose 定制覆盖文件会传入相应构建参数。

## 配置默认语言和底部公告

在 `.env` 中设置以下配置；使用 `dev.cmd` 时，在 `.env.development.local` 中设置：

```dotenv
DEFAULT_LANGUAGE=zh
NEW_USER_DEFAULT_LANGUAGE=zh
ANNOUNCEMENT_ENABLED=true
ANNOUNCEMENT_ID=welcome-1
ANNOUNCEMENT_MESSAGE="欢迎使用企业知识库，查看 {link}。"
ANNOUNCEMENT_LINK_TEXT="使用说明"
ANNOUNCEMENT_LINK_URL=https://example.com/help
```

`DEFAULT_LANGUAGE` 控制访客和登录、注册页的默认语言，默认 `zh`（简体中文），不再自动跟随浏览器语言。显式语言 URL 仍可使用。`NEW_USER_DEFAULT_LANGUAGE` 控制密码注册、邮件/SSO 和移动端新账号的初始语言，默认配置为 `zh`，留空则跟随站点默认语言。已有账号保存的语言偏好保持不变，用户仍可在偏好设置中修改。

支持的语言代码为 `en`、`it`、`fr`、`zh`、`zh-TW`、`uk`、`pt-BR`、`ja`、`es`、`de`、`nl`、`tr`、`pl`、`ru`。无效站点语言回退为 `zh`，无效新用户语言回退为站点默认语言。

公告完全读取本地环境配置，不再请求官方公告服务。`{link}` 指定链接位置；不含该占位符时仅显示公告文字。链接仅支持 HTTP/HTTPS，留空则显示普通文字。将 `ANNOUNCEMENT_ENABLED=false` 或清空 `ANNOUNCEMENT_MESSAGE` 可隐藏公告。用户关闭后不再显示相同 ID 的公告；发布新公告时同时修改 `ANNOUNCEMENT_ID`。公告内容按普通文本显示，无需填写 HTML 或 `&#x20;`。

开发环境修改后重启 `dev.cmd`。生产环境修改 `DEFAULT_LANGUAGE` 后重新构建 Web 镜像；其他配置重建容器即可生效，例如 `docker compose -f docker-compose.yml -f docker-compose.enterprise.yml up -d --force-recreate linkwarden`。

## 部署和升级

本地源码开发可使用根目录的 `dev.cmd`，详见[开发环境启动工具](development.md)。该工具使用独立开发数据库，Web 和 Worker 使用专用开发配置。

先在测试环境验收并备份数据库、附件和 `.env`，再更新正式环境。企业版代码位于独立的 `enterprise/mvp` 分支，不修改上游分支。

以下命令从仓库根目录执行。数据库账号和库名如果已定制，请替换示例中的 `postgres`。

```sh
docker compose exec -T postgres pg_dump -U postgres -d postgres -Fc -f /tmp/linkwarden-before-enterprise.dump
docker compose cp postgres:/tmp/linkwarden-before-enterprise.dump ./linkwarden-before-enterprise.dump
```

同时备份 `data/` 附件目录；使用 S3 时备份对象存储。需要一致性备份时，先停止 Web/Worker 写入再执行数据库和附件备份。妥善保存备份和环境文件，勿提交到 Git。

构建和启动定制镜像：

```sh
docker compose -f docker-compose.yml -f docker-compose.enterprise.yml up -d --build
```

该覆盖文件使用本地 `linkwarden-enterprise:local` 镜像。原版 `docker-compose.yml` 仍使用官方镜像；单独启动原版配置不会部署定制功能。现有 Docker 启动命令会在启动 Web/Worker 前执行 Prisma Migration。

本次新增迁移为 `20261026000000_enterprise_groups`，只增加枚举、表、字段及索引。原收藏夹默认为 `PERSONAL`，旧直接成员的 `canManage` 默认为 false，链接 `version` 从 0 开始。不要对已有库运行 `prisma migrate reset` 或以 `db push` 代替版本迁移。

非 Docker 环境先安装现有依赖，再运行：

```sh
yarn prisma:generate
yarn prisma:deploy
yarn web:build
```

回滚时先停止定制服务，恢复变更前的数据库备份和同一时间点附件，随后启动与备份匹配的上游镜像。恢复到新建数据库后切换连接地址，可保留出错环境供排查。仅切换旧镜像无法撤回新授权配置；完整恢复会丢弃备份之后的新写入，应先单独保存需要保留的数据。

## 验证

类型检查：

```sh
node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
```

集成测试必须使用隔离库。下面的临时容器只监听本机端口、没有数据卷，停止后自动删除；不要改成正式数据库连接。

```sh
docker run --detach --rm --name linkwarden-enterprise-test --publish 127.0.0.1:55432:5432 --env POSTGRES_USER=enterprise_test --env POSTGRES_PASSWORD=enterprise_test --env POSTGRES_DB=enterprise_test postgres:18.4-alpine
node scripts/test-enterprise.cjs
docker stop linkwarden-enterprise-test
```

测试脚本只接受 `127.0.0.1:55432/enterprise_test`，为该库部署迁移，设置独立附件目录，再运行全部 Vitest 测试。新增测试覆盖最高有效权限、动态继承、默认组、管理员私人数据隔离、越权授权、只读写入拦截、移动校验、并发冲突，以及撤销后链接、搜索、归档和导出访问。

发布前仍需在实际 Compose 环境完成多浏览器同步延迟、完整镜像构建、备份恢复演练、原有移动端和浏览器扩展验收。当前自动化集成测试使用 PostgreSQL，搜索使用数据库回退；Meilisearch 服务集成需另外验收。

2026 年 10 月 26 日本地验证：62 项 Vitest 测试通过；原版 99 个迁移执行后写入旧数据，再执行第 100 个企业版迁移，用户、收藏夹、链接和原共享权限保留。双浏览器实测一次链接更新在约 1.35 秒后自动显示，撤销部门成员资格后旧链接 API 返回未授权。这是本地功能验收结果，尚未代表 50–100 用户负载下的表现。

## 后续阶段

下一阶段包括 SSE/WebSocket 推送、授权及操作审计、部门管理员的组成员管理委派、收藏夹批量授权、收藏夹属性的并发冲突保护，以及容量和安全专项测试。可选企业集成阶段再接入身份提供商组织同步和离职自动撤权。

## 跟随上游升级

保留上游 remote，先将新版本合并到独立集成分支，再处理定制差异。权限计算集中在 `packages/lib/collectionPermissions.ts` 和 `collectionAccess.ts`；API 入口适配在 Web 层。合并时重点审查新增数据读取接口是否使用有效权限、新账号路径是否分配默认组、Worker 是否重新校验写权限。不要复制旧权限结果作为永久授权。

新增 Prisma Migration 不修改已有迁移。升级后重新生成客户端，运行类型检查、隔离集成测试和前端构建，并在测试环境验证迁移及恢复。保留原项目 `LICENSE.md` 和相关版权声明，继续按项目 AGPL-3.0 许可要求维护和提供定制源码。
