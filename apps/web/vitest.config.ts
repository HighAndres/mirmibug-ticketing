import { defineConfig } from "vitest/config";
import path from "node:path";

// La BD de pruebas vive en .vitest/test.db (se recrea en cada ejecución, ver
// tests/global-setup.ts). APP_DIR también apunta ahí para que los adjuntos de
// prueba no caigan en public/uploads.
const testDir = path.resolve(__dirname, ".vitest");
const testDbUrl = `file:${path.join(testDir, "test.db").replace(/\\/g, "/")}`;

export default defineConfig({
  resolve: {
    alias: {
      // Marcador de Next.js sin implementación fuera del bundler
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Un solo archivo a la vez: todos comparten la misma SQLite
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["lib/integrations/**/*.ts", "app/api/v1/**/*.ts"],
      exclude: ["**/__tests__/**"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
    env: {
      DATABASE_URL: testDbUrl,
      APP_DIR: testDir,
      NEXTAUTH_URL: "http://tickets.test",
      WHATSAPP_INTEGRATION_ENABLED: "true",
      INTEGRATION_RATE_LIMIT_PER_MIN: "1000",
      WHATSAPP_PHONE_RATE_LIMIT_PER_MIN: "1000",
      ATTACHMENT_MAX_MB: "1",
      TICKET_REOPEN_MAX_DAYS: "7",
      WHATSAPP_DEFAULT_CATEGORY: "Soporte técnico",
      SETTINGS_ENC_KEY: "clave-de-pruebas-no-usar-en-produccion",
      // Los tests disparan el dispatcher a mano
      OUTBOX_IMMEDIATE_DISPATCH: "false",
    },
  },
});
