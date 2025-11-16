// auth.js
// ---------------------------------
// Vul hier jouw Supabase gegevens in
// ---------------------------------
const SUPABASE_URL = "https://qejxwoxaurbwllihnvim.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlanh3b3hhdXJid2xsaWhudmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NDgzODYsImV4cCI6MjA3ODMyNDM4Nn0.D4RFJurcIsWQUC4vInW43hMPUa87Rf8r1P9T4AISbn0";


// Globale Supabase client
const supa = supabase.createClient("https://qejxwoxaurbwllihnvim.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlanh3b3hhdXJid2xsaWhudmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NDgzODYsImV4cCI6MjA3ODMyNDM4Nn0.D4RFJurcIsWQUC4vInW43hMPUa87Rf8r1P9T4AISbn0");
const sb = supa;


// Huidige sessie ophalen
async function getSession() {
  const { data, error } = await supa.auth.getSession();
  if (error) {
    console.error("Fout bij ophalen sessie:", error);
    return null;
  }
  return data.session;
}

// Voor pagina's die alleen toegankelijk mogen zijn als je bent ingelogd
async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

// Voor admin-only pagina's (admin.html)
// Verwacht een tabel admin_settings met kolommen: user_id (uuid) en is_admin (bool)
async function requireAdmin() {
  const session = await requireAuth();
  if (!session) return null;

  const { data, error } = await supa
    .from("admin_settings")
    .select("is_admin")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("Fout bij ophalen admin_settings:", error);
    // als het misgaat: veiligheidshalve weg
    window.location.href = "index.html";
    return null;
  }

  if (!data || data.is_admin !== true) {
    // Geen admin → terug naar planner
    window.location.href = "index.html";
    return null;
  }

  return { session, admin: data };
}

// Logout helper: koppel aan een knop-id
function setupLogout(buttonId = "logoutBtn") {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  btn.addEventListener("click", async () => {
    await supa.auth.signOut();
    window.location.href = "login.html";
  });
}
