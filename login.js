const loginForm = document.getElementById("loginForm");
const formError = document.getElementById("formError");
const loginSubmit = document.getElementById("loginSubmit");
const cfgProblem = configError();

if (cfgProblem) {
  formError.textContent = cfgProblem;
} else {
  // Si ya hay sesión iniciada, pasa directo a los pedidos
  auth.onAuthStateChanged(user => { if (user) location.replace("pedidos.html"); });
}

const AUTH_ERRORS = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/invalid-email": "Escribe un correo válido.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
  "auth/network-request-failed": "Sin conexión. Revisa tu internet."
};

loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  if (cfgProblem) return;

  const correo = loginForm.correo.value.trim();
  const clave = loginForm.clave.value;
  if (!correo || !clave) {
    formError.textContent = "Escribe tu correo y contraseña.";
    return;
  }

  formError.textContent = "";
  loginSubmit.disabled = true;
  try {
    await auth.signInWithEmailAndPassword(correo, clave);
    location.replace("pedidos.html");
  } catch (err) {
    formError.textContent = AUTH_ERRORS[err.code] || "No se pudo iniciar sesión.";
    loginSubmit.disabled = false;
  }
});
