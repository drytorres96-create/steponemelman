# 1.25.0 — Viñetas de mecanismo (piloto)

Publicado el 26 de septiembre de 2026. Es el bloque 4 de la auditoría del 26-sep, en la
forma que eligió Yoel: un piloto de viñetas hechas por IA. Del bloque 3 no se hace nada:
Yoel no quiere registros extra (su práctica con AMBOSS vive en otra aplicación) ni
práctica de inglés. Las preguntas con imagen quedan para después.

## Qué cambia

**Una tercera pestaña en «Elegir contenido»: «Viñetas (piloto)».** 40 viñetas:
- 24 de bioquímica, sobre conceptos que ya has estudiado. Incluye las tres hiperplasias
  suprarrenales congénitas, el plomo y el hemo, el folato frente a la B12 y la vitamina K.
- 16 de microbiología con mecanismo: toxinas, resistencia, variación antigénica,
  latencia y parásitos.

**Cómo es cada viñeta.**
- Enunciado y opciones en inglés, al estilo NBME.
- La explicación va en español:
  - las claves del caso;
  - el mecanismo, paso a paso;
  - por qué no las otras;
  - el patrón: «si ves X + Y → piensa en Z».
- Dice de qué concepto sale.
- Las dos disciplinas van intercaladas. La respuesta correcta está repartida entre la A y
  la E, para que la posición no dé pistas.

**Sin revisión clínica, y lo dice.**
- Cada viñeta lleva la etiqueta «Generada por IA · sin revisión clínica».
- «Marcar como dudosa» guarda las que no cuadran con tu material, y «Ver las dudosas» las
  vuelve a abrir.

**No toca tu estudio.**
- No cuenta para Hoy ni para el dominio: no registra intentos ni entra en las cajas.
- Lo que respondes y las dudosas se guardan sólo en este navegador.

**Igual que las cajas.**
- Con el teclado: la letra elige, Intro comprueba e Intro sigue.
- Piel de estudio y sin menú.
- Pausa sugerida a las 20 seguidas.

**Botones de la pestaña.**
- Cada disciplina con sus pendientes.
- «Todas las pendientes».
- «Repasar las falladas».
- «Ver las dudosas».

## Qué no cambia

Hoy, los techos, las cajas, el dominio, la meta de 60 días, el progreso sincronizado y el
Worker.

## Cómo está hecho

- Supabase: tabla nueva `ai_vignettes` (migración `ai_vignettes_pilot`, en
  `database/vinetas-schema.sql`).
  - Sólo los miembros pueden leerla, y nadie escribe desde la aplicación.
  - El contenido se cargó por administración y no está en el repositorio.
  - Comprobado:
    - un miembro ve las 40 viñetas;
    - un usuario sin membresía, ninguna;
    - el rol anónimo no tiene permiso;
    - las 40 filas coinciden byte a byte con el original;
    - los 40 conceptos de origen existen en el corpus.
- `src/vinetas/modelo.ts`:
  - validación todo o nada de cada viñeta: sin explicación de un distractor no se enseña;
  - progreso local;
  - qué abre cada botón.
- `src/vinetas/api.ts`: la carga, con copia para practicar sin conexión.
- `src/vinetas/Vinetas.tsx`: la entrada y el reproductor.
- `src/App.tsx`: la pestaña y la vista de concentración `vinetas`.
- `docs/volver-atras.md`: explica por qué volver atrás sigue siendo seguro. Los cambios
  de la base han sido siempre aditivos.

## Pruebas

- `src/vinetas/modelo.test.ts`:
  - lee una fila completa y descarta la viñeta entera si le falta cualquier pieza;
  - el progreso es por cuenta y conjunto, y una copia ilegible empieza vacía;
  - qué abre cada botón.
- `src/__tests__/vinetas.test.tsx`:
  - la letra elige; Intro comprueba y se consume; el foco pasa a «Siguiente viñeta»;
    tras corregir, las letras no cambian la respuesta;
  - la respuesta y la marca de dudosa se guardan sólo en el navegador, sin llamar al
    progreso de estudio;
  - Intro sobre un botón manda el botón, y sin respuesta no comprueba;
  - la pausa llega a las 20, con el foco en «Seguir», y no al final;
  - la piel de estudio dura lo que dura la sesión;
  - la entrada cuenta lo hecho y abre sólo lo pendiente, las falladas o las dudosas; si
    no carga, deja reintentar;
  - en la aplicación: vista de concentración, y «Salir» vuelve a la pestaña.
- Navegador (`e2e/estudio.spec.ts`): el recorrido completo con el teclado. Encontró un
  fallo que jsdom no veía: al abrir la vista, la aplicación enfocaba su zona principal
  después del título. Ahora el título espera un instante.
- Mutaciones comprobadas (9). Cada una de estas hace fallar su prueba:
  - no consumir el Intro;
  - no guardar la respuesta;
  - quitar la pausa o pedirla al final;
  - quitar la piel;
  - abrir también lo ya hecho;
  - aceptar un distractor sin explicación;
  - dejar cambiar la respuesta tras corregir;
  - enfocar el título sin esperar.

Total: 573 pruebas, 571 pasan y 2 omitidas (las de siempre); 7 pruebas de navegador.
Build sin errores de TypeScript.
