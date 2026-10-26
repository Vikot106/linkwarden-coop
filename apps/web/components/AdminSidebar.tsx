import { useTranslation } from "next-i18next";
import SecondarySidebar from "@/components/SecondarySidebar";

export default function AdminSidebar({
  className,
  toggleSidebar,
  sidebarIsCollapsed,
}: {
  className?: string;
  toggleSidebar?: () => void;
  sidebarIsCollapsed?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <SecondarySidebar
      className={className}
      toggleSidebar={toggleSidebar}
      sidebarIsCollapsed={sidebarIsCollapsed}
      links={[
        {
          title: t("enterprise_management"),
          href: "/admin/enterprise",
          icon: "bi-buildings",
        },
        {
          title: t("user_administration"),
          href: "/admin/user-administration",
          icon: "bi-people",
        },
        {
          title: t("background_jobs"),
          href: "/admin/background-jobs",
          icon: "bi-gear-wide-connected",
        },
      ]}
    />
  );
}
