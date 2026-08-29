// 지도(홈/코스)에서 kakao.maps.CustomOverlay 안에 넣는 원형 카테고리 뱃지 DOM.
// 색/아이콘 매핑은 홈 카드 태그와 동일한 categoryStyle() / categoryIcon() 을 그대로 쓴다.

import { categoryIcon, categoryStyle } from "@/lib/places";

/**
 * 지름 30px 원형 뱃지:
 *  - 배경 = 옅은 카테고리 색, 테두리(2px) = 진한 카테고리 색 (categoryStyle 의 text-* → currentColor)
 *  - 안에 카테고리 아이콘
 *  - status='wishlist' 면 테두리 점선 + opacity 0.65, 'visited' 면 실선 + 불투명
 */
export function createCategoryBadge(place: {
  category: string;
  status: string;
}): HTMLDivElement {
  const wishlist = place.status === "wishlist";
  const el = document.createElement("div");
  // categoryStyle() → "bg-<c>-100 text-<c>-700" (배경 + 글자색=테두리색 소스)
  el.className = `${categoryStyle(
    place.category,
  )} flex items-center justify-center rounded-full`;
  el.style.cssText =
    "width:30px;height:30px;font-size:15px;line-height:1;cursor:pointer;" +
    `border:2px ${wishlist ? "dashed" : "solid"} currentColor;` +
    `opacity:${wishlist ? "0.65" : "1"};` +
    "box-shadow:0 1px 3px rgba(0,0,0,0.25);";
  el.textContent = categoryIcon(place.category);
  return el;
}

/**
 * 뱃지 요소에 클릭/더블클릭 핸들러를 단다.
 *  - 한 번 클릭: 250ms 뒤 onSingle (인포윈도우). 그 사이 두 번째 클릭이 오면 취소.
 *  - 더블클릭: onDouble (상세 페이지 이동). 대기 중이던 onSingle 은 취소.
 */
export function attachBadgeHandlers(
  el: HTMLElement,
  onSingle: () => void,
  onDouble: () => void,
): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (timer) return; // 더블클릭의 두 번째 click
    timer = setTimeout(() => {
      timer = null;
      onSingle();
    }, 250);
  });

  el.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    onDouble();
  });
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** 뱃지 클릭 시 여는 말풍선(InfoWindow) 내용: 장소 이름 + 카테고리 */
export function placeInfoContent(name: string, category: string): string {
  return (
    `<div style="padding:8px 12px;font-size:13px;line-height:1.5;white-space:nowrap;">` +
    `<strong style="font-weight:700;">${escapeHtml(name)}</strong><br/>` +
    `<span style="color:#8a7d70;">${escapeHtml(category)}</span>` +
    `</div>`
  );
}
