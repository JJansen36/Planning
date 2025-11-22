// ADMIN.JS — LOVD beheer

let PROJECTS = [];
let SECTIONS = [];
let EMPLOYEES = [];
let CURRENT_PROJECT_ID = null;

const $ = (s) => document.querySelector(s);

// INIT
document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireAuth();
  if (!session) return;

  setupLogout();
  initEvents();
  await loadProjects();
  await loadEmployees();
});

// --------------------
// DATA LOADERS
// --------------------
async function loadProjects() {
  const { data, error } = await sb
    .from("projects")
    .select("*, project_sections(*)")
    .order("number", { ascending: true });

  if (error) return console.error(error);

  PROJECTS = data || [];
  renderProjectList();

  if (CURRENT_PROJECT_ID) loadSectionsForCurrent();
}

async function loadSectionsForCurrent() {
  if (!CURRENT_PROJECT_ID) return;
  const { data, error } = await sb
    .from("project_sections")
    .select("*")
    .eq("project_id", CURRENT_PROJECT_ID)
    .order("section_name", { ascending: true });

  if (error) return console.error(error);

  SECTIONS = data || [];
  renderSectionList();
}

async function loadEmployees() {
  const { data, error } = await sb
    .from("employees")
    .select("*")
    .order("calendar_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return console.error(error);
  EMPLOYEES = data || [];
  renderEmployeeList();
}

// --------------------
// UI RENDERING
// --------------------
function renderProjectList() {
  const list = $("#projectList");
  list.innerHTML = "";

  PROJECTS.forEach((p) => {
    const div = document.createElement("div");
    div.className = "project-row";
    div.innerHTML = `
      <strong>${p.number} — ${p.name}</strong>
      <button class="btn small" onclick="setProject(${p.id})">Beheer secties</button>
    `;
    list.appendChild(div);
  });
}

function setProject(id) {
  CURRENT_PROJECT_ID = id;
  loadSectionsForCurrent();
  $("#sectionBox").hidden = false;
}

function renderSectionList() {
  const ul = $("#sectionList");
  const header = $("#sectionHeader");

  const proj = PROJECTS.find((p) => p.id === CURRENT_PROJECT_ID);

  header.textContent = `Secties bij: ${proj?.number || ""} — ${proj?.name || ""}`;

  if (!SECTIONS.length) {
    ul.innerHTML = "<li>(nog geen secties)</li>";
    return;
  }

  ul.innerHTML = SECTIONS.map(
    (s) => `
    <li>
      ${s.section_name}
      <button data-id="${s.id}" class="deleteSec btn small danger">X</button>
    </li>
  `
  ).join("");

  ul.querySelectorAll(".deleteSec").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Sectie verwijderen? Taken kunnen los raken!")) return;
      await sb.from("project_sections").delete().eq("id", btn.dataset.id);
      await loadSectionsForCurrent();
    });
  });
}

function renderEmployeeList() {
  const ul = $("#empList");
  if (!ul) return;

  if (!EMPLOYEES.length) {
    ul.innerHTML = "<li>(nog geen medewerkers)</li>";
    return;
  }

  ul.innerHTML = EMPLOYEES.map(
    (e) => `
    <li>
      ${e.name}
      <label><input type="checkbox" class="toggleShow" data-id="${e.id}"
        ${e.show_in_calendar !== false ? "checked" : ""}> tonen</label>
      <button data-id="${e.id}" class="deleteEmp btn small danger">X</button>
    </li>
  `
  ).join("");

  ul.querySelectorAll(".toggleShow").forEach((chk) => {
    chk.addEventListener("change", async () => {
      await sb
        .from("employees")
        .update({ show_in_calendar: chk.checked })
        .eq("id", chk.dataset.id);
      loadEmployees();
    });
  });

  ul.querySelectorAll(".deleteEmp").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Medewerker verwijderen?")) return;
      await sb.from("employees").delete().eq("id", btn.dataset.id);
      loadEmployees();
    });
  });
}

// --------------------
// EVENTS
// --------------------
function initEvents() {
  $("#addProjBtn").addEventListener("click", async () => {
    const number = $("#projNumber").value.trim();
    const name = $("#projName").value.trim();
    const customer = $("#projCustomer").value.trim();

    if (!name) return alert("Naam verplicht");

    await sb.from("projects").insert({ number, name, customer });
    $("#projNumber").value = "";
    $("#projName").value = "";
    $("#projCustomer").value = "";
    await loadProjects();
  });

  $("#addSectionBtn").addEventListener("click", async () => {
    const name = $("#sectionName").value.trim();
    if (!name || !CURRENT_PROJECT_ID) return;

    await sb.from("project_sections").insert({
      project_id: CURRENT_PROJECT_ID,
      section_name: name,
    });

    $("#sectionName").value = "";
    await loadSectionsForCurrent();
  });

  $("#addEmpBtn").addEventListener("click", async () => {
    const name = $("#empName").value.trim();
    const show = $("#empShow").checked;

    await sb.from("employees").insert({ name, show_in_calendar: show });

    $("#empName").value = "";
    await loadEmployees();
  });
}
