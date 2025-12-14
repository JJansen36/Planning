// =======================================
// SUPABASE CLIENT
// =======================================
window.sb = supabase.createClient(
  "https://qejxwoxaurbwllihnvim.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlanh3b3hhdXJid2xsaWhudmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NDgzODYsImV4cCI6MjA3ODMyNDM4Nn0.D4RFJurcIsWQUC4vInW43hMPUa87Rf8r1P9T4AISbn0"
);

const supa = window.sb; // backward compat



// =======================================
// AUTH — verplichte login + rol laden
// =======================================
async function requireAuth() {
  const path = window.location.pathname.toLowerCase();

  // LOGIN → nooit redirecten
  if (path.includes("login.html") || path.endsWith("/login") || path.includes("login")) {
    return null;
  }

  const { data } = await supa.auth.getSession();
  const session = data?.session;

  // niet ingelogd → alleen redirect als we NIET op login zitten
  if (!session) {
    window.location.href = "login.html";
    return null;
  }

  let role = "gebruiker";

  try {
    const meta = session.user.user_metadata;
    if (meta?.role === "admin") role = "admin";
    else if (meta?.role === "hoofd") role = "hoofd";
  } catch (e) {}

  window.__ROLE = role;
  window.__IS_ADMIN = role === "admin";

  window.__USER_ID = session.user.id;
  window.__USER_EMAIL = session.user.email;


  return session;
}




// =======================================
// LOGOUT
// =======================================
function setupLogout(buttonId = "logoutBtn") {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  btn.addEventListener("click", async () => {
    await supa.auth.signOut();
    window.location.href = "login.html";
  });
}



// =======================================
// PAGINA-TOEGANG op basis van rol
// =======================================
document.addEventListener("DOMContentLoaded", async () => {
    const path = window.location.pathname.toLowerCase();

    // LOGIN en REGISTER → GEEN AUTH
    if (path.endsWith("login.html") || path.endsWith("/login") || path.includes("login")) {
        return;
    }

    // EERST requireAuth uitvoeren
    await requireAuth();

// ADMIN & HOOFD mogen admin.html openen
if (path.includes("admin.html") && !(window.__ROLE === "admin" || window.__ROLE === "hoofd")) {
    window.location.href = "index.html";
    return;
}


    // GEBRUIKER restricties
    if (window.__ROLE === "gebruiker") {
        if (
            path.includes("admin.html") ||
            path.includes("overview.html") ||
            path.includes("planner_service.html")
        ) {
            window.location.href = "index.html";
            return;
        }
    }
});

async function loadCurrentEmployeeName() {
  const {
    data: { user }
  } = await sb.auth.getUser();

  if (!user) return null;

  const { data, error } = await sb
    .from("employees")
    .select("name")
    .eq("auth_id", user.id)
    .single();

  if (error || !data) return null;

  return data.name;
}

window.loadCurrentEmployeeName = loadCurrentEmployeeName;

// =======================================
// INGELOGDE MEDEWERKER (volledig record)
// =======================================
async function loadCurrentEmployee() {
  if (!window.__USER_ID) return null;

  const { data, error } = await sb
    .from("employees")
    .select("*")
    .eq("auth_id", window.__USER_ID)
    .single();

  if (error || !data) return null;
  return data;
}

window.loadCurrentEmployee = loadCurrentEmployee;
