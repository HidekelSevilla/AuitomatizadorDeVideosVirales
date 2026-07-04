"""Tests del modulo ElevenLabs V3 (preset historias).

Corre sin pytest ni el SDK:  python tts/test_tts_elevenlabs.py   (desde remotion-editor/)
- A: chunking offline (sin red).
- offsets: build_global_timestamps suma bien la duracion acumulada.
- tags: validate_tags avisa de tags no-V3 sin borrarlos.
- D: un JSON de OTRO preset no hace nada.
- B/C: requieren ELEVENLABS_API_KEY (se SALTAN si no esta).
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import tts_elevenlabs as tts
from config import CHUNK_MAX_CHARS, CHUNK_MIN_CHARS

ROOT = Path(__file__).resolve().parent.parent  # remotion-editor/

_SENT = "Esta es una oracion de relleno para la prueba de chunking del modulo."  # termina en "."


def _make_historias_doc(n_scenes=10, reps=6):
    """Doc sintetico de historias: escenas que terminan en oracion; full_script = join(' ')."""
    scenes, texts = [], []
    for i in range(1, n_scenes + 1):
        t = " ".join([_SENT] * reps)
        if i == 1:
            t = "[serious] " + t                              # tag simple V3 (ok)
        if i == 2:
            t = "[warm, measured, storyteller tone] " + t     # tag compuesto Fish (debe warnear)
        texts.append(t)
        scenes.append({"id": f"scene_{i:02d}", "voiceover": {"text": t}})
    full_script = " ".join(texts)
    return {"project": {"preset": "historias", "slug": "synthetic_test"},
            "scenes": scenes, "tts_export": {"full_script": full_script}}, full_script


# --------------------------------------------------------------------------- #
def test_spoken_mask():
    assert tts.spoken_mask("[hi]ab") == [False, False, False, False, True, True]
    assert tts.strip_tags("[whispers]Hola[sigh] mundo") == "Hola mundo"
    # invariante: mask y strip_tags coinciden SIEMPRE, incluso con un '[' sin cerrar (no enmascara el resto)
    for s in ["[hi]ab", "[whispers]Hola[sigh] mundo", "[oops sin cierre", "a[b]c[d]e"]:
        assert sum(tts.spoken_mask(s)) == len(tts.strip_tags(s)), s
    print("  ok spoken_mask / strip_tags (consistentes, tag sin cerrar incluido)")


def test_validate_tags():
    doc, fs = _make_historias_doc()
    warns = tts.validate_tags(fs)
    # exactamente 1 tag flageado: el compuesto Fish. [serious] (V3-valido) NO se flagea.
    assert len(warns) == 1 and "storyteller tone" in warns[0], warns
    assert "'[serious]'" not in warns[0], "[serious] es V3-valido: no debe ser el tag flageado"
    # el texto NO se modifica (no se borran tags)
    assert "[warm, measured, storyteller tone]" in fs
    print(f"  ok validate_tags ({len(warns)} warning(s), tags intactos)")


def test_A_chunking():
    doc, full_script = _make_historias_doc(n_scenes=12, reps=10)
    chunks = tts.split_into_chunks(doc)
    assert len(chunks) >= 2, f"esperaba >=2 bloques, hubo {len(chunks)}"
    # 1) concatenacion == full_script TAL CUAL (con tags, sin perder nada)
    assert "".join(c.text for c in chunks) == full_script, "la concatenacion debe reproducir full_script"
    for c in chunks:
        # 2) tamano dentro de [250, 3000]
        assert CHUNK_MIN_CHARS <= len(c.text) <= CHUNK_MAX_CHARS, f"bloque {c.idx}: {len(c.text)} chars"
        # 3) no corta a media oracion: termina en fin de oracion
        assert c.text.rstrip()[-1] in ".!?…", f"bloque {c.idx} corta a media oracion: ...{c.text[-30:]!r}"
    print(f"  ok Test A ({len(chunks)} bloques, todos 250-3000 y en fin de oracion)")


def test_A_merge_short_tail():
    """Un ultimo bloque <250 se une al anterior (puede exceder max levemente, es lo esperado)."""
    s1 = " ".join([_SENT] * 40)   # ~2700+
    s2 = "Cola corta final."       # < 250 -> debe fusionarse
    fs = s1 + " " + s2
    doc = {"project": {"preset": "historias", "slug": "merge_test"},
           "scenes": [{"id": "scene_01", "voiceover": {"text": s1}},
                      {"id": "scene_02", "voiceover": {"text": s2}}],
           "tts_export": {"full_script": fs}}
    chunks = tts.split_into_chunks(doc)
    assert "".join(c.text for c in chunks) == fs
    assert all(len(c.text) >= CHUNK_MIN_CHARS for c in chunks), "no debe quedar un bloque <250"
    print(f"  ok merge cola corta ({len(chunks)} bloque(s), sin <250)")


def test_offsets():
    """compute_spoken_time suma el offset = duracion acumulada de bloques previos."""
    full_script = "ab cd"  # a0 b1 sp2 c3 d4 (todos hablados)
    chunks = [tts.Chunk(0, "ab ", 0, 3, ["a"]), tts.Chunk(1, "cd", 3, 5, ["b"])]
    audios = [
        tts.ChunkAudio(0, 0, 3, Path("x"), 0.3, 3, "r0", "sent",
                       [(0.0, 0.1), (0.1, 0.2), (0.2, 0.3)], "with_timestamps"),
        tts.ChunkAudio(1, 3, 5, Path("y"), 0.2, 2, "r1", "sent",
                       [(0.0, 0.1), (0.1, 0.2)], "with_timestamps"),
    ]
    spoken_time, total = tts.compute_spoken_time(full_script, chunks, audios)
    assert abs(total - 0.5) < 1e-6, total
    words = tts.build_full_words(full_script, spoken_time)
    # "ab" (chars 0,1) -> 0.0-0.2 ; "cd" (chars 3,4 con offset 0.3) -> 0.3-0.5
    assert words == [{"word": "ab", "start": 0.0, "end": 0.2},
                     {"word": "cd", "start": 0.3, "end": 0.5}], words
    print("  ok offsets (bloque 2 desplazado por la duracion del bloque 1)")


def test_words_skip_tags():
    """build_full_words: los tags no generan palabra ni consumen tiempo (formato fish full.words.json)."""
    fs = "[serious] Hola mundo"  # "[serious]"=0..8, " "=9, "Hola"=10..13, " "=14, "mundo"=15..19
    st = {i: (0.1 * i, 0.1 * i + 0.1) for i in list(range(10, 14)) + list(range(15, 20))}
    words = tts.build_full_words(fs, st)
    assert [w["word"] for w in words] == ["Hola", "mundo"], words
    print("  ok build_full_words (tags fuera, formato {word,start,end})")


def test_new_schema_render_export():
    """Schema nuevo historias: orden desde render_export.clip_order y escenas con scene_id (no id)."""
    doc = {
        "project": {"preset": "historias", "slug": "schema_nuevo"},
        "scenes": [
            {"scene_id": "b", "voiceover": {"text": "Segunda."}},
            {"scene_id": "a", "voiceover": {"text": "Primera."}},
        ],
        "render_export": {"clip_order": ["a", "b"]},
        "tts_export": {"full_script": "Primera. Segunda."},
    }
    pairs = tts._scene_texts(doc)
    assert pairs == [("a", "Primera."), ("b", "Segunda.")], pairs  # ordenado por clip_order, ids = scene_id
    _, spans = tts.build_scene_spans(doc)
    assert [s.scene_id for s in spans] == ["a", "b"]
    print("  ok schema nuevo (render_export.clip_order + scene_id)")


def test_D_other_preset_noop():
    doc = {"project": {"preset": "esqueletos", "slug": "huesito_x"},
           "scenes": [{"id": "s1", "voiceover": {"text": "Hola."}}],
           "tts_export": {"full_script": "Hola."}}
    assert tts.is_historias(doc) is False
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        f.write(json.dumps(doc))
        p = f.name
    try:
        assert tts.synthesize_historias(p) is None, "otro preset debe ser no-op (None)"
    finally:
        os.unlink(p)
    print("  ok Test D (otro preset = no-op, sin tocar nada)")


def test_dialogue_grouping_consecutive_speakers():
    items = [
        tts.DialogueItem(0, "scene_01", "narrador", "voice_a", "Uno.", "Uno."),
        tts.DialogueItem(1, "scene_02", "narrador", "voice_a", "Dos.", "Dos."),
        tts.DialogueItem(2, "scene_03", "sistema", "voice_b", "[cold] Tres.", "[cold] Tres."),
        tts.DialogueItem(3, "scene_04", "narrador", "voice_a", "Cuatro.", "Cuatro."),
    ]
    blocks = tts.build_dialogue_api_blocks(items)
    assert len(blocks) == 3, blocks
    assert blocks[0].speaker == "narrador"
    assert blocks[0].api_text == "Uno.\nDos."
    assert [it.scene_id for it in blocks[0].items] == ["scene_01", "scene_02"]
    assert blocks[1].speaker == "sistema"
    assert blocks[2].speaker == "narrador"

    chunks = tts.split_dialogue_blocks(blocks, max_chars=999)
    assert len(chunks) == 1 and len(chunks[0]) == 3
    print("  ok dialogue grouping (mismo speaker consecutivo = un input API)")


def test_C_real_jsons_chunking():
    """Sin red: valida que los JSON reales producen bloques validos y mapeo de escenas correcto."""
    for name in ["done/se_drogaban_los_aztecas_palitos_codice.json", "queue/la_atlantida_sin_marco.json"]:
        f = ROOT / name
        if not f.exists():
            print(f"  - {name} no existe, salto")
            continue
        doc = json.loads(f.read_text(encoding="utf-8-sig"))
        assert tts.is_historias(doc)
        fs, spans = tts.build_scene_spans(doc)
        chunks = tts.split_into_chunks(doc)
        assert "".join(c.text for c in chunks) == fs
        assert len(spans) == len([1 for s in doc["scenes"] if (s.get("voiceover") or {}).get("text")])
        print(f"  ok {Path(name).stem}: {len(spans)} escenas -> {len(chunks)} bloque(s), concat exacta")


def _run_real_api_tests():
    """B + C con red (solo si hay ELEVENLABS_API_KEY)."""
    if not os.environ.get("ELEVENLABS_API_KEY"):
        print("  SKIP B/C: ELEVENLABS_API_KEY no esta seteada (no se llama a la API).")
        return
    # Test B: 1 bloque corto real con un tag simple
    doc = {"project": {"preset": "historias", "slug": "test_B_un_bloque"},
           "scenes": [{"id": "scene_01",
                       "voiceover": {"text": "[serious] Esto es una prueba de un solo bloque con un tag simple de version tres."}}],
           "tts_export": {"full_script": "[serious] Esto es una prueba de un solo bloque con un tag simple de version tres."}}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        f.write(json.dumps(doc, ensure_ascii=False))
        pB = f.name
    rep = tts.synthesize_historias(pB)
    assert rep and Path(rep["mp3"]).stat().st_size > 0
    words = json.loads(Path(rep["words_json"]).read_text(encoding="utf-8"))
    assert words and all({"word", "start", "end"} <= set(w) for w in words), "formato full.words.json"
    assert not any("[" in w["word"] for w in words), "el tag [serious] NO debe quedar como palabra"
    print(f"  ok Test B: mp3 {rep['mp3']} ({rep['total_credits']} creditos, {len(words)} palabras)")
    os.unlink(pB)
    # Test C: videos reales
    for name in ["done/se_drogaban_los_aztecas_palitos_codice.json", "queue/la_atlantida_sin_marco.json"]:
        f = ROOT / name
        if f.exists():
            rep = tts.synthesize_historias(str(f))
            assert rep and Path(rep["mp3"]).stat().st_size > 0
            words = json.loads(Path(rep["words_json"]).read_text(encoding="utf-8"))
            starts = [w["start"] for w in words]
            assert starts == sorted(starts), "las palabras deben ir en orden temporal (offsets ok)"
            print(f"  ok Test C {Path(name).stem}: {rep['duration_s']}s, {rep['blocks']} bloque(s), "
                  f"{len(words)} palabras -> luego: {rep['next_step']}")


def main():
    offline = [test_spoken_mask, test_validate_tags, test_A_chunking, test_A_merge_short_tail,
               test_offsets, test_words_skip_tags, test_new_schema_render_export,
               test_D_other_preset_noop, test_dialogue_grouping_consecutive_speakers,
               test_C_real_jsons_chunking]
    failed = 0
    print("== Tests offline ==")
    for t in offline:
        try:
            t()
        except Exception as e:
            failed += 1
            print(f"  FAIL {t.__name__}: {e}")
    print("== Tests con red (B/C) ==")
    try:
        _run_real_api_tests()
    except Exception as e:
        failed += 1
        print(f"  FAIL api: {e}")
    print("RESULTADO:", "TODO OK" if failed == 0 else f"{failed} FALLARON")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
