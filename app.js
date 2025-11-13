
// --- Project select: filter & quick-add ---
function renderProjectOptions(filter, preselectId){
  var q = String(filter||'').toLowerCase();
  var opts = (cache.projects||[]).filter(function(p){
    var label = (p.number ? (p.number+' — ') : '') + (p.name||'');
    return !q || label.toLowerCase().includes(q);
  }).map(function(p){
    var label = (p.number ? (p.number+' — ') : '') + (p.name||'');
    return '<option value="'+p.id+'">'+label+'</option>';
  }).join('');
  var sel = document.getElementById('mProj');
  if (sel) sel.innerHTML = opts;
  if (preselectId != null && sel) sel.value = String(preselectId);
}

async function quickAddProjectViaModal(){
  if(!isAdmin()){ alert('Beheer-wachtwoord vereist om een project toe te voegen.'); return; }
  var number = prompt('Projectnummer (optioneel):','');
  if(number!==null){ number = number.trim(); }
  var name = prompt('Projectnaam (verplicht):','');
  if(name==null) return;
  name = name.trim();
  if(!name){ alert('Projectnaam is verplicht.'); return; }
  try{
    var { data, error } = await sb.from('projects').insert({ number: number||null, name: name }).select().single();
    if(error){ alert('Project toevoegen mislukt: '+error.message); return; }
    // update cache & UI
    cache.projects.push(data);
    renderProjectOptions(document.getElementById('mProjSearch')?.value || '', data.id);
  }catch(e){
    alert('Project toevoegen mislukt: '+(e?.message||e));
  }
}
// app.js — clean full replacement with employee visibility + ordering
const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } = window.__CONF__;
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let ADMIN_OK = false;
let ADMIN_PW = '';


// ---------- Small helpers ----------
const $ = (s)=>document.querySelector(s);
function el(t,c,txt){const n=document.createElement(t); if(c) n.className=c; if(txt!=null) n.textContent=txt; return n;}
function fmtDate(d){return d.toLocaleDateString('nl-NL',{weekday:'short', day:'numeric', month:'short'});}
function isoDateStr(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function startOfWeek(date){const d=new Date(date);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(0,0,0,0);return d;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function getWeekNumber(d){ const date=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dayNum=date.getUTCDay()||7; date.setUTCDate(date.getUTCDate()+4-dayNum); const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1)); const weekNo=Math.ceil((((date-yearStart)/86400000)+1)/7); return String(weekNo).padStart(2,'0');}
function toMin(hm){const parts=(hm||'00:00').split(':'); const h=parseInt(parts[0]||'0',10), m=parseInt(parts[1]||'0',10); return h*60+m;}
function overlap(s1,e1,s2,e2){const a1=toMin(s1),a2=toMin(e1),b1=toMin(s2),b2=toMin(e2);return a1<b2&&b1<a2;}

// Work windows in minutes: [07:30-09:30], [09:45-12:30], [13:00-16:00]
const WORK_WINDOWS = [
  [7*60+30, 9*60+30],
  [9*60+45, 12*60+30],
  [13*60,   16*60]
];
function _toMinLocal(hm){ const parts=(String(hm).slice(0,5)||'00:00').split(':'); const h=parseInt(parts[0]||'0',10), m=parseInt(parts[1]||'0',10); return h*60+m; }
function _normalizeSpanMins(s,e){ let a=_toMinLocal(s), b=_toMinLocal(e); if (b<=a) b+=24*60; return [a,b]; }
function overlapMinutes(aStart,aEnd,bStart,bEnd){
  const s=Math.max(aStart,bStart), e=Math.min(aEnd,bEnd);
  return Math.max(0, e - s);
}
function effectiveWorkMinutes(startHm,endHm){
  const [aStart,aEnd] = _normalizeSpanMins(startHm,endHm);
  let total = 0;
  for (let i=0;i<WORK_WINDOWS.length;i++){
    const [wS,wE] = WORK_WINDOWS[i];
    // controleer overlaps voor mogelijke +24u scenario
    total += overlapMinutes(aStart,aEnd,wS,wE);
    // als taak over middernacht gaat, check ook window +24u
    total += overlapMinutes(aStart,aEnd,wS+24*60,wE+24*60);
  }
  return total;
}
function durHoursWorkday(startHm,endHm){
  const mins = effectiveWorkMinutes(startHm,endHm);
  const hours = mins/60;
  const rounded = Math.round(hours*10)/10;
  return String(rounded).replace(/\.0$/, '');
}


function durHoursLabel(s,e){
  const toM = (hm)=>{ const [h,m]=(hm||'00:00').split(':'); return parseInt(h||'0',10)*60 + parseInt(m||'0',10); };
  let mins = toM(e) - toM(s);
  if (mins <= 0) mins += 24*60; // support cross-midnight just in case
  const hours = mins / 60;
  const rounded = Math.round(hours * 10) / 10;
  return String(rounded).replace(/\.0$/, '') + ' u';
}

function inRange(d,s,e){return d>=s&&d<=e;}
function eachIso(s,e){const out=[];const S=new Date(s+'T00:00'),E=new Date(e+'T00:00');for(let d=new Date(S);d<=E;d.setDate(d.getDate()+1))out.push(isoDateStr(d));return out;}
function namesLabel(list){
  const uniq = [];
  for(var i=0;i<list.length;i++){
    var nm = list[i].name || '?';
    if(uniq.indexOf(nm)===-1) uniq.push(nm);
  }
  if(uniq.length <= 2) return uniq.join(', ');
  return uniq[0]+', '+uniq[1]+' +' + (uniq.length-2);
}

// ---------- State ----------
var currentMonday = startOfWeek(new Date());
// editor sidebar removed
var cache={employees:[],projects:[],assignments:[],reservations:[]};

function isAdmin(){ return ADMIN_OK; }

// ---------- Data ----------
async function fetchAll(){
  const empQ = sb.from('employees').select('*').order('calendar_order', { ascending: true, nullsFirst: false }).order('name', { ascending: true });
  const projQ = sb.from('projects').select('*').order('number',{ascending:true});
  const asgQ  = sb.from('assignments').select('*');
  const resQ  = sb.from('vehicle_reservations').select('*');
  const [emp,proj,asg,res]=await Promise.all([empQ,projQ,asgQ,resQ]);
  if(emp.error||proj.error||asg.error||res.error) throw (emp.error||proj.error||asg.error||res.error);
  return {employees:emp.data,projects:proj.data,assignments:asg.data,reservations:res.data};
}
async function reload(){ try{ cache=await fetchAll(); render(); }catch(e){ console.error(e); alert('Laden mislukt (controleer Supabase policies/schema)'); } }

async function addEmployee(name){
  if(!isAdmin()) { alert('Wachtwoord vereist'); return; }
  const { error } = await sb.rpc('add_employee', {
    p_password: ADMIN_PW,
    p_name: name
  });
  if(error) alert(error.message); else reload();
}


async function updateEmployee(id, patch){
  if(!isAdmin()) { alert('Wachtwoord vereist'); return; }

  // we gebruiken nu alleen show_in_calendar via RPC
  if (!('show_in_calendar' in patch)) return;
  const pw = document.getElementById('adminPwd').value || '';
  const { error } = await sb.rpc('set_employee_visibility', { p_password: ADMIN_PW, p_id: id, p_show: t.checked });
                    await sb.rpc('swap_employee_order', { p_password: ADMIN_PW, p_id_a: id, p_id_b: neighborId });
  if(error) { alert(error.message); return; }
  await reload();
}

async function moveEmployee(id, dir){
  if(!isAdmin()) { alert('Wachtwoord vereist'); return; }

  // bepaal buur-id in de huidige sortering
  const list = [...cache.employees]
    .sort((a,b)=> (a.calendar_order??0)-(b.calendar_order??0) || (a.name||'').localeCompare(b.name||''));

  const idx = list.findIndex(e => String(e.id)===String(id));
  const neighbor = list[idx + (dir==='down'? 1 : -1)];
  if(idx < 0 || !neighbor) return;

  const pw = document.getElementById('adminPwd').value || '';
  const { error } = await sb.rpc('swap_employee_order', {
    p_password: pw,
    p_id_a: Number(id),
    p_id_b: Number(neighbor.id)
  });
  if(error){ alert(error.message); return; }
  await reload();
}

// ---------- Vehicle bar helpers ----------
function vehicleDayInfo(iso){
  var bus=[],bak=[],busPriv=[],bakPriv=[];
  try {
    for (var i=0;i<cache.assignments.length;i++){
      var a = cache.assignments[i];
      if (a.type!=='montage') continue;
      if (!a.vehicle || a.vehicle==='nvt') continue;
      if (!inRange(iso,a.start_date,a.end_date)) continue;
      var emp = cache.employees.find(function(e){ return String(e.id)===String(a.employee_id); });
      var pack = { name: emp ? emp.name : '?', s:a.start_time, e:a.end_time, proj:a.project_id };
      if (a.vehicle==='bus') bus.push(pack); else if (a.vehicle==='bakwagen') bak.push(pack);
    }
    for (var j=0;j<cache.reservations.length;j++){
      var r = cache.reservations[j];
      if (r.date!==iso) continue;
      var empId = (r.employee_id!=null ? r.employee_id : r.reserved_by);
      var emp2 = cache.employees.find(function(e){ return String(e.id)===String(empId); });
      var pack2 = { name: emp2 ? emp2.name : '?', s:r.start_time, e:r.end_time, proj:r.project_id || null };
      var kind = (r.kind === 'project') ? 'project' : 'private';
      if (r.vehicle==='bus'){
        if (kind === 'project') bus.push(pack2); else busPriv.push(pack2);
      } else if (r.vehicle==='bakwagen'){
        if (kind === 'project') bak.push(pack2); else bakPriv.push(pack2);
      }
    }
  } catch (e) {
    console.error('vehicleDayInfo error', e);
  }
  return { bus:bus, bak:bak, busPriv:busPriv, bakPriv:bakPriv };
}

/** Check vehicle double-booking against existing assignments and reservations */
function hasVehicleClash(rec){
  try{
    if(rec.type !== 'montage') return null;
    if(!rec.vehicle || rec.vehicle === 'nvt') return null;
    if(!rec.start_date || !rec.end_date || !rec.start_time || !rec.end_time) return null;

    function isoRange(startIso, endIso){
      const out=[]; const S=new Date(startIso+'T00:00'); const E=new Date(endIso+'T00:00');
      for(let d=new Date(S); d<=E; d.setDate(d.getDate()+1)){
        const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
        out.push(`${y}-${m}-${day}`);
      }
      return out;
    }
    function toMin(hm){ const [h,m]=(String(hm).slice(0,5)||'00:00').split(':'); return parseInt(h||'0',10)*60 + parseInt(m||'0',10); }
    function overlap(s1,e1,s2,e2){ const a1=toMin(s1), a2=toMin(e1), b1=toMin(s2), b2=toMin(e2); return a1 < b2 && b1 < a2; }

    const days = isoRange(rec.start_date, rec.end_date);
    for(let di=0; di<days.length; di++){
      const iso = days[di];

      // Check against reservations (same vehicle, same date)
      const resSameDay = (cache.reservations||[]).filter(r => r.vehicle===rec.vehicle && r.date===iso);
      for(let i=0;i<resSameDay.length;i++){
        const r = resSameDay[i];
        if(overlap(rec.start_time, rec.end_time, r.start_time, r.end_time)){
          return { kind:'reservation', date: iso, start: r.start_time, end: r.end_time };
        }
      }

      // Check against other assignments of type montage with same vehicle
      const asgSameVeh = (cache.assignments||[]).filter(a => a.type==='montage' && a.vehicle===rec.vehicle);
      for(let j=0;j<asgSameVeh.length;j++){
        const a = asgSameVeh[j];
        if(rec.id && String(a.id)===String(rec.id)) continue;
        const inDay = (iso >= a.start_date && iso <= a.end_date);
        if(!inDay) continue;
        if(overlap(rec.start_time, rec.end_time, a.start_time, a.end_time)){
          return { kind:'assignment', date: iso, start: a.start_time, end: a.end_time };
        }
      }
    }
    return null;
  }catch(e){
    console.error('hasVehicleClash error', e);
    return null;
  }
}


// ---------- Render ----------
function headerRow(grid,monday){
  grid.appendChild(el('div','corner','Medewerker — Week '+getWeekNumber(monday)));
  for(var i=0;i<7;i++){ grid.appendChild(el('div','dow',fmtDate(addDays(monday,i)))); }
}
function employeeRow(grid,emp,days){
  grid.appendChild(el('div','emp',emp.name));
  for(var d=0; d<days.length; d++){
    var day = days[d];
    var cell=document.getElementById('cellTpl').content.cloneNode(true).firstElementChild;
    var iso=isoDateStr(day);
    var list=cache.assignments
      .filter(function(a){ return a.employee_id===emp.id && inRange(iso,a.start_date,a.end_date); })
      .sort(function(a,b){ return (a.start_date+a.start_time).localeCompare(b.start_date+b.start_time); });

    for(var k=0;k<list.length;k++){
      var a=list[k];
      var proj = cache.projects.find(function(p){ return p.id===a.project_id; });
      var item = document.getElementById('itemTpl').content.cloneNode(true).firstElementChild;
      item.classList.add(a.type || 'productie');
      if(emp && emp.name==='LOVD'){ item.classList.add('lovd'); }
      if (a.urgent) item.classList.add('urgent');
      item.querySelector('.top1').textContent = (proj && proj.number ? proj.number : '') + (proj && proj.customer ? ' — '+proj.customer : '');
      item.querySelector('.top2').textContent = (proj ? (proj.name||'') : '') + (proj && proj.section ? ' — '+proj.section : '');

      
      var showTimes = !(a.notes && String(a.notes).includes('[auto-time]'));
      var parts = [];
      // times first
      var parts = []
      // then (optionally) times
      if (showTimes) parts.push(a.start_time+'–'+a.end_time);
      // vehicle
      if (a.type === 'montage' && a.vehicle && a.vehicle !== 'nvt') parts.push(a.vehicle);
      // notes
      if (a.notes) parts.push(a.notes);
      // admin-only hours at the end
      if (isAdmin()) parts.push(durHoursWorkday(a.start_time,a.end_time)+' u');
      item.querySelector('.meta').textContent = parts.join(' • ');


      (function(obj){
        item.addEventListener('click', function(){ openTaskModal(obj, { readonly: !isAdmin() }); });
      })(a);

      var delBtn = item.querySelector('.x');
      if (!isAdmin()) {
        delBtn.style.display = 'none';
      } else {
        (function(id){
          delBtn.addEventListener('click', async function(e){
            e.stopPropagation();
            if (!confirm('Taak verwijderen?')) return;
            await sb.from('assignments').delete().eq('id',id);
            await reload();
          });
        })(a.id);
      }

      cell.querySelector('.items').appendChild(item);
    }

    cell.querySelector('.dropzone').addEventListener('click', function(){
      openTaskModal({
        project_id: cache.projects[0]?.id || null,
        start_date: iso,
        end_date: iso,
        start_time: '07:00',
        end_time: '16:00',
        type: 'productie',
        vehicle: 'nvt',
        urgent: false,
        notes: null
      }, { readonly: !isAdmin() });
    });

    grid.appendChild(cell);
  }
}

function renderVehicleBar(bar,monday){
  bar.innerHTML='';
  bar.appendChild(el('div','label','Voertuigen'));
  for(var i=0;i<7;i++){
    var iso=isoDateStr(addDays(monday,i));
    var info=vehicleDayInfo(iso);
    var cell=el('div','cell','');

    var tips=[];
    if(info.bus.length)     tips.push('Bus: '+info.bus.map(function(t){return t.name+' '+t.s+'-'+t.e;}).join(', '));
    if(info.busPriv.length) tips.push('Bus privé: '+info.busPriv.map(function(t){return t.name+' '+t.s+'-'+t.e;}).join(', '));
    if(info.bak.length)     tips.push('Bakwagen: '+info.bak.map(function(t){return t.name+' '+t.s+'-'+t.e;}).join(', '));
    if(info.bakPriv.length) tips.push('Bakwagen privé: '+info.bakPriv.map(function(t){return t.name+' '+t.s+'-'+t.e;}).join(', '));
    cell.title = tips.join(' | ') || '';

    var badges=[];
    if(info.bus.length)     badges.push(el('span','badge bus','Bus'));
    if(info.busPriv.length) badges.push(el('span','badge bus private','Bus ('+namesLabel(info.busPriv)+')'));
    if(info.bak.length)     badges.push(el('span','badge bakwagen','Bakwagen'));
    if(info.bakPriv.length) badges.push(el('span','badge bakwagen private','Bakwagen ('+namesLabel(info.bakPriv)+')'));

    for(var b=0;b<badges.length;b++){ cell.appendChild(badges[b]); }
    bar.appendChild(cell);
  }
}

function render(){
  var m1=currentMonday, m2=addDays(currentMonday,7);
  $('#weekLabel').textContent='Week '+getWeekNumber(m1)+' & '+getWeekNumber(m2)+' — '+fmtDate(m1)+' t/m '+fmtDate(addDays(m2,6));
  renderWeek($('#gridWeek1'),m1,$('#vehWeek1'));
  renderWeek($('#gridWeek2'),m2,$('#vehWeek2'));
}
function renderWeek(grid,monday,bar){
  grid.innerHTML='';
  headerRow(grid,monday);
  var days=[]; for(var i=0;i<7;i++){ days.push(addDays(monday,i)); }

  
// Only employees with show_in_calendar !== false
  var emps = cache.employees.filter(function(e){ return e.show_in_calendar !== false; });
  // LOVD always first
  emps.sort(function(a,b){ if(a.name==='LOVD') return -1; if(b.name==='LOVD') return 1; return (a.name||'').localeCompare(b.name||''); });
  if(emps.length===0){
    grid.appendChild(el('div','emp','(nog geen medewerkers)'));
    for(var i=0;i<7;i++){ grid.appendChild(el('div','cell')); }
  }else{
    for(var i=0;i<emps.length;i++){
      var emp = emps[i];
      if(emp.name==='LOVD' && !isAdmin()){
        var hasLovd = false;
        for(var d=0; d<days.length && !hasLovd; d++){
          var iso = isoDateStr(days[d]);
          for(var aidx=0; aidx<cache.assignments.length; aidx++){
            var a = cache.assignments[aidx];
            if(a.employee_id===emp.id && inRange(iso, a.start_date, a.end_date)){ hasLovd = true; break; }
          }
        }
        if(!hasLovd) continue;
      }
      employeeRow(grid, emp, days);
    }
  }
renderVehicleBar(bar,monday);
}

// ---------- Modal (unchanged core) ----------
function openTaskModal(rec, opts){
  opts = opts || {}; var readonly = !!opts.readonly;
  $('#mEmp').innerHTML = cache.employees.map(function(e){return '<option value="'+e.id+'">'+e.name+'</option>';}).join('');
  renderProjectOptions(document.getElementById('mProjSearch')?.value||'', rec.project_id);

  var edit = !!rec.id;
  $('#taskTitle').textContent = edit ? ('Taak'+(readonly?' (bekijken)':' bewerken')) : 'Taak toevoegen';
  $('#mId').value = rec.id || '';
  $('#mEmp').value = String(rec.employee_id || (cache.employees[0]&&cache.employees[0].id) || '');
  $('#mProj').value = String(rec.project_id || (cache.projects[0]&&cache.projects[0].id) || '');
  $('#mStartDate').value = rec.start_date || '';
  $('#mEndDate').value   = rec.end_date || rec.start_date || '';
  $('#mStartTime').value = rec.start_time || '08:00';
  $('#mEndTime').value   = rec.end_time   || '16:00';
  $('#mType').value      = rec.type || 'productie';
  $('#mVehicle').value   = rec.vehicle || 'nvt';
  $('#mUrgent').value    = rec.urgent ? 'true' : 'false';
  $('#mNotes').value     = rec.notes || '';

  document.getElementById('vehicleRow').style.display = ($('#mType').value==='montage') ? '' : 'none';

  var saveBtn   = document.getElementById('mSave');
  var delBtn    = document.getElementById('mDelete');

  if (readonly) {
    saveBtn.style.display = 'none';
    delBtn.style.display  = 'none';
  } else {
    saveBtn.style.display = '';
    delBtn.style.display  = edit ? '' : 'none';
    delBtn.disabled = !edit;
  }

  document.getElementById('mProjSearch')?.addEventListener('input', function(e){ renderProjectOptions(e.target.value, document.getElementById('mProj')?.value); });
  document.getElementById('mProjAdd')?.addEventListener('click', quickAddProjectViaModal);
  var inputs = ['#mEmp','#mProj','#mStartDate','#mEndDate','#mStartTime','#mEndTime','#mType','#mVehicle','#mUrgent','#mNotes']
    .map(function(s){return document.querySelector(s);});
  for(var i=0;i<inputs.length;i++){ if(inputs[i]) inputs[i].disabled = readonly; }

  document.getElementById('taskModal').hidden = false;
}
function closeTaskModal(){ $('#taskModal').hidden=true; }

document.addEventListener('click',function(e){ if(e.target.id==='modalClose'||e.target.classList.contains('modal-backdrop')) closeTaskModal(); });
$('#mSave').addEventListener('click',async function(){
  var rec={
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
  if(!rec.employee_id||!rec.project_id||!rec.start_date){ alert('Vul medewerker, project en datum in'); return; }
  if(rec.end_date<rec.start_date){ alert('Einddatum vóór start'); return; }
  if(rec.start_time && rec.end_time && rec.end_time<=rec.start_time){ alert('Eindtijd na start'); return; }

  
  // Prevent double booking for vehicles from tasks
  if (rec.type === 'montage' && rec.vehicle && rec.vehicle !== 'nvt') {
    const clash = hasVehicleClash(rec);
    if (clash) {
      alert('Voertuig dubbel geboekt op '+clash.date+' ('+clash.start+'–'+clash.end+'). Kies een andere tijd of voertuig.');
      return;
    }
  }

  // derive start/end from hours (30-min blocks) if hours provided or times missing
  var hoursInput = document.getElementById('mHours');
  var hrs = hoursInput ? parseFloat(hoursInput.value||'') : NaN;
  if (!isNaN(hrs) && hrs>0){
    // compute end from start or from first window if no start provided
    var startHm = rec.start_time && rec.start_time !== '' ? rec.start_time : '07:30';
    var endHm = _addWorkMinutes(startHm, Math.round(hrs*60/30)*30);
    rec.start_time = startHm;
    rec.end_time = endHm;
    // mark notes to hide explicit times in UI if start wasn't given
    if ($('#mStartTime').value==='' || $('#mEndTime').value===''){
      rec.notes = (rec.notes?rec.notes+' ':'') + '[auto-time]';
    }
  } else {
    // fallback: require both times
    if(!rec.start_time || !rec.end_time){ alert('Vul óf uren in, óf begin- en eindtijd.'); return; }
  }
// insert/update
  if(!isAdmin()) { alert('Wachtwoord vereist'); return; }
  if(rec.id){ await sb.from('assignments').update(rec).eq('id',rec.id); } else { await sb.from('assignments').insert(rec); }
  closeTaskModal(); await reload();
});
$('#mDelete').addEventListener('click',async function(){
  var id=$('#mId').value; if(!id) return;
  if(!confirm('Deze taak verwijderen?')) return;
  if(!isAdmin()) { alert('Wachtwoord vereist'); return; }
  await sb.from('assignments').delete().eq('id',Number(id)); closeTaskModal(); await reload();
});
$('#mType').addEventListener('change',function(){ document.getElementById('vehicleRow').style.display = ($('#mType').value==='montage')?'':'none'; });

async function verifyAdminPlanner(pw){
  ADMIN_PW = pw || '';
  if(!pw){ ADMIN_OK = false; render(); return; }
  const { data, error } = await sb.rpc('is_admin', { p_password: pw });
  ADMIN_OK = !error && !!data;
  // Optionele visuele hint:
  const fld = document.getElementById('adminPwd');
  if(fld){ fld.style.borderColor = ADMIN_OK ? '#33c36f' : ''; }
  render();
}


// ---------- Wire ----------
function wire(){
  // Keep end date in sync with start date (user can still change it afterwards)
  (function(){
    const sd = document.getElementById('mStartDate');
    const ed = document.getElementById('mEndDate');
    if (sd && ed) {
      sd.addEventListener('change', function(){
        if (sd.value) {
          ed.value = sd.value; // default end = start; still editable
        }
      });
    }
  })();

  // Date picker helpers (force-open native picker if supported)
  document.getElementById('pickStart')?.addEventListener('click', function(){
    const inp = document.getElementById('mStartDate');
    if (inp && typeof inp.showPicker === 'function') { try { inp.showPicker(); } catch(_) { inp.focus(); } } else { inp?.focus(); }
  });
  document.getElementById('pickEnd')?.addEventListener('click', function(){
    const inp = document.getElementById('mEndDate');
    if (inp && typeof inp.showPicker === 'function') { try { inp.showPicker(); } catch(_) { inp.focus(); } } else { inp?.focus(); }
  });

  $('#prevWeek').addEventListener('click',function(){currentMonday=addDays(currentMonday,-7); render();});
  $('#nextWeek').addEventListener('click',function(){currentMonday=addDays(currentMonday,7); render();});
  $('#todayBtn').addEventListener('click',function(){currentMonday=startOfWeek(new Date()); render();});

  
  


  // Export
document.getElementById('adminPwd').addEventListener('input', (e)=>{
  const pw = e.target.value;
  // klein debouncetje
  clearTimeout(window.__admT);
  window.__admT = setTimeout(()=> verifyAdminPlanner(pw), 250);
});

}

document.addEventListener('DOMContentLoaded',async function(){ wire(); await reload(); });