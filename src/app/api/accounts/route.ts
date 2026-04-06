import { NextResponse } from "next/server";
import { getAccounts } from "@/lib/blotato";

export async function GET() {
  try {
    const accounts = await getAccounts();
    return NextResponse.json({ accounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
