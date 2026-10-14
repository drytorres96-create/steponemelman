# Verificación de fase 1

Línea base: `304e3ba88f32ec2f27526bbc89f3421574c38321`, igual a `origin/main`
al iniciar el trabajo. Rama: `codex/myqbank-phase-1`. Fecha: 14-oct-2026.

## Pruebas

| Comprobación | Resultado local |
| --- | --- |
| Instalación reproducible | `npm ci` correcto, sin dependencias nuevas. |
| Unitarias de línea base | 1155 aprobadas y 2 omisiones esperadas. |
| Unitarias con fase 1 | 1165 aprobadas y 2 omisiones esperadas. |
| Contratos nuevos | 10 aprobadas; también cubren texto vacío y drill sin solución. |
| Build de aplicación | Correcto; mismos nombres/hash de bundles que la línea base. |
| Build de vista previa | Correcto; artefacto independiente `dist-myqbank`. |
| Navegador de vista previa | 12 aprobadas en Chromium. |
| Recorridos existentes de la aplicación | 119 aprobados en Chromium con fixtures sintéticos. |
| Higiene del diff | `git diff --check` sin errores. |

Las pruebas de vista previa verifican 390, 1280 y 1440 px en ambos temas,
ausencia de desbordamiento horizontal, botón Start visible en escritorio,
paleta literal clara/oscura, no revelación de Test hasta el cierre, borrador y
marcador al pausar, pestañas opcionales, navegación por teclado y drills finitos.
La prueba a 720 × 450 verifica reflujo equivalente a un viewport de 1440 × 900
al 200 %; no se presenta como una prueba de todos los zooms/navegadores.

Una prueba intercepta solicitudes y comprueba que solo se usa el servidor local,
y que localStorage/sessionStorage permanecen vacíos. Los proveedores de cuenta,
corpus y progreso no se importan en la entrada de la muestra.

## Revisión adversarial del diff

- La nueva entrada se construye aparte: `vite.config.ts`, `src/main.tsx`, App,
  proveedores, Worker, serializers, RPC y cálculo de meta no cambian.
- Los tokens se limitan a `.mq-root`; los alias heredados solo existen en ese
  árbol. Los resets HTML/body se importan exclusivamente en la entrada de revisión.
- El modo Test se comprueba en banner, opciones y mapa. Volver al dashboard no
  agrega el intento oculto a las cifras históricas sintéticas de la muestra.
- Los intentos enviados no se editan. Cerrar deja las omitidas sin calificar.
- Se corrigió la pérdida del borrador al pausar, elevándolo al bloque en memoria.
- Se corrigió la acción Start inicialmente fuera de vista; el cuerpo del constructor
  puede desplazarse mientras la acción permanece accesible.
- El filtro editorial excluye pendientes, no aplicables, texto en blanco y drills
  sin respuesta. No se deduce una explicación por alternativa de enlaces sugeridos.
- El repositorio contiene solo fixtures sintéticos y capturas del arnés. El inventario
  del piloto permanece fuera de Git; no hay preguntas privadas, credenciales o SQL
  de escritura en este cambio.

## Evidencia visual

Capturas de referencia inicial con el arnés sintético existente:

- [Dashboard anterior 390](screenshots/before-dashboard-390.png)
- [Dashboard anterior 1280](screenshots/before-dashboard-1280.png)
- [Estudio anterior 390](screenshots/before-study-390.png)
- [Estudio anterior 1280](screenshots/before-study-1280.png)

Vista previa nueva, comparada con el ZIP:

- [Dashboard oscuro 1440](screenshots/final-dashboard-1440-dark.png)
- [Dashboard claro 1440](screenshots/final-dashboard-1440-light.png)
- [Dashboard móvil](screenshots/final-dashboard-390-dark.png)
- [Estudio oscuro 1440](screenshots/final-study-1440-dark.png)
- [Estudio claro 1440](screenshots/final-study-1440-light.png)
- [Estudio móvil](screenshots/final-study-390-dark.png)

También se generaron capturas a 1280 y en móvil claro; CI guarda las doce capturas
de dashboard/estudio junto al build de revisión como artefacto de la ejecución.

## Alcance de lo comprobado

La fase 1 no valida integración real de los cambios futuros: sincronización de
anotaciones, migraciones, lector de pantalla manual, Firefox/Safari, renderizado
de los diez formatos, fuentes de laboratorio, visor de figuras, timer ni cobertura
editorial. Son tareas explícitas de las fases 2–5, no funciones conectadas en esta
muestra. Las pruebas de producción se refieren al arnés de la aplicación existente,
no a una cuenta real o al sitio desplegado. No se publica un nuevo despliegue con
esta entrega.
