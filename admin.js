// ======================================================
// ADMIN.JS — LOVD BEHEER
// ======================================================

let PROJECTS = [];
let SECTIONS = [];
let EMPLOYEES = [];
let CURRENT_PROJECT_ID = null;

const $ = (s) => document.querySelector(s);

// ======================================================
// INIT
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireAuth();
  if (!session) return;

  setupLogout();
  initEvents();

  await loadProjects();
  await loadEmployees();
});

// live zoekfunctie
document.getElementById("projectSearch")?.addEventListener("input", () => {
  renderProjectList();
});

// ======================================================
// FILTER PROJECTEN
// ======================================================
function filterProjects(query) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return PROJECTS;

  return PROJECTS.filter((p) =>
    (p.number || "").toLowerCase().includes(q) ||
    (p.name || "").toLowerCase().includes(q) ||
    (p.customer || "").toLowerCase().includes(q) ||
    (p.install_address || "").toLowerCase().includes(q)
  );
}

// ======================================================
// LOADERS
// ======================================================
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

// ======================================================
// PROJECT LIJST
// ======================================================
function renderProjectList() {
  const list = $("#projectList");
  if (!list) return;

  const q = $("#projectSearch")?.value || "";
  const projects = filterProjects(q);

  list.innerHTML = "";

  projects.forEach((p) => {
    const div = document.createElement("div");
    div.className = "project-row";

    div.innerHTML = `
    <div class="project-row-main">
        <div class="project-row-title">
          <span class="proj-number">${p.number || ""}</span>
          <span class="proj-name">${p.name || ""}</span>
        </div>

        ${
          (p.project_sections || []).length
            ? `<ul class="section-list">
                ${p.project_sections
                  .map(
                    s => `
                      <li class="section-mini">
                        <span class="mini-title">• ${s.section_name}</span>

                        <span class="mini-actions">
                          ${s.production_text ? `<button class="btn tiny mini-prod" data-id="${s.id}">📝</button>` : ""}
                          ${s.attachment_url ? `<a class="btn tiny mini-pdf" href="${s.attachment_url}" target="_blank">📐</a>` : ""}
                        </span>
                      </li>`
                  )
                  .join("")}
              </ul>`
            : ""
        }
      </div>

      <div class="project-row-actions">
        <button class="btn small editCombined" data-id="${p.id}">✏️ </button>
      </div>
    `;

    list.appendChild(div);
  });

  // Project bewerken
  list.querySelectorAll(".editCombined").forEach(btn => {
    btn.addEventListener("click", () => openProjectEditor(Number(btn.dataset.id)));
  });

  // Mini-productietekst openen
  list.querySelectorAll(".mini-prod").forEach(btn => {
    btn.addEventListener("click", () => openProdTextModal(Number(btn.dataset.id)));
  });
}

// ======================================================
// SECTIES
// ======================================================
function setProject(id) {
  CURRENT_PROJECT_ID = id;
  $("#sectionBox").hidden = false;
  loadSectionsForCurrent();
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

  ul.innerHTML = SECTIONS.map(s => `
    <li class="section-item">
      <div class="section-line">
        <span class="section-title">${s.section_name}</span>
        <div class="section-actions">
          <button class="btn tiny editProdTextBtn" data-id="${s.id}">📝</button>
          <button class="btn tiny uploadPdfBtn" data-id="${s.id}">📐</button>
          ${s.attachment_url ? `<a class="btn tiny" href="${s.attachment_url}" target="_blank">Open</a>` : ""}
          <button class="btn tiny danger deleteSec" data-id="${s.id}">✕</button>
        </div>
      </div>
    </li>
  `).join("");

  // Selecteren van een sectie
  ul.querySelectorAll(".section-item").forEach(li => {
    li.addEventListener("click", () => {
      const id = li.querySelector(".editProdTextBtn")?.dataset.id;
      window.__CURRENT_SECTION_ID = Number(id);

      ul.querySelectorAll(".section-item").forEach(el => {
        el.style.background = "transparent";
      });
      li.style.background = "rgba(255,255,255,0.05)";
    });
  });

  // Sectie verwijderen
  ul.querySelectorAll(".deleteSec").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Sectie verwijderen? Taken kunnen los raken!")) return;
      await sb.from("project_sections").delete().eq("id", btn.dataset.id);
      loadSectionsForCurrent();
    });
  });

  // PDF upload
  ul.querySelectorAll(".uploadPdfBtn").forEach(btn => {
    btn.addEventListener("click", () => uploadPdfForSection(btn.dataset.id));
  });

  // Productietekst openen
  ul.querySelectorAll(".editProdTextBtn").forEach(btn => {
    btn.addEventListener("click", () => openProdTextModal(Number(btn.dataset.id)));
  });
}

// ======================================================
// PRODUCTIETEKST MODAL OPENEN
// ======================================================
function openProdTextModal(secId) {
  window.__CURRENT_SECTION_ID = secId;

  sb.from("project_sections")
    .select("section_name, production_text")
    .eq("id", secId)
    .single()
    .then(({ data, error }) => {
      if (error || !data) {
        alert("Kan productietekst niet laden.");
        return;
      }

      document.getElementById("prodModalTitle").textContent =
        "Productietekst — " + data.section_name;

      document.getElementById("prodTextEditor").value =
        data.production_text || "";

      document.getElementById("prodTextModal").hidden = false;
    });
}




// ======================================================
// MEDEWERKERS
// ======================================================
function renderEmployeeList() {
  const ul = $("#empList");
  if (!ul) return;

  if (!EMPLOYEES.length) {
    ul.innerHTML = "<li>(nog geen medewerkers)</li>";
    return;
  }

  ul.innerHTML = EMPLOYEES.map(
    (e) => `
      <li class="employee-row">
        <label class="emp-left">
          <input type="checkbox" class="toggleShow" data-id="${e.id}"
            ${e.show_in_calendar !== false ? "checked" : ""}>
          <span class="emp-name">${e.name}</span>
        </label>

        <button data-id="${e.id}" class="deleteEmp btn tiny danger">✕</button>
      </li>
    `
  ).join("");

  ul.querySelectorAll(".toggleShow").forEach((chk) =>
    chk.addEventListener("change", async () => {
      await sb
        .from("employees")
        .update({ show_in_calendar: chk.checked })
        .eq("id", chk.dataset.id);
      loadEmployees();
    })
  );

  ul.querySelectorAll(".deleteEmp").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Medewerker verwijderen?")) return;
      await sb.from("employees").delete().eq("id", btn.dataset.id);
      loadEmployees();
    })
  );
}

// ======================================================
// PROJECT BEWERKEN
// ======================================================
function editProject(id) {
  const p = PROJECTS.find((x) => x.id === id);
  if (!p) return;

  CURRENT_PROJECT_ID = id;
  $("#projNumber").value = p.number || "";
  $("#projName").value = p.name || "";
  $("#projCustomer").value = p.customer || "";
  $("#mInstallAddress").value = p.install_address || "";

  $("#addProjBtn").textContent = "Project opslaan";
}

function openProjectEditor(id) {
  editProject(id);
  setProject(id);
}

// ======================================================
// EVENTS
// ======================================================
function initEvents() {

  // project toevoegen / opslaan
  $("#addProjBtn").addEventListener("click", async () => {
    const number = $("#projNumber").value.trim();
    const name = $("#projName").value.trim();
    const customer = $("#projCustomer").value.trim();
    const install_address = $("#mInstallAddress").value.trim();

    if (!name) return alert("Naam verplicht");

    if (CURRENT_PROJECT_ID) {
      await sb
        .from("projects")
        .update({ number, name, customer, install_address })
        .eq("id", CURRENT_PROJECT_ID);
    } else {
      await sb.from("projects").insert({
        number,
        name,
        customer,
        install_address,
      });
    }

    $("#projNumber").value = "";
    $("#projName").value = "";
    $("#projCustomer").value = "";
    $("#mInstallAddress").value = "";

    $("#addProjBtn").textContent = "Project toevoegen";
    CURRENT_PROJECT_ID = null;

    await loadProjects();
  });

  // nieuwe sectie
  $("#addSectionBtn").addEventListener("click", async () => {
    const name = $("#sectionName").value.trim();
    if (!name || !CURRENT_PROJECT_ID) return;

    await sb.from("project_sections").insert({
      project_id: CURRENT_PROJECT_ID,
      section_name: name,
    });

    $("#sectionName").value = "";
    loadSectionsForCurrent();
  });

  // medewerker toevoegen
  $("#addEmpBtn").addEventListener("click", async () => {
    const name = $("#empName").value.trim();
    const show = $("#empShow")?.checked;

    if (!name) return;

    await sb.from("employees").insert({ name, show_in_calendar: show });
    $("#empName").value = "";

    loadEmployees();
  });

  document.getElementById("prodSave")?.addEventListener("click", async () => {
    const id = window.__CURRENT_SECTION_ID;
    const text = document.getElementById("prodTextEditor").value;

    const { error } = await sb
      .from("project_sections")
      .update({ production_text: text })
      .eq("id", id);

    if (error) {
      alert("Opslaan mislukt!");
      return;
    }

    document.getElementById("prodTextModal").hidden = true;

    // lijst opnieuw laden zodat 📝 icoontje klopt
    loadSectionsForCurrent();
    loadProjects();
  });

    // Sluit modal via X-knop
  document.getElementById("prodClose")?.addEventListener("click", () => {
      document.getElementById("prodTextModal").hidden = true;
  });


}
