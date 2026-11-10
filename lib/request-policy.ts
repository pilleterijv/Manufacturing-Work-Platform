export function configuredOrigin(value: string | undefined) {
  if (!value) throw Error("APP_ORIGIN is required");
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !(url.protocol === "https:" || (url.protocol === "http:" && local))
  )
    throw Error(
      "APP_ORIGIN must be an HTTPS origin (HTTP is allowed only on loopback)",
    );
  return url;
}
type TunnelEnvironment = {
  CODESPACES?: string;
  CODESPACE_NAME?: string;
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN?: string;
};
export function requestAllowed(
  headers: Headers,
  pathname: string,
  origin: URL,
  tunnel: TunnelEnvironment = {},
) {
  const host = headers.get("host")?.toLowerCase();
  let hostAllowed = host === origin.host.toLowerCase();
  // Codespaces terminates HTTPS and may forward to the loopback HTTP listener.
  // Enable this only for this running Codespace's exact HTTPS preview address.
  const name = tunnel.CODESPACE_NAME;
  const domain = tunnel.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (
    !hostAllowed &&
    tunnel.CODESPACES === "true" &&
    /^[a-z0-9-]+$/.test(name || "") &&
    /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(domain || "") &&
    origin.origin === `https://${name}-3000.${domain}` &&
    ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"].includes(host || "")
  ) {
    const forwarded = headers.get("x-forwarded-host");
    // Next.js fills X-Forwarded-Host from Host when the tunnel omits it.
    hostAllowed =
      !forwarded ||
      forwarded.toLowerCase() === origin.host ||
      forwarded.toLowerCase() === host;
  }
  if (!hostAllowed) return false;
  if (
    pathname.startsWith("/api/") &&
    headers.get("sec-fetch-site") === "cross-site"
  )
    return false;
  return true;
}
