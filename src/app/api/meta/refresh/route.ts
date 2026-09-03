import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveDatePreset } from "@/lib/date-range";
import { isAdminEmail } from "@/lib/auth-access";
import { refreshMetaSnapshot } from "@/lib/meta-cache";

/**
 * Manual refresh is admin-only and enforced HERE, not only by the middleware
 * path prefix.
 *
 * `/api/sync` validates its own shared secret because a scheduler calls it.
 * This route is called by a signed-in browser, so the equivalent in-route
 * check is the session + admin test. Relying on `isAdminPath` in middleware
 * alone meant one edit to that matcher would have exposed an unauthenticated
 * trigger for a full ~20-40s live Meta re-query.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json(
      { ok: false, message: "Google Workspace authentication required." },
      { status: 401 },
    );
  }

  if (!isAdminEmail(email)) {
    return NextResponse.json(
      { ok: false, message: "Admin access required to refresh provider data." },
      { status: 403 },
    );
  }

  // Refresh the range the caller is actually looking at, not always 30 days.
  const datePreset = resolveDatePreset(
    request.nextUrl.searchParams.get("range"),
  );

  try {
    const snapshot = await refreshMetaSnapshot(datePreset);

    return NextResponse.json({
      ok: true,
      refreshedAt: snapshot.refreshedAt,
      datePreset: snapshot.datePreset,
      rows: snapshot.creatives.length,
      checkedAt: snapshot.spike.checkedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        generatedAt: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : "Meta snapshot refresh failed before Meta returned a response.",
      },
      { status: 502 },
    );
  }
}
