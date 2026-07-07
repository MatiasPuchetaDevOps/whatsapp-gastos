// Script auxiliar: lista los números de teléfono de los participantes del grupo.
// Úsalo para obtener los números que debes agregar a WHITELIST_NUMBERS en .env
//
// Uso: npm run listar-numeros

import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } from "@whiskeysockets/baileys";
import pino from "pino";
import { AUTH_FOLDER, GROUP_ID } from "./config.js";

const logger = pino({ level: "error" });

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
  });

  sock.ev.on("creds.update", saveCreds);
  return sock;
}

async function listarNumeros() {
  const sock = await crearSocket();

  sock.ev.on("connection.update", async (update) => {
    const { connection } = update;

    if (connection === "open") {
      console.log("\n✅ Conectado. Obteniendo participantes del grupo...\n");
      try {
        const grupoInfo = await sock.groupMetadata(GROUP_ID);
        const participantes = grupoInfo.participants || [];

        if (participantes.length === 0) {
          console.log("No hay participantes en el grupo.");
          process.exit(0);
        }

        console.log(`Participantes del grupo ${GROUP_ID}:\n`);
        console.log("=".repeat(60));

        const numeros = [];
        for (const p of participantes) {
          const id = p.id;
          const match = id.match(/^(\d+)/);
          const numero = match ? match[1] : id;
          const rol = p.admin === "admin" ? "👑 Admin" : "👤 Miembro";

          console.log(`${rol}: ${numero}`);
          numeros.push(numero);
        }

        console.log("=".repeat(60));
        console.log(`\nNúmeros para WHITELIST_NUMBERS:\n${numeros.join(",")}\n`);
        console.log("Copia la línea anterior y pégala en tu .env como:\nWHITELIST_NUMBERS=...\n");
      } catch (err) {
        console.error("❌ Error al obtener participantes:", err.message);
      }

      process.exit(0);
    }
  });
}

console.log("🚀 Obteniendo números de participantes...");
listarNumeros().catch((err) => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
