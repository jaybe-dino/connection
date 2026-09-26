// 매직링크는 크리에이터 앱 고정 origin에서만 소비한다 (P0: 랜딩 오분기 수정).
// 임의 redirect URL을 만들지 않는다 — 화이트리스트 파라미터(brand slug, magic)만
// 고정 origin에 재조합한다. brand는 slug 형식일 때만 보존.
export const CREATOR_APP_ORIGIN = 'https://app.theprlist.net';

export function magicForwardUrl(search, origin) {
  const p = new URLSearchParams(search);
  const magic = p.get('magic');
  if (!magic) return null;
  const brand = (p.get('brand') || '').toLowerCase();
  const keepBrand = /^[a-z0-9][a-z0-9-]{2,39}$/.test(brand) ? brand : '';
  return (origin || CREATOR_APP_ORIGIN) + '/?' +
    (keepBrand ? 'brand=' + encodeURIComponent(keepBrand) + '&' : '') +
    'magic=' + encodeURIComponent(magic);
}
