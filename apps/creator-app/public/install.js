/* Installation is optional and never requests notification or account access. */
(function(){
  var prompt=null,button=document.getElementById('install'),status=document.getElementById('status');
  function standalone(){return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
  function installed(){button.hidden=true;document.getElementById('installed').hidden=false;}
  if(standalone())installed();
  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();prompt=e;if(!standalone())button.hidden=false;
  });
  button.addEventListener('click',async function(){
    if(!prompt)return;
    var current=prompt;prompt=null;button.disabled=true;
    try{await current.prompt();var choice=await current.userChoice;
      status.textContent=choice.outcome==='accepted'?'설치를 요청했어요. 휴대폰에 추가된 아이콘을 확인해 주세요.':'나중에 브라우저 메뉴에서 다시 설치할 수 있어요.';
    }catch(e){status.textContent='브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택해 주세요.';}
    finally{button.hidden=true;button.disabled=false;}
  });
  window.addEventListener('appinstalled',function(){installed();status.textContent='설치가 완료됐어요.';});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(function(){status.textContent='설치 준비를 마치지 못했어요. 연결을 확인하고 다시 열어주세요.';});
})();
