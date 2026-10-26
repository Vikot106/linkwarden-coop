import { useState } from "react";
import { useTranslation } from "next-i18next";
import { useCollections } from "@linkwarden/router/collections";
import { useUser } from "@linkwarden/router/user";
import CollectionListing from "./CollectionListing";

export default function EnterpriseCollections() {
  const { t } = useTranslation();
  const { data: collections = [] } = useCollections();
  const { data: user } = useUser();
  const [search, setSearch] = useState("");
  const visible = new Set<number>();
  for (const collection of collections) {
    if (!collection.name.toLowerCase().includes(search.trim().toLowerCase()))
      continue;
    let current = collection;
    const seen = new Set<number>();
    while (current?.id && !seen.has(current.id)) {
      seen.add(current.id);
      visible.add(current.id);
      current = collections.find((c) => c.id === current.parentId)!;
    }
  }
  const sections = ["personal", "company", "department", "shared"];
  return (
    <div className="space-y-3">
      <input
        aria-label={t("enterprise_search_collections")}
        placeholder={t("enterprise_search_collections")}
        className="input input-bordered input-sm bg-base-200 w-full"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {sections.map((section) => {
        const subset = collections.filter((c) => {
          const scope = c.effectivePermission?.scope ?? c.scope;
          const category =
            scope === "COMPANY"
              ? "company"
              : scope === "DEPARTMENT"
                ? "department"
                : c.ownerId === user?.id
                  ? "personal"
                  : "shared";
          return category === section && visible.has(c.id!);
        });
        if (!subset.length) return null;
        return (
          <details key={section} open className="group/section">
            <summary className="cursor-pointer text-xs text-neutral font-semibold mb-2">
              {t(`enterprise_section_${section}`)}
            </summary>
            <CollectionListing collectionSubset={subset} />
          </details>
        );
      })}
      {!visible.size && (
        <p className="text-xs text-neutral">{t("you_have_no_collections")}</p>
      )}
    </div>
  );
}
