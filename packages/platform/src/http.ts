import { createPlatform } from "./index";
const runtime = globalThis as typeof globalThis & {
  kitPlatform?: ReturnType<typeof createPlatform>;
};
export async function handleRequest(request: Request): Promise<Response> {
  try {
    runtime.kitPlatform ??= createPlatform();
    return (await runtime.kitPlatform).handleRequest(request);
  } catch {
    runtime.kitPlatform = undefined;
    console.error(
      JSON.stringify({
        level: "error",
        event: "platform.initialization_failed",
      }),
    );
    return Response.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message:
            "The application is not ready. Check local database and authentication configuration.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
