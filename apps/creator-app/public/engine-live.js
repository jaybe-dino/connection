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

  /* ── 콘솔: 아리 검토(컴플라이언스) · AI 브리프 → 실서버 ── */
  window.ariReview = function () {
    var nm = (document.getElementById("ncn") || {}).value || "9월 진정 앰플";
    var text = nm + " — 48시간 진정 테스트 완료 · 무향 · 민감성 전용 · #ad 표기";
    req("POST", "/compliance/check", {
      text: text, country: "TH",
      banned_words: ["미백", "최고"], require_disclosure: true,
    }).then(function (r) {
      if (r.ok && !r.violations.length)
        return toast("아리 검토 · 통과", "금지어·의학적 표현·광고 표기 모두 문제 없어요. 게시해도 됩니다.");
      var rows = r.violations.map(function (v) {
        return "<div style='margin:5px 0'>" +
          (v.severity === "block" ? "⛔" : "⚠️") + " <b>" + v.term + "</b> — " +
          v.message + (v.fix ? "<br><span style='color:var(--n600)'>→ " + v.fix + "</span>" : "") +
          "</div>";
      }).join("");
      toast(r.ok ? "아리 검토 · 주의 " + r.violations.length + "건"
                 : "아리 검토 · 게시 불가", rows);
    }).catch(function () {
      toast("아리 검토", "문구를 아리가 먼저 봅니다 — <b>금지어 검사</b>와 국가별 광고 표기 규정 체크를 통과해야 게시돼요.");
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
            /onclick="toast\('아리 검토'[\s\S]*?\)"(?=>아리 검토 먼저)/,
            'onclick="ariReview()"');
          v.b = v.b.replace(
            '>아리 검토 먼저</button>',
            '>아리 검토 먼저</button><button class="btn line" onclick="briefGen()">AI 브리프</button>');
        }
        return v;
      };
    }
  } catch (e) {}

  /* ── 브랜드 발신 이메일 (트랙 B 도메인 인증) — 콘솔 '발굴·수집' 탭 카드 ── */
  window.__SENDERS = null;
  function loadSenders(silent) {
    req("GET", "/brands/glowlab/senders").then(function (l) {
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
    req("POST", "/brands/glowlab/senders", { email: v }).then(function (r) {
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
  try {
    if (window.srcView) {      // 발굴·수집 탭 본문은 srcView()가 그린다 (raw:2)
      var _srcView = window.srcView;
      window.srcView = function () {
        var h = _srcView();
        if (typeof ST !== "undefined" && ST.srcTab === "mail")
          h = '<div class="cvbd" style="padding-bottom:0">' + senderCard() + "</div>" + h;
        return h;
      };
      loadSenders();
    }
  } catch (e) {}

  /* ── 브랜드 가입 완료 → 신청 접수 (어드민 승인 큐로) ── */
  if (window.bjDone) {
    var _bjDone = window.bjDone;
    window.bjDone = function () {
      var B = (typeof ST !== "undefined" && ST.bj) || {};
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
