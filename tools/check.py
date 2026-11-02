#!/usr/bin/env python3
"""Check a Ravian addon against the schemas in schema/.

Usage: python3 tools/addon/check.py <base-url | folder>
Exit code: 0 when there are no problems, 1 otherwise.
Standard library only. Ravian ships no addon, so this file is for addon authors.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA_DIR = os.path.join(HERE, "schema")
SEARCH = "test"  # the search value that the checker asks for
LOCAL_HOSTS = ("localhost", "127.0.0.1")  # plain http is allowed here, for local tests only
# A debug app also accepts plain http links to these hosts from a local addon (AddonSource.kt). 10.0.2.2 is the
# computer as the Android emulator sees it. main() sets this for a local addon only.
local_links = False


def local_http(value):
    url = urllib.parse.urlsplit(value)
    return url.scheme == "http" and url.hostname in LOCAL_HOSTS + ("10.0.2.2",)

TYPE_OK = {
    "object": lambda v: type(v) is dict,
    "array": lambda v: type(v) is list,
    "string": lambda v: type(v) is str,
    "boolean": lambda v: type(v) is bool,
    "number": lambda v: type(v) in (int, float),
    "integer": lambda v: type(v) is int or (type(v) is float and v.is_integer()),
}


def load(name):
    with open(os.path.join(SCHEMA_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def same(a, b):
    # Python says True == 1. JSON does not, so booleans must match by type too.
    if type(a) is bool or type(b) is bool:
        return type(a) is type(b) and a == b
    return a == b


def join(path, key):
    return f"{path}.{key}" if path else key


def validate(value, schema, root, path, out):
    """Append one 'path: problem' line to out for each failed keyword.

    Supports only the keywords that the Ravian schemas use. A "$ref" is a
    file name, or "#" for the root of the current file.
    """
    if "$ref" in schema:
        target = root if schema["$ref"] == "#" else load(schema["$ref"])
        return validate(value, target, target, path, out)
    where = path or "$"
    if "type" in schema and not TYPE_OK[schema["type"]](value):
        out.append(f"{where}: expected {schema['type']}")
        return  # later keywords assume the right type
    if "enum" in schema and not any(same(value, e) for e in schema["enum"]):
        out.append(f"{where}: must be one of {schema['enum']}")
    if "const" in schema and not same(value, schema["const"]):
        out.append(f"{where}: must be {json.dumps(schema['const'])}")
    if type(value) is str and "pattern" in schema and not re.search(schema["pattern"], value) \
            and not (local_links and schema["pattern"] == "^https://" and local_http(value)):
        out.append(f"{where}: does not match {schema['pattern']}")
    if type(value) in (int, float) and "minimum" in schema and value < schema["minimum"]:
        out.append(f"{where}: must be at least {schema['minimum']}")
    if type(value) is dict:
        props = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                out.append(f"{join(path, key)}: is required")
        for key, sub in props.items():
            if key in value:
                validate(value[key], sub, root, join(path, key), out)
        extra = schema.get("additionalProperties")
        if isinstance(extra, dict):
            for key in value:
                if key not in props:
                    validate(value[key], extra, root, join(path, key), out)
    if type(value) is list and "items" in schema:
        for i, item in enumerate(value):
            validate(item, schema["items"], root, f"{path}[{i}]", out)


class Source:
    """A static addon folder, or an addon at a URL. Paths are relative and URL-encoded."""

    def __init__(self, base):
        self.base = base
        self.folder = os.path.isdir(base)

    def get(self, rel):
        # Raises OSError (file or HTTP) or ValueError (not JSON).
        if self.folder:
            parts = [urllib.parse.unquote(s) for s in rel.split("/")]
            with open(os.path.join(self.base, *parts), encoding="utf-8") as f:
                return json.load(f)
        req = urllib.request.Request(f"{self.base}/{rel}", headers={"User-Agent": "Ravian-addon-check/1"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode("utf-8"))


def list_of(obj, key):
    # A broken answer must not stop the checker, so a bad value counts as empty.
    value = obj.get(key) if isinstance(obj, dict) else None
    return value if isinstance(value, list) else []


def metas_in(answer):
    """Return (path, meta) for each Meta in an answer, including album tracks."""
    if not isinstance(answer, dict):
        return []
    pairs = [(f"metas[{i}]", m) for i, m in enumerate(list_of(answer, "metas"))]
    meta = answer.get("meta")
    if isinstance(meta, dict):
        pairs.append(("meta", meta))
        pairs += [(f"meta.tracks[{i}]", t) for i, t in enumerate(list_of(meta, "tracks"))]
    return pairs


def usable(m):
    return isinstance(m, dict) and isinstance(m.get("type"), str) and isinstance(m.get("id"), str)


def first_track(pairs):
    return next((m["id"] for _, m in pairs if usable(m) and m["type"] in ("track", "episode")), None)


def run(source, rel, schema_name, prefixes, problems):
    """Fetch one answer, check it, and print OK or FAIL. Return the answer, or None."""
    try:
        data = source.get(rel)
    except (OSError, ValueError) as e:
        data, found = None, [f"could not read: {e}"]
    else:
        found = []
        schema = load(schema_name)
        validate(data, schema, schema, "", found)
        if prefixes:  # every meta id must start with a prefix from the manifest
            for path, m in metas_in(data):
                if isinstance(m, dict) and isinstance(m.get("id"), str) and not m["id"].startswith(tuple(prefixes)):
                    found.append(f"{path}.id: does not start with one of {prefixes}")
    print(f"{'FAIL' if found else 'OK  '} {rel}")
    for line in found:
        print(f"     {line}")
    problems.extend(found)
    return data


def finish(problems):
    n = len(problems)
    print(f"{n} problem{'' if n == 1 else 's'}")
    return 1 if problems else 0


def main(argv):
    if len(argv) != 2:
        print(__doc__.strip(), file=sys.stderr)
        return 1
    base = argv[1].rstrip("/")
    if not os.path.isdir(base):
        url = urllib.parse.urlsplit(base)
        if url.scheme == "http" and url.hostname in LOCAL_HOSTS:
            print("WARN: plain http is for local tests only. Ravian needs https.")
            global local_links
            local_links = True
        elif url.scheme != "https":
            print(f"FAIL: {base} is neither a folder nor an https:// URL")
            return 1
    source = Source(base)
    print(f"Checking {base}")
    problems = []

    # The manifest schema checks ravian == 1. Other checks still run, so every error is listed.
    manifest = run(source, "manifest.json", "manifest.schema.json", [], problems)
    if manifest is None:
        return finish(problems)
    prefixes = [p for p in list_of(manifest, "idPrefixes") if isinstance(p, str)]

    first, stream_id = None, None
    for n, cat in enumerate(list_of(manifest, "catalogs")):
        if not (isinstance(cat, dict) and isinstance(cat.get("type"), str) and isinstance(cat.get("id"), str)):
            continue  # the manifest check already reported this catalog
        base_rel = f"catalog/{urllib.parse.quote(cat['type'], safe='')}/{urllib.parse.quote(cat['id'], safe='')}"
        searchable = any(e.get("name") == "search" and e.get("isRequired") is True
                         for e in list_of(cat, "extra") if isinstance(e, dict))
        rel = f"{base_rel}/search={urllib.parse.quote(SEARCH, safe='')}.json" if searchable else f"{base_rel}.json"
        answer = run(source, rel, "catalog-response.schema.json", prefixes, problems)
        pairs = metas_in(answer)
        if n == 0 and first is None:
            first = next((m for _, m in pairs if usable(m)), None)
        if stream_id is None:
            stream_id = first_track(pairs)

    if first is not None:
        rel = f"meta/{urllib.parse.quote(first['type'], safe='')}/{urllib.parse.quote(first['id'], safe='')}.json"
        answer = run(source, rel, "meta-response.schema.json", prefixes, problems)
        if stream_id is None:
            stream_id = first_track(metas_in(answer))

    if stream_id is not None:
        rel = f"stream/track/{urllib.parse.quote(stream_id, safe='')}.json"
        run(source, rel, "stream-response.schema.json", prefixes, problems)

    return finish(problems)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
