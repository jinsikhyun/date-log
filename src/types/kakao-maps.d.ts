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
    }
  }
}
