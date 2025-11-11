
const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } = window.__CONF__;
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (s)=>document.querySelector(s);

function toMin(hm){ const [h,m]=(hm||'00:00').split(':').map(n=>parseInt(n||'0',10)); return h*60+m; }
function overlap(s1,e1,s2,e2){ return toMin(s1) < toMin(e2) && toMin(s2) < toMin(e1); }

let EMP_CACHE = [];

async function loadEmployees(){
  const { data, error } = await sb.from('employees').select('id,name').order('name',{ascending:true});
  if(error){ $('#rMsg').textContent = 'Medewerkers laden mislukt: '+error.message; return; }
  EMP_CACHE = data||[];
  $('#rEmp').innerHTML = EMP_CACHE.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
}

function nameById(id){
  const e = EMP_CACHE.find(x=>String(x.id)===String(id));
  return e ? e.name : '?';
}

async function loadReservations(){
  const today = new Date().toISOString().slice(0,10);
  const { data, error } = await sb
    .from('vehicle_reservations')
    .select('id,reserved_by,vehicle,date,start_time,end_time,note')
    .gte('date', today)
    .order('date', { ascending: true });
  if(error){ $('#rMsg').textContent = 'Reserveringen laden mislukt: '+error.message; return; }
  const items = (data||[]).map(r=>(
    `<li>${r.date} • ${r.vehicle} • ${r.start_time}–${r.end_time} • ${nameById(r.reserved_by)}${r.note?` • ${r.note}`:''}</li>`
  ));
  $('#rList').innerHTML = items.join('') || '<li>Geen reserveringen.</li>';
}

async function saveReservation(){
  const rec = {
    reserved_by: Number($('#rEmp').value),
    vehicle: $('#rVeh').value,
    date: $('#rDate').value,
    start_time: $('#rStart').value,
    end_time: $('#rEnd').value,
    note: $('#rNote').value?.trim() || null
  };

  const msg = $('#rMsg'); msg.textContent = '';

  if(!rec.reserved_by || !rec.vehicle || !rec.date || !rec.start_time || !rec.end_time){
     msg.textContent = 'Vul alle velden in.'; return;
  }
  if(rec.end_time <= rec.start_time){
     msg.textContent = 'Eindtijd moet na starttijd liggen.'; return;
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
  await loadReservations();
  $('#rSave').addEventListener('click', saveReservation);
});
