document.addEventListener("DOMContentLoaded", async () => {
  // Eerst checken of iemand is ingelogd
  await requireAuth();

  // Logoutknop activeren (als hij in je HTML staat)
  setupLogout();

  // HIERNA: jouw bestaande init-code voor de planner
  // bijv. initPlanner(); loadAssignments(); etc.
});
// ==========================================================
//  SUPABASE CLIENT
// ==========================================================
const { url: "https://qejxwoxaurbwllihnvim.supabase.co", key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlanh3b3hhdXJid2xsaWhudmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NDgzODYsImV4cCI6MjA3ODMyNDM4Nn0.D4RFJurcIsWQUC4vInW43hMPUa87Rf8r1P9T4AISbn0" } = window.__CONF__;
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);



let ADMIN_OK = false;
let ADMIN_PW = "";

// ==========================================================
//  KLEINE HELPERS
// ==========================================================
const $ = (s) => document.querySelector(s);

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

function isoDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
let cache = { employees: [], projects: [], assignments: [], reservations: [] };

function isAdmin() {
  return ADMIN_OK;
}

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
  const asgQ = sb.from("assignments").select("*");
  const resQ = sb.from("vehicle_reservations").select("*");

  const [emp, proj, asg, res] = await Promise.all([empQ, projQ, asgQ, resQ]);
  if (emp.error || proj.error || asg.error || res.error)
    throw emp.error || proj.error || asg.error || res.error;

  return {
    employees: emp.data,
    projects: proj.data,
    assignments: asg.data,
    reservations: res.data,
  };
}

async function reload() {
  try {
    cache = await fetchAll();
    render();
  } catch (e) {
    console.error(e);
    alert("Laden mislukt (controleer Supabase policies/schema)");
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
    grid.appendChild(el("div", "dow", fmtDate(addDays(monday, i))));
  }
}

function employeeRow(grid, emp, days) {
  grid.appendChild(el("div", "emp", emp.name));

  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    const cell = document
      .getElementById("cellTpl")
      .content.cloneNode(true).firstElementChild;
    const iso = isoDateStr(day);

    const inner = cell.querySelector(".cell-inner");
    const amContainer = cell.querySelector(".items-am") || cell.querySelector(".items");
    const pmContainer = cell.querySelector(".items-pm") || cell.querySelector(".items");

    const list = cache.assignments
      .filter((a) => a.employee_id === emp.id && inRange(iso, a.start_date, a.end_date))
      .sort((a, b) =>
        (a.start_date + a.start_time).localeCompare(b.start_date + b.start_time)
      );

    for (let k = 0; k < list.length; k++) {
      const a = list[k];
      const proj = cache.projects.find((p) => p.id === a.project_id);
      const item = document
        .getElementById("itemTpl")
        .content.cloneNode(true).firstElementChild;

      item.classList.add(a.type || "productie");
      if (emp && emp.name === "LOVD") item.classList.add("lovd");
      if (a.urgent) item.classList.add("urgent");

      const top1 = item.querySelector(".top1");
      let txt1 =
        (proj && proj.number ? proj.number : "") +
        (proj && proj.customer ? " — " + proj.customer : "");
      if (a.urgent) txt1 = "❗ " + txt1;
      top1.textContent = txt1;

      item.querySelector(".top2").textContent =
        (proj ? proj.name || "" : "") +
        (proj && proj.section ? " — " + proj.section : "");

      const parts = [];
      if (a.type === "montage" && a.vehicle && a.vehicle !== "nvt") parts.push(a.vehicle);
      if (a.notes) parts.push(a.notes);
      item.querySelector(".meta").textContent = parts.join(" • ");

      // klikken om te bewerken
      (function (rec) {
        item.addEventListener("click", function () {
          openTaskModal(rec, { readonly: !isAdmin() });
        });
      })(a);

      // delete knop
      const delBtn = item.querySelector(".x");
      if (!isAdmin()) {
        delBtn.style.display = "none";
      } else {
        (function (id) {
          delBtn.addEventListener("click", async function (e) {
            e.stopPropagation();
            if (!confirm("Taak verwijderen?")) return;
            await sb.from("assignments").delete().eq("id", id);
            await reload();
          });
        })(a.id);
      }

      // plaats in ochtend/middag/hele dag
      const blk = a.block || blockFromTimes(a.start_time, a.end_time);
      if (blk === "full") {
        item.classList.add("full-day");
        inner.appendChild(item);
      } else if (blk === "pm") {
        pmContainer.appendChild(item);
      } else {
        amContainer.appendChild(item);
      }
    }

    // dropzones voor nieuwe taak
    cell.querySelectorAll(".dropzone").forEach(function (dz) {
      const part = dz.getAttribute("data-part"); // am/pm
      (function (dateStr, partVal, empId) {
        dz.addEventListener("click", function () {
          const blk = partVal === "pm" ? "pm" : "am";
          const t = timesForBlock(blk);
          openTaskModal(
            {
              employee_id: empId,
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
            { readonly: !isAdmin() }
          );
        });
      })(iso, part, emp.id);
    });

    grid.appendChild(cell);
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

  renderVehicleBar(bar, monday);
}

function render() {
  const m1 = currentMonday;
  const m2 = addDays(currentMonday, 7);
  $("#weekLabel").textContent =
    "Week " +
    getWeekNumber(m1) +
    " & " +
    getWeekNumber(m2) +
    " — " +
    fmtDate(m1) +
    " t/m " +
    fmtDate(addDays(m2, 6));
  renderWeek($("#gridWeek1"), m1, $("#vehWeek1"));
  renderWeek($("#gridWeek2"), m2, $("#vehWeek2"));
}

// ==========================================================
//  MODAL OPENEN / SLUITEN
// ==========================================================
function openTaskModal(rec, opts) {
  rec = rec || {};
  opts = opts || {};
  const readonly = !!opts.readonly;

  const empSel = document.getElementById("mEmp");
  if (empSel) {
    empSel.innerHTML = (cache.employees || [])
      .map((e) => `<option value="${e.id}">${e.name}</option>`)
      .join("");
  }

  const firstEmpId = (cache.employees[0] && cache.employees[0].id) || "";
  const firstProjId = (cache.projects[0] && cache.projects[0].id) || "";

  // Projects
  const searchVal = document.getElementById("mProjSearch")?.value || "";
  renderProjectOptions(searchVal, rec.project_id);

  const edit = !!rec.id;
  const title = document.getElementById("taskTitle");
  if (title) {
    title.textContent = edit
      ? "Taak" + (readonly ? " (bekijken)" : " bewerken")
      : "Taak toevoegen";
  }

  setVal("mId", rec.id || "");
  setVal("mEmp", String(rec.employee_id || firstEmpId));
  setVal("mProj", String(rec.project_id || firstProjId));
  setVal("mStartDate", rec.start_date || "");
  setVal("mEndDate", rec.end_date || rec.start_date || "");
  setVal("mNotes", rec.notes || "");

  const urgEl = document.getElementById("mUrgent");
  if (urgEl) urgEl.checked = !!rec.urgent;

  const typeVal = rec.type || "productie";
  const typeRadio = document.querySelector(`input[name="mType"][value="${typeVal}"]`);
  if (typeRadio) typeRadio.checked = true;

  const vehVal = rec.vehicle || "nvt";
  const vehRadio = document.querySelector(`input[name="mVehicle"][value="${vehVal}"]`);
  if (vehRadio) vehRadio.checked = true;

  const vehicleRow = document.getElementById("vehicleRow");
  if (vehicleRow) vehicleRow.style.display = typeVal === "montage" ? "" : "none";

  let blk = rec.block || blockFromTimes(rec.start_time, rec.end_time);
  if (!blk) blk = "am";
  const blockRadio = document.querySelector(`input[name="mBlock"][value="${blk}"]`);
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
  ["#mEmp", "#mProj", "#mStartDate", "#mEndDate", "#mNotes"].forEach((sel) => {
    const inp = document.querySelector(sel);
    if (inp) inp.disabled = readonly;
  });
  // project search / add
  const projSearch = document.getElementById("mProjSearch");
  const projAdd = document.getElementById("mProjAdd");
  if (projSearch) projSearch.disabled = readonly;
  if (projAdd) projAdd.disabled = readonly;

  // radios
  ["mType", "mVehicle", "mBlock"].forEach((name) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((r) => {
      r.disabled = readonly;
    });
  });

  const modal = document.getElementById("taskModal");
  if (modal) modal.hidden = false;
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
  const empEl = document.getElementById("mEmp");
  const projEl = document.getElementById("mProj");
  const sdEl = document.getElementById("mStartDate");
  const edEl = document.getElementById("mEndDate");
  const notesEl = document.getElementById("mNotes");
  const urgEl = document.getElementById("mUrgent");

  if (!empEl || !projEl || !sdEl || !edEl || !notesEl || !urgEl) {
    alert("Interne fout: modal velden ontbreken.");
    return;
  }

  const typeRadio = document.querySelector('input[name="mType"]:checked');
  const vehRadio = document.querySelector('input[name="mVehicle"]:checked');
  const blockRadio = document.querySelector('input[name="mBlock"]:checked');

  let rec = {
    id: idVal ? Number(idVal) : null,
    employee_id: Number(empEl.value) || null,
    project_id: Number(projEl.value) || null,
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

  const blk = (blockRadio && blockRadio.value) || "am";
  const t = timesForBlock(blk);
  rec.start_time = t.start;
  rec.end_time = t.end;
  rec.block = blk;

  if (rec.type === "montage") {
    rec.vehicle = (vehRadio && vehRadio.value) || "nvt";
  } else {
    rec.vehicle = "nvt";
  }

  if (!rec.employee_id || !rec.project_id || !rec.start_date) {
    alert("Vul medewerker, project en startdatum in.");
    return;
  }
  if (rec.end_date < rec.start_date) {
    alert("Einddatum ligt vóór startdatum.");
    return;
  }
  if (rec.start_time && rec.end_time && rec.end_time <= rec.start_time) {
    alert("Eindtijd moet na starttijd liggen.");
    return;
  }

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

  Object.keys(rec).forEach((k) => {
    if (rec[k] === undefined) rec[k] = null;
  });

  try {
    if (!rec.id) {
      const insertData = { ...rec };
      delete insertData.id;
      const ins = await sb.from("assignments").insert(insertData);
      if (ins.error) throw ins.error;
    } else {
      const patch = { ...rec };
      delete patch.id;
      const upd = await sb.from("assignments").update(patch).eq("id", rec.id);
      if (upd.error) throw upd.error;
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
  // einddatum volgt standaard startdatum
  (function () {
    const sd = document.getElementById("mStartDate");
    const ed = document.getElementById("mEndDate");
    if (sd && ed) {
      sd.addEventListener("change", function () {
        if (sd.value && !ed.value) {
          ed.value = sd.value;
        }
      });
    }
  })();

  // weeknavigatie
  $("#prevWeek")?.addEventListener("click", function () {
    currentMonday = addDays(currentMonday, -7);
    render();
  });
  $("#nextWeek")?.addEventListener("click", function () {
    currentMonday = addDays(currentMonday, 7);
    render();
  });
  $("#todayBtn")?.addEventListener("click", function () {
    currentMonday = startOfWeek(new Date());
    render();
  });

  // admin wachtwoord
  const pwd = document.getElementById("adminPwd");
  if (pwd) {
    pwd.addEventListener("input", (e) => {
      const pw = e.target.value;
      clearTimeout(window.__admT);
      window.__admT = setTimeout(() => verifyAdminPlanner(pw), 250);
    });
  }

  // modal backdrop click
  const modalBackdrop = document.getElementById("taskModal");
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", function (e) {
      if (e.target === modalBackdrop) closeTaskModal();
    });
  }

  // X-knop
  const xBtn = document.getElementById("modalClose");
  if (xBtn) xBtn.addEventListener("click", closeTaskModal);

  // save / delete
  const saveBtn = document.getElementById("mSave");
  if (saveBtn) saveBtn.addEventListener("click", handleSaveClick);

  const delBtn = document.getElementById("mDelete");
  if (delBtn) delBtn.addEventListener("click", handleDeleteClick);

  // project zoeken / toevoegen
  const projSearch = document.getElementById("mProjSearch");
  if (projSearch) {
    projSearch.addEventListener("input", function (e) {
      renderProjectOptions(e.target.value, document.getElementById("mProj")?.value);
    });
  }
  const projAdd = document.getElementById("mProjAdd");
  if (projAdd) projAdd.addEventListener("click", quickAddProjectViaModal);

  // type-radio's tonen/verbergen voertuig
  document.querySelectorAll('input[name="mType"]').forEach((radio) => {
    radio.addEventListener("change", function () {
      const t = document.querySelector('input[name="mType"]:checked')?.value;
      const row = document.getElementById("vehicleRow");
      if (row) row.style.display = t === "montage" ? "" : "none";
    });
  });
}

// ==========================================================
//  INIT
// ==========================================================
document.addEventListener("DOMContentLoaded", async function () {
  wire();
  await reload();
});
