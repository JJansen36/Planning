// ======================================================
// VISITORS.JS — Voertuig reserveringen LOVD
// ======================================================

// We gebruiken de globale Supabase-client uit auth.js: sb
// En de functies requireAuth() en setupLogout()

let EMPLOYEES = [];
let PROJECTS = [];
let CURRENT_USER = null;

// Kleine helper
const $ = (sel) => document.querySelector(sel);

// ------------------------------------------------------
// INIT
// ------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1) Login verplicht
    const session = await requireAuth();
    if (!session) return;

    // 2) Logoutknop activeren
    setupLogout("logoutBtn");

    // 3) Ingelogde user ophalen (voor reserved_by)
    const { data: userData } = await sb.auth.getUser();
    CURRENT_USER = userData?.user || null;

    // 4) Dropdowns + lijst laden
    await Promise.all([loadEmployees(), loadProjects()]);
    await loadReservations();

    // 5) Event handlers
    setupEvents();

    // 6) Datum default op vandaag
    const todayIso = new Date().toISOString().slice(0, 10);
    $("#rDate").value = todayIso;
  } catch (e) {
    console.error("Init fout visitors:", e);
    const msg = $("#rMsg");
    if (msg) msg.textContent = "Er ging iets mis bij het laden.";
  }
});

// ------------------------------------------------------
// DATA LADEN
// ------------------------------------------------------
async function loadEmployees() {
  const { data, error } = await sb
    .from("employees")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("Fout medewerkers:", error);
    return;
  }

  EMPLOYEES = data || [];
  const sel = $("#rEmp");
  if (!sel) return;

  sel.innerHTML = EMPLOYEES
    .map((e) => `<option value="${e.id}">${e.name}</option>`)
    .join("");
}

async function loadProjects() {
  const { data, error } = await sb
    .from("projects")
    .select("id, number, name, customer")
    .order("number", { ascending: true });

  if (error) {
    console.error("Fout projecten:", error);
    return;
  }

  PROJECTS = data || [];
  const sel = $("#rProj");
  if (!sel) return;

  sel.innerHTML = PROJECTS.map((p) => {
    const label =
      (p.number ? p.number + " — " : "") +
      (p.name || "") +
      (p.customer ? " (" + p.customer + ")" : "");
    return `<option value="${p.id}">${label}</option>`;
  }).join("");
}

async function loadReservations() {
  const { data, error } = await sb
    .from("vehicle_reservations")
    .select(
      "id, date, start_time, end_time, vehicle, kind, notes, employee_id, project_id, reserved_by"
    )
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Fout reserveringen:", error);
    return;
  }

  renderReservations(data || []);
}

// ------------------------------------------------------
// RENDER RESERVERINGEN
// ------------------------------------------------------
function renderReservations(list) {
  const ul = $("#rList");
  if (!ul) return;

  if (!list.length) {
    ul.innerHTML = "<li>(Nog geen reserveringen)</li>";
    return;
  }

  ul.innerHTML = list
    .map((r) => {
      const emp = EMPLOYEES.find((e) => e.id === r.employee_id);
      const proj = PROJECTS.find((p) => p.id === r.project_id);

      const empName = emp ? emp.name : "(onbekende medewerker)";
      const projLabel = proj
        ? (proj.number ? proj.number + " — " : "") + (proj.name || "")
        : "";
      const kindLabel = r.kind === "project" ? "Project" : "Privé";

      return `
        <li class="res-item">
          <strong>${r.date}</strong> — ${r.vehicle} — ${kindLabel}<br>
          ${r.start_time || ""}–${r.end_time || ""}<br>
          ${empName}${projLabel ? " — " + projLabel : ""}<br>
          <small>Door: ${r.reserved_by || "onbekend"}</small><br>
          ${r.notes ? `<em>${r.notes}</em>` : ""}
        </li>
      `;
    })
    .join("");
}

// ------------------------------------------------------
// EVENTS
// ------------------------------------------------------
function setupEvents() {
  const kindSel = $("#rKind");
  const projSel = $("#rProj");
  const saveBtn = $("#rSave");

  if (kindSel && projSel) {
    const toggleProject = () => {
      const isProject = kindSel.value === "project";
      projSel.disabled = !isProject;
    };
    kindSel.addEventListener("change", toggleProject);
    toggleProject(); // init
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", handleSaveReservation);
  }
}

// ------------------------------------------------------
// OPSLAAN
// ------------------------------------------------------
async function handleSaveReservation() {
  const empSel = $("#rEmp");
  const vehSel = $("#rVeh");
  const dateInp = $("#rDate");
  const startInp = $("#rStart");
  const endInp = $("#rEnd");
  const kindSel = $("#rKind");
  const projSel = $("#rProj");
  const notesArea = $("#rNotes");
  const msg = $("#rMsg");

  if (msg) msg.textContent = "";

  const employee_id = empSel?.value ? Number(empSel.value) : null;
  const vehicle = vehSel?.value || null;
  const date = dateInp?.value || null;
// Automatische hele dag wanneer tijden leeg zijn
let start_time = startInp?.value;
let end_time = endInp?.value;

// Als beide leeg zijn → hele dag
if (!start_time && !end_time) {
  start_time = "08:00";
  end_time = "17:00";
}

// Alleen start leeg → vul hele dag
else if (!start_time) {
  start_time = "08:00";
}

// Alleen eind leeg → vul hele dag
else if (!end_time) {
  end_time = "17:00";
}

  const kind = kindSel?.value || "project";
  const project_id =
    kind === "project" && projSel?.value ? Number(projSel.value) : null;
  const notes = notesArea?.value?.trim() || null;

if (!employee_id || !vehicle || !date) {
  if (msg) msg.textContent = "Vul medewerker, voertuig en datum in.";
  return;
}


  if (end_time <= start_time) {
    if (msg) msg.textContent = "Eindtijd moet na starttijd liggen.";
    return;
  }

  const reserved_by =
    CURRENT_USER?.email ||
    CURRENT_USER?.user_metadata?.full_name ||
    CURRENT_USER?.id ||
    null;

  const payload = {
    employee_id,
    vehicle,
    date,
    start_time,
    end_time,
    kind,
    project_id,
    notes,
    reserved_by,
  };

  try {
    const { error } = await sb
      .from("vehicle_reservations")
      .insert(payload);

    if (error) {
      console.error("Opslaan fout:", error);
      if (msg) msg.textContent = "Opslaan mislukt: " + error.message;
      return;
    }

    if (msg) msg.textContent = "Reservering opgeslagen.";
    if (notesArea) notesArea.value = "";
    await loadReservations();
  } catch (e) {
    console.error(e);
    if (msg) msg.textContent = "Onbekende fout bij opslaan.";
  }
}
