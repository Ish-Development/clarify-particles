#!/bin/sh
# The brand lab (gallery, export and morph labs) to Vercel: its own project,
# clarify-brand-lab (ISH team), public at https://clarify-brand-lab.vercel.app.
# Separate from clarify-particles, the reference page the devs use.
set -e
cd "$(dirname "$0")/.."
npm run build:lab
mkdir -p dist-lab/.vercel
echo '{"projectId":"prj_fbFXOYA1DtmamJXdnIEd0wClNEiB","orgId":"team_fcMojw0MDvU6nWIaujfpb8Js","projectName":"clarify-brand-lab"}' > dist-lab/.vercel/project.json
cat > dist-lab/vercel.json <<'JSON'
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "installCommand": "",
  "buildCommand": "",
  "outputDirectory": ".",
  "redirects": [{ "source": "/", "destination": "/lab/models.html", "permanent": false }]
}
JSON
cd dist-lab && vercel deploy --prod --yes --scope ish24
