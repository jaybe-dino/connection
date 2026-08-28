import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@connection/ui";
import type { AppNotification, NotifType } from "@connection/shared";
import { api } from "@connection/shared/api";
import { mockMe, mockNotifications } from "@connection/shared/mock";

const TYPE_LABEL: Record<NotifType, string> = {
  selected: "캠페인 선정",
  shipping: "배송",
  review_result: "검수 결과",
  payout: "정산",
  deadline_d3: "마감 D-3",
};

/** 알림함 (P0) — 유형별 푸시 on/off + PWA 설치 배너 */
export default function NotificationsScreen() {
  const [prefs, setPrefs] = useState<Record<NotifType, boolean>>({
    selected: true, shipping: true, review_result: true, payout: true, deadline_d3: true,
  });
  const [read, setRead] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<AppNotification[]>(mockNotifications);
  const [live, setLive] = useState(false);

  useEffect(() => {
    api
      .notifications(mockMe.id)
      .then((rows) => {
        setItems(rows.map((r) => ({ ...r, at: new Date(r.at).toLocaleString("ko", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) })));
        setLive(true);
      })
      .catch(() => setLive(false));
  }, []);

  const markRead = (id: string) => {
    setRead((s) => new Set(s).add(id));
    if (live) void api.readNotification(id).catch(() => {});
  };

  return (
    <div>
      <Card style={{ background: "var(--t100)", borderColor: "var(--t200)" }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>홈 화면에 추가하면 푸시를 받아요</div>
        <div style={{ fontSize: 11, color: "var(--n600)", marginTop: 2 }}>
          같은 주소 그대로 — 앱스토어 없이 설치돼요
        </div>
      </Card>

      <SectionTitle>알림</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((n) => {
          const isRead = n.read || read.has(n.id);
          return (
            <Card key={n.id} onClick={() => markRead(n.id)} style={{ opacity: isRead ? 0.55 : 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                {!isRead && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--t500)", flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: "var(--n500)" }}>{n.body}</div>
                </div>
                <span style={{ fontSize: 10, color: "var(--n400)" }}>{n.at}</span>
              </div>
            </Card>
          );
        })}
      </div>

      <SectionTitle>푸시 설정</SectionTitle>
      <Card>
        {(Object.keys(TYPE_LABEL) as NotifType[]).map((t) => (
          <label key={t} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--n100)", cursor: "pointer", fontSize: 13 }}>
            {TYPE_LABEL[t]}
            <input
              type="checkbox"
              checked={prefs[t]}
              onChange={(e) => setPrefs((p) => ({ ...p, [t]: e.target.checked }))}
            />
          </label>
        ))}
        <div style={{ fontSize: 11, color: "var(--n400)", marginTop: 8 }}>
          꺼도 알림함에는 남아요
        </div>
      </Card>
    </div>
  );
}
