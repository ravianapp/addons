# Ravian addons

The list of addons that the Ravian app shows in Settings → Sources → Addons. A person reviews each addon before it goes
in the list.

An addon is a music source for Ravian: an HTTPS server or a folder of JSON files. It sends data, not code. Ravian runs
nothing that an addon sends.

## Submit an addon

1. Check your addon: `python3 tools/check.py https://your-addon.example`. Repair each problem until it shows `0 problems`.
2. Open an issue with the form "Submit an addon". In the app, Settings → Sources → Publish an addon opens the same form.
3. A workflow checks the addon again and writes the result in the issue.
4. A reviewer accepts the addon or tells you why not.

The protocol is in `tools/schema/` and in the Ravian addon spec. `tools/check.py` uses only the Python standard library.

## Rules

- Give only content that you have the right to give.
- Give a contact address for questions and takedown requests.
- Do not use the install token (`X-Ravian-Install`) to match one user across addons.
- Do not change the manifest without a new review. A changed manifest leaves the list in one day.

## Report an addon

Open an issue with the form "Report an addon". In the app, each listed addon has a Report button.

## How the list works

- `addons/<id>.json` holds one reviewed addon: its URL, the SHA-256 of its manifest, and the review date.
- `blocked.json` holds manifest ids that the apps turn off, also when a user added the addon by its URL.
- `tools/build.js` reads each manifest again and writes `index.json`. An addon whose manifest changed leaves the list.
- The build signs `index.json` with ECDSA P-256 (SHA-256) into `index.json.sig`. The apps hold the public key and refuse
  a list with a bad signature.
- The workflow `publish.yml` runs on each push to `main` and once a day. It publishes on GitHub Pages at
  `https://addons.ravianapp.ir/index.json`.

## Accept an addon (reviewers)

1. Read the workflow's result in the issue. Open the addon in a debug build of Ravian.
2. Add the file that the result gives, as `addons/<id>.json`, in a commit to `main`.
3. Close the issue.

To remove an addon, delete its file. To turn it off on every phone, also add its id to `blocked.json`.

## Set up the repository (once)

1. Settings → Environments: make `registry`. Allow only the branch `main`. Add the secret `REGISTRY_KEY` (the private
   key in PEM).
2. Settings → Pages: Source "GitHub Actions". Custom domain `addons.ravianapp.ir`.
3. Make the labels `submission`, `report` and `changed`.
4. In Cloudflare, add `addons` CNAME `ravianapp.github.io`.

Keep the private key outside the repository. If it is lost, a new key needs a new app release.
