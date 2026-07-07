// Script auxiliar: se corre una sola vez para listar todos los grupos
// del WhatsApp conectado y encontrar el ID del grupo "Gastos".
//
// Uso: npm run buscar-grupos
//
// El grupo objetivo se llama exactamente "Gastos" y está dentro de una
// Comunidad de WhatsApp. Los grupos que matcheen ese nombre se resaltan
// con ">>>" para que sean fáciles de identificar en la lista.

import fs from "fs";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { AUTH_FOLDER } from "./config.js";

let qrMostrado = false;
const logger = pino({ level: "debug" });

async function crearSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    logger,
    version,
    browser: Browsers.macOS("Safari"),
    syncFullHistory: false,
    markOnlineOnConnect: true,
    qrTimeout: 60000,
    keepAliveIntervalMs: 30000,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 250,
  });

  sock.ev.on("creds.update", saveCreds);
  return sock;
}

let intentosReconexion = 0;
const MAX_INTENTOS = 5;
const DELAY_BASE = 2000;

async function listarGrupos() {
  qrMostrado = false;

  try {
    const sock = await crearSocket();

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrMostrado = true;
        intentosReconexion = 0;
        console.log("\n📱 Escaneá este QR con WhatsApp (Configuración → Dispositivos vinculados):\n");
        qrcode.generate(qr, { small: true });
        return;
      }

      if (connection === "connecting") {
        if (!qrMostrado) {
          console.log("🔄 Conectando con WhatsApp...");
        }
        return;
      }

      if (connection === "open") {
        qrMostrado = false;
        console.log("\n✅ Conectado. Buscando grupos...\n");
        try {
          const grupos = await sock.groupFetchAllParticipating();
          const lista = Object.values(grupos);

          if (lista.length === 0) {
            console.log("⚠️  No se encontraron grupos.");
            process.exit(0);
          }

          console.log(`Total de grupos encontrados: ${lista.length}\n`);
          console.log("=".repeat(80));

          for (const g of lista) {
            const parentComunidad = g.linkedParent || g.parentGroup || g.parentId || null;
            const esComunidad = g.isCommunity || g.isCommunityAnnounce || false;
            const nombre = g.subject || "(sin nombre)";
            const matchGastos = nombre.trim().toLowerCase() === "gastos";
            const marcador = matchGastos ? ">>> " : "    ";

            console.log(`${marcador}Nombre: ${nombre}`);
            console.log(`    ID:     ${g.id}`);
            if (parentComunidad) {
              console.log(`    Comunidad padre: ${parentComunidad}`);
            }
            if (esComunidad) {
              console.log(`    (Este grupo es el anuncio raíz de una comunidad)`);
            }
            console.log(`    Participantes: ${g.participants?.length ?? "?"}`);
            console.log("-".repeat(80));
          }

          console.log("\nBuscá el grupo marcado con '>>>',");
          console.log("copiá su ID y pegalo en el archivo .env como GROUP_ID.\n");
        } catch (err) {
          console.error("❌ Error al obtener los grupos:", err.message);
        }

        process.exit(0);
        return;
      }

      if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message || `Código ${reason}` || "desconocido";

        if (reason === DisconnectReason.loggedOut) {
          console.log("🚪 Sesión cerrada. Borrá la carpeta auth_info y volvé a correr el script.");
          process.exit(0);
        }

        if (qrMostrado) {
          console.log("⏳ El QR fue mostrado. Esperando que finalice la vinculación...");
          return;
        }

        intentosReconexion++;
        const delayMs = Math.min(DELAY_BASE * Math.pow(1.5, intentosReconexion - 1), 15000);

        if (intentosReconexion >= MAX_INTENTOS) {
          console.error(`❌ Máximo de intentos (${MAX_INTENTOS}) alcanzado. Error: ${errorMsg}`);
          process.exit(1);
        }

        console.log(
          `⚠️  Desconexión (${errorMsg}). Intento ${intentosReconexion}/${MAX_INTENTOS} en ${delayMs}ms...`
        );
        setTimeout(listarGrupos, delayMs);
      }
    });
  } catch (err) {
    console.error("❌ Error al crear conexión:", err.message);
    intentosReconexion++;
    const delayMs = Math.min(DELAY_BASE * Math.pow(1.5, intentosReconexion - 1), 15000);

    if (intentosReconexion >= MAX_INTENTOS) {
      console.error(`❌ Máximo de intentos alcanzado.`);
      process.exit(1);
    }

    console.log(`Reintentando en ${delayMs}ms (intento ${intentosReconexion}/${MAX_INTENTOS})...`);
    setTimeout(listarGrupos, delayMs);
  }
}

console.log("🚀 Buscando grupos de WhatsApp...");
listarGrupos().catch((err) => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
