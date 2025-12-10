
function isMobile() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

let lastTappedTaskId = null;
let lastTapTime = 0;



function getFullAssignment(id) {
    return cache.assignments.find(a => a.id === id) || null;
}
if (typeof cache === "undefined") {
    console.warn("cache bestaat nog niet → wacht op app.js");
}


// -----------------------------
// ROTATED VIEW LOADER
// -----------------------------





async function loadRotated() {
    await reload();
    renderRotatedPlanner();

    // Auto-scroll naar de huidige dag
    setTimeout(() => {
        const el = document.getElementById("todayCell");
        if (el) {
            const offset = 110; // topbar + medewerker header
            const y = el.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top: y, behavior: "smooth" });
        }
    }, 50);
}


// -----------------------------
// Wacht tot app.js klaar is
// -----------------------------
document.addEventListener("DOMContentLoaded", () => {
    const wait = setInterval(() => {
        if (
            cache &&
            cache.employees?.length &&
            cache.projects?.length &&
            cache.assignments?.length
        ) {
            clearInterval(wait);
            loadRotated();
        }
    }, 50);
});



// -----------------------------
// Highlight functies (MOET BOVENAAN!)
// -----------------------------
function highlightVehicleTasks(vehicleName) {
    const target = (vehicleName || "").toLowerCase().trim();

    document.querySelectorAll(".item").forEach(it => {
        const v = (it.dataset.vehicle || "").toLowerCase().trim();

        if (v && v === target) {
            it.classList.add("vehicle-highlight");
        }
    });
}

function clearVehicleHighlights() {
    document.querySelectorAll(".item.vehicle-highlight")
        .forEach(it => it.classList.remove("vehicle-highlight"));
}



// -----------------------------
// RENDER ROTATED PLANNER
// -----------------------------
function renderRotatedPlanner() {

        console.log("🔥 RENDER START — cache.reservations =", cache.reservations);
    const grid = document.getElementById("rotGrid");

    if (!grid) return;

    grid.innerHTML = "";

    const START = currentMonday;
    const DAYS = 28; // 4 weken
    const days = Array.from({ length: DAYS }, (_, i) => addDays(START, i));

    const firstWeek = getWeekNumber(START);
    const lastWeek = getWeekNumber(addDays(START, 21));
    document.getElementById("rotWeekLabel").textContent =
        `Week ${firstWeek} t/m ${lastWeek}`;

    const emps = cache.employees.filter(e => e.show_in_calendar !== false);

    document.documentElement.style.setProperty("--emp-count", emps.length);

    // Sticky head
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
const dl = el("div", "rot-daylabel");

const dateSpan = el("div", "rot-date-text", fmtDate(day));
const vehWrap = el("div", "rot-veh-wrap");

dl.appendChild(dateSpan);
dl.appendChild(vehWrap);

        if (iso === TODAY_ISO) {
            dl.classList.add("today");
            dl.id = "todayRow";
        }

        if (day.getDay() === 0 || day.getDay() === 6) {
            dl.classList.add("weekend");
        }

        dl.style.gridColumn = "1";
        grid.appendChild(dl);

console.log("RAW RESERVATIONS:", cache.reservations);

// --------------------------------------
// VEHICLES PER DAG (project + privé)
// --------------------------------------
const vehToday = [
    // 1️⃣ Reserveringen (bus, bakwagen, privé)
    ...(cache.reservations || [])
        .filter(r => String(r.date).slice(0, 10) === iso)
        .map(r => ({
            vehicle: r.vehicle,
            private: ["privé", "prive", "private"].includes((r.kind || "").toLowerCase()),
            employee: (cache.employees.find(e => e.id === r.employee_id)?.name) || null
        })),

    // 2️⃣ Taken die een voertuig gebruiken
    ...cache.assignments
        .filter(a =>
            a.type === "montage" &&
            a.vehicle &&
            a.vehicle !== "nvt" &&
            iso >= a.start_date &&
            iso <= a.end_date
        )
        .map(a => ({
            vehicle: a.vehicle,
            private: false,
            employee: null
        }))
];

    console.log("VEH TODAY FOR", iso, vehToday);
// --------------------------------------
// RENDER VEHICLE LABELS IN DAG-CEL
// --------------------------------------
const wrap = dl.querySelector(".rot-veh-wrap");
wrap.innerHTML = ""; // leegmaken voor veiligheid

vehToday.forEach(v => {
    const row = el("div", "rot-veh-row");
    row.dataset.vehicle = v.vehicle.toLowerCase();


    // Altijd voertuignaam
    const main = el(
        "div",
        "veh-main",
        v.private ? `${v.vehicle} (privé)` : v.vehicle
    );
    row.appendChild(main);

    // Medewerkernaam bij privé
    if (v.private && v.employee) {
        const emp = el("div", "veh-emp", v.employee);
        row.appendChild(emp);
    }

    if (v.private) row.classList.add("private");

    // Hover → taken highlighten
row.addEventListener("mouseenter", () => {
    highlightVehicleTasks(v.vehicle);
});

// Weggaan → highlight verwijderen
row.addEventListener("mouseleave", () => {
    clearVehicleHighlights();
});


    wrap.appendChild(row);
});


        // medewerkers-cellen
        emps.forEach(emp => {
            addRotatedCell(grid, emp, day);
        });
    }
}



// -----------------------------
// HEADER BUILDER
// -----------------------------
function makeHeader(txt) {
    const d = document.createElement("div");
    d.className = "rot-head";
    d.textContent = txt;
    return d;
}
// -----------------------------
// ROTATED CELL BUILDER
// -----------------------------
function addRotatedCell(grid, emp, day) {
    const iso = isoDateStr(day);


    const wrap = document.createElement("div");
    wrap.className = "rot-cell";

    // WEEKEND kleur
    const isWeekend = (day.getDay() === 0 || day.getDay() === 6);
    if (isWeekend) wrap.classList.add("weekend");


    // Vandaag → markeer ALLE medewerker kolommen van deze dag
    if (iso === TODAY_ISO) {
        wrap.classList.add("today");
    }


    // AM / PM containers
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






// TAKEN ophalen
const tasks = cache.assignments.filter(a =>
    (a.employees?.includes(emp.id) || a.employee_id === emp.id) &&
    iso >= a.start_date &&
    iso <= a.end_date
);

tasks.forEach(a => {
    console.log("RAW assignment in rotated:", a);
    const it = document.getElementById("rotItemTpl")
        .content.cloneNode(true).firstElementChild;

// TAKEN-info ophalen
const proj = a.project_sections?.projects || null;
const sec  = a.project_sections || null;

// Draggable alleen voor admins
it.draggable = window.__ROLE === "admin";

// Altijd ID zetten
it.dataset.id = a.id;

it.dataset.empId = emp.id;
it.dataset.vehicle = a.vehicle || "";

// ⭐ Sectie-ID voor highlight
it.dataset.sectionId = sec?.id || "";

it.classList.add(a.type);

// LOVD markering
let isLOVD = false;
const empObj = cache.employees.find(e => e.id === emp.id);
if (empObj?.name.toLowerCase().includes("lovd")) isLOVD = true;

if (a.employees?.length) {
    for (const eid of a.employees) {
        const em = cache.employees.find(e => e.id === eid);
        if (em?.name.toLowerCase().includes("lovd")) {
            isLOVD = true;
            break;
        }
    }
}
if (isLOVD) it.classList.add("lovd");

/// ----------------------------
// 3-REGEL TAKENBLOK OPBOUWEN
// ----------------------------
const top1 = it.querySelector(".top1");
let meta = it.querySelector(".top2");

// Als de rotated template geen top2 heeft → toevoegen
if (!meta) {
    meta = document.createElement("div");
    meta.className = "top2";
    const noteEl = it.querySelector(".note");
    if (noteEl) {
        it.insertBefore(meta, noteEl);
    } else {
        it.appendChild(meta);
    }
}

const note = it.querySelector(".note");

// REGEL 1 → PROJECTNUMMER + PROJECTNAAM
top1.textContent = proj ? `${proj.number}, ${proj.name}` : "";

// REGEL 2 → SECTIE of LOVD-NOTITIE
if (isLOVD) {
    if (a.notes && a.notes.trim().length > 0) {
        meta.textContent = a.notes.trim();
    } else {
        meta.textContent = "LOVD taak";
    }
} else {
    meta.textContent = sec?.section_name || "";
}



// REGEL 3 → ICONEN (PDF + PRODUCTIETEKST)
let icons = "";

if (sec?.attachment_url) icons += "📐 ";
if (sec?.production_text) icons += "📋 ";

note.textContent = icons.trim();
note.style.display = icons ? "block" : "none";

console.log("ICONS SET:", icons, "IN NOTE:", note);


// 📍 GOOGLE MAPS PIN
if (proj?.install_address) {
    const maps = "https://www.google.com/maps?q=" + encodeURIComponent(proj.install_address);
    it.dataset.map = maps;

    const pin = document.createElement("span");
    pin.className = "map-pin";
    pin.dataset.map = maps;
    pin.textContent = " 📍";
    top1.appendChild(pin);
}

// 📄 PDF KLIKHANDLER
top1.querySelectorAll(".pdf-icon").forEach(pdf => {
    pdf.style.cursor = "pointer";
    pdf.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(pdf.dataset.pdf, "_blank");
    });
});


// CLICK HANDLER (PDF → pin → modal)
// CLICK: altijd volledige assignment ophalen
let lastTapTime = 0;

it.addEventListener("click", (e) => {
    e.stopPropagation();

    const now = Date.now();

    // Desktop → altijd direct modal
    if (!isMobile()) {
        openTaskModal(getFullAssignment(a.id), { readonly: false });
        return;
    }

    // MOBIEL
    if (lastTappedTaskId === a.id && (now - lastTapTime) < 12000) {
        // 2e tik → modal openen
        openTaskModal(getFullAssignment(a.id), { readonly: false });

        lastTappedTaskId = null;
        lastTapTime = 0;
        return;
    }

    // Eerste tik → highlight
    lastTappedTaskId = a.id;
    lastTapTime = now;

    // Forceer highlight-update op mobiel
    document.querySelectorAll(".item").forEach(x => x.classList.remove("touch-highlight"));
    it.classList.add("touch-highlight");
});


    // URGENT
    if (a.urgent) {
        it.classList.add("urgent");
        if (top1) top1.classList.add("urgent");
    }

    // AM / PM / FULL
    const blk = a.block || blockFromTimes(a.start_time, a.end_time);

    if (blk === "am") {
        am.appendChild(it);
    } else if (blk === "pm") {
        pm.appendChild(it);
    } else {
        // HELE DAG → dubbele taak (AM+PM)
// HELE DAG → twee items (AM + PM) met volledige record
const itAM = it.cloneNode(true);
const itPM = it.cloneNode(true);

[itAM, itPM].forEach(cl => {
    cl.addEventListener("click", (e) => {
        e.stopPropagation();
        const mp = e.target.closest(".map-pin");
        if (mp) {
            window.open(mp.dataset.map, "_blank");
            return;
        }
        const full = getFullAssignment(a.id);
        if (full) openTaskModal(full, { readonly: false });
    });
});

am.appendChild(itAM);
pm.appendChild(itPM);

    }
});





    // Nieuwe taak toevoegen
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

    grid.appendChild(wrap);
}



// -----------------------------
// DRAG & DROP (ROTATED)
// -----------------------------
let draggedTask = null;

document.addEventListener("dragstart", e => {
    if (window.__ROLE !== "admin") return;


    const item = e.target.closest(".item");
    if (!item) return;

    draggedTask = item;
    item.classList.add("dragging");
});

document.addEventListener("dragover", e => {
    if (window.__ROLE !== "admin") return;
 // ← BELANGRIJK

    const dz = e.target.closest(".dropzone");
    if (!dz) return;

    e.preventDefault(); // nodig voor drop
    dz.classList.add("drop-hover");
});


document.addEventListener("dragleave", e => {
    if (window.__ROLE !== "admin") return;


    const dz = e.target.closest(".dropzone");
    if (dz) dz.classList.remove("drop-hover");
});

document.addEventListener("drop", async e => {
    if (window.__ROLE !== "admin") return;


    const dz = e.target.closest(".dropzone");
    if (!dz || !draggedTask) return;

    e.preventDefault();
    dz.classList.remove("drop-hover");

    const taskId = Number(draggedTask.dataset.id);
    const empId = Number(dz.dataset.empId);
    const date = dz.dataset.date;
    const part = dz.dataset.part;
    const oldEmpId = Number(draggedTask.dataset.empId);

    // SHIFT = kopie
    if (e.shiftKey) {
        await copyTask(taskId, empId, date, part);
        draggedTask.classList.remove("dragging");
        draggedTask = null;
        return;
    }

    // Zelfde medewerker → simpel verplaatsen
    if (oldEmpId === empId) {
        await moveTask(taskId, empId, date, part);
        draggedTask.classList.remove("dragging");
        draggedTask = null;
        return;
    }

    // Popup keuze
    const choice = await showDragChoice();
    if (!choice) {
        draggedTask.classList.remove("dragging");
        draggedTask = null;
        return;
    }

    if (choice === "replace") {
        await moveTask(taskId, empId, date, part);
    } else if (choice === "add") {
        await addEmployeeToTask(taskId, empId);
    }

    draggedTask.classList.remove("dragging");
    draggedTask = null;
});




// -----------------------------
// COPY / MOVE / ADD EMPLOYEE
// -----------------------------
async function copyTask(taskId, empId, date, part) {
    const original = cache.assignments.find(a => a.id === taskId);
    if (!original) return;

    const t = timesForBlock(part);

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

    if (error) return;

    const employees =
        original.employees?.length
            ? original.employees
            : (original.employee_id ? [original.employee_id] : []);

    for (const e of employees) {
        await sb.from("assignment_employees")
            .insert({ assignment_id: newAssign.id, employee_id: e });
    }

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

    await sb.from("assignment_employees")
        .delete()
        .eq("assignment_id", taskId);

    await sb.from("assignment_employees")
        .insert({ assignment_id: taskId, employee_id: empId });

    await loadRotated();
}



async function addEmployeeToTask(taskId, empId) {
    const { data: exists } = await sb
        .from("assignment_employees")
        .select("id")
        .eq("assignment_id", taskId)
        .eq("employee_id", empId)
        .maybeSingle();

    if (exists) return;

    await sb.from("assignment_employees")
        .insert({ assignment_id: taskId, employee_id: empId })
        .onConflict("assignment_id, employee_id")
        .ignore();

    await loadRotated();
}



// -----------------------------
// POPUP MENU BIJ DROP
// -----------------------------
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



// -----------------------------
// ROTATED ONLY – NAV BUTTONS
// -----------------------------
if (location.pathname.includes("rotated")) {

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
}

// ---------------------------------------------
// FIX: Production text + PDF + map openen
// ---------------------------------------------
function setupTaskModalButtons(section, project) {

    const btnProd = document.getElementById("openProdText");
    const btnPDF  = document.getElementById("openPDF");
    const btnMap  = document.getElementById("openMap");

    // Reset display
    btnProd.style.display = "none";
    btnPDF.style.display = "none";
    btnMap.style.display = "none";

    // -------------------------
    // PRODUCTIETEKST
    // -------------------------
    if (section?.production_text) {
        btnProd.style.display = "inline-block";
        btnProd.onclick = () => {
            window.open(section.production_text, "_blank");
        };
    }

    // -------------------------
    // PDF
    // -------------------------
    if (section?.attachment_url) {
        btnPDF.style.display = "inline-block";
        btnPDF.onclick = () => {
            window.open(section.attachment_url, "_blank");
        };
    }

    // -------------------------
    // MAP / ROUTE
    // -------------------------
    if (project?.install_address) {
        btnMap.style.display = "inline-block";
        btnMap.onclick = () => {
            const url = "https://www.google.com/maps?q=" +
                encodeURIComponent(project.install_address);
            window.open(url, "_blank");
        };
    }
}
