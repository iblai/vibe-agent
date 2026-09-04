import { NextResponse, type NextRequest } from "next/server";
import { applyCsp } from "@iblai/iblai-js/security/next";
import appConfig from "@/lib/iblai/config";

export function proxy(request: NextRequest) {
  // /about exists only when NEXT_PUBLIC_SHOW_ABOUT=true. Refusing it here gives
  // a real 404 status; notFound() in the page can't, because the root
  // layout's loading shell has already streamed by the time the page throws.
  if (request.nextUrl.pathname === "/about" && !appConfig.showAbout()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return applyCsp(request, {
    requestHeaders,
    mode: process.env.NODE_ENV === "development" ? "report-only" : undefined,
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
