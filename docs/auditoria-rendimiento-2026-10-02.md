# Auditoría de rendimiento web · 1.25.1

Mediciones realizadas el 2 de octubre de 2026, hora de Nueva York. El objetivo es
reducir la carga inicial y el trabajo que se acumula al usar StepOneMelman.

## Hallazgos y reparación

| Comprobación local | Antes | Después |
|---|---:|---:|
| JavaScript descargado al abrir el acceso | 756 kB | 537 kB |
| JavaScript inicial comprimido con gzip | 219 kB | 155 kB |
| Fondos montados tras visitar cinco vistas | 4 | 2 como máximo |
| Fondos invisibles con animación activa | 3 | 0 |
| Conexiones IndexedDB en 102 operaciones | 102 | 1 |

Los tamaños son decimales y corresponden al build de producción, sin incluir CSS,
imágenes ni datos privados. La reducción del JavaScript de acceso es del 29 %.
Tras verificar la cuenta se descarga también el módulo App, de unos 78 kB; las
pantallas secundarias y los reproductores se piden al abrirlos. El ahorro en el
acceso no equivale a una mejora del 29 % en el tiempo total de estudio.

La compilación forzaba todos los imports dinámicos a un único archivo. Ahora el
acceso y las pantallas tienen carga diferida, un estado de espera y el resguardo
existente para recuperar una descarga fallida. Los providers siguen montados al
cambiar de vista y las sesiones mantienen su identidad.

El paisaje retenía todas las imágenes visitadas y animaba las transparentes.
Ahora conserva la escena activa y la entrante, mantiene el fundido, oculta la
anterior al terminarlo y pausa su animación. El fondo se pausa también durante
el estudio y cuando la pestaña está oculta.

Cada lectura y escritura abría una conexión a IndexedDB sin cerrarla. Se comparte
la apertura, incluso entre operaciones concurrentes. La conexión se libera ante
un cambio de versión desde otra pestaña y se invalida ante un cierre inesperado.
Una apertura fallida puede reintentarse; una apertura bloqueada que llega tarde
se cierra. Se conservan el respaldo local y los errores de persistencia estricta.

## Áreas revisadas

- Entorno cloud: cuota de CPU de 2 núcleos, límite de memoria de 8 GiB, disco con
  aproximadamente 30 GB libres, sin errores OOM ni presión de disco observada.
  La muestra en reposo mostró entre 97 y 99 % de CPU ociosa. El entorno era nuevo;
  esto no describe el servidor de producción ni el equipo del estudiante.
- Herramientas y Git: arranque de shell de milisegundos, repositorios limpios al
  inicio y Git sin acumulación de objetos sueltos. No había contenedores ni
  cachés grandes que justificaran limpieza.
- Runtime: el entorno traía Node 24 y el proyecto declara Node 22. La validación
  de esta reparación usa Node 22.23.3, instalado de forma aislada para la auditoría.
- Corpus: carga de módulos necesarios por identificador, deduplicación de cargas
  simultáneas y caché local separada por usuario y versión. Biblioteca y auditoría
  todavía cargan el corpus completo para filtrar o exportar; no se midió el coste
  con el material privado real.
- Sincronización: conserva deduplicación, espera de 650 ms tras cambios y consultas
  de revisión en segundo plano. No se cambian las reglas de guardado, conflictos,
  presupuesto diario, calificación ni selección de material.
- Consultas: los esquemas del repositorio declaran claves primarias para `path`
  y `user_id`, usados en las lecturas del corpus y del progreso. Esta revisión no
  confirma índices ni planes de ejecución en la base desplegada.
- Presentación: imágenes responsive WebP, fuentes propias y listas paginadas o
  limitadas. Permanecen desenfoques y animaciones del paisaje visible; no se
  atribuye una tasa de cuadros concreta sin medir el dispositivo real.
- Corrección y ayudas de IA: una respuesta de texto libre espera el corrector
  remoto antes de registrar su veredicto. El cliente tiene un límite de 15 s para
  esa petición, de 30 s para el chat y de 35 s para el ejemplo de examen. Son
  candidatos a explicar esperas durante el estudio, pero no se midieron sus
  tiempos reales. Cambiar el evaluador o registrar antes su respuesta alteraría
  la calificación; esta reparación conserva ese contrato.

## Verificación y límites

Se usan Chromium real y el arnés existente con datos sintéticos, sin cuenta ni
corpus privado. Las pruebas de navegador cubren estudio por teclado, preguntas,
continuidad de la sesión, navegación con una descarga fallida, pausa de fondos,
conexión compartida y actualización de IndexedDB desde otra pestaña. Las pruebas
unitarias existentes de navegación y exportación esperan ahora los imports
diferidos antes de comprobar su pantalla, conservando sus aserciones.

La validación incluye `npm ci`, `npm test` y `npm run build` con Node 22, y las
pruebas de Playwright con `/usr/bin/chromium`. Las dos pruebas unitarias omitidas
ya pertenecían al proyecto. El build conserva un aviso de tamaño de chunk para
el núcleo compartido de unos 537 kB; no se ha ocultado el aviso.

Resultado final: 61 archivos de pruebas unitarias pasan y uno conserva su
omisión; 571 pruebas pasan y dos conservan su omisión. Pasan las 11 pruebas de
navegador y la compilación de producción.

No se han medido LCP, INP, consultas autenticadas, latencia de Supabase ni tiempos
del Worker en producción. La política de red del entorno permite gestores de
paquetes y GitHub, pero no los destinos desplegados de Workers y Supabase. Las
pruebas locales no sustituyen esa medición. Para cerrar esa parte hace falta
comprobar el despliegue del nuevo commit y observar una sesión real, identificada
por la versión 1.25.1 en Cuenta y ajustes.
