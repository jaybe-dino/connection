"""harvest CLI — MVP 점검 도구.

벤더 키 계약 전에도 파이프라인 로직을 로컬 픽스처로 돌려볼 수 있다.

  harvest score --followers 45000 --engagement 0.06 --avg-views 30000
  harvest country --region TH --bio-lang th
  harvest emails --bio "contact: jay(at)dino(dot)studio / mgmt@example.com"
  harvest demo   # 픽스처 프로필 3건으로 fetch→enrich→dedup→score 파이프라인 실연
"""

import argparse
import json

from .dedup import DedupCandidate, match
from .enrich import CountrySignals, decide_country, extract_emails
from .fetch import VendorRouter
from .models import CreatorProfile, EmailStatus, Platform
from .pipeline import FetchWorker
from .queues import Ctx, FetchMsg, InMemoryQueue, Q_ENRICH
from .score import ScoreInput, contact_score, grade_of, influence_score
from .store import InMemoryPool


class _FixtureVendor:
    """데모용 인메모리 벤더."""

    name = "fixture"

    def __init__(self, profiles: dict[str, CreatorProfile]) -> None:
        self.profiles = profiles

    def user_info(self, handle: str) -> CreatorProfile:
        from .vendors.base import NotFound

        if handle not in self.profiles:
            raise NotFound(handle)
        return self.profiles[handle]


def _demo() -> None:
    fixtures = {
        "beauty.mai": CreatorProfile(
            platform=Platform.TIKTOK, platform_uid="7001", handle="beauty.mai",
            display_name="Mai", followers=48_000, bio="รีวิวสกินแคร์ 💌 mai.work@gmail.com",
            account_region="TH", avg_views=35_000, engagement_rate=0.061,
            post_freq_30d=12,
        ),
        "glow.linh": CreatorProfile(
            platform=Platform.TIKTOK, platform_uid="7002", handle="glow.linh",
            display_name="Linh", followers=8_500,
            bio="kem chống nắng review — linh(at)glowmail(dot)com",
            account_region="VN", avg_views=4_100, engagement_rate=0.083,
            post_freq_30d=18,
        ),
        "sunlover.us": CreatorProfile(
            platform=Platform.TIKTOK, platform_uid="7003", handle="sunlover.us",
            display_name="Kate", followers=320_000, bio="collabs: linktr.ee/sunlover",
            account_region="US", avg_views=90_000, engagement_rate=0.021,
            post_freq_30d=6, sponsor_ratio_90d=0.55,
        ),
    }
    router = VendorRouter([_FixtureVendor(fixtures)])
    pool = InMemoryPool()
    queues = InMemoryQueue()
    worker = FetchWorker(router, pool, queues)

    ctx = Ctx(country="TH", category="sunscreen")
    for handle in [*fixtures, "deleted.account"]:
        cid = worker.handle(FetchMsg(handle=handle, platform="tiktok", ctx=ctx,
                                     source="demo"))
        if not cid:
            print(f"  - {handle}: skip/excluded")
            continue
        p = fixtures[handle]
        emails = extract_emails(p.bio)
        inf = influence_score(ScoreInput(
            followers=p.followers, engagement_rate=p.engagement_rate,
            avg_views=p.avg_views, post_freq_30d=p.post_freq_30d,
            sponsor_ratio_90d=p.sponsor_ratio_90d,
        ))
        contact = contact_score(
            inf,
            EmailStatus.VALID if emails else EmailStatus.NONE,
        )
        print(f"  - {handle}: grade={grade_of(p.followers).value} "
              f"influence={inf} contact={contact} emails={emails}")

    print(f"\n母 DB: {len(pool)}건 적재 · q.enrich depth={queues.depth(Q_ENRICH)}")

    a = DedupCandidate("c1", handle="beauty.mai", verified_email="Mai.Work@gmail.com")
    b = DedupCandidate("c2", handle="beauty_mai", verified_email="maiwork@gmail.com")
    m = match(a, b)
    print(f"dedup 예시: {m.verdict.value} (score={m.score}, hits={list(m.rule_hits)})")


def _outreach_demo() -> None:
    from .outreach import DryRunEsp, OutreachEngine

    eng = OutreachEngine()
    esp = DryRunEsp()
    for email, name in [("mai@work.co", "Mai"), ("linh@glow.vn", "Linh"),
                        ("nong@skin.th", "Nong")]:
        eng.enroll(email, name, context={"brand": "GLOWLAB"})

    batch = eng.build_batch()
    print(f"배치 생성: {len(batch.steps)}통 — OUTBOUND 게이트 승인 대기")
    print("  (승인 전에는 아무것도 발송되지 않는다)")
    sent = eng.send_batch(batch.batch_id, esp)   # ← 게이트 승인 시점
    print(f"게이트 승인 → {sent}통 발송 (드라이런)")

    print("\n회신 처리:")
    for email, body in [("mai@work.co", "สนใจค่ะ ขอรายละเอียด"),
                        ("linh@glow.vn", "unsubscribe please")]:
        kind = eng.record_reply(email, body)
        print(f"  {email}: {kind.value}")
    print(f"\n상태: {eng.stats()}")


def _runner_tick(api: str | None, auto_approve: bool) -> None:
    from .runner import HttpGateClient, MemoryGateClient, Runner

    if api:
        gates = HttpGateClient(api)
        mode = f"실서버 게이트 ({api})"
    else:
        gates = MemoryGateClient(auto_approve=auto_approve)
        mode = "드라이런 게이트" + (" · 자동 승인" if auto_approve else "")
    runner = Runner(gates=gates)
    for email, name in [("mai@work.co", "Mai"), ("linh@glow.vn", "Linh")]:
        runner.outreach.enroll(email, name, context={"brand": "GLOWLAB"})

    print(f"러너 1틱 — {mode}")
    for job in runner.tick():
        print(f"  실행: {job}")
    for msg in runner.poll_gates():
        print(f"  폴링: {msg}")
    for line in runner.log:
        print(f"  · {line}")
    if not api and not auto_approve:
        print("  (승인 대기 중 — 실서비스에선 콘솔 게이트에서 사람이 승인)")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="harvest", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_score = sub.add_parser("score", help="영향력 스코어 계산")
    p_score.add_argument("--followers", type=int)
    p_score.add_argument("--engagement", type=float)
    p_score.add_argument("--avg-views", type=int)
    p_score.add_argument("--post-freq", type=int)
    p_score.add_argument("--sponsor-ratio", type=float)
    p_score.add_argument("--days-since-post", type=int)

    p_country = sub.add_parser("country", help="국가 판정")
    p_country.add_argument("--region")
    p_country.add_argument("--phone")
    p_country.add_argument("--bio-lang")
    p_country.add_argument("--caption-lang", action="append", default=[])

    p_emails = sub.add_parser("emails", help="bio 이메일 추출")
    p_emails.add_argument("--bio", required=True)

    sub.add_parser("demo", help="픽스처로 파이프라인 실연")
    sub.add_parser("outreach-demo", help="메일 시퀀스 엔진 실연 (드라이런 · 게이트 흐름)")

    p_runner = sub.add_parser(
        "runner", help="에이전트 러너 1틱 실행 (기본 드라이런, --api 로 실서버 게이트)")
    p_runner.add_argument("--api", help="API 베이스 URL — 주면 실서버 게이트에 접수")
    p_runner.add_argument("--auto-approve", action="store_true",
                          help="드라이런 전용: 게이트 자동 승인으로 전체 루프 실연")

    args = parser.parse_args(argv)

    if args.cmd == "score":
        s = ScoreInput(
            followers=args.followers, engagement_rate=args.engagement,
            avg_views=args.avg_views, post_freq_30d=args.post_freq,
            sponsor_ratio_90d=args.sponsor_ratio,
            days_since_last_post=args.days_since_post,
        )
        inf = influence_score(s)
        print(json.dumps({
            "influence": inf,
            "grade": grade_of(args.followers).value,
        }, ensure_ascii=False))
    elif args.cmd == "country":
        d = decide_country(CountrySignals(
            account_region=args.region, phone_country=args.phone,
            bio_lang=args.bio_lang, caption_langs=args.caption_lang,
        ))
        print(json.dumps({
            "country": d.country, "confidence": round(d.confidence, 3),
            "needs_recheck": d.needs_recheck,
        }, ensure_ascii=False))
    elif args.cmd == "emails":
        print(json.dumps(extract_emails(args.bio), ensure_ascii=False))
    elif args.cmd == "demo":
        _demo()
    elif args.cmd == "outreach-demo":
        _outreach_demo()
    elif args.cmd == "runner":
        _runner_tick(api=args.api, auto_approve=args.auto_approve)


if __name__ == "__main__":
    main()
