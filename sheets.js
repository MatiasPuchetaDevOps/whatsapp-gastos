// Cliente de Google Sheets + funciones para agregar filas a la hoja "Gastos".
//
// La planilla ya tiene una plantilla armada con hoja "Gastos" (headers en A-J,
// dropdowns de validación, formatos de fecha/moneda y ~500 filas pre-formateadas)
// y hoja "Resumen" (con fórmulas y gráficos). El bot solo escribe filas nuevas en
// "Gastos" y no toca "Resumen".

import { google } from "googleapis";
import fs from "fs";
import {
  SPREADSHEET_ID,
  GOOGLE_CREDENTIALS_PATH,
  HOJA_GASTOS,
} from "./config.js";

let sheetsCache = null;

export async function getSheetsClient() {
  if (sheetsCache) return sheetsCache;

  if (!fs.existsSync(GOOGLE_CREDENTIALS_PATH)) {
    throw new Error(
      `No se encontró ${GOOGLE_CREDENTIALS_PATH}. Descargá el JSON del service account desde Google Cloud y guardalo en la raíz del proyecto. Ver README.`
    );
  }
  if (!SPREADSHEET_ID) {
    throw new Error("SPREADSHEET_ID vacío en config.js. Copiá el ID de la URL de la planilla.");
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_CREDENTIALS_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const authClient = await auth.getClient();
  sheetsCache = google.sheets({ version: "v4", auth: authClient });
  return sheetsCache;
}

// Convierte un Date de JS al "serial number" que usa Google Sheets:
// días transcurridos desde el 30/12/1899 (con parte decimal para la hora).
// Trabajamos con componentes locales para que la celda muestre el mismo
// wall-clock time que tiene el reloj del bot.
function toSheetsSerial(date) {
  const local = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds()
  );
  const epoch = new Date(1899, 11, 30);
  return (local.getTime() - epoch.getTime()) / (24 * 60 * 60 * 1000);
}

// El "append" de la Sheets API detecta la última fila con datos en la tabla
// (empezando por range A:J) y escribe justo después. Con insertDataOption
// "OVERWRITE" ocupa la siguiente fila pre-formateada (sin insertar rows nuevos),
// preservando los bordes, colores, formatos de fecha/moneda y validaciones que
// vienen con la plantilla.
async function appendRow(row) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${HOJA_GASTOS}!A:J`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "OVERWRITE",
    requestBody: { values: [row] },
  });
}

/**
 * Agrega un gasto a la hoja "Gastos".
 * @param {object} gasto
 * @param {Date} gasto.fecha - marca de tiempo del mensaje
 * @param {string} gasto.escribio - nombre de quien escribió el mensaje
 * @param {string} gasto.pago - nombre de quien pagó (Matias o Pau)
 * @param {number} gasto.monto
 * @param {string} gasto.descripcion
 * @param {string} gasto.categoria - una de CATEGORIAS
 * @param {string} gasto.mensajeOriginal
 */
export async function agregarGasto(gasto) {
  const serial = toSheetsSerial(gasto.fecha);
  const soloHora = serial - Math.floor(serial); // fracción del día = hora

  const row = [
    serial,                 // A: Fecha (serial → la celda tiene formato DD/MM/YYYY)
    soloHora,               // B: Hora  (fracción → la celda tiene formato HH:MM)
    gasto.escribio,         // C: Escribió
    gasto.pago,             // D: Pagó / De
    gasto.monto,            // E: Monto (número)
    gasto.descripcion,      // F: Descripción
    gasto.categoria,        // G: Categoría
    gasto.mensajeOriginal,  // H: Mensaje original
    "Gasto",                // I: Tipo
    "",                     // J: Para (vacío para gastos)
  ];

  await appendRow(row);
}

/**
 * Agrega una transferencia a la hoja "Gastos".
 * @param {object} tr
 * @param {Date} tr.fecha
 * @param {string} tr.escribio
 * @param {string} tr.de - quien envía la plata
 * @param {string} tr.para - quien recibe la plata
 * @param {number} tr.monto
 * @param {string} tr.mensajeOriginal
 */
export async function agregarTransferencia(tr) {
  const serial = toSheetsSerial(tr.fecha);
  const soloHora = serial - Math.floor(serial);

  const row = [
    serial,
    soloHora,
    tr.escribio,
    tr.de,
    tr.monto,
    "Transferencia para saldar cuentas",
    "",                     // G: Categoría vacía para transferencias
    tr.mensajeOriginal,
    "Transferencia",
    tr.para,                // J: Para = quien recibe
  ];

  await appendRow(row);
}
