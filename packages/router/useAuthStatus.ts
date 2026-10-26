import { useContext } from "react";
import { SessionContext } from "next-auth/react";
import { MobileAuth } from "@linkwarden/types/global";

export default function useAuthStatus(auth?: MobileAuth) {
  // Native clients pass auth explicitly and do not mount a NextAuth provider.
  // Always read context so changing the authentication source never changes hook order.
  const session = useContext(SessionContext);
  if (auth) return auth.status;
  if (!session)
    throw new Error("A SessionProvider is required for web queries.");
  return session.status;
}
