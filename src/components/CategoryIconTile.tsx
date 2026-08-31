import {
  categoryIcon,
  categoryStyle,
  naverImageSearchUrl,
} from "@/lib/places";

/**
 * 사진 없는 장소 카드의 좌측 아이콘 타일.
 * 클릭하면 새 탭으로 네이버 이미지 검색. 카드 전체 클릭(상세 이동)으로 전파되지 않게 stopPropagation.
 */
export function CategoryIconTile({
  category,
  name,
  address,
  size = 52,
}: {
  category: string;
  name: string;
  address: string;
  size?: number;
}) {
  return (
    <a
      href={naverImageSearchUrl(name, address)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={`${name} 네이버 이미지 검색`}
      title="네이버 이미지 검색"
      className={`relative z-20 flex shrink-0 cursor-pointer items-center justify-center rounded-xl ring-1 ring-black/5 transition hover:brightness-105 hover:ring-2 hover:ring-accent/50 ${categoryStyle(
        category,
      )}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.46),
      }}
    >
      <span aria-hidden>{categoryIcon(category)}</span>
    </a>
  );
}
