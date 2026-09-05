import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev 서버는 기본적으로 localhost 이외 출처의 /_next 자산 요청을 차단한다(CSRF 방지).
  // 로컬망(휴대폰 등)에서 열면 이 목록에 없는 호스트는 JS 번들이 막혀 화면이 굳는다.
  // 로컬 전용 설정 — 운영 빌드/배포에는 영향 없음.
  allowedDevOrigins: ["192.168.219.127"],
};

export default nextConfig;
