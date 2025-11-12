// admin.js — losse beheerpagina voor projecten + gebruikers (zichtbaarheid + volgorde)
const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } = window.__CONF__;
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let ADMIN_OK=false, ADMIN_PW='';
const $=(s)=>document.querySelector(s);

let _pwT=null;
document.getElementById('adminPwd')?.addEventListener('input',e=>{ clearTimeout(_pwT); _pwT=setTimeout(()=>verifyAdmin(e.target.value||''),250); });
async function verifyAdmin(pw){ ADMIN_PW=pw||''; if(!pw){ADMIN_OK=false; render(); return;} const {data,error}=await sb.rpc('is_admin',{p_password:pw}); ADMIN_OK=!error&&!!data; const fld=document.getElementById('adminPwd'); if(fld) fld.style.borderColor=ADMIN_OK?'#33c36f':''; render(); }

let cache={employees:[],projects:[]};
async function fetchAll(){ const [emp,proj]=await Promise.all([ sb.from('employees').select('*').order('calendar_order',{ascending:true,nullsFirst:false}).order('name',{ascending:true}), sb.from('projects').select('*').order('number',{ascending:true}) ]); if(emp.error||proj.error) throw (emp.error||proj.error); cache={employees:emp.data||[],projects:proj.data||[]}; }
async function reload(){ try{ await fetchAll(); render(); }catch(e){ console.error(e); alert('Laden mislukt'); } }

document.getElementById('addProj')?.addEventListener('click', async ()=>{ const num=$('#projNumber').value.trim(), nm=$('#projName').value.trim(), sec=$('#projSect').value.trim(); if(!num||!nm) return; if(!ADMIN_OK){ alert('Beheer-wachtwoord vereist'); return; } const {error}=await sb.from('projects').insert({number:num,name:nm,section:sec||null}); if(error){ alert(error.message); return; } $('#projNumber').value=''; $('#projName').value=''; $('#projSect').value=''; await reload(); });
function renderProjects(){ document.getElementById('projList').innerHTML=(cache.projects||[]).map(p=>`${p.number} — ${p.name}${p.section?(' • '+p.section):''}`).map(s=>`<li>${s}</li>`).join(''); }

document.getElementById('addEmp')?.addEventListener('click', async ()=>{ const name=$('#empName').value.trim(); if(!name) return; if(!ADMIN_OK){ alert('Beheer-wachtwoord vereist'); return; } const {error}=await sb.rpc('add_employee',{ p_password: ADMIN_PW, p_name: name }); if(error){ alert(error.message); return; } $('#empName').value=''; await reload(); });
function renderEmployees(){ const list=cache.employees; document.getElementById('empList').innerHTML=list.map(e=>`<li data-id="${e.id}" class="emp-li"><div class="row two" style="align-items:center"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" class="emp-vis" ${e.show_in_calendar!==false?'checked':''} /><span>${e.name||''}</span></label><div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn small" data-up>↑</button><button class="btn small" data-down>↓</button></div></div></li>`).join(''); }

document.getElementById('empList')?.addEventListener('change', async (e)=>{ const t=e.target; if(!(t instanceof HTMLInputElement)) return; if(!t.classList.contains('emp-vis')) return; if(!ADMIN_OK){ alert('Beheer-wachtwoord vereist'); t.checked=!t.checked; return; } const li=t.closest('li'); if(!li) return; const id=Number(li.getAttribute('data-id')); const visible=!!t.checked; const {error}=await sb.rpc('set_employee_visibility',{ p_password: ADMIN_PW, p_id: id, p_show: visible }); if(error){ alert(error.message); t.checked=!visible; return; } await reload(); });
document.getElementById('empList')?.addEventListener('click', async (e)=>{ const btn=e.target; if(!(btn instanceof HTMLElement)) return; const li=btn.closest('li'); if(!li) return; if(!btn.hasAttribute('data-up')&&!btn.hasAttribute('data-down')) return; if(!ADMIN_OK){ alert('Beheer-wachtwoord vereist'); return; } const id=Number(li.getAttribute('data-id')); const list=[...cache.employees].sort((a,b)=>(a.calendar_order??0)-(b.calendar_order??0)||(a.name||'').localeCompare(b.name||'')); const idx=list.findIndex(e=>String(e.id)===String(id)); const neighbor=list[idx+(btn.hasAttribute('data-down')?1:-1)]; if(idx<0||!neighbor) return; const {error}=await sb.rpc('swap_employee_order',{ p_password: ADMIN_PW, p_id_a: Number(id), p_id_b: Number(neighbor.id) }); if(error){ alert(error.message); return; } await reload(); });

function render(){ renderProjects(); renderEmployees(); }
document.addEventListener('DOMContentLoaded', async ()=>{ await reload(); });