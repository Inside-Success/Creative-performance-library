import { NextRequest, NextResponse } from "next/server";
import { refreshMetaSnapshot } from "@/lib/meta-cache";

function isAuthorized(request: NextRequest) {
  const secret = process.env.SYNC_TRIGGER_SECRET?.trim();

  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  return bearerToken === secret || request.nextUrl.searchParams.get("secret") === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Unauthorized sync trigger.",
      },
      { status: 401 },
    );
  }

  try {
    const snapshot = await refreshMetaSnapshot();

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
            : "Scheduled sync failed before a provider returned a response.",
      },
      { status: 502 },
    );
  }
}
