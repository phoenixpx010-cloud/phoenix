/* ============================================================
   PEGA AQUÍ TUS CLAVES (único archivo que debes editar)
   - Firebase: Consola > Configuración del proyecto > Tus apps > Web
   - Cloudinary: cloudName (Dashboard) y un Upload Preset "Unsigned"
   NUNCA pegues aquí el API Secret de Cloudinary.
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
