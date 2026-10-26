import { ReactElement, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "next-i18next";
import toast from "react-hot-toast";
import AdminLayout from "@/layouts/AdminLayout";
import { NextPageWithLayout } from "../_app";
import getServerSideProps from "@/lib/client/getServerSideProps";
import enterpriseRequest from "@/lib/client/enterpriseRequest";
import { useUser } from "@linkwarden/router/user";
import { useConfig } from "@linkwarden/router/config";
import {
  useCollections,
  useCreateCollection,
} from "@linkwarden/router/collections";
import CollectionPermissions from "@/components/CollectionPermissions";
import { Button } from "@/components/ui/button";

type Group = {
  id: number;
  name: string;
  description: string;
  isDefault: boolean;
  members: { userId: number }[];
};
type UserOption = { id: number; username: string; name?: string };
const emptyGroup = { name: "", description: "", isDefault: false };

const Page: NextPageWithLayout = () => {
  const { t } = useTranslation();
  const { data: user } = useUser();
  const { data: config } = useConfig();
  const isAdmin = !!user && !!config && user.id === (config.ADMIN || 1);
  const client = useQueryClient();
  const { data: groups = [], error } = useQuery({
    queryKey: ["enterprise-groups"],
    refetchInterval: 2000,
    refetchOnReconnect: "always",
    enabled: isAdmin,
    queryFn: () => enterpriseRequest<Group[]>("/api/v1/user-groups"),
  });
  const { data: users = [] } = useQuery({
    queryKey: ["enterprise-users"],
    refetchInterval: 2000,
    refetchOnReconnect: "always",
    enabled: isAdmin,
    queryFn: () => enterpriseRequest<UserOption[]>("/api/v1/users"),
  });
  const { data: collections = [] } = useCollections();
  const [tab, setTab] = useState("groups");
  const [selectedId, setSelectedId] = useState<number>();
  const selected = groups.find((g) => g.id === selectedId);
  const [form, setForm] = useState(emptyGroup);
  const [checked, setChecked] = useState<number[]>([]);
  const [filter, setFilter] = useState("");
  const [collectionId, setCollectionId] = useState(0);
  const [collectionName, setCollectionName] = useState("");
  const activeCollection = collections.find((c) => c.id === collectionId);
  const createCollection = useCreateCollection();
  const mutation = useMutation({
    mutationFn: ({
      method,
      id,
      body,
    }: {
      method: string;
      id?: number;
      body?: unknown;
    }) =>
      enterpriseRequest(
        `/api/v1/user-groups${id ? `/${id}` : ""}`,
        method,
        body
      ),
    onSuccess: async () => {
      await Promise.all(
        [
          "enterprise-groups",
          "group-catalog",
          "collections",
          "links",
          "dashboardData",
        ].map((key) => client.invalidateQueries({ queryKey: [key] }))
      );
      setChecked([]);
      toast.success(t("updated"));
    },
    onError: (err: Error) => toast.error(err.message),
  });
  if (!isAdmin)
    return <p>{t(user && config ? "enterprise_admin_required" : "loading")}</p>;
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-thin">{t("enterprise_management")}</h1>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={tab === "groups" ? "primary" : "default"}
          onClick={() => setTab("groups")}
        >
          {t("enterprise_groups")}
        </Button>
        <Button
          variant={tab === "collections" ? "primary" : "default"}
          onClick={() => setTab("collections")}
        >
          {t("enterprise_collections")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-error">
          {error.message}
        </p>
      )}
      {tab === "groups" ? (
        <div className="grid lg:grid-cols-[16rem_1fr] gap-5">
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => {
                setSelectedId(undefined);
                setForm(emptyGroup);
                setChecked([]);
              }}
            >
              {t("enterprise_new_group")}
            </Button>
            {groups.map((group) => (
              <button
                key={group.id}
                className={`w-full p-3 text-left rounded-lg border border-neutral-content ${
                  selectedId === group.id ? "bg-primary/20" : "bg-base-200"
                }`}
                onClick={() => {
                  setSelectedId(group.id);
                  setForm({
                    name: group.name,
                    description: group.description,
                    isDefault: group.isDefault,
                  });
                  setChecked([]);
                }}
              >
                <span className="font-semibold break-words">{group.name}</span>
                <span className="ml-2 text-neutral">
                  ({group.members.length})
                </span>
                {group.isDefault && (
                  <span className="block text-xs text-primary">
                    {t("enterprise_default_group")}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="space-y-5 min-w-0">
            <form
              className="space-y-3 rounded-xl border border-neutral-content p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const result = (await mutation.mutateAsync({
                    method: selectedId ? "PUT" : "POST",
                    id: selectedId,
                    body: form,
                  })) as Group;
                  setSelectedId(result.id);
                } catch {}
              }}
            >
              <label className="block">
                {t("name")}
                <input
                  required
                  maxLength={100}
                  className="input input-bordered bg-base-200 w-full mt-1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="block">
                {t("description")}
                <textarea
                  maxLength={2048}
                  className="textarea textarea-bordered bg-base-200 w-full mt-1"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <label className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary"
                  checked={form.isDefault}
                  onChange={(e) =>
                    setForm({ ...form, isDefault: e.target.checked })
                  }
                />
                {t("enterprise_default_group")}
              </label>
              <p className="text-sm text-neutral">
                {t("enterprise_default_hint")}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  type="submit"
                  disabled={mutation.isPending}
                >
                  {t("save_changes")}
                </Button>
                {selectedId && (
                  <Button
                    variant="destructive"
                    type="button"
                    disabled={mutation.isPending}
                    onClick={async () => {
                      if (!window.confirm(t("enterprise_delete_group_confirm")))
                        return;
                      try {
                        await mutation.mutateAsync({
                          method: "DELETE",
                          id: selectedId,
                        });
                        setSelectedId(undefined);
                        setForm(emptyGroup);
                      } catch {}
                    }}
                  >
                    {t("delete")}
                  </Button>
                )}
              </div>
            </form>
            {selected && (
              <section className="space-y-3 rounded-xl border border-neutral-content p-4">
                <h2 className="text-xl">
                  {t("enterprise_members")}: {selected.name}
                </h2>
                <input
                  aria-label={t("search_users")}
                  placeholder={t("search_users")}
                  className="input input-bordered bg-base-200 w-full"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <div className="max-h-80 overflow-auto space-y-2">
                  {users
                    .filter((u) =>
                      `${u.username} ${u.name ?? ""}`
                        .toLowerCase()
                        .includes(filter.toLowerCase())
                    )
                    .map((u) => (
                      <label
                        key={u.id}
                        className="flex gap-2 items-start p-2 rounded hover:bg-base-200"
                      >
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={checked.includes(u.id)}
                          onChange={(e) =>
                            setChecked(
                              e.target.checked
                                ? [...checked, u.id]
                                : checked.filter((id) => id !== u.id)
                            )
                          }
                        />
                        <span>
                          @{u.username}
                          <span className="block text-xs text-neutral">
                            {groups
                              .filter((g) =>
                                g.members.some((m) => m.userId === u.id)
                              )
                              .map((g) => g.name)
                              .join(" · ") || t("enterprise_no_groups")}
                          </span>
                        </span>
                        {selected.members.some((m) => m.userId === u.id) && (
                          <span className="ml-auto text-xs text-primary">
                            {t("enterprise_is_member")}
                          </span>
                        )}
                      </label>
                    ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    disabled={!checked.length || mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        method: "PATCH",
                        id: selected.id,
                        body: { add: checked },
                      })
                    }
                  >
                    {t("enterprise_add_members")} ({checked.length})
                  </Button>
                  <Button
                    disabled={!checked.length || mutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(t("enterprise_remove_members_confirm"))
                      )
                        mutation.mutate({
                          method: "PATCH",
                          id: selected.id,
                          body: { remove: checked },
                        });
                    }}
                  >
                    {t("enterprise_remove_members")}
                  </Button>
                </div>
              </section>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5 max-w-3xl">
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const created = await createCollection.mutateAsync({
                  name: collectionName,
                });
                setCollectionId(created.id);
                setCollectionName("");
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <input
              className="input input-bordered bg-base-200 w-full"
              placeholder={t("collection_name_placeholder")}
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              required
            />
            <Button type="submit" disabled={createCollection.isPending}>
              {t("new_collection")}
            </Button>
          </form>
          <label className="block">
            {t("enterprise_select_collection")}
            <select
              className="select select-bordered bg-base-200 w-full mt-2"
              value={collectionId}
              onChange={(e) => setCollectionId(Number(e.target.value))}
            >
              <option value={0}>{t("enterprise_select_collection")}</option>
              {collections
                .filter((c) => c.effectivePermission?.canManage)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          {activeCollection && (
            <CollectionPermissions
              key={activeCollection.id}
              collection={activeCollection}
            />
          )}
        </div>
      )}
    </div>
  );
};
Page.getLayout = (page: ReactElement<any>) => <AdminLayout>{page}</AdminLayout>;
export default Page;
export { getServerSideProps };
