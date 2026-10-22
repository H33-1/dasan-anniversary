/* All registration and conflict checks also run on the server. */
let actor=null,currentTeam=null,reservations=new Set(),viewOnly=false,working=false,pendingSave=null;
const originalRenderHoliday=renderHolidayHits,originalSummary=renderSummary;
function hkey(h){return h.date+'|'+h.name.normalize('NFC').replace(/\s*\([^)]*\)/g,'').replace(/^(세계|국제)\s*/,'').replace(/\s/g,'')}
function identity(){return {grade:parseInt(grade.value,10),classNo:parseInt(classNo.value,10),number:parseInt(number.value,10),name:studentName.value.trim().normalize('NFC')}}
function setStatus(message){document.getElementById('connectionStatus').textContent=message}
async function api(action,extra={}){
 const url=window.APP_CONFIG?.apiUrl;
 if(!url||!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url))throw new Error('서버 연결 준비 중입니다. 관리자에게 문의해주세요.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,actor,...extra}),signal:controller.signal,redirect:'follow',credentials:'omit'});
 if(!response.ok)throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.');
 const result=await response.json();if(!result.ok){const error=new Error(result.error.message);error.code=result.error.code;throw error}if(!result.data)throw new Error("서버 응답을 확인하지 못했습니다. 다시 시도해주세요.");return result.data;
 }catch(e){if(e.name==='AbortError')throw new Error('응답을 확인하지 못했습니다. 다시 조회해 저장 여부를 확인해주세요.');throw e}finally{clearTimeout(timer)}
}
async function task(fn){if(working)return;working=true;document.body.classList.add('busy');setStatus('처리 중입니다…');try{await fn();setStatus('')}catch(e){setStatus(e.message);toast(e.message)}finally{working=false;document.body.classList.remove('busy')}}
next1=function(){
 if(!grade.value||!classNo.value||!number.value||!studentName.value.trim())return toast('학년, 반, 번호, 이름을 모두 입력해주세요.');
 task(async()=>{actor=identity();const data=await api('lookup');currentTeam=data.team;pendingSave=null;if(currentTeam){loadTeam(currentTeam);viewOnly=true;show(5)}else{viewOnly=false;holiday=null;makeType=null;document.querySelectorAll('.friendNo,.friendName').forEach(x=>x.value='');document.querySelectorAll('#p4 .choice').forEach(x=>{x.classList.remove('selected');x.setAttribute('aria-pressed','false')});show(2)}});
};
function membersFromForm(){
 const members=[{...actor}];if(mode==='team'){
 const numbers=[...document.querySelectorAll('.friendNo')],names=[...document.querySelectorAll('.friendName')];
 names.forEach((field,i)=>{const name=field.value.trim(),number=parseInt(numbers[i].value,10);if(name||numbers[i].value){if(!name||!number)throw new Error('친구의 번호와 이름을 모두 입력해주세요.');members.push({...actor,number,name})}});
 if(members.length<2)throw new Error('함께할 친구를 한 명 이상 입력해주세요.');
 }
 if(new Set(members.map(x=>x.number)).size!==members.length)throw new Error('본인 또는 같은 친구를 중복 입력할 수 없습니다.');
 return members;
}
async function refreshReservations(){const data=await api('availability');reservations=new Set(data.reserved)}
next2=function(){task(async()=>{membersFromForm();await refreshReservations();show(3)})};
renderHolidayHits=function(){originalRenderHoliday();document.querySelectorAll('.holiday-row').forEach(button=>{
 const busy=reservations.has(hkey({date:button.dataset.date,name:button.dataset.name}));button.disabled=busy;button.classList.toggle('reserved',busy);
 if(busy){button.querySelector('.mark').textContent='';const badge=document.createElement('small');badge.textContent='신청 완료';button.querySelector('.title').appendChild(badge)}
})};
next3=function(){if(!holiday)return toast('기념일을 하나 선택해주세요.');if(reservations.has(hkey(holiday)))return toast('이미 신청된 기념일입니다. 다른 기념일을 선택해주세요.');show(4)};
function loadTeam(team){
 setMode(team.members.length===1?'solo':'team');
 const friends=team.members.filter(x=>x.number!==actor.number);
 document.querySelectorAll('.friendNo').forEach((x,i)=>x.value=friends[i]?friends[i].number+'번':'');
 document.querySelectorAll('.friendName').forEach((x,i)=>x.value=friends[i]?.name||'');
 holiday={...team.holiday};makeType=team.makeType;
 document.querySelectorAll('#p4 .choice').forEach(x=>{const selected=x.dataset.type===makeType;x.classList.toggle('selected',selected);x.setAttribute('aria-pressed',String(selected))});
}
renderSummary=function(){
 originalSummary();
 document.getElementById('teamStatus').textContent=currentTeam?(viewOnly?'신청 완료 · '+currentTeam.id:'신청 수정 중 · 저장 전까지 기존 신청 유지'):'신청 내용을 확인해주세요.';
 const submit=document.querySelector('#p5 .submit');submit.disabled=viewOnly;submit.textContent=viewOnly?'신청 완료':currentTeam?'수정 저장':'신청하기';submit.setAttribute('aria-label',submit.textContent);
 document.getElementById('editTeam').hidden=!viewOnly;document.getElementById('cancelTeam').hidden=!currentTeam;
};
submitDemo=function(){if(viewOnly)return;task(async()=>{
 const draft={members:membersFromForm(),holiday,makeType};const signature=JSON.stringify(draft);
 if(!pendingSave||pendingSave.signature!==signature)pendingSave={signature,requestId:crypto.randomUUID()};
 try{
 const data=await api('save',{draft,teamId:currentTeam?.id||null,version:currentTeam?.version||0,requestId:pendingSave.requestId});
 currentTeam=data.team;pendingSave=null;loadTeam(currentTeam);viewOnly=true;show(5);toast('신청이 저장되었습니다.');
 }catch(e){if(e.code==='HOLIDAY_RESERVED'){await refreshReservations();show(3)}if(e.code==='STALE'){const latest=await api('lookup');currentTeam=latest.team;if(currentTeam){loadTeam(currentTeam);viewOnly=true;show(5)}else show(1)}throw e}
})};
function editTeam(){if(!currentTeam)return;viewOnly=false;loadTeam(currentTeam);show(2)}
function cancelTeam(){if(!currentTeam||!confirm('팀 전체 신청을 취소할까요? 모든 팀원이 미신청 상태로 돌아가고 기념일 예약이 해제됩니다.'))return;task(async()=>{await api('cancel',{teamId:currentTeam.id,version:currentTeam.version});currentTeam=null;pendingSave=null;viewOnly=false;holiday=null;show(1);toast('팀 전체 신청을 취소했습니다.')})}
function logout(){currentTeam=null;actor=null;pendingSave=null;viewOnly=false;show(1);setStatus('')}
document.querySelector('#p5 .back').onclick=()=>{if(viewOnly)logout();else show(4)};
if(!window.APP_CONFIG?.apiUrl)setStatus('서버 연결 준비 중입니다. 배포 후 이용할 수 있습니다.');
