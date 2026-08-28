import { createContext, useContext, useState, type ReactNode } from "react";
import type { Locale } from "@connection/shared";
import { mockMe } from "@connection/shared/mock";

/** 시청자 언어 — IP 초기값 · 수동 변경 가능 (P0 언어 수동 변경) */
interface AppState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  activeBrandId: string;
  setActiveBrandId: (id: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(mockMe.locale);
  const [activeBrandId, setActiveBrandId] = useState(mockMe.memberships[0]);
  return (
    <Ctx.Provider value={{ locale, setLocale, activeBrandId, setActiveBrandId }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppStateProvider missing");
  return v;
}
