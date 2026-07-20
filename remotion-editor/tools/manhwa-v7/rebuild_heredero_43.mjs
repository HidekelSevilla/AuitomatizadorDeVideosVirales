import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const inputPath = path.join(ROOT, "queue", "heredero_enemigo_nacional_p1_project_v7.json");
const outputPath = inputPath;
const packetSource = path.join(os.homedir(), "Downloads", "story_packet_v7_heredero_enemigo_nacional_p1.md");
const packetTarget = path.join(ROOT, "queue", "story_packet_v7_heredero_enemigo_nacional_p1.md");

const project = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const originalObligations = new Map(project.obligation_map.map((item) => [item.obligation_id, item]));
const fullScript = project.tts_export.full_script.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");
const lines = fullScript.split("\n");
if (lines.length !== 24) throw new Error(`expected 24 locked lines, got ${lines.length}`);
const canonicalHash = crypto.createHash("sha256").update(fullScript.normalize("NFC"), "utf8").digest("hex");
if (canonicalHash !== project.production_lock.monologue_sha256) throw new Error("locked monologue hash drift");

const NEGATIVE = ["no readable text", "no speech bubbles", "no captions", "no watermark", "no logo"];
const STYLE = "Professional hand-drawn Korean manhwa webtoon page, controlled 2D flat cel shading, crisp inked lineart, cinematic lighting, finished material texture, consistent character design across every image panel, vertical 9:16 composition";

function addPose(characterId, poseId, performance) {
  const character = project.characters[characterId];
  const prompt = [
    `${character.prompt_signature}.`,
    `${performance.emotion}; ${performance.body}; ${performance.gaze}; ${performance.hands}.`,
    `${character.negative_invariants.join(", ")}.`,
    "Hand-drawn Korean manhwa character reference, flat cel shading, crisp lineart.",
    "no readable text, no speech bubbles, no watermark, no logo.",
  ].join(" ");
  character.poses[poseId] = {
    mode: "generate",
    asset: `assets/characters/heredero_del_enemigo_nacional/${characterId}_${poseId}.png`,
    prompt,
    performance_signature: performance,
  };
}

addPose("C_MIN_JAEHA", "cleanup_entry", {
  emotion: "drained professional focus",
  body: "standing narrow beside the containment table with shoulders bowed from a night shift",
  gaze: "gaze following the blood trail toward the floor drain",
  hands: "both charcoal-gloved hands guide a stained industrial mop",
});
addPose("C_MIN_JAEHA", "zero_badge_reveal", {
  emotion: "resigned humiliation",
  body: "shoulders lowered while the cleaning badge is held against his chest",
  gaze: "eyes lowered toward the zero Veta indicator",
  hands: "one hand lifts the badge while the other grips a stained glove cuff",
});
addPose("C_MIN_JAEHA", "receipt_implant_shock", {
  emotion: "pain-struck panic",
  body: "torso twisted away while the trapped wrist is driven against steel",
  gaze: "staring at the black sigil burning into skin",
  hands: "free hand claws at corpse fingers while the marked hand spasms open",
});
addPose("C_MIN_JAEHA", "registry_burn_recoil", {
  emotion: "institutional terror",
  body: "recoiling beneath the oath rails as registry light crosses his chest",
  gaze: "eyes fixed on the enemy-heir seal forming around his badge",
  hands: "one hand shields his face while the marked wrist burns against his ribs",
});
addPose("C_MIN_JAEHA", "fleeing_rib_birth", {
  emotion: "animal terror",
  body: "sprinting away with torso turned backward",
  gaze: "eyes fixed over his shoulder on the splitting rib cage",
  hands: "marked arm tucked protectively while the free arm reaches toward the service door",
});
addPose("C_MIN_JAEHA", "pulse_rule_focus", {
  emotion: "shocked concentration",
  body: "crouched behind the gurney with the marked wrist near his face",
  gaze: "focused on pulse rings rising from the sigil",
  hands: "both hands steady the trembling wrist",
});
addPose("C_MIN_JAEHA", "wounded_resolve", {
  emotion: "silent agony held under resolve",
  body: "knees buckling while the wounded shoulder remains deliberately exposed",
  gaze: "eyes locked forward without asking for rescue",
  hands: "one hand hangs open by choice while the marked wrist braces for collection",
});
addPose("C_MIN_JAEHA", "chain_followthrough", {
  emotion: "ferocious disbelief",
  body: "pivoting through recoil after the black chain lashes across the room",
  gaze: "following the chain toward the shattered beast",
  hands: "wounded hand clamps the shoulder while the marked fist pulls the chain taut",
});
addPose("C_MIN_JAEHA", "rank_aftershock", {
  emotion: "stunned relief turning to dread",
  body: "half-kneeling among beast fragments",
  gaze: "reading level-one and oxygen icons above the wrist",
  hands: "one hand touches the wound while the marked hand opens beneath the UI",
});
addPose("C_MIN_JAEHA", "forced_arm_writing", {
  emotion: "disgusted panic",
  body: "spine twisted as the marked arm drags itself across steel",
  gaze: "tracking the disobedient fingers",
  hands: "free hand reaches for the forearm while controlled fingers carve pictographs",
});
addPose("C_MIN_JAEHA", "signature_scan_exposed", {
  emotion: "betrayed exhaustion",
  body: "upright on one knee with the wounded shoulder exposed to scanners",
  gaze: "tracking alternating scanner lights without looking toward the camera",
  hands: "marked wrist held away from the body while the other palm opens in surrender",
});

addPose("C_KWON_RYUGAK", "oath_seal_twitch", {
  emotion: "impossible death reflex",
  body: "rigid corpse arching slightly beneath tightening seals",
  gaze: "closed eyes while jaw and neck strain",
  hands: "both restrained hands flex beneath iron shackles",
});
addPose("C_KWON_RYUGAK", "rib_cavity_collapse", {
  emotion: "postmortem rupture",
  body: "collapsed supine as contaminated ribs split outward",
  gaze: "dead face turned away with no living focus",
  hands: "both hands lie slack and no longer hold Jaeha",
});
addPose("C_KWON_RYUGAK", "dying_lips", {
  emotion: "fading malice",
  body: "collapsed against the open mortuary bag",
  gaze: "half-lidded gaze fading toward the burned receipt mark at the edge of frame",
  hands: "one hand lies beside black receipt ash while the other falls limp",
});
addPose("C_YUN_SERA", "signature_scan_verdict", {
  emotion: "disciplined alarm",
  body: "leaning into a sensor readout while maintaining tactical stance",
  gaze: "switching from the black veins to Jaeha's face",
  hands: "one hand steadies the scanner while the other hovers near her sidearm",
});

const hanaProfile = {
  age: "19-year-old Korean female",
  build: "slender hospital-weakened build",
  face: "soft oval face with tired dark eyes",
  hair_or_skin: "shoulder-length straight black hair and pale warm skin",
  wardrobe: "plain blue hospital gown beneath a cream blanket",
  materials: "clear oxygen cannula and soft cotton bedding",
  colors: "pale blue cream dawn gold and muted skin tones",
  marks: "small adhesive oxygen sensor on the right index finger",
};
project.characters.C_MIN_HANA = {
  display_name: "Min Hana",
  descriptor_profile: hanaProfile,
  prompt_signature: `Min Hana, ${Object.values(hanaProfile).join(", ")}`,
  immutable_traits: ["Jaeha's younger sister", "oxygen-dependent hospital patient", "right index oxygen sensor"],
  negative_invariants: ["no combat armor", "no supernatural glow", "no adult makeup"],
  poses: {},
};
addPose("C_MIN_HANA", "oxygen_deadline", {
  emotion: "controlled fear before dawn",
  body: "semi-reclined beneath the cream blanket with shallow guarded breathing",
  gaze: "eyes turned toward the first dawn light beyond the window",
  hands: "one hand checks the oxygen cannula while the sensor hand rests beside a dim phone",
});
addPose("C_MIN_HANA", "oxygen_relief", {
  emotion: "cautious relief",
  body: "shoulders slowly relaxing against the raised hospital bed",
  gaze: "eyes fixed on the stabilized oxygen monitor",
  hands: "one hand steadies the cannula while the sensor hand holds a blank payment confirmation icon",
});

const morgue = project.escenarios.L_MORGUE_RAIZ;
const shotScales = new Map([
  ["containment_table_wide", "WIDE_MASTER"], ["service_door_axis", "MEDIUM"],
  ["oath_seal_overhead", "FULL"], ["rib_shadow_profile", "WIDE_MASTER"],
  ["gurney_pov", "MEDIUM"], ["drain_ground_rear", "WIDE_MASTER"],
  ["registry_terminal_close", "CLOSE"], ["hunter_breach_ots", "WIDE_MASTER"],
  ["whisper_wrist_bay", "CLOSE"],
]);

function viewPrompt(rootSignature, signature, camera) {
  return [
    `CAMERA: scale=ENVIRONMENT_WIDE; elevation=${camera.elevation}; viewpoint=${camera.viewpoint}; azimuth_deg=${camera.azimuth_deg}; lens_mm=${camera.lens_mm}; roll_deg=${camera.roll_deg}; dominant_subject=environment; occupancy_pct=100.`,
    "SUBJECTS: empty environment, no characters.",
    "ACTION: static identity plate with fixed architectural anchors.",
    `ENVIRONMENT: ${rootSignature}; ${signature}.`,
    "LIGHTING: cold architectural illumination with restrained practical spill.",
    "STYLE: hand-drawn Korean manhwa environment reference, flat cel shading, crisp lineart, precise architecture and materials, high-resolution vertical 9:16 source.",
    "NEGATIVE: no readable text, no speech bubbles, no watermark, no logo, no people, no movable walls.",
  ].join("\n");
}

function addView(scenarioId, viewId, signature, shotScale, elevation, viewpoint, azimuth_deg, lens_mm, roll_deg = 0) {
  const scenario = project.escenarios[scenarioId];
  const camera = { scale: "ENVIRONMENT_WIDE", elevation, viewpoint, azimuth_deg, lens_mm, roll_deg, dominant_subject: "environment", occupancy_pct: 100 };
  scenario.views[viewId] = {
    mode: "generate",
    asset: `assets/escenarios/heredero_del_enemigo_nacional/${scenarioId}_${viewId}.png`,
    prompt: viewPrompt(scenario.prompt_signature, signature, camera),
    prompt_signature: signature,
    camera_signature: camera,
  };
  shotScales.set(viewId, shotScale);
}

addView("L_MORGUE_RAIZ", "clock_booth_macro", "analog quarantine clock reflected across a black seal tag, corpse bag edge below it, and frost collecting on the west control glass", "MACRO", "HIGH", "POV", 175, 100);
addView("L_MORGUE_RAIZ", "cleanup_drain_knee_rear", "red cleanup water entering the square drain, mop fibers caught on the grate, steel table legs beyond, and yellow hazard paint broken by footprints", "CLOSE", "KNEE_LEVEL", "REAR_THREE_QUARTER", 220, 60);
addView("L_MORGUE_RAIZ", "warning_service_rear", "east service threshold beneath blank Fracture warning icons, isolated cleaner badge hook, long floor arrows, and the distant containment table", "MEDIUM", "EYE_LEVEL", "REAR", 205, 65);
addView("L_MORGUE_RAIZ", "mortuary_bag_bedside", "half-open mortuary bag aligned along the north table, zipper teeth spread apart, oath shackles strained, and service light cutting across steel", "FULL", "KNEE_LEVEL", "PROFILE", 270, 55);
addView("L_MORGUE_RAIZ", "wrist_contact_macro", "corpse fingers locked around a charcoal glove cuff, black receipt edge touching exposed wrist skin, and brushed steel reflecting the contact", "MACRO", "HIGH", "POV", 165, 100, 8);
addView("L_MORGUE_RAIZ", "dying_face_profile", "death-pale jaw beside the torn bag seam, black receipt ash on the table, iron shackle chain slack, and violet residue beneath the ribs", "EXTREME_CLOSE", "LOW", "PROFILE", 95, 85);
addView("L_MORGUE_RAIZ", "escape_service_rear", "long service route from the warped north table to the east door, central drain dividing the path, loose oath tags, and violet residue spreading behind", "WIDE_MASTER", "LOW", "REAR", 205, 28, -6);
addView("L_MORGUE_RAIZ", "beast_mark_diagonal", "gurney corner dividing the room, hooked bone silhouette above the floor, marked wrist reflection on steel, and north table receding behind", "FULL", "KNEE_LEVEL", "THREE_QUARTER_FRONT", 45, 32, -12);
addView("L_MORGUE_RAIZ", "pulse_wrist_macro", "burned receipt sigil above the gurney rail, circular pulse rings reflected in brushed metal, blood bead at the wrist, and black ash below", "MACRO", "HIGH", "POV", 185, 110, 8);
addView("L_MORGUE_RAIZ", "wound_impact_ots", "hooked claw crossing the cleaner shoulder line, gurney handle beneath, open service route beyond, and black mark reflected on steel", "CLOSE", "EYE_LEVEL", "OTS", 325, 70);
addView("L_MORGUE_RAIZ", "chain_wound_worms_eye", "black chain arc rising from the wounded shoulder above the drain, beast shell suspended across the room, and ceiling oath rails converging", "FULL", "WORMS_EYE", "PROFILE", 105, 24, 8);
addView("L_MORGUE_RAIZ", "gurney_rail_profile", "blood-smeared wrist pressed against the gurney rail, bent restraint handle, pending-order ash trail, and empty service threshold", "CLOSE", "HIGH", "PROFILE", 90, 105, -6);
addView("L_MORGUE_RAIZ", "empty_table_birds_eye", "empty north containment table, collapsed mortuary bag, three broken oath tags, beast blood at the drain, and hunters entering from the east", "WIDE_MASTER", "BIRDS_EYE", "FRONT", 0, 28);
addView("L_MORGUE_RAIZ", "signature_scan_profile", "sensor lances crossing the gurney bay, black vein reflections along steel, empty villain table behind, and Hanse breach lights at the door", "MEDIUM", "EYE_LEVEL", "PROFILE", 95, 70);
addView("L_MORGUE_RAIZ", "rank_ui_front", "geometric rank light suspended over the central drain, broken beast shell beside it, wounded cleaner zone beside the gurney, and oath rails dim around the bay", "MEDIUM", "EYE_LEVEL", "FRONT", 0, 70);
addView("L_MORGUE_RAIZ", "forced_writing_ots", "marked forearm dragging across the gurney surface, black pictograph scoring the steel, service threshold beyond, and blood collecting at the rail", "CLOSE", "HIGH", "OTS", 310, 70);
addView("L_MORGUE_RAIZ", "receipt_layers_macro", "stacked black receipt sigils unfolding above the wrist, violent pictographs receding into ash, gurney reflection below, and empty morgue darkness beyond", "MACRO", "TOP_DOWN", "POV", 180, 100);
addView("L_MORGUE_RAIZ", "beast_break_profile", "fractured bone shell separating above the drain, taut black chain crossing violet residue, warped north table beyond, and steel tiles sprayed with dark fluid", "CLOSE", "HIGH", "PROFILE", 100, 85, -10);
addView("L_MORGUE_RAIZ", "registry_target_low", "enemy-heir registry halo rising around the gurney bay, oath seal fragments suspended above steel, west terminal burning, and service door dwarfed beyond", "WIDE_MASTER", "WORMS_EYE", "FRONT", 0, 28);
addView("L_MORGUE_RAIZ", "phone_oxygen_macro", "blank oxygen payment icons glowing on a cracked phone beside the gurney, marked wrist shadow crossing it, and hospital tube symbol reflected in steel", "CLOSE", "EYE_LEVEL", "THREE_QUARTER_FRONT", 25, 70);

const hospitalProfile = {
  architecture: "compact public hospital oxygen ward",
  layout: "single-bed bay beside a narrow dawn window",
  materials: "painted plaster, brushed aluminum rails, clear oxygen tubing",
  anchors: "wall oxygen port, bedside monitor, cream privacy curtain",
  palette: "pale blue cream and restrained dawn gold palette",
};
project.escenarios.L_HOSPITAL_HANEUL = {
  display_name: "Hospital Haneul",
  descriptor_profile: hospitalProfile,
  spatial_role: "INCIDENTAL",
  prompt_signature: `compact public hospital oxygen ward with single-bed bay beside a narrow dawn window, painted plaster, brushed aluminum rails, clear oxygen tubing, wall oxygen port, bedside monitor, cream privacy curtain, pale blue cream and restrained dawn gold palette`,
  views: {},
};
addView("L_HOSPITAL_HANEUL", "oxygen_bed_window_wide", "raised hospital bed beside the narrow dawn window, cream curtain folded aside, wall oxygen port connected, and monitor glow touching the blanket", "WIDE_MASTER", "EYE_LEVEL", "THREE_QUARTER_FRONT", 30, 50);
addView("L_HOSPITAL_HANEUL", "oxygen_monitor_relief_close", "bedside oxygen monitor with blank icon blocks, clear cannula crossing the pillow edge, sensor cable on the blanket, and dawn light on aluminum rail", "CLOSE", "HIGH", "OTS", 320, 85);
addView("L_HOSPITAL_HANEUL", "dawn_corridor_profile", "oxygen ward threshold beside the cream curtain, empty nurse cart, long dawn stripe across the floor, and wall port line entering the bed bay", "FULL", "LOW", "PROFILE", 90, 35);

const extraIngredients = [
  ["P_MORGUE_CLOCK_0217", "analog morgue quarantine clock fixed at a two-seventeen marker through hands and abstract ticks without readable digits"],
  ["P_CLEANING_LICENSE_ZERO_VETA", "industrial cleaning license badge with blank zero-Veta icon and municipal morgue clip without readable words"],
  ["SYSTEM_ENEMY_HEIR_REGISTRY", "enemy-heir institutional registry halo made of black oath geometry and official unreadable blocks"],
  ["P_BLACK_CHAIN", "heavy black contract chain with receipt-edge links, scorched surfaces, and violet-black fracture residue"],
  ["P_OXYGEN_PAID_CONFIRMATION", "oxygen payment confirmation represented by stable tube, dawn, and cleared balance icons without readable words"],
  ["P_BORROWED_CONTROL_WARNING", "borrowed-control warning shown as a shadow hand steering a marked forearm through geometric danger icons"],
  ["P_KWON_SIGNATURE_BODY_SCAN", "black inherited enemy signature pattern moving through a human torso under Hanse sensor light without readable labels"],
];
const extraIngredientIds = new Set(extraIngredients.map(([id]) => id));
project.ingredients = project.ingredients.filter((ingredient) => !extraIngredientIds.has(ingredient?.id));
for (const [id, description] of extraIngredients) {
  project.ingredients.push({
    id,
    type: "entity",
    output_file: `assets/ingredients/heredero_del_enemigo_nacional/${id}.png`,
    generation_prompt: `${description}. Hand-drawn Korean manhwa prop/entity reference, crisp lineart, flat cel shading, vertical 9:16 safe design, no readable text, no speech bubbles, no watermark, no logo.`,
  });
}

const LAYOUT = {
  WHITE_INSET: ["WHITE_PAGE", 1, "one inset"],
  WHITE_COMPOSITE_2: ["WHITE_PAGE", 2, "two-panel composite"],
  WHITE_ISOLATE: ["WHITE_PAGE", 1, "isolated single panel"],
  WHITE_FRAGMENT: ["WHITE_PAGE", 1, "fragmented single panel"],
  WHITE_ACTION_STRIP_2: ["WHITE_PAGE", 2, "two action strips"],
  WHITE_TRIPTYCH: ["WHITE_PAGE", 3, "three-panel triptych"],
  BLACK_INSET: ["BLACK_PAGE", 1, "one inset"],
  BLACK_COMPOSITE_2: ["BLACK_PAGE", 2, "two-panel composite"],
  BLACK_REVEAL_STRIP: ["BLACK_PAGE", 1, "one reveal strip"],
  BLACK_FLOATING_DETAIL: ["BLACK_PAGE", 2, "one main panel with one floating detail"],
  BLACK_TRIPTYCH: ["BLACK_PAGE", 3, "three-panel triptych"],
  FULL_BLEED: ["OTHER", 1, "Full-bleed vertical webtoon panel"],
  SPLASH: ["OTHER", 1, "Full-page vertical manhwa splash panel"],
  CHARACTER_CLOSEUP: ["OTHER", 1, "Full-page vertical character close-up"],
  OBJECT_DETAIL: ["OTHER", 1, "Full-page vertical object detail"],
  ENVIRONMENT_BREATHER: ["OTHER", 1, "Full-page vertical environment breather"],
  TALL_ACTION: ["OTHER", 1, "Tall vertical action panel"],
};

const specs = [
  ["A001","VO_B01_01","BLACK_REVEAL_STRIP",60,["containment_table_wide"],{},["C_KWON_RYUGAK","corpse_sealed"],["P_MORGUE_SEALS"],"dead villain secured in containment beneath three iron oath seals at the instant of national death",["dead villain secured in containment","three iron oath seals"]],
  ["A001","VO_B01_01","FULL_BLEED",0,["clock_booth_macro"],{},["C_KWON_RYUGAK","corpse_sealed"],["P_MORGUE_CLOCK_0217"],"02:17 clock marker reflected over the national enemy corpse and a black mortuary seal",["02:17 clock marker","national enemy corpse"]],
  ["A002","VO_B01_01","WHITE_FRAGMENT",70,["oath_seal_overhead"],{},["C_MIN_JAEHA","cleanup_entry"],[],"cleaner handling blood enters the sealed work zone one minute after the death",["cleaner handling blood","sealed work zone"]],
  ["A002","VO_B01_01","CHARACTER_CLOSEUP",0,["cleanup_drain_knee_rear"],{},["C_MIN_JAEHA","cleaning_blood"],[],"red blood cleanup water and stained mop fibers enter the floor drain beneath trembling gloves",["blood cleanup water","stained mop fibers"]],
  ["A003","VO_B01_01","WHITE_COMPOSITE_2",48,["service_door_axis","clock_booth_macro"],{},["C_MIN_JAEHA","zero_badge_reveal"],["P_CLEANING_LICENSE_ZERO_VETA"],"zero Veta status and morgue cleaner identity are proven by the clipped license badge and exhausted face",["zero Veta status","morgue cleaner identity"]],
  ["A003","VO_B01_01","BLACK_INSET",62,["warning_service_rear"],{},["C_MIN_JAEHA","zero_badge_reveal"],["P_FRACTURE_WARNING_SYMBOL"],"isolated zero-rank cleaner stands small beneath a broken-return Fracture warning symbol",["zero-rank cleaner","Fracture warning symbol"]],
  ["A004","VO_B01_01","ENVIRONMENT_BREATHER",0,["warning_service_rear"],{},null,["P_FRACTURE_WARNING_SYMBOL"],"Fracture rule appears through a blank crossing icon and a returning human silhouette broken into fragments",["Fracture rule","returning human silhouette"]],
  ["A005","VO_B02_01","BLACK_INSET",60,["service_door_axis"],{},["C_MIN_JAEHA","oxygen_choice"],["P_HOSPITAL_OXYGEN_NOTICE"],"hospital oxygen deadline forces the young Korean cleaner to accept the shift for his oxygen-dependent younger sister before dawn",["hospital oxygen deadline","oxygen-dependent younger sister"]],
  ["A005","VO_B02_01","WHITE_COMPOSITE_2",50,["oxygen_bed_window_wide","oxygen_monitor_relief_close"],{scenario:"L_HOSPITAL_HANEUL"},["C_MIN_HANA","oxygen_deadline"],["P_HOSPITAL_OXYGEN_NOTICE"],"oxygen-dependent sister waits in the dawn hospital bed while the cutoff monitor approaches its limit",["oxygen-dependent sister","cutoff monitor"]],
  ["A006","VO_B03_01","ENVIRONMENT_BREATHER",0,["containment_table_wide"],{},["C_KWON_RYUGAK","corpse_sealed"],["P_MORGUE_SEALS"],"dead Kwon remains under three iron oath seals and a sealed mortuary bag",["dead Kwon","sealed mortuary bag"]],
  ["A006","VO_B03_01","WHITE_TRIPTYCH",45,["oath_seal_overhead","gurney_rail_profile","clock_booth_macro"],{},["C_KWON_RYUGAK","oath_seal_twitch"],["P_MORGUE_SEALS"],"three iron oath seals tighten as an impossible death reflex travels through shackles and tag",["three iron oath seals","impossible death reflex"]],
  ["A007","VO_B03_01","BLACK_REVEAL_STRIP",58,["mortuary_bag_bedside"],{},["C_MIN_JAEHA","wrist_grabbed","C_KWON_RYUGAK","corpse_grip"],[],"corpse gripping Jaeha tears open the mortuary bag and captures his wrist",["corpse gripping Jaeha","captures his wrist"]],
  ["A007","VO_B03_01","FULL_BLEED",0,["beast_mark_diagonal"],{},["C_MIN_JAEHA","wrist_grabbed","C_KWON_RYUGAK","corpse_grip"],[],"corpse hand yanks the cleaner off balance across the steel table in one violent contact",["corpse hand","violent contact"]],
  ["A008","VO_B03_01","WHITE_COMPOSITE_2",46,["wrist_contact_macro","dying_face_profile"],{},["C_MIN_JAEHA","receipt_implant_shock","C_KWON_RYUGAK","corpse_grip"],["P_RECIBO_NEGRO"],"black receipt mark is driven under Jaeha skin while the corpse refuses to ask for help",["black receipt mark","driven under Jaeha skin"]],
  ["A008","VO_B03_01","OBJECT_DETAIL",0,["wrist_contact_macro"],{},["C_MIN_JAEHA","receipt_implant_shock"],["P_RECIBO_NEGRO"],"burned receipt sigil spreads beneath skin with black invoice edges and a single pulse",["burned receipt sigil","black invoice edges"]],
  ["A009","VO_B03_01","BLACK_INSET",65,["dying_face_profile"],{},["C_KWON_RYUGAK","dying_lips"],["P_RECIBO_NEGRO"],"dying lips issue a final collection command while the receipt ash clings to steel",["dying lips","final collection command"]],
  ["A010","VO_B03_01","WHITE_ACTION_STRIP_2",45,["oath_seal_overhead","registry_terminal_close"],{},["C_MIN_JAEHA","registry_burn_recoil"],["P_MORGUE_SEALS","SYSTEM_ENEMY_HEIR_REGISTRY"],"enemy heir registry burns Jaeha identity as the morgue seals transfer official blame",["enemy heir registry","morgue seals transfer"]],
  ["A010","VO_B03_01","SPLASH",0,["registry_target_low"],{},["C_MIN_JAEHA","registry_burn_recoil"],["SYSTEM_ENEMY_HEIR_REGISTRY"],"state-scale enemy-heir halo overwhelms the powerless cleaner without changing his face",["enemy-heir halo","powerless cleaner"]],
  ["A011","VO_B04_01","TALL_ACTION",0,["escape_service_rear"],{},["C_MIN_JAEHA","fleeing_rib_birth","C_KWON_RYUGAK","rib_cavity_collapse"],["E_FRACTURE_BEAST_RIB"],"rib-born Fracture beast begins behind the fleeing cleaner as the corpse cavity ruptures",["rib-born Fracture beast","corpse cavity ruptures"]],
  ["A011","VO_B04_01","BLACK_REVEAL_STRIP",58,["rib_shadow_profile"],{},["C_MIN_JAEHA","fleeing_rib_birth","C_KWON_RYUGAK","rib_cavity_collapse"],["E_FRACTURE_BEAST_RIB"],"blind bone creature completes birth from contaminated ribs under violet-black fluid",["blind bone creature","contaminated ribs"]],
  ["A012","VO_B04_01","WHITE_COMPOSITE_2",48,["oath_seal_overhead","rib_shadow_profile"],{},["C_MIN_JAEHA","hunted_mark","C_KWON_RYUGAK","rib_cavity_collapse"],["E_FRACTURE_BEAST_RIB","P_RECIBO_NEGRO"],"beast targeting wrist mark turns away from the dead corpse and launches at Jaeha",["beast targeting wrist mark","turns away from the dead corpse"]],
  ["A012","VO_B04_01","BLACK_FLOATING_DETAIL",60,["beast_mark_diagonal","pulse_wrist_macro"],{},["C_MIN_JAEHA","hunted_mark"],["E_FRACTURE_BEAST_RIB","P_RECIBO_NEGRO"],"hooked claw hangs near the marked wrist while the target sigil pulses in a floating detail",["hooked claw","target sigil pulses"]],
  ["A013","VO_B04_01","OBJECT_DETAIL",0,["pulse_wrist_macro"],{},["C_MIN_JAEHA","pulse_rule_focus"],["P_RECIBO_NEGRO"],"activation rule from pulse connects surviving visible damage with collecting a black balance",["activation rule from pulse","surviving visible damage"]],
  ["A014","VO_B05_01","WHITE_INSET",68,["wound_impact_ots"],{},["C_MIN_JAEHA","accepting_wound"],["E_FRACTURE_BEAST_RIB","P_RECIBO_NEGRO"],"Jaeha choosing not to dodge presents his shoulder to a hostile wound accepted by deliberate choice",["Jaeha choosing not to dodge","hostile wound accepted"]],
  ["A014","VO_B05_01","BLACK_TRIPTYCH",55,["whisper_wrist_bay","clock_booth_macro","wound_impact_ots"],{},["C_MIN_JAEHA","wounded_resolve"],["E_FRACTURE_BEAST_RIB","P_CLEANING_LICENSE_ZERO_VETA"],"resolved eyes, empty zero-rank badge, and the entering claw prove he has no other currency",["zero-rank badge","entering claw"]],
  ["A015","VO_B06_01","SPLASH",0,["chain_wound_worms_eye"],{},["C_MIN_JAEHA","chain_release"],["E_FRACTURE_BEAST_RIB","P_RECIBO_NEGRO","P_BLACK_CHAIN"],"black chain from wound erupts upward and begins to break the beast",["black chain from wound","break the beast"]],
  ["A015","VO_B06_01","WHITE_ACTION_STRIP_2",45,["drain_ground_rear","beast_break_profile"],{},["C_MIN_JAEHA","chain_followthrough"],["E_FRACTURE_BEAST_RIB","P_BLACK_CHAIN"],"beast defeated as the chain crosses the morgue and splits its bone shell over the drain",["beast defeated","splits its bone shell"]],
  ["A016","VO_B06_01","BLACK_INSET",65,["rank_ui_front"],{},["C_MIN_JAEHA","rank_aftershock"],["SYSTEM_RANK"],"rank rising from zero surrounds the wounded cleaner with level-one geometric light",["rank rising from zero","level-one geometric light"]],
  ["A017","VO_B06_01","OBJECT_DETAIL",0,["registry_terminal_close"],{},["C_MIN_JAEHA","rank_aftershock"],["SYSTEM_RANK","P_OXYGEN_PAID_CONFIRMATION"],"oxygen paid and inherited balance appear as stable icons beside level one",["oxygen paid","inherited balance"]],
  ["A017","VO_B06_01","WHITE_COMPOSITE_2",50,["phone_oxygen_macro","pulse_wrist_macro"],{},["C_MIN_JAEHA","rank_aftershock"],["P_OXYGEN_PAID_CONFIRMATION","P_BORROWED_CONTROL_WARNING","P_RECIBO_NEGRO"],"borrowed control warning follows the oxygen confirmation as a shadow hand reaches for his arm",["borrowed control warning","oxygen confirmation"]],
  ["A018","VO_B07_01","BLACK_REVEAL_STRIP",58,["forced_writing_ots"],{},["C_MIN_JAEHA","forced_arm_writing"],["P_ORDEN_PENDIENTE","P_BORROWED_CONTROL_WARNING"],"arm moving against Jaeha will begins to write a violent pending order on steel",["arm moving against Jaeha will","violent pending order"]],
  ["A018","VO_B07_01","CHARACTER_CLOSEUP",0,["forced_writing_ots"],{},["C_MIN_JAEHA","forced_arm_writing"],["P_ORDEN_PENDIENTE"],"horrified face watches controlled fingers carve pictographs without consent",["controlled fingers","without consent"]],
  ["A019","VO_B07_01","OBJECT_DETAIL",0,["registry_terminal_close"],{},["C_MIN_JAEHA","forced_arm_writing"],["P_ORDEN_PENDIENTE","F_CAZADORES_HANSE"],"pending order shows a throat-breaking pictograph tied to the first Hanse agent without readable words",["throat-breaking pictograph","first Hanse agent"]],
  ["A020","VO_B07_01","BLACK_FLOATING_DETAIL",60,["gurney_pov","gurney_rail_profile"],{},["C_MIN_JAEHA","resisting_order"],["P_ORDEN_PENDIENTE","P_RECIBO_NEGRO"],"Jaeha pinning his own wrist to resist spreads blood across the gurney rail",["Jaeha pinning his own wrist to resist","blood across the gurney rail"]],
  ["A020","VO_B07_01","OBJECT_DETAIL",0,["gurney_rail_profile"],{},["C_MIN_JAEHA","resisting_order"],["P_ORDEN_PENDIENTE"],"broken order filament stops before the service door while the wrist remains pinned",["broken order filament","wrist remains pinned"]],
  ["A021","VO_B08_01","WHITE_TRIPTYCH",45,["hunter_breach_ots","service_door_axis","signature_scan_profile"],{},["C_MIN_JAEHA","accused_survivor","C_YUN_SERA","breach_command"],["F_CAZADORES_HANSE"],"Hanse hunters arriving breach the door, sweep the room, and confront the surviving cleaner",["Hanse hunters arriving","surviving cleaner"]],
  ["A021","VO_B08_01","BLACK_INSET",65,["empty_table_birds_eye"],{},null,["P_MORGUE_SEALS","F_CAZADORES_HANSE"],"empty villain table and collapsed mortuary bag become the central evidence",["empty villain table","collapsed mortuary bag"]],
  ["A022","VO_B08_01","FULL_BLEED",0,["signature_scan_profile"],{},["C_MIN_JAEHA","signature_scan_exposed","C_YUN_SERA","signature_scan_verdict"],["P_KWON_SIGNATURE_BODY_SCAN","F_CAZADORES_HANSE","E_FRACTURE_BEAST_RIB"],"black inherited enemy signature moving inside the wounded young Korean cleaner is exposed by sensor lances above beast blood",["black inherited enemy signature","beast blood"]],
  ["A022","VO_B08_01","WHITE_COMPOSITE_2",48,["drain_ground_rear","beast_break_profile"],{},["C_MIN_JAEHA","signature_scan_exposed"],["P_KWON_SIGNATURE_BODY_SCAN","E_FRACTURE_BEAST_RIB"],"boots in beast blood and black body-scan veins form two independent pieces of evidence",["boots in beast blood","body-scan veins"]],
  ["A023","VO_B08_01","BLACK_COMPOSITE_2",55,["hunter_breach_ots","registry_terminal_close"],{},["C_MIN_JAEHA","accused_survivor","C_YUN_SERA","state_broadcast"],["P_STATE_BROADCAST","P_KWON_SIGNATURE_BODY_SCAN"],"the dark-navy Hanse captain's state broadcast pairs the wounded young Korean cleaner's face with the dead enemy's official black signature without merging identities",["Hanse captain's state broadcast","official black signature"]],
  ["A023","VO_B08_01","SPLASH",0,["registry_target_low"],{},["C_MIN_JAEHA","signature_scan_exposed","C_YUN_SERA","state_broadcast"],["P_STATE_BROADCAST","SYSTEM_ENEMY_HEIR_REGISTRY"],"state target halo classifies Jaeha as the national enemy while preserving his own face",["state target halo","preserving his own face"]],
  ["A024","VO_B09_01","WHITE_ISOLATE",72,["whisper_wrist_bay"],{},["C_MIN_JAEHA","cliffhanger_mark"],["P_RECIBO_NEGRO","P_ORDEN_PENDIENTE"],"whispering wrist mark reveals that power was not inherited alone",["whispering wrist mark","power was not inherited alone"]],
  ["A024","VO_B09_01","OBJECT_DETAIL",0,["receipt_layers_macro"],{},["C_MIN_JAEHA","cliffhanger_mark"],["P_RECIBO_NEGRO","P_ORDEN_PENDIENTE"],"pending orders revelation unfolds as many violent receipt layers beyond the marked hand",["pending orders revelation","violent receipt layers"]],
];

if (specs.length !== 43) throw new Error(`expected 43 specs, got ${specs.length}`);

const SCALE_TERM = { MACRO:"macro", EXTREME_CLOSE:"extreme close-up", CLOSE:"close shot", MEDIUM:"medium shot", FULL:"full shot", WIDE_MASTER:"wide master", TRUE_LONG:"true long shot" };
const ELEVATION_TERM = { EYE_LEVEL:"eye-level", LOW:"low-angle", HIGH:"high-angle", BIRDS_EYE:"bird's-eye", TOP_DOWN:"top-down", WORMS_EYE:"worm's-eye", KNEE_LEVEL:"knee-level", GROUND_LEVEL:"ground-level" };
const VIEWPOINT_TERM = { FRONT:"front view", THREE_QUARTER_FRONT:"three-quarter front", PROFILE:"profile view", OTS:"over-the-shoulder", POV:"point-of-view", REAR:"rear view", REAR_THREE_QUARTER:"rear three-quarter" };

function refsFromPairs(pairList) {
  if (!pairList) return [];
  const refs = [];
  for (let index = 0; index < pairList.length; index += 2) refs.push({ id: pairList[index], pose: pairList[index + 1] });
  return refs;
}

function characterDescription(refs) {
  return refs.map((ref) => {
    const character = project.characters[ref.id];
    const performance = character.poses[ref.pose].performance_signature;
    return `${character.prompt_signature}; ${performance.emotion}; ${performance.body}; ${performance.gaze}; ${performance.hands}`;
  }).join(" alongside ");
}

const initialState = {
  Jaeha: "zero Veta morgue cleaner before inheritance",
  Kwon: "dead under iron containment",
  mark: "absent",
  beast: "not born",
  Hanse: "absent",
  Hana_oxygen: "unpaid before dawn",
  order: "dormant",
};
const updates = new Map([
  [12,{Kwon:"corpse moving and gripping Jaeha"}], [14,{mark:"black receipt implanted and active"}],
  [16,{Kwon:"dead after final command"}], [17,{Jaeha:"registered enemy heir with zero Veta",mark:"active enemy-heir receipt"}],
  [20,{beast:"rib-born Fracture beast alive"}], [21,{beast:"targeting Jaeha wrist mark"}],
  [24,{Jaeha:"deliberately accepting a hostile wound"}], [26,{Jaeha:"wounded and releasing black chain"}],
  [27,{beast:"destroyed into bone shell and blood"}], [28,{Jaeha:"rank one marked enemy heir"}],
  [29,{Hana_oxygen:"paid and stabilized"}], [30,{order:"borrowed control warning active"}],
  [31,{order:"violent Hanse order controlling Jaeha arm"}], [35,{order:"resisted but still pending"}],
  [36,{Hanse:"hunters inside morgue"}], [38,{Hanse:"scanning Kwon signature in Jaeha"}],
  [40,{Jaeha:"state-classified as Kwon Ryu-gak",Hanse:"broadcasting enemy identification"}],
  [43,{order:"multiple inherited orders pending"}],
]);

let continuityState = structuredClone(initialState);
let previousLocation = null;
let previousLighting = null;
const scenes = [];
const firstSceneByUnit = new Map();
const sourceIdsByObligation = new Map();
const evidenceByObligation = new Map();
for (let index = 0; index < specs.length; index++) {
  const [unitId, obligationId, layout, background, viewIds, options, pairList, ingredients, action, evidence] = specs[index];
  const sceneNumber = index + 1;
  const id = `scene_${String(sceneNumber).padStart(2,"0")}`;
  const [family, panelCount, layoutAnchor] = LAYOUT[layout];
  const scenarioId = options.scenario || "L_MORGUE_RAIZ";
  const scenario = project.escenarios[scenarioId];
  const charRefs = refsFromPairs(pairList);
  const allVisible = [...charRefs.map((ref) => ref.id), ...ingredients];
  const shots = viewIds.map((viewId, shotIndex) => {
    const view = scenario.views[viewId] || project.escenarios.L_MORGUE_RAIZ.views[viewId];
    if (!view) throw new Error(`${id}: missing ${scenarioId}.${viewId}`);
    const camera = {
      scale: shotScales.get(viewId) || "MEDIUM",
      elevation: view.camera_signature.elevation,
      viewpoint: view.camera_signature.viewpoint,
      azimuth_deg: view.camera_signature.azimuth_deg,
      lens_mm: view.camera_signature.lens_mm,
      roll_deg: view.camera_signature.roll_deg,
      dominant_subject: charRefs[0]?.id || ingredients[0] || "environment",
      occupancy_pct: charRefs.length ? 70 : 82,
    };
    const roll = Math.abs(camera.roll_deg) < 10 ? "level camera roll" : (camera.roll_deg > 0 ? "clockwise Dutch tilt" : "counterclockwise Dutch angle");
    const subject = charRefs.length ? `${characterDescription(charRefs)}; ${action}` : action;
    const fragment = `Panel ${String.fromCharCode(65 + shotIndex)}: ${SCALE_TERM[camera.scale]}, ${ELEVATION_TERM[camera.elevation]}, ${VIEWPOINT_TERM[camera.viewpoint]}, ${roll}, using a ${camera.lens_mm}mm lens. ${subject}. The setting is ${scenario.prompt_signature}; ${view.prompt_signature}.`;
    return {
      panel_id: String.fromCharCode(65 + shotIndex),
      content_role: ["PRIMARY","REACTION","DETAIL"][shotIndex] || "DETAIL",
      visible_entities: allVisible,
      location_id: scenarioId,
      view_id: viewId,
      camera,
      prompt_fragment: fragment,
    };
  });
  if (shots.length !== panelCount) throw new Error(`${id}: ${layout} needs ${panelCount} views, got ${shots.length}`);
  const panelWord = ["zero","one","two","three"][panelCount];
  const composition = `exactly ${panelWord} image panel${panelCount === 1 ? "" : "s"}; ${layoutAnchor} stages microbeat ${sceneNumber} with professional reading order and deliberate value hierarchy`;
  const pageOpening = family === "WHITE_PAGE"
    ? `Pure white webtoon page with ${layoutAnchor} and white space occupying ${background}% of the canvas.`
    : family === "BLACK_PAGE"
      ? `Matte-black webtoon page with ${layoutAnchor} and black space occupying ${background}% of the canvas.`
      : `${layoutAnchor} filling the 9:16 canvas without an outer reserved page margin.`;
  const characterNegatives = [...new Set(charRefs.flatMap((ref) => project.characters[ref.id].negative_invariants))];
  const ingredientDescriptions = ingredients.map((ingredientId) => {
    const ingredient = project.ingredients.find((item) => item.id === ingredientId);
    return ingredient ? ingredient.generation_prompt.split(". Hand-drawn")[0] : ingredientId;
  });
  const imagePrompt = [
    pageOpening,
    composition + ".",
    ...shots.map((shot) => shot.prompt_fragment),
    ingredientDescriptions.length ? `Referenced visual ingredients: ${ingredientDescriptions.join("; ")}.` : "",
    `Evidence anchors: ${evidence.join("; ")}.`,
    `${STYLE}.`,
    `${characterNegatives.join(", ")}${characterNegatives.length ? "; " : ""}${NEGATIVE.join(", ")}; exactly the declared image panels.`,
  ].filter(Boolean).join(" ");
  const stateIn = structuredClone(continuityState);
  if (updates.has(sceneNumber)) Object.assign(continuityState, updates.get(sceneNumber));
  const stateOut = structuredClone(continuityState);
  const lighting = scenarioId === "L_HOSPITAL_HANEUL" ? "dawn_oxygen_monitor" : sceneNumber >= 36 ? "cold_fluorescent_hanse_red" : sceneNumber >= 19 && sceneNumber <= 35 ? "cold_fluorescent_violet_fracture" : "cold_fluorescent_alarm";
  const continuity = {
    moment_id: `M_${String(sceneNumber).padStart(3,"0")}`,
    state_in: stateIn,
    state_out: stateOut,
    identity_ids: [...allVisible],
    location_id: scenarioId,
    lighting_id: lighting,
    approved_reference_hashes: [],
  };
  if (previousLocation && (previousLocation !== scenarioId || previousLighting !== lighting)) {
    continuity.continuity_change_reason = previousLocation !== scenarioId
      ? "explicit cutaway or return required by the locked oxygen causality"
      : "story pressure changes the practical alarm and Fracture lighting state";
  }
  previousLocation = scenarioId;
  previousLighting = lighting;
  const ownerCount = specs.slice(0,index).filter((spec) => spec[0] === unitId).length;
  const timingWeight = specs.filter((spec) => spec[0] === unitId).length === 1 ? 1 : (ownerCount === 0 ? 1.15 : 0.85);
  const scene = {
    id,
    type: "panel",
    render_mode: "static",
    narration_ref: { unit_id: unitId, timing_weight: timingWeight },
    references: {
      characters: charRefs,
      escenario: { id: scenarioId, view: viewIds[0], geometry_authority: "GEOMETRY_LOCK" },
      ingredients,
    },
    references_v7: [],
    visual: { image_prompt: imagePrompt },
    visual_plan: {
      native_page: { family, layout, background_pct: background, panel_count: panelCount, composition },
      shots,
    },
    continuity,
    transition_in: sceneNumber === 9 || sceneNumber === 10 ? "dip_black" : ([17,28,31,36,40].includes(sceneNumber) ? "flash" : "cut"),
    editor_motion: { enabled: false, preset: "static", zoom: 1, pan: 0 },
  };
  scenes.push(scene);
  if (!firstSceneByUnit.has(unitId)) firstSceneByUnit.set(unitId, id);
  if (!sourceIdsByObligation.has(obligationId)) sourceIdsByObligation.set(obligationId, []);
  if (!evidenceByObligation.has(obligationId)) evidenceByObligation.set(obligationId, []);
  sourceIdsByObligation.get(obligationId).push(id);
  evidenceByObligation.get(obligationId).push({ shot_id: id, required_terms: evidence });
}

project.project.target_runtime_seconds = 95;
project.pipeline.image_generation.tool = "grok";
project.pipeline.image_generation.mode = "GROK_NATIVE_PAGE";
project.pipeline.animation = { tool: "none" };
project.v7_contract.mode = "PRODUCTION";
project.v7_contract.timeline_model = "NARRATION_VISUAL_TRACKS_V1";
project.v7_contract.production_panel_count = 43;
delete project.v7_contract.pilot_panel_count;
project.v7_contract.page_mix.counts = { white: 13, black: 13, other: 17 };
project.narration_track = {
  version: "1.0",
  canonicalization: "NFC_LF_UTF8_NO_TRAILING_LF",
  join: "LF",
  unit_count: lines.length,
  units: lines.map((text, index) => ({ id: `A${String(index + 1).padStart(3,"0")}`, speaker: "narrador", text })),
};
project.scenes = scenes;
project.tts_export.dialogue = project.narration_track.units.map((unit) => ({
  scene_id: firstSceneByUnit.get(unit.id),
  speaker: unit.speaker,
  text: unit.text,
}));
project.tts_export.full_script = fullScript;
project.production_lock.monologue_sha256 = canonicalHash;
project.production_lock.story_packet_path = path.basename(packetTarget);
project.obligation_map = [...originalObligations.values()].map((item) => ({
  obligation_id: item.obligation_id,
  atom_ids: item.atom_ids,
  must_show: item.must_show,
  required_relationship: item.required_relationship,
  source_shot_ids: sourceIdsByObligation.get(item.obligation_id) || [],
  prompt_evidence: evidenceByObligation.get(item.obligation_id) || [],
}));

if (!fs.existsSync(packetSource)) throw new Error(`Story Packet not found: ${packetSource}`);
const packetBytes = fs.readFileSync(packetSource);
project.production_lock.story_packet_sha256 = crypto.createHash("sha256").update(packetBytes).digest("hex");
fs.copyFileSync(packetSource, packetTarget);

const serialized = JSON.stringify(project, null, 2) + "\n";
fs.writeFileSync(outputPath, serialized, "utf8");
console.log(JSON.stringify({
  outputPath,
  storyPacket: packetTarget,
  scenes: scenes.length,
  narrationUnits: lines.length,
  pageMix: project.v7_contract.page_mix.counts,
  monologueSha256: canonicalHash,
  packetSha256: project.production_lock.story_packet_sha256,
  provider: project.pipeline.image_generation.tool,
}, null, 2));
