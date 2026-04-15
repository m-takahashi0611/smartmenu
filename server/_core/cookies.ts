import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * iOSのSafari/LINEアプリ内ブラウザかどうかを判定する
 * iOS SafariはSameSite=NoneのCookieをブロックするケースがある
 */
function isIosBrowser(req: Request): boolean {
  const ua = req.headers["user-agent"] ?? "";
  return /iPhone|iPad|iPod/i.test(ua);
}

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   !LOCAL_HOSTS.has(hostname) &&
  //   !isIpAddress(hostname) &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1";

  // const domain =
  //   shouldSetDomain && !hostname.startsWith(".")
  //     ? `.${hostname}`
  //     : shouldSetDomain
  //       ? hostname
  //       : undefined;

  const secure = isSecureRequest(req);
  // iOS Safari/LINEアプリ内ブラウザはSameSite=NoneのCookieをブロックするため
  // iOSの場合はSameSite=Laxを使用する（同一オリジンのリクエストには問題なし）
  const sameSite: "none" | "lax" = isIosBrowser(req) ? "lax" : "none";

  return {
    httpOnly: true,
    path: "/",
    sameSite,
    secure,
  };
}
