// Configuración centralizada del bot.
// Los valores sensibles se leen desde variables de entorno y desde un archivo .env.

import dotenv from "dotenv";

dotenv.config();

function leerEnv(nombre, defecto = "") {
  return process.env[nombre] ?? defecto;
}

export const OPENAI_API_KEY = leerEnv("OPENAI_API_KEY");
export const OPENAI_MODEL = leerEnv("OPENAI_MODEL", "gpt-4.1-mini");

// ID del grupo de WhatsApp donde se registran los gastos.
// Se obtiene corriendo `npm run buscar-grupos` una vez logueado.
// Formato: "xxxxxxxxxxxxxxxxxx@g.us"
export const GROUP_ID = leerEnv("GROUP_ID");

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
  "Salud",
  "Ropa",
  "Otros",
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
