async function loadRotated() {
    await reload();     // gebruikt jouw bestaande Supabase load
    renderRotatedPlanner();
}

// wacht totdat app.js klaar is
const wait = setInterval(() => {
    if (typeof reload === "function") {
        clearInterval(wait);
        loadRotated();
    }
}, 50);


function renderRotatedPlanner() {

    const grid = document.getElementById("rotGrid");
    grid.innerHTML = "";

    const emps = cache.employees.filter(e => e.show_in_calendar !== false);
    const days = [];
    const start = currentMonday;

    for (let i = 0; i < 14; i++) {   // 2 weken
        days.push(addDays(start, i));
    }

    // Kolomtitels
    grid.appendChild(makeHeader("Dag"));
    emps.forEach(e => grid.appendChild(makeHeader(e.name)));

    let lastWeek = null;

    days.forEach(day => {
        const iso = isoDateStr(day);
        const weekNr = getWeekNumber(day);

        // Weekregel boven maandag
        if (day.getDay() === 1 && weekNr !== lastWeek) {
            const wr = document.createElement("div");
            wr.className = "rot-weekrow";
            wr.textContent = `Week ${weekNr}`;
            wr.style.gridColumn = `1 / span ${emps.length + 1}`;
            grid.appendChild(wr);
            lastWeek = weekNr;
        }

        // Daglabel
        const dl = document.createElement("div");
        dl.className = "rot-daylabel";
        dl.textContent = fmtDate(day);
        if (day.getDay() === 0 || day.getDay() === 6) dl.classList.add("weekend");
        if (iso === TODAY_ISO) dl.classList.add("today");
        grid.appendChild(dl);

        // Per medewerker
        emps.forEach(emp => {

            // Cel via template
            const cell = document.getElementById("rotCellTpl").content.cloneNode(true).firstElementChild;

            const am = cell.querySelector(".rot-am");
            const pm = cell.querySelector(".rot-pm");

            am.dataset.date = iso;
            pm.dataset.date = iso;

            am.dataset.empId = emp.id;
            pm.dataset.empId = emp.id;

            // Taken ophalen
            const tasks = cache.assignments.filter(a =>
                a.employees?.includes(emp.id) &&
                iso >= a.start_date &&
                iso <= a.end_date
            );

            // Taken plaatsen
            tasks.forEach(a => {

                const it = document.getElementById("rotItemTpl").content.cloneNode(true).firstElementChild;
                
                // ===========================
                //  KLEURCLASS FIX
                // ===========================

                // 1. Oude planner gebruikt a.type (kan bestaan)
                if (a.type) {
                    it.classList.add(a.type);
                }

                // 2. Voor Palette project-secties
                const proj = a.project_sections?.projects;
                if (proj?.category) {
                    it.classList.add("productie");
                }

                // 3. Speciaal geval 'vrij'
                if (a.project_id === null || a.project_id === "") {
                    it.classList.add("vrij");
                }

                it.dataset.id = a.id;
                it.dataset.empId = emp.id;
                it.dataset.date = iso;
                
                if (a.type) it.classList.add(a.type);
                if (a.project_sections?.projects?.category)
                    it.classList.add(a.project_sections.projects.category);


                const sec = a.project_sections;
                

                if (proj) {
                    label = `${proj.number || ""} — ${proj.name || ""}`;
                    if (sec?.section_name) label += ` • ${sec.section_name}`;
                }

                if (a.urgent) label = "❗ " + label;

                it.querySelector(".top1").textContent = label;
                it.querySelector(".meta").textContent = "";

                // taak openen
                it.onclick = (e) => {
                    e.stopPropagation();
                    openTaskModal(a, { readonly: !isAdmin() });
                };
                // Delete
                if (isAdmin()) {
                    it.querySelector(".x").onclick = async (e) => {
                        e.stopPropagation();
                        if (!confirm("Taak verwijderen?")) return;
                        await sb.from("assignments").delete().eq("id", a.id);
                        await reload();
                        renderRotatedPlanner();
                    };
                }

                // Drag events
                it.ondragstart = e => {
    const fromEmpId = Number(it.dataset.empId || 0);

    draggedAssignment = {
        ...a,
        draggedEmployeeId: fromEmpId   // 🔥 ESSENTIEEL VOOR “VERVANG”
    };

    e.dataTransfer.setData("text/plain", a.id);
};


                // Dagdeel
                if (a.block === "am") am.appendChild(it);
                else if (a.block === "pm") pm.appendChild(it);
                else am.appendChild(it); // full → AM

            });

            // Dropzones
            [am, pm].forEach(zone => {
                zone.ondragover = e => e.preventDefault();
                zone.ondrop = async (e) => {e.preventDefault();
    if (!draggedAssignment || !isAdmin()) return;

    const rec = { ...draggedAssignment };

    const newDate = zone.dataset.date;
    const newBlock = zone.dataset.part;
    const targetEmpId = Number(zone.dataset.empId);

    if (!newDate || !newBlock || !targetEmpId) return;

    const t = timesForBlock(newBlock);

    // -------------------------------
    // 1) Huidige medewerkers correct bepalen
    // -------------------------------
    let employees = [];

    if (Array.isArray(rec.employees) && rec.employees.length) {
        employees = [...rec.employees];
    } else if (rec.employee_id) {
        employees = [Number(rec.employee_id)];
    }

    if (!employees.length) {
        employees = [targetEmpId];
    }

    rec.employees = [...employees];

    // -------------------------------
    // 2) Modal tonen bij wisselen
    // -------------------------------
    const draggedId = Number(rec.draggedEmployeeId);
    const isSameEmployee = draggedId === targetEmpId;

    if (!isSameEmployee && employees.length > 0) {
        const choice = await showAssignChoice();
        if (!choice) return;

        if (choice === "add") {
            if (!employees.includes(targetEmpId)) {
                employees.push(targetEmpId);
            }
        } else if (choice === "replace") {
            const idx = employees.indexOf(draggedId);
            if (idx >= 0) {
                employees[idx] = targetEmpId;
            }
        }
    } else {
        // zelfde medewerker → geen modal
        employees = [targetEmpId];
    }

    employees = [...new Set(employees)];

    // -------------------------------
    // 3) SHIFT = kopiëren
    // -------------------------------
    if (e.shiftKey) {
        const copy = {
            project_id: rec.project_id,
            section_id: rec.project_section_id,
            type: rec.type,
            urgent: rec.urgent,
            notes: rec.notes,
            vehicle: rec.vehicle,
            start_date: newDate,
            end_date: newDate,
            start_time: t.start,
            end_time: t.end,
            block: newBlock
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
            employees.map(empId => ({
                assignment_id: newRec.id,
                employee_id: empId
            }))
        );

        await reload();
        renderRotatedPlanner();
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
            block: newBlock
        })
        .eq("id", rec.id);

    if (errUpdate) {
        alert("Verplaatsen mislukt: " + errUpdate.message);
        return;
    }

    // medewerkers resetten
    await sb
        .from("assignment_employees")
        .delete()
        .eq("assignment_id", rec.id);

    await sb.from("assignment_employees").insert(
        employees.map(empId => ({
            assignment_id: rec.id,
            employee_id: empId
        }))
    );

    draggedAssignment = null;
    await reload();
    renderRotatedPlanner();
};



                zone.onclick = () => {
                    if (!isAdmin()) return;
                    const blk = zone.dataset.part;
                    const t = timesForBlock(blk);
                    openTaskModal(
                        {
                            employees: [zone.dataset.empId],
                            start_date: zone.dataset.date,
                            end_date: zone.dataset.date,
                            start_time: t.start,
                            end_time: t.end,
                            block: blk
                        },
                        { readonly: false }
                    );
                };
            });

            grid.appendChild(cell);
        });
    });
}

function makeHeader(txt) {
    const d = document.createElement("div");
    d.className = "rot-head";
    d.textContent = txt;
    return d;
}

if (location.pathname.includes("rotated.html")) {
    setTimeout(() => loadRotated(), 50);
}
