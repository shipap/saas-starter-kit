import { handleRequest } from "@kit/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleRequest;
export const POST = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
