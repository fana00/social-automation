import { NextRequest, NextResponse } from "next/server";
import { getIGSourcesByPersona } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  try {
    const personaId = req.nextUrl.searchParams.get("personaId");
    if (!personaId) {
      return NextResponse.json({ error: "personaId required" }, { status: 400 });
    }
    const sources = await getIGSourcesByPersona(personaId);
    return NextResponse.json({ sources });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
