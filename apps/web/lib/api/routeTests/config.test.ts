import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEnvData } from "@/pages/api/v1/config/index";

describe("getEnvData", () => {
  beforeEach(() => {
    for (const key of [
      "DEFAULT_LANGUAGE",
      "NEW_USER_DEFAULT_LANGUAGE",
      "ANNOUNCEMENT_ENABLED",
      "ANNOUNCEMENT_ID",
      "ANNOUNCEMENT_MESSAGE",
      "ANNOUNCEMENT_LINK_TEXT",
      "ANNOUNCEMENT_LINK_URL",
    ])
      vi.stubEnv(key, undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to Chinese and a locally configured release announcement", () => {
    expect(getEnvData()).toMatchObject({
      DEFAULT_LANGUAGE: "zh",
      NEW_USER_DEFAULT_LANGUAGE: "zh",
      ANNOUNCEMENT: {
        id: "2.16",
        message: "查看 {link} 了解新功能。",
        linkText: "Linkwarden 2.16",
        linkUrl: "https://linkwarden.app/blog/releases/2.16",
      },
    });
  });

  it("returns custom language and announcement settings", () => {
    vi.stubEnv("DEFAULT_LANGUAGE", "en");
    vi.stubEnv("NEW_USER_DEFAULT_LANGUAGE", "zh");
    vi.stubEnv("ANNOUNCEMENT_ID", "welcome-2");
    vi.stubEnv("ANNOUNCEMENT_MESSAGE", "欢迎加入，查看 {link}。");
    vi.stubEnv("ANNOUNCEMENT_LINK_TEXT", "使用说明");
    vi.stubEnv("ANNOUNCEMENT_LINK_URL", "https://example.com/help");
    expect(getEnvData()).toMatchObject({
      DEFAULT_LANGUAGE: "en",
      NEW_USER_DEFAULT_LANGUAGE: "zh",
      ANNOUNCEMENT: {
        id: "welcome-2",
        message: "欢迎加入，查看 {link}。",
        linkText: "使用说明",
        linkUrl: "https://example.com/help",
      },
    });
  });

  it("allows disabling the announcement or clearing its message", () => {
    vi.stubEnv("ANNOUNCEMENT_ENABLED", "false");
    expect(getEnvData().ANNOUNCEMENT).toBeNull();
    vi.stubEnv("ANNOUNCEMENT_ENABLED", "true");
    vi.stubEnv("ANNOUNCEMENT_MESSAGE", "");
    expect(getEnvData().ANNOUNCEMENT).toBeNull();
  });

  it.each(["", "javascript:alert(1)", "data:text/html,test"])(
    "renders an unsafe or empty link as plain text (%s)",
    (url) => {
      vi.stubEnv("ANNOUNCEMENT_LINK_URL", url);
      expect(getEnvData().ANNOUNCEMENT?.linkUrl).toBeNull();
    }
  );

  it("returns the raw user content domain when configured", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_USER_CONTENT_DOMAIN",
      "https://content.example.com/view/"
    );

    expect(getEnvData().USER_CONTENT_DOMAIN).toBe(
      "https://content.example.com/view/"
    );
  });

  it("returns null when the user content domain is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_USER_CONTENT_DOMAIN", "");

    expect(getEnvData().USER_CONTENT_DOMAIN).toBeNull();
  });

  it("returns subscription config from the environment", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("NEXT_PUBLIC_TRIAL_PERIOD_DAYS", "30");
    vi.stubEnv("NEXT_PUBLIC_REQUIRE_CC", "true");

    expect(getEnvData()).toMatchObject({
      STRIPE_ENABLED: true,
      TRIAL_PERIOD_DAYS: 30,
      REQUIRE_CC: true,
    });
  });

  it("supports custom branding and falls back to the upstream version", () => {
    vi.stubEnv("SITE_TITLE", "企业知识库");
    vi.stubEnv("INSTANCE_VERSION", "enterprise-1.0");
    vi.stubEnv("version", "v2.16.3");
    expect(getEnvData()).toMatchObject({
      SITE_TITLE: "企业知识库",
      INSTANCE_VERSION: "enterprise-1.0",
    });
    vi.stubEnv("INSTANCE_VERSION", "");
    expect(getEnvData().INSTANCE_VERSION).toBe("v2.16.3");
  });
});
