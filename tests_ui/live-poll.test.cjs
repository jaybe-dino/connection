// 실시간 갱신 폴링 — 로그아웃/백그라운드 중단, 단일 비행, 오류 backoff,
// stale 세션 무시, 변경시에만 보존 렌더(softRender) 호출.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const s=fs.readFileSync('packages/demo-core/src/engine-live.js','utf8');

function harness(){
  const timers=[];const renders={soft:0,full:0};
  const c={
    window:{__ME:{kind:'creator'},__USER_LANG:'ko'},
    document:{hidden:false,getElementById:()=>null,addEventListener(){}},
    token:'t1',jwtGet:()=>c.token,
    reqs:[],req:(m,u)=>{c.reqs.push(m+' '+u);return Promise.resolve(c.responses&&c.responses(u)||[]);},
    responses:null,
    commCells:[],commOpen:null,creatorLoadErrors:{},creatorLoadNotice:()=>'',
    render(){renders.full++;},softRender(){renders.soft++;},
    toast(){},mailEscape:v=>String(v??''),
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},
    clearTimeout(){},
    JSONstub:null,timers,renders,
  };
  vm.createContext(c);
  vm.runInContext(s.slice(s.indexOf('    var commChannel='),s.indexOf('    var creatorMagicBusy=')),c);
  return c;
}
const flush=()=>new Promise(r=>setImmediate(()=>setImmediate(()=>setImmediate(r))));

test('로그아웃 상태에서는 요청도 재예약도 하지 않는다',async()=>{
  const c=harness();c.window.__ME=null;
  await c.window.__crPollTick();await flush();
  assert.equal(c.reqs.length,0);assert.equal(c.timers.length,0);
});

test('백그라운드(hidden)에서는 요청하지 않는다 — 복귀 crPollNow가 재개',async()=>{
  const c=harness();c.document.hidden=true;
  await c.window.__crPollTick();await flush();
  assert.equal(c.reqs.length,0);
});

test('정상 틱: 미읽음·알림 조회 후 기본 간격(5s) 재예약, 변경 없으면 렌더 없음',async()=>{
  const c=harness();
  c.creatorNotifs={unreadCount:0,items:[]};   // 초기 로드 완료 상태
  c.responses=(u)=>u.includes('/me/notifications')?{unreadCount:0,items:[]}:[];
  await c.window.__crPollTick();await flush();
  assert.deepEqual(c.reqs,['GET /me/unread','GET /me/notifications?limit=30']);
  assert.equal(c.timers.length,1);assert.equal(c.timers[0].ms,5000);
  assert.equal(c.renders.soft+c.renders.full,0);  // 변경 없음 → 화면 유지
});

test('변경 감지 시 softRender 1회(전체 render로 타이핑을 날리지 않음)',async()=>{
  const c=harness();
  c.responses=(u)=>u.includes('/me/unread')?[{cellId:'a',unread:2}]:{unreadCount:1,items:[{id:'1',read:false}]};
  await c.window.__crPollTick();await flush();
  assert.equal(c.renders.soft,1);assert.equal(c.renders.full,0);
});

test('단일 비행: 진행 중 틱이 있으면 중복 요청 없이 재예약만 한다',async()=>{
  const c=harness();let release;
  c.req=(m,u)=>{c.reqs.push(u);return new Promise(r=>release=r);};
  const p=c.window.__crPollTick();
  await c.window.__crPollTick();                    // busy → skip
  assert.equal(c.reqs.length,1);
  release([]);c.req=()=>Promise.resolve({unreadCount:0,items:[]});await p;await flush();
});

test('오류 backoff: 실패가 쌓이면 간격이 늘고 성공하면 5s로 복귀',async()=>{
  const c=harness();
  c.req=()=>Promise.reject(new Error('down'));
  await c.window.__crPollTick();await flush();
  await c.window.__crPollTick();await flush();
  const grew=c.timers.map(t=>t.ms);
  assert.equal(grew[0],10000);assert.equal(grew[1],20000);
  c.req=(m,u)=>Promise.resolve(u.includes('/me/notifications')?{unreadCount:0,items:[]}:[]);
  await c.window.__crPollTick();await flush();
  assert.equal(c.timers[2].ms,5000);
});

test('세션 교체(stale 토큰) 응답은 상태를 바꾸지 못한다',async()=>{
  const c=harness();let resolve1;
  c.req=(m,u)=>{c.reqs.push(u);return new Promise(r=>resolve1=r);};
  const p=c.window.__crPollTick();
  c.token='t2';                                     // 폴링 중 세션 교체
  resolve1([{cellId:'a',unread:9}]);
  c.req=()=>Promise.resolve({unreadCount:0,items:[]});
  await p;await flush();
  assert.equal(JSON.stringify(c.commUnread),'{}'); // stale 무시
  assert.equal(c.renders.soft,0);
});

test('열린 채널의 새 메시지는 갱신되고 읽음 커서를 저장한다',async()=>{
  const c=harness();
  c.commOpen={cellId:'cell-a',name:'A',msgs:[]};c.commChannel='chat';
  c.responses=(u)=>{
    if(u.includes('/me/unread'))return [];
    if(u.includes('/me/notifications'))return {unreadCount:0,items:[]};
    if(u.includes('/messages?channel='))return [{msgId:7,channel:'chat',original:'새 메시지'}];
    return {ok:true};
  };
  await c.window.__crPollTick();await flush();
  assert.equal(c.commOpen.msgs[0].msgId,7);
  assert.ok(c.reqs.some(r=>r.includes('POST')&&r.includes('/read')));
  assert.equal(c.renders.soft,1);
});
