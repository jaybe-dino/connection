from core.notifications import Channel, NotifType, NotificationCenter


def test_inbox_and_default_channels():
    nc = NotificationCenter()
    n = nc.notify("creator-1", NotifType.SELECTED, "선정되었습니다")
    assert [x.notif_id for x in nc.inbox("creator-1")] == [n.notif_id]
    # 기본: INBOX + PUSH → 외부 발송 로그엔 PUSH만
    assert [(ch, x.notif_id) for ch, x in nc.sent_log] == [(Channel.PUSH, n.notif_id)]


def test_type_prefs_off_push():
    nc = NotificationCenter()
    nc.set_pref("creator-1", NotifType.DEADLINE_D3, set())   # 푸시 끔
    nc.notify("creator-1", NotifType.DEADLINE_D3, "마감 D-3")
    assert nc.sent_log == []                                 # 외부 채널 없음
    assert len(nc.inbox("creator-1")) == 1                   # 알림함은 항상 남는다


def test_brand_gate_pending_defaults_to_email():
    nc = NotificationCenter()
    nc.notify("brand-kim", NotifType.GATE_PENDING, "승인 대기 3건")
    assert [ch for ch, _ in nc.sent_log] == [Channel.EMAIL]


def test_custom_sender_and_read():
    sent = []
    nc = NotificationCenter(sender=lambda ch, n: sent.append(ch))
    nc.set_pref("brand-kim", NotifType.GATE_PENDING,
                {Channel.EMAIL, Channel.KAKAO, Channel.SLACK})
    n = nc.notify("brand-kim", NotifType.GATE_PENDING, "승인 대기")
    assert sorted(sent) == [Channel.EMAIL, Channel.KAKAO, Channel.SLACK]
    nc.mark_read("brand-kim", n.notif_id)
    assert nc.inbox("brand-kim", unread_only=True) == []
