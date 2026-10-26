import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GetServerSidePropsContext } from "next";
import { getPageTranslations } from "./getServerSideProps";
import { getDefaultLocale, getNewUserLocale } from "@/lib/shared/language";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  findUser: vi.fn(),
  translations: vi.fn(async (locale: string) => ({ locale })),
}));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.getToken }));
vi.mock("@linkwarden/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUser } },
}));
vi.mock("next-i18next/serverSideTranslations", () => ({
  serverSideTranslations: mocks.translations,
}));

const context = (locale?: string) =>
  ({
    req: { headers: { "accept-language": "en-US,en;q=0.9" } },
    locale,
  }) as GetServerSidePropsContext;

describe("configured languages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue(null);
    vi.stubEnv("DEFAULT_LANGUAGE", "");
    vi.stubEnv("NEW_USER_DEFAULT_LANGUAGE", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("defaults visitors and new users to Chinese regardless of browser language", async () => {
    expect(getDefaultLocale()).toBe("zh");
    expect(getNewUserLocale()).toBe("zh");
    expect(await getPageTranslations(context())).toEqual({ locale: "zh" });
  });

  it("supports separate site and new-user languages and validates them", () => {
    vi.stubEnv("DEFAULT_LANGUAGE", "fr");
    expect(getNewUserLocale()).toBe("fr");
    vi.stubEnv("NEW_USER_DEFAULT_LANGUAGE", "zh-TW");
    expect(getNewUserLocale()).toBe("zh-TW");
    vi.stubEnv("NEW_USER_DEFAULT_LANGUAGE", "invalid");
    expect(getNewUserLocale()).toBe("fr");
    vi.stubEnv("DEFAULT_LANGUAGE", "invalid");
    expect(getDefaultLocale()).toBe("zh");
  });

  it("preserves an explicit locale URL for visitors", async () => {
    expect(await getPageTranslations(context("ja"))).toEqual({ locale: "ja" });
  });

  it("preserves the language of an existing user", async () => {
    mocks.getToken.mockResolvedValue({ id: 1 });
    mocks.findUser.mockResolvedValue({ locale: "en" });
    expect(await getPageTranslations(context("zh"))).toEqual({ locale: "en" });
  });
});
