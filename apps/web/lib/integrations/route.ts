/**
 * Wrapper de los Route Handlers de /api/v1/integrations/*.
 *
 * Centraliza: autenticación por API key y scope, resolución de `params`
 * (Promise en Next 16), y traducción de errores a la respuesta estándar
 * { error: { code, message } }. Los handlers solo contienen lógica de negocio.
 *
 *   export const GET = integrationRoute("tickets:read", async ({ url, params }) => { ... });
 */
import type { NextResponse } from "next/server";
import { requireIntegrationScope, type AuthenticatedApiKey, type IntegrationAuthDeps } from "./auth";
import { errorResponse, IntegrationError } from "./http";
import { PhoneValidationError } from "./phone";
import type { IntegrationScope } from "./types";

export type RouteContext<P> = {
  req: Request;
  url: URL;
  params: P;
  apiKey: AuthenticatedApiKey;
};

export type RouteHandler<P> = (ctx: RouteContext<P>) => Promise<Response | NextResponse>;

type NextRouteArgs<P> = { params: Promise<P> | P };

export function integrationRoute<P extends Record<string, string> = Record<string, never>>(
  scope: IntegrationScope,
  handler: RouteHandler<P>,
  options: { authDeps?: IntegrationAuthDeps } = {}
) {
  return async function route(req: Request, args?: NextRouteArgs<P>): Promise<Response> {
    const auth = await requireIntegrationScope(req, scope, options.authDeps);
    if (!auth.ok) return auth.response;

    try {
      const params = (await args?.params) ?? ({} as P);
      return await handler({ req, url: new URL(req.url), params, apiKey: auth.apiKey });
    } catch (err) {
      if (err instanceof IntegrationError) return err.toResponse();
      if (err instanceof PhoneValidationError) {
        return errorResponse(400, "VALIDATION_ERROR", err.message, { details: { field: "phone" } });
      }
      console.error(`[integrations] ${req.method} ${new URL(req.url).pathname}:`, err);
      return errorResponse(500, "INTERNAL_ERROR", "Error interno. Intenta de nuevo más tarde.");
    }
  };
}
