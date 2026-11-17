(()=> {
'use strict';
const $=(s,r=document)=>r.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(n)||0);
const key=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const plus=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x}, monday=d=>{const x=new Date(d);x.setDate(x.getDate()-(x.getDay()+6)%7);x.setHours(0,0,0,0);return x}, uid=()=>crypto.randomUUID?.()||String(Date.now()+Math.random());
const areas={studies:'Estudio',projects:'Proyectos / Emprendimiento',clothing:'Ropa / VOIDE'};
const keys={calendar:'room-calendar-v1',money:'room-money-v1'};
let data={calendar:[],money:{}},logged=false,activeUserId=null,week=monday(new Date()),view='calendar',area='projects',editing=null,calendarFilter='all',pending=new Set(),syncBusy=false,storageBackend='local';
const localKey=base=>activeUserId?base+'::'+activeUserId:base;
const css=[
'#rf-launch{position:fixed;z-index:8;right:20px;top:78px;display:flex;gap:8px}.rf-open{background:#111d31ed;color:#edf3ff;border:1px solid #526581;border-radius:11px;padding:10px 14px;font-weight:800;cursor:pointer}',
'#rf-overlay,#rf-event-modal{position:fixed;inset:0;z-index:30;background:#020713d9;backdrop-filter:blur(9px);display:none;align-items:center;justify-content:center;padding:16px;color:#edf3ff}#rf-overlay.on,#rf-event-modal.on{display:flex}',
'.rf-window{width:min(1150px,100%);height:min(850px,calc(100dvh - 32px));background:#101a2c;border:1px solid #405575;border-radius:20px;display:flex;flex-direction:column;overflow:hidden}.rf-head,.rf-tools{padding:15px 20px;border-bottom:1px solid #34445f;display:flex;gap:9px;align-items:center;flex-wrap:wrap}.rf-head{justify-content:space-between}.rf-head h2{margin:0;font-size:23px}.rf-muted{color:#9eacc4;font-size:11px}.rf-tools button,.rf-tools select,.rf-form button{background:#1a2941;color:#edf3ff;border:1px solid #405575;border-radius:9px;padding:9px 12px;cursor:pointer}.rf-tools .primary,.rf-form .primary{background:#c8f6ff;color:#071521;font-weight:900}.rf-spacer{flex:1}.rf-body{padding:14px 18px;overflow:auto;flex:1}.rf-week{display:grid;grid-template-columns:48px repeat(7,minmax(95px,1fr));min-width:720px}.rf-day{position:sticky;top:0;background:#101a2c;z-index:2;text-align:center;padding:9px 2px;border-bottom:1px solid #40516e;font-size:11px}.rf-hour{height:56px;color:#91a2bd;font-size:10px;border-bottom:1px solid #293a55;padding:4px}.rf-cell{height:56px;position:relative;border-left:1px solid #293a55;border-bottom:1px solid #293a55;cursor:crosshair}.rf-cell:hover{background:#1a2a43}.rf-event{position:absolute;left:2px;right:2px;z-index:1;overflow:hidden;text-align:left;border:0;border-left:3px solid #55e6ff;border-radius:5px;background:#24506a;color:white;padding:4px;font-size:10px;cursor:pointer}.rf-event b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rf-card{background:#17263e;border:1px solid #344965;border-radius:14px;padding:15px}.rf-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.rf-card small{color:#a6b5ca;font-size:10px}.rf-card strong{display:block;font-size:24px;margin-top:7px}.rf-pos{color:#6fe0b0}.rf-neg{color:#ff9b9b}.rf-columns{display:grid;grid-template-columns:1.2fr .8fr;gap:12px;margin-top:12px}.rf-bars{height:130px;display:flex;align-items:end;gap:8px}.rf-barcol{flex:1;text-align:center;font-size:9px;color:#9eacc4}.rf-bar{background:linear-gradient(#55e6ff,#897cff);border-radius:5px 5px 0 0;min-height:2px;margin:5px auto;width:65%;max-width:30px}.rf-form{width:min(450px,100%);background:#142139;border:1px solid #526581;border-radius:17px;padding:19px;display:grid;gap:10px}.rf-form h3{margin:0}.rf-form label{display:grid;gap:5px;font-size:11px;color:#b8c7dc}.rf-form input,.rf-form select,.rf-form textarea{width:100%;background:#091323;border:1px solid #3c506d;color:white;border-radius:8px;padding:10px}.rf-form-actions{display:flex;justify-content:flex-end;gap:8px}.rf-area{border:1px solid #3a506e;background:#13233a;border-radius:12px;padding:11px;margin:12px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.rf-area button{background:#1d3650;border:1px solid #526581;color:#edf3ff;border-radius:8px;padding:7px 10px;cursor:pointer}.rf-tx{display:flex;justify-content:space-between;border-bottom:1px solid #30415b;padding:9px 0;font-size:12px}.rf-sync{display:block;color:#91a6c5;font-size:10px;margin-top:3px}.rf-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:10px;color:#a6b5ca;margin-top:8px}.rf-legend span{display:inline-flex;align-items:center;gap:5px}.rf-dot{width:8px;height:8px;border-radius:2px;display:inline-block}.rf-bar-pair{height:112px;display:flex;align-items:end;justify-content:center;gap:3px}.rf-bar-income,.rf-bar-expense{width:9px;min-height:2px;border-radius:4px 4px 0 0}.rf-bar-income{background:#6fe0b0}.rf-bar-expense{background:#ff9b9b}',
'@media(max-width:700px){#rf-launch{top:auto;bottom:60px;right:10px;flex-direction:column}.rf-open{padding:9px 11px}.rf-window{height:calc(100dvh - 12px);border-radius:15px}.rf-grid{grid-template-columns:1fr 1fr}.rf-columns{grid-template-columns:1fr}.rf-body{padding:10px}}'
].join('');
const st=document.createElement('style');st.textContent=css;document.head.append(st);
const launch=document.createElement('div');launch.id='rf-launch';launch.innerHTML='<button class="rf-open" data-view="calendar">▦ Calendario</button><button class="rf-open" data-view="money">€ Economía</button>';document.body.append(launch);
const overlay=document.createElement('div');overlay.id='rf-overlay';overlay.innerHTML='<section class="rf-window"><header class="rf-head"><div><h2 id="rf-title">Calendario</h2><span class="rf-muted" id="rf-sub"></span><span class="rf-sync" id="rf-sync" aria-live="polite"></span></div><button class="rf-open" data-close>×</button></header><nav class="rf-tools" id="rf-tools"></nav><main class="rf-body" id="rf-body"></main></section>';document.body.append(overlay);
const modal=document.createElement('div');modal.id='rf-event-modal';modal.innerHTML='<form class="rf-form" id="rf-event-form"><h3 id="rf-form-title">Nuevo evento</h3><label>Título<input name="title" required maxlength="100"></label><label>Fecha<input name="date" type="date" required></label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label>Desde<input name="start" type="time" value="16:00" required></label><label>Hasta<input name="end" type="time" value="17:00" required></label></div><label>Área<select name="category"><option value="studies">Estudio</option><option value="projects">Proyectos</option><option value="clothing">Ropa / VOIDE</option><option value="personal">Personal</option></select></label><label>Notas<textarea name="notes"></textarea></label><div class="rf-form-actions"><button type="button" data-cancel>Cancelar</button><button class="primary">Guardar</button></div></form>';document.body.append(modal);
const body=$('#rf-body',overlay),tools=$('#rf-tools',overlay),form=$('#rf-event-form');
function local(){try{return {calendar:JSON.parse(localStorage.getItem(localKey(keys.calendar))||'[]'),money:JSON.parse(localStorage.getItem(localKey(keys.money))||'{}')}}catch{return {calendar:[],money:{}}}}
function writeLocal(){localStorage.setItem(localKey(keys.calendar),JSON.stringify(data.calendar));localStorage.setItem(localKey(keys.money),JSON.stringify(data.money))}
function syncStatus(message){const el=$('#rf-sync');if(el)el.textContent=message}
async function syncPending(){
 if(!logged||syncBusy||!pending.size)return;
 syncBusy=true;
 try{
  for(const which of Array.from(pending)){
   const r=await fetch('/api/study-data/'+which,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:data[which]})});
   if(!r.ok)throw Error('sync');
   pending.delete(which);
  }
  syncStatus('Guardado · '+(storageBackend==='postgresql'?'PostgreSQL':storageBackend==='json'?'servidor JSON':'tu cuenta'));
 }catch{syncStatus('Pendiente de sincronizar · se conserva una copia local')}
 finally{syncBusy=false}
}
function save(which){
 try{writeLocal()}catch(e){console.warn('No se pudo guardar localmente',e)}
 if(!logged){syncStatus('Guardado en este dispositivo');return}
 pending.add(which);syncPending();
}
async function init(){
 pending.clear();storageBackend='local';
 let me=null;
 try{const r=await fetch('/api/auth/me',{credentials:'same-origin'});if(r.ok)me=await r.json()}catch{}
 logged=!!me?.user;activeUserId=logged?String(me.user.id):null;data=local();
 if(logged){
  try{
   const r=await fetch('/api/study-data',{credentials:'same-origin'});
   if(!r.ok)throw Error('No se pudo cargar la cuenta');
   const remote=(await r.json()).data||{},cached=data;
   if(Array.isArray(remote.calendar))data.calendar=remote.calendar;
   else if(Array.isArray(cached.calendar)&&cached.calendar.length)pending.add('calendar');
   if(remote.money&&typeof remote.money==='object'&&!Array.isArray(remote.money))data.money=remote.money;
   else if(cached.money&&Object.keys(cached.money).length)pending.add('money');
   writeLocal();
   try{
    const status=await fetch('/api/storage/status',{credentials:'same-origin'});
    if(status.ok){const st=await status.json();storageBackend=st.backend==='postgresql'&&st.connected?'postgresql':st.backend==='json'?'json':'unknown'}
    else storageBackend='unknown';
   }catch{storageBackend='unknown'}
   syncStatus(storageBackend==='postgresql'?'PostgreSQL conectado':storageBackend==='json'?'Servidor JSON activo':'Almacenamiento sin verificar');
   if(pending.size)syncPending();
  }catch{storageBackend='unknown';syncStatus('Cuenta detectada · sincronización pendiente')}
 }else{writeLocal();syncStatus('Guardado en este dispositivo')}
 refreshArea();
}
window.addEventListener('online',syncPending);
function open(v){view=v;overlay.classList.add('on');render()}function close(){overlay.classList.remove('on');modal.classList.remove('on')}
function render(){if(view==='calendar')calendar();else finances()}
function calendar(){
 const end=plus(week,6);
 $('#rf-title').textContent='Calendario semanal';
 $('#rf-sub').textContent=week.toLocaleDateString('es-ES',{day:'numeric',month:'short'})+' – '+end.toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});
 tools.innerHTML='<button data-week="-1">‹</button><button data-today>Hoy</button><button data-week="1">›</button><label class="rf-muted">Ver <select id="rf-calendar-filter" aria-label="Filtrar calendario"><option value="all">Todas</option><option value="studies">Estudio</option><option value="projects">Proyectos</option><option value="clothing">Ropa / VOIDE</option><option value="personal">Personal</option></select></label><span class="rf-spacer"></span><button class="primary" data-new>＋ Nuevo evento</button>';
 const filter=$('#rf-calendar-filter');if(filter)filter.value=calendarFilter;
 const days=Array.from({length:7},(_,i)=>plus(week,i));
 let h='<div class="rf-week"><div class="rf-day">Hora</div>'+days.map(d=>'<div class="rf-day">'+d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric'})+'</div>').join('');
 for(let hour=0;hour<=23;hour++){
  h+='<div class="rf-hour">'+String(hour).padStart(2,'0')+':00</div>';
  for(const d of days){
   const k=key(d);h+='<div class="rf-cell" data-date="'+k+'" data-hour="'+hour+'">';
   for(const ev of data.calendar.filter(x=>x.date===k&&(calendarFilter==='all'||x.category===calendarFilter))){
    const [sh,sm]=ev.start.split(':').map(Number),[eh,em]=ev.end.split(':').map(Number);
    const duration=Math.max(20,((eh*60+em)-(sh*60+sm))/60*56);
    if(sh===hour)h+='<button class="rf-event" data-event="'+esc(ev.id)+'" style="top:'+(sm/60*56)+'px;height:'+Math.max(20,Math.min(duration,(24-hour)*56-sm/60*56))+'px;background:'+esc(ev.color)+';border-color:'+esc(ev.color)+'"><b>'+esc(ev.title)+'</b>'+esc(ev.start)+'–'+esc(ev.end)+'</button>';
   }
   h+='</div>';
  }
 }
 body.innerHTML=h+'</div>';
}
function eventForm(ev=null,date=key(new Date()),hour=16){editing=ev?.id||null;form.reset();$('#rf-form-title').textContent=ev?'Editar evento':'Nuevo evento';form.elements.title.value=ev?.title||'';form.elements.date.value=ev?.date||date;form.elements.start.value=ev?.start||String(hour).padStart(2,'0')+':00';form.elements.end.value=ev?.end||(hour===23?'23:59':String(hour+1).padStart(2,'0')+':00');form.elements.category.value=ev?.category||(calendarFilter==='all'?'studies':calendarFilter);form.elements.notes.value=ev?.notes||'';let old=$('[data-delete]',form);old?.remove();if(ev){const b=document.createElement('button');b.type='button';b.dataset.delete='1';b.textContent='Eliminar';b.addEventListener('click',()=>{data.calendar=data.calendar.filter(x=>x.id!==editing);save('calendar');modal.classList.remove('on');calendar()});$('.rf-form-actions',form).prepend(b)}modal.classList.add('on')}
function finances(){
 const a=areas[area];
 $('#rf-title').textContent='Economía';
 $('#rf-sub').textContent='Balances, movimientos y evolución por apartado';
 tools.innerHTML='<label class="rf-muted">Área <select id="rf-area">'+Object.entries(areas).map(([k,v])=>'<option value="'+k+'" '+(k===area?'selected':'')+'>'+v+'</option>').join('')+'</select></label><span class="rf-spacer"></span>';
 const balanceOf=k=>{const m=data.money[k]||{},tx=Array.isArray(m.transactions)?m.transactions:[];return (Number(m.opening)||0)+tx.reduce((sum,x)=>sum+(Number(x.amount)||0),0)};
 const m=data.money[area]||{opening:0,transactions:[]},tx=Array.isArray(m.transactions)?m.transactions:[],balance=balanceOf(area);
 const income=tx.filter(x=>Number(x.amount)>0).reduce((sum,x)=>sum+Number(x.amount),0);
 const expense=Math.abs(tx.filter(x=>Number(x.amount)<0).reduce((sum,x)=>sum+Number(x.amount),0));
 const days=Array.from({length:7},(_,i)=>plus(new Date(),i-6));
 const daily=days.map(d=>{const day=tx.filter(x=>x.date===key(d));return {income:day.filter(x=>Number(x.amount)>0).reduce((sum,x)=>sum+Number(x.amount),0),expense:Math.abs(day.filter(x=>Number(x.amount)<0).reduce((sum,x)=>sum+Number(x.amount),0))}});
 const max=Math.max(1,...daily.flatMap(x=>[x.income,x.expense]));
 const balances=Object.entries(areas).map(([k,label])=>'<div class="rf-card"><small>'+label.toUpperCase()+'</small><strong>'+fmt(balanceOf(k))+'</strong></div>').join('');
 const bars=daily.map((v,i)=>'<div class="rf-barcol"><div class="rf-bar-pair"><div class="rf-bar-income" title="Ingresos '+fmt(v.income)+'" style="height:'+Math.max(2,v.income/max*100)+'%"></div><div class="rf-bar-expense" title="Gastos '+fmt(v.expense)+'" style="height:'+Math.max(2,v.expense/max*100)+'%"></div></div><small>'+days[i].toLocaleDateString('es-ES',{weekday:'short'})+'</small></div>').join('');
 const history=tx.length?tx.slice().sort((x,y)=>(Number(y.createdAt)||0)-(Number(x.createdAt)||0)).map(x=>'<div class="rf-tx"><span>'+esc(x.description)+'<br><small>'+esc(x.date)+'</small></span><b class="'+(Number(x.amount)>=0?'rf-pos':'rf-neg')+'">'+(Number(x.amount)>=0?'+':'')+fmt(x.amount)+'</b></div>').join(''):'<p class="rf-muted">Aún no hay movimientos.</p>';
 body.innerHTML='<section class="rf-card"><b>Saldos por apartado</b><div class="rf-grid" style="margin-top:10px">'+balances+'</div></section><div class="rf-grid" style="margin-top:12px"><div class="rf-card"><small>SALDO ACTUAL · '+a.toUpperCase()+'</small><strong>'+fmt(balance)+'</strong></div><div class="rf-card"><small>INGRESOS ACUMULADOS</small><strong class="rf-pos">'+fmt(income)+'</strong></div><div class="rf-card"><small>GASTOS ACUMULADOS</small><strong class="rf-neg">'+fmt(expense)+'</strong></div></div><div class="rf-columns"><div class="rf-card"><b>Ingresos y gastos · últimos 7 días</b><div class="rf-bars">'+bars+'</div><div class="rf-legend"><span><i class="rf-dot" style="background:#6fe0b0"></i>Ingresos</span><span><i class="rf-dot" style="background:#ff9b9b"></i>Gastos</span></div></div><div class="rf-card"><b>Nuevo movimiento</b><div style="display:grid;gap:8px;margin-top:10px"><input id="rf-amount" type="number" min=".01" step=".01" placeholder="Cantidad (€)"><select id="rf-kind"><option value="income">Sumar ingreso (+)</option><option value="expense">Restar gasto (−)</option></select><input id="rf-desc" maxlength="80" placeholder="Concepto"><input id="rf-date" type="date" value="'+key(new Date())+'"><button class="rf-open" data-save-money>Guardar</button></div></div></div><div class="rf-card" style="margin-top:12px"><b>Historial de movimientos · '+a+'</b>'+history+'</div>';
}
function addMoney(){const n=Number($('#rf-amount').value),desc=$('#rf-desc').value.trim(),date=$('#rf-date').value;if(!(n>0)||!desc||!date){alert('Introduce cantidad, concepto y fecha.');return}const m=data.money[area]||(data.money[area]={opening:0,transactions:[]});m.transactions=Array.isArray(m.transactions)?m.transactions:[];m.transactions.push({id:uid(),amount:$('#rf-kind').value==='income'?n:-n,description:desc,date,createdAt:Date.now()});save('money');finances();refreshArea()}
tools.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.week){week=plus(week,Number(b.dataset.week)*7);calendar()}if(b.hasAttribute('data-today')){week=monday(new Date());calendar()}if(b.hasAttribute('data-new'))eventForm();if(b.hasAttribute('data-save-money'))addMoney()});
tools.addEventListener('change',e=>{if(e.target.id==='rf-area'){area=e.target.value;finances()}if(e.target.id==='rf-calendar-filter'){calendarFilter=e.target.value;calendar()}});
body.addEventListener('click',e=>{const ev=e.target.closest('[data-event]');if(ev){const x=data.calendar.find(v=>v.id===ev.dataset.event);if(x)eventForm(x);return}const c=e.target.closest('.rf-cell');if(c)eventForm(null,c.dataset.date,Number(c.dataset.hour))});
form.addEventListener('submit',e=>{e.preventDefault();const v={id:editing||uid(),title:form.elements.title.value.trim(),date:form.elements.date.value,start:form.elements.start.value,end:form.elements.end.value,category:form.elements.category.value,notes:form.elements.notes.value.trim()};if(!v.title||!v.date||v.end<=v.start){alert('La hora final debe ser posterior a la inicial.');return}v.color={studies:'#24617a',projects:'#59418a',clothing:'#80502f',personal:'#285d50'}[v.category];const i=data.calendar.findIndex(x=>x.id===v.id);if(i<0)data.calendar.push(v);else data.calendar[i]=v;save('calendar');modal.classList.remove('on');calendar()});
modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-cancel]'))modal.classList.remove('on')});
launch.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)open(b.dataset.view)});overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-close]'))close()});document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
function currentArea(){const t=($('#pt')?.textContent||'').toLowerCase();if(t.includes('estudio'))return'studies';if(t.includes('proyecto')||t.includes('emprendimiento'))return'projects';if(t.includes('ropa')||t.includes('voide'))return'clothing';return null}
function refreshArea(){
 const panel=$('#ov'),head=$('header',$('#pn'));if(!head)return;
 let w=$('#rf-area-balance'),a=currentArea();if(!a){w?.remove();return}
 if(!w){w=document.createElement('div');w.id='rf-area-balance';w.className='rf-area';head.after(w)}
 const m=data.money[a]||{transactions:[]},balance=(Number(m.opening)||0)+(Array.isArray(m.transactions)?m.transactions:[]).reduce((sum,x)=>sum+(Number(x.amount)||0),0);
 w.innerHTML='<div><small>SALDO · '+areas[a].toUpperCase()+'</small><br><b>'+fmt(balance)+'</b></div><span class="rf-spacer"></span>'+(a==='studies'?'<button data-study-calendar>Calendario de estudio</button>':'')+'<button data-add="income">＋ Sumar</button><button data-add="expense">− Restar</button><button data-view-money>Movimientos</button>';
 w.querySelector('[data-add="income"]').onclick=()=>{area=a;open('money');setTimeout(()=>$('#rf-kind').value='income',40)};
 w.querySelector('[data-add="expense"]').onclick=()=>{area=a;open('money');setTimeout(()=>$('#rf-kind').value='expense',40)};
 w.querySelector('[data-view-money]').onclick=()=>{area=a;open('money')};
 const studyCalendar=w.querySelector('[data-study-calendar]');if(studyCalendar)studyCalendar.onclick=()=>{calendarFilter='studies';open('calendar')};
}
let lastRoomTitle='';const handleRoomTitle=()=>{refreshArea();const title=($('#pt')?.textContent||'').toLowerCase();if(title!==lastRoomTitle){lastRoomTitle=title;if(title.includes('calendario semanal'))open('calendar');}};const titleNode=$('#pt');if(titleNode)new MutationObserver(handleRoomTitle).observe(titleNode,{childList:true,characterData:true});const panel=$('#ov');if(panel)new MutationObserver(refreshArea).observe(panel,{attributes:true,attributeFilter:['class','hidden']});
init();
})();