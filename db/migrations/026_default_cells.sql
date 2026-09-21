-- 검수 지적: 신규 브랜드 승인 후에도 커뮤니티 셀이 없어 /community/my-cells=[].
-- 기본 셀은 코드(승인 시 ensure_default_cell)가 만들고, 이 파일은 기존
-- 실브랜드 보완(백필)만 멱등으로 수행한다.
INSERT INTO cells (cell_id, brand_id, name, visibility, member_count)
SELECT 'cell-' || b.brand_id || '-main', b.brand_id, b.name || ' 라운지',
       'apply_approve', 0
  FROM brands b
 WHERE NOT EXISTS (SELECT 1 FROM cells c WHERE c.brand_id = b.brand_id)
ON CONFLICT (cell_id) DO NOTHING;
