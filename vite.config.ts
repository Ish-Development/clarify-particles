import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const PRESETS_FILE = resolve(__dirname, "src/runtime/presets.json");
const NAME = /^[a-z0-9][a-z0-9-]*$/;

// Dev-only endpoint that lets the playground read and write the site's
// section presets (src/runtime/presets.json) directly.
//   GET  /__presets                      -> presets.json
//   POST /__presets {name, preset}       -> save/overwrite one preset
//   POST /__presets {name, delete: true} -> remove one preset
function presetsApi(): Plugin {
  return {
    name: "presets-api",
    apply: "serve",
    // saving a preset must not hot-reload the playground mid-session
    handleHotUpdate({ file }) {
      if (file === PRESETS_FILE) return [];
    },
    configureServer(server) {
      server.middlewares.use("/__presets", (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        const read = () => JSON.parse(readFileSync(PRESETS_FILE, "utf8"));

        if (req.method === "GET") return send(200, read());
        if (req.method !== "POST") return send(405, { error: "method not allowed" });

        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", () => {
          try {
            const { name, preset, delete: del } = JSON.parse(raw);
            if (typeof name !== "string" || !NAME.test(name)) {
              return send(400, { error: "name must be lowercase letters, digits and dashes" });
            }
            const presets = read();
            if (del) delete presets[name];
            else if (preset?.type === "points" || preset?.type === "graph") presets[name] = preset;
            else return send(400, { error: "invalid preset" });
            writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2) + "\n");
            send(200, presets);
          } catch (err) {
            send(400, { error: String(err) });
          }
        });
      });
    },
  };
}

// Dev-only: the sections preview (?debug) posts engine state here, one JSON
// line per entry, so browser behavior can be read without screenshots.
function debugLog(): Plugin {
  const file = resolve(__dirname, ".particles-debug.log");
  const handle = (req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      appendFileSync(file, raw.trim() + "\n");
      res.statusCode = 204;
      res.end();
    });
  };
  return {
    name: "particles-debug-log",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__log", handle);
    },
    // the stable preview too, so a phone test on 4791 can be read from the log
    configurePreviewServer(server) {
      server.middlewares.use("/__log", handle);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [presetsApi(), debugLog()],
  // the playground uses top-level await
  build: {
    target: "es2022",
    rollupOptions: {
      input: { playground: resolve(__dirname, "index.html"), sections: resolve(__dirname, "sections.html") },
    },
  },
});
