// Uses only the disposable local database described in docs/enterprise.md.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const url =
  process.env.ENTERPRISE_TEST_DATABASE_URL ||
  "postgresql://enterprise_test:enterprise_test@127.0.0.1:55432/enterprise_test";
const parsed = new URL(url);
if (
  parsed.hostname !== "127.0.0.1" ||
  parsed.port !== "55432" ||
  parsed.pathname !== "/enterprise_test"
) {
  throw new Error(
    "Use the isolated enterprise_test database at 127.0.0.1:55432."
  );
}
const env = {
  ...process.env,
  DATABASE_URL: url,
  ENTERPRISE_TEST_DATABASE_URL: parsed.href,
  MEILI_MASTER_KEY: "",
  STRIPE_SECRET_KEY: "",
  // Existing filesystem helpers resolve storage from cwd/../.. .
  STORAGE_FOLDER: path.relative(
    path.resolve(process.cwd(), "../.."),
    path.resolve(".local/enterprise-test-archives")
  ),
};
function run(args) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run([
  "node_modules/prisma/build/index.js",
  "migrate",
  "deploy",
  "--schema",
  "packages/prisma/schema.prisma",
]);
run([
  "node_modules/vitest/vitest.mjs",
  "run",
  "--hookTimeout",
  "60000",
  "--maxWorkers",
  "2",
  ...process.argv.slice(2),
]);
