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
function codespacesPreview(origin: URL, tunnel: TunnelEnvironment) {
  const name = tunnel.CODESPACE_NAME;
  const domain = tunnel.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  return (
    tunnel.CODESPACES === "true" &&
    /^[a-z0-9-]+$/.test(name || "") &&
    /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(domain || "") &&
    origin.origin === `https://${name}-3000.${domain}`
  );
}
const tunnelHosts = ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"];
export function requestOriginAllowed(
  headers: Headers,
  origin: URL,
  tunnel: TunnelEnvironment = {},
) {
  const received = headers.get("origin");
  if (received === origin.origin) return true;
  // GitHub may rewrite Origin as well as Host. A browser-supplied custom header
  // preserves its public address. Cross-origin JS cannot send it without CORS
  // preflight permission, which the app does not grant. Fetch Metadata must also
  // attest same-origin. Never infer this exception from a forwarded header alone.
  const host = headers.get("host")?.toLowerCase();
  return (
    codespacesPreview(origin, tunnel) &&
    tunnelHosts.includes(host || "") &&
    ["http", "https"].some((scheme) => received === `${scheme}://${host}`) &&
    headers.get("sec-fetch-site") === "same-origin" &&
    headers.get("x-floorwork-origin") === origin.origin &&
    requestAllowed(headers, "/api/account", origin, tunnel)
  );
}
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
  if (
    !hostAllowed &&
    codespacesPreview(origin, tunnel) &&
    tunnelHosts.includes(host || "")
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

// Diagnostics contain addresses only, never request bodies, cookies or URL credentials.
export function originCheckDiagnostic(
  req: Request,
  configured: string | undefined,
) {
  const address = (value: string | null | undefined) => {
    if (!value) return "<missing>";
    try {
      return new URL(value).origin;
    } catch {
      return "<invalid>";
    }
  };
  const site = req.headers.get("sec-fetch-site");
  return {
    expectedOrigin: address(configured),
    receivedOrigin: address(req.headers.get("origin")),
    requestOrigin: address(req.url),
    fetchSite: ["same-origin", "same-site", "cross-site", "none"].includes(
      site || "",
    )
      ? site
      : "<missing or invalid>",
  };
}
