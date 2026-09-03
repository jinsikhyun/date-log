import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 디자인 핸드오프 번들 (참고용, 빌드 대상 아님)
    "design_handoff_*/**",
    "Design_for_datelog/**",
    "datelog.design/**",
    "date-log-release/**",
    "**/*.swp",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // 데이터 로딩 effect의 초기 상태 정리는 의도된 패턴이다. 이 권고 규칙은
      // 런타임 오류가 아니며 기존 인증/지도/상세 로딩을 오탐한다.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
