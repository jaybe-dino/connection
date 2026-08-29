/* 실서버 연동 레이어 — 데모 엔진의 동작·화면은 그대로 두고(100% 파리티),
   핵심 액션만 백엔드에 fire-and-forget으로 이중 기록한다.
   API 주소: ?api=https://... 쿼리로 지정(localStorage에 저장) 또는 localhost 기본. */
(function () {
  try {
    var q = new URLSearchParams(location.search).get("api");
    if (q) localStorage.setItem("CONNECTION_API_URL", q);
  } catch (e) {}
  var API = (function () {
    try { return localStorage.getItem("CONNECTION_API_URL") || "http://localhost:8000"; }
    catch (e) { return "http://localhost:8000"; }
  })();
  window.__API_URL = API;

  function req(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); });
  }
  function fire(method, path, body) { req(method, path, body).catch(function () {}); }

  /* ── 게이트 결정 → 실서버 (kind 매핑, 데모 동작은 그대로) ── */
  var GATE_KIND = { pii: "PII", payout: "PAYOUT" };
  if (window.dg) {
    var _dg = window.dg;
    window.dg = function (k, v) {
      _dg(k, v);
      var kind = GATE_KIND[k];
      if (!kind) return;
      req("GET", "/gates").then(function (gates) {
        var g = gates.find(function (x) {
          return x.kind === kind && (x.state === "PENDING" || x.state === "HELD");
        });
        if (!g) return;
        fire("POST", "/gates/" + g.id + "/" + (v === "ok" ? "approve" : "hold"),
             { member_id: "kim" });
      }).catch(function () {});
    };
  }

  /* ── 내 정보 수정 → 실서버 PROFILE_UPDATED ── */
  var FIELD_MAP = { addr: "address", phone: "phone", skin: "skinType", bank: "bank" };
  if (window.saveP) {
    var _saveP = window.saveP;
    window.saveP = function (k, e) {
      var el = document.getElementById("pf_" + k);
      var val = el && el.value ? el.value.trim() : "";
      _saveP(k, e);
      if (val && FIELD_MAP[k])
        fire("PUT", "/me/c-mai/fields", { field: FIELD_MAP[k], value: val });
    };
  }

  /* ── 캠페인 지원 · 제출 → 실서버 ── */
  if (window.doApply) {
    var _doApply = window.doApply;
    window.doApply = function () {
      _doApply();
      fire("POST", "/campaigns/cmp-1/apply", { creator_id: "c-mai" });
    };
  }
  if (window.doSubmit) {
    var _doSubmit = window.doSubmit;
    window.doSubmit = function () {
      _doSubmit();
      fire("POST", "/submissions", {
        campaign_id: "cmp-1", creator_id: "c-mai",
        url: "https://tiktok.com/@ploy.skincare/video/74",
        caption: "#ad คุชชั่นกันแดด รีวิวจริงค่ะ",
      });
    };
  }

  /* ── 브랜드 가입 완료 → 신청 접수 (어드민 승인 큐로) ── */
  if (window.bjDone) {
    var _bjDone = window.bjDone;
    window.bjDone = function () {
      var B = (window.ST || {}).bj || {};
      fire("POST", "/applications", {
        slug: (B.slug || "glowlab") + "-" + Date.now().toString(36).slice(-4),
        name: "GLOWLAB", biz_no: "123-45-67890", category: "스킨케어",
        countries: ["TH", "US", "VN"],
        plan: ["starter", "growth", "enterprise"][B.plan || 1],
        site_url: B.url || "glowlab.kr",
        answers: {
          brand_one_liner: "민감성 피부를 위한 저자극 선케어",
          ideal_creator: "피부 고민을 직접 말하는 사람",
          banned_words: "미백, 효능 단정, 경쟁사 비방",
          sample_criteria: "등급 B 이상 + 태국 거주",
          voice: "존댓말 · 이모지 최소 · 태국어는 부드럽게",
        },
        contact: "hana@glowlab.kr",
      });
      _bjDone();
    };
  }
})();
