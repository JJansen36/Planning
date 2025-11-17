// =======================================
// AUTH.JS — centrale Supabase client
// =======================================

// Supabase globaal maken zodat andere scripts hem kunnen gebruiken
window.sb = supabase.createClient(
  "https://qejxwoxaurbwllihnvim.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlanh3b3hhdXJid2xsaWhudmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NDgzODYsImV4cCI6MjA3ODMyNDM4Nn0.D4RFJurcIsWQUC4vInW43hMPUa87Rf8r1P9T4AISbn0"
);

// Lokale variabelen verwijzen naar dezelfde client
const sb = window.sb;
const supa = window.sb;

// Admin status
let IS_ADMIN = false;
window.__IS_ADMIN = false;


// =======================================
// AUTH — verplichte login
// =======================================
async function requireAuth() {
  const { data, error } = await supa.auth.getSession();
  const session = data?.session;

  if (!session) {
    window.location.href = "login.html";
    return null;
  }

  // Admin check
  try {
    const { data: adminRow, error: adminError } = await supa
      .from("admin_settings")
      .select("is_admin")
      .eq("user_id", session.user.id)
      .maybeSingle();

    IS_ADMIN = !adminError && adminRow?.is_admin === true;
  } catch (e) {
    IS_ADMIN = false;
  }

  window.__IS_ADMIN = IS_ADMIN;
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
