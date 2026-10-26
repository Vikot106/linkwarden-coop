import { ReactNode, useMemo } from "react";
import { useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export default function AccountQueryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { data, status } = useSession();
  const account = status === "authenticated" ? data.user.id : status;
  // Never reuse the previous employee's private query results after account changes.
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000 } },
      }),
    [account]
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
