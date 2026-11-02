import { NextResponse, type NextRequest } from "next/server";
import { configuredOrigin, requestAllowed } from "./lib/request-policy";
export function proxy(req: NextRequest) {
  let origin: URL;
  try {
    origin = configuredOrigin(process.env.APP_ORIGIN);
  } catch {
    return NextResponse.json(
      { error: "Application origin is not configured securely" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!requestAllowed(req.headers, req.nextUrl.pathname, origin))
    return NextResponse.json(
      { error: "Request host or site is not permitted" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${dev ? "'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' ${dev ? "ws:" : ""}; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=()",
  );
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  if (req.nextUrl.pathname === "/sw.js") {
    res.headers.set("Cache-Control", "no-cache");
    res.headers.set("Service-Worker-Allowed", "/");
  } else if (
    req.nextUrl.pathname.startsWith("/api/") ||
    req.nextUrl.pathname === "/"
  )
    res.headers.set("Cache-Control", "private, no-store");
  if (process.env.APP_ORIGIN?.startsWith("https://"))
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  return res;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
