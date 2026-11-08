/**
 * Helpers para invocar Route Handlers directamente (sin servidor HTTP).
 */
import { API_KEY_HEADER } from "@/lib/integrations/auth";
import { API_KEYS } from "./fixtures";

// Cada ruta tipa sus propios params; aquí basta con el contrato genérico
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteFn = (req: Request, args?: any) => Promise<Response>;

export type CallOptions = {
  method?: string;
  body?: unknown;
  /** Body ya construido (multipart, texto crudo); tiene prioridad sobre `body` */
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  apiKey?: string | null;
  query?: Record<string, string>;
};

export async function call(route: RouteFn, path: string, options: CallOptions = {}) {
  const url = new URL(path, "http://tickets.test");
  for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);

  const headers = new Headers(options.headers);
  const apiKey = options.apiKey === undefined ? API_KEYS.full : options.apiKey;
  if (apiKey) headers.set(API_KEY_HEADER, apiKey);

  let body: BodyInit | undefined = options.rawBody;
  if (body === undefined && options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }

  const method = options.method ?? (body === undefined ? "GET" : "POST");
  const req = new Request(url, { method, headers, body });
  const res = await route(req, { params: Promise.resolve(options.params ?? {}) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, json: json as any };
}
