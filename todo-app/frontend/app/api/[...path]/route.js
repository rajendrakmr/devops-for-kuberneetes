// Proxy: browser -> Next.js server (/api/...) -> FastAPI backend.
// BACKEND_URL is read at runtime, so the same image works in docker-compose
// (http://backend:8000) and in Kubernetes (http://<service-name>:8000).
const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";

export const dynamic = "force-dynamic";

async function proxy(request, { params }) {
  const { path } = await params;
  const search = new URL(request.url).search;
  const url = `${BACKEND_URL}/${path.join("/")}${search}`;

  const init = {
    method: request.method,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  };
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.text();
  }

  try {
    const res = await fetch(url, init);
    const body = res.status === 204 ? null : await res.text();
    return new Response(body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
    });
  } catch (err) {
    return Response.json(
      { detail: `Backend unreachable at ${BACKEND_URL}` },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
