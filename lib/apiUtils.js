import { NextResponse } from "next/server";
import mongoose from "mongoose";

// `extra` adds details for the client (e.g. which tasks block a start).
export function fail(error, status = 400, extra = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export const forbidden = () => fail("forbidden", 403);
export const notFound = () => fail("not_found", 404);

export function isObjectId(value) {
  return typeof value === "string" && mongoose.Types.ObjectId.isValid(value);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function bilingual(value, max = 200) {
  return {
    ar: String(value?.ar || "").trim().slice(0, max),
    en: String(value?.en || "").trim().slice(0, max),
  };
}
