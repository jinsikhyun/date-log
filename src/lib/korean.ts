// 한국어 조사(이/가, 와/과) 자동 처리.
// 한글 음절 유니코드(가~힣, 0xAC00~0xD7A3)에서
//   (code - 0xAC00) % 28 !== 0  →  받침(종성) 있음
// 한글 음절이 아니면(영문/숫자/기호/공백 등) 받침 없음으로 간주한다(기본값).

/** 문자열의 마지막(공백 제외) 글자에 받침이 있으면 true. */
export function hasBatchim(value: string | null | undefined): boolean {
  const s = (value ?? "").trimEnd();
  if (!s) return false;
  const code = s.charCodeAt(s.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false; // 한글 음절 아님 → 기본값
  return (code - 0xac00) % 28 !== 0;
}

/**
 * 주격 조사("이"/"가")를 붙인다.
 *   withSubjectParticle("현성") → "현성이"
 *   withSubjectParticle("민호") → "민호가"
 */
export function withSubjectParticle(name: string): string {
  return `${name}${hasBatchim(name) ? "이" : "가"}`;
}

/**
 * 접속 조사("와"/"과")를 붙인다.
 *   withConjunctionParticle("현성") → "현성과"
 *   withConjunctionParticle("수아") → "수아와"
 */
export function withConjunctionParticle(name: string): string {
  return `${name}${hasBatchim(name) ? "과" : "와"}`;
}
