import { auth } from "@/auth";
import { isAdminEmail, isAllowedEmail } from "@/lib/auth-access";
import { NextResponse } from "next/server";

const publicAssetPattern = /\.(?:ico|png|jpg|jpeg|gif|svg|webp|css|js|map|txt)$/i;

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/sync" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    publicAssetPattern.test(pathname)
  );
}

function isAdminPath(pathname: string) {
  return (
    pathname === "/funnels" ||
    pathname === "/settings" ||
    pathname === "/phase1" ||
    pathname.startsWith("/api/hyros/") ||
    pathname.startsWith("/api/meta/") ||
    pathname.startsWith("/api/phase1/")
  );
}

function unauthorized(pathname: string, origin: URL) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        ok: false,
        message: "Google Workspace authentication required.",
      },
      { status: 401 },
    );
  }

  const url = new URL("/login", origin);
  url.searchParams.set("callbackUrl", `${origin.pathname}${origin.search}`);
  return NextResponse.redirect(url);
}

function forbidden(pathname: string, origin: URL) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        ok: false,
        message: "Admin access required.",
      },
      { status: 403 },
    );
  }

  return NextResponse.redirect(new URL("/", origin));
}

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const email = request.auth?.user?.email;

  if (isPublicPath(pathname)) {
    if (pathname === "/login" && isAllowedEmail(email)) {
      return NextResponse.redirect(new URL("/", request.nextUrl));
    }

    return NextResponse.next();
  }

  if (isAllowedEmail(email)) {
    if (isAdminPath(pathname) && !isAdminEmail(email)) {
      return forbidden(pathname, request.nextUrl);
    }

    return NextResponse.next();
  }

  return unauthorized(pathname, request.nextUrl);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
