// Interpreta un mensaje de WhatsApp usando OpenAI y devuelve un objeto
// estructurado con lo que hay que hacer:
//   { tipo: "gasto", monto, descripcion, categoria, pago }
//   { tipo: "transferencia", monto, de, para }
//   { tipo: "consulta" }
//   { tipo: "ninguno" }

import OpenAI from "openai";
import { OPENAI_API_KEY, OPENAI_MODEL, CATEGORIAS, PERSONAS } from "./config.js";

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const SYSTEM_PROMPT = `Sos un asistente que clasifica mensajes de WhatsApp de un grupo de gastos compartidos entre dos personas: ${PERSONAS.join(" y ")}.

Cada mensaje que recibas puede ser uno de estos cuatro tipos. Respondé SIEMPRE con un JSON estricto, sin texto adicional, sin markdown, sin comentarios.

1) GASTO: el mensaje describe una compra o pago compartido de la casa (super, servicios, nafta, salidas, etc.).
   JSON: { "tipo": "gasto", "monto": <número>, "descripcion": "<string corto>", "categoria": "<una de las categorias>", "pago": "<Matias o Pau>" }
   - Por defecto "pago" = quien escribió el mensaje (te lo paso como "remitente").
   - Si el texto dice explícitamente que pagó la OTRA persona (ej: "pagó Pau el super"), usar esa persona.
   - "categoria" debe ser EXACTAMENTE una de: ${CATEGORIAS.join(", ")}. Si no encaja en ninguna, usar "Otros".
   - "monto" siempre como número sin símbolos ni separadores (ej: 3200, no "$3.200").
   - "descripcion" un texto breve descriptivo, sin el monto (ej: "fideos y aceite", "nafta", "luz").

2) TRANSFERENCIA: alguien le pasó plata al otro para saldar cuentas (ej: "te transferí 5000", "te mandé la plata", "listo, te pasé lo que te debía", "te hice el Mercado Pago").
   JSON: { "tipo": "transferencia", "monto": <número>, "de": "<Matias o Pau>", "para": "<Matias o Pau>" }
   - Por defecto "de" = quien escribió el mensaje, "para" = la otra persona.
   - Si el texto invierte los roles explícitamente, respetar eso.

3) CONSULTA: el mensaje pregunta por el estado de cuentas o estadísticas (ej: "cuánto voy gastando", "cómo estamos", "quién le debe a quién", "cuánto gastamos este mes", "estamos a mano?").
   JSON: { "tipo": "consulta" }

4) NINGUNO: cualquier otro mensaje (saludos, charla random, preguntas no relacionadas, cosas ambiguas o que no puedas parsear con confianza).
   JSON: { "tipo": "ninguno" }

Reglas importantes:
- Responder SOLO el JSON, nada más.
- Si dudás entre "gasto" y "ninguno", elegí "ninguno".
- Si dudás entre "gasto" y "transferencia", fijate si el mensaje habla de comprar algo o pagar un servicio (gasto) vs pasarle plata al otro (transferencia).
- Los nombres válidos son EXACTAMENTE: ${PERSONAS.join(", ")}.`;

export async function interpretarMensaje(texto, remitente) {
  if (!texto || typeof texto !== "string" || !texto.trim()) {
    return { tipo: "ninguno" };
  }

  const userPrompt = `Remitente (quien escribió el mensaje): ${remitente || "desconocido"}
Mensaje: ${texto}`;

  try {
    const respuesta = await client.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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

    return validar(parsed, remitente);
  } catch (err) {
    console.error("Error al llamar a OpenAI:", err.message);
    return { tipo: "ninguno" };
  }
}

function validar(obj, remitente) {
  if (!obj || typeof obj !== "object") return { tipo: "ninguno" };

  const tipo = obj.tipo;

  if (tipo === "gasto") {
    const monto = Number(obj.monto);
    if (!Number.isFinite(monto) || monto <= 0) return { tipo: "ninguno" };

    const categoria = CATEGORIAS.includes(obj.categoria) ? obj.categoria : "Otros";
    const pago = PERSONAS.includes(obj.pago) ? obj.pago : normalizarPersona(remitente);

    return {
      tipo: "gasto",
      monto,
      descripcion: String(obj.descripcion || "").trim() || "Gasto",
      categoria,
      pago,
    };
  }

  if (tipo === "transferencia") {
    const monto = Number(obj.monto);
    if (!Number.isFinite(monto) || monto <= 0) return { tipo: "ninguno" };

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
