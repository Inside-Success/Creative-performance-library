import { NextResponse } from "next/server";
import { probeHyrosAccess } from "@/lib/hyros";

export async function GET() {
  const result = await probeHyrosAccess();

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
  });
}
