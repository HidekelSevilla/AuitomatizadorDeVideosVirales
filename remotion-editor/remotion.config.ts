import { Config } from "@remotion/cli/config";

// Salida en H.264 / MP4 por defecto (compatible con redes sociales).
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setOverwriteOutput(true);
