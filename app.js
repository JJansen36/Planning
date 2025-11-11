
const SUPABASE_URL = 'https://qejxwoxaurbwllihnvim.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlanh3b3hhdXJid2xsaWhudmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NDgzODYsImV4cCI6MjA3ODMyNDM4Nn0.D4RFJurcIsWQUC4vInW43hMPUa87Rf8r1P9T4AISbn0';
const ADMIN_PASSWORD = 'lovd-admin';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (s)=>document.querySelector(s);
function el(t,c,txt){const n=document.createElement(t); if(c) n.className=c; if(txt) n.textContent=txt; return n;}
function fmtDate(d){return d.toLocaleDateString('nl-NL',{weekday:'short', day:'numeric', month:'short'});}
function isoDateStr(d){return new Date(d).toISOString().slice(0,10);}
function startOfWeek(date){const d=new Date(date);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(0,0,0,0);return d;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function getWeekNumber(d){ const date=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dayNum=date.getUTCDay()||7; date.setUTCDate(date.getUTCDate()+4-dayNum); const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1)); const weekNo=Math.ceil((((date-yearStart)/86400000)+1)/7); return String(weekNo).padStart(2,'0');}
let currentMonday = startOfWeek(new Date());
let editorOpen = false;
function isAdmin(){ return ($('#adminPwd').value || '') === ADMIN_PASSWORD; }

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

let cache = { employees:[], projects:[], assignments:[] };
// === Helpers & CRUD for employees/projects (inline edit/delete) ===
function htmlesc(s){ return (s??'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

async function updateEmployee(id, name){
  if(!isAdmin()) return alert('Wachtwoord vereist');
  const { error } = await sb.from('employees').update({ name }).eq('id', id);
  if(error) throw error;
}
async function deleteEmployee2(id){
  if(!isAdmin()) return alert('Wachtwoord vereist');
  if(!confirm('Medewerker verwijderen? Geplande taken van deze medewerker verdwijnen ook.')) return;
  const { error } = await sb.from('employees').delete().eq('id', id);
  if(error) throw error;
}

async function updateProject2(id, number, name, section){
  if(!isAdmin()) return alert('Wachtwoord vereist');
  const { error } = await sb.from('projects').update({ number, name, section }).eq('id', id);
  if(error) throw error;
}
async function deleteProject2(id){
  if(!isAdmin()) return alert('Wachtwoord vereist');
  if(!confirm('Project verwijderen? Taken die naar dit project verwijzen verdwijnen ook.')) return;
  const { error } = await sb.from('projects').delete().eq('id', id);
  if(error) throw error;
}

async function reload(){ try{ cache = await fetchAll(); render(); } catch(e){ console.error(e); alert('Laden mislukt.'); } }

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
        item.querySelector('.title').textContent = `${proj?proj.number:'?'} — ${proj?proj.name:''}`;
        item.querySelector('.meta').textContent = `${a.start_time}–${a.end_time}${proj&&proj.section?` • ${proj.section}`:''}${a.notes?` • ${a.notes}`:''}`;
        item.addEventListener('click', ()=>{ if(!isAdmin()) return; openEditorWith(a); });
        item.querySelector('.x').addEventListener('click', async (e)=>{ e.stopPropagation(); await deleteAssignment(a.id); await reload(); });
        itemsBox.appendChild(item);
      }
      cell.querySelector('.dropzone').addEventListener('click', ()=>{ if(!editorOpen) return; $('#qEmp').value = String(emp.id); const s=iso; $('#qStartDate').value=s; $('#qEndDate').value=s; $('#qId').value=''; $('#qDelete').disabled = true; window.scrollTo({top:0, behavior:'smooth'}); });
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

  $('#empList').innerHTML = cache.employees.map(e=>`
      <li data-id="${e.id}" class="row">
        <input class="emp-name" value="${htmlesc(e.name)}" />
        <button class="save-emp btn small">Opslaan</button>
        <button class="icon-btn danger del-emp" title="Verwijder">🗑️</button>
      </li>
    `).join('');
  $('#projList').innerHTML = cache.projects.map(p=>`
      <li data-id="${p.id}" class="row">
        <input class="proj-number" placeholder="Nr" value="${htmlesc(p.number)}" />
        <input class="proj-name" placeholder="Naam" value="${htmlesc(p.name)}" />
        <input class="proj-section" placeholder="Sectie" value="${htmlesc(p.section||'')}" />
        <button class="save-proj btn small">Opslaan</button>
        <button class="icon-btn danger del-proj" title="Verwijder">🗑️</button>
      </li>
    `).join('');
  $('#qEmp').innerHTML = cache.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  $('#qProj').innerHTML = cache.projects.map(p=>`<option value="${p.id}">${p.number} — ${p.name}</option>`).join('');
}

function openEditorWith(a){
  editorOpen = true; $('#editorPanel').hidden = false;
  $('#qId').value = a.id; $('#qDelete').disabled = false;
  $('#qEmp').value = String(a.employee_id);
  $('#qProj').value = String(a.project_id);
  $('#qStartDate').value = a.start_date; $('#qEndDate').value = a.end_date;
  $('#qStartTime').value = a.start_time; $('#qEndTime').value = a.end_time;
  $('#qType').value = a.type || 'productie';
  $('#qNotes').value = a.notes || '';
  window.scrollTo({top:0, behavior:'smooth'});
}

function wire(){
  // Delegated handlers for inline edit/delete
  document.querySelector('#empList').addEventListener('click', async (ev)=>{
    const li = ev.target.closest('li[data-id]'); if(!li) return;
    const id = Number(li.dataset.id);
    if(ev.target.matches('.save-emp')){
      try{ await updateEmployee(id, li.querySelector('.emp-name').value.trim()); await reload(); }
      catch(e){ alert('Opslaan medewerker mislukt: '+(e?.message||e)); console.error(e); }
    } else if(ev.target.matches('.del-emp')){
      try{ await deleteEmployee2(id); await reload(); }
      catch(e){ alert('Verwijderen medewerker mislukt: '+(e?.message||e)); console.error(e); }
    }
  });
  document.querySelector('#projList').addEventListener('click', async (ev)=>{
    const li = ev.target.closest('li[data-id]'); if(!li) return;
    const id = Number(li.dataset.id);
    if(ev.target.matches('.save-proj')){
      const number = li.querySelector('.proj-number').value.trim();
      const name   = li.querySelector('.proj-name').value.trim();
      const section= li.querySelector('.proj-section').value.trim();
      if(!number||!name) return alert('Nr en naam verplicht');
      try{ await updateProject2(id, number, name, section||null); await reload(); }
      catch(e){ alert('Opslaan project mislukt: '+(e?.message||e)); console.error(e); }
    } else if(ev.target.matches('.del-proj')){
      try{ await deleteProject2(id); await reload(); }
      catch(e){ alert('Verwijderen project mislukt: '+(e?.message||e)); console.error(e); }
    }
  });

  $('#prevWeek').addEventListener('click', ()=>{ currentMonday = addDays(currentMonday,-7); render(); });
  $('#nextWeek').addEventListener('click', ()=>{ currentMonday = addDays(currentMonday,7); render(); });
  $('#todayBtn').addEventListener('click', ()=>{ currentMonday = startOfWeek(new Date()); render(); });

  $('#adminPwd').addEventListener('input', ()=>{ $('#toggleEdit').disabled = !isAdmin(); });
  $('#toggleEdit').addEventListener('click', ()=>{ if(!isAdmin()) return; editorOpen = !editorOpen; render(); });

  $('#addEmp').addEventListener('click', async ()=>{ const name=$('#empName').value.trim(); if(!name) return alert('Naam'); await addEmployee(name); $('#empName').value=''; await reload(); });
  $('#addProj').addEventListener('click', async ()=>{ const number=$('#projNumber').value.trim(); const name=$('#projName').value.trim(); const section=$('#projSect').value.trim(); if(!number||!name) return alert('Nummer + naam'); await addProject(number,name,section||null); $('#projNumber').value=''; $('#projName').value=''; $('#projSect').value=''; await reload(); });

  $('#qSave').addEventListener('click', async ()=>{ 
    const rec = {
      id: $('#qId').value? Number($('#qId').value): undefined,
      employee_id: Number($('#qEmp').value),
      project_id: Number($('#qProj').value),
      start_date: $('#qStartDate').value,
      end_date: $('#qEndDate').value || $('#qStartDate').value,
      start_time: $('#qStartTime').value,
      end_time: $('#qEndTime').value,
      type: $('#qType').value,
      notes: ($('#qNotes').value||null)
    };
    if(!rec.employee_id||!rec.project_id||!rec.start_date||!rec.start_time||!rec.end_time) return alert('Vul alle velden in.');
    if(rec.end_date < rec.start_date) return alert('Einddatum ligt vóór startdatum.');
    if(rec.end_time <= rec.start_time) return alert('Eindtijd moet na starttijd liggen.');
    await upsertAssignment(rec);
    $('#qId').value=''; $('#qDelete').disabled = true;
    await reload();
  });

  $('#qDelete').addEventListener('click', async ()=>{ const id=$('#qId').value; if(!id) return; if(!confirm('Verwijderen?')) return; await deleteAssignment(Number(id)); $('#qId').value=''; $('#qDelete').disabled=true; await reload(); });

  $('#exportBtn').addEventListener('click', ()=>{ const blob = new Blob([JSON.stringify(cache,null,2)], {type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='lovd-weekplanner-backup.json'; a.click(); URL.revokeObjectURL(a.href); });
}

document.addEventListener('DOMContentLoaded', async ()=>{ wire(document.getElementById('adminPwd').addEventListener('input', ()=>{
  document.getElementById('toggleEdit').disabled = !isAdmin();
});
document.getElementById('toggleEdit').addEventListener('click', ()=>{
  if(!isAdmin()) return;
  editorOpen = !editorOpen;
  render();
});
); await reload(); });
function fillModalSelects(){
  document.querySelector('#mEmp').innerHTML = cache.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  document.querySelector('#mProj').innerHTML = cache.projects.map(p=>`<option value="${p.id}">${p.number} — ${p.name}</option>`).join('');
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
  document.querySelector('#mNotes').value     = rec?.notes || '';
  document.getElementById('mDelete').disabled = !isEdit;
  document.getElementById('taskModal').hidden = false;
}
function closeTaskModal(){ document.getElementById('taskModal').hidden = true; }

document.addEventListener('click', (ev)=>{
  if(ev.target.id==='modalClose' || ev.target.classList.contains('modal-backdrop')) closeTaskModal();
});

document.getElementById('mSave').addEventListener('click', async ()=>{
  const rec = {
    id: document.querySelector('#mId').value ? Number(document.querySelector('#mId').value): undefined,
    employee_id: Number(document.querySelector('#mEmp').value),
    project_id:  Number(document.querySelector('#mProj').value),
    start_date:  document.querySelector('#mStartDate').value,
    end_date:    document.querySelector('#mEndDate').value || document.querySelector('#mStartDate').value,
    start_time:  document.querySelector('#mStartTime').value,
    end_time:    document.querySelector('#mEndTime').value,
    type:        document.querySelector('#mType').value,
    notes:       document.querySelector('#mNotes').value || null,
  };
  if(!rec.employee_id||!rec.project_id||!rec.start_date||!rec.start_time||!rec.end_time) return alert('Vul alle velden in');
  if(rec.end_date < rec.start_date) return alert('Einddatum ligt vóór startdatum');
  if(rec.end_time <= rec.start_time) return alert('Eindtijd moet na starttijd liggen');
  try{
    if(rec.id){
      const { error } = await sb.from('assignments').update(rec).eq('id', rec.id);
      if(error) throw error;
    } else {
      const { error } = await sb.from('assignments').insert(rec);
      if(error) throw error;
    }
    closeTaskModal();
    await reload();
  }catch(e){
    alert('Opslaan mislukt: ' + (e?.message||e));
    console.error(e);
  }
});

document.getElementById('mDelete').addEventListener('click', async ()=>{
  const id = document.querySelector('#mId').value;
  if(!id) return;
  if(!confirm('Deze taak verwijderen?')) return;
  try{
    const { error } = await sb.from('assignments').delete().eq('id', Number(id));
    if(error) throw error;
    closeTaskModal();
    await reload();
  }catch(e){
    alert('Verwijderen mislukt: ' + (e?.message||e));
    console.error(e);
  }
});

// Item klik: openen om te bewerken
item.addEventListener('click', ()=>{ openTaskModal(a); });

// Klik op lege cel: nieuw met voorgeselecteerde medewerker/datum
cell.querySelector('.dropzone').addEventListener('click', ()=>{
  if(!isAdmin()) return;
  const iso = isoDateStr(day); // zorg dat isoDateStr(d) lokale datum gebruikt (jouw versie had dit al)
  openTaskModal({
    employee_id: emp.id,
    project_id: cache.projects[0]?.id || null,
    start_date: iso,
    end_date: iso,
    start_time: '08:00',
    end_time: '16:00',
    type: 'productie',
    notes: null
  });
});


