/* 브랜드 운영 › 사람·권한 — 브랜드별 로그인 계정·역할·상태(읽기). 변경은 브랜드 목록의 계정 관리에서(같은 서버 불변식). */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, errText, type AdminBrand, type BrandAccount } from "../adminApi";
import { Chip, Head, LoadError } from "../v8/kit";

const ROLE: Record<string, string> = { owner: "소유자", manager: "운영자", viewer: "조회자" };

export default function People() {
  const nav = useNavigate();
  const [brands, setBrands] = useState<AdminBrand[] | null>(null), [bErr, setBErr] = useState("");
  const [brand, setBrand] = useState(""), [rows, setRows] = useState<BrandAccount[] | null>(null), [err, setErr] = useState("");
  const loadBrands = () => { setBErr(""); adminApi.brands().then((b) => { setBrands(b); if (!brand && b[0]) setBrand((b.find((x) => x.team > 0) || b[0]).brandId); }, (e) => { setBrands(null); setBErr(errText(e)); }); };
  const load = () => { if (!brand) return; setRows(null); setErr(""); adminApi.brandAccounts(brand).then(setRows, (e) => setErr(errText(e))); };
  useEffect(loadBrands, []);
  useEffect(load, [brand]);
  return <div className="v6">
    <Head title="사람·권한" sub="누가 어떤 브랜드의 콘솔·민감 정보에 접근할 수 있는지 봐요. 역할을 바꾸면 그 사람의 기존 로그인이 끊겨요." />
    {bErr ? <LoadError what="브랜드" error={bErr} onRetry={loadBrands} /> : !brands ? <p className="v6-meta" role="status">불러오는 중이에요…</p> : <>
      <div className="v6-filters"><div className="v6-field"><label htmlFor="pp-b">브랜드</label><select id="pp-b" value={brand} onChange={(e) => setBrand(e.target.value)}>{brands.map((b) => <option key={b.brandId} value={b.brandId}>{b.name}{b.suspendedAt ? " (정지)" : ""}</option>)}</select></div>
        <div className="v6-field"><span className="lab">&nbsp;</span><button type="button" className="btn" onClick={() => nav("/brands?brand=" + encodeURIComponent(brand))}>이 브랜드 계정 관리 열기</button></div></div>
      {err ? <LoadError what="계정" error={err} onRetry={load} /> : !rows ? <p className="v6-meta" role="status">불러오는 중이에요…</p> :
        <div className="v6-table" role="table" aria-label="브랜드 계정">
          <div className="v6-tr v6-th" role="row">{["계정", "역할", "상태", "비밀번호", "최근 로그인"].map((h) => <span role="columnheader" key={h}>{h}</span>)}</div>
          {rows.map((a) => <div className="v6-tr" role="row" key={a.userId}>
            <span role="cell" className="v6-wrap"><b>{a.email}</b></span><span role="cell">{ROLE[a.role] || a.role}</span>
            <span role="cell"><Chip tone={a.state === "active" ? "ok" : "err"}>{a.state === "active" ? "활성" : "접근 중지"}</Chip></span>
            <span role="cell">{a.passwordSet ? "설정됨" : <Chip tone="info">초대 대기</Chip>}</span>
            <span role="cell">{a.lastLoginAt ? a.lastLoginAt.slice(0, 16).replace("T", " ") : "—"}</span></div>)}
          {!rows.length && <div className="v6-empty">로그인 계정이 없어요.</div>}
        </div>}
    </>}
  </div>;
}
