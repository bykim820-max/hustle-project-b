#!/usr/bin/env node
/**
 * 중고시세 — 주간 시세 스냅샷 수집기
 *
 * 사용법: node snapshot.js [--backfill=N]
 *  - products.json의 전 모델에 대해 오늘 날짜의 S/A/B급 시세를 계산해
 *    data/price-history.json에 추가한다. (같은 날짜 재실행 시 덮어씀)
 *  - --backfill=N: 지난 N주치를 주 단위로 소급 계산해 함께 기록 (최초 1회용).
 *    정률법은 시점의 함수라 과거 값도 동일하게 재현된다. 이미 있는 날짜는 건너뜀.
 *  - 감가는 app.js/build.js와 같은 정률법이지만, 주 단위 변화가 기록되도록
 *    연식을 연속값(출시년 7월 1일 기준 경과 연수)으로 적용한다.
 *  - data/observed.json의 실측 앵커가 있으면 모델 계산 대신 앵커 기반으로 기록한다.
 *    형식: { "<slug>": { "A": 750000, "anchoredAt": "2026-07-20", "note": "민팃 65만 + 프리미엄" } }
 *    → 앵커 날짜의 A급 실측가에서 출발해 카테고리 감가율을 연속 적용
 *      (곡선의 높이는 실측이, 기울기는 모델이 결정). S/B급은 등급 가중치로 환산.
 *    → 앵커가 카테고리별 TTL보다 오래되면 자동으로 모델 계산으로 복귀하고 경고를 출력한다.
 *
 * ⚠️ 감가율·등급 가중치는 app.js/build.js와 반드시 동기화할 것.
 */
const fs = require("fs");
const path = require("path");

/* ---- app.js/build.js와 동기화되는 상수 ---- */
const RATES = {
  fridge: 0.10, washer: 0.12, aircon: 0.11, tv: 0.15, laptop: 0.20,
  phone: 0.25, tablet: 0.18, console: 0.15, etc: 0.14,
};
const GRADE = { S: 1.10, A: 1.00, B: 0.85 };
const FLOOR_RATE = 0.05;

/* 실측 앵커 유효기간(주). 지나면 모델 계산으로 자동 복귀 — 오래된 실측가를
   "실측 기반"으로 계속 표기하지 않기 위한 안전장치. */
const ANCHOR_TTL_WEEKS = {
  phone: 8, tablet: 12, laptop: 12, console: 12,
  tv: 24, fridge: 24, washer: 24, aircon: 24, etc: 24,
};

const floor100 = (n) => Math.floor(n / 100) * 100;
const snap = (price, rate, years, weight) =>
  floor100(Math.max(price * Math.pow(1 - rate, years) * weight, price * FLOOR_RATE));

/* ---- 날짜 (KST 기준) ---- */
const now = new Date();
const kstDate = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const TODAY = kstDate(now.getTime());

/* 연식: 출시년 7월 1일(연중 중간값) 기준 경과 연수, [0, 10] 클램프 */
const MS_YEAR = 365.25 * 24 * 3600 * 1000;
const MS_WEEK = 7 * 24 * 3600 * 1000;
const ageYears = (year, atMs) =>
  Math.min(Math.max((atMs - Date.UTC(year, 6, 1)) / MS_YEAR, 0), 10);

/* --backfill=N 파싱 */
const backfillArg = process.argv.find((a) => a.startsWith("--backfill="));
const backfillWeeks = backfillArg ? Math.max(parseInt(backfillArg.split("=")[1], 10) || 0, 0) : 0;

/* ---- 데이터 로드 ---- */
const ROOT = __dirname;
const HISTORY_PATH = path.join(ROOT, "data", "price-history.json");
const { products } = JSON.parse(fs.readFileSync(path.join(ROOT, "products.json"), "utf8"));

let observed = {};
try {
  observed = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "observed.json"), "utf8"));
} catch { /* 실측가 파일 없으면 전부 모델 계산 */ }

let history = {
  _comment: "주간 시세 스냅샷 (snapshot.js가 생성). 수동 편집 금지 — 실측가 반영은 data/observed.json 사용.",
  models: {},
};
try {
  history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  history.models = history.models || {};
} catch { /* 첫 실행: 위 기본값으로 시작 */ }

/* ---- 스냅샷 계산 ---- */
/* 기록 시점 목록: 백필(과거 N주, 이미 있는 날짜는 건너뜀) + 오늘 */
const moments = [];
for (let w = backfillWeeks; w >= 1; w--) moments.push(now.getTime() - w * MS_WEEK);
moments.push(now.getTime());

/* 앵커 기반 시세: 앵커 A급가 × (1-감가율)^(앵커 이후 경과연수). 유효하지 않으면 null */
function anchoredPrice(p, rate, atMs) {
  const obs = observed[p.slug];
  if (!obs || !(obs.A > 0)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(obs.anchoredAt || "")) {
    warnOnce(p.slug, `${p.slug}: anchoredAt(YYYY-MM-DD)이 없어 실측 앵커를 무시함`);
    return null;
  }
  const anchorMs = Date.parse(obs.anchoredAt + "T00:00:00+09:00");
  const ageWeeks = (atMs - anchorMs) / MS_WEEK;
  if (ageWeeks < 0) return null; // 앵커 이전 시점(백필)은 모델 계산
  const ttl = ANCHOR_TTL_WEEKS[p.cat] ?? 12;
  if (ageWeeks > ttl) {
    warnOnce(p.slug, `⚠️ ${p.slug}: 앵커(${obs.anchoredAt})가 TTL ${ttl}주를 지나 모델 계산으로 복귀 — 재실측 후 observed.json 갱신 권장`);
    return null;
  }
  const decayed = obs.A * Math.pow(1 - rate, (atMs - anchorMs) / MS_YEAR);
  return Math.max(decayed, p.price * FLOOR_RATE);
}

const warned = new Set();
const warnOnce = (key, msg) => {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
};

let count = 0;
let observedCount = 0;
for (const p of products) {
  const rate = RATES[p.cat];
  if (!rate) {
    console.error(`SKIP ${p.slug}: 알 수 없는 카테고리 '${p.cat}'`);
    continue;
  }

  const series = history.models[p.slug] || [];
  const has = (date) => series.some((e) => e.date === date);

  for (const atMs of moments) {
    const date = kstDate(atMs);
    const isToday = date === TODAY;
    if (!isToday && has(date)) continue; // 백필은 빈 날짜만 채움

    let entry;
    const anchorA = anchoredPrice(p, rate, atMs);
    if (anchorA !== null) {
      entry = {
        date,
        S: floor100(anchorA * GRADE.S),
        A: floor100(anchorA * GRADE.A),
        B: floor100(anchorA * GRADE.B),
        src: "observed",
      };
      if (isToday) observedCount++;
    } else {
      const years = ageYears(p.year, atMs);
      entry = {
        date,
        S: snap(p.price, rate, years, GRADE.S),
        A: snap(p.price, rate, years, GRADE.A),
        B: snap(p.price, rate, years, GRADE.B),
        src: "model",
      };
    }

    const idx = series.findIndex((e) => e.date === date);
    if (idx >= 0) series[idx] = entry; // 오늘 재실행 시 덮어씀
    else series.push(entry);
  }

  series.sort((a, b) => a.date.localeCompare(b.date));
  history.models[p.slug] = series;
  count++;
}

/* products.json에서 빠진 모델의 과거 기록은 보존 (페이지 재생성 시 무시됨) */

fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 1) + "\n");
console.log(
  `✅ ${TODAY} 스냅샷 완료: ${count}개 모델 (실측 ${observedCount} · 모델계산 ${count - observedCount})`
);
