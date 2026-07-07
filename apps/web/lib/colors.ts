/**
 * Validación de colores hex para el branding por cliente.
 * Solo se acepta el formato completo #RRGGBB.
 */
export function isValidHexColor(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}
