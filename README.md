# whatsapp-gastos

Bot personal que escucha un grupo de WhatsApp entre dos personas (Matias y Pau), interpreta cada mensaje con IA y registra los gastos compartidos en una planilla de **Google Sheets** para poder revisar totales, categorías y balances.

## Qué hace

- Escucha un grupo específico de WhatsApp (el grupo se llama **"Gastos"** y está dentro de una Comunidad).
- Con cada mensaje nuevo, le pregunta a OpenAI de qué se trata:
  - **Gasto** (ej: "compré fideos 3200") → suma una fila a la hoja `Gastos` de la planilla.
  - **Transferencia** (ej: "te transferí 5000") → suma una fila marcada como transferencia para saldar cuentas.
  - **Consulta** (ej: "cómo estamos?", "cuánto va este mes?") → lee la celda de balance de la hoja `Resumen` y la responde por el mismo grupo.
  - Cualquier otro mensaje se ignora.
- La hoja `Resumen` de la planilla ya trae las fórmulas y gráficos armados; el bot solo escribe en `Gastos` y no toca `Resumen`.

## Setup paso a paso

### 1. Preparar la planilla en Google Sheets

Tener armada una planilla con dos hojas:

- **`Gastos`**: headers en la fila 1 (`Fecha, Hora, Escribió, Pagó / De, Monto, Descripción, Categoría, Mensaje original, Tipo, Para (solo transferencias)`), dropdowns de validación en las columnas D, G, I, J, y formatos de fecha/moneda en A, B, E.
- **`Resumen`**: fórmulas que leen `Gastos` y arman el mensaje de balance en una celda (ej: `"Pau le debe a Matias $X"` o `"✅ Están a mano"`) y el gasto del mes actual en otra.

### 2. Crear el service account en Google Cloud

1. Ir a [Google Cloud Console](https://console.cloud.google.com/) y crear un proyecto nuevo (o usar uno existente).
2. Habilitar la **Google Sheets API** para ese proyecto (buscar "Google Sheets API" en el marketplace y darle Enable).
3. En **IAM & Admin → Service Accounts**, crear un service account nuevo (nombre libre, ej: `whatsapp-gastos-bot`).
4. En el service account recién creado, ir a la pestaña **Keys → Add Key → Create new key → JSON** y descargar el archivo.
5. Guardar ese JSON en la raíz de este proyecto con el nombre `google-credentials.json`.
6. **Compartir la planilla** con el email del service account (el `client_email` que figura dentro del JSON, algo tipo `xxx@xxx.iam.gserviceaccount.com`) dándole permisos de **Editor**.

### 3. Instalar dependencias

```bash
npm install
```

### 4. Configurar variables de entorno

No guardes secretos en `config.js`. Definí estas variables en tu shell o en un archivo `.env` (si usás un loader externo):

```bash
export OPENAI_API_KEY="tu-api-key"
export SPREADSHEET_ID="tu-spreadsheet-id"
export GROUP_ID="tu-group-id@g.us"
export WHITELIST_NUMBERS="5493543606194,5491234567890"
export RESUMEN_BALANCE_CELL="B10"
export RESUMEN_GASTO_MES_CELL="B5"
export GOOGLE_CREDENTIALS_PATH="./google-credentials.json"
export AUTH_FOLDER="./auth_info"
```

**WHITELIST_NUMBERS** (importante para seguridad):
- Lista de números de teléfono autorizados, separados por coma.
- El bot **solo procesará mensajes de estos números**.
- Formato: código de país + número (ej: `5493543606194` para Argentina).
- Si está vacía, el bot procesará mensajes de cualquiera (⚠️ no recomendado).
- Los números se extraen automáticamente del participante en el grupo.

También podés usar el archivo `.env.example` como referencia.

### 5. Loguear WhatsApp y encontrar el ID del grupo

```bash
npm run buscar-grupos
```

- Va a mostrar un QR: escanealo desde WhatsApp (Configuración → Dispositivos vinculados).
- Una vez logueado, el script lista todos los grupos con su ID.
- Los grupos que se llamen exactamente **"Gastos"** aparecen resaltados con `>>>` al comienzo de la línea.
- Copiar el `ID` del grupo correcto (formato `xxxxxxxxxxxxxxxxxx@g.us`) y pegarlo en `config.js` en `GROUP_ID`.

Como el grupo "Gastos" está dentro de una Comunidad, prestá atención: la comunidad en sí también aparece listada (con el nombre de la comunidad, no "Gastos"), y puede haber otros subgrupos. Si el grupo pertenece a una comunidad, el script también imprime el ID del padre para dar más contexto.

La sesión de WhatsApp queda guardada en la carpeta `auth_info/`, así que este paso solo hace falta la primera vez (o si borrás esa carpeta).

### 6. Arrancar el bot

```bash
npm start
```

A partir de acá, cada mensaje que se mande al grupo se procesa automáticamente.

## Estructura

```
whatsapp-gastos/
├── config.js               # API key, GROUP_ID, ID de planilla, categorías, personas
├── buscar-grupos.js        # Script auxiliar para listar grupos y encontrar el ID
├── interpretar-mensaje.js  # Llama a OpenAI y devuelve un objeto estructurado
├── sheets.js               # Cliente de Google Sheets + agregarGasto / agregarTransferencia
├── consultar-balance.js    # Lee la celda de balance de la hoja "Resumen"
├── index.js                # Script principal: conecta WhatsApp y coordina todo
├── google-credentials.json # (LO PONÉS VOS) JSON del service account de Google Cloud
├── auth_info/              # (generado) credenciales de WhatsApp
└── package.json
```

## Seguridad

El bot implementa varias capas de protección:

### Lista blanca de números (WHITELIST_NUMBERS)
- Solo procesa mensajes de números autorizados
- Rechaza mensajes de desconocidos automáticamente

### Límites de montos
- **MONTO_MAXIMO** (default 500000): evita registros accidentales de montos enormes
- **MONTO_MINIMO** (default 1): rechaza montos inválidos

### Rate limiting
- **RATE_LIMIT_MENSAJES_POR_MINUTO** (default 10): máximo de mensajes por usuario por minuto
- Evita spam y limita costos de OpenAI

### Sanitización de prompts
- Limita la longitud del texto a 5000 caracteres
- Escapa caracteres especiales para evitar prompt injection

### Timeout en OpenAI
- **OPENAI_TIMEOUT_MS** (default 15000): evita que se queden colgadas las llamadas a la API

### Valores recomendados para producción:
```env
MONTO_MAXIMO=500000
MONTO_MINIMO=1
RATE_LIMIT_MENSAJES_POR_MINUTO=10
OPENAI_TIMEOUT_MS=15000
```

## Categorías válidas

`Super, Compras Casa, Servicios Casa, Tarjeta, Ocio, Salidas, Transporte, Salud, Ropa, Otros`

Si el gasto no encaja en ninguna, se guarda como `Otros`.

## Ejemplos de mensajes

- `"compré fideos y aceite 3200"` → gasto de $3200 en Super, pagado por quien escribió.
- `"pagó Pau el super 5000"` → gasto de $5000 en Super, pagado por Pau (aunque no haya sido quien escribió).
- `"pagué 5000 de nafta"` → gasto de $5000 en Transporte.
- `"te transferí 10000"` → transferencia de $10000 de quien escribió hacia el otro.
- `"cómo estamos?"` → el bot responde en el grupo con el balance actual y el gasto del mes.

## ⚠️ Advertencia importante

Este bot usa [Baileys](https://github.com/WhiskeySockets/Baileys), una librería **no oficial** que conecta con WhatsApp Web sin usar la API oficial de WhatsApp Business. Esto **va contra los términos de servicio de WhatsApp** para cuentas personales.

En la práctica, con un volumen bajo de mensajes (un grupo de 2 personas) el riesgo de baneo es bajo, pero **no es cero**. Si te importa que la cuenta no sea baneada, evaluá usar la API oficial de WhatsApp Business en su lugar.

Solo uso personal, bajo tu propio riesgo.
