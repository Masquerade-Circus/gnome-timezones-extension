# tools/

## generate-city-aliases.py

Generates `../cityAliases.js` (repo root, next to `timezones.js`) from the
GeoNames `cities15000` dataset, so the menu search can match a city name
(e.g. "Seattle") to an existing IANA timezone entry (e.g.
`America/Los_Angeles`) **and** display the city with correct casing and
diacritics in search results.

Each entry maps a lowercase search key to a `[zoneId, displayName]` pair:

```js
export default {
  'seattle': ['America/Los_Angeles', 'Seattle'],
  'são paulo': ['America/Sao_Paulo', 'São Paulo'],
  'sao paulo': ['America/Sao_Paulo', 'Sao Paulo'],
  ...
};
```

The key derived from GeoNames `name` displays the original `name` (native
casing/diacritics); the key derived from `asciiname` displays the original
`asciiname`. Both keys map to the same zone, so a UI can search on the
lowercase key while rendering `entry[1]` for display.

**Provenance**

| Field | Value |
|---|---|
| Source URL | https://download.geonames.org/export/dump/cities15000.zip |
| Downloaded | 2026-07-15 |
| SHA-256 | `0ca8bc0531bfa281e08cf605985a2fcf4136b380a88d5a37fbc34c22d1d99575` |
| Size | 3299667 bytes |
| Population floor | >= 500,000 |

The zip is not committed (`tools/cities15000.zip` is git-ignored); the
checksum above is the record of what was used to generate `cityAliases.js`.

**How it works**

1. Reads `cities15000.txt` directly out of `tools/cities15000.zip` (no
   extraction to disk) and keeps rows with `population >= 500000` and a
   non-empty `timezone` field.
2. Loads the valid zone list by parsing `../timezones.js` (regex-based
   extraction of the quoted strings in the `export default [...]` array;
   the file is never `eval`'d).
3. If a city's GeoNames timezone isn't in that list (GeoNames uses some
   zone ids, e.g. `Africa/Luanda` or `Europe/Kyiv`, that aren't in
   `timezones.js`), the script tries to **empirically resolve an
   equivalent zone** before giving up on the city:
   - Using Python's `zoneinfo` module (backed by system tzdata under
     `zoneinfo.TZPATH`, falling back to the `tzdata` PyPI package), it
     samples `datetime.utcoffset()` at local noon on the 1st and 15th of
     every month from 2015-01 through 2030-12 (384 samples) for both the
     missing zone and every zone already in `timezones.js`.
   - If one or more `timezones.js` zones have an **identical** offset
     sequence across all 384 samples, the city is remapped to one of
     them instead of being dropped. Ties are broken by: same
     continent prefix (e.g. `Africa/`) first, then highest string
     similarity between the final path segments (e.g. `Kiev` vs `Kyiv`),
     then alphabetical order -- deterministic and computed, not a
     hardcoded rename table.
   - If `zoneinfo` has no data for the missing zone at all, or no
     `timezones.js` zone matches its offsets across the whole window, the
     city is dropped and reported as unresolved (with the reason).
   - The chosen missing-zone -> resolved-zone mapping and the number of
     cities it applied to are printed as an "equivalence map applied"
     table in the run summary, and recorded in both the generator's
     header comment and the `cityAliases.js` provenance header.
4. For each kept (or equivalence-resolved) city, emits lowercase alias keys
   from both `name` and `asciiname` (deduplicated). Each key carries its
   own display form: the `name.lower()` key displays `name`, the
   `asciiname.lower()` key displays `asciiname`; if both lower-case to the
   same key within a row, `name`'s display wins. All keys are kept by
   default -- including ones that happen to equal a zone's own lowercase
   city segment (e.g. `'los angeles'` for `America/Los_Angeles`) -- since
   that's simpler to reason about and the acceptance spot-checks depend
   on some of them (`kathmandu`, `adelaide`). Pass
   `--skip-self-zone-name-keys` to opt into dropping those redundant keys
   instead.
5. If two different kept cities produce the same alias key with different
   zones (e.g. `'san jose'`), the entry with the larger population wins
   (its zone and display form both come from the winning city); the loser
   is reported as a dropped collision.
6. Writes `cityAliases.js` as a provenance-commented
   `export default { 'alias': ['Zone/Id', 'Display Name'], ... };` module,
   keys sorted, single-quoted, with quotes/backslashes in both the key and
   the display string escaped.
7. Validates its own output before writing to disk: alias-count sanity
   range (900-2600), every value is a well-formed 2-element
   `[zone, display]` array of strings, every display string lowercased
   equals its own key, every referenced zone (`value[0]`) exists in
   `timezones.js`, hardcoded spot checks (`seattle` ->
   `['America/Los_Angeles', 'Seattle']`, `kathmandu` ->
   `['Asia/Kathmandu', 'Kathmandu']`, `adelaide` ->
   `['Australia/Adelaide', 'Adelaide']`, `kyiv` -> `['Europe/Kiev',
   'Kyiv']`), and an empirical spot check that `luanda` survives and maps
   to some `Africa/` zone whose offset signature matches
   `Africa/Luanda`'s across the sample window. Exits non-zero on any
   failure.

**Regenerating**

```sh
# 1. (Re-)download the source zip if needed, placing it at:
#      tools/cities15000.zip
#    Update the provenance block in generate-city-aliases.py and this file
#    if the source data / checksum changes.

# 2. From the repo root:
python3 tools/generate-city-aliases.py

# 3. Sanity-check the generated JS module:
node --input-type=module --check < cityAliases.js
node -e "import('./cityAliases.js').then(m => console.log(Object.keys(m.default).length, m.default['seattle']))"
```

Last run: 1182 cities kept (1094 with a direct zone match + 88 resolved via
empirical zone equivalence covering 35 distinct missing GeoNames zones,
e.g. `Europe/Kyiv` -> `Europe/Kiev`, `Africa/Luanda` -> `Africa/Ndjamena`),
1 city dropped as genuinely unresolvable (`America/Ciudad_Juarez`, a 2022
DST-rule split from `America/Ojinaga`/`America/Denver` with no
offset-identical match in `timezones.js`), 3 name collisions dropped, 1293
total alias entries written (`'seattle': ['America/Los_Angeles',
'Seattle']`, `'kyiv': ['Europe/Kiev', 'Kyiv']`). tzdata source: system
`zoneinfo.TZPATH` (`/usr/share/zoneinfo` et al.), with the `tzdata` PyPI
package (2026.2) available as fallback. See the generator's run output /
`cityAliases.js` header for the full equivalence table.
