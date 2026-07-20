# STORY_PACKET_V5.3 — P1 PRODUCCIÓN

> Paquete de producción V5.3. Sustituye el packet legacy de 430–436 palabras para la P1 de 90–100 s. No contiene decisiones del JSON anterior.

## META

- handoff_version: "5.3"
- packet_id: el_barrendero_de_la_ruina_parte_01_v5_3
- series_title: El Barrendero de la Ruina
- series_id: el_barrendero_de_la_ruina
- part: 1
- language: es-419
- target_runtime_seconds: 97
- runtime_basis: voz/edit_speed 1.4 calibrados en el proof cut; volver a medir tras TTS final
- target_words: 339
- approved_voice_id: 452WrNT9o8dphaYW5YGU
- market_profile: accion_comercial
- energy_profile: shonen_manhwa
- speech_register: juvenil_directo_es419
- technical_density: baja
- voice_mode: primera_persona_protagonista
- hook_type: premisa_imposible

## MACHINE_LOCK_V5_3

```json
{
  "packet_id": "el_barrendero_de_la_ruina_parte_01_v5_3",
  "handoff_version": "5.3",
  "approved_voice_id": "452WrNT9o8dphaYW5YGU",
  "target_runtime_seconds": 97,
  "runtime_range_seconds": [90, 100],
  "beat_order": [
    "B01",
    "B02",
    "B03",
    "B04",
    "B05",
    "B06",
    "B07",
    "B08",
    "B09",
    "B10",
    "B11"
  ],
  "monologue_sha256": "9a3e199a985889351b1bc50147142980eef701da04b7674fc365fee881cda028",
  "monologue_hash_basis": "UTF-8 bytes of the exact text between MONOLOGO_LOCKED and HANDOFF_NARRATIVO_V5_3, excluding the two framing line breaks and preserving LF inside the text",
  "location_ids": [
    "hook_retrospective",
    "tunnel_work_zone",
    "tunnel_hazard_zone",
    "tunnel_convoy_lane"
  ],
  "beat_locations": {
    "B01": "hook_retrospective",
    "B02": "tunnel_work_zone",
    "B03": "tunnel_hazard_zone",
    "B04": "tunnel_hazard_zone",
    "B05": "tunnel_hazard_zone",
    "B06": "tunnel_hazard_zone",
    "B07": "tunnel_hazard_zone",
    "B08": "tunnel_hazard_zone",
    "B09": "tunnel_hazard_zone",
    "B10": "tunnel_hazard_zone",
    "B11": "tunnel_hazard_zone"
  },
  "state_contract": {
    "seo_jun.zone": {
      "initial": "tunnel_work_zone/outside_red_tape",
      "changes": [
        {
          "beat_id": "B04",
          "to": "tunnel_hazard_zone/inside_red_tape/approaching_child",
          "caused_by": "Seo Jun crosses the tape to rescue Mira and the child"
        },
        {
          "beat_id": "B11",
          "to": "tunnel_hazard_zone/center_of_physical_agent_ring",
          "caused_by": "state agents close the armed ring after signature confirmation"
        }
      ]
    },
    "seo_jun.container": {
      "initial": null,
      "changes": []
    },
    "park_mira.zone": {
      "initial": "tunnel_hazard_zone/inside_red_tape/beside_child",
      "changes": [
        {
          "beat_id": "B05",
          "to": "tunnel_hazard_zone/outside_direct_column_footprint/still_on_connected_surface",
          "caused_by": "Mira pushes the child laterally while Seo Jun pulls"
        },
        {
          "beat_id": "B10",
          "to": "tunnel_hazard_zone/beside_child/separated_from_seo_jun",
          "caused_by": "Mira sees Seo Jun's cost fissures and steps back"
        }
      ]
    },
    "nino_atrapado.zone": {
      "initial": "tunnel_hazard_zone/direct_column_footprint/beside_mira",
      "changes": [
        {
          "beat_id": "B05",
          "to": "tunnel_hazard_zone/outside_direct_column_footprint/still_on_connected_surface",
          "caused_by": "Seo Jun pulls and Mira pushes the child laterally"
        },
        {
          "beat_id": "B09",
          "to": "tunnel_hazard_zone/safe_beside_mira",
          "caused_by": "the connected cracks stop and the column settles outside his position"
        }
      ]
    },
    "kang_muyeol.zone": {
      "initial": "tunnel_convoy_lane/inside_capsule_orchestrator",
      "changes": [
        {
          "beat_id": "B05",
          "to": "tunnel_hazard_zone/inside_open_capsule_orchestrator",
          "caused_by": "the pulse throws the capsule beside the column without changing its occupant"
        }
      ]
    },
    "resto_perro_negro.zone": {
      "initial": "tunnel_hazard_zone/under_column",
      "changes": [
        {
          "beat_id": "B09",
          "to": "tunnel_hazard_zone/floor_in_front_of_column",
          "caused_by": "Seo Jun's discharge pulls it out from under the column"
        }
      ]
    },
    "ryu_haejin.zone": {
      "initial": "tunnel_convoy_lane/outside_capsule_orchestrator",
      "changes": [
        {
          "beat_id": "B10",
          "to": "tunnel_convoy_lane/scanner_line_to_seo_jun",
          "caused_by": "Ryu raises the handheld scanner toward Seo Jun"
        },
        {
          "beat_id": "B11",
          "to": "tunnel_hazard_zone/edge_of_physical_agent_ring",
          "caused_by": "Ryu commands the agents after confirming the signature"
        }
      ]
    },
    "capsule_orchestrator.zone": {
      "initial": "tunnel_convoy_lane/mounted_on_convoy",
      "changes": [
        {
          "beat_id": "B05",
          "to": "tunnel_hazard_zone/beside_column/opening_facing_seo_jun",
          "caused_by": "the connected pulse strikes the convoy wheels and throws the capsule"
        }
      ]
    },
    "capsule_orchestrator.occupants": {
      "initial": [
        "kang_muyeol"
      ],
      "changes": [
        {
          "beat_id": "B05",
          "to": [
            "kang_muyeol"
          ],
          "caused_by": "the capsule opens but Kang remains completely inside"
        },
        {
          "beat_id": "B07",
          "to": [
            "kang_muyeol"
          ],
          "caused_by": "only Kang's hand exits through the opening to touch Seo Jun"
        },
        {
          "beat_id": "B10",
          "to": [
            "kang_muyeol"
          ],
          "caused_by": "Kang dies inside and nobody enters or exits"
        }
      ]
    },
    "inheritance_damage_lines.owner": {
      "initial": "kang_muyeol",
      "changes": [
        {
          "beat_id": "B07",
          "to": "seo_jun",
          "caused_by": "Kang transfers the inheritance through direct hand-to-chest contact"
        }
      ]
    },
    "seo_cost_fissures.state": {
      "initial": "absent",
      "changes": [
        {
          "beat_id": "B09",
          "to": "visible_persistent_on_seo_jun_arm_only",
          "caused_by": "the manipulated damage copies into Seo Jun's body after the discharge"
        }
      ]
    },
    "resto_perro_negro.threat_state": {
      "initial": "trapped_latent_active_plates_intact",
      "changes": [
        {
          "beat_id": "B04",
          "to": "trapped_pulse_emitted_plates_intact",
          "caused_by": "the single purple chest crack activates"
        },
        {
          "beat_id": "B09",
          "to": "neutralized_immobile_plates_broken",
          "caused_by": "Seo Jun's redirected damage strikes and expels it"
        }
      ]
    },
    "resto_perro_negro.purple_light": {
      "initial": "active_single_chest_crack",
      "changes": [
        {
          "beat_id": "B04",
          "to": "bright_active_pulse",
          "caused_by": "the threat discharges through connected surfaces"
        },
        {
          "beat_id": "B09",
          "to": "off_permanently",
          "caused_by": "the redirected damage breaks the plates and neutralizes the source"
        }
      ]
    },
    "kang_muyeol.life_state": {
      "initial": "alive_injured_restrained",
      "changes": [
        {
          "beat_id": "B07",
          "to": "alive_exhausted_hand_broken_transfer_complete",
          "caused_by": "Kang breaks his hand and transfers the inheritance"
        },
        {
          "beat_id": "B10",
          "to": "deceased_unresponsive_inside_capsule",
          "caused_by": "Kang drops his head, stops breathing and does not respond"
        }
      ]
    }
  },
  "voice_visual_lock": [
    {"atom_id":"A001","text_exact":"[low] El villano más grande de Corea murió frente a mí.","kind":"EVENT","claims":[{"actor_id":"kang_muyeol","action":"dies","receiver_or_target_id":"seo_jun","source_id":"kang_muyeol","direction":"kang_muyeol->seo_jun","result":"Seo Jun witnesses Kang's death","causal_participants":["kang_muyeol","seo_jun"],"resolved_from_atom_id":null,"required_visual_tokens":["dead or dying","open capsule"]}],"must_show":["kang_muyeol","seo_jun","capsule_orchestrator"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"factual hook witnessed directly"}},
    {"atom_id":"A002","text_exact":"Pero antes me eligió como heredero.","kind":"EVENT","claims":[{"actor_id":"kang_muyeol","action":"chooses and transfers","receiver_or_target_id":"seo_jun","source_id":"kang_muyeol","direction":"kang_muyeol->seo_jun","result":"inheritance enters Seo Jun","causal_participants":["kang_muyeol","seo_jun"],"resolved_from_atom_id":"A001","required_visual_tokens":["hand-to-chest contact","red-black inheritance"]}],"must_show":["kang_muyeol","seo_jun","capsule_orchestrator"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"the giver and receiver must be visible"}},
    {"atom_id":"A003","text_exact":"Y ahora el Estado quiere ejecutarme.","kind":"CARD","claims":[],"must_show":[],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":""}},
    {"atom_id":"A004","text_exact":"[pause]","kind":"CONTROL","claims":[],"must_show":[],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":""}},
    {"atom_id":"A005","text_exact":"EL BARRENDERO DE LA RUINA","kind":"CARD","claims":[],"must_show":[],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":""}},
    {"atom_id":"A006","text_exact":"Yo era un Barrendero sin poderes.","kind":"STATE","claims":[{"actor_id":"seo_jun","action":"works without powers","receiver_or_target_id":"environment","source_id":"seo_jun","direction":"none","result":"Seo Jun is established as a civilian cleaner","causal_participants":["seo_jun"],"resolved_from_atom_id":null,"required_visual_tokens":["civilian cleaner uniform","cleaning tool"]}],"must_show":["seo_jun","escoba_industrial"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"role introduction"}},
    {"atom_id":"A007","text_exact":"Los combatientes mataban monstruos. Nosotros limpiábamos después.","kind":"EXPOSITION","claims":[{"actor_id":"combatientes_siluetas","action":"leave after killing monsters","receiver_or_target_id":"environment","source_id":"combatientes_siluetas","direction":"none","result":"combatants precede the cleaners","causal_participants":["combatientes_siluetas"],"resolved_from_atom_id":null,"required_visual_tokens":["two or three departing navy-armored silhouettes","monster remains"]},{"actor_id":"seo_jun","action":"cleans aftermath","receiver_or_target_id":"environment","source_id":"seo_jun","direction":"none","result":"the cleaner works after them","causal_participants":["seo_jun"],"resolved_from_atom_id":"A006","required_visual_tokens":["cleaning aftermath"]}],"must_show":["combatientes_siluetas","seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"the hierarchy must be visible"}},
    {"atom_id":"A008","text_exact":"Esa noche necesitaba terminar el turno para pagar la renta.","kind":"STATE","claims":[{"actor_id":"seo_jun","action":"counts pay for rent","receiver_or_target_id":"environment","source_id":"seo_jun","direction":"none","result":"economic pressure is visible","causal_participants":["seo_jun"],"resolved_from_atom_id":null,"required_visual_tokens":["cash in gloved hand","worried expression"]}],"must_show":["seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"human motive"}},
    {"atom_id":"A009","text_exact":"El convoy del Orquestador debía esperar a que despejáramos el túnel.","kind":"STATE","claims":[{"actor_id":"convoy_vehicle","action":"waits behind the work boundary","receiver_or_target_id":"environment","source_id":"convoy_vehicle","direction":"none","result":"the convoy is held behind cleaners","causal_participants":["convoy_vehicle"],"resolved_from_atom_id":null,"required_visual_tokens":["work boundary","blocked tunnel lane"]}],"must_show":["convoy_vehicle"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"convoy rule"}},
    {"atom_id":"A010","text_exact":"La Autoridad entró antes. No iba a retrasarse por trabajadores como nosotros.","kind":"EVENT","claims":[{"actor_id":"convoy_vehicle","action":"enters before clearance","receiver_or_target_id":"seo_jun","source_id":"convoy_vehicle","direction":"convoy_vehicle->seo_jun","result":"authority invades the civilian work zone","causal_participants":["convoy_vehicle","seo_jun"],"resolved_from_atom_id":null,"required_visual_tokens":["crossing the work boundary"]}],"must_show":["convoy_vehicle","seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"power hierarchy"}},
    {"atom_id":"A011","text_exact":"Entonces vi al perro negro.","kind":"EVENT","claims":[{"actor_id":"seo_jun","action":"sees","receiver_or_target_id":"resto_perro_negro","source_id":"seo_jun","direction":"seo_jun->resto_perro_negro","result":"Seo Jun identifies the threat","causal_participants":["seo_jun","resto_perro_negro"],"resolved_from_atom_id":null,"required_visual_tokens":["violet offscreen reflection in Seo Jun's eyes"]}],"must_show":["seo_jun"],"offscreen_policy":{"mode":"ALLOWED_FILMABLE","allowed_ids":["resto_perro_negro"],"reason":"reaction shot is paid immediately by the full creature reveal in A012"}},
    {"atom_id":"A012","text_exact":"Era alto, no tenía ojos y seguía atrapado bajo una columna.","kind":"STATE","claims":[{"actor_id":"resto_perro_negro","action":"remains trapped","receiver_or_target_id":"environment","source_id":"resto_perro_negro","direction":"none","result":"the eyeless creature is immobilized","causal_participants":["resto_perro_negro"],"resolved_from_atom_id":"A011","required_visual_tokens":["eyeless tall body","trapped under damaged column"]}],"must_show":["resto_perro_negro"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"physical threat state"}},
    {"atom_id":"A013","text_exact":"Una grieta morada latía en su pecho.","kind":"STATE","claims":[{"actor_id":"resto_perro_negro","action":"pulses","receiver_or_target_id":"environment","source_id":"resto_perro_negro","direction":"none","result":"single chest crack glows","causal_participants":["resto_perro_negro"],"resolved_from_atom_id":"A012","required_visual_tokens":["single violet chest crack"]}],"must_show":["resto_perro_negro"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"rule source"}},
    {"atom_id":"A014","text_exact":"Cuando esa luz pulsaba, el daño corría por todo lo conectado.","kind":"EVENT","claims":[{"actor_id":"resto_perro_negro","action":"sends connected damage","receiver_or_target_id":"environment","source_id":"resto_perro_negro","direction":"none","result":"damage travels across connected surfaces","causal_participants":["resto_perro_negro"],"resolved_from_atom_id":"A013","required_visual_tokens":["violet pulse","connected cracks across wet concrete"]}],"must_show":["resto_perro_negro"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"world rule demonstration"}},
    {"atom_id":"A015","text_exact":"Mi compañera estaba dentro de la cinta. Un niño seguía atrapado junto a ella.","kind":"STATE","claims":[{"actor_id":"park_mira","action":"protects","receiver_or_target_id":"nino_atrapado","source_id":"park_mira","direction":"park_mira->nino_atrapado","result":"both remain inside the hazard boundary","causal_participants":["park_mira","nino_atrapado"],"resolved_from_atom_id":null,"required_visual_tokens":["inside stretched red warning tape"]}],"must_show":["park_mira","nino_atrapado","cinta_roja"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"rescue stakes"}},
    {"atom_id":"A016","text_exact":"[urgent] La grieta se encendió.","kind":"EVENT","claims":[{"actor_id":"resto_perro_negro","action":"ignites chest crack","receiver_or_target_id":"environment","source_id":"resto_perro_negro","direction":"none","result":"the pulse starts","causal_participants":["resto_perro_negro"],"resolved_from_atom_id":"A013","required_visual_tokens":["bright violet chest crack"]}],"must_show":["resto_perro_negro"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"threat trigger"}},
    {"atom_id":"A017","text_exact":"El pavimento se abrió.","kind":"EVENT","claims":[{"actor_id":"resto_perro_negro","action":"splits pavement with pulse","receiver_or_target_id":"environment","source_id":"resto_perro_negro","direction":"none","result":"a crack opens through the floor","causal_participants":["resto_perro_negro"],"resolved_from_atom_id":"A016","required_visual_tokens":["pavement splitting open","pulse connection"]}],"must_show":["resto_perro_negro"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"cause and result in sequence"}},
    {"atom_id":"A018","text_exact":"La columna empezó a caer.","kind":"EVENT","claims":[{"actor_id":"environment","action":"drops damaged column","receiver_or_target_id":"environment","source_id":"environment","direction":"none","result":"the column descends toward the rescue zone","causal_participants":[],"resolved_from_atom_id":null,"required_visual_tokens":["damaged column visibly falling","concrete dust"]}],"must_show":[],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"environmental event must be literal"}},
    {"atom_id":"A019","text_exact":"Yo crucé la cinta.","kind":"EVENT","claims":[{"actor_id":"seo_jun","action":"crosses","receiver_or_target_id":"cinta_roja","source_id":"seo_jun","direction":"seo_jun->cinta_roja","result":"Seo Jun enters the hazard zone","causal_participants":["seo_jun","cinta_roja"],"resolved_from_atom_id":null,"required_visual_tokens":["one boot crossing stretched tape"]}],"must_show":["seo_jun","cinta_roja"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"protagonist agency"}},
    {"atom_id":"A020","text_exact":"Tomé al niño del brazo mientras mi compañera lo empujaba hacia mí.","kind":"EVENT","claims":[{"actor_id":"seo_jun","action":"pulls","receiver_or_target_id":"nino_atrapado","source_id":"seo_jun","direction":"seo_jun->nino_atrapado","result":"Seo Jun pulls the child by the arm","causal_participants":["seo_jun","nino_atrapado"],"resolved_from_atom_id":null,"required_visual_tokens":["hand gripping child's arm"]},{"actor_id":"park_mira","action":"pushes","receiver_or_target_id":"nino_atrapado","source_id":"park_mira","direction":"park_mira->nino_atrapado","result":"Mira pushes the same child toward Seo Jun","causal_participants":["park_mira","nino_atrapado","seo_jun"],"resolved_from_atom_id":null,"required_visual_tokens":["three-body rescue contact"]}],"must_show":["seo_jun","park_mira","nino_atrapado"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"all rescue participants are causal"}},
    {"atom_id":"A021","text_exact":"El mismo pulso golpeó las ruedas del convoy.","kind":"EVENT","claims":[{"actor_id":"resto_perro_negro","action":"hits convoy wheels with pulse","receiver_or_target_id":"convoy_vehicle","source_id":"resto_perro_negro","direction":"resto_perro_negro->convoy_vehicle","result":"the reinforced wheels are struck","causal_participants":["resto_perro_negro","convoy_vehicle"],"resolved_from_atom_id":"A016","required_visual_tokens":["violet pulse striking reinforced wheels"]}],"must_show":["convoy_vehicle"],"offscreen_policy":{"mode":"ALLOWED_FILMABLE","allowed_ids":["resto_perro_negro"],"reason":"continuous violet trail visibly proves the offscreen source"}},
    {"atom_id":"A022","text_exact":"La cápsula salió despedida","kind":"EVENT","claims":[{"actor_id":"capsule_orchestrator","action":"flies off mount","receiver_or_target_id":"environment","source_id":"capsule_orchestrator","direction":"none","result":"capsule leaves the convoy mount","causal_participants":["capsule_orchestrator","kang_muyeol"],"resolved_from_atom_id":null,"required_visual_tokens":["tearing mount brackets","airborne capsule"]}],"must_show":["capsule_orchestrator","kang_muyeol"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"container and sole occupant"}},
    {"atom_id":"A023","text_exact":"y se abrió contra la columna.","kind":"EVENT","claims":[{"actor_id":"capsule_orchestrator","action":"slams open against column","receiver_or_target_id":"environment","source_id":"capsule_orchestrator","direction":"none","result":"the hatch opens on impact","causal_participants":["capsule_orchestrator","kang_muyeol"],"resolved_from_atom_id":"A022","required_visual_tokens":["hatch striking broken concrete column","open capsule"]}],"must_show":["capsule_orchestrator","kang_muyeol"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"impact target must be literal"}},
    {"atom_id":"A024","text_exact":"Dentro estaba el Orquestador. Vivo. Herido. Atado con correas blancas y un collar de metal.","kind":"STATE","claims":[{"actor_id":"kang_muyeol","action":"lies restrained inside","receiver_or_target_id":"capsule_orchestrator","source_id":"kang_muyeol","direction":"kang_muyeol->capsule_orchestrator","result":"Kang is revealed as the sole living injured occupant","causal_participants":["kang_muyeol","capsule_orchestrator"],"resolved_from_atom_id":null,"required_visual_tokens":["alive and injured","white restraints","metal collar"]}],"must_show":["kang_muyeol","capsule_orchestrator"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"identity reveal"}},
    {"atom_id":"A025","text_exact":"Me miró directo.","kind":"EVENT","claims":[{"actor_id":"kang_muyeol","action":"looks directly","receiver_or_target_id":"seo_jun","source_id":"kang_muyeol","direction":"kang_muyeol->seo_jun","result":"direct recognition begins","causal_participants":["kang_muyeol","seo_jun"],"resolved_from_atom_id":"A024","required_visual_tokens":["direct eye contact from Seo Jun POV"]}],"must_show":["kang_muyeol"],"offscreen_policy":{"mode":"ALLOWED_FILMABLE","allowed_ids":["seo_jun"],"reason":"POV eye line proves the receiver"}},
    {"atom_id":"A026","text_exact":"—Tú también cargas lo que ellos dejan atrás.","kind":"EVENT","claims":[{"actor_id":"kang_muyeol","action":"speaks to","receiver_or_target_id":"seo_jun","source_id":"kang_muyeol","direction":"kang_muyeol->seo_jun","result":"Kang identifies Seo Jun's burden","causal_participants":["kang_muyeol","seo_jun"],"resolved_from_atom_id":"A025","required_visual_tokens":["Kang speaking with strained mouth"]}],"must_show":["kang_muyeol"],"offscreen_policy":{"mode":"ALLOWED_FILMABLE","allowed_ids":["seo_jun"],"reason":"eyeline and address preserve the offscreen listener"}},
    {"atom_id":"A027","text_exact":"La columna cedió sobre nosotros.","kind":"EVENT","claims":[{"actor_id":"environment","action":"drops column over Seo Jun and Kang","receiver_or_target_id":"seo_jun","source_id":"environment","direction":"none","result":"both are under immediate collapse","causal_participants":["seo_jun","kang_muyeol","capsule_orchestrator"],"resolved_from_atom_id":null,"required_visual_tokens":["falling damaged column over both positions","open capsule"]}],"must_show":["seo_jun","kang_muyeol","capsule_orchestrator"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"plural danger must be spatially clear"}},
    {"atom_id":"A028","text_exact":"[strained] El Orquestador rompió una mano contra la correa","kind":"EVENT","claims":[{"actor_id":"kang_muyeol","action":"breaks hand against restraint","receiver_or_target_id":"environment","source_id":"kang_muyeol","direction":"none","result":"his hand becomes free enough to reach","causal_participants":["kang_muyeol"],"resolved_from_atom_id":null,"required_visual_tokens":["broken hand","white restraint under force"]}],"must_show":["kang_muyeol"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"costly action"}},
    {"atom_id":"A029","text_exact":"y me tocó el pecho.","kind":"EVENT","claims":[{"actor_id":"kang_muyeol","action":"touches chest","receiver_or_target_id":"seo_jun","source_id":"kang_muyeol","direction":"kang_muyeol->seo_jun","result":"broken hand makes physical contact","causal_participants":["kang_muyeol","seo_jun"],"resolved_from_atom_id":"A028","required_visual_tokens":["broken palm touching gray-coverall chest"]}],"must_show":["kang_muyeol","seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"direct contact"}},
    {"atom_id":"A030","text_exact":"Algo rojo y negro entró en mí.","kind":"EVENT","claims":[{"actor_id":"kang_muyeol","action":"transfers red-black inheritance","receiver_or_target_id":"seo_jun","source_id":"kang_muyeol","direction":"kang_muyeol->seo_jun","result":"energy enters Seo Jun's chest","causal_participants":["kang_muyeol","seo_jun"],"resolved_from_atom_id":"A029","required_visual_tokens":["red-black current entering chest from Kang's hand"]}],"must_show":["kang_muyeol","seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"source and direction are essential"}},
    {"atom_id":"A031","text_exact":"De pronto vi el daño dentro de la columna y bajo nuestros pies.","kind":"EVENT","claims":[{"actor_id":"seo_jun","action":"sees hidden damage","receiver_or_target_id":"environment","source_id":"seo_jun","direction":"none","result":"internal damage becomes visible to him","causal_participants":["seo_jun"],"resolved_from_atom_id":null,"required_visual_tokens":["red-black damage inside column","damage under wet floor"]}],"must_show":["seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"new perception"}},
    {"atom_id":"A032","text_exact":"Extendí las manos.","kind":"EVENT","claims":[{"actor_id":"seo_jun","action":"extends both hands","receiver_or_target_id":"environment","source_id":"seo_jun","direction":"none","result":"he begins controlling the damage","causal_participants":["seo_jun"],"resolved_from_atom_id":null,"required_visual_tokens":["both complete hands extended"]}],"must_show":["seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"power initiation"}},
    {"atom_id":"A033","text_exact":"Las líneas rojas salieron del concreto.","kind":"EVENT","claims":[{"actor_id":"seo_jun","action":"extracts red-black lines","receiver_or_target_id":"environment","source_id":"environment","direction":"none","result":"damage rises out of concrete toward Seo Jun","causal_participants":["seo_jun"],"resolved_from_atom_id":null,"required_visual_tokens":["red-black lines emerging from concrete"]}],"must_show":["seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"power source surface"}},
    {"atom_id":"A034","text_exact":"Todo ese daño giró alrededor de mis brazos.","kind":"EVENT","claims":[{"actor_id":"seo_jun","action":"orbits damage around arms","receiver_or_target_id":"seo_jun","source_id":"seo_jun","direction":"none","result":"red-black damage circles both arms","causal_participants":["seo_jun"],"resolved_from_atom_id":"A033","required_visual_tokens":["damage orbiting both arms"]}],"must_show":["seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"manifestation state"}},
    {"atom_id":"A035","text_exact":"[impact] Y lo lancé directo al perro.","kind":"EVENT","claims":[{"actor_id":"seo_jun","action":"launches damage","receiver_or_target_id":"resto_perro_negro","source_id":"seo_jun","direction":"seo_jun->resto_perro_negro","result":"the discharge hits the dog","causal_participants":["seo_jun","resto_perro_negro"],"resolved_from_atom_id":"A034","required_visual_tokens":["red-black trajectory with visible impact contact"]}],"must_show":["seo_jun","resto_perro_negro"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"payoff impact"}},
    {"atom_id":"A036","text_exact":"Las grietas dejaron de avanzar bajo el niño y mi compañera.","kind":"EVENT","claims":[{"actor_id":"environment","action":"stops connected cracks","receiver_or_target_id":"nino_atrapado","source_id":"environment","direction":"none","result":"cracks halt beneath child and Mira","causal_participants":["nino_atrapado","park_mira"],"resolved_from_atom_id":null,"required_visual_tokens":["cracks visibly stopping under both bodies"]}],"must_show":["nino_atrapado","park_mira"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"saved pair and stopped threat"}},
    {"atom_id":"A037","text_exact":"El golpe lo arrancó de la columna. Sus placas negras reventaron.","kind":"EVENT","claims":[{"actor_id":"seo_jun","action":"blasts creature from column","receiver_or_target_id":"resto_perro_negro","source_id":"seo_jun","direction":"seo_jun->resto_perro_negro","result":"the dog is expelled and its plates burst","causal_participants":["seo_jun","resto_perro_negro"],"resolved_from_atom_id":"A035","required_visual_tokens":["creature torn away from column","black plates bursting"]}],"must_show":["seo_jun","resto_perro_negro"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"public payoff consequence"}},
    {"atom_id":"A038","text_exact":"La luz morada se apagó.","kind":"EVENT","claims":[{"actor_id":"resto_perro_negro","action":"extinguishes chest light","receiver_or_target_id":"environment","source_id":"resto_perro_negro","direction":"none","result":"violet crack is fully dark","causal_participants":["resto_perro_negro"],"resolved_from_atom_id":"A037","required_visual_tokens":["violet chest crack fully off"]}],"must_show":["resto_perro_negro"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"neutralization proof"}},
    {"atom_id":"A039","text_exact":"El niño estaba a salvo.","kind":"STATE","claims":[{"actor_id":"nino_atrapado","action":"is safe beside Mira","receiver_or_target_id":"park_mira","source_id":"nino_atrapado","direction":"nino_atrapado->park_mira","result":"the child survives","causal_participants":["nino_atrapado","park_mira"],"resolved_from_atom_id":null,"required_visual_tokens":["child breathing safely","Mira holding him"]}],"must_show":["nino_atrapado","park_mira"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"human payoff"}},
    {"atom_id":"A040","text_exact":"Pero mi brazo crujió.","kind":"EVENT","claims":[{"actor_id":"seo_jun","action":"suffers arm fracture","receiver_or_target_id":"seo_jun","source_id":"seo_jun","direction":"none","result":"the power cost damages his arm","causal_participants":["seo_jun"],"resolved_from_atom_id":null,"required_visual_tokens":["forearm cracking under skin","pain reaction"]}],"must_show":["seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"cost payment"}},
    {"atom_id":"A041","text_exact":"Marcas negras subieron bajo mi piel.","kind":"EVENT","claims":[{"actor_id":"seo_jun","action":"develops black fissures","receiver_or_target_id":"seo_jun","source_id":"seo_jun","direction":"none","result":"marks climb beneath his arm skin","causal_participants":["seo_jun"],"resolved_from_atom_id":"A040","required_visual_tokens":["black marks beneath skin","red internal sparks"]}],"must_show":["seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"persistent cost state"}},
    {"atom_id":"A042","text_exact":"Mi compañera me miró como si yo fuera el siguiente monstruo.","kind":"EVENT","claims":[{"actor_id":"park_mira","action":"recoils and looks at","receiver_or_target_id":"seo_jun","source_id":"park_mira","direction":"park_mira->seo_jun","result":"Mira fears Seo Jun as a monster","causal_participants":["park_mira","seo_jun"],"resolved_from_atom_id":null,"required_visual_tokens":["fear recoil","physical separation"]}],"must_show":["park_mira","seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"relationship consequence"}},
    {"atom_id":"A043","text_exact":"El Orquestador dejó caer la cabeza dentro de la cápsula.","kind":"EVENT","claims":[{"actor_id":"kang_muyeol","action":"drops head and dies inside","receiver_or_target_id":"capsule_orchestrator","source_id":"kang_muyeol","direction":"kang_muyeol->capsule_orchestrator","result":"Kang becomes unresponsive inside the capsule","causal_participants":["kang_muyeol","capsule_orchestrator"],"resolved_from_atom_id":null,"required_visual_tokens":["head fallen","unresponsive body inside"]}],"must_show":["kang_muyeol","capsule_orchestrator"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"death confirmation"}},
    {"atom_id":"A044","text_exact":"La capitana levantó su escáner.","kind":"EVENT","claims":[{"actor_id":"ryu_haejin","action":"raises scanner","receiver_or_target_id":"scanner_signature","source_id":"ryu_haejin","direction":"ryu_haejin->scanner_signature","result":"Ryu aims the physical device at Seo Jun","causal_participants":["ryu_haejin","scanner_signature","seo_jun"],"resolved_from_atom_id":null,"required_visual_tokens":["scanner physically held and raised"]}],"must_show":["ryu_haejin","scanner_signature","seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"device ownership and target"}},
    {"atom_id":"A045","text_exact":"La pantalla marcó: FIRMA DEL ORQUESTADOR.","kind":"STATE","claims":[{"actor_id":"scanner_signature","action":"displays signature result","receiver_or_target_id":"ryu_haejin","source_id":"scanner_signature","direction":"scanner_signature->ryu_haejin","result":"the scanner confirms the Orchestrator signature","causal_participants":["scanner_signature","ryu_haejin"],"resolved_from_atom_id":"A044","required_visual_tokens":["physical green screen","exact text FIRMA DEL ORQUESTADOR"]}],"must_show":["scanner_signature","ryu_haejin"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"screen and holder"}},
    {"atom_id":"A046","text_exact":"[tense] Todos los rifles giraron hacia mí.","kind":"EVENT","claims":[{"actor_id":"state_agents","action":"aim all rifles","receiver_or_target_id":"seo_jun","source_id":"state_agents","direction":"state_agents->seo_jun","result":"an armed ring targets Seo Jun","causal_participants":["state_agents","physical_rifles","seo_jun"],"resolved_from_atom_id":null,"required_visual_tokens":["four distinct agents","physical circular formation","rifle barrels toward center"]}],"must_show":["state_agents","physical_rifles","seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"plural armed threat"}},
    {"atom_id":"A047","text_exact":"—Objetivo de ejecución confirmado.","kind":"EVENT","claims":[{"actor_id":"ryu_haejin","action":"confirms execution order","receiver_or_target_id":"seo_jun","source_id":"ryu_haejin","direction":"ryu_haejin->seo_jun","result":"Seo Jun is declared an execution target","causal_participants":["ryu_haejin","seo_jun"],"resolved_from_atom_id":"A044","required_visual_tokens":["Ryu visibly speaking command","Seo Jun cornered"]}],"must_show":["ryu_haejin","seo_jun"],"offscreen_policy":{"mode":"FORBIDDEN","allowed_ids":[],"reason":"speaker and condemned target"}}
  ]
}
```

## PREMISA COMERCIAL

- venta: Un Barrendero sin poderes hereda la fuerza del villano acusado de crear las Fracturas que intentaba cerrar.
- contradiccion: El trabajador más descartable recibe el poder del enemigo más odiado, aunque ese enemigo podría ser inocente.
- deseo_humano: Conservar el departamento que comparte con su hermana menor y dejar de vivir al borde del desalojo.
- herida_emocional: Seo Jun aprendió que quienes limpian después de los poderosos solo importan mientras sigan siendo útiles.
- ventaja: Puede ver el daño guardado en objetos, monstruos y estructuras, extraerlo como líneas rojo-negras y descargarlo en otro objetivo.
- precio: Cada uso copia parte del daño en su cuerpo, provoca fracturas internas y emite la firma perseguida del Orquestador.
- transformacion_prometida: De trabajador invisible a protector perseguido que descubre quién provoca las Fracturas.
- arena_serial: Zonas posteriores a Fracturas, brigadas de limpieza, operaciones de contención y territorios donde el daño vuelve a despertar.
- loop_de_placer: Seo Jun entra después de los combatientes, detecta un peligro ignorado, usa su oficio y poder prohibido para salvar a otros, gana control y provoca miedo o reconocimiento.
- pregunta_serial: ¿Dominará la fuerza del Orquestador y revelará la verdad antes de que el Estado lo convierta en el siguiente villano?

## CANON NECESARIO

- mundo: Corea del Sur sufre Fracturas que liberan monstruos. Combatientes enfrentan la amenaza principal; después, cuadrillas civiles llamadas Barrenderos retiran restos y revisan zonas declaradas seguras.
- reglas: Los restos con una grieta morada conservan daño activo. Cada pulso transmite ese daño por superficies conectadas. Las firmas de poder son únicas y los escáneres estatales pueden identificarlas.
- poder_y_progresion: La Herencia del Orquestador permite ver daño acumulado como líneas rojo-negras, extraerlo, moverlo y descargarlo. Seo Jun empieza por instinto y progresa hacia selección, almacenamiento y cierre controlado.
- costo: El cuerpo de Seo Jun recibe una copia parcial del daño manipulado. Aparecen fisuras negras, dolor interno y pérdida de control; cada uso revela su ubicación.
- instituciones: La Autoridad Coreana de Fracturas controla combatientes y contención. Las contratistas emplean Barrenderos sin reconocer su exposición.
- personajes: Seo Jun, Barrendero de veinticuatro años, protector y observador; Seo Ara, hermana menor y motivo económico; Park Mira, compañera que protege al niño; Kang Muyeol, Orquestador capturado; capitana Ryu Haejin, oficial que identifica la transferencia.
- relaciones: Seo Jun y Ara dependen uno del otro. Mira confía en él pero teme su poder. Kang lo elige por compatibilidad. Ryu considera ejecutable a cualquier portador de esa firma.
- escenarios_recurrentes: Túneles y calles dañadas; almacén de Barrenderos; departamento de los hermanos; centros de contención; interiores de Fracturas.
- props_recurrentes: Escoba industrial, carrito gris, cinta roja, gafete, cápsula transparente, convoy y escáner de firmas.
- vestuario: Seo Jun usa overol gris reflectante, guantes gastados y botas reparadas; agentes, armadura blanca/negra; Kang, ropa oscura dañada, correas blancas y aro metálico.
- efectos_y_colores: Cotidiano gris cemento, azul lluvia y amarillo industrial; amenaza morada; poder con núcleo negro y bordes rojos luminosos —el narrador puede llamarlo “líneas rojas”—; costo carbón con destellos rojos.
- simbolo_visual: Una escoba gris atravesada por una línea de daño rojo-negra.

## PRESUPUESTO DE REVELACIONES

- verdad_interna: Kang no crea Fracturas; percibe y traslada el daño que las mantiene abiertas. Una operación estatal provocó las primeras Fracturas estables y lo culpó. Años de exposición hicieron compatible a Seo Jun.
- sabe_protagonista: El Estado acusa al Orquestador. Tras el contacto, Seo Jun solo comprende que puede ver y mover el daño.
- sabe_publico: Kang es el villano más buscado y su firma debía desaparecer con su muerte.
- sospecha_espectador: La primera acción del poder salva y cierra daño, contradiciendo la versión oficial.
- reservado: El Estado conocía la exposición de los Barrenderos y quiere usar el poder para producir Fracturas controladas.

## CONTRATO DE LA PARTE

- objetivo_inmediato: Terminar el turno para pagar la renta.
- amenaza: Un perro negro activo bajo una columna transmite daño al túnel.
- reloj_o_presion: El pulso puede derrumbar la columna sobre Park Mira y un niño; la Autoridad fuerza el convoy a pasar.
- regla_visible: Si la grieta morada pulsa, el daño corre por todo lo conectado.
- decision_emocional: Seo Jun cruza la cinta para rescatar al niño y a su compañera.
- mini_victoria: Redirige el daño al perro, apaga su grieta y salva a los atrapados.
- reaccion_externa: Mira retrocede y la capitana identifica la firma.
- costo_pagado: El brazo de Seo Jun se fractura y queda marcado.
- cambio_irreversible: La Herencia y firma del Orquestador quedan unidas a Seo Jun.
- cliffhanger: Los rifles del convoy giran hacia él y la capitana ordena ejecutarlo.
- continuidad_temporal: Una sola noche lluviosa, dentro del mismo túnel, sin salto de lugar.
- timing_budget: {question_s: 3, promise_s: 6, title_end_s: 8, threat_s: 25, agency_s: 45, manifestation_pct: 60, payoff_pct: 75, cliffhanger_s: 97}

## DIRECCION VISUAL SEMILLA

- hora: Noche lluviosa, antes de medianoche.
- escenario_principal: Túnel urbano reforzado y parcialmente dañado.
- eje_general: Seo Jun screen-left/midground; perro y columna screen-right/background; Mira y niño detrás de la cinta; convoy sobre eje central; salida foreground-left.
- paleta_calma: Gris cemento, azul lluvia, amarillo industrial.
- paleta_amenaza: Morado eléctrico, negro mate, rojo de emergencia.
- paleta_poder: Rojo encendido, negro profundo, chispas blancas.
- paleta_consecuencia: Blanco clínico, rojo de alerta, sombras cerradas.
- cinco_anclas_sugeridas: elección del heredero; jerarquía Barrenderos/Autoridad; perro atrapado y regla morada; redirección del daño; rifles rodeando a Seo Jun.
- scale_plan: mundo del túnel; amenaza perro/columna; geografía de rescate; cápsula y convoy; manifestación; consecuencia y cerco final.

## FIRMAS VISUALES Y ROLES

- seo_jun: hombre coreano de 24 años, cabello negro corto y desordenado, rostro joven anguloso, overol gris con franjas amarillas reflectantes, guantes gastados y botas reparadas.
- park_mira: mujer coreana adulta, cabello oscuro corto recogido, uniforme gris/amarillo de cuadrilla, postura protectora.
- kang_muyeol: hombre coreano adulto, cabello negro largo, rostro pálido y herido, ropa negra dañada, correas blancas y aro metálico.
- ryu_haejin: mujer coreana adulta, cabello oscuro firme y armadura blanca/negra de mando, escáner portátil.
- combatientes_siluetas: grupo de dos o tres combatientes adultos con armadura azul marino, vistos alejándose tras la operación; siluetas nítidas y distintas de los agentes estatales blancos/negros.
- nino_atrapado: niño coreano pequeño, impermeable mostaza.
- resto_perro_negro: criatura canina alta sin ojos, placas negras, grieta morada única en el pecho.
- separacion_de_similares: Seo Jun es joven, cabello corto y overol reflectante; Kang es mayor, cabello largo, ropa negra y correas; nunca comparten contenedor u outfit.
- ocupacion_contenedores: Kang es el único ocupante de la cápsula hasta morir; Seo Jun permanece completamente fuera.

## MAPA DE INTERPRETACION Y CONTINUIDAD

- mapa_emocional: incredulidad del hook → cansancio humilde → alerta → decisión → esfuerzo → shock de transferencia → control instintivo → alivio con dolor → miedo social → amenaza estatal.
- cadena_espacial: Seo Jun trabaja fuera de cinta; Mira y niño quedan dentro; Seo Jun cruza; pulso golpea convoy; cápsula cae junto a columna con Kang dentro; Kang alcanza a Seo Jun fuera; Seo Jun lanza daño al perro; círculo de agentes se cierra.
- cadena_estados_amenaza: perro atrapado/latente → grieta encendida → pulso → columna cae → perro recibe daño → placas rotas → grieta apagada.
- reacciones_obligatorias: alerta de Seo Jun; esfuerzo de Mira; shock ante Kang; dolor de transferencia; alivio del niño; miedo de Mira; control de Ryu.

## MONOLOGO_LOCKED

[low] El villano más grande de Corea murió frente a mí.

Pero antes me eligió como heredero.

Y ahora el Estado quiere ejecutarme.

[pause]

EL BARRENDERO DE LA RUINA

Yo era un Barrendero sin poderes.

Los combatientes mataban monstruos. Nosotros limpiábamos después.

Esa noche necesitaba terminar el turno para pagar la renta.

El convoy del Orquestador debía esperar a que despejáramos el túnel.

La Autoridad entró antes. No iba a retrasarse por trabajadores como nosotros.

Entonces vi al perro negro.

Era alto, no tenía ojos y seguía atrapado bajo una columna.

Una grieta morada latía en su pecho.

Cuando esa luz pulsaba, el daño corría por todo lo conectado.

Mi compañera estaba dentro de la cinta. Un niño seguía atrapado junto a ella.

[urgent] La grieta se encendió.

El pavimento se abrió.

La columna empezó a caer.

Yo crucé la cinta.

Tomé al niño del brazo mientras mi compañera lo empujaba hacia mí.

El mismo pulso golpeó las ruedas del convoy.

La cápsula salió despedida

y se abrió contra la columna.

Dentro estaba el Orquestador. Vivo. Herido. Atado con correas blancas y un collar de metal.

Me miró directo.

—Tú también cargas lo que ellos dejan atrás.

La columna cedió sobre nosotros.

[strained] El Orquestador rompió una mano contra la correa

y me tocó el pecho.

Algo rojo y negro entró en mí.

De pronto vi el daño dentro de la columna y bajo nuestros pies.

Extendí las manos.

Las líneas rojas salieron del concreto.

Todo ese daño giró alrededor de mis brazos.

[impact] Y lo lancé directo al perro.

Las grietas dejaron de avanzar bajo el niño y mi compañera.

El golpe lo arrancó de la columna. Sus placas negras reventaron.

La luz morada se apagó.

El niño estaba a salvo.

Pero mi brazo crujió.

Marcas negras subieron bajo mi piel.

Mi compañera me miró como si yo fuera el siguiente monstruo.

El Orquestador dejó caer la cabeza dentro de la cápsula.

La capitana levantó su escáner.

La pantalla marcó: FIRMA DEL ORQUESTADOR.

[tense] Todos los rifles giraron hacia mí.

—Objetivo de ejecución confirmado.

## HANDOFF_NARRATIVO_V5_3

- handoff_version: "5.3"

### COLD_VIEWER_CONTRACT

- hook_promise: Un trabajador sin poderes hereda al villano y el Estado intenta ejecutarlo.
- role_known_by_beat: B02
- immediate_goal_known_by_beat: B02
- danger_known_by_beat: B03
- rule_known_by_beat: B03
- emotional_reason_known_by_beat: B04
- irreversible_change_known_by_beat: B07
- terms_first_quarter: [Barrendero, Orquestador]
- assumed_prior_knowledge: none
- deliberately_unanswered: [por qué Kang lo eligió, verdad estatal, alcance total del poder]

### CONTINUITY_LEDGER

- entities:
  - seo_jun:
    - visual_signature: hombre coreano joven, cabello negro corto y desordenado, overol gris con franjas amarillas reflectantes, guantes gastados y botas reparadas.
    - initial_location: tunnel_work_zone, fuera de la cinta roja y completamente fuera de la cápsula.
    - initial_condition: sin poder, sin marcas, cansado pero ileso.
    - owns_or_carries: [escoba industrial, guantes de trabajo, gafete laboral]
    - state_changes:
      - beat_id: B04
        from: fuera de la cinta, observando el peligro.
        to: dentro de la zona acordonada, avanzando hacia Mira y el niño.
        caused_by: decide rescatarlos cuando la columna empieza a caer.
      - beat_id: B07
        from: sin poder y sin marcas.
        to: portador de la Herencia del Orquestador, todavía sin fisuras de costo visibles.
        caused_by: Kang lo toca desde el interior de la cápsula y le transfiere el poder.
      - beat_id: B09
        from: poder acumulado alrededor de ambos brazos.
        to: brazo lesionado y fisuras negras persistentes bajo su propia piel.
        caused_by: descarga el daño contra el perro y copia parte de ese daño en su cuerpo.
      - beat_id: B11
        from: tunnel_hazard_zone frente a la línea de agentes.
        to: centro del círculo físico de agentes en tunnel_hazard_zone.
        caused_by: los agentes cierran el cerco tras confirmarse la firma.
  - park_mira:
    - visual_signature: mujer coreana adulta, cabello oscuro corto recogido y uniforme gris/amarillo de cuadrilla.
    - initial_location: tunnel_hazard_zone, dentro de la cinta roja y junto al niño.
    - initial_condition: ilesa, esforzándose por sacar al niño.
    - owns_or_carries: [guantes de trabajo]
    - state_changes:
      - beat_id: B05
        from: protege al niño dentro del punto de peligro.
        to: empuja al niño fuera de la vertical inmediata de la columna, pero ambos siguen sobre la superficie conectada al daño.
        caused_by: coordina el rescate con Seo Jun.
      - beat_id: B10
        from: alivio breve al ver al niño vivo.
        to: retrocede con miedo ante las marcas de Seo Jun.
        caused_by: interpreta la firma visible como la del villano.
  - nino_atrapado:
    - visual_signature: niño coreano pequeño con impermeable mostaza.
    - initial_location: tunnel_hazard_zone, dentro de la cinta y junto a Park Mira.
    - initial_condition: atrapado en la trayectoria de la columna y del daño conectado.
    - owns_or_carries: []
    - state_changes:
      - beat_id: B05
        from: bajo la zona inmediata de aplastamiento.
        to: desplazado lateralmente por Seo Jun y Mira; fuera de la vertical de la columna, pero aún dentro de la red de grietas activas.
        caused_by: Seo Jun tira de su brazo mientras Mira lo empuja.
      - beat_id: B09
        from: expuesto a las grietas conectadas.
        to: a salvo, ileso y junto a Mira.
        caused_by: las grietas se detienen y la columna termina de asentarse sin alcanzarlo.
  - kang_muyeol:
    - visual_signature: hombre coreano adulto, cabello negro largo, rostro pálido y herido, ropa negra dañada, correas blancas y aro metálico.
    - initial_location: capsule_orchestrator, único ocupante, montada en el convoy.
    - initial_condition: vivo, herido e inmovilizado.
    - owns_or_carries: [herencia_orquestador]
    - state_changes:
      - beat_id: B05
        from: oculto dentro de la cápsula cerrada sobre el convoy.
        to: visible dentro de la cápsula abierta junto a la columna; nunca sale.
        caused_by: el pulso lanza la cápsula y rompe su cierre.
      - beat_id: B07
        from: restringido con ambas manos dentro de la cápsula.
        to: una mano lesionada y extendida por la abertura; poder transferido a Seo Jun.
        caused_by: rompe la mano contra la correa para alcanzar el pecho de Seo Jun.
      - beat_id: B10
        from: agotado pero consciente dentro de la cápsula.
        to: fallecido, inmóvil y todavía único ocupante de la cápsula.
        caused_by: completa la transferencia y deja caer la cabeza sin volver a responder.
  - resto_perro_negro:
    - visual_signature: criatura canina alta sin ojos, placas negras y una sola grieta morada en el pecho.
    - initial_location: tunnel_hazard_zone, atrapado debajo de la columna, screen-right/background.
    - initial_condition: latente pero activo; grieta morada encendida.
    - owns_or_carries: [damage_pulse_purple]
    - state_changes:
      - beat_id: B04
        from: atrapado y pulsando débilmente.
        to: emite un pulso que abre el pavimento y debilita la columna.
        caused_by: la grieta morada se enciende.
      - beat_id: B09
        from: atrapado, placas intactas y grieta activa.
        to: expulsado de debajo de la columna, placas rotas, inmóvil y grieta morada totalmente apagada.
        caused_by: recibe la descarga de daño de Seo Jun.
  - ryu_haejin:
    - visual_signature: mujer coreana adulta, cabello oscuro firme, armadura blanca/negra de mando y escáner portátil.
    - initial_location: tunnel_convoy_lane, fuera de la cápsula y junto a los agentes.
    - initial_condition: controlada, supervisando el traslado.
    - owns_or_carries: [scanner_signature]
    - state_changes:
      - beat_id: B10
        from: observa la anomalía de poder.
        to: confirma la firma de Seo Jun con el escáner.
        caused_by: apunta el dispositivo al portador marcado.
      - beat_id: B11
        from: identificación confirmada en tunnel_convoy_lane.
        to: borde del círculo físico en tunnel_hazard_zone, donde ordena la ejecución mientras los agentes apuntan.
        caused_by: aplica el protocolo estatal contra la firma del Orquestador.
  - combatientes_siluetas:
    - visual_signature: dos o tres adultos con armadura azul marino, siluetas nítidas y separadas, alejándose del área ya combatida.
    - initial_location: salida lejana de tunnel_work_zone durante B02.
    - initial_condition: operación terminada; abandonan el sitio mientras Seo Jun comienza a limpiar.
    - owns_or_carries: []
    - state_changes: []
  - state_agents:
    - visual_signature: agentes adultos con armadura blanca/negra y rifles físicos.
    - initial_location: tunnel_convoy_lane, alrededor del convoy.
    - initial_condition: alerta de escolta, armas todavía sin apuntar a Seo Jun.
    - owns_or_carries: [physical_rifles]
    - state_changes:
      - beat_id: B11
        from: formación de escolta.
        to: círculo físico alrededor de Seo Jun con cañones orientados hacia él.
        caused_by: confirmación de la firma y orden de Ryu.
- containers:
  - capsule_orchestrator:
    - location_id: tunnel_convoy_lane hasta B05; tunnel_hazard_zone junto a la columna desde B05.
    - initial_state: cerrada, asegurada al convoy y con interior visible solo a través del material transparente.
    - initial_occupants: [kang_muyeol]
    - occupancy_changes:
      - beat_id: B05
        action: se desprende, golpea junto a la columna y se abre con la abertura orientada hacia Seo Jun.
        occupants_after: [kang_muyeol]
      - beat_id: B07
        action: Kang extiende solo una mano por la abertura; su torso y el resto del cuerpo permanecen dentro.
        occupants_after: [kang_muyeol]
      - beat_id: B10
        action: Kang muere dentro; nadie entra ni sale.
        occupants_after: [kang_muyeol]
- powers_and_marks:
  - inheritance_damage_lines:
    - owner: kang_muyeol hasta el contacto de B07; seo_jun desde el final de B07.
    - first_appears_after_beat: B07
    - visible_state_before: dormido dentro de Kang; sin líneas ni marcas visibles en Seo Jun, Mira, niño, Ryu o agentes.
    - visible_state_after: energía con núcleo negro y bordes rojos luminosos entra en Seo Jun; en B08 sale del concreto y gira solo alrededor de sus brazos.
    - forbidden_on_entities: [park_mira, nino_atrapado, ryu_haejin, state_agents]
  - seo_cost_fissures:
    - owner: seo_jun
    - first_appears_after_beat: B09
    - visible_state_before: ausentes incluso durante B07 y B08.
    - visible_state_after: fisuras negras bajo la piel de su brazo con destellos rojos internos; persisten en B10 y B11.
    - forbidden_on_entities: [kang_muyeol, park_mira, nino_atrapado, ryu_haejin, state_agents]
  - damage_pulse_purple:
    - owner: resto_perro_negro
    - first_appears_after_beat: B03
    - visible_state_before: una única grieta morada late en el pecho del perro y transmite grietas por superficies conectadas.
    - visible_state_after: totalmente apagada desde B09; no vuelve a brillar.
    - forbidden_on_entities: [seo_jun, park_mira, nino_atrapado, kang_muyeol, ryu_haejin, state_agents]
- location_lock: todos los beats lineales ocurren dentro de tunnel_work_zone/tunnel_hazard_zone/tunnel_convoy_lane, tres sectores continuos del mismo túnel; no existe exterior, calle abierta ni cambio de noche.

### STORY_BEATS

#### B01 — Hook y título
- beat_id: B01
- narrative_function: adelanto retrospectivo literal de muerte, transferencia, consecuencia personal y título.
- monologue_span_exact: |
    [low] El villano más grande de Corea murió frente a mí.

    Pero antes me eligió como heredero.

    Y ahora el Estado quiere ejecutarme.

    [pause]

    EL BARRENDERO DE LA RUINA
- cold_viewer_info:
  - new_fact: el villano murió frente al narrador, lo eligió como heredero y el Estado ahora quiere ejecutarlo.
  - visible_proof: Kang muere dentro de la cápsula frente a Seo Jun; antes, su mano toca el pecho de Seo y transfiere energía rojo-negra Kang→Seo; la persecución se fija con card literal.
  - must_not_assume: cómo murió Kang, qué heredó Seo Jun o por qué el Estado lo persigue.
- location_id: hook_retrospective
- location_context: adelanto del mismo túnel en dos instantes futuros de esta Parte; no altera los estados iniciales de la línea temporal que empieza en B02.
- present_entities: [seo_jun, kang_muyeol, capsule_orchestrator]
- spatial_truth:
  - seo_jun:
    - position_relation: completamente fuera de la cápsula, frente a Kang; primero testigo de su muerte y luego receptor en el recuerdo anterior.
    - inside_container: false
    - contact_with: [mano_de_kang_solo_en_transferencia]
  - kang_muyeol:
    - position_relation: único ocupante de la cápsula abierta; su cuerpo permanece dentro en ambos instantes.
    - inside_container: capsule_orchestrator
    - contact_with: [seo_jun_solo_con_una_mano]
- before_state:
  - seo_jun:
    - condition: el hook previsualiza el futuro; B02 reinicia correctamente sin poder ni marcas.
    - action_status: presencia la muerte y recibe la transferencia en instantes retrospectivos distintos.
  - kang_muyeol:
    - condition: vivo durante la transferencia y fallecido en el instante de muerte, siempre dentro de la cápsula.
    - action_status: transfiere antes de morir.
- atomic_actions:
  - actor: kang_muyeol
    verb: muere
    target: seo_jun como testigo
    origin: interior de capsule_orchestrator
    trajectory_or_contact: Kang deja caer la cabeza mientras Seo permanece fuera
    destination: mirada de Seo Jun
    result: la muerte del villano queda demostrada.
  - actor: kang_muyeol
    verb: elige y transfiere
    target: seo_jun
    origin: mano de Kang dentro de la cápsula
    trajectory_or_contact: contacto físico mano-pecho y energía rojo-negra Kang→Seo
    destination: pecho de Seo Jun fuera de la cápsula
    result: Seo Jun queda elegido como heredero.
- after_state:
  - viewer_contract:
    - condition: vio quién murió, quién entregó el poder, quién lo recibió y conoce la persecución.
    - location: no aplica.
    - owns_or_carries: [pregunta_sobre_la_herencia]
- emotional_contract:
  - emotional_trigger: un trabajador será heredero del villano muerto y condenado por el Estado.
  - emotional_subject: seo_jun_voiceover
  - required_visible_reaction: shock de Seo ante muerte y transferencia; Kang agotado, nunca neutral.
  - forbidden_neutral_reaction: presentación genérica sin amenaza personal.
- forbidden_implications: [seo_jun dentro de la cápsula, Kang omitido, energía naciendo de pared o UI, rifles sustituyendo la muerte, poder ya usado al iniciar B02, explicación de la conspiración]
- causal_link_next: explicar por qué Seo Jun estaba en el túnel.

#### B02 — Rol, desigualdad y objetivo
- beat_id: B02
- narrative_function: presentar rol, desigualdad, objetivo económico e invasión del convoy.
- monologue_span_exact: |
    Yo era un Barrendero sin poderes.

    Los combatientes mataban monstruos. Nosotros limpiábamos después.

    Esa noche necesitaba terminar el turno para pagar la renta.

    El convoy del Orquestador debía esperar a que despejáramos el túnel.

    La Autoridad entró antes. No iba a retrasarse por trabajadores como nosotros.
- cold_viewer_info:
  - new_fact: Seo Jun limpia después de los combatientes, no tiene poderes y necesita cobrar para pagar la renta.
  - visible_proof: dos o tres combatientes azul marino se alejan de restos de monstruo mientras Seo limpia detrás; luego el convoy armado cruza el límite que debía respetar.
  - must_not_assume: que Seo Jun es combatiente, que conoce a Kang o que la amenaza ya comenzó.
- location_id: tunnel_work_zone
- location_context: zona civil de trabajo conectada visualmente con el carril central por donde el convoy invade el perímetro.
- present_entities: [seo_jun, combatientes_siluetas, park_mira, ryu_haejin, state_agents, capsule_orchestrator, kang_muyeol]
- spatial_truth:
  - seo_jun:
    - position_relation: zona de trabajo, fuera de la cinta roja y separado del carril central.
    - inside_container: false
    - contact_with: [herramientas_de_limpieza]
  - park_mira:
    - position_relation: más adelante, ya dentro del sector acordonado continuo al área de trabajo; todavía no ejecuta el rescate.
    - inside_container: false
    - contact_with: []
  - capsule_orchestrator:
    - position_relation: asegurada sobre el convoy que entra por el carril central.
    - inside_container: false
    - contact_with: [convoy_vehicle]
  - kang_muyeol:
    - position_relation: oculto y restringido en el único asiento interior de la cápsula.
    - inside_container: capsule_orchestrator
    - contact_with: [correas_blancas, aro_metalico]
  - ryu_haejin:
    - position_relation: junto al convoy, fuera de la cápsula.
    - inside_container: false
    - contact_with: [scanner_signature]
- before_state:
  - seo_jun:
    - condition: sin poder, sin marcas, trabajando.
    - action_status: intenta terminar el turno.
  - convoy_vehicle:
    - condition: debía permanecer detrás del límite de la cuadrilla.
    - action_status: preparado para avanzar.
- atomic_actions:
  - actor: combatientes_siluetas
    verb: se alejan
    target: restos de monstruo
    origin: zona ya combatida
    trajectory_or_contact: dos o tres siluetas azul marino abandonan el fondo mientras Seo Jun queda detrás
    destination: salida lejana del túnel
    result: la jerarquía combatientes primero, Barrenderos después queda visible.
  - actor: seo_jun
    verb: limpia
    target: restos de la operación
    origin: tunnel_work_zone
    trajectory_or_contact: uniforme y herramienta civil sobre el suelo mojado
    destination: zona que los combatientes dejan atrás
    result: su rol sin poderes queda demostrado.
  - actor: state_authority
    verb: hace avanzar
    target: convoy_vehicle
    origin: acceso reforzado del túnel
    trajectory_or_contact: cruza el límite operativo de la cuadrilla por el carril central
    destination: tunnel_convoy_lane junto a los Barrenderos
    result: civiles y escolta comparten la misma zona antes de que termine la revisión.
- after_state:
  - seo_jun:
    - condition: molesto pero concentrado; sigue sin poder y sin marcas.
    - location: tunnel_work_zone, fuera de la cinta.
    - owns_or_carries: [herramientas_de_limpieza]
  - convoy_vehicle:
    - condition: dentro de la zona que debía esperar.
    - location: tunnel_convoy_lane.
    - owns_or_carries: [capsule_orchestrator]
- emotional_contract:
  - emotional_trigger: la Autoridad arriesga a trabajadores invisibles para no retrasarse.
  - emotional_subject: seo_jun
  - required_visible_reaction: cansancio y molestia controlada; continúa trabajando por necesidad.
  - forbidden_neutral_reaction: pose heroica, entusiasmo de combate o miedo extremo prematuro.
- forbidden_implications: [combate previo de Seo Jun, Seo Jun armado, Kang visible fuera de la cápsula, segundo ocupante, cambio de escenario, poder o marcas antes de B07]
- causal_link_next: el oficio de Seo Jun le permite detectar el peligro ignorado.

#### B03 — Amenaza y regla
- beat_id: B03
- narrative_function: revelar amenaza concreta y regla visual de propagación.
- monologue_span_exact: |
    Entonces vi al perro negro.

    Era alto, no tenía ojos y seguía atrapado bajo una columna.

    Una grieta morada latía en su pecho.

    Cuando esa luz pulsaba, el daño corría por todo lo conectado.
- cold_viewer_info:
  - new_fact: una criatura todavía activa permanece atrapada y su grieta morada transmite daño por superficies conectadas.
  - visible_proof: perro sin ojos debajo de la columna; única grieta morada del pecho latiendo; marcas conectadas sobre el concreto.
  - must_not_assume: que el perro está libre, que ya atacó o que Seo Jun posee una solución.
- location_id: tunnel_hazard_zone
- location_context: sector acordonado continuo a tunnel_work_zone, con perro, columna y superficies conectadas visibles.
- present_entities: [seo_jun, park_mira, nino_atrapado, resto_perro_negro, capsule_orchestrator, kang_muyeol]
- spatial_truth:
  - seo_jun:
    - position_relation: fuera de la cinta, mirando desde screen-left hacia la amenaza screen-right/background.
    - inside_container: false
    - contact_with: []
  - resto_perro_negro:
    - position_relation: debajo de la columna, inmovilizado y separado de Seo Jun por la cinta roja.
    - inside_container: false
    - contact_with: [columna_danada, suelo_conectado]
  - park_mira:
    - position_relation: dentro de la cinta, junto al niño y todavía detrás de la amenaza respecto de Seo Jun.
    - inside_container: false
    - contact_with: [nino_atrapado]
  - nino_atrapado:
    - position_relation: junto a Mira, dentro de la zona conectada; todavía no movido.
    - inside_container: false
    - contact_with: [park_mira]
  - kang_muyeol:
    - position_relation: oculto dentro de la cápsula montada en el convoy.
    - inside_container: capsule_orchestrator
    - contact_with: [correas_blancas]
- before_state:
  - resto_perro_negro:
    - condition: atrapado, placas intactas y grieta morada activa pero sin descarga completa.
    - action_status: late débilmente.
  - seo_jun:
    - condition: sin poder ni marcas.
    - action_status: inspecciona la zona.
- atomic_actions:
  - actor: resto_perro_negro
    verb: hace latir
    target: damage_pulse_purple
    origin: única grieta morada de su pecho
    trajectory_or_contact: brillo contenido sobre columna y suelo conectados
    destination: red de superficies dañadas del tunnel_hazard_zone
    result: Seo Jun identifica la regla antes de la descarga.
- after_state:
  - resto_perro_negro:
    - condition: todavía atrapado y activo; grieta morada encendida.
    - location: debajo de la columna en tunnel_hazard_zone.
    - owns_or_carries: [damage_pulse_purple]
  - seo_jun:
    - condition: alerta, todavía fuera de la cinta.
    - location: tunnel_work_zone.
    - owns_or_carries: []
- emotional_contract:
  - emotional_trigger: la zona declarada operativa conserva una amenaza capaz de propagarse.
  - emotional_subject: seo_jun
  - required_visible_reaction: atención precisa que cambia a alarma; ojos sobre la grieta, no sobre cámara.
  - forbidden_neutral_reaction: rostro inexpresivo o pose relajada ante el pulso.
- forbidden_implications: [perro libre, luz morada apagada, placas rotas, ataque consumado, niño a salvo, Seo Jun con poder]
- causal_link_next: mostrar a las personas atrapadas antes de que la grieta descargue.

#### B04 — Personas en riesgo y decisión
- beat_id: B04
- narrative_function: convertir la regla en peligro humano y demostrar la decisión de Seo Jun.
- monologue_span_exact: |
    Mi compañera estaba dentro de la cinta. Un niño seguía atrapado junto a ella.

    [urgent] La grieta se encendió.

    El pavimento se abrió.

    La columna empezó a caer.

    Yo crucé la cinta.
- cold_viewer_info:
  - new_fact: Mira y un niño están dentro de la zona conectada; Seo Jun entra cuando el pulso empieza a derrumbarla.
  - visible_proof: Mira cubre al niño, la grieta del perro se enciende, el pavimento se abre y Seo Jun cruza físicamente la cinta.
  - must_not_assume: que el rescate terminó, que Seo Jun tiene poderes o que la columna ya cayó por completo.
- location_id: tunnel_hazard_zone
- location_context: sector dentro de la cinta donde Mira y el niño están bajo la columna; el convoy permanece en el carril contiguo.
- present_entities: [seo_jun, park_mira, nino_atrapado, resto_perro_negro, convoy_vehicle, capsule_orchestrator, kang_muyeol]
- spatial_truth:
  - seo_jun:
    - position_relation: empieza fuera de la cinta, screen-left/foreground, orientado hacia Mira y el niño.
    - inside_container: false
    - contact_with: [cinta_roja_al_cruzarla]
  - park_mira:
    - position_relation: dentro de la cinta, entre el niño y parte del peligro.
    - inside_container: false
    - contact_with: [nino_atrapado]
  - nino_atrapado:
    - position_relation: junto a Mira y todavía dentro de la vertical de riesgo de la columna.
    - inside_container: false
    - contact_with: [park_mira]
  - resto_perro_negro:
    - position_relation: debajo de la columna, sin desplazarse.
    - inside_container: false
    - contact_with: [columna_danada, suelo_conectado]
  - kang_muyeol:
    - position_relation: oculto dentro de la cápsula todavía sujeta al convoy.
    - inside_container: capsule_orchestrator
    - contact_with: [correas_blancas]
- before_state:
  - seo_jun:
    - condition: sin poder, sin marcas y fuera de la zona acordonada.
    - action_status: observa a las personas en riesgo.
  - park_mira:
    - condition: dentro de la cinta, protege al niño.
    - action_status: busca cómo moverlo.
  - resto_perro_negro:
    - condition: atrapado con grieta morada activa.
    - action_status: a punto de descargar.
- atomic_actions:
  - actor: resto_perro_negro
    verb: enciende
    target: damage_pulse_purple
    origin: grieta morada del pecho
    trajectory_or_contact: el pulso entra en el suelo conectado
    destination: pavimento y base de la columna
    result: el pavimento se abre.
  - actor: columna_danada
    verb: empieza a caer
    target: zona donde están Mira y el niño
    origin: soporte debilitado sobre el perro
    trajectory_or_contact: descenso incompleto; todavía no impacta
    destination: vertical de riesgo del tunnel_hazard_zone
    result: activa el reloj físico del rescate.
  - actor: seo_jun
    verb: cruza
    target: cinta_roja
    origin: tunnel_work_zone
    trajectory_or_contact: avanza hacia Mira y el niño
    destination: tunnel_hazard_zone
    result: entra sin poder; el rescate aún no se completa.
- after_state:
  - seo_jun:
    - condition: dentro de la zona, sin poder ni marcas.
    - location: tunnel_hazard_zone, acercándose al niño.
    - owns_or_carries: []
  - park_mira:
    - condition: todavía protege al niño.
    - location: dentro de la cinta.
    - owns_or_carries: []
  - nino_atrapado:
    - condition: todavía no desplazado y en peligro.
    - location: vertical de riesgo de la columna.
    - owns_or_carries: []
- emotional_contract:
  - emotional_trigger: Seo Jun puede conservar su seguridad o entrar por dos personas sin protección.
  - emotional_subject: seo_jun
  - required_visible_reaction: decisión clara, mandíbula firme y cuerpo proyectado hacia delante.
  - forbidden_neutral_reaction: caminar casualmente, sonreír o mirar a cámara.
- forbidden_implications: [Mira o niño ya seguros, Seo Jun con marcas, perro liberado, cápsula abierta, columna ya asentada, rescate completado]
- causal_link_next: Seo Jun y Mira deben mover físicamente al niño antes del impacto.

#### B05 — Rescate y accidente del convoy
- beat_id: B05
- narrative_function: ejecutar el rescate parcial y causar la apertura de la cápsula.
- monologue_span_exact: |
    Tomé al niño del brazo mientras mi compañera lo empujaba hacia mí.

    El mismo pulso golpeó las ruedas del convoy.

    La cápsula salió despedida

    y se abrió contra la columna.
- cold_viewer_info:
  - new_fact: Seo Jun y Mira logran mover al niño, pero el mismo pulso arroja la cápsula del Orquestador junto a ellos.
  - visible_proof: manos de ambos adultos sobre el niño; ruedas del convoy golpeadas; cápsula desprendida y abierta junto a la columna.
  - must_not_assume: que el niño ya salió de toda la zona de daño, que Kang salió o que Seo Jun entró en la cápsula.
- location_id: tunnel_hazard_zone
- location_context: rescate dentro de la cinta; el pulso alcanza tunnel_convoy_lane y arroja la cápsula de vuelta junto a la columna.
- present_entities: [seo_jun, park_mira, nino_atrapado, resto_perro_negro, convoy_vehicle, capsule_orchestrator, kang_muyeol, ryu_haejin, state_agents]
- spatial_truth:
  - seo_jun:
    - position_relation: dentro de la cinta, del lado de salida del niño; completamente fuera de la cápsula.
    - inside_container: false
    - contact_with: [brazo_del_nino]
  - park_mira:
    - position_relation: al otro lado del niño, dentro de la zona conectada.
    - inside_container: false
    - contact_with: [espalda_y_hombro_del_nino]
  - nino_atrapado:
    - position_relation: se mueve lateralmente entre ambos adultos, alejándose de la vertical directa de la columna pero sin salir aún de la superficie conectada.
    - inside_container: false
    - contact_with: [seo_jun, park_mira]
  - capsule_orchestrator:
    - position_relation: empieza asegurada al convoy; termina recostada junto a la columna, con la abertura orientada hacia Seo Jun.
    - inside_container: false
    - contact_with: [convoy_vehicle_al_inicio, suelo_y_columna_al_final]
  - kang_muyeol:
    - position_relation: único ocupante, sujeto dentro durante todo el desplazamiento.
    - inside_container: capsule_orchestrator
    - contact_with: [correas_blancas, aro_metalico]
  - resto_perro_negro:
    - position_relation: continúa atrapado debajo de la columna, sin cambiar de pose a un ataque libre.
    - inside_container: false
    - contact_with: [columna_danada]
- before_state:
  - nino_atrapado:
    - condition: dentro de la vertical inmediata de aplastamiento.
    - action_status: todavía inmóvil.
  - capsule_orchestrator:
    - condition: cerrada y sujeta al convoy.
    - action_status: transporta únicamente a Kang.
  - kang_muyeol:
    - condition: vivo, restringido y oculto dentro.
    - action_status: no ha tocado a Seo Jun.
- atomic_actions:
  - actor: seo_jun
    verb: toma
    target: brazo_del_nino
    origin: lado de salida del rescate
    trajectory_or_contact: tira lateralmente, lejos de la vertical de la columna
    destination: borde lateral de la zona de aplastamiento
    result: inicia el desplazamiento del niño.
  - actor: park_mira
    verb: empuja
    target: nino_atrapado
    origin: lado interior de la zona de peligro
    trajectory_or_contact: acompaña el mismo movimiento lateral de Seo Jun
    destination: hacia Seo Jun
    result: el niño sale de la vertical inmediata, pero sigue sobre suelo conectado.
  - actor: damage_pulse_purple
    verb: recorre
    target: ruedas_del_convoy
    origin: suelo conectado bajo la columna
    trajectory_or_contact: propagación continua por el pavimento
    destination: tunnel_convoy_lane
    result: el convoy recibe un golpe lateral.
  - actor: capsule_orchestrator
    verb: sale despedida y se abre
    target: suelo_junto_a_la_columna
    origin: soporte del convoy
    trajectory_or_contact: trayectoria lateral única; golpea y rompe el cierre sin invertir ocupantes
    destination: tunnel_hazard_zone, a distancia de un brazo extendido de Seo Jun
    result: abertura orientada hacia Seo Jun; Kang queda visible y completamente dentro.
- after_state:
  - nino_atrapado:
    - condition: fuera de la vertical inmediata, pero todavía amenazado por grietas conectadas y escombros.
    - location: tunnel_hazard_zone junto a Seo Jun y Mira.
    - owns_or_carries: []
  - capsule_orchestrator:
    - condition: abierta, inmóvil y con un solo ocupante.
    - location: junto a la columna, abertura orientada hacia Seo Jun.
    - owns_or_carries: [kang_muyeol]
  - kang_muyeol:
    - condition: vivo, herido, restringido y visible; no ha salido.
    - location: interior de capsule_orchestrator.
    - owns_or_carries: [herencia_orquestador]
  - seo_jun:
    - condition: ileso, sin poder y completamente fuera de la cápsula.
    - location: frente a la abertura, dentro de la zona acordonada.
    - owns_or_carries: []
- emotional_contract:
  - emotional_trigger: el rescate avanza, pero el accidente acerca al prisionero más peligroso.
  - emotional_subject: [seo_jun, park_mira]
  - required_visible_reaction: esfuerzo corporal claro y sorpresa inmediata por el impacto de la cápsula.
  - forbidden_neutral_reaction: niño celebrando, adultos relajados o Kang posando libre.
- forbidden_implications: [Kang fuera de la cápsula, Seo Jun dentro, niño completamente a salvo, segundo ocupante, contacto de transferencia, marcas en Seo Jun, perro moviéndose libre]
- causal_link_next: la abertura revela a Kang y establece un contacto físicamente posible sin cambiar ocupantes.

#### B06 — Revelación del Orquestador
- beat_id: B06
- narrative_function: revelar al supuesto villano, establecer reconocimiento y renovar el reloj de caída.
- monologue_span_exact: |
    Dentro estaba el Orquestador. Vivo. Herido. Atado con correas blancas y un collar de metal.

    Me miró directo.

    —Tú también cargas lo que ellos dejan atrás.

    La columna cedió sobre nosotros.
- cold_viewer_info:
  - new_fact: el Orquestador sigue vivo, reconoce algo en Seo Jun y ambos quedan bajo una nueva caída.
  - visible_proof: Kang atado dentro de la cápsula mira a Seo Jun a través de la abertura; la columna vuelve a descender.
  - must_not_assume: que Kang está libre, que ya transfirió el poder o que Seo Jun sabe por qué fue reconocido.
- location_id: tunnel_hazard_zone
- location_context: cápsula abierta junto a la columna, Kang dentro y Seo Jun completamente fuera frente a la abertura.
- present_entities: [seo_jun, park_mira, nino_atrapado, kang_muyeol, capsule_orchestrator, resto_perro_negro, ryu_haejin, state_agents]
- spatial_truth:
  - kang_muyeol:
    - position_relation: único ocupante, torso y piernas dentro; abertura frente a Seo Jun.
    - inside_container: capsule_orchestrator
    - contact_with: [correas_blancas, aro_metalico]
  - seo_jun:
    - position_relation: arrodillado o inclinado completamente fuera de la abertura; su pecho queda a distancia de la mano plenamente extendida de Kang.
    - inside_container: false
    - contact_with: []
  - park_mira:
    - position_relation: junto al niño, lateral a Seo Jun y fuera de la vertical inmediata, pero sobre suelo conectado.
    - inside_container: false
    - contact_with: [nino_atrapado]
  - nino_atrapado:
    - position_relation: junto a Mira, fuera del impacto vertical directo y aún dentro de la zona de grietas.
    - inside_container: false
    - contact_with: [park_mira]
  - resto_perro_negro:
    - position_relation: sigue debajo de la columna; no ha sido expulsado.
    - inside_container: false
    - contact_with: [columna_danada]
- before_state:
  - kang_muyeol:
    - condition: vivo, herido, restringido dentro y visible.
    - action_status: todavía no ha tocado a Seo Jun.
  - seo_jun:
    - condition: sin poder, sin marcas y fuera de la cápsula.
    - action_status: reacciona al ocupante revelado.
  - columna_danada:
    - condition: inclinada, con soporte debilitado.
    - action_status: todavía no ha terminado de ceder.
- atomic_actions:
  - actor: kang_muyeol
    verb: mira y habla
    target: seo_jun
    origin: interior de capsule_orchestrator
    trajectory_or_contact: contacto visual directo, sin contacto de manos todavía
    destination: Seo Jun fuera de la abertura
    result: sugiere compatibilidad sin explicarla.
  - actor: columna_danada
    verb: cede
    target: zona ocupada por Seo Jun, Mira, niño y cápsula
    origin: soporte roto sobre el perro
    trajectory_or_contact: descenso renovado hacia el suelo; aún sin aplastar a nadie
    destination: tunnel_hazard_zone
    result: obliga a Kang a actuar en B07.
- after_state:
  - kang_muyeol:
    - condition: consciente, restringido y dentro; contacto físico todavía pendiente.
    - location: capsule_orchestrator.
    - owns_or_carries: [herencia_orquestador]
  - seo_jun:
    - condition: sorprendido, sin poder y sin marcas.
    - location: fuera de la abertura, a distancia de brazo.
    - owns_or_carries: []
  - columna_danada:
    - condition: cayendo sobre la zona, sin impacto final.
    - location: sobre tunnel_hazard_zone.
    - owns_or_carries: [damage_active]
- emotional_contract:
  - emotional_trigger: el villano nacional está vivo, lo reconoce y la caída deja segundos para reaccionar.
  - emotional_subject: [seo_jun, kang_muyeol]
  - required_visible_reaction: shock de Seo Jun; determinación dolorosa de Kang; urgencia corporal renovada.
  - forbidden_neutral_reaction: intercambio sereno, Kang sonriente o Seo Jun posando dentro de la cápsula.
- forbidden_implications: [Seo Jun dentro de la cápsula, Kang fuera o libre, segundo ocupante, contacto ya realizado, poder o marcas en Seo Jun, niño celebrando, perro neutralizado]
- causal_link_next: la caída y la distancia de brazo permiten que Kang sacrifique una mano y transfiera el poder.

#### B07 — Transferencia
- beat_id: B07
- narrative_function: producir el cambio irreversible y transferir con claridad el dueño del poder.
- monologue_span_exact: |
    [strained] El Orquestador rompió una mano contra la correa

    y me tocó el pecho.

    Algo rojo y negro entró en mí.
- cold_viewer_info:
  - new_fact: Kang se lesiona para alcanzar a Seo Jun y le entrega el poder rojo-negro.
  - visible_proof: mano de Kang rompe la restricción, sale por la abertura, toca el pecho de Seo Jun y una sola corriente entra en él.
  - must_not_assume: que Seo Jun entró, que Kang salió, que Mira recibió energía o que las marcas de costo ya aparecieron.
- location_id: tunnel_hazard_zone
- location_context: punto de contacto junto a capsule_orchestrator; abertura hacia Seo Jun y distancia exacta de un brazo.
- present_entities: [seo_jun, kang_muyeol, capsule_orchestrator, park_mira, nino_atrapado, resto_perro_negro]
- spatial_truth:
  - kang_muyeol:
    - position_relation: dentro de la cápsula; solo una mano atraviesa la abertura orientada hacia Seo Jun.
    - inside_container: capsule_orchestrator
    - contact_with: [correa_blanca_al_inicio, pecho_de_seo_jun_al_final]
  - seo_jun:
    - position_relation: completamente fuera; pecho frente a la abertura y dentro del alcance de esa mano.
    - inside_container: false
    - contact_with: [mano_lesionada_de_kang]
  - park_mira:
    - position_relation: lateral y detrás de Seo Jun, con el niño; nunca entre la mano y el pecho.
    - inside_container: false
    - contact_with: [nino_atrapado]
  - resto_perro_negro:
    - position_relation: todavía atrapado debajo de la columna, grieta morada activa.
    - inside_container: false
    - contact_with: [columna_danada]
- before_state:
  - kang_muyeol:
    - condition: vivo, restringido y dueño de herencia_orquestador.
    - action_status: una mano todavía retenida por la correa.
  - seo_jun:
    - condition: sin poder, sin marcas y fuera de la cápsula.
    - action_status: mira a Kang.
- atomic_actions:
  - actor: kang_muyeol
    verb: rompe
    target: su_mano_y_sujecion
    origin: interior de capsule_orchestrator
    trajectory_or_contact: fuerza los huesos contra la correa hasta liberar alcance, sin sacar el torso
    destination: abertura de la cápsula
    result: una mano lesionada puede extenderse.
  - actor: kang_muyeol
    verb: toca
    target: pecho_de_seo_jun
    origin: abertura orientada hacia Seo Jun
    trajectory_or_contact: mano visible y continua desde el brazo de Kang hasta el pecho
    destination: Seo Jun completamente fuera
    result: establece un único punto de transferencia.
  - actor: inheritance_damage_lines
    verb: se transfiere
    target: seo_jun
    origin: Kang y el punto de contacto de su mano
    trajectory_or_contact: corriente con núcleo negro y bordes rojos entra por el pecho; no salta a terceros
    destination: interior de Seo Jun
    result: Seo Jun se convierte en portador al final de B07.
- after_state:
  - kang_muyeol:
    - condition: mano lesionada, agotado, poder transferido y cuerpo todavía dentro.
    - location: capsule_orchestrator.
    - owns_or_carries: []
  - seo_jun:
    - condition: portador en shock; todavía sin fisuras negras de costo visibles.
    - location: fuera de capsule_orchestrator, tunnel_hazard_zone.
    - owns_or_carries: [inheritance_damage_lines]
  - park_mira:
    - condition: sin poder y sin marcas.
    - location: junto al niño.
    - owns_or_carries: []
- emotional_contract:
  - emotional_trigger: Kang destruye su propia mano para elegir al trabajador antes de que la columna los alcance.
  - emotional_subject: [kang_muyeol, seo_jun]
  - required_visible_reaction: dolor extremo de Kang y shock físico involuntario de Seo Jun.
  - forbidden_neutral_reaction: contacto casual, rostros neutros o Mira recibiendo la energía.
- forbidden_implications: [Mira marcada o energizada, Seo Jun dentro, Kang fuera, cápsula vacía, segundo ocupante, contacto sin mano visible, fisuras de costo antes de B09, más de una corriente de transferencia]
- causal_link_next: el nuevo dueño percibe el daño almacenado antes de descargarlo.

#### B08 — Percepción y extracción
- beat_id: B08
- narrative_function: hacer legible la función del poder y acumular la descarga antes del payoff.
- monologue_span_exact: |
    De pronto vi el daño dentro de la columna y bajo nuestros pies.

    Extendí las manos.

    Las líneas rojas salieron del concreto.

    Todo ese daño giró alrededor de mis brazos.
- cold_viewer_info:
  - new_fact: Seo Jun puede ver el daño dentro de objetos y extraerlo hacia sus brazos.
  - visible_proof: líneas de núcleo negro y bordes rojos salen de columna y concreto, convergen únicamente en sus brazos y todavía no golpean al perro.
  - must_not_assume: que el ataque ya salió, que el perro fue neutralizado o que el niño está a salvo.
- location_id: tunnel_hazard_zone
- location_context: Seo Jun permanece fuera de la cápsula entre los protegidos y el perro mientras extrae el daño.
- present_entities: [seo_jun, park_mira, nino_atrapado, resto_perro_negro, kang_muyeol, capsule_orchestrator]
- spatial_truth:
  - seo_jun:
    - position_relation: fuera de la cápsula, entre su abertura y la amenaza; ambos brazos extendidos hacia columna y suelo.
    - inside_container: false
    - contact_with: [inheritance_damage_lines]
  - park_mira:
    - position_relation: junto al niño, lateral y detrás de Seo Jun; no cruza las líneas de energía.
    - inside_container: false
    - contact_with: [nino_atrapado]
  - nino_atrapado:
    - position_relation: fuera de la vertical inmediata de la columna, pero sobre una superficie cuyas grietas aún no se han detenido.
    - inside_container: false
    - contact_with: [park_mira]
  - resto_perro_negro:
    - position_relation: atrapado debajo de la columna, frente a Seo Jun y aún sin recibir la descarga.
    - inside_container: false
    - contact_with: [columna_danada, damage_pulse_purple]
  - kang_muyeol:
    - position_relation: agotado dentro de la cápsula abierta detrás de Seo Jun.
    - inside_container: capsule_orchestrator
    - contact_with: [correas_blancas]
- before_state:
  - seo_jun:
    - condition: nuevo portador, sin fisuras de costo visibles.
    - action_status: acaba de recibir la energía y todavía no entiende el poder.
  - connected_damage:
    - condition: activo dentro de columna y pavimento; grietas continúan avanzando.
    - action_status: amenaza a Mira y al niño.
  - resto_perro_negro:
    - condition: atrapado, placas intactas y luz morada activa.
    - action_status: sigue originando el daño.
- atomic_actions:
  - actor: seo_jun
    verb: percibe
    target: connected_damage
    origin: columna y pavimento del tunnel_hazard_zone
    trajectory_or_contact: visión instintiva de líneas internas
    destination: comprensión inmediata de Seo Jun
    result: identifica qué debe extraer.
  - actor: seo_jun
    verb: extiende
    target: ambas_manos
    origin: frente a su pecho
    trajectory_or_contact: brazos abiertos hacia columna y suelo, sin tocar a Mira ni al niño
    destination: fuentes visibles de daño
    result: activa la extracción.
  - actor: inheritance_damage_lines
    verb: sale y converge
    target: brazos_de_seo_jun
    origin: concreto y columna conectados
    trajectory_or_contact: varias líneas con núcleo negro y borde rojo siguen trayectorias legibles sin impactar al perro
    destination: alrededor de ambos brazos de Seo Jun
    result: el daño queda acumulado para el lanzamiento; las grietas aún no se declaran detenidas.
- after_state:
  - seo_jun:
    - condition: concentrado, poder acumulado alrededor de ambos brazos y todavía sin fisuras de costo.
    - location: tunnel_hazard_zone, completamente fuera de la cápsula.
    - owns_or_carries: [inheritance_damage_lines_acumuladas]
  - connected_damage:
    - condition: parcialmente extraído, pero sus grietas visibles siguen avanzando hasta el lanzamiento de B09.
    - location: suelo bajo Mira y el niño.
    - owns_or_carries: [propagacion_pendiente]
  - resto_perro_negro:
    - condition: activo, intacto y con grieta morada encendida.
    - location: debajo de la columna.
    - owns_or_carries: [damage_pulse_purple]
- emotional_contract:
  - emotional_trigger: Seo Jun comprende un poder enorme mientras la amenaza todavía avanza bajo las personas que intenta salvar.
  - emotional_subject: seo_jun
  - required_visible_reaction: asombro que se transforma en concentración dolorosa y dirigida.
  - forbidden_neutral_reaction: rostro vacío, pose estática ornamental o mirada a cámara.
- forbidden_implications: [ataque ya lanzado, impacto en el perro, grietas detenidas antes de B09, niño a salvo, perro roto o apagado, fisuras negras en Seo Jun, energía en Mira]
- causal_link_next: Seo Jun debe descargar el daño acumulado directamente contra el perro.

#### B09 — Payoff y costo físico
- beat_id: B09
- narrative_function: entregar la mini-victoria, detener la propagación y cobrar el costo corporal.
- monologue_span_exact: |
    [impact] Y lo lancé directo al perro.

    Las grietas dejaron de avanzar bajo el niño y mi compañera.

    El golpe lo arrancó de la columna. Sus placas negras reventaron.

    La luz morada se apagó.

    El niño estaba a salvo.

    Pero mi brazo crujió.

    Marcas negras subieron bajo mi piel.
- cold_viewer_info:
  - new_fact: Seo Jun puede redirigir el daño para neutralizar al monstruo, pero su cuerpo copia parte del impacto.
  - visible_proof: trayectoria única desde sus brazos al perro; grietas detenidas; placas rotas; luz morada apagada; niño ileso; fisuras solo en el brazo de Seo Jun.
  - must_not_assume: que el costo desaparece, que Mira comparte las marcas o que el perro sigue activo.
- location_id: tunnel_hazard_zone
- location_context: misma geografía del lanzamiento; trayectoria Seo Jun→perro sin cruzar a Mira ni al niño.
- present_entities: [seo_jun, park_mira, nino_atrapado, resto_perro_negro, kang_muyeol, capsule_orchestrator, ryu_haejin, state_agents]
- spatial_truth:
  - seo_jun:
    - position_relation: completamente fuera de la cápsula, anclado entre protegidos y perro; brazos dirigidos hacia la criatura.
    - inside_container: false
    - contact_with: [inheritance_damage_lines_al_inicio]
  - resto_perro_negro:
    - position_relation: comienza debajo de la columna y termina expulsado hacia el espacio libre frente a ella.
    - inside_container: false
    - contact_with: [columna_danada_al_inicio, suelo_al_final]
  - park_mira:
    - position_relation: junto al niño, fuera de la trayectoria Seo Jun→perro.
    - inside_container: false
    - contact_with: [nino_atrapado]
  - nino_atrapado:
    - position_relation: fuera de la vertical inmediata; nunca entra en la trayectoria del ataque.
    - inside_container: false
    - contact_with: [park_mira]
  - kang_muyeol:
    - position_relation: dentro de la cápsula abierta detrás de Seo Jun; nunca ocupa su lugar.
    - inside_container: capsule_orchestrator
    - contact_with: [correas_blancas]
- before_state:
  - seo_jun:
    - condition: poder acumulado alrededor de ambos brazos, sin fisuras de costo visibles.
    - action_status: preparado para lanzar.
  - connected_damage:
    - condition: grietas todavía avanzando bajo Mira y el niño.
    - action_status: conectado al perro y a la columna.
  - resto_perro_negro:
    - condition: atrapado, placas intactas y grieta morada encendida.
    - action_status: activo.
- atomic_actions:
  - actor: seo_jun
    verb: lanza
    target: inheritance_damage_lines_acumuladas
    origin: alrededor de ambos brazos
    trajectory_or_contact: una descarga legible y continua cruza el túnel sin tocar a Mira ni al niño
    destination: pecho y cuerpo del resto_perro_negro
    result: el daño abandona las superficies conectadas y golpea a la criatura.
  - actor: connected_damage
    verb: deja de avanzar
    target: grietas_del_pavimento
    origin: suelo bajo Mira y el niño
    trajectory_or_contact: cese visible de la propagación, sin nuevo brillo
    destination: último borde ya abierto
    result: la zona deja de extender el daño.
  - actor: inheritance_damage_lines
    verb: impacta y expulsa
    target: resto_perro_negro
    origin: dirección Seo Jun→perro
    trajectory_or_contact: golpe frontal que lo arranca desde debajo de la columna hacia espacio libre
    destination: suelo frente a la columna
    result: placas negras revientan y la única grieta morada se apaga por completo.
  - actor: columna_danada
    verb: termina de asentarse
    target: suelo_fuera_de_la_posicion_del_nino
    origin: vertical previamente debilitada
    trajectory_or_contact: cae sin alcanzar al niño ya desplazado
    destination: posición final estable y dañada
    result: el niño queda físicamente a salvo.
  - actor: copied_damage_cost
    verb: se copia
    target: brazo_de_seo_jun
    origin: descarga que Seo Jun manipula
    trajectory_or_contact: crujido interno seguido por fisuras bajo su piel
    destination: solo el brazo de Seo Jun
    result: aparecen seo_cost_fissures negras con destellos rojos.
- after_state:
  - resto_perro_negro:
    - condition: inmóvil, placas rotas y grieta morada totalmente apagada; no vuelve a pulsar.
    - location: suelo frente a la columna.
    - owns_or_carries: []
  - nino_atrapado:
    - condition: ileso y a salvo.
    - location: junto a Park Mira, fuera de la columna asentada.
    - owns_or_carries: []
  - park_mira:
    - condition: ilesa, sin poder ni marcas; alivio inicial.
    - location: junto al niño.
    - owns_or_carries: []
  - seo_jun:
    - condition: brazo lesionado y fisuras negras visibles bajo su piel; consciente.
    - location: tunnel_hazard_zone, fuera de la cápsula.
    - owns_or_carries: [inheritance_damage_lines, seo_cost_fissures]
- emotional_contract:
  - emotional_trigger: la victoria salva al niño y destruye la amenaza, pero rompe el cuerpo del protagonista.
  - emotional_subject: seo_jun
  - required_visible_reaction: esfuerzo máximo, alivio de un instante y dolor corporal inmediato; el niño también muestra alivio.
  - forbidden_neutral_reaction: Seo Jun sereno tras fracturarse, niño inexpresivo o Mira con marcas.
- forbidden_implications: [luz morada encendida después del impacto, perro intacto o de pie, marcas en Mira o niño, columna aplastando al niño, Seo Jun dentro de la cápsula, energía todavía atacando después del apagado]
- causal_link_next: las marcas visibles cambian la forma en que Mira y la Autoridad interpretan a Seo Jun.

#### B10 — Muerte y reacción social
- beat_id: B10
- narrative_function: convertir la victoria en miedo social, cerrar la muerte de Kang y confirmar la firma.
- monologue_span_exact: |
    Mi compañera me miró como si yo fuera el siguiente monstruo.

    El Orquestador dejó caer la cabeza dentro de la cápsula.

    La capitana levantó su escáner.

    La pantalla marcó: FIRMA DEL ORQUESTADOR.
- cold_viewer_info:
  - new_fact: la compañera teme al salvador, Kang muere dentro de la cápsula y el Estado reconoce oficialmente la firma heredada.
  - visible_proof: Mira retrocede mirando las fisuras; Kang queda inmóvil dentro; Ryu usa un escáner portátil cuya pantalla muestra el texto exacto.
  - must_not_assume: que Mira recibió poder, que el escáner es un arma o que Kang abandonó la cápsula.
- location_id: tunnel_hazard_zone
- location_context: consecuencia junto a la cápsula; Ryu escanea desde el carril contiguo sin cambiar de escenario.
- present_entities: [seo_jun, park_mira, nino_atrapado, kang_muyeol, capsule_orchestrator, ryu_haejin, state_agents, resto_perro_negro]
- spatial_truth:
  - seo_jun:
    - position_relation: de pie o arrodillado fuera de la cápsula, entre Mira y la línea de agentes; brazo marcado visible.
    - inside_container: false
    - contact_with: [seo_cost_fissures]
  - park_mira:
    - position_relation: junto al niño, retrocede alejándose de Seo Jun; no ocupa la cápsula.
    - inside_container: false
    - contact_with: [nino_atrapado]
  - kang_muyeol:
    - position_relation: cabeza cae dentro del único interior de la cápsula; ninguna parte del cuerpo cambia de ocupante.
    - inside_container: capsule_orchestrator
    - contact_with: [correas_blancas, aro_metalico]
  - ryu_haejin:
    - position_relation: fuera de la cápsula y fuera del círculo inmediato de Seo Jun; sostiene un dispositivo de mano hacia él.
    - inside_container: false
    - contact_with: [scanner_signature]
  - resto_perro_negro:
    - position_relation: inmóvil en el suelo, lejos del escáner y sin brillo morado.
    - inside_container: false
    - contact_with: [suelo]
- before_state:
  - seo_jun:
    - condition: lesionado, marcado y consciente.
    - action_status: termina de sufrir el costo.
  - park_mira:
    - condition: aliviada por el niño, todavía cerca de Seo Jun.
    - action_status: observa sus nuevas marcas.
  - kang_muyeol:
    - condition: agotado, vivo por un último instante y dentro de la cápsula.
    - action_status: ya transfirió el poder.
  - ryu_haejin:
    - condition: controlada, dispositivo todavía bajo.
    - action_status: observa el efecto.
- atomic_actions:
  - actor: park_mira
    verb: mira y retrocede
    target: seo_cost_fissures
    origin: junto al niño
    trajectory_or_contact: un paso físico de separación, sin tocar la energía
    destination: mayor distancia de Seo Jun
    result: expresa miedo social, no alivio amistoso.
  - actor: kang_muyeol
    verb: deja caer la cabeza y muere
    target: interior_de_capsule_orchestrator
    origin: posición restringida dentro de la cápsula
    trajectory_or_contact: movimiento final hacia el pecho; después no respira ni responde
    destination: misma cápsula, mismo asiento
    result: queda inequívocamente fallecido y sigue siendo el único ocupante.
  - actor: ryu_haejin
    verb: levanta y dirige
    target: scanner_signature
    origin: mano de Ryu en tunnel_convoy_lane
    trajectory_or_contact: sensor portátil orientado a Seo Jun; no es un cañón ni dispara
    destination: firma visible de Seo Jun
    result: la pantalla física muestra exactamente "FIRMA DEL ORQUESTADOR" y ningún otro texto legible.
- after_state:
  - seo_jun:
    - condition: identificado públicamente, lesionado y marcado.
    - location: fuera de la cápsula, tunnel_hazard_zone.
    - owns_or_carries: [inheritance_damage_lines, seo_cost_fissures]
  - park_mira:
    - condition: asustada, sin poder y sin marcas.
    - location: junto al niño, separada de Seo Jun.
    - owns_or_carries: []
  - kang_muyeol:
    - condition: fallecido, inmóvil y sin respuesta.
    - location: único ocupante interior de capsule_orchestrator.
    - owns_or_carries: []
  - ryu_haejin:
    - condition: confirmación obtenida, control frío.
    - location: tunnel_convoy_lane.
    - owns_or_carries: [scanner_signature]
- emotional_contract:
  - emotional_trigger: la persona salvada por Seo Jun ahora lo teme y la institución convierte la marca en sentencia.
  - emotional_subject: [park_mira, seo_jun, ryu_haejin]
  - required_visible_reaction: miedo claro de Mira; golpe emocional contenido de Seo Jun; autoridad fría de Ryu.
  - forbidden_neutral_reaction: Mira sonriente o inmóvil, Seo Jun triunfal, Ryu sorprendida o escáner tratado como rifle.
- forbidden_implications: [alivio amistoso entre Mira y Seo Jun, marcas o energía en Mira, escáner como arma, Kang vivo o fuera, segundo ocupante, perro morado activo, exterior]
- causal_link_next: la confirmación de la firma activa la respuesta armada estatal.

#### B11 — Cliffhanger
- beat_id: B11
- narrative_function: cerrar con cerco físico, orden estatal y nueva posición irreversible del protagonista.
- monologue_span_exact: |
    [tense] Todos los rifles giraron hacia mí.

    —Objetivo de ejecución confirmado.
- cold_viewer_info:
  - new_fact: la misma Autoridad que llegó con Kang clasifica a Seo Jun como objetivo de muerte inmediata.
  - visible_proof: varios agentes reales forman un círculo y giran rifles físicos hacia Seo Jun mientras Ryu emite la orden.
  - must_not_assume: que Seo Jun escapó, que empieza una pelea fuera de cámara o que un holograma sustituye a los agentes.
- location_id: tunnel_hazard_zone
- location_context: mismo túnel y misma noche; agentes del carril contiguo cierran un círculo físico alrededor de Seo Jun.
- present_entities: [seo_jun, ryu_haejin, state_agents, park_mira, nino_atrapado, kang_muyeol, capsule_orchestrator, resto_perro_negro]
- spatial_truth:
  - seo_jun:
    - position_relation: centro físico del cerco, completamente fuera de la cápsula; brazo lesionado visible.
    - inside_container: false
    - contact_with: [seo_cost_fissures]
  - state_agents:
    - position_relation: distribuidos alrededor de Seo Jun con líneas de tiro convergentes que no los confunden con hologramas.
    - inside_container: false
    - contact_with: [physical_rifles]
  - ryu_haejin:
    - position_relation: detrás o al costado de la primera línea de agentes, fuera de la cápsula.
    - inside_container: false
    - contact_with: [scanner_signature]
  - park_mira:
    - position_relation: fuera del centro del cerco, protege al niño y mantiene distancia de Seo Jun.
    - inside_container: false
    - contact_with: [nino_atrapado]
  - kang_muyeol:
    - position_relation: fallecido dentro de la cápsula abierta; no sustituye a Seo Jun en el centro.
    - inside_container: capsule_orchestrator
    - contact_with: [correas_blancas]
  - resto_perro_negro:
    - position_relation: caído fuera del cerco, placas rotas y sin luz.
    - inside_container: false
    - contact_with: [suelo]
- before_state:
  - seo_jun:
    - condition: lesionado, marcado, identificado y consciente.
    - action_status: todavía no huye ni ataca.
  - state_agents:
    - condition: rodean la zona con rifles físicos en posición de escolta.
    - action_status: esperan confirmación.
  - ryu_haejin:
    - condition: firma confirmada.
    - action_status: aplica protocolo.
- atomic_actions:
  - actor: state_agents
    verb: giran
    target: physical_rifles
    origin: formación de escolta alrededor del convoy
    trajectory_or_contact: cañones físicos rotan y convergen desde varias posiciones reales
    destination: centro del cuerpo de Seo Jun
    result: se forma un cerco armado legible.
  - actor: ryu_haejin
    verb: confirma
    target: orden_de_ejecucion
    origin: posición de mando junto a los agentes
    trajectory_or_contact: voz dirigida a la unidad, sin disparo todavía
    destination: state_agents y Seo Jun
    result: Seo Jun queda oficialmente clasificado como objetivo estatal.
- after_state:
  - seo_jun:
    - condition: atrapado, lesionado y bajo amenaza inmediata; no resuelve el cerco en esta Parte.
    - location: centro de tunnel_hazard_zone.
    - owns_or_carries: [inheritance_damage_lines, seo_cost_fissures]
  - state_agents:
    - condition: tensos, rifles apuntados y a la espera del siguiente movimiento.
    - location: círculo físico alrededor de Seo Jun.
    - owns_or_carries: [physical_rifles]
  - ryu_haejin:
    - condition: control frío, orden emitida.
    - location: borde del cerco.
    - owns_or_carries: [scanner_signature]
- emotional_contract:
  - emotional_trigger: Seo Jun salva vidas y recibe una sentencia antes de comprender su poder.
  - emotional_subject: seo_jun
  - required_visible_reaction: atrapado y consciente del peligro, respiración tensa; agentes con tensión real de disparo.
  - forbidden_neutral_reaction: Seo Jun relajado, agentes posando sin apuntar o celebración del payoff.
- forbidden_implications: [holograma sustituyendo rifles físicos, iconos de rifles flotantes, calle exterior, Seo Jun dentro de cápsula, Kang en el centro, perro activo, disparo o escape resuelto, CTA]
- causal_link_next: Parte 2 debe comenzar cobrando el cerco, sin re-presentar el mundo ni borrar la lesión.

### REVEAL_LOCKS

- revealed_this_part: Kang elige a Seo Jun; el poder mueve daño; el Estado reconoce la firma.
- suspected_only: el poder puede cerrar daño; Kang sabía quién era Seo Jun.
- forbidden_to_confirm: origen estatal de Fracturas; exposición acumulativa de los Barrenderos.

### DIRECTOR_BOUNDARY

- immutable: canon, monólogo, beat order, identities, tunnel location, capsule occupancy, state changes, effect ownership, reveal locks.
- director_may_choose: número de scenes, cámara, layouts, puntuación visual, assets/views, referencias, luz específica y prompts.
- director_must_not_imply: futuro antes de causa, Seo dentro de cápsula, Kang fuera de cápsula, Mira marcada, fisuras de costo antes de B09, grietas detenidas antes del lanzamiento, niño completamente a salvo antes de B09, perro activo tras apagarse, Kang solo inconsciente en B10, escáner tratado como arma, exterior, segundo ocupante o rescate completado antes de B05.

## QA_SHOWRUNNER

- premise_score: 16/16
- hook_score: 10/10
- cold_listener: PASS
- word_count: 339
- character_count_with_tags_and_breaks: 2053
- payoff_word_start: 250/339
- payoff_pct: 73.7%
- technical_terms_new: [Barrendero, Orquestador]
- commercial_payoff: 8/8
- production_clarity: PASS
- performance_map: PASS
- causal_coincidences: 0
- audio_tags: [[low], [pause], [urgent], [strained], [impact], [tense]]
- retention_timing: PASS
- caption_phrasing: PASS
- segmentation_blocks: {total: 47, spoken: 46, pause_only: 1}
- segmentation_max_spoken_words: 15
- segmentation_ranges: {action: "2–8", reaction_or_fragment: "2–9", standard: "5–13", composite: "4–14", master: "7–16", card: "2–7"}
- segmentation_audit: PASS
- story_packet_segmentability: PASS
- packet_preflight_status: PACKET_READY
- packet_preflight_validator_version: 5.3.7
- packet_preflight_exit_code: 0
- packet_preflight_command: python /mnt/data/validate_v5_3.py --packet-only "/mnt/data/STORY_PACKET_P1_PRODUCTION_V5_3.md"
- status: PASS
