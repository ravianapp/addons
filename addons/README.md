# Reviewed addons

One JSON file for each reviewed addon, named after its manifest id: `addons/<id>.json`.

```json
{
  "url": "https://addon.example.org",
  "sha256": "the SHA-256 of manifest.json at the review",
  "reviewed": "2026-10-31"
}
```

`node tools/build.js entry <url>` writes this file for a new addon. The workflow `submission.yml` shows it in each
submission issue.
