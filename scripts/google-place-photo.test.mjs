import test from "node:test";
import assert from "node:assert/strict";

process.env.GOOGLE_PLACES_API_KEY = "test-key";

const { getWishlistPlacePhoto } = await import("../src/lib/googlePlacePhoto.ts");

const BASE_INPUT = {
  placeId: 1,
  name: "카멜커피 서촌점",
  address: "서울 종로구 자하문로 10",
  lat: 37.5665,
  lng: 126.978,
  existingGooglePlaceId: null,
};

const textSearchOkBody = (over = {}) => ({
  places: [
    {
      id: "ChIJ_test",
      displayName: { text: "카멜커피 서촌점" },
      formattedAddress: "대한민국 서울특별시 종로구 자하문로 10",
      location: { latitude: 37.5665, longitude: 126.978 },
      ...over,
    },
  ],
});

const detailsOkBody = () => ({
  googleMapsUri: "https://maps.google.com/?cid=123",
  photos: [
    {
      name: "places/ChIJ_test/photos/abc",
      googleMapsUri: "https://maps.google.com/photo/abc",
      authorAttributions: [{ displayName: "홍길동", uri: "https://maps.google.com/contrib/1" }],
    },
  ],
});

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function imageResponse() {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });
}

/** url별로 응답을 내려주는 fetch mock. calls 배열에 호출된 url을 기록해 호출 횟수를 검증한다. */
function installFetchMock(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return handler(String(url), init, calls);
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("좌표가 없으면 Google을 아예 호출하지 않고 no_match", async () => {
  const mock = installFetchMock(() => {
    throw new Error("fetch는 호출되면 안 된다");
  });
  try {
    const result = await getWishlistPlacePhoto({ ...BASE_INPUT, lat: null, lng: null });
    assert.equal(result.status, "no_match");
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("성공 경로: 매칭 → 사진 메타 → 이미지까지 전부 성공하면 ok + matchedGooglePlaceId", async () => {
  const mock = installFetchMock((url) => {
    if (url.includes(":searchText")) return jsonResponse(200, textSearchOkBody());
    if (url.includes("/media")) return imageResponse();
    return jsonResponse(200, detailsOkBody());
  });
  try {
    const result = await getWishlistPlacePhoto(BASE_INPUT);
    assert.equal(result.status, "ok");
    assert.equal(result.matchedGooglePlaceId, "ChIJ_test");
    assert.equal(result.googleMapsUri, "https://maps.google.com/photo/abc");
    assert.equal(result.attribution?.displayName, "홍길동");
    assert.ok(result.dataUrl?.startsWith("data:image/jpeg;base64,"));
  } finally {
    mock.restore();
  }
});

test("이름이 불일치하면 사진 메타는 조회하지 않고 no_match", async () => {
  const mock = installFetchMock((url) => {
    if (url.includes(":searchText")) {
      return jsonResponse(200, textSearchOkBody({ displayName: { text: "전혀 다른 가게" } }));
    }
    throw new Error("Place Details는 호출되면 안 된다");
  });
  try {
    const result = await getWishlistPlacePhoto(BASE_INPUT);
    assert.equal(result.status, "no_match");
  } finally {
    mock.restore();
  }
});

test("Text Search 자체가 실패(5xx, 재시도까지 실패)하면 error", async () => {
  const mock = installFetchMock((url) => {
    if (url.includes(":searchText")) return jsonResponse(500, {});
    throw new Error("Place Details는 호출되면 안 된다");
  });
  try {
    const result = await getWishlistPlacePhoto(BASE_INPUT);
    assert.equal(result.status, "error");
    // 5xx는 1회 재시도 — searchText가 정확히 2번 호출됐어야 한다.
    assert.equal(mock.calls.filter((u) => u.includes(":searchText")).length, 2);
  } finally {
    mock.restore();
  }
});

test("이미 캐시된 google_place_id가 있으면 Text Search를 건너뛴다", async () => {
  const mock = installFetchMock((url) => {
    if (url.includes(":searchText")) throw new Error("캐시가 있으면 재매칭하면 안 된다");
    if (url.includes("/media")) return imageResponse();
    return jsonResponse(200, detailsOkBody());
  });
  try {
    const result = await getWishlistPlacePhoto({ ...BASE_INPUT, existingGooglePlaceId: "ChIJ_cached" });
    assert.equal(result.status, "ok");
    assert.equal(result.matchedGooglePlaceId, undefined); // 새로 매칭한 게 아니므로 캐시 갱신 불필요
  } finally {
    mock.restore();
  }
});

test("캐시된 google_place_id가 만료됐으면(Details 404) 한 번만 재매칭한다", async () => {
  let detailsCallCount = 0;
  const mock = installFetchMock((url) => {
    if (url.includes(":searchText")) return jsonResponse(200, textSearchOkBody());
    if (url.includes("/media")) return imageResponse();
    detailsCallCount += 1;
    // 첫 Details 호출(캐시된 stale id)만 404 — 4xx는 재시도 안 하니 정확히 1번만 실패해야 한다.
    if (detailsCallCount === 1) return jsonResponse(404, {});
    return jsonResponse(200, detailsOkBody());
  });
  try {
    const result = await getWishlistPlacePhoto({ ...BASE_INPUT, existingGooglePlaceId: "ChIJ_stale" });
    assert.equal(result.status, "ok");
    assert.equal(result.matchedGooglePlaceId, "ChIJ_test");
    assert.equal(mock.calls.filter((u) => u.includes(":searchText")).length, 1);
  } finally {
    mock.restore();
  }
});

test("같은 placeId 동시 요청은 fetch를 한 번만 부른다(중복 요청 방지)", async () => {
  let searchCalls = 0;
  const mock = installFetchMock(async (url) => {
    if (url.includes(":searchText")) {
      searchCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return jsonResponse(200, textSearchOkBody());
    }
    if (url.includes("/media")) return imageResponse();
    return jsonResponse(200, detailsOkBody());
  });
  try {
    const [a, b] = await Promise.all([
      getWishlistPlacePhoto(BASE_INPUT),
      getWishlistPlacePhoto(BASE_INPUT),
    ]);
    assert.equal(a.status, "ok");
    assert.equal(b.status, "ok");
    assert.equal(searchCalls, 1);
  } finally {
    mock.restore();
  }
});
