// Lee las celdas de balance y gasto del mes actual de la hoja "Resumen".
// A diferencia de exceljs, Google Sheets SÍ recalcula las fórmulas del lado
// del servidor, así que basta con leer el valor ya formateado de la celda
// donde la plantilla arma el mensaje ("Pau le debe a Matias $X" o similar).

import {
  SPREADSHEET_ID,
  HOJA_RESUMEN,
  RESUMEN_BALANCE_CELL,
  RESUMEN_GASTO_MES_CELL,
} from "./config.js";
import { getSheetsClient } from "./sheets.js";

export async function obtenerResumen() {
  const sheets = await getSheetsClient();

  const resp = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID,
    ranges: [
      `${HOJA_RESUMEN}!${RESUMEN_BALANCE_CELL}`,
      `${HOJA_RESUMEN}!${RESUMEN_GASTO_MES_CELL}`,
    ],
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rangos = resp.data.valueRanges || [];
  const balance = rangos[0]?.values?.[0]?.[0] || "(sin datos de balance)";
  const gastoMes = rangos[1]?.values?.[0]?.[0] || "$0";

  const mensaje = `${balance}\nGasto de este mes: ${gastoMes}`;

  return { balance, gastoMesActual: gastoMes, mensaje };
}
