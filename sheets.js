// Cliente de Google Sheets + funciones para agregar filas a la hoja "Gastos".
//
// La planilla ya tiene una plantilla armada con hoja "Gastos" (headers en A-J,
// dropdowns de validación, formatos de fecha/moneda y ~500 filas pre-formateadas)
// y hoja "Resumen" (con fórmulas y gráficos). El bot solo escribe filas nuevas en
// "Gastos" y no toca "Resumen".

import { google } from "googleapis";
import fs from "fs";
import Fuse from "fuse.js";
import {
  SPREADSHEET_ID,
  GOOGLE_CREDENTIALS_PATH,
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
async function appendRow(row, hojaDestino) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${hojaDestino}!A:J`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "OVERWRITE",
    requestBody: { values: [row] },
  });
}

/**
 * Agrega un gasto a la hoja especificada.
 * @param {object} gasto
 * @param {Date} gasto.fecha - marca de tiempo del mensaje
 * @param {string} gasto.escribio - nombre de quien escribió el mensaje
 * @param {string} gasto.pago - nombre de quien pagó (Matias o Pau)
 * @param {number} gasto.monto
 * @param {string} gasto.descripcion
 * @param {string} gasto.categoria - una de CATEGORIAS
 * @param {string} gasto.mensajeOriginal
 * @param {string} gasto.hojaDestino - nombre de la hoja destino (ej: "Gastos", "Personal Matias")
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

  await appendRow(row, gasto.hojaDestino);
}

/**
 * Agrega una transferencia a la hoja especificada.
 * @param {object} tr
 * @param {Date} tr.fecha
 * @param {string} tr.escribio
 * @param {string} tr.de - quien envía la plata
 * @param {string} tr.para - quien recibe la plata
 * @param {number} tr.monto
 * @param {string} tr.mensajeOriginal
 * @param {string} tr.hojaDestino - nombre de la hoja destino
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

  await appendRow(row, tr.hojaDestino);
}

/**
 * Agrega un ingreso a la hoja especificada (solo en grupos personales).
 * @param {object} ingreso
 * @param {Date} ingreso.fecha
 * @param {string} ingreso.escribio
 * @param {string} ingreso.de - quien recibió el ingreso
 * @param {number} ingreso.monto
 * @param {string} ingreso.descripcion
 * @param {string} ingreso.categoria - una de CATEGORIAS_INGRESOS
 * @param {string} ingreso.mensajeOriginal
 * @param {string} ingreso.hojaDestino - nombre de la hoja destino
 */
export async function agregarIngreso(ingreso) {
  const serial = toSheetsSerial(ingreso.fecha);
  const soloHora = serial - Math.floor(serial);

  const row = [
    serial,                 // A: Fecha
    soloHora,               // B: Hora
    ingreso.escribio,       // C: Escribió
    ingreso.de,             // D: De (quien recibe el ingreso)
    ingreso.monto,          // E: Monto
    ingreso.descripcion,    // F: Descripción
    ingreso.categoria,      // G: Categoría
    ingreso.mensajeOriginal,// H: Mensaje original
    "Ingreso",              // I: Tipo
    "",                     // J: Para (vacío para ingresos)
  ];

  await appendRow(row, ingreso.hojaDestino);
}

// ========== FUNCIONES PARA "LISTA SUPER" ==========

export async function obtenerListaSuper() {
  const sheets = await getSheetsClient();
  try {
    const resultado = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Lista Super!A9:F1000",
    });

    const rows = resultado.data.values || [];
    const items = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || !row[0].trim()) continue;

      items.push({
        rowIndex: i + 9,
        nombre: row[0] || "",
        categoria: row[1] || "",
        estado: row[2] || "Falta",
        cantidad: row[3] || "",
        notas: row[4] || "",
        ultimaCompra: row[5] || "",
      });
    }

    return items;
  } catch (err) {
    console.error("Error obteniendo lista super:", err.message);
    return [];
  }
}

function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export async function buscarItemEnLista(nombreProducto) {
  const lista = await obtenerListaSuper();
  const normalizado = normalizarTexto(nombreProducto);

  const fuse = new Fuse(lista, {
    keys: ["nombre"],
    threshold: 0.4,
    minMatchCharLength: 3,
  });

  const resultados = fuse.search(normalizado);
  if (resultados.length > 0) {
    return resultados[0].item;
  }

  return null;
}

export async function actualizarItemEnLista(nombreProducto, nuevoEstado) {
  const sheets = await getSheetsClient();
  const item = await buscarItemEnLista(nombreProducto);

  if (!item) return false;

  const hoy = new Date();
  const fechaHoy = `${hoy.getDate()}/${hoy.getMonth() + 1}/${hoy.getFullYear()}`;

  const updates = [];
  updates.push({
    range: `Lista Super!C${item.rowIndex}`,
    values: [[nuevoEstado]],
  });
  updates.push({
    range: `Lista Super!F${item.rowIndex}`,
    values: [[fechaHoy]],
  });

  try {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { data: updates, valueInputOption: "USER_ENTERED" },
    });
    return true;
  } catch (err) {
    console.error("Error actualizando item en lista:", err.message);
    return false;
  }
}

export async function agregarItemEnLista(nombreProducto, categoria) {
  const sheets = await getSheetsClient();
  const lista = await obtenerListaSuper();

  if (lista.length === 0) {
    console.error("No se pudo obtener la lista super");
    return false;
  }

  const ultimaFila = lista[lista.length - 1]?.rowIndex || 8;
  const nuevaFila = ultimaFila + 1;

  const row = [
    nombreProducto,
    categoria,
    "Falta",
    "",
    "",
    "",
  ];

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Lista Super!A${nuevaFila}:F${nuevaFila}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
    return true;
  } catch (err) {
    console.error("Error agregando item a lista:", err.message);
    return false;
  }
}
