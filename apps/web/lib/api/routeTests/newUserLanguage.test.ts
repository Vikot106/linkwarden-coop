import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";
import postUser from "@/lib/api/controllers/users/postUser";
import googleAuth from "@/pages/api/v1/auth/mobile/google";
import appleAuth from "@/pages/api/v1/auth/mobile/apple";
import webAuth from "@/pages/api/v1/auth/[...nextauth]";

const mocks = vi.hoisted(() => ({
  create: vi.fn(async ({ data }: any) => ({ id: 7, ...data })),
  findFirst: vi.fn(async () => null),
  findUnique: vi.fn(async () => null),
}));
vi.mock("@linkwarden/prisma", () => ({
  prisma: {
    user: mocks,
    account: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/api/collectionAccess", () => ({
  defaultGroupMemberships: async () => undefined,
}));
vi.mock("@/lib/api/isAuthenticatedRequest", () => ({
  default: async () => null,
}));
vi.mock("@/lib/api/controllers/session/createSession", () => ({
  default: async () => ({ status: 200, response: "session" }),
}));
vi.mock("@/lib/api/google", () => ({
  verifyGoogleIdentityToken: async () => ({ sub: "google-id" }),
}));
vi.mock("@/lib/api/apple", () => ({
  verifyAppleIdentityToken: async () => ({ sub: "apple-id" }),
  parseAppleSignupName: () => undefined,
}));
vi.mock("@/lib/api/authProviders", () => ({
  authProviders: [],
  isAuthProviderEnabled: () => false,
}));
vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: () => ({ linkAccount: vi.fn() }),
}));
vi.mock("next-auth/next", () => ({
  default: async (_req: unknown, _res: unknown, options: any) => {
    // Exercise the adapter used by email and browser SSO registrations.
    await options.adapter.createUser({ email: "new@example.com" });
  },
}));

describe("new account language", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEFAULT_LANGUAGE", "zh");
    vi.stubEnv("NEW_USER_DEFAULT_LANGUAGE", "zh-TW");
    vi.stubEnv("NEXT_PUBLIC_DISABLE_REGISTRATION", "false");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_APPLE_ENABLED", "true");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["password", postUser],
    ["Google mobile", googleAuth],
    ["Apple mobile", appleAuth],
    ["email/browser SSO", webAuth],
  ])(
    "saves the configured language during %s registration",
    async (_, handler) => {
      const req = {
        method: "POST",
        query: {},
        body: {
          username: "test-user",
          name: "Test user",
          email: "new@example.com",
          password: "test-password",
          identityToken: "test-identity-token",
        },
      } as NextApiRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      } as unknown as NextApiResponse;
      await handler(req, res);
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ locale: "zh-TW" }),
        })
      );
    }
  );
});
