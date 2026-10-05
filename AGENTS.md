# Acuerdo de trabajo de StepOneMelman

- UI en español; preguntas y contenido médico en inglés. Examen: 21-dic-2026.
- Mejorar lo existente; no reconstruir. Melman consolida; AMBOSS y simulacros miden.
- React 18, Vite 6, TypeScript; Workers Static Assets y API en `src/server/worker.ts`.
- Worker incluye NBME, explicación y proxy del plan; revisar rutas reales.
- `AI`, `COACH` (StudyCoach) y `AI_FREE_ENABLED`: no subir cuotas ni relajar
  la validación de evidencia literal de la fuente.
- Supabase vigente: `rcwvwxchpukjbtqsrxfi`, compartido con step1-lessons.
- Material privado: `corpus_assets`, `nbme_assets`; nunca copiarlo al repo/public.
- Progreso: `study_state`, `nbme_state` con CHECK, revision y generation;
  RPC: `sync_study_state`, `sync_nbme_state`, `reset_study_state`.
- Otras tablas: `weekly_sessions`, `ai_vignettes`, `app_members`, `nbme_members`.
- Verificar corpus/banco mediante código: las cifras de producción no se presuponen.
- Preservar techoHorizonte, registro, diagnosticoSync, descartes con lápidas,
  esVersionLegible y CRITERIOS_HEREDADOS; no reimplementar sin leerlos.

## Límites de esta auditoría

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
