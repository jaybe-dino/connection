/* 실서버 연동 레이어 — 데모 엔진의 동작·화면은 그대로 두고(100% 파리티),
   핵심 액션만 백엔드에 fire-and-forget으로 이중 기록한다.
   API 주소: ?api=https://... 쿼리로 지정(localStorage에 저장) 또는 localhost 기본. */
(function () {
  try {
    var q = new URLSearchParams(location.search).get("api");
    if (q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) localStorage.setItem("CONNECTION_API_URL", q);
    var qk = new URLSearchParams(location.search).get("key");
    if (qk && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) localStorage.setItem("CONNECTION_ADMIN_KEY", qk);
  } catch (e) {}
  var API = (function () {
    var fallback = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
      ? "http://localhost:8000" : "https://api.theprlist.net";
    try { return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? (localStorage.getItem("CONNECTION_API_URL") || fallback) : fallback; }
    catch (e) { return fallback; }
  })();
  window.__API_URL = API;

  /* 멀티테넌시 — 브랜드 계정은 자기 브랜드만, 관리자는 '명시적으로 선택한'
     브랜드만(선택 전 null → 콘솔의 어떤 브랜드 API도 호출하지 않는다).
     숨은 glowlab 폴백 없음: 데모 브랜드도 관리자가 명시 선택해야 조회된다.
     크리에이터 등 그 외 계정은 콘솔 업무 대상이 아니다(null). */
  var adminBrand = null;
  try { adminBrand = localStorage.getItem("CONNECTION_ADMIN_BRAND") || null; } catch (e) {}
  function BRAND() {
    var me = window.__ME;
    if (!me) return null;
    if (me.kind === "brand") return me.brandId || null;
    if (me.kind === "admin") return adminBrand;
    return null;
  }

  function req(method, path, body) {
    var h = { "Content-Type": "application/json" };
    try {
      var ak = localStorage.getItem("CONNECTION_ADMIN_KEY");
      if (ak) h["X-Admin-Key"] = ak;   // 민감 API(지메일 연결 등) 간이 인증
      var jt = localStorage.getItem("CONNECTION_JWT");
      if (jt) h["Authorization"] = "Bearer " + jt;   // 실계정 세션
    } catch (e) {}
    if (path.indexOf("/brands/null/") >= 0 || path.indexOf("/brands//") >= 0)
      return Promise.reject(new Error("브랜드를 먼저 선택하세요"));
    return fetch(API + path, {
      method: method,
      headers: h,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.json().then(function(data){if(!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "요청을 처리하지 못했습니다 ("+r.status+")");return data;}); });
  }
  function fire(method, path, body) { req(method, path, body).catch(function () {}); }

  var billingInvoices = [];
  var billingConfigured = false;
  var billingStatus = "불러오는 중입니다.";
  var checkoutBusy = false;
  window.billingInvoicesHtml = function () {
    var rows = billingInvoices.filter(function (i) { return /^PRLIST_[a-f0-9]{24}$/.test(i.id) && /^\d{4}-\d{2}$/.test(i.period); });
    if(billingStatus)return '<p role="status">'+mailEscape(billingStatus)+'</p>';
    if (!rows.length) return '<p>마감된 월의 청구서가 없습니다.</p>';
    var labels = {open:'결제 대기', processing:'결제 확인 중', paid:'결제 완료', review:'거래 확인 필요'};
    return '<h3>월별 청구서</h3>' + rows.map(function (i) {
      return '<div style="padding:12px;border-bottom:1px solid #ddd">' + i.period + (i.supplement ? ' <b style="font-size:11px;color:#8a6d3b">추가분</b>' : '') + ' · ' + Number(i.quantity) + '명 · ₩' + Number(i.amount).toLocaleString() + ' (부가세 포함) · ' + (labels[i.status] || '확인 중') + (i.status === 'open' && !i.cardPayable ? ' · 카드 최소금액 1,000원 미만' : '') +
        (i.status === 'open' && billingConfigured && i.cardPayable ? ' <button class="btn" onclick="paySignupInvoice(\'' + i.id + '\')">카드 결제</button>' : '') +
        (i.status === 'processing' || i.status === 'review' ? ' <button class="btn line" onclick="checkSignupInvoice(\'' + i.id + '\')">거래 확인</button>' : '') + '</div>';
    }).join('') + (billingConfigured ? '' : '<p>결제사 연결 설정 중입니다. 청구 내역은 보관됩니다.</p>');
  };
  window.checkSignupInvoice = function (id) {
    req('POST', '/brands/' + BRAND() + '/billing/invoices/' + id + '/reconcile', {}).then(loadBilling)
      .catch(function () { toast('확인 필요', '거래 확인을 완료하지 못했습니다. 잠시 후 다시 확인해 주세요.'); });
  };
  window.paySignupInvoice = function (id) {
    if (checkoutBusy) return;
    checkoutBusy = true;
    var targetBrand = BRAND();
    req('POST', '/brands/' + targetBrand + '/billing/invoices/' + id + '/checkout', {}).then(function (order) {
      return new Promise(function (resolve, reject) {
        if (window.AUTHNICE) return resolve(order);
        var script = document.createElement('script');
        script.src = 'https://pay.nicepay.co.kr/v1/js/';
        script.onload = function () { resolve(order); };
        script.onerror = function () { script.remove(); reject(new Error('sdk')); };
        document.head.appendChild(script);
      });
    }).then(function (order) {
      if (BRAND() !== targetBrand) throw new Error('account changed');
      window.AUTHNICE.requestPay(Object.assign({}, order, {fnError: function () {
        checkoutBusy = false;
        toast('결제창 종료', '결제 내역을 새로고침해 상태를 확인해 주세요.');
      }}));
      checkoutBusy = false;
    }).catch(function () {
      checkoutBusy = false;
      toast('결제 준비 중', '결제창을 열지 못했습니다. 청구 내역을 새로고침해 주세요.');
    });
  };
  var billingVersion = 0;
  window.__billing = null;
  function loadBilling() {
    if (!BRAND()) return;
    var version = ++billingVersion;
    billingStatus="불러오는 중입니다.";
    window.__billing = null;
    billingInvoices = [];
    billingConfigured = false;
    billingCardInfo = null; billingCardMsg = ""; billingCardBusy = false;   // 브랜드 전환 혼입 방지
    req("GET", "/brands/" + BRAND() + "/billing").then(function (summary) {
      if (version !== billingVersion) return;
      window.__billing = summary;
      req('POST', '/brands/' + BRAND() + '/billing/invoices', {}).then(function (result) {
        if (version !== billingVersion) return;
        billingStatus="";
        billingInvoices = result.invoices;
        billingConfigured = result.configured;
        if ((typeof ST !== 'undefined' && ST.b === 'settle') || (typeof livePage !== 'undefined' && livePage === 'billing')) { if (window.render) render(); }
      }).catch(function(e){if(version===billingVersion){billingStatus="청구 조회 실패: "+e.message;if(window.render)render();}});
      loadBillingCard();
      if (typeof ST !== "undefined" && ST.b === "settle" && window.render) render();
    }).catch(function (e) {
      if(version===billingVersion)billingStatus="청구 조회 실패: "+e.message;
      if (version === billingVersion && typeof ST !== "undefined" && ST.b === "settle" && window.render) render();
    });
  }
  window.refreshBilling = loadBilling;

  /* ── 카드 자동청구(빌링키) — 등록/상태/해지. 카드 원문은 어디에도 보관하지
     않는다: 상태 변수·localStorage 저장 금지, submit 즉시 입력창 비움. ── */
  var billingCardInfo = null, billingCardBusy = false, billingCardMsg = "";
  function loadBillingCard() {
    if (!BRAND()) return;
    var version = billingVersion, owner = BRAND();
    req("GET", "/brands/" + owner + "/billing/card").then(function (c) {
      if (version !== billingVersion || owner !== BRAND()) return;
      billingCardInfo = c;
      if (livePage === 'billing' && window.render) render();
    }).catch(function () { if (version === billingVersion) { billingCardInfo = null; billingCardMsg = "카드 상태 조회에 실패했습니다. 새로고침해 주세요."; if(livePage === "billing" && window.render) render(); } });
  }
  window.billingCardRegister = function () {
    if (billingCardBusy || !billingCardInfo) return;
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : ""; };
    var payload = { cardNo: g("bcNo"), expYear: g("bcYY"), expMonth: g("bcMM"),
                    idNo: g("bcId"), cardPw: g("bcPw"),
                    consent: !!(document.getElementById("bcConsent") || {}).checked,
                    consentVersion: billingCardInfo.consentVersion };
    // 카드 입력값은 전송 직전에 즉시 비운다 — 성공/실패와 무관하게 화면에 남기지 않는다
    ["bcNo", "bcYY", "bcMM", "bcId", "bcPw"].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ""; });
    if (!payload.consent) { payload = null; return toast("동의 필요", "자동청구 동의 체크박스를 확인해 주세요. (카드 입력값은 안전을 위해 비웠습니다)"); }
    var owner = BRAND(), version = billingVersion;
    billingCardBusy = true; billingCardMsg = ""; render();
    req("POST", "/brands/" + owner + "/billing/card", payload).then(function (r) {
      payload = null;
      if (version !== billingVersion || owner !== BRAND()) return;
      billingCardMsg = "카드 등록 완료 (" + (r.cardLabel || "등록 카드") + ") — 등록 시 결제는 발생하지 않았습니다.";
      loadBillingCard();
    }).catch(function (e) {
      payload = null;
      if (version === billingVersion) billingCardMsg = "카드 등록 실패: " + e.message + " — 입력값은 저장되지 않았습니다. 다시 시도해 주세요.";
    }).finally(function () { if (version === billingVersion) { billingCardBusy = false; render(); } });
  };
  window.billingCardExpire = function () {
    if (billingCardBusy) return;
    var owner = BRAND(), version = billingVersion;
    billingCardBusy = true; billingCardMsg = ""; render();
    req("DELETE", "/brands/" + owner + "/billing/card").then(function (r) {
      if (version !== billingVersion || owner !== BRAND()) return;
      billingCardMsg = r.state === "expired" ? "카드 해지 완료 — 자동청구가 중단되었습니다. 미결제 청구서는 수동 결제할 수 있습니다."
                                             : (r.hint || "해지 대기 중 — 자동청구는 중단되었습니다. 잠시 후 다시 시도해 주세요.");
      loadBillingCard();
    }).catch(function (e) { if (version === billingVersion) billingCardMsg = "해지 실패: " + e.message; })
      .finally(function () { if (version === billingVersion) { billingCardBusy = false; render(); } });
  };
  window.billingCardHtml = function () {
    if (!billingCardInfo) return '<div class="cc"><div class="t">카드 자동청구</div><p>'+mailEscape(billingCardMsg || '상태를 불러오는 중입니다…')+'</p></div>';
    var c = billingCardInfo, h = '<div class="cc"><div class="t">카드 자동청구 (선택)</div>';
    if (billingCardMsg) h += '<p role="status"><b>' + mailEscape(billingCardMsg) + '</b></p>';
    var owner = window.__ME && window.__ME.kind === "brand";
    if (!c.configured && (!c.card || c.card.state === "expired")) {
      // 운영 플래그 off — 입력창을 렌더하지 않는다(카드 입력 자체가 불가)
      h += '<p>자동청구 준비 중입니다. 지금은 각 청구서의 <b>카드 결제</b> 버튼으로 수동 결제해 주세요.</p></div>';
      return h;
    }
    var attempts = (c.attempts || []).filter(function (a) { return a.outcome === 'failed' || a.outcome === 'review'; });
    if (c.card && c.card.state !== 'expired') {
      var states = { active: (c.autochargeFlag ? '자동청구 활성' : '카드 등록됨 · 자동청구 대기'), expire_pending: '해지 처리 대기 — 자동청구는 중단됨' };
      h += '<p>등록 카드: <b>' + mailEscape(c.card.cardLabel || '등록 카드') + '</b> · ' + (states[c.card.state] || mailEscape(c.card.state)) +
        '<br><small>동의 ' + mailEscape(c.card.consentVersion) + ' · ' + mailEscape((c.card.consentAt || '').slice(0, 10)) + (c.autochargeFlag ? '' : ' · 자동청구 실행은 운영 준비 중(수동 결제 가능)') + '</small></p>' +
        (owner ? '<button class="btn line" onclick="billingCardExpire()" ' + (billingCardBusy ? 'disabled' : '') + '>' + (c.card.state === 'expire_pending' ? '해지 다시 시도' : '카드 해지') + '</button>' : '<p>카드 변경·해지는 브랜드 계정으로 로그인해 주세요.</p>');
    } else if (!owner) {
      h += '<p>카드 등록은 브랜드 계정으로 로그인해 주세요.</p>';
    } else {
      h += '<p>카드를 등록하면 매월 마감된 청구서 금액(검증 가입 5,000원/명 · VAT 포함 · 고정료 0원)이 자동 결제됩니다. <b>등록 시 결제는 발생하지 않습니다.</b></p>' +
        '<label>카드번호<input id="bcNo" type="password" inputmode="numeric" autocomplete="off" placeholder="숫자만" style="width:100%;box-sizing:border-box"></label>' +
        '<div style="display:flex;gap:8px"><label style="flex:1">유효기간(YY)<input id="bcYY" maxlength="2" autocomplete="off" placeholder="YY" style="width:100%;box-sizing:border-box"></label>' +
        '<label style="flex:1">유효기간(MM)<input id="bcMM" maxlength="2" autocomplete="off" placeholder="MM" style="width:100%;box-sizing:border-box"></label>' +
        '<label style="flex:1">카드 비밀번호 앞 2자리<input id="bcPw" type="password" maxlength="2" autocomplete="off" style="width:100%;box-sizing:border-box"></label></div>' +
        '<label>생년월일 6자리(법인카드는 사업자번호 10자리)<input id="bcId" inputmode="numeric" autocomplete="off" style="width:100%;box-sizing:border-box"></label>' +
        '<label style="display:block;margin-top:8px"><input id="bcConsent" type="checkbox"> ' + mailEscape(c.consentText || '자동청구에 동의합니다.') + '</label>' +
        '<button class="btn" onclick="billingCardRegister()" ' + (billingCardBusy ? 'disabled' : '') + '>' + (billingCardBusy ? '등록 중…' : '카드 등록 (결제 없음)') + '</button>' +
        '<p style="font-size:12px">카드 정보는 등록 요청에만 사용되며 서버·브라우저 어디에도 저장되지 않습니다.</p>';
    }
    if (attempts.length) {
      h += '<h4 style="margin:12px 0 4px">자동청구 처리 안내</h4>' + attempts.slice(0, 5).map(function (a) {
        return '<p style="font-size:12px;margin:2px 0">' + mailEscape((a.finishedAt || '').slice(0, 10)) + ' · ' +
          (a.outcome === 'failed' ? '자동청구 실패 — 카드 상태 확인 후 청구서의 [카드 결제]로 수동 결제해 주세요.' : '거래 확인 필요 — 청구서의 [거래 확인]을 눌러 주세요.') +
          (a.failMsg ? ' <span style="color:#8a6d3b">(' + mailEscape(a.failMsg) + ')</span>' : '') + '</p>';
      }).join('');
    }
    return h + '</div>';
  };

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

  /* ── 언어 자동 매핑 + 개별 설정 (기획 §4.8) ─────────────────
     우선순위: 본인 저장 설정 > IP 국가(서버 감지) > 브라우저 언어 > en.
     변경은 즉시 저장(localStorage) + 서버 동기화(PUT /me/locale). */
  var LANGS = [["th", "ไทย"], ["ko", "한국어"], ["en", "English"], ["vi", "Tiếng Việt"], ["ja", "日本語"]];
  function langLabel(l) {
    var f = LANGS.find(function (x) { return x[0] === l; });
    return f ? f[1] : l;
  }
  function applyLang(l, silent) {
    window.__USER_LANG = l;
    window.__LANG_LABEL = langLabel(l);
    if (typeof ST !== "undefined") { ST.myLang = l; }
    try { localStorage.setItem("CONNECTION_LANG", l); } catch (e) {}
    if (window.render) render();
    if (!silent && window.toast)
      toast("언어 변경됨", "이제 셀 대화·캠페인이 <b>" + langLabel(l) +
        "</b>로 보입니다. 원문은 언제든 칩으로 열려요.");
  }
  window.setMyLang = function (l) {
    applyLang(l, false);
    fire("PUT", "/me/c-mai/locale", { locale: l });
  };
  window.setConversationLang = function (l) {
    if (!LANGS.some(function (x) { return x[0] === l; })) return;
    var input = document.getElementById('commText');
    var draft = input ? input.value : null;
    applyLang(l, true);
    var replacement = document.getElementById('commText');
    if (replacement && draft !== null) replacement.value = draft;
  };
  function conversationLanguageHtml(compact) {
    var current = window.__USER_LANG || 'ko';
    return '<div class="conversation-language'+(compact?' is-compact':'')+'"><label for="conversationLanguage">대화 언어</label>' +
      '<select id="conversationLanguage" aria-describedby="conversationLanguageHelp" onchange="setConversationLang(this.value)">' +
      LANGS.map(function (x) { return '<option value="' + x[0] + '"' +
        (current === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') +
      '</select><details class="conversation-language-help"><summary aria-label="대화 언어 도움말">도움말</summary><p id="conversationLanguageHelp">선택한 언어로 대화와 담당자 DM을 표시합니다. 번역이 없으면 원문을 보여 줍니다. 이 기기에 저장됩니다.</p></details></div>';
  }
  window.langMenu = function () {
    var cur = window.__USER_LANG || "th";
    var btns = LANGS.map(function (x) {
      return '<span class="cbt' + (x[0] === cur ? "" : " no") +
        '" style="margin:2px 3px 0 0" onclick="setMyLang(\'' + x[0] + '\')">' +
        x[1] + "</span>";
    }).join("");
    toast("내 언어", "처음엔 <b>접속 국가(IP)·브라우저 언어</b>로 자동 설정돼요." +
      " 바꾸면 저장되고 어디서 로그인해도 유지됩니다.<br><div style='margin-top:7px'>" +
      btns + "</div>");
  };
  (function initLang() {
    var saved = null;
    try { saved = localStorage.getItem("CONNECTION_LANG"); } catch (e) {}
    if (saved) return applyLang(saved, true);
    req("GET", "/locale/detect").then(function (r) {
      applyLang(r.locale || "en", true);
    }).catch(function () {
      var nav = ((navigator.language || "en").slice(0, 2));
      applyLang(["th", "ko", "en", "vi", "ja"].indexOf(nav) >= 0 ? nav : "en", true);
    });
  })();

  /* 내 패스 화면에 '언어' 섹션 주입 (동의 설정 위) */
  try {
    if (typeof CA !== "undefined" && CA.pass) {
      var _pass = CA.pass;
      CA.pass = function () {
        var v = _pass();
        var marker = '<div class="cc" style="margin-top:12px;background:var(--n50)"><div class="t">동의 설정</div>';
        var cur = window.__USER_LANG || "th";
        var section =
          '<div style="font-size:9.6px;font-weight:900;letter-spacing:.14em;color:var(--n600);margin:16px 0 8px">언어</div>' +
          '<div class="cc"><div class="t">내 언어 — ' + langLabel(cur) + "</div>" +
          "<p>처음엔 <b>접속 국가(IP)·브라우저 언어</b>로 자동 설정돼요. 셀 대화·캠페인·담당자 대화가 이 언어로 보입니다.</p>" +
          '<div style="display:flex;gap:5px;margin-top:9px;flex-wrap:wrap">' +
          LANGS.map(function (x) {
            return '<span class="cbt' + (x[0] === cur ? "" : " no") +
              '" onclick="setMyLang(\'' + x[0] + '\')">' + x[1] + "</span>";
          }).join("") +
          "</div></div>";
        if (v.body && v.body.indexOf(marker) >= 0)
          v.body = v.body.replace(marker, section + marker);
        return v;
      };
    }
  } catch (e) {}

  /* ── 캠페인 게시 → 실서버 등록 (공지 자동 번역 게시 포함) ── */
  if (window.pubCamp) {
    var _pubCamp = window.pubCamp;
    window.pubCamp = function () {
      var nm = (document.getElementById("ncn") || {}).value || "9월 진정 앰플 · 태국";
      var prod = (document.getElementById("ncp") || {}).value || "시카 진정 앰플";
      var t = (typeof ST !== "undefined" && ST.nc && ST.nc.type) || "paid";
      _pubCamp();
      fire("POST", "/campaigns", {
        name: nm, product: prod,
        reward_type: t, reward_amount: t === "paid" ? 38000 : 0,
        usp: "48시간 진정 테스트 완료 · 무향 · 민감성 전용",
        conditions: ["15초 이상", "제품 3초 노출", "#ad 표기"],
        capacity: 30, deadline: "2026-10-05",
      });
    };
  }

  /* ── 콘솔 검수 통과 → 실서버 review (정산 대기 반영) ── */
  if (window.doPass2) {
    var _doPass2 = window.doPass2;
    window.doPass2 = function () {
      _doPass2();
      req("GET", "/submissions?creator=c-mai&status=in_review")
        .then(function (subs) {
          if (!subs.length) return;
          fire("POST", "/submissions/" + subs[0].submissionId + "/review",
               { result: "passed", reviewer: "kim" });
        }).catch(function () {});
    };
  }

  /* ── 크리에이터 신고 ⚑ → 실서버 접수 (SLA 큐 → 어드민) ── */
  window.reportFlag = function () {
    toast("신고", "이 방에서 문제가 되는 메시지를 신고합니다." +
      " <b>스팸·광고</b>는 72시간, <b>괴롭힘</b>은 24시간 안에 사람이 처리해요." +
      "<br><div style='margin-top:7px'>" +
      '<span class="cbt" onclick="sendReport(\'spam\')">스팸·광고</span> ' +
      '<span class="cbt" onclick="sendReport(\'harassment\')">괴롭힘·혐오</span> ' +
      '<span class="cbt no" onclick="sendReport(\'other\')">기타</span></div>');
  };
  window.sendReport = function (reason) {
    req("POST", "/reports", {
      cell_id: "cell-glowlab-th", reporter: "c-mai", reason: reason,
      detail: "셀 대화에서 신고 (⚑)",
    }).then(function (r) {
      toast("신고 접수됨", "접수번호가 발급됐어요. <b>" +
        (reason === "harassment" ? "24시간" : "72시간") +
        " 안에</b> 사람이 확인하고 결과를 알려드립니다.");
    }).catch(function () {
      toast("신고 접수됨", "접수됐습니다. 처리 결과는 알림으로 알려드려요.");
    });
  };

  /* ── 알림 🔔 → 실서버 알림함 ── */
  window.notifMenu = function () {
    req("GET", "/notifications?user=c-mai").then(function (list) {
      if (!list.length) return toast("알림", "새 알림이 없어요.");
      var rows = list.slice(0, 5).map(function (n) {
        return "<div style='margin:6px 0'><b>" + n.title + "</b><br>" +
          "<span style='color:var(--n600)'>" + (n.body || "") + "</span></div>";
      }).join("");
      toast("알림 " + list.length + "건", rows);
    }).catch(function () {
      toast("알림", "서버에 연결되면 정산·검수·셀 소식이 여기로 모여요.");
    });
  };

  /* ── 콘솔: theprlist 검토(컴플라이언스) · AI 브리프 → 실서버 ── */
  window.ariReview = function () {
    var nm = (document.getElementById("ncn") || {}).value || "9월 진정 앰플";
    var text = nm + " — 48시간 진정 테스트 완료 · 무향 · 민감성 전용 · #ad 표기";
    req("POST", "/compliance/check", {
      text: text, country: "TH",
      banned_words: ["미백", "최고"], require_disclosure: true,
    }).then(function (r) {
      if (r.ok && !r.violations.length)
        return toast("theprlist 검토 · 통과", "금지어·의학적 표현·광고 표기 모두 문제 없어요. 게시해도 됩니다.");
      var rows = r.violations.map(function (v) {
        return "<div style='margin:5px 0'>" +
          (v.severity === "block" ? "⛔" : "⚠️") + " <b>" + v.term + "</b> — " +
          v.message + (v.fix ? "<br><span style='color:var(--n600)'>→ " + v.fix + "</span>" : "") +
          "</div>";
      }).join("");
      toast(r.ok ? "theprlist 검토 · 주의 " + r.violations.length + "건"
                 : "theprlist 검토 · 게시 불가", rows);
    }).catch(function () {
      toast("theprlist 검토", "문구를 theprlist가 먼저 봅니다 — <b>금지어 검사</b>와 국가별 광고 표기 규정 체크를 통과해야 게시돼요.");
    });
  };
  window.briefGen = function () {
    toast("브리프 생성 중", "브랜드 프로필 · 제품 USP · 크리에이터 언어를 모아서 만드는 중…");
    req("POST", "/campaigns/cmp-1/briefs", { creator_id: "c-mai" })
      .then(function (b) {
        var hooks = (b.hooks || []).slice(0, 2).map(function (h) {
          return "<div style='margin:4px 0'>· " + h + "</div>";
        }).join("");
        toast("브리프 생성됨 · @" + (b.creator_handle || "ploy"),
          "<b>후크 제안</b>" + hooks +
          "<div style='margin-top:6px;color:var(--n600)'>고지 문구·금지어·필수 조건이 포함된 브리프가 " +
          "크리에이터 담당자 대화로 전달됩니다.</div>");
      }).catch(function () {
        toast("브리프", "서버 연결 시 캠페인·브랜드 프로필 기반 브리프가 생성됩니다.");
      });
  };
  try {
    if (typeof CV !== "undefined" && CV.camp) {
      var _camp = CV.camp;
      CV.camp = function () {
        var v = _camp();
        if (v.b) {
          v.b = v.b.replace(
            /onclick="toast\('theprlist 검토'[\s\S]*?\)"(?=>theprlist 검토 먼저)/,
            'onclick="ariReview()"');
          v.b = v.b.replace(
            '>theprlist 검토 먼저</button>',
            '>theprlist 검토 먼저</button><button class="btn line" onclick="briefGen()">AI 브리프</button>');
        }
        return v;
      };
    }
  } catch (e) {}

  /* ── 브랜드 발신 이메일 (트랙 B 도메인 인증) — 콘솔 '발굴·수집' 탭 카드 ── */
  window.__SENDERS = null;
  function loadSenders(silent) {
    if (!BRAND()) return;
    req("GET", "/brands/" + BRAND() + "/senders").then(function (l) {
      window.__SENDERS = l;
      if (typeof ST !== "undefined" && ST.b === "src" && window.render) render();
    }).catch(function () {});
  }
  window.copyTxt = function (el) {
    var v = decodeURIComponent(el.getAttribute("data-v") || "");
    if (navigator.clipboard) navigator.clipboard.writeText(v);
    toast("복사됨", "도메인 업체(가비아·카페24 등) DNS 관리 화면에 붙여넣으세요.");
  };
  window.senderRegister = function () {
    var el = document.getElementById("sndEmail");
    var v = el && el.value.trim();
    if (!v) return toast("발신 이메일", "회사 이메일 주소를 입력해 주세요.");
    req("POST", "/brands/" + BRAND() + "/senders", { email: v }).then(function (r) {
      loadSenders();
      toast("인증 코드 발송", r.demoCode
        ? "데모 모드 — 인증 코드: <b>" + r.demoCode + "</b>. 아래 칸에 입력하세요."
        : "<b>" + v + "</b> 메일함으로 6자리 코드를 보냈어요.");
    }).catch(function (e) {
      toast("등록 실패", e === 409 ? "이미 등록된 이메일입니다." : "주소 형식을 확인해 주세요.");
    });
  };
  window.senderVerify = function (id) {
    var el = document.getElementById("sndCode");
    req("POST", "/senders/" + id + "/verify", { code: el ? el.value.trim() : "" })
      .then(function () {
        loadSenders();
        toast("소유 확인 완료", "이제 아래 <b>DNS 레코드 3개</b>를 도메인 관리 화면에 등록한 뒤 [DNS 확인]을 누르세요.");
      }).catch(function () { toast("코드 불일치", "코드를 다시 확인해 주세요."); });
  };
  window.senderDns = function (id) {
    req("POST", "/senders/" + id + "/check-dns").then(function (r) {
      loadSenders();
      toast(r.dnsOk ? "도메인 인증 완료 🎉" : "아직 반영 전",
        r.dnsOk ? "워밍업 시작 — 오늘은 <b>" + r.todayCap + "통</b>부터, 2~4주에 걸쳐 자동으로 늘어납니다."
                : (r.hint || "잠시 후 다시 확인해 주세요."));
    }).catch(function () {});
  };
  window.senderResume = function (id) {
    req("POST", "/senders/" + id + "/resume").then(function () {
      loadSenders(); toast("재개됨", "발송이 다시 시작됩니다. 리스트 품질을 먼저 점검하세요.");
    }).catch(function () {});
  };
  function senderCard() {
    var L = window.__SENDERS, inner;
    var esc = function (s) { return encodeURIComponent(s); };
    if (L === null) {
      inner = '<p style="font-size:10.6px;color:var(--n600)">서버에 연결되면 브랜드 발신 이메일을 등록할 수 있어요.</p>';
    } else if (!L.length) {
      inner = "<p>메일 에이전트가 <b>회사 이메일 이름으로</b> 보내도록 등록하세요. " +
        "발신 평판이 브랜드별로 분리되고, 회신은 그 메일함으로 직행합니다.</p>" +
        '<div style="display:flex;gap:6px;margin-top:9px"><input id="sndEmail" placeholder="marketing@brand.com" style="flex:1">' +
        '<span class="cbt" onclick="senderRegister()">등록</span></div>';
    } else {
      var s = L[L.length - 1];
      if (s.state === "unverified") {
        inner = "<p><b>" + s.email + "</b> — 메일함의 6자리 코드로 소유를 확인하세요.</p>" +
          '<div style="display:flex;gap:6px;margin-top:9px"><input id="sndCode" placeholder="6자리 코드" style="flex:1">' +
          '<span class="cbt" onclick="senderVerify(\'' + s.senderId + '\')">확인</span></div>';
      } else if (s.state === "dns_pending") {
        var rows = (s.dnsRecords || []).map(function (r) {
          return "<tr><td class=\"mono\" style=\"font-size:9.6px\">" + r.type + "</td>" +
            "<td class=\"mono\" style=\"font-size:9.6px\">" + r.host + "</td>" +
            "<td class=\"mono\" style=\"font-size:9.6px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">" + r.value + "</td>" +
            '<td><span class="cbt no" data-v="' + esc(r.value) + '" onclick="copyTxt(this)">복사</span></td></tr>';
        }).join("");
        inner = "<p><b>" + s.email + "</b> 확인 완료 — 아래 3개를 도메인 DNS에 등록하세요 " +
          "(SPF=보낼 자격 · DKIM=위조 방지 · DMARC=정책).</p>" +
          '<table style="margin-top:8px"><tr><th style="width:52px">유형</th><th style="width:110px">호스트</th><th>값</th><th style="width:48px"></th></tr>' + rows + "</table>" +
          '<div style="margin-top:9px"><span class="cbt" onclick="senderDns(\'' + s.senderId + '\')">DNS 확인</span></div>';
      } else if (s.state === "paused") {
        inner = "<p>⚠️ <b>" + s.email + "</b> — 반송·신고율 임계 초과로 <b>자동 정지</b>됐습니다. " +
          "리스트를 점검한 뒤 재개하세요. (원장에 기록됨)</p>" +
          '<div style="margin-top:9px"><span class="cbt" onclick="senderResume(\'' + s.senderId + '\')">확인했어요 · 재개</span></div>';
      } else {
        inner = "<p>✅ <b>" + s.email + "</b> 활성 — 오늘 발송 가능 <b>" + s.todayCap + "통</b> " +
          "(워밍업 자동 증가 중). 회신은 " + (s.replyTo || s.email) + " 로 갑니다.</p>";
      }
    }
    return '<div class="cc" style="margin-bottom:12px"><div class="t">발신 이메일 — 브랜드 명의로 보내기</div>' + inner + "</div>";
  }
  function mailEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }
  var outreachTargets=[],outreachTargetProducts=[],outreachTargetBrand='',outreachTargetVersion=0;
  var outreachData = null;
  var outreachError = '';
  var outreachLoading = false;
  var outreachBusy = false;
  var outreachVersion = 0;
  function loadOutreach() {
    var brand=BRAND(), version=++outreachVersion;
    if(!brand)return;
    outreachLoading=true;outreachError='';
    Promise.all([req('GET','/brands/'+brand+'/outreach'),req('GET','/brands/'+brand+'/outreach/targets')]).then(function(results){
      var r=results[0];
      if(version!==outreachVersion || BRAND()!==brand) return;
      outreachData=r;outreachTargets=results[1]||[];outreachLoading=false;
      if(typeof ST!=='undefined' && ST.b==='src' && window.render) render();
    }).catch(function(){
      if(version!==outreachVersion || BRAND()!==brand)return;
      outreachData=null;outreachLoading=false;outreachError='발송 내역을 불러오지 못했습니다. 로그인 상태를 확인하고 다시 시도해 주세요.';
      if(typeof ST!=='undefined' && ST.b==='src' && window.render)render();
    });
  }
  window.outreachTargetChanged=async function(value){
    var subject=document.getElementById('outSubject'),body=document.getElementById('outBody');
    if((subject&&subject.value)||(body&&body.value)){var select=document.getElementById('outTarget');if(select)select.value=outreachTargetBrand;return toast('제안 브랜드 변경','작성 중인 제목·본문을 먼저 검토하고 비운 뒤 브랜드를 변경하세요.');}
    outreachTargetBrand=value;outreachTargetProducts=[];var version=++outreachTargetVersion,brand=BRAND();
    var product=document.getElementById('outProduct');if(product)product.value='';
    if(!value){render();return;}
    try{var products=await req('GET','/brands/'+value+'/products');if(BRAND()===brand&&version===outreachTargetVersion){outreachTargetProducts=products;render();}}
    catch(e){if(version===outreachTargetVersion)toast('제품 확인',e.message);}
  };
  var composeBusy=false;
  window.outreachCompose=async function(){
    if(composeBusy)return;
    var brief=document.getElementById('outBrief').value.trim();
    if(brief.length<5)return toast('내용 입력','협업 제안 내용을 5자 이상 입력하세요.');
    if(document.getElementById('outSubject').value||document.getElementById('outBody').value)return toast('기존 초안 확인','입력한 제목과 본문을 비운 뒤 AI 작성을 실행하세요.');
    var productId=(document.getElementById('outProduct')||{}).value||'';
    var targetId=(document.getElementById('outTarget')||{}).value||'';
    var proposalProducts=targetId?outreachTargetProducts:productsData;
    if(productId&&!(proposalProducts||[]).some(function(p){return p.productId===productId;}))return toast('제품 확인','제품 목록을 다시 불러온 뒤 선택해 주세요.');
    var payload={brief:brief};if(productId)payload.product_id=productId;if(targetId)payload.target_brand_id=targetId;
    var current=jwtGet(),brand=BRAND();composeBusy=true;
    // 재렌더는 작성 중 입력값을 지우므로 버튼만 직접 갱신해 로딩을 표시한다
    var composeBtn=document.getElementById('outComposeBtn');
    if(composeBtn){composeBtn.disabled=true;composeBtn.textContent='AI 작성 중…';}
    toast('AI 작성 중','브랜드 정보를 참고해 제안 메일을 작성하고 있습니다.');
    try{var r=await req('POST','/brands/'+brand+'/outreach/compose',payload);
      if(jwtGet()!==current||BRAND()!==brand||((document.getElementById('outTarget')||{}).value||'')!==targetId)return;
      var subject=document.getElementById('outSubject'),body=document.getElementById('outBody');
      if(subject&&body&&!subject.value&&!body.value&&((document.getElementById('outProduct')||{}).value||'')===productId){subject.value=r.subject;body.value=r.body;toast('초안 작성 완료','아직 저장·발송되지 않았습니다. 내용을 확인해 주세요.');}
      else toast('다시 시도','화면이나 작성 내용이 바뀌어 AI 결과를 덮어쓰지 않았습니다.');
    }catch(e){toast('AI 작성 실패',mailEscape(e.message));}
    finally{composeBusy=false;
      var btn=document.getElementById('outComposeBtn');
      if(btn){btn.disabled=false;btn.textContent='AI로 제안 메일 작성';}}
  };
  window.outreachPreview=async function(){
    var sender=document.getElementById('outSender'),list=document.getElementById('outRecipients');
    var recipients=list?list.value.split(/[\s,;]+/).filter(Boolean):[];
    if(!sender||!sender.value||!recipients.length||recipients.length>200)return toast('입력 확인','발신 계정과 최대 200개 이메일을 입력하세요.');
    try{var r=await req('POST','/brands/'+BRAND()+'/outreach/preview',{gmail_account_id:sender.value,recipients:recipients,target_brand_id:(document.getElementById('outTarget')||{}).value||null});toast('읽기 전용 사전 검수','입력 '+r.inputCount+'개 / 고유 이메일 '+r.uniqueEmailCount+'개 / 검토 가능 '+r.eligibleCount+'개 / 제외 '+r.excluded.length+'개 / 시스템 잔여 '+r.remainingSystemCapacity+'건'+(r.sendingPaused?' · 계정 발송 중지':'')+'. 이메일 수는 고유 인원이 아닙니다. 저장·발송하지 않았습니다.');}
    catch(e){toast('검수 실패',e.message);}
  };
  window.outreachDraft = function() {
    if(outreachBusy)return;
    var recipients=document.getElementById('outRecipients').value.split(/[\s,;]+/).filter(Boolean);
    var subject=document.getElementById('outSubject').value.trim();
    var body=document.getElementById('outBody').value.trim();
    if(!recipients.length || recipients.length>200 || !subject || !body) return toast('입력 확인','수신자는 한 번에 최대 200명이며, 제목과 본문을 입력해 주세요.');
    var sender=document.getElementById('outSender');
    if(!sender || !sender.value)return toast('발신 계정 선택','연결된 Gmail 발신 계정을 선택하세요.');
    outreachBusy=true;
    req('POST','/brands/'+BRAND()+'/outreach',{recipients:recipients,subject:subject,body:body,gmail_account_id:sender.value,product_id:(document.getElementById('outProduct')||{}).value||null,target_brand_id:(document.getElementById('outTarget')||{}).value||null}).then(function(){
      ['outRecipients','outSubject','outBody'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
      loadOutreach(); toast('초안 저장','수신자와 내용을 확인한 뒤 발송해 주세요.');
    }).catch(function(){toast('저장 실패','로그인 상태와 이메일 형식을 확인해 주세요.');}).finally(function(){outreachBusy=false;});
  };
  window.outreachSend = function(id) {
    if(outreachBusy)return;
    outreachBusy=true;
    req('POST','/brands/'+BRAND()+'/outreach/'+id+'/send',{}).then(function(r){
      loadOutreach();loadGmail();loadInbox();
      var n=r.recipients.filter(function(x){return x.state==='sent';}).length;
      toast('발송 결과','Gmail 접수 '+n+'건. 배달 여부는 별도 확인해야 합니다.');
    }).catch(function(){loadOutreach();toast('발송 확인','Gmail 연결과 발송 내역을 확인해 주세요.');}).finally(function(){outreachBusy=false;});
  };
  window.outreachControl=function(id,paused){req('POST','/brands/'+BRAND()+'/outreach/'+id+'/control',{paused:paused}).then(loadOutreach).catch(function(e){toast('변경 실패',e.message);});};
  window.outreachCancel = function(id) {
    req('POST','/brands/'+BRAND()+'/outreach/'+id+'/cancel',{}).then(loadOutreach).catch(function(){toast('취소 실패','새로고침 후 상태를 확인해 주세요.');});
  };
  window.outreachRefresh=loadOutreach;
  window.outreachMore=async function(){
    if(outreachLoading||!outreachData||!outreachData.nextCursor)return;
    var brand=BRAND(),version=outreachVersion,cursor=outreachData.nextCursor;outreachLoading=true;
    try{var r=await req('GET','/brands/'+brand+'/outreach?before='+encodeURIComponent(cursor));
      if(BRAND()!==brand||version!==outreachVersion)return;
      outreachData.batches=outreachData.batches.concat(r.batches);outreachData.nextCursor=r.nextCursor;
    }catch(e){if(BRAND()===brand)toast('내역 확인 실패',mailEscape(e.message));}
    finally{if(version===outreachVersion){outreachLoading=false;render();}}
  };
  var bulkMappings=[],bulkReview=null,bulkBusy=false,bulkRequestId=null,bulkVersion=0;
  function bulkInvalidate(){bulkReview=null;bulkRequestId=null;bulkVersion++;}
  window.bulkChanged=function(){bulkInvalidate();};
  window.bulkAddMapping=function(){
    if(bulkBusy)return;
    var key=(document.getElementById('bulkKey')||{}).value||'';
    var product=(document.getElementById('outProduct')||{}).value||'';
    var sender=(document.getElementById('outSender')||{}).value||'';
    var subject=(document.getElementById('outSubject')||{}).value||'';
    var body=(document.getElementById('outBody')||{}).value||'';
    var target=(document.getElementById('outTarget')||{}).value||BRAND();
    if(!/^[A-Za-z0-9_-]{1,60}$/.test(key)||!product||!sender||!subject.trim()||!body.trim())return toast('매핑 입력','매핑 키와 위쪽 브랜드·제품·발신 계정·제목·본문을 입력하세요.');
    if(bulkMappings.length>=50)return toast('매핑 개수','한 번에 최대 50개 매핑을 검토합니다.');
    if(bulkMappings.some(function(m){return m.key===key;}))return toast('매핑 키 중복','다른 키를 사용하거나 기존 매핑을 제거하세요.');
    bulkMappings.push({key:key,target_brand_id:target,product_id:product,gmail_account_id:sender,subject:subject,body:body});
    bulkInvalidate();render();
  };
  window.bulkRemoveMapping=function(index){if(bulkBusy)return;bulkMappings.splice(index,1);bulkInvalidate();render();};
  function bulkPayload(){
    var text=(document.getElementById('bulkRows')||{}).value||'';
    var lines=text.split(/\r?\n/).filter(function(line){return line.trim();});
    if(lines.length&&/^email\tmapping_key(?:\t|$)/i.test(lines[0]))lines.shift();
    if(!lines.length||lines.length>10000||!bulkMappings.length)throw new Error('매핑과 최대 10,000행 명단을 입력하세요.');
    return {mappings:bulkMappings.map(function(m){return Object.assign({},m);}),rows:lines.map(function(line,index){
      var cells=line.split('\t');if(cells.length<2||cells.length>4)throw new Error((index+1)+'행: 이메일·매핑 키·이름·선정 이유를 탭으로 구분하세요.');
      return {email:cells[0].trim(),mapping_key:cells[1].trim(),name:cells[2]||'',reason:cells[3]||''};
    })};
  }
  window.bulkPreview=async function(){
    if(bulkBusy)return;
    var payload;try{payload=bulkPayload();}catch(e){return toast('입력 확인',mailEscape(e.message));}
    var brand=BRAND(),token=jwtGet(),version=++bulkVersion;bulkBusy=true;bulkReview=null;bulkRequestId=null;
    try{var r=await req('POST','/brands/'+brand+'/outreach/bulk/preview',payload);
      if(BRAND()!==brand||jwtGet()!==token||bulkVersion!==version)return;
      if(JSON.stringify(bulkPayload())!==JSON.stringify(payload))return toast('입력 변경','명단이 바뀌었습니다. 다시 검수하세요.');
      bulkReview={payload:payload,result:r};bulkRequestId=window.crypto.randomUUID();render();
    }catch(e){toast('매핑 검수 실패',mailEscape(e.message));}finally{bulkBusy=false;}
  };
  window.bulkSave=async function(){
    if(bulkBusy)return;
    if(!bulkReview)return toast('사전 검수 필요','매핑 결과를 먼저 확인하세요.');
    var payload;try{payload=bulkPayload();}catch(e){return toast('입력 확인',mailEscape(e.message));}
    if(JSON.stringify(payload)!==JSON.stringify(bulkReview.payload)){bulkInvalidate();return toast('입력 변경','내용이 바뀌었습니다. 다시 검수하세요.');}
    var brand=BRAND(),token=jwtGet();bulkBusy=true;
    try{var r=await req('POST','/brands/'+brand+'/outreach/bulk/drafts',Object.assign({},payload,{request_id:bulkRequestId,review_hash:bulkReview.result.reviewHash}));
      if(BRAND()!==brand||jwtGet()!==token)return;
      bulkInvalidate();var rows=document.getElementById('bulkRows');if(rows)rows.value='';bulkMappings=[];
      loadOutreach();toast('초안 저장 완료',r.batchIds.length+'개 배치를 저장했습니다. 발송하지 않았습니다. 각 배치의 개인별 문구를 검토한 뒤 승인하세요.');
    }catch(e){toast('초안 저장 실패',mailEscape(e.message));}finally{bulkBusy=false;}
  };
  window.outreachReview=async function(id){
    var brand=BRAND(),token=jwtGet();
    try{var r=await req('GET','/brands/'+brand+'/outreach/'+id+'/review');
      if(BRAND()!==brand||jwtGet()!==token)return;
      var el=document.getElementById('batchReview-'+id);if(el)el.innerHTML=r.messages.map(function(m){return '<details><summary>'+mailEscape(m.email)+' · '+mailEscape(m.subject)+'</summary><pre style="white-space:pre-wrap;font:inherit">'+mailEscape(m.body)+'</pre></details>';}).join('');
    }catch(e){toast('문구 확인 실패',mailEscape(e.message));}
  };
  function bulkCard(){
    var review=bulkReview&&bulkReview.result;
    return '<div class="cc"><div class="t">브랜드·제품 대량 매핑</div><p>① 위에서 브랜드·제품·발신 계정·제목·본문 선택 → 매핑 등록 ② 시트 명단 붙여넣기 ③ 검수 → 초안 저장 → 배치별 승인.</p><p>맞춤 필드: {{name}}, {{reason}}, {{brand}}, {{product}}. 선정 이유는 입력한 근거만 사용합니다.</p>'+
      '<label>매핑 키<input id="bulkKey" maxlength="60" placeholder="returnu-us-balm"></label> <button class="cbt no" onclick="bulkAddMapping()">현재 제안을 매핑에 추가</button>'+
      bulkMappings.map(function(m,i){var a=(window.__GMAIL&&window.__GMAIL.accounts||[]).find(function(x){return x.accountId===m.gmail_account_id;});var t=outreachTargets.find(function(x){return x.brandId===m.target_brand_id;});return '<details><summary>'+mailEscape(m.key)+' · '+mailEscape(t?t.name:m.target_brand_id)+' · '+mailEscape(a?a.email:m.gmail_account_id)+'</summary><p>제품 ID: '+mailEscape(m.product_id)+'</p><pre style="white-space:pre-wrap">'+mailEscape(m.subject+'\n'+m.body)+'</pre><button class="cbt no" onclick="bulkRemoveMapping('+i+')">이 매핑 제거</button></details>';}).join('')+
      '<label>시트 명단 · 최대 10,000행<textarea id="bulkRows" rows="6" oninput="bulkChanged()" placeholder="email&#9;mapping_key&#9;name&#9;reason"></textarea></label><p>열 순서: 이메일 / 매핑 키 / 이름(선택) / 선정 이유(선택). 시트에서 복사한 탭 구분 형식을 사용하세요. 이메일 수는 고유 인원 수가 아닙니다.</p>'+
      '<button class="cbt no" onclick="bulkPreview()">전체 매핑 사전 검수</button> <button class="cbt" onclick="bulkSave()" '+(!review||!review.eligibleCount?'disabled':'')+'>검수한 전체 초안 저장 · 발송 안 함</button>'+
      (review?'<div role="status"><p>입력 '+review.inputCount+'행 / 고유 이메일 '+review.uniqueEmailCount+'개 / 검토 가능 '+review.eligibleCount+'개 / 제외 '+review.excluded.length+'행 / 초안 '+review.batchCount+'개</p>'+review.senders.map(function(s){return '<p>'+mailEscape(s.email)+' · 계획 '+s.plannedRecipients+'건 / 시스템 잔여 '+s.remainingSystemCapacity+'건 / 현재 잔여 초과 '+s.overCurrentCapacity+'건. Google 직접 발송량은 별도 확인.</p>';}).join('')+review.groups.map(function(g){return '<details><summary>'+mailEscape(g.key)+' · '+mailEscape(g.brandName)+' / '+mailEscape(g.productName)+' · '+g.eligibleCount+'개</summary>'+g.samples.map(function(m){return '<p>'+mailEscape(m.email)+' · '+mailEscape(m.subject)+'</p><pre style="white-space:pre-wrap">'+mailEscape(m.body)+'</pre>';}).join('')+'</details>';}).join('')+'<details><summary>제외 사유 확인</summary>'+review.excluded.map(function(x){return '<p>'+x.row+'행 · '+mailEscape(x.email)+' · '+mailEscape(x.reason)+'</p>';}).join('')+'</details></div>':'')+'</div>';
  }
  window.inboxSend = function(thread,id) {
    req('POST','/inbox/threads/'+thread+'/messages/'+id+'/send',{}).then(function(r){
      window.__INBOX_OPEN=null;window.inboxOpen(thread);loadInbox();loadGmail();
      toast(r.state==='sent'?'답장 발송 완료':'발송 대기',r.state==='sent'?'Gmail로 발송했습니다.':'Gmail 연결 또는 오늘의 발송 한도를 확인하세요.');
    }).catch(function(){toast('발송 확인 필요','Gmail 보낸편지함에서 발송 여부를 확인하세요.');});
  };
  function outreachCard() {
    if(!window.__ME) return '<div class="cc"><div class="t">아웃리치</div><p>로그인 후 메일 초안과 발송 내역을 확인할 수 있습니다.</p></div>';
    var states={pending:'대기 · 연결/한도 확인',sending:'발송 시도 중 · 재발송 금지',sent:'Gmail 접수 · 배달 미확인',review:'Gmail에서 발송 여부 확인',blocked:'수신 거부 또는 90일 내 중복'};
    var rows=(outreachData && outreachData.batches || []).filter(function(b){return /^[a-f0-9-]{36}$/.test(b.id);}).map(function(b){
      var pending=b.recipients.some(function(r){return r.state==='pending';});
      return '<details style="margin-top:12px;border-top:1px solid #ddd;padding-top:12px"><summary>'+mailEscape(b.subject)+' · '+b.recipients.length+'명 · '+({draft:'초안',approved:'발송 승인됨',cancelled:'취소됨'}[b.state]||'')+(b.paused?' · 발송 중지':'')+'</summary>'+
        '<p>제안 브랜드: '+mailEscape(b.targetBrandId||BRAND())+' · 제품: '+mailEscape(b.productName||'브랜드 공통')+' · 매핑: '+mailEscape(b.mappingKey||'단일 제안')+'</p>'+'<p>발신 계정: '+mailEscape(((window.__GMAIL&&window.__GMAIL.accounts||[]).find(function(a){return a.accountId===b.gmailAccountId;})||{}).email||'연결 상태 확인 필요')+'</p>'+'<p>'+b.recipients.map(function(r){return mailEscape(r.email)+' — '+(states[r.state]||'확인 필요');}).join('<br>')+'</p><pre style="white-space:pre-wrap;font:inherit">'+mailEscape(b.body)+'</pre><p style="font-size:12px">수신 거부 링크가 본문 끝에 자동으로 추가됩니다.</p>'+ (b.mappingKey?'<button class="cbt no" onclick="outreachReview(\''+b.id+'\')">개인별 실제 문구 확인</button><div id="batchReview-'+b.id+'"></div>':'')+
        (pending && !b.paused && b.state!=='cancelled'?'<button class="btn" onclick="outreachSend(\''+b.id+'\')">'+(b.state==='draft'?'내용 승인하고 순차 발송':'남은 수신자 발송')+'</button> ':'')+
        (b.state==='approved'?'<button class="cbt no" onclick="outreachControl(\''+b.id+'\','+(!b.paused)+')">'+(b.paused?'검토 후 재개':'배치 일시 중지')+'</button> ':'')+
        (b.state==='draft'?'<button class="cbt no" onclick="outreachCancel(\''+b.id+'\')">초안 취소</button>':'')+'</details>';
    }).join('');
    return '<div class="cc"><div class="t">아웃리치 메일</div><p>수신자와 내용을 저장한 뒤 확인하고 발송합니다. 발송 한도를 넘긴 수신자는 대기하며, 수신 거부·90일 내 중복 발송은 제외합니다.</p>'+
      (window.__BID&&window.__BID.isInternal?'<label>제안 브랜드<select id="outTarget" onchange="outreachTargetChanged(this.value)"><option value="">디노 공용 모집</option>'+outreachTargets.filter(function(t){return t.brandId!==BRAND();}).map(function(t){return '<option value="'+mailEscape(t.brandId)+'" '+(outreachTargetBrand===t.brandId?'selected':'')+'>'+mailEscape(t.name)+'</option>';}).join('')+'</select></label><p>발신 계정은 회사 공간에 남고, 고객 브랜드 프로필·상품·가입 링크를 제안에 사용합니다.</p>':'')+
      '<label>초안에 사용할 제품<select id="outProduct"><option value="">브랜드 공통 제안</option>'+(outreachTargetBrand?outreachTargetProducts:productsData||[]).map(function(p){return '<option value="'+mailEscape(p.productId)+'">'+mailEscape(p.name)+'</option>';}).join('')+'</select></label><p>제품을 선택하면 저장된 제품 프로필도 AI 초안에 반영합니다.</p>'+
      '<label>협업 제안 내용<textarea id="outBrief" maxlength="2000" placeholder="제안할 제품, 협업 방식, 언어를 적어 주세요."></textarea></label><button id="outComposeBtn" class="cbt no" onclick="outreachCompose()" '+(composeBusy?'disabled':'')+'>'+(composeBusy?'AI 작성 중…':'AI로 제안 메일 작성')+'</button><p>AI는 저장한 브랜드 정보로 초안만 작성합니다. 내용을 확인하고 저장한 뒤 발송하세요.</p>'+
      '<label>발신 Gmail<select id="outSender"><option value="">발신 계정 선택</option>'+(window.__GMAIL&&window.__GMAIL.accounts||[]).map(function(a){return '<option value="'+mailEscape(a.accountId)+'" '+(a.sendingPaused?'disabled':'')+'>'+mailEscape(a.email)+(a.sendingPaused?' · 발송 중지':' · 잔여 '+a.remainingToday+'통')+'</option>';}).join('')+'</select></label>'+
      '<label>수신자 이메일 · 최대 200명<textarea id="outRecipients" rows="3" style="width:100%;box-sizing:border-box" placeholder="이메일을 줄바꿈 또는 쉼표로 구분"></textarea></label>'+
      '<label>제목<input id="outSubject" maxlength="150" style="width:100%;box-sizing:border-box"></label>'+
      '<label>본문<textarea id="outBody" rows="6" style="width:100%;box-sizing:border-box"></textarea></label>'+
      '<p>'+(outreachData&&outreachData.autoResumeEnabled?'승인한 배치는 서버가 간격·한도 안에서 순차 재개합니다.':'서버 자동 재개가 꺼져 있습니다. 승인 후 대기한 수신자는 자동 발송되지 않습니다.')+'</p>'+
      '<button class="cbt no" onclick="outreachPreview()">수신자 사전 검수</button> <button class="cbt" onclick="outreachDraft()">초안 저장</button> <button class="cbt no" onclick="outreachRefresh()">내역 새로고침</button>'+(outreachError?'<p role="alert">'+mailEscape(outreachError)+'</p>':outreachLoading?'<p role="status">발송 내역을 불러오는 중입니다.</p>':!rows?'<p>저장된 초안과 발송 내역이 없습니다.</p>':'')+rows+(outreachData&&outreachData.nextCursor?'<button class="cbt no" onclick="outreachMore()">이전 배치 더 보기</button>':'')+'</div>'+bulkCard();
  }

  /* ── 지메일 연동 — 브랜드 명의 발송(구글 OAuth) + 답장 인박스 ── */
  window.__GMAIL = null;
  window.__INBOX = null;
  window.__INBOX_OPEN = null;   // 펼친 스레드 {id, data}
  var gmailLoadState='loading', inboxLoadState='loading', gmailLoadVersion=0, inboxLoadVersion=0;
  function loadGmail() {
    var current=jwtGet(),brand=BRAND(),version=++gmailLoadVersion;
    if(!brand)return Promise.resolve();
    gmailLoadState='loading';window.__GMAIL=null;
    return req("GET", "/brands/" + brand + "/gmail").then(function (g) {
      if(jwtGet()!==current || BRAND()!==brand || version!==gmailLoadVersion)return;
      if(!g || !Array.isArray(g.accounts))throw new Error('Invalid Gmail status');
      window.__GMAIL=g;gmailLoadState='ready';
    }).catch(function () {
      if(jwtGet()===current && BRAND()===brand && version===gmailLoadVersion)gmailLoadState='error';
    }).finally(function(){if(version===gmailLoadVersion && window.render && ((typeof ST!=="undefined" && ST.b==='src')||(typeof livePage!=='undefined'&&livePage==='mail')))render();});
  }
  function loadInbox() {
    var current=jwtGet(),brand=BRAND(),version=++inboxLoadVersion;
    if(!brand)return Promise.resolve();
    inboxLoadState='loading';window.__INBOX=null;
    return req("GET", "/brands/" + brand + "/inbox").then(function (l) {
      if(jwtGet()!==current || BRAND()!==brand || version!==inboxLoadVersion)return;
      if(!Array.isArray(l))throw new Error('Invalid inbox response');
      window.__INBOX=l;inboxLoadState='ready';
    }).catch(function () {
      if(jwtGet()===current && BRAND()===brand && version===inboxLoadVersion)inboxLoadState='error';
    }).finally(function(){if(version===inboxLoadVersion && window.render && ((typeof ST!=="undefined" && ST.b==='src')||(typeof livePage!=='undefined'&&livePage==='mail')))render();});
  }
  window.inboxRefresh=loadInbox;
  window.gmailConnect = function () {
    var g = window.__GMAIL;
    if (g && !g.demo) {          // 실모드 — 구글 동의 화면으로
      var popup=window.open("about:blank","_blank");
      req("POST", "/brands/" + BRAND() + "/gmail/connect", {}).then(function (r) {
        if(r.authUrl){if(popup)popup.location=r.authUrl;else location.href=r.authUrl;}
        toast("구글 로그인", "새 창에서 회사 지메일로 로그인하고 허용을 누르세요. 끝나면 [새로고침]을 눌러주세요.");
      }).catch(function (e) {
        if(popup)popup.close();
        toast(e === 401 ? "인증 필요" : "연결 실패",
          e === 401 ? "세션이 만료되었습니다. 계정 메뉴에서 다시 로그인한 뒤 연결해 주세요."
                    : "잠시 후 다시 시도해 주세요.");
      });
      return;
    }
    var el = document.getElementById("gmEmail");
    var v = el && el.value.trim();
    if (!v) return toast("지메일 연결", "연결할 회사 지메일 주소를 입력해 주세요.");
    req("POST", "/brands/" + BRAND() + "/gmail/connect", { email: v }).then(function () {
      loadGmail();
      toast("연결 완료 (데모)", "실서비스에선 구글 로그인 창이 뜹니다. 이제 theprlist가 <b>" + v + "</b> 명의로 보냅니다.");
    }).catch(function () {});
  };
  var gmailSyncBusy=false,gmailSyncNotice='';
  window.gmailSync=async function(){
    if(gmailSyncBusy)return;
    var current=jwtGet(),brand=BRAND();
    if(!brand)return;gmailSyncBusy=true;gmailSyncNotice='받은 메일을 동기화하고 있습니다…';render();
    try{var r=await req('POST','/brands/'+brand+'/gmail/sync',{});if(jwtGet()!==current||BRAND()!==brand)return;
      gmailSyncNotice=r.imported+'통 가져왔습니다.'+(r.hasMore?' 이전 메일이 더 있습니다. 다시 동기화하면 이어서 가져옵니다.':'');loadInbox();loadGmail();
    }catch(e){if(jwtGet()===current)gmailSyncNotice=e.message;}finally{gmailSyncBusy=false;render();}
  };
  setInterval(function(){if(window.__ME&&BRAND()&&livePage==='mail'&&window.__GMAIL&&window.__GMAIL.accounts.some(function(a){return a.canRead;}))window.gmailSync();},60000);
  window.gmailRefresh=loadGmail;
  window.gmailSending=function(id,paused){req('POST','/gmail/accounts/'+id+'/sending',{paused:paused}).then(loadGmail).catch(function(e){toast('변경 실패',mailEscape(e.message));});};
  window.gmailDisconnect = function (id) {
    req("DELETE", "/gmail/accounts/" + id).then(function () {
      loadGmail(); toast("연결 해제", "이 지메일로는 더 이상 발송하지 않습니다.");
    }).catch(function (e) {toast("연결 해제 실패",mailEscape(e.message));});
  };
  window.inboxOpen = function (id) {
    if (window.__INBOX_OPEN && window.__INBOX_OPEN.id === id) {
      window.__INBOX_OPEN = null;
      if (window.render) render();
      return;
    }
    req("GET", "/inbox/threads/" + id).then(function (t) {
      window.__INBOX_OPEN = { id: id, data: t };
      if (window.render) render();
    }).catch(function (e) {toast("대화 조회 실패",mailEscape(e.message));});
  };
  window.inboxReply = function (id) {
    var el = document.getElementById("ibxBody");
    var v = el && el.value.trim();
    if (!v) return toast("답장", "내용을 입력해 주세요.");
    req("POST", "/inbox/threads/" + id + "/reply", { body: v }).then(function () {
      window.inboxOpen(id); window.inboxOpen(id);   // 닫고 다시 로드
      loadInbox();
      toast("답장 접수", "대화에서 내용을 확인한 뒤 [승인하고 발송]을 눌러주세요.");
    }).catch(function (e) {toast("답장 저장 실패",mailEscape(e.message));});
  };
  var ARI_LABELS = { interested: ["관심 있음", "var(--gr,#2E7D51)"],
                     declined: ["거절", "var(--n600)"],
                     question: ["질문", "var(--am,#8A6D1A)"],
                     other: ["기타", "var(--n600)"] };
  /* ── 브랜드 아이덴티티(로고) — 콘솔·PR 리스트 표시, 브랜드별 격리 ── */
  window.__BID = null;
  function loadIdentity() {
    var identityBrand=BRAND();
    if(!window.__ME||!identityBrand){window.__BID=null;return;}
    var identityToken=jwtGet();
    req("GET", "/brands/" + identityBrand + "/identity").then(function (b) {
      if(BRAND()!==identityBrand||jwtGet()!==identityToken||!window.__ME)return;
      window.__BID = b;
      if (window.render) try { render(); } catch (e) {}
      var chip = document.getElementById("authChip");
      if (chip && window.__ME) chip.textContent = "🔐 " + (b.name || identityBrand) +
        (window.__ME.kind === "admin" ? " (관리자)" : "") + " · " + window.__ME.email;
    }).catch(function () {});
  }
  window.identitySave = function () {
    var lg = ((document.getElementById("idLogo") || {}).value || "").trim();
    var tg = ((document.getElementById("idTag") || {}).value || "").trim();
    req("PUT", "/brands/" + BRAND() + "/identity", { logo_url: lg, tagline: tg })
      .then(function () { loadIdentity(); toast("저장됨", "로고·태그라인이 이 브랜드에만 적용됩니다."); })
      .catch(function (e) {
        toast("저장 실패", e === 400 ? "로고는 https URL 또는 200KB 이하 data:image 형식이어야 해요."
          : e === 401 || e === 403 ? "이 브랜드 계정으로 로그인 후 시도하세요." : "잠시 후 다시.");
      });
  };
  function brandLogoImg(size) {
    var b = window.__BID;
    if (!b || !b.logoUrl) return "";
    return "<img src='" + b.logoUrl.replace(/'/g, "") + "' alt='' style='width:" + size + "px;height:" + size +
      "px;border-radius:6px;object-fit:cover;vertical-align:-4px;margin-right:6px'>";
  }
  function identityCard() {
    var b = window.__BID;
    var inner;
    if (b === null) {
      inner = '<p style="font-size:10.6px;color:var(--n600)">서버에 연결되면 브랜드 로고를 설정할 수 있어요.</p>';
    } else {
      inner = "<p>" + brandLogoImg(22) + "<b>" + mailEscape(b.name || BRAND() || "") + "</b>" +
        (b.tagline ? " · " + mailEscape(b.tagline) : "") +
        " <span style='font-size:9.6px;color:var(--n600)'>— PR 리스트·가입·커뮤니티 화면에 이 로고가 보입니다 (theprlist 표기는 유지)</span></p>" +
        '<div class="identity-fields" style="display:flex;gap:6px;margin-top:9px"><input id="idLogo" placeholder="로고 URL (https:// 또는 data:image/…)" value="' +
        mailEscape(b.logoUrl || "") + '" style="flex:2">' +
        '<input id="idTag" placeholder="태그라인" value="' + mailEscape(b.tagline || "") + '" style="flex:1">' +
        '<span class="cbt" onclick="identitySave()">저장</span></div>';
    }
    return '<div class="cc" style="margin-bottom:12px"><div class="t">브랜드 로고 — ' +
      "화면 표시 설정</div>" + inner + "</div>";
  }

  function gmailCard() {
    var g = window.__GMAIL, inner;
    if (gmailLoadState==='error') {
      inner='<p role="alert">Gmail 연결 상태를 불러오지 못했습니다. 연결 해제를 의미하지 않습니다.</p><button class="cbt" onclick="gmailRefresh()">연결 상태 다시 확인</button>';
    } else if (g === null) {
      inner = '<p style="font-size:10.6px;color:var(--n600)">Gmail 연결 상태를 불러오는 중입니다.</p>';
    } else if (!g.accounts.length) {
      inner = "<p><b>회사 지메일로 직접 발송</b> — 구글 로그인 한 번이면 theprlist가 그 주소 명의로 보냅니다. " +
        "이 브랜드 전용 Google 계정을 선택하고 발송·받은 메일 읽기 권한을 허용하세요. 다른 브랜드에 연결된 이메일은 사용할 수 없습니다.</p>" +
        (g.demo
          ? '<div style="display:flex;gap:6px;margin-top:9px"><input id="gmEmail" placeholder="hello@brand.com" style="flex:1">' +
            '<span class="cbt" onclick="gmailConnect()">구글로 연결 (데모)</span></div>'
          : '<div style="margin-top:9px"><span class="cbt" onclick="gmailConnect()">🔐 구글로 연결</span>' +
            ' <span class="cbt no" onclick="location.reload()">새로고침</span></div>');
    } else {
      inner = g.accounts.map(function(a){return '<p><b>실제 발신 주소: '+mailEscape(a.email)+'</b></p><p>Google Workspace 회사 도메인 또는 연결된 Gmail 계정으로 발송합니다.</p>'+
        '<p>최근 24시간 시스템 접수 '+(a.sentLast24Hours==null?a.sentToday:a.sentLast24Hours)+' / '+a.todayCap+'통 · 시스템 잔여 '+(a.remainingToday==null?'확인 중':a.remainingToday)+'통</p>'+
        '<p>계정당 최소 60초 간격으로 발송합니다. '+(a.nextSendAt?'다음 가능 시각: '+mailEscape(new Date(a.nextSendAt).toLocaleString()):'')+'</p>'+
        '<p>계정당 시스템 일일 상한 '+a.todayCap+'통입니다. Google 계정의 실제 남은 한도는 별도로 적용되며, 위 수치는 Theprlist 발송 기록 기준입니다.</p>'+
        '<p>전달률·스팸함 도착률·반송률: 아직 측정되지 않았습니다. 한도 단계 완료나 수신함 도착을 보장하지 않습니다.</p>'+
        (a.sendingPaused?'<p role="alert">발송 일시 중지: '+mailEscape(a.pauseReason)+'</p>':'')+
        (a.canRead?'<p>최근 30일 중 최신 10통을 먼저 확인하고, 이전 메일이 있으면 10통을 추가 확인합니다. 이 화면을 열어 두면 1분마다 동기화합니다. 첨부파일·읽음 표시·삭제는 Gmail에서 관리하세요.</p><p>마지막 동기화: '+mailEscape(a.syncedAt?new Date(a.syncedAt).toLocaleString():'아직 없음')+'</p><button class="cbt" onclick="gmailSync()" '+(gmailSyncBusy?'disabled':'')+'>받은 메일 동기화</button>':'<p>수신 권한이 없습니다. 받은 메일도 관리하려면 Google 계정을 다시 연결하고 읽기 권한을 허용하세요.</p>')+
        '<button class="cbt no" onclick="gmailConnect()">Google 발송·수신 권한 연결</button><p role="status">'+mailEscape(gmailSyncNotice||a.syncError||'')+'</p>'+
        '<button class="cbt" onclick="gmailSending(\''+a.accountId+'\','+(!a.sendingPaused)+')">'+(a.sendingPaused?'확인 후 발송 재개':'발송 일시 중지')+'</button> '+
        '<button class="cbt no" onclick="gmailRefresh()">연결·한도 새로고침</button> '+
        '<button class="cbt no" onclick="gmailDisconnect(\''+a.accountId+'\')">연결 해제</button>'+
        '<hr>';}).join('')+'<button class="cbt" onclick="gmailConnect()">Google 계정 추가 연결</button><p>초안별로 발신 계정을 선택합니다. 한도 소진 시 다른 계정으로 자동 변경하지 않습니다.</p>';
    }
    return '<div class="cc" style="margin-bottom:12px"><div class="t">지메일 연동 — 구글 로그인으로 브랜드 명의 발송</div>' +
      '<div class="gmail-disclosure"><p><b>연결 전 확인</b> · 이 브랜드가 승인한 메일을 선택한 Google 계정으로 발송합니다. 받은편지함의 최근 30일 메일은 발신자·수신자·제목·본문·시각·대화 식별자를 theprlist 서버에 저장해 이 브랜드의 인박스에 표시합니다. 업무용 계정을 연결해 주세요.</p>'+
      '<p>첨부파일은 수집하지 않고 Gmail 원본의 읽음·삭제 상태는 바꾸지 않습니다. 동기화한 메일 본문은 AI 제공자에게 보내지 않습니다. 연결 해제는 추가 수집·발송을 중단하며 기존 저장 메일은 자동 삭제하지 않습니다. 삭제는 <a href="mailto:chief@dinostudio.kr">운영팀에 요청</a>할 수 있습니다. <a href="https://theprlist.net/privacy" target="_blank" rel="noopener">개인정보처리방침</a></p></div>'+inner+'</div>';
  }
  function inboxCard() {
    var L = window.__INBOX;
    if(inboxLoadState==='error')return '<div class="cc"><h2>대화 내역</h2><p role="alert">대화 내역을 불러오지 못했습니다. 메일이 삭제된 것은 아닙니다.</p><button class="cbt" onclick="inboxRefresh()">대화 내역 다시 불러오기</button></div>';
    if(L===null)return '<div class="cc"><h2>대화 내역</h2><p role="status">대화 내역을 불러오는 중입니다.</p></div>';
    if (!L.length) return '<div class="cc"><h2>대화 내역</h2><p>아직 기록된 대화가 없습니다. Google 수신 권한을 연결한 뒤 받은 메일 동기화를 눌러 주세요.</p></div>';
    var open = window.__INBOX_OPEN;
    var shown = inboxShowAll ? L : L.slice(0, 6);
    var items = shown.map(function (t) {
      var lb = ARI_LABELS[t.ariLabel] || ARI_LABELS.other;
      var row = "<div style='margin-top:8px;padding-top:8px;border-top:1px solid var(--n100,#eee);cursor:pointer' onclick=\"inboxOpen('" + t.threadId + "')\">" +
        "<b>@" + mailEscape(t.handle || t.creatorEmail) + "</b> " +
        "<span style='font-size:9.6px;padding:1px 6px;border-radius:8px;border:1px solid " + lb[1] + ";color:" + lb[1] + "'>규칙 분류: " + lb[0] + "</span>" +
        (t.lastDirection === "in" ? " <span style='font-size:9.6px;color:var(--bd,#8E3B2A)'>● 답장 옴</span>" : "") +
        "</div>";
      if (open && open.id === t.threadId && open.data) {
        var msgs = open.data.messages.map(function (m) {
          var mine = m.direction === "out";
          var st = m.state === "pending_gate" ? " · <i>승인 대기</i>" : m.state === "held" ? " · <i>보류됨</i>" : m.state === "sending" || m.state === "review" ? " · <i>Gmail에서 발송 여부 확인</i>" : "";
          return "<div style='margin:5px 0;text-align:" + (mine ? "right" : "left") + "'>" +
            "<span style='display:inline-block;max-width:82%;padding:6px 9px;border-radius:9px;font-size:10.6px;" +
            (mine ? "background:var(--n100,#eee)" : "background:var(--sand,#F4EDE3)") + "'>" +
            "<small>"+mailEscape(mine?(m.fromEmail||((window.__GMAIL&&window.__GMAIL.accounts||[]).find(function(a){return a.accountId===m.gmailAccountId;})||{}).email||"발신 계정 확인 필요"):(m.toEmail||"수신 계정 확인 필요"))+"</small><br>"+mailEscape(m.body) + "<span style='font-size:9px;color:var(--n600)'>" + st + "</span></span>" + (m.state === "pending_gate" ? ' <button class="cbt" onclick="inboxSend(\'' + t.threadId + '\',' + Number(m.msgId) + ')">승인하고 발송</button>' : '') + "</div>";
        }).join("");
        row += "<div style='margin-top:6px'>" + msgs +
          '<div style="display:flex;gap:6px;margin-top:7px"><input id="ibxBody" placeholder="답장 쓰기 — 승인함을 거쳐 발송됩니다" style="flex:1">' +
          '<span class="cbt" onclick="inboxReply(\'' + t.threadId + '\')">답장</span></div></div>';
      }
      return row;
    }).join("");
    var more = L.length > 6
      ? "<div style='margin-top:10px'><span class='cbt line' onclick='inboxToggleAll()'>"
        + (inboxShowAll ? "접기 — 최근 6개만 보기"
                        : "더보기 — 전체 " + L.length + "개 대화 보기") + "</span></div>"
      : "";
    return '<div class="cc" style="margin-bottom:12px"><div class="t">대화 내역 · 발신 기록과 수신된 답장'
      + (inboxShowAll ? " (전체 " + L.length + "개)" : L.length > 6 ? " (최근 6 / 전체 " + L.length + "개)" : "")
      + '</div>' + items + more + "</div>";
  }
  var inboxShowAll = false;
  window.inboxToggleAll = function () { inboxShowAll = !inboxShowAll; render(); };
  /* ── 틱톡샵 대량 발송 P0 (반자동) — 발굴·수집 '틱톡샵' 탭 카드 ── */
  window.__DISPATCH = null;
  function loadDispatch() {
    if (!BRAND()) return;
    req("GET", "/brands/" + BRAND() + "/dispatch-batches").then(function (l) {
      window.__DISPATCH = l;
      if (typeof ST !== "undefined" && ST.b === "src" && window.render) render();
    }).catch(function () {});
  }
  window.dispCreate = function () {
    var prod = (document.getElementById("dspProd") || {}).value || "";
    var cap = parseInt((document.getElementById("dspCap") || {}).value, 10) || 30;
    if (!prod.trim()) return toast("발송 배치", "틱톡샵 상품명(또는 ID)을 입력해 주세요.");
    req("POST", "/brands/" + BRAND() + "/dispatch-batches", {
      product_ref: prod.trim(), commission_pct: 12, unit_cost: 9000,
      capacity: cap, deadline_days: 14,
    }).then(function (b) {
      loadDispatch();
      toast("발송 배치 접수", b.funnel.invited + "명 선정 · <b>승인함(OUTBOUND)</b>에 올라갔어요." +
        " 승인 전에는 아무것도 나가지 않습니다.");
    }).catch(function (e) {
      toast("배치 실패", e === 400 ? "대상이 없거나 상한(100명) 초과예요. 90일 내 발송자는 자동 제외됩니다." : "입력을 확인해 주세요.");
    });
  };
  window.dispRefresh = function (id) {
    req("GET", "/dispatch-batches/" + id).then(function () { loadDispatch(); }).catch(function () {});
  };
  function dispatchHeaders() {
    var h = {}, token = jwtGet();
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }
  window.dispExport = function(id) {
    var brand = BRAND(), token = jwtGet();
    return fetch(API+'/dispatch-batches/'+encodeURIComponent(id)+'/export.csv', {headers:dispatchHeaders()})
      .then(function(r){if(!r.ok)throw new Error('CSV 내보내기 실패 ('+r.status+')');return r.blob();})
      .then(function(blob){
        if(BRAND()!==brand || jwtGet()!==token)return;
        var url=URL.createObjectURL(blob), a=document.createElement('a');
        a.href=url;a.download=id+'.csv';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
      }).catch(function(e){if(BRAND()===brand && jwtGet()===token)toast('내보내기 실패',mailEscape(e.message));});
  };
  window.dispImport = function (input, id) {
    if (!input.files || !input.files[0]) return Promise.resolve();
    if(input.files[0].size>262144){toast('업로드 실패','CSV는 256KB 이하만 허용합니다.');return Promise.resolve();}
    var fd = new FormData(), brand=BRAND(), token=jwtGet();
    fd.append('file', input.files[0]);
    return fetch(API + '/dispatch-batches/' + encodeURIComponent(id) + '/import', { method:'POST', headers:dispatchHeaders(), body:fd })
      .then(function(r){return r.json().then(function(data){if(!r.ok)throw new Error(typeof data.detail==='string'?data.detail:'결과 반영 실패');return data;});})
      .then(function(r){
        if(BRAND()!==brand || jwtGet()!==token)return;
        loadDispatch();
        toast('결과 반영','업데이트 '+r.updated+'건 · 이미 반영 '+(r.unchanged||0)+'건');
      }).catch(function(e){if(BRAND()===brand && jwtGet()===token)toast('업로드 실패',mailEscape(e.message));});
  };
  function funnelBar(f) {
    var steps = [["대상", f.targeted], ["초대 확인", f.invited], ["수락", f.accepted], ["배송", f.shipped],
                 ["도착", f.delivered], ["게시", f.posted]];
    return '<div style="display:flex;gap:10px;margin-top:6px">' + steps.map(function (s) {
      return "<span style='font-size:10.2px'><b>" + s[1] + "</b> " + s[0] + "</span>";
    }).join("<span style='color:var(--n400)'>→</span>") +
    (f.noShow ? " <span style='font-size:10.2px;color:var(--bd,#8E3B2A)'>노쇼 " + f.noShow + "</span>" : "") + "</div>";
  }
  function dispatchCard() {
    var L = window.__DISPATCH, inner;
    if (L === null) {
      inner = '<p style="font-size:10.6px;color:var(--n600)">서버 연결 시 셀 멤버에게 틱톡샵 협업 대상 CSV와 결과를 관리할 수 있어요.</p>';
    } else {
      var items = L.slice(0, 3).map(function (b) {
        var act = "";
        if (b.state === "PENDING_GATE")
          act = ' <span class="cbt no" onclick="dispRefresh(\'' + b.batchId + '\')">승인 확인</span>' +
                ' <span style="font-size:10px;color:var(--n600)">— 승인함에서 결정하세요</span>';
        else if (b.state === "READY" || b.state === "SENDING" || b.state === "DONE")
          act = ' <button class="cbt" onclick="dispExport(\'' + b.batchId + '\')">셀러센터 CSV</button>'  +
                ' <label class="cbt no" style="cursor:pointer">결과 업로드<input type="file" accept=".csv" style="display:none" onchange="dispImport(this,\'' + b.batchId + '\')"></label>';
        else if (b.state === "HELD")
          act = ' <span style="font-size:10px;color:var(--n600)">보류됨 — 외부 무통지</span>';
        return "<div style='margin-top:9px;padding-top:9px;border-top:1px solid var(--n100,#eee)'>" +
          "<b>" + mailEscape(b.product) + "</b> · " + b.commissionPct + "% · " +
          "<span class='mono' style='font-size:10px'>" + b.state + "</span>" + act +
          funnelBar(b.funnel) +
          "<div style='font-size:10px'>CSV 증빙별 집계 · 미기록 단계와 과거 자료는 누락될 수 있음 · 플랫폼 검증 아님</div>" +
          (b.gmv ? "<div style='font-size:10.2px;margin-top:3px'>보고 GMV <b>" + b.gmv.toLocaleString() + "</b> · 커미션 " + b.commission.toLocaleString() + " · 통화·반품 대사 별도</div>" : "") +
          "</div>";
      }).join("");
      inner = "<p>셀 멤버를 선정해 <b>무료 샘플 + 커미션 협업</b>의 대상 CSV를 준비합니다. 실제 초대는 셀러센터에서 별도로 진행합니다. " +
        "CSV 준비는 <b>승인함</b>을 거칩니다. 승인·다운로드는 초대 완료가 아닙니다.</p>" +
        '<div style="display:flex;gap:6px;margin-top:9px"><input id="dspProd" placeholder="틱톡샵 상품명 또는 ID" style="flex:2">' +
        '<input id="dspCap" placeholder="정원" value="30" style="width:64px">' +
        '<span class="cbt" onclick="dispCreate()">배치 만들기</span></div>' + items;
    }
    return '<div class="cc" style="margin-bottom:12px"><div class="t">틱톡샵 협업 — CSV 준비·결과 관리</div>' + inner + "</div>";
  }

  try {
    if (window.srcView) {      // 발굴·수집 탭 본문은 srcView()가 그린다 (raw:2)
      var _srcView = window.srcView;
      window.srcView = function () {
        var h = _srcView();
        if (typeof ST !== "undefined" && ST.srcTab === "mail")
          h = '<div class="cvbd" style="padding-bottom:0">' + identityCard() + gmailCard() + outreachCard() + inboxCard() + "</div>";
        if (typeof ST !== "undefined" && ST.srcTab === "tkshop")
          h = '<div class="cvbd" style="padding-bottom:0">' + dispatchCard() + "</div>" + h;
        return h;
      };
      loadSenders();
      loadDispatch();
      loadGmail();
      loadInbox();
      loadOutreach();
      loadIdentity();
    }
  } catch (e) {}

  window.bjDone = window.bjLearn = function () { location.href='https://theprlist.net/signup'; };

  /* ── 크리에이터 셀 입장 → 실멤버십 가입 (로그인된 계정만, 데모는 그대로) ── */
  if (window.finishJoin) {
    var _finishJoin = window.finishJoin;
    window.finishJoin = function () {
      _finishJoin();
      try {
        if (window.__ME && window.__ME.kind === "creator") {
          var bslug = (((typeof ST !== "undefined" && ST.me && ST.me.joinBrand) || "glowlab") + "").toLowerCase();
          req("POST", "/me/join", { brand_id: bslug }).then(function (r) {
            toast("멤버십 등록", r.joined
              ? "<b>" + r.brandId + "</b> 멤버가 됐어요." + (r.verified ? "" : " 계정 검증이 끝나면 브랜드에 정식 반영됩니다.")
              : "이미 이 브랜드의 멤버예요 — 중복 가입은 다시 과금되지 않습니다.");
          }).catch(function () {});
        }
      } catch (e) {}
    };
  }

  /* ── 실인증 — 브랜드 로그인 · 초대 수락 · 크리에이터 매직링크 ── */
  function jwtGet() { try { return localStorage.getItem("CONNECTION_JWT") || ""; } catch (e) { return ""; } }
  function jwtSet(t) { try { localStorage.setItem("CONNECTION_JWT", t); } catch (e) {} }
  function jwtClear() { try { localStorage.removeItem("CONNECTION_JWT"); } catch (e) {} }
  window.__ME = null;

  function reloadBrand() {
    outreachData=null;outreachError='';outreachLoading=false; outreachVersion++; window.__INBOX_OPEN=null;
    try { loadOutreach(); loadBilling(); loadSenders(); loadGmail(); loadInbox(); loadDispatch(); loadIdentity(); } catch (e) {}
    if (window.render) try { render(); } catch (e) {}
  }
  function creatorEntryLocale(){
    var lang=new URLSearchParams(location.search).get('lang');
    return lang==='ko'?'ko':lang==='en'?'en':window.__INVITATION_LOCALE||((typeof navigator!=='undefined'&&/^ko/i.test(navigator.language||''))?'ko':'en');
  }
  function entryText(ko,en){return creatorEntryLocale()==='en'?en:ko;}
  function authPanel(html) {
    var old = document.getElementById("authPanel");
    if (old) old.remove();
    if (!html) return;
    var d = document.createElement("div");
    d.id = "authPanel";
    d.style.cssText = "position:fixed;bottom:64px;left:14px;z-index:9999;width:250px;" +
      "background:#fff;color:#22272b;border:1px solid #d8d2c7;border-radius:12px;" +
      "padding:14px;box-shadow:0 8px 28px rgba(0,0,0,.18);font-size:12px";
    d.innerHTML = html;
    d.setAttribute('role','dialog');
    d.setAttribute('aria-label',(d.querySelector('b')||{}).textContent||'계정');
    var close=document.createElement('button');close.type='button';close.className='auth-close';
    close.textContent=window.__SURFACE==='creator'?entryText('닫기','Close'):'닫기';close.onclick=function(){authPanel(null);var chip=document.getElementById('authChip');if(chip)chip.focus();};
    d.appendChild(close);
    d.querySelectorAll('input').forEach(function(el){el.setAttribute('aria-label',el.placeholder||'입력');});
    d.onkeydown=function(e){if(e.key==='Escape'){e.preventDefault();close.click();}
      else if(e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();var action=d.querySelector('button.cbt');if(action)action.click();}};
    document.body.appendChild(d);
    var first=d.querySelector('input,button');if(first)first.focus();
  }
  function authChip() {
    var old = document.getElementById("authChip");
    if (old) old.remove();
    var d = document.createElement("button");
    d.type = "button";
    d.id = "authChip";
    d.style.cssText = "position:fixed;bottom:14px;left:14px;z-index:9999;cursor:pointer;" +
      "background:#22272b;color:#fff;border-radius:999px;padding:7px 13px;" +
      "font-size:11px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.25)";
    d.textContent = window.__ME ? "🔐 " + window.__ME.email : "🔐 "+(window.__SURFACE==="creator"?entryText("로그인","Sign in"):"로그인");
    // 워크스페이스 셸(브랜드/크리에이터)에서는 로그인 후 탑바 아바타가 계정
    // 진입점 — 플로팅 칩은 숨겨 모바일 하단 네비를 가리지 않는다(클릭은
    // 탑바 버튼이 d.click()으로 위임).
    if (window.__ME && (window.__SURFACE === "brand" || window.__SURFACE === "creator")) d.style.display = "none";
    d.onclick = function () {
      if (document.getElementById("authPanel")) return authPanel(null);
      if (window.__ME) {
        authPanel("<b>" + mailEscape(window.__ME.email) + "</b><br><span style='color:#5a6560'>" +
          (window.__ME.kind === "brand" ? "브랜드 · " + (window.__ME.brandId || "") : window.__ME.kind) +
          "</span><div style='margin-top:9px'><button type='button' class='cbt no' onclick=\"authLogout()\">로그아웃</button></div>");
      } else if (window.__SURFACE === "creator") {
        authPanel("<b>"+entryText("이메일로 로그인","Sign in or get started")+"</b><div style='margin-top:8px;display:flex;gap:5px'>" +
          "<input id='axEmail' placeholder='you@email.com' style='flex:1;padding:6px'>" +
          "<button type='button' class='cbt' onclick='authMagic()'>"+entryText('보내기','Send link')+"</button></div>" +
          "<div style='margin-top:6px;color:#5a6560'>"+entryText('처음 이용하셔도 이메일을 입력해 시작할 수 있습니다.','New here? Enter your email to get started. Use the link in your inbox to sign in.')+"</div>");
      } else {
        authPanel("<b>브랜드 로그인</b><div style='margin-top:8px'>" +
          "<input id='axEmail' placeholder='이메일' style='width:100%;padding:6px;margin-bottom:5px;box-sizing:border-box'>" +
          "<input id='axPw' type='password' placeholder='비밀번호' style='width:100%;padding:6px;box-sizing:border-box'>" +
          "<div style='margin-top:8px'><button type='button' class='cbt' onclick='authLogin()'>로그인</button> " +
          "<button type='button' class='cbt no' onclick='authForgot()'>비밀번호를 잊으셨나요?</button></div></div>");
      }
    };
    document.body.appendChild(d);
  }
  /* ── 보존 렌더 — 폴링이 화면을 갱신할 때 입력 중 초안·포커스·커서·
        스크롤을 유지한다(채팅 로그는 바닥 근처였으면 바닥 유지).
        모달(dialog)은 body 소속이라 stage 재렌더의 영향을 받지 않는다. ── */
  function softRender(){
    try{
      var st=document.getElementById('stage');
      var act=document.activeElement,actId=act&&act.id,selS=null,selE=null,actVal=null;
      if(actId&&st&&st.contains(act)&&(act.tagName==='TEXTAREA'||act.tagName==='INPUT')){
        try{actVal=act.value;selS=act.selectionStart;selE=act.selectionEnd;}catch(e){}
      }else{actId=null;}
      var keep=[];
      ['.crmsgs','.crthreadp-msgs','.crnotif-list','.crmain','.crside-scroll'].forEach(function(sel){
        var el=document.querySelector(sel);
        if(el)keep.push({sel:sel,top:el.scrollTop,bottom:(el.scrollHeight-el.scrollTop-el.clientHeight)<48});
      });
      var winY=(typeof window.scrollY==='number')?window.scrollY:0, stTop=st?st.scrollTop:0;
      render();
      keep.forEach(function(k){var el=document.querySelector(k.sel);if(el)el.scrollTop=k.bottom?el.scrollHeight:k.top;});
      if(st)st.scrollTop=stTop;
      if(window.scrollTo)window.scrollTo(0,winY);
      if(actId){
        var el=document.getElementById(actId);
        if(el){
          if(actVal!=null&&('value' in el))el.value=actVal;
          try{el.focus({preventScroll:true});}catch(e){try{el.focus();}catch(e2){}}
          try{if(selS!=null&&el.setSelectionRange)el.setSelectionRange(selS,selE);}catch(e){}
        }
      }
    }catch(e){try{render();}catch(e2){}}
  }
  window.authBack = function(){authPanel(null);var chip=document.getElementById('authChip');if(chip)chip.click();};
  window.authLogout = function () { jwtClear(); window.__ME = null; authPanel(null); authChip(); reloadBrand(); toast("로그아웃", "다시 로그인해야 서비스를 사용할 수 있습니다."); };
  window.authLogin = function () {
    var em = (document.getElementById("axEmail") || {}).value || "";
    var pw = (document.getElementById("axPw") || {}).value || "";
    req("POST", "/auth/login", { email: em.trim(), password: pw }).then(function (r) {
      jwtSet(r.token);
      if(r.needOtp){authPanel('<b>2단계 인증</b><input id="axOtp" inputmode="numeric" maxlength="6" placeholder="인증 앱의 6자리 코드"><button class="cbt" onclick="authOtp()">확인</button>');return;}
      window.__ME = r.user; authPanel(null); authChip();
      reloadBrand();
      toast("로그인 완료", "<b>" + mailEscape(r.user.email) + "</b> — 이제 <b>" + (r.user.brandId || "") + "</b> 브랜드로 동작합니다.");
    }).catch(function () { toast("로그인 실패", "이메일 또는 비밀번호를 확인하세요."); });
  };
  window.authOtp = function(){req('POST','/auth/otp/verify',{code:document.getElementById('axOtp').value}).then(function(r){jwtSet(r.token);window.__ME=r.user;authPanel(null);authChip();reloadBrand();}).catch(function(){toast('인증 실패','인증 코드를 확인하세요.');});};
  /* 비밀번호 재설정 — 브랜드·관리자 공용. 요청 응답은 계정 존재와 무관하게
     동일 문구(서버가 비노출 처리)이고, 링크는 메일로만 온다. */
  window.authForgot = function () {
    var pre = (document.getElementById("axEmail") || {}).value || "";
    authPanel("<b>비밀번호 재설정</b><div style='margin-top:6px;color:#5a6560'>가입한 이메일로 재설정 링크를 보내드려요 (30분 유효·1회용).</div>" +
      "<input id='axEmail' placeholder='이메일' value='" + mailEscape(pre).replace(/'/g, "&#39;") + "' style='width:100%;padding:6px;margin-top:8px;box-sizing:border-box'>" +
      "<div style='margin-top:8px'><button type='button' class='cbt' onclick='authForgotSend()'>재설정 메일 보내기</button> <button type='button' class='cbt no' onclick='authBack()'>돌아가기</button></div>");
  };
  window.authForgotSend = function () {
    var em = ((document.getElementById("axEmail") || {}).value || "").trim();
    if (em.indexOf("@") < 0) return toast("이메일", "주소를 확인해 주세요.");
    req("POST", "/auth/reset/request", { email: em }).then(function (r) {
      authPanel(null);
      toast("확인해 주세요", mailEscape(r.message || "요청을 접수했습니다. 메일이 도착하지 않으면 운영팀에 문의하세요."));
    }).catch(function (e) { toast("요청 실패", mailEscape(e.message || "잠시 후 다시 시도해 주세요.")); });
  };
  window.authResetConfirm = function (tk) {
    var pw = (document.getElementById("axPw") || {}).value || "";
    req("POST", "/auth/reset/confirm", { token: tk, password: pw }).then(function (r) {
      authPanel(null);
      history.replaceState(null, "", location.pathname);
      toast("비밀번호 변경 완료 ✅", mailEscape(r.message || "") +
        (r.kind === "admin" ? "<br><b>admin.theprlist.net</b>에서 다시 로그인하세요." : "<br>아래 로그인 버튼으로 다시 로그인하세요."));
      authChip();
    }).catch(function (e) { toast("재설정 실패", mailEscape(e.message || "링크가 만료됐거나 이미 사용됐어요 — 재설정을 다시 요청하세요.")); });
  };
  window.authMagic = function () {
    var em = (document.getElementById("axEmail") || {}).value || "";
    req("POST", "/auth/magic", { email: em.trim(),brand:new URLSearchParams(location.search).get("brand")||"",application:new URLSearchParams(location.search).get("application")||"",locale:creatorEntryLocale() }).then(function (r) {
      if(!r.demoLink&&r.sent!==true)throw new Error(r.hint||"로그인 메일을 발송하지 못했습니다.");
      authPanel(null);
      toast("메일을 확인하세요", r.demoLink
        ? "데모 모드 — <a href='" + r.demoLink.replace("https://theprlist.net/", location.origin + "/") + "'>이 링크로 로그인</a> (15분 유효)"
        : entryText("받은편지함의 로그인 링크를 눌러주세요 (15분 유효).","Check your inbox for your sign-in link (valid for 15 minutes)."));
    }).catch(function (e) { toast("전송 실패", mailEscape(e.message||"이메일 주소를 확인해 주세요.")); });
  };

  /* Public console only exposes workflows backed by durable server results. */
  var profileData=null, profileError='', profileDraft=null, profileUrl='', profileBusy=false, profileNotice='';
  var productsData=null, prodNotice='', prodCandidates=null, productsLoadError='';
  var brandCampaigns=null, collabOpen=null;   // {campaignId, rows}
  function loadProducts(){var b=BRAND();if(!b)return;productsLoadError='';req('GET','/brands/'+b+'/products').then(function(r){if(BRAND()!==b)return;productsData=r;productsLoadError='';if(window.__SURFACE==='brand')render();}).catch(function(){if(BRAND()!==b)return;productsLoadError='제품 목록을 불러오지 못했습니다.';if(window.__SURFACE==='brand')render();});
    req('GET','/brands/'+b+'/campaigns').then(function(r){if(BRAND()!==b)return;brandCampaigns=r;if(window.__SURFACE==='brand')render();}).catch(function(){});}
  window.collabShow=function(cid){
    var owner=BRAND(),token=jwtGet();
    return Promise.all([req('GET','/brands/'+owner+'/campaigns/'+cid+'/applicants'),req('GET','/brands/'+owner+'/campaigns')]).then(function(result){if(BRAND()!==owner||jwtGet()!==token)return;collabOpen={campaignId:cid,rows:result[0]};brandCampaigns=result[1];render();})
      .catch(function(){toast('조회 실패','잠시 후 다시.');});
  };
  window.collabSelect=function(cid,creatorId){
    var pct=parseFloat((document.getElementById('sel_'+creatorId)||{}).value);
    if(isNaN(pct))return toast('수수료','제안 수수료(%)를 입력해 주세요.');
    req('POST','/brands/'+BRAND()+'/campaigns/'+cid+'/select',{creator_id:creatorId,commission_pct:pct})
      .then(function(){prodNotice='선정 완료 — 크리에이터가 합의하면 수수료가 확정됩니다.';window.collabShow(cid);})
      .catch(function(e){toast('선정 실패',e===409?'이미 선정했거나 지원자가 아니에요.':'잠시 후 다시.');});
  };
  window.collabShip=function(cid,creatorId){
    var v=((document.getElementById('shp_'+creatorId)||{}).value||'').trim();
    if(!v)return toast('송장 번호','샘플 송장 번호를 입력해 주세요.');
    req('POST','/brands/'+BRAND()+'/campaigns/'+cid+'/terms/'+creatorId+'/sample-shipped',{tracking:v})
      .then(function(){prodNotice='샘플 발송 기록 완료.';window.collabShow(cid);})
      .catch(function(){toast('처리 실패','수수료 합의 이후에 가능해요.');});
  };
  window.collabLink=function(cid,creatorId){
    var v=((document.getElementById('afl_'+creatorId)||{}).value||'').trim();
    if(v.indexOf('https://')!==0)return toast('링크','https:// 어필리에이트 링크를 입력해 주세요.');
    req('POST','/brands/'+BRAND()+'/campaigns/'+cid+'/terms/'+creatorId+'/affiliate-link',{link:v})
      .then(function(){prodNotice='어필리에이트 링크 발급 완료.';window.collabShow(cid);})
      .catch(function(){toast('발급 실패','수수료 합의 이후에 가능해요.');});
  };
  window.collabComplete=function(cid,creatorId){
    req('POST','/brands/'+BRAND()+'/campaigns/'+cid+'/terms/'+creatorId+'/complete')
      .then(function(){prodNotice='협업 완료 처리됐어요.';window.collabShow(cid);})
      .catch(function(){toast('완료 불가','콘텐츠 제출 이후에 완료할 수 있어요.');});
  };
  var campBusy=false, campEditOpen=null;
  function campLifecyclePill(lc){return '<span class="pill'+(lc==='published'?' ok':lc==='draft'?' warn':'')+'">'+({draft:'초안(비노출)',published:'발행됨',closed:'마감'}[lc]||mailEscape(lc||'발행됨'))+'</span>';}
  window.campCreate=function(){
    if(campBusy)return;
    function v(id){var el=document.getElementById(id);return el?el.value.trim():'';}
    // payload는 render 전에 전부 캡처한다 — render가 DOM을 재구성하므로
    // 이후 읽기는 빈 값이 된다(P1: 422 + 입력 소실 원인).
    var payload={name:v('campName'),product:v('campProduct'),usp:v('campUsp'),
      reward_type:v('campReward')||'affiliate',
      affiliate_pct:parseFloat(v('campPct'))||null,
      deadline:v('campDeadline'),
      countries:v('campCountries').split(',').map(function(x){return x.trim().toUpperCase();}).filter(Boolean)};
    if(!payload.name||payload.name.length<2)return toast('캠페인 이름','이름을 2자 이상 입력해 주세요.');
    campBusy=true;render();
    req('POST','/brands/'+BRAND()+'/campaigns',payload)
      .then(function(r){prodNotice='캠페인 초안이 저장됐어요('+r.campaignId+'). 내용 확인 후 발행하면 멤버에게 알림이 갑니다.';window.wkFormClear&&wkFormClear(['campName','campProduct','campUsp','campPct','campDeadline','campCountries']);loadProducts();})
      .catch(function(e){toast('초안 저장 실패',mailEscape((e&&e.message)||'입력을 확인해 주세요.'));})
      .finally(function(){campBusy=false;render();});
  };
  window.campPublish=function(cid){
    if(campBusy)return;campBusy=true;render();
    req('POST','/brands/'+BRAND()+'/campaigns/'+encodeURIComponent(cid)+'/publish',{})
      .then(function(r){prodNotice='캠페인 발행 완료 — 멤버 '+(r.notified||0)+'명에게 알림(배지+카드)을 보냈어요. 강제 이동은 없습니다.';loadProducts();})
      .catch(function(e){toast('발행 실패',mailEscape((e&&e.message)||'초안 상태에서만 발행할 수 있어요.'));})
      .finally(function(){campBusy=false;render();});
  };
  window.campClose=function(cid){
    if(campBusy)return;campBusy=true;render();
    req('POST','/brands/'+BRAND()+'/campaigns/'+encodeURIComponent(cid)+'/close',{})
      .then(function(){prodNotice='캠페인을 마감했어요 — 신규 신청이 차단됩니다.';collabOpen=null;loadProducts();})
      .catch(function(e){toast('마감 실패',mailEscape((e&&e.message)||'잠시 후 다시.'));})
      .finally(function(){campBusy=false;render();});
  };
  window.campEditToggle=function(cid){campEditOpen=campEditOpen===cid?null:cid;render();};
  window.campEditSave=function(cid){
    if(campBusy)return;
    function v(id){var el=document.getElementById(id);return el?el.value.trim():'';}
    var body={};
    if(v('ce_name_'+cid))body.name=v('ce_name_'+cid);
    if(v('ce_usp_'+cid))body.usp=v('ce_usp_'+cid);
    if(v('ce_deadline_'+cid))body.deadline=v('ce_deadline_'+cid);
    var ctry=v('ce_countries_'+cid);
    if(ctry!=='')body.countries=ctry.split(',').map(function(x){return x.trim().toUpperCase();}).filter(Boolean);
    if(!Object.keys(body).length)return toast('수정','변경할 항목을 입력해 주세요.');
    campBusy=true;render();
    req('PATCH','/brands/'+BRAND()+'/campaigns/'+encodeURIComponent(cid),body)
      .then(function(){prodNotice='캠페인 수정 저장 완료.';window.wkFormClear&&wkFormClear(['ce_name_'+cid,'ce_usp_'+cid,'ce_deadline_'+cid,'ce_countries_'+cid]);campEditOpen=null;loadProducts();})
      .catch(function(e){toast('수정 실패',mailEscape((e&&e.message)||'마감된 캠페인은 수정할 수 없어요.'));})
      .finally(function(){campBusy=false;render();});
  };
  window.collabReject=function(cid,creatorId){
    if(campBusy)return;
    var reason=((document.getElementById('rej_'+creatorId)||{}).value||'').trim();
    campBusy=true;render();
    req('POST','/brands/'+BRAND()+'/campaigns/'+encodeURIComponent(cid)+'/applicants/'+encodeURIComponent(creatorId)+'/reject',{reason:reason})
      .then(function(){prodNotice='지원을 반려했어요'+(reason?' — 사유 기록됨.':'.');window.wkFormClear&&wkFormClear(['rej_'+creatorId]);window.collabShow(cid);})
      .catch(function(e){toast('반려 실패',mailEscape((e&&e.message)||'이미 선정/반려된 지원일 수 있어요.'));})
      .finally(function(){campBusy=false;render();});
  };
  function campDraftFormHtml(){
    return '<div class="cc"><h2>새 캠페인 초안</h2><p style="font-size:13px">초안은 크리에이터에게 보이지 않아요 — 발행하면 멤버 전원에게 알림이 갑니다.</p>'
      +'<div class="live-grid"><label>캠페인 이름<input id="campName" maxlength="120" placeholder="신제품 앰배서더 모집"></label><label>연결 제품(표기용)<input id="campProduct" maxlength="200" placeholder="세럼 30ml"></label></div>'
      +'<label>소개 · 조건 요약<input id="campUsp" maxlength="500" placeholder="비건 인증 세럼 — 사용 2주 후기 영상"></label>'
      +'<div class="live-grid"><label>보상 유형<select id="campReward"><option value="affiliate">어필리에이트 커미션</option><option value="gifted">제품 제공(기프트)</option><option value="paid">고정 보상</option></select></label><label>커미션 % (어필리에이트)<input id="campPct" type="number" min="0" max="90" step="0.5" placeholder="15"></label></div>'
      +'<div class="live-grid"><label>신청 마감일 (YYYY-MM-DD)<input id="campDeadline" placeholder="2026-11-30"></label><label>대상 국가 (ISO 2자리, 쉼표)<input id="campCountries" placeholder="KR, TH — 비우면 전체"></label></div>'
      +'<button class="btn" onclick="campCreate()" '+(campBusy?'disabled':'')+'>'+(campBusy?'저장 중…':'초안 저장')+'</button></div>';
  }
  window.wkCopy=function(id){
    var el=document.getElementById(id);if(!el)return;
    try{el.select&&el.select();}catch(e){}
    var done=false;
    try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(el.value);done=true;}}catch(e){}
    if(!done){try{done=document.execCommand&&document.execCommand('copy');}catch(e){}}
    toast('복사'+(done?'됨':''),done?'Spark 코드가 클립보드에 복사되었습니다.':'선택된 코드를 Ctrl/Cmd+C로 복사하세요.');
  };
  function sparkRowHtml(a){
    // 브랜드 권한(require_brand 라우트)에서만 렌더 — 코드 원문 조회/복사.
    // 공개 커뮤니티/크리에이터 측에는 노출하지 않는다.
    if(!a.sparkCode)return '';
    return '<div style="display:flex;gap:6px;margin:4px 0;align-items:center"><label style="font-size:12px;flex-shrink:0">Spark 코드</label><input id="spark_'+a.creatorId+'" readonly value="'+mailEscape(a.sparkCode)+'" onclick="this.select()" style="flex:1;padding:8px;font-family:monospace"><span class="cbt" onclick="wkCopy(\'spark_'+a.creatorId+'\')">복사</span></div>';
  }
  function collabCard(){
    var h=campDraftFormHtml();
    if(!brandCampaigns||!brandCampaigns.length)return h;
    h+='<div class="cc"><h2>캠페인 지원자 · 협업 진행</h2>';
    brandCampaigns.forEach(function(c){
      h+='<p>'+campLifecyclePill(c.lifecycle)+' <b>'+mailEscape(c.name)+'</b> <span style="font-size:12px">'+mailEscape(c.campaignId)+' · 지원 '+c.applicants+' · 선정 '+c.selected+(c.affiliatePct!=null?' · 커미션 '+c.affiliatePct+'%':'')+(c.deadline?' · 마감 '+mailEscape(c.deadline):'')+((c.countries||[]).length?' · 대상 '+mailEscape(c.countries.join(', ')):'')+'</span> '
        +(c.lifecycle==='draft'?'<span class="cbt" onclick="campPublish(\''+c.campaignId+'\')" '+(campBusy?'disabled':'')+'>발행</span> ':'')
        +(c.lifecycle!=='closed'?'<span class="cbt line" onclick="campEditToggle(\''+c.campaignId+'\')">수정</span> <span class="cbt no" onclick="campClose(\''+c.campaignId+'\')" '+(campBusy?'disabled':'')+'>마감</span> ':'')
        +'<span class="cbt line" onclick="collabShow(\''+c.campaignId+'\')">지원자 보기</span></p>';
      if(campEditOpen===c.campaignId&&c.lifecycle!=='closed'){
        h+='<div style="border:1px dashed #c9c4b8;border-radius:8px;padding:12px;margin:6px 0"><div class="live-grid"><label>이름<input id="ce_name_'+c.campaignId+'" value="'+mailEscape(c.name)+'"></label><label>마감일<input id="ce_deadline_'+c.campaignId+'" value="'+mailEscape(c.deadline||'')+'" placeholder="YYYY-MM-DD"></label></div><div class="live-grid"><label>소개·조건<input id="ce_usp_'+c.campaignId+'" placeholder="변경 시에만 입력"></label><label>대상 국가(쉼표)<input id="ce_countries_'+c.campaignId+'" value="'+mailEscape((c.countries||[]).join(', '))+'"></label></div><button class="btn" onclick="campEditSave(\''+c.campaignId+'\')" '+(campBusy?'disabled':'')+'>수정 저장</button></div>';
      }
      if(collabOpen&&collabOpen.campaignId===c.campaignId){
        if(!collabOpen.rows.length)h+='<p style="font-size:13px">아직 지원자가 없어요.</p>';
        collabOpen.rows.forEach(function(a){
          var st=a.termsState||'미선정';
          h+='<div style="border-top:1px solid #eee;padding:10px 0;margin-top:6px"><b>@'+mailEscape(a.handle)+'</b> <span style="font-size:12px">'+(a.verified?'검증됨':'미검증')+' · 상태: '+mailEscape(st)+(a.tiktokHandle?' · 핸들 '+mailEscape(a.tiktokHandle):'')+'</span>';
          if(!a.termsState&&a.status==='rejected'){
            h+='<p style="font-size:12px;margin:6px 0;color:#a2372b">반려된 지원입니다.</p>';
          }else if(!a.termsState){
            h+='<div style="display:flex;gap:6px;margin-top:6px"><input id="sel_'+a.creatorId+'" placeholder="제안 수수료 % (소수 가능)" style="flex:1;padding:8px"><span class="cbt" onclick="collabSelect(\''+c.campaignId+'\',\''+a.creatorId+'\')">선정 + 수수료 제안</span></div>'
              +'<div style="display:flex;gap:6px;margin:4px 0"><input id="rej_'+a.creatorId+'" placeholder="반려 사유 (선택)" style="flex:1;padding:8px"><span class="cbt no" onclick="collabReject(\''+c.campaignId+'\',\''+a.creatorId+'\')">반려</span></div>';
          }else if(a.termsState==='selected'){
            h+='<p style="font-size:12px;margin:6px 0">제안 수수료 '+(a.commissionPct!=null?a.commissionPct+'%':'-')+' — 크리에이터 합의 대기 중.</p>';
          }else if(a.termsState==='terms_agreed'||a.termsState==='sample_shipped'){
            h+='<p style="font-size:12px;margin:6px 0">확정 수수료 '+(a.agreedCommissionPct!=null?a.agreedCommissionPct+'%':'-')+(a.sampleTracking?' · 송장 '+mailEscape(a.sampleTracking):'')+(a.sparkCode?' · Spark 코드 수령 ✓':'')+'</p>'+sparkRowHtml(a);
            if(a.termsState==='terms_agreed')h+='<div style="display:flex;gap:6px;margin:4px 0"><input id="shp_'+a.creatorId+'" placeholder="샘플 송장 번호" style="flex:1;padding:8px"><span class="cbt" onclick="collabShip(\''+c.campaignId+'\',\''+a.creatorId+'\')">샘플 발송</span></div>';
            h+='<div style="display:flex;gap:6px;margin:4px 0"><input id="afl_'+a.creatorId+'" placeholder="어필리에이트 링크 (https://… — 브랜드 발급)" value="'+mailEscape(a.affiliateLink||'')+'" style="flex:1;padding:8px"><span class="cbt" onclick="collabLink(\''+c.campaignId+'\',\''+a.creatorId+'\')">링크 발급</span></div>';
          }else if(a.termsState==='content_submitted'){
            h+='<p style="font-size:12px;margin:6px 0">콘텐츠: '+mailEscape(a.contentUrl)+(a.sparkCode?' · Spark 코드 ✓':'')+'</p>'+sparkRowHtml(a)+'<span class="cbt" onclick="collabComplete(\''+c.campaignId+'\',\''+a.creatorId+'\')">완료 처리</span>';
          }else if(a.termsState==='completed'){
            h+='<p style="font-size:12px;margin:6px 0">✓ 완료 — 확정 수수료 '+(a.agreedCommissionPct!=null?a.agreedCommissionPct+'%':'-')+(a.sampleTracking?' · 송장 '+mailEscape(a.sampleTracking):'')+'<br>콘텐츠: '+(a.contentUrl?'<a href="'+mailEscape(a.contentUrl)+'" target="_blank" rel="noopener">'+mailEscape(a.contentUrl)+'</a>':'-')+'</p>'+sparkRowHtml(a);
          }else if(a.termsState==='declined'){
            h+='<p style="font-size:12px;margin:6px 0">크리에이터가 제안을 거절했어요.</p>';
          }
          h+='</div>';
        });
      }
    });
    return h+'</div>';
  }
  window.prodCreate=function(){
    var nm=(document.getElementById('pNew')||{}).value||'',ref=(document.getElementById('pRef')||{}).value||'',pct=parseFloat((document.getElementById('pPct')||{}).value)||10;
    if(!nm.trim())return toast('제품 이름','제품 이름을 입력해 주세요.');
    req('POST','/brands/'+BRAND()+'/products',{name:nm.trim(),tiktok_product_ref:ref.trim(),commission_pct:pct})
      .then(function(){prodNotice='제품이 등록됐어요. 제품 페이지를 분석(브랜드 학습 탭과 동일 파이프라인)하거나 아래에서 직접 입력해 저장하세요.';window.wkFormClear&&wkFormClear(['pNew','pRef','pPct']);loadProducts();})
      .catch(function(e){toast('등록 실패',e===409?'같은 이름의 제품이 있어요.':'입력을 확인해 주세요.');});
  };
  window.prodSaveProfile=function(pid){
    var ans={};['product_one_liner','usp','ingredients','price_range'].forEach(function(k){var el=document.getElementById('pf_'+k+'_'+pid);if(el&&el.value.trim())ans[k]=el.value.trim();});
    req('POST','/brands/'+BRAND()+'/products/'+pid+'/profile',{answers:ans})
      .then(function(r){prodNotice='제품 프로필 v'+r.version+' 저장 — 후보 추천과 아웃리치 초안에 반영됩니다.';loadProducts();})
      .catch(function(){toast('저장 실패','입력한 내용이 필요해요.');});
  };
  window.prodCampaign=function(pid){
    var nm=(document.getElementById('pc_'+pid)||{}).value||'';
    if(!nm.trim())return toast('캠페인','모집 이름을 입력해 주세요.');
    req('POST','/brands/'+BRAND()+'/products/'+pid+'/campaigns',{name:nm.trim(),capacity:30})
      .then(function(c){prodNotice='어필리에이트 캠페인 개설: '+c.campaignId+' · 커미션 '+c.affiliatePct+'%';loadProducts();render();})
      .catch(function(){toast('개설 실패','잠시 후 다시.');});
  };
  var candidateCountry='',candidateVersion=0,candSelected={},prodEditOpen={};
  window.prodEditToggle=function(pid,open){prodEditOpen[String(pid)]=!!open;};
  window.prodShowCandidates=function(pid,mode){
    var brand=BRAND(),token=jwtGet(),version=++candidateVersion;
    var country=(document.getElementById('candidateCountry')||{}).value||'';
    if(['','KR','TH','US','VN','JP'].indexOf(country)<0)return;
    candidateCountry=country;prodCandidates=null;candSelected={};
    return req('GET','/brands/'+brand+'/products/'+pid+'/candidates?'+(mode==='ai'?'mode=ai&':'')+'country='+encodeURIComponent(country))
      .then(function(r){if(version!==candidateVersion||BRAND()!==brand||jwtGet()!==token)return;r.searchCountry=country;prodCandidates=r;render();})
      .catch(function(e){if(version===candidateVersion&&BRAND()===brand&&jwtGet()===token)toast('후보 조회 실패',mailEscape(e.message||'잠시 후 다시 시도해 주세요.'));});
  };
  window.candidateCountryChanged=function(value){candidateCountry=value;candidateVersion++;prodCandidates=null;candSelected={};};
  window.candToggle=function(uid){
    if(!prodCandidates)return;
    var cd=(prodCandidates.candidates||[]).filter(function(c){return (c.candidateId||c.uid)===uid||String(c.candidateId||c.uid||'').replace(/[^a-zA-Z0-9._-]/g,'')===uid;})[0];
    if(!cd||!cd.email)return;
    var key=cd.candidateId||cd.uid;
    if(candSelected[key])delete candSelected[key];
    else candSelected[key]={email:cd.email,handle:cd.handle,country:cd.country,verified:!!cd.emailVerified,reason:cd.aiReason||(cd.evidence||[]).join('; ')};
    render();
  };
  window.outreachFromCandidates=function(pid){
    if(!prodCandidates||prodCandidates.productId!==pid)return;
    var picked=Object.keys(candSelected).map(function(k){return candSelected[k];});
    if(!picked.length)return toast('후보 선택','아웃리치에 담을 후보를 먼저 체크하세요.');
    if(picked.length>20)return toast('최대 20명','아웃리치는 한 번에 최대 20명입니다.');
    var pname=prodCandidates.productName||'제품';
    var countryLabel=prodCandidates.searchCountry||'전체';
    // 추천 컨텍스트(제품·국가·근거)를 초안 브리프에 보존 — AI가 이 근거로 작성
    var brief='제품 "'+pname+'" 협업 제안. 타깃 국가: '+countryLabel+'. 선택 후보: '
      +picked.map(function(c){return '@'+(c.handle||'')+(c.country?'('+c.country+')':'')+' [근거: '+String(c.reason||'별도 근거 없음').slice(0,70)+']';}).join(', ')
      +'. 각 후보의 관심 분야 근거를 반영해 정중한 첫 제안을 작성. 브랜드 PR 리스트 합류를 권유.';
    var unverified=picked.filter(function(c){return !c.verified;}).length;
    liveNav('mail');
    var set=function(id,v){var el=document.getElementById(id);if(el)el.value=v;};
    set('outRecipients',picked.map(function(c){return c.email;}).join('\n'));
    set('outProduct',pid);
    set('outBrief',brief.slice(0,2000));
    toast('후보 '+picked.length+'명 담김','AI 초안 하단에 브랜드 합류 링크가 자동 포함됩니다.'+(unverified?' 미검증 이메일 '+unverified+'건 — 발송 전 주소를 확인하세요.':'')+' 자동 발송은 없으며 검토 후 직접 발송합니다.');
  };
  window.productsRetry=function(){loadProducts();render();};
  function productsCard(){
    var h='<h1>제품 · 어필리에이트 캠페인</h1><p>제품별로 정보를 학습·저장하면, 후보 추천과 아웃리치 초안이 그 제품 근거를 사용합니다.</p>';
    if(typeof productsLoadError!=='undefined'&&productsLoadError)h+='<p role="alert">'+productsLoadError+' <button class="cbt" onclick="productsRetry()">다시 불러오기</button></p>';
    if(prodNotice)h+='<p role="status">'+mailEscape(prodNotice)+'</p>';
    h+='<div class="cc"><h2>새 제품</h2><input id="pNew" placeholder="제품 이름 (예: 시카 진정 앰플)"><input id="pRef" placeholder="틱톡샵 상품 ID·URL (선택)"><input id="pPct" placeholder="커미션 % (기본 10, 소수 가능)"><button class="btn" onclick="prodCreate()">제품 등록</button></div>';
    h+='<label>후보 타깃 국가<select id="candidateCountry" onchange="candidateCountryChanged(this.value)">'+[['','전체'],['KR','한국'],['TH','태국'],['US','미국'],['VN','베트남'],['JP','일본']].map(function(c){return '<option value="'+c[0]+'"'+(candidateCountry===c[0]?' selected':'')+'>'+c[1]+'</option>';}).join('')+'</select></label>';
    (productsData||[]).forEach(function(pd){
      h+='<div class="cc"><h2>'+mailEscape(pd.name)+' <span style="font-size:12px;font-weight:400;color:var(--ink-2,#566274)">커미션 '+pd.commissionPct+'% · 프로필 v'+pd.profileVersion+'</span></h2>';
      var f=pd.fields||{};
      var oneLiner=f.product_one_liner&&(f.product_one_liner.value||'')||'';
      // 요약 먼저, 긴 편집 폼은 접어서 — 필요할 때만 펼쳐 수정한다.
      h+='<p style="margin:4px 0 10px;color:var(--ink-2,#566274)">'+(oneLiner?mailEscape(oneLiner):(pd.profileVersion>0?'요약 문구가 비어 있습니다.':'프로필 미작성 — 저장하면 후보 추천·초안이 이 근거를 사용합니다.'))+'</p>';
      h+='<details'+(prodEditOpen[pd.productId]?' open':'')+' ontoggle="prodEditToggle(\''+pd.productId+'\',this.open)"><summary style="cursor:pointer;font-weight:700">제품 프로필 '+(pd.profileVersion>0?'보기·편집':'작성')+' <small style="font-weight:400">(저장 시 v'+(pd.profileVersion+1)+')</small></summary><div style="margin-top:10px">';
      h+=['product_one_liner','usp','ingredients','price_range'].map(function(k){
        var v=f[k]&&(f[k].value||'')||'';
        var label={product_one_liner:'제품 한 줄',usp:'차별점(USP)',ingredients:'성분·특징',price_range:'가격대'}[k];
        return '<label>'+label+'<textarea id="pf_'+k+'_'+pd.productId+'" maxlength="2000">'+mailEscape(v)+'</textarea></label>';
      }).join('');
      h+='<button class="btn" onclick="prodSaveProfile(\''+pd.productId+'\')">프로필 저장 (v'+(pd.profileVersion+1)+')</button></div></details><div style="margin-top:12px"></div>';
      h+='<input id="pc_'+pd.productId+'" placeholder="모집 이름 (예: 9월 태국 어필리에이트)" style="display:inline-block;width:280px"> ';
      h+='<button class="btn line" onclick="prodCampaign(\''+pd.productId+'\')">캠페인 개설</button> ';
      h+='<button class="btn line" onclick="prodShowCandidates(\''+pd.productId+'\')">후보 보기</button> ';
      h+='<button class="btn line" onclick="prodShowCandidates(\''+pd.productId+'\',\'ai\')">AI 추천(의미 평가)</button>';
      if(prodCandidates&&prodCandidates.productId===pd.productId){
        var aim=prodCandidates.ai||{mode:'keyword'};
        var modeLabel=aim.mode==='ai'?('AI 의미 평가 · '+mailEscape(aim.model||'')+' · 신규 '+(aim.evaluated||0)+'건 · 캐시 '+(aim.cachedHits||0)+'건'+(aim.notice?' · '+mailEscape(aim.notice):'')):aim.mode==='fallback_keyword'?('키워드 폴백 — '+mailEscape(aim.reason||'')):'키워드 일치';
        h+='<h2 style="margin-top:14px">추천 후보 — '+mailEscape(prodCandidates.searchCountry||'전체 국가')+' · '+modeLabel+'</h2><p style="font-size:12px">'+mailEscape(prodCandidates.note)+'</p>';
        (prodCandidates.candidates||[]).slice(0,10).forEach(function(cd){
          var safeUid=String(cd.candidateId||cd.uid||'').replace(/[^a-zA-Z0-9._-]/g,'');
          var pick=cd.email?'<label style="float:right;font-size:12px"><input type="checkbox" onchange="candToggle(\''+safeUid+'\')" '+(candSelected[cd.candidateId||cd.uid]?'checked':'')+'> 아웃리치 담기</label>':'';
          h+='<div class="cc">'+pick+'<b>@'+mailEscape(cd.handle||'')+'</b>'+(cd.aiFit!=null?' · <b>AI 적합 '+cd.aiFit+'</b>'+(cd.aiCached?' (캐시)':''):'')+(cd.fitScore?' · 키워드 '+cd.fitScore:'');
          if(cd.email)h+='<div style="font-size:12px;margin-top:2px">'+mailEscape(cd.email)+(cd.emailVerified?' <span style="color:#2e7d4f">검증됨</span>':' <span style="color:#8a6d3b">미검증 — 발송 전 확인</span>')+'</div>';
          if(cd.aiReason)h+='<p style="font-size:12px;margin:4px 0 0">'+mailEscape(cd.aiReason)+((cd.aiSignals||[]).length?' — 근거 태그: '+mailEscape(cd.aiSignals.join(', ')):'')+'</p>';
          h+='<ul style="margin:6px 0 0;padding-left:18px">'+ (cd.evidence||[]).map(function(e){return '<li style="font-size:12px">'+mailEscape(e)+'</li>';}).join('')+'</ul></div>';
        });
        var pickedCount=Object.keys(candSelected).length;
        if((prodCandidates.candidates||[]).length)h+='<button class="btn" onclick="outreachFromCandidates(\''+pd.productId+'\')" '+(pickedCount?'':'disabled')+'>선택 '+pickedCount+'명으로 아웃리치 초안 만들기</button><p style="font-size:12px">초안 하단에 브랜드 PR 리스트 합류 링크가 자동 포함됩니다. 자동 발송은 없습니다.</p>';
        if(!(prodCandidates.candidates||[]).length)h+='<p>조건에 맞는 후보가 아직 없습니다 (후보 DB 수집 대기).</p>';
      }
      h+='</div>';
    });
    if(productsData&&!productsData.length)h+='<div class="cc"><p>등록된 제품이 없습니다.</p></div>';
    h+=collabCard();
    return h;
  }
  var livePage='home', chatMessages=[], chatBusy=false, profileAnswers={};
  var profileLabels={brand_one_liner:'브랜드 소개',hero_product:'주력 제품',ingredients:'성분·특징',price_range:'가격대',voice:'말투',ideal_creator:'원하는 크리에이터',banned_words:'금지 표현',sample_criteria:'샘플 기준'};
  function loadProfile(){var brand=BRAND();if(!brand)return;profileError='';req('GET','/brands/'+brand+'/profile/learned').then(function(r){if(BRAND()!==brand)return;profileData=r;Object.keys(r.fields||{}).forEach(function(k){profileAnswers[k]=typeof r.fields[k]==='string'?r.fields[k]:(r.fields[k].value||'');});if(window.__SURFACE==='brand')render();}).catch(function(e){profileError=e.message;if(window.__SURFACE==='brand')render();});}
  window.liveNav=function(page){livePage=page;ST.b=page==='mail'?'src':page==='billing'?'settle':'brief';ST.srcTab='mail';if(BRAND()){if(page==='products')loadProducts();if(page==='mail'){if(!window.__BID)loadIdentity();if(!window.__GMAIL)loadGmail();if(!window.__INBOX)loadInbox();if(!outreachData)loadOutreach();}if(page==='billing'&&!window.__billing)loadBilling();}render();var viewport=document.getElementById('stage');if(viewport)viewport.scrollTop=0;if(window.scrollTo)window.scrollTo(0,0);if(page==='community')window.brandCommunityRefresh();};
  window.profileUrlChanged=function(v){if(v!==profileUrl){profileUrl=v;profileDraft=null;profileNotice="주소가 바뀌었습니다. 다시 분석해 주세요.";var save=document.getElementById("profileSave");if(save){save.disabled=true;save.textContent="새 주소로 다시 분석해 주세요";}}};
  window.liveLearn=async function(){
    if(profileBusy)return;profileUrl=(document.getElementById('brandSite').value||'').trim();if(!profileUrl)return toast('주소 입력 필요','분석할 홈페이지 주소를 입력해 주세요.');
    profileBusy=true;profileDraft=null;profileNotice='공개 페이지를 읽고 분석하고 있습니다…';render();var brand=BRAND();
    try{var r=await req('POST','/brand-learning',{url:profileUrl});if(BRAND()!==brand)return;profileDraft=r;Object.keys(r.fields||{}).forEach(function(k){profileAnswers[k]=r.fields[k].value;});profileNotice='실제 페이지 '+r.pagesRead+'개 · 본문 '+r.charactersRead+'자 분석 완료. 근거를 확인한 뒤 저장해 주세요.';}
    catch(e){profileNotice=e.message;}finally{profileBusy=false;render();}
  };
  window.liveSaveProfile=async function(){if(profileBusy)return;if(!profileDraft&&!Object.values(profileAnswers).some(function(v){return v.trim();})&&!(profileData&&Object.keys(profileData.fields||{}).some(function(k){return Object.prototype.hasOwnProperty.call(profileAnswers,k);})))return toast('입력 필요','브랜드 정보를 입력하거나 홈페이지를 분석하세요.');profileBusy=true;render();var brand=BRAND();
    try{var r=await req('POST','/brands/'+brand+'/profile/learned',{learning_id:profileDraft?profileDraft.learningId:null,answers:profileAnswers});if(BRAND()!==brand)return;profileData=r;profileDraft=null;profileNotice='브랜드 프로필 v'+r.version+' 저장 완료. 이제 대화와 캠페인 초안에서 이 내용을 참고합니다.';}
    catch(e){profileNotice=e.message;}finally{profileBusy=false;render();}
  };
  window.liveChat=async function(){var input=document.getElementById('liveQuestion'),q=input.value.trim();if(!q||chatBusy)return;input.value='';var history=chatMessages.slice(-8);chatMessages.push({role:'user',content:q});chatBusy=true;render();var brand=BRAND();
    try{var r=await req('POST','/assistant/chat',{brand:brand,message:q,history:history});if(BRAND()===brand)chatMessages.push({role:'assistant',content:r.reply});}
    catch(e){if(BRAND()===brand)chatMessages.push({role:'assistant',content:'응답 실패: '+e.message});}finally{chatBusy=false;render();}
  };
  function learnedFields(fields){return Object.keys(fields||{}).map(function(k){var f=fields[k];return '<div class="cc"><b>'+mailEscape(profileLabels[k]||k)+'</b><p>'+mailEscape(typeof f==='string'?f:f.value||'')+'</p>'+(f.evidence?'<blockquote>근거: '+mailEscape(f.evidence)+'</blockquote>':'')+'</div>';}).join('');}
  window.profileAnswer=function(k,v){profileAnswers[k]=v;};
  function manualProfileCard(){return '<h2>직접 입력하거나 수정하기</h2><p>자동 분석이 불가능한 경우에도 직접 작성해 저장할 수 있습니다.</p>'+['brand_one_liner','hero_product','ideal_creator','banned_words','sample_criteria','voice'].map(function(k){return '<label>'+mailEscape(profileLabels[k])+'<textarea maxlength="2000" oninput="profileAnswer(\''+k+'\',this.value)">'+mailEscape(profileAnswers[k]||'')+'</textarea></label>';}).join('')+'<button class="btn" onclick="liveSaveProfile()" '+(profileBusy?'disabled':'')+'>내용 확인하고 저장</button>';}
  function liveLearningCard(){return '<h1>theprlist에 브랜드를 알려주세요</h1><p>공개 홈페이지 한 페이지를 읽어 브랜드 정보를 추출합니다. 모델 자체를 재훈련하거나 SNS·리뷰 전체를 수집하는 기능은 아닙니다.</p><label>브랜드 홈페이지<input id="brandSite" oninput="profileUrlChanged(this.value)" type="url" placeholder="https://brand.com/about" value="'+mailEscape(profileUrl)+'" '+(profileBusy?'disabled':'')+'></label><button class="btn" onclick="liveLearn()" '+(profileBusy?'disabled':'')+'>홈페이지 분석</button><p role="status">'+mailEscape(profileNotice||profileError)+'</p>'+(profileDraft?'<h2>분석 결과 · 아직 저장 전</h2><p>출처: '+mailEscape(profileDraft.sourceUrl)+'</p>'+learnedFields(profileDraft.fields)+'<button id="profileSave" class="btn" onclick="liveSaveProfile()" '+(profileBusy?'disabled':'')+'>확인하고 브랜드 프로필에 저장</button>':'')+manualProfileCard()+'<h2>저장된 브랜드 프로필'+(profileData?' · v'+profileData.version:'')+'</h2>'+(profileData&&profileData.version?learnedFields(profileData.fields):'<p>저장된 정보가 없습니다. 분석 후 저장해 주세요.</p>');}
  var brandCells=[],brandConversation=null,brandConversationError='',brandConversationBusy=false,brandConversationVersion=0,brandConversationDraft='';
  window.brandCommunityRefresh=async function(){
    if(brandConversationBusy)return;
    var version=++brandConversationVersion,owner=BRAND(),token=jwtGet();brandConversationError='';
    if(!owner)return;
    try{var rows=await req('GET','/community/my-cells');if(version!==brandConversationVersion||owner!==BRAND()||token!==jwtGet())return;brandCells=rows.filter(function(c){return c.brandId===owner;});render();}
    catch(e){if(version===brandConversationVersion){brandConversationError=e.message;render();}}
  };
  window.brandCommunityOpen=async function(index){
    var cell=brandCells[index];if(!cell||brandConversationBusy)return;
    var version=++brandConversationVersion,owner=BRAND(),token=jwtGet();brandConversationError='';brandConversationDraft='';brandConversation=null;render();
    try{var rows=await req('GET','/community/cells/'+encodeURIComponent(cell.cellId)+'/messages');if(version!==brandConversationVersion||owner!==BRAND()||token!==jwtGet())return;brandConversation={cell:cell,messages:rows};
      var maxId=0;(rows||[]).forEach(function(x){if(x.msgId&&x.msgId>maxId)maxId=x.msgId;});
      if(maxId)req('POST','/community/cells/'+encodeURIComponent(cell.cellId)+'/read',{last_msg_id:maxId}).then(function(){if(typeof brandUnread!=='undefined'&&brandUnread[cell.cellId])delete brandUnread[cell.cellId];}).catch(function(){});
      render();}
    catch(e){if(version===brandConversationVersion){brandConversationError=e.message;render();}}
  };
  window.brandCommunityDraft=function(value){brandConversationDraft=value;};
  var translationRetryBusy={};
  window.brandTranslationRetry=async function(msgId){
    if(!brandConversation||translationRetryBusy[msgId])return;   // 중복 클릭 방지
    var version=brandConversationVersion,owner=BRAND(),token=jwtGet(),cell=brandConversation.cell;
    translationRetryBusy[msgId]=true;brandConversationError='';render();
    try{var r=await req('POST','/community/cells/'+encodeURIComponent(cell.cellId)+'/messages/'+encodeURIComponent(msgId)+'/translation-retry');
      if(version!==brandConversationVersion||owner!==BRAND()||token!==jwtGet())return;
      brandConversationError=r.translationState==='done'?'번역 재시도 완료 ✅':(r.hint||'재시도를 접수했습니다 — 자동 재시도가 이어집니다.');
      var rows=await req('GET','/community/cells/'+encodeURIComponent(cell.cellId)+'/messages');
      if(version===brandConversationVersion&&owner===BRAND()&&token===jwtGet())brandConversation.messages=rows;
    }catch(e){if(version===brandConversationVersion)brandConversationError='번역 재시도 실패: '+e.message;}
    finally{delete translationRetryBusy[msgId];if(version===brandConversationVersion)render();}
  };
  var brandComposeChannel='chat';
  window.brandComposeChannelSet=function(v){brandComposeChannel=['chat','tips','notice'].indexOf(v)>=0?v:'chat';render();};
  window.brandPinMsg=async function(msgId,pin){
    if(brandConversationBusy||!brandConversation)return;
    var version=brandConversationVersion,owner=BRAND(),token=jwtGet(),cell=brandConversation.cell;
    var safeId=String(msgId).replace(/[^0-9]/g,'');if(!safeId)return;
    brandConversationBusy=true;render();
    try{await req('POST','/community/cells/'+encodeURIComponent(cell.cellId)+'/messages/'+safeId+'/'+(pin?'pin':'unpin'),{});
      var rows=await req('GET','/community/cells/'+encodeURIComponent(cell.cellId)+'/messages');
      if(version===brandConversationVersion&&owner===BRAND()&&token===jwtGet())brandConversation.messages=rows;
    }catch(e){if(version===brandConversationVersion)brandConversationError=(e&&e.message)||'고정 처리에 실패했습니다';}
    finally{if(version===brandConversationVersion){brandConversationBusy=false;render();}}
  };
  window.brandCommunitySend=async function(){
    if(brandConversationBusy||!brandConversation||!brandConversationDraft.trim())return;
    var version=brandConversationVersion,owner=BRAND(),token=jwtGet(),cell=brandConversation.cell;
    var channel=cell.kind==='dm'?'chat':brandComposeChannel;
    brandConversationBusy=true;brandConversationError='';render();
    try{await req('POST','/community/cells/'+encodeURIComponent(cell.cellId)+'/messages',{text:brandConversationDraft.trim(),locale:'ko',channel:channel});
      if(version!==brandConversationVersion||owner!==BRAND()||token!==jwtGet())return;
      brandConversationDraft='';var rows=await req('GET','/community/cells/'+encodeURIComponent(cell.cellId)+'/messages');
      if(version===brandConversationVersion&&owner===BRAND()&&token===jwtGet())brandConversation.messages=rows;
    }catch(e){if(version===brandConversationVersion)brandConversationError=e.message;}
    finally{if(version===brandConversationVersion){brandConversationBusy=false;render();}}
  };
  function brandCommunityCard(){
    var h='<h1>커뮤니티 · 담당자 DM</h1><p>브랜드 멤버의 라운지와 일대일 대화입니다. 이메일로 발송되지 않습니다.</p><button class="btn line" onclick="brandCommunityRefresh()" '+(brandConversationBusy?'disabled':'')+'>대화 목록 새로고침</button><p role="status">'+mailEscape(brandConversationError)+'</p>';
    h+=brandCells.map(function(c,i){var un=(typeof brandUnread!=='undefined'&&brandUnread[c.cellId]&&brandUnread[c.cellId].unread)||0;return '<button class="btn line" onclick="brandCommunityOpen('+i+')" '+(brandConversationBusy?'disabled':'')+'>'+mailEscape((c.kind==='dm'?'DM · ':'라운지 · ')+c.name)+(un?' <b>새 '+un+'</b>':'')+'</button>';}).join('');
    if(!brandCells.length)h+='<p>표시할 대화가 없습니다.</p>';
    if(brandConversation){h+='<h2>'+mailEscape(brandConversation.cell.name)+'</h2>';
      h+=brandConversation.messages.map(function(m){var translated=m.originalLocale!=='ko'&&m.translations&&m.translations.ko;
        var retry='';
        if(m.translationState==='failed'){var busy=!!translationRetryBusy[m.msgId];
          var safeId=String(m.msgId).replace(/[^0-9]/g,'');
          retry='<div style="margin-top:4px"><small style="color:#8a6d3b">번역 실패 — 원문은 보존되어 있습니다.</small> <button class="btn line" style="font-size:11px;padding:2px 8px" onclick="brandTranslationRetry(\''+safeId+'\')" '+(busy?'disabled':'')+'>'+(busy?'재시도 중…':'번역 재시도')+'</button></div>';}
        else if(m.translationState==='pending'){retry='<div style="margin-top:4px"><small style="color:#8a6d3b">번역 준비 중 — 자동 재시도 대기</small></div>';}
        var isLounge=brandConversation.cell.kind!=='dm';
        var safeId=String(m.msgId==null?'':m.msgId).replace(/[^0-9]/g,'');
        var chTag=m.channel&&m.channel!=='chat'?'<span class="pill'+(m.channel==='notice'?' warn':'')+'" style="margin-right:6px">'+({tips:'촬영 팁',notice:'공지'}[m.channel]||mailEscape(m.channel))+'</span>':'';
        var pinned=m.pinnedAt?'<span style="font-size:11px;color:#8a6d3b;font-weight:700">📌 고정됨</span> ':'';
        var pinBtn=isLounge&&safeId?' <button class="btn line" style="font-size:11px;padding:2px 8px" onclick="brandPinMsg(\''+safeId+'\','+(m.pinnedAt?'false':'true')+')" '+(brandConversationBusy?'disabled':'')+'>'+(m.pinnedAt?'고정 해제':'공지 고정')+'</button>':'';
        var replies=m.replyCount?'<small style="color:#5a6560"> · 답글 '+m.replyCount+'개</small>':'';
        return '<article class="cc"'+(m.pinnedAt?' style="border-color:#d9b96a;background:#fffaf0"':'')+'><small>'+chTag+pinned+mailEscape(m.author)+' · '+mailEscape(m.at)+replies+pinBtn+'</small><p>'+mailEscape(translated||m.original)+'</p>'+(translated?'<small>원문 ('+mailEscape(m.originalLocale)+'): '+mailEscape(m.original)+'</small>':'')+retry+'</article>';}).join('')||'<p>아직 메시지가 없습니다.</p>';
      var lounge=brandConversation.cell.kind!=='dm';
      h+=(lounge?'<label>게시 채널 <select onchange="brandComposeChannelSet(this.value)" '+(brandConversationBusy?'disabled':'')+' style="max-width:220px">'+[['chat','# 잡담'],['tips','# 촬영 팁'],['notice','◎ 공지 — 멤버 전원 알림']].map(function(c){return '<option value="'+c[0]+'" '+(brandComposeChannel===c[0]?'selected':'')+'>'+c[1]+'</option>';}).join('')+'</select></label>'+(brandComposeChannel==='notice'?'<p style="font-size:12px;color:#8a6d3b">공지를 게시하면 이 브랜드 멤버 전원에게 알림(배지+카드)이 갑니다. 현재 대화 강제 이동은 없습니다.</p>':''):'');
      h+='<label>'+(lounge?(brandComposeChannel==='notice'?'공지 내용':'채널 메시지'):'담당자 답장')+'<textarea maxlength="2000" oninput="brandCommunityDraft(this.value)" '+(brandConversationBusy?'disabled':'')+'>'+mailEscape(brandConversationDraft)+'</textarea></label><button class="btn" onclick="brandCommunitySend()" '+(brandConversationBusy?'disabled':'')+'>'+(brandConversationBusy?'전송 중…':lounge&&brandComposeChannel==='notice'?'공지 게시':'대화에 보내기')+'</button>';
    }return h;
  }

  /* ── 팀 권한(owner/manager)·콘솔 알림 ── */
  var brandTeam=null, brandTeamError='', brandTeamBusy=false, brandNotifs=null;
  window.loadTeam=function(){
    var b=BRAND();if(!b)return;
    brandTeamError='';
    req('GET','/brands/'+b+'/team').then(function(r){if(BRAND()!==b)return;brandTeam=r;render();})
      .catch(function(e){if(BRAND()!==b)return;brandTeam=[];brandTeamError=(e&&e.message)||'팀 목록을 불러오지 못했습니다';render();});
  };
  window.teamSetRole=function(userId,role){
    if(brandTeamBusy)return;brandTeamBusy=true;render();
    req('POST','/brands/'+BRAND()+'/team/role',{user_id:userId,role:role})
      .then(function(){toast('역할 변경','저장됐어요.');window.loadTeam();})
      .catch(function(e){toast('변경 불가',mailEscape((e&&e.message)||'역할 변경은 소유자(owner)만 할 수 있어요.'));})
      .finally(function(){brandTeamBusy=false;render();});
  };
  function teamCard(){
    if(brandTeam===null){window.loadTeam();return '<h1>팀</h1><p role="status">팀 목록을 불러오는 중…</p>';}
    var h='<h1>팀</h1><p>같은 브랜드를 함께 운영하는 계정과 역할입니다. 역할 변경은 소유자(owner)만 저장할 수 있어요(서버에서 검증).</p>';
    if(brandTeamError)h+='<p role="alert">'+mailEscape(brandTeamError)+' <button class="btn line" onclick="loadTeam()">다시 시도</button></p>';
    h+=brandTeam.map(function(m){
      return '<div class="cc"><b>'+mailEscape(m.email)+'</b> <span class="pill'+(m.role==='owner'?' ok':'')+'">'+(m.role==='owner'?'소유자':'매니저')+'</span> <span style="font-size:12px;color:#5a6560">'+mailEscape((m.joinedAt||'').slice(0,10))+' 합류 · '+mailEscape(m.state||'')+'</span>'
        +' <span class="cbt line" onclick="teamSetRole(\''+String(m.userId).replace(/[^0-9a-f-]/g,'')+'\',\''+(m.role==='owner'?'manager':'owner')+'\')" '+(brandTeamBusy?'disabled':'')+'>'+(m.role==='owner'?'매니저로 변경':'소유자로 변경')+'</span></div>';
    }).join('')||'<p>표시할 팀원이 없습니다.</p>';
    h+='<div class="cc"><p style="font-size:13px">팀원 초대는 운영팀 승인·초대 메일로 진행됩니다. 전사 대량 발송 권한은 어떤 역할에도 부여되지 않아요 — 중앙 모집 발송은 운영 워크스페이스에서만 합니다.</p></div>';
    return h;
  }
  function brandNotifsCard(){
    if(!window.__ME)return '';
    if(brandNotifs===null){brandNotifs=false;req('GET','/me/notifications?limit=10').then(function(n){brandNotifs=n;render();}).catch(function(){brandNotifs={items:[],unreadCount:0};});return '';}
    if(!brandNotifs||!(brandNotifs.items||[]).length)return '';
    return '<div class="cc"><h2>알림'+(brandNotifs.unreadCount?' · 안 읽음 '+brandNotifs.unreadCount:'')+'</h2>'+brandNotifs.items.slice(0,5).map(function(i){return '<p style="font-size:13px"><b>'+mailEscape(i.title)+'</b>'+(i.body?' — '+mailEscape(i.body):'')+' <small>'+mailEscape((i.at||'').slice(0,16).replace('T',' '))+'</small></p>';}).join('')+'</div>';
  }
  var originalRender=window.render;
  /* 관리자 브랜드 선택 — 기존 관리자 권한 범위의 조회(/community/my-cells,
     admin은 전체 셀)만 사용해 브랜드 목록을 만든다. 신규 권한 없음. */
  var adminBrands=null, adminBrandsError='';
  function loadAdminBrands(){
    if(!window.__ME||window.__ME.kind!=='admin')return;
    req('GET','/community/my-cells').then(function(rows){
      if(!window.__ME||window.__ME.kind!=='admin')return;
      var seen={},list=[];
      (rows||[]).forEach(function(c){if(c.brandId&&!seen[c.brandId]){seen[c.brandId]=1;list.push({brandId:c.brandId,name:c.brandName||c.brandId});}});
      adminBrands=list;adminBrandsError='';render();
    }).catch(function(e){adminBrands=[];adminBrandsError=(e&&e.message)||'브랜드 목록을 불러오지 못했습니다';render();});
  }
  function adminPickCard(){
    if(adminBrands===null){loadAdminBrands();return '<h1>브랜드 선택</h1><p>관리자 계정입니다. 브랜드를 선택하기 전에는 어떤 브랜드 데이터도 조회·변경하지 않습니다.</p><p>브랜드 목록을 불러오는 중…</p>';}
    var h='<h1>브랜드 선택</h1><p>관리자 계정입니다. 아래에서 브랜드를 <b>명시적으로 선택</b>해야 그 브랜드의 로고·제품·캠페인·학습·커뮤니티·인박스·청구에 접근합니다.</p>';
    if(adminBrandsError)h+='<p role="alert">'+mailEscape(adminBrandsError)+'</p>';
    h+=(adminBrands||[]).map(function(b){
      var id=String(b.brandId).replace(/[^a-z0-9-]/g,'');
      return '<div class="cc" style="cursor:pointer" onclick="adminPickBrand(\''+id+'\')"><b>'+mailEscape(b.name)+'</b> <span style="font-size:12px;color:#5a6560">'+mailEscape(b.brandId)+(b.brandId==='glowlab'?' · 데모 브랜드':'')+' · 선택 →</span></div>';
    }).join('')||'<p>선택할 브랜드가 없습니다.</p>';
    return h;
  }
  window.adminPickBrand=function(b){
    if(!window.__ME||window.__ME.kind!=='admin'||!b)return;
    adminBrand=b;try{localStorage.setItem('CONNECTION_ADMIN_BRAND',b);}catch(e){}
    reloadBrand();               // 캐시·입력 초안·비동기 버전 전부 초기화 후 이 브랜드로 재로드
    loadGmail();loadInbox();loadOutreach();loadBilling();
    toast('브랜드 컨텍스트','<b>'+mailEscape(b)+'</b> 관리 모드 — 모든 페이지가 이 브랜드 기준으로 동작합니다.');
  };
  window.adminSwitchBrand=function(){
    adminBrand=null;try{localStorage.removeItem('CONNECTION_ADMIN_BRAND');}catch(e){}
    adminBrands=null;reloadBrand();render();
  };
  if(window.__SURFACE==='brand'){
    // 콘솔 워크스페이스 셸(wk) — 크리에이터 앱과 같은 Slack-v3 플럼 셸을
    // 공유한다(live-theme.css 런타임 주입 · index.html은 legacy-compat 유지).
    var WK_MENU=[['home','⌂','홈'],['learn','◳','브랜드 학습'],['products','▦','제품·캠페인'],['community','◈','커뮤니티·DM'],['mail','✉','아웃리치·인박스'],['team','◌','팀'],['billing','₩','월별 청구']];
    var wkMenuOpen=false;
    function wkMobile(){try{return window.matchMedia('(max-width:760px)').matches;}catch(e){return false;}}
    window.wkMenuToggle=function(){wkMenuOpen=!wkMenuOpen;render();};
    window.addEventListener('resize',function(){clearTimeout(window.__wkRz);window.__wkRz=setTimeout(function(){if(window.render)render();},150);});
    window.wkNav=function(p){wkMenuOpen=false;liveNav(p);};
    function wkTopHtml(bare){
      var bid=window.__BID||{};
      return '<header class="crtop">'+(bare?'':'<button class="wkburger" onclick="wkMenuToggle()" aria-label="업무 메뉴 열기">☰</button>')
        +'<button class="crtop-brand" style="background:none;border:0;color:inherit;font:inherit;font-weight:700;cursor:pointer;padding:0" onclick="'+(bare?'':'wkNav(\'home\')')+'">theprlist <small>CONSOLE</small></button>'
        +(!bare&&BRAND()?'<span class="wkchip" title="현재 브랜드">'+(bid.logoUrl?'<img src="'+String(bid.logoUrl).replace(/"/g,'')+'" alt="">':'')+mailEscape(bid.name||BRAND())+(window.__ME&&window.__ME.kind==='admin'?' · 관리자':'')+'</span>':'')
        +'<span class="wkspace"></span>'
        +(!bare&&window.__ME&&window.__ME.kind==='admin'&&BRAND()?'<button class="wktop-btn" onclick="adminSwitchBrand()">브랜드 전환</button>':'')
        +(window.__ME?'<button class="crtop-me" onclick="document.getElementById(\'authChip\')&&document.getElementById(\'authChip\').click()" title="계정" aria-label="계정 '+mailEscape(window.__ME.email||'')+'">'+mailEscape((window.__ME.email||'?').slice(0,1).toUpperCase())+'</button>':'')
        +'</header>';
    }
    function wkRailHtml(){
      var bid=window.__BID||{};
      return '<nav class="crrail" aria-label="브랜드"><button class="crrail-brand active" onclick="wkNav(\'home\')" aria-label="'+mailEscape(bid.name||BRAND()||'')+' 홈">'+(bid.logoUrl?'<img src="'+String(bid.logoUrl).replace(/"/g,'')+'" alt="">':mailEscape((bid.name||BRAND()||'?').slice(0,1).toUpperCase()))+'</button>'+(window.__ME&&window.__ME.kind==='admin'?'<button class="crrail-add" onclick="adminSwitchBrand()" aria-label="브랜드 전환">⇄</button>':'')+'</nav>';
    }
    function wkSideHtml(){
      var bid=window.__BID||{};
      var h='<aside class="crside'+(wkMenuOpen?' open':'')+'" aria-label="업무 메뉴"><div class="crside-head"><b>'+mailEscape(bid.name||BRAND()||'')+'</b><small>브랜드 워크스페이스'+(window.__ME&&window.__ME.kind==='admin'?' · 관리자':'')+'</small></div><div class="crside-scroll"><div class="crside-label">업무</div><div class="crside-quick" style="border-bottom:0">';
      h+=WK_MENU.map(function(t){var un=t[0]==='community'?wkUnreadTotal():0;return '<button class="crside-item'+(livePage===t[0]?' active':'')+'" '+(livePage===t[0]?'aria-current="page"':'')+' onclick="wkNav(\''+t[0]+'\')"><span class="hash" aria-hidden="true">'+t[1]+'</span>'+t[2]+(un?'<em>'+(un>99?'99+':un)+'</em>':'')+'</button>';}).join('');
      h+='</div></div><div class="crside-bottom"><span class="crside-me">'+mailEscape((window.__ME&&window.__ME.email)||'')+'</span><a href="https://theprlist.net/privacy">개인정보처리방침</a> · <a href="https://theprlist.net/terms">이용약관</a> · <a href="mailto:chief@dinostudio.kr">문의</a></div></aside>';
      return h;
    }
    function wkBottomNavHtml(){
      // 모바일 4열 고정 네비 — 홈은 상단 로고, 학습·팀은 접는 메뉴(버거)로.
      return '<nav class="crbottomnav" aria-label="주요 메뉴">'+[['products','▦','제품·캠페인'],['community','◈','커뮤니티'],['mail','✉','아웃리치·인박스'],['billing','₩','월별 청구']].map(function(t){return '<button class="'+(livePage===t[0]?'active':'')+'" '+(livePage===t[0]?'aria-current="page"':'')+' onclick="wkNav(\''+t[0]+'\')"><span aria-hidden="true">'+t[1]+'</span>'+t[2]+'</button>';}).join('')+'</nav>';
    }
    /* ── 콘솔 실시간 갱신 폴링 — 알림·미읽음·열린 대화. 크리에이터 폴러와
          같은 규칙: background/로그아웃 중단, 복귀 즉시 1회, 단일 비행,
          오류 backoff, stale(브랜드 전환·세션 교체) 무시, 변경시에만
          softRender. 현재 페이지/대화 강제 이동 없음. ── */
    var brandUnread={},brandPollTimer=null,brandPollBusy=false,brandPollFail=0,brandPollWired=false;
    /* 같은 브랜드·같은 페이지의 폼 초안을 필드별로 보존(폴링 softRender가
       입력을 지우지 않게). 브랜드 전환·로그아웃·계정 교체 시 전부 폐기 —
       다른 브랜드로 값이 새지 않는다. 결제 카드(bc*)·password는 제외. */
    var wkDrafts={},wkLastKey=null,wkDraftToken='';
    function wkDraftKey(){return (BRAND()||'')+'|'+livePage;}
    function wkDraftSkip(el){return el.readOnly||el.type==='password'||/^bc/.test(el.id)||el.id==='axEmail'||el.id==='axPw';}
    window.wkFormClear=function(ids){
      var m=wkDrafts[wkDraftKey()];
      (ids||[]).forEach(function(id){
        if(m)delete m[id];
        var el=document.getElementById(id);
        if(el){if(el.type==='checkbox'||el.type==='radio')el.checked=false;else el.value='';}
      });
    };
    function wkUnreadTotal(){var t=0;Object.keys(brandUnread||{}).forEach(function(k){t+=(brandUnread[k]&&brandUnread[k].unread)||0;});return t;}
    function brandPollSchedule(){
      if(typeof setTimeout!=='function')return;
      if(brandPollTimer)clearTimeout(brandPollTimer);
      brandPollTimer=setTimeout(brandPollTick,Math.min(6000*Math.pow(2,brandPollFail),60000));
    }
    function brandNotifSig(n){return n?JSON.stringify([n.unreadCount,(n.items||[]).map(function(i){return [i.id,i.read];})]):'';}
    function brandPollTick(){
      if(brandPollBusy)return brandPollSchedule();
      if(typeof document!=='undefined'&&document.hidden)return;
      if(!window.__ME||window.__ME.kind==='creator'||!jwtGet()||!BRAND())return; // 로그아웃·브랜드 미선택 시 중단
      brandPollBusy=true;
      var token=jwtGet(),owner=BRAND(),changed=false;
      var work=req('GET','/me/unread').then(function(u){
        if(token!==jwtGet()||owner!==BRAND())return;
        var next={};(u||[]).forEach(function(x){next[x.cellId]=x;});
        if(JSON.stringify(next)!==JSON.stringify(brandUnread)){brandUnread=next;changed=true;}
      }).then(function(){return req('GET','/me/notifications?limit=10');}).then(function(n){
        if(token!==jwtGet()||owner!==BRAND())return;
        if(brandNotifs!==null&&brandNotifs!==false&&brandNotifSig(n)!==brandNotifSig(brandNotifs)){brandNotifs=n;changed=true;}
      }).then(function(){
        if(!brandConversation||brandConversationBusy)return;
        var version=brandConversationVersion,cell=brandConversation.cell;
        return req('GET','/community/cells/'+encodeURIComponent(cell.cellId)+'/messages').then(function(rows){
          if(version!==brandConversationVersion||token!==jwtGet()||owner!==BRAND()||!brandConversation||brandConversation.cell.cellId!==cell.cellId)return; // stale 무시
          if(JSON.stringify(rows)!==JSON.stringify(brandConversation.messages)){
            brandConversation.messages=rows;changed=true;
            var maxId=0;(rows||[]).forEach(function(x){if(x.msgId&&x.msgId>maxId)maxId=x.msgId;});
            if(maxId)req('POST','/community/cells/'+encodeURIComponent(cell.cellId)+'/read',{last_msg_id:maxId}).then(function(){if(brandUnread[cell.cellId])delete brandUnread[cell.cellId];}).catch(function(){});
          }
        });
      });
      return work.then(function(){brandPollFail=0;})
        .catch(function(){brandPollFail=Math.min(brandPollFail+1,4);})
        .then(function(){
          brandPollBusy=false;
          if(changed&&typeof softRender==='function')softRender();
          brandPollSchedule();
        });
    }
    window.brandPollNow=function(){brandPollFail=0;if(brandPollTimer&&typeof clearTimeout==='function')clearTimeout(brandPollTimer);return brandPollTick();};
    function brandPollStart(){
      if(!brandPollWired){
        brandPollWired=true;
        try{document.addEventListener('visibilitychange',function(){
          if(document.hidden){if(brandPollTimer)clearTimeout(brandPollTimer);}
          else window.brandPollNow();
        });}catch(e){}
      }
      brandPollFail=0;brandPollSchedule();
    }
    window.render=function(){
      var stage=document.getElementById('stage');if(!stage)return;
      document.querySelector('.svcbar').style.display='none';
      var preserved={};['outRecipients','outSubject','outBody','outBrief','outProduct','outSender','outTarget','bulkRows','bulkKey','liveQuestion'].forEach(function(id){var el=document.getElementById(id);if(el)preserved[id]=el.value;});
      // 폼 초안 스냅샷 — 직전 렌더가 속했던 브랜드|페이지 키에 저장
      if(wkDraftToken!==jwtGet()){wkDrafts={};wkLastKey=null;wkDraftToken=jwtGet();}
      if(wkLastKey){
        var snap=wkDrafts[wkLastKey]||{};
        stage.querySelectorAll('input[id],textarea[id],select[id]').forEach(function(el){
          if(wkDraftSkip(el))return;
          snap[el.id]=(el.type==='checkbox'||el.type==='radio')?{c:el.checked}:{v:el.value};
        });
        wkDrafts[wkLastKey]=snap;
      }
      var body='',bare=false;
      if(!window.__ME){bare=true;body='<h1>브랜드와 크리에이터,<br>함께 시작할 준비.</h1><p>승인된 브랜드 계정으로 로그인해 주세요.</p><button class="btn" onclick="document.getElementById(\'authChip\').click()">로그인</button> <a class="btn line" href="https://theprlist.net/signup">가입 신청</a>';}
      else if(window.__ME.kind==='creator'){bare=true;body='<h1>크리에이터 계정입니다</h1><p>브랜드 콘솔은 브랜드·운영 계정 전용이에요. 캠페인 지원·커뮤니티·DM은 크리에이터 앱에서 이용하세요.</p><a class="btn" href="https://app.theprlist.net">크리에이터 앱 열기</a> <span class="cbt no" onclick="authLogout()">로그아웃</span>';}
      else if(window.__ME.kind==='admin'&&!BRAND()){bare=true;body=adminPickCard();}
      else if(livePage==='learn')body=liveLearningCard();
      else if(livePage==='products')body=productsCard();
      else if(livePage==='community')body=brandCommunityCard();
      else if(livePage==='team')body=teamCard();
      else if(livePage==='mail')body='<h1>브랜드 메일링</h1>'+identityCard()+gmailCard()+outreachCard()+inboxCard();
      else if(livePage==='billing')body='<h1>월별 청구</h1><p>검증 가입 1명당 5,000원 · 부가세 포함 · 월 단위 합산</p><p>현재는 월별 합산 금액을 계산서(수기 청구) 방식으로 안내하는 운영입니다 — <b>카드 등록은 필수가 아닙니다.</b> 계산서 발행 여부·시점은 별도 이메일로 안내됩니다(이 화면은 발행 여부를 표시하지 않습니다).</p><p>카드 결제 최소금액은 1,000원입니다. 미만 청구서도 보관되며 자동 결제되지 않습니다.</p><button class="btn line" onclick="refreshBilling()">새로고침</button>'+window.billingCardHtml()+window.billingInvoicesHtml();
      else if(livePage==='status')body='<h1>서비스 상태</h1><div class="cc"><h2>이용 가능한 흐름</h2><p>브랜드 신청 → 운영자 승인 → 계정 생성 → 홈페이지 분석·프로필 저장 → 제품별 후보 추천 → Gmail 연결 → 아웃리치 초안 검토·발송 → 답장 수신(인박스 동기화) → 크리에이터 커뮤니티·캠페인 협업 → 월별 청구 확인</p></div><div class="cc"><h2>준비 중</h2><p>틱톡·인스타 계정 자동 검증과 자동 후보 수집(현재는 운영자 등록 후보 기준), 크리에이터 대금 지급 화면은 아직 공개 운영 대상이 아닙니다.</p><p>가입 과금은 실제 검증 가입이 기록될 때만 발생합니다.</p></div>';
      else body='<p class="live-eyebrow">HOME</p><h1>'+mailEscape((window.__BID&&window.__BID.name)||BRAND()||'')+' 워크스페이스</h1><p>'+(window.__ME.kind==='admin'?'관리자 · ':'')+mailEscape(window.__ME.email)+' · 브랜드 <b>'+mailEscape(BRAND()||'')+'</b></p>'+brandNotifsCard()+'<div class="live-grid"><button class="cc" onclick="wkNav(\'learn\')"><h2>01. 브랜드 학습</h2><p>홈페이지 분석과 근거를 확인하고 저장하세요.</p></button><button class="cc" onclick="wkNav(\'mail\')"><h2>02. 메일링</h2><p>Gmail을 연결하고 초안을 검토한 뒤 발송하세요.</p></button></div><h2>theprlist에게 물어보세요</h2><p>저장된 브랜드 프로필을 참고해 답합니다. 대화로 메일을 발송하거나 결제를 실행하지 않습니다.</p>'+chatMessages.map(function(m){return '<div class="cc"><b>'+(m.role==='user'?'나':'theprlist')+'</b><p>'+mailEscape(m.content)+'</p></div>';}).join('')+'<form onsubmit="event.preventDefault();liveChat()"><input id="liveQuestion" maxlength="2000" placeholder="우리 브랜드를 소개하는 문구를 제안해 줘" required '+(chatBusy?'disabled':'')+'><button class="btn" '+(chatBusy?'disabled':'')+'>'+(chatBusy?'답변 중…':'질문하기')+'</button></form>';
      if(bare){
        stage.innerHTML='<main class="crapp wk" aria-label="theprlist 콘솔">'+wkTopHtml(true)+'<div class="wkbare"><section class="live-main wkentry">'+body+'</section></div></main>';
      }else{
        stage.innerHTML='<main class="crapp wk" aria-label="theprlist 콘솔">'+wkTopHtml(false)+'<div class="crshell">'+wkRailHtml()+((!wkMobile()||wkMenuOpen)?wkSideHtml():'')+'<div class="crmain"><section class="live-main wkpage page-'+livePage+'">'+body+'</section></div></div>'+(wkMenuOpen?'<div class="wkbackdrop" onclick="wkMenuToggle()" aria-hidden="true"></div>':'')+wkBottomNavHtml()+'</main>';
      }
      if(bare){wkLastKey=null;}
      else{
        var dk=wkDraftKey(),saved=wkDrafts[dk];
        if(saved)Object.keys(saved).forEach(function(id){
          var el=document.getElementById(id);if(!el||wkDraftSkip(el))return;
          var st=saved[id];
          if('c' in st)el.checked=st.c;else if(el.value!==st.v)el.value=st.v;
        });
        wkLastKey=dk;
      }
      Object.keys(preserved).forEach(function(id){var el=document.getElementById(id);if(el)el.value=preserved[id];});
    };
    var previousReload=reloadBrand;
    reloadBrand=function(){['outRecipients','outSubject','outBody','outBrief','outProduct','outSender','outTarget','bulkRows','bulkKey','liveQuestion'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});brandConversationVersion++;brandCells=[];brandConversation=null;brandConversationError='';brandConversationBusy=false;brandConversationDraft='';gmailSyncNotice='';bulkMappings=[];bulkInvalidate();outreachTargets=[];outreachTargetProducts=[];outreachTargetBrand='';outreachTargetVersion++;productsData=null;productsLoadError='';prodNotice='';prodCandidates=null;candidateCountry='';candidateVersion++;candSelected={};prodEditOpen={};brandCampaigns=null;collabOpen=null;brandTeam=null;brandTeamError='';brandNotifs=null;campEditOpen=null;brandComposeChannel='chat';wkDrafts={};wkLastKey=null;window.__BID=null;profileData=null;profileDraft=null;profileNotice='';profileUrl='';profileAnswers={};chatMessages=[];window.__GMAIL=null;window.__INBOX=null;inboxShowAll=false;previousReload();if(window.__ME&&BRAND()){loadProfile();loadProducts();loadIdentity();brandPollStart();}};
    // 시각 정본은 live-theme.css(docs/UI_DESIGN_GUIDE.md) — 여기서는 표면
    // 활성 클래스만 부여한다.
    document.body.classList.add('live-surface');
    // 시각 정본 live-theme.css를 런타임 주입(콘솔 index.html은 legacy-compat 유지)
    if(!document.querySelector('link[href*="live-theme"]')){var lk=document.createElement('link');lk.rel='stylesheet';lk.href='/live-theme.css?v=wk1';document.head.appendChild(lk);}
    var style=document.createElement('style');style.textContent='body{background:#fcfbfd}.live-main button:focus-visible,.live-main a:focus-visible,.crtop button:focus-visible,.crside button:focus-visible{outline:3px solid #9e8aab;outline-offset:2px}';document.head.appendChild(style);render();brandPollStart();
  }

  if(window.__SURFACE==='bjoin'){
    var passwordRecoveryPage = new URLSearchParams(location.search).has('reset');
    window.render=function(){document.querySelector('.svcbar').style.display='none';document.getElementById('stage').innerHTML='<main style="max-width:650px;margin:70px auto;padding:24px"><h1>theprlist</h1><h2>'+(passwordRecoveryPage?'비밀번호 재설정':window.__ME&&!new URLSearchParams(location.search).has('invite')?'계정 생성 완료':'계정 초대 수락')+'</h2><p>'+(passwordRecoveryPage?'아래에서 새 비밀번호를 설정한 뒤 해당 계정으로 다시 로그인하세요.':window.__ME&&!new URLSearchParams(location.search).has('invite')?'브랜드 로그인으로 이동해 설정한 계정으로 로그인하세요.':'초대받은 계정은 아래 입력창에서 비밀번호를 설정해 주세요.')+'</p><a class="btn" href="https://theprlist.net">서비스 소개</a> <a class="btn line" href="https://console.theprlist.net">브랜드 로그인</a></main>';};render();
  }

  /* ── 크리에이터 표면: 매직링크 로그인 → 브랜드 PR 리스트 합류 → 내 멤버십.
        커뮤니티·캠페인 참여는 공개 전 — 과장 없이 준비 중으로 표기. ── */
  if(window.__SURFACE==='creator'){
    // 검수 반영: demo.css 다크 테마(body #131218) 위에서 라이브 표면 텍스트가
    // 안 보이던 문제 — 크리에이터 표면 전용으로 밝은 배경·본문/제목/링크
    // 색을 명시한다(로그인 전후 공통, 이 표면에서만 주입되어 콘솔 등
    // 다른 표면에는 영향 없음).
    // 시각 정본은 live-theme.css — 크리에이터 표면은 모바일 우선 폭만 보정.
    document.body.classList.add('live-surface');
    var crStyle=document.createElement('style');
    crStyle.textContent='.stage{height:auto!important;min-height:calc(100vh - 1px)}'
      +'#stage main.live-main{max-width:1180px;padding-top:20px}';
    document.head.appendChild(crStyle);
    var joinTarget=null, joinBrandInfo=null, myMemberships=null, magicSent=false, invitationProduct=null,creatorEntryEmail='';
    window.creatorEntryEmailSet=function(value){creatorEntryEmail=value;};
    var applicationToken=new URLSearchParams(location.search).get('application')||'', applicationContext=null, applicationError='', applicationBusy=false, applicationDone=false;
    var commCells=null, commOpen=null;   // {cellId, name, msgs}
    var myCampaigns=null, myOffers=null, creatorLoadErrors={};
    window.creatorReload=function(){loadCreatorData();render();};
    function creatorLoadNotice(key,label){return creatorLoadErrors[key]?'<div class="cc" role="alert"><p>'+label+' 목록을 불러오지 못했습니다.</p><button class="btn" onclick="creatorReload()">다시 불러오기</button></div>':'';}

    try{joinTarget=(new URLSearchParams(location.search).get('brand')||'').toLowerCase()||null;}catch(e){}
    var membershipState='loading', membershipRequest=0;
    window.creatorRetryMemberships=function(){
      if(!window.__ME||window.__ME.kind!=='creator')return;
      var request=++membershipRequest, token=jwtGet();
      membershipState='loading';render();
      return req('GET','/me/memberships').then(function(m){
        if(request!==membershipRequest||token!==jwtGet())return;
        if(!Array.isArray(m))throw new Error('Invalid membership response');
        myMemberships=m;membershipState='ready';render();
      }).catch(function(){
        if(request!==membershipRequest||token!==jwtGet())return;
        membershipState='error';render();
      });
    };
    function membershipNoticeHtml(){
      if(membershipState==='error')return '<div class="cc" role="status"><p>가입 목록을 불러오지 못했습니다. 기존 가입이 취소된 것은 아닙니다.</p><button class="btn" onclick="creatorRetryMemberships()">가입 목록 다시 불러오기</button></div>';
      if(membershipState!=='ready')return '<p role="status">가입 목록을 불러오는 중입니다…</p>';
      return '';
    }
    function loadCreatorData(){
      if(applicationToken)req('GET','/recruitment-links/'+encodeURIComponent(applicationToken)).then(function(r){
        if(joinTarget&&joinTarget!==r.brandId){applicationContext=null;applicationError='모집 링크와 브랜드가 다릅니다. 원래 제안 링크를 열어 주세요.';render();return;}
        applicationContext=r;joinTarget=r.brandId;if(r.locale)window.__INVITATION_LOCALE=r.locale;invitationProduct=r.product||null;applicationError='';render();
      }).catch(function(e){applicationContext=null;applicationError=(e&&e.message)||'모집 링크를 확인하지 못했습니다';render();});
      var productQuery=new URLSearchParams(location.search).get('product');
      if(joinTarget&&productQuery&&!applicationToken)req('GET','/brands/'+encodeURIComponent(joinTarget)+'/products/'+encodeURIComponent(productQuery)+'/invitation').then(function(p){invitationProduct=p;render();}).catch(function(){invitationProduct=null;});
      if(joinTarget)req('GET','/brands/'+joinTarget+'/identity').then(function(b){joinBrandInfo=b;render();}).catch(function(){joinBrandInfo={missing:true};render();});
      if(window.__ME&&window.__ME.kind==='creator'){
        window.creatorRetryMemberships();creatorLoadErrors={};
        req('GET','/community/my-cells').then(function(c){commCells=c;creatorLoadErrors.community=false;if(!commOpen&&creatorTab==='community'){var first=c.find(function(x){return x.kind!=='dm'&&(!joinTarget||x.brandId===joinTarget);});if(first){window.commOpenCell(first.cellId,first.name);return;}}render();}).catch(function(){creatorLoadErrors.community=true;render();});
        req('GET','/me/campaigns').then(function(c){myCampaigns=c;creatorLoadErrors.campaigns=false;render();}).catch(function(){creatorLoadErrors.campaigns=true;render();});
        req('GET','/me/campaign-offers').then(function(o){myOffers=o;creatorLoadErrors.offers=false;render();}).catch(function(){creatorLoadErrors.offers=true;render();});
        // 서비스 전환: 미읽음 배지·알림·온보딩 프로필·TikTok 상태·XP — 실패해도 본문 탐색은 유지
        req('GET','/me/unread').then(function(u){commUnread={};(u||[]).forEach(function(x){commUnread[x.cellId]=x;});render();}).catch(function(){});
        req('GET','/me/notifications?limit=30').then(function(n){creatorNotifs=n;render();}).catch(function(){});
        req('GET','/me/profile').then(function(p){creatorProfile=p;render();}).catch(function(){});
        req('GET','/me/tiktok').then(function(t){tiktokInfo=t;render();}).catch(function(){});
        req('GET','/me/xp').then(function(x){myXp=x;render();}).catch(function(){});
        crPollStart();  // 실시간 갱신 폴링 시작(멱등 — 타이머 재설정)
      }
    }
    /* 캠페인/내 협업 최신화 — 탭 진입·알림 딥링크 시 즉시 서버 재조회.
       단일 비행 + 세션 교체 stale 무시. (visibility 복귀·주기 갱신은
       crPollTick이 같은 데이터를 sig 비교로 당겨온다) */
    var collabFreshBusy=false;
    function crCollabRefresh(){
      if(collabFreshBusy||!window.__ME||window.__ME.kind!=='creator'||!jwtGet())return;
      collabFreshBusy=true;var token=jwtGet();
      return Promise.all([
        req('GET','/me/campaigns').then(function(c){if(token===jwtGet()){myCampaigns=c;creatorLoadErrors.campaigns=false;}}).catch(function(){}),
        req('GET','/me/campaign-offers').then(function(o){if(token===jwtGet()){myOffers=o;creatorLoadErrors.offers=false;}}).catch(function(){})
      ]).then(function(){collabFreshBusy=false;render();});
    }
    var creatorApplyBusy={};
    window.crApply=function(cid){
      if(creatorApplyBusy[cid])return;
      creatorApplyBusy[cid]=true;render();
      return req('POST','/campaigns/'+encodeURIComponent(cid)+'/apply',{creator_id:'me'}).then(function(){
        toast('지원 완료','브랜드가 검토 후 선정하면 내 협업에서 조건을 확인할 수 있습니다.');loadCreatorData();
      }).catch(function(e){toast('지원 실패',mailEscape((e&&e.message)||'잠시 후 다시 시도해 주세요.'));})
      .finally(function(){creatorApplyBusy[cid]=false;render();});
    };
    window.crCampaignDetail=function(id){
      var c=(myCampaigns||[]).find(function(x){return x.campaignId===id;});if(!c)return;
      var old=document.getElementById('creatorCampaignDialog');if(old)old.remove();
      var expired=campExpired(c);
      var d=document.createElement('dialog');d.id='creatorCampaignDialog';d.className='creator-detail';
      d.innerHTML='<button class="creator-detail-close" aria-label="닫기" onclick="this.closest(\'dialog\').close()">×</button><span class="creator-kicker">'+esc(c.brandName||c.brandId)+'</span><h2>'+esc(c.name)+'</h2><p>'+esc(c.product||'브랜드가 등록한 제품 정보를 확인하세요.')+'</p>'
        +(c.usp?'<p><b>소개 · 조건</b><br>'+esc(c.usp)+'</p>':'')
        +'<dl><dt>보상 유형</dt><dd>'+esc(crRewardLabel(c.rewardType))+'</dd><dt>제안 커미션</dt><dd>'+(c.affiliatePct!=null?esc(c.affiliatePct)+'%':'브랜드와 확인')+'</dd><dt>대상 국가</dt><dd>'+((c.countries||[]).length?esc(c.countries.join(', '))+(c.eligible===false?' — 내 지역 아님':''):'전체')+'</dd><dt>신청 마감</dt><dd>'+esc(c.deadline||'브랜드와 확인')+(expired?' — 마감됨':'')+'</dd><dt>참여 상태</dt><dd>'+esc(expired&&c.myStatus==='none'?'모집 마감':creatorStateLabel(c.termsState||c.myStatus))+'</dd></dl><p>신청 후 브랜드가 검토합니다. 선정되면 내 협업에서 조건을 확인하고, 담당자와 샘플·콘텐츠 일정을 조율하세요.</p>'
        +(expired&&c.myStatus==='none'?'<p style="color:#8a5a1b;font-size:13px">지원 마감일이 지났습니다 — 더 이상 신청할 수 없어요.</p>'
          :c.eligible===false?'<p style="color:#8a5a1b;font-size:13px">'+esc(c.ineligibleReason||'이 캠페인의 대상 지역이 아닙니다 — 내 공간에서 국가·배송 가능 국가를 확인하세요.')+'</p><button class="btn line" onclick="this.closest(\'dialog\').close();crTab(\'brand\')">내 공간에서 프로필 확인</button>'
          :c.myStatus==='none'?'<button class="btn" onclick="this.closest(\'dialog\').close();crApply('+mailEscape(JSON.stringify(c.campaignId))+')" '+(creatorApplyBusy[c.campaignId]?'disabled':'')+'>'+(creatorApplyBusy[c.campaignId]?'신청 중…':'이 캠페인에 신청하기')+'</button>'
          :'<button class="btn" onclick="this.closest(\'dialog\').close();crTab(\'collabs\')">내 협업 확인</button>');
      document.body.appendChild(d);d.addEventListener('close',function(){d.remove();});d.showModal();
    };
    function crRewardLabel(t){return ({affiliate:'어필리에이트 커미션',gifted:'제품 제공(기프트)',paid:'고정 보상'})[t]||t||'브랜드와 확인';}
    window.crAgree=function(cid,accept){
      var h=((document.getElementById('ofHandle_'+cid)||{}).value||'').trim();
      if(accept&&!h)return toast('TikTok 핸들','합의에는 본인 TikTok 핸들 확인이 필요해요.');
      req('POST','/me/campaign-offers/'+cid+'/agree',{accept:!!accept,tiktok_handle:h})
        .then(function(r){toast(accept?'수수료 합의 완료':'거절 처리',accept?'확정 수수료 '+r.agreedCommissionPct+'% — 샘플 발송을 기다려 주세요.':'이 캠페인 제안을 거절했어요.');loadCreatorData();})
        .catch(function(){toast('처리 실패','잠시 후 다시.');});
    };
    window.crSpark=function(cid){
      var v=((document.getElementById('ofSpark_'+cid)||{}).value||'').trim();
      if(!v)return toast('Spark 코드','코드를 입력해 주세요.');
      req('POST','/me/campaign-offers/'+cid+'/spark-code',{spark_code:v})
        .then(function(){toast('Spark 코드 제출','광고 사용 권한 코드가 브랜드에 전달됐어요.');loadCreatorData();})
        .catch(function(){toast('제출 실패','합의 이후에 제출할 수 있어요.');});
    };
    window.crContent=function(cid){
      var v=((document.getElementById('ofUrl_'+cid)||{}).value||'').trim();
      if(v.indexOf('https://')!==0)return toast('콘텐츠 링크','https:// 링크를 입력해 주세요.');
      req('POST','/me/campaign-offers/'+cid+'/content',{content_url:v})
        .then(function(){toast('콘텐츠 제출 완료','브랜드 확인 후 완료 처리됩니다.');loadCreatorData();})
        .catch(function(){toast('제출 실패','합의/샘플 수령 후 제출할 수 있어요.');});
    };
    window.crDm=function(b){
      req('POST','/community/dm/'+b,{}).then(function(r){
        creatorTab='community';
        if(!(commCells||[]).some(function(c){return c.cellId===r.cellId;})){var member=(myMemberships||[]).find(function(m){return m.brandId===b;});commCells=(commCells||[]).concat([{cellId:r.cellId,name:'담당자 DM',brandId:b,brandName:member&&member.name||b,kind:'dm'}]);}
        window.commOpenCell(r.cellId,'담당자 DM');
      }).catch(function(){toast('DM 열기 실패','멤버십 가입 후 이용할 수 있어요.');});
    };
    function campHtml(){
      if(creatorLoadErrors.campaigns)return creatorLoadNotice('campaigns','캠페인');
      if(!myCampaigns)return '<p role="status">캠페인을 불러오는 중입니다…</p>';
      var h='<section class="creator-page-intro"><span>CAMPAIGNS</span><h1>함께 만들 다음 이야기.</h1><p>내 브랜드의 모집 소식과 참여 조건을 확인하세요.</p></section>';
      if(!myCampaigns.length)return h+'<div class="cc"><h3>아직 열린 캠페인이 없어요.</h3><p>가입한 브랜드에서 새 모집을 시작하면 이곳에서 확인할 수 있습니다.</p><button class="btn line" onclick="crTab(\'community\')">브랜드 커뮤니티 보기</button></div>';
      return h+'<div class="creator-campaign-grid">'+myCampaigns.map(function(c){var logo=c.logoUrl&&/^https:\/\//.test(c.logoUrl)?'<img src="'+esc(c.logoUrl)+'" alt="'+esc(c.brandName||c.brandId)+' 로고">':'<span>'+esc((c.brandName||c.brandId||'?').slice(0,1))+'</span>';return '<article class="cc creator-campaign-card"><div class="creator-campaign-brand">'+logo+'<b>'+esc(c.brandName||c.brandId)+'</b><small>'+esc(campExpired(c)&&c.myStatus==='none'?'모집 마감':creatorStateLabel(c.termsState||c.myStatus))+'</small></div><h2>'+esc(c.name)+'</h2><p>'+esc(c.product||'제품 정보는 브랜드 담당자에게 확인하세요.')+'</p><div class="creator-campaign-facts"><span>제안 커미션 <b>'+(c.affiliatePct!=null?esc(c.affiliatePct)+'%':'확인 필요')+'</b></span><span>마감 <b>'+esc(c.deadline||'별도 안내')+'</b></span>'+((c.countries||[]).length?'<span>대상 <b>'+esc(c.countries.join(', '))+(c.eligible===false?' · 내 지역 아님':'')+'</b></span>':'')+'</div><button class="btn" onclick="crCampaignDetail('+mailEscape(JSON.stringify(c.campaignId))+')">조건 및 상세 보기 →</button></article>';}).join('')+'</div>';
    }
    function campExpired(c){try{return !!(c&&c.deadline&&String(c.deadline).slice(0,10)<new Date().toISOString().slice(0,10));}catch(e){return false;}}
    function creatorStateLabel(value){return ({none:'모집 중',applied:'신청 검토 중',selected:'조건 확인 필요',terms_agreed:'샘플 발송 대기',sample_shipped:'샘플 발송됨 · 콘텐츠 준비',content_submitted:'제출 완료 · 브랜드 검토 중',completed:'협업 완료',declined:'제안 거절'})[value]||value||'확인 필요';}
    function creatorProgressHtml(state){
      var steps=['selected','terms_agreed','sample_shipped','content_submitted','completed'],labels=['선정','조건 합의','샘플 발송','콘텐츠 제출','완료'],index=steps.indexOf(state);
      if(index<0)return '';
      return '<ol class="creator-progress" aria-label="협업 진행 단계">'+steps.map(function(step,i){return '<li class="'+(i<index?'done':i===index?'current':'')+'" '+(i===index?'aria-current="step"':'')+'><span>'+(i<index?'✓':i+1)+'</span>'+labels[i]+'</li>';}).join('')+'</ol>';
    }
    function offersHtml(){
      if(creatorLoadErrors.offers)return creatorLoadNotice('offers','협업');
      if(!myOffers)return '<p role="status">협업을 불러오는 중입니다…</p>';
      if(!myOffers.length)return '<div class="cc"><p>아직 선정된 협업이 없습니다. 지원한 캠페인은 브랜드 검토 후 이곳에서 진행할 수 있습니다.</p><button class="btn line" onclick="crTab(\'campaigns\')">캠페인 보기</button></div>';
      var h='<h2 style="margin-top:26px">내 캠페인 진행</h2>';
      myOffers.forEach(function(o){
        var id=esc(o.campaignId);
        h+='<div class="cc">'+creatorProgressHtml(o.state)+'<b>'+esc(o.brandName||o.brandId)+'</b> · '+esc(o.campaignName||o.campaignId)+
          ' <span style="font-size:12px">상태: '+esc(creatorStateLabel(o.state))+'</span>';
        if(o.state==='selected'){
          h+='<p style="font-size:13px">브랜드 제안 수수료 <b>'+(o.commissionPct!=null?o.commissionPct+'%':'-')+'</b> — 합의하면 확정됩니다.</p>'+
            '<input id="ofHandle_'+id+'" placeholder="본인 TikTok 핸들 (예: @myhandle)" style="width:100%;box-sizing:border-box;padding:8px;margin:6px 0">'+
            '<button class="btn" onclick="crAgree(\''+id+'\',true)">수수료 합의</button> <span class="cbt no" onclick="crAgree(\''+id+'\',false)">거절</span>';
        }else if(o.state==='terms_agreed'||o.state==='sample_shipped'){
          h+='<p style="font-size:13px">확정 수수료 '+(o.agreedCommissionPct!=null?o.agreedCommissionPct+'%':'-')+
            (o.sampleTracking?' · 샘플 송장 '+esc(o.sampleTracking):' · 샘플 발송 대기')+
            (o.affiliateLink?'<br>어필리에이트 링크(브랜드 발급): '+esc(o.affiliateLink):'')+'</p>'+
            '<div style="display:flex;gap:6px;margin:6px 0"><input id="ofSpark_'+id+'" placeholder="Spark 코드 (광고 권한 — 내가 발급)" value="'+esc(o.sparkCode||'')+'" style="flex:1;padding:8px"><span class="cbt" onclick="crSpark(\''+id+'\')">코드 제출</span></div>'+
            '<div style="display:flex;gap:6px"><input id="ofUrl_'+id+'" placeholder="게시한 콘텐츠 URL (https://…)" style="flex:1;padding:8px"><span class="cbt" onclick="crContent(\''+id+'\')">콘텐츠 제출</span></div>';
        }else if(o.state==='content_submitted'){
          h+='<p style="font-size:13px">제출 완료: '+esc(o.contentUrl)+'<br>브랜드 확인을 기다리고 있어요.</p>'+
            '<div style="display:flex;gap:6px;margin:6px 0"><input id="ofSpark_'+id+'" placeholder="Spark 코드 (광고 권한 — 지금도 등록/수정 가능)" value="'+esc(o.sparkCode||'')+'" style="flex:1;padding:8px"><span class="cbt" onclick="crSpark(\''+id+'\')">'+(o.sparkCode?'코드 수정':'코드 제출')+'</span></div>'+
            (o.sparkCode?'<p style="font-size:12px;color:#5a6560">Spark 코드 제출됨 ✓ — 브랜드에만 전달되며 공개 커뮤니티에는 노출되지 않습니다.</p>':'<p style="font-size:12px;color:#5a6560">Spark 코드는 브랜드에만 전달됩니다(커뮤니티 비노출).</p>');
        }else if(o.state==='completed'){
          h+='<p style="font-size:13px">✓ 완료 — 확정 수수료 '+(o.agreedCommissionPct!=null?o.agreedCommissionPct+'%':'-')+' 기준으로 정산됩니다.'+
            (o.contentUrl?'<br>제출 콘텐츠: <a href="'+esc(o.contentUrl)+'" target="_blank" rel="noopener">'+esc(o.contentUrl)+'</a>':'')+
            (o.affiliateLink?'<br>어필리에이트 링크(판매 추적): '+esc(o.affiliateLink):'')+
            (o.sparkCode?'<br>Spark 코드 제출됨 ✓':'')+
            '<br><span style="font-size:11px;color:#5a6560">대금 지급(정산 송금) 화면은 공개 준비 중 — 확정 조건은 위 기록 기준입니다.</span></p>';
        }else if(o.state==='declined'){
          h+='<p style="font-size:13px">거절한 제안입니다.</p>';
        }
        h+='</div>';
      });
      return h;
    }
    var commChannel='chat', commVersion=0, commLoading=false, commError='', commSending=false, commDrafts={};
    var commUnread={}, commThread=null, commThreadBusy=false, commSearchQ='', commSearchRes=null, commSearchBusy=false;
    function commKey(){return commOpen?commOpen.cellId+':'+commChannel:'';}
    function commRemember(){var el=document.getElementById('commText');if(el&&el.getAttribute('data-draft-key'))commDrafts[el.getAttribute('data-draft-key')]=el.value;}
    function commSelected(){return (commCells||[]).find(function(c){return commOpen&&c.cellId===commOpen.cellId;});}
    window.commDraft=function(v){if(commKey())commDrafts[commKey()]=v;};
    window.commOpenCell=function(id,name,channel){
      commRemember();
      var cell=(commCells||[]).find(function(c){return c.cellId===id;});
      commChannel=cell&&cell.kind==='dm'?'chat':(['chat','tips','notice'].indexOf(channel)>=0?channel:'chat');
      var version=++commVersion,token=jwtGet(),selectedChannel=commChannel;
      commOpen={cellId:id,name:name,msgs:[]};commLoading=true;commError='';commThread=null;commSearchRes=null;render();
      return req('GET','/community/cells/'+encodeURIComponent(id)+'/messages?channel='+selectedChannel+'&limit=200').then(function(m){
        if(version!==commVersion||token!==jwtGet())return;
        commOpen.msgs=m;commLoading=false;
        // 읽음 커서 저장 → 이 셀의 미읽음 배지 해제 (실패해도 열람은 유지)
        var maxId=0;(m||[]).forEach(function(x){if(x.msgId&&x.msgId>maxId)maxId=x.msgId;});
        if(maxId)req('POST','/community/cells/'+encodeURIComponent(id)+'/read',{last_msg_id:maxId}).then(function(){if(commUnread&&commUnread[id]){delete commUnread[id];render();}}).catch(function(){});
        render();
      }).catch(function(e){if(version!==commVersion||token!==jwtGet())return;commLoading=false;commError=(e&&e.message)||'대화를 불러오지 못했습니다. 멤버십과 연결 상태를 확인하세요.';render();});
    };
    window.commChannelSelect=function(channel){if(commOpen)window.commOpenCell(commOpen.cellId,commOpen.name,channel);};
    window.commClose=function(){commRemember();commVersion++;commOpen=null;commLoading=false;commError='';render();};
    window.commPost=function(){
      var v=((document.getElementById('commText')||{}).value||'').trim();
      if(!v||!commOpen||commSending||commChannel==='notice'||v.length>2000)return;
      var id=commOpen.cellId,name=commOpen.name,channel=commChannel,key=commKey(),token=jwtGet();
      commRemember();commSending=true;render();
      return req('POST','/community/cells/'+encodeURIComponent(id)+'/messages',{text:v,channel:channel,locale:(window.__USER_LANG||'ko')}).then(function(){
        if(token!==jwtGet())return;
        commDrafts[key]='';
        if(commOpen&&commOpen.cellId===id&&commChannel===channel){var el=document.getElementById('commText');if(el)el.value='';return window.commOpenCell(id,name,channel);}
      }).catch(function(e){toast('게시 실패',mailEscape((e&&e.message)||'내용을 보관했습니다. 다시 시도하세요.'));}).finally(function(){commSending=false;render();});
    };
    window.commThreadOpen=function(mid){
      if(!commOpen)return;
      var id=commOpen.cellId,version=commVersion,token=jwtGet();
      commThread={rootId:mid,msgs:null};render();
      return req('GET','/community/cells/'+encodeURIComponent(id)+'/messages/'+mid+'/thread').then(function(m){
        if(version!==commVersion||token!==jwtGet())return;
        commThread={rootId:mid,msgs:m};render();
      }).catch(function(){if(version!==commVersion)return;commThread=null;toast('스레드','스레드를 불러오지 못했습니다.');render();});
    };
    window.commThreadClose=function(){commThread=null;render();};
    window.commThreadReply=function(){
      var el=document.getElementById('crThreadText'),v=((el||{}).value||'').trim();
      if(!v||!commOpen||!commThread||commThreadBusy||v.length>2000)return;
      var id=commOpen.cellId,mid=commThread.rootId,token=jwtGet();
      commThreadBusy=true;render();
      // 공지 스레드의 답글은 chat으로 저장 — 공지 게시 권한과 별개의 Q&A
      return req('POST','/community/cells/'+encodeURIComponent(id)+'/messages',{text:v,channel:commChannel==='notice'?'chat':commChannel,locale:(window.__USER_LANG||'ko'),thread_parent:mid}).then(function(){
        if(token!==jwtGet())return;
        return window.commThreadOpen(mid);
      }).catch(function(e){toast('답글 실패',mailEscape((e&&e.message)||'다시 시도해 주세요.'));})
      .finally(function(){commThreadBusy=false;render();});
    };
    window.commSearchInput=function(v){commSearchQ=v;};
    window.commSearchRun=function(){
      var q=(commSearchQ||'').trim();
      if(!commOpen||commSearchBusy)return;
      if(q.length<2)return toast('검색','검색어는 2자 이상 입력해 주세요.');
      var id=commOpen.cellId,token=jwtGet();
      commSearchBusy=true;render();
      return req('GET','/community/cells/'+encodeURIComponent(id)+'/search?q='+encodeURIComponent(q)).then(function(r){
        if(token!==jwtGet())return;commSearchRes=r;
      }).catch(function(e){commSearchRes=[];toast('검색 실패',mailEscape((e&&e.message)||'잠시 후 다시 시도해 주세요.'));})
      .finally(function(){commSearchBusy=false;render();});
    };
    window.commSearchClear=function(){commSearchRes=null;commSearchQ='';render();};
    /* ── 실시간 갱신 폴링 — 알림·미읽음·열린 채널/DM·스레드.
          background/로그아웃 중단, 복귀 시 즉시 1회, 단일 비행, 오류
          backoff(5s→최대 60s), 이전 세션/셀 stale 응답 무시, 변경시에만
          softRender(입력·포커스·스크롤 보존). 강제 이동 없음. ── */
    var crPollTimer=null,crPollBusy=false,crPollFail=0,crPollWired=false;
    var CR_POLL_BASE=5000,CR_POLL_MAX=60000;
    function crPollSchedule(){
      if(typeof setTimeout!=='function')return;
      if(crPollTimer)clearTimeout(crPollTimer);
      crPollTimer=setTimeout(crPollTick,Math.min(CR_POLL_BASE*Math.pow(2,crPollFail),CR_POLL_MAX));
    }
    function crNotifSig(n){return n?JSON.stringify([n.unreadCount,(n.items||[]).map(function(i){return [i.id,i.read];})]):'';}
    function crMsgSig(list){return JSON.stringify((list||[]).map(function(m){return [m.msgId,m.pinnedAt,m.replyCount,m.translationState];}));}
    function crPollTick(){
      if(crPollBusy)return crPollSchedule();
      if(typeof document!=='undefined'&&document.hidden)return;        // visibility 복귀가 재개
      if(!window.__ME||window.__ME.kind!=='creator'||!jwtGet())return; // 로그아웃 시 중단(재로그인 때 재시작)
      crPollBusy=true;
      var token=jwtGet(),changed=false;
      var work=req('GET','/me/unread').then(function(u){
        if(token!==jwtGet())return;
        var next={};(u||[]).forEach(function(x){next[x.cellId]=x;});
        if(JSON.stringify(next)!==JSON.stringify(commUnread)){commUnread=next;changed=true;}
      }).then(function(){return req('GET','/me/notifications?limit=30');}).then(function(n){
        if(token!==jwtGet())return;
        var prev=(typeof creatorNotifs!=='undefined')?creatorNotifs:null; // 격리 vm 가드
        if(crNotifSig(n)!==crNotifSig(prev)){creatorNotifs=n;changed=true;}
      }).then(function(){
        if(!commOpen||commLoading||commSending)return;
        var id=commOpen.cellId,ch=commChannel,version=commVersion;
        return req('GET','/community/cells/'+encodeURIComponent(id)+'/messages?channel='+ch+'&limit=200').then(function(m){
          if(version!==commVersion||token!==jwtGet()||!commOpen||commOpen.cellId!==id||commChannel!==ch)return; // stale 무시
          if(crMsgSig(m)!==crMsgSig(commOpen.msgs)){
            commOpen.msgs=m;changed=true;
            var maxId=0;(m||[]).forEach(function(x){if(x.msgId&&x.msgId>maxId)maxId=x.msgId;});
            if(maxId)req('POST','/community/cells/'+encodeURIComponent(id)+'/read',{last_msg_id:maxId}).then(function(){if(commUnread&&commUnread[id])delete commUnread[id];}).catch(function(){});
          }
        });
      }).then(function(){
        var tab=(typeof creatorTab!=='undefined')?creatorTab:'';
        if(tab!=='campaigns'&&tab!=='collabs')return;
        var url=tab==='campaigns'?'/me/campaigns':'/me/campaign-offers';
        return req('GET',url).then(function(list){
          if(token!==jwtGet())return;
          var prev=tab==='campaigns'?(typeof myCampaigns!=='undefined'?myCampaigns:null):(typeof myOffers!=='undefined'?myOffers:null);
          if(JSON.stringify(list)!==JSON.stringify(prev)){
            if(tab==='campaigns')myCampaigns=list;else myOffers=list;
            changed=true;
          }
        });
      }).then(function(){
        if(!commThread||!commThread.msgs||!commOpen||commThreadBusy)return;
        var id=commOpen.cellId,mid=commThread.rootId,version=commVersion;
        return req('GET','/community/cells/'+encodeURIComponent(id)+'/messages/'+mid+'/thread').then(function(m){
          if(version!==commVersion||token!==jwtGet()||!commThread||commThread.rootId!==mid)return;
          if(crMsgSig(m)!==crMsgSig(commThread.msgs)){commThread={rootId:mid,msgs:m};changed=true;}
        });
      });
      return work.then(function(){crPollFail=0;})
        .catch(function(){crPollFail=Math.min(crPollFail+1,4);})
        .then(function(){
          crPollBusy=false;
          if(changed&&typeof softRender==='function')softRender();
          crPollSchedule();
        });
    }
    window.crPollNow=function(){crPollFail=0;if(crPollTimer&&typeof clearTimeout==='function')clearTimeout(crPollTimer);return crPollTick();};
    function crPollStart(){
      if(!crPollWired){
        crPollWired=true;
        try{document.addEventListener('visibilitychange',function(){
          if(document.hidden){if(crPollTimer)clearTimeout(crPollTimer);}
          else window.crPollNow();
        });}catch(e){}
      }
      crPollFail=0;crPollSchedule();
    }
    window.__crPollTick=crPollTick;  // 격리 vm 테스트용(런타임 사용 없음)
    window.__crPollStart=crPollStart;
    function esc(x){return mailEscape(x);}
    function commMsgHtml(m,inThread){
      var lang=window.__USER_LANG||'ko';
      var shown=(m.translations&&m.translations[lang])||m.original,isTr=shown!==m.original;
      var pending=m.translationState!=='done'&&m.originalLocale!==lang;
      return '<article class="crmsg'+(m.pinnedAt?' pinned':'')+'"><span class="cravatar'+(m.authorKind==='brand'?' dark':'')+'">'+mailEscape((m.author||'?').slice(0,1))+'</span><div class="crmsg-b"><div class="crmsg-name"><b>'+mailEscape(m.author)+'</b>'
        +(m.authorKind==='brand'?'<span class="crrole">브랜드</span>':m.authorKind==='ari'?'<span class="crrole">운영</span>':'')
        +'<time>'+mailEscape((m.at||'').slice(0,16).replace('T',' '))+'</time>'
        +(m.pinnedAt?'<span class="crpin">📌 고정됨</span>':'')+'</div><p>'+mailEscape(shown)+'</p>'
        +(pending?'<small class="crmeta">'+(m.translationState==='failed'?'번역 실패 · 원문 표시':'번역 준비 중 · 원문 표시')+'</small>':'')
        +(isTr?'<details class="crorig"><summary>원문 ('+mailEscape(m.originalLocale)+')</summary><p>'+mailEscape(m.original)+'</p></details>':'')
        +(!inThread&&m.msgId?'<button class="crthread-btn" onclick="commThreadOpen('+m.msgId+')">'+(m.replyCount?'답글 '+m.replyCount+'개 보기':'스레드에 답글')+'</button>':'')
        +'</div></article>';
    }
    function commThreadHtml(){
      if(!commThread)return '';
      var h='<aside class="crthreadp" role="dialog" aria-label="스레드"><header><b>스레드</b><button class="cbt no" onclick="commThreadClose()" aria-label="스레드 닫기">닫기 ×</button></header><div class="crthreadp-msgs">';
      if(!commThread.msgs)h+='<p role="status">스레드를 불러오는 중…</p>';
      else h+=commThread.msgs.map(function(m){return commMsgHtml(m,true);}).join('')||'<p>메시지가 없습니다.</p>';
      h+='</div><form class="crcompose" onsubmit="event.preventDefault();commThreadReply()"><label for="crThreadText">스레드에 답글</label><textarea id="crThreadText" maxlength="2000" placeholder="답글을 남겨 주세요" '+(commThreadBusy?'disabled':'')+'></textarea><button class="btn" '+(commThreadBusy?'disabled':'')+'>'+(commThreadBusy?'게시 중…':'답글 보내기')+'</button></form></aside>';
      return h;
    }
    function commHtml(){
      if(creatorLoadErrors.community)return creatorLoadNotice('community','커뮤니티');
      if(!commCells)return '<p role="status">커뮤니티를 불러오는 중입니다…</p>';
      var selected=commSelected(),brand=selected&&selected.brandId;
      var lounges=commCells.filter(function(c){return c.kind!=='dm';});
      var chLabel={'chat':'잡담','tips':'촬영-팁','notice':'공지'};
      var h='';
      // 모바일: 브랜드 방 가로 스트립 (데스크톱은 rail/사이드바에서 선택)
      h+='<nav class="crchat-brands" aria-label="브랜드 선택">'+lounges.map(function(c){var un=(commUnread[c.cellId]||{}).unread||0;return '<button class="crchip '+(c.brandId===brand?'active':'')+'" onclick="commOpenCell('+mailEscape(JSON.stringify(c.cellId))+','+mailEscape(JSON.stringify(c.name))+')">'+mailEscape(c.brandName||c.name)+(un?'<em>'+un+'</em>':'')+'</button>';}).join('')+'<button class="crchip" onclick="crTab(\'brand\')">＋ 멤버십</button></nav>';
      h+='<section class="crchat'+(commThread?' with-thread':'')+'" aria-label="'+mailEscape(selected?selected.brandName+' 커뮤니티':'브랜드 커뮤니티')+'">';
      // 채널 헤더
      h+='<header class="crchat-head"><div><h1>'+(commOpen?(selected&&selected.kind==='dm'?'◔ 담당자 DM':'<span>#</span> '+mailEscape(chLabel[commChannel]||'잡담')):'커뮤니티')+'</h1><p>'+(selected?(selected.kind==='dm'?'담당자와 나만 보는 대화':mailEscape(selected.brandName)+' · 멤버 '+selected.memberCount):'브랜드 방을 선택해 대화를 시작하세요.')+'</p></div>'
        +'<div class="crchat-tools">'+(commOpen?'<details class="crchat-search"><summary aria-label="채널 검색 열기">검색</summary><div class="crchat-actions"><form class="crsearch" onsubmit="event.preventDefault();commSearchRun()"><input id="crSearchQ" value="'+mailEscape(commSearchQ)+'" oninput="commSearchInput(this.value)" placeholder="이 채널에서 검색" aria-label="채널 메시지 검색"><button class="cbt" '+(commSearchBusy?'disabled':'')+'>'+(commSearchBusy?'검색 중…':'검색')+'</button></form><button class="cbt no" onclick="commChannelSelect(\''+commChannel+'\')" aria-label="대화 새로고침">↻</button></div></details>':'')+'</div></header>';
      // 채널 탭
      if(selected&&selected.kind!=='dm')h+='<nav class="crchat-tabs" aria-label="채널">'+[['chat','# 잡담'],['tips','# 촬영 팁'],['notice','◎ 공지']].map(function(c){return '<button class="'+(commChannel===c[0]?'active':'')+'" aria-pressed="'+(commChannel===c[0])+'" onclick="commChannelSelect(\''+c[0]+'\')">'+c[1]+'</button>';}).join('')+(brand?'<button onclick="crDm('+mailEscape(JSON.stringify(brand))+')">◔ 담당자 DM</button>':'')+'</nav>';
      // 검색 결과
      if(commSearchRes!==null)h+='<div class="crsearch-res" role="region" aria-label="검색 결과"><div class="crsearch-head"><b>검색 결과 '+commSearchRes.length+'건</b><button class="cbt no" onclick="commSearchClear()">닫기 ×</button></div>'+(commSearchRes.map(function(m){return '<article class="crsearch-item"><b>'+mailEscape(m.author)+'</b> <time>'+mailEscape((m.at||'').slice(0,16).replace('T',' '))+'</time><p>'+mailEscape(m.original)+'</p>'+(m.msgId&&!m.threadParent?'<button class="crthread-btn" onclick="commThreadOpen('+m.msgId+')">스레드 보기</button>':'')+'</article>';}).join('')||'<p>일치하는 메시지가 없습니다.</p>')+'</div>';
      h+='<div class="crchat-body"><div class="crmsgs" role="log" aria-label="대화 내용">';
      if(!commOpen)h+='<div class="crempty">'+(lounges.length?'브랜드 방을 선택해 대화를 시작하세요.':'아직 가입한 브랜드가 없습니다. 받은 브랜드 초대 링크로 합류하세요.')+'</div>';
      else if(commLoading)h+='<p role="status">대화를 불러오는 중입니다…</p>';
      else if(commError)h+='<p role="alert">'+mailEscape(commError)+'</p>';
      else{
        var visible=(commOpen.msgs||[]).filter(function(m){return m.channel===commChannel;});
        var ordered=visible.filter(function(m){return m.pinnedAt;}).concat(visible.filter(function(m){return !m.pinnedAt;}));
        h+=ordered.map(function(m){return commMsgHtml(m,false);}).join('')||'<div class="crempty">아직 메시지가 없습니다.</div>';
      }
      h+='</div>'+commThreadHtml()+'</div>';
      if(commOpen&&commChannel!=='notice')h+='<form class="crcompose" onsubmit="event.preventDefault();commPost()"><label for="commText">'+(selected&&selected.kind==='dm'?'담당자에게 메시지':'채널에 메시지')+'</label><textarea id="commText" data-draft-key="'+mailEscape(commKey())+'" maxlength="2000" oninput="commDraft(this.value)" placeholder="내 언어로 메시지를 남겨 주세요" '+(commSending?'disabled':'')+'>'+mailEscape(commDrafts[commKey()]||'')+'</textarea><button class="btn" '+(commSending||commLoading||commError?'disabled':'')+'>'+(commSending?'전송 중…':'보내기')+'</button></form>';
      else if(commOpen)h+='<p class="crreadonly">공지는 브랜드 담당자가 게시하는 읽기 전용 채널입니다 — 질문은 각 공지의 스레드에 남겨 주세요.</p>';
      return h+'</section>';
    }
    var creatorMagicBusy=false;
    window.creatorMagic=function(){
      if(creatorMagicBusy)return;
      var input=document.getElementById('crEmail'),v=((input||{}).value||'').trim();
      var status=document.getElementById('crLoginStatus'),button=document.getElementById('crLoginButton');
      function message(text){if(status)status.textContent=text;}
      if(v.indexOf('@')<0){message(entryText('이메일 주소를 확인해 주세요.','Please enter a valid email address.'));return;}
      creatorMagicBusy=true;magicSent=false;if(button)button.disabled=true;
      message(entryText('로그인 링크를 요청하고 있습니다…','Requesting your sign-in link…'));
      return req('POST','/auth/magic',{email:v,brand:(typeof joinTarget!=='undefined'&&joinTarget)||'',application:applicationToken,locale:creatorEntryLocale()}).then(function(r){
        if(!r.demoLink&&r.sent!==true)throw new Error(r.hint||'로그인 메일을 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        magicSent=!r.demoLink;render();
        if(r.demoLink)toast('데모 모드','<a href="'+r.demoLink.replace('https://app.theprlist.net/',location.origin+'/').replace('https://theprlist.net/',location.origin+'/')+'">이 링크로 로그인</a> (15분 유효)');
      }).catch(function(e){message(creatorEntryLocale()==='en'?'Unable to send the sign-in link. Use the email that received this invitation and try again.':e.message||'로그인 링크 요청에 실패했습니다. 연결 상태를 확인해 주세요.');})
      .finally(function(){creatorMagicBusy=false;if(button)button.disabled=false;});
    };
    window.creatorJoin=function(b){
      req('POST','/me/join',{brand_id:b}).then(function(r){
        toast(r.joined?'합류 완료 🎉':'이미 멤버예요',(r.joined?'<b>'+mailEscape(r.brandId)+'</b> PR 리스트에 등록됐어요.':'중복 가입은 다시 등록·과금되지 않습니다.')+(r.verified?'':' 계정 검증이 끝나면 브랜드에 정식 반영됩니다.'));
        loadCreatorData();
      }).catch(function(e){
        var msg=(e&&e.message)||'';
        if(msg.indexOf('온보딩')>=0){toast('온보딩이 먼저예요',mailEscape(msg));creatorTab='brand';render();return;}
        toast('가입 실패',e===401?'이메일 로그인 후 시도해 주세요.':mailEscape(msg||'잠시 후 다시.'));
      });
    };
    window.creatorApplyRecruitment=function(){
      if(applicationBusy||!applicationContext||applicationError)return;
      var consent=document.getElementById('recruitmentConsent');
      if(!consent||!consent.checked)return toast('신청 확인','브랜드 합류와 이 모집 신청을 확인해 주세요.');
      applicationBusy=true;render();
      req('POST','/recruitment-links/'+encodeURIComponent(applicationToken)+'/apply',{}).then(function(r){applicationDone=true;toast('신청 접수',mailEscape(r.brandName)+'에 신청이 저장되었습니다. 참여 확정은 별도 검토입니다.');loadCreatorData();})
      .catch(function(e){applicationError=(e&&e.message)||'이 제안을 받은 계정인지 확인해 주세요.';})
      .finally(function(){applicationBusy=false;render();});
    };
    function invitationProductHtml(){
      var p=invitationProduct;
      if(!p)return '';
      var image=p.imageUrl&&/^https:\/\//i.test(p.imageUrl)?'<img src="'+mailEscape(p.imageUrl)+'" alt="'+mailEscape(p.name)+'" referrerpolicy="no-referrer" style="max-width:100%;max-height:280px;object-fit:contain;border-radius:14px">':'';
      return '<section class="cc invitation-product" aria-label="'+entryText('제품 소개','Product details')+'">'+image+'<h2>'+mailEscape(p.name)+'</h2>'+(p.summary?'<p style="white-space:pre-wrap">'+mailEscape(p.summary)+'</p>':'<p>'+entryText('자세한 제품·협업 조건은 제안 메일을 확인하세요.','Please check your invitation email for product and collaboration details.')+'</p>')+'</section>';
    }
    function recruitmentCard(){
      if(!applicationToken)return '';
      if(applicationError)return '<section class="cc" role="alert"><b>'+entryText('모집 링크 확인 필요','Invitation unavailable')+'</b><p>'+mailEscape(creatorEntryLocale()==='en'?'This invitation could not be verified. Reopen your original invitation or try again.':applicationError)+'</p><button class="btn line" onclick="creatorReload()">'+entryText('다시 확인','Try again')+'</button></section>';
      if(!applicationContext)return '<section class="cc" role="status">'+entryText('제안받은 모집 정보를 확인하는 중입니다…','Loading your invitation…')+'</section>';
      var r=applicationContext;
      return invitationProductHtml()+'<section class="cc"><b>'+mailEscape(r.brandName)+' · '+entryText('모집 신청','Invitation')+'</b><p>'+mailEscape(r.productName||entryText('브랜드 PR 리스트','Brand PR list'))+'</p>'+(r.campaignName?'<p>'+mailEscape(r.campaignName)+'</p>':'')+
       '<p>'+entryText('브랜드 합류·모집 신청과 최종 참여 확정은 다릅니다. 제안받은 조건을 확인한 뒤 신청하세요.','Joining the PR list or applying does not confirm selection. Review the invitation terms before applying.')+'</p>'+
       (applicationDone?'<p role="status">'+entryText('✓ 신청 접수 완료 · 참여 검토 대기','✓ Application received · Selection pending')+'</p><button class="btn line" onclick="creatorOpenJoinedCommunity()">'+entryText('이 브랜드 커뮤니티 보기','Open this brand community')+'</button>':window.__ME&&window.__ME.kind==='creator'?'<label><input id="recruitmentConsent" type="checkbox"> '+entryText('이 브랜드 PR 리스트 합류 및 해당 모집 신청을 확인합니다.','I confirm joining this brand’s PR list and applying for this invitation.')+'</label><button class="btn" onclick="creatorApplyRecruitment()" '+(applicationBusy?'disabled':'')+'>'+entryText(applicationBusy?'저장 중…':'이 브랜드에 신청하기',applicationBusy?'Saving…':'Apply to this brand')+'</button>':'<p>'+entryText('제안을 받은 이메일로 로그인하면 이 모집에 신청할 수 있습니다.','Sign in with the email that received this invitation to apply.')+'</p>')+'</section>';
    }
    function brandCardHtml(b,joined){
      if(!b)return '';
      if(b.missing)return '<div class="cc"><p>브랜드를 찾을 수 없습니다.</p></div>';
      var logo=b.logoUrl?'<img src="'+b.logoUrl.replace(/"/g,'')+'" alt="" style="width:44px;height:44px;border-radius:10px;object-fit:cover;vertical-align:middle;margin-right:10px">':'';
      return (b.brandId===joinTarget?recruitmentCard():'')+'<div class="cc">'+logo+'<b style="font-size:17px">'+mailEscape(b.name||b.brandId)+'</b>'+(b.tagline?'<p>'+mailEscape(b.tagline)+'</p>':'')+
        (applicationToken&&b.brandId===joinTarget?'<p>아래 모집 신청에서 브랜드 합류를 함께 진행합니다.</p>':membershipState!=='ready'?'<p>가입 여부는 가입 목록 조회가 끝나면 표시됩니다.</p>':joined?'<p>✓ 이미 이 브랜드의 PR 리스트 멤버입니다.</p>':'<button class="btn" onclick="creatorJoin(\''+b.brandId+'\')">이 브랜드 PR 리스트에 합류</button>')+'</div>';
    }
    var creatorTabs=['community','campaigns','collabs','messages','brand','settings'];
    var creatorTab=(joinTarget||applicationToken)?'brand':'community';
    try{var startTab=location.hash.slice(1);if(creatorTabs.indexOf(startTab)>=0)creatorTab=startTab;}catch(e){}
    window.crTab=function(t){if(creatorTabs.indexOf(t)<0)return;commRemember();creatorTab=t;history.replaceState(null,'','#'+t);render();if(t==='campaigns'||t==='collabs')crCollabRefresh();var viewport=document.getElementById('stage');if(viewport)viewport.scrollTop=0;if(window.scrollTo)window.scrollTo(0,0);};
    window.creatorOpenJoinedCommunity=function(){
      creatorTab='community';
      var target=(applicationContext&&applicationContext.brandId)||joinTarget;
      var room=(commCells||[]).find(function(c){return c.kind!=='dm'&&c.brandId===target;});
      if(room)return window.commOpenCell(room.cellId,room.name,'chat');
      window.commClose();
    };
    function creatorNavHtml(){
      // 모바일 4열 하단 네비 (데스크톱은 rail+사이드바) — messages는 사이드바 DM에서
      var unreadDot=crUnreadTotal()>0;
      return '<nav class="crbottomnav" aria-label="주요 메뉴">'+[['community','◈','커뮤니티'],['campaigns','▦','캠페인'],['collabs','↗','내 협업'],['brand','◯','내 공간']].map(function(t){return '<button class="'+(creatorTab===t[0]?'active':'')+'" '+(creatorTab===t[0]?'aria-current="page"':'')+' onclick="crTab(\''+t[0]+'\')"><span aria-hidden="true">'+t[1]+(t[0]==='community'&&unreadDot?'<i class="crdot" aria-label="안 읽은 메시지"></i>':'')+'</span>'+t[2]+'</button>';}).join('')+'</nav>';
    }
    // ── Slack-v3(Aubergine) 셸 상태·헬퍼 — 알림/온보딩/TikTok/XP ──
    var creatorNotifs=null,notifOpen=false,creatorProfile=null,profileBusy=false,tiktokInfo=null,tiktokBusy=false,myXp=null,spaceBrand=null,spaceMissions=null,spaceRanking=null,spaceBusy=false;
    // 탭별 폼 초안 보존(폴링 softRender가 입력을 지우지 않게) — 계정(토큰)
    // 교체 시 폐기. password 제외.
    var crFormDrafts={},crFormLastTab=null,crFormToken='';
    function crFormSnapshot(){
      try{
        if(crFormToken!==jwtGet()){crFormDrafts={};crFormLastTab=null;crFormToken=jwtGet();}
        var st=document.getElementById('stage');
        if(!crFormLastTab||!st||!st.querySelectorAll)return;
        var snap=crFormDrafts[crFormLastTab]||{};
        st.querySelectorAll('input[id],textarea[id],select[id]').forEach(function(el){
          if(el.type==='password')return;
          snap[el.id]=(el.type==='checkbox'||el.type==='radio')?{c:el.checked}:{v:el.value};
        });
        crFormDrafts[crFormLastTab]=snap;
      }catch(e){}
    }
    function crFormRestore(){
      try{
        var saved=crFormDrafts[creatorTab];
        if(saved)Object.keys(saved).forEach(function(id){
          var el=document.getElementById(id);if(!el||el.type==='password')return;
          var st=saved[id];
          if('c' in st)el.checked=st.c;else if(el.value!==st.v)el.value=st.v;
        });
        crFormLastTab=creatorTab;
      }catch(e){}
    }
    function crUnreadMap(){return (typeof commUnread==='object'&&commUnread)||{};}
    function crUnreadCount(cellId){var u=crUnreadMap()[cellId];return (u&&u.unread)||0;}
    function crUnreadTotal(){var t=0,m=crUnreadMap();Object.keys(m).forEach(function(k){t+=m[k].unread||0;});return t;}
    window.crNotifToggle=function(){notifOpen=!notifOpen;render();};
    window.crNotifReadAll=function(){
      req('POST','/me/notifications/read',{all:true}).then(function(){return req('GET','/me/notifications?limit=30');})
        .then(function(n){creatorNotifs=n;render();})
        .catch(function(){toast('알림','읽음 처리에 실패했습니다 — 다시 시도해 주세요.');});
    };
    window.crNotifGo=function(idx){
      // 딥링크: 알림 카드에서 명시적으로 눌렀을 때만 이동(강제 이동 없음).
      var item=creatorNotifs&&creatorNotifs.items&&creatorNotifs.items[idx];if(!item)return;
      var t=item.target||{};notifOpen=false;
      req('POST','/me/notifications/read',{ids:[item.id]}).then(function(){return req('GET','/me/notifications?limit=30');}).then(function(n){creatorNotifs=n;render();}).catch(function(){});
      if(t.cellId){creatorTab='community';history.replaceState(null,'','#community');var room=(commCells||[]).find(function(c){return c.cellId===t.cellId;});return window.commOpenCell(t.cellId,(room&&room.name)||'공지',t.channel||'notice');}
      if(t.campaignId){window.crTab('campaigns');return;}
      render();
    };
    function notifPanelHtml(){
      var n=creatorNotifs;
      return '<aside class="crnotif" role="dialog" aria-label="알림"><header><b>알림'+(n&&n.unreadCount?' · 안 읽음 '+n.unreadCount:'')+'</b><span><button class="cbt no" onclick="crNotifReadAll()">모두 읽음</button><button class="cbt no" onclick="crNotifToggle()" aria-label="알림 닫기">닫기 ×</button></span></header><div class="crnotif-list">'
        +(!n?'<p role="status">알림을 불러오는 중…</p>':(n.items||[]).length?n.items.map(function(i,idx){
          var t=i.target||{};
          return '<article class="crnotif-item'+(i.read?'':' unread')+'"><b>'+mailEscape(i.title)+'</b>'+(t.brandId?'<small class="crnotif-brand">'+mailEscape(t.brandId)+'</small>':'')+(i.body?'<p>'+mailEscape(i.body)+'</p>':'')+'<time>'+mailEscape((i.at||'').slice(0,16).replace('T',' '))+'</time>'
            +((t.cellId||t.campaignId)?'<button class="cbt" onclick="crNotifGo('+idx+')">'+(t.cellId?'공지 보기':'캠페인 보기')+'</button>':'')+'</article>';
        }).join(''):'<p>새 알림이 없습니다.</p>')+'</div></aside>';
    }
    function crTopHtml(){
      var unread=(creatorNotifs&&creatorNotifs.unreadCount)||0;
      return '<header class="crtop"><span class="crtop-brand">theprlist <small>CREATOR</small></span>'
        +'<button class="crtop-bell" onclick="crNotifToggle()" aria-label="알림 '+unread+'건 열기">🔔'+(unread?'<em>'+(unread>99?'99+':unread)+'</em>':'')+'</button>'
        +'<button class="crtop-me" onclick="crTab(\'settings\')" aria-label="계정과 언어 설정">설정</button></header>';
    }
    function crRailHtml(){
      var selected=commSelected(),cur=selected&&selected.brandId;
      var brands={};
      (myMemberships||[]).forEach(function(m){brands[m.brandId]={name:m.name||m.brandId,logoUrl:m.logoUrl};});
      (commCells||[]).forEach(function(c){if(c.kind!=='dm'&&!brands[c.brandId])brands[c.brandId]={name:c.brandName||c.brandId,logoUrl:c.logoUrl};});
      var h='<nav class="crrail" aria-label="브랜드">';
      h+=Object.keys(brands).map(function(id){var b=brands[id];
        var room=(commCells||[]).find(function(c){return c.kind!=='dm'&&c.brandId===id;});
        var un=0;(commCells||[]).forEach(function(c){if(c.brandId===id)un+=crUnreadCount(c.cellId);});
        return '<button class="crrail-brand'+(cur===id?' active':'')+'" aria-label="'+mailEscape(b.name)+'" onclick="'+(room?'crTab(\'community\');commOpenCell('+mailEscape(JSON.stringify(room.cellId))+','+mailEscape(JSON.stringify(room.name))+')':'crTab(\'brand\')')+'">'+(b.logoUrl&&/^https:\/\//.test(String(b.logoUrl))?'<img src="'+mailEscape(b.logoUrl)+'" alt="">':mailEscape((b.name||'?').slice(0,1)))+(un?'<i aria-hidden="true"></i>':'')+'</button>';
      }).join('');
      return h+'<button class="crrail-add" onclick="crTab(\'brand\')" aria-label="브랜드 멤버십 추가">＋</button></nav>';
    }
    function crSideHtml(){
      var selected=commSelected();
      var h='<aside class="crside" aria-label="워크스페이스 탐색"><div class="crside-head"><b>'+mailEscape(selected?selected.brandName:'theprlist')+'</b><small>'+(selected?'멤버 '+selected.memberCount+' · 검증 '+(selected.verifiedCount||0):'크리에이터 워크스페이스')+'</small></div><div class="crside-scroll">';
      h+='<div class="crside-quick">'+[['brand','⌂','내 공간'],['campaigns','▦','캠페인'],['collabs','↗','내 협업'],['messages','◌','DM 메시지']].map(function(t){return '<button class="crside-item'+(creatorTab===t[0]?' active':'')+'" '+(creatorTab===t[0]?'aria-current="page"':'')+' onclick="crTab(\''+t[0]+'\')"><span class="hash" aria-hidden="true">'+t[1]+'</span>'+t[2]+'</button>';}).join('')+'</div>';
      var room=selected&&(commCells||[]).find(function(c){return c.kind!=='dm'&&c.brandId===selected.brandId;});
      h+='<div class="crside-label">'+mailEscape(selected?selected.brandName+' 채널':'채널')+'</div>';
      h+=room?[['chat','잡담'],['tips','촬영 팁'],['notice','공지']].map(function(channel){
        var act=creatorTab==='community'&&selected.cellId===room.cellId&&commChannel===channel[0];
        return '<button class="crside-item'+(act?' active':'')+'" '+(act?'aria-current="page"':'')+' onclick="crTab(\'community\');commOpenCell('+mailEscape(JSON.stringify(room.cellId))+','+mailEscape(JSON.stringify(room.name))+','+mailEscape(JSON.stringify(channel[0]))+')"><span class="hash" aria-hidden="true">#</span>'+channel[1]+'</button>';
      }).join(''):'<p class="crside-empty">브랜드 선택 영역에서 브랜드를 선택하세요.</p>';
      var dms=(commCells||[]).filter(function(c){return selected&&c.kind==='dm'&&c.brandId===selected.brandId;});
      if(dms.length)h+='<div class="crside-label">브랜드 담당자</div>'+dms.map(function(c){var un=crUnreadCount(c.cellId);var act=creatorTab==='community'&&selected&&selected.cellId===c.cellId;
        return '<button class="crside-item'+(act?' active':'')+'" onclick="crOpenConversation('+mailEscape(JSON.stringify(c.cellId))+','+mailEscape(JSON.stringify(c.name))+')"><span class="presence" aria-hidden="true">'+mailEscape((c.brandName||'?').slice(0,1))+'</span>담당자 DM'+(un?'<em>'+(un>99?'99+':un)+'</em>':'')+'</button>';}).join('');
      return h+'</div><div class="crside-bottom"><span class="crside-me">'+mailEscape((window.__ME&&window.__ME.email)||'')+'</span><a href="https://theprlist.net">theprlist</a> · <a href="https://theprlist.net/privacy">개인정보</a></div></aside>';
    }
    // ── 온보딩·TikTok 상태 (4개 상태는 서로 독립 — 성공 가장 금지) ──
    window.crProfileSave=function(){
      if(profileBusy)return;
      function val(id){var el=document.getElementById(id);return el?el.value:'';}
      function checked(id){var el=document.getElementById(id);return !!(el&&el.checked);}
      // payload는 render 전에 캡처(렌더가 DOM을 재구성하므로)
      var langs=[];['ko','en','th','vi','ja'].forEach(function(l){if(checked('crLang_'+l))langs.push(l);});
      var payload={country:val('crCountry').trim(),languages:langs,
        ship_countries:val('crShip').split(',').map(function(x){return x.trim();}).filter(Boolean),
        tiktok_handle:val('crHandle').trim(),
        consent_terms:checked('crConsentTerms'),consent_privacy:checked('crConsentPrivacy')};
      profileBusy=true;render();
      req('PUT','/me/profile',payload)
        .then(function(r){toast(r.onboarded?'온보딩 완료 🎉':'저장됨',mailEscape(r.hint||'프로필이 저장되었습니다.'));return req('GET','/me/profile');})
        .then(function(p){creatorProfile=p;})
        .catch(function(e){toast('저장 실패',mailEscape((e&&e.message)||'입력값을 확인해 주세요.'));})
        .finally(function(){profileBusy=false;render();if(window.creatorRetryMemberships)window.creatorRetryMemberships();});
    };
    window.crTiktokConnect=function(){
      if(tiktokBusy)return;tiktokBusy=true;render();
      req('POST','/me/tiktok/connect-start',{}).then(function(r){
        if(r&&r.authUrl){toast('TikTok 소유 인증','TikTok 인증 창으로 이동합니다 — 완료 후 상태 새로고침을 눌러 주세요.');try{window.open(r.authUrl,'_blank','noopener');}catch(e){}}
        return req('GET','/me/tiktok');
      }).then(function(t){tiktokInfo=t;})
        .catch(function(e){toast('연결 불가',mailEscape((e&&e.message)||'지금은 연결할 수 없습니다.'));return req('GET','/me/tiktok').then(function(t){tiktokInfo=t;}).catch(function(){});})
        .finally(function(){tiktokBusy=false;render();});
    };
    window.crTiktokDisconnect=function(){
      req('POST','/me/tiktok/disconnect',{}).then(function(){return req('GET','/me/tiktok');}).then(function(t){tiktokInfo=t;toast('연결 해제','TikTok 소유 인증을 해제했습니다.');render();}).catch(function(){toast('해제 실패','다시 시도해 주세요.');});
    };
    window.crTiktokRefresh=function(){Promise.all([req('GET','/me/tiktok'),req('GET','/me/profile')]).then(function(r){tiktokInfo=r[0];creatorProfile=r[1];render();}).catch(function(){toast('상태 확인 실패','잠시 후 다시 시도해 주세요.');});};
    function crStateLabel(s){return ({none:'미연결',pending:'인증 진행 중',connected:'연결됨 ✓',failed:'인증 실패 — 다시 연결',expired:'만료 — 다시 연결',revoked:'해제됨',eligible:'자격 확인 ✓',rejected:'자격 미충족'})[s]||s||'미연결';}
    function onboardingCardHtml(){
      var p=creatorProfile;
      if(!p)return '<div class="cc"><p role="status">프로필을 불러오는 중…</p></div>';
      var st=p.states||{};
      var states='<ul class="crstates" aria-label="연결 상태">'
        +'<li><b>이메일 로그인</b><span class="pill ok">완료 ✓</span></li>'
        +'<li><b>TikTok 계정 소유 인증</b><span class="pill'+(st.tiktokOwner==='connected'?' ok':'')+'">'+crStateLabel(st.tiktokOwner)+'</span></li>'
        +'<li><b>TikTok Shop 어필리에이트 자격</b><span class="pill'+(st.tiktokShop==='eligible'?' ok':'')+'">'+crStateLabel(st.tiktokShop)+'</span></li>'
        +'<li><b>운영팀 본인 확인</b><span class="pill'+(st.opsVerified?' ok':'')+'">'+(st.opsVerified?'확인됨 ✓':'확인 대기')+'</span></li></ul>';
      var configured=!!(p.tiktokConfigured||(tiktokInfo&&tiktokInfo.configured));
      var tiktokRow='<div class="crtiktok"><b>TikTok 소유 인증</b> '
        +(configured
          ?'<button class="cbt" onclick="crTiktokConnect()" '+(tiktokBusy?'disabled':'')+'>'+(tiktokBusy?'여는 중…':st.tiktokOwner==='connected'?'다시 연결':'TikTok으로 인증')+'</button>'+(st.tiktokOwner==='connected'?' <button class="cbt no" onclick="crTiktokDisconnect()">해제</button>':'')+' <button class="cbt no" onclick="crTiktokRefresh()">상태 새로고침</button>'
          :'<p class="crhint">'+mailEscape((tiktokInfo&&tiktokInfo.hint)||'TikTok 공식 연동 승인 대기 중 — 연결 전까지 미연결로 표시됩니다. 핸들 입력만으로는 인증이 완료되지 않습니다.')+'</p>')+'</div>';
      var form='<div class="crform">'
        +'<label for="crCountry">국가 (ISO 2자리, 예: KR)</label><input id="crCountry" maxlength="2" value="'+mailEscape(p.country||'')+'" placeholder="KR" autocapitalize="characters">'
        +'<label>사용 언어</label><div class="crlangs">'+['ko','en','th','vi','ja'].map(function(l){return '<label><input type="checkbox" id="crLang_'+l+'" '+((p.languages||[]).indexOf(l)>=0?'checked':'')+'> '+langLabel(l)+'</label>';}).join('')+'</div>'
        +'<label for="crShip">배송 가능 국가 (쉼표 구분, 예: KR, TH)</label><input id="crShip" value="'+mailEscape((p.shipCountries||[]).join(', '))+'" placeholder="KR, TH">'
        +'<label for="crHandle">TikTok 핸들</label><input id="crHandle" value="'+mailEscape(p.tiktokHandle||'')+'" placeholder="@myhandle"><p class="crhint">핸들 저장은 소유 인증이 아니에요 — 핸들을 바꾸면 소유 인증을 다시 진행해야 합니다.</p>'
        +'<label><input type="checkbox" id="crConsentTerms" '+(p.consentedVersion?'checked':'')+'> 이용약관 동의 (필수)</label>'
        +'<label><input type="checkbox" id="crConsentPrivacy" '+(p.consentedVersion?'checked':'')+'> 개인정보 처리방침 동의 (필수)</label>'
        +(p.consentText?'<p class="crhint">'+mailEscape(p.consentText)+'</p>':'')
        +'<button class="btn" onclick="crProfileSave()" '+(profileBusy?'disabled':'')+'>'+(profileBusy?'저장 중…':'프로필 저장')+'</button></div>';
      var entryNote='';
      if(p.entryReady)entryNote=p.onboarded?'<p class="crhint">✓ 입장 요건 충족 — 브랜드 합류와 캠페인 신청이 가능해요.</p>':'';
      else if(p.onboarded)entryNote='<p class="crhint" role="status" style="color:#8a5a1b"><b>TikTok 계정 소유 인증이 남았어요.</b> 신규 회원은 인증 완료 전에는 브랜드 합류 · 캠페인 신청이 제한됩니다.'+(configured?'':' 공식 연동 승인 대기 중에는 인증을 완료할 수 없어 입장이 대기 상태로 남아요 — 승인되면 이 화면에서 바로 연결할 수 있습니다.')+'</p>';
      return '<div class="cc cronboard"><h2>'+(p.onboarded?'내 프로필 · 연결 상태':'입장 준비 — 프로필 온보딩')+'</h2>'
        +(p.onboarded?'':'<p>국가 · 배송 가능 국가 · 필수 동의 저장 후 <b>TikTok 계정 소유 인증</b>까지 완료해야 브랜드 합류와 캠페인 신청을 시작할 수 있어요.'+(p.legacyMember?' 기존 멤버는 이용을 계속하면서 아래 정보를 다시 연결해 주세요.':'')+'</p>')
        +entryNote+states+tiktokRow+form+'</div>';
    }
    // ── XP·미션·랭킹 (내 공간) ──
    window.crSpaceOpen=function(b){
      if(spaceBusy)return;spaceBusy=true;spaceBrand=b;spaceMissions=null;spaceRanking=null;render();
      Promise.all([
        req('GET','/me/missions?brand='+encodeURIComponent(b)).catch(function(){return null;}),
        req('GET','/brands/'+encodeURIComponent(b)+'/ranking').catch(function(){return null;})
      ]).then(function(r){spaceMissions=r[0];spaceRanking=r[1];}).finally(function(){spaceBusy=false;render();});
    };
    function spaceXpHtml(){
      var h='<div class="cc crxp"><h2>내 레벨 · XP</h2>';
      if(!myXp)h+='<p role="status">XP를 불러오는 중…</p>';
      else h+='<p class="crxp-total"><b>'+((myXp&&myXp.total)||0)+'</b> XP</p><p class="crhint">XP는 서버가 검증한 활동(합류 · 첫 인사 · 신청 · 합의 · 제출 · 완료)에만 1회 지급돼요 — 클릭이나 반복 제출로는 쌓이지 않습니다.</p>';
      if(spaceBrand){
        h+='<h3>'+mailEscape(spaceBrand)+' 미션</h3>';
        if(spaceBusy)h+='<p role="status">불러오는 중…</p>';
        else{
          if(spaceMissions)h+='<ul class="crmissions">'+spaceMissions.map(function(m){return '<li class="'+(m.done?'done':'')+'"><span aria-hidden="true">'+(m.done?'✓':'·')+'</span>'+mailEscape(m.label)+'<em>+'+m.points+'</em></li>';}).join('')+'</ul>';
          if(spaceRanking)h+='<h3>브랜드 랭킹 TOP</h3><ol class="crrank">'+(spaceRanking.map(function(r){return '<li><b>'+r.rank+'</b>'+mailEscape(r.handle||'크리에이터')+'<em>'+r.total+' XP</em></li>';}).join('')||'<li>아직 기록이 없어요.</li>')+'</ol>';
          if(!spaceMissions&&!spaceRanking)h+='<p>미션 · 랭킹을 불러오지 못했습니다. <button class="cbt" onclick="crSpaceOpen(\''+mailEscape(spaceBrand)+'\')">다시 시도</button></p>';
        }
      }
      return h+'</div>';
    }
    function creatorSettingsHtml(){
      return '<section class="cc creator-settings"><h2>계정과 언어</h2><dl><dt>로그인 이메일</dt><dd>'+mailEscape(window.__ME.email||'')+'</dd><dt>계정 유형</dt><dd>크리에이터</dd></dl><h3>대화·번역 언어</h3>'+conversationLanguageHtml()+'<p>번역이 준비되지 않으면 원문을 표시합니다. 계약 조건과 수수료는 원문도 함께 확인하세요.</p><button class="btn line" onclick="authLogout()">로그아웃</button></section>';
    }
    function creatorMessagesHtml(){
      if(creatorLoadErrors.community)return creatorLoadNotice('community','메시지');
      if(!commCells)return '<p role="status">메시지를 불러오는 중입니다…</p>';
      var dms=commCells.filter(function(c){return c.kind==='dm';});
      return '<section class="creator-message-list"><h2>브랜드 담당자와의 대화</h2><p>각 브랜드 담당자와 나누는 1:1 대화입니다.</p>'+(dms.length?dms.map(function(c){return '<button class="cc creator-dm-card" onclick="crOpenConversation('+mailEscape(JSON.stringify(c.cellId))+','+mailEscape(JSON.stringify(c.name))+')"><span class="community-avatar">'+mailEscape((c.brandName||'?').slice(0,1))+'</span><span><b>'+mailEscape(c.brandName||c.brandId)+'</b><small>담당자 DM 열기</small></span><span>→</span></button>';}).join(''):'<div class="cc"><h3>아직 시작한 대화가 없어요.</h3><p>참여 중인 브랜드 커뮤니티에서 담당자 DM을 열어 대화를 시작하세요.</p><button class="btn" onclick="crTab(\'community\')">커뮤니티로 이동</button></div>')+'</section>';
    }
    window.crOpenConversation=function(id,name){creatorTab='community';history.replaceState(null,'','#community');return window.commOpenCell(id,name);};
    window.addEventListener('popstate',function(){var t=location.hash.slice(1);if(creatorTabs.indexOf(t)>=0){commRemember();creatorTab=t;render();}});
    function creatorHeadHtml(){
      // 참여(또는 초대) 브랜드가 정체성의 중심 — 로고·이름 + 작은 theprlist.
      var selected=creatorTab==='community'&&commSelected();
      var b=selected?{name:selected.brandName,brandId:selected.brandId,logoUrl:selected.logoUrl}
            :(joinTarget&&joinBrandInfo&&!joinBrandInfo.missing)?joinBrandInfo
            :(myMemberships&&myMemberships[0])||null;
      if(!b)return '<div class="crhead"><div><div class="bn">theprlist</div><div class="svc">CREATOR</div></div></div>';
      var lg=b.logoUrl?'<img src="'+String(b.logoUrl).replace(/"/g,'')+'" alt="">':'';
      return '<div class="crhead">'+lg+'<div><div class="bn">'+mailEscape(b.name||b.brandId||'')+'</div><div class="svc">with theprlist</div></div></div>';
    }
    window.render=function(){
      commRemember();crFormSnapshot();
      document.querySelector('.svcbar').style.display='none';
      var body='';
      if(!window.__ME){
        document.documentElement.lang=creatorEntryLocale();
        body=creatorHeadHtml()+recruitmentCard()+(!applicationToken?invitationProductHtml():'')+
          (joinBrandInfo&&!joinBrandInfo.missing?'<p>'+mailEscape(joinBrandInfo.name||'')+' · '+entryText('브랜드 PR 리스트에 초대받으셨나요? 이메일로 시작하세요.','Invited to the brand’s PR list? Get started with your email.')+'</p>':'')+
          '<h2>'+entryText('로그인 또는 시작하기','Sign in or get started')+'</h2><p>'+entryText('처음 이용하셔도 이메일을 입력해 시작할 수 있습니다. 비밀번호 없이 이메일 링크로 로그인합니다.','New here? Enter your email to get started. We’ll send a secure sign-in link—no password needed.')+'</p>'+
          (magicSent?'<div class="cc"><p>'+entryText('메일함의 로그인 링크를 확인하세요 (15분 유효).','Check your inbox for your sign-in link (valid for 15 minutes).')+'</p></div>':'')+
          '<form class="cc" onsubmit="event.preventDefault();creatorMagic()"><label for="crEmail">'+entryText('이메일 주소','Email address')+'</label><input id="crEmail" type="email" required autocomplete="email" value="'+mailEscape(creatorEntryEmail)+'" oninput="creatorEntryEmailSet(this.value)" placeholder="you@email.com" style="width:100%;box-sizing:border-box;padding:12px;margin-bottom:10px"><button id="crLoginButton" type="submit" class="btn" '+(creatorMagicBusy?'disabled':'')+'>'+entryText('이메일 링크 받기','Send sign-in link')+'</button><p id="crLoginStatus" role="status" aria-live="polite"></p></form>';
      }else{
        var joinedIds=(myMemberships||[]).map(function(m){return m.brandId;});
        var content='';
        if(creatorTab==='brand'){
          content=(joinTarget?brandCardHtml(joinBrandInfo,joinedIds.indexOf(joinTarget)>=0):'')+
            '<section class="crpage-head"><h1>내 공간</h1><p>프로필 온보딩과 연결 상태, 브랜드 멤버십, 레벨 · 미션을 한곳에서 관리하세요.</p></section>'+
            onboardingCardHtml()+
            '<h2>내 브랜드 멤버십</h2>'+membershipNoticeHtml()+
            ((myMemberships&&myMemberships.length)?myMemberships.map(function(m){
              var lg=m.logoUrl?'<img src="'+m.logoUrl.replace(/"/g,'')+'" alt="" style="width:26px;height:26px;border-radius:6px;object-fit:cover;vertical-align:-7px;margin-right:8px">':'';
              return '<div class="cc">'+lg+'<b>'+mailEscape(m.name||m.brandId)+'</b>'+(m.tagline?' · '+mailEscape(m.tagline):'')+' <button class="btn line" onclick="crDm(\''+esc(m.brandId)+'\')">담당자 DM</button> <button class="cbt" onclick="crSpaceOpen(\''+esc(m.brandId)+'\')">미션 · 랭킹</button></div>';}).join('')
             :membershipState==='ready'?'<div class="cc"><p>아직 가입한 브랜드가 없어요. 브랜드의 초대 링크로 합류할 수 있습니다.</p></div>':'')+
            spaceXpHtml();
        }else if(creatorTab==='campaigns'){
          content='<section class="crpage-head"><h1>캠페인</h1><p>내 브랜드의 모집 소식과 참여 조건을 확인하세요.</p></section>'+(joinTarget?brandCardHtml(joinBrandInfo,joinedIds.indexOf(joinTarget)>=0):'')+campHtml();
        }else if(creatorTab==='collabs'){
          content='<section class="crpage-head"><h1>내 협업</h1><p>진행 순서: 지원 → 선정 → 조건 확인(수수료 합의) → 샘플 배송 → 콘텐츠 · Spark 코드 제출 → 완료. 각 협업 카드에 지금 할 다음 행동이 표시됩니다.</p></section>'+offersHtml()+
            '<div class="cc"><p style="font-size:12px">대금 지급(정산 송금) 화면은 공개 준비 중입니다.</p></div>';
        }else if(creatorTab==='settings'){content='<section class="crpage-head"><h1>설정</h1><p>계정, 대화 언어, 프로필 연결 상태를 관리하세요.</p></section>'+creatorSettingsHtml();
        }else if(creatorTab==='messages'){content='<section class="crpage-head"><h1>DM 메시지</h1><p>브랜드 담당자와의 1:1 대화 목록입니다.</p></section>'+creatorMessagesHtml();
        }else{
          content=commHtml();
        }
        body=crTopHtml()+'<div class="crshell">'+crRailHtml()+crSideHtml()+'<div class="crmain"><section class="creator-page creator-page-'+creatorTab+'">'+content+'</section></div></div>'+(notifOpen?notifPanelHtml():'')+creatorNavHtml();
        document.getElementById('stage').innerHTML='<main class="crapp" aria-label="theprlist 크리에이터">'+body+'</main>';
        crFormRestore();
        return;
      }
      if(!window.__ME)body='<section class="community-workspace community-login'+(applicationToken||invitationProduct?' has-invitation':'')+'"><aside class="community-login-intro"><a class="creator-wordmark" href="https://theprlist.net">theprlist<span>CREATOR CLUB</span></a><h1>'+entryText('브랜드와 만나고,<br>나의 콘텐츠로 연결해요.','Meet brands.<br>Create together.')+'</h1><p>'+entryText('당신과 어울리는 브랜드 커뮤니티에 참여하고, 캠페인부터 콘텐츠 협업까지 한곳에서 이어가세요.','Discover brand communities, explore campaigns, and manage your creator collaborations in one place.')+'</p><ul><li>'+entryText('브랜드별 커뮤니티와 담당자 대화','Brand communities and conversations')+'</li><li>'+entryText('캠페인 신청과 참여 조건 확인','Campaign applications and collaboration terms')+'</li><li>'+entryText('샘플 배송 · 콘텐츠 제출 · 진행 관리','Sample delivery, content submissions and progress')+'</li></ul></aside><div class="community-login-main">'+body+'</div></section>';
      document.getElementById('stage').innerHTML='<main class="live-main">'+body+'<p style="margin-top:34px"><a href="https://theprlist.net">'+entryText('서비스 소개','About theprlist')+'</a> · <a href="https://theprlist.net/privacy">'+entryText('개인정보처리방침','Privacy policy')+'</a></p></main>';
      crFormLastTab=null;  // 로그아웃/로그인 화면 — 초안 키 해제
    };
    render();loadCreatorData();
  }
  try {
    var sp = new URLSearchParams(location.search);
    var inviteTok = sp.get("invite"), magicTok = sp.get("magic"), resetTok = sp.get("reset");
    if (resetTok) {
      authPanel("<b>새 비밀번호 설정</b><div style='margin-top:6px;color:#5a6560'>새 비밀번호(10자 이상)를 정하세요. 링크 유효성은 변경 시 확인합니다. 완료 후 다시 로그인합니다.</div>" +
        "<input id='axPw' type='password' placeholder='새 비밀번호' style='width:100%;padding:6px;margin-top:8px;box-sizing:border-box'>" +
        "<div style='margin-top:8px'><span class='cbt' onclick='authResetApply()'>비밀번호 변경</span></div>");
      window.authResetApply = function () { window.authResetConfirm(resetTok); };
    }
    if (inviteTok) {
      authPanel("<b>브랜드 계정 만들기</b><div style='margin-top:6px;color:#5a6560'>초대를 수락하고 비밀번호를 정하세요 (10자 이상).</div>" +
        "<input id='axPw' type='password' placeholder='새 비밀번호' style='width:100%;padding:6px;margin-top:8px;box-sizing:border-box'>" +
        "<div style='margin-top:8px'><span class='cbt' onclick='authAcceptInvite()'>수락하고 시작</span></div>");
    }
    window.authAcceptInvite=function(){window.authAccept(inviteTok);};
    window.authAccept = function (tk) {
      var pw = (document.getElementById("axPw") || {}).value || "";
      req("POST", "/auth/accept", { token: tk, password: pw }).then(function (r) {
        jwtSet(r.token); window.__ME = r.user; authPanel(null); authChip();
        history.replaceState(null, "", location.pathname);
        reloadBrand();
        toast("계정 생성 완료 🎉", "<b>" + mailEscape(r.user.email) + "</b> — 콘솔(console.theprlist.net)에서 이 계정으로 로그인하세요.");
      }).catch(function () { toast("수락 실패", "링크가 만료됐을 수 있어요 — 초대를 다시 요청하세요. 비밀번호는 10자 이상."); });
    };
    var magicForward = false;
    if (magicTok && window.__SURFACE !== "creator") {
      // 매직 링크는 크리에이터 앱에서만 소비한다 — 다른 표면(root/bjoin/brand)에
      // 랜딩하면 토큰을 소비하기 전에 고정 신뢰 origin으로 그대로 전달한다.
      // (open redirect 금지: origin 고정, brand는 slug 형식일 때만 보존)
      magicForward = true;
      var creatorApp = "https://app.theprlist.net";
      try {
        if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) creatorApp = localStorage.getItem("CONNECTION_CREATOR_APP_URL") || creatorApp;
      } catch (e) {}
      var fwdBrand = (sp.get("brand") || "").toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(fwdBrand)) fwdBrand = "";
      location.replace(creatorApp + "/?" + (fwdBrand ? "brand=" + encodeURIComponent(fwdBrand) + "&" : "") + "magic=" + encodeURIComponent(magicTok)+(sp.get("application")?"&application="+encodeURIComponent(sp.get("application")):"")+(sp.get("lang")?"&lang="+encodeURIComponent(sp.get("lang")):""));
    }
    if (magicTok && !magicForward) {
      var keepBrand = sp.get("brand"), keepApplication=sp.get("application"),keepLocale=sp.get("lang");
      req("POST", "/auth/magic/verify", { token: magicTok }).then(function (r) {
        jwtSet(r.token); window.__ME = r.user; authChip();
        history.replaceState(null, "", location.pathname + ((keepBrand||keepApplication||keepLocale)?"?"+new URLSearchParams(Object.assign({},keepBrand?{brand:keepBrand}:{},keepApplication?{application:keepApplication}:{},keepLocale?{lang:keepLocale}:{})).toString():""));
        toast(sp.get("lang")==="en"?"Signed in ✅":"로그인 완료 ✅", r.user.email);
        if (window.render) try { render(); } catch (e) {}
        if (typeof loadCreatorData === "function") try { loadCreatorData(); } catch (e) {}
      }).catch(function () { toast(sp.get("lang")==="en"?"Sign-in failed":"로그인 실패", sp.get("lang")==="en"?"This link has expired. Please request a new sign-in link.":"링크가 만료됐어요 — 다시 요청해 주세요."); });
    }
    if (jwtGet()) {
      req("GET", "/auth/me").then(function (u) { window.__ME = u; authChip(); reloadBrand();
        if (window.render) try { render(); } catch (e) {}
        if (typeof loadCreatorData === "function") try { loadCreatorData(); } catch (e) {}
      }).catch(function () { jwtClear(); authChip(); });
    } else if (window.__SURFACE === "brand" || window.__SURFACE === "creator" || inviteTok) {
      authChip();
    }
  } catch (e) {}
})();
