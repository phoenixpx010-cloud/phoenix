/* ============================================================
   PEGA AQUÍ TUS CLAVES (único archivo que debes editar)
   - Firebase: Consola > Configuración del proyecto > Tus apps > Web
   - Cloudinary: cloudName (Dashboard) y un Upload Preset "Unsigned"
   NUNCA pegues aquí el API Secret de Cloudinary.

   REGLAS DE FIRESTORE (Firebase > Firestore > Reglas > pegar y Publicar):
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /pedidos/{id} {
         // Cualquier cliente puede CREAR un pedido (con campos controlados)
         allow create: if request.resource.data.keys().hasOnly(
             ['codigo','nombre','telefono','correo','carro','descripcion','imagenUrl','imagenId','fecha'])
           && request.resource.data.nombre is string && request.resource.data.nombre.size() < 200
           && request.resource.data.descripcion is string && request.resource.data.descripcion.size() < 3000
           && request.resource.data.imagenUrl.matches('https://res.cloudinary.com/.*');
   
         // Solo TU cuenta puede leer. Cambia el correo por el tuyo.
         allow read: if request.auth != null
           && request.auth.token.email == 'CAMBIA_ESTO_POR_TU_CORREO@ejemplo.com';
   
         allow update, delete: if false;
       }
     }
   }
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey: "PEGA_AQUI",
  authDomain: "PEGA_AQUI",
  projectId: "PEGA_AQUI",
  appId: "PEGA_AQUI"
};

const CLOUDINARY = {
  cloudName: "PEGA_AQUI",
  uploadPreset: "PEGA_AQUI"
};

/* ---------- No editar de aquí para abajo ---------- */
let auth = null;
let db = null;

function configError() {
  if (location.protocol === "file:") {
    return "Abre el sitio desde un servidor (Live Server, localhost o hosting), no con doble clic en el archivo.";
  }
  const vals = [...Object.values(FIREBASE_CONFIG), CLOUDINARY.cloudName, CLOUDINARY.uploadPreset];
  if (vals.some(v => String(v).startsWith("PEGA_"))) {
    return "Falta pegar tus claves en firebase-config.js.";
  }
  return "";
}

if (!configError()) {
  firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();
}

/* ===== Nuevo pedido ===== */
(function () {
const MAX_BYTES = 8 * 1024 * 1024;

const form = document.getElementById("orderForm");
const success = document.getElementById("success");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("imagen");
const preview = document.getElementById("preview");
const previewImg = document.getElementById("previewImg");
const previewName = document.getElementById("previewName");
const submitBtn = document.getElementById("submitBtn");
const toast = document.getElementById("toast");

let selectedFile = null;
let previewUrl = null;

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function setError(name, msg) {
  const el = form.querySelector(`.error[data-for="${name}"]`);
  if (el) el.textContent = msg || "";
  const input = form.elements[name];
  if (input && name !== "imagen") input.setAttribute("aria-invalid", msg ? "true" : "false");
  if (name === "imagen") dropzone.classList.toggle("invalid", !!msg);
}

/* ---------- Validaciones ---------- */
const rules = {
  nombre: v => v.length < 3 ? "Escribe tu nombre completo." : "",
  telefono: v => {
    const digits = v.replace(/\D/g, "");
    return /^[+\d][\d\s()-]*$/.test(v) && digits.length >= 7 && digits.length <= 15
      ? "" : "Escribe un teléfono válido (7 a 15 dígitos).";
  },
  correo: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : "Escribe un correo válido.",
  carro: v => v.length < 2 ? "Indica el nombre y modelo del carro." : "",
  descripcion: v => v.length < 10 ? "Describe tu diseño (mínimo 10 caracteres)." : ""
};

function validateField(name) {
  const msg = rules[name](form.elements[name].value.trim());
  setError(name, msg);
  return !msg;
}

Object.keys(rules).forEach(name => {
  form.elements[name].addEventListener("blur", () => validateField(name));
  form.elements[name].addEventListener("input", () => {
    if (form.elements[name].getAttribute("aria-invalid") === "true") validateField(name);
  });
});

/* ---------- Imagen ---------- */
function setImage(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) return setError("imagen", "El archivo debe ser una imagen.");
  if (file.size > MAX_BYTES) return setError("imagen", "La imagen supera los 8 MB.");

  setError("imagen", "");
  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  previewImg.src = previewUrl;
  previewName.textContent = file.name;
  preview.hidden = false;
}

function clearImage() {
  selectedFile = null;
  fileInput.value = "";
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  previewImg.removeAttribute("src");
  preview.hidden = true;
}

fileInput.addEventListener("change", () => setImage(fileInput.files[0]));
document.getElementById("removeImg").addEventListener("click", clearImage);

["dragenter", "dragover"].forEach(ev =>
  dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add("drag"); }));
["dragleave", "drop"].forEach(ev =>
  dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove("drag"); }));
dropzone.addEventListener("drop", e => setImage(e.dataTransfer.files[0]));

// Sube la imagen a Cloudinary (preset "unsigned", sin claves secretas)
async function uploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY.uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`, { method: "POST", body: fd });
  if (!res.ok) throw new Error("cloudinary");
  const data = await res.json();
  return { url: data.secure_url, id: data.public_id };
}

/* ---------- Envío ---------- */
form.addEventListener("submit", async e => {
  e.preventDefault();

  let ok = true;
  Object.keys(rules).forEach(name => { if (!validateField(name)) ok = false; });
  if (!selectedFile) { setError("imagen", "Añade una imagen de tu diseño."); ok = false; }
  if (!ok) {
    showToast("Revisa los campos marcados.");
    const first = form.querySelector('[aria-invalid="true"]');
    if (first) first.focus();
    return;
  }

  const cfgProblem = configError();
  if (cfgProblem) return showToast(cfgProblem);

  submitBtn.disabled = true;
  try {
    const img = await uploadImage(selectedFile);
    const codigo = "PHX-" + Date.now().toString(36).toUpperCase().slice(-6);

    await db.collection("pedidos").doc(codigo).set({
      codigo,
      nombre: form.nombre.value.trim(),
      telefono: form.telefono.value.trim(),
      correo: form.correo.value.trim(),
      carro: form.carro.value.trim(),
      descripcion: form.descripcion.value.trim(),
      imagenUrl: img.url,
      imagenId: img.id,
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById("orderCode").textContent = codigo;
    form.hidden = true;
    success.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    showToast("No se pudo enviar el pedido. Revisa tu conexión e inténtalo de nuevo.");
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById("newAgain").addEventListener("click", () => {
  form.reset();
  clearImage();
  success.hidden = true;
  form.hidden = false;
});

})();

/* ===== Login ===== */
(function () {
const loginForm = document.getElementById("loginForm");
const formError = document.getElementById("formError");
const loginSubmit = document.getElementById("loginSubmit");
const cfgProblem = configError();

if (cfgProblem) {
  formError.textContent = cfgProblem;
} else {
  // Si ya hay sesión iniciada, pasa directo a los pedidos
  
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
    location.hash = "#/pedidos";
  } catch (err) {
    formError.textContent = AUTH_ERRORS[err.code] || "No se pudo iniciar sesión.";
    loginSubmit.disabled = false;
  }
});

})();

/* ===== Lista de pedidos ===== */
(function () {
const ordersEl = document.getElementById("orders");
const countEl = document.getElementById("count");
const searchEl = document.getElementById("search");

let allOrders = [];
let unsub = null;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Solo se aceptan imágenes alojadas en Cloudinary
const safeImg = u => (typeof u === "string" && u.startsWith("https://res.cloudinary.com/")) ? u : "";

function fmtDate(ts) {
  return ts && ts.toDate
    ? ts.toDate().toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })
    : "";
}

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const rows = allOrders.filter(o =>
    !q || [o.codigo, o.nombre, o.carro, o.telefono, o.correo].some(v => String(v ?? "").toLowerCase().includes(q)));

  countEl.textContent = allOrders.length
    ? `${rows.length} de ${allOrders.length} pedido${allOrders.length === 1 ? "" : "s"}`
    : "Aún no hay pedidos.";

  if (!rows.length) {
    ordersEl.innerHTML = `<p class="empty">${allOrders.length ? "Sin resultados para tu búsqueda." : "Cuando lleguen pedidos aparecerán aquí."}</p>`;
    return;
  }

  ordersEl.innerHTML = rows.map(o => {
    const img = safeImg(o.imagenUrl);
    return `
      <article class="order-card">
        ${img ? `<a href="${esc(img)}" target="_blank" rel="noopener"><img src="${esc(img)}" alt="Diseño de ${esc(o.nombre)}" loading="lazy"></a>` : `<div class="no-img">Sin imagen</div>`}
        <div class="order-body">
          <span class="code">${esc(o.codigo)} · ${esc(fmtDate(o.fecha))}</span>
          <h3>${esc(o.nombre)}</h3>
          <p class="meta"><b>Carro:</b> ${esc(o.carro)}</p>
          <p class="meta"><b>Teléfono:</b> <a href="tel:${esc(o.telefono)}">${esc(o.telefono)}</a></p>
          <p class="meta"><b>Correo:</b> <a href="mailto:${esc(o.correo)}">${esc(o.correo)}</a></p>
          <p class="desc">${esc(o.descripcion)}</p>
        </div>
      </article>`;
  }).join("");
}

searchEl.addEventListener("input", render);

const cfgProblem = configError();
if (cfgProblem) {
  countEl.textContent = "";
  ordersEl.innerHTML = `<p class="empty">${esc(cfgProblem)}</p>`;
} else {
  auth.onAuthStateChanged(user => {
    if (unsub) { unsub(); unsub = null; }
    if (!user) { allOrders = []; return; }

    unsub = db.collection("pedidos").orderBy("fecha", "desc").onSnapshot(
      snap => { allOrders = snap.docs.map(d => d.data()); render(); },
      () => {
        countEl.textContent = "";
        ordersEl.innerHTML = `<p class="empty">No se pudieron cargar los pedidos. Verifica que tu cuenta tenga permiso (reglas de Firestore).</p>`;
      });
  });
}

})();

/* ===== Navegación entre pantallas ===== */
(function () {
const names = ["home", "nuevo", "login", "pedidos"];
const views = {};
names.forEach(n => { views[n] = document.getElementById("view-" + n); });
const bar = document.getElementById("topActions");
let user = null;
let ready = !auth;

const BAR = {
  home: '<button class="login-btn" data-go="login" type="button"><span class="login-icon">◉</span> Login</button>',
  nuevo: '<button class="login-btn" data-go="home" type="button">← Volver</button>',
  login: '<button class="login-btn" data-go="home" type="button">← Volver</button>',
  pedidos: '<button class="login-btn" data-go="home" type="button">← Inicio</button><button class="login-btn" data-logout type="button">Salir</button>'
};

function route() {
  let name = location.hash.replace("#/", "");
  if (!views[name]) name = "home";
  if (name === "pedidos" && auth) {
    if (!ready) return;
    if (!user) { location.replace("#/login"); return; }
  }
  if (name === "login" && user) { location.replace("#/pedidos"); return; }
  names.forEach(n => { views[n].hidden = n !== name; });
  bar.innerHTML = BAR[name];
  window.scrollTo(0, 0);
}

document.addEventListener("click", e => {
  const go = e.target.closest("[data-go]");
  if (go) { location.hash = "#/" + go.dataset.go; return; }
  if (e.target.closest("[data-logout]") && auth) {
    location.hash = "#/home";
    auth.signOut();
  }
});

window.addEventListener("hashchange", route);
if (auth) auth.onAuthStateChanged(u => { user = u; ready = true; route(); });
route();
})();
