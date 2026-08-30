// 카카오맵 JavaScript SDK 로더. 지도(KakaoMap)와 장소 검색 자동완성(AddPlaceForm) 이 공유한다.
// autoload=false + libraries=services 로 한 번만 삽입하고, kakao.maps.load 까지 끝나면 resolve.

const SDK_SCRIPT_ID = "kakao-maps-sdk";

let loadPromise: Promise<void> | null = null;

/** SDK(+services 라이브러리) 로드 후 kakao.maps.load 까지 완료되면 resolve. 여러 번 불러도 1회만 로드. */
export function ensureKakaoLoaded(appKey: string): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("window 가 없습니다 (서버 환경)."));
      return;
    }

    const finish = () => {
      if (!window.kakao?.maps) {
        reject(new Error("window.kakao.maps 를 찾을 수 없습니다."));
        return;
      }
      window.kakao.maps.load(() => {
        if (!window.kakao.maps.services) {
          reject(
            new Error(
              "services 라이브러리를 찾을 수 없습니다 (SDK URL 의 libraries=services 확인).",
            ),
          );
        } else {
          resolve();
        }
      });
    };

    if (window.kakao?.maps) {
      finish();
      return;
    }

    const existing = document.getElementById(
      SDK_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", finish);
      existing.addEventListener("error", () =>
        reject(new Error("이미 삽입된 SDK 스크립트 로드에 실패했습니다.")),
      );
      return;
    }

    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services`;
    script.addEventListener("load", finish);
    script.addEventListener("error", () =>
      reject(
        new Error(
          "SDK 스크립트를 내려받지 못했습니다 (네트워크 차단, 잘못된 앱키, 또는 도메인 미등록).",
        ),
      ),
    );
    document.head.appendChild(script);
  });

  // 실패 시 다음 호출에서 재시도할 수 있도록 캐시를 비운다.
  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
}

// ── 주소 → 좌표 지오코딩 (코스 상세의 거리 계산 / 동선 지도에서 사용) ──

let geocoderPromise: Promise<kakao.maps.services.Geocoder> | null = null;

function getGeocoder(): Promise<kakao.maps.services.Geocoder> {
  if (!geocoderPromise) {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!appKey) {
      return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_KEY 가 비어 있습니다."));
    }
    geocoderPromise = ensureKakaoLoaded(appKey).then(
      () => new window.kakao.maps.services.Geocoder(),
    );
    geocoderPromise.catch(() => {
      geocoderPromise = null;
    });
  }
  return geocoderPromise;
}

/** "…26 지하1층" 같은 꼬리표를 떼어 지오코딩 성공률을 높인다 */
function addressCandidates(raw: string): string[] {
  const cleaned = raw
    .replace(/\s*,.*$/, "")
    .replace(/\s*(지하\s*\d*\s*층|\d+\s*층|\d+\s*호).*$/, "")
    .trim();
  return cleaned && cleaned !== raw ? [raw, cleaned] : [raw];
}

/** 주소 문자열을 좌표로. 실패하면 null. */
export async function geocode(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;
  const geocoder = await getGeocoder();

  for (const cand of addressCandidates(address)) {
    const hit = await new Promise<{ lat: number; lng: number } | null>(
      (resolve) => {
        geocoder.addressSearch(cand, (results, status) => {
          if (
            status === window.kakao.maps.services.Status.OK &&
            results.length > 0
          ) {
            resolve({
              lat: parseFloat(results[0].y),
              lng: parseFloat(results[0].x),
            });
          } else {
            resolve(null);
          }
        });
      },
    );
    if (hit) return hit;
  }
  return null;
}

// ── 카카오맵 길찾기 URL (경로 계산은 카카오맵이, 우리는 링크만) ──
// 카카오 지도 Web API "길찾기 URL 만들기": /link/to/{이름},{lat},{lng}
//                                    /link/from/{이름},{lat},{lng}/to/{이름},{lat},{lng}

interface DirPoint {
  name: string;
  lat: number;
  lng: number;
}

const seg = (p: DirPoint) => `${encodeURIComponent(p.name)},${p.lat},${p.lng}`;

/** 목적지만 지정 (출발지는 카카오맵이 현재 위치를 물어봄) */
export function kakaoDirectionsTo(dest: DirPoint): string {
  return `https://map.kakao.com/link/to/${seg(dest)}`;
}

/** 출발 → 도착 길찾기 */
export function kakaoDirectionsFromTo(from: DirPoint, to: DirPoint): string {
  return `https://map.kakao.com/link/from/${seg(from)}/to/${seg(to)}`;
}
