import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { GateCard, GateState } from "@connection/shared";
import { api, type ApiGate } from "@connection/shared/api";
import { mockGates } from "@connection/shared/mock";

/** 게이트 스토어 — API 우선, 서버가 없으면 목데이터 폴백 (오프라인 데모). */
const MEMBER_ID = "kim"; // 인증 스텁 — OAuth/세션 붙기 전

interface GateStore {
  gates: GateCard[];
  decide: (id: string, state: GateState) => Promise<void>;
  pendingCount: number;
  live: boolean; // API 연결 여부
}

const Ctx = createContext<GateStore | null>(null);

function fromApi(g: ApiGate): GateCard {
  return { ...g, at: new Date(g.at).toLocaleString("ko", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) };
}

export function GateProvider({ children }: { children: ReactNode }) {
  const [gates, setGates] = useState<GateCard[]>(mockGates);
  const [live, setLive] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await api.gates();
      setGates(rows.map(fromApi));
      setLive(true);
    } catch {
      setLive(false); // API 다운 — 목데이터 유지
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decide = useCallback(
    async (id: string, state: GateState) => {
      if (live) {
        try {
          if (state === "APPROVED") await api.approveGate(id, MEMBER_ID);
          else if (state === "HELD") await api.holdGate(id, MEMBER_ID);
          else if (state === "REJECTED") await api.rejectGate(id, MEMBER_ID, "콘솔에서 거절");
          await refresh();
          return;
        } catch (e) {
          console.error("gate decide failed", e);
        }
      }
      setGates((gs) => gs.map((g) => (g.id === id ? { ...g, state } : g)));
    },
    [live, refresh]
  );

  const pendingCount = gates.filter(
    (g) => g.state === "PENDING" || g.state === "HELD"
  ).length;

  return (
    <Ctx.Provider value={{ gates, decide, pendingCount, live }}>{children}</Ctx.Provider>
  );
}

export function useGates(): GateStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("GateProvider missing");
  return v;
}
