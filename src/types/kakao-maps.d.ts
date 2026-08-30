// 카카오맵 JavaScript SDK 중 이 프로젝트에서 실제로 쓰는 부분만 최소 타입 선언.
// 전체 타입이 필요해지면 커뮤니티 패키지(@types/kakaomaps 등) 도입 검토.

export {};

declare global {
  interface Window {
    kakao: typeof kakao;
  }

  namespace kakao.maps {
    /** autoload=false 로 로드했을 때 SDK 준비 완료 콜백 */
    function load(callback: () => void): void;

    class LatLng {
      constructor(latitude: number, longitude: number);
      getLat(): number;
      getLng(): number;
    }

    class LatLngBounds {
      constructor();
      extend(latlng: LatLng): void;
    }

    interface MapOptions {
      center: LatLng;
      level?: number;
    }

    class Map {
      constructor(container: HTMLElement, options: MapOptions);
      setCenter(latlng: LatLng): void;
      setLevel(level: number): void;
      setBounds(bounds: LatLngBounds): void;
      relayout(): void;
    }

    interface MarkerOptions {
      position: LatLng;
      map?: Map;
      title?: string;
    }

    class Marker {
      constructor(options: MarkerOptions);
      setMap(map: Map | null): void;
    }

    interface PolylineOptions {
      path: LatLng[];
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: "solid" | "shortdash" | "dash" | "dot";
      map?: Map;
    }

    class Polyline {
      constructor(options: PolylineOptions);
      setMap(map: Map | null): void;
      setPath(path: LatLng[]): void;
    }

    interface CustomOverlayOptions {
      position: LatLng;
      content: string | HTMLElement;
      map?: Map;
      xAnchor?: number;
      yAnchor?: number;
      zIndex?: number;
    }

    class CustomOverlay {
      constructor(options: CustomOverlayOptions);
      setMap(map: Map | null): void;
      setPosition(position: LatLng): void;
    }

    interface InfoWindowOptions {
      content?: string | HTMLElement;
      removable?: boolean;
      zIndex?: number;
    }

    class InfoWindow {
      constructor(options: InfoWindowOptions);
      open(map: Map, marker?: Marker): void;
      close(): void;
      setContent(content: string | HTMLElement): void;
      setPosition(position: LatLng): void;
    }

    namespace event {
      function addListener(
        target: Map | Marker,
        type: string,
        handler: (...args: unknown[]) => void,
      ): void;
    }

    // libraries=services 로 로드했을 때 사용 가능
    namespace services {
      const Status: {
        OK: "OK";
        ZERO_RESULT: "ZERO_RESULT";
        ERROR: "ERROR";
      };

      const SortBy: {
        ACCURACY: "accuracy";
        DISTANCE: "distance";
      };

      interface AddressSearchResult {
        x: string; // 경도(lng)
        y: string; // 위도(lat)
        address_name: string;
        road_address_name?: string;
      }

      class Geocoder {
        addressSearch(
          address: string,
          callback: (results: AddressSearchResult[], status: string) => void,
        ): void;
      }

      // 키워드로 장소 검색 (장소 추가 폼 자동완성)
      interface PlacesSearchResultItem {
        id: string;
        place_name: string;
        category_name: string;
        category_group_code: string;
        phone: string;
        address_name: string;
        road_address_name: string;
        x: string; // 경도(lng)
        y: string; // 위도(lat)
        place_url: string;
        distance?: string; // location 옵션을 준 경우 미터 단위 거리
      }

      interface PlacesSearchOptions {
        size?: number; // 1~15
        page?: number;
        location?: LatLng; // 이 좌표 기준 검색
        radius?: number; // location 과 함께, 미터 (최대 20000)
        sort?: "accuracy" | "distance";
      }

      class Places {
        keywordSearch(
          keyword: string,
          callback: (
            data: PlacesSearchResultItem[],
            status: string,
            pagination: unknown,
          ) => void,
          options?: PlacesSearchOptions,
        ): void;
        // 카테고리 그룹 코드(FD6 음식점 / CE7 카페 등)로 장소 검색
        categorySearch(
          code: string,
          callback: (
            data: PlacesSearchResultItem[],
            status: string,
            pagination: unknown,
          ) => void,
          options?: PlacesSearchOptions,
        ): void;
      }
    }
  }
}
