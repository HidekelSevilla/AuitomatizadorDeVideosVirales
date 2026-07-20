## META
```yaml
STORY_PACKET_V7:
  handoff_version: "7.0"
  packet_status: PACKET_READY_V7
  packet_scope: PRODUCTION_PART
  series_id: heredero_del_enemigo_nacional
  part_number: 1
  approved_voice_id: narrador_es_mx_v7_pendiente
  language: es-MX
  target_runtime_seconds: 95
  runtime_range_seconds: [90, 100]
  provisional_title: "Heredero del Enemigo Nacional"
  genre: "fantasía urbana coreana, power fantasy, thriller de persecución estatal"
  tone: "oscuro, urgente, emocional"
  series_promise: "Un limpiador sin poder recibe la Firma del villano más odiado de Corea; cada victoria lo hace más fuerte, pero también deja que una orden inconclusa intente usar su cuerpo."
```

## MACHINE_LOCK_V7
monologue_sha256: 107916b8071f6ca6354eb4eb59097a040e3513d14d1e5e86690070e983ff82ec
character_count: 1585
```json
{
  "monologue_sha256": "107916b8071f6ca6354eb4eb59097a040e3513d14d1e5e86690070e983ff82ec",
  "character_count": 1585,
  "voice_visual_lock": [
    {
      "atom_id": "A001",
      "text_exact": "El villano más vigilado de Corea murió a las dos y diecisiete.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "C_KWON_RYUGAK",
          "action": "dies under national containment",
          "result": "Kwon Ryu-gak is established as dead at 02:17",
          "required_visual_tokens": [
            "dead villain secured in containment",
            "02:17 time marker"
          ]
        }
      ],
      "must_show": [
        "dead villain secured in containment"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A002",
      "text_exact": "Un minuto después, yo limpiaba su sangre.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "C_MIN_JAEHA",
          "action": "cleans the aftermath",
          "result": "Jaeha is placed alone with the villain's blood",
          "required_visual_tokens": [
            "cleaner handling blood",
            "sealed morgue"
          ]
        }
      ],
      "must_show": [
        "cleaner handling blood"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A003",
      "text_exact": "Me llamo Min Jaeha: limpiador de morgue, cero rango, cero Veta.",
      "kind": "STATE",
      "claims": [
        {
          "actor_id": "C_MIN_JAEHA",
          "action": "identifies himself and his deficit",
          "result": "Jaeha is established as powerless and low status",
          "required_visual_tokens": [
            "cleaning license badge",
            "zero Veta status"
          ]
        }
      ],
      "must_show": [
        "cleaning license badge"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A004",
      "text_exact": "En Seúl, sin Veta nadie cruza una Fractura y vuelve entero.",
      "kind": "RULE",
      "claims": [
        {
          "actor_id": "WORLD_RULE",
          "action": "defines Fracture survival rule",
          "result": "the audience learns powerless people cannot survive Fractures",
          "required_visual_tokens": [
            "Fracture warning symbol",
            "Veta absence indicator"
          ]
        }
      ],
      "must_show": [
        "Fracture warning symbol"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A005",
      "text_exact": "Acepté el turno porque el hospital de mi hermana cortaría su oxígeno al amanecer.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "C_MIN_JAEHA",
          "action": "accepts dangerous shift for hospital debt",
          "result": "his motive is tied to his sister's oxygen deadline",
          "required_visual_tokens": [
            "hospital oxygen notice",
            "dawn deadline"
          ]
        }
      ],
      "must_show": [
        "hospital oxygen notice"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A006",
      "text_exact": "Kwon Ryu-gak debía estar muerto bajo tres juramentos de hierro.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "C_KWON_RYUGAK",
          "action": "lies sealed as a forbidden corpse",
          "result": "the corpse should be impossible to move",
          "required_visual_tokens": [
            "three iron oath seals",
            "sealed mortuary bag"
          ]
        }
      ],
      "must_show": [
        "three iron oath seals"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A007",
      "text_exact": "Pero abrió la bolsa mortuoria y me sujetó la muñeca.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "C_KWON_RYUGAK",
          "action": "breaks final death stillness and grabs Jaeha",
          "result": "contact between corpse and protagonist occurs",
          "required_visual_tokens": [
            "corpse hand gripping wrist",
            "mortuary bag opened"
          ]
        }
      ],
      "must_show": [
        "corpse hand gripping wrist"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A008",
      "text_exact": "No pidió auxilio; me clavó en la piel un recibo negro.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "C_KWON_RYUGAK",
          "action": "implants the black receipt into Jaeha's skin",
          "result": "the inheritance mark enters Jaeha's body",
          "required_visual_tokens": [
            "black receipt burning into wrist",
            "skin mark forming"
          ]
        }
      ],
      "must_show": [
        "black receipt burning into wrist"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A009",
      "text_exact": "Sus últimos labios dijeron: cobra lo que me deben.",
      "kind": "DIALOGUE",
      "claims": [
        {
          "actor_id": "C_KWON_RYUGAK",
          "action": "speaks a final command",
          "result": "the inherited power is tied to unpaid debts",
          "required_visual_tokens": [
            "dying lips speaking",
            "black receipt command"
          ]
        }
      ],
      "must_show": [
        "dying lips speaking"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A010",
      "text_exact": "Los sellos de la morgue quemaron mi nombre como heredero del enemigo nacional.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "MORGUE_SEALS",
          "action": "register Jaeha as enemy heir",
          "result": "institutional evidence frames Jaeha immediately",
          "required_visual_tokens": [
            "morgue seals burning Jaeha name",
            "enemy heir registry"
          ]
        }
      ],
      "must_show": [
        "morgue seals burning Jaeha name"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A011",
      "text_exact": "Corrí, y una costilla del cadáver parió una bestia de Fractura.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "E_FRACTURE_BEAST_RIB",
          "action": "emerges from the villain corpse",
          "result": "a direct threat is born from the transfer",
          "required_visual_tokens": [
            "rib-born Fracture beast",
            "corpse distortion"
          ]
        }
      ],
      "must_show": [
        "rib-born Fracture beast"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A012",
      "text_exact": "La criatura ignoró al muerto y saltó hacia mi marca.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "E_FRACTURE_BEAST_RIB",
          "action": "targets Jaeha's mark instead of the corpse",
          "result": "the mark becomes the creature's objective",
          "required_visual_tokens": [
            "beast leaping at wrist mark",
            "dead villain ignored"
          ]
        }
      ],
      "must_show": [
        "beast leaping at wrist mark"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A013",
      "text_exact": "Una voz en mi pulso dictó la regla: sobrevive al daño y cobra.",
      "kind": "RULE",
      "claims": [
        {
          "actor_id": "P_RECIBO_NEGRO",
          "action": "declares the activation rule",
          "result": "Jaeha learns survival through hostile damage enables collection",
          "required_visual_tokens": [
            "pulse voice rule",
            "survive and collect condition"
          ]
        }
      ],
      "must_show": [
        "pulse voice rule"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A014",
      "text_exact": "Dejé que la garra me atravesara porque no tenía otra moneda.",
      "kind": "DECISION",
      "claims": [
        {
          "actor_id": "C_MIN_JAEHA",
          "action": "chooses to take the wound",
          "result": "he pays the entry condition deliberately",
          "required_visual_tokens": [
            "claw piercing shoulder",
            "Jaeha choosing not to dodge"
          ]
        }
      ],
      "must_show": [
        "claw piercing shoulder"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A015",
      "text_exact": "El recibo ardió; una cadena negra salió de mi herida y rompió a la bestia.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "P_RECIBO_NEGRO",
          "action": "converts the wound into a chain strike",
          "result": "the inherited power defeats the beast",
          "required_visual_tokens": [
            "black chain from wound",
            "beast broken by chain"
          ]
        }
      ],
      "must_show": [
        "black chain from wound"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A016",
      "text_exact": "Por primera vez, una pantalla de rango subió para alguien marcado como cero.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "SYSTEM_RANK",
          "action": "updates a zero-ranked person",
          "result": "visible progression proves the power works",
          "required_visual_tokens": [
            "rank screen rising",
            "zero status changing"
          ]
        }
      ],
      "must_show": [
        "rank screen rising"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A017",
      "text_exact": "Saldo heredado: nivel uno, oxígeno pagado, control prestado.",
      "kind": "REVEAL",
      "claims": [
        {
          "actor_id": "P_ULTIMO_ACREEDOR",
          "action": "records level, oxygen payment, and borrowed control",
          "result": "progression, family relief, and cost are named together",
          "required_visual_tokens": [
            "level one inherited balance",
            "oxygen paid notice",
            "borrowed control warning"
          ]
        }
      ],
      "must_show": [
        "level one inherited balance",
        "oxygen paid notice"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A018",
      "text_exact": "El precio llegó de inmediato: mi brazo escribió una orden que yo no quería cumplir.",
      "kind": "COST",
      "claims": [
        {
          "actor_id": "P_ORDEN_PENDIENTE",
          "action": "takes Jaeha's arm to write an unwanted command",
          "result": "the first cost is loss of bodily control",
          "required_visual_tokens": [
            "arm moving against will",
            "unwanted command written"
          ]
        }
      ],
      "must_show": [
        "arm moving against will"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A019",
      "text_exact": "La orden decía: rompe la garganta del primer agente Hanse.",
      "kind": "REVEAL",
      "claims": [
        {
          "actor_id": "P_ORDEN_PENDIENTE",
          "action": "states a violent pending order",
          "result": "Jaeha understands the inherited power carries villain instructions",
          "required_visual_tokens": [
            "written order to kill Hanse agent",
            "violent command text"
          ]
        }
      ],
      "must_show": [
        "written order to kill Hanse agent"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A020",
      "text_exact": "Apreté mi propia muñeca contra la camilla hasta sangrar para no obedecer.",
      "kind": "DECISION",
      "claims": [
        {
          "actor_id": "C_MIN_JAEHA",
          "action": "injures and pins his own wrist to resist obedience",
          "result": "he proves he does not want to become the villain",
          "required_visual_tokens": [
            "wrist crushed against gurney",
            "blood from self-restraint"
          ]
        }
      ],
      "must_show": [
        "wrist crushed against gurney"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A021",
      "text_exact": "Los cazadores entraron y no encontraron al villano.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "F_CAZADORES_HANSE",
          "action": "arrive after the fight",
          "result": "official hunters enter the aftermath and miss the corpse",
          "required_visual_tokens": [
            "hunters entering sealed morgue",
            "empty villain table"
          ]
        }
      ],
      "must_show": [
        "hunters entering sealed morgue"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A022",
      "text_exact": "Encontraron su Firma negra moviéndose en mi cuerpo y sangre de bestia a mis pies.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "F_CAZADORES_HANSE",
          "action": "find Kwon's signature operating through Jaeha",
          "result": "evidence points to Jaeha as the villain's new body",
          "required_visual_tokens": [
            "black signature moving in Jaeha body",
            "dead beast at feet"
          ]
        }
      ],
      "must_show": [
        "black signature moving in Jaeha body"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A023",
      "text_exact": "La capitana Yun Sera transmitió mi rostro: para el Estado, yo ya era Kwon Ryu-gak.",
      "kind": "EVENT",
      "claims": [
        {
          "actor_id": "C_YUN_SERA",
          "action": "broadcasts Jaeha as equivalent to Kwon",
          "result": "the State publicly marks him as the enemy national successor",
          "required_visual_tokens": [
            "captain broadcasting Jaeha face",
            "state classification as Kwon Ryu-gak"
          ]
        }
      ],
      "must_show": [
        "captain broadcasting Jaeha face"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    },
    {
      "atom_id": "A024",
      "text_exact": "Entonces mi muñeca susurró: no heredaste mi poder; heredaste mis órdenes pendientes.",
      "kind": "REVEAL",
      "claims": [
        {
          "actor_id": "P_ULTIMO_ACREEDOR",
          "action": "reveals the inheritance includes pending orders",
          "result": "the cliffhanger reframes the power as an unfinished villain agenda",
          "required_visual_tokens": [
            "whispering wrist mark",
            "pending orders revelation"
          ]
        }
      ],
      "must_show": [
        "whispering wrist mark"
      ],
      "offscreen_policy": {
        "mode": "FORBIDDEN",
        "allowed_ids": [],
        "reason": "la línea fija un hecho causal que debe ser inequívoco"
      }
    }
  ]
}
```

## PREMISA_COMERCIAL
```yaml
narrative_dna:
  logline: "Un limpiador sin Veta hereda el poder del peor villano de Corea cuando su cadáver lo marca; cada cobro sube su nivel, pero activa una orden pendiente que intenta mover su cuerpo contra su voluntad."
  contradiction: "El único que no quiere ser malo porta la Firma que el Estado reconoce como el enemigo nacional."
  desire: "Jaeha quiere salvar el oxígeno de Hana, controlar el poder y demostrar que no es la continuación moral de Kwon Ryu-gak."
  wound_or_lie: "Cree que nacer sin Veta significa que solo puede limpiar desastres ajenos, nunca decidir el curso de uno."
  transformation_from: "Limpiador endeudado que sobrevive obedeciendo puertas cerradas."
  transformation_to: "Portador perseguido que aprende a convertir una herencia criminal en juicio propio sin ceder su cuerpo."
  advantage_rule: "Sobrevivir daño hostil genera un Recibo Negro que puede cobrarse como fuerza, cadena o anulación breve proporcional al daño recibido."
  cost_or_constraint: "Cada cobro libera una orden inconclusa de Kwon que intenta ejecutar una acción violenta usando una parte del cuerpo de Jaeha; resistirla exige dolor, inmovilización o renunciar al impulso del poder."
  antagonist_agency: "La Agencia Hanse, Yun Sera y las órdenes pendientes de Kwon presionan a Jaeha desde ley, fuerza pública y control corporal."
  serial_arena: "Fracturas urbanas, morgues de contención, rangos Hanse, cacería nacional y lista de órdenes criminales aún activas."
  pleasure_primary: "Power fantasy con progresión visible y regla de deuda."
  pleasure_secondary: "Thriller de identidad: demostrar que portar la Firma del villano no equivale a ser el villano."
  voice_signature: "Primera persona urgente, culpa íntima, frases de deuda, control y persecución."
  signature_symbol: "Un recibo negro quemado en la muñeca que late como sello, contador y grillete."
  serial_question: "¿Puede Jaeha dominar un poder que el Estado ve como prueba de maldad antes de que una orden pendiente lo haga culpable de verdad?"
  anti_clone_test: "Identidad propia por rol de limpiador de morgue, poder contable de daño, precio de control corporal, persecución estatal por Firma energética, símbolo del recibo y villano muerto como agenda residual."
  anti_clone_distinct_axes: [role, desire, rule, cost, arena, symbol]
  primary_promise_id: PROMISE_P1_MAIN
```

## CANON_NECESARIO
### Canon inmutable de la serie

- La historia ocurre en una Corea contemporánea donde las Fracturas abren zonas de caza y contaminación energética dentro de ciudades reales.
- La Veta es la capacidad medible de soportar energía de Fractura. La Agencia Hanse registra Veta, rango operativo, Firma energética y permisos de caza.
- Min Jaeha tiene Veta cero funcional: puede trabajar en limpieza de contención, pero no puede portar licencia de cazador ni cruzar Fracturas legalmente.
- Kwon Ryu-gak fue el enemigo nacional número uno. La versión pública dice que asesinó cazadores, saqueó Fracturas y usó deudas criminales para controlar distritos completos.
- El poder heredado se llama Último Acreedor. Su manifestación física inicial es el Recibo Negro marcado en la muñeca de Jaeha.
- Regla de ventaja: cuando Jaeha recibe daño hostil real y sobrevive, el Recibo Negro registra una deuda que puede cobrarse como cadena, impulso o anulación breve proporcional al daño recibido.
- Límite de entrenamiento: el sistema no registra autolesiones, simulacros ni daño consentido sin amenaza real.
- Precio activo: cada cobro libera una orden inconclusa de Kwon. La orden intenta mover una parte del cuerpo de Jaeha para ejecutar violencia útil a la agenda vieja del villano.
- Resistencia al precio: Jaeha puede retrasar o romper una orden solo si inmoviliza el miembro tomado, se causa dolor suficiente para interrumpir el impulso o rechaza el saldo antes de cobrarlo.
- Progresión visible: Saldo Heredado sube por deudas cobradas contra amenazas más fuertes. Parte 1 termina en nivel uno.
- Riesgo social: el Recibo Negro emite la Firma negra de Kwon; los sensores de Hanse y las transmisiones oficiales interpretan esa Firma como continuidad operativa del villano, sin leer intención moral.
- Secreto del mundo, solo sembrado: la palabra "juicio" implica que el poder no nació como herramienta criminal, sino como auditoría de deudas que alguien convirtió en arma.
- La voz en la muñeca no es Kwon completo; es un eco contractual hecho de órdenes pendientes, prioridades rotas y reflejos de mando.

### Personajes y entidades

- C_MIN_JAEHA:
    nombre: Min Jaeha
    rol: protagonista, limpiador nocturno de Morgue Raíz
    edad: 24
    deseo: pagar el oxígeno de su hermana y demostrar que no es el sucesor moral de Kwon
    necesidad: aprender límites físicos y morales antes de que el poder use su cuerpo
    miedo: herir a un inocente mientras todos ya lo llaman villano
    secreto: mintió al hospital sobre tener un adelanto de sueldo que todavía no existía
    estado_inicial: sin Veta, endeudado, fuera de los rangos heroicos
    estado_salida_p1: portador nivel uno, hombro herido, muñeca dañada por resistirse, cazado por Hanse y por la nación
- C_MIN_HANA:
    nombre: Min Hana
    rol: hermana menor hospitalizada
    edad: 17
    deseo: volver a respirar sin máquina y que Jaeha deje de sacrificarse
    necesidad: conservar agencia aunque sea usada como lastre emocional
    miedo: que su hermano desaparezca en trabajos de contención
    secreto: sabe más de las Fracturas de lo que Jaeha cree por escuchar a pacientes cazadores
    estado_inicial: dependiente de oxígeno fiado
    estado_salida_p1: oxígeno pagado por una ventana breve; sigue vulnerable si Jaeha no consigue dinero limpio
- C_KWON_RYUGAK:
    nombre: Kwon Ryu-gak
    rol: villano muerto y origen de la herencia
    edad: 41 al morir
    deseo_publico: desconocido para la población
    necesidad_dramatica: funcionar como espejo de lo que Jaeha podría parecer aunque no lo sea
    miedo: no declarado en Parte 1
    secreto: dejó órdenes pendientes dentro del poder antes de morir
    estado_inicial: cadáver sellado por Hanse
    estado_salida_p1: cuerpo ausente como agente activo; Firma negra reactivada en Jaeha
- C_YUN_SERA:
    nombre: Yun Sera
    rol: capitana de respuesta de la Agencia Hanse
    edad: 29
    deseo: impedir que cualquier rastro de Kwon vuelva a operar en Corea
    necesidad: aprender a distinguir evidencia energética de intención humana
    miedo: repetir una falla pasada vinculada a Kwon
    secreto: perdió a su unidad por una orden de Kwon que parecía emitida desde alguien inocente
    estado_inicial: autoridad externa
    estado_salida_p1: declara a Jaeha objetivo de captura prioritaria
- P_RECIBO_NEGRO:
    tipo: marca-contrato del Último Acreedor
    objetivo_aparente: cobrar deudas registradas mediante daño sobrevivido
    límite: no activa por entrenamiento falso
    coste: control corporal tomado por órdenes pendientes
    estado_salida_p1: nivel uno, primera orden resistida a la fuerza
- E_FRACTURE_BEAST_RIB:
    tipo: criatura nacida de una costilla contaminada del cadáver de Kwon
    función: amenaza de activación y prueba del primer cobro
    estado_salida_p1: destruida por la cadena negra

### Localizaciones

- L_MORGUE_RAIZ:
    función_dramática: lugar donde el mundo legal intenta congelar el mal y donde el mal hereda una salida.
    estado_p1: sellos rotos, mesa de Kwon vacía, sangre de bestia como evidencia contra Jaeha.
- L_HOSPITAL_HANEUL:
    función_dramática: lastre emocional; prueba de que el poder puede resolver urgencias reales mientras crea riesgos morales mayores.
    estado_p1: oxígeno de Hana pagado por una ventana breve.
- L_RED_HANSE:
    función_dramática: aparato estatal que convierte la Firma negra en persecución pública.
    estado_p1: transmite rostro y clasificación de Jaeha como continuidad de Kwon.

### Semillas y pagos

- SEMILLA_RECIBO_NEGRO: el recibo se clava en la muñeca; paga la herencia y la regla de cobro.
- SEMILLA_HANA_OXIGENO: el turno existe por el amanecer médico; se paga parcialmente al marcar "oxígeno pagado".
- SEMILLA_ORDEN_PENDIENTE: la última frase de Kwon exige cobrar; paga como orden violenta contra Hanse.
- SEMILLA_FIRMA_NEGRA: los sellos queman el nombre de Jaeha; paga cuando Hanse lo clasifica como Kwon operativo.
- DEUDA_FINAL_SERIE: Jaeha deberá decidir si destruye el Último Acreedor, lo renegocia o acepta ser visto como monstruo para romper las deudas originales del mundo.


## STORY_BEATS
```yaml
- beat_id: B01
  function: [HOOK]
  atom_ids: [A001, A002, A003, A004]
  question_opened: "¿por qué un limpiador sin Veta está junto al cadáver del peor villano de Corea?"
  answer_paid: "su falta de Veta lo vuelve el recipiente improbable de una herencia que el Estado no puede clasificar"
  state_before: {Jaeha: "limpiador sin Veta fuera del conflicto heroico", Kwon: "cadáver sellado"}
  state_after: {Jaeha: "identificado por déficit y cercanía al cadáver", mundo: "regla de Fracturas establecida"}
  causal_bridge: "la muerte del villano permite que el protagonista ordinario entre en contacto con una anomalía que nadie de rango puede tocar sin activar los sellos"
  escalation_axis: "anomalía de muerte"
  pressure_level: 1
  value_shift: "rutina precaria->proximidad prohibida"
  promise_ids_opened: [PROMISE_P1_MAIN]
  promise_ids_paid: []
  dramatic_debts_opened: [DEBT_WHY_JAEHA_CHOSEN]
  dramatic_debts_paid: []
- beat_id: B02
  function: [BREATHE]
  atom_ids: [A005]
  question_opened: "¿qué lo obliga a aceptar un turno que nadie quiere?"
  answer_paid: "la deuda de oxígeno de Hana exige dinero antes del amanecer"
  state_before: {Jaeha: "parece simple empleado temerario"}
  state_after: {Jaeha: "actúa por necesidad familiar, no por ambición"}
  causal_bridge: "la deuda médica convierte un trabajo peligroso en única opción inmediata"
  escalation_axis: "lastre emocional"
  pressure_level: 1
  value_shift: "riesgo laboral->riesgo familiar"
  promise_ids_opened: [PROMISE_HANA_OXYGEN]
  promise_ids_paid: []
  dramatic_debts_opened: [DEBT_HANA_OXYGEN_CONTINUES]
  dramatic_debts_paid: []
- beat_id: B03
  function: [DETONATOR]
  atom_ids: [A006, A007, A008, A009, A010]
  question_opened: "¿cómo puede un muerto transferir el poder más odiado del país?"
  answer_paid: "el Recibo Negro se clava por contacto y la morgue reconoce al heredero"
  state_before: {Kwon: "sellado por juramentos", Jaeha: "sin poder ni marca"}
  state_after: {Kwon: "desapareciendo como dueño activo", Jaeha: "portador marcado del enemigo nacional"}
  causal_bridge: "el sello funerario falla porque Kwon preparó una deuda final que solo podía entrar en alguien sin Veta registrada"
  escalation_axis: "herencia prohibida"
  pressure_level: 2
  value_shift: "testigo inocente->heredero registrado"
  promise_ids_opened: [PROMISE_INHERITED_VILLAIN_POWER]
  promise_ids_paid: []
  dramatic_debts_opened: [DEBT_LAST_COMMAND, DEBT_MORGUE_REGISTRY]
  dramatic_debts_paid: [DEBT_WHY_JAEHA_CHOSEN]
- beat_id: B04
  function: [THREAT]
  atom_ids: [A011, A012, A013]
  question_opened: "¿qué quiere la criatura que nace del cadáver?"
  answer_paid: "busca la marca y fuerza a la voz a revelar la regla de cobro"
  state_before: {Jaeha: "marcado pero sin control", amenaza: "contenida en el cadáver"}
  state_after: {Jaeha: "perseguido por la marca", regla: "sobrevivir al daño permite cobrar"}
  causal_bridge: "la marca atrae la bestia, y la amenaza obliga al poder a declarar su condición mínima"
  escalation_axis: "amenaza física"
  pressure_level: 3
  value_shift: "marca pasiva->marca cazada"
  promise_ids_opened: [PROMISE_RULE_OF_POWER]
  promise_ids_paid: []
  dramatic_debts_opened: [DEBT_BEAST_FROM_RIB]
  dramatic_debts_paid: []
- beat_id: B05
  function: [DECISION]
  atom_ids: [A014]
  question_opened: "¿Jaeha usará el poder aunque no lo entiende?"
  answer_paid: "elige recibir daño real para activar el cobro"
  state_before: {Jaeha: "sin arma, a punto de morir"}
  state_after: {Jaeha: "herido voluntariamente y habilitado para cobrar"}
  causal_bridge: "como el poder no acepta simulacros, la única salida es aceptar una herida hostil"
  escalation_axis: "agencia bajo dolor"
  pressure_level: 4
  value_shift: "víctima acorralada->decisor del precio"
  promise_ids_opened: []
  promise_ids_paid: []
  dramatic_debts_opened: [DEBT_WOUND_CONSEQUENCE]
  dramatic_debts_paid: []
- beat_id: B06
  function: [PAYOFF]
  atom_ids: [A015, A016, A017]
  question_opened: "¿el poder heredado sirve para algo más que incriminarlo?"
  answer_paid: "rompe a la bestia, sube de cero a nivel uno y paga el oxígeno inmediato de Hana"
  state_before: {Jaeha: "herido sin rango", bestia: "dominante"}
  state_after: {Jaeha: "portador nivel uno con control prestado", bestia: "destruida", Hana: "oxígeno pagado por ahora"}
  causal_bridge: "la herida aceptada se transforma en cadena, y el sistema registra cobro real con progresión visible"
  escalation_axis: "progresión visible"
  pressure_level: 3
  value_shift: "cero sin salida->nivel uno con deuda"
  promise_ids_opened: []
  promise_ids_paid: [PROMISE_P1_MAIN, PROMISE_RULE_OF_POWER]
  dramatic_debts_opened: [DEBT_BORROWED_CONTROL]
  dramatic_debts_paid: [DEBT_WOUND_CONSEQUENCE]
- beat_id: B07
  function: [COST]
  atom_ids: [A018, A019, A020]
  question_opened: "¿cuál es el precio real de cobrar con el poder de Kwon?"
  answer_paid: "una orden pendiente intenta ejecutar violencia usando el cuerpo de Jaeha"
  state_before: {Jaeha: "vencedor reciente con poder activo"}
  state_after: {Jaeha: "sangrando por contener su propia mano, consciente del riesgo moral"}
  causal_bridge: "cada cobro despierta una instrucción inconclusa del villano y obliga a Jaeha a resistir físicamente"
  escalation_axis: "control corporal"
  pressure_level: 3
  value_shift: "victoria útil->amenaza interna"
  promise_ids_opened: [PROMISE_PENDING_ORDERS]
  promise_ids_paid: []
  dramatic_debts_opened: [DEBT_ORDER_TO_KILL_HANSE]
  dramatic_debts_paid: [DEBT_BORROWED_CONTROL]
- beat_id: B08
  function: [THREAT]
  atom_ids: [A021, A022, A023]
  question_opened: "¿cómo reaccionará el Estado al encontrar la Firma de Kwon en Jaeha?"
  answer_paid: "lo clasifica públicamente como continuidad del enemigo nacional"
  state_before: {Hanse: "llega buscando el cadáver", Jaeha: "ha resistido la orden"}
  state_after: {Hanse: "ve a Jaeha como Kwon operativo", Jaeha: "convertido en objetivo estatal"}
  causal_bridge: "la evidencia energética no mide intención, solo la Firma negra moviéndose en su cuerpo"
  escalation_axis: "persecución pública"
  pressure_level: 2
  value_shift: "sobreviviente sospechoso->enemigo estatal"
  promise_ids_opened: [PROMISE_STATE_HUNT]
  promise_ids_paid: []
  dramatic_debts_opened: [DEBT_YUN_SERA_HUNTS_JAEHA]
  dramatic_debts_paid: [DEBT_MORGUE_REGISTRY]
- beat_id: B09
  function: [CLIFFHANGER]
  atom_ids: [A024]
  question_opened: "¿cuántas órdenes pendientes dejó Kwon dentro del poder?"
  answer_paid: "no se responde todavía; la muñeca revela que esa es la verdadera herencia"
  state_before: {Jaeha: "cazado por el Estado y por su propio brazo"}
  state_after: {Jaeha: "entiende que cada avance puede activar una agenda criminal antigua"}
  causal_bridge: "la persecución externa fuerza al eco a decir la verdad mínima: el poder es un paquete de órdenes pendientes"
  escalation_axis: "secreto serial"
  pressure_level: 3
  value_shift: "poder heredado->agenda heredada"
  promise_ids_opened: [PROMISE_P2_PENDING_ORDER_LIST]
  promise_ids_paid: [PROMISE_INHERITED_VILLAIN_POWER]
  dramatic_debts_opened: [DEBT_FIRST_ORDER_SOURCE]
  dramatic_debts_paid: [DEBT_LAST_COMMAND]
```

## visual_obligations
```json
[
  {
    "obligation_id": "VO_B01_01",
    "beat_id": "B01",
    "atom_ids": [
      "A001",
      "A002",
      "A003",
      "A004"
    ],
    "rhythm_function": "DETAIL",
    "must_show": [
      "C_KWON_RYUGAK dead under containment",
      "C_MIN_JAEHA cleaning blood",
      "zero Veta status",
      "Fracture rule"
    ],
    "required_relationship": "la muerte nacional, el déficit del protagonista y la regla de supervivencia deben quedar conectados",
    "information_priority": "ORIENT",
    "density": "HIGH",
    "must_be_own_generated_page": true,
    "may_share_page": false,
    "prohibited_substitution": [
      "presentar a Jaeha como cazador competente",
      "omitir que Kwon ya está muerto"
    ]
  },
  {
    "obligation_id": "VO_B02_01",
    "beat_id": "B02",
    "atom_ids": [
      "A005"
    ],
    "rhythm_function": "RELATION",
    "must_show": [
      "hospital oxygen deadline",
      "Jaeha accepting the shift for Hana"
    ],
    "required_relationship": "el turno peligroso existe porque la vida de Hana depende del pago antes del amanecer",
    "information_priority": "DISCOVER",
    "density": "MEDIUM",
    "must_be_own_generated_page": false,
    "may_share_page": true,
    "prohibited_substitution": [
      "deuda genérica sin oxígeno",
      "motivación egoísta"
    ]
  },
  {
    "obligation_id": "VO_B03_01",
    "beat_id": "B03",
    "atom_ids": [
      "A006",
      "A007",
      "A008",
      "A009",
      "A010"
    ],
    "rhythm_function": "REVEAL",
    "must_show": [
      "three iron oath seals",
      "corpse gripping Jaeha",
      "black receipt mark",
      "enemy heir registry"
    ],
    "required_relationship": "el contacto del cadáver causa la marca y la morgue transforma a Jaeha en heredero registrado",
    "information_priority": "DISCOVER",
    "density": "HIGH",
    "must_be_own_generated_page": true,
    "may_share_page": false,
    "prohibited_substitution": [
      "transferencia voluntaria sin marca",
      "registro institucional omitido"
    ]
  },
  {
    "obligation_id": "VO_B04_01",
    "beat_id": "B04",
    "atom_ids": [
      "A011",
      "A012",
      "A013"
    ],
    "rhythm_function": "ACTION",
    "must_show": [
      "rib-born Fracture beast",
      "beast targeting wrist mark",
      "activation rule from pulse"
    ],
    "required_relationship": "la bestia nace por la herencia y obliga al poder a revelar su regla mínima",
    "information_priority": "ACT",
    "density": "HIGH",
    "must_be_own_generated_page": true,
    "may_share_page": false,
    "prohibited_substitution": [
      "bestia aleatoria sin vínculo con la marca",
      "regla narrada sin amenaza"
    ]
  },
  {
    "obligation_id": "VO_B05_01",
    "beat_id": "B05",
    "atom_ids": [
      "A014"
    ],
    "rhythm_function": "ACTION",
    "must_show": [
      "Jaeha choosing not to dodge",
      "hostile wound accepted"
    ],
    "required_relationship": "Jaeha decide activar el poder aceptando daño real porque no tiene otra forma de sobrevivir",
    "information_priority": "DECIDE",
    "density": "HIGH",
    "must_be_own_generated_page": true,
    "may_share_page": false,
    "prohibited_substitution": [
      "poder activado por accidente",
      "victoria sin daño"
    ]
  },
  {
    "obligation_id": "VO_B06_01",
    "beat_id": "B06",
    "atom_ids": [
      "A015",
      "A016",
      "A017"
    ],
    "rhythm_function": "ACTION",
    "must_show": [
      "black chain from wound",
      "beast defeated",
      "rank rising from zero",
      "oxygen paid",
      "borrowed control warning"
    ],
    "required_relationship": "la herida se cobra como poder, sube el nivel, paga oxígeno y anuncia el precio de control",
    "information_priority": "IMPACT",
    "density": "HIGH",
    "must_be_own_generated_page": true,
    "may_share_page": false,
    "prohibited_substitution": [
      "subida de rango sin pago familiar",
      "poder sin advertencia de control"
    ]
  },
  {
    "obligation_id": "VO_B07_01",
    "beat_id": "B07",
    "atom_ids": [
      "A018",
      "A019",
      "A020"
    ],
    "rhythm_function": "REACTION",
    "must_show": [
      "arm moving against Jaeha will",
      "violent pending order",
      "Jaeha pinning his own wrist to resist"
    ],
    "required_relationship": "el precio se cobra como orden corporal inconclusa y Jaeha prueba que no quiere ser Kwon",
    "information_priority": "CONSEQUENCE",
    "density": "HIGH",
    "must_be_own_generated_page": true,
    "may_share_page": false,
    "prohibited_substitution": [
      "precio invisible",
      "obedecer la orden sin resistencia"
    ]
  },
  {
    "obligation_id": "VO_B08_01",
    "beat_id": "B08",
    "atom_ids": [
      "A021",
      "A022",
      "A023"
    ],
    "rhythm_function": "REVEAL",
    "must_show": [
      "Hanse hunters arriving",
      "empty villain table",
      "Kwon signature moving in Jaeha",
      "Yun Sera state broadcast"
    ],
    "required_relationship": "Hanse no ve intención, ve evidencia estatal: la Firma de Kwon en el cuerpo de Jaeha",
    "information_priority": "REACT",
    "density": "HIGH",
    "must_be_own_generated_page": true,
    "may_share_page": false,
    "prohibited_substitution": [
      "persecución sin prueba",
      "Yun Sera actuando sin autoridad"
    ]
  },
  {
    "obligation_id": "VO_B09_01",
    "beat_id": "B09",
    "atom_ids": [
      "A024"
    ],
    "rhythm_function": "REVEAL",
    "must_show": [
      "whispering wrist mark",
      "pending orders revelation"
    ],
    "required_relationship": "el cliffhanger revela que el poder heredado trae tareas violentas aún activas",
    "information_priority": "DISCOVER",
    "density": "MEDIUM",
    "must_be_own_generated_page": false,
    "may_share_page": true,
    "prohibited_substitution": [
      "cierre sin nueva deuda",
      "revelar todo el origen del poder"
    ]
  }
]
```

## CONTINUITY_LEDGER
```yaml
narrative_state:
  part: 1
  local_resolution: "Jaeha sobrevive al cadáver de Kwon, prueba el primer cobro, sube a nivel uno y paga una ventana de oxígeno para Hana."
  cliffhanger_state: "El poder heredado no es solo fuerza; trae órdenes pendientes que intentan usar el cuerpo del protagonista."
  current_location: L_MORGUE_RAIZ
belief_state:
  audience_knows:
    - "Kwon murió oficialmente a las 02:17."
    - "Jaeha nació sin Veta y acepta el turno por Hana."
    - "El Recibo Negro cobra daño sobrevivido y lo convierte en poder."
    - "El precio es control corporal tomado por órdenes inconclusas."
    - "Hanse interpreta la Firma negra como continuidad de Kwon."
  audience_does_not_know:
    - "Por qué Kwon eligió a alguien sin Veta."
    - "Cuántas órdenes pendientes existen."
    - "Si el Último Acreedor fue originalmente una herramienta de juicio legítimo."
relationship_states:
  C_MIN_JAEHA__C_MIN_HANA: "Jaeha salva temporalmente su oxígeno, pero ahora su persecución amenaza con dejarla sola."
  C_MIN_JAEHA__C_YUN_SERA: "Sera lo clasifica como amenaza estatal antes de escuchar su intención."
  C_MIN_JAEHA__P_RECIBO_NEGRO: "Jaeha depende del poder para sobrevivir, pero ya lo hirió a sí mismo para impedir que lo use."
  C_MIN_JAEHA__C_KWON_RYUGAK: "relación póstuma de herencia forzada; Kwon funciona como espejo criminal."
knowledge_by_actor:
  C_MIN_JAEHA:
    - "Sabe que sobrevivir daño hostil permite cobrar."
    - "Sabe que una orden pendiente puede tomar su brazo."
    - "Sabe que Hanse lo ve como Kwon."
  C_MIN_HANA:
    - "No sabe que Jaeha porta el poder de Kwon."
    - "Sabe que su oxígeno dependía de dinero urgente."
  C_YUN_SERA:
    - "Sabe que la Firma negra de Kwon está en Jaeha."
    - "No sabe que Jaeha resistió una orden para no matar."
antagonist_knowledge:
  AGENCIA_HANSE:
    - "Registra a Jaeha como portador de la Firma negra."
    - "Cree que capturarlo equivale a impedir el regreso de Kwon."
  ORDENES_PENDIENTES:
    - "La primera orden buscaba matar al primer agente Hanse."
    - "El eco puede presionar partes del cuerpo, no controlar toda la voluntad todavía."
accumulated_cost:
  physical:
    - "Hombro perforado por bestia de Fractura."
    - "Muñeca dañada y sangrante por resistirse a su propio brazo."
  social:
    - "Rostro transmitido por Hanse como continuidad de Kwon Ryu-gak."
  moral:
    - "Jaeha comprobó que el poder puede intentar convertirlo en asesino sin su consentimiento."
  resource:
    - "Oxígeno de Hana pagado solo por una ventana breve, no como solución definitiva."
open_promises_and_debts:
  - id: PROMISE_STATE_HUNT
    status: OPEN
    detail: "Hanse y la nación persiguen a Jaeha por la Firma de Kwon."
  - id: PROMISE_PENDING_ORDERS
    status: OPEN
    detail: "Cada nuevo cobro puede despertar una orden inconclusa distinta."
  - id: PROMISE_P2_PENDING_ORDER_LIST
    status: OPEN
    detail: "Parte 2 debe revelar cómo se enumeran o detectan las órdenes pendientes."
  - id: DEBT_FIRST_ORDER_SOURCE
    status: OPEN
    detail: "Debe explicarse por qué la primera orden apuntó a un agente Hanse."
  - id: DEBT_HANA_OXYGEN_CONTINUES
    status: OPEN
    detail: "La salud de Hana sigue siendo un reloj, aunque el primer pago compró tiempo."
```

## MONOLOGO_LOCKED
```text
El villano más vigilado de Corea murió a las dos y diecisiete.
Un minuto después, yo limpiaba su sangre.
Me llamo Min Jaeha: limpiador de morgue, cero rango, cero Veta.
En Seúl, sin Veta nadie cruza una Fractura y vuelve entero.
Acepté el turno porque el hospital de mi hermana cortaría su oxígeno al amanecer.
Kwon Ryu-gak debía estar muerto bajo tres juramentos de hierro.
Pero abrió la bolsa mortuoria y me sujetó la muñeca.
No pidió auxilio; me clavó en la piel un recibo negro.
Sus últimos labios dijeron: cobra lo que me deben.
Los sellos de la morgue quemaron mi nombre como heredero del enemigo nacional.
Corrí, y una costilla del cadáver parió una bestia de Fractura.
La criatura ignoró al muerto y saltó hacia mi marca.
Una voz en mi pulso dictó la regla: sobrevive al daño y cobra.
Dejé que la garra me atravesara porque no tenía otra moneda.
El recibo ardió; una cadena negra salió de mi herida y rompió a la bestia.
Por primera vez, una pantalla de rango subió para alguien marcado como cero.
Saldo heredado: nivel uno, oxígeno pagado, control prestado.
El precio llegó de inmediato: mi brazo escribió una orden que yo no quería cumplir.
La orden decía: rompe la garganta del primer agente Hanse.
Apreté mi propia muñeca contra la camilla hasta sangrar para no obedecer.
Los cazadores entraron y no encontraron al villano.
Encontraron su Firma negra moviéndose en mi cuerpo y sangre de bestia a mis pies.
La capitana Yun Sera transmitió mi rostro: para el Estado, yo ya era Kwon Ryu-gak.
Entonces mi muñeca susurró: no heredaste mi poder; heredaste mis órdenes pendientes.
```

## QA_SHOWRUNNER
```yaml
hash_algorithm: UTF-8 + NFC + LF + no trailing LF
causal_chain: PASS
packet_status: PACKET_READY_V7
narrative_score_total: 15/16
narrative_axis_singularity: 2 | PREMISA_COMERCIAL: herencia de villano muerto, Firma estatal y órdenes pendientes como precio corporal.
narrative_axis_voice: 2 | MONOLOGO_LOCKED: primera persona urgente con deuda, oxígeno, control y persecución pública.
narrative_axis_human_arc: 2 | CANON_NECESARIO: Jaeha pasa de limpiar consecuencias ajenas a resistir físicamente la violencia heredada.
narrative_axis_hook: 2 | STORY_BEATS B01-B03: cadáver nacional, Veta cero, Recibo Negro y registro como heredero del enemigo.
narrative_axis_causal_curve: 2 | STORY_BEATS B01-B09: muerte causa turno, turno causa contacto, contacto causa marca, marca atrae bestia, cobro causa orden.
narrative_axis_payoff: 2 | STORY_BEATS B06: la herida aceptada paga la promesa principal con cadena, nivel uno y oxígeno temporal.
narrative_axis_cost_consequence: 2 | STORY_BEATS B07-B08: la orden toma el brazo, Jaeha se hiere para resistir y Hanse lo vuelve objetivo estatal.
narrative_axis_serial_continuity: 1 | CONTINUITY_LEDGER: quedan abiertos lista de órdenes, cacería Hanse, origen del poder y reloj médico de Hana.
narrative_zero_axes: 0
payoff_promise_gate: PASS
cost_consequence_gate: PASS
narrative_gate: PASS
```
