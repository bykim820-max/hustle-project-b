/* ============================================================
   By B · Project Plan-B — core depreciation logic + UI (Toss style)
   ============================================================ */

/* ---- 1. Business constants ---- */
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
const GRADE_LABEL = {
  S: "S급 · 미개봉",
  A: "A급 · 기스 없음",
  B: "B급 · 사용감 있음",
};

const BONUS = { warranty: 1.05, box: 1.03 };
const FLOOR_RATE = 0.05; // 바닥가: 신품가의 5% 아래로는 내려가지 않음

/* ---- 2. Pure calculation core ---- */
/**
 * 정률법(Declining Balance) 기반 시세 산출.
 * 잔존가치 = 신품가 × (1−r)^t, 최종가 = 잔존가치 × 상태가중 × 보정 (바닥가 하한)
 */
function calculatePrice({ price, rate, years, weight, bonusMult = 1 }) {
  const residual = price * Math.pow(1 - rate, years); // 잔존가치
  const raw = residual * weight * bonusMult; // 상태·보정 반영
  const floor = price * FLOOR_RATE;
  const floorApplied = raw < floor;
  const final = Math.max(raw, floor);

  // 스펙트럼 ±5%, 100원 단위 절사
  const floor100 = (n) => Math.floor(n / 100) * 100;
  return {
    rate,
    residual,
    floorApplied,
    final: floor100(final),
    min: floor100(final * 0.95),
    max: floor100(final * 1.05),
  };
}

/* ---- 3. Formatting helpers ---- */
const fmt = (n) => Math.round(n).toLocaleString("ko-KR");
const won = (n) => fmt(n) + "원";
const commas = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const track = (name, params) => {
  if (typeof gtag === "function") gtag("event", name, params || {});
};

/* ---- 4. DOM refs ---- */
const form = document.getElementById("calc-form");
const priceInput = document.getElementById("price");
const priceWrap = priceInput.closest(".input-money");
const priceHint = document.getElementById("price-hint");
const resultEl = document.getElementById("result");
const finalPriceEl = document.getElementById("final-price");
const toastEl = document.getElementById("toast");

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

/* ---- 7. Depreciation curve (Chart.js) ---- */
let depChart = null;

function renderChart({ price, catKey, years, weight, bonusMult }) {
  if (typeof Chart === "undefined") return; // CDN 로드 실패 시 차트만 생략

  const cat = CATEGORIES[catKey];
  const values = [];
  for (let t = 0; t <= 10; t++) {
    values.push(calculatePrice({ price, rate: cat.rate, years: t, weight, bonusMult }).final);
  }
  const labels = values.map((_, t) => (t === 0 ? "지금" : `${t}년`));
  const pointRadius = values.map((_, t) => (t === years ? 6 : 3));
  const pointBg = values.map((_, t) => (t === years ? "#00b8a2" : "#ffffff"));

  const csDesc = document.getElementById("chart-desc");
  csDesc.textContent =
    years === 0
      ? "지금 팔 때와 앞으로 가치가 어떻게 변하는지 보여드려요."
      : `${years}년 차인 지금이 민트색 점이에요. 1년 더 쓰면 ${won(values[Math.min(years + 1, 10)])}까지 내려가요.`;

  const config = {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: "#00b8a2",
        borderWidth: 2.5,
        pointRadius,
        pointBackgroundColor: pointBg,
        pointBorderColor: "#00b8a2",
        pointBorderWidth: 2,
        tension: 0.35,
        fill: true,
        backgroundColor: (ctx) => {
          const { chartArea, ctx: c } = ctx.chart;
          if (!chartArea) return "rgba(0, 184, 162, 0.06)";
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, "rgba(0, 184, 162, 0.14)");
          g.addColorStop(1, "rgba(0, 184, 162, 0)");
          return g;
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion.matches ? false : { duration: 480, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(25, 31, 40, 0.9)",
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          titleFont: { family: "Pretendard Variable, Pretendard, sans-serif", weight: "600" },
          bodyFont: { family: "Pretendard Variable, Pretendard, sans-serif", weight: "700", size: 14 },
          callbacks: {
            title: (items) => (items[0].dataIndex === 0 ? "미개봉 · 지금" : `${items[0].dataIndex}년 사용`),
            label: (item) => won(item.parsed.y),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: "#8b95a1",
            font: { family: "Pretendard Variable, Pretendard, sans-serif", size: 11 },
            maxRotation: 0,
            autoSkipPadding: 12,
          },
        },
        y: {
          grid: { color: "#f2f4f6" },
          border: { display: false },
          ticks: {
            color: "#8b95a1",
            font: { family: "Pretendard Variable, Pretendard, sans-serif", size: 11 },
            maxTicksLimit: 5,
            callback: (v) => (v >= 10000 ? `${Math.round(v / 10000).toLocaleString("ko-KR")}만` : fmt(v)),
          },
        },
      },
      interaction: { mode: "index", intersect: false },
    },
  };

  if (depChart) {
    depChart.data = config.data;
    depChart.options = config.options;
    depChart.update();
  } else {
    depChart = new Chart(document.getElementById("dep-chart"), config);
  }
}

/* ---- 8. Read form → calculate → render ---- */
function getFormState() {
  return {
    price: Number(priceInput.value.replace(/[^\d]/g, "")),
    catKey: form.category.value,
    years: Number(form.years.value),
    grade: form.condition.value,
    warranty: form.warranty.checked,
    box: form.box.checked,
  };
}

function runCalculation(state, { updateUrl = true } = {}) {
  const cat = CATEGORIES[state.catKey];
  const weight = GRADE[state.grade];
  const bonusMult = (state.warranty ? BONUS.warranty : 1) * (state.box ? BONUS.box : 1);

  const r = calculatePrice({
    price: state.price,
    rate: cat.rate,
    years: state.years,
    weight,
    bonusMult,
  });

  render({ r, state, cat });
  renderChart({ price: state.price, catKey: state.catKey, years: state.years, weight, bonusMult });
  if (updateUrl) syncShareUrl(state);
  track("calculate", { category: state.catKey, years: state.years, grade: state.grade });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const state = getFormState();
  if (!state.price || state.price <= 0) {
    priceWrap.classList.add("is-error");
    priceHint.classList.add("is-error");
    priceHint.textContent = "가격을 입력해야 계산할 수 있어요.";
    priceInput.focus();
    return;
  }
  runCalculation(state);
});

/* ---- 9. Render result ---- */
function render({ r, state, cat }) {
  countUp(finalPriceEl, r.final);
  document.getElementById("min-price").textContent = won(r.min);
  document.getElementById("max-price").textContent = won(r.max);

  // 동적 감가 안내 텍스트
  const ratePct = Math.round(r.rate * 100);
  const dropPct = Math.round((1 - r.final / state.price) * 100);
  const note = document.getElementById("depreciation-note");
  if (r.floorApplied) {
    note.textContent = `${cat.name}의 계산상 가치는 더 낮지만, 부품·재활용 가치를 고려한 최소 잔존가(신품가의 5%)를 적용했어요.`;
  } else if (state.years === 0) {
    note.textContent = `${cat.name}은 해마다 ${ratePct}%씩 가치가 떨어져요. 미개봉이라 상태 프리미엄이 붙었어요.`;
  } else {
    note.textContent = `${cat.name} 기준 해마다 ${ratePct}%씩 감가되어, ${state.years}년 만에 새 제품보다 약 ${dropPct}% 낮아졌어요.`;
  }

  // Breakdown
  const rows = [
    ["새 제품 가격", won(state.price)],
    [`연간 감가율 (${cat.name})`, `${ratePct}%`],
    ["사용 기간", state.years === 0 ? "미개봉" : state.years + "년"],
    ["잔존가치 (보정 전)", won(r.residual)],
    ["제품 상태", GRADE_LABEL[state.grade]],
  ];
  if (state.warranty) rows.push(["무상보증 남음", "+5%"]);
  if (state.box) rows.push(["박스·구성품 완비", "+3%"]);
  if (r.floorApplied) rows.push(["최소 잔존가 적용", "신품가의 5%"]);

  document.getElementById("breakdown").innerHTML = rows
    .map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`)
    .join("");

  // Reveal with fade-in
  resultEl.classList.remove("is-hidden");
  resultEl.classList.remove("is-visible");
  void resultEl.offsetWidth; // reflow → restart animation
  resultEl.classList.add("is-visible");
  resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---- 10. Share: URL sync + share button ---- */
function syncShareUrl(state) {
  const q = new URLSearchParams({
    c: state.catKey,
    p: state.price,
    y: state.years,
    g: state.grade,
  });
  if (state.warranty) q.set("w", "1");
  if (state.box) q.set("b", "1");
  history.replaceState(null, "", `${location.pathname}?${q}`);
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("is-show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("is-show"), 2200);
}

document.getElementById("share-btn").addEventListener("click", async () => {
  const url = location.href;
  const state = getFormState();
  const cat = CATEGORIES[state.catKey];
  const title = `${cat.name} 중고 시세 — ${finalPriceEl.textContent}원 (By B)`;
  track("share", { category: state.catKey });

  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
      return;
    } catch (err) {
      if (err.name === "AbortError") return; // 사용자가 공유 시트를 닫음
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast("링크를 복사했어요");
  } catch {
    // 클립보드 API 권한이 없는 환경용 폴백
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    showToast(ok ? "링크를 복사했어요" : "복사에 실패했어요. 주소창의 URL을 복사해 주세요.");
  }
});

/* ---- 11. Restore state from shared URL ---- */
(function restoreFromUrl() {
  const q = new URLSearchParams(location.search);
  const catKey = q.get("c");
  const price = Number(q.get("p"));
  if (!CATEGORIES[catKey] || !price || price <= 0) return;

  const years = Math.min(Math.max(Number(q.get("y")) || 0, 0), 10);
  const grade = GRADE[q.get("g")] ? q.get("g") : "A";

  form.category.value = catKey;
  priceInput.value = commas(String(Math.min(price, 999999999999)));
  form.years.value = String(years);
  form.condition.value = grade;
  form.warranty.checked = q.get("w") === "1";
  form.box.checked = q.get("b") === "1";

  // Chart.js가 defer 로드되므로 로드 완료 후 실행
  const start = () => runCalculation(getFormState(), { updateUrl: false });
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();
