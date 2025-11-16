document.addEventListener("DOMContentLoaded", async () => {
  // Alleen ingelogde gebruikers mogen deze pagina zien
  await requireAuth();
  setupLogout();

  // HIERNA: jouw bestaande code
  // bijv. loadVehicles(); loadReservations(); etc.
});
// visitors.js — kinds + verify admin
const { url: "https://qejxwoxaurbwllihnvim.supabase.co", key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlanh3b3hhdXJid2xsaWhudmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NDgzODYsImV4cCI6MjA3ODMyNDM4Nn0.D4RFJurcIsWQUC4vInW43hMPUa87Rf8r1P9T4AISbn0" } = window.__CONF__;
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);



const $ = (s)=>document.querySelector(s);

function toMin(hm){ const [h,m]=(hm||'00:00').split(':').map(n=>parseInt(n||'0',10)); return h*60+m; }
function overlap(s1,e1,s2,e2){ return toMin(s1) < toMin(e2) && toMin(s2) < toMin(e1); }

let EMP_CACHE = [];
let PROJ_CACHE = [];
let RES_CACHE = [];
let ADMIN_OK = false;
let ADMIN_PW = '';

async function verifyAdmin(pw){
  ADMIN_PW = pw || '';
  if(!pw){ ADMIN_OK=false; renderReservations(); return; }
  const { data, error } = await sb.rpc('is_admin', { p_password: pw });
  ADMIN_OK = !error && !!data;
  const fld = document.getElementById('adminPwd');
  if(fld){ fld.style.borderColor = ADMIN_OK ? '#33c36f' : ''; fld.title = ADMIN_OK ? 'Admin geverifieerd' : 'Voer beheerwachtwoord in'; }
  renderReservations();
}

async function loadEmployees(){
  const { data, error } = await sb.from('employees').select('id,name').order('name',{ascending:true});
  if(error){ $('#rMsg').textContent = 'Medewerkers laden mislukt: '+error.message; return; }
  EMP_CACHE = data||[];
  $('#rEmp').innerHTML = EMP_CACHE.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
}
async function loadProjects(){
  const { data, error } = await sb.from('projects').select('id,number,name').order('number',{ascending:true});
  if(error){ return; }
  PROJ_CACHE = data||[];
  const opts = PROJ_CACHE.map(p=>`<option value="${p.id}">${p.number} — ${p.name}</option>`).join('');
  const rProj = document.getElementById('rProj'); if(rProj) rProj.innerHTML = opts;
  const eProj = document.getElementById('eProj'); if(eProj) eProj.innerHTML = opts;
}

function nameById(id){
  const e = EMP_CACHE.find(x=>String(x.id)===String(id));
  return e ? e.name : '?';
}
function projLabel(id){
  const p = PROJ_CACHE.find(x=>String(x.id)===String(id));
  return p ? `${p.number} — ${p.name}` : '?';
}

function reservationRow(r){
  const name = nameById(r.reserved_by);
  const kindLabel = r.kind === 'project' ? `project: ${projLabel(r.project_id)}` : 'privé';
  const base = `${r.date} • ${r.vehicle} • ${r.start_time}–${r.end_time} • ${name} • ${kindLabel}${r.note?` • ${r.note}`:''}`;
  if(!ADMIN_OK) return `<li>${base}</li>`;
  return `<li>
    ${base}
    <button class="btn small" data-edit="${r.id}">Bewerken</button>
    <button class="btn small danger" data-del="${r.id}">Verwijderen</button>
  </li>`;
}

async function loadReservations(){
  const today = new Date().toISOString().slice(0,10);
  const { data, error } = await sb
    .from('vehicle_reservations')
    .select('id,reserved_by,vehicle,date,start_time,end_time,kind,project_id,note')
    .gte('date', today)
    .order('date', { ascending: true });
  if(error){ $('#rMsg').textContent = 'Reserveringen laden mislukt: '+error.message; return; }
  RES_CACHE = data || [];
  renderReservations();
}
function renderReservations(){
  $('#rList').innerHTML = (RES_CACHE||[]).map(reservationRow).join('') || '<li>Geen reserveringen.</li>';
}

function fillEmpSelect(selId, val){
  $(selId).innerHTML = EMP_CACHE.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  $(selId).value = String(val || EMP_CACHE[0]?.id || '');
}
function fillProjSelect(selId, val){
  $(selId).innerHTML = PROJ_CACHE.map(p=>`<option value="${p.id}">${p.number} — ${p.name}</option>`).join('');
  if(val!=null) $(selId).value = String(val);
}

function openResModal(r){
  if(!ADMIN_OK) { alert('Beheer-wachtwoord vereist.'); return; }
  $('#rId').value = r.id;
  fillEmpSelect('#eEmp', r.reserved_by);
  fillProjSelect('#eProj', r.project_id || '');
  $('#eVeh').value  = r.vehicle;
  $('#eKind').value = r.kind || 'private';
  $('#eProj').disabled = ($('#eKind').value !== 'project');
  $('#eDate').value = r.date;
  $('#eStart').value= r.start_time;
  $('#eEnd').value  = r.end_time;
  $('#eNote').value = r.note || '';
  $('#resModal').hidden = false;
}
function closeResModal(){ $('#resModal').hidden = true; }

document.addEventListener('click', (e)=>{
  if(e.target.id==='resClose' || e.target.classList.contains('modal-backdrop')) closeResModal();
});

// Toggle project selector
document.getElementById('rKind')?.addEventListener('change', ()=>{
  const kind = document.getElementById('rKind').value;
  document.getElementById('rProj').disabled = (kind !== 'project');
});
document.getElementById('eKind')?.addEventListener('change', ()=>{
  const kind = document.getElementById('eKind').value;
  document.getElementById('eProj').disabled = (kind !== 'project');
});

// Admin verify debounce
let _pwTimer=null;
document.getElementById('adminPwd')?.addEventListener('input', (e)=>{
  const pw = e.target.value;
  clearTimeout(_pwTimer);
  _pwTimer = setTimeout(()=> verifyAdmin(pw), 250);
});

// List actions
document.getElementById('rList')?.addEventListener('click', async (e)=>{
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;

  if (t.dataset.del) {
    if (!ADMIN_OK) { alert('Beheer-wachtwoord vereist.'); return; }
    if (!confirm('Reservering verwijderen?')) return;
    const { error } = await sb.rpc('delete_vehicle_reservation', { p_id: Number(t.dataset.del), p_password: ADMIN_PW });
    if (error) { alert('Verwijderen mislukt: '+error.message); return; }
    await loadReservations();
    return;
  }

  if (t.dataset.edit) {
    if (!ADMIN_OK) { alert('Beheer-wachtwoord vereist.'); return; }
    const id = Number(t.dataset.edit);
    const r = RES_CACHE.find(x => Number(x.id) === id);
    if (r) openResModal(r);
  }
});

document.getElementById('eSave')?.addEventListener('click', async ()=>{
  if (!ADMIN_OK) { alert('Beheer-wachtwoord vereist.'); return; }
  const id = Number($('#rId').value);
  const kind = $('#eKind').value;
  const projId = (kind === 'project') ? Number($('#eProj').value) : null;
  const empId = Number($('#eEmp').value);
  const veh   = $('#eVeh').value;
  const date  = $('#eDate').value;
  let s     = ($('#eStart').value || '').trim();
  let e     = ($('#eEnd').value   || '').trim();
  const note  = $('#eNote').value || null;

  function toMin(hm){ const [hh,mm]=(hm||'00:00').split(':'); return parseInt(hh||'0',10)*60+parseInt(mm||'0',10); }
  function norm(hm){ const [hh,mm]=(hm||'00:00').split(':'); return String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+':00'; }

  if(!empId || !veh || !date || !s || !e){ alert('Vul alle velden in.'); return; }
  if(toMin(e) <= toMin(s)){ alert('Eindtijd moet na starttijd liggen.'); return; }
  if(kind === 'project' && !projId){ alert('Kies een project voor type = Project.'); return; }

  // normaliseer naar HH:MM:SS om aan DB time te voldoen
  s = norm(s); e = norm(e);

  try {
    const { data: sameDay, error: qErr } = await sb
      .from('vehicle_reservations')
      .select('id,start_time,end_time')
      .eq('vehicle', veh)
      .eq('date', date);
    if(qErr){ alert('Controle mislukt: '+qErr.message); return; }
    const overlap = (s1,e1,s2,e2)=> toMin(String(s1).slice(0,5)) < toMin(String(e2).slice(0,5)) && toMin(String(s2).slice(0,5)) < toMin(String(e1).slice(0,5));
    const clash = (sameDay||[]).some(r => Number(r.id)!==id && overlap(s,e,r.start_time,r.end_time));
    if(clash){ alert('Let op: dit voertuig is reeds gereserveerd in dit tijdvak.'); return; }
  } catch (err) {
    alert('Controle mislukt: '+(err?.message||err)); return;
  }

  const { error } = await sb.rpc('update_vehicle_reservation', {
    p_password: ADMIN_PW,
    p_id: id,
    p_reserved_by: empId,
    p_vehicle: veh,
    p_date: date,
    p_start: s,
    p_end: e,
    p_kind: kind,
    p_project_id: projId,
    p_note: note
  });
  if(error){ alert('Opslaan mislukt: ' + error.message); return; }

  closeResModal();
  await loadReservations();
});

async function saveReservation(){
  const kind = $('#rKind').value;
  const projId = (kind === 'project') ? Number($('#rProj').value) : null;
  function norm(hm){ const [hh,mm]=(hm||'00:00').split(':'); return String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+':00'; }
  const rec = {
    reserved_by: Number($('#rEmp').value),
    vehicle: $('#rVeh').value,
    date: $('#rDate').value,
    start_time: norm($('#rStart').value),
    end_time: norm($('#rEnd').value),
    kind,
    project_id: projId,
    note: $('#rNote').value?.trim() || null
  };

  const msg = $('#rMsg'); msg.textContent = '';

  if(!rec.reserved_by || !rec.vehicle || !rec.date || !rec.start_time || !rec.end_time){
     msg.textContent = 'Vul alle velden in.'; return;
  }
  if(rec.end_time <= rec.start_time){
     msg.textContent = 'Eindtijd moet na starttijd liggen.'; return;
  }
  if(kind==='project' && !rec.project_id){
     msg.textContent = 'Kies een project voor type = Project.'; return;
  }

  const { data: sameDay, error: qErr } = await sb
    .from('vehicle_reservations')
    .select('start_time,end_time')
    .eq('vehicle', rec.vehicle)
    .eq('date', rec.date);
  if(qErr){ msg.textContent = 'Controle mislukt: '+qErr.message; return; }

  const clash = (sameDay||[]).some(r=>overlap(rec.start_time, rec.end_time, r.start_time, r.end_time));
  if(clash){ msg.textContent = 'Let op: dit voertuig is reeds gereserveerd in dit tijdvak.'; return; }

  const { error: insErr } = await sb.from('vehicle_reservations').insert(rec);
  if(insErr){ msg.textContent = 'Opslaan mislukt: '+insErr.message; return; }

  msg.textContent = 'Reservering opgeslagen.';
  $('#rNote').value = '';
  await loadReservations();
}

document.addEventListener('DOMContentLoaded', async ()=>{
  $('#rDate').value = new Date().toISOString().slice(0,10);
  await loadEmployees();
  await loadProjects();
  await loadReservations();
  $('#rSave')?.addEventListener('click', saveReservation);
});
