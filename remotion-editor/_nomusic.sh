cd /c/Users/Kihdel-PC/Documents/AuitomatizadorDeVideosVirales/remotion-editor
r(){ echo "##### $2"; npx remotion render ViralVideo "out/$2.mp4" --props="$1" --concurrency=6 2>&1 | tail -1; echo "DONE $2"; }
r done/de_donde_salieron_estas_cabezas_historias.json de_donde_salieron_estas_cabezas_historias
r pruebas/icaro.json la_caida_de_icaro_historias
r pruebas/final_continuo.json final_continuo
r pruebas/morian.json morian_por_un_juego_historias
echo "NOMUSIC LISTO"
