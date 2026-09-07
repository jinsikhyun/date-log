// production 코드(src/lib/*.ts)는 tsc(bundler resolution) 관례상 서로를 확장자 없이,
// 그리고 tsconfig.json의 "@/*" → "./src/*" 별칭으로 import 한다(예: kakaoLocal.ts →
// "@/lib/courses"). tsc/Next.js는 이걸 그대로 처리하지만 평가 스크립트는 순수 Node
// ESM이라 별칭도 확장자도 모른다 — 이 훅이 그 간극만 메운다. production 코드 자체는
// 건드리지 않는다.
const SRC_ROOT = new URL("../src/", import.meta.url); // scripts/ts-extension-hook.mjs 기준

export async function resolve(specifier, context, nextResolve) {
  const aliased = specifier.startsWith("@/") ? new URL(specifier.slice(2), SRC_ROOT).href : specifier;
  const needsExt = (aliased.startsWith("./") || aliased.startsWith("../") || aliased.startsWith("file://"))
    && !/\.[a-zA-Z0-9]+$/.test(aliased);
  if (needsExt) {
    try {
      return await nextResolve(`${aliased}.ts`, context);
    } catch {
      // 확장자 추정이 틀렸으면 원래 동작(에러 포함)으로 폴백한다.
    }
  }
  if (aliased !== specifier) return nextResolve(aliased, context);
  return nextResolve(specifier, context);
}
