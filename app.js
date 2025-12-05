
// ==========================================================
//  SUPABASE CLIENT
// ==========================================================

// ============================================
// THEMA LOADER (MOET BOVENAAN) 
// ============================================
function loadTheme() {
    const saved = localStorage.getItem("planner-theme");
    if (saved) {
        document.documentElement.className = saved;
    } else {
        document.documentElement.classList.add("theme-light");
    }
}

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.contains("theme-dark");
    html.classList.toggle("theme-dark", !isDark);
    html.classList.toggle("theme-light", isDark);
    localStorage.setItem("planner-theme", html.className);
}


// deze twee mag je laten staan als je wilt, maar ze worden niet meer gebruikt
let ADMIN_OK = false;
let ADMIN_PW = "";
let cache = { employees: [], projects: [], assignments: [], reservations: [] };
let PROJECTS = [];
let SECTIONS = [];

// Gebruik voortaan de admin-vlag uit auth.js
function isAdmin() {
  return window.__IS_ADMIN === true;
}

// ==========================================================
//  KLEINE HELPERS
// ==========================================================
const $ = (s) => document.querySelector(s);


async function loadSectionOptions(projectId, selectedSectionId = null) {
  const sel = document.getElementById("taskSection");
  if (!sel) return;

  sel.innerHTML = `<option value="">-- kies sectie --</option>`;
  sel.disabled = true;

  if (!projectId) return;

  const { data, error } = await sb
    .from("project_sections")
    .select("*")
    .eq("project_id", projectId)
    .order("section_name", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  if (data?.length) {
    sel.innerHTML += data
      .map(s => `<option value="${s.id}">${s.section_name}</option>`)
      .join("");

    sel.disabled = false;

    // ⭐ herstel dropdown preselectie
    if (selectedSectionId) {
      sel.value = String(selectedSectionId);
    }
  }
}



async function loadProjects() {
  const { data, error } = await sb
    .from("projects")
    .select("*, project_sections(*)")
    .order("number", { ascending: true });

  if (error) return console.error(error);

  PROJECTS = data || [];
  fillProjectDropdown();
}  // <-- HIER MISSTE EEN SLUITENDE BRACE


function fillProjectDropdown() {
  const sel = document.getElementById("taskProject");
  if (!sel) return;

  sel.innerHTML = `<option value="">-- kies project --</option>` +
    PROJECTS.map(
      (p) => `<option value="${p.id}">${p.number} — ${p.name}</option>`
    ).join("");

  document.getElementById("taskSection").disabled = true;
  document.getElementById("taskSection").innerHTML = `<option>-- kies sectie --</option>`;
}


let draggedAssignment = null;

function setupDragAndDrop() {
  // items dragbaar maken
  document.querySelectorAll(".item").forEach(it => {
    it.draggable = true;

    it.addEventListener("dragstart", (e) => {
      const id = it.dataset.id;
      if (!id) return;

      const fromEmpId = Number(it.dataset.empId || 0);

      // originele opdracht + onthouden vanaf welke medewerker gesleept is
      const base = cache.assignments.find(a => String(a.id) === String(id));
      if (!base) return;

      draggedAssignment = {
        ...base,
        draggedEmployeeId: fromEmpId,   // 🔹 belangrijk voor "vervang"
      };

      it.classList.add("dragging");

      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(id));
      }
    });


  });

  // dropzones voor taken
  document.querySelectorAll(".dropzone").forEach(dz => {
    dz.addEventListener("dragover", (e) => {
      if (!draggedAssignment || !isAdmin()) return;
      e.preventDefault();
      dz.classList.add("drop-hover");
    });

    dz.addEventListener("dragleave", () => {
      dz.classList.remove("drop-hover");
    });

    dz.addEventListener("drop", async (e) => {
  e.preventDefault();
  dz.classList.remove("drop-hover");
  if (!draggedAssignment || !isAdmin()) return;

  const rec = { ...draggedAssignment };

  const newDate = dz.dataset.date;
  const newBlock = dz.dataset.part;
  const targetEmpId = Number(dz.dataset.empId);
  if (!newDate || !newBlock || !targetEmpId) return;

  const t = timesForBlock(newBlock);

  // -------------------------------
  // 1) Medewerkerslijst opbouwen
  // -------------------------------
  let employees = [];

  if (Array.isArray(rec.employees) && rec.employees.length) {
    employees = [...rec.employees];
  } else if (rec.employee_id) {
    employees = [Number(rec.employee_id)];
  }

  // fallback: geen medewerkers → target
  if (!employees.length) {
    employees = [targetEmpId];
  }

  // BELANGRIJK: rec.employees gelijk zetten
  rec.employees = [...employees];

  // -------------------------------
  // 2) Moet de popup worden getoond?
  // -------------------------------
  const draggedId = Number(rec.draggedEmployeeId);
  const isSameEmployee = draggedId === targetEmpId;

  if (!isSameEmployee && employees.length >= 1) {
    const choice = await showAssignChoice();
    if (!choice) return;

    if (choice === "add") {
      if (!employees.includes(targetEmpId)) {
        employees.push(targetEmpId);
      }
    } else if (choice === "replace") {
      const idx = employees.findIndex((eId) => eId === draggedId);
      if (idx >= 0) {
        employees[idx] = targetEmpId;
      }
    }
  } else {
    // Zelfde medewerker → geen popup
    if (employees.length === 1) {
      employees = [targetEmpId];
    }
  }

  // dubbele medewerkers eruit
  employees = [...new Set(employees)];

  // -------------------------------
  // 3) SHIFT = kopiëren
  // -------------------------------
    if (e.shiftKey) {
        const copy = {
            project_id: rec.project_sections?.project_id || null,
            project_section_id: rec.project_section_id || null,
            type: rec.type,
            urgent: rec.urgent,
            notes: rec.notes,
            vehicle: rec.vehicle,
            start_date: newDate,
            end_date: newDate,
            start_time: t.start,
            end_time: t.end,
            block: newBlock,
        };


    const { data: newRec, error: errInsert } = await sb
      .from("assignments")
      .insert(copy)
      .select()
      .single();

    if (errInsert) {
      alert("Kopiëren mislukt: " + errInsert.message);
      return;
    }

    await sb.from("assignment_employees").insert(
      employees.map((empId) => ({
        assignment_id: newRec.id,
        employee_id: empId,
      }))
    );

    await reload();
    return;
  }

  // -------------------------------
  // 4) Normale verplaatsing
  // -------------------------------
  const { error: errUpdate } = await sb
    .from("assignments")
    .update({
      start_date: newDate,
      end_date: newDate,
      start_time: t.start,
      end_time: t.end,
      block: newBlock,
    })
    .eq("id", rec.id);

  if (errUpdate) {
    alert("Verplaatsen mislukt: " + errUpdate.message);
    return;
  }

  // medewerkers updaten
  await sb.from("assignment_employees")
    .delete()
    .eq("assignment_id", rec.id);

  await sb.from("assignment_employees").insert(
    employees.map((empId) => ({
      assignment_id: rec.id,
      employee_id: empId,
    }))
  );

  draggedAssignment = null;
  await reload();
});






  });
}



// ==========================================================
//  REALTIME RELOAD (DEBOUNCE)
// ==========================================================
let reloadTimer = null;
function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    reload();
  }, 400); // klein beetje vertraging zodat meerdere events worden gebundeld
}

// ==========================================================
//  SUPABASE REALTIME SUBSCRIPTIONS
// ==========================================================
function setupRealtime() {
  if (!window.sb || !sb.channel) {
    console.warn("Supabase client niet gevonden voor realtime.");
    return;
  }

  const channel = sb.channel("planner_realtime");

  const tables = [
    "assignments",
    "assignment_employees",
    "vehicle_reservations",
    // optioneel, als je live medewerkers/projecten wilt zien:
    "employees",
    "projects",
  ];

  tables.forEach((tbl) => {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: tbl },
      (payload) => {
        console.log("Realtime update:", tbl, payload.eventType);
        scheduleReload();
      }
    );
  });

  channel.subscribe((status) => {
    console.log("Realtime status:", status);
  });
}


function isoDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// globale referentie naar "vandaag"
const TODAY_ISO = isoDateStr(new Date());

function el(t, c, txt) {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (txt != null) n.textContent = txt;
  return n;
}

function fmtDate(d) {
  return d.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // maandag = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return String(weekNo).padStart(2, "0");
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function toMin(hm) {
  const parts = (hm || "00:00").split(":");
  const h = parseInt(parts[0] || "0", 10);
  const m = parseInt(parts[1] || "0", 10);
  return h * 60 + m;
}

function overlap(s1, e1, s2, e2) {
  const a1 = toMin(s1);
  const a2 = toMin(e1);
  const b1 = toMin(s2);
  const b2 = toMin(e2);
  return a1 < b2 && b1 < a2;
}

function inRange(d, s, e) {
  return d >= s && d <= e;
}

function namesLabel(list) {
  const uniq = [];
  for (let i = 0; i < list.length; i++) {
    const nm = list[i].name || "?";
    if (!uniq.includes(nm)) uniq.push(nm);
  }
  if (uniq.length <= 2) return uniq.join(", ");
  return uniq[0] + ", " + uniq[1] + " +" + (uniq.length - 2);
}

// ----------------------------------------------------------
// Werkvensters en dagdelen
// ----------------------------------------------------------
const WORK_WINDOWS = [
  [7 * 60 + 30, 9 * 60 + 30],
  [9 * 60 + 45, 12 * 60 + 30],
  [13 * 60, 16 * 60],
];

function _toMinLocal(hm) {
  const parts = (String(hm).slice(0, 5) || "00:00").split(":");
  const h = parseInt(parts[0] || "0", 10);
  const m = parseInt(parts[1] || "0", 10);
  return h * 60 + m;
}

function timesForBlock(block) {
  if (block === "pm") return { start: "13:00", end: "16:00" };
  if (block === "full") return { start: "07:30", end: "16:00" };
  // standaard: ochtend
  return { start: "07:30", end: "12:30" };
}

function blockFromTimes(startHm, endHm) {
  const s = _toMinLocal(startHm || "07:30");
  const e = _toMinLocal(endHm || "16:00");
  if (s < 13 * 60 && e <= 13 * 60) return "am"; // alleen ochtend
  if (s >= 13 * 60) return "pm"; // alleen middag
  return "full"; // anders: hele dag
}

// ==========================================================
//  STATE
// ==========================================================
let currentMonday = startOfWeek(new Date());



// ==========================================================
//  PROJECT SELECT + QUICK ADD
// ==========================================================
function renderProjectOptions(filter, preselectId) {
  const q = String(filter || "").toLowerCase();
  const opts = (cache.projects || [])
    .filter((p) => {
      const label = (p.number ? p.number + " — " : "") + (p.name || "");
      return !q || label.toLowerCase().includes(q);
    })
    .map((p) => {
      const label = (p.number ? p.number + " — " : "") + (p.name || "");
      return `<option value="${p.id}">${label}</option>`;
    })
    .join("");

  const sel = document.getElementById("mProj");
  if (sel) sel.innerHTML = opts;
  if (preselectId != null && sel) sel.value = String(preselectId); 
     
      // 🔍 Projectzoek UI
    $("#toggleProjSearch")?.addEventListener("click", () => {
      const wrap = $("#projSearchWrap");
      wrap.style.display = wrap.style.display === "none" ? "block" : "none";
      $("#mProj").style.display = wrap.style.display;
    });

    $("#mProjSearch")?.addEventListener("input", () => {
      renderProjectOptions($("#mProjSearch").value);
    });

    $("#mProj")?.addEventListener("change", () => {
      const id = $("#mProj").value;
      if (!id) return;
      $("#taskProject").value = id;
      loadSectionOptions(id);
    });

}

async function quickAddProjectViaModal() {
  if (!isAdmin()) {
    alert("Beheer-wachtwoord vereist om een project toe te voegen.");
    return;
  }
  let number = prompt("Projectnummer (optioneel):", "");
  if (number !== null) number = number.trim();
  let name = prompt("Projectnaam (verplicht):", "");
  if (name == null) return;
  name = name.trim();
  if (!name) {
    alert("Projectnaam is verplicht.");
    return;
  }
  try {
    const { data, error } = await sb
      .from("projects")
      .insert({ number: number || null, name })
      .select()
      .single();
    if (error) {
      alert("Project toevoegen mislukt: " + error.message);
      return;
    }
    cache.projects.push(data);
    const searchVal = document.getElementById("mProjSearch")?.value || "";
    renderProjectOptions(searchVal, data.id);
  } catch (e) {
    alert("Project toevoegen mislukt: " + (e?.message || e));
  }
}

// ==========================================================

//  DATA LADEN / MUTEREN
// ==========================================================
async function fetchAll() {
    const empQ = sb
        .from("employees")
        .select("*")
        .order("calendar_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });

    const projQ = sb.from("projects").select("*").order("number", { ascending: true });

    const asgQ = sb
        .from("assignments")
        .select(`
            id,
            start_date,
            end_date,
            block,
            type,
            urgent,
            notes,
            vehicle,
            project_section_id,
            assignment_employees ( employee_id ),

            project_sections:assignments_project_section_id_fkey (
              id,
              section_name,
              production_text,
              attachment_url,
              project_id,
              projects (
                id,
                number,
                name,
                install_address
              )
            )
        `)
        .order("start_date", { ascending: true })
        .order("block", { ascending: true });

    const resQ = sb.from("vehicle_reservations").select("*");

    const linkQ = sb
        .from("assignment_employees")
        .select("assignment_id, employee_id");

    const [emp, proj, asg, res, links] = await Promise.all([
        empQ, projQ, asgQ, resQ, linkQ
    ]);

    if (emp.error || proj.error || asg.error || res.error || links.error) {
        console.error("FETCHALL ERROR:", emp.error || proj.error || asg.error || res.error || links.error);
        throw emp.error || proj.error || asg.error || res.error || links.error;
    }

    const assignmentsWithEmployees = (asg.data || []).map(a => {
        const matching = (links.data || []).filter(l => l.assignment_id === a.id);
        return {
            ...a,
            employees: matching.map(m => m.employee_id)
        };
    });

    // ✅ DIT ontbrak: cache bijwerken!
    cache = {
        employees: emp.data || [],
        projects: proj.data || [],
        assignments: assignmentsWithEmployees,
        reservations: res.data || []
    };

    // handig voor console debugging
    window.cache = cache;

    return cache;
}
async function reload() {
  try {
    const data = await fetchAll();   // één fetch!

    // vul globale cache
    cache.employees    = data.employees;
    cache.projects     = data.projects;
    cache.assignments  = data.assignments;
    cache.reservations = data.reservations;   // <-- werkt nu wél

    render();

    // Rotated opnieuw tekenen indien aanwezig
    if (
      document.body.classList.contains("rotated-page") &&
      typeof renderRotatedPlanner === "function"
    ) {
      renderRotatedPlanner();
    }

  } catch (e) {
    console.error("Reload error:", e);
  }
}


async function addEmployee(name) {
  if (!isAdmin()) {
    alert("Wachtwoord vereist");
    return;
  }
  const { error } = await sb.rpc("add_employee", {
    p_password: ADMIN_PW,
    p_name: name,
  });
  if (error) alert(error.message);
  else reload();
}

async function updateEmployee(id, patch) {
  if (!isAdmin()) {
    alert("Wachtwoord vereist");
    return;
  }
  if (!("show_in_calendar" in patch)) return;

  const { error } = await sb.rpc("set_employee_visibility", {
    p_password: ADMIN_PW,
    p_id: Number(id),
    p_show: !!patch.show_in_calendar,
  });

  if (error) {
    alert(error.message);
  } else {
    await reload();
  }
}

async function moveEmployee(id, dir) {
  if (!isAdmin()) {
    alert("Wachtwoord vereist");
    return;
  }
  const list = [...cache.employees].sort(
    (a, b) =>
      (a.calendar_order ?? 0) - (b.calendar_order ?? 0) ||
      (a.name || "").localeCompare(b.name || "")
  );

  const idx = list.findIndex((e) => String(e.id) === String(id));
  const neighbor = list[idx + (dir === "down" ? 1 : -1)];
  if (idx < 0 || !neighbor) return;

  const pw = document.getElementById("adminPwd").value || "";
  const { error } = await sb.rpc("swap_employee_order", {
    p_password: pw,
    p_id_a: Number(id),
    p_id_b: Number(neighbor.id),
  });
  if (error) {
    alert(error.message);
    return;
  }
  await reload();
}

// ==========================================================
//  VOERTUIGINFO & CLASH-CHECK
// ==========================================================
function vehicleDayInfo(iso) {
  const bus = [],
    bak = [],
    busPriv = [],
    bakPriv = [];
  try {
    // uit opdrachten
    for (let i = 0; i < cache.assignments.length; i++) {
      const a = cache.assignments[i];
      if (a.type !== "montage") continue;
      if (!a.vehicle || a.vehicle === "nvt") continue;
      if (!inRange(iso, a.start_date, a.end_date)) continue;
      const emp = cache.employees.find((e) => String(e.id) === String(a.employee_id));
      const pack = {
        name: emp ? emp.name : "?",
        s: a.start_time,
        e: a.end_time,
        proj: a.project_id,
      };
      if (a.vehicle === "bus") bus.push(pack);
      else if (a.vehicle === "bakwagen") bak.push(pack);
    }
    // uit reserveringen
    for (let j = 0; j < cache.reservations.length; j++) {
      const r = cache.reservations[j];
      if (r.date !== iso) continue;
      const empId = r.employee_id != null ? r.employee_id : r.reserved_by;
      const emp2 = cache.employees.find((e) => String(e.id) === String(empId));
      const pack2 = {
        name: emp2 ? emp2.name : "?",
        s: r.start_time,
        e: r.end_time,
        proj: r.project_id || null,
      };
      const kind = r.kind === "project" ? "project" : "private";
      if (r.vehicle === "bus") {
        if (kind === "project") bus.push(pack2);
        else busPriv.push(pack2);
      } else if (r.vehicle === "bakwagen") {
        if (kind === "project") bak.push(pack2);
        else bakPriv.push(pack2);
      }
    }
  } catch (e) {
    console.error("vehicleDayInfo error", e);
  }
  return { bus, bak, busPriv, bakPriv };
}

function hasVehicleClash(rec) {
  try {
    if (rec.type !== "montage") return null;
    if (!rec.vehicle || rec.vehicle === "nvt") return null;
    if (!rec.start_date || !rec.end_date || !rec.start_time || !rec.end_time) return null;

    function isoRange(startIso, endIso) {
      const out = [];
      const S = new Date(startIso + "T00:00");
      const E = new Date(endIso + "T00:00");
      for (let d = new Date(S); d <= E; d.setDate(d.getDate() + 1)) {
        out.push(isoDateStr(d));
      }
      return out;
    }

    const days = isoRange(rec.start_date, rec.end_date);

    for (let di = 0; di < days.length; di++) {
      const iso = days[di];

      // tegen reserveringen
      const resSameDay = (cache.reservations || []).filter(
        (r) => r.vehicle === rec.vehicle && r.date === iso
      );
      for (let i = 0; i < resSameDay.length; i++) {
        const r = resSameDay[i];
        if (overlap(rec.start_time, rec.end_time, r.start_time, r.end_time)) {
          return { kind: "reservation", date: iso, start: r.start_time, end: r.end_time };
        }
      }

      // tegen andere opdrachten
      const asgSameVeh = (cache.assignments || []).filter(
        (a) => a.type === "montage" && a.vehicle === rec.vehicle
      );
      for (let j = 0; j < asgSameVeh.length; j++) {
        const a = asgSameVeh[j];
        if (rec.id && String(a.id) === String(rec.id)) continue;
        const inDay = iso >= a.start_date && iso <= a.end_date;
        if (!inDay) continue;
        if (overlap(rec.start_time, rec.end_time, a.start_time, a.end_time)) {
          return { kind: "assignment", date: iso, start: a.start_time, end: a.end_time };
        }
      }
    }
    return null;
  } catch (e) {
    console.error("hasVehicleClash error", e);
    return null;
  }
}

// ==========================================================
//  RENDERING
// ==========================================================
function headerRow(grid, monday) {
  grid.appendChild(el("div", "corner", "Medewerker — Week " + getWeekNumber(monday)));
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const iso = isoDateStr(day);
    const classes = "dow" + (iso === TODAY_ISO ? " today" : "");
    grid.appendChild(el("div", classes, fmtDate(day)));
  }
}

function employeeRow(grid, emp, days) {
  const empCell = el("div", "emp", emp.name);

// speciale CSS class voor LOVD rij
if (emp.name === "LOVD") empCell.classList.add("emp-LOVD");

grid.appendChild(empCell);

  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    const cell = document
      .getElementById("cellTpl")
      .content.cloneNode(true).firstElementChild;
    const iso = isoDateStr(day);
    if (iso === TODAY_ISO) {
      cell.classList.add("today");
    }

    const inner = cell.querySelector(".cell-inner");
    const amContainer = cell.querySelector(".items-am") || cell.querySelector(".items");
    const pmContainer = cell.querySelector(".items-pm") || cell.querySelector(".items");

    const list = cache.assignments
  .filter((a) => {
    // alle medewerkers bij deze taak: employees[] of fallback naar employee_id
    const ids = Array.isArray(a.employees) && a.employees.length
      ? a.employees
      : (a.employee_id ? [a.employee_id] : []);

    const isForThisEmp = ids.some((id) => String(id) === String(emp.id));
    return isForThisEmp && inRange(iso, a.start_date, a.end_date);
  })
  .sort((a, b) =>
    (a.start_date + a.start_time).localeCompare(b.start_date + b.start_time)
  );


    for (let k = 0; k < list.length; k++) {
      const a = list[k];

      const item = document
        .getElementById("itemTpl")
        .content.cloneNode(true).firstElementChild;

      const proj = a.project_sections?.projects;
      const sec  = a.project_sections;


      item.dataset.id = a.id;
      item.dataset.empId = emp.id;   // 🔹 deze regel toevoegen

  

// 🔹 Kleur op basis van type
item.classList.add(a.type || "productie");

// -------------------------------
// Project + sectie + pin
// -------------------------------
const top1 = item.querySelector(".top1");
let label = "";

// projectnummer + naam
if (proj) {
  label = `${proj.number || ""} — ${proj.name || ""}`;
}

// sectie
if (sec?.section_name) {
  label += ` • ${sec.section_name}`;
}
// 📄 PDF icoon tonen als sectie een bijlage heeft
if (sec?.attachment_url) {
  label += ` <span class="pdf-icon" data-pdf="${sec.attachment_url}">📄</span>`;
}

// 📍 pin toevoegen
if (proj?.install_address) {
  const addr = proj.install_address;
  const maps = "https://www.google.com/maps?q=" + encodeURIComponent(addr);
  label += ` <span class="map-pin" data-map="${maps}">📍</span>`;
}

// urgent
if (a.urgent) {
  label = "❗ " + label;
}

// HTML zetten
top1.innerHTML = label;

// pin klikbaar
top1.querySelectorAll(".map-pin").forEach(pin => {
  pin.style.cursor = "pointer";
  pin.addEventListener("click", (e) => {
    e.stopPropagation();
    window.open(pin.dataset.map, "_blank");
  });
});

// pdf klikbaar
top1.querySelectorAll(".pdf-icon").forEach(pdf => {
  pdf.style.cursor = "pointer";
  pdf.addEventListener("click", (e) => {
    e.stopPropagation();
    window.open(pdf.dataset.pdf, "_blank");
  });
});


item.querySelector(".top2").textContent = "";



      const parts = [];

      // namen van alle medewerkers bij deze taak
      const allEmpIds = Array.isArray(a.employees) && a.employees.length
        ? a.employees
        : (a.employee_id ? [a.employee_id] : []);

      const nameParts = allEmpIds
        .map((id) => {
          const e = cache.employees.find((x) => String(x.id) === String(id));
          return e ? e.name : null;
        })
        .filter(Boolean);

      if (nameParts.length) {
        parts.push(nameParts.join(" + ")); // bijv "Mark + Thijs"
      }

      if (a.type === "montage" && a.vehicle && a.vehicle !== "nvt") parts.push(a.vehicle);
      if (a.notes) parts.push(a.notes);

      item.querySelector(".meta").textContent = parts.join(" • ");

(function (rec) {
item.addEventListener("click", function (e) {

  // 🔥 voorkom modal-klik wanneer je op de pin klikt
  if (e.target.closest(".map-pin")) {
    return; 
  }

  openTaskModal(rec, { readonly: !isAdmin() });
});


})(a);


      // delete knop
      const delBtn = item.querySelector(".x");
      if (!isAdmin()) {
        delBtn.style.display = "none";
      } else {
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();

          const choice = await showDeleteChoice();
          if (!choice) return; // cancelled

          const empId = Number(item.dataset.empId);
          const taskId = a.id;

          if (choice === "task") {
            // 🗑 Complete taak verwijderen
            await sb.from("assignments").delete().eq("id", taskId);
            await sb.from("assignment_employees").delete().eq("assignment_id", taskId);
            await reload();
            return;
          }

          if (choice === "employee") {
            // 👤 Alleen deze medewerker uit de taak
            const remaining = (a.employees || []).filter(id => id !== empId);

            if (!remaining.length) {
              // niemand over → taak verwijderen
              await sb.from("assignments").delete().eq("id", taskId);
              await sb.from("assignment_employees").delete().eq("assignment_id", taskId);
            } else {
              await sb.from("assignment_employees")
                .delete()
                .eq("assignment_id", taskId)
                .eq("employee_id", empId);
            }
            await reload();
          }
        });
      }



// plaats in ochtend/middag/hele dag
const blk = a.block || blockFromTimes(a.start_time, a.end_time);

if (blk === "full") {
    // HELE DAG = twee items
    const clone = item.cloneNode(true);

    // Klik-handler kopiëren
    clone.addEventListener("click", (e) => {
        if (e.target.closest(".map-pin")) return;
        e.stopPropagation();
        openTaskModal(a, { readonly: !isAdmin() });
    });

    amContainer.appendChild(item);
    pmContainer.appendChild(clone);
}
else if (blk === "pm") {
    pmContainer.appendChild(item);
}
else {
    amContainer.appendChild(item);  // standaard = ochtend
}


    }


    // dropzones voor nieuwe taak
cell.querySelectorAll(".dropzone").forEach(function (dz) {
  const part = dz.getAttribute("data-part"); // am/pm

  // ⬇️ BELANGRIJK: juiste data meegeven voor drag & drop
  dz.dataset.date = iso;
  dz.dataset.part = part;
  dz.dataset.empId = emp.id;

  (function (dateStr, partVal, empId) {
    dz.addEventListener("click", function () {
      if (!isAdmin()) return; // gewone gebruiker: niets doen

      const blk = partVal === "pm" ? "pm" : "am";
      const t = timesForBlock(blk);
      openTaskModal(
        {
          employee_id: empId,
          employees: [empId], // hoofdmedewerker ook in lijst
          project_id: cache.projects[0]?.id || null,
          start_date: dateStr,
          end_date: dateStr,
          start_time: t.start,
          end_time: t.end,
          type: "productie",
          vehicle: "nvt",
          urgent: false,
          notes: null,
          block: blk,
        },
        { readonly: false }
      );
    });
  })(iso, part, emp.id);
});


    if (emp.name === "LOVD") {
  cell.classList.add("emp-LOVD");
}

grid.appendChild(cell)
  }
}

function renderVehicleBar(bar, monday) {
  bar.innerHTML = "";
  bar.appendChild(el("div", "label", "Voertuigen"));
  for (let i = 0; i < 7; i++) {
    const iso = isoDateStr(addDays(monday, i));
    const info = vehicleDayInfo(iso);
    const cell = el("div", "cell", "");

    const tips = [];
    if (info.bus.length)
      tips.push(
        "Bus: " + info.bus.map((t) => t.name + " " + t.s + "-" + t.e).join(", ")
      );
    if (info.busPriv.length)
      tips.push(
        "Bus privé: " +
          info.busPriv.map((t) => t.name + " " + t.s + "-" + t.e).join(", ")
      );
    if (info.bak.length)
      tips.push(
        "Bakwagen: " + info.bak.map((t) => t.name + " " + t.s + "-" + t.e).join(", ")
      );
    if (info.bakPriv.length)
      tips.push(
        "Bakwagen privé: " +
          info.bakPriv.map((t) => t.name + " " + t.s + "-" + t.e).join(", ")
      );
    cell.title = tips.join(" | ") || "";

    const badges = [];
    if (info.bus.length) badges.push(el("span", "badge bus", "Bus"));
    if (info.busPriv.length)
      badges.push(el("span", "badge bus private", "Bus (" + namesLabel(info.busPriv) + ")"));
    if (info.bak.length) badges.push(el("span", "badge bakwagen", "Bakwagen"));
    if (info.bakPriv.length)
      badges.push(
        el("span", "badge bakwagen private", "Bakwagen (" + namesLabel(info.bakPriv) + ")")
      );

    badges.forEach((b) => cell.appendChild(b));
    bar.appendChild(cell);
  }
}

function renderWeek(grid, monday, bar) {
  grid.innerHTML = "";
  headerRow(grid, monday);



  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(monday, i));

  let emps = cache.employees.filter((e) => e.show_in_calendar !== false);
  emps.sort((a, b) => {
    if (a.name === "LOVD") return -1;
    if (b.name === "LOVD") return 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  if (emps.length === 0) {
    grid.appendChild(el("div", "emp", "(nog geen medewerkers)"));
    for (let i = 0; i < 7; i++) grid.appendChild(el("div", "cell"));
  } else {
    for (let i = 0; i < emps.length; i++) {
      const emp = emps[i];

      // LOVD alleen tonen als er echt iets staat (voor niet-admins)
      if (emp.name === "LOVD" && !isAdmin()) {
        let hasLovd = false;
        for (let d = 0; d < days.length && !hasLovd; d++) {
          const iso = isoDateStr(days[d]);
          for (let aidx = 0; aidx < cache.assignments.length; aidx++) {
            const a = cache.assignments[aidx];
            if (a.employee_id === emp.id && inRange(iso, a.start_date, a.end_date)) {
              hasLovd = true;
              break;
            }
          }
        }
        if (!hasLovd) continue;
      }

      employeeRow(grid, emp, days);
    }
  }
// ==========================================================
// GRID CLICK HANDLERS
// ==========================================================



  renderVehicleBar(bar, monday);
 

  
}

function renderPlanner() {
  const m1 = currentMonday;
  const m2 = addDays(currentMonday, 7);

  document.getElementById("weekLabel").textContent =
    "Week " +
    getWeekNumber(m1) +
    " & " +
    getWeekNumber(m2) +
    " — " +
    fmtDate(m1) +
    " t/m " +
    fmtDate(addDays(m2, 6));

  renderWeek(document.getElementById("gridWeek1"), m1, document.getElementById("vehWeek1"));
  renderWeek(document.getElementById("gridWeek2"), m2, document.getElementById("vehWeek2"));
}

function renderOverview() {
  const base = currentMonday;
  const totalWeeks = 8;

  const lastMonday = addDays(base, 7 * (totalWeeks - 1));
  const lastDay = addDays(lastMonday, 6);

  document.getElementById("weekLabel").textContent =
    "Week " +
    getWeekNumber(base) +
    " t/m " +
    getWeekNumber(lastMonday) +
    " — " +
    fmtDate(base) +
    " t/m " +
    fmtDate(lastDay);

  for (let i = 0; i < totalWeeks; i++) {
    const monday = addDays(base, 7 * i);
    const g = document.getElementById("gridWeek" + (i + 1));
    const v = document.getElementById("vehWeek" + (i + 1));
    if (g && v) renderWeek(g, monday, v);
  }
}




// ==========================================================
//  MULTI-MEDEWERKER CHECKBOXES
// ==========================================================
function renderEmployeeCheckboxes(selected = []) {
  const box = document.getElementById("mEmpList");
  if (!box) return;

  box.innerHTML = "";

  const visibleEmployees = cache.employees.filter(
    (e) => e.show_in_calendar !== false
  );

  visibleEmployees.forEach((e) => {
    box.innerHTML += `
      <label>
        <input type="checkbox" value="${e.id}"
          ${selected.includes(e.id) ? "checked" : ""}>
        ${e.name}
      </label>
    `;
  });

  // Max 4 limiet
  const checks = box.querySelectorAll("input[type='checkbox']");
  checks.forEach((ch) => {
    ch.addEventListener("change", () => {
      const count = [...checks].filter((c) => c.checked).length;
      const msg = document.getElementById("empLimitMsg");
      if (count > 4) {
        ch.checked = false;
        if (msg) {
          msg.style.display = "block";
          setTimeout(() => (msg.style.display = "none"), 2000);
        } else {
          alert("Maximaal 4 collega's per taak.");
        }
      }
    });
  });
}



// ==========================================================
//  MODAL OPENEN / SLUITEN
// ==========================================================
async function openTaskModal(rec = {}, opts = {}) {
  // 🛠️ Veilig project + sectie toewijzen
if (rec.project_sections && typeof rec.project_sections === "object") {
  const sec = rec.project_sections;
}
  
  const modal = document.getElementById("taskModal");
  if (!modal) {
    console.warn("Modal bestaat niet op deze pagina → geen modal");
    return;
  }

  // Datum & dagdeel vanuit cel
  if (opts.date) {
    rec.start_date = opts.date;
    if (!rec.end_date) {
      rec.end_date = opts.date;
    }
  }

  if (opts.block) {
    rec.block = opts.block;
  }

// 🛠️ Projectgegevens veilig overnemen uit join
if (rec.project_sections && typeof rec.project_sections === "object") {
  const sec = rec.project_sections;
  if (!rec.project_id && sec.project_id) {
    rec.project_id = sec.project_id;
  }
  if (!rec.project_section_id && sec.id) {
    rec.project_section_id = sec.id;
  }
}


  const readonly = !!opts.readonly;

  

// 🔹 Correct dropdown veld vullen
const mProj = document.getElementById("mProj");
const taskProj = document.getElementById("taskProject");
const pid = rec.project_id || null;

if (mProj)   mProj.value = pid ?? "";
if (taskProj) taskProj.value = pid ?? "";

  
  const firstEmpId = (cache.employees[0] && cache.employees[0].id) || "";
  const firstProjId = (cache.projects[0] && cache.projects[0].id) || "";

  // medewerkers bepalen
  let selectedEmployees = [];
  if (Array.isArray(rec.employees) && rec.employees.length) {
    
    selectedEmployees = rec.employees.slice(0, 4);
  } else if (rec.employee_id) {
    selectedEmployees = [rec.employee_id];
  } else if (firstEmpId) {
    selectedEmployees = [firstEmpId];
  }

  if (typeof renderEmployeeCheckboxes === "function") {
    renderEmployeeCheckboxes(selectedEmployees);
  }

  // Project dropdown her-renderen
  const searchVal = document.getElementById("mProjSearch")?.value || "";
  renderProjectOptions(searchVal, rec.project_id);

  const edit = !!rec.id;
  document.getElementById("taskTitle").textContent =
    edit ? "Taak bewerken" : "Taak toevoegen";

  setVal("mId", rec.id || "");

  if (edit) {
    // 🟢 Bestaande taak → data uit record
    setVal("taskProject", rec.project_id);
    setVal("mStartDate", rec.start_date || opts.date || "");
    setVal("mEndDate", rec.end_date || rec.start_date || opts.date || "");
    setVal("mNotes", rec.notes || "");

  } else {
     setVal("taskProject", rec.project_id || "");
     setVal("mStartDate", rec.start_date || opts.date || "");
     setVal("mEndDate", rec.end_date || rec.start_date || opts.date || "");
     setVal("mNotes", rec.notes || "");

    if (opts.block) {
      const radio = document.querySelector(
        `input[name="mBlock"][value="${opts.block}"]`
      );
      if (radio) radio.checked = true;
    }
  }

  await loadSectionOptions(rec.project_id, rec.project_section_id || null);

// ► Productietekst alleen tonen als die er is
const btn = document.querySelector("#taskModal #openProdText");

if (btn) {
    const prodText = rec.project_sections?.production_text?.trim() || "";

    if (prodText.length > 0) {
        btn.style.display = "";
        btn.onclick = (ev) => {
            ev.stopPropagation();
            document.getElementById("prodTextContent").textContent = prodText;
            document.getElementById("prodTextModal").hidden = false;
        };
    } else {
        btn.style.display = "none";
    }
}



// PDF tonen indien sectie een bijlage heeft
const pdfBtn = document.getElementById("openPDF");
const pdfUrl = rec.project_sections?.attachment_url;

if (pdfBtn) {
    if (pdfUrl) {
        pdfBtn.style.display = "";
        pdfBtn.onclick = () => window.open(pdfUrl, "_blank");
    } else {
        pdfBtn.style.display = "none";
    }
}

// 📍 MAPS ROUTE KNOP
const mapBtn = document.getElementById("openMap");
const installAddr = rec.project_sections?.projects?.install_address;

if (mapBtn) {
    if (installAddr) {
        const mapsUrl = "https://www.google.com/maps?q=" + encodeURIComponent(installAddr);
        mapBtn.style.display = "";
        mapBtn.onclick = () => window.open(mapsUrl, "_blank");
    } else {
        mapBtn.style.display = "none";
    }
}


  // Modal tonen
  document.getElementById("taskModal").hidden = false;

// ► READONLY MODE VOOR NIET-ADMINS
if (!isAdmin()) {

    // Alles verbergen wat bewerkbaar is
    const hideSelectors = [
        "#taskProject",
        "#toggleProjSearch",
        "#mProjAdd",
        "#projSearchWrap",
        "#taskSection",
        "#mEmpList",
        "#mStartDate",
        "#mEndDate",
        "[name='mType']",
        "[name='mBlock']",
        "#mUrgent",
        "[name='mVehicle']",
        "#mNotes",
        "#mDelete",
        "#mSave"
    ];

    hideSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            el.style.display = "none";
        });
    });

    // Een container maken voor readonly info
    let ro = document.getElementById("readonlyInfo");
    if (!ro) {
        ro = document.createElement("div");
        ro.id = "readonlyInfo";
        ro.style.marginTop = "10px";
        ro.style.lineHeight = "1.6";
        ro.style.fontSize = "18px";
        ro.style.padding = "6px 4px";
        document.querySelector(".modal-body").prepend(ro);
    }

    const proj = rec.project_sections?.projects;
    const sec  = rec.project_sections;
    const names = rec.employees
        .map(id => cache.employees.find(e => e.id === id)?.name)
        .join(", ");

    const blkMap = { am:"Ochtend", pm:"Middag", full:"Hele dag" };

    ro.innerHTML = `
        <div><strong>Project:</strong> ${proj?.number || ""} – ${proj?.name || ""}</div>
        <div><strong>Sectie:</strong> ${sec?.section_name || ""}</div>
        <div><strong>Medewerkers:</strong> ${names}</div>
        <div><strong>Datum:</strong> ${rec.start_date} t/m ${rec.end_date}</div>
        <div><strong>Dagdeel:</strong> ${blkMap[rec.block] || ""}</div>
        <div><strong>Type:</strong> ${rec.type}</div>
        <div><strong>Voertuig:</strong> ${rec.vehicle || "n.v.t."}</div>
        <div><strong>Notities:</strong><br>${rec.notes || "(geen)"}</div>
    `;

    return; // STOP — bewerkmodus mag niet worden opgebouwd
}


  const urgEl = document.getElementById("mUrgent");
  if (urgEl) urgEl.checked = !!rec.urgent;

  const typeVal = rec.type || "productie";
  const typeRadio = document.querySelector(
    `input[name="mType"][value="${typeVal}"]`
  );
  if (typeRadio) typeRadio.checked = true;

  const vehVal = rec.vehicle || "nvt";
  const vehRadio = document.querySelector(
    `input[name="mVehicle"][value="${vehVal}"]`
  );
  if (vehRadio) vehRadio.checked = true;

  const vehicleRow = document.getElementById("vehicleRow");
  if (vehicleRow) vehicleRow.style.display =
    typeVal === "montage" ? "" : "none";

  let blk = rec.block || blockFromTimes(rec.start_time, rec.end_time);
  if (!blk) blk = "am";
  const blockRadio = document.querySelector(
    `input[name="mBlock"][value="${blk}"]`
  );
  if (blockRadio) blockRadio.checked = true;

  // enable/disable velden
  const saveBtn = document.getElementById("mSave");
  const delBtn = document.getElementById("mDelete");
  if (readonly) {
    if (saveBtn) saveBtn.style.display = "none";
    if (delBtn) delBtn.style.display = "none";
  } else {
    if (saveBtn) saveBtn.style.display = "";
    if (delBtn) {
      delBtn.style.display = edit ? "" : "none";
      delBtn.disabled = !edit;
    }
  }

  // tekst/select
  ["#mProj", "#mStartDate", "#mEndDate", "#mNotes"].forEach((sel) => {
    const inp = document.querySelector(sel);
    if (inp) inp.disabled = readonly;
  });

  // medewerkers-checkboxes readonly maken
  const empListEl = document.getElementById("mEmpList");
  if (empListEl) {
    empListEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.disabled = readonly;
    });
  }

  // project search / add
  const projSearch = document.getElementById("mProjSearch");
  const projAdd = document.getElementById("mProjAdd");
  if (projSearch) projSearch.disabled = readonly;
  if (projAdd) projAdd.disabled = readonly;

  // radios
  ["mType", "mVehicle", "mBlock"].forEach((name) => {
    document
      .querySelectorAll(`input[name="${name}"]`)
      .forEach((r) => (r.disabled = readonly));
  });


}

function closeTaskModal() {
  const modal = document.getElementById("taskModal");
  if (modal) modal.hidden = true;
}

// ==========================================================
//  OPSLAAN / VERWIJDEREN HANDLERS
// ==========================================================
async function handleSaveClick() {
  if (!isAdmin()) {
    alert("Wachtwoord vereist");
    return;
  }

  const idVal = (document.getElementById("mId")?.value || "").trim();
  const projEl = document.getElementById("taskProject");
  const sdEl = document.getElementById("mStartDate");
  const edEl = document.getElementById("mEndDate");
  const notesEl = document.getElementById("mNotes");
  const urgEl = document.getElementById("mUrgent");
  const empListEl = document.getElementById("mEmpList");
  const project_section_id = Number(document.getElementById("taskSection").value) || null;
  const updates = {
  // andere velden blijven zoals ze zijn
  project_section_id,
};


  if (!empListEl || !projEl || !sdEl || !edEl || !notesEl || !urgEl) {
    alert("Interne fout: modal velden ontbreken.");
    return;
  }

  // geselecteerde medewerkers (checkboxes)
  const empChecks = empListEl.querySelectorAll('input[type="checkbox"]');
  const selectedEmployeeIds = [...empChecks]
    .filter((c) => c.checked)
    .map((c) => Number(c.value));

  if (!selectedEmployeeIds.length) {
    alert("Kies minimaal één medewerker voor deze taak.");
    return;
  }
  if (selectedEmployeeIds.length > 4) {
    alert("Maximaal 4 collega's per taak.");
    return;
  }

  // eerste gekozen medewerker is de "hoofd"-medewerker (rij in kalender)
  const mainEmployeeId = selectedEmployeeIds[0];

  const typeRadio = document.querySelector('input[name="mType"]:checked');
  const vehRadio = document.querySelector('input[name="mVehicle"]:checked');
  const blockRadio = document.querySelector('input[name="mBlock"]:checked');

  let rec = {
    id: idVal ? Number(idVal) : null,
    employee_id: mainEmployeeId,
    project_section_id: Number(document.getElementById("taskSection").value) || null,
    start_date: sdEl.value || "",
    end_date: edEl.value || sdEl.value || "",
    notes: notesEl.value ? notesEl.value.trim() : null,
    urgent: !!urgEl.checked,
    type: (typeRadio && typeRadio.value) || "productie",
    vehicle: "nvt",
    block: null,
    start_time: "",
    end_time: "",
  };

  // dagdeel → tijden
  const blk = (blockRadio && blockRadio.value) || "am";
  const t = timesForBlock(blk);
  rec.start_time = t.start;
  rec.end_time = t.end;
  rec.block = blk;

  // voertuig bij montage
if (rec.type === "montage" || rec.type === "service") {
    rec.vehicle = (vehRadio && vehRadio.value) || "nvt";
} else {
    rec.vehicle = "nvt";
}

  // dubbel-boekingscheck voertuig
  if (rec.type === "montage" && rec.vehicle && rec.vehicle !== "nvt") {
    const clash = hasVehicleClash(rec);
    if (clash) {
      alert(
        "Voertuig dubbel geboekt op " +
          clash.date +
          " (" +
          clash.start +
          "–" +
          clash.end +
          "). Kies een andere tijd of voertuig."
      );
      return;
    }
  }

  // undefined → null
  Object.keys(rec).forEach((k) => {
    if (rec[k] === undefined) rec[k] = null;
  });

  let assignmentId = rec.id || null;

  try {
    // 1) Taak opslaan in assignments
    if (!assignmentId) {
      const insertData = { ...rec };
      delete insertData.id;
      const ins = await sb
        .from("assignments")
        .insert(insertData)
        .select()
        .single();
      if (ins.error) throw ins.error;
      assignmentId = ins.data.id;
    } else {
      const patch = { ...rec };
      delete patch.id;
      const upd = await sb
        .from("assignments")
        .update(patch)
        .eq("id", assignmentId);
      if (upd.error) throw upd.error;
    }

    // 2) Koppelingen naar medewerkers in assignment_employees
    // eerst alles voor deze taak leegmaken
    const del = await sb
      .from("assignment_employees")
      .delete()
      .eq("assignment_id", assignmentId);
    if (del.error) throw del.error;

    // daarna opnieuw vullen met de geselecteerde medewerkers
    const rows = selectedEmployeeIds.map((empId) => ({
      assignment_id: assignmentId,
      employee_id: empId,
    }));

    if (rows.length) {
      const insLinks = await sb.from("assignment_employees").insert(rows);
      if (insLinks.error) throw insLinks.error;
    }

    closeTaskModal();
    await reload();
  } catch (e) {
    console.error(e);
    alert("Opslaan mislukt: " + (e.message || e));
  }
}

async function handleDeleteClick() {
  const idVal = (document.getElementById("mId")?.value || "").trim();
  if (!idVal) return;
  if (!confirm("Deze taak verwijderen?")) return;
  if (!isAdmin()) {
    alert("Wachtwoord vereist");
    return;
  }
  await sb.from("assignments").delete().eq("id", Number(idVal));
  closeTaskModal();
  await reload();
}

// ==========================================================
//  ADMIN WACHTWOORD
// ==========================================================
async function verifyAdminPlanner(pw) {
  ADMIN_PW = pw || "";
  if (!pw) {
    ADMIN_OK = false;
    render();
    return;
  }
  const { data, error } = await sb.rpc("is_admin", { p_password: pw });
  ADMIN_OK = !error && !!data;
  const fld = document.getElementById("adminPwd");
  if (fld) fld.style.borderColor = ADMIN_OK ? "#33c36f" : "";
  render();
}

// ==========================================================
//  WIRE UI
// ==========================================================
function wire() {
  // startdatum -> einddatum kopiëren
  const sd = document.getElementById("mStartDate");
  const ed = document.getElementById("mEndDate");
  if (sd && ed) {
    sd.addEventListener("change", () => {
      if (sd.value && !ed.value) ed.value = sd.value;
    });
  }

  // Navigatie knoppen
  const prev = document.getElementById("prevWeek");
  if (prev) prev.addEventListener("click", () => {
    currentMonday = addDays(currentMonday, -7);
    render();
  });

  const next = document.getElementById("nextWeek");
  if (next) next.addEventListener("click", () => {
    currentMonday = addDays(currentMonday, 7);
    render();
  });

  const today = document.getElementById("todayBtn");
  if (today) today.addEventListener("click", () => {
    currentMonday = startOfWeek(new Date());
    render();
  });

  // Modal klik buiten sluit deze
  const modalBackdrop = document.getElementById("taskModal");
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeTaskModal();
    });
  }

  // Modal knoppen
  document.getElementById("modalClose")?.addEventListener("click", closeTaskModal);
  document.getElementById("mSave")?.addEventListener("click", handleSaveClick);
  document.getElementById("mDelete")?.addEventListener("click", handleDeleteClick);

  // PROJECT → SECTIE dropdown
  document.getElementById("taskProject")?.addEventListener("change", (e) => {
    loadSectionOptions(Number(e.target.value));
  });

  // Type -> voertuig tonen
  document.querySelectorAll('input[name="mType"]').forEach(radio => {
    radio.addEventListener("change", () => {
      const type = document.querySelector('input[name="mType"]:checked')?.value;
      const vr = document.getElementById("vehicleRow");
      if (vr) vr.style.display = type === "montage" ? "" : "none";
    });
  });
    
}


// ==========================================================
//  RENDER
// ==========================================================
function render() {

  // 🟦 Rotated view? → classic planner NIET uit voeren
  if (document.body.classList.contains("rotated-page")) {
    return; // rotated.js regelt zélf zijn rendering
  }

  const isOverview = document.body.classList.contains("overview-page");
  isOverview ? renderOverview() : renderPlanner();

  setupDragAndDrop();
}




document.addEventListener("DOMContentLoaded", async () => {

    loadTheme();

  document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
  
  const session = await requireAuth();
  if (!session) return;

  // Admin-only links tonen
  if (window.__IS_ADMIN === true) {
    document.querySelectorAll(".admin-only-link").forEach((el) => {
      el.style.display = "";
    });
  }

  // Overzichtspagina alleen voor admins
  if (document.body.classList.contains("overview-page") && !isAdmin()) {
    window.location.href = "index.html";
    return;
  }

  setupLogout();
  wire(); // <-- EERST event handlers koppelen

  document.getElementById("prodClose")?.addEventListener("click", () => {
    document.getElementById("prodTextModal").hidden = true;
});


  await loadProjects(); // <-- dan pas projecten ophalen

  // Alleen tonen waar projectList bestaat (admin UI)
  if (document.getElementById("projectList")) {
    renderProjectList();
  }

  await reload(); // <-- nu pas data laden in UI

  setupRealtime(); // <-- realtime bijwerken aanzetten
});

function renderProjectList() {
  const list = document.getElementById("projectList");
  if (!list) return;

  list.innerHTML = "";

  PROJECTS.forEach(p => {
    const div = document.createElement("div");
    div.className = "project-row";

    div.innerHTML = `
      <strong>${p.number || ""} — ${p.name}</strong>
      <button class="add-section" data-pid="${p.id}">+ sectie</button>
      <ul id="sections-${p.id}">
        ${(p.project_sections || [])
          .map(s => `<li>${s.section_name}</li>`)
          .join("")}
      </ul>
    `;

    list.appendChild(div);
  });

  // Hook up buttons
  document.querySelectorAll(".add-section").forEach(btn => {
    btn.addEventListener("click", () => {
      addSection(Number(btn.dataset.pid));
    });
  });
}

async function addSection(projectId) {
  const name = prompt("Naam van de nieuwe sectie:");
  if (!name) return;

  const { error } = await sb.from("project_sections").insert({
    project_id: projectId,
    section_name: name.trim()
  });

  if (error) {
    alert("Sectie opslaan mislukt: " + error.message);
    return;
  }

  await loadProjects();
  renderProjectList();
}

console.log("Planner script geladen");
// 🔄 Rotated view automatisch opnieuw tekenen
if (document.getElementById("rotGrid") && typeof renderRotatedPlanner === "function") {
    renderRotatedPlanner();
}

document.addEventListener("click", (e) => {
  if (e.target.closest(".cell") || e.target.closest(".item")) {
    console.log("Klik gedetecteerd op planner:", e.target);
  }
});

function showAssignChoice() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style = `
      position:fixed; inset:0;
      background:rgba(0,0,0,0.4);
      display:grid; place-items:center;
      z-index:99999;
    `;

    const box = document.createElement("div");
    box.style = `
      background:#222; padding:16px 20px;
      border-radius:10px; color:#eee;
      display:flex; gap:12px; flex-direction:column;
      min-width:220px; text-align:center;
    `;
    box.innerHTML = `
      <div>Taak heeft meerdere medewerkers.<br>Wat wil je doen?</div>
      <div style="display:flex; gap:8px; justify-content:center;">
        <button id="addEmp" class="btn small">➕ Toevoegen</button>
        <button id="replaceEmp" class="btn small danger">🔁 Vervangen</button>
      </div>
      <button id="cancelEmp" class="btn ghost small">Annuleren</button>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector("#addEmp").onclick = () => {
      document.body.removeChild(overlay);
      resolve("add");
    };
    box.querySelector("#replaceEmp").onclick = () => {
      document.body.removeChild(overlay);
      resolve("replace");
    };
    box.querySelector("#cancelEmp").onclick = () => {
      document.body.removeChild(overlay);
      resolve(null);
    };
  });
}

function showDeleteChoice() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style = `
      position:fixed; inset:0;
      background:rgba(0,0,0,0.45);
      display:grid; place-items:center;
      z-index:99999;
    `;

    const box = document.createElement("div");
    box.style = `
      background:#222; padding:18px 24px;
      border-radius:12px; color:#eee;
      display:flex; gap:16px; flex-direction:column;
      min-width:250px; text-align:center;
    `;
    box.innerHTML = `
      <div>Wat wil je verwijderen?</div>
      <div style="display:flex; gap:10px; justify-content:center;">
        <button id="delEmp" class="btn small danger">Collega uit taak</button>
        <button id="delTask" class="btn small danger">Complete taak</button>
      </div>
      <button id="cancelDel" class="btn ghost small">Annuleren</button>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector("#delEmp").onclick = () => { document.body.removeChild(overlay); resolve("employee"); };
    box.querySelector("#delTask").onclick = () => { document.body.removeChild(overlay); resolve("task"); };
    box.querySelector("#cancelDel").onclick = () => { document.body.removeChild(overlay); resolve(null); };
  });
}



