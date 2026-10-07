import type { ReactNode } from 'react'
import { DESCUENTO_POR_FALLO, type CriteriosDominio } from '../srs/mastery'
import { INICIO_DIA_HORA, TECHOS } from '../lib/dia'
import { DIAS_META, DIAS_PARA_PROYECTAR, META_CONCEPTOS, META_PREGUNTAS, RETRASO_DOMINIO, fechaDelDia } from '../lib/meta'
import { ZONA_ESTUDIO } from '../lib/calendario-estudio'
import './preguntas-frecuentes.css'

function Pregunta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <details className="faq-pregunta"><summary>{titulo}</summary><div className="faq-respuesta pila">{children}</div></details>
}

const fecha = (dia: number) => fechaDelDia(dia).toLocaleDateString('es', { day: 'numeric', month: 'long', timeZone: ZONA_ESTUDIO })

/** Consulta las reglas guardadas; editar un borrador de Ajustes no cambia esta explicación. */
export function PreguntasFrecuentes({ criterios }: { criterios: CriteriosDominio }) {
  return <section id="preguntas-frecuentes" className="faq pila" aria-labelledby="faq-titulo">
    <h2 id="faq-titulo">Preguntas frecuentes</h2>

    <section className="tarjeta faq-grupo" aria-labelledby="faq-aprendizaje">
      <h3 id="faq-aprendizaje">Dominio y aprendizaje</h3>
      <Pregunta titulo="¿Qué diferencia hay entre visto, práctica y dominio?">
        <p>Un concepto cuenta como visto cuando se presenta para estudiarlo. Una recomendación en una lista no lo cuenta.
          Responderlo registra práctica; acertar una vez todavía no demuestra dominio.</p>
        <p>Cada concepto conserva un solo historial, entres por Hoy, la meta, la Biblioteca o una pregunta NBME.
          Las respuestas de todas esas rutas aportan a los mismos criterios y al mismo calendario de repaso.</p>
      </Pregunta>
      <Pregunta titulo="¿Qué necesito para demostrar dominio?">
        <p>Tus criterios guardados exigen {criterios.recuperaciones} {criterios.recuperaciones === 1 ? 'respuesta independiente correcta' : 'respuestas independientes correctas'}
          {' '}en {criterios.sesiones} {criterios.sesiones === 1 ? 'sesión' : 'sesiones distintas'}.
          {criterios.sesiones < 2 ? ' Con una sola sesión no se exige separación temporal.'
            : criterios.separacionHoras === 0 ? ' No se exige separación temporal.'
              : ` Deben pasar al menos ${criterios.separacionHoras} horas entre el primer y el último acierto vigente.`}</p>
        <p>Una respuesta independiente se obtiene sin pistas, sin consultar la fuente y sin ver antes la explicación.
          {criterios.exigirSinPistas && ' También está activada la exigencia de al menos una respuesta sin pistas.'}
          {criterios.exigirRecuperacionActiva && ' Además, al menos una debe ser un recuerdo sin alternativas o una aplicación clínica independiente.'}</p>
        {criterios.exigirRecuperacionActiva && <p>Cuando un mecanismo necesita una respuesta extensa, se practica con opciones. Si ya lo respondiste y todavía falta evidencia activa,
          una nueva práctica puede ofrecer su caso de aplicación revisado. Conserva el mismo historial del concepto;
          una sesión que retomas conserva la pregunta que tenía guardada.</p>}
        <p>{criterios.ventanaConfusionDias > 0
          ? `Una confusión entre conceptos bloquea la acreditación durante ${criterios.ventanaConfusionDias} días.`
          : 'No hay una ventana de bloqueo por confusiones activada.'}
          {' '}La retención estimada orienta el repaso; no añade un requisito de acreditación.</p>
      </Pregunta>
      <Pregunta titulo="¿Por qué puede bajar el dominio o quedar un repaso pendiente?">
        <p>Un fallo descuenta {DESCUENTO_POR_FALLO} aciertos de la evidencia vigente. Una confusión reciente también puede impedir acreditar el dominio.
          El historial y el primer hito se conservan.</p>
        <p>Un repaso vencido cambia el mantenimiento, sin borrar la evidencia de dominio. Si falta una fecha de revisión verificable, aparece como mantenimiento por comprobar.
          Al terminar un bloqueo por confusión, la evidencia suficiente vuelve a ser válida, sin añadir respuestas ni inventar una acreditación.</p>
      </Pregunta>
      <Pregunta titulo="¿Qué cambia al editar los criterios?">
        <p>Los valores del formulario son un borrador hasta pulsar «Aplicar criterios». Se guardan juntos y recalculan el dominio vigente.
          Tus intentos y los hitos anteriores se conservan. «Restaurar valores recomendados» prepara un borrador que también debes aplicar.</p>
      </Pregunta>
    </section>

    <section className="tarjeta faq-grupo" aria-labelledby="faq-meta">
      <h3 id="faq-meta">Meta y círculos</h3>
      <Pregunta titulo="¿Qué hace avanzar las líneas de la meta?">
        <p>La meta abarca {DIAS_META} días, del {fecha(1)} al {fecha(DIAS_META)}, con un objetivo de {META_CONCEPTOS} conceptos y {META_PREGUNTAS} preguntas NBME.
          Se ajusta sólo si el material disponible no alcanza para cumplirla.</p>
        <p>La marca de lo previsto avanza al empezar el día de estudio, a las {String(INICIO_DIA_HORA).padStart(2, '0')}:00 de Nueva York.
          Sigue los techos de Hoy, con viernes libre y el doble el fin de semana. La línea de conceptos incluye {RETRASO_DOMINIO} días como margen de planificación;
          acreditar dominio depende de tus criterios, no de esperar ese margen.</p>
        <p>Tu avance de conceptos cuenta los primeros dominios con fecha verificable dentro de la ventana que siguen cumpliendo los criterios actuales.
          Repetir un concepto o recuperar uno acreditado antes de la ventana no lo suma como nuevo. Un fallo, una confusión o un cambio de criterios puede reducir la cifra;
          un repaso vencido cambia el mantenimiento.</p>
        <p>Cada pregunta NBME publicada cuenta una vez, con su primera respuesta, correcta o incorrecta.
          Las correcciones, reintentos y ejercicios de IA no la suman de nuevo.</p>
      </Pregunta>
      <Pregunta titulo="¿Cómo se calculan las diferencias y la proyección?">
        <p>«Alcanzar» muestra lo que falta para igualar la marca visible. «Superar» pide una unidad más que esa marca.
          «Completar» compara con la meta final. Estas distancias son exactas aunque el mensaje de rumbo use un margen de planificación.</p>
        <p>La proyección aparece después de {DIAS_PARA_PROYECTAR} días cerrados y usa el ritmo de la última semana completa.
          Es una estimación. «Ponerme al día» elige trabajo disponible de Hoy y respeta sus techos y los intervalos de repaso.</p>
      </Pregunta>
      <Pregunta titulo="¿Qué muestran los círculos?">
        <p>En Hoy, el círculo interior muestra el trabajo diario y el exterior el dominio del tema de la semana.
          Una respuesta fallada cuenta como trabajo, pero no como dominio.</p>
        <p>En Progreso, el exterior muestra sesiones completadas del periodo; el medio, aciertos en primeras respuestas NBME;
          el interior, aciertos sin ayuda después de al menos 30 días desde el intento anterior.
          Cada círculo conserva su denominador: no se promedian ni estiman aprobación. Sin observaciones se muestra «Sin dato · n=0».</p>
        <p>El detalle distingue recuerdo sin alternativas, discriminación entre opciones y aplicación clínica.
          Para los errores repetidos compara con un fallo previo separado al menos 24 horas; una respuesta parcial cuenta como fallo.
          Se excluyen ayudas, revisiones y registros que no permiten comprobar las condiciones o la versión.</p>
        <p>La comprobación semanal registra respuestas sin ayuda separadas al menos 24 horas del intento anterior.
          Los hitos de dominio se validan con su fecha y tus criterios actuales.
          La adherencia y los temas cerrados describen lo hecho en el plan; no acreditan dominio. La asociación por tema usa el sistema o la disciplina principal del concepto.</p>
      </Pregunta>
    </section>

    <section className="tarjeta faq-grupo" aria-labelledby="faq-hoy">
      <h3 id="faq-hoy">Hoy y repasos</h3>
      <Pregunta titulo="¿Cómo se organiza Hoy?">
        <p>Cajas prioriza la consolidación y el mantenimiento; Nuevo viene después.
          Los tramos permiten estudiar una parte y continuar más tarde.</p>
        <p>Entre semana, los límites son {TECHOS.semana.conceptos} conceptos nuevos, {TECHOS.semana.preguntas} preguntas nuevas y {TECHOS.semana.cajas} repasos.
          El fin de semana son {TECHOS.finde.conceptos}, {TECHOS.finde.preguntas} y {TECHOS.finde.cajas}, respectivamente. El viernes es descanso.
          Los guiones de la semana tienen prioridad. Si faltan o se agotan, otros conceptos y preguntas publicados aún sin resolver completan las plazas.
          Los objetivos bajan si el material disponible no alcanza.</p>
      </Pregunta>
      <Pregunta titulo="¿Qué cuenta como nuevo y qué pasa al cerrar Hoy?">
        <p>Nuevo significa que aún no hay un primer intento resuelto. Haber visto un concepto no equivale a haberlo respondido.
          Las revisiones sin una respuesta resuelta no cuentan como nuevo completado.</p>
        <p>Los conceptos ya respondidos que todavía no dominas se consolidan mediante Cajas y sus intervalos.
          Al cerrar Hoy, la práctica queda guardada y la próxima visita calcula los repasos que correspondan.</p>
      </Pregunta>
      <Pregunta titulo="¿Qué muestra el índice del material?">
        <p>El índice reúne los módulos y los conceptos publicados. Las tablas cuentan áreas primarias y secundarias:
          un concepto puede aparecer en varias filas. Describen el material disponible y no un porcentaje de cobertura del examen.</p>
      </Pregunta>
    </section>

    <section className="tarjeta faq-grupo" aria-labelledby="faq-sesiones">
      <h3 id="faq-sesiones">Sesiones, IA y cuenta</h3>
      <Pregunta titulo="¿Cómo recupero una pregunta NBME fallada?">
        <p>Puedes estudiar los conceptos Melman relacionados o generar ejercicios breves con IA: completar, verdadero o falso y selección de respuesta.
          La práctica de IA se guarda para esa cuenta y dispositivo y utiliza el presupuesto de IA disponible. Comprueba sus explicaciones con el material.</p>
        <p>Los ejercicios de IA no acreditan dominio Melman. Los conceptos Melman que se presentan cuentan como vistos, y sus respuestas reales aportan al historial compartido.
          Al terminar puedes volver a la pregunta original o seguir con la siguiente del mismo bloque.</p>
        <p>Generar los ejercicios puede tardar hasta un minuto. El indicador de IA muestra el presupuesto contabilizado por esta aplicación;
          otras aplicaciones de la misma cuenta Cloudflare pueden consumir parte del saldo gratuito. La recuperación tiene prioridad sobre las explicaciones adicionales,
          y se conserva una reserva para corregir respuestas.</p>
      </Pregunta>
      <Pregunta titulo="¿Qué pasa con mis sesiones y su progreso?">
        <p>Retomar continúa la sesión pendiente. La práctica relacionada con un error NBME regresa al mismo bloque al terminar.
          Archivar una sesión la aparta de la lista y conserva sus respuestas y el progreso ya registrado.</p>
      </Pregunta>
      <Pregunta titulo="¿Cómo sincronizo o guardo una copia?">
        <p>Tu progreso se sincroniza con tu cuenta. Inicia sesión con el mismo correo en otro dispositivo para continuar.
          También puedes importar el progreso de la versión anterior o guardar una copia.</p>
        <p>La copia incluye los conceptos, las preguntas NBME, las sesiones de la semana y el plan de esta semana.
          Importar recupera los conceptos; lo demás vive en tu cuenta. Si no se pueden leer las sesiones o el plan al exportar, la copia incluye el progreso disponible.</p>
      </Pregunta>
    </section>
  </section>
}
