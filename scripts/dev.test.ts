import { afterEach, describe, expect, it, vi } from "vitest";
const { ports, appEnv } = require("./dev.cjs");

afterEach(() => vi.unstubAllEnvs());

describe("development launcher isolation", () => {
  it("rejects invalid ports and overlapping database and web ports", () => {
    for (const config of [
      { DEV_WEB_PORT: "3300", DEV_DB_PORT: "3300" },
      { DEV_WEB_PORT: "3300;echo bad" },
      { DEV_DB_PORT: "99999" },
    ])
      expect(() => ports(config)).toThrow();
  });

  it("uses its own local database even when production settings exist", () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://prod:secret@production/production"
    );
    vi.stubEnv("STRIPE_SECRET_KEY", "production-billing-key");
    vi.stubEnv("SPACES_KEY", "production-storage-key");
    vi.stubEnv("EMAIL_SERVER", "smtp://production");
    const env = appEnv({
      DEV_POSTGRES_PASSWORD: "test:@/# password",
      NEXTAUTH_SECRET: "development-only",
      DEV_WEB_PORT: "3300",
      DEV_DB_PORT: "55433",
      DATABASE_URL: "postgresql://other:secret@remote/remote",
      NEXT_BUILD_DIR: ".next",
      STORAGE_FOLDER: "production-files",
      DEFAULT_LANGUAGE: "zh-TW",
      NEW_USER_DEFAULT_LANGUAGE: "zh",
      ANNOUNCEMENT_MESSAGE: "A custom development announcement",
    });
    const url = new URL(env.DATABASE_URL);
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.port).toBe("55433");
    expect(url.pathname).toBe("/linkwarden_dev");
    expect(decodeURIComponent(url.password)).toBe("test:@/# password");
    expect(env.STRIPE_SECRET_KEY).toBe("");
    expect(env.SPACES_KEY).toBe("");
    expect(env.EMAIL_SERVER).toBe("");
    expect(env.STORAGE_FOLDER).toBe(".local/dev/archives");
    expect(env.NEXT_BUILD_DIR).toBe(".next/local-development");
    expect(env.DEV_SKIP_PRESERVATION).toBe("true");
    expect(env.DEFAULT_LANGUAGE).toBe("zh-TW");
    expect(env.NEW_USER_DEFAULT_LANGUAGE).toBe("zh");
    expect(env.ANNOUNCEMENT_MESSAGE).toBe("A custom development announcement");
  });
});
