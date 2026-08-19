import { NextResponse } from "next/server";
import { runMetaSpike } from "@/lib/meta";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const datePreset = searchParams.get("datePreset") ?? "last_30d";

  try {
    const result = await runMetaSpike(datePreset);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : "Meta spike failed before Meta returned a response.",
      },
      { status: 502 },
    );
  }
}
