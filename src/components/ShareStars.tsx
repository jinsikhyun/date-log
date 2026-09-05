import { SC } from "@/lib/shareCardStyle";

/**
 * 공유 카드용 별점. ★ 글자는 폰트마다 폭이 달라 캡처 엔진이 폭을 오계산하고,
 * 그 결과 옆 텍스트가 겹친다. 폰트에 의존하지 않도록 SVG 로 그린다.
 */
export function ShareStars({
  rating,
  size = 30,
  gap = 4,
}: {
  rating: number;
  size?: number;
  gap?: number;
}) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));

  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        // 폭을 명시해 캡처 엔진이 추정하지 않게 한다
        width: size * 5 + gap * 4,
        height: size,
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{
            display: "block",
            flexShrink: 0,
            marginRight: i < 4 ? gap : 0,
          }}
        >
          <path
            d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45 6.19 20.5l1.11-6.47L2.6 9.45l6.5-.95L12 2.6z"
            fill={i < filled ? SC.fg : SC.border}
          />
        </svg>
      ))}
    </span>
  );
}
