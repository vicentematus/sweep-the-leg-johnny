# Challenge HeyMark

## Uso del CLI

Antes de correr el compactador, copiar el ejemplo de env y completar la API key:

```bash
cd src
cp .env.example .env
```

En `src/.env`, completar:

```bash
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5
PRESERVED_TAIL_MESSAGES=8
INCLUDE_SYSTEM_PROMPT=true
```

Instalar dependencias:

```bash
bun install
```

Correr el compactador:

```bash
bun run compact -- --conversation analytics-deep-01 --output out/analytics-deep-01.json
```

Revisar la carpeta src/out y ver como quedaria un JSON con la informacion resumida.

## Desarrollo

El problema es decidir que conservar en un chat de HeyMark. Para eso lo que hice fue pedirle a Codex que revisara el dataset que entregaba el challenge y me diera un overview. Revisé algunas cosas a manos del JSON, y entendí de a poco el contexto del chat. (ver prompts 01 - investigation and research)

En base a eso le pedí a Codex que me generara un [HEURISTICS.md](prompts/HEURISTICS.md) de que es lo importante en base a los patrones que el encontró y el [schema.md](dataset/schema.md). También que tomará en cuenta los [bad_summaries.jsonl](dataset/bad_summaries.jsonl) para saber que está mal.

Una vez con el [HEURISTICS.md](prompts/HEURISTICS.md) listo (saber que heuristicas son importantes, cuales tools hay que conservar) entonces puedo partir con que compactar. Para esto le pedí a Codex que revisara el repositorio de Codex, y la documentación de Claude, complementado con [schema.md](dataset/schema.md) que tiene el apartado de Lectura recomendadas.

En base a la investigación decidí que implementara ideas de Claude y Codex de que compactar. Por ejemplo, que revisara a nivel de código el [compact.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact.rs) de Codex para que tuviera ideas de implementación.

Estrategias clasicas cómo resumir el output de una tool (que no tenga literalmente todo el resultado). Limpiar las primeras entries de la conversacion, las palabras que no signifcan nada, etc.

Una vez que el compactor realiza toda esta limpieza, le decimos al LLM que genere un resumen para que otro LLM lo lea. No algo human-readable. Solo que guarde la informacion precisa (los ids de Heymark, etc.). Codex lo define como un "handoff summary". Literalmente algo como:

```markdown
Client: Renata Cossío, Clínica VivaSalud, Rancagua.
  Connected account: @clinica, 20 posts, ~1.2K followers.
  Goal: use Instagram as acquisition channel, through authority + trust.
  Decision: create an 8-slide carousel about dental whitening.
  Selected style: white minimal healthtech, no people.
  Active creative: 2b4b5ad9.
  Current status: slide 1 generated; slides 2-8 still pending.
  Critical metrics: video posts outperform images; top post ER 4.87%.
```

Para que asi otro LLM, o la continuacion del chat lo pueda leer. Si corres el CLI, puedes revisar la carpeta [src/out](src/out) y ver como quedaria un JSON con la informacion precisa.

## Observaciones

- Para verificar que el LLM compacto correctamente, existe el [evals.ts](src/evals.ts) que es "deterministico" (regex, pattern matching). Lo deje así por temas de scope. Una versión mejorada de este sería quizas simplemente pasarselo a otro LLM y que decida si la compactación es correcta o no. Quizás este es el approach correcto. Pero no lo refactorize por temas de tiempo. ([https://vercel.com/kb/guide/an-introduction-to-evals](https://vercel.com/kb/guide/an-introduction-to-evals))

### Qué se conserva

(Esto lo escribio un LLM) Se conserva información que puede cambiar la siguiente acción de Mark:

- identidad del cliente / negocio
- objetivo actual
- restricciones de marca
- decisiones tomadas
- opciones rechazadas
- IDs de assets / creatives / videos / scripts
- resultados importantes de tools
- métricas relevantes
- estado pendiente

### Qué se descarta o resume

Se descarta o resume información que no cambia la continuación de la tarea:

- saludos
- confirmaciones repetidas
- payloads largos de tools
- resultados intermedios
- opciones descartadas sin impacto
- detalles duplicados
