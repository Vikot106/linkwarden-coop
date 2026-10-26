# Windows 开发环境启动工具

在项目根目录双击 `dev.cmd`，或在终端执行 `dev.cmd`，即可启动本地 Web、监听模式 Worker 和独立 PostgreSQL。需要先安装 Node.js 22（附带 Corepack）和 Docker Desktop，并启动 Docker Desktop。

## 常用命令

在仓库根目录使用 PowerShell：

```powershell
.\dev.cmd
.\dev.cmd status
.\dev.cmd logs
.\dev.cmd stop
```

默认访问地址为 **http://localhost:3300**。首次访问页面需要等待 Next.js 编译。启动窗口需要保持打开，按 Ctrl+C 停止；也可以双击 `stop-dev.cmd`，或在另一个终端执行停止命令。

首次启动会自动完成以下步骤：

1. 缺少依赖时，通过 Corepack 安装项目指定版本的 Yarn 和依赖。
2. 创建 `.env.development.local`，自动生成开发数据库密码和登录密钥。
3. 检查 Docker 和端口，启动 PostgreSQL 并等待健康检查通过。
4. 生成 Prisma 客户端，执行现有版本迁移。
5. 启动 Web 和 Worker，代码修改后自动重新加载。

开发数据库初始为空。打开网站注册账号，独立开发库中的第一个用户默认为系统管理员；企业管理入口为 `/admin/enterprise`。

## 环境检查和依赖安装

```powershell
.\dev.cmd doctor
.\dev.cmd install
.\dev.cmd help
```

环境检查会显示 Node.js、Docker、Compose 和端口状态。首次依赖安装和 PostgreSQL 镜像下载需要联网；安装失败时检查终端输出，修复后重新执行。

也可以直接运行 Node.js 工具，不依赖全局 `yarn` 命令：

```powershell
node scripts/dev.cjs start
node scripts/dev.cjs stop
```

## 配置和数据位置

首次启动后编辑根目录的 `.env.development.local`，重启开发工具生效。配置示例保存在 `dev.env.example`。

默认站点和新用户语言均为简体中文，可分别修改 `DEFAULT_LANGUAGE` 和 `NEW_USER_DEFAULT_LANGUAGE`。底部公告由 `ANNOUNCEMENT_ENABLED`、`ANNOUNCEMENT_ID`、`ANNOUNCEMENT_MESSAGE`、`ANNOUNCEMENT_LINK_TEXT`、`ANNOUNCEMENT_LINK_URL` 配置；文字中的 `{link}` 会替换为链接。已有用户的语言和关闭公告记录会保留，发布新公告时请更换 ID。完整规则见[默认语言和底部公告](enterprise.md#配置默认语言和底部公告)。

| 配置                 | 默认值                   | 用途                        |
| -------------------- | ------------------------ | --------------------------- |
| `DEV_WEB_PORT`       | `3300`                   | 本地网站端口                |
| `DEV_DB_PORT`        | `55433`                  | PostgreSQL 端口，仅监听本机 |
| `SITE_TITLE`         | `Linkwarden 开发环境`    | 浏览器页面标题              |
| `INSTANCE_VERSION`   | `v2.16.3-enterprise.dev` | 显示版本                    |
| `NEXT_PUBLIC_ADMIN`  | `1`                      | 开发库管理员 ID             |
| `DEV_ENABLE_BROWSER` | `false`                  | 是否启用浏览器归档任务      |

数据库运行在独立的 Docker Compose 项目中，项目名含当前仓库路径的哈希。数据保存在该项目的 `postgres-data` 命名卷，普通停止和重新启动均会保留。

日志保存在 `.local/dev/dev.log`，附件保存在 `.local/dev/archives`，Next.js 构建文件保存在 `apps/web/.next/local-development`。运行状态和本机停止接口凭据保存在 `.local/dev/session.json`。

Web 和 Worker 使用独立配置，不加载根目录原有 `.env`、`.env.local`。Prisma CLI 可能显示发现根目录 `.env`，但迁移连接始终被启动器固定到 `127.0.0.1` 上的 `linkwarden_dev` 数据库；配置中的 `DATABASE_URL` 也不会改变此连接。原有 PostgreSQL、`pgdata/`、`data/` 和正式部署 Compose 项目不参与开发工具的启停。

默认清除从终端继承的计费、SMTP、SSO、AI 和云存储配置。需要调试这些功能时，单独在 `.env.development.local` 中配置开发账号。配置文件、日志和运行凭据均已排除在 Git 提交之外。

## 调试网页归档

默认暂不执行浏览器归档任务，书签、用户组、权限、协作和数据库搜索可以正常开发，新链接等待归档。这样无需下载浏览器或安装 Monolith 即可启动。

需要测试截图、PDF、阅读视图等归档功能时执行：

```powershell
.\dev.cmd browser
```

随后将 `.env.development.local` 中的 `DEV_ENABLE_BROWSER` 改为 `true` 并重启。浏览器安装命令会下载 Chromium；完整单文件 HTML 归档还需要系统 `PATH` 中存在 `monolith` 可执行文件。浏览器可执行文件和代理等选项可以使用项目原有环境变量，在独立开发配置中设置。

默认没有运行 Meilisearch，链接搜索使用现有 PostgreSQL 回退实现。需要验证 Meilisearch 时，在开发配置中设置专用的 `MEILI_HOST` 和 `MEILI_MASTER_KEY`；服务需自行启动。

## 常见问题

- **Docker 无法连接**：启动 Docker Desktop，等待引擎运行，再执行 `dev.cmd doctor`。
- **端口被占用**：调整 `DEV_WEB_PORT` 或 `DEV_DB_PORT`。若当前开发库已有数据，修改数据库端口即可，密码保持不变。
- **修改数据库密码后无法连接**：PostgreSQL 初始化密码只在首次创建数据卷时使用。已有卷请还原原开发密码，或在数据库内正确修改密码；本工具不会删除数据库卷。
- **Prisma 引擎文件被占用**：工具会保留内容一致的 Windows 引擎文件；引擎版本发生变化时，请先停止本仓库的其他开发服务再启动。
- **关闭窗口后服务异常残留**：优先使用 Ctrl+C 或 `dev.cmd stop` 正常停止。启动器被强制结束后，停止命令仍会停止专用数据库；若 Web 端口仍占用，请在任务管理器确认对应本仓库的 Node.js 进程后结束。本工具不按旧 PID 结束不明进程。

启动器不会运行数据库重置，也不会自动清空数据卷。需要使用现有业务数据时，先将备份导入独立开发库，确认数据来源后再调试。
