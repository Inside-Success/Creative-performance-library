import { NextResponse } from "next/server";
import { refreshMetaSnapshot } from "@/lib/meta-cache";

export async function POST() {
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
            : "Meta snapshot refresh failed before Meta returned a response.",
      },
      { status: 502 },
    );
  }
}
