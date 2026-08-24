// Interpreta un mensaje de WhatsApp usando OpenAI y devuelve un objeto
// estructurado con lo que hay que hacer:
//   { tipo: "gasto", monto, descripcion, categoria, pago }
//   { tipo: "transferencia", monto, de, para }
//   { tipo: "consulta" }
//   { tipo: "ninguno" }

import OpenAI from "openai";
import {
  OPENAI_API_KEY,
  OPENAI_MODEL,
  CATEGORIAS,
  CATEGORIAS_INGRESOS,
  PERSONAS,
  MONTO_MAXIMO,
  MONTO_MINIMO,
  OPENAI_TIMEOUT_MS,
  GROUP_DESTINATIONS,
} from "./config.js";

const client = new OpenAI({ apiKey: OPENAI_API_KEY, timeout: OPENAI_TIMEOUT_MS });

function estaEnGrupoPersonal(grupoId) {
  const hojaDestino = GROUP_DESTINATIONS[grupoId] || "";
  return hojaDestino.toLowerCase().includes("personal");
}

function construirSystemPrompt(esGrupoPersonal) {
  let prompt = `Sos un asistente que clasifica mensajes de WhatsApp de un grupo de gastos. Los participantes son: ${PERSONAS.join(" y ")}.

Cada mensaje que recibas puede ser uno de estos tipos. Respondé SIEMPRE con un JSON estricto, sin texto adicional, sin markdown, sin comentarios.

1) GASTO: el mensaje describe una compra o pago (super, servicios, nafta, salidas, electrodomésticos, etc.).
   JSON: { "tipo": "gasto", "monto": <número>, "descripcion": "<string corto>", "categoria": "<una de las categorias>", "pago": "<Matias o Pau>" }
   - Por defecto "pago" = quien escribió el mensaje (te lo paso como "remitente").
   - Si el texto dice explícitamente que pagó la OTRA persona (ej: "pagó Pau el super"), usar esa persona.
   - "categoria" debe ser EXACTAMENTE una de: ${CATEGORIAS.join(", ")}. Si no encaja en ninguna, usar "Otros".
   - "monto" siempre como número sin símbolos ni separadores (ej: 3200, no "$3.200").
   - "descripcion" un texto breve descriptivo, sin el monto (ej: "fideos y aceite", "nafta", "luz").

   IMPORTANTE - Detecta compras en CUOTAS (tarjeta de crédito):
   Si el mensaje menciona "cuota", "cuotas", o un patrón como "2/6", "3 de 12":
   - categoria = "Tarjeta"
   - monto = el importe de ESA CUOTA (nunca multipliques por el total de cuotas)
   - descripcion = nombre del producto + número de cuota entre paréntesis si está disponible
     Ej: "Heladera (cuota 2/6)", "Living (cuota)", "Aire acondicionado (3 de 12)"
   - pago = quien escribió el mensaje (o quien pagó explícitamente)`;

  if (esGrupoPersonal) {
    prompt += `

2) INGRESO: el mensaje reporta dinero que entra (sueldo, trabajo particular, sesiones, etc.).
   JSON: { "tipo": "ingreso", "monto": <número>, "descripcion": "<string corto>", "categoria": "<una de las categorias de ingreso>", "de": "<Matias o Pau>" }
   - "de" = quien recibió el ingreso (normalmente quien escribió el mensaje).
   - "categoria" debe ser EXACTAMENTE una de: ${CATEGORIAS_INGRESOS.join(", ")}. Si no encaja, usar "Otros ingresos".
   - "monto" siempre como número sin símbolos.
   - "descripcion" breve descriptiva (ej: "sesiones psicologa", "freelance diseño", "proyecto programación").

   INDICADORES de ingreso para cada persona:
   - Pau (psicóloga): mensajes sobre "sesiones", "pacientes", "consultas" → siempre son ingresos
   - Matias (programador): mensajes sobre "sueldo", "me pagaron", "trabajé un proyecto" → ingresos
   - Si no es explícito, preguntar o clasificar como "ninguno".

3) TRANSFERENCIA: alguien le pasó plata al otro para saldar cuentas.
   JSON: { "tipo": "transferencia", "monto": <número>, "de": "<Matias o Pau>", "para": "<Matias o Pau>" }
   - Por defecto "de" = quien escribió el mensaje, "para" = la otra persona.
   - Si el texto invierte los roles explícitamente, respetar eso.

4) CONSULTA: el mensaje pregunta por el estado de cuentas o estadísticas.
   JSON: { "tipo": "consulta" }

5) NINGUNO: cualquier otro mensaje (saludos, charla, cosas ambiguas).
   JSON: { "tipo": "ninguno" }`;
  } else {
    prompt += `

2) TRANSFERENCIA: alguien le pasó plata al otro para saldar cuentas.
   JSON: { "tipo": "transferencia", "monto": <número>, "de": "<Matias o Pau>", "para": "<Matias o Pau>" }
   - Por defecto "de" = quien escribió el mensaje, "para" = la otra persona.
   - Si el texto invierte los roles explícitamente, respetar eso.

3) CONSULTA: el mensaje pregunta por el estado de cuentas o estadísticas.
   JSON: { "tipo": "consulta" }

4) NINGUNO: cualquier otro mensaje (saludos, charla, cosas ambiguas).
   JSON: { "tipo": "ninguno" }`;
  }

  prompt += `

Reglas generales:
- Responder SOLO el JSON, nada más.
- Si dudás entre "gasto" y "ninguno", elegí "ninguno".
- Si dudás entre "gasto" y "transferencia", fijate si habla de comprar/pagar (gasto) vs pasarle plata (transferencia).
- Los nombres válidos son EXACTAMENTE: ${PERSONAS.join(", ")}.`;

  return prompt;
}

function sanitizarPrompt(texto) {
  if (!texto || typeof texto !== "string") return "";
  return texto
    .substring(0, 5000)
    .replace(/[\0\x1B]/g, "")
    .trim();
}

export async function procesarListaYTicket(texto, base64Image) {
  if (base64Image) {
    const productos = await procesarTicketImagen(base64Image);
    return { tipo: "ticket", productos };
  }

  if (esListaSupermercado(texto)) {
    const items = await procesarListaSupermercado(texto);
    return { tipo: "lista-super", items };
  }

  return null;
}

export async function interpretarMensaje(texto, remitente, grupoId) {
  if (!texto || typeof texto !== "string" || !texto.trim()) {
    return { tipo: "ninguno" };
  }

  const textoSanitizado = sanitizarPrompt(texto);
  const remitenteSanitizado = sanitizarPrompt(remitente || "desconocido");
  const esPersonal = estaEnGrupoPersonal(grupoId);
  const systemPrompt = construirSystemPrompt(esPersonal);

  const userPrompt = `Remitente (quien escribió el mensaje): ${remitenteSanitizado}
Mensaje: ${textoSanitizado}`;

  try {
    const respuesta = await client.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
    });

    const contenido = respuesta.choices[0]?.message?.content?.trim();
    if (!contenido) return { tipo: "ninguno" };

    let parsed;
    try {
      parsed = JSON.parse(contenido);
    } catch {
      return { tipo: "ninguno" };
    }

    return validar(parsed, remitenteSanitizado, esPersonal);
  } catch (err) {
    console.error("Error al llamar a OpenAI:", err.message);
    return { tipo: "ninguno" };
  }
}

function validar(obj, remitente, esGrupoPersonal) {
  if (!obj || typeof obj !== "object") return { tipo: "ninguno" };

  const tipo = obj.tipo;

  if (tipo === "gasto") {
    const monto = Number(obj.monto);
    if (!Number.isFinite(monto) || monto < MONTO_MINIMO || monto > MONTO_MAXIMO) {
      console.warn(
        `⚠️  Gasto rechazado: monto ${monto} fuera de rango [${MONTO_MINIMO}, ${MONTO_MAXIMO}]`
      );
      return { tipo: "ninguno" };
    }

    const categoria = CATEGORIAS.includes(obj.categoria) ? obj.categoria : "Otros";
    const pago = PERSONAS.includes(obj.pago) ? obj.pago : normalizarPersona(remitente);

    return {
      tipo: "gasto",
      monto,
      descripcion: String(obj.descripcion || "").trim().substring(0, 200) || "Gasto",
      categoria,
      pago,
    };
  }

  if (tipo === "ingreso" && esGrupoPersonal) {
    const monto = Number(obj.monto);
    if (!Number.isFinite(monto) || monto < MONTO_MINIMO || monto > MONTO_MAXIMO) {
      console.warn(
        `⚠️  Ingreso rechazado: monto ${monto} fuera de rango [${MONTO_MINIMO}, ${MONTO_MAXIMO}]`
      );
      return { tipo: "ninguno" };
    }

    const categoria = CATEGORIAS_INGRESOS.includes(obj.categoria) ? obj.categoria : "Otros ingresos";
    const de = PERSONAS.includes(obj.de) ? obj.de : normalizarPersona(remitente);

    return {
      tipo: "ingreso",
      monto,
      descripcion: String(obj.descripcion || "").trim().substring(0, 200) || "Ingreso",
      categoria,
      de,
    };
  }

  if (tipo === "transferencia") {
    const monto = Number(obj.monto);
    if (!Number.isFinite(monto) || monto < MONTO_MINIMO || monto > MONTO_MAXIMO) {
      console.warn(
        `⚠️  Transferencia rechazada: monto ${monto} fuera de rango [${MONTO_MINIMO}, ${MONTO_MAXIMO}]`
      );
      return { tipo: "ninguno" };
    }

    const de = PERSONAS.includes(obj.de) ? obj.de : normalizarPersona(remitente);
    let para = PERSONAS.includes(obj.para) ? obj.para : null;
    if (!para) para = PERSONAS.find((p) => p !== de) || PERSONAS[0];
    if (para === de) para = PERSONAS.find((p) => p !== de) || para;

    return { tipo: "transferencia", monto, de, para };
  }

  if (tipo === "consulta") return { tipo: "consulta" };

  return { tipo: "ninguno" };
}

function normalizarPersona(nombre) {
  if (!nombre) return PERSONAS[0];
  const lower = nombre.toLowerCase();
  const match = PERSONAS.find((p) => p.toLowerCase() === lower || lower.includes(p.toLowerCase()));
  return match || PERSONAS[0];
}

const CATEGORIAS_SUPER = [
  "Almacén",
  "Frutas y Verduras",
  "Lácteos",
  "Carnes",
  "Limpieza",
  "Bebidas",
  "Higiene",
  "Otros",
];

function esListaSupermercado(texto) {
  const lineas = texto.trim().split("\n").filter((l) => l.trim().length > 0);
  if (lineas.length < 3) return false;

  let contadorProductos = 0;
  for (const linea of lineas) {
    const trimmed = linea.trim();
    if (/^\d+[\.,]\d+|^\$/.test(trimmed)) return false;
    if (trimmed.length > 3 && trimmed.length < 100) {
      contadorProductos++;
    }
  }

  return contadorProductos >= lineas.length * 0.6;
}

async function procesarListaSupermercado(texto) {
  const lineas = texto
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);

  const systemPrompt = `Sos un asistente que procesa listas de compra.
Para cada línea, extraé el nombre del producto y asigná una categoría.
Corregí errores de tipeo obvios (ej: "Nesquit" → "Nesquik").
Respondé SOLO con un JSON array sin texto adicional.

Categorías válidas: ${CATEGORIAS_SUPER.join(", ")}

Formato: [{"nombre": "...", "categoria": "..."}, ...]`;

  const userPrompt = `Lista de productos:\n${lineas.join("\n")}`;

  try {
    const respuesta = await client.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
    });

    const contenido = respuesta.choices[0]?.message?.content?.trim();
    if (!contenido) return null;

    let parsed;
    try {
      parsed = JSON.parse(contenido);
    } catch {
      return null;
    }

    const items = Array.isArray(parsed) ? parsed : parsed.items || [];
    return items
      .filter((item) => item.nombre && item.categoria)
      .map((item) => ({
        nombre: String(item.nombre).trim().substring(0, 100),
        categoria: CATEGORIAS_SUPER.includes(item.categoria)
          ? item.categoria
          : "Otros",
      }));
  } catch (err) {
    console.error("Error procesando lista supermercado:", err.message);
    return null;
  }
}

async function procesarTicketImagen(base64Image) {
  const systemPrompt = `Sos un asistente que extrae productos de tickets de compra.
Listá SOLO los nombres de los productos, uno por línea, sin marcas de viñeta, sin precios.
Sé conciso: máximo el nombre del producto.`;

  const userPrompt = "Extrae los productos de este ticket de compra:";

  try {
    const respuesta = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64Image}` },
            },
          ],
        },
      ],
      temperature: 0.1,
    });

    const contenido = respuesta.choices[0]?.message?.content?.trim();
    if (!contenido) return [];

    const productos = contenido
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 2 && line.length < 100);

    return productos;
  } catch (err) {
    console.error("Error procesando ticket imagen:", err.message);
    return [];
  }
}
