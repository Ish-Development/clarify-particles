import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

// Dev server for the lab pages (lab/*.html): `npx vite --config vite.lab.config.ts`.
// The lab posts its dial values here on every change, and they land in
// lab/state.json, so what's on screen can be read back and baked in.
function labState(): Plugin {
  return {
    name: "lab-state",
    configureServer(server) {
      server.middlewares.use("/__lab/state", (req, res) => {
        if (req.method !== "POST") return void res.writeHead(405).end();
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            writeFileSync(resolve(__dirname, "lab/state.json"), JSON.stringify(JSON.parse(body), null, 2) + "\n");
            res.writeHead(204).end();
          } catch {
            res.writeHead(400).end();
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [labState()],
  // the lab writes state.json; don't reload the page for it
  server: { watch: { ignored: ["**/lab/state.json"] } },
});
