import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "https://api.amqautopause.zetsumei.xyz",
});

export const { signIn, signOut, useSession } = authClient;
