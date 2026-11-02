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
export function requestAllowed(
  headers: Headers,
  pathname: string,
  origin: URL,
) {
  // Trust the configured public Host; never client-supplied forwarded hosts.
  if (headers.get("host")?.toLowerCase() !== origin.host.toLowerCase())
    return false;
  if (
    pathname.startsWith("/api/") &&
    headers.get("sec-fetch-site") === "cross-site"
  )
    return false;
  return true;
}
