export const normalizeSlug=value=>value.trim().toLowerCase();
export function slugProblem(value){
 const slug=normalizeSlug(value);
 if(!slug)return '브랜드 주소를 입력해 주세요. 예: exoproxyl';
 if(slug.includes('.')||slug.includes('/')||slug.includes(':'))return '홈페이지 URL 대신 사용할 브랜드 주소만 입력해 주세요. 예: exoproxyl';
 if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug))return '브랜드 주소는 영문 소문자·숫자·하이픈 3~40자로 입력해 주세요. 예: exoproxyl';
 return '';
}
export function availabilityMessage(result){
 if(result.available===true)return '사용 가능한 주소입니다. 신청이 접수되면 예약됩니다.';
 return ({pending:'이 주소로 이미 신청이 접수되어 검토 중입니다. 본인이 접수한 신청이라면 다시 신청하지 않아도 됩니다. 신청한 적이 없다면 다른 주소를 사용하거나 운영팀에 문의해 주세요.',registered:'이미 등록된 브랜드 주소입니다. 기존 브랜드라면 콘솔에서 로그인해 주세요.',reserved:'서비스에서 사용하는 주소입니다. 다른 브랜드 주소를 입력해 주세요.',invalid:'브랜드 주소 형식을 확인해 주세요. 홈페이지 URL이 아닌 exoproxyl 같은 이름을 입력해 주세요.'})[result.reason]||'이 주소는 사용할 수 없습니다. 기존 신청 여부를 운영팀에 확인하거나 다른 주소를 입력해 주세요.';
}
