const ordersEl = document.getElementById("orders");
const countEl = document.getElementById("count");
const searchEl = document.getElementById("search");
const logoutBtn = document.getElementById("logoutBtn");

let allOrders = [];

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
  logoutBtn.addEventListener("click", () =>
    auth.signOut().then(() => location.replace("index.html")));

  auth.onAuthStateChanged(user => {
    if (!user) return location.replace("login.html");

    db.collection("pedidos").orderBy("fecha", "desc").onSnapshot(
      snap => { allOrders = snap.docs.map(d => d.data()); render(); },
      () => {
        countEl.textContent = "";
        ordersEl.innerHTML = `<p class="empty">No se pudieron cargar los pedidos. Verifica que tu cuenta tenga permiso (reglas de Firestore).</p>`;
      });
  });
}
