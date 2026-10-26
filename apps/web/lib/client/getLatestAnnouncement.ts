import type { Config } from "@linkwarden/router/config";
import type { InstanceAnnouncement } from "@linkwarden/types/config";

export type LatestAnnouncement = InstanceAnnouncement;

export default async function getLatestAnnouncement(): Promise<LatestAnnouncement | null> {
  try {
    const response = await fetch("/api/v1/config");

    if (!response.ok) return null;

    const data = (await response.json()) as { response: Config };

    return data.response?.ANNOUNCEMENT ?? null;
  } catch (err) {
    return null;
  }
}
