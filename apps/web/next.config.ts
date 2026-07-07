import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // La raíz del repo tiene su propio package.json/package-lock.json, lo que hace
  // que Next infiera mal el workspace root y falle la resolución de módulos
  // (p. ej. tailwindcss) en dev, dejando componentes cliente sin hidratar.
  turbopack: {
    root: path.join(__dirname),
  },
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
