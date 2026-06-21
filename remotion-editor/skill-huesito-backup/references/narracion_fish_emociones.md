# 🎙️ Narración cinematográfica con emociones (Fish Audio)

Cómo escribir los `voiceover.text` para que Fish suene a **documental dramático / cinematográfico**, no plano ni robótico. Aplica al `voiceover.text` de cada escena, al `hook.voiceover` y al `tts_export.full_script`. **Los `captions` van SIEMPRE limpios (sin tags).**

> Esta guía COMPLEMENTA la regla de moderación de la §13: no es "una etiqueta por línea", es **etiqueta compuesta en los beats que importan**.

---

## Reglas principales

1. **NUNCA emociones simples solas.** Evita `[hopeful]`, `[sad]`, `[happy]`, `[angry]`, `[excited]`, `[curious]` a secas: suenan planas o exageradas. Usa **etiquetas compuestas**.
   - ❌ `[hopeful] El espíritu de rebeldía nunca muere.`
   - ✅ `[calm, solemn, with restrained hope, voice lowering at the end] El espíritu de rebeldía... nunca muere del todo.`

2. **Cada etiqueta lleva 3–5 elementos**, con la estructura: `[modo de voz, emoción, intención narrativa, ritmo o cierre]`.
   - `[low, serious, reflective, slow pacing]`
   - `[whispering, ominous, secretive]`
   - `[tense, urgent, breathless, building suspense]`
   - `[grave, documentary narrator tone, quietly dramatic]`

3. **Las etiquetas SIEMPRE en inglés** (Fish las interpreta mejor), aunque el texto sea español-MX.
   - ✅ `[whispering, ominous, secretive] Nadie se atrevía a decirlo en voz alta.`

4. **Pausas escritas con intención** (clave para que no suene robótico):
   - `...` para pausa dramática / revelación: *"Y entonces... todos entendieron que ya era demasiado tarde."*
   - comas para pausas suaves: *"La ciudad seguía en pie, pero por dentro, ya estaba rota."*
   - frases cortas para impacto: *"Nadie gritó. Nadie corrió. Solo miraron al cielo."*

5. **Una etiqueta por BLOQUE emocional / escena**, no por oración. No sobrecargues. El **hook** y el **cierre** SIEMPRE llevan etiqueta compuesta; el resto, solo en los beats fuertes (giro, revelación, clímax).

---

## Etiquetas por momento de la historia

| Momento | Etiquetas recomendadas |
|---|---|
| **Hook inicial** (misterioso/directo) | `[low, mysterious, cinematic narrator tone]` · `[serious, intriguing, slow build]` · `[darkly curious, documentary narrator tone]` |
| **Planteamiento del problema** (serio, tensión controlada) | `[serious, grounded, documentary tone]` · `[calm, tense, analytical]` · `[grave, cinematic, slowly revealing]` |
| **Miedo / misterio** | `[whispering, ominous, secretive]` · `[low, tense, quietly afraid]` · `[hushed, suspenseful, conspiratorial]` |
| **Caos / acción** (acelera sin gritar) | `[urgent, tense, breathless, fast pacing]` · `[dramatic, alarmed, rising intensity]` · `[panicked but controlled, cinematic action tone]` |
| **Revelación importante** (baja e impacta) | `[low, stunned, slowly revealing]` · `[grave, dramatic pause, realization]` · `[quiet, shocked, with heavy suspense]` |
| **Momento triste / humano** (tristeza CONTENIDA) | `[soft, sorrowful, restrained emotion]` · `[quiet, melancholic, reflective]` · `[gentle, sad, emotionally restrained]` |
| **Momento épico** (grandeza, no "excited") | `[epic, solemn, rising intensity]` · `[grand, cinematic, powerful but controlled]` · `[dramatic, heroic, with emotional weight]` |
| **Final cinematográfico** (cierre de narrador) | `[calm, solemn, with restrained hope, voice lowering at the end]` · `[quiet, reflective, resolved, with a closing cadence]` · `[soft, solemn, emotionally restrained, fading out]` · `[low, serious, hopeful but restrained, final narrator tone]` |

---

## Fórmula del cierre (el beat más importante)

Un buen cierre = (1) idea emocional → (2) pausa `...` antes de la frase final → (3) frase memorable → (4) etiqueta de cierre.

- `[calm, solemn, with restrained hope, voice lowering at the end] Y aunque todo parecía perdido... algo dentro de ellos seguía vivo.`
- `[quiet, reflective, resolved, with a closing cadence] Porque al final... no importa quién conquiste la tierra... sino quién se atreve a recordarla.`
- `[soft, solemn, emotionally restrained, fading out] Y desde ese día... nadie volvió a mirar el cielo de la misma manera.`

---

## Combo por defecto (Crónicas Imposibles / "¿Qué pasaría si…?")

- **Hook:** `[low, mysterious, cinematic narrator tone]`
- **Desarrollo:** `[tense, serious, building suspense]`
- **Conspiración / revelación:** `[whispering, ominous, secretive]`
- **Cierre:** `[calm, solemn, with restrained hope, voice lowering at the end]`

### Ejemplo aplicado (mini escena)
Normal: *"La gente tenía miedo. Algunos empezaron a reunirse en secreto. Aunque pasaron muchos años, nunca dejaron de luchar."*

Optimizado:
```
[low, tense, documentary narrator tone] La gente ya no hablaba en las calles... solo miraba al suelo y seguía caminando.
[whispering, ominous, secretive] Pero en las sombras de la colonia... unos cuantos empezaron a juntarse en secreto... en voz muy baja.
[calm, solemn, with restrained hope, voice lowering at the end] Porque aunque pasaran generaciones enteras bajo otra bandera... el deseo de ser libres... nunca murió del todo.
```

---

## Compatibilidad con el resto de la skill
- **Moderación (§13):** sigue sin ser una etiqueta en CADA escena; pero cuando uses una, que sea COMPUESTA (3–5 elementos), nunca simple. Hook + cierre siempre.
- **Captions limpios:** los tags van solo en `voiceover.text`/`tts_export`, NUNCA en `captions.text`.
- **Palabras/escena:** las pausas `...` y frases cortas cuentan dentro del rango de 15–23 palabras; no infles la escena por meter pausas.
- **Sin gore / terror suave:** el miedo se logra con voz (`[whispering, afraid, breath held]`), no con descripciones explícitas.

## Números y años (pronunciación)
Fish lee los **dígitos** literalmente y puede equivocar el **género**: `"1810"` salió *"mil ochocient**as** diez"* (mal). **Escribe los números CON LETRAS y bien generados en el `voiceover`**: *"Año mil ochocient**os** diez"*, *"las tres de la madrugada"*, *"cincuenta mil soldados"*. El `time_label` SÍ puede quedar en dígitos para el cartel (*"Año 1810"*); lo único que importa es que la **1ª palabra hablada** coincida con la **1ª del label** ("Año"). Aplica a años, horas, cantidades y ordinales.
