export function sanitizeAsbancText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ñÑ]/g, 'N')
    .replace(/[^a-zA-Z0-9.\-_ /]/g, '')
    .toUpperCase();
}

export function formatAN(value: string | null | undefined, length: number): string {
  const sanitized = sanitizeAsbancText(value);
  if (sanitized.length >= length) {
    return sanitized.substring(0, length);
  }
  return sanitized.padEnd(length, ' ');
}

export function formatN(value: number | string | null | undefined, length: number, decimals: number = 0): string {
  let numVal = typeof value === 'number' ? value : parseFloat(String(value || '0'));
  if (isNaN(numVal) || numVal < 0) {
    numVal = 0;
  }

  let strVal: string;
  if (decimals > 0) {
    const factor = Math.pow(10, decimals);
    const intEquivalent = Math.round(numVal * factor);
    strVal = Math.max(0, intEquivalent).toString();
  } else {
    strVal = Math.floor(numVal).toString();
  }

  if (strVal.length >= length) {
    return strVal.substring(strVal.length - length);
  }
  return strVal.padStart(length, '0');
}

export function parseAN(line: string, startPos1: number, length: number): string {
  const startIdx = startPos1 - 1;
  return line.substring(startIdx, startIdx + length).trim();
}

export function parseN(line: string, startPos1: number, length: number, decimals: number = 0): number {
  const startIdx = startPos1 - 1;
  const raw = line.substring(startIdx, startIdx + length).trim();
  const rawNum = parseInt(raw, 10);
  if (isNaN(rawNum)) return 0;
  if (decimals > 0) {
    return rawNum / Math.pow(10, decimals);
  }
  return rawNum;
}

export function formatDateDDMMAAAA(date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}${month}${year}`;
}

export function formatTimeHHMMSS(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}${minutes}${seconds}`;
}

export function generateDebtFileName(date: Date = new Date(), sequence: number = 1): string {
  const ddmmaaaa = formatDateDDMMAAAA(date);
  const sss = String(sequence).padStart(3, '0');
  return `FTRCOB${ddmmaaaa}${sss}.TXT`;
}

export function generatePaymentFileName(date: Date = new Date(), sequence: number = 1): string {
  const ddmmaaaa = formatDateDDMMAAAA(date);
  const sss = String(sequence).padStart(3, '0');
  return `FTRPAG${ddmmaaaa}${sss}.TXT`;
}
