// SERVICE TAKEN LADEN
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
setInterval(loadServiceList, 20000);

// GEREED KNOP
document.body.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("svcDoneBtn")) return;

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
});
