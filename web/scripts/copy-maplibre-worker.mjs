// MapLibre v6 runs tile parsing in a module web worker. Bundlers can't inline it, so the
// worker (and the shared chunk it imports) are served as static files from /public/maplibre.
import fs from "node:fs";
const src = "node_modules/maplibre-gl/dist";
fs.mkdirSync("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) fs.copyFileSync(`${src}/${f}`, `public/maplibre/${f}`);
