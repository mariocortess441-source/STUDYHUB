(()=>{'use strict';
const $=s=>document.querySelector(s),key=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),plus=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x},safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows=[],logged=false,activeUserId=null,pendingSync=false,syncMessage='Guardado en este dispositivo';
const storageKey=()=>activeUserId?'room-sleep-v1::'+activeUserId:'room-sleep-v1';
function local(){try{return JSON.parse(localStorage.getItem(storageKey())||'[]')}catch{return[]}}
function writeLocal(){localStorage.setItem(storageKey(),JSON.stringify(rows))}
function syncStatus(message){syncMessage=message;const el=$('#rest-sync-status');if(el)el.textContent=message}
async function syncSleep(){
 if(!logged||!pendingSync)return;
 try{
  const r=await fetch('/api/study-data/sleep',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:rows})});
  if(!r.ok)throw Error('sync');
  pendingSync=false;syncStatus('Guardado en tu cuenta');
 }catch{syncStatus('Pendiente de sincronizar · copia local conservada')}
}
function save(){try{writeLocal()}catch(e){console.warn('No se pudo guardar el descanso localmente',e)}if(logged){pendingSync=true;syncSleep()}else syncStatus('Guardado en este dispositivo')}
async function load(){
 let me=null;
 try{const r=await fetch('/api/auth/me',{credentials:'same-origin'});if(r.ok)me=await r.json()}catch{}
 logged=!!me?.user;activeUserId=logged?String(me.user.id):null;rows=local();
 if(logged){
  try{
   const r=await fetch('/api/study-data',{credentials:'same-origin'});if(!r.ok)throw Error('load');
   const remote=(await r.json()).data||{};
   if(Array.isArray(remote.sleep))rows=remote.sleep;
   else if(rows.length)pendingSync=true;
   writeLocal();
   syncStatus('Datos de descanso de tu cuenta cargados');
   if(pendingSync)syncSleep();
  }catch{syncStatus('Cuenta detectada · datos locales conservados')}
 }else{writeLocal();syncStatus('Guardado en este dispositivo')}
}
window.addEventListener('online',syncSleep);
const css='#rest-launch{background:#111d31ed;color:#edf3ff;border:1px solid #526581;border-radius:11px;padding:10px 13px;font-weight:800;cursor:pointer}#rest-overlay{position:fixed;inset:0;z-index:60;background:#020713df;backdrop-filter:blur(9px);display:none;align-items:center;justify-content:center;padding:16px}#rest-overlay.on{display:flex}.rest-window{width:min(920px,100%);max-height:94dvh;overflow:auto;background:#101a2c;color:#edf3ff;border:1px solid #405575;border-radius:18px;padding:20px}.rest-head{display:flex;justify-content:space-between;align-items:center}.rest-head h2{margin:0;font-size:25px}.rest-sync{display:block;font-size:10px;margin-top:4px;color:#91a6c5}.rest-close,.rest-btn{background:#1a2941;color:#edf3ff;border:1px solid #405575;border-radius:9px;padding:9px 12px;cursor:pointer}.rest-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.rest-card{background:#17263e;border:1px solid #344965;border-radius:12px;padding:14px}.rest-card small{color:#a6b5ca}.rest-card strong{display:block;font-size:24px;margin-top:5px}.rest-chart{height:190px;display:flex;align-items:end;gap:8px;padding:12px 4px 20px;border-bottom:1px solid #40516c;overflow-x:auto}.rest-col{height:100%;flex:0 0 38px;display:flex;flex-direction:column;justify-content:end;align-items:center;gap:5px}.rest-track{height:125px;width:28px;display:flex;align-items:end}.rest-bar{width:100%;min-height:2px;background:linear-gradient(#8b82f0,#4cc9df);border-radius:6px 6px 0 0}.rest-col small{font-size:10px;color:#a6b5ca}.rest-value{font-size:9px;color:#d6e3f5;font-weight:700;white-space:nowrap}.rest-form{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:14px 0;padding:14px;background:#17263e;border:1px solid #344965;border-radius:12px}.rest-form label{display:grid;gap:5px;color:#a6b5ca;font-size:11px}.rest-form input{min-width:0;background:#091323;border:1px solid #3c506d;color:white;border-radius:8px;padding:10px}.rest-history{margin-top:12px}.rest-row{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #30415b;padding:10px 2px;font-size:12px}.rest-muted{color:#91a2bd;font-size:11px}.rest-empty{padding:22px;text-align:center;border:1px dashed #40516c;border-radius:10px;color:#91a2bd;font-size:12px}@media(max-width:650px){#rest-overlay{padding:0;align-items:flex-end}.rest-window{width:100%;max-height:95dvh;border-radius:18px 18px 0 0;padding:16px 12px calc(16px + env(safe-area-inset-bottom))}.rest-grid{grid-template-columns:1fr 1fr}.rest-form{grid-template-columns:1fr 1fr}}';
const st=document.createElement('style');st.textContent=css;document.head.append(st);
const ov=document.createElement('div');ov.id='rest-overlay';ov.innerHTML='<section class="rest-window" role="dialog" aria-modal="true"><header class="rest-head"><div><h2>Descanso</h2><span class="rest-muted">Tu registro personal y evolución semanal</span><span class="rest-sync" id="rest-sync-status" aria-live="polite"></span></div><button class="rest-close">×</button></header><div id="rest-body"></div></section>';document.body.append(ov);
function close(){ov.classList.remove('on')}function open(){ov.classList.add('on');render()}
function render(){
 const days=Array.from({length:7},(_,i)=>plus(new Date(),i-6));
 const vals=days.map(d=>rows.find(x=>x.date===key(d))),valid=vals.filter(Boolean);
 const avg=valid.length?valid.reduce((sum,x)=>sum+Number(x.hours||0),0)/valid.length:0;
 const total=valid.reduce((sum,x)=>sum+Number(x.hours||0),0);
 const chartDays=Array.from({length:14},(_,i)=>plus(new Date(),i-13));
 const chartRows=chartDays.map(d=>rows.find(x=>x.date===key(d)));
 const maxHours=Math.max(8,...chartRows.map(x=>Number(x?.hours)||0));
 let h='<div class="rest-grid"><div class="rest-card"><small>MEDIA REGISTRADA · 7 DÍAS</small><strong>'+avg.toFixed(1)+' h</strong></div><div class="rest-card"><small>TOTAL SEMANAL</small><strong>'+total.toFixed(1)+' h</strong></div><div class="rest-card"><small>DÍAS REGISTRADOS</small><strong>'+valid.length+'/7</strong></div></div><article class="rest-card"><b>Evolución · últimos 14 días</b><div class="rest-chart" role="img" aria-label="Gráfica de horas registradas durante los últimos catorce días">';
 chartDays.forEach((d,i)=>{
  const row=chartRows[i],hours=Number(row?.hours)||0;
  h+='<div class="rest-col"><strong class="rest-value">'+(row?hours.toFixed(1)+' h':'—')+'</strong><div class="rest-track"><div class="rest-bar" style="height:'+Math.max(2,hours/maxHours*100)+'%"></div></div><small>'+d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric'})+'</small></div>';
 });
 h+='</div><p class="rest-muted">Cada barra representa un registro guardado; los días vacíos no se interpretan como cero horas.</p></article><form class="rest-form" id="rest-form"><label>Fecha<input name="date" type="date" value="'+key(new Date())+'" required></label><label>Horas descansadas<input name="hours" type="number" min="0" max="24" step=".25" required placeholder="8"></label><label>Nota opcional<input name="note" maxlength="100" placeholder="Nota personal"></label><button class="rest-btn" type="submit">Guardar registro</button></form><article class="rest-card rest-history"><b>Historial</b>';
 if(!rows.length)h+='<div class="rest-empty">Todavía no hay registros. Añade tus horas para ver tu evolución.</div>';
 rows.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20).forEach(x=>h+='<div class="rest-row"><span>'+safe(x.date)+' · '+safe(x.note||'Registro')+'</span><b>'+Number(x.hours).toFixed(1)+' h</b></div>');
 h+='</article>';$('#rest-body').innerHTML=h;syncStatus(syncMessage);
 $('#rest-form').addEventListener('submit',e=>{
  e.preventDefault();const f=e.currentTarget,d=f.elements.date.value,n=Number(f.elements.hours.value);
  if(!d||!Number.isFinite(n)||n<0||n>24)return;
  rows=rows.filter(x=>x.date!==d);rows.push({date:d,hours:n,note:f.elements.note.value.trim()});save();render();
 });
}
const launch=document.createElement('button');launch.id='rest-launch';launch.textContent='Descanso';launch.onclick=open;
function addLaunch(){const bar=$('#rf-launch')||$('#sh-tools');if(bar&&!$('#rest-launch'))bar.append(launch)}
function addQuick(){const title=($('#pt')?.textContent||'').toLowerCase(),q=$('#quick');if(title.includes('descanso y planes')&&q&&!q.querySelector('[data-rest-open]')){const b=document.createElement('button');b.className='quick';b.dataset.restOpen='1';b.textContent='＋ Abrir panel de descanso';q.prepend(b)}}
document.addEventListener('click',e=>{if(e.target.closest('.rest-close')||e.target===ov)close();if(e.target.closest('[data-rest-open]'))open()});document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
new MutationObserver(()=>{addLaunch();addQuick()}).observe(document.body,{childList:true,subtree:true,characterData:true});
load().then(()=>{addLaunch();addQuick()});
})();