// Configuración centralizada del bot.
// Los valores sensibles se leen desde variables de entorno y desde un archivo .env.

import dotenv from "dotenv";

dotenv.config();

function leerEnv(nombre, defecto = "") {
  return process.env[nombre] ?? defecto;
}

function construirGroupDestinations() {
  const destinations = {};
  let i = 1;
  while (true) {
    const id = leerEnv(`GROUP_DESTINATIONS_ID_${i}`);
    const hoja = leerEnv(`GROUP_DESTINATIONS_HOJA_${i}`);
    if (!id || !hoja) break;
    destinations[id] = hoja;
    i++;
  }
  return destinations;
}

export const OPENAI_API_KEY = leerEnv("OPENAI_API_KEY");
export const OPENAI_MODEL = leerEnv("OPENAI_MODEL", "gpt-4.1-mini");

// Mapeo de IDs de grupos a hojas destino en la planilla.
// Se obtiene corriendo `npm run buscar-grupos` una vez logueado.
// Formato: { "xxxxxxxxxxxxxxxxxx@g.us": "Nombre de hoja", ... }
// Las variables de entorno son de la forma: GROUP_DESTINATIONS_ID_1, GROUP_DESTINATIONS_HOJA_1, etc.
export const GROUP_DESTINATIONS = construirGroupDestinations();

// Categorías válidas para clasificar los gastos.
// El dropdown de la columna G en la planilla usa exactamente estos valores.
export const CATEGORIAS = [
  "Super",
  "Compras Casa",
  "Servicios Casa",
  "Tarjeta",
  "Ocio",
  "Salidas",
  "Transporte",
  "Auto",
  "Salud",
  "Ropa",
  "Otros",
];

// Categorías válidas para ingresos (solo en grupos personales).
export const CATEGORIAS_INGRESOS = [
  "Sueldo",
  "Freelance",
  "Otros ingresos",
];

// Personas que pueden figurar como pagadoras / remitentes / receptoras.
// El dropdown de las columnas D y J en la planilla usa exactamente estos valores.
export const PERSONAS = ["Matias", "Pau"];

// --- Google Sheets ---

// ID de la planilla. Se saca de la URL entre "/d/" y "/edit":
//   https://docs.google.com/spreadsheets/d/AQUI_VA_EL_ID/edit
export const SPREADSHEET_ID = leerEnv("SPREADSHEET_ID");

// Ruta al JSON del service account de Google Cloud.
// Ver README para los pasos de creación.
export const GOOGLE_CREDENTIALS_PATH = leerEnv("GOOGLE_CREDENTIALS_PATH", "./google-credentials.json");

// Nombres de las hojas dentro de la planilla.
export const HOJA_GASTOS = "Gastos";
export const HOJA_RESUMEN = "Resumen";

// Celda en la hoja "Resumen" que contiene el mensaje de balance
// (ej: "Pau le debe a Matias $X" o "✅ Están a mano").
// Abrí la planilla y buscá esa celda para poner acá su referencia.
export const RESUMEN_BALANCE_CELL = leerEnv("RESUMEN_BALANCE_CELL", "B10");

// Celda en la hoja "Resumen" con el gasto del mes actual (opcional).
// Si en tu planilla está en otro lado, ajustala.
export const RESUMEN_GASTO_MES_CELL = leerEnv("RESUMEN_GASTO_MES_CELL", "B5");

// --- WhatsApp / Baileys ---

// Carpeta donde Baileys persiste las credenciales de la sesión de WhatsApp.
export const AUTH_FOLDER = leerEnv("AUTH_FOLDER", "./auth_info");

// Lista blanca de números que pueden hablarle al bot.
// Formato: números separados por coma (ej: "5493543606194,5491234567890")
// El bot verifica que el remitente esté en esta lista.
export const WHITELIST_NUMBERS = leerEnv("WHITELIST_NUMBERS", "")
  .split(",")
  .map((n) => n.trim())
  .filter((n) => n.length > 0);

// --- Límites de seguridad ---

// Monto máximo permitido para un gasto (en pesos).
// Evita registros accidentales de montos enormes.
export const MONTO_MAXIMO = Number(leerEnv("MONTO_MAXIMO", "500000"));

// Monto mínimo permitido para un gasto.
export const MONTO_MINIMO = Number(leerEnv("MONTO_MINIMO", "1"));

// Máximo de llamadas a OpenAI por usuario por minuto.
export const RATE_LIMIT_MENSAJES_POR_MINUTO = Number(leerEnv("RATE_LIMIT_MENSAJES_POR_MINUTO", "10"));

// Timeout en milisegundos para llamadas a OpenAI.
export const OPENAI_TIMEOUT_MS = Number(leerEnv("OPENAI_TIMEOUT_MS", "15000"));
