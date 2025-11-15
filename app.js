
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
function isMorning(hm){
  // alles vóór 13:00u = ochtend
  var parts = (String(hm).slice(0,5) || '00:00').split(':');
  var h = parseInt(parts[0] || '0', 10);
  return h < 13;
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
function setVal(id, value){var el = document.getElementById(id);if (el) el.value = value;}


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

function timesForBlock(block){
  if (block === 'pm')   return { start: '13:00', end: '16:00' };
  if (block === 'full') return { start: '07:30', end: '16:00' };
  return { start: '07:30', end: '12:30' }; // standaard: ochtend
}

function blockFromTimes(startHm, endHm){
  const s = _toMinLocal(startHm || '07:30');
  const e = _toMinLocal(endHm || '16:00');
  if (s < 13*60 && e <= 13*60) return 'am';   // alleen ochtend
  if (s >= 13*60)              return 'pm';   // alleen middag
  return 'full';                               // anders: hele dag
}



// Voeg minuten toe binnen de werkvensters (werkt samen met WORK_WINDOWS)
function _addWorkMinutes(startHm, minutes){
  let cur = _toMinLocal(startHm);   // huidige tijd in minuten (0–1439)
  let remaining = minutes;
  let dayOffset = 0;                // verschuiving per dag in minuten

  while (remaining > 0){
    let progressed = false;

    for (let i = 0; i < WORK_WINDOWS.length; i++){
      let wStart = WORK_WINDOWS[i][0] + dayOffset;
      let wEnd   = WORK_WINDOWS[i][1] + dayOffset;

      // als we al voorbij dit venster zijn → volgende venster
      if (cur > wEnd) continue;

      // als we vóór het venster zitten → spring naar begin venster
      if (cur < wStart) cur = wStart;

      let avail = wEnd - cur;
      if (avail <= 0) continue;

      if (remaining <= avail){
        // klaar binnen dit venster
        cur += remaining;
        remaining = 0;
      } else {
        // hele venster benutten, dan naar het volgende
        cur += avail;
        remaining -= avail;
      }

      progressed = true;
      if (remaining === 0) break;
    }

    // niks gevonden in deze dag → naar de volgende dag, eerste venster
    if (!progressed){
      dayOffset += 24*60;
      cur = WORK_WINDOWS[0][0] + dayOffset;
    }
  }

  // terug naar tijd-van-de-dag
  let t = ((cur % (24*60)) + (24*60)) % (24*60);
  let h = Math.floor(t / 60);
  let m = t % 60;
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
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

  // we gebruiken hier alleen show_in_calendar
  if (!('show_in_calendar' in patch)) return;

  const { error } = await sb.rpc('set_employee_visibility', {
    p_password: ADMIN_PW,
    p_id: Number(id),
    p_show: !!patch.show_in_calendar
  });

  if(error){ 
    alert(error.message); 
  } else {
    await reload();
  }
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
    var cell = document.getElementById('cellTpl').content.cloneNode(true).firstElementChild;
    var iso  = isoDateStr(day);

    var inner       = cell.querySelector('.cell-inner');
    var amContainer = cell.querySelector('.items-am') || cell.querySelector('.items');
    var pmContainer = cell.querySelector('.items-pm') || cell.querySelector('.items');

    var list = cache.assignments
      .filter(function(a){ return a.employee_id===emp.id && inRange(iso,a.start_date,a.end_date); })
      .sort(function(a,b){ return (a.start_date+a.start_time).localeCompare(b.start_date+b.start_time); });

    for(var k=0;k<list.length;k++){
      var a = list[k];
      var proj = cache.projects.find(function(p){ return p.id===a.project_id; });
      var item = document.getElementById('itemTpl').content.cloneNode(true).firstElementChild;

      item.classList.add(a.type || 'productie');
      if(emp && emp.name==='LOVD'){ item.classList.add('lovd'); }
      if (a.urgent) item.classList.add('urgent');

      var top1 = item.querySelector('.top1');
      var txt1 =
          (proj && proj.number ? proj.number : '') +
          (proj && proj.customer ? ' — '+proj.customer : '');

          if (a.urgent) {
          txt1 = "❗ " + txt1;
}

top1.textContent = txt1;

      item.querySelector('.top2').textContent =
        (proj ? (proj.name||'') : '') +
        (proj && proj.section ? ' — '+proj.section : '');

      // GEEN tijden/uren meer in meta
      var parts = [];
      if (a.type === 'montage' && a.vehicle && a.vehicle !== 'nvt') parts.push(a.vehicle);
      if (a.notes) parts.push(a.notes);
      item.querySelector('.meta').textContent = parts.join(' • ');

      (function(rec){
        item.addEventListener('click', function(){
          openTaskModal(rec, { readonly: !isAdmin() });
        });
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

      // ⬇️ Bepaal blok op basis van tijden en plaats item
      var blk = blockFromTimes(a.start_time, a.end_time);

      if (blk === 'full') {
        // Hele dag: één groot blok over de hele cel
        item.classList.add('full-day');
        inner.appendChild(item);
      } else if (blk === 'pm') {
        pmContainer.appendChild(item);
      } else {
        amContainer.appendChild(item);
      }
    }

    // Klik in bovenste / onderste helft → standaard blok & tijden
    cell.querySelectorAll('.dropzone').forEach(function(dz){
      var part = dz.getAttribute('data-part'); // "am" of "pm"

      (function(dateStr, partVal, empId){
        dz.addEventListener('click', function(){
          var blk = (partVal === 'pm') ? 'pm' : 'am';
          var t   = timesForBlock(blk);

          openTaskModal({
            employee_id: empId,
            project_id:  cache.projects[0]?.id || null,
            start_date:  dateStr,
            end_date:    dateStr,
            start_time:  t.start,
            end_time:    t.end,
            type:        'productie',
            vehicle:     'nvt',
            urgent:      false,
            notes:       null,
            block:       blk
          }, { readonly: !isAdmin() });
        });
      })(iso, part, emp.id);
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
  opts = opts || {}; 
  var readonly = !!opts.readonly;

  // dropdown medewerker vullen
  $('#mEmp').innerHTML = cache.employees
    .map(function(e){return '<option value="'+e.id+'">'+e.name+'</option>';})
    .join('');

  renderProjectOptions(document.getElementById('mProjSearch')?.value||'', rec.project_id);

  var edit = !!rec.id;
  $('#taskTitle').textContent = edit ? ('Taak'+(readonly?' (bekijken)':' bewerken')) : 'Taak toevoegen';

  // basisvelden
  setVal('mId',        rec.id || '');
  setVal('mEmp',       String(rec.employee_id || (cache.employees[0]&&cache.employees[0].id) || ''));
  setVal('mProj',      String(rec.project_id  || (cache.projects[0]&&cache.projects[0].id)   || ''));
  setVal('mStartDate', rec.start_date || '');
  setVal('mEndDate',   rec.end_date   || rec.start_date || '');
  setVal('mStartTime', rec.start_time || '07:30');
  setVal('mEndTime',   rec.end_time   || '16:00');
  setVal('mNotes',     rec.notes || '');

  // 🔹 URGENT (checkbox)
  var urgEl = document.getElementById('mUrgent');
  if (urgEl) urgEl.checked = !!rec.urgent;

  // 🔹 TYPE (radio name="mType")
  var typeVal = rec.type || 'productie';
  var typeRadio = document.querySelector('input[name="mType"][value="'+typeVal+'"]');
  if (typeRadio) typeRadio.checked = true;

  // 🔹 VOERTUIG (radio name="mVehicle")
  var vehVal = rec.vehicle || 'nvt';
  var vehRadio = document.querySelector('input[name="mVehicle"][value="'+vehVal+'"]');
  if (vehRadio) vehRadio.checked = true;

  // 🔹 VEHICLE ROW tonen/verbergen
  var row = document.getElementById('vehicleRow');
  if (row) row.style.display = (typeVal === 'montage') ? '' : 'none';

  // 🔹 DAGDEEL (radio name="mBlock")
  var blk = rec.block || blockFromTimes(rec.start_time, rec.end_time);
  if (!blk) blk = 'am';
  var blockRadio = document.querySelector('input[name="mBlock"][value="'+blk+'"]');
  if (blockRadio) blockRadio.checked = true;

  var saveBtn   = document.getElementById('mSave');
  var delBtn    = document.getElementById('mDelete');

  if (readonly) {
    saveBtn.style.display = 'none';
    delBtn.style.display  = 'none';
  } else {
    saveBtn.style.display = '';
    delBtn.style.display  = edit ? '' : 'none';
    delBtn.disabled       = !edit;
  }

  document.getElementById('mProjSearch')?.addEventListener(
    'input',
    function(e){ renderProjectOptions(e.target.value, document.getElementById('mProj')?.value); }
  );
  document.getElementById('mProjAdd')?.addEventListener('click', quickAddProjectViaModal);

  // inputs readonly maken (selects + tekstvelden)
  var inputs = ['#mEmp','#mProj','#mStartDate','#mEndDate','#mStartTime','#mEndTime','#mNotes']
    .map(function(s){return document.querySelector(s);});
  for(var i=0;i<inputs.length;i++){ if(inputs[i]) inputs[i].disabled = readonly; }

  // ook radios disablen bij readonly
  ['mType','mVehicle','mBlock'].forEach(function(name){
    document.querySelectorAll('input[name="'+name+'"]').forEach(function(r){
      r.disabled = readonly;
    });
  });

  document.getElementById('taskModal').hidden = false;
}


function closeTaskModal(){ 
  $('#taskModal').hidden = true; 
}

// backdrop / kruisje sluit modal
document.addEventListener('click',function(e){ 
  if(e.target.id==='modalClose' || e.target.classList.contains('modal-backdrop')) {
    closeTaskModal(); 
  }
});



// ---------- Modal & taak-bewerking ----------

function openTaskModal(rec, opts) {
  opts = opts || {};
  var readonly = !!opts.readonly;

  // Medewerker dropdown
  var empSel = document.getElementById('mEmp');
  if (empSel) {
    empSel.innerHTML = (cache.employees || [])
      .map(function (e) { return '<option value="'+e.id+'">'+e.name+'</option>'; })
      .join('');
  }

  // Projectopties
  renderProjectOptions(
    document.getElementById('mProjSearch')?.value || '',
    rec.project_id
  );

  var edit = !!rec.id;
  var title = document.getElementById('taskTitle');
  if (title) {
    title.textContent = edit
      ? ('Taak' + (readonly ? ' (bekijken)' : ' bewerken'))
      : 'Taak toevoegen';
  }

  // Basisvelden
  var firstEmpId = (cache.employees[0] && cache.employees[0].id) || '';
  var firstProjId = (cache.projects[0] && cache.projects[0].id) || '';

  setVal('mId',        rec.id || '');
  setVal('mEmp',       String(rec.employee_id || firstEmpId));
  setVal('mProj',      String(rec.project_id  || firstProjId));
  setVal('mStartDate', rec.start_date || '');
  setVal('mEndDate',   rec.end_date   || rec.start_date || '');
  setVal('mStartTime', rec.start_time || '07:30');
  setVal('mEndTime',   rec.end_time   || '16:00');
  setVal('mNotes',     rec.notes || '');

  // URGENT (checkbox)
  var urgEl = document.getElementById('mUrgent');
  if (urgEl) urgEl.checked = !!rec.urgent;

  // TYPE (radio name="mType")
  var typeVal = rec.type || 'productie';
  var typeRadio = document.querySelector('input[name="mType"][value="'+typeVal+'"]');
  if (typeRadio) typeRadio.checked = true;

  // VEHICLE (radio name="mVehicle")
  var vehVal = rec.vehicle || 'nvt';
  var vehRadio = document.querySelector('input[name="mVehicle"][value="'+vehVal+'"]');
  if (vehRadio) vehRadio.checked = true;

  // Vehicle-rij tonen/verbergen
  var vehicleRow = document.getElementById('vehicleRow');
  if (vehicleRow) {
    vehicleRow.style.display = (typeVal === 'montage') ? '' : 'none';
  }

  // DAGDEEL (radio name="mBlock")
  var blk = rec.block || blockFromTimes(rec.start_time, rec.end_time);
  if (!blk) blk = 'am';
  var blockRadio = document.querySelector('input[name="mBlock"][value="'+blk+'"]');
  if (blockRadio) blockRadio.checked = true;

  // Buttons tonen / verbergen
  var saveBtn = document.getElementById('mSave');
  var delBtn  = document.getElementById('mDelete');

  if (readonly) {
    if (saveBtn) saveBtn.style.display = 'none';
    if (delBtn)  delBtn.style.display  = 'none';
  } else {
    if (saveBtn) saveBtn.style.display = '';
    if (delBtn)  {
      delBtn.style.display  = edit ? '' : 'none';
      delBtn.disabled       = !edit;
    }
  }

  // Project zoeken / toevoegen
  var projSearch = document.getElementById('mProjSearch');
  if (projSearch) {
    projSearch.oninput = function (e) {
      renderProjectOptions(e.target.value, document.getElementById('mProj')?.value);
    };
  }
  var projAdd = document.getElementById('mProjAdd');
  if (projAdd) {
    projAdd.onclick = quickAddProjectViaModal;
  }

  // Tekst/select inputs readonly
  ['#mEmp','#mProj','#mStartDate','#mEndDate','#mStartTime','#mEndTime','#mNotes']
    .map(function (s) { return document.querySelector(s); })
    .forEach(function (inp) {
      if (inp) inp.disabled = readonly;
    });

  // Radios readonly
  ['mType','mVehicle','mBlock'].forEach(function (name) {
    document.querySelectorAll('input[name="'+name+'"]').forEach(function (r) {
      r.disabled = readonly;
    });
  });

  document.getElementById('taskModal').hidden = false;
}

function closeTaskModal() {
  var modal = document.getElementById('taskModal');
  if (modal) modal.hidden = true;
}

// backdrop / kruisje sluit modal
document.addEventListener('click', function (e) {
  if (e.target.id === 'modalClose' || e.target.classList.contains('modal-backdrop')) {
    closeTaskModal();
  }
});

// ---------- Opslaan ----------

document.getElementById('mSave').addEventListener('click', async function () {
  if (!isAdmin()) {
    alert('Wachtwoord vereist');
    return;
  }

  // ✓ correcte id extractie
  var idVal = document.getElementById('mId').value.trim();
  var id = idVal ? Number(idVal) : null;

  // ✓ alle elementen goed ophalen
  var empEl   = document.getElementById('mEmp');
  var projEl  = document.getElementById('mProj');
  var sdEl    = document.getElementById('mStartDate');
  var edEl    = document.getElementById('mEndDate');
  var stEl    = document.getElementById('mStartTime');
  var etEl    = document.getElementById('mEndTime');
  var hrsEl   = document.getElementById('mHours');
  var notesEl = document.getElementById('mNotes');
  var urgEl   = document.getElementById('mUrgent');

  var typeRadio  = document.querySelector('input[name="mType"]:checked');
  var vehRadio   = document.querySelector('input[name="mVehicle"]:checked');
  var blockRadio = document.querySelector('input[name="mBlock"]:checked');

  // ✓ rec zonder id
  var rec = {
    employee_id: Number(empEl.value),
    project_id: Number(projEl.value),
    start_date: sdEl.value,
    end_date: edEl.value,
    start_time: stEl.value,
    end_time: etEl.value,
    type: typeRadio ? typeRadio.value : 'productie',
    vehicle:
      (typeRadio && typeRadio.value === 'montage' && vehRadio)
        ? vehRadio.value
        : 'nvt',
    urgent: urgEl ? urgEl.checked : false,
    notes: notesEl.value || null
  };

  // ✓ blok stuurt tijden aan
  if (blockRadio) {
    var blk = blockRadio.value;
    var t   = timesForBlock(blk);
    rec.start_time = t.start;
    rec.end_time   = t.end;
    rec.block      = blk;
  }

  // ✓ uren → eindtijd
  if (hrsEl && hrsEl.value) {
    var hrs = parseFloat(hrsEl.value);
    if (!isNaN(hrs) && hrs > 0) {
      var startHm = rec.start_time;
      var endHm   = _addWorkMinutes(startHm, Math.round(hrs * 2) * 30);
      rec.start_time = startHm;
      rec.end_time   = endHm;
    }
  }

  // ✓ validatie
  if (!rec.employee_id || !rec.project_id || !rec.start_date) {
    alert('Vul medewerker, project en startdatum in.');
    return;
  }
  if (rec.end_date < rec.start_date) {
    alert('Einddatum ligt vóór startdatum.');
    return;
  }
  if (rec.end_time <= rec.start_time) {
    alert('Eindtijd moet na starttijd liggen.');
    return;
  }

  // ✓ voertuig clash
  if (rec.type === 'montage' && rec.vehicle !== 'nvt') {
    var clash = hasVehicleClash(rec);
    if (clash) {
      alert(
        'Voertuig dubbel geboekt op ' +
        clash.date + ' (' + clash.start + '–' + clash.end + ').'
      );
      return;
    }
  }

  // ✓ undefined → null
  Object.keys(rec).forEach(k => {
    if (rec[k] === undefined) rec[k] = null;
  });

  // ✓ CORRECTE UPDATE / INSERT
  try {
    if (!id) {
      // INSERT — GEEN id meesturen
      var ins = await sb.from('assignments').insert(rec);
      if (ins.error) throw ins.error;
    } else {
      // UPDATE — id apart meegeven
      var upd = await sb.from('assignments')
        .update(rec)
        .eq('id', id);
      if (upd.error) throw upd.error;
    }

    closeTaskModal();
    await reload();

  } catch (e) {
    console.error(e);
    alert('Opslaan mislukt: ' + (e.message || e));
  }
});


// ---------- Verwijderen ----------

document.getElementById('mDelete').addEventListener('click', async function () {
  var idVal = (document.getElementById('mId').value || '').trim();
  if (!idVal) return;
  if (!confirm('Deze taak verwijderen?')) return;
  if (!isAdmin()) { alert('Wachtwoord vereist'); return; }

  await sb.from('assignments').delete().eq('id', Number(idVal));
  closeTaskModal();
  await reload();
});

// Type-radio's: voertuig-rij live tonen/verbergen
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('input[name="mType"]').forEach(function (r) {
    r.addEventListener('change', function () {
      var t = document.querySelector('input[name="mType"]:checked')?.value;
      var row = document.getElementById('vehicleRow');
      if (row) row.style.display = (t === 'montage') ? '' : 'none';
    });
  });
});


// --- Type radio's ---
document.querySelectorAll('input[name="mType"]').forEach(r => {
  r.addEventListener("change", () => {
    const t = document.querySelector('input[name="mType"]:checked')?.value;
    const row = document.getElementById("vehicleRow");
    if (row) row.style.display = (t === "montage") ? "" : "none";
  });
});

// Type-radio's: voertuig-rij tonen/verbergen
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('input[name="mType"]').forEach(function(radio){
    radio.addEventListener('change', function(){
      var t = document.querySelector('input[name="mType"]:checked')?.value;
      var row = document.getElementById('vehicleRow');
      if (row) row.style.display = (t === 'montage') ? '' : 'none';
    });
  });
});


// ---------- Admin-wachtwoord controleren ----------
async function verifyAdminPlanner(pw){
  ADMIN_PW = pw || '';
  if(!pw){ ADMIN_OK = false; render(); return; }
  const { data, error } = await sb.rpc('is_admin', { p_password: pw });
  ADMIN_OK = !error && !!data;
  const fld = document.getElementById('adminPwd');
  if(fld){ fld.style.borderColor = ADMIN_OK ? '#33c36f' : ''; }
  render();
}

// ---------- Wire ----------
function wire(){
  // einddatum volgt standaard startdatum
  (function(){
    const sd = document.getElementById('mStartDate');
    const ed = document.getElementById('mEndDate');
    if (sd && ed) {
      sd.addEventListener('change', function(){
        if (sd.value) {
          ed.value = sd.value;
        }
      });
    }
  })();

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

  document.getElementById('adminPwd').addEventListener('input', (e)=>{
    const pw = e.target.value;
    clearTimeout(window.__admT);
    window.__admT = setTimeout(()=> verifyAdminPlanner(pw), 250);
  });
}

// Initialisatie
document.addEventListener('DOMContentLoaded',async function(){
  wire();
  await reload();
});
