#!/usr/bin/env node
/**
 * 중고시세 — 실측 앵커 입력 도우미
 *
 * 사용법:
 *   node observe.js <slug> <A급_실측가> "출처 메모"
 *   예) node observe.js iphone-15 520000 "민팃 A급 시세 조회"
 *
 *   node observe.js --list          # 현재 등록된 실측 앵커 목록
 *   node observe.js --remove <slug> # 앵커 제거(모델 계산으로 복귀)
 *
 * 반드시 '실제로 조회한' 거래가만 넣으세요(민팃·중고나라·당근 등).
 * 입력 후: node snapshot.js && node build.js 로 반영합니다.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OBS_PATH = path.join(ROOT, "data", "observed.json");
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const { products } = JSON.parse(fs.readFileSync(path.join(ROOT, "products.json"), "utf8"));
const slugs = new Set(products.map((p) => p.slug));

let obs = {};
try { obs = JSON.parse(fs.readFileSync(OBS_PATH, "utf8")); } catch { obs = {}; }
if (!obs._comment) {
  obs._comment = "실측 앵커. observe.js로 관리. 실제로 조회한 거래가만 입력할 것.";
}

const args = process.argv.slice(2);
const isMeta = (k) => k === "_comment" || k === "_example";

function save() {
  fs.writeFileSync(OBS_PATH, JSON.stringify(obs, null, 2) + "\n");
}

if (args[0] === "--list") {
  const rows = Object.keys(obs).filter((k) => !isMeta(k));
  if (!rows.length) { console.log("등록된 실측 앵커가 없습니다."); process.exit(0); }
  for (const slug of rows) {
    const o = obs[slug];
    console.log(`- ${slug}: A ${Number(o.A).toLocaleString("ko-KR")}원 · ${o.anchoredAt} · ${o.note || "(메모 없음)"}`);
  }
  process.exit(0);
}

if (args[0] === "--remove") {
  const slug = args[1];
  if (!slug || !obs[slug]) { console.error(`제거할 앵커 없음: ${slug}`); process.exit(1); }
  delete obs[slug];
  save();
  console.log(`✅ ${slug} 실측 앵커 제거됨 (다음 snapshot부터 모델 계산으로 복귀). node snapshot.js && node build.js 실행하세요.`);
  process.exit(0);
}

const [slug, priceRaw, ...noteParts] = args;
if (!slug || !priceRaw) {
  console.error('사용법: node observe.js <slug> <A급_실측가> "출처 메모"');
  console.error('예)   node observe.js iphone-15 520000 "민팃 A급 시세 조회"');
  process.exit(1);
}
if (!slugs.has(slug)) {
  console.error(`❌ '${slug}'는 products.json에 없는 slug입니다. 목록: node observe.js 없이 products.json 확인.`);
  process.exit(1);
}
const A = parseInt(String(priceRaw).replace(/[^0-9]/g, ""), 10);
if (!(A > 0)) { console.error(`❌ 가격이 올바르지 않습니다: ${priceRaw}`); process.exit(1); }

obs[slug] = { A, anchoredAt: kstToday(), note: noteParts.join(" ") || "실측 조회" };
save();
console.log(`✅ ${slug}: A ${A.toLocaleString("ko-KR")}원 실측 앵커 등록 (${obs[slug].anchoredAt}).`);
console.log("   반영: node snapshot.js && node build.js");
