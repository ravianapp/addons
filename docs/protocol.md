# The Ravian addon protocol

Version 1. This is the reference. For a first addon, read [guide.md](guide.md) first.

An addon is a music source for Ravian. It is an HTTPS server, or a folder of static JSON files. Ravian sends `GET`
requests and one optional `POST`. The paths are the same as in Stremio, so a Stremio developer knows them.

## 1. Requests

| Request | Path | Answer |
|---|---|---|
| Manifest | `{base}/manifest.json` | the manifest (section 2) |
| Catalog | `{base}/catalog/{type}/{id}.json` | `{ "metas": [Meta, …] }` |
| Catalog page or search | `{base}/catalog/{type}/{id}/{extra}.json`, for example `search=gharar&skip=100` | `{ "metas": [Meta, …] }` |
| Details | `{base}/meta/{type}/{id}.json` | `{ "meta": Meta }` |
| Stream | `{base}/stream/track/{id}.json` | `{ "streams": [Stream, …] }` |
| Recognize (optional) | `POST {base}/recognize` | `{ "track": { "title", "artist", "cover" } }`, or `{ "track": null }` |

- In `{extra}`, only each value is URL-encoded (UTF-8). `=` and `&` stay as separators.
- `{id}` is URL-encoded in the path. An id `ex:12` comes as `ex%3A12`.
- A static addon answers each path with a file, so it needs no server. It answers only the searches that it has files
  for.
- Send `Content-Type: application/json`. A failed request gets an HTTP error status. Ravian shows an error for that
  addon only.
- Ravian waits 10 seconds for an answer, and 30 seconds for `/recognize`.

**Recognize** is the only `POST`. The body is an audio clip of about 10 seconds, `Content-Type: audio/mp4` (AAC). The
answer names the song: `title` is required, `artist` and `cover` are optional. Ravian then searches for
`artist title`. Ravian sends it only when `resources` has `recognize`.

**Install header.** Each request has `X-Ravian-Install`: 32 hex digits, from a random id for each install and the
addon's host. Use it to count and limit each user's use. Two addons get different values for the same user, so it cannot
match users across addons. Do not keep it longer than your privacy text says.

**Types** (fixed): `track`, `album`, `artist`, `playlist`, and for spoken audio `podcast`, `audiobook`, `episode`
(section 3.1). `radio` is reserved. Ravian skips an item of a type that it does not know.

## 2. Manifest

```json
{
  "id": "org.example.music",
  "version": "1.0.0",
  "name": "Example Music",
  "description": "Public-domain recordings.",
  "ravian": 1,
  "resources": ["catalog", "meta", "stream"],
  "types": ["track", "album", "artist"],
  "catalogs": [
    { "type": "album", "id": "new", "name": "New albums", "extra": [{ "name": "skip" }] },
    { "type": "track", "id": "all", "name": "Search", "extra": [{ "name": "search", "isRequired": true }] }
  ],
  "idPrefixes": ["ex:"]
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | A unique id, for example a reversed domain. It must not change. |
| `version` | yes | The addon's own version, as a string. |
| `name`, `description` | `name` yes | Ravian shows them. A part in brackets, as in `World (test)`, is left out in short places. |
| `ravian` | yes | The protocol version: `1`. Ravian refuses a version that it does not know. |
| `resources` | yes | What the addon can do: `catalog`, `meta`, `stream`, and the optional `recognize`. Ravian shows only those actions. |
| `types` | yes | The types that the addon gives. |
| `catalogs` | yes | The rows of the addon. A catalog with a required `search` extra makes the addon searchable. |
| `idPrefixes` | no | Each Meta id starts with one of them. |
| `scope` | no | `persian` or `international`, on the manifest or on one catalog. Ravian's content chips (All, Persian, International) show a catalog only in its scope. A catalog's own `scope` wins. Search is never filtered by scope. |
| `ranked` | no | On one catalog: `true` when its items are in rank order, as a chart. Ravian numbers them on Home. A `track` catalog shows on Home as a list of songs, 4 to a column. |
| `configurable` | no | `true` when the addon has a settings page at `{base}/configure` (section 2.1). |

**Catalogs with a fixed meaning.** Ravian finds them by `type` and `id`:

| Catalog | `search` value | Answer | Used by |
|---|---|---|---|
| `playlist`, any id, with `search` | text | playlists | Search, and the genre cards of Browse |
| `artist`, any id, with `search` | text | artists | Search, and the artist page |
| `album` / `dastgah` | a dastgah key: `shur`, `segah`, `chahargah`, `mahur`, `homayun`, `nava`, `rast-panjgah` | albums in that dastgah | the dastgah cards of Browse |

The song search is the first other catalog with `search`. It is never `album` / `dastgah`, `podcast` or `audiobook`.
A catalog of `podcast` with `search` answers the podcast search.

### 2.1 Settings page

With `"configurable": true`, Ravian shows a Settings button that opens `{base}/configure` in the browser.

1. The page shows the settings.
2. The page puts the settings in a new addon link, for example `{base}/{settings}/manifest.json`.
3. The page opens `ravian://addon?url={the new link, URL-encoded}`.
4. Ravian loads the link, and saves it in place of the saved link with the same manifest `id`.

A link can hold a key. Ravian shows only its host, and never logs it.

## 3. Meta

One object for all types. Leave out a field that does not apply.

| Field | Type | For | Note |
|---|---|---|---|
| `id` | string | all | starts with one of `idPrefixes` |
| `type` | string | all | `track`, `album`, `artist`, `playlist`, `podcast`, `audiobook`, `episode` |
| `name` | string | all | the title, or the album, artist or playlist name |
| `artist` | string | track, album, playlist | the display artist; for a playlist, its owner or source |
| `description` | string | album, playlist | optional, only in a `meta` answer |
| `album` | string | track | |
| `duration` | number | track | seconds |
| `trackNumber` | integer | track | 1 or more |
| `year` | integer | track, album | |
| `cover` | string | all | HTTPS URL of a square image |
| `tracks` | Meta[] | album, playlist | only in a `meta` answer, in play order. For an artist: the popular songs, most popular first |
| `credits` | `{ role, names[] }`[] | track | optional. `role` as the source writes it ("Lyrics", "Music"); Ravian translates the roles that it knows |
| `releaseType` | string | album | optional: `album`, `single` or `ep` |
| `fans` | integer | artist, album, playlist | optional: the number of fans at the data source |
| `fansFrom` | string | artist, album, playlist | the name of that source. Ravian shows no count without it |
| `albums` | Meta[] | artist | optional, only in a `meta` answer: the releases, newest first |
| `playlists` | Meta[] | artist | optional, only in a `meta` answer |
| `related` | Meta[] | artist, playlist | optional, only in a `meta` answer: similar artists, or similar playlists |

### 3.1 Podcasts and audiobooks

| Type | What | `tracks` in a `meta` answer |
|---|---|---|
| `podcast` | a show | its episodes, **newest first** |
| `audiobook` | a book | its chapters, **in reading order** |
| `episode` | one podcast episode or one book chapter; it plays | none |

- Use the same keys as for music: `artist` is the host or the author, and `credits` names the narrator
  (`{ "role": "Narrator", "names": [...] }`).
- An `episode` can have `released` (an ISO date, for example `2026-10-30`) and `album` (the name of its show or book).
- The stream of an episode uses the track path: `{base}/stream/track/{id}.json`.
- A `meta` answer has all episodes of a show. For more than 500, send the newest 500 and `"hasMore": true`.
- Ravian shows `podcast` and `audiobook` catalogs under their own content chips and under All, not under Music. A show
  or a book opens its own page. Ravian keeps the position of each episode and has speed and skip 15 s for episodes.
- Send `description` on each episode: the show page shows 2 lines of it. Keep it short (Ava cuts at 400 characters).
- Cache the sources that you read. The iTunes Search API allows about 20 requests a minute for each address.
- Keep catalogs with no required extra few: each one is one request when the screen opens.

## 4. Stream

| Field | Type | Note |
|---|---|---|
| `url` | string | HTTPS only. Ravian does not keep it: it asks again at play time, because such URLs can expire. |
| `headers` | object | optional HTTP headers for the request |
| `mime` | string | optional, for example `audio/mpeg` |
| `bitrate` | integer | optional, kbit/s. Ravian plays the first stream. With "Save data" on, it plays the lowest bitrate. |

Give stream links that expire, for example after 24 hours (the template does this). A link that never expires plays
your source for anybody who has it.

## 5. Trust

- HTTPS only. Debug builds of Ravian also accept `http://` to `localhost`, `127.0.0.1` and `10.0.2.2` for tests.
- An addon is data, not code. Ravian runs nothing that an addon sends.
- Ravian passes addon text through the same tag clean-up as local files.
- The JSON Schemas in [`tools/schema/`](../tools/schema) are the exact rules. `tools/check.py` checks an addon against them.
