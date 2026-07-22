#!/usr/bin/env node
/**
 * 중고시세 — 모델별 랜딩 페이지 / sitemap.xml / rss.xml 생성기
 *
 * 사용법: node build.js
 *  - products.json을 읽어 price/<slug>.html + price/index.html 생성
 *  - sitemap.xml, rss.xml 재생성
 *
 * ⚠️ 감가율·등급 가중치는 app.js와 반드시 동기화할 것.
 */
const fs = require("fs");
const path = require("path");

const SITE = "https://jungosise.com";
const TODAY = new Date().toISOString().slice(0, 10);
const THIS_YEAR = new Date().getFullYear();

/* ---- app.js와 동기화되는 상수 ---- */
const CATEGORIES = {
  fridge: { name: "냉장고", rate: 0.10, emoji: "🧊" },
  washer: { name: "세탁기·건조기", rate: 0.12, emoji: "🌀" },
  aircon: { name: "에어컨", rate: 0.11, emoji: "❄️" },
  tv: { name: "TV", rate: 0.15, emoji: "📺" },
  laptop: { name: "노트북", rate: 0.20, emoji: "💻" },
  phone: { name: "스마트폰", rate: 0.25, emoji: "📱" },
  tablet: { name: "태블릿", rate: 0.18, emoji: "📟" },
  console: { name: "게임기", rate: 0.15, emoji: "🎮" },
  etc: { name: "기타 가전", rate: 0.14, emoji: "🔌" },
};
const GRADE = { S: 1.10, A: 1.00, B: 0.85 };
const FLOOR_RATE = 0.05;

const floor100 = (n) => Math.floor(n / 100) * 100;
const calc = (price, rate, years, weight) =>
  floor100(Math.max(price * Math.pow(1 - rate, years) * weight, price * FLOOR_RATE));
const won = (n) => n.toLocaleString("ko-KR") + "원";

/* ---- 공통 head 스니펫 ---- */
const HEAD_COMMON = `
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-P5XSH5EC9G"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-P5XSH5EC9G');
  </script>
  <!-- Microsoft Clarity -->
  <script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "xg13e627a7");
  </script>
  <meta name="naver-site-verification" content="0bf3b2b266655f83f5c634a6391553410bbe6571" />
  <meta name="google-adsense-account" content="ca-pub-9798410863522242" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9798410863522242" crossorigin="anonymous"></script>
  <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />`;

const nav = (active) => `
    <nav class="nav" aria-label="주요 메뉴">
      <a class="nav__logo" href="../">중고시세</a>
      <a class="nav__link" href="../">시세 계산기</a>
      <a class="nav__link${active === "models" ? " is-active" : ""}" href="./">모델별 시세</a>
      <a class="nav__link" href="../guide.html">판매 가이드</a>
      <a class="nav__link" href="../tips/">꿀팁</a>
      <a class="nav__link" href="../faq.html">FAQ</a>
      <a class="nav__link" href="../about.html">소개</a>
    </nav>`;

/* ---- 꿀팁 아티클 (tips/*.html은 수기 작성, 여기엔 sitemap/RSS 등록용 메타만) ---- */
const ARTICLES = [
  { slug: "aircon-sell-timing", title: "에어컨 중고 판매, 여름이 골든타임인 이유", desc: "계절별 시세 곡선, 이전설치비 관례, 판매자 실수 5가지" },
  { slug: "move-sell-or-keep", title: "이사할 때 가전, 팔까 가져갈까?", desc: "운반비 vs 잔존가치, 손익으로 따지는 판단 공식" },
  { slug: "fridge-sell-checklist", title: "냉장고 중고로 팔 때 체크리스트", desc: "냄새·성에 제거부터 운반 문제까지 실전 정리" },
  { slug: "washer-sell-guide", title: "세탁기·건조기 중고 거래 가이드", desc: "통세척, 드럼 vs 통돌이, 분쟁 예방법" },
  { slug: "free-disposal-guide", title: "폐가전 무상수거 완전정리 (1599-0903)", desc: "무료 수거 대상, 신청 방법, 팔까 버릴까 기준" },
  { slug: "moving-season-prep", title: "이사철 가전 정리, 4주 타임라인", desc: "D-4주 시세 파악부터 당일 수거까지 일정표" },
  { slug: "platform-comparison", title: "당근 vs 번개장터 vs 중고나라 — 가전은 어디서 팔까?", desc: "품목별 플랫폼 유불리와 멀티 등록 전략" },
  { slug: "tv-sell-guide", title: "TV 중고로 팔 때 알아야 할 것들", desc: "불량화소·번인 체크, 벽걸이 철거, 운반 요령" },
  { slug: "reset-before-sell", title: "중고로 팔기 전 데이터 완전 삭제 가이드", desc: "폰·노트북·태블릿 기기별 초기화 순서" },
  { slug: "buying-checklist", title: "중고 가전 사도 될까? 사기 전 체크리스트", desc: "피해야 할 매물 신호, 품목별 현장 확인 포인트" },
];

const footer = `
    <footer class="app__footer">
      <div class="footer-links">
        <a href="../">시세 계산기</a>
        <a href="./">모델별 시세</a>
        <a href="../tips/">꿀팁</a>
        <a href="../guide.html">판매 가이드</a>
        <a href="../faq.html">FAQ</a>
        <a href="../privacy.html">개인정보처리방침</a>
      </div>
      <p>© ${THIS_YEAR} 중고시세 · 산출 결과는 참고용이에요. 실제 거래가와 다를 수 있어요.</p>
    </footer>`;

/* ---- 카테고리별 소개 문구 ---- */
const CAT_INTRO = {
  fridge: "냉장고는 10년 이상 쓰는 대표 장수 가전이라 중고 가치가 천천히 떨어져요. 이사철(2~3월, 8~9월)에 수요가 몰립니다.",
  washer: "세탁기·건조기는 모터와 베어링 상태가 수명을 좌우해요. 통세척 후 판매하면 체감 등급이 올라갑니다.",
  aircon: "에어컨은 이전설치비(15~30만 원)가 거래의 변수예요. 5~6월 성수기 직전이 가장 좋은 판매 시점입니다.",
  tv: "TV는 화질 규격 세대교체에 민감해요. 스탠드·리모컨 등 구성품을 갖추면 더 좋은 값을 받을 수 있어요.",
  laptop: "노트북은 CPU 세대가 바뀔 때마다 체감 가치가 떨어져요. 배터리 성능(사이클)이 협상 포인트입니다.",
  phone: "스마트폰은 모든 가전 중 감가가 가장 가팔라요. 신모델 발표 전에 파는 것이 가장 큰 재테크입니다.",
  tablet: "태블릿은 폰보다 교체 주기가 길지만 신모델 출시 영향을 받아요. 액정 상태가 가격을 좌우합니다.",
  console: "게임기는 세대 교체 주기가 길어 가치가 비교적 안정적이에요. 패드·케이블 등 구성품 유무가 중요합니다.",
  etc: "생활가전은 위생 상태가 곧 가격이에요. 깨끗이 관리된 제품은 상한선 가격을 받을 수 있습니다.",
};

/* ---- 주간 시세 히스토리 (snapshot.js가 data/price-history.json에 축적) ---- */
let HISTORY = {};
try {
  HISTORY = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "price-history.json"), "utf8")).models || {};
} catch { /* 히스토리 없으면 추이 섹션 생략 */ }

const TREND_WEEKS = 13; // 최근 3개월(13주)
const TREND_MIN_POINTS = 3; // 이보다 적으면 섹션 미노출

const dateLabel = (iso) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;

/* A급 시세 추이 — 외부 의존성 없는 인라인 SVG 라인 차트 */
function trendSection(p) {
  const series = (HISTORY[p.slug] || []).slice(-TREND_WEEKS);
  if (series.length < TREND_MIN_POINTS) return "";

  const W = 640, H = 220, PL = 64, PR = 20, PT = 18, PB = 34;
  const vals = series.map((s) => s.A);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(hi - lo, hi * 0.02); // 변동이 거의 없어도 선이 붙지 않게
  hi += span * 0.2;
  lo = Math.max(lo - span * 0.2, 0);
  const x = (i) => PL + (i * (W - PL - PR)) / (series.length - 1);
  const y = (v) => PT + ((hi - v) * (H - PT - PB)) / (hi - lo);
  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.A).toFixed(1)}`).join(" ");

  const first = series[0], last = series[series.length - 1];
  const diff = last.A - first.A;
  const pct = ((diff / first.A) * 100).toFixed(1);
  const manLabel = (v) => `${Math.round(v / 10000).toLocaleString("ko-KR")}만`;
  const trendText =
    diff === 0
      ? `최근 ${series.length}주간 A급 시세는 ${won(last.A)} 수준을 유지하고 있어요.`
      : `최근 ${series.length}주간 A급 시세는 ${won(first.A)}에서 ${won(last.A)}(으)로 약 ${Math.abs(pct)}% ${diff < 0 ? "내렸어요" : "올랐어요"}.`;

  return `
      <h2>최근 시세 추이</h2>
      <p>${trendText} 매주 기록하는 주간 스냅샷 기준이라 표의 연 단위 시세와 조금 다를 수 있어요.</p>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${p.name} 최근 ${series.length}주 A급 시세 추이 그래프" style="width:100%;height:auto;">
        <title>${p.name} A급 주간 시세 추이</title>
        <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="#e5e8eb" />
        <text x="${PL - 8}" y="${y(hi) + 4}" text-anchor="end" font-size="11" fill="#8b95a1">${manLabel(hi)}</text>
        <text x="${PL - 8}" y="${y(lo) + 4}" text-anchor="end" font-size="11" fill="#8b95a1">${manLabel(lo)}</text>
        <polyline points="${pts}" fill="none" stroke="#00b8a2" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        <circle cx="${x(0)}" cy="${y(first.A)}" r="3.5" fill="#ffffff" stroke="#00b8a2" stroke-width="2" />
        <circle cx="${x(series.length - 1)}" cy="${y(last.A)}" r="4.5" fill="#00b8a2" />
        <text x="${x(0)}" y="${H - PB + 18}" text-anchor="start" font-size="11" fill="#8b95a1">${dateLabel(first.date)}</text>
        <text x="${x(series.length - 1)}" y="${H - PB + 18}" text-anchor="end" font-size="11" fill="#8b95a1">${dateLabel(last.date)}</text>
      </svg>
`;
}

/* ---- 빌드 시작 ---- */
const { products } = JSON.parse(fs.readFileSync(path.join(__dirname, "products.json"), "utf8"));
const outDir = path.join(__dirname, "price");
fs.mkdirSync(outDir, { recursive: true });

const YEARS_ROWS = [0, 1, 2, 3, 4, 5, 7, 10];

function productPage(p) {
  const cat = CATEGORIES[p.cat];
  const age = Math.max(THIS_YEAR - p.year, 0);
  const usedYears = Math.min(Math.max(age, 0), 10);
  const nowA = calc(p.price, cat.rate, usedYears, GRADE.A);
  const nowS = calc(p.price, cat.rate, usedYears, GRADE.S);
  const nowB = calc(p.price, cat.rate, usedYears, GRADE.B);
  const ratePct = Math.round(cat.rate * 100);
  const url = `${SITE}/price/${p.slug}.html`;
  const deepLink = `../?c=${p.cat}&p=${p.price}&y=${usedYears}&g=A`;

  const tableRows = YEARS_ROWS.map((y) => {
    const label = y === 0 ? "미개봉" : `${y}년 사용`;
    const mark = y === usedYears ? " class=\"is-now\"" : "";
    return `<tr${mark}><td>${label}${y === usedYears ? " (현재 연식)" : ""}</td><td>${won(calc(p.price, cat.rate, y, GRADE.S))}</td><td>${won(calc(p.price, cat.rate, y, GRADE.A))}</td><td>${won(calc(p.price, cat.rate, y, GRADE.B))}</td></tr>`;
  }).join("\n          ");

  const faq = [
    {
      q: `${p.name} 중고 가격은 지금 얼마인가요?`,
      a: `${p.year}년 출시가 ${won(p.price)} 기준, ${usedYears}년차인 ${THIS_YEAR}년 현재 A급(생활기스 없음) 상태라면 약 ${won(nowA)}이 적정선이에요. 미개봉급(S급)은 약 ${won(nowS)}, 사용감이 있는 B급은 약 ${won(nowB)}입니다.`,
    },
    {
      q: `${p.name}의 중고 가치는 매년 얼마나 떨어지나요?`,
      a: `${cat.name} 카테고리는 정률법 기준 매년 약 ${ratePct}%씩 잔존가치가 감소해요. 첫 1~2년에 가장 크게 떨어지고 갈수록 완만해집니다.`,
    },
    {
      q: `${p.name}을(를) 더 비싸게 팔려면 어떻게 하나요?`,
      a: `무상보증이 남아 있으면 +5%, 정품 박스와 구성품이 온전하면 +3%의 프리미엄을 기대할 수 있어요. 판매 전 청소와 밝은 낮 사진 6장 이상이 기본입니다. 자세한 내용은 중고시세 판매 가이드를 참고하세요.`,
    },
  ];

  // 모델 고유 FAQ — 체크포인트 기반, 페이지마다 답변이 달라져 중복 콘텐츠를 줄여줌
  if (Array.isArray(p.checks) && p.checks.length) {
    faq.push({
      q: `${p.name} 중고로 거래할 때 꼭 확인할 점은?`,
      a: `${p.checks.map((c, i) => `${i + 1}) ${c}`).join(" ")} 이 세 가지를 사진이나 영상으로 확인하면 실패 없이 거래할 수 있어요.`,
    });
  }

  // 모델 고유 문단 (products.json의 notes) — 페이지 고유성 확보용
  const notesBlock = p.notes
    ? `\n      <h2>${p.name} 거래 포인트</h2>\n      <p>${p.notes}</p>\n`
    : "";

  // 모델별 체크포인트 리스트 — 시세를 가르는 실질 변수 (고유 콘텐츠)
  const checksBlock = Array.isArray(p.checks) && p.checks.length
    ? `\n      <h2>${p.name} 시세를 가르는 체크포인트</h2>\n      <p>같은 ${p.name}라도 아래 항목에 따라 실거래가가 크게 달라져요. 팔거나 살 때 먼저 확인하세요.</p>\n      <ul class="checks">\n        ${p.checks.map((c) => `<li>${c}</li>`).join("\n        ")}\n      </ul>\n`
    : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "중고시세", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "모델별 시세", item: `${SITE}/price/` },
          { "@type": "ListItem", position: 3, name: p.name, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${p.name} 중고 가격 시세 (${THIS_YEAR}년) | 중고시세</title>
  <meta name="description" content="${THIS_YEAR}년 ${p.name} 중고 시세: A급 기준 약 ${won(nowA)}. 정률법 감가상각으로 계산한 연차별·상태별 적정 가격표와 판매 팁을 확인하세요." />
  <link rel="canonical" href="${url}" />
  <meta property="og:title" content="${p.name} 중고 가격 시세 (${THIS_YEAR}년) | 중고시세" />
  <meta property="og:description" content="A급 기준 약 ${won(nowA)} · 연차별/상태별 시세표 제공" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${url}" />
${HEAD_COMMON}
  <link rel="stylesheet" href="../styles.css" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
  <main class="app">
${nav("models")}
    <header class="page-hero">
      <span class="brand-chip">${cat.emoji} ${cat.name}</span>
      <h1 class="title">${p.name}<br />중고 가격, 지금 얼마?</h1>
      <p class="subtitle">${p.year}년 출시 · 출시가 ${won(p.price)} 기준 정률법 시세예요.</p>
    </header>

    <article class="prose">
      <p class="callout">💰 <strong>${THIS_YEAR}년 현재 (${usedYears}년차) 적정 시세</strong><br />
      S급 ${won(nowS)} · <strong>A급 ${won(nowA)}</strong> · B급 ${won(nowB)}</p>
      <p class="dateline">📅 ${TODAY} 기준 · 매주 시세 갱신</p>

      <p>${p.intro || CAT_INTRO[p.cat]}</p>
${notesBlock}
      <h2>연차별·상태별 시세표</h2>
      <p>${cat.name}의 연간 감가율 ${ratePct}%를 적용한 상태 등급별 적정 가격이에요. 표의 가격은 출시가 기준이며, 실제 구매가를 알고 있다면 계산기에서 더 정확하게 확인할 수 있어요.</p>
      <table>
        <thead><tr><th>사용 기간</th><th>S급 (미개봉급)</th><th>A급 (기스 없음)</th><th>B급 (사용감)</th></tr></thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <p class="callout">🧮 실제 구매 가격과 상태로 <a href="${deepLink}">내 ${p.name} 시세 정확히 계산하기</a></p>
${checksBlock}${trendSection(p)}
      <h2>자주 묻는 질문</h2>
      ${faq.map((f) => `<h3>${f.q}</h3>\n      <p>${f.a}</p>`).join("\n      ")}

      <h2>더 알아보기</h2>
      <ul>
        <li><a href="../guide.html">중고 가전 제값 받고 파는 법 — 판매 가이드</a></li>
        <li><a href="./">다른 모델 시세 보기</a></li>
      </ul>
    </article>
${footer}
  </main>
</body>
</html>
`;
}

/* ---- 모델 목록 페이지 ---- */
function indexPage() {
  const byCat = {};
  for (const p of products) (byCat[p.cat] = byCat[p.cat] || []).push(p);

  const sections = Object.entries(byCat)
    .map(([catKey, list]) => {
      const cat = CATEGORIES[catKey];
      const items = list
        .map((p) => {
          const usedYears = Math.min(Math.max(THIS_YEAR - p.year, 0), 10);
          const nowA = calc(p.price, cat.rate, usedYears, GRADE.A);
          return `<li><a href="${p.slug}.html"><span><span class="more-links__name">${p.name}</span><span class="more-links__desc">${p.year}년 출시 · A급 약 ${won(nowA)}</span></span><span class="more-links__arrow">→</span></a></li>`;
        })
        .join("\n        ");
      return `<h2 class="more-links__title" style="margin-top:32px;">${cat.emoji} ${cat.name}</h2>\n      <ul class="more-links__list" style="margin-top:12px;">\n        ${items}\n      </ul>`;
    })
    .join("\n      ");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>인기 모델별 중고 시세 모음 (${THIS_YEAR}년) | 중고시세</title>
  <meta name="description" content="아이폰, 갤럭시, 맥북, 삼성·LG 냉장고와 세탁기까지. 인기 가전 ${products.length}개 모델의 ${THIS_YEAR}년 중고 시세를 정률법으로 계산했습니다." />
  <link rel="canonical" href="${SITE}/price/" />
  <meta property="og:title" content="인기 모델별 중고 시세 모음 (${THIS_YEAR}년) | 중고시세" />
  <meta property="og:description" content="인기 가전 ${products.length}개 모델의 중고 시세를 한눈에." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${SITE}/price/" />
${HEAD_COMMON}
  <link rel="stylesheet" href="../styles.css" />
</head>
<body>
  <main class="app">
${nav("models")}
    <header class="page-hero">
      <span class="brand-chip">모델별 시세</span>
      <h1 class="title">인기 모델 중고 시세,<br />한눈에 보세요</h1>
      <p class="subtitle">출시가와 연식 기준으로 미리 계산해 둔 ${products.length}개 모델이에요. 내 제품이 없다면 <a href="../">계산기</a>에서 직접 계산할 수 있어요.</p>
    </header>
    <section class="prose">
      ${sections}
    </section>
${footer}
  </main>
</body>
</html>
`;
}

/* ---- sitemap.xml ---- */
function sitemap() {
  const core = [
    { loc: `${SITE}/`, priority: "1.0", freq: "weekly" },
    { loc: `${SITE}/price/`, priority: "0.9", freq: "weekly" },
    { loc: `${SITE}/tips/`, priority: "0.8", freq: "weekly" },
    { loc: `${SITE}/guide.html`, priority: "0.8", freq: "monthly" },
    { loc: `${SITE}/faq.html`, priority: "0.7", freq: "monthly" },
    { loc: `${SITE}/about.html`, priority: "0.5", freq: "yearly" },
  ];
  const urls = [
    ...core,
    ...ARTICLES.map((a) => ({ loc: `${SITE}/tips/${a.slug}.html`, priority: "0.7", freq: "monthly" })),
    ...products.map((p) => ({ loc: `${SITE}/price/${p.slug}.html`, priority: "0.7", freq: "monthly" })),
  ]
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/* ---- rss.xml (네이버 서치어드바이저 제출용) ---- */
function rss() {
  const items = [
    { title: "중고 가전 시세 계산기", link: `${SITE}/`, desc: "정률법으로 계산한 합리적인 중고 가전 시세" },
    { title: "인기 모델별 중고 시세 모음", link: `${SITE}/price/`, desc: `인기 가전 ${products.length}개 모델의 중고 시세` },
    { title: "중고 가전 제값 받고 파는 법", link: `${SITE}/guide.html`, desc: "감가상각 원리부터 실전 판매 팁, 사기 예방까지" },
    { title: "자주 묻는 질문", link: `${SITE}/faq.html`, desc: "시세 계산 원리와 데이터 처리 방식" },
    ...ARTICLES.map((a) => ({ title: a.title, link: `${SITE}/tips/${a.slug}.html`, desc: a.desc })),
    ...products.map((p) => ({
      title: `${p.name} 중고 가격 시세 (${THIS_YEAR}년)`,
      link: `${SITE}/price/${p.slug}.html`,
      desc: `${p.name}의 연차별·상태별 중고 적정 가격표`,
    })),
  ]
    .map(
      (i) => `    <item>
      <title>${i.title}</title>
      <link>${i.link}</link>
      <description>${i.desc}</description>
      <pubDate>${new Date(TODAY).toUTCString()}</pubDate>
      <guid>${i.link}</guid>
    </item>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>중고시세 · 중고 가전 시세 분석기</title>
    <link>${SITE}/</link>
    <description>정률법 기반 중고 가전 시세 계산기와 모델별 시세 정보</description>
    <language>ko</language>
    <lastBuildDate>${new Date(TODAY).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

/* ---- 실행 ---- */
let count = 0;
for (const p of products) {
  if (!CATEGORIES[p.cat]) {
    console.error(`SKIP ${p.slug}: 알 수 없는 카테고리 '${p.cat}'`);
    continue;
  }
  fs.writeFileSync(path.join(outDir, `${p.slug}.html`), productPage(p));
  count++;
}
fs.writeFileSync(path.join(outDir, "index.html"), indexPage());
fs.writeFileSync(path.join(__dirname, "sitemap.xml"), sitemap());
fs.writeFileSync(path.join(__dirname, "rss.xml"), rss());
console.log(`✅ ${count}개 모델 페이지 + price/index.html + sitemap.xml + rss.xml 생성 완료`);
