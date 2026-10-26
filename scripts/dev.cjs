const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const LOCAL = path.join(ROOT, ".local", "dev");
const CONFIG = path.join(ROOT, ".env.development.local");
const STATE = path.join(LOCAL, "session.json");
const LOG = path.join(LOCAL, "dev.log");
const PROJECT = `linkwarden-dev-${crypto
  .createHash("sha256")
  .update(ROOT.toLowerCase())
  .digest("hex")
  .slice(0, 8)}`;
const COMPOSE = [
  "compose",
  "--project-name",
  PROJECT,
  "--file",
  path.join(ROOT, "docker-compose.local.yml"),
  "--env-file",
  CONFIG,
];
const children = new Set();
let stopping;
let control;
let session;
let logging = false;

function say(message) {
  console.log(message);
  if (logging) fs.appendFileSync(LOG, `${message}\n`);
}

function run(command, args, options = {}) {
  if (stopping) return Promise.reject(new Error("开发服务正在停止。"));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      windowsHide: true,
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);
    let output = "";
    const onData = (data) => {
      output += data;
      if (logging) fs.appendFileSync(LOG, data);
      if (!options.quiet) {
        process.stdout.write(data);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timeout = setTimeout(() => {
      killTree(child);
    }, options.timeout || 180_000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      children.delete(child);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      children.delete(child);
      if (code === 0) resolve(output.trim());
      else
        reject(
          new Error(
            `${path.basename(command)} 执行失败（${code}）。${
              options.quiet ? `\n${output.trim()}` : "请查看上方输出。"
            }`
          )
        );
    });
  });
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return Promise.resolve();
  if (process.platform === "win32")
    return new Promise((resolve) => {
      const killer = spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" }
      );
      killer.on("exit", resolve);
      killer.on("error", resolve);
    });
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  return Promise.resolve();
}

function getConfig(create = false) {
  const dotenv = require("dotenv");
  if (!fs.existsSync(CONFIG) && create) {
    const template = fs
      .readFileSync(path.join(ROOT, "dev.env.example"), "utf8")
      .replace(
        /^DEV_POSTGRES_PASSWORD=.*$/m,
        `DEV_POSTGRES_PASSWORD=${crypto.randomBytes(24).toString("hex")}`
      )
      .replace(
        /^NEXTAUTH_SECRET=.*$/m,
        `NEXTAUTH_SECRET=${crypto.randomBytes(32).toString("hex")}`
      );
    fs.writeFileSync(CONFIG, template, { flag: "wx", mode: 0o600 });
    say("已创建独立配置：.env.development.local");
  }
  return dotenv.parse(
    fs.readFileSync(
      fs.existsSync(CONFIG) ? CONFIG : path.join(ROOT, "dev.env.example")
    )
  );
}

function ports(config) {
  const web = Number(config.DEV_WEB_PORT || 3300);
  const db = Number(config.DEV_DB_PORT || 55433);
  if (
    ![web, db].every(
      (value) => Number.isInteger(value) && value >= 1024 && value <= 65535
    ) ||
    web === db
  )
    throw new Error(
      "DEV_WEB_PORT、DEV_DB_PORT 必须是 1024–65535 之间的不同整数。"
    );
  return { web, db };
}

function appEnv(config) {
  const { web, db } = ports(config);
  if (!config.DEV_POSTGRES_PASSWORD || !config.NEXTAUTH_SECRET)
    throw new Error(
      "请在 .env.development.local 中设置 DEV_POSTGRES_PASSWORD 和 NEXTAUTH_SECRET。"
    );
  // Clear application settings inherited from the shell, including cloud storage, mail and billing.
  const empty = Object.fromEntries(
    Object.keys(
      require("dotenv").parse(fs.readFileSync(path.join(ROOT, ".env.sample")))
    ).map((key) => [key, ""])
  );
  return {
    ...Object.fromEntries(
      Object.entries(process.env).map(([key, value]) => [
        key,
        /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|HOMEDRIVE|HOMEPATH|HOME|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES(?:\(X86\))?|COMMONPROGRAMFILES(?:\(X86\))?|SYSTEMDRIVE|OS|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS|LANG|LC_.+|TERM|COLORTERM|FORCE_COLOR|CI|HTTP_PROXY|HTTPS_PROXY|NO_PROXY|ALL_PROXY|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS|PLAYWRIGHT_BROWSERS_PATH)$/i.test(
          key
        )
          ? value
          : "",
      ])
    ),
    ...empty,
    ...config,
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: `postgresql://linkwarden_dev:${encodeURIComponent(
      config.DEV_POSTGRES_PASSWORD
    )}@127.0.0.1:${db}/linkwarden_dev`,
    NEXTAUTH_URL: `http://localhost:${web}/api/v1/auth`,
    NEXT_PUBLIC_CREDENTIALS_ENABLED: "true",
    NEXT_PUBLIC_EMAIL_PROVIDER: "false",
    NEXT_BUILD_DIR: ".next/local-development",
    STORAGE_FOLDER: ".local/dev/archives",
    DISABLE_BROWSER: config.DEV_ENABLE_BROWSER === "true" ? "false" : "true",
    DEV_SKIP_PRESERVATION:
      config.DEV_ENABLE_BROWSER === "true" ? "false" : "true",
    COREPACK_HOME: path.join(ROOT, ".local", "corepack"),
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  };
}

function compose(config, args, options = {}) {
  return run("docker", [...COMPOSE, ...args], {
    env: { ...process.env, ...config },
    ...options,
  });
}

function available(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

function readState() {
  try {
    const value = JSON.parse(fs.readFileSync(STATE, "utf8"));
    if (
      value.root !== ROOT ||
      !Number.isInteger(value.controlPort) ||
      typeof value.token !== "string"
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

async function requestSession(state, route, method = "GET") {
  if (!state) return null;
  try {
    const response = await fetch(
      `http://127.0.0.1:${state.controlPort}/${route}`,
      {
        method,
        headers: { Authorization: `Bearer ${state.token}` },
        signal: AbortSignal.timeout(3000),
      }
    );
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function install() {
  const env = {
    ...process.env,
    COREPACK_HOME: path.join(ROOT, ".local", "corepack"),
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
  };
  const corepack = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "corepack",
    "dist",
    "corepack.js"
  );
  say("安装项目依赖（使用 package.json 指定的 Yarn 版本）……");
  if (fs.existsSync(corepack))
    await run(process.execPath, [corepack, "yarn", "install", "--immutable"], {
      env,
      timeout: 900_000,
    });
  else if (process.platform === "win32")
    await run(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", "corepack yarn install --immutable"],
      { env, timeout: 900_000 }
    );
  else
    await run("corepack", ["yarn", "install", "--immutable"], {
      env,
      timeout: 900_000,
    });
}

async function generate(env) {
  // Generate separately so an identical Windows query-engine DLL can remain loaded by another process.
  const schema = fs.readFileSync(
    path.join(ROOT, "packages/prisma/schema.prisma"),
    "utf8"
  );
  const generatedSchema = schema.replace(
    /generator client\s*\{[\s\S]*?\}/,
    (block) => block.replace(/\}$/, '  output = "./prisma-client"\n}')
  );
  const schemaPath = path.join(LOCAL, "schema.prisma");
  fs.writeFileSync(schemaPath, generatedSchema);
  await run(
    process.execPath,
    [
      require.resolve("prisma/build/index.js"),
      "generate",
      "--schema",
      schemaPath,
    ],
    { env, cwd: LOCAL }
  );
  const source = path.join(LOCAL, "prisma-client");
  const target = path.join(ROOT, "node_modules", ".prisma", "client");
  fs.mkdirSync(target, { recursive: true });
  const engineFiles = fs
    .readdirSync(source)
    .filter((name) => /^(query_engine|libquery_engine)/.test(name));
  for (const name of engineFiles) {
    const from = path.join(source, name),
      to = path.join(target, name);
    const hash = (file) =>
      crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if (!fs.existsSync(to) || hash(from) !== hash(to)) {
      try {
        fs.copyFileSync(from, to);
      } catch {
        throw new Error(
          "Prisma 引擎正在被其他进程使用。请停止其他本项目的开发服务后重试。"
        );
      }
    }
  }
  for (const name of fs.readdirSync(source))
    if (!engineFiles.includes(name))
      fs.cpSync(path.join(source, name), path.join(target, name), {
        recursive: true,
      });
}

function launch(name, args, cwd, env) {
  if (stopping) throw new Error("开发服务正在停止。");
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    windowsHide: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  const log = (chunk) => {
    const text = `[${name}] ${chunk}`;
    process.stdout.write(text);
    fs.appendFileSync(LOG, text);
  };
  child.stdout.on("data", log);
  child.stderr.on("data", log);
  child.on("error", (error) => {
    say(`${name} 启动失败：${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping) {
      say(`${name} 已退出（${code}），停止其余开发服务。`);
      shutdown(code || 1);
    }
  });
}

async function shutdown(code = 0) {
  if (stopping) return stopping;
  stopping = (async () => {
    say("正在停止本工具启动的 Web、Worker 和开发数据库……");
    await Promise.all(Array.from(children, killTree));
    // Use a separate subprocess: run() intentionally refuses new work while shutting down.
    await new Promise((resolve) => {
      const child = spawn("docker", [...COMPOSE, "stop"], {
        cwd: ROOT,
        env: { ...process.env, ...getConfig() },
        windowsHide: true,
        stdio: "ignore",
      });
      child.on("exit", resolve);
      child.on("error", resolve);
    });
    if (readState()?.token === session?.token && fs.existsSync(STATE))
      fs.unlinkSync(STATE);
    control?.close();
    say("开发服务已停止。数据库卷和附件数据已保留。");
    process.exit(code);
  })();
  return stopping;
}

async function start() {
  if (await requestSession(readState(), "status")) {
    say("开发环境已经运行。使用 dev.cmd status 查看地址。 ");
    return;
  }
  const config = getConfig(true),
    env = appEnv(config),
    { web, db } = ports(config);
  await run("docker", ["info", "--format", "{{.ServerVersion}}"], {
    quiet: true,
    timeout: 15_000,
  });
  if (!(await available(web)))
    throw new Error(
      `Web 端口 ${web} 已被占用。请修改 .env.development.local 中的 DEV_WEB_PORT。`
    );
  const ownDatabase = await compose(
    config,
    ["ps", "--status", "running", "--quiet", "postgres"],
    { quiet: true }
  );
  if (!ownDatabase && !(await available(db)))
    throw new Error(`数据库端口 ${db} 已被其他服务占用，请修改 DEV_DB_PORT。`);
  session = {
    root: ROOT,
    pid: process.pid,
    token: crypto.randomBytes(32).toString("hex"),
    webPort: web,
    controlPort: 0,
    startedAt: new Date().toISOString(),
  };
  control = http.createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${session.token}`) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === "GET" && req.url === "/status") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ running: true, webPort: web }));
      return;
    }
    if (req.method === "POST" && req.url === "/stop") {
      res.setHeader("Content-Type", "application/json");
      res.end('{"stopping":true}');
      void shutdown();
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    control.once("error", reject);
    control.listen(0, "127.0.0.1", resolve);
  });
  session.controlPort = control.address().port;
  // A stale state file is replaced, never used to kill a PID that may have been reused.
  if (fs.existsSync(STATE)) {
    if (await requestSession(readState(), "status")) {
      control.close();
      control = null;
      say("开发环境已经运行。使用 dev.cmd status 查看地址。");
      return;
    }
    fs.unlinkSync(STATE);
  }
  try {
    fs.writeFileSync(STATE, JSON.stringify(session), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    control.close();
    control = null;
    if (error.code === "EEXIST") {
      say("另一个开发启动器正在启动，请运行 dev.cmd status 查看状态。");
      return;
    }
    throw error;
  }
  logging = true;
  fs.appendFileSync(
    LOG,
    `\n=== Development session ${session.startedAt} ===\n`
  );
  process.on("SIGINT", () => shutdown());
  process.on("SIGTERM", () => shutdown());
  try {
    say(`开发环境：${PROJECT}，Web ${web}，PostgreSQL ${db}`);
    await compose(
      config,
      ["up", "--detach", "--wait", "--wait-timeout", "90"],
      { timeout: 300_000 }
    );
    await generate(env);
    await run(
      process.execPath,
      [
        require.resolve("prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        path.join(ROOT, "packages/prisma/schema.prisma"),
      ],
      { env, cwd: LOCAL, quiet: true }
    );
    say("数据库迁移完成，启动 Web 和 Worker……");
    launch(
      "web",
      [
        require.resolve("next/dist/bin/next"),
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(web),
      ],
      path.join(ROOT, "apps/web"),
      env
    );
    launch(
      "worker",
      [require.resolve("tsx/cli"), "watch", "worker.ts"],
      path.join(ROOT, "apps/worker"),
      env
    );
    say(`\n打开 http://localhost:${web} （首次访问会编译页面）。`);
    say("首次使用请注册账号；独立开发库的第一个用户默认是系统管理员。");
    say(
      `浏览器归档：${
        config.DEV_ENABLE_BROWSER === "true"
          ? "已启用"
          : "已关闭；需要时运行 dev.cmd browser，再设置 DEV_ENABLE_BROWSER=true"
      }`
    );
    say("保持此窗口运行。Ctrl+C 或另开窗口执行 dev.cmd stop 可停止服务。");
  } catch (error) {
    say(error.message);
    await shutdown(1);
  }
}

async function main() {
  const command = process.argv[2] || "start";
  if (["help", "--help", "-h"].includes(command)) {
    say(
      "用法：dev.cmd [start|stop|status|logs|doctor|install|browser]\nstart 启动（默认）  stop 停止并保留数据  status 状态\nlogs 最近日志  doctor 环境检查  install 安装依赖  browser 安装归档浏览器"
    );
    return;
  }
  if (Number(process.versions.node.split(".")[0]) < 20)
    throw new Error("需要 Node.js 20 或更新版本，建议使用 Node.js 22。");
  fs.mkdirSync(LOCAL, { recursive: true });
  if (command === "install") return install();
  if (command === "logs") {
    if (!fs.existsSync(LOG)) return say("暂无日志，先运行 dev.cmd。");
    const data = fs.readFileSync(LOG, "utf8");
    return say(data.slice(-20_000));
  }
  if (!fs.existsSync(path.join(ROOT, "node_modules/dotenv/package.json"))) {
    if (command !== "start")
      throw new Error("依赖尚未安装，请运行 dev.cmd install。");
    await install();
  }
  if (command === "start") return start();
  if (command === "browser")
    return run(
      process.execPath,
      [
        path.join(
          path.dirname(require.resolve("playwright/package.json")),
          "cli.js"
        ),
        "install",
        "chromium",
      ],
      {
        env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "0" },
        timeout: 600_000,
      }
    );
  if (command === "stop") {
    const state = readState();
    if (await requestSession(state, "stop", "POST")) {
      for (let i = 0; i < 60; i++) {
        if (!fs.existsSync(STATE)) return say("开发服务已停止，数据已保留。");
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error("停止尚未完成，请查看 dev.cmd logs。");
    }
    if (fs.existsSync(CONFIG)) await compose(getConfig(), ["stop"]);
    if (state && fs.existsSync(STATE)) fs.unlinkSync(STATE);
    return say("开发数据库已停止；没有运行中的开发启动器。数据已保留。");
  }
  if (command === "status") {
    const status = await requestSession(readState(), "status");
    say(
      status
        ? `开发服务运行中：http://localhost:${status.webPort}`
        : "开发启动器未运行。"
    );
    if (fs.existsSync(CONFIG)) await compose(getConfig(), ["ps"]);
    return;
  }
  if (command === "doctor") {
    say(
      `Node.js ${process.versions.node}\n项目：${ROOT}\n配置：${
        fs.existsSync(CONFIG) ? CONFIG : "首次启动时自动创建"
      }`
    );
    await run(
      "docker",
      ["version", "--format", "Docker Engine {{.Server.Version}}"],
      { timeout: 15_000 }
    );
    await run("docker", ["compose", "version"], { timeout: 15_000 });
    const { web, db } = ports(getConfig());
    say(
      `Web 端口 ${web}：${
        (await available(web)) ? "空闲" : "使用中"
      }\n数据库端口 ${db}：${(await available(db)) ? "空闲" : "使用中"}`
    );
    say(
      "环境检查完成。启动器只连接独立开发数据库，Web 和 Worker 使用专用开发配置。"
    );
    return;
  }
  throw new Error(`未知命令：${command}。运行 dev.cmd help 查看用法。`);
}

module.exports = { ports, appEnv, getConfig };
if (require.main === module)
  main().catch((error) => {
    console.error(
      `\n启动工具：${error.message}\n请确认已启动 Docker Desktop；详细用法见 docs/development.md。`
    );
    process.exitCode = 1;
  });
