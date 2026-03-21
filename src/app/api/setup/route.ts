import { NextResponse } from "next/server";

// Legacy setup endpoint — removed for security (secret in query string)
// Use POST /api/admin/setup with cookie auth instead
export async function GET() {
  return NextResponse.json(
    { error: "This endpoint has been removed. Use the admin panel at /admin to run setup." },
    { status: 410 }
  );
}
