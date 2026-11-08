/**
 * Rate limiting en memoria (ventana fija por minuto).
 *
 * No hay Redis en el stack. Como producción corre una sola instancia de Next
 * bajo PM2, un contador por proceso es efectivo. Limitaciones conocidas:
 *   - Se reinicia con el proceso (tras un restart todos vuelven a 0).
 *   - Con más de una instancia (cluster PM2 o varios servidores) cada una
 *     lleva su propio contador, así que el límite real se multiplica.
 * TODO(redis): si se escala horizontalmente, sustituir el Map por INCR/EXPIRE
 * en Redis manteniendo esta misma interfaz.
 */

type Window = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const SWEEP_EVERY_MS = 5 * 60_000;

const buckets = new Map<string, Window>();
let lastSweepAt = 0;

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Segundos hasta que la ventana se reinicia (0 si está permitido). */
  retryAfterSeconds: number;
  resetAt: number;
};

function sweep(now: number) {
  if (now - lastSweepAt < SWEEP_EVERY_MS) return;
  lastSweepAt = now;
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Consume una unidad para `key` y dice si sigue dentro del límite.
 * `key` debe llevar namespace, p. ej. "apikey:<id>" o "phone:<e164>".
 */
export function checkRateLimit(
  key: string,
  limit: number,
  options: { windowMs?: number; now?: number } = {}
): RateLimitResult {
  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? WINDOW_MS;
  sweep(now);

  let window = buckets.get(key);
  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + windowMs };
    buckets.set(key, window);
  }

  if (window.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
      resetAt: window.resetAt,
    };
  }

  window.count += 1;
  return {
    allowed: true,
    limit,
    remaining: limit - window.count,
    retryAfterSeconds: 0,
    resetAt: window.resetAt,
  };
}

/** Headers estándar para la respuesta (RateLimit-* y Retry-After si aplica). */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
  if (!result.allowed) headers["Retry-After"] = String(result.retryAfterSeconds);
  return headers;
}

/** Solo para tests. */
export function resetRateLimits() {
  buckets.clear();
  lastSweepAt = 0;
}
