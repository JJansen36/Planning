// =====================================================
// admin.js — LOVD Beheer (medewerkers + projecten)
// =====================================================




// Klein hulpfunctietje
const $ = (s) => document.querySelector(s);

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// -----------------------------------------------------
// INIT
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  // 1) Inloggen verplicht
  const session = await requireAuth();
  if (!session) return;

  // 2) Logout-knop
  setupLogout("logoutBtn");

  // 3) Admin-flag uit auth.js
  IS_ADMIN = window.__IS_ADMIN === true;

  const warning = $("#adminWarning");
  if (!IS_ADMIN && warning) {
    warning.textContent =
      "Je bent geen admin. Je kunt de lijsten bekijken, maar niet wijzigen.";
  }

  // 4) Data laden (ook voor niet-admin → alleen lezen)
  await Promise.all([loadEmployees(), loadProjects()]);

  // 5) Event-handlers koppelen
  setupEmployeeEvents();
  setupProjectEvents();

  // 6) Admin-only knoppen disablen voor niet-admin
  if (!IS_ADMIN) {
    document.querySelectorAll(".admin-only").forEach((el) => {
      el.disabled = true;
    });
  }
});

// =====================================================
// MEDEWERKERS
// =====================================================
async function loadEmployees() {
  const list = $("#empList");
  if (!list) return;

  list.innerHTML = "<li>(laden...)</li>";

  const { data, error } = await sb
    .from("employees")
    .select("id, name, show_in_calendar, calendar_order")
    .order("calendar_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) {
    console.error("Fout bij laden medewerkers:", error);
    list.innerHTML = "<li>Fout bij laden medewerkers.</li>";
    return;
  }

  if (!data || !data.length) {
    list.innerHTML = "<li>(Nog geen medewerkers)</li>";
    return;
  }

  list.innerHTML = data
    .map(
      (e) => `
      <li class="list-item" data-id="${e.id}">
        <div class="row">
          <input class="emp-name" type="text" value="${esc(e.name)}">
          <label class="chk">
            <input class="emp-show" type="checkbox" ${
              e.show_in_calendar !== false ? "checked" : ""
            }>
            In kalender
          </label>
          <span class="badge small">Volgorde: ${e.calendar_order ?? "-"}</span>
        </div>
        <div class="row mt">
          <button class="small primary emp-save admin-only">Opslaan</button>
          <button class="small danger emp-del admin-only">Verwijderen</button>
        </div>
      </li>
    `
    )
    .join("");
}

async function addEmployee() {
  if (!IS_ADMIN) {
    alert("Alleen admins kunnen medewerkers toevoegen.");
    return;
  }

  const nameEl = $("#empName");
  const showEl = $("#empShow");
  if (!nameEl || !showEl) return;

  const name = nameEl.value.trim();
  const show = !!showEl.checked;

  if (!name) {
    alert("Vul een naam in.");
    return;
  }

  const { error } = await sb
    .from("employees")
    .insert({ name, show_in_calendar: show });

  if (error) {
    console.error("Fout medewerker toevoegen:", error);
    alert("Fout bij toevoegen medewerker.");
    return;
  }

  nameEl.value = "";
  showEl.checked = true;

  await loadEmployees();
}

async function saveEmployee(li) {
  if (!IS_ADMIN) {
    alert("Alleen admins kunnen medewerkers wijzigen.");
    return;
  }
  if (!li) return;

  const id = Number(li.getAttribute("data-id"));
  const nameEl = li.querySelector(".emp-name");
  const showEl = li.querySelector(".emp-show");

  if (!id || !nameEl || !showEl) return;

  const name = nameEl.value.trim();
  const show = !!showEl.checked;

  if (!name) {
    alert("Naam mag niet leeg zijn.");
    return;
  }

  const { error } = await sb
    .from("employees")
    .update({ name, show_in_calendar: show })
    .eq("id", id);

  if (error) {
    console.error("Fout medewerker opslaan:", error);
    alert("Fout bij opslaan medewerker.");
    return;
  }

  await loadEmployees();
}

async function deleteEmployee(id) {
  if (!IS_ADMIN) {
    alert("Alleen admins kunnen medewerkers verwijderen.");
    return;
  }
  if (!confirm("Weet je zeker dat je deze medewerker wilt verwijderen?")) return;

  const { error } = await sb.from("employees").delete().eq("id", id);

  if (error) {
    console.error("Fout medewerker verwijderen:", error);
    alert("Fout bij verwijderen medewerker.");
    return;
  }

  await loadEmployees();
}

function setupEmployeeEvents() {
  const addBtn = $("#addEmpBtn");
  if (addBtn) addBtn.addEventListener("click", addEmployee);

  const list = $("#empList");
  if (!list) return;

  list.addEventListener("click", (e) => {
    const btn = e.target;
    if (!(btn instanceof HTMLElement)) return;
    const li = btn.closest("li.list-item");
    if (!li) return;

    if (btn.classList.contains("emp-save")) {
      saveEmployee(li);
    } else if (btn.classList.contains("emp-del")) {
      const id = Number(li.getAttribute("data-id"));
      if (id) deleteEmployee(id);
    }
  });
}

// =====================================================
// PROJECTEN
// =====================================================
async function loadProjects() {
  const list = $("#projList");
  if (!list) return;

  list.innerHTML = "<li>(laden...)</li>";

  const { data, error } = await sb
    .from("projects")
    .select("id, number, name, customer, section")
    .order("number", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) {
    console.error("Fout bij laden projecten:", error);
    list.innerHTML = "<li>Fout bij laden projecten.</li>";
    return;
  }

  if (!data || !data.length) {
    list.innerHTML = "<li>(Nog geen projecten)</li>";
    return;
  }

  list.innerHTML = data
    .map(
      (p) => `
      <li class="list-item" data-id="${p.id}">
        <div class="grid2">
          <label>Nr
            <input class="proj-number" type="text" value="${esc(p.number)}">
          </label>
          <label>Naam
            <input class="proj-name" type="text" value="${esc(p.name)}">
          </label>
        </div>
        <div class="grid2 mt">
          <label>Klant
            <input class="proj-customer" type="text" value="${esc(p.customer)}">
          </label>
          <label>Sectie
            <input class="proj-section" type="text" value="${esc(p.section)}">
          </label>
        </div>
        <div class="row mt">
          <button class="small primary proj-save admin-only">Opslaan</button>
          <button class="small danger proj-del admin-only">Verwijderen</button>
        </div>
      </li>
    `
    )
    .join("");
}

async function addProject() {
  if (!IS_ADMIN) {
    alert("Alleen admins kunnen projecten toevoegen.");
    return;
  }

  const numEl = $("#projNumber");
  const nameEl = $("#projName");
  const custEl = $("#projCustomer");
  const sectEl = $("#projSection");
  if (!numEl || !nameEl || !custEl || !sectEl) return;

  const number = numEl.value.trim() || null;
  const name = nameEl.value.trim();
  const customer = custEl.value.trim() || null;
  const section = sectEl.value.trim() || null;

  if (!name) {
    alert("Projectnaam is verplicht.");
    return;
  }

  const { error } = await sb
    .from("projects")
    .insert({ number, name, customer, section });

  if (error) {
    console.error("Fout project toevoegen:", error);
    alert("Fout bij toevoegen project.");
    return;
  }

  numEl.value = "";
  nameEl.value = "";
  custEl.value = "";
  sectEl.value = "";

  await loadProjects();
}

async function saveProject(li) {
  if (!IS_ADMIN) {
    alert("Alleen admins kunnen projecten wijzigen.");
    return;
  }
  if (!li) return;

  const id = Number(li.getAttribute("data-id"));
  if (!id) return;

  const numEl = li.querySelector(".proj-number");
  const nameEl = li.querySelector(".proj-name");
  const custEl = li.querySelector(".proj-customer");
  const sectEl = li.querySelector(".proj-section");
  if (!numEl || !nameEl || !custEl || !sectEl) return;

  const number = numEl.value.trim() || null;
  const name = nameEl.value.trim();
  const customer = custEl.value.trim() || null;
  const section = sectEl.value.trim() || null;

  if (!name) {
    alert("Projectnaam is verplicht.");
    return;
  }

  const { error } = await sb
    .from("projects")
    .update({ number, name, customer, section })
    .eq("id", id);

  if (error) {
    console.error("Fout project opslaan:", error);
    alert("Fout bij opslaan project.");
    return;
  }

  await loadProjects();
}

async function deleteProject(id) {
  if (!IS_ADMIN) {
    alert("Alleen admins kunnen projecten verwijderen.");
    return;
  }
  if (!confirm("Weet je zeker dat je dit project wilt verwijderen?")) return;

  const { error } = await sb.from("projects").delete().eq("id", id);

  if (error) {
    console.error("Fout project verwijderen:", error);
    alert("Fout bij verwijderen project.");
    return;
  }

  await loadProjects();
}

function setupProjectEvents() {
  const addBtn = $("#addProjBtn");
  if (addBtn) addBtn.addEventListener("click", addProject);

  const list = $("#projList");
  if (!list) return;

  list.addEventListener("click", (e) => {
    const btn = e.target;
    if (!(btn instanceof HTMLElement)) return;
    const li = btn.closest("li.list-item");
    if (!li) return;

    if (btn.classList.contains("proj-save")) {
      saveProject(li);
    } else if (btn.classList.contains("proj-del")) {
      const id = Number(li.getAttribute("data-id"));
      if (id) deleteProject(id);
    }
  });
}
