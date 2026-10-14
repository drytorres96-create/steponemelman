# Acuerdo de trabajo de StepOneMelman

- UI en español; preguntas y contenido médico en inglés. Examen: 21-dic-2026.
- Actualización aprobada el 14-oct-2026 para la reedición My Q Bank: controles
  nuevos en inglés como los ZIP; explicaciones, mecanismos y drills nuevos en
  español; enunciados y opciones NBME en inglés. Fase 1 autorizada: tokens,
  componentes, vista previa aislada y contratos. Entrada `preview/myqbank/`,
  datos sintéticos, sin conectar progreso ni publicar cambios de base.
  El dashboard futuro integra Progreso y un constructor NBME / Mehlman Concepts /
  Mixed; Settings conserva metas y cálculos. Biblioteca se retira en la fase 3,
  no de los recorridos de producción durante esta fase. Ver `docs/myqbank-phase-1/`.
- Mejorar lo existente; no reconstruir. Melman consolida; AMBOSS y simulacros miden.
- React 18, Vite 6, TypeScript; Workers Static Assets y API en `src/server/worker.ts`.
- Worker incluye NBME, explicación y proxy del plan; revisar rutas reales.
- `AI`, `COACH` (StudyCoach) y `AI_FREE_ENABLED`: conservar la validación literal
  de la fuente y el presupuesto gratuito. El usuario autorizó el 7-oct-2026 ampliar
  la capacidad de recuperación y valorar modelos mejores dentro de ese presupuesto.
  Recuperación puede usar el 85 % de los 8500 útiles; explicación mantiene el 70 %.
  Conservar el contador v=2, reserva del 15 %, tope individual y ausencia de pago.
- Supabase vigente: `rcwvwxchpukjbtqsrxfi`, compartido con step1-lessons.
- Material privado: `corpus_assets`, `nbme_assets`; nunca copiarlo al repo/public.
- Progreso: `study_state`, `nbme_state` con CHECK, revision y generation;
  RPC: `sync_study_state`, `sync_nbme_state`, `reset_study_state`.
- Otras tablas: `weekly_sessions`, `ai_vignettes`, `app_members`, `nbme_members`.
- Verificar corpus/banco mediante código: las cifras de producción no se presuponen.
- Preservar techoHorizonte, registro, diagnosticoSync, descartes con lápidas,
  esVersionLegible y CRITERIOS_HEREDADOS; no reimplementar sin leerlos.

## Límites y autorización vigente

- Actualización posterior del 14-oct-2026: MyQBank conserva controles y preguntas
  NBME en inglés y explicaciones, mecanismos y drills nuevos en español. El usuario
  confirmó conservar el encargo español de Claude después de compartir la lista de
  diseño; esa confirmación sustituye el punto de contenido todo en inglés.
  Desktop sin scroll de página, con scroll interno cuando sea necesario. Labs antes
  de responder a la derecha, después debajo de la viñeta a la izquierda. Ocultar IDs
  y etiquetas; resaltado directo al seleccionar y borrado al volver a seleccionar
  o hacer clic. Tutor/Test puede cambiar durante estudio creando otro bloque sin
  alterar el anterior. Una pasada visual agrupada en cinco ajustes y revisión móvil
  y escritorio; conservar el tema claro y paleta carbón/jade/bosque/coral oscura.

- El 14-oct-2026 el usuario autorizó comenzar la fase 5: cobertura editorial,
  validación y publicación. Autorizó una segunda revisión por otro agente para
  cada ítem, con fuentes y registro explícito como revisión por IA, sin atribuir
  aprobación médica humana. Conservar la revisión independiente por ID y texto
  exacto, los originales y el historial; no aprobar ítems con observaciones sin
  resolver. La activación general requiere las comprobaciones de producto.

- El 14-oct-2026 el usuario amplió el encargo a Claude Code para toda la redacción
  editorial pendiente de NBME y Mehlman, variantes, fuentes, figuras y propuestas
  de corrección. Codex conserva software, diseño, revisión independiente final,
  integración y publicación. La asignación privada vigente está en `corpus_assets`,
  `audits/myqbank/2026-10-14/claude-full/assignment.json`; sustituye al encargo de
  100 NBME y preserva los 18 textos exactos del piloto revisados por IA. Consultar
  esa asignación y las entregas antes de duplicar trabajo editorial. Preparar el
  encargo no significa que Claude ya haya comenzado o que los textos estén publicados.

- El 14-oct-2026 el usuario autorizó corregir la fase 1 e implementar las fases
  2, 3 y 4 consecutivamente. Esa autorización incluye sesiones persistentes,
  migración privada de anotaciones, dashboard real y estudio adaptativo con
  piloto editorial complementario. Sustituye los límites de sólo lectura para
  ese alcance. Mantener originales, historial, RPC y la aplicación compartida;
  la cobertura completa y activación general de producción pertenecen a fase 5.

- Los límites de sólo lectura siguientes pertenecían a la auditoría inicial. La petición
  explícita del 7-oct-2026 autoriza simplificar la UI, corregir la selección de Hoy y
  reparar/integrar los 191 conceptos en cuarentena. La petición posterior del mismo
  usuario autoriza corregir la generación de recuperación NBME con Workers AI y
  eliminar el aviso «Esta pregunta incluye una figura» y los enlaces «Ir a la figura»
  / «Ir a las respuestas». Conservar la imagen, su ampliación y los controles de carga.
  Esa autorización afecta al flujo y presentación del jugador; no autoriza cambiar
  preguntas, letras, revisiones ni contenido del banco NBME, `step1-lessons` o el
  historial de progreso. No pedir de nuevo autorización ya dada ni restaurar el aviso.

- No escribir en ninguna base, ni mediante scripts, datos, RPC o migraciones.
- No crear migraciones. Los cambios de esquema van como propuestas en auditoría.
- No tocar `step1-lessons`, corpus, preguntas, revisiones o bankVersion.
- No reordenar/re-etiquetar letras NBME: los intentos guardados dependen de ellas.
- Todo estado existente debe cargar; campos nuevos opcionales con defaults.
- No cambiar firmas/nombres RPC ni reescribir historial de intentos.
- Sin service_role, secretos o archivos .env; no inspeccionar credenciales.
- No añadir `/* /index.html 200` a `_redirects`.
- Plan sólo lectura: lunes a sábado, dia 0/1–6/NULL, hasta tres prioridades/día.
- Selección de conceptos idéntica: fijar primero IDs con corpus/estado sintéticos.
- Repartir repasos finales exige determinismo, tope y vencimiento ≤20-dic.
- Cambiar evaluación exige subir EVALUADOR_VERSION y pruebas de compatibilidad.
- Techo finito, cierre visible, recuperación/discriminación, sin culpa por atraso.
- Usar tokens existentes, 44px táctiles, foco, movimiento reducido y safe-area.

## Revisión privada del material para agentes

- La calidad editorial se conserva en Supabase, sin panel de auditoría en la aplicación.
  Leer `docs/material-privado-agentes.md` antes de analizar o modificar el corpus.
- En `corpus_assets`, consultar directamente los archivos
  `audits/quarantine/2026-10-07/original.json`, `review-decisions.json` y
  `release-manifest.json` bajo el mismo prefijo. No enumerarlos en el índice ni la UI.
- Un concepto corregido conserva ID y `source` original. Su evidencia docente se guarda
  en `revision_editorial.fundamento`, con referencias verificadas; la IA cita esa
  evidencia, nunca el fragmento original que contenía un error. Una revisión antigua
  sin fundamento sigue bloqueada para IA.
- Antes de publicar: resolver cada motivo, revisar médicamente la propuesta y la
  evaluación, obtener revisión independiente por ID, validar el corpus completo y
  usar publicación atómica con CAS. No aprobar en bloque por confianza automática.
- Viñetas (piloto), Plan diario clásico y Auditoría se retiraron de la UI. Conservar
  registros históricos; no recrear esas pantallas. Las reglas de progreso van en FAQ
  de Ajustes, mientras Hoy y Progreso muestran resultados y acciones actuales.

## Lotes y publicación

- Etiquetar hallazgos/cambios: coach, neurocognición/ADHD, productividad,
  diseño web o revisor adversarial. Cada propuesta docente cita su principio.
- Auditoría: `docs/auditoria-2026-10/AUDITORIA.md`; riesgos altos como propuestas.
- Lote 0 de instrucciones; como máximo seis lotes de mejora acotados.
- Commit: `lote N · <qué cambia para Yoel>`; revisión adversarial de cada diff.
- Puertas: npm ci; npm test (≥575 aprobadas + nuevas, dos omisiones esperadas);
  npm run build; capturas antes/después a 390 y 1280px de pantallas tocadas.
- Comportamientos nuevos requieren pruebas; persistencia exige ambos estados fixture.
- PR contra main actualizado; CI verde sobre HEAD y merge sin conflictos.
- La autorización del usuario permite fusionar lotes verdes sin reconfirmar.
- Push/main dispara Cloudflare. Si no hay acceso, dejar PR preparado y explicarlo.
- Nunca publicar rojo, saltar pruebas o reescribir historia ajena.
