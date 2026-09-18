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

  /* 멀티테넌시 — 로그인한 브랜드 계정이 있으면 그 브랜드, 없으면 데모(glowlab) */
  function BRAND() {
    var me = window.__ME;
    return (me && me.kind === "brand" && me.brandId) || "glowlab";
  }

  function req(method, path, body) {
    var h = { "Content-Type": "application/json" };
    try {
      var ak = localStorage.getItem("CONNECTION_ADMIN_KEY");
      if (ak) h["X-Admin-Key"] = ak;   // 민감 API(지메일 연결 등) 간이 인증
      var jt = localStorage.getItem("CONNECTION_JWT");
      if (jt) h["Authorization"] = "Bearer " + jt;   // 실계정 세션
    } catch (e) {}
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
      return '<div style="padding:12px;border-bottom:1px solid #ddd">' + i.period + ' · ' + Number(i.quantity) + '명 · ₩' + Number(i.amount).toLocaleString() + ' (부가세 포함) · ' + (labels[i.status] || '확인 중') + (i.status === 'open' && !i.cardPayable ? ' · 카드 최소금액 1,000원 미만' : '') +
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
    var version = ++billingVersion;
    billingStatus="불러오는 중입니다.";
    window.__billing = null;
    billingInvoices = [];
    billingConfigured = false;
    req("GET", "/brands/" + BRAND() + "/billing").then(function (summary) {
      if (version !== billingVersion) return;
      window.__billing = summary;
      req('POST', '/brands/' + BRAND() + '/billing/invoices', {}).then(function (result) {
        if (version !== billingVersion) return;
        billingStatus="";
        billingInvoices = result.invoices;
        billingConfigured = result.configured;
        if (typeof ST !== 'undefined' && ST.b === 'settle' && window.render) render();
      }).catch(function(e){if(version===billingVersion){billingStatus="청구 조회 실패: "+e.message;if(window.render)render();}});
      if (typeof ST !== "undefined" && ST.b === "settle" && window.render) render();
    }).catch(function (e) {
      if(version===billingVersion)billingStatus="청구 조회 실패: "+e.message;
      if (version === billingVersion && typeof ST !== "undefined" && ST.b === "settle" && window.render) render();
    });
  }
  window.refreshBilling = loadBilling;

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
  var LANGS = [["th", "ไทย"], ["ko", "한국어"], ["en", "English"], ["vi", "Tiếng Việt"]];
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
      applyLang(["th", "ko", "en", "vi"].indexOf(nav) >= 0 ? nav : "en", true);
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
  var outreachData = null;
  var outreachError = '';
  var outreachLoading = false;
  var outreachBusy = false;
  var outreachVersion = 0;
  function loadOutreach() {
    var brand=BRAND(), version=++outreachVersion;
    outreachLoading=true;outreachError='';
    req('GET','/brands/'+brand+'/outreach').then(function(r){
      if(version!==outreachVersion || BRAND()!==brand) return;
      outreachData=r;outreachLoading=false;
      if(typeof ST!=='undefined' && ST.b==='src' && window.render) render();
    }).catch(function(){
      if(version!==outreachVersion || BRAND()!==brand)return;
      outreachData=null;outreachLoading=false;outreachError='발송 내역을 불러오지 못했습니다. 로그인 상태를 확인하고 다시 시도해 주세요.';
      if(typeof ST!=='undefined' && ST.b==='src' && window.render)render();
    });
  }
  var composeBusy=false;
  window.outreachCompose=async function(){
    if(composeBusy)return;
    var brief=document.getElementById('outBrief').value.trim();
    if(brief.length<5)return toast('내용 입력','협업 제안 내용을 5자 이상 입력하세요.');
    if(document.getElementById('outSubject').value||document.getElementById('outBody').value)return toast('기존 초안 확인','입력한 제목과 본문을 비운 뒤 AI 작성을 실행하세요.');
    var current=jwtGet(),brand=BRAND();composeBusy=true;toast('AI 작성 중','브랜드 정보를 참고해 제안 메일을 작성하고 있습니다.');
    try{var r=await req('POST','/brands/'+brand+'/outreach/compose',{brief:brief});
      if(jwtGet()!==current||BRAND()!==brand)return;
      var subject=document.getElementById('outSubject'),body=document.getElementById('outBody');
      if(subject&&body&&!subject.value&&!body.value){subject.value=r.subject;body.value=r.body;toast('초안 작성 완료','아직 저장·발송되지 않았습니다. 내용을 확인해 주세요.');}
      else toast('다시 시도','화면이나 작성 내용이 바뀌어 AI 결과를 덮어쓰지 않았습니다.');
    }catch(e){toast('AI 작성 실패',mailEscape(e.message));}finally{composeBusy=false;}
  };
  window.outreachDraft = function() {
    if(outreachBusy)return;
    var recipients=document.getElementById('outRecipients').value.split(/[\s,;]+/).filter(Boolean);
    var subject=document.getElementById('outSubject').value.trim();
    var body=document.getElementById('outBody').value.trim();
    if(!recipients.length || recipients.length>20 || !subject || !body) return toast('입력 확인','수신자는 한 번에 최대 20명이며, 제목과 본문을 입력해 주세요.');
    outreachBusy=true;
    req('POST','/brands/'+BRAND()+'/outreach',{recipients:recipients,subject:subject,body:body}).then(function(){
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
      toast('발송 결과','발송 완료 '+n+'명. 수신자별 상태를 확인해 주세요.');
    }).catch(function(){loadOutreach();toast('발송 확인','Gmail 연결과 발송 내역을 확인해 주세요.');}).finally(function(){outreachBusy=false;});
  };
  window.outreachCancel = function(id) {
    req('POST','/brands/'+BRAND()+'/outreach/'+id+'/cancel',{}).then(loadOutreach).catch(function(){toast('취소 실패','새로고침 후 상태를 확인해 주세요.');});
  };
  window.outreachRefresh=loadOutreach;
  window.inboxSend = function(thread,id) {
    req('POST','/inbox/threads/'+thread+'/messages/'+id+'/send',{}).then(function(r){
      window.__INBOX_OPEN=null;window.inboxOpen(thread);loadInbox();loadGmail();
      toast(r.state==='sent'?'답장 발송 완료':'발송 대기',r.state==='sent'?'Gmail로 발송했습니다.':'Gmail 연결 또는 오늘의 발송 한도를 확인하세요.');
    }).catch(function(){toast('발송 확인 필요','Gmail 보낸편지함에서 발송 여부를 확인하세요.');});
  };
  function outreachCard() {
    if(!window.__ME) return '<div class="cc"><div class="t">아웃리치</div><p>로그인 후 메일 초안과 발송 내역을 확인할 수 있습니다.</p></div>';
    var states={pending:'대기 · 연결/한도 확인',sending:'발송 시도 중 · 재발송 금지',sent:'발송 완료',review:'Gmail에서 발송 여부 확인',blocked:'수신 거부 또는 90일 내 중복'};
    var rows=(outreachData && outreachData.batches || []).filter(function(b){return /^[a-f0-9-]{36}$/.test(b.id);}).map(function(b){
      var pending=b.recipients.some(function(r){return r.state==='pending';});
      return '<details style="margin-top:12px;border-top:1px solid #ddd;padding-top:12px"><summary>'+mailEscape(b.subject)+' · '+b.recipients.length+'명 · '+({draft:'초안',approved:'발송 승인됨',cancelled:'취소됨'}[b.state]||'')+'</summary>'+
        '<p>'+b.recipients.map(function(r){return mailEscape(r.email)+' — '+(states[r.state]||'확인 필요');}).join('<br>')+'</p><pre style="white-space:pre-wrap;font:inherit">'+mailEscape(b.body)+'</pre><p style="font-size:12px">수신 거부 링크가 본문 끝에 자동으로 추가됩니다.</p>'+
        (pending && b.state!=='cancelled'?'<button class="cbt" onclick="outreachSend(\''+b.id+'\')">'+(b.state==='draft'?'내용 승인하고 발송':'남은 수신자 발송')+'</button> ':'')+
        (b.state==='draft'?'<button class="cbt no" onclick="outreachCancel(\''+b.id+'\')">초안 취소</button>':'')+'</details>';
    }).join('');
    return '<div class="cc"><div class="t">아웃리치 메일</div><p>수신자와 내용을 저장한 뒤 확인하고 발송합니다. 발송 한도를 넘긴 수신자는 대기하며, 수신 거부·90일 내 중복 발송은 제외합니다.</p>'+
      '<label>협업 제안 내용<textarea id="outBrief" maxlength="2000" placeholder="제안할 제품, 협업 방식, 언어를 적어 주세요."></textarea></label><button class="cbt no" onclick="outreachCompose()">AI로 제안 메일 작성</button><p>AI는 저장한 브랜드 정보로 초안만 작성합니다. 내용을 확인하고 저장한 뒤 발송하세요.</p>'+
      '<label>수신자 이메일 · 최대 20명<textarea id="outRecipients" rows="3" style="width:100%;box-sizing:border-box" placeholder="이메일을 줄바꿈 또는 쉼표로 구분"></textarea></label>'+
      '<label>제목<input id="outSubject" maxlength="150" style="width:100%;box-sizing:border-box"></label>'+
      '<label>본문<textarea id="outBody" rows="6" style="width:100%;box-sizing:border-box"></textarea></label>'+
      '<button class="cbt" onclick="outreachDraft()">초안 저장</button> <button class="cbt no" onclick="outreachRefresh()">내역 새로고침</button>'+(outreachError?'<p role="alert">'+mailEscape(outreachError)+'</p>':outreachLoading?'<p role="status">발송 내역을 불러오는 중입니다.</p>':!rows?'<p>저장된 초안과 발송 내역이 없습니다.</p>':'')+rows+'</div>';
  }

  /* ── 지메일 연동 — 브랜드 명의 발송(구글 OAuth) + 답장 인박스 ── */
  window.__GMAIL = null;
  window.__INBOX = null;
  window.__INBOX_OPEN = null;   // 펼친 스레드 {id, data}
  function loadGmail() {
    var current=jwtGet(),brand=BRAND();
    req("GET", "/brands/" + BRAND() + "/gmail").then(function (g) {
      if(jwtGet()!==current || BRAND()!==brand)return;
      window.__GMAIL = g;
      if (typeof ST !== "undefined" && ST.b === "src" && window.render) render();
    }).catch(function () {});
  }
  function loadInbox() {
    var current=jwtGet(),brand=BRAND();
    req("GET", "/brands/" + BRAND() + "/inbox").then(function (l) {
      if(jwtGet()!==current || BRAND()!==brand)return;
      window.__INBOX = l;
      if (typeof ST !== "undefined" && ST.b === "src" && window.render) render();
    }).catch(function () {});
  }
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
          e === 401 ? "주소 뒤에 <b>?key=어드민키</b>를 붙여 접속한 뒤 다시 시도하세요."
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
  function gmailCard() {
    var g = window.__GMAIL, inner;
    if (g === null) {
      inner = '<p style="font-size:10.6px;color:var(--n600)">서버에 연결되면 회사 지메일을 연동할 수 있어요.</p>';
    } else if (!g.accounts.length) {
      inner = "<p><b>회사 지메일로 직접 발송</b> — 구글 로그인 한 번이면 theprlist가 그 주소 명의로 보냅니다. " +
        "비밀번호는 저장하지 않고, 구글 계정 설정에서 언제든 해제할 수 있어요.</p>" +
        (g.demo
          ? '<div style="display:flex;gap:6px;margin-top:9px"><input id="gmEmail" placeholder="hello@brand.com" style="flex:1">' +
            '<span class="cbt" onclick="gmailConnect()">구글로 연결 (데모)</span></div>'
          : '<div style="margin-top:9px"><span class="cbt" onclick="gmailConnect()">🔐 구글로 연결</span>' +
            ' <span class="cbt no" onclick="location.reload()">새로고침</span></div>');
    } else {
      var a = g.accounts[0];
      inner = '<p><b>실제 발신 주소: '+mailEscape(a.email)+'</b></p><p>Google Workspace 회사 도메인 또는 연결된 Gmail 계정으로 발송합니다.</p>'+
        '<p>오늘 Gmail 접수 '+a.sentToday+' / '+a.todayCap+'통 · 남은 한도 '+(a.remainingToday==null?'확인 중':a.remainingToday)+'통</p>'+
        '<p>웜업 '+(a.warmupDay==null?'확인 중':a.warmupDay)+'단계 · 실제 발송한 날에만 한도 증가 · 2 → 4 → 6 → 8 → 12 → 16 → 20통</p>'+
        '<p>전달률·스팸함 도착률·반송률: 아직 측정되지 않았습니다. 웜업 완료나 수신함 도착을 보장하지 않습니다.</p>'+
        (a.sendingPaused?'<p role="alert">발송 일시 중지: '+mailEscape(a.pauseReason)+'</p>':'')+
        '<p>'+(g.inboundReady?'전용 답장 수신 경로가 설정되어 있습니다.':'답장은 브랜드 Gmail 받은편지함으로 들어갑니다. theprlist 자동 수신은 아직 연결되지 않았습니다.')+'</p>'+
        '<button class="cbt" onclick="gmailSending(\''+a.accountId+'\','+(!a.sendingPaused)+')">'+(a.sendingPaused?'확인 후 발송 재개':'발송 일시 중지')+'</button> '+
        '<button class="cbt no" onclick="gmailRefresh()">연결·한도 새로고침</button> '+
        '<button class="cbt no" onclick="gmailDisconnect(\''+a.accountId+'\')">연결 해제</button>'+
        (g.accounts.length>1?'<p>여러 계정 중 위 주소를 발신자로 사용합니다. 변경하려면 현재 발신 계정을 해제하세요.</p>':'');
    }
    return '<div class="cc" style="margin-bottom:12px"><div class="t">지메일 연동 — 구글 로그인으로 브랜드 명의 발송</div>' + inner + "</div>";
  }
  function inboxCard() {
    var L = window.__INBOX;
    if (L === null || !L.length) return '<div class="cc"><h2>대화 내역</h2><p>아직 기록된 대화가 없습니다. 답장 자동 수신 연결 여부는 위 이메일 설정에서 확인하세요.</p></div>';
    var open = window.__INBOX_OPEN;
    var items = L.slice(0, 6).map(function (t) {
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
            mailEscape(m.body) + "<span style='font-size:9px;color:var(--n600)'>" + st + "</span></span>" + (m.state === "pending_gate" ? ' <button class="cbt" onclick="inboxSend(\'' + t.threadId + '\',' + Number(m.msgId) + ')">승인하고 발송</button>' : '') + "</div>";
        }).join("");
        row += "<div style='margin-top:6px'>" + msgs +
          '<div style="display:flex;gap:6px;margin-top:7px"><input id="ibxBody" placeholder="답장 쓰기 — 승인함을 거쳐 발송됩니다" style="flex:1">' +
          '<span class="cbt" onclick="inboxReply(\'' + t.threadId + '\')">답장</span></div></div>';
      }
      return row;
    }).join("");
    return '<div class="cc" style="margin-bottom:12px"><div class="t">대화 내역 · 발신 기록과 수신된 답장</div>' + items + "</div>";
  }
  /* ── 틱톡샵 대량 발송 P0 (반자동) — 발굴·수집 '틱톡샵' 탭 카드 ── */
  window.__DISPATCH = null;
  function loadDispatch() {
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
  window.dispImport = function (input, id) {
    if (!input.files || !input.files[0]) return;
    var fd = new FormData();
    fd.append("file", input.files[0]);
    fetch(API + "/dispatch-batches/" + id + "/import", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        loadDispatch();
        toast("결과 반영", "업데이트 <b>" + r.updated + "건</b>" +
          (r.skipped.length ? " · 매칭 안 됨 " + r.skipped.length + "건" : ""));
      }).catch(function () { toast("업로드 실패", "CSV 형식(handle,status,…)을 확인해 주세요."); });
  };
  function funnelBar(f) {
    var steps = [["초대", f.invited], ["수락", f.accepted], ["배송", f.shipped],
                 ["도착", f.delivered], ["게시", f.posted]];
    return '<div style="display:flex;gap:10px;margin-top:6px">' + steps.map(function (s) {
      return "<span style='font-size:10.2px'><b>" + s[1] + "</b> " + s[0] + "</span>";
    }).join("<span style='color:var(--n400)'>→</span>") +
    (f.noShow ? " <span style='font-size:10.2px;color:var(--bd,#8E3B2A)'>노쇼 " + f.noShow + "</span>" : "") + "</div>";
  }
  function dispatchCard() {
    var L = window.__DISPATCH, inner;
    if (L === null) {
      inner = '<p style="font-size:10.6px;color:var(--n600)">서버 연결 시 셀 멤버에게 틱톡샵 무료 샘플 협업을 대량 발송할 수 있어요.</p>';
    } else {
      var items = L.slice(0, 3).map(function (b) {
        var act = "";
        if (b.state === "PENDING_GATE")
          act = ' <span class="cbt no" onclick="dispRefresh(\'' + b.batchId + '\')">승인 확인</span>' +
                ' <span style="font-size:10px;color:var(--n600)">— 승인함에서 결정하세요</span>';
        else if (b.state === "SENDING" || b.state === "DONE")
          act = ' <a class="cbt" style="text-decoration:none" href="' + API + "/dispatch-batches/" + b.batchId + '/export.csv" target="_blank">셀러센터 CSV</a>' +
                ' <label class="cbt no" style="cursor:pointer">결과 업로드<input type="file" accept=".csv" style="display:none" onchange="dispImport(this,\'' + b.batchId + '\')"></label>';
        else if (b.state === "HELD")
          act = ' <span style="font-size:10px;color:var(--n600)">보류됨 — 외부 무통지</span>';
        return "<div style='margin-top:9px;padding-top:9px;border-top:1px solid var(--n100,#eee)'>" +
          "<b>" + b.product + "</b> · " + b.commissionPct + "% · " +
          "<span class='mono' style='font-size:10px'>" + b.state + "</span>" + act +
          funnelBar(b.funnel) +
          (b.gmv ? "<div style='font-size:10.2px;margin-top:3px'>판매 <b>₩" + b.gmv.toLocaleString() + "</b> · 커미션 ₩" + b.commission.toLocaleString() + "</div>" : "") +
          "</div>";
      }).join("");
      inner = "<p>셀 멤버를 선정해 <b>무료 샘플 + 커미션 협업</b>을 셀러센터로 대량 발송합니다. " +
        "발송은 항상 <b>승인함</b>을 거치고, 90일 내 재발송은 자동 제외돼요.</p>" +
        '<div style="display:flex;gap:6px;margin-top:9px"><input id="dspProd" placeholder="틱톡샵 상품명 또는 ID" style="flex:2">' +
        '<input id="dspCap" placeholder="정원" value="30" style="width:64px">' +
        '<span class="cbt" onclick="dispCreate()">배치 만들기</span></div>' + items;
    }
    return '<div class="cc" style="margin-bottom:12px"><div class="t">샘플 대량 발송 — 틱톡샵 타겟 협업</div>' + inner + "</div>";
  }

  try {
    if (window.srcView) {      // 발굴·수집 탭 본문은 srcView()가 그린다 (raw:2)
      var _srcView = window.srcView;
      window.srcView = function () {
        var h = _srcView();
        if (typeof ST !== "undefined" && ST.srcTab === "mail")
          h = '<div class="cvbd" style="padding-bottom:0">' + gmailCard() + outreachCard() + inboxCard() + "</div>";
        if (typeof ST !== "undefined" && ST.srcTab === "tkshop")
          h = '<div class="cvbd" style="padding-bottom:0">' + dispatchCard() + "</div>" + h;
        return h;
      };
      loadSenders();
      loadDispatch();
      loadGmail();
      loadInbox();
      loadOutreach();
    }
  } catch (e) {}

  window.bjDone = window.bjLearn = function () { location.href='https://theprlist.net/signup'; };

  /* ── 실인증 — 브랜드 로그인 · 초대 수락 · 크리에이터 매직링크 ── */
  function jwtGet() { try { return localStorage.getItem("CONNECTION_JWT") || ""; } catch (e) { return ""; } }
  function jwtSet(t) { try { localStorage.setItem("CONNECTION_JWT", t); } catch (e) {} }
  function jwtClear() { try { localStorage.removeItem("CONNECTION_JWT"); } catch (e) {} }
  window.__ME = null;

  function reloadBrand() {
    outreachData=null;outreachError='';outreachLoading=false; outreachVersion++; window.__INBOX_OPEN=null;
    try { loadOutreach(); loadBilling(); loadSenders(); loadGmail(); loadInbox(); loadDispatch(); } catch (e) {}
    if (window.render) try { render(); } catch (e) {}
  }
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
    document.body.appendChild(d);
  }
  function authChip() {
    var old = document.getElementById("authChip");
    if (old) old.remove();
    var d = document.createElement("div");
    d.id = "authChip";
    d.style.cssText = "position:fixed;bottom:14px;left:14px;z-index:9999;cursor:pointer;" +
      "background:#22272b;color:#fff;border-radius:999px;padding:7px 13px;" +
      "font-size:11px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.25)";
    d.textContent = window.__ME ? "🔐 " + window.__ME.email : "🔐 로그인";
    d.onclick = function () {
      if (document.getElementById("authPanel")) return authPanel(null);
      if (window.__ME) {
        authPanel("<b>" + mailEscape(window.__ME.email) + "</b><br><span style='color:#5a6560'>" +
          (window.__ME.kind === "brand" ? "브랜드 · " + (window.__ME.brandId || "") : window.__ME.kind) +
          "</span><div style='margin-top:9px'><span class='cbt no' onclick=\"authLogout()\">로그아웃</span></div>");
      } else if (window.__SURFACE === "creator") {
        authPanel("<b>이메일로 로그인</b><div style='margin-top:8px;display:flex;gap:5px'>" +
          "<input id='axEmail' placeholder='you@email.com' style='flex:1;padding:6px'>" +
          "<span class='cbt' onclick='authMagic()'>보내기</span></div>" +
          "<div style='margin-top:6px;color:#5a6560'>받은 링크를 누르면 바로 로그인돼요.</div>");
      } else {
        authPanel("<b>브랜드 로그인</b><div style='margin-top:8px'>" +
          "<input id='axEmail' placeholder='이메일' style='width:100%;padding:6px;margin-bottom:5px;box-sizing:border-box'>" +
          "<input id='axPw' type='password' placeholder='비밀번호' style='width:100%;padding:6px;box-sizing:border-box'>" +
          "<div style='margin-top:8px'><span class='cbt' onclick='authLogin()'>로그인</span></div></div>");
      }
    };
    document.body.appendChild(d);
  }
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
  window.authMagic = function () {
    var em = (document.getElementById("axEmail") || {}).value || "";
    req("POST", "/auth/magic", { email: em.trim() }).then(function (r) {
      authPanel(null);
      toast("메일을 확인하세요", r.demoLink
        ? "데모 모드 — <a href='" + r.demoLink.replace("https://theprlist.net/", location.origin + "/") + "'>이 링크로 로그인</a> (15분 유효)"
        : "받은편지함의 로그인 링크를 눌러주세요 (15분 유효).");
    }).catch(function () { toast("전송 실패", "이메일 주소를 확인해 주세요."); });
  };

  /* Public console only exposes workflows backed by durable server results. */
  var profileData=null, profileError='', profileDraft=null, profileUrl='', profileBusy=false, profileNotice='';
  var livePage='home', chatMessages=[], chatBusy=false, profileAnswers={};
  var profileLabels={brand_one_liner:'브랜드 소개',hero_product:'주력 제품',ingredients:'성분·특징',price_range:'가격대',voice:'말투',ideal_creator:'원하는 크리에이터',banned_words:'금지 표현',sample_criteria:'샘플 기준'};
  function loadProfile(){var brand=BRAND();profileError='';req('GET','/brands/'+brand+'/profile/learned').then(function(r){if(BRAND()!==brand)return;profileData=r;Object.keys(r.fields||{}).forEach(function(k){profileAnswers[k]=typeof r.fields[k]==='string'?r.fields[k]:(r.fields[k].value||'');});if(window.__SURFACE==='brand')render();}).catch(function(e){profileError=e.message;if(window.__SURFACE==='brand')render();});}
  window.liveNav=function(page){livePage=page;ST.b=page==='mail'?'src':page==='billing'?'settle':'brief';ST.srcTab='mail';render();};
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
  var originalRender=window.render;
  if(window.__SURFACE==='brand'){
    window.render=function(){
      var stage=document.getElementById('stage');if(!stage)return;
      document.querySelector('.svcbar').style.display='none';
      var nav='<header class="live-head"><a href="https://theprlist.net">theprlist<span> / brand console</span></a><nav>'+[['home','홈'],['learn','브랜드 학습'],['mail','아웃리치·인박스'],['billing','월별 청구']].map(function(x){return '<button class="btn '+(livePage===x[0]?'':'line')+'" onclick="liveNav(\''+x[0]+'\')">'+x[1]+'</button>';}).join('')+'</nav></header>';
      var preserved={};['outRecipients','outSubject','outBody','outBrief','liveQuestion'].forEach(function(id){var el=document.getElementById(id);if(el)preserved[id]=el.value;});
      var body='';
      if(!window.__ME){body='<h1>브랜드와 크리에이터,<br>함께 시작할 준비.</h1><p>승인된 브랜드 계정으로 로그인해 주세요.</p><button class="btn" onclick="document.getElementById(\'authChip\').click()">로그인</button> <a class="btn line" href="https://theprlist.net/signup">가입 신청</a>';}
      else if(livePage==='learn')body=liveLearningCard();
      else if(livePage==='mail')body='<h1>브랜드 메일링</h1>'+gmailCard()+outreachCard()+inboxCard();
      else if(livePage==='billing')body='<h1>월별 청구</h1><p>검증 가입 1명당 50원 · 부가세 포함 · 월 단위 합산</p><p>카드 결제 최소금액은 1,000원입니다. 미만 청구서도 보관되며 자동 결제되지 않습니다.</p><button class="btn line" onclick="refreshBilling()">새로고침</button>'+window.billingInvoicesHtml();
      else if(livePage==='status')body='<h1>서비스 상태</h1><div class="cc"><h2>이용 가능한 흐름</h2><p>브랜드 신청 → 운영자 승인 → 계정 생성 → 홈페이지 분석·프로필 저장 → Gmail 연결 → 초안 검토·발송 → 월별 청구 확인</p></div><div class="cc"><h2>준비 중</h2><p>틱톡·인스타 계정 검증과 자동 후보 수집, 크리에이터 커뮤니티·캠페인 참여, 자동 답장 수신, 크리에이터 대금 지급은 아직 공개 운영 대상이 아닙니다.</p><p>메일 답장은 연결된 Gmail에서 확인하세요. 가입 과금은 실제 검증 가입이 기록될 때만 발생합니다.</p></div>';
      else body='<p class="live-eyebrow">YOUR BRAND, IN GOOD COMPANY</p><h1>브랜드의 다음 연결을<br>만들어 보세요.</h1><p>'+mailEscape(window.__ME.email)+' · '+mailEscape(BRAND())+'</p><div class="live-grid"><button class="cc" onclick="liveNav(\'learn\')"><h2>01. 브랜드 학습</h2><p>홈페이지 분석과 근거를 확인하고 저장하세요.</p></button><button class="cc" onclick="liveNav(\'mail\')"><h2>02. 메일링</h2><p>Gmail을 연결하고 초안을 검토한 뒤 발송하세요.</p></button></div><h2>theprlist에게 물어보세요</h2><p>저장된 브랜드 프로필을 참고해 답합니다. 대화로 메일을 발송하거나 결제를 실행하지 않습니다.</p>'+chatMessages.map(function(m){return '<div class="cc"><b>'+(m.role==='user'?'나':'theprlist')+'</b><p>'+mailEscape(m.content)+'</p></div>';}).join('')+'<form onsubmit="event.preventDefault();liveChat()"><input id="liveQuestion" maxlength="2000" placeholder="우리 브랜드를 소개하는 문구를 제안해 줘" required '+(chatBusy?'disabled':'')+'><button class="btn" '+(chatBusy?'disabled':'')+'>'+(chatBusy?'답변 중…':'질문하기')+'</button></form>';
      stage.innerHTML=nav+'<main class="live-main">'+body+'</main><footer class="live-footer"><a href="https://theprlist.net/privacy">개인정보처리방침</a> · <a href="https://theprlist.net/terms">이용약관</a> · <a href="mailto:chief@dinostudio.kr">문의</a></footer>';
      Object.keys(preserved).forEach(function(id){var el=document.getElementById(id);if(el)el.value=preserved[id];});
    };
    var previousReload=reloadBrand;
    reloadBrand=function(){['outRecipients','outSubject','outBody','outBrief','liveQuestion'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});profileData=null;profileDraft=null;profileNotice='';profileUrl='';profileAnswers={};chatMessages=[];window.__GMAIL=null;window.__INBOX=null;previousReload();if(window.__ME)loadProfile();};
    var style=document.createElement('style');style.textContent='body{background:#f5f4ef}.stage{display:block!important;overflow:auto!important;height:calc(100vh - 1px)!important}.live-head{padding:24px 5%;display:flex;justify-content:space-between;gap:20px;align-items:center;border-bottom:1px solid #dadbd2;background:#fafbf5}.live-head>a{font-size:25px;font-weight:800;color:#163f35;text-decoration:none}.live-head span{font-size:12px;font-weight:400}.live-head nav{display:flex;gap:8px;flex-wrap:wrap}.live-main{max-width:1050px;margin:0 auto;padding:55px 24px 95px;font-size:15px;line-height:1.8}.live-main h1{font-size:40px;line-height:1.25;margin:0 0 25px}.live-main h2{font-size:21px;margin:18px 0 10px}.live-main p{margin:12px 0}.live-main .cc{background:#fff;border:1px solid #dadbd2;border-radius:12px;padding:24px;margin:15px 0;text-align:left}.live-main input,.live-main textarea{display:block;width:100%;box-sizing:border-box;padding:12px;border:1px solid #aebcb1;border-radius:6px;margin:8px 0 14px;font:inherit}.live-main .btn,.live-main .cbt{font-size:14px;padding:10px 16px;cursor:pointer}.live-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.live-eyebrow{letter-spacing:.1em;color:#41684c}.live-footer{padding:20px 24px 75px;text-align:center}.live-main blockquote{padding:12px;border-left:3px solid #5e8c6a;color:#526157;overflow-wrap:anywhere}@media(max-width:700px){.live-head{display:block}.live-head nav{margin-top:15px}.live-main{padding-top:30px}.live-main h1{font-size:30px}.live-grid{grid-template-columns:1fr}}';document.head.appendChild(style);render();
  }

  if(window.__SURFACE==='bjoin'||window.__SURFACE==='creator'){
    window.render=function(){document.querySelector('.svcbar').style.display='none';document.getElementById('stage').innerHTML='<main style="max-width:650px;margin:70px auto;padding:24px"><h1>theprlist</h1><h2>'+(window.__SURFACE==='creator'?'크리에이터 서비스 준비 중':window.__ME?'계정 생성 완료':'계정 초대 수락')+'</h2><p>'+(window.__SURFACE==='creator'?'크리에이터 계정 검증·캠페인 참여 기능을 준비하고 있습니다. 공개 일정은 별도로 안내합니다.':window.__ME?'브랜드 로그인으로 이동해 설정한 계정으로 로그인하세요.':'초대받은 계정은 아래 입력창에서 비밀번호를 설정해 주세요.')+'</p><a class="btn" href="https://theprlist.net">서비스 소개</a> <a class="btn line" href="https://console.theprlist.net">브랜드 로그인</a></main>';};render();
  }
  try {
    var sp = new URLSearchParams(location.search);
    var inviteTok = sp.get("invite"), magicTok = sp.get("magic");
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
        reloadBrand();
        history.replaceState(null, "", location.pathname);
        toast("계정 생성 완료 🎉", "<b>" + mailEscape(r.user.email) + "</b> — 콘솔(console.theprlist.net)에서 이 계정으로 로그인하세요.");
      }).catch(function () { toast("수락 실패", "링크가 만료됐을 수 있어요 — 초대를 다시 요청하세요. 비밀번호는 10자 이상."); });
    };
    if (magicTok) {
      req("POST", "/auth/magic/verify", { token: magicTok }).then(function (r) {
        jwtSet(r.token); window.__ME = r.user; authChip();
        history.replaceState(null, "", location.pathname);
        toast("로그인 완료 ✅", r.user.email);
      }).catch(function () { toast("로그인 실패", "링크가 만료됐어요 — 다시 요청해 주세요."); });
    }
    if (jwtGet()) {
      req("GET", "/auth/me").then(function (u) { window.__ME = u; authChip(); reloadBrand(); })
        .catch(function () { jwtClear(); authChip(); });
    } else if (window.__SURFACE === "brand" || window.__SURFACE === "creator" || inviteTok) {
      authChip();
    }
  } catch (e) {}
})();
