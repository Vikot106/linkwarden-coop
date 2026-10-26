// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import type { LinkIncludingShortenedCollectionAndTags } from "@linkwarden/types/global";
import LinkDetails from "./LinkDetails";

const update = vi.hoisted(() => vi.fn());
vi.mock("next-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/collections/7" }),
}));
vi.mock("next/link", () => ({
  default: ({ children }: any) => <a>{children}</a>,
}));
vi.mock("@/hooks/usePermissions", () => ({ default: () => true }));
vi.mock("@linkwarden/router/user", () => ({
  useUser: () => ({ data: { id: 1, username: "owner" } }),
}));
vi.mock("@linkwarden/router/links", () => ({
  useUpdateLink: () => ({ mutateAsync: update }),
  useUpdateFile: () => ({}),
}));
vi.mock("./InputSelect/CollectionSelection", () => ({ default: () => null }));
vi.mock("./InputSelect/TagSelection", () => ({ default: () => null }));
vi.mock("./IconPopover", () => ({ default: () => null }));
vi.mock("./Icon", () => ({ default: () => null }));
vi.mock("./PreserverdFormatRow", () => ({ default: () => null }));
vi.mock("./LinkViews/LinkComponents/LinkIcon", () => ({ default: () => null }));
vi.mock("./ui/tooltip", () => ({
  TooltipProvider: ({ children }: any) => children,
  Tooltip: ({ children }: any) => children,
  TooltipTrigger: ({ children }: any) => children,
  TooltipContent: () => null,
}));

const original = {
  id: 10,
  version: 0,
  name: "Original",
  url: "https://example.com",
  description: "Original description",
  type: "url",
  tags: [],
  collection: { id: 7, ownerId: 1 },
  preview: "unavailable",
  image: "unavailable",
  monolith: "unavailable",
  pdf: "unavailable",
  readable: "unavailable",
  createdAt: "2026-10-26T00:00:00.000Z",
} as unknown as LinkIncludingShortenedCollectionAndTags;

describe("shared link editing during polling", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it("keeps the user's draft and original version when another editor updates the link and saving conflicts", async () => {
    const setMode = vi.fn();
    await act(async () => {
      root.render(
        <LinkDetails activeLink={original} mode="edit" setMode={setMode} />
      );
    });
    const nameInput = () =>
      Array.from(container.querySelectorAll("input")).find(
        (input) => input.value === "Original" || input.value === "My draft"
      )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(nameInput(), "My draft");
      nameInput().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      root.render(
        <LinkDetails
          activeLink={{ ...original, name: "Another editor", version: 1 }}
          mode="edit"
          setMode={setMode}
        />
      )
    );
    expect(nameInput().value).toBe("My draft");
    update.mockRejectedValueOnce(new Error("Conflict"));
    const save = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "save_changes"
    )!;
    await act(async () => save.click());
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My draft", version: 0 })
    );
    expect(nameInput().value).toBe("My draft");
    expect(setMode).not.toHaveBeenCalled();
  });
});
