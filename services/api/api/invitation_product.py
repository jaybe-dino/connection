"""Only operator-authored, explicitly public invitation product fields."""
import ipaddress
from urllib.parse import urlsplit
from fastapi import HTTPException

def safe_image(value):
    if not value:return ''
    try:
        u=urlsplit(value);host=u.hostname or ''
        if u.scheme!='https' or not host or u.username or u.password or u.port not in (None,443) or host.lower()=='localhost' or host.lower().endswith(('.local','.localhost','.internal')):raise ValueError()
        try:
            if not ipaddress.ip_address(host).is_global:raise ValueError()
        except ValueError as e:
            if all(x.isdigit() for x in host.split('.')) or ':' in host:raise e
        if '.' not in host:raise ValueError()
        return value
    except Exception:raise HTTPException(400,'공개 HTTPS 제품 이미지 주소를 입력하세요') from None

def public_product(c,brand,pid):
    r=c.execute("SELECT p.product_id,p.name,v.summary,v.image_url FROM brand_products p JOIN brands b USING(brand_id) LEFT JOIN product_invitation_profiles v USING(product_id) WHERE p.product_id=%s AND p.brand_id=%s AND p.state='active' AND b.suspended_at IS NULL AND NOT b.is_internal AND NOT b.is_demo",(pid,brand)).fetchone()
    if not r:raise HTTPException(404,'공개할 제품 정보가 없습니다')
    return {'productId':str(r['product_id']),'name':r['name'],'summary':r['summary'] or '', 'imageUrl':r['image_url'] or ''}
