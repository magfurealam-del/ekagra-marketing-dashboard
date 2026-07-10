import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, type EkagraSession, serializeSession, readSession } from "@/lib/session";

// Internal tool — a plain JSON blob in an httpOnly cookie is sufficient (no
// external users, no cross-tenant risk). Tokens never touch client-side JS
// after this route sets the cookie: the GET handler below only ever reports
// booleans, never the token values themselves.

export async function POST(req: NextRequest) {
  let body: Partial<EkagraSession>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const adToken = (body.adToken || "").trim();
  const adAccountId = (body.adAccountId || "").trim().replace(/^act_/, "");
  const pageId = (body.pageId || "").trim();
  const pageToken = (body.pageToken || "").trim();

  if (!adToken || !adAccountId) {
    return NextResponse.json(
      { error: "Meta Ads access token and Ad Account ID are required." },
      { status: 400 }
    );
  }

  const session: EkagraSession = { adToken, adAccountId, pageId, pageToken };

  const res = NextResponse.json({ connected: true, hasPage: Boolean(pageId && pageToken) });
  res.cookies.set(SESSION_COOKIE, serializeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

// Only ever reports whether a session exists — never returns token values to the client.
export async function GET() {
  const session = readSession();
  if (!session) return NextResponse.json({ connected: false, hasPage: false });
  return NextResponse.json({
    connected: true,
    hasPage: Boolean(session.pageId && session.pageToken),
    adAccountId: session.adAccountId,
    pageId: session.pageId,
  });
}

export async function DELETE() {
  const res = NextResponse.json({ connected: false });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export const runtime = "nodejs";
