// -----------------------------
// ROTATED VIEW LOADER
// -----------------------------
async function loadRotated() {
    await reload();          // data uit Supabase
    renderRotatedPlanner();  // render 4-weken rotated grid
}

// wacht tot app.js klaar is
document.addEventListener("DOMContentLoaded", () => {
    const wait = setInterval(() => {
        if (cache && cache.employees) {
            clearInterval(wait);
            loadRotated();
        }
    }, 50);
});



function renderRotatedPlanner() {
    const grid = document.getElementById("rotGrid");
    if (!grid) return;

    grid.innerHTML = "";

    const START = currentMonday;
    const DAYS = 28;  // 4 weken
    const days = Array.from({length: DAYS}, (_, i) => addDays(START, i));

    const firstWeek = getWeekNumber(START);
    const lastWeek = getWeekNumber(addDays(START, 21));
    document.getElementById("rotWeekLabel").textContent =
        `Week ${firstWeek} t/m ${lastWeek}`;

        const emps = cache.employees.filter(e => e.show_in_calendar !== false);

        document.documentElement.style.setProperty("--emp-count", emps.length);

// maak kolommen in CSS
document.documentElement.style.setProperty("--emp-count", emps.length);

// bouw sticky head
const head = document.getElementById("rotHead");
head.innerHTML = "<div>Dag</div>" +
    emps.map(e => {
        const isLovd = e.name && e.name.toLowerCase().includes("lovd");
        const cls = isLovd ? "emp-LOVD" : "";
        return `<div class="${cls}">${e.name}</div>`;
    }).join("");


    grid.style.setProperty("--emp-count", emps.length);

    let currentWeek = null;

    for (const day of days) {
        const iso = isoDateStr(day);
        const week = getWeekNumber(day);

        // Week separator
        if (week !== currentWeek) {
            currentWeek = week;
            const sep = el("div", "rot-weekrow", `Week ${week}`);
            sep.style.gridColumn = `1 / span ${emps.length + 1}`;
            grid.appendChild(sep);
        }

        // Daglabel links
        const dl = el("div", "rot-daylabel", fmtDate(day));
        if (iso === TODAY_ISO) dl.classList.add("today");
        if (day.getDay() === 0 || day.getDay() === 6) dl.classList.add("weekend");
        dl.style.gridColumn = "1";
        grid.appendChild(dl);

        // ===============================
        // VOERTUIGRESERVERINGEN PER DAG
        // (zoals oude versie – uit vehicle_reservations)
        // ===============================
        const vehToday = (cache.reservations || []).filter(r => {
            // r.date is al een ISO-datum (2025-12-01)
            return String(r.date).slice(0, 10) === iso;
        });

        vehToday.forEach(r => {
            const veh = r.vehicle || "voertuig";

            const isPrivate =
                (r.kind && r.kind.toLowerCase() === "private") ||
                (r.notes || "").toLowerCase().includes("priv");

            const row = el("div", "rot-veh-row", isPrivate ? `${veh} (privé)` : veh);
            row.dataset.vehicle = veh;

            if (isPrivate) row.classList.add("private");

            // hover → taken met dezelfde wagen highlighten
            row.addEventListener("mouseenter", () => highlightVehicleTasks(veh));
            row.addEventListener("mouseleave", () => clearVehicleHighlights());

            // in de dag-cel onder de datum
            dl.appendChild(row);
        });


        // medewerkers-cellen
        emps.forEach(emp => {
            addRotatedCell(grid, emp, day);
        });
    }
}



function makeHeader(txt) {
    const d = document.createElement("div");
    d.className = "rot-head";
    d.textContent = txt;
    return d;
}

if (location.pathname.includes("rotated.html")) {
    setTimeout(() => loadRotated(), 50);

function highlightVehicleTasks(vehicleName) {
    document.querySelectorAll(".item").forEach(it => {
        if (it.dataset.vehicle &&
            it.dataset.vehicle.toLowerCase() === vehicleName.toLowerCase()) {
            
            it.classList.add("vehicle-highlight");
        }
    });
}

function clearVehicleHighlights() {
    document.querySelectorAll(".item.vehicle-highlight")
        .forEach(it => it.classList.remove("vehicle-highlight"));
}
}
document.getElementById("prevRot").onclick = () => {
    currentMonday = addDays(currentMonday, -7);
    renderRotatedPlanner();
};

document.getElementById("nextRot").onclick = () => {
    currentMonday = addDays(currentMonday, 7);
    renderRotatedPlanner();
};

document.getElementById("todayRot").onclick = () => {
    currentMonday = startOfWeek(new Date());
    renderRotatedPlanner();
};

function addRotatedCell(grid, emp, day) {
    const iso = isoDateStr(day);

    const wrap = document.createElement("div");
    wrap.className = "rot-cell";

    // === AM/PM containers =====================================
    const am = document.createElement("div");
    am.className = "rot-am rot-part dropzone";

    am.dataset.part = "am";
    am.dataset.empId = emp.id;
    am.dataset.date = iso;

    const pm = document.createElement("div");
    pm.className = "rot-pm rot-part dropzone";

    pm.dataset.part = "pm";
    pm.dataset.empId = emp.id;
    pm.dataset.date = iso;

    wrap.appendChild(am);
    wrap.appendChild(pm);

    am.classList.add("dropzone");
    pm.classList.add("dropzone");

    // ===========================================================

    // TAKEN ophalen
    const tasks = cache.assignments.filter(a =>
        (a.employees?.includes(emp.id) || a.employee_id === emp.id) &&
        iso >= a.start_date &&
        iso <= a.end_date
    );

tasks.forEach(a => {
    const it = document.getElementById("rotItemTpl")
        .content.cloneNode(true).firstElementChild;

        it.classList.add("item"); // ← BELANGRIJK!
// --- LOVD taak-markering ---
let isLOVD = false;

// 1) Huidige kolom-medewerker checken
const empObj = cache.employees.find(e => e.id === emp.id);
if (empObj && empObj.name && empObj.name.toLowerCase().includes("lovd")) {
    isLOVD = true;
}

// 2) Check of een van de medewerkers in de taak LOVD is
if (a.employees?.length > 0) {
    for (const eid of a.employees) {
        const em = cache.employees.find(e => e.id === eid);
        if (em && em.name && em.name.toLowerCase().includes("lovd")) {
            isLOVD = true;
            break;
        }
    }
}

// 3) Class toepassen
if (isLOVD) {
    it.classList.add("lovd");
}


    it.draggable = true;
    it.dataset.id = a.id;
    it.dataset.empId = emp.id;



    // Klik op bestaande taak → modal openen
    it.addEventListener("click", (e) => {
        e.stopPropagation();
        openTaskModal(a, { readonly: false });
    });

    it.dataset.vehicle = a.vehicle || "";
    it.classList.add(a.type);

    const proj = a.project_sections?.projects;
    const sec = a.project_sections;

    let label = "";
    if (proj) label = `${proj.number} ${proj.name}`;
    if (sec?.section_name) label += ` • ${sec.section_name}`;

    // PROJECT LABEL
    // REGEL 1 — projectnummer + klantnaam
    const top1 = it.querySelector(".top1");
    if (proj) {
        top1.textContent = `${proj.number} ${proj.name}`;
    } else {
        top1.textContent = "";
    }

    // REGEL 2 — sectie
    const meta = it.querySelector(".meta");
    if (sec && sec.section_name) {
        meta.textContent = sec.section_name;
    } else {
        meta.textContent = "";
    }

    // NOTITIE ZICHTBAAR
    const noteEl = it.querySelector(".note");
    if (noteEl) {
        if (a.note && a.note.trim() !== "") {
            noteEl.textContent = a.note;
            noteEl.style.display = "block";
        } else {
            noteEl.style.display = "none";
        }
    }

    // URGENTIE 
    if (a.urgent) {
    it.classList.add("urgent");
    const top1 = it.querySelector(".top1");
    if (top1) top1.classList.add("urgent");
}


    // BLOCK PLAATSING
    const blk = a.block || blockFromTimes(a.start_time, a.end_time);

    if (blk === "pm") pm.appendChild(it);
    else if (blk === "am") am.appendChild(it);
    else {
        it.classList.add("full-block");
        am.appendChild(it);
    }
});



    // === CLICK om nieuwe taak toe te voegen ========================
    [am, pm].forEach(part => {
        part.addEventListener("click", function (e) {
            if (!isAdmin() || e.target !== part) return;

            const blk = part.dataset.part;
            const t = timesForBlock(blk);

            openTaskModal({
                employee_id: emp.id,
                employees: [emp.id],
                project_id: cache.projects[0]?.id || null,
                start_date: iso,
                end_date: iso,
                start_time: t.start,
                end_time: t.end,
                type: "productie",
                vehicle: "nvt",
                urgent: false,
                notes: null,
                block: blk
            }, { readonly: false });
        });
    });
    // ================================================================

    grid.appendChild(wrap);
}

// ==========================================
// DRAG & DROP HANDLERS (rotated)
// ==========================================
let draggedTask = null;

// start
document.addEventListener("dragstart", e => {
    const item = e.target.closest(".item");
    if (!item) return;
    draggedTask = item;
    item.classList.add("dragging");
});

// dragover
document.addEventListener("dragover", e => {
    const dz = e.target.closest(".dropzone");
    if (!dz) return;
    e.preventDefault();
    dz.classList.add("drop-hover");
});

// dragleave
document.addEventListener("dragleave", e => {
    const dz = e.target.closest(".dropzone");
    if (dz) dz.classList.remove("drop-hover");
});

// drop
document.addEventListener("drop", async e => {
    const dz = e.target.closest(".dropzone");
    if (!dz || !draggedTask) return;

    e.preventDefault();
    dz.classList.remove("drop-hover");

    const taskId = Number(draggedTask.dataset.id);
    const empId  = Number(dz.dataset.empId);
    const date   = dz.dataset.date;
    const part   = dz.dataset.part;

    const oldEmpId = Number(draggedTask.dataset.empId);

    // 1️⃣ SHIFT = ALTIJD KOPIËREN
    if (e.shiftKey) {
        await copyTask(taskId, empId, date, part);

        // dragging reset
        draggedTask.classList.remove("dragging");
        draggedTask = null;

        return;
    }

    // 2️⃣ ZELFDE MEDEWERKER → direct verplaatsen
    if (oldEmpId === empId) {
        await moveTask(taskId, empId, date, part);

        draggedTask.classList.remove("dragging");
        draggedTask = null;

        return;
    }

    // 3️⃣ ANDERE MEDEWERKER → popup
    const choice = await showDragChoice();
    if (!choice) {
        draggedTask.classList.remove("dragging");
        draggedTask = null;
        return;
    }

    if (choice === "replace") {
        await moveTask(taskId, empId, date, part);
    } 
    else if (choice === "add") {
        await addEmployeeToTask(taskId, empId);
    }

    // ALTIJD dragging stopzetten
    draggedTask.classList.remove("dragging");
    draggedTask = null;
});



async function copyTask(taskId, empId, date, part) {
    const original = cache.assignments.find(a => a.id === taskId);
    if (!original) return;

    const t = timesForBlock(part);

    // Belangrijk:
    // assignments heeft GEEN project_id kolom
    // dus we halen alleen de sectie op
    const sectionId =
        original.project_section_id ||
        original.project_sections?.id ||
        null;

    const { data: newAssign, error } = await sb
        .from("assignments")
        .insert({
            project_section_id: sectionId,
            type: original.type,
            urgent: original.urgent,
            notes: original.notes,
            vehicle: original.vehicle,
            block: part,
            start_date: date,
            end_date: date,
            start_time: t.start,
            end_time: t.end
        })
        .select()
        .single();

    if (error) {
        console.error("COPY ERROR:", error);
        return;
    }

    // medewerkers kopiëren
    const employees =
        original.employees?.length
            ? original.employees
            : (original.employee_id ? [original.employee_id] : []);

    for (const e of employees) {
        await sb.from("assignment_employees")
            .insert({ assignment_id: newAssign.id, employee_id: e });
    }

    // medewerker van de drop-zone toevoegen indien nodig
    if (!employees.includes(empId)) {
        await sb.from("assignment_employees")
            .insert({ assignment_id: newAssign.id, employee_id: empId });
    }

    await loadRotated();
}


async function moveTask(taskId, empId, date, part) {
    const t = timesForBlock(part);

    await sb.from("assignments")
        .update({
            start_date: date,
            end_date: date,
            start_time: t.start,
            end_time: t.end
        })
        .eq("id", taskId);

    // update employee of assignment_employees
    await sb.from("assignment_employees")
        .delete()
        .eq("assignment_id", taskId);

    await sb.from("assignment_employees")
        .insert({ assignment_id: taskId, employee_id: empId });

    await loadRotated();
}

async function addEmployeeToTask(taskId, empId) {

    // check of medewerker al bestaat in deze taak
    const { data: exists } = await sb
        .from("assignment_employees")
        .select("id")
        .eq("assignment_id", taskId)
        .eq("employee_id", empId)
        .maybeSingle();

    if (exists) {
        console.log("Medewerker zit al in taak → insert overslaan");
        return;
    }

    await sb.from("assignment_employees")
    .insert({ assignment_id: taskId, employee_id: empId })
    .onConflict("assignment_id, employee_id")
    .ignore();

    await loadRotated();
}


// ===============================================
//  KEUZEMENU BIJ DRAG & DROP (Rotated)
// ===============================================
async function showDragChoice() {
    return new Promise((resolve) => {
        const modal = document.createElement("div");
        modal.className = "modal-backdrop";
        modal.innerHTML = `
            <div class="modal" style="max-width:320px; text-align:center;">
                <h3>Taak verplaatsen</h3>
                <p>Wil je deze taak verplaatsen of toevoegen aan deze medewerker?</p>
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button id="dragReplace" class="primary">Verplaatsen</button>
                    <button id="dragAdd" class="btn">Toevoegen</button>
                    <button id="dragCancel" class="btn ghost">Annuleren</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector("#dragReplace").onclick = () => {
            modal.remove();
            resolve("replace");
        };
        modal.querySelector("#dragAdd").onclick = () => {
            modal.remove();
            resolve("add");
        };
        modal.querySelector("#dragCancel").onclick = () => {
            modal.remove();
            resolve(null);
        };
    });
}



