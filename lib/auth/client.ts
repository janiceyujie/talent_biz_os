import { createAuthClient } from "better-auth/react";

// Browser-side calls (sign in, sign up, sign out). Same origin, so no base URL.
export const authClient = createAuthClient();
