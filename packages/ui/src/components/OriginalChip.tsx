import { useState } from "react";

/** 번역 레이어 — 시청자 언어 자동 표시 + 원문 칩 토글 (기획안 §4.8) */
export function OriginalChip({
  original,
  translated,
  originalLocale,
}: {
  original: string;
  translated?: string;
  originalLocale: string;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const hasTranslation = translated !== undefined && translated !== original;

  return (
    <span>
      <span>{showOriginal || !hasTranslation ? original : translated}</span>
      {hasTranslation && (
        <button
          onClick={() => setShowOriginal((v) => !v)}
          style={{
            marginLeft: 6,
            padding: "1px 7px",
            fontSize: 10,
            fontWeight: 700,
            border: "1px solid var(--n200)",
            borderRadius: 999,
            background: showOriginal ? "var(--n800)" : "var(--n0)",
            color: showOriginal ? "var(--n0)" : "var(--n500)",
            cursor: "pointer",
          }}
        >
          {showOriginal ? "번역" : `원문 ${originalLocale.toUpperCase()}`}
        </button>
      )}
    </span>
  );
}
