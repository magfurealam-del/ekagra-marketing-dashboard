import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  getCredentialStatus,
  hasSitePasswordConfigured,
  hasValidSiteSession,
  serializeSiteSession,
  verifySitePassword,
} from "@/lib/session";

export async function POST(req: NextRequest) {
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!hasSitePasswordConfigured()) {
    return NextResponse.json(
      { error: "SITE_PASSWORD is not configured on the server." },
      { status: 500 }
    );
  }

  if (!verifySitePassword((body.password || "").trim())) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const credentials = getCredentialStatus();
  const res = NextResponse.json({
    connected: credentials.hasAds,
    authenticated: true,
    ...credentials,
  });
  res.cookies.set(SESSION_COOKIE, serializeSiteSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function GET() {
  const credentials = getCredentialStatus();
  const authenticated = hasValidSiteSession();
  return NextResponse.json({
    connected: authenticated && credentials.hasAds,
    authenticated,
    ...credentials,
  });
}

export async function DELETE() {
  const res = NextResponse.json({ connected: false, authenticated: false });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export const runtime = "nodejs";
