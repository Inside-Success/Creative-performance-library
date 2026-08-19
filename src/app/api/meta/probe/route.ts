import { NextResponse } from "next/server";
import { runMetaAccessProbe } from "@/lib/meta";

export async function GET() {
  try {
    const results = await runMetaAccessProbe();
    const ok = results.every((result) => result.ok);

    return NextResponse.json({
      ok,
      checkedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : "Meta access probe failed before Meta returned a response.",
      },
      { status: 502 },
    );
  }
}
