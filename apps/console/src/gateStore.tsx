import { createContext, useContext, useState, type ReactNode } from "react";
import type { GateCard, GateState } from "@connection/shared";
import { mockGates } from "@connection/shared/mock";

/** 게이트 로컬 상태 — API 연동 전. 승인=실행, 보류=외부 무통지. */
interface GateStore {
  gates: GateCard[];
  decide: (id: string, state: GateState) => void;
  pendingCount: number;
}

const Ctx = createContext<GateStore | null>(null);

export function GateProvider({ children }: { children: ReactNode }) {
  const [gates, setGates] = useState<GateCard[]>(mockGates);
  const decide = (id: string, state: GateState) =>
    setGates((gs) => gs.map((g) => (g.id === id ? { ...g, state } : g)));
  const pendingCount = gates.filter(
    (g) => g.state === "PENDING" || g.state === "HELD"
  ).length;
  return <Ctx.Provider value={{ gates, decide, pendingCount }}>{children}</Ctx.Provider>;
}

export function useGates(): GateStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("GateProvider missing");
  return v;
}
