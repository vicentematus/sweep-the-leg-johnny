Las estrategias de compactacion de claude o codex eliminan principalmente las primeras entries de la conversacion.


Cosas innecesarias:
1. El output de las tools. Podemos hacer un summary de eso.

Al finaaal de todo hay un handoff summary para que otra LLM lo lea. Eso significa que le pasamos la informacion precisa para otro agente. No nos enfocamos en que sea legible para un humano, si no que sea tipo:

Pregunta: What happened in this conversation?

  A handoff state answers:

  > What must the next Mark know so it can continue without making a wrong move?

  So the summary is not trying to be elegant. It is trying to preserve operational
  state.

  For HeyMark, handoff state includes things like:

  Client: Renata Cossío, Clínica VivaSalud, Rancagua.
  Connected account: @clinicavivasalud.cl, 20 posts, ~1.2K followers.
  Goal: use Instagram as acquisition channel, through authority + trust.
  Decision: create an 8-slide carousel about dental whitening.
  Selected style: white minimal healthtech, no people.
  Active creative: 2b4b5ad9.
  Current status: slide 1 generated; slides 2-8 still pending.
  Critical metrics: video posts outperform images; top post ER 4.87%.

  That is handoff state because the next Mark can act from it.


#### Human Summary

A generic human summary might say:

Renata connected Instagram and discussed a content strategy for Clínica VivaSalud.
They analyzed performance and began creating a carousel about dental whitening.A




# Flow de compactacion


1. se le pasa todo el contexto del chat
2. ???
3. Limpiamos los outputs de las tools (summarizing?)
