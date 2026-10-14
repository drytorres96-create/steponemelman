# My Q Bank fase 1

Base visual de la reedición aprobada el 14 de octubre de 2026. Implementa una
vista previa independiente dentro del proyecto React existente. La aplicación
de estudio, el Worker y los datos privados conservan sus recorridos actuales.

## Abrir y verificar

```sh
npm ci
npm run dev:myqbank
# http://localhost:5180/preview/myqbank/
npm run build:myqbank
npm run e2e:myqbank
```

El build de revisión está en `dist-myqbank/preview/myqbank/index.html`; se sirve
desde la raíz de `dist-myqbank` para resolver `/assets/`. `npm run build` sigue
produciendo exclusivamente la aplicación habitual en `dist/`. La vista previa
no se añade a ese artefacto ni requiere credenciales. En un entorno con Chromium
ya instalado, usar `CHROMIUM_PATH=/usr/bin/chromium npm run e2e:myqbank`.

El alcance funcional de la muestra es deliberadamente local a React: creación
de un bloque sintético, selección de material y sistemas, pausa con borrador,
respuestas, marcadores, navegación, cierre, modos Tutor/Test y explicaciones.
Recargar reinicia la muestra. No hay llamadas a Supabase, IA, sincronización,
cuenta, escrituras en localStorage ni modificación del calendario real.

## Entregables

| Pieza | Ubicación | Uso |
| --- | --- | --- |
| Paleta clara y oscura | `src/myqbank/tokens.css` | Valores del ZIP, variables `--mq-*`, ámbito `.mq-root`. |
| Componentes comunes | `src/myqbank/components.tsx` | Marca, tarjetas, botones, selector, chips, progreso, anillos, pestañas y estados. |
| Estilos comunes | `src/myqbank/components.css` | Tipografía, radios, foco, movimiento y alias optativos a tokens actuales. |
| Contratos de presentación | `src/myqbank/contracts.ts` | Aplicabilidad, identidad, anotaciones propuestas, visibilidad y unión de filtros. |
| Dashboard y estudio | `src/myqbank/preview/` | Vista navegable con datos sintéticos, en ambos temas. |
| Matriz y decisiones | `CONTRACTS.md` | Pantallas, sesión, métricas, contenido y almacenamiento futuro. |
| Siguiente trabajo | `BACKLOG.md` | Tareas y aceptación de las fases 2–5. |
| Verificación | `VALIDATION.md` | Línea base, comprobaciones, diferencias y límites. |

## Dirección visual y reglas de contenido

- **Diseño web:** se mantienen los colores jade, bosque y coral y la paleta clara
  del ZIP. El icono suministrado se usa a 40 × 38 px; el nombre visible es My Q Bank.
- **Neurocognición/ADHD:** revelado progresivo. La primera explicación presenta
  pocas ideas; las alternativas y drills se abren cuando son útiles.
- **Coach:** una respuesta fallada conserva el intento; un ejercicio guiado no
  sustituye su resultado. En Test no aparece una explicación antes del cierre.
- **Productividad:** el dashboard reúne progreso y creación de bloques. La meta
  se representa en la muestra y su cálculo existente se conserva para la integración.

La interfaz usa inglés. Las explicaciones, mecanismos y drills de muestra usan
español y declaran `lang="es"`; los enunciados y opciones usan inglés. La marca
y los tokens se integrarán gradualmente en producción en las fases siguientes.

Los componentes no imponen cinco pestañas. `availableSections` excluye secciones
pendientes, no aplicables o vacías. Una única sección se presenta sin tablist;
con varias, la numeración es consecutiva y el teclado admite flechas, Home y End.

## Fidelidad y adaptaciones

En escritorio se conserva la composición `300px | flexible | 410px`, las tarjetas
de cristal y el estudio en columnas. En ventanas menores se adaptan las anchuras.
Los paneles permiten desplazamiento interior; el botón Start permanece visible.
En móvil y pantalla baja se apilan las áreas y el mapa de preguntas se contrae
en un acceso breve. No se reduce el tamaño del texto del enunciado para hacerlo caber.

El selector de material y la meta se añaden al diseño de referencia por decisión
del usuario. Biblioteca y Progreso no aparecen como pestañas en la muestra.
La cabecera de estudio de esta fase usa una segunda fila para los controles de
sesión; la composición final con timer, laboratorios y figuras pertenece a fase 4.

El ejemplo de caso usa el patrón de la plantilla aportada, y los otros dos son
fixtures de recuerdo y cálculo. La matriz sintética de 72 entradas reutiliza
esas tres tarjetas para ejercitar filtros y navegación. No representa preguntas
NBME auténticas, revisión clínica ni estadísticas reales. No se importa DCLogic,
vendor, support.js ni HTML ejecutable del paquete.

## Piloto editorial privado

Selección consultada en Supabase, solo lectura, el 14-oct-2026: 12 preguntas
vigentes, cuatro de cada forma 27/28/29, seis con figura y seis sin figura; todas
con activo actual, respuesta y explicación. Se seleccionaron 12 conceptos que
cubren los diez formatos actuales; uno tiene revisión editorial con fundamento.

Los identificadores, revisiones, rutas y huellas de cambio quedan en el inventario
privado del entorno, fuera de Git y del build. Este documento solo registra cobertura.
La huella MD5 de JSONB detecta cambios en esta selección, no es una firma de seguridad.
Antes de fase 4 se revalida cada referencia y se evalúa la fuente: la selección
no aprueba clínicamente los contenidos ni traduce el corpus en fase 1.

Si el entorno privado desaparece, repetir la selección de solo lectura por forma,
figura y formato; no inferir que el inventario publicado aquí contiene sus IDs.
No se creó un activo de auditoría en Supabase porque esta fase no escribe en la base.
