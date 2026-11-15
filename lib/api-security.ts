export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase() ?? null;
  const requestUrl = new URL(request.url);
  const requestHost = request.headers.get("host") ?? requestUrl.host;
  let canonicalRequestHost: string;
  try {
    canonicalRequestHost = new URL(`${requestUrl.protocol}//${requestHost}`).host;
  } catch {
    return false;
  }

  if (fetchSite === "cross-site") return false;

  if (!origin) {
    return fetchSite === "same-origin";
  }

  try {
    const originUrl = new URL(origin);
    return (
      fetchSite !== "cross-site" &&
      originUrl.protocol === requestUrl.protocol &&
      originUrl.host.toLowerCase() === canonicalRequestHost.toLowerCase()
    );
  } catch {
    return false;
  }
}

export async function readJsonBody(request: Request, maxBytes = 8192): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    throw new RangeError("Request is too large.");
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > maxBytes) {
    throw new RangeError("Request is too large.");
  }
  return JSON.parse(rawBody) as unknown;
}