// Script principal del bot.
// - Se conecta a WhatsApp con Baileys (sesión persistida en disco).
// - Escucha los mensajes del grupo configurado.
// - Los interpreta con OpenAI y registra gastos/transferencias en el Excel,
//   o responde consultas de balance directamente en el grupo.

import fs from "fs";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";

import { AUTH_FOLDER, GROUP_ID, WHITELIST_NUMBERS, RATE_LIMIT_MENSAJES_POR_MINUTO } from "./config.js";
import { interpretarMensaje } from "./interpretar-mensaje.js";
import { agregarGasto, agregarTransferencia } from "./sheets.js";
import { obtenerResumen } from "./consultar-balance.js";

const logger = pino({ level: "debug" });
let intentosReconexion = 0;
const MAX_INTENTOS = 10;
const DELAY_BASE = 2000;

// Rate limiting: contador de mensajes por usuario por minuto
const rateLimitMap = new Map();

function verificarRateLimit(numero) {
  const ahora = Date.now();
  const ventana = 60000;

  if (!rateLimitMap.has(numero)) {
    rateLimitMap.set(numero, []);
  }

  const timestamps = rateLimitMap.get(numero);
  const timestampsValidos = timestamps.filter((ts) => ahora - ts < ventana);

  if (timestampsValidos.length >= RATE_LIMIT_MENSAJES_POR_MINUTO) {
    return false;
  }

  timestampsValidos.push(ahora);
  rateLimitMap.set(numero, timestampsValidos);
  return true;
}

function extraerTexto(m) {
  if (!m.message) return "";
  return m.message.conversation || m.message.extendedTextMessage?.text || "";
}

function extraerNumero(participantId) {
  if (!participantId) return null;
  const match = participantId.match(/^(\d+)/);
  return match ? match[1] : null;
}

function esNumeroAutorizado(participantId) {
  if (!WHITELIST_NUMBERS || WHITELIST_NUMBERS.length === 0) {
    console.warn("⚠️  WHITELIST_NUMBERS vacía. El bot procesará mensajes de cualquiera.");
    return true;
  }

  const numero = extraerNumero(participantId);
  if (!numero) {
    console.warn(`⚠️  No se pudo extraer número de: ${participantId}`);
    return false;
  }

  const autorizado = WHITELIST_NUMBERS.some((whitelisted) =>
    numero.includes(whitelisted) || whitelisted.includes(numero)
  );

  return autorizado;
}

function limpiarSesionPrevio() {
  if (fs.existsSync(AUTH_FOLDER)) {
    console.log(`Limpiando sesión anterior en ${AUTH_FOLDER}...`);
    fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
  }
}

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

async function iniciar() {
  if (!GROUP_ID || !GROUP_ID.endsWith("@g.us")) {
    console.error(
      "❌ GROUP_ID no está configurado en el archivo .env.\n" +
        "   Corré primero: npm run buscar-grupos\n" +
        "   Copiá el ID del grupo 'Gastos' (marcado con '>>>') y pegalo en .env."
    );
    process.exit(1);
  }

  try {
    const sock = await crearSocket();

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        intentosReconexion = 0;
        console.log("\n📱 Nuevo QR generado. Escaneá con WhatsApp (Configuración → Dispositivos vinculados):\n");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "connecting") {
        console.log("🔄 Conectando a WhatsApp...");
      }

      if (connection === "open") {
        intentosReconexion = 0;
        console.log(`\n✅ Bot conectado. Escuchando el grupo ${GROUP_ID}\n`);
      }

      if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message || `Código ${reason}` || "desconocido";

        if (reason === DisconnectReason.loggedOut) {
          console.log("🚪 Sesión cerrada por logout. Borrando credenciales y reintentando...");
          limpiarSesionPrevio();
          intentosReconexion = 0;
          setTimeout(iniciar, 2000);
        } else if (reason === DisconnectReason.connectionClosed || reason === DisconnectReason.connectionLost) {
          intentosReconexion++;
          const delayMs = Math.min(DELAY_BASE * Math.pow(1.5, intentosReconexion - 1), 30000);
          console.log(
            `⚠️  Conexión perdida (intento ${intentosReconexion}/${MAX_INTENTOS}). Reconectando en ${delayMs}ms...`
          );
          if (intentosReconexion >= MAX_INTENTOS) {
            console.error("❌ Máximo de intentos alcanzado. Abortando.");
            process.exit(1);
          }
          setTimeout(iniciar, delayMs);
        } else {
          intentosReconexion++;
          const delayMs = Math.min(DELAY_BASE * Math.pow(1.5, intentosReconexion - 1), 30000);
          console.log(
            `⚠️  Desconexión inesperada (${errorMsg}). ` +
            `Intento ${intentosReconexion}/${MAX_INTENTOS} en ${delayMs}ms...`
          );
          if (intentosReconexion >= MAX_INTENTOS) {
            console.error("❌ Máximo de intentos alcanzado. Abortando.");
            process.exit(1);
          }
          setTimeout(iniciar, delayMs);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const m of messages) {
        try {
          if (!m.key || m.key.remoteJid !== GROUP_ID) continue;
          if (m.key.fromMe) continue;

          const texto = extraerTexto(m);
          if (!texto || !texto.trim()) continue;

          const participant = m.key.participant;
          if (!esNumeroAutorizado(participant)) {
            console.warn(
              `🚫 Mensaje rechazado - remitente no autorizado: ${participant}`
            );
            continue;
          }

          const numero = extraerNumero(participant);
          if (!verificarRateLimit(numero)) {
            console.warn(
              `⏱️  Rate limit superado para ${numero}. Máximo: ${RATE_LIMIT_MENSAJES_POR_MINUTO} mensajes/minuto`
            );
            continue;
          }

          const remitente = m.pushName || m.key.participant || "desconocido";
          console.log(`\n📩 [${remitente}] ${texto}`);

          const resultado = await interpretarMensaje(texto, remitente);
          const fecha = new Date();

          if (resultado.tipo === "gasto") {
            await agregarGasto({
              fecha,
              escribio: remitente,
              pago: resultado.pago,
              monto: resultado.monto,
              descripcion: resultado.descripcion,
              categoria: resultado.categoria,
              mensajeOriginal: texto,
            });
            console.log(
              `   💸 Gasto registrado: $${resultado.monto} - ${resultado.descripcion} ` +
                `(${resultado.categoria}, pagó ${resultado.pago})`
            );
          } else if (resultado.tipo === "transferencia") {
            await agregarTransferencia({
              fecha,
              escribio: remitente,
              de: resultado.de,
              para: resultado.para,
              monto: resultado.monto,
              mensajeOriginal: texto,
            });
            console.log(
              `   🔁 Transferencia registrada: $${resultado.monto} de ${resultado.de} a ${resultado.para}`
            );
          } else if (resultado.tipo === "consulta") {
            const resumen = await obtenerResumen();
            await sock.sendMessage(GROUP_ID, { text: resumen.mensaje });
            console.log(`   📊 Respondida consulta con:\n${resumen.mensaje}`);
          } else {
            console.log("   ⚪ Ignorado (no es un gasto, transferencia ni consulta).");
          }
        } catch (err) {
          console.error("❌ Error procesando mensaje:", err.message);
        }
      }
    });
  } catch (err) {
    console.error("❌ Error al crear socket:", err.message);
    intentosReconexion++;
    const delayMs = Math.min(DELAY_BASE * Math.pow(1.5, intentosReconexion - 1), 30000);
    if (intentosReconexion >= MAX_INTENTOS) {
      console.error("❌ Máximo de intentos alcanzado. Abortando.");
      process.exit(1);
    }
    console.log(`Reintentando en ${delayMs}ms (intento ${intentosReconexion}/${MAX_INTENTOS})...`);
    setTimeout(iniciar, delayMs);
  }
}

console.log("🚀 Iniciando bot de Gastos...");
iniciar().catch((err) => {
  console.error("❌ Error fatal al iniciar el bot:", err);
  process.exit(1);
});
