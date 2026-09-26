# 1.24.0 — Blindaje técnico

Publicado el 26 de septiembre de 2026. Es el segundo bloque de la auditoría del 26-sep.
No cambia nada de cómo se estudia: ni los techos, ni las cajas, ni los criterios, ni qué
cuenta como intento. Cambia lo que pasa cuando algo falla, y cuánto pesa sincronizar.

## Qué cambia

**Un fallo ya no deja la página en blanco.**
- Si una pantalla falla al pintarse, en su lugar sale «Esta pantalla no pudo mostrarse»,
  con «Volver a Hoy», «Recargar la página» y «Descargar respaldo». La barra sigue.
- Si falla la aplicación entera, sale «La aplicación se ha detenido», con «Recargar la
  página» y «Descargar respaldo». Ese respaldo se lee de lo guardado en el navegador.
- Antes, cualquier error dejaba la página en blanco, también a mitad de sesión.

**Volver a la pestaña con mala conexión ya no te saca de la cuenta.**
- El acceso se vuelve a comprobar al volver a la pestaña y al renovar la sesión. Si la
  red fallaba justo entonces, salía a pantalla completa «No pudimos comprobar tu acceso»
  y la sesión de estudio se desmontaba.
- Ahora, quien ya tenía el acceso confirmado sigue estudiando.
- Si el servidor responde que el acceso se retiró, se cierra como antes. El acceso real
  lo siguen decidiendo las políticas RLS en cada petición.

**Una copia local dañada ya no bloquea la aplicación.**
- Antes salía «No se pudo cargar tu cuenta o el material» y no había forma de seguir sin
  borrar los datos del navegador.
- Ahora la copia ilegible se aparta en el navegador, sin borrarla, y el progreso se
  recupera de la cuenta. Un aviso lo cuenta, con «Entendido».
- Lo mismo con la copia de las preguntas NBME, que dejaba el banco bloqueado.
- No se aprovecha nada de la copia dañada: mezclarla a medias con la nube podría revivir
  progreso de antes de un reinicio.

**Sincronizar sin cambios ya no mueve el progreso entero.**
- El progreso de conceptos pesa hoy 533 KB (176 conceptos, 676 intentos) y en diciembre
  pesará varios megas. Cada 30 segundos, con la pestaña abierta, se bajaba entero y se
  volvía a subir entero aunque no hubiera cambiado nada. La revisión en la nube iba por
  la 6686.
- Ahora primero se consulta sólo la revisión. Si no cambió, no se baja nada.
- Si este dispositivo no tiene nada nuevo, no se sube nada, no se gasta una revisión y no
  se reescribe la copia local.
- Igual con las preguntas NBME (41 KB), que ya no subían sin cambios pero sí se bajaban.
- Una respuesta nueva se sube como siempre, a los 650 ms.

**«Exportar progreso» incluye las preguntas NBME.** Un solo archivo: los conceptos
arriba, en el formato que lee «Importar progreso», y las preguntas en `nbme`. Importar
sigue recuperando los conceptos; las preguntas se recuperan de la cuenta.

**Cómo volver atrás una publicación.** `docs/volver-atras.md`: el rollback en Cloudflare
en un minuto, cómo dejar `main` igual que producción y por qué el progreso no corre
peligro.

## Qué no cambia

Los techos, el viernes, las cajas, los criterios de dominio, la meta de 60 días, qué se
registra como intento, el Worker y el corpus. El formato del progreso y la base de datos
son los mismos.

## Cómo está hecho

- `src/components/Resguardo.tsx`: `Resguardo` (límite de errores de React),
  `FalloPantalla` y `FalloGeneral`. `src/main.tsx` pone uno general y `src/App.tsx` uno
  por pantalla, cuya `key` cambia con la vista y con cada reintento.
- `src/lib/respaldo.ts`: el nombre del respaldo y `respaldoDeEmergencia`, que elige la
  copia más reciente entre IndexedDB y el respaldo rápido.
- `src/auth/AuthGate.tsx`: recuerda el último acceso confirmado de cada cuenta y lo
  olvida al cerrar sesión.
- `src/store/apartar.ts`: guarda la copia ilegible en `apartada:<clave>:<fecha>` y retira
  la dañada.
- `src/store/estado.tsx` y `src/nbme/NbmeProvider.tsx`: arranque con la copia apartada y
  su aviso (`avisoLocal`, `localNotice`), transporte `peek` y `exportar(extra)`.
- `src/store/sync.ts` y `src/nbme/sync.ts`: `peek` opcional y el resultado `unchanged`;
  el motor de conceptos ya no sube sin cambios.

## Pruebas

- `sync.test.ts`:
  - sin cambios no se sube, y se sube en cuanto hay una respuesta nueva;
  - no se baja el progreso mientras la revisión no cambie;
  - un reinicio hecho en otro dispositivo se aplica igual.
- `estado-provider.test.ts`:
  - la copia dañada se aparta, el progreso llega de la nube y nada de la copia sube;
  - si no puede apartarse, no se sustituye;
  - sin cambios sólo se consulta la revisión: ni se sube ni se reescribe la copia local;
  - el respaldo con las preguntas NBME sigue siendo importable.
- `nbme/provider.test.tsx`: la copia de preguntas dañada se aparta y las preguntas se
  recuperan de la cuenta.
- `nbme/sync.test.ts`: la consulta ligera evita la descarga y deja pasar cambios y
  reinicios.
- `auth-boundary.test.ts`:
  - un fallo de red al volver a la pestaña no desmonta el estudio;
  - sin acceso confirmado, sí bloquea;
  - un acceso retirado cierra;
  - cerrar sesión olvida el acceso confirmado.
- `resguardo.test.tsx`:
  - el fallo de una pantalla deja el foco en «Volver a Hoy» y un respaldo con NBME;
  - en la aplicación la barra sigue y «Volver a Hoy» recupera, también cuando la que falla
    es Hoy;
  - el aviso de copia apartada se cierra con «Entendido»;
  - el fallo general ofrece el respaldo del navegador, que elige la copia más reciente.
- `simplificacion.test.tsx`: «Exportar progreso» entrega un solo archivo con conceptos y
  preguntas NBME.
- Se reescribe una prueba, «no transforma una generación de caché corrupta en un
  progreso nuevo», que esperaba el bloqueo. La garantía que protegía se mantiene: nada de
  la copia dañada llega a la nube. La de sincronización concurrente ahora hace un cambio
  antes, porque sin cambios ya no se llama al servidor.
- Mutaciones comprobadas (14). Cada una de estas hace fallar su prueba:
  - subir aunque no haya cambios;
  - bajar sin consultar la revisión, en conceptos y en NBME;
  - reescribir la copia local en cada sincronización;
  - bloquear el arranque con una copia dañada, en conceptos y en NBME;
  - aprovechar el progreso de la copia dañada;
  - echar a quien ya tenía acceso ante un fallo de red;
  - recordar el acceso tras cerrar sesión;
  - exportar sin NBME, desde Ajustes o desde el resguardo;
  - un respaldo de emergencia que no elige la copia más reciente;
  - no volver a montar Hoy al reintentar;
  - un resguardo que no recoge el fallo.

Total: 559 pruebas, 557 pasan y 2 omitidas (las de siempre). Build sin errores de
TypeScript.
