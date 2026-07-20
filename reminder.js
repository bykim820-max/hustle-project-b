#!/usr/bin/env node
/**
 * 중고시세 — 월간 시세 확인 리마인더 본문 생성기
 *
 * 사용법: node reminder.js  (마크다운을 stdout으로 출력)
 *  - data/watchlist.json의 모델별로 조회 링크·현재 기록가·앵커 상태를 표로 정리한다.
 *  - GitHub Actions(monthly-price-check.yml)가 이 출력으로 이슈를 생성한다.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const read = (p, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); }
  catch { return fallback; }
};

const { products } = read("products.json", { products: [] });
const watchlist = read("data/watchlist.json", { slugs: [] }).slugs || [];
const observed = read("data/observed.json", {});
const historyModels = read("data/price-history.json", { models: {} }).models || {};

/* snapshot.js와 동기화 */
const ANCHOR_TTL_WEEKS = {
  phone: 8, tablet: 12, laptop: 12, console: 12,
  tv: 24, fridge: 24, washer: 24, aircon: 24, etc: 24,
};
const PHONE_LIKE = new Set(["phone", "tablet"]);

const now = Date.now();
const MS_WEEK = 7 * 24 * 3600 * 1000;
const won = (n) => n.toLocaleString("ko-KR") + "원";
const enc = encodeURIComponent;

const byId = Object.fromEntries(products.map((p) => [p.slug, p]));

function anchorStatus(p) {
  const obs = observed[p.slug];
  if (!obs || !(obs.A > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(obs.anchoredAt || ""))
    return "— (모델 추정)";
  const weeks = Math.floor((now - Date.parse(obs.anchoredAt + "T00:00:00+09:00")) / MS_WEEK);
  const ttl = ANCHOR_TTL_WEEKS[p.cat] ?? 12;
  if (weeks > ttl) return `❌ 만료 (${weeks}주 전 앵커)`;
  if (weeks > ttl - 2) return `⚠️ 만료 임박 (${weeks}주 전)`;
  return `✅ ${weeks}주 전 실측`;
}

function lastRecorded(p) {
  const series = historyModels[p.slug] || [];
  const last = series[series.length - 1];
  return last ? `${won(last.A)}${last.src === "observed" ? " (실측)" : ""}` : "기록 없음";
}

function links(p) {
  const q = p.name;
  const out = [];
  if (PHONE_LIKE.has(p.cat)) {
    out.push(`[민팃](https://www.mintit.co.kr/)`);
    out.push(`[번개장터](https://m.bunjang.co.kr/search/products?q=${enc(q)})`);
  }
  out.push(`[네이버쇼핑](https://search.shopping.naver.com/search/all?query=${enc("중고 " + q)})`);
  out.push(`[당근](https://www.daangn.com/search/${enc(q)})`);
  return out.join(" · ");
}

function table(list) {
  const head = "| 모델 | 현재 기록가 (A급) | 앵커 상태 | 조회 |\n|---|---|---|---|";
  const rows = list.map(
    (p) => `| ${p.name} | ${lastRecorded(p)} | ${anchorStatus(p)} | ${links(p)} |`
  );
  return [head, ...rows].join("\n");
}

const watched = [];
for (const slug of watchlist) {
  const p = byId[slug];
  if (p) watched.push(p);
  else console.error(`WARN: watchlist의 '${slug}'가 products.json에 없음`);
}
const phones = watched.filter((p) => PHONE_LIKE.has(p.cat));
const appliances = watched.filter((p) => !PHONE_LIKE.has(p.cat));

const body = `이번 달 시세 확인 대상이에요. 링크에서 가격을 확인하고 \`data/observed.json\`에 앵커를 입력해 주세요.

## 📱 폰·태블릿 (매월 권장, 앵커 TTL 8~12주)

${table(phones)}

## 🧊 대형·생활가전 (분기 1회면 충분, 앵커 TTL 24주)

${table(appliances)}

## 입력 방법

\`data/observed.json\`에 A급(생활기스 없음) 기준 **개인거래 적정가** 하나만 넣으면 돼요:

\`\`\`json
{
  "galaxy-z-fold5": { "A": 750000, "anchoredAt": "확인한 날짜 YYYY-MM-DD", "note": "민팃 65만 + 프리미엄" }
}
\`\`\`

- 매입가(민팃)를 봤다면 개인거래 프리미엄(+10~20%)을 더해 입력
- 호가(번개장터·당근)를 봤다면 매물 5~6개의 중앙값에서 네고 여지(-5%)를 빼고 입력
- 입력 후에는 다음 주 월요일 스냅샷부터 자동 반영 · 감가도 자동 적용이라 그대로 두면 됩니다
- ❌ 만료 표시가 있는 모델만 재실측하면 돼요

체크가 끝나면 이 이슈를 닫아 주세요. ✅
`;

process.stdout.write(body);
