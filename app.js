/* ============================================================
   By B · Project Plan-B — core depreciation logic + UI (Toss style)
   ============================================================ */

/* ---- 1. Business constants (spec §2) ---- */
const DEPRECIATION_RATE = {
  major: 0.12, // 대형가전
  digital: 0.22, // 디지털기기
};

const CONDITION_LABEL = {
  "1.10": "S급 · 미개봉",
  "1.00": "A급 · 기스 없음",
  "0.85": "B급 · 사용감 있음",
};

/* ---- 2. Pure calculation core ---- */
/**
 * 정률법(Declining Balance) 기반 시세 산출.
 * @returns {{residual:number, final:number, min:number, max:number, rate:number}}
 */
function calculatePrice({ price, category, years, weight }) {
  const rate = DEPRECIATION_RATE[category];
  const residual = price * Math.pow(1 - rate, years); // 잔존가치
  const final = residual * weight; // 상태 가중 최종가

  // 스펙트럼 ±5%, 100원 단위 절사
  const floor100 = (n) => Math.floor(n / 100) * 100;
  return {
    rate,
    residual,
    final: floor100(final),
    min: floor100(final * 0.95),
    max: floor100(final * 1.05),
  };
}

/* ---- 3. Formatting helpers ---- */
const fmt = (n) => Math.round(n).toLocaleString("ko-KR");
const won = (n) => fmt(n) + "원";
const commas = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/* ---- 4. DOM refs ---- */
const form = document.getElementById("calc-form");
const priceInput = document.getElementById("price");
const priceWrap = priceInput.closest(".input-money");
const priceHint = document.getElementById("price-hint");
const resultEl = document.getElementById("result");
const finalPriceEl = document.getElementById("final-price");

/* ---- 5. Live comma formatting on price input ---- */
priceInput.addEventListener("input", () => {
  const digits = priceInput.value.replace(/[^\d]/g, "").slice(0, 12);
  priceInput.value = digits ? commas(digits) : "";
  priceWrap.classList.remove("is-error");
  priceHint.classList.remove("is-error");
  priceHint.textContent = "구매 당시 가격을 입력해 주세요.";
});

/* ---- 6. Count-up animation (Toss signature) ---- */
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let countUpRaf = null;
let countUpTimer = null;

function countUp(el, target, duration = 640) {
  if (countUpRaf) cancelAnimationFrame(countUpRaf);
  if (countUpTimer) clearTimeout(countUpTimer);
  if (reducedMotion.matches || target === 0) {
    el.textContent = fmt(target);
    return;
  }
  const start = performance.now();
  const easeOutQuint = (x) => 1 - Math.pow(1 - x, 5);
  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = fmt(target * easeOutQuint(p));
    if (p < 1) countUpRaf = requestAnimationFrame(tick);
  };
  countUpRaf = requestAnimationFrame(tick);
  // rAF는 백그라운드 탭에서 멈추므로 종료 시점에 최종값을 보장
  countUpTimer = setTimeout(() => {
    if (countUpRaf) cancelAnimationFrame(countUpRaf);
    el.textContent = fmt(target);
  }, duration + 50);
}

/* ---- 7. Submit → calculate → render ---- */
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const price = Number(priceInput.value.replace(/[^\d]/g, ""));
  if (!price || price <= 0) {
    priceWrap.classList.add("is-error");
    priceHint.classList.add("is-error");
    priceHint.textContent = "가격을 입력해야 계산할 수 있어요.";
    priceInput.focus();
    return;
  }

  const category = form.category.value;
  const years = Number(form.years.value);
  const weight = Number(form.condition.value);

  const r = calculatePrice({ price, category, years, weight });
  render({ r, price, category, years, weight });
});

/* ---- 8. Render result ---- */
function render({ r, price, category, years, weight }) {
  countUp(finalPriceEl, r.final);
  document.getElementById("min-price").textContent = won(r.min);
  document.getElementById("max-price").textContent = won(r.max);

  // 동적 감가 안내 텍스트
  const catName = category === "major" ? "대형가전" : "디지털기기";
  const ratePct = Math.round(r.rate * 100);
  const dropPct = Math.round((1 - r.final / price) * 100);
  const note = document.getElementById("depreciation-note");
  if (years === 0) {
    note.textContent = `${catName}은 해마다 ${ratePct}%씩 가치가 떨어져요. 미개봉이라 상태 프리미엄이 붙었어요.`;
  } else {
    note.textContent = `${catName} 기준 해마다 ${ratePct}%씩 감가되어, ${years}년 만에 새 제품보다 약 ${dropPct}% 낮아졌어요.`;
  }

  // Breakdown
  document.getElementById("breakdown").innerHTML = `
    <li><span>새 제품 가격</span><span>${won(price)}</span></li>
    <li><span>연간 감가율 (${catName})</span><span>${ratePct}%</span></li>
    <li><span>사용 기간</span><span>${years === 0 ? "미개봉" : years + "년"}</span></li>
    <li><span>잔존가치 (상태 반영 전)</span><span>${won(r.residual)}</span></li>
    <li><span>제품 상태</span><span>${CONDITION_LABEL[weight.toFixed(2)]}</span></li>
  `;

  // Reveal with fade-in
  resultEl.classList.remove("is-hidden");
  resultEl.classList.remove("is-visible");
  void resultEl.offsetWidth; // reflow → restart animation
  resultEl.classList.add("is-visible");
  resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
