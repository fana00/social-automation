import { NextResponse } from "next/server";
import { getPersonas } from "@/lib/sheets";

export async function GET() {
  try {
    const personas = await getPersonas();
    return NextResponse.json({ personas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
