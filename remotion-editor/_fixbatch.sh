set -e
cd /c/Users/Kihdel-PC/Documents/AuitomatizadorDeVideosVirales/remotion-editor
PY=.venv-wx/Scripts/python.exe
run(){ slug=$1; J=$2; OUT=$3; M=public/$slug/voice
  echo "##### $slug #####"
  rm -f $M/full.mp3 $M/full.words.json
  node tools/fish-voice.mjs $J 2>&1 | grep -iE "voz 35199|full.mp3" || true
  $PY align/whisperx-align.py $J $M/full.mp3 $M/full.words.json 2>&1 | tail -1
  node align/inject-words.mjs $J | tail -1
  npx remotion render ViralVideo "out/$OUT.mp4" --props="$J" --concurrency=6 2>&1 | tail -1
  echo "DONE $slug -> out/$OUT.mp4"
}
run de_donde_salieron_estas_cabezas_historias done/de_donde_salieron_estas_cabezas_historias.json de_donde_salieron_estas_cabezas_historias
# clip de confirmacion del primero
ffmpeg -y -ss 30 -t 18 -i public/de_donde_salieron_estas_cabezas_historias/voice/full.mp3 -c:a libmp3lame -q:a 2 public/voicetests/voice/cabezas_FIX_1.0.mp3 2>/dev/null
run la_caida_de_icaro_historias pruebas/icaro.json la_caida_de_icaro_historias
run se_drogaban_los_aztecas_historias_v2 pruebas/final_continuo.json final_continuo
run morian_por_un_juego_historias pruebas/morian.json morian_por_un_juego_historias
echo "TODOS LISTOS"
