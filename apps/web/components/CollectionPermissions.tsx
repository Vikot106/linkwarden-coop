import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "next-i18next";
import toast from "react-hot-toast";
import enterpriseRequest from "@/lib/client/enterpriseRequest";
import { useUser } from "@linkwarden/router/user";
import { useConfig } from "@linkwarden/router/config";
import { CollectionIncludingMembersAndLinkCount } from "@linkwarden/types/global";
import { Button } from "./ui/button";

type Level = "READ" | "EDIT" | "MANAGE";
type Grants = {
  scope: string;
  groups: { groupId: number; permission: Level; group: { name: string } }[];
  users: {
    userId: number;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    canManage: boolean;
    user: { username: string; name: string };
  }[];
};

export default function CollectionPermissions({
  collection,
}: {
  collection: CollectionIncludingMembersAndLinkCount;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: user } = useUser();
  const { data: config } = useConfig();
  const [target, setTarget] = useState("group");
  const [identifier, setIdentifier] = useState("");
  const [permission, setPermission] = useState<Level>("READ");
  const url = `/api/v1/collections/${collection.id}/permissions`;
  const { data, error } = useQuery({
    queryKey: ["collection-permissions", collection.id],
    queryFn: () => enterpriseRequest<Grants>(url),
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["group-catalog"],
    queryFn: () =>
      enterpriseRequest<{ id: number; name: string }[]>(
        "/api/v1/user-groups/catalog"
      ),
  });
  const mutation = useMutation({
    mutationFn: (body: unknown) => enterpriseRequest(url, "PUT", body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["collection-permissions", collection.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["collections"] }),
        queryClient.invalidateQueries({ queryKey: ["links"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboardData"] }),
      ]);
      toast.success(t("updated"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const save = async () => {
    try {
      const targetId =
        target === "group"
          ? Number(identifier)
          : (
              await enterpriseRequest<{ id: number }>(
                `/api/v1/public/users/${encodeURIComponent(
                  identifier.replace(/^@/, "").trim()
                )}`
              )
            ).id;
      await mutation.mutateAsync({ target, targetId, permission });
      setIdentifier("");
    } catch (error) {
      if (!mutation.isError) toast.error((error as Error).message);
    }
  };
  const roleOptions = ["READ", "EDIT", "MANAGE"].map((level) => (
    <option key={level} value={level}>
      {t(`enterprise_role_${level}`)}
    </option>
  ));
  const controlClass = "select select-bordered bg-base-200 w-full";
  if (error)
    return (
      <p role="alert" className="text-error">
        {error.message}
      </p>
    );
  if (!data) return <p>{t("loading")}</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral">{t("enterprise_inheritance_hint")}</p>
      {!collection.parentId && user?.id === (config?.ADMIN || 1) && (
        <label className="block space-y-2">
          <span>{t("enterprise_scope")}</span>
          <select
            className={controlClass}
            value={data.scope}
            disabled={mutation.isPending}
            onChange={(e) =>
              mutation.mutate({ target: "scope", scope: e.target.value })
            }
          >
            {["PERSONAL", "DEPARTMENT", "COMPANY"].map((scope) => (
              <option key={scope} value={scope}>
                {t(`enterprise_scope_${scope}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        <select
          aria-label={t("enterprise_target")}
          className={controlClass}
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setIdentifier("");
          }}
        >
          <option value="group">{t("enterprise_group")}</option>
          <option value="user">{t("enterprise_user")}</option>
        </select>
        {target === "group" ? (
          <select
            aria-label={t("enterprise_group")}
            className={controlClass}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          >
            <option value="">{t("enterprise_select_group")}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label={t("username")}
            className="input input-bordered bg-base-200 w-full"
            value={identifier}
            placeholder={t("username")}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        )}
        <select
          aria-label={t("enterprise_permission")}
          className={controlClass}
          value={permission}
          onChange={(e) => setPermission(e.target.value as Level)}
        >
          {roleOptions}
        </select>
        <Button
          variant="primary"
          disabled={!identifier || mutation.isPending}
          onClick={save}
        >
          {t("enterprise_grant")}
        </Button>
      </div>
      {data.groups.map((grant) => (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-neutral-content py-2"
          key={`g-${grant.groupId}`}
        >
          <span className="flex-1">{grant.group.name}</span>
          <select
            aria-label={grant.group.name}
            className="select select-bordered select-sm"
            value={grant.permission}
            disabled={mutation.isPending}
            onChange={(e) =>
              mutation.mutate({
                target: "group",
                targetId: grant.groupId,
                permission: e.target.value,
              })
            }
          >
            {roleOptions}
          </select>
          <Button
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => {
              if (window.confirm(t("enterprise_revoke_confirm")))
                mutation.mutate({
                  target: "group",
                  targetId: grant.groupId,
                  permission: null,
                });
            }}
          >
            {t("enterprise_revoke")}
          </Button>
        </div>
      ))}
      {data.users.map((grant) => (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-neutral-content py-2"
          key={`u-${grant.userId}`}
        >
          <span className="flex-1">@{grant.user.username}</span>
          <select
            aria-label={grant.user.username}
            className="select select-bordered select-sm"
            value={
              grant.canManage
                ? "MANAGE"
                : grant.canUpdate && grant.canDelete && grant.canCreate
                  ? "EDIT"
                  : grant.canCreate || grant.canUpdate || grant.canDelete
                    ? "LEGACY"
                    : "READ"
            }
            disabled={mutation.isPending}
            onChange={(e) =>
              mutation.mutate({
                target: "user",
                targetId: grant.userId,
                permission: e.target.value,
              })
            }
          >
            {roleOptions}
            <option value="LEGACY" disabled>
              {t("enterprise_legacy_permission")}
            </option>
          </select>
          <Button
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => {
              if (window.confirm(t("enterprise_revoke_confirm")))
                mutation.mutate({
                  target: "user",
                  targetId: grant.userId,
                  permission: null,
                });
            }}
          >
            {t("enterprise_revoke")}
          </Button>
        </div>
      ))}
    </div>
  );
}
