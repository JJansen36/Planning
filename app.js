// === Supabase config ===
const SUPABASE_URL = 'https://qejxwoxaurbwllihnvim.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlanh3b3hhdXJid2xsaWhudmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NDgzODYsImV4cCI6MjA3ODMyNDM4Nn0.D4RFJurcIsWQUC4vInW43hMPUa87Rf8r1P9T4AISbn0';
const ADMIN_PASSWORD = 'lovd-admin';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === Helpers ===
const $ = (s)=>document.querySelector(s);
function el(t,c,txt){const n=document.createElement(t); if(c) n.className=c; if(txt) n.textContent=txt; return n;}
function fmtDate(d){return d.toLocaleDateString('nl-NL',{weekday:'short', day:'numeric', month:'short'});}
function isoDateStrLocal(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; }
function startOfWeek(date){const d=new Date(date);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(0,0,0,0);return d;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function getWeekNumber(d){ const date=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dayNum=date.getUTCDay()||7; date.setUTCDate(date.getUTCDate()+4-dayNum); const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1)); const weekNo=Math.ceil((((date-yearStart)/86400000)+1)/7); return String(weekNo).padStart(2,'0');}
function isAdmin(){ return ($('#adminPwd').value || '') === ADMIN_PASSWORD; }

let currentMonday = startOfWeek(new Date());
let editorOpen = false;
let cache = { employees:[], projects:[], assignments:[] };

// === DB ===
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
async function updateEmployee(id, name){ if(!isAdmin()) return alert('Wachtwoord vereist'); const { error } = await sb.from('employees').update({ name }).eq('id', id); if(error) throw error; }
async function removeEmployee(id){ if(!isAdmin()) return alert('Wachtwoord vereist'); if(!confirm('Medewerker verwijderen? Taken verdwijnen ook.')) return; const { error } = await sb.from('employees').delete().eq('id', id); if(error) throw error; }

async function addProject(number,name,section){ if(!isAdmin()) return alert('Wachtwoord vereist'); const { error } = await sb.from('projects').insert({ number, name, section }); if(error) throw error; }
async function updateProject(id, number, name, section){ if(!isAdmin()) return alert('Wachtwoord vereist'); const { error } = await sb.from('projects').update({ number, name, section }).eq('id', id); if(error) throw error; }
async function removeProject(id){ if(!isAdmin()) return alert('Wachtwoord vereist'); if(!confirm('Project verwijderen? Taken verdwijnen ook.')) return; const { error } = await sb.from('projects').delete().eq('id', id); if(error) throw error; }

async function upsertAssignment(rec){ if(!isAdmin()) return alert('Wachtwoord vereist');
  if(rec.id){ const { error } = await sb.from('assignments').update(rec).eq('id', rec.id); if(error) throw error; }
  else { const { error } = await sb.from('assignments').insert(rec); if(error) throw error; }
}
async function deleteAssignment(id){ if(!isAdmin()) return alert('Wachtwoord vereist'); const { error } = await sb.from('assignments').delete().eq('id', id); if(error) throw error; }

// === Modal ===
function fillModalSelects(){
  $('#mEmp').innerHTML = cache.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  $('#mProj').innerHTML = cache.projects.map(p=>`<option value="${p.id}">${p.number} — ${p.name}</option>`).join('');
}
function openTaskModal(rec){
  if(!isAdmin()) return alert('Wachtwoord vereist');
  fillModalSelects();
  const isEdit = !!(rec && rec.id);
  $('#taskTitle').textContent = isEdit ? 'Taak bewerken' : 'Taak toevoegen';
  $('#mId').value = rec?.id || '';
  $('#mEmp').value = String(rec?.employee_id || (cache.employees[0]?.id||''));
  $('#mProj').value = String(rec?.project_id || (cache.projects[0]?.id||''));
  $('#mStartDate').value = rec?.start_date || '';
  $('#mEndDate').value   = rec?.end_date || rec?.start_date || '';
  $('#mStartTime').value = rec?.start_time || '08:00';
  $('#mEndTime').value   = rec?.end_time || '16:00';
  $('#mType').value      = rec?.type || 'productie';
  $('#mNotes').value     = rec?.notes || '';
  $('#mDelete').disabled = !isEdit;
  $('#taskModal').hidden = false;
}
function closeTaskModal(){ $('#taskModal').hidden = true; }

// === Render ===
function dateInRange(iso, startIso, endIso){ return iso >= startIso && iso <= endIso; }

function renderWeek(gridEl, monday){
  gridEl.innerHTML = '';
  gridEl.appendChild(el('div','corner',`Medewerker — Week ${getWeekNumber(monday)}`));
  const days=[];
  for(let i=0;i<7;i++){ const d=addDays(monday,i); days.push(d); gridEl.appendChild(el('div','dow',fmtDate(d))); }

  if(cache.employees.length===0){
    gridEl.appendChild(el('div','emp','(nog geen medewerkers)'));
    for(let i=0;i<7;i++) gridEl.appendChild(el('div','cell'));
    return;
  }

  for(const emp of cache.employees){
    gridEl.appendChild(el('div','emp',emp.name));
    for(const day of days){
      const cell = $('#cellTpl').content.cloneNode(true).firstElementChild;
      const itemsBox = cell.querySelector('.items');
      const iso = isoDateStrLocal(day);

      const items = cache.assignments
        .filter(a => a.employee_id===emp.id && dateInRange(iso, a.start_date, a.end_date))
        .sort((a,b)=> (a.start_date+a.start_time).localeCompare(b.start_date+b.start_time));

      for(const a of items){
        const proj = cache.projects.find(p=>p.id===a.project_id);
        const item = $('#itemTpl').content.cloneNode(true).firstElementChild;
        item.classList.add(a.type || 'productie');
        item.querySelector('.title').textContent = `${proj?proj.number:'?'} — ${proj?proj.name:''}`;
        item.querySelector('.meta').textContent = `${a.start_time}–${a.end_time}${proj&&proj.section?` • ${proj.section}`:''}${a.notes?` • ${a.notes}`:''}`;
        item.addEventListener('click', ()=>{ openTaskModal(a); });
        item.querySelector('.x').addEventListener('click', async (e)=>{ e.stopPropagation(); await deleteAssignment(a.id); await reload(); });
        itemsBox.appendChild(item);
      }

      cell.querySelector('.dropzone').addEventListener('click', ()=>{
        if(!isAdmin()) return;
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

  // Lijsten
  $('#projList').innerHTML = cache.projects.map(p=>`
    <li data-id="${p.id}" class="row">
      <input class="proj-number" placeholder="Nr" value="${p.number}" />
      <input class="proj-name" placeholder="Naam" value="${p.name}" />
      <input class="proj-section" placeholder="Sectie" value="${p.section||''}" />
      <button class="btn small save-proj">Opslaan</button>
      <button class="icon-btn danger del-proj" title="Verwijderen">×</button>
    </li>
  `).join('');

  $('#empList').innerHTML = cache.employees.map(e=>`
    <li data-id="${e.id}" class="row">
      <input class="emp-name" value="${e.name}" />
      <button class="btn small save-emp">Opslaan</button>
      <button class="icon-btn danger del-emp" title="Verwijderen">×</button>
    </li>
  `).join('');
}

async function reload(){ try{ cache = await fetchAll(); render(); } catch(e){ console.error(e); alert('Data laden mislukt. Controleer Supabase tabellen/policies.'); } }

// === Wire ===
function wire(){
  $('#prevWeek').addEventListener('click', ()=>{ currentMonday = addDays(currentMonday,-7); render(); });
  $('#nextWeek').addEventListener('click', ()=>{ currentMonday = addDays(currentMonday,7); render(); });
  $('#todayBtn').addEventListener('click', ()=>{ currentMonday = startOfWeek(new Date()); render(); });

  // beheer aan/uit
  $('#adminPwd').addEventListener('input', ()=>{ $('#toggleEdit').disabled = !isAdmin(); });
  $('#toggleEdit').addEventListener('click', ()=>{ if(!isAdmin()) return; editorOpen = !editorOpen; render(); });

  // projecten toevoegen
  $('#addProj').addEventListener('click', async ()=>{
    try {
      const number=$('#projNumber').value.trim();
      const name=$('#projName').value.trim();
      const section=$('#projSect').value.trim();
      if(!number||!name) return alert('Nr + naam zijn verplicht');
      await addProject(number,name,section||null);
      $('#projNumber').value=''; $('#projName').value=''; $('#projSect').value='';
      await reload();
    } catch(e){ alert('Project toevoegen mislukt: '+(e?.message||e)); console.error(e); }
  });

  // medewerkers toevoegen
  $('#addEmp').addEventListener('click', async ()=>{
    try {
      const name=$('#empName').value.trim();
      if(!name) return alert('Naam is verplicht');
      await addEmployee(name);
      $('#empName').value='';
      await reload();
    } catch(e){ alert('Medewerker toevoegen mislukt: '+(e?.message||e)); console.error(e); }
  });

  // inline opslaan/verwijderen (delegation)
  document.addEventListener('click', async (ev)=>{
    // modal close
    if(ev.target.id==='modalClose' || ev.target.classList.contains('modal-backdrop')) closeTaskModal();

    const li = ev.target.closest('li[data-id]');
    if(!li) return;
    const id = Number(li.dataset.id);

    // projecten
    if(ev.target.classList.contains('save-proj')){
      try{
        const number = li.querySelector('.proj-number').value.trim();
        const name   = li.querySelector('.proj-name').value.trim();
        const section= li.querySelector('.proj-section').value.trim();
        if(!number||!name) return alert('Nr en naam verplicht');
        await updateProject(id, number, name, section||null);
        await reload();
      }catch(e){ alert('Opslaan project mislukt: '+(e?.message||e)); console.error(e); }
    }
    if(ev.target.classList.contains('del-proj')){
      try{ await removeProject(id); await reload(); }
      catch(e){ alert('Verwijderen project mislukt: '+(e?.message||e)); console.error(e); }
    }

    // medewerkers
    if(ev.target.classList.contains('save-emp')){
      try{
        const name = li.querySelector('.emp-name').value.trim();
        if(!name) return alert('Naam verplicht');
        await updateEmployee(id, name);
        await reload();
      }catch(e){ alert('Opslaan medewerker mislukt: '+(e?.message||e)); console.error(e); }
    }
    if(ev.target.classList.contains('del-emp')){
      try{ await removeEmployee(id); await reload(); }
      catch(e){ alert('Verwijderen medewerker mislukt: '+(e?.message||e)); console.error(e); }
    }
  });

  // modal save/delete
  $('#mSave').addEventListener('click', async ()=>{
    const rec = {
      id: $('#mId').value ? Number($('#mId').value) : undefined,
      employee_id: Number($('#mEmp').value),
      project_id:  Number($('#mProj').value),
      start_date:  $('#mStartDate').value,
      end_date:    $('#mEndDate').value || $('#mStartDate').value,
      start_time:  $('#mStartTime').value,
      end_time:    $('#mEndTime').value,
      type:        $('#mType').value,
      notes:       $('#mNotes').value || null,
    };
    if(!rec.employee_id||!rec.project_id||!rec.start_date||!rec.start_time||!rec.end_time) return alert('Vul alle velden in');
    if(rec.end_date < rec.start_date) return alert('Einddatum ligt vóór startdatum');
    if(rec.end_time <= rec.start_time) return alert('Eindtijd moet na starttijd liggen');
    try{ await upsertAssignment(rec); closeTaskModal(); await reload(); }
    catch(e){ alert('Opslaan mislukt: '+(e?.message||e)); console.error(e); }
  });

  $('#mDelete').addEventListener('click', async ()=>{
    const id = $('#mId').value;
    if(!id) return;
    if(!confirm('Deze taak verwijderen?')) return;
    try{ await deleteAssignment(Number(id)); closeTaskModal(); await reload(); }
    catch(e){ alert('Verwijderen mislukt: '+(e?.message||e)); console.error(e); }
  });

  // export/import
  $('#exportBtn').addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(cache,null,2)], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='lovd-weekplanner-backup.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  $('#importFile').addEventListener('change', async (e)=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=async ()=>{
      try{
        if(!isAdmin()) return alert('Wachtwoord vereist');
        const data=JSON.parse(r.result);
        if(!data||!Array.isArray(data.employees)||!Array.isArray(data.projects)||!Array.isArray(data.assignments)) throw new Error('Ongeldig bestand');
        await sb.from('assignments').delete().neq('id', -1);
        await sb.from('employees').delete().neq('id', -1);
        await sb.from('projects').delete().neq('id', -1);
        if(data.employees.length) await sb.from('employees').insert(data.employees.map(({id,name})=>({id,name})));
        if(data.projects.length)  await sb.from('projects').insert(data.projects.map(({id,number,name,section})=>({id,number,name,section:section||null})));
        if(data.assignments.length) await sb.from('assignments').insert(data.assignments.map(({id,employee_id,project_id,start_date,end_date,start_time,end_time,type,notes})=>({id,employee_id,project_id,start_date,end_date,start_time,end_time,type:type||'productie',notes:notes||null})));
        await reload();
        alert('Import gelukt');
      }catch(err){ alert('Import fout: '+err.message); }
    };
    r.readAsText(f);
  });
}

document.addEventListener('DOMContentLoaded', async ()=>{ wire(); await reload(); });
