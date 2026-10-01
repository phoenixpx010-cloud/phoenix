/* ============================================================
   PEGA AQUÍ TUS CLAVES DE FIREBASE (único bloque que debes editar)
   Firebase: Configuración del proyecto > Tus apps > Web > firebaseConfig

   REGLAS DE FIRESTORE (Firebase > Firestore > Reglas > pegar y Publicar):

   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {

       function mail() { return request.auth.token.email.lower(); }
       function isAdmin() { return request.auth != null && mail() == 'phoenix001@gmail.com'; }
       function stageOf() {
         return request.auth == null ? '' :
           mail() == 'cortpx01@gmail.com' ? 'Corte' :
           mail() == 'sewingpx@gmail.com' ? 'Costura' :
           mail() == 'installpx01@gmail.com' ? 'Instalación' : '';
       }
       function nextStage(s) {
         return s == 'Administración' ? 'Corte' : s == 'Corte' ? 'Costura' : s == 'Costura' ? 'Instalación' : 'Terminado';
       }

       match /pedidos/{id} {
         // Pedido nuevo desde la página pública
         allow create: if request.resource.data.keys().hasOnly(
             ['codigo','nombre','telefono','correo','carro','descripcion','imagen','etapa','fecha'])
           && request.resource.data.nombre is string && request.resource.data.nombre.size() < 200
           && request.resource.data.descripcion is string && request.resource.data.descripcion.size() < 3000
           && request.resource.data.imagen is string && request.resource.data.imagen.size() < 800000
           && request.resource.data.imagen.matches('data:image/jpeg;base64,.*')
           && request.resource.data.etapa == 'Administración'
           && request.resource.data.codigo == id;

         // Pedido creado por Administración desde el panel
         allow create: if isAdmin()
           && request.resource.data.keys().hasOnly(
             ['codigo','nombre','telefono','correo','carro','descripcion','imagen','etapa','fecha',
              'anio','placa','prioridad','detalles','historial'])
           && request.resource.data.nombre is string && request.resource.data.nombre.size() < 200
           && request.resource.data.descripcion is string && request.resource.data.descripcion.size() < 3000
           && request.resource.data.imagen is string && request.resource.data.imagen.size() < 800000
           && request.resource.data.etapa == 'Administración'
           && request.resource.data.codigo == id;

         // Consultar un pedido: solo quien tenga el número exacto
         allow get: if true;

         // Listas: Administración ve todo; cada departamento solo su etapa
         allow list: if isAdmin()
           || (resource.data.etapa == 'Corte' && request.auth != null && mail() == 'cortpx01@gmail.com')
           || (resource.data.etapa == 'Costura' && request.auth != null && mail() == 'sewingpx@gmail.com')
           || (resource.data.etapa == 'Instalación' && request.auth != null && mail() == 'installpx01@gmail.com');

         // Pasar de etapa: exactamente a la siguiente (Administración o el departamento dueño)
         allow update: if request.auth != null
           && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['etapa','historial'])
           && request.resource.data.etapa == nextStage(resource.data.get('etapa','Administración'))
           && (isAdmin() || stageOf() == resource.data.get('etapa','Administración'));

         // Precio: solo Administración puede ponerlo o cambiarlo
         allow update: if isAdmin()
           && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['precio'])
           && request.resource.data.precio is number
           && request.resource.data.precio >= 0 && request.resource.data.precio < 1000000000;

         // Borrar: el cliente (con su número) o Administración
         allow delete: if true;
       }
     }
   }
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAMI4EvmNZUL5Je7wbhMQa3nJ8AxQKbFWs",
  authDomain: "phoenix-7a553.firebaseapp.com",
  projectId: "phoenix-7a553",
  appId: "1:1000958540730:web:ffe83f274d5e4211f4fb83"
};

/* ---------- No editar de aquí para abajo ---------- */
// Accesos del panel (el correo decide qué ve cada quien; las reglas de Firestore lo hacen cumplir)
const ROLES = {
  "phoenix001@gmail.com": { role: "admin", label: "Administración" },
  "cortpx01@gmail.com": { role: "stage", label: "Corte", stage: "Corte" },
  "sewingpx@gmail.com": { role: "stage", label: "Costura", stage: "Costura" },
  "installpx01@gmail.com": { role: "stage", label: "Instalación", stage: "Instalación" }
};

let auth = null;
let db = null;

function configError() {
  if (location.protocol === "file:") {
    return "Abre el sitio desde un servidor (Live Server, localhost o hosting), no con doble clic en el archivo.";
  }
  const vals = Object.values(FIREBASE_CONFIG);
  if (vals.some(v => String(v).startsWith("PEGA_"))) {
    return "Falta pegar tus claves de Firebase al inicio de script.js.";
  }
  return "";
}

if (!configError()) {
  firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();
}

function notify(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.notifyTimer);
  window.notifyTimer = setTimeout(() => t.classList.remove("show"), 2800);
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

// Reduce la imagen (máx. 1000 px, JPEG) para guardarla dentro del pedido en Firestore
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let q = 0.8, out = canvas.toDataURL("image/jpeg", q);
      while (out.length > 700000 && q > 0.3) { q -= 0.1; out = canvas.toDataURL("image/jpeg", q); }
      out.length > 700000 ? reject(new Error("muy grande")) : resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagen inválida")); };
    img.src = url;
  });
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
    const imagen = await compressImage(selectedFile);
    const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const rnd = crypto.getRandomValues(new Uint8Array(8));
    const codigo = "PHX-" + Array.from(rnd, n => abc[n % abc.length]).join("");

    await db.collection("pedidos").doc(codigo).set({
      codigo,
      nombre: form.nombre.value.trim(),
      telefono: form.telefono.value.trim(),
      correo: form.correo.value.trim(),
      carro: form.carro.value.trim(),
      descripcion: form.descripcion.value.trim(),
      imagen,
      etapa: "Administración",
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
    location.hash = "#/panel";
  } catch (err) {
    formError.textContent = AUTH_ERRORS[err.code] || "No se pudo iniciar sesión.";
    loginSubmit.disabled = false;
  }
});

})();

/* ===== Panel interno (Administración y departamentos) ===== */
(function () {


  const stages = ['Administración', 'Corte', 'Costura', 'Instalación', 'Terminado'];
  const colors = { Administración: '#2c93ec', Corte: '#e6b640', Costura: '#a876ff', Instalación: '#35c9c8', Terminado: '#1bd17e' };
  const orderStatus = { Nuevo: 'status-new', 'En proceso': 'status-process', Terminado: 'status-done' };

  const initials = name => (name || 'P').split(' ').filter(Boolean).slice(0,2).map(x => x[0].toUpperCase()).join('');
  const dateText = iso => {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('es-CO', { day:'2-digit', month:'2-digit', year:'numeric' }).format(d);
  };
  const relative = iso => {
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const mins = Math.floor(diff/60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins} min`;
    const hrs = Math.floor(mins/60);
    if (hrs < 24) return `Hace ${hrs} h`;
    const days = Math.floor(hrs/24);
    return `Hace ${days} d`;
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));


  const formatBytes = bytes => {
    if (!bytes) return '0 KB';
    const units = ['B','KB','MB','GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
  };

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) return reject(new Error('Selecciona un archivo de imagen válido.'));
      if (file.size > 8 * 1024 * 1024) return reject(new Error('La imagen supera el límite de 8 MB.'));
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let q = 0.8, out = canvas.toDataURL('image/jpeg', q);
        while (out.length > 700000 && q > 0.3) { q -= 0.1; out = canvas.toDataURL('image/jpeg', q); }
        out.length > 700000 ? reject(new Error('La imagen es demasiado grande.')) : resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('La imagen no pudo procesarse.')); };
      img.src = url;
    });
  }

  function setImagePreview(dataUrl, fileName = '', fileSize = '') {
    state.seatImageData = dataUrl || null;
    state.seatImageName = fileName || '';
    const picker = $('#imagePicker');
    const preview = $('#imagePreview');
    const img = $('#imagePreviewImg');
    const name = $('#imagePreviewName');
    const size = $('#imagePreviewSize');
    if (!picker || !preview || !img || !name || !size) return;
    if (dataUrl) {
      img.src = dataUrl;
      name.textContent = fileName || 'Modelo seleccionado';
      size.textContent = fileSize || 'Imagen lista para guardar';
      preview.hidden = false;
      picker.classList.add('has-image');
    } else {
      img.removeAttribute('src');
      preview.hidden = true;
      picker.classList.remove('has-image');
    }
  }

  const seatSvg = (accent = '#d9a441') => `
    <svg class="seat-svg" viewBox="0 0 400 230" xmlns="http://www.w3.org/2000/svg" aria-label="Diseño de asiento">
      <defs>
        <linearGradient id="seatGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#323232"/><stop offset=".55" stop-color="#161616"/><stop offset="1" stop-color="#090909"/></linearGradient>
      </defs>
      <rect x="1" y="1" width="398" height="228" rx="22" fill="#060606" stroke="rgba(255,255,255,.04)"/>
      <path d="M88 202c-21-21-31-63-18-101l10-29c8-25 34-42 61-40h24c21 2 35 13 39 29l13 51 15-38c5-14 18-24 33-24h21c16 0 29 13 29 29v74c0 22-17 42-39 46l-91 16c-26 4-50-1-57-13z" fill="url(#seatGrad)" stroke="${accent}" stroke-opacity=".44" stroke-width="2"/>
      <path d="M105 184c-11-17-17-44-11-68l8-28c4-14 18-25 33-25h16c12 0 22 8 25 20l19 79c3 13-5 25-18 27l-49 7c-10 2-19-3-23-12z" fill="#1c1c1c"/>
      <path d="M117 134h64M114 151h72M116 168h74" stroke="${accent}" stroke-opacity=".55" stroke-width="4" stroke-linecap="round"/>
      <path d="M105 78l13 8M101 91l16 8M98 105l17 8M97 119l18 8" stroke="#efefef" stroke-opacity=".14" stroke-width="2"/>
      <circle cx="316" cy="174" r="27" fill="${accent}" fill-opacity=".08" stroke="${accent}" stroke-opacity=".3"/>
      <path d="M308 174l6 6 13-16" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  let orders = [];
  let unsub = null, current = null, isAdmin = false, myStage = null;

  const isoDate = v => v && v.toDate ? v.toDate().toISOString() : (typeof v === 'string' ? v : new Date().toISOString());

  function toOrder(doc) {
    const d = doc.data(), fecha = isoDate(d.fecha);
    return {
      id: doc.id, cliente: d.nombre || '', telefono: d.telefono || '', correo: d.correo || '',
      vehiculo: d.carro || '', anio: d.anio || '', placa: d.placa || '',
      departamento: stages.includes(d.etapa) ? d.etapa : 'Administración',
      prioridad: d.prioridad || 'Normal', fecha, descripcion: d.descripcion || '',
      detalles: d.detalles || '', image: d.imagen || '', precio: Number(d.precio) || 0,
      historial: Array.isArray(d.historial) && d.historial.length ? d.historial : [{ d: 'Administración', fecha, estado: 'Recibido' }]
    };
  }

  function refreshAll() {
    updateCounts();
    if (isAdmin) renderDashboard();
    if (!isAdmin || state.section === 'department') renderDepartment(state.department);
    if (state.drawerId) { orders.some(o => o.id === state.drawerId) ? openDrawer(state.drawerId) : closeDrawer(); }
  }

  function configureUI(info, email) {
    const name = isAdmin ? 'Administración' : info.label;
    ['#profAvatar', '#chipAvatar'].forEach(q => { $(q).textContent = name[0]; });
    $('#profName').textContent = name; $('#profSub').textContent = email;
    $('#chipName').textContent = name; $('#chipSub').textContent = isAdmin ? 'Administrador' : 'Operador';
    $('#crumb').innerHTML = isAdmin ? 'ADMINISTRACIÓN <span>/</span> PEDIDOS' : `${escapeHtml(name.toUpperCase())} <span>/</span> COLA DE TRABAJO`;
    $$('.nav-item[data-section="dashboard"], .nav-item[data-section="new-order"], .nav-item[data-section="analytics"]').forEach(b => { b.hidden = !isAdmin; });
    $$('.nav-item[data-department]').forEach(b => { b.hidden = !isAdmin && b.dataset.department !== myStage; });
    const labels = $$('.main-nav .nav-label');
    [0, 2].forEach(i => { if (labels[i]) labels[i].hidden = !isAdmin; });
    $('#mobileSummary').hidden = !isAdmin;
    $('.department-actions').hidden = !isAdmin;
  }

  function leave() {
    if (unsub) { unsub(); unsub = null; }
    current = null; orders = [];
    closeDrawer();
  }

  function enter(user) {
    const email = (user.email || '').toLowerCase();
    const info = ROLES[email];
    if (!info || current === user.uid) return;
    leave();
    current = user.uid; isAdmin = info.role === 'admin'; myStage = info.stage || null;
    configureUI(info, email);
    state.department = isAdmin ? 'Corte' : myStage;
    showSection(isAdmin ? 'dashboard' : 'department', { department: state.department });
    const col = db.collection('pedidos');
    const q = isAdmin ? col.orderBy('fecha', 'desc').limit(100) : col.where('etapa', '==', myStage).limit(100);
    unsub = q.onSnapshot(
      snap => { orders = snap.docs.map(toOrder); refreshAll(); },
      () => showToast('No se pudieron cargar los pedidos. Revisa las reglas de Firestore.'));
  }

  const byRecent = (a,b) => new Date(b.fecha) - new Date(a.fecha);

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const state = {
    section:'dashboard', showAll:false, status:'all', search:'', department:'Corte', drawerId:null, pendingMove:null, pendingDelete:null, deptSearch:'', seatImageData:null, seatImageName:''
  };

  function statusFor(order) {
    return order.departamento === 'Administración' ? 'Nuevo' : order.departamento === 'Terminado' ? 'Terminado' : 'En proceso';
  }
  function deptClass(dept){ return ({Administración:'dept-adm',Corte:'dept-corte',Costura:'dept-costura',Instalación:'dept-inst',Terminado:'dept-term'})[dept] || 'dept-adm'; }
  function statusClass(status){ return orderStatus[status] || 'status-process'; }
  function deptIcon(dept){ return ({Administración:'●',Corte:'✂',Costura:'✦',Instalación:'⌁',Terminado:'✓'})[dept] || '•'; }

  function updateCounts(){
    const fresh = orders.filter(o=>statusFor(o)==='Nuevo').length;
    const process = orders.filter(o=>statusFor(o)==='En proceso').length;
    const done = orders.filter(o=>statusFor(o)==='Terminado').length;
    $('#metricNew').textContent = fresh;
    $('#metricProcess').textContent = process;
    $('#metricDone').textContent = done;
    $('#navCount').textContent = fresh;
    const times = orders.filter(o => o.departamento === 'Terminado').map(o => {
      const last = (o.historial || []).filter(h => h.d === 'Terminado').pop();
      return last ? new Date(last.fecha) - new Date(o.fecha) : 0;
    }).filter(t => t > 0);
    $('#metricTime').innerHTML = times.length ? `${(times.reduce((a, b) => a + b, 0) / times.length / 86400000).toFixed(1)}<span>d</span>` : '—';
    const navMap = {Administración:fresh,Corte:orders.filter(o=>o.departamento==='Corte').length,Costura:orders.filter(o=>o.departamento==='Costura').length,Instalación:orders.filter(o=>o.departamento==='Instalación').length};
    $$('.nav-item[data-department]').forEach(btn => { const em=btn.querySelector('.nav-count'); if(em) em.textContent = navMap[btn.dataset.department] || 0; });
  }

  function renderDashboard(){
    updateCounts();
    const q=state.search.trim().toLowerCase();
    let list=[...orders].sort(byRecent);
    if(state.status!=='all') list=list.filter(o=>statusFor(o)===state.status);
    if(q) list=list.filter(o=>[o.id,o.cliente,o.vehiculo,o.placa,o.telefono,o.departamento].some(v=>String(v).toLowerCase().includes(q)));
    const body=$('#ordersTableBody');
    body.innerHTML = list.slice(0,state.showAll?500:10).map(order => `
      <tr class="order-row">
        <td class="order-code">#${escapeHtml(order.id)}</td>
        <td><span class="client-name">${escapeHtml(order.cliente)}</span></td>
        <td><span class="vehicle-main">${escapeHtml(order.vehiculo)}</span><span class="vehicle-sub">${escapeHtml(order.placa || 'Sin cédula')}</span></td>
        <td><span class="dept-pill ${deptClass(order.departamento)}">${deptIcon(order.departamento)} ${escapeHtml(order.departamento)}</span></td>
        <td><span class="status-pill ${statusClass(statusFor(order))}">${escapeHtml(statusFor(order))}</span></td>
        <td class="date-cell">${dateText(order.fecha)}</td>
        <td><div class="row-actions"><button class="row-view" type="button" data-invoice="${escapeHtml(order.id)}" title="Descargar factura PDF">Factura</button><button class="row-view" type="button" data-open-order="${escapeHtml(order.id)}">Ver</button><button class="row-delete" type="button" data-delete-order="${escapeHtml(order.id)}" title="Eliminar pedido" aria-label="Eliminar pedido #${escapeHtml(order.id)}">×</button></div></td>
      </tr>`).join('') || `<tr><td colspan="7"><div class="empty-state"><strong>No encontramos pedidos.</strong>Ajusta la búsqueda o los filtros.</div></td></tr>`;
    $('#resultsCount').textContent = `Mostrando ${Math.min(list.length,state.showAll?500:10)} de ${list.length} pedidos`;
    renderFlow(); renderActivity(); renderAnalytics();
  }

  function renderFlow(){
    const wrap=$('#flowBars');
    wrap.innerHTML=stages.map((stage,i)=>{
      const count=orders.filter(o=>o.departamento===stage).length;
      const max=Math.max(1,orders.filter(o=>o.departamento!=='Terminado').length);
      const pct=stage==='Terminado' ? Math.round((count/Math.max(1,orders.length))*100) : Math.round((count/max)*100);
      return `<div class="flow-row"><div class="flow-meta"><strong>${stage}</strong><span>${count}</span></div><div class="flow-track"><i style="width:${Math.min(100,pct)}%;color:${colors[stage]};background:${colors[stage]}"></i></div></div>`;
    }).join('');
  }

  function renderActivity(){
    const activity=[];
    orders.forEach(o=>{(o.historial||[]).forEach(h=>activity.push({order:o,h}))});
    activity.sort((a,b)=>new Date(b.h.fecha)-new Date(a.h.fecha));
    $('#activityList').innerHTML=activity.slice(0,6).map(({order,h})=>`
      <button class="activity-item" type="button" data-open-order="${escapeHtml(order.id)}" style="width:100%;background:transparent;border:0;text-align:left;color:inherit">
        <span class="activity-dot" style="color:${colors[h.d] || '#d9a441'}">${deptIcon(h.d)}</span>
        <span class="activity-copy"><strong>Pedido #${escapeHtml(order.id)} · ${escapeHtml(h.d)}</strong><small>${escapeHtml(h.estado)} · ${relative(h.fecha)}</small></span>
      </button>`).join('');
  }

  function renderDepartment(dept=state.department){
    state.department=dept;
    const idx=stages.indexOf(dept);
    const active = orders.filter(o=>o.departamento===dept);
    const done = orders.filter(o=>stages.indexOf(o.departamento)>idx).length;
    const total=active.length;
    $('#deptEyebrow').textContent = dept.toUpperCase();
    $('#deptTitle').innerHTML = dept==='Administración' ? 'Pedidos de <span>Administración.</span>' : `Pedidos de <span>${escapeHtml(dept)}.</span>`;
    $('#deptSubtitle').textContent = dept==='Terminado' ? 'Historial de trabajos completados y listos para entrega.' : `Pedidos que actualmente se encuentran en ${dept}.`;
    $('#deptPrev').disabled=idx<=0; $('#deptPrev').style.opacity=idx<=0?.45:1;
    $('#deptNext').disabled=idx>=stages.length-1; $('#deptNext').style.opacity=idx>=stages.length-1?.45:1;
    const q=state.deptSearch.trim().toLowerCase();
    const list=(q?active.filter(o=>[o.id,o.cliente,o.vehiculo,o.placa].some(v=>String(v).toLowerCase().includes(q))):active).sort(byRecent);
    $('#departmentSummary').innerHTML = `
      <div class="summary-chip"><span>En cola</span><strong>${total}</strong></div>
      <div class="summary-chip"><span>Prioridad alta</span><strong>${active.filter(o=>o.prioridad!=='Normal').length}</strong></div>
      <div class="summary-chip"><span>Actualización</span><strong>${total ? relative(active.sort(byRecent)[0].fecha) : '—'}</strong></div>`;
    $('#departmentGrid').innerHTML = list.map(o=>`
      <article class="dept-card">
        <div class="dept-top"><div><span class="panel-kicker">PEDIDO</span><strong>#${escapeHtml(o.id)}</strong></div><span class="priority ${o.prioridad==='Urgente'?'urgent':o.prioridad==='Alta'?'high':''}">${escapeHtml(o.prioridad)}</span></div>
        <div class="dept-client"><span class="client-avatar">${escapeHtml(initials(o.cliente))}</span><div><strong>${escapeHtml(o.cliente)}</strong><small>${escapeHtml(o.vehiculo)} · ${escapeHtml(o.placa || 'Sin cédula')}</small></div></div>
        <p class="dept-desc">${escapeHtml(o.descripcion)}</p>
        <div class="dept-footer"><small>${dateText(o.fecha)} · ${escapeHtml(statusFor(o))}</small><button type="button" class="mini-action" data-open-order="${escapeHtml(o.id)}">Abrir pedido →</button></div>
      </article>`).join('') || `<div style="grid-column:1/-1"><div class="empty-state"><strong>No hay pedidos aquí.</strong>Este departamento está sin pedidos activos.</div></div>`;
  }

  function renderAnalytics(){
    const total=orders.length;
    const dist=stages.map(stage=>({stage,count:orders.filter(o=>o.departamento===stage).length}));
    $('#donutTotal').textContent=total;
    $('#legendList').innerHTML=dist.map(x=>`<div class="legend-row"><div><i class="legend-dot" style="background:${colors[x.stage]}"></i>${x.stage}</div><strong>${x.count}</strong></div>`).join('');
    const activeTotal=Math.max(1,total-orders.filter(o=>o.departamento==='Terminado').length);
    const max=Math.max(1,...dist.map(x=>x.count));
    $('#loadList').innerHTML=dist.filter(x=>x.stage!=='Terminado').map(x=>`<div class="load-row"><div class="load-label">${x.stage}</div><div class="load-track"><i style="width:${Math.round((x.count/max)*100)}%;background:${colors[x.stage]}"></i></div><div class="load-value">${x.count}</div></div>`).join('');
    let acc = 0;
    const parts = dist.map(x => { const p = total ? x.count / total * 100 : 0; const seg = `${colors[x.stage]} ${acc}% ${acc + p}%`; acc += p; return seg; });
    $('#donut').style.background = total ? `conic-gradient(${parts.join(',')})` : 'rgba(255,255,255,.06)';
    const dayNames = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
    const today = new Date(); today.setHours(0,0,0,0);
    const week = [...Array(7)].map((_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (6 - i));
      const nx = new Date(d); nx.setDate(d.getDate() + 1);
      return { label: dayNames[d.getDay()], n: orders.filter(o => { const t = new Date(o.fecha); return t >= d && t < nx; }).length };
    });
    const wmax = Math.max(1, ...week.map(w => w.n));
    $('#weekBars').innerHTML = week.map(w => `<div><b>${w.n}</b><i style="height:${Math.round(w.n / wmax * 78) + 4}%"></i><small>${w.label}</small></div>`).join('');
  }

  function openDrawer(id){
    const order=orders.find(o=>o.id===id); if(!order) return;
    state.drawerId=id;
    $('#drawerCode').textContent=`#${order.id}`;
    $('#orderDrawer').classList.add('open'); $('#drawerBackdrop').classList.add('open'); $('#orderDrawer').setAttribute('aria-hidden','false');
    const idx=stages.indexOf(order.departamento);
    $('#drawerBody').innerHTML = `
      <section class="drawer-section">
        <div class="section-title">ESTADO ACTUAL</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:10px"><span class="dept-pill ${deptClass(order.departamento)}">${deptIcon(order.departamento)} ${escapeHtml(order.departamento)}</span><span class="status-pill ${statusClass(statusFor(order))}">${escapeHtml(statusFor(order))}</span></div>
        <div class="order-image ${order.image ? 'has-real-image' : ''}">${order.image ? `<img class="seat-photo" src="${escapeHtml(order.image)}" alt="Foto del modelo del asiento del pedido #${escapeHtml(order.id)}">` : `<div class="seat-illustration">${seatSvg(colors[order.departamento] || '#d9a441')}</div>`}<div class="image-badge">${order.image ? 'MODELO SELECCIONADO' : 'VISTA DE REFERENCIA'}</div></div>
      </section>
      <section class="drawer-section">
        <div class="section-title">DATOS DEL CLIENTE</div>
        <div class="customer-line"><span class="big-avatar">${escapeHtml(initials(order.cliente))}</span><div><strong>${escapeHtml(order.cliente)}</strong><small>${isAdmin ? [order.telefono, order.correo].filter(Boolean).map(escapeHtml).join(' · ') : ''}</small></div></div>
      </section>
      ${isAdmin ? `<section class="drawer-section">
        <div class="section-title">PRECIO Y FACTURA</div>
        <div class="price-box">
          <label class="price-field"><span>Precio (COP)</span><input id="priceInput" type="text" inputmode="numeric" autocomplete="off" placeholder="Ej. 850000" value="${order.precio ? order.precio : ''}"></label>
          <button class="gold-btn" type="button" id="savePrice">Guardar precio</button>
        </div>
        <small class="price-hint" id="priceHint">${order.precio ? formatCOP(order.precio) : 'Aún sin precio'}</small>
        <button class="p-ghost-btn invoice-btn" type="button" data-invoice="${escapeHtml(order.id)}">⬇ Descargar factura PDF</button>
      </section>` : ''}
      <section class="drawer-section">
        <div class="section-title">DATOS DEL VEHÍCULO</div>
        <div class="detail-grid"><div class="detail-box"><span>Vehículo</span><strong>${escapeHtml(order.vehiculo)}</strong></div><div class="detail-box"><span>Año</span><strong>${escapeHtml(order.anio || '—')}</strong></div><div class="detail-box"><span>Cédula</span><strong>${escapeHtml(order.placa || '—')}</strong></div><div class="detail-box"><span>Prioridad</span><strong>${escapeHtml(order.prioridad)}</strong></div></div>
      </section>
      <section class="drawer-section">
        <div class="section-title">DESCRIPCIÓN DEL PEDIDO</div>
        <div class="description-box"><p>${escapeHtml(order.descripcion)}</p></div>
        <div class="description-box"><span class="section-title">DETALLES ADICIONALES</span><p>${escapeHtml(order.detalles || 'Sin detalles adicionales.')}</p></div>
      </section>
      <section class="drawer-section">
        <div class="section-title">PROCESO DEL PEDIDO</div>
        <div class="timeline">${stages.map((stage,i)=>{
          const cls=i<idx?'completed':i===idx?'current':'';
          const hist=(order.historial||[]).filter(h=>h.d===stage).pop();
          const text=i<idx?'Completado':i===idx?(stage==='Terminado'?'Finalizado':'En proceso'):'Pendiente';
          return `<div class="timeline-step ${cls}"><div class="timeline-marker"><div class="timeline-dot">${i<idx?'✓':i===idx?'•':'·'}</div></div><div class="timeline-copy"><strong>${stage}</strong><small>${text}${hist?` · ${relative(hist.fecha)}`:''}</small></div></div>`
        }).join('')}</div>
      </section>`;
    $('#drawerFooter').innerHTML = order.departamento==='Terminado'
      ? `<p class="footer-note">Este pedido completó el flujo <strong>Administración → Corte → Costura → Instalación → Terminado</strong>.</p><div class="drawer-footer-actions"><button class="p-ghost-btn" type="button" data-close-drawer>Cerrar detalle</button><button class="danger-btn compact-danger" type="button" id="drawerDelete">Eliminar pedido</button></div>`
      : `<p class="footer-note">Pedido actualmente en <strong>${escapeHtml(order.departamento)}</strong>. Desde aquí puedes enviarlo al siguiente departamento.</p><div class="drawer-footer-actions"><button class="danger-btn compact-danger" type="button" id="drawerDelete">Eliminar</button><button class="gold-btn" type="button" id="drawerAdvance">Pasar a ${escapeHtml(stages[idx+1])} <span>→</span></button></div>`;
    if(!isAdmin) $('#drawerDelete')?.remove();
    const pIn=$('#priceInput');
    if(pIn){
      pIn.addEventListener('input',()=>{ pIn.value=pIn.value.replace(/\D/g,''); $('#priceHint').textContent=pIn.value?formatCOP(Number(pIn.value)):'Aún sin precio'; });
      $('#savePrice').addEventListener('click',()=>savePrice(order.id));
    }
    const adv=$('#drawerAdvance'); if(adv) adv.addEventListener('click',()=>requestMove(order.id));
    const del=$('#drawerDelete'); if(del) del.addEventListener('click',()=>requestDelete(order.id));
    $$('[data-close-drawer]').forEach(b=>b.addEventListener('click',closeDrawer));
  }


  const formatCOP = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n).replace(/\u00a0/g,' ');

  async function savePrice(id){
    if(!isAdmin) return;
    const raw=($('#priceInput').value||'').replace(/\D/g,'');
    if(!raw || Number(raw)<=0){ showToast('Escribe un precio válido.'); return; }
    try{
      await db.collection('pedidos').doc(id).update({precio:Number(raw)});
      showToast(`Precio guardado: ${formatCOP(Number(raw))}`);
    }catch(err){ showToast('No se pudo guardar el precio. Revisa las reglas de Firestore.'); }
  }

  function loadImg(src){
    return new Promise((resolve,reject)=>{ const i=new Image(); i.onload=()=>resolve(i); i.onerror=()=>reject(new Error('img')); i.src=src; });
  }
  async function imgToJpeg(src){
    const i=await loadImg(src);
    const c=document.createElement('canvas'); c.width=i.naturalWidth; c.height=i.naturalHeight;
    c.getContext('2d').drawImage(i,0,0);
    return { data:c.toDataURL('image/jpeg',0.92), w:c.width, h:c.height };
  }

  async function downloadInvoice(id){
    if(!isAdmin) return;
    const order=orders.find(o=>o.id===id); if(!order) return;
    if(!order.precio){ showToast('Primero guarda el precio del pedido.'); return; }
    if(!window.jspdf){ showToast('No se pudo cargar el generador de PDF. Revisa tu conexión.'); return; }
    try{
      const { jsPDF } = window.jspdf;
      let logo=null, design=null;
      try{ logo=await imgToJpeg('phoenix-logo.jpeg'); }catch(e){}
      if(order.image){ try{ design=await imgToJpeg(order.image); }catch(e){} }

      // PDF protegido: se puede ver e imprimir, pero no editar ni copiar
      const owner=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
      const doc=new jsPDF({ unit:'mm', format:'a4', encryption:{ ownerPassword:owner, userPermissions:['print'] } });
      const W=210, M=14, GOLD=[217,164,65], DARK=[30,30,30], GRAY=[120,120,120];

      // Encabezado negro con logo
      doc.setFillColor(3,3,1); doc.rect(0,0,W,42,'F');
      doc.setFillColor(...GOLD); doc.rect(0,42,W,1.2,'F');
      if(logo){ const lh=30, lw=lh*logo.w/logo.h; doc.addImage(logo.data,'JPEG',M,6,lw,lh); }
      else { doc.setTextColor(...GOLD); doc.setFont('helvetica','bold'); doc.setFontSize(26); doc.text('PHOENIX',M,26); }
      doc.setTextColor(...GOLD); doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.text('FACTURA',W-M,18,{align:'right'});
      doc.setTextColor(235,235,235); doc.setFont('helvetica','normal'); doc.setFontSize(9);
      doc.text(`Pedido: ${order.id}`,W-M,26,{align:'right'});
      doc.text(`Fecha: ${new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date())}`,W-M,32,{align:'right'});

      // Datos del cliente
      const sectionTitle=(t,y)=>{ doc.setTextColor(...GOLD); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text(t,M,y); doc.setDrawColor(...GOLD); doc.setLineWidth(.3); doc.line(M,y+2,W-M,y+2); };
      sectionTitle('DATOS DEL CLIENTE',56);
      const rows=[
        ['Nombre',order.cliente||'—'],['Teléfono',order.telefono||'—'],
        ['Correo',order.correo||'—'],['Cédula',order.placa||'—'],
        ['Vehículo',order.vehiculo||'—'],['Año',order.anio||'—']
      ];
      rows.forEach((r,i)=>{
        const col=i%2, row=Math.floor(i/2), x=M+col*92, y=66+row*13;
        doc.setTextColor(...GRAY); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text(r[0].toUpperCase(),x,y);
        doc.setTextColor(...DARK); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text(String(r[1]),x,y+5.5,{maxWidth:86});
      });

      // Imagen del diseño
      sectionTitle('DISEÑO DEL CLIENTE',110);
      const boxX=M, boxY=116, boxW=W-2*M, boxH=100;
      doc.setDrawColor(220,220,220); doc.setLineWidth(.3); doc.rect(boxX,boxY,boxW,boxH);
      if(design){
        const r=Math.min((boxW-6)/design.w,(boxH-6)/design.h), iw=design.w*r, ih=design.h*r;
        doc.addImage(design.data,'JPEG',boxX+(boxW-iw)/2,boxY+(boxH-ih)/2,iw,ih);
      } else {
        doc.setTextColor(...GRAY); doc.setFont('helvetica','italic'); doc.setFontSize(10); doc.text('Sin imagen de diseño',W/2,boxY+boxH/2,{align:'center'});
      }

      // Precio
      const py=boxY+boxH+10;
      doc.setFillColor(3,3,1); doc.roundedRect(M,py,W-2*M,24,3,3,'F');
      doc.setTextColor(...GOLD); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('TOTAL A PAGAR',M+8,py+14.5);
      doc.setFontSize(20); doc.text(`${formatCOP(order.precio)} COP`,W-M-8,py+15.5,{align:'right'});

      // Pie
      doc.setTextColor(...GRAY); doc.setFont('helvetica','normal'); doc.setFontSize(8);
      doc.text('PHOENIX  •  THE NEW CONCEPT IN COVERS',W/2,287,{align:'center'});

      doc.save(`Factura-${order.id}.pdf`);
      showToast(`Factura del pedido #${order.id} descargada.`);
    }catch(err){ console.error(err); showToast('No se pudo generar la factura.'); }
  }

  function closeDrawer(){
    $('#orderDrawer').classList.remove('open'); $('#drawerBackdrop').classList.remove('open'); $('#orderDrawer').setAttribute('aria-hidden','true'); state.drawerId=null;
  }

  function requestMove(id){
    const order=orders.find(o=>o.id===id); if(!order) return;
    const idx=stages.indexOf(order.departamento); if(idx<0 || idx>=stages.length-1) return;
    const next=stages[idx+1]; state.pendingMove={id,next};
    $('#confirmTitle').textContent=`Pasar pedido #${id}`;
    $('#confirmText').textContent=`El pedido cambiará de ${order.departamento} a ${next}. Esta acción también actualizará el estado de seguimiento.`;
    $('#confirmBackdrop').classList.add('open');
  }

  async function confirmMove(){
    if(!state.pendingMove) return;
    const {id,next}=state.pendingMove; const order=orders.find(o=>o.id===id); if(!order) return;
    const previous=order.departamento;
    const entry={d:next,fecha:new Date().toISOString(),estado:next==='Terminado'?'Finalizado':'En proceso'};
    $('#confirmBackdrop').classList.remove('open'); state.pendingMove=null;
    try{
      await db.collection('pedidos').doc(id).update({etapa:next,historial:[...order.historial,entry]});
      showToast(`Pedido #${id} pasó de ${previous} a ${next}.`);
    }catch(err){ showToast('No se pudo mover el pedido. Inténtalo de nuevo.'); }
  }

  function requestDelete(id){
    if(!isAdmin) return;
    const order=orders.find(o=>o.id===id); if(!order) return;
    state.pendingDelete=id;
    $('#deleteTitle').textContent=`Eliminar pedido #${id}`;
    $('#deleteText').textContent=`Se eliminará el pedido de ${order.cliente} · ${order.vehiculo}. También se borrará su historial y no podrá recuperarse.`;
    $('#deleteBackdrop').classList.add('open');
  }

  async function confirmDelete(){
    const id=state.pendingDelete; if(!id||!isAdmin) return;
    state.pendingDelete=null; $('#deleteBackdrop').classList.remove('open');
    try{
      await db.collection('pedidos').doc(id).delete();
      if(state.drawerId===id) closeDrawer();
      showToast(`Pedido #${id} eliminado correctamente.`);
    }catch(err){ showToast('No se pudo eliminar el pedido.'); }
  }

  function showToast(message){ const t=$('#pToast'); t.textContent=message; t.classList.add('show'); clearTimeout(window.__phoenixToast); window.__phoenixToast=setTimeout(()=>t.classList.remove('show'),3000); }

  function showSection(section, meta={}){
    if(!isAdmin){ section='department'; meta={department:myStage}; }
    state.section=section;
    $$('.section-view').forEach(v=>v.classList.toggle('active-view',v.dataset.view===section));
    $$('.nav-item[data-section]').forEach(b=>b.classList.remove('active'));
    if(section==='dashboard') $('.nav-item[data-section="dashboard"]').classList.add('active');
    else if(section==='new-order') $('.nav-item[data-section="new-order"]').classList.add('active');
    else if(section==='department') $(`.nav-item[data-section="department"][data-department="${CSS.escape(meta.department||state.department)}"]`)?.classList.add('active');
    else if(section==='analytics') $('.nav-item[data-section="analytics"]').classList.add('active');
    $('#pageTitle').textContent = section==='dashboard'?'Pedidos':section==='new-order'?'Nuevo pedido':section==='department'?meta.department||state.department:'Resumen';
    if(section==='department') renderDepartment(meta.department||state.department);
    if(section==='analytics') renderAnalytics();
    closeSidebarMobile();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function openSidebarMobile(){ if(window.innerWidth<=760){ $('#sidebar').classList.add('open'); $('#sidebarBackdrop')?.classList.add('open'); $('#mobileMenu')?.setAttribute('aria-expanded','true'); document.body.classList.add('menu-open'); } }
  function closeSidebarMobile(){ if(window.innerWidth<=760){ $('#sidebar').classList.remove('open'); $('#sidebarBackdrop')?.classList.remove('open'); $('#mobileMenu')?.setAttribute('aria-expanded','false'); document.body.classList.remove('menu-open'); } }

  // Eventos globales
  document.addEventListener('click', e=>{
    const nav=e.target.closest('[data-section]');
    if(nav){ showSection(nav.dataset.section,{department:nav.dataset.department}); return; }
    const inv=e.target.closest('[data-invoice]'); if(inv){downloadInvoice(inv.dataset.invoice); return;}
    const open=e.target.closest('[data-open-order]'); if(open){openDrawer(open.dataset.openOrder); return;}
    const del=e.target.closest('[data-delete-order]'); if(del){requestDelete(del.dataset.deleteOrder); return;}
  });

  $$('.seg').forEach(btn=>btn.addEventListener('click',()=>{ $$('.seg').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); state.status=btn.dataset.status; renderDashboard(); }));
  $('#searchInput').addEventListener('input',e=>{state.search=e.target.value;renderDashboard()});
  $('#deptSearch').addEventListener('input',e=>{state.deptSearch=e.target.value;renderDepartment(state.department)});
  $('#clearFilters').addEventListener('click',()=>{state.search='';state.status='all';$('#searchInput').value='';$$('.seg').forEach(b=>b.classList.toggle('active',b.dataset.status==='all'));renderDashboard();showToast('Filtros limpiados.')});
  $('#showAllBtn').addEventListener('click',()=>{state.showAll=!state.showAll;$('#showAllBtn').textContent=state.showAll?'Mostrar menos ↑':'Ver todos los pedidos →';renderDashboard();});
  $('#refreshBtn').addEventListener('click',()=>{renderDashboard(); if(state.section==='department') renderDepartment(state.department); showToast('Pedidos actualizados.')});
  $('#openNewOrder').addEventListener('click',()=>showSection('new-order'));
  $('#closeDrawer').addEventListener('click',closeDrawer); $('#drawerBackdrop').addEventListener('click',closeDrawer);
  $('#closeConfirm').addEventListener('click',()=>$('#confirmBackdrop').classList.remove('open')); $('#cancelMove').addEventListener('click',()=>$('#confirmBackdrop').classList.remove('open')); $('#confirmMove').addEventListener('click',confirmMove);
  $('#mobileMenu').addEventListener('click',openSidebarMobile); $('#mobileClose').addEventListener('click',closeSidebarMobile); $('#sidebarBackdrop')?.addEventListener('click',closeSidebarMobile); $('#mobileSummary')?.addEventListener('click',()=>showSection('analytics'));

  $('#chooseSeatImage').addEventListener('click',()=>$('#seatImageInput').click());
  $('#seatImageInput').addEventListener('change',async e=>{
    const file=e.target.files?.[0];
    if(!file) return;
    try{
      const dataUrl=await compressImage(file);
      setImagePreview(dataUrl,file.name,formatBytes(file.size));
      showToast('Foto del modelo cargada.');
    }catch(err){
      e.target.value='';
      setImagePreview(null);
      showToast(err.message || 'No fue posible cargar la imagen.');
    }
  });
  $('#clearSeatImage').addEventListener('click',()=>{
    $('#seatImageInput').value='';
    setImagePreview(null);
    showToast('Foto retirada del nuevo pedido.');
  });

  $('#closeDelete').addEventListener('click',()=>{state.pendingDelete=null;$('#deleteBackdrop').classList.remove('open')});
  $('#cancelDelete').addEventListener('click',()=>{state.pendingDelete=null;$('#deleteBackdrop').classList.remove('open')});
  $('#confirmDelete').addEventListener('click',confirmDelete);
  $('#deleteBackdrop').addEventListener('click',e=>{if(e.target.id==='deleteBackdrop'){state.pendingDelete=null;$('#deleteBackdrop').classList.remove('open')}});

  $('#deptPrev').addEventListener('click',()=>{const i=stages.indexOf(state.department);if(i>0) showSection('department',{department:stages[i-1]})});
  $('#deptNext').addEventListener('click',()=>{const i=stages.indexOf(state.department);if(i<stages.length-1) showSection('department',{department:stages[i+1]})});

  $('#newOrderForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!isAdmin) return;
    const form=e.currentTarget; const fd=new FormData(form); const btn=form.querySelector('[type="submit"]');
    const cliente=String(fd.get('cliente')||'').trim(); const vehiculo=String(fd.get('vehiculo')||'').trim(); const descripcion=String(fd.get('descripcion')||'').trim();
    if(!cliente||!vehiculo||!descripcion){showToast('Completa los campos obligatorios.');return;}
    const abc='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const rnd=crypto.getRandomValues(new Uint8Array(8));
    const code='PHX-'+Array.from(rnd,n=>abc[n%abc.length]).join(''); const now=new Date().toISOString();
    btn.disabled=true;
    try{
      await db.collection('pedidos').doc(code).set({
        codigo:code,nombre:cliente,telefono:String(fd.get('telefono')||'').trim(),correo:'',carro:vehiculo,
        anio:String(fd.get('anio')||''),placa:String(fd.get('placa')||'').trim(),prioridad:String(fd.get('prioridad')||'Normal'),
        descripcion,detalles:String(fd.get('detalles')||'').trim(),imagen:state.seatImageData||'',etapa:'Administración',
        historial:[{d:'Administración',fecha:now,estado:'Recibido'}],fecha:firebase.firestore.FieldValue.serverTimestamp()
      });
      form.reset(); setImagePreview(null);
      showToast(`Pedido #${code} creado y enviado a Administración.`); showSection('dashboard'); setTimeout(()=>openDrawer(code),500);
    }catch(err){ showToast('No se pudo crear el pedido. Revisa tu conexión.'); }
    btn.disabled=false;
  });

  // Tecla Escape cierra overlays.
  window.addEventListener('resize',()=>{ if(window.innerWidth>760) closeSidebarMobile(); });

  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){closeDrawer();$('#confirmBackdrop').classList.remove('open');state.pendingDelete=null;$('#deleteBackdrop').classList.remove('open')}});

  window.PhoenixPanel = { enter, leave };

})();

/* ===== Consultar pedido (público, con el número) ===== */
(function () {
  const form = document.getElementById("lookupForm");
  const err = document.getElementById("lookupError");
  const btn = document.getElementById("lookupBtn");
  const out = document.getElementById("lookupResult");
  let currentCode = "";

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeImg = u => (typeof u === "string" && u.startsWith("data:image/jpeg;base64,")) ? u : "";

  function show(o) {
    const img = safeImg(o.imagen);
    const fecha = o.fecha && o.fecha.toDate
      ? o.fecha.toDate().toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "";
    out.innerHTML = `
      <article class="order-card">
        ${img ? `<img src="${esc(img)}" alt="Tu diseño" data-zoom>` : `<div class="no-img">Sin imagen</div>`}
        <div class="order-body">
          <span class="code">${esc(o.codigo)} · ${esc(fecha)}</span>
          <h3>${esc(o.nombre)}</h3>
          <p class="meta"><b>Carro:</b> ${esc(o.carro)}</p>
          <p class="meta"><b>Etapa:</b> ${esc(o.etapa || "Administración")}</p>
          <p class="desc">${esc(o.descripcion)}</p>
          <button class="del-btn" type="button" data-del>Eliminar pedido</button>
        </div>
      </article>`;
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    out.innerHTML = "";
    err.textContent = "";
    const cfg = configError();
    if (cfg) { err.textContent = cfg; return; }

    const code = form.codigo.value.trim().toUpperCase();
    if (!/^PHX-[A-Z0-9]{4,12}$/.test(code)) {
      err.textContent = "Escribe el número completo, por ejemplo PHX-AB12CD34.";
      return;
    }

    btn.disabled = true;
    try {
      const snap = await db.collection("pedidos").doc(code).get();
      if (snap.exists) { currentCode = snap.id; show(snap.data()); }
      else err.textContent = "No encontramos un pedido con ese número.";
    } catch (ex) {
      err.textContent = "No se pudo consultar el pedido. Inténtalo de nuevo.";
    }
    btn.disabled = false;
  });

  out.addEventListener("click", async e => {
    const b = e.target.closest("[data-del]");
    if (b) {
      if (!confirm("¿Eliminar tu pedido? Esta acción no se puede deshacer.")) return;
      b.disabled = true;
      try {
        await db.collection("pedidos").doc(currentCode).delete();
        out.innerHTML = "";
        form.reset();
        notify("Tu pedido fue eliminado.");
      } catch (ex) {
        b.disabled = false;
        notify("No se pudo eliminar el pedido.");
      }
      return;
    }
    const im = e.target.closest("img[data-zoom]");
    if (!im) return;
    const box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML = '<img alt="Diseño ampliado">';
    box.firstChild.src = im.src;
    box.addEventListener("click", () => box.remove());
    document.body.appendChild(box);
  });
})();

/* ===== Navegación entre pantallas ===== */
(function () {
const names = ["home", "nuevo", "consultar", "login", "panel"];
const views = {};
names.forEach(n => { views[n] = document.getElementById("view-" + n); });
const bar = document.getElementById("topActions");
let user = null;
let ready = !auth;

const BACK = '<button class="login-btn" data-go="home" type="button">← Volver</button>';
const BAR = {
  home: '<button class="login-btn" data-go="login" type="button"><span class="login-icon">◉</span> Login</button>',
  nuevo: BACK, consultar: BACK, login: BACK, panel: ""
};
const allowed = u => !!(u && ROLES[(u.email || "").toLowerCase()]);

function route() {
  let name = location.hash.replace("#/", "");
  if (name === "pedidos") name = "panel";
  if (!views[name]) name = "home";
  if (name === "panel") {
    if (!auth) { location.replace("#/login"); return; }
    if (!ready) return;
    if (!user) { location.replace("#/login"); return; }
    if (!allowed(user)) { notify("Esta cuenta no tiene acceso al panel."); auth.signOut(); location.replace("#/login"); return; }
  }
  if (name === "login" && allowed(user)) { location.replace("#/panel"); return; }
  names.forEach(n => { views[n].hidden = n !== name; });
  document.body.classList.toggle("panel-mode", name === "panel");
  bar.innerHTML = BAR[name];
  if (name === "panel") window.PhoenixPanel.enter(user); else window.PhoenixPanel.leave();
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
