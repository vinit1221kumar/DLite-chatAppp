import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Generate ZEGOCLOUD Token04 (server-side only).
 * Ref: ZEGOCLOUD open-source "zego_server_assistant" Token04 generator.
 *
 * IMPORTANT:
 * - Never expose `ZEGO_SERVER_SECRET` to the client.
 * - `secret` must be a 32-byte string (per ZEGO docs).
 */
function generateToken04(params: {
  appId: number;
  userId: string;
  secret: string;
  effectiveTimeInSeconds: number;
  payload?: string;
}) {
  const { appId, userId, secret, effectiveTimeInSeconds, payload } = params;

  if (!appId || typeof appId !== "number") throw new Error("ZEGO appId invalid");
  if (!userId || typeof userId !== "string") throw new Error("ZEGO userId invalid");
  if (!secret || typeof secret !== "string" || secret.length !== 32) throw new Error("ZEGO secret invalid");
  if (!effectiveTimeInSeconds || typeof effectiveTimeInSeconds !== "number")
    throw new Error("effectiveTimeInSeconds invalid");

  const ctime = Math.floor(Date.now() / 1000);
  const expire = ctime + effectiveTimeInSeconds;
  const nonce = Math.ceil((-2147483648 + (2147483647 - -2147483648)) * Math.random());

  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce,
    ctime,
    expire,
    payload: payload || "",
  };

  const plainText = JSON.stringify(tokenInfo);
  const iv = Buffer.from(
    Array.from({ length: 16 }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]).join("")
  );

  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(secret), iv);
  cipher.setAutoPadding(true);
  const encrypted = Buffer.concat([cipher.update(plainText), cipher.final()]);

  const bExpire = Buffer.alloc(8);
  bExpire.writeBigInt64BE(BigInt(expire), 0);
  const bIvLen = Buffer.alloc(2);
  bIvLen.writeUInt16BE(iv.length, 0);
  const bEncLen = Buffer.alloc(2);
  bEncLen.writeUInt16BE(encrypted.byteLength, 0);

  const buf = Buffer.concat([bExpire, bIvLen, iv, bEncLen, encrypted]);
  return "04" + buf.toString("base64");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || "").trim();
    const roomId = String(body?.roomId || "").trim();

    const appIdRaw = process.env.NEXT_PUBLIC_ZEGO_APP_ID;
    const secret = String(process.env.ZEGO_SERVER_SECRET || "");
    const appId = Number(appIdRaw);

    if (!userId) return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 });
    if (!roomId) return NextResponse.json({ success: false, message: "roomId is required" }, { status: 400 });
    if (!appId || Number.isNaN(appId))
      return NextResponse.json({ success: false, message: "NEXT_PUBLIC_ZEGO_APP_ID is invalid" }, { status: 500 });
    if (!secret)
      return NextResponse.json({ success: false, message: "ZEGO_SERVER_SECRET is missing" }, { status: 500 });

    const effectiveTimeInSeconds = 60 * 60; // 1 hour

    // Strict token payload: allow login + publish in this room.
    const payload = JSON.stringify({
      room_id: roomId,
      privilege: {
        1: 1, // loginRoom
        2: 1, // publishStream
      },
      stream_id_list: null,
    });

    const token = generateToken04({ appId, userId, secret, effectiveTimeInSeconds, payload });
    return NextResponse.json({ success: true, appId, token });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token generation failed";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

