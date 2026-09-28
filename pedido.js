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
