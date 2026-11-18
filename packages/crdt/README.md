# @weft/crdt

CRDT de texto en TypeScript, sin dependencias, basado en un árbol Fugue de dos lados.

- Cada unidad UTF-16 tiene un identificador estable `(replica, counter)`.
- El orden del texto es el recorrido del árbol: primero los descendientes izquierdos, luego el nodo, luego los derechos. Los hermanos se ordenan de forma determinista por su identificador.
- Los nodos borrados se quedan como lápidas.
- Al escribir, cada carácter se encadena a la derecha del anterior, así que las palabras escritas a la vez en el mismo sitio no se mezclan.

```ts
import { FugueDoc } from '@weft/crdt';
const a = new FugueDoc('a');
const b = new FugueDoc('b');
b.applyMany(a.insert(0, 'hola'));
b.applyMany(a.delete(0, 1));
console.log(b.text()); // ola
```

## API

- `insert(index, text)` y `delete(index, length)` editan en local y devuelven las ops que hay que transmitir.
- `apply(op)` es idempotente y deja en espera las ops cuyas dependencias aún no han llegado.
- `applyMany(ops)` aplica un lote (por ejemplo, una página de catch-up) y avisa a los listeners de `onChange` una sola vez por lote. Las ops en espera se indexan por el id que les falta, así que el orden de llegada no afecta al coste.
- `onChange(callback)` se suscribe a los cambios remotos, expresados en coordenadas visibles previas al cambio, y devuelve una función para darse de baja. Las ediciones locales no lo disparan.
- `version()` devuelve el contador máximo visto por réplica.
- `pendingCount()` cuenta las ops sin resolver.
- `inspect()` devuelve una copia independiente del árbol.

Los índices son UTF-16. Insertar dentro de un par sustituto lanza `RangeError`; un borrado que corta un par se amplía para incluirlo entero. Cada op de inserción tiene como máximo 1.000 unidades y nunca parte un par. Las ediciones vacías no generan ops, y los rangos inválidos lanzan `RangeError`.

## Verificación

`pnpm --filter @weft/crdt test` ejecuta los tests unitarios y tres propiedades de fast-check, de 500 ejecuciones cada una: convergencia, convergencia con Unicode y no intercalado concurrente. Las historias usan 2–5 réplicas con 1–30 acciones cada una, entrega parcial, entrega final desordenada y duplicados.

## Benchmarks

Windows, Node 24.20.0 y Vitest 3.2.7. Medido con `pnpm --filter @weft/crdt exec vitest bench --run`.

| Operación en el índice 50.000 | Media | Muestras |
| --- | ---: | ---: |
| Inserción local | 5,97 ms | 100 |
| Borrado local | 8,89 ms | 100 |
| Inserción remota | 0,03 ms | 100 |

Cada benchmark empieza con un documento de 100.000 caracteres, y cada muestra hace una operación nueva. No se mide la inicialización. Las medias cumplen el objetivo de 16 ms, aunque alguna pausa del recolector de basura lo supera. La implementación usa un array de orden lineal, así que las ediciones locales no son de tiempo constante.

Puesta al día de un documento escrito pulsación a pulsación (una op por carácter), con un listener de `onChange` activo, como en el editor:

| Ops | `apply` op a op (antes) | `applyMany`, páginas de 5.000 |
| --- | ---: | ---: |
| 5.000 | 4,2 s | — |
| 10.000 | ≈ 15 s | 141 ms |
| 20.000 | 58 s | — |

Reproducir 10.000 ops en orden inverso tarda 150 ms. `test/batch.test.ts` comprueba que los dos casos se quedan por debajo de 2 s.
