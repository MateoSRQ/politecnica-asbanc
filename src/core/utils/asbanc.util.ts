/**
 * Utilidades de saneamiento y formateo según la norma ASBANC FTR / YAPAGO V47
 */

/**
 * Normaliza y sanea cadenas para cumplimiento ASBANC FTR:
 * - Mayúsculas
 * - Sin acentos ni diacríticos
 * - Sustituye Ñ/ñ por N/n
 * - Elimina caracteres especiales no permitidos
 * - Longitud máxima configurable
 */
export function sanitizeAsbancString(text: string, maxLength = 30): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/[^a-zA-Z0-9\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .substring(0, maxLength);
}

/**
 * Convierte un objeto Date o string ISO a formato ASBANC DDMMAAAA
 */
export function formatDateAsbanc(dateInput: Date | string | null | undefined): string {
  if (!dateInput) {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = String(now.getFullYear());
    return `${d}${m}${y}`;
  }

  const dObj = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(dObj.getTime())) {
    return formatDateAsbanc(null);
  }

  const d = String(dObj.getUTCDate()).padStart(2, '0');
  const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
  const y = String(dObj.getUTCFullYear());
  return `${d}${m}${y}`;
}

/**
 * Convierte formato DDMMAAAA a objeto Date
 */
export function parseAsbancDate(dateStr: string, timeStr = '000000'): Date {
  if (!dateStr || dateStr.length !== 8) {
    return new Date();
  }
  const day = parseInt(dateStr.substring(0, 2), 10);
  const month = parseInt(dateStr.substring(2, 4), 10) - 1;
  const year = parseInt(dateStr.substring(4, 8), 10);

  const hour = timeStr && timeStr.length === 6 ? parseInt(timeStr.substring(0, 2), 10) : 0;
  const minute = timeStr && timeStr.length === 6 ? parseInt(timeStr.substring(2, 4), 10) : 0;
  const second = timeStr && timeStr.length === 6 ? parseInt(timeStr.substring(4, 6), 10) : 0;

  return new Date(Date.UTC(year, month, day, hour, minute, second));
}
