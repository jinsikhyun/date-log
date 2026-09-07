// production 코드(src/lib/*.ts)는 tsc(bundler resolution) 관례상 서로를 확장자 없이
// import 한다(예: recommendationPrompt.ts → "./recommendationVoice"). tsc/Next.js는 이걸
// 그대로 처리하지만 평가 스크립트는 순수 Node ESM이라 확장자가 필요하다 — 이 훅이
// 그 간극만 메운다. production 코드 자체는 건드리지 않는다.
export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // 확장자 추정이 틀렸으면 원래 동작(에러 포함)으로 폴백한다.
    }
  }
  return nextResolve(specifier, context);
}
