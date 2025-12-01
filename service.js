

// --- PROJECTS LADEN ---
async function loadProjects() {
  const { data } = await sb.from("projects").select("*").order("number");
  const sel = document.getElementById("svcProject");
  sel.innerHTML = data.map(p =>
    `<option value="${p.id}">${p.number} — ${p.name}</option>`).join("");

  loadSections(sel.value);
}

// --- SECTIES LADEN ---
async function loadSections(projectId) {
  const { data } = await sb.from("project_sections")
    .select("*")
    .eq("project_id", projectId)
    .order("section_name");

  const sel = document.getElementById("svcSection");
  sel.innerHTML = data.map(s =>
    `<option value="${s.id}">${s.section_name}</option>`).join("");
}

// --- WIJZIGING PROJECT → SECTIES VERVERSEN ---
document.getElementById("svcProject").addEventListener("change", (e) => {
  loadSections(e.target.value);
});

// --- FORM SUBMIT ---
document.getElementById("svcForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const project_id = +document.getElementById("svcProject").value;
  const section_id = +document.getElementById("svcSection").value;
  const description = document.getElementById("svcDesc").value;
  const priority = +document.getElementById("svcPrio").value;

  await sb.from("service_tasks").insert({
    project_id,
    section_id,
    description,
    priority,
    status: "open",
    created_by: window.__USER_EMAIL || "onbekend",
  });

  alert("Service taak opgeslagen!");
  document.getElementById("svcForm").reset();
});

loadProjects();

async function loadServiceList() {
  const { data, error } = await sb
    .from("service_tasks")
    .select("*, projects(*), project_sections(*)")
    .order("priority")
    .order("created_at");

  const box = document.getElementById("svcList");

  if (!data || data.length === 0) {
    box.innerHTML = "<p>Geen service taken gevonden.</p>";
    return;
  }

  box.innerHTML = data.map(t => {
    return `
      <div class="svcRow prio${t.priority}">
        <div class="svcRowTop">
          <span class="svcNr">#${t.ticket_number}</span>
          <span class="svcPrio">P${t.priority}</span>
          <span class="svcStatus">${t.status}</span>
        </div>

        <div class="svcProj">
          ${t.projects?.number || ""} — ${t.projects?.name || ""}
          <br>
          <small>${t.project_sections?.section_name || ""}</small>
        </div>

        <div class="svcDesc">${t.description}</div>

        ${t.status !== "gereed" ? `
          <button class="svcDoneBtn" data-id="${t.id}">
            Gereed
          </button>
        ` : ""}
      </div>
    `;
  }).join("");

}
loadServiceList();  
setInterval(loadServiceList, 20000); // elke 20 seconden verversen


document.addEventListener("DOMContentLoaded", () => {

  document.body.addEventListener("click", async (e) => {
    if (e.target.classList.contains("svcDoneBtn")) {
      const id = e.target.dataset.id;

      const { error } = await sb
        .from("service_tasks")
        .update({
          status: "gereed",
          done_by: window.__USER_EMAIL || "onbekend",
        })
        .eq("id", id);

      if (error) {
        console.error("Update error:", error);
        alert("Fout bij gereed melden (zie console)");
        return;
      }

      loadServiceList();
    }
  });

});
