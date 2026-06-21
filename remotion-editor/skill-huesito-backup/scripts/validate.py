import json, re, sys, unicodedata
# Windows: la consola suele ser cp1252 y truena al imprimir ❌/⚠️/✅. Forzamos UTF-8 en stdout.
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

NUM = {'Día 1':'uno','Día 2':'dos','Día 3':'tres','Día 4':'cuatro','Día 5':'cinco',
       'Día 7':'siete','Día 10':'diez','Día 15':'quince','Día 30':'treinta',
       'Día 45':'cuarenta y cinco','Día 60':'sesenta'}
# OJO: usar "no minors"/"only adults" en los prompts; estos terminos DISPARAN aunque sea en negacion
KID = ('child','children',' kid',' kids','baby','toddler','infant','famil','of all ages','teenage')

def norm(s): return unicodedata.normalize('NFD', s).encode('ascii','ignore').decode().lower()
def words(t):
    t = re.sub(r'\[[^\]]*\]', ' ', t)            # quita [tags]
    t = re.sub(r'[^\w\sáéíóúñ]', ' ', t, flags=re.I)
    return [w for w in t.split() if w]

p = sys.argv[1]
d = json.load(open(p, encoding='utf-8'))
ok = True
print(f'== {p} · formato ingredientes ==')
print('escenas:', len(d['scenes']))

# preset obligatorio
if d.get('project', {}).get('preset') != 'esqueletos':
    print('  ❌ project.preset debe ser "esqueletos"'); ok = False

# campos prohibidos (en cualquier nivel)
keys = set()
def walk(o):
    if isinstance(o, dict):
        for k, v in o.items(): keys.add(k); walk(v)
    elif isinstance(o, list):
        for x in o: walk(x)
walk(d)
for bad in ('clip_duration_s','duration_per_clip_s','timeline','voice_id','strength','frame_scope'):
    if bad in keys: print('  ❌ campo prohibido:', bad); ok = False

# characters = solo base
chars = d.get('characters', {})
for cid, c in chars.items():
    if c.get('type') == 'character_edited':
        print(f'  ❌ characters.{cid}: no debe ser character_edited (va en ingredients)'); ok = False
    if not c.get('reference_asset'):
        print(f'  ❌ characters.{cid}: sin reference_asset'); ok = False

# ingredients
ings = {}; outs = {}; ce = set(); ent_plate = set()
for ing in d.get('ingredients', []):
    i = ing.get('id'); t = ing.get('type')
    if i in ings: print(f'  ❌ id duplicado: {i}'); ok = False
    ings[i] = ing
    of = ing.get('output_file')
    if not of: print(f'  ❌ {i}: sin output_file'); ok = False
    elif of in outs: print(f'  ❌ output_file duplicado: {of}'); ok = False
    else: outs[of] = i
    if t == 'character_edited':
        ce.add(i)
        if ing.get('base') not in chars: print(f'  ❌ {i}: base "{ing.get("base")}" no existe en characters'); ok = False
        if not ing.get('edit_prompt'): print(f'  ❌ {i}: sin edit_prompt'); ok = False
    elif t in ('entity','location_plate'):
        ent_plate.add(i)
        if not ing.get('generation_prompt'): print(f'  ❌ {i}: sin generation_prompt'); ok = False
    else:
        print(f'  ❌ {i}: type invalido "{t}"'); ok = False

# por escena
used = set(); n_tag = 0; last = d['scenes'][-1]['id']
for s in d['scenes']:
    sid = s['id']; vo = s['voiceover']['text']; ip = s['visual']['image_prompt']
    n = len(words(vo))
    m_tag = re.match(r'\s*\[([^\]]*)\]', vo)        # emociones con MODERACION (ya NO se exige por escena)
    if m_tag:
        n_tag += 1
        if ',' not in m_tag.group(1):               # tag SIMPLE -> debe ser COMPUESTO (3-5 elementos)
            print(f'  ⚠️  {sid}: tag de emocion SIMPLE "[{m_tag.group(1).strip()}]"; usa uno COMPUESTO (3-5 elementos, ej. [whispering, ominous, secretive]) — ver narracion_fish_emociones.md')
    if any(w in norm(vo) for w in ('parte 2','parte dos','lo que sigue','continuara')):
        print(f'  ⚠️  {sid}: la voz no debe anunciar la Parte 2 (deja "..."; el gancho va en cliffhanger_card)')
    if n > 70: print(f'  ❌ {sid}: {n} palabras (>techo 70)'); ok = False
    elif not (15 <= n <= 23) and sid != last: print(f'  ⚠️  {sid}: {n} palabras (fuera de 15-23)')
    r = s.get('references', {})
    for c in r.get('characters', []):
        used.add(c)
        if c not in ce: print(f'  ❌ {sid}: references.characters "{c}" no es un character_edited'); ok = False
    for g in r.get('ingredients', []):
        used.add(g)
        if g not in ent_plate: print(f'  ❌ {sid}: references.ingredients "{g}" no es entity/location_plate'); ok = False
    if r.get('scenes') not in ([], None): print(f'  ❌ {sid}: references.scenes debe ir vacio'); ok = False
    if 'provided' not in ip.lower():
        print(f'  ⚠️  {sid}: image_prompt no dice "provided" (debe COMPLEMENTAR los ingredientes)')
    blob = (ip + ' ' + s['visual']['animation_prompt']).lower()
    if any(k in blob for k in KID): print(f'  ❌ {sid}: termino que genera menores (usa "no minors"/"only adults")'); ok = False
    if '[' in s['captions']['text']: print(f'  ❌ {sid}: caption con tag de emocion'); ok = False
    # REGLA DEL RENDERER: el cartel negro SOLO sale si la voz ARRANCA con la 1a palabra del time_label
    # (ViralVideo.tsx labelNarrated compara 1a-palabra-label vs 1a-palabra-hablada, normalizadas).
    # Por eso "1810" falla (la voz dice "Año..."), "200 años despues" falla (la voz dice "Doscientos...").
    tl = s.get('time_label')
    if tl:
        vw = words(vo)
        tl0 = norm(tl.split()[0]) if tl.split() else ''
        vo0 = norm(vw[0]) if vw else ''
        if tl0 != vo0:
            print(f'  ❌ {sid}: time_label "{tl}" debe EMPEZAR con la 1a palabra hablada ("{vw[0] if vw else "?"}"). '
                  f'El cartel SOLO sale si la voz arranca con esa palabra; escribe numeros igual que la voz '
                  f'("Año 1810"/"Doscientos años despues", NO "1810"/"200")'); ok = False
        elif NUM.get(tl) and NUM[tl] not in norm(vo):
            print(f'  ⚠️  {sid}: time_label "{tl}": la voz deberia decir el numero "{NUM[tl]}"')

if n_tag > max(8, len(d['scenes'])//2):
    print(f'  ⚠️  {n_tag}/{len(d["scenes"])} escenas con [emocion]: aun con tags compuestos, no etiquetes cada linea (solo beats clave)')
noref = set(ings) - used
if noref: print('  ⚠️  ingredientes definidos pero NO usados:', sorted(noref))
print(f'  ingredients: {len(ce)} character_edited, {len(ent_plate)} entity/plate | usados: {len(used)}')
print('RESULTADO:', '✅ OK' if ok else '❌ revisar arriba')
