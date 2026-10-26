import type { InstanceAnnouncement } from "@linkwarden/types/config";

export function getAnnouncement(): InstanceAnnouncement | null {
  if (process.env.ANNOUNCEMENT_ENABLED === "false") return null;

  const message =
    process.env.ANNOUNCEMENT_MESSAGE ?? "查看 {link} 了解新功能。";
  if (!message.trim()) return null;

  const configuredUrl =
    process.env.ANNOUNCEMENT_LINK_URL ??
    "https://linkwarden.app/blog/releases/2.16";
  let linkUrl: string | null = null;
  try {
    const url = new URL(configuredUrl);
    if (url.protocol === "https:" || url.protocol === "http:") {
      linkUrl = url.href;
    }
  } catch {
    // An empty or invalid URL produces a plain-text announcement.
  }

  return {
    id: process.env.ANNOUNCEMENT_ID || "2.16",
    message,
    linkText: process.env.ANNOUNCEMENT_LINK_TEXT ?? "Linkwarden 2.16",
    linkUrl,
  };
}
