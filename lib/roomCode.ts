// 혼동되기 쉬운 문자 (0, O, 1, I) 제외한 32자
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export function validateRoomCode(code: string): boolean {
  return /^[A-Z2-9]{6}$/.test(code);
}

export function validateNickname(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 10) return false;
  // 앞뒤 공백 제거 후 특수 DB 경로 문자 차단
  return !/[.$#[\]\/]/.test(trimmed);
}

export function sanitizeNickname(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
