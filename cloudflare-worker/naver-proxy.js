/**
 * By B — 네이버 쇼핑 검색 API 프록시 (Cloudflare Worker)
 *
 * 목적: 정적 사이트(GitHub Pages)에서 네이버 API 키를 노출하지 않고
 *       상품 검색을 호출하기 위한 서버리스 프록시.
 *
 * ── 배포 방법 ─────────────────────────────────────────────
 * 1. 네이버 개발자센터(https://developers.naver.com/apps)에서
 *    애플리케이션 등록 → 사용 API: "검색" 선택 → Client ID/Secret 발급
 * 2. Cloudflare 대시보드 → Workers & Pages → Create Worker
 *    → 이 파일 내용을 붙여넣고 Deploy
 * 3. Worker 설정 → Variables → 환경변수 추가 (Encrypt 체크):
 *    - NAVER_CLIENT_ID
 *    - NAVER_CLIENT_SECRET
 * 4. 발급된 Worker URL(https://<이름>.<계정>.workers.dev)을
 *    app.js 상단의 NAVER_PROXY_URL에 입력
 * ──────────────────────────────────────────────────────────
 */

// 허용 오리진: 배포 사이트 + 로컬 개발
const ALLOWED_ORIGINS = [
  "https://bykim820-max.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (!allowed) {
      return json({ error: "origin not allowed" }, 403, cors);
    }

    const url = new URL(request.url);
    const query = (url.searchParams.get("query") || "").trim().slice(0, 100);
    if (!query) {
      return json({ error: "query required" }, 400, cors);
    }

    const api = new URL("https://openapi.naver.com/v1/search/shop.json");
    api.searchParams.set("query", query);
    api.searchParams.set("display", "5");
    api.searchParams.set("sort", "sim");

    const res = await fetch(api, {
      headers: {
        "X-Naver-Client-Id": env.NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET,
      },
    });
    if (!res.ok) {
      return json({ error: "naver api error", status: res.status }, 502, cors);
    }

    const data = await res.json();
    // 프론트에 필요한 필드만 추려서 전달
    const items = (data.items || []).map((it) => ({
      title: it.title.replace(/<[^>]+>/g, ""), // <b> 태그 제거
      lprice: Number(it.lprice) || 0,
      mallName: it.mallName,
      image: it.image,
      link: it.link,
    }));

    return json({ items }, 200, {
      ...cors,
      "Cache-Control": "public, max-age=3600", // 같은 검색어 1시간 캐시
    });
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
