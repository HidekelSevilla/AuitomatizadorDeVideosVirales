import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  novelaOutroAudioFolder,
  novelaOutroFolder,
  numberedNovelaOutroAudios,
  numberedNovelaOutros,
  selectNumberedNovelaOutro,
  selectNumberedNovelaOutroAudio,
  stableNovelaOutroIndex,
} from "../shared/novela-outro.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");

assert.equal(novelaOutroFolder("novela-coreana"), "novelaESP");
assert.equal(novelaOutroFolder("novelas-coreanas-eng"), "novelaENG");
assert.equal(novelaOutroFolder("historias"), null);
assert.equal(novelaOutroAudioFolder("novela-coreana"), "novelaAudiosESP");
assert.equal(novelaOutroAudioFolder("novelas-coreanas-eng"), "novelaAudiosENG");
assert.equal(novelaOutroAudioFolder("historias"), null);

assert.deepEqual(numberedNovelaOutros(["10.mp4", "2.MP4", "nota.txt", "0.mp4", "x.mp4"]), [
  { name: "2.MP4", number: 2 },
  { name: "10.mp4", number: 10 },
]);
assert.deepEqual(numberedNovelaOutroAudios(["11.mp3", "1.MP3", "output.mp3", "2.mp4"]), [
  { name: "1.MP3", number: 1 },
  { name: "11.mp3", number: 11 },
]);
assert.equal(stableNovelaOutroIndex("misma-novela", 9), stableNovelaOutroIndex("misma-novela", 9));
assert.equal(stableNovelaOutroIndex("sin-archivos", 0), -1);
assert.deepEqual(selectNumberedNovelaOutro(["1.mp4"], "cualquier-slug"), {
  name: "1.mp4",
  number: 1,
  count: 1,
});
assert.deepEqual(selectNumberedNovelaOutroAudio(["1.mp3"], "cualquier-slug|audio-cta"), {
  name: "1.mp3",
  number: 1,
  count: 1,
});

const build = fs.readFileSync(path.join(repo, "remotion-editor", "orchestrator", "build.mjs"), "utf8");
const video = fs.readFileSync(path.join(repo, "remotion-editor", "src", "viral", "ViralVideo.tsx"), "utf8");
assert.match(build, /prepareNovelaOutro\(p, slug, videoSpeed\(job\)\)/);
assert.match(build, /fs\.copyFileSync\(source, target\)/);
assert.match(build, /selectNumberedNovelaOutroAudio\(audioNames, `\$\{slug\}\|\$\{project\.project\?\.title \|\| ""\}\|audio-cta`\)/);
assert.match(build, /duration_s: Math\.max\(duration, audioDuration \|\| 0\)/);
assert.match(build, /clip_volume: 0\.5/);
assert.match(video, /name="novela-outro-dip"/);
assert.match(video, /name="novela-outro"/);
assert.match(video, /const totalFrames = contentFrames \+ outroFrames/);
assert.match(video, /playbackRate=\{1 \/ postSpeed\}/);
assert.match(video, /volume=\{clipVolume \* opacity\}/);
assert.match(video, /<Freeze frame=\{Math\.max\(0, videoFrames - 1\)\}>\{frozenVideo\}<\/Freeze>/);
assert.match(video, /const frozenVideo = \([\s\S]*?muted/);
assert.match(video, /src=\{staticFile\(outro\.audio_src\)\}/);

console.log("OK: video y audio CTA ESP/ENG independientes, mezcla 50/100 y transicion de novela");
