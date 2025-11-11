// LOVD gedeelde planner — modal, twee weken, kleuren, sectie, multi-dag, bewerken + voertuig
const SUPABASE_URL = "https://qejxwoxaurbwllihnvim.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlanh3b3hhdXJid2xsaWhudmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NDgzODYsImV4cCI6MjA3ODMyNDM4Nn0.D4RFJurcIsWQUC4vInW43hMPUa87Rf8r1P9T4AISbn0";
const ADMIN_PASSWORD = "lovd-admin";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (s)=>document.querySelector(s);
function el(t,c,txt){const n=document.createElement(t); if(c) n.className=c; if(txt) n.textContent=txt; return n;}
function fmtDate(d){return d.toLocaleDateString('nl-NL',{weekday:'short', day:'numeric', month:'short'});}
function isoDateStr(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function startOfWeek(date){const d=new Date(date);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(0,0,0,0);return d;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function getWeekNumber(d){ const date=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dayNum=date.getUTCDay()||7; date.setUTCDate(date.getUTCDate()+4-dayNum); const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1)); const weekNo=Math.ceil((((date-yearStart)/86400000)+1)/7); return String(weekNo).padStart(2,'0');}
let currentMonday = startOfWeek(new Date());
let editorOpen = false;
function isAdmin(){ return ($('#adminPwd').value || '') === ADMIN_PASSWORD; }
function findVehicleConflicts(assignments){
  // groepeer per dag + voertuig, markeer als >1 taak
  const key = (a) => `${a.type}|${a.vehicle}|${a.start_date}`;
  const map = new Map();
  for(const a of assignments){
    if(a.type !== 'montage') continue;
    if(!a.vehicle || a.vehicle === 'nvt') continue;
    const k = key(a);
    if(!map.has(k)) map.set(k, []);
    map.get(k).push(a);
  }
  const conflictIds = new Set();
  for(const list of map.values()){
    // Conflict zodra 2 of meer medewerkers de BUS/BAKWAGEN op dezelfde dag hebben
    const empSet = new Set(list.map(a => a.employee_id));
    if(list.length > 1 && empSet.size > 1){
      list.forEach(a => conflictIds.add(a.id));
    }
  }
  return conflictIds;
}


async function fetchAll(){
  const [emp, proj, asg] = await Promise.all([
    sb.from('employees').select('*').order('name', { ascending: true }),
    sb.from('projects').select('*').order('number', { ascending: true }),
    sb.from('assignments').select('*')
  ]);
  if(emp.error) throw emp.error; if(proj.error) throw proj.error; if(asg.error) throw asg.error;
  return { employees: emp.data, projects: proj.data, assignments: asg.data };
}
async function addEmployee(name){ if(!isAdmin()) return alert('Wachtwoord vereist'); const { error } = await sb.from('employees').insert({ name }); if(error) throw error; }
async function addProject(number,name,section){ if(!isAdmin()) return alert('Wachtwoord vereist'); const { error } = await sb.from('projects').insert({ number, name, section }); if(error) throw error; }
async function upsertAssignment(rec){ if(!isAdmin()) return alert('Wachtwoord vereist'); if(rec.id){ const { error } = await sb.from('assignments').update(rec).eq('id', rec.id); if(error) throw error; } else { const { error } = await sb.from('assignments').insert(rec); if(error) throw error; } }
async function deleteAssignment(id){ if(!isAdmin()) return alert('Wachtwoord vereist'); const { error } = await sb.from('assignments').delete().eq('id', id); if(error) throw error; }

async function renameEmployee(id){ if(!isAdmin()) return alert('Wachtwoord vereist'); const current=(cache.employees.find(e=>e.id===id)||{}).name||''; const name=prompt('Nieuwe naam voor medewerker:', current); if(name===null) return; const { error }=await sb.from('employees').update({ name }).eq('id', id); if(error) return alert('Opslaan mislukt: '+error.message); await reload(); }
async function removeEmployee(id){ if(!isAdmin()) return alert('Wachtwoord vereist'); if(!confirm('Medewerker verwijderen? Geplande taken verdwijnen ook.')) return; const { error }=await sb.from('employees').delete().eq('id', id); if(error) return alert('Verwijderen mislukt: '+error.message); await reload(); }
async function renameProject(id){ if(!isAdmin()) return alert('Wachtwoord vereist'); const p=cache.projects.find(p=>p.id===id)||{}; const number=prompt('Projectnummer:', p.number||''); if(number===null) return; const name=prompt('Projectnaam:', p.name||''); if(name===null) return; const section=prompt('Sectie (optioneel):', p.section||''); if(section===null) return; const { error }=await sb.from('projects').update({ number, name, section:section||null }).eq('id', id); if(error) return alert('Opslaan mislukt: '+error.message); await reload(); }
async function removeProject(id){ if(!isAdmin()) return alert('Wachtwoord vereist'); if(!confirm('Project verwijderen? Taken die dit project gebruiken verdwijnen ook.')) return; const { error }=await sb.from('projects').delete().eq('id', id); if(error) return alert('Verwijderen mislukt: '+error.message); await reload(); }

let cache = { employees:[], projects:[], assignments:[] };
async function reload(){
  try{
    cache = await fetchAll();
    cache.vehicleConflicts = findVehicleConflicts(cache.assignments);
    render();
  } catch(e){
    console.error(e);
    alert('Laden mislukt. Check Supabase schema/policies.');
  }
}

function dateInRange(iso, startIso, endIso){ return iso >= startIso && iso <= endIso; }

function renderWeek(gridEl, monday){
  gridEl.innerHTML='';
  gridEl.appendChild(el('div','corner',`Medewerker — Week ${getWeekNumber(monday)}`));
  const days=[]; for(let i=0;i<7;i++){ const d=addDays(monday,i); days.push(d); gridEl.appendChild(el('div','dow',fmtDate(d))); }
  if(cache.employees.length===0){ gridEl.appendChild(el('div','emp','(nog geen medewerkers)')); for(let i=0;i<7;i++) gridEl.appendChild(el('div','cell')); return; }
  for(const emp of cache.employees){
    gridEl.appendChild(el('div','emp',emp.name));
    for(const day of days){
      const cell = document.getElementById('cellTpl').content.cloneNode(true).firstElementChild;
      const itemsBox = cell.querySelector('.items');
      const iso = isoDateStr(day);
      const list = cache.assignments
        .filter(a=>a.employee_id===emp.id && dateInRange(iso, a.start_date, a.end_date))
        .sort((a,b)=> (a.start_date+a.start_time).localeCompare(b.start_date+b.start_time));
      for(const a of list){
        const proj = cache.projects.find(p=>p.id===a.project_id);
        const item = document.getElementById('itemTpl').content.cloneNode(true).firstElementChild;
        item.classList.add(a.type||'productie');
        if(a.urgent) item.classList.add('urgent');
        if(cache.vehicleConflicts && cache.vehicleConflicts.has(a.id)) item.classList.add('conflict');
item.querySelector('.title').textContent = `${proj?proj.number:'?'} — ${proj?proj.name:''}`;
        item.querySelector('.meta').textContent = `${a.start_time}–${a.end_time}${proj&&proj.section?` • ${proj.section}`:''}${(a.type==='montage' && a.vehicle && a.vehicle!=='nvt')?` • ${a.vehicle}`:''}${a.notes?` • ${a.notes}`:''}`;
        item.addEventListener('click', ()=>{ openTaskModal(a); });
        item.querySelector('.x').addEventListener('click', async (e)=>{ e.stopPropagation(); if(!confirm('Taak verwijderen?')) return; await deleteAssignment(a.id); await reload(); });
        itemsBox.appendChild(item);
      }
      cell.querySelector('.dropzone').addEventListener('click', ()=>{
        if(!isAdmin()) return;
        openTaskModal({ employee_id: emp.id, project_id: cache.projects[0]?.id||null, start_date: iso, end_date: iso, start_time: '08:00', end_time: '16:00', type:'productie', vehicle:'nvt', notes:null });
      });
      gridEl.appendChild(cell);
    }
  }
}

function render(){
  $('#editorPanel').hidden = !editorOpen;
  const nextMonday = addDays(currentMonday,7);
  $('#weekLabel').textContent = `Week ${getWeekNumber(currentMonday)} & ${getWeekNumber(nextMonday)} — ${fmtDate(currentMonday)} t/m ${fmtDate(addDays(nextMonday,6))}`;
  renderWeek($('#gridWeek1'), currentMonday);
  renderWeek($('#gridWeek2'), nextMonday);

  $('#empList').innerHTML = cache.employees.map(e=>`<li>${e.name} <button class="btn small" title="Bewerken" onclick="renameEmployee(${e.id})">✏️</button> <button class="icon-btn danger" title="Verwijderen" onclick="removeEmployee(${e.id})">×</button></li>`).join('');
  $('#projList').innerHTML = cache.projects.map(p=>`<li>${p.number} — ${p.name}${p.section?` • ${p.section}`:''} <button class="btn small" title="Bewerken" onclick="renameProject(${p.id})">✏️</button> <button class="icon-btn danger" title="Verwijderen" onclick="removeProject(${p.id})">×</button></li>`).join('');
  if (document.querySelector('#mEmp')) fillModalSelects();
}

function fillModalSelects(){
  document.querySelector('#mEmp').innerHTML = cache.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  document.querySelector('#mProj').innerHTML = cache.projects.map(p=>`<option value="${p.id}">${p.number} — ${p.name}</option>`).join('');
}

function toggleVehicleRow(){
  const show = (document.querySelector('#mType')?.value === 'montage');
  const row = document.getElementById('vehicleRow');
  if(row){ row.style.display = show ? '' : 'none'; }
}

function openTaskModal(rec){
  if(!isAdmin()) return alert('Wachtwoord vereist');
  fillModalSelects();
  const isEdit = !!(rec && rec.id);
  document.querySelector('#taskTitle').textContent = isEdit ? 'Taak bewerken' : 'Taak toevoegen';
  document.querySelector('#mId').value = rec?.id || '';
  document.querySelector('#mEmp').value = String(rec?.employee_id || (cache.employees[0]?.id||''));
  document.querySelector('#mProj').value = String(rec?.project_id || (cache.projects[0]?.id||''));
  document.querySelector('#mStartDate').value = rec?.start_date || '';
  document.querySelector('#mEndDate').value   = rec?.end_date || rec?.start_date || '';
  document.querySelector('#mStartTime').value = rec?.start_time || '08:00';
  document.querySelector('#mEndTime').value   = rec?.end_time || '16:00';
  document.querySelector('#mType').value      = rec?.type || 'productie';
  document.querySelector('#mUrgent').checked = !!rec?.urgent;1
  document.querySelector('#mVehicle').value   = rec?.vehicle || 'nvt';
  document.querySelector('#mNotes').value     = rec?.notes || '';
  toggleVehicleRow();
  document.getElementById('mDelete').disabled = !isEdit;
  document.getElementById('taskModal').hidden = false;
}
function closeTaskModal(){ document.getElementById('taskModal').hidden = true; }

document.addEventListener('click', (ev)=>{
  if(ev.target.id==='modalClose' || ev.target.classList.contains('modal-backdrop')) closeTaskModal();
});

document.getElementById('mSave').addEventListener('click', async () => {
  const rec = {
    id: $('#mId').value ? Number($('#mId').value) : undefined,
    employee_id: Number($('#mEmp').value),
    project_id:  Number($('#mProj').value),
    start_date:  $('#mStartDate').value,
    end_date:    $('#mEndDate').value || $('#mStartDate').value,
    start_time:  $('#mStartTime').value,
    end_time:    $('#mEndTime').value,
    type:        $('#mType').value,
    vehicle:     ($('#mType').value === 'montage' ? $('#mVehicle').value : 'nvt'),
    urgent:      ($('#mUrgent')?.value === 'true'),
    notes:       $('#mNotes').value || null,
  };

  // ... je bestaande validaties ...

  // >>> NIEUW: tijd-gebonden voertuig check
  const conflicts = await checkVehicleConflict(rec);
  if (conflicts.length) {
    const who = conflicts.slice(0,3).map(c => {
      const emp = (cache.employees.find(e=>e.id===c.employee_id)?.name) || 'onbekend';
      return `${emp} ${c.start_date} ${c.start_time}-${c.end_time}`;
    }).join(', ');
    const msg = `LET OP: ${rec.vehicle} is al ingepland (${who}). Toch opslaan?`;
    if (!confirm(msg)) return; // stop als je niet wilt overriden
  }

  // ... hierna pas insert/update zoals je al doet ...
});

  if(!rec.employee_id||!rec.project_id||!rec.start_date||!rec.start_time||!rec.end_time) return alert('Vul alle velden in');
  if(rec.end_date < rec.start_date) return alert('Einddatum ligt vóór startdatum');
  if(rec.end_time <= rec.start_time) return alert('Eindtijd moet na starttijd liggen');
  try{
    if(rec.id){ const { error } = await sb.from('assignments').update(rec).eq('id', rec.id); if(error) throw error; }
    else      { const { error } = await sb.from('assignments').insert(rec); if(error) throw error; }
    closeTaskModal(); await reload();
  }catch(e){ alert('Opslaan mislukt: ' + (e?.message||e)); console.error(e); }
  // Vehicle-conflict check vóór opslaan
  if(rec.type === 'montage' && rec.vehicle && rec.vehicle !== 'nvt'){
  // check op dezelfde dag en zelfde voertuig, andere medewerker
    const clash = cache.assignments.some(x =>
      x.id !== rec.id &&
      x.type === 'montage' &&
      x.vehicle === rec.vehicle &&
      x.start_date === rec.start_date &&
      x.employee_id !== rec.employee_id
  );
  if(clash){
    const vLbl = rec.vehicle === 'bus' ? 'Bus' : 'Bakwagen';
    const ok = confirm(`${vLbl} is al ingepland op ${rec.start_date}. Toch opslaan?`);
    if(!ok) return; // afbreken
  }
}
});

function timeOverlap(aStart, aEnd, bStart, bEnd) {
  // tijden als "HH:MM"
  return aStart < bEnd && bStart < aEnd;
}

function dateRangesOverlap(aStart, aEnd, bStart, bEnd) {
  // ISO datums "YYYY-MM-DD"
  return !(aEnd < bStart || bEnd < aStart);
}

async function checkVehicleConflict(rec) {
  if (rec.type !== 'montage' || !rec.vehicle || rec.vehicle === 'nvt') return [];
  // Haal alle montage taken voor hetzelfde voertuig op (excl. jezelf bij edit)
  const { data, error } = await sb
    .from('assignments')
    .select('*')
    .eq('type', 'montage')
    .eq('vehicle', rec.vehicle)
    .neq('id', rec.id || -1);

  if (error) { console.error(error); return []; }

  // Filter op overlappende datums én tijden
  return data.filter(a =>
    dateRangesOverlap(rec.start_date, rec.end_date, a.start_date, a.end_date) &&
    timeOverlap(rec.start_time, rec.end_time, a.start_time, a.end_time)
  );
}


document.getElementById('mDelete').addEventListener('click', async ()=>{
  const id = document.querySelector('#mId').value;
  if(!id) return;
  if(!confirm('Deze taak verwijderen?')) return;
  try{
    const { error } = await sb.from('assignments').delete().eq('id', Number(id));
    if(error) throw error;
    closeTaskModal(); await reload();
  }catch(e){ alert('Verwijderen mislukt: ' + (e?.message||e)); console.error(e); }
});

function wire(){
  document.getElementById('prevWeek').addEventListener('click', ()=>{ currentMonday = addDays(currentMonday,-7); render(); });
  document.getElementById('nextWeek').addEventListener('click', ()=>{ currentMonday = addDays(currentMonday,7); render(); });
  document.getElementById('todayBtn').addEventListener('click', ()=>{ currentMonday = startOfWeek(new Date()); render(); });

  document.getElementById('adminPwd').addEventListener('input', ()=>{ document.getElementById('toggleEdit').disabled = !isAdmin(); });
  document.getElementById('toggleEdit').addEventListener('click', ()=>{ if(!isAdmin()) return; editorOpen = !editorOpen; render(); });

  document.getElementById('addEmp').addEventListener('click', async ()=>{ try{ const name=document.getElementById('empName').value.trim(); if(!name) return alert('Naam'); await addEmployee(name); document.getElementById('empName').value=''; await reload(); }catch(e){ alert('Medewerker toevoegen mislukt: '+(e?.message||e)); console.error(e); } });
  document.getElementById('addProj').addEventListener('click', async ()=>{ try{ const number=document.getElementById('projNumber').value.trim(); const name=document.getElementById('projName').value.trim(); const section=document.getElementById('projSect').value.trim(); if(!number||!name) return alert('Nummer + naam'); await addProject(number,name,section||null); document.getElementById('projNumber').value=''; document.getElementById('projName').value=''; document.getElementById('projSect').value=''; await reload(); }catch(e){ alert('Project toevoegen mislukt: '+(e?.message||e)); console.error(e); } });

  document.getElementById('exportBtn').addEventListener('click', ()=>{ const data = JSON.stringify(cache,null,2); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type:'application/json'})); a.download='lovd-weekplanner-backup.json'; a.click(); URL.revokeObjectURL(a.href); });
  document.getElementById('mType').addEventListener('change', toggleVehicleRow);
}

document.addEventListener('DOMContentLoaded', async ()=>{ wire(); await reload(); });
