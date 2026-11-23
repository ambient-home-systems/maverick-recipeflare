import type { IdentityProvider } from "./types";

/** `localhost`, a name under it, `127.x.x.x` or `::1`. */
export function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    /^127(\.\d{1,3}){3}$/.test(host)
  );
}

/**
 * Local development without Access: signs in the person named in `.dev.vars`.
 *
 * It answers only when `AUTH_MODE` is `dev` and the request was made to this
 * machine, so a deploy that carries the variable by mistake still refuses.
 * Cloudflare routes a deployed Worker by hostname, so a request from outside
 * cannot arrive with a loopback one.
 */
export const devProvider: IdentityProvider = {
  name: "dev",
  async identify(request, env) {
    if (env.AUTH_MODE !== "dev") {
      return null;
    }
    if (!isLoopback(new URL(request.url).hostname)) {
      return null;
    }
    const email = (env.DEV_MEMBER_EMAIL ?? "").trim();
    return email === "" ? null : { email };
  },
};
