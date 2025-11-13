// admin.js — beheer projecten + medewerkers
const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } = window.__CONF__;
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let ADMIN_OK = false;
let ADMIN_PW = '';
const $ = (s)=>document.querySelector(s);

// --- admin verify ---
let _pwT=null;
document.getElementById('adminPwd')?.addEventListener('input', (e)=>{
  clearTimeout(_pwT);
  _pwT = setTimeout(()=> verifyAdmin(e.target.value||''), 200);
});
async function verifyAdmin(pw){
  ADMIN_PW = pw || '';
  if(!pw){ ADMIN_OK=false; render(); return; }
  const { data, error } = await sb.rpc('is_admin', { p_password: pw });
  ADMIN_OK = !error && !!data;
  const fld = document.getElementById('adminPwd');
  if (fld) fld.style.borderColor = ADMIN_OK ? '#33c36f' : '';
  render();
}

// --- data cache ---
let cache = { employees: [], projects: [] };

async function fetchAll(){
  try{
    const empQ = sb.from('employees')
      .select('id,name,calendar_order,show_in_calendar')
      .order('calendar_order', { ascending:true, nullsFirst:false })
      .order('name', { ascending:true });
    const projQ = sb.from('projects')
      .select('id,number,customer,name,section')
      .order('number', { ascending:true, nullsFirst:true })
      .order('name', { ascending:true });
    const [emp, proj] = await Promise.all([empQ, projQ]);
    if(emp.error) throw emp.error;
    if(proj.error) throw proj.error;
    cache = { employees: emp.data||[], projects: proj.data||[] };
    console.log('Loaded', cache.employees.length, 'employees;', cache.projects.length, 'projects');
  }catch(err){
    console.error('fetchAll failed:', err);
    throw err;
  }
}

async function reload(){
  try{ await fetchAll(); render(); }
  catch(e){ alert('Laden mislukt: '+(e?.message||e)); }
}

// --- UI render ---
function render(){
  renderProjects();
  renderEmployees();
}

// Projects
document.getElementById('addProj')?.addEventListener('click', async ()=>{
  const num  = $('#projNumber').value.trim();
  const cust = $('#projCustomer').value.trim();
  const name = $('#projName').value.trim();
  const sect = $('#projSect').value.trim();
  if(!name){ alert('Projectnaam is verplicht'); return; }
  if(!ADMIN_OK){ alert('Beheer-wachtwoord vereist'); return; }
  const { error } = await sb.from('projects').insert({ number: num||null, customer: cust||null, name, section: sect||null });
  if(error){ alert('Toevoegen mislukt: '+error.message+'\n(Heb je de kolom customer al?)'); return; }
  $('#projNumber').value=''; $('#projCustomer').value=''; $('#projName').value=''; $('#projSect').value='';
  await reload();
});

function renderProjects(){
  const list = $('#projList');
  const rows = (cache.projects || []).map(p => `
    <li data-id="${p.id}" class="proj-item" style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
      <input class="p-num"  placeholder="Nr"          value="${p.number||''}"   style="width:90px" />
      <input class="p-cust" placeholder="Klant"       value="${p.customer||''}" style="width:150px" />
      <input class="p-name" placeholder="Projectnaam" value="${p.name||''}"     style="flex:1" />
      <input class="p-sect" placeholder="Sectie"      value="${p.section||''}"  style="width:120px" />
      <div style="display:flex; gap:6px; margin-left:auto;">
        <button class="btn small" data-save title="Opslaan">💾</button>
        <button class="btn small ghost" data-del title="Verwijderen">🗑</button>
      </div>
    </li>
  `).join('');
  list.innerHTML = rows || '<li>(nog geen projecten)</li>';
}

// Project list actions: save/delete
document.getElementById('projList')?.addEventListener('click', async (e)=>{
  const btn = e.target;
  if(!(btn instanceof HTMLElement)) return;
  const li = btn.closest('li'); if(!li) return;
  const id = Number(li.getAttribute('data-id'));
  if(btn.hasAttribute('data-save')){
    if(!ADMIN_OK){ alert('Beheer-wachtwoord vereist'); return; }
    const num  = li.querySelector('.p-num')?.value?.trim()  || null;
    const cust = li.querySelector('.p-cust')?.value?.trim() || null;
    const name = li.querySelector('.p-name')?.value?.trim() || '';
    const sect = li.querySelector('.p-sect')?.value?.trim() || null;
    if(!name){ alert('Projectnaam is verplicht'); return; }
    const { error } = await sb.from('projects').update({ number:num, customer:cust, name, section:sect }).eq('id', id);
    if(error){ alert('Opslaan mislukt: '+error.message); return; }
    await reload();
  }
  if(btn.hasAttribute('data-del')){
    if(!ADMIN_OK){ alert('Beheer-wachtwoord vereist'); return; }
    if(!confirm('Project verwijderen?')) return;
    const { error } = await sb.from('projects').delete().eq('id', id);
    if(error){ alert('Verwijderen mislukt: '+error.message); return; }
    await reload();
  }
});

// Employees
document.getElementById('addEmp')?.addEventListener('click', async ()=>{
  const name = $('#empName').value.trim();
  if(!name) return;
  if(!ADMIN_OK){ alert('Beheer-wachtwoord vereist'); return; }
  const { error } = await sb.rpc('add_employee', { p_password: ADMIN_PW, p_name: name });
  if(error){ alert(error.message); return; }
  $('#empName').value='';
  await reload();
});

function renderEmployees(){
  const list = cache.employees;
  const holder = document.getElementById('empList');
  if(!list || list.length===0){ holder.innerHTML = '<li>(nog geen medewerkers)</li>'; return; }
  holder.innerHTML = list.map(e=>`
    <li data-id="${e.id}" class="emp-li">
      <div class="row two" style="align-items:center">
        <label style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" class="emp-vis" ${e.show_in_calendar!==false?'checked':''} />
          <span>${e.name||''}</span>
        </label>
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="btn small" data-up>↑</button>
          <button class="btn small" data-down>↓</button>
        </div>
      </div>
    </li>
  `).join('');
}

// visibility + order handlers
document.getElementById('empList')?.addEventListener('change', async (e)=>{
  const t = e.target;
  if(!(t instanceof HTMLInputElement)) return;
  if(!t.classList.contains('emp-vis')) return;
  if(!ADMIN_OK){ alert('Beheer-wachtwoord vereist'); t.checked = !t.checked; return; }
  const li = t.closest('li'); if(!li) return;
  const id = Number(li.getAttribute('data-id'));
  const visible = !!t.checked;
  const { error } = await sb.rpc('set_employee_visibility', { p_password: ADMIN_PW, p_id: id, p_show: visible });
  if(error){ alert(error.message); t.checked = !visible; return; }
  await reload();
});

document.getElementById('empList')?.addEventListener('click', async (e)=>{
  const btn = e.target;
  if(!(btn instanceof HTMLElement)) return;
  const li = btn.closest('li'); if(!li) return;
  if(!btn.hasAttribute('data-up') && !btn.hasAttribute('data-down')) return;
  if(!ADMIN_OK){ alert('Beheer-wachtwoord vereist'); return; }

  const id = Number(li.getAttribute('data-id'));
  const list = [...cache.employees]
    .sort((a,b)=> (a.calendar_order??0)-(b.calendar_order??0) || (a.name||'').localeCompare(b.name||''));
  const idx = list.findIndex(e => String(e.id)===String(id));
  const neighbor = list[idx + (btn.hasAttribute('data-down') ? 1 : -1)];
  if(idx < 0 || !neighbor) return;

  const { error } = await sb.rpc('swap_employee_order', { p_password: ADMIN_PW, p_id_a: Number(id), p_id_b: Number(neighbor.id) });
  if(error){ alert(error.message); return; }
  await reload();
});

document.addEventListener('DOMContentLoaded', reload);
