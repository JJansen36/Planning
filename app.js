// app.js
const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY, admin: ADMIN_PASSWORD } = window.__CONF__;
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (s)=>document.querySelector(s);
function el(t,c,txt){const n=document.createElement(t); if(c) n.className=c; if(txt!=null) n.textContent=txt; return n;}
function fmtDate(d){return d.toLocaleDateString('nl-NL',{weekday:'short', day:'numeric', month:'short'});}
function isoDateStr(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function startOfWeek(date){const d=new Date(date);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(0,0,0,0);return d;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function getWeekNumber(d){ const date=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dayNum=date.getUTCDay()||7; date.setUTCDate(date.getUTCDate()+4-dayNum); const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1)); const weekNo=Math.ceil((((date-yearStart)/86400000)+1)/7); return String(weekNo).padStart(2,'0');}
function isAdmin(){ return ($('#adminPwd').value || '') === ADMIN_PASSWORD; }

function toMin(hm){const [h,m]=(hm||'00:00').split(':').map(v=>parseInt(v,10)||0);return h*60+m;}
function overlap(s1,e1,s2,e2){const a1=toMin(s1),a2=toMin(e1),b1=toMin(s2),b2=toMin(e2);return a1<b2&&b1<a2;}
function inRange(d,s,e){return d>=s&&d<=e;}
function eachIso(s,e){const out=[];const S=new Date(s+'T00:00'),E=new Date(e+'T00:00');for(let d=new Date(S);d<=E;d.setDate(d.getDate()+1))out.push(isoDateStr(d));return out;}

let currentMonday = startOfWeek(new Date());
let editorOpen=false;
let cache={employees:[],projects:[],assignments:[],reservations:[]};

async function fetchAll(){
  const [emp,proj,asg,res]=await Promise.all([
    sb.from('employees').select('*').order('name',{ascending:true}),
    sb.from('projects').select('*').order('number',{ascending:true}),
    sb.from('assignments').select('*'),
    sb.from('vehicle_reservations').select('*')
  ]);
  if(emp.error||proj.error||asg.error||res.error) throw (emp.error||proj.error||asg.error||res.error);
  return {employees:emp.data,projects:proj.data,assignments:asg.data,reservations:res.data};
}
async function reload(){ try{ cache=await fetchAll(); render(); }catch(e){ console.error(e); alert('Laden mislukt (controleer Supabase policies/schema)'); } }

async function addEmployee(name){ if(!isAdmin()) return alert('Wachtwoord vereist'); const {error}=await sb.from('employees').insert({name}); if(error) alert(error.message); else reload(); }
async function addProject(number,name,section){ if(!isAdmin()) return alert('Wachtwoord vereist'); const {error}=await sb.from('projects').insert({number,name,section}); if(error) alert(error.message); else reload(); }
async function deleteAssignment(id){ if(!isAdmin()) return alert('Wachtwoord vereist'); await sb.from('assignments').delete().eq('id',id); }

function vehicleConflicts(rec){
  if(rec.type!=='montage'||!rec.vehicle||rec.vehicle==='nvt') return [];
  const out=[]; const days=eachIso(rec.start_date,rec.end_date);
  for(const d of days){
    for(const a of cache.assignments){
      if(a.id&&rec.id&&a.id===rec.id) continue;
      if(a.type!=='montage') continue;
      if(!a.vehicle||a.vehicle==='nvt'||a.vehicle!==rec.vehicle) continue;
      if(!inRange(d,a.start_date,a.end_date)) continue;
      if(overlap(rec.start_time,rec.end_time,a.start_time,a.end_time)){
        if(a.project_id===rec.project_id) continue; // toegestaan als hetzelfde project
        const emp=cache.employees.find(e=>e.id===a.employee_id);
        out.push(`${d} (taak: ${emp?emp.name:'?'} ${a.start_time}–${a.end_time})`);
      }
    }
    for(const r of cache.reservations){
      if(r.vehicle!==rec.vehicle||r.date!==d) continue;
      if(overlap(rec.start_time,rec.end_time,r.start_time,r.end_time)){
        const emp=cache.employees.find(e=>e.id===r.employee_id);
        out.push(`${d} (reservering: ${emp?emp.name:'?'} ${r.start_time}–${r.end_time})`);
      }
    }
  }
  return out;
}
async function upsertAssignment(rec){
  if(!isAdmin()) return alert('Wachtwoord vereist');
  const conflicts=vehicleConflicts(rec);
  if(conflicts.length && !confirm('Let op: '+rec.vehicle.toUpperCase()+' al ingepland:\n- '+conflicts.join('\n- ')+'\n\nToch opslaan?')) return;
  if(rec.id){ await sb.from('assignments').update(rec).eq('id',rec.id); } else { await sb.from('assignments').insert(rec); }
}

function headerRow(grid,monday){
  grid.appendChild(el('div','corner','Medewerker — Week '+getWeekNumber(monday)));
  for(let i=0;i<7;i++){ grid.appendChild(el('div','dow',fmtDate(addDays(monday,i)))); }
}
function employeeRow(grid,emp,days){
  grid.appendChild(el('div','emp',emp.name));
  for(const day of days){
    const cell=document.getElementById('cellTpl').content.cloneNode(true).firstElementChild;
    const iso=isoDateStr(day);
    const list=cache.assignments
      .filter(a=>a.employee_id===emp.id && inRange(iso,a.start_date,a.end_date))
      .sort((a,b)=>(a.start_date+a.start_time).localeCompare(b.start_date+b.start_time));

    for(const a of list){
      const proj = cache.projects.find(p=>p.id===a.project_id);
const item = document.getElementById('itemTpl').content.cloneNode(true).firstElementChild;

item.classList.add(a.type || 'productie');
if (a.urgent) item.classList.add('urgent'); // <-- toont de !
item.querySelector('.title').textContent = `${proj?proj.number:'?'} — ${proj?proj.name:''}`;

let meta = `${a.start_time}–${a.end_time}`;
if (proj && proj.section) meta += ` • ${proj.section}`;
if (a.type === 'montage' && a.vehicle && a.vehicle !== 'nvt') meta += ` • ${a.vehicle}`;
if (a.notes) meta += ` • ${a.notes}`;
item.querySelector('.meta').textContent = meta;

/* Popup openen (ook bij niet-admin: we laten hem zien, maar opslaan vereist wachtwoord) */
item.addEventListener('click', ()=> openTaskModal(a));

/* Verwijderen alleen als admin; anders verbergen we het kruisje */
const delBtn = item.querySelector('.x');
if (!isAdmin()) {
  delBtn.style.display = 'none';
} else {
  delBtn.addEventListener('click', async (e)=>{
    e.stopPropagation();
    if (!confirm('Taak verwijderen?')) return;
    await deleteAssignment(a.id);
    await reload();
  });
}

cell.querySelector('.items').appendChild(item);

      // delete-kruisje alleen zichtbaar en actief bij beheerders
      const del=item.querySelector('.x');
      del.style.display = isAdmin() ? '' : 'none';
      del.addEventListener('click',async(e)=>{e.stopPropagation(); if(!isAdmin()) return;
        if(!confirm('Taak verwijderen?'))return; await deleteAssignment(a.id); await reload();
      });

      cell.querySelector('.items').appendChild(item);
    }

    // lege cel -> taak toevoegen (alleen admin)
cell.querySelector('.dropzone').addEventListener('click', ()=>{
  // Openen mag altijd; opslaan blokkeert zonder wachtwoord
  openTaskModal({
    employee_id: emp.id,
    project_id: cache.projects[0]?.id || null,
    start_date: iso,
    end_date: iso,
    start_time: '07:00',
    end_time: '16:00',
    type: 'productie',
    vehicle: 'nvt',
    urgent: false,
    notes: null
  });
});


    grid.appendChild(cell);
  }
}

function vehicleDayInfo(iso){
  const bus=[],bak=[],busPriv=[],bakPriv=[];
  for(const a of cache.assignments){
    if(a.type!=='montage') continue; if(!a.vehicle||a.vehicle==='nvt') continue;
    if(!inRange(iso,a.start_date,a.end_date)) continue;
    const emp=cache.employees.find(e=>e.id===a.employee_id);
    const pack={name:emp?emp.name:'?',s:a.start_time,e:a.end_time,proj:a.project_id};
    if(a.vehicle==='bus') bus.push(pack); else if(a.vehicle==='bakwagen') bak.push(pack);
  }
  for(const r of cache.reservations){
    if(r.date!==iso) continue;
    const emp=cache.employees.find(e=>e.id===r.employee_id);
    const pack={name:emp?emp.name:'?',s:r.start_time,e:r.end_time};
    if(r.vehicle==='bus') busPriv.push(pack); else if(r.vehicle==='bakwagen') bakPriv.push(pack);
  }
  return {bus,bak,busPriv,bakPriv};
}
function renderVehicleBar(bar, monday){
  bar.innerHTML='';
  bar.appendChild(el('div','label','Voertuigen'));

  for(let i=0;i<7;i++){
    const iso = isoDateStr(addDays(monday,i));
    const info = vehicleDayInfo(iso);

    const cell = el('div','cell','');

    // Tooltip with details
    const tips = [];
    if(info.bus.length)     tips.push('Bus: '+info.bus.map(t=>`${t.name} ${t.s}-${t.e}`).join(', '));
    if(info.busPriv.length) tips.push('Bus privé: '+info.busPriv.map(t=>`${t.name} ${t.s}-${t.e}`).join(', '));
    if(info.bak.length)     tips.push('Bakwagen: '+info.bak.map(t=>`${t.name} ${t.s}-${t.e}`).join(', '));
    if(info.bakPriv.length) tips.push('Bakwagen privé: '+info.bakPriv.map(t=>`${t.name} ${t.s}-${t.e}`).join(', '));
    cell.title = tips.join(' | ') || '—';

    const badges = [];
    if(info.bus.length)     badges.append ? badges.append : badges.push(el('span','badge bus','Bus'));
    if(info.busPriv.length) badges.push(el('span','badge bus private','Bus (privé)'));
    if(info.bak.length)     badges.push(el('span','badge bakwagen','Bakwagen'));
    if(info.bakPriv.length) badges.push(el('span','badge bakwagen private','Bakwagen (privé)'));

    if(!badges.length){
      cell.textContent = '—';
    }else{
      badges.forEach(b=>cell.appendChild(b));
    }
    bar.appendChild(cell);
  }
}
function render(){
  const m1=currentMonday, m2=addDays(currentMonday,7);
  $('#weekLabel').textContent=`Week ${getWeekNumber(m1)} & ${getWeekNumber(m2)} — ${fmtDate(m1)} t/m ${fmtDate(addDays(m2,6))}`;
  renderWeek($('#gridWeek1'),m1,$('#vehWeek1'));
  renderWeek($('#gridWeek2'),m2,$('#vehWeek2'));
  $('#editorPanel').hidden=!editorOpen;

  // lists rechts
  $('#empList').innerHTML=cache.employees.map(e=>`<li>${e.name}</li>`).join('');
  $('#projList').innerHTML=cache.projects.map(p=>`<li>${p.number} — ${p.name}${p.section?` • ${p.section}`:''}</li>`).join('');
}

function renderWeek(grid,monday,bar){
  grid.innerHTML='';
  headerRow(grid,monday);
  const days=[...Array(7)].map((_,i)=>addDays(monday,i));
  if(cache.employees.length===0){
    grid.appendChild(el('div','emp','(nog geen medewerkers)')); for(let i=0;i<7;i++) grid.appendChild(el('div','cell'));
  }else{
    for(const emp of cache.employees) employeeRow(grid,emp,days);
  }
  renderVehicleBar(bar,monday);
}

/*** POPUP ***/
function openTaskModal(rec){
  if(!isAdmin()) return alert('Wachtwoord vereist');
  $('#mEmp').innerHTML=cache.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  $('#mProj').innerHTML=cache.projects.map(p=>`<option value="${p.id}">${p.number} — ${p.name}</option>`).join('');
  const edit=!!rec.id;
  $('#taskTitle').textContent=edit?'Taak bewerken':'Taak toevoegen';
  $('#mId').value=rec.id||'';
  $('#mEmp').value=String(rec.employee_id||cache.employees[0]?.id||'');
  $('#mProj').value=String(rec.project_id||cache.projects[0]?.id||'');
  $('#mStartDate').value=rec.start_date||''; $('#mEndDate').value=rec.end_date||rec.start_date||'';
  $('#mStartTime').value=rec.start_time||'08:00'; $('#mEndTime').value=rec.end_time||'16:00';
  $('#mType').value=rec.type||'productie'; $('#mVehicle').value=rec.vehicle||'nvt';
  $('#mUrgent').value=rec.urgent?'true':'false'; $('#mNotes').value=rec.notes||'';
  document.getElementById('vehicleRow').style.display = ($('#mType').value==='montage')?'':'none';
  $('#mDelete').disabled=!edit;
  $('#taskModal').hidden=false;
}
function closeTaskModal(){ $('#taskModal').hidden=true; }

document.addEventListener('click',(e)=>{ if(e.target.id==='modalClose'||e.target.classList.contains('modal-backdrop')) closeTaskModal(); });
$('#mSave').addEventListener('click',async()=>{
  const rec={
    id: $('#mId').value?Number($('#mId').value):undefined,
    employee_id:Number($('#mEmp').value),
    project_id:Number($('#mProj').value),
    start_date:$('#mStartDate').value,
    end_date:$('#mEndDate').value||$('#mStartDate').value,
    start_time:$('#mStartTime').value,
    end_time:$('#mEndTime').value,
    type:$('#mType').value,
    vehicle:($('#mType').value==='montage'?$('#mVehicle').value:'nvt'),
    urgent:($('#mUrgent').value==='true'),
    notes:$('#mNotes').value||null
  };
  if(!rec.employee_id||!rec.project_id||!rec.start_date||!rec.start_time||!rec.end_time) return alert('Vul alle velden in');
  if(rec.end_date<rec.start_date) return alert('Einddatum vóór start');
  if(rec.end_time<=rec.start_time) return alert('Eindtijd na start');
  await upsertAssignment(rec); closeTaskModal(); await reload();
});
$('#mDelete').addEventListener('click',async()=>{
  const id=$('#mId').value; if(!id) return;
  if(!confirm('Deze taak verwijderen?')) return;
  await deleteAssignment(Number(id)); closeTaskModal(); await reload();
});
$('#mType').addEventListener('change',()=>{ document.getElementById('vehicleRow').style.display = ($('#mType').value==='montage')?'':'none'; });

/*** WIRE ***/
function wire(){
  $('#prevWeek').addEventListener('click',()=>{currentMonday=addDays(currentMonday,-7); render();});
  $('#nextWeek').addEventListener('click',()=>{currentMonday=addDays(currentMonday,7); render();});
  $('#todayBtn').addEventListener('click',()=>{currentMonday=startOfWeek(new Date()); render();});

  // zodra wachtwoord klopt: render opnieuw zodat delete-kruisjes zichtbaar worden
  $('#adminPwd').addEventListener('input',()=>{ $('#toggleEdit').disabled=!isAdmin(); render(); });

  $('#toggleEdit').addEventListener('click',()=>{ if(!isAdmin())return; editorOpen=!editorOpen; render(); });

  $('#addEmp').addEventListener('click',async()=>{ const n=$('#empName').value.trim(); if(!n)return; await addEmployee(n); $('#empName').value=''; });
  $('#addProj').addEventListener('click',async()=>{ const num=$('#projNumber').value.trim(), nm=$('#projName').value.trim(), sec=$('#projSect').value.trim(); if(!num||!nm)return; await addProject(num,nm,sec||null); $('#projNumber').value=''; $('#projName').value=''; $('#projSect').value=''; });

  $('#exportBtn')?.addEventListener('click', ()=>{ const data = JSON.stringify(cache,null,2); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type:'application/json'})); a.download='lovd-weekplanner-backup.json'; a.click(); URL.revokeObjectURL(a.href); });
}
document.addEventListener('DOMContentLoaded',async()=>{ wire(); await reload(); });
