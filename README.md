# Weft

Editor de texto colaborativo *local-first*. Varias personas editan el mismo documento a la vez, también sin conexión, y al reconectar todas las réplicas llegan exactamente al mismo texto, sin perder ninguna edición y sin mezclar letra a letra lo que se escribió a la vez.

[![CI](https://github.com/Goti112/weft/actions/workflows/ci.yml/badge.svg)](https://github.com/Goti112/weft/actions/workflows/ci.yml)

- **Un CRDT de texto escrito desde cero:** [Fugue](https://arxiv.org/abs/2305.00583) en TypeScript sin dependencias, verificado con tests de propiedades.
- **Un servidor de sincronización en Java 21 + Spring Boot:** WebSocket, PostgreSQL, puesta al día incremental y reintentos idempotentes.
- **Una demo que enseña las tripas:**
  - tres editores en vivo, cada uno con un botón de "cortar red";
  - un simulador de red: latencia, mensajes duplicados y desordenados;
  - un inspector con cada mensaje del protocolo, el árbol Fugue con sus lápidas y los vectores de versión.

## Arquitectura

```text
┌──────────────────── Navegador (una réplica) ──────────────────────┐
│  React + CodeMirror 6                                             │
│      │ ediciones                  ▲ cambios remotos (uno por lote)│
│  @weft/crdt  FugueDoc ◄──────────► IndexedDB  (un registro por op,│
│      │                                         marca de entrega)  │
│  SyncClient  (cola de pendientes, marca, backoff, límite de ritmo)│
└──────┼────────────────────────────────────────────────────────────┘
       │ WebSocket · JSON
┌──────▼──────────── Servidor de sincronización (Java 21 · Spring) ─┐
│  validar → deduplicar → asignar seq → ack → difundir · catch-up   │
│  las ops son opacas: el servidor nunca interpreta ni fusiona texto│
└──────┬────────────────────────────────────────────────────────────┘
       │
   PostgreSQL  ops(doc_id, seq, replica_id, counter, payload jsonb)
```

## Decisiones de diseño

**El CRDT vive solo en el cliente.** El servidor guarda y reenvía operaciones sin entenderlas. La lógica de fusión está en un único sitio ([`packages/crdt`](packages/crdt)), se puede testear de forma aislada y el servidor no necesita una copia en Java.

**Fugue en lugar de RGA.**
- Los dos convergen, pero Fugue además garantiza *no intercalado máximo*. Si dos personas escriben "hola" y "adiós" en la misma posición, el resultado es `holaadiós` o `adióshola`, nunca `haodliaós`.
- Cada unidad UTF-16 es un nodo del árbol con un id estable `(réplica, contador)`.
- Los borrados dejan lápidas, para que su id siga sirviendo de ancla a inserciones concurrentes.
- Ninguna edición parte un par sustituto, así que los emojis sobreviven a la edición concurrente.

**Búfer causal al que no le importa el orden de llegada.** Si a una op le falta su padre (o el carácter que borra), queda en espera indexada por el id que le falta. Cuando ese id se integra, se despiertan exactamente las ops que dependían de él. Reproducir 10.000 ops en orden inverso cuesta lo mismo que en orden. Véase [`FugueDoc.integrate`](packages/crdt/src/FugueDoc.ts).

**Números de secuencia contiguos + marca de entrega.**
- El servidor da a cada op guardada un `seq` por documento. Los duplicados no consumen número, así que los seq de un documento son siempre exactamente `1..head` ([`OpStore`](server/src/main/java/dev/weft/server/store/OpStore.java)).
- El cliente recuerda el mayor `n` tal que ha recibido todos los seq hasta `n`. Los que llegan por delante de un hueco esperan a que se rellene ([`SyncClient`](apps/web/src/sync/SyncClient.ts)).
- Al reconectar, el cliente envía esa marca y el servidor solo devuelve lo que falta. Sigue siendo correcto aunque los mensajes se hayan desordenado, duplicado o perdido justo antes de una desconexión.

**Idempotente de punta a punta.**
- `(doc, réplica, contador)` es único en PostgreSQL.
- El servidor confirma todas las ops de un lote, también las que ya tenía.
- El CRDT ignora las ops que ya ha aplicado.

Así, cualquier mensaje se puede reintentar o entregar dos veces sin problema, y no hace falta una entrega *exactly-once*.

**Guardar antes de enviar.**
- Una edición local se escribe en IndexedDB antes de mandarse. Recargar la página sin conexión nunca pierde una edición que el servidor aún no ha confirmado.
- Se guarda un registro por op: una pulsación cuesta lo mismo en un documento de 10 caracteres que en uno de 100.000 ([`IdbStore`](apps/web/src/storage/IdbStore.ts)).
- Las pestañas comparten el log con tres reglas de fusión:
  - una op confirmada nunca vuelve a quedar pendiente;
  - las ops que llegan del servidor cuentan como confirmadas;
  - la marca de entrega solo crece.
- Cada pestaña escribe con un id de réplica nuevo, así que dos pestañas abiertas nunca pueden generar el mismo id de op.

**Sin carreras entre la puesta al día y el tráfico en vivo.**
- En cada documento, el catch-up y la difusión de ops nuevas se ejecutan bajo el mismo bloqueo.
- La asignación de `seq` se serializa con un bloqueo de fila del documento.
- Si un cliente falla a mitad de la difusión, se le desconecta sin bloquear la entrega a los demás.

**Límites pensados para una demo pública:**
- 500 ops por lote y 64 KiB por mensaje;
- 5 MiB de ops por documento;
- 20 mensajes/s por conexión, con *token bucket* tanto en el cliente como en el servidor;
- páginas de catch-up limitadas por número de ops y por bytes;
- reconexión con *backoff* exponencial con *jitter*, hasta un máximo de 10 s;
- los documentos inactivos se borran a los 7 días.

## Protocolo

| Dirección | Mensaje | Contenido |
| --- | --- | --- |
| C → S | `hello` | `doc`, `replica`, `lastSeq` (marca de entrega) |
| S → C | `catchup` | `ops: [{seq, op}]`, `headSeq`, `done` (paginado) |
| C → S | `ops` | `Op[]` |
| S → C | `ack` | `opIds` de todo el lote, duplicados incluidos |
| S → C | `ops` | `[{seq, op}]`, difusión al resto de sesiones |
| S → C | `error` | `BAD_MESSAGE` · `NO_HELLO` · `LIMIT_EXCEEDED` · `DOC_NOT_FOUND` |

## Tests

- **Tests de propiedades** ([fast-check](https://fast-check.dev/)). Cada propiedad ejecuta 500 historias aleatorias con 2–5 réplicas, en las que las ops se entregan desordenadas, duplicadas y sincronizadas a medias. Las propiedades son tres:
  - convergencia;
  - convergencia con emojis y tildes;
  - no intercalado al escribir a la vez.
- **Tests de integración del servidor** contra PostgreSQL real con Testcontainers. Cubren:
  - deduplicación y `seq` contiguos;
  - 8 hilos escribiendo a la vez en el mismo documento;
  - catch-up paginado;
  - mensajes malformados y todos los límites.
- **Tests end-to-end** con Playwright contra la imagen Docker:
  - dos navegadores que editan sin conexión y convergen;
  - recargar la página sin red;
  - recuperar lo pendiente de una pestaña cerrada;
  - el escenario guiado de la demo;
  - una reconexión que retoma desde su marca.
- **Tests de regresión de rendimiento.** La puesta al día de 10.000 ops, en orden y al revés, debe tardar menos de 2 s, y una pulsación debe escribir solo la op nueva.

El CI lo ejecuta todo en cada push.

### Números

Medido con Node 24 en un portátil. La puesta al día corresponde a un documento escrito pulsación a pulsación, con el editor abierto.

| | |
| --- | ---: |
| Inserción local en mitad de un documento de 100.000 caracteres | 6 ms |
| Op remota aplicada en mitad de un documento de 100.000 caracteres | 0,03 ms |
| Puesta al día de 10.000 ops con el editor abierto | 141 ms |
| La misma puesta al día aplicando op a op (primera versión) | ≈ 15 s |

## Ejecutarlo

```bash
docker compose up --build        # app en http://localhost:8080
```

Si el puerto 8080 está ocupado, usa `WEFT_PORT=18081`.

Para desarrollar necesitas Node 24, pnpm, Docker y un JDK. El wrapper de Gradle descarga el JDK 21 si hace falta.

```bash
pnpm install
pnpm lint && pnpm -r test                     # tests unitarios y de propiedades (CRDT + web)
(cd server && ./gradlew test)                 # tests del servidor (necesita Docker)
docker compose up -d --build && pnpm --filter e2e test:e2e
```

## Estructura del repositorio

```text
packages/crdt   CRDT Fugue: árbol, búfer causal, aplicación por lotes, tests, benchmarks
apps/web        React + Vite + CodeMirror 6: cliente de sync, almacén IndexedDB, demo, inspector
server          Spring Boot: protocolo WebSocket, almacén de ops, límites, limpieza
e2e             Tests de Playwright contra la imagen Docker
```

## Siguientes pasos

- Varias instancias del servidor coordinadas con Redis pub/sub, con pruebas de carga en k6.
- Cursores y selecciones de los demás usuarios.
- Compactación de lápidas.
- Un árbol indexado (*order-statistic tree*) para ediciones locales en O(log n).

## Licencia

[MIT](LICENSE) © 2026 Miquel Manzano
