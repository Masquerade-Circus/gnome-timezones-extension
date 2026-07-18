#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate-city-aliases.py
=========================

Generates ``cityAliases.js`` (repo root, next to ``timezones.js``) from the
GeoNames "cities15000" dataset, mapping searchable lowercase city names to
a ``[zoneId, displayName]`` pair: an IANA timezone identifier that is
already present in ``timezones.js``, plus the properly-cased/diacritic
display form of the city name that produced that lowercase key (e.g.
``'seattle': ['America/Los_Angeles', 'Seattle']``,
``'são paulo': ['America/Sao_Paulo', 'São Paulo']``). This lets UI code
search on the lowercase key while still rendering the city name with
correct casing/diacritics.

Provenance
----------
Source URL:      https://download.geonames.org/export/dump/cities15000.zip
Downloaded:       2026-07-15
SHA-256:          0ca8bc0531bfa281e08cf605985a2fcf4136b380a88d5a37fbc34c22d1d99575
Size (bytes):     3299667
Population floor: 500000  (rows with population >= 500000 are kept)

The GeoNames "cities15000.txt" file inside the zip is tab-separated with the
following 0-indexed columns (only the ones used are named; see GeoNames
`readme.txt` for the full spec):

    0  geonameid
    1  name
    2  asciiname
    3  alternatenames
    4  latitude
    5  longitude
    6  feature_class
    7  feature_code
    8  country_code
    9  cc2
    10 admin1_code
    11 admin2_code
    12 admin3_code
    13 admin4_code
    14 population
    15 elevation
    16 dem
    17 timezone
    18 modification_date

Regeneration
------------
1. Re-download cities15000.zip from the URL above if a refresh is desired,
   and place it at tools/cities15000.zip (update the provenance block above
   with the new date/sha256/size if the source data changes).
2. From the repo root run:

       python3 tools/generate-city-aliases.py

   This reads tools/cities15000.zip and ../timezones.js (relative to this
   script) and (re)writes cityAliases.js at the repo root.
3. The script performs its own validation (kept-city counts, alias-count
   sanity range, zone cross-reference, and hardcoded spot checks) and exits
   non-zero if anything fails. It also prints a human-readable summary of
   dropped rows (unknown timezones) and name collisions.

Alias-key policy
-----------------
For every kept city we emit alias keys from BOTH ``name`` and ``asciiname``
(deduplicated if identical). We deliberately do NOT skip keys that happen to
already equal the lowercased final path segment of their own zone id (e.g.
'los angeles' for America/Los_Angeles) -- keeping them is simpler to reason
about, the dedup step already prevents duplicate keys, and it keeps
spot-check keys like 'kathmandu' and 'adelaide' present unconditionally. A
flag (--skip-self-zone-name-keys) is provided to opt into the leaner
behavior described in the design discussion, but it defaults to OFF.

Each alias key carries its OWN display form: the key derived from
``name.lower()`` displays the original ``name`` (native casing/diacritics,
e.g. 'São Paulo'), and the key derived from ``asciiname.lower()`` displays
the original ``asciiname`` (e.g. 'Sao Paulo'). If both fields lower-case to
the same key within one row, the ``name`` field's display wins (arbitrary
but deterministic) since it's the more authoritative field.

Collision policy
-----------------
If two different kept cities produce the identical lowercase alias key but
map to *different* zones (e.g. 'san jose' -> America/Los_Angeles vs
America/Costa_Rica), the entry with the larger population wins (its zone
AND its display form are both taken from the winning city); the loser is
reported in the summary as a dropped collision.

Equivalent-zone resolution (empirical, not a hardcoded rename table)
---------------------------------------------------------------------
GeoNames sometimes tags a city with a modern/renamed IANA zone id (e.g.
``Europe/Kyiv``, ``Africa/Luanda``) that is not itself present in
``timezones.js`` even though ``timezones.js`` contains a zone with
IDENTICAL civil-time behaviour under a different, older or merged id (e.g.
``Europe/Kiev``). Rather than hand-maintaining a rename table from memory,
this script *empirically* determines equivalence using Python's standard
library ``zoneinfo`` module (backed by system tzdata under
``zoneinfo.TZPATH``, e.g. ``/usr/share/zoneinfo``, falling back to the
``tzdata`` PyPI package if the system has none):

1. For every city whose GeoNames zone is missing from ``timezones.js``,
   the missing zone's ``datetime.utcoffset()`` is sampled at noon local
   time on the 1st and 15th of every month from 2015-01 through 2030-12
   (384 samples) -- this spans enough calendar time to catch normal DST
   transitions plus any historical rule change in that window.
2. Every zone id already in ``timezones.js`` is sampled the same way. A
   zone from ``timezones.js`` is an "exact candidate" for the missing zone
   only if its offset sequence matches the missing zone's at all 384
   samples.
3. Among exact candidates, preference is: (a) same top-level continent
   prefix as the missing zone (e.g. ``Europe/`` for ``Europe/Kyiv``), then
   (b) highest string similarity (``difflib.SequenceMatcher.ratio()``,
   case-insensitive) between the candidate's final path segment and the
   missing zone's final path segment (a deterministic, computed
   tie-breaker -- not a lookup table -- that happens to favour e.g.
   ``Europe/Kiev`` over ``Europe/Athens`` for ``Europe/Kyiv`` because
   "kiev" and "kyiv" are textually closer than "athens" and "kyiv"), then
   (c) alphabetically first, for full determinism if (a)/(b) still tie.
4. If ``zoneinfo.ZoneInfo(missing_zone)`` itself raises
   ``ZoneInfoNotFoundError`` (the runtime's tzdata doesn't even know the
   zone), or if no exact-offset candidate exists in ``timezones.js``, the
   city is dropped and reported -- the script never guesses a mapping it
   cannot verify empirically.

Cities resolved this way are folded into the normal alias-building path
using the *resolved* zone id (which is guaranteed to already be in
``timezones.js``), so they show up as ordinary alias entries; the
resolution itself is reported separately in the run summary as an
"equivalence map applied" table (missing zone -> chosen zone, city count).
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, NamedTuple, Optional, Tuple

try:
    import zoneinfo
except ImportError:  # pragma: no cover - Python < 3.9 not supported
    zoneinfo = None

# --- Provenance constants (kept in sync with the header above) -------------
SOURCE_URL = "https://download.geonames.org/export/dump/cities15000.zip"
DOWNLOAD_DATE = "2026-07-15"
SOURCE_SHA256 = (
    "0ca8bc0531bfa281e08cf605985a2fcf4136b380a88d5a37fbc34c22d1d99575"
)
SOURCE_SIZE_BYTES = 3299667
POPULATION_THRESHOLD = 500_000

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
ZIP_PATH = SCRIPT_DIR / "cities15000.zip"
TIMEZONES_JS_PATH = REPO_ROOT / "timezones.js"
OUTPUT_PATH = REPO_ROOT / "cityAliases.js"
INNER_TXT_NAME = "cities15000.txt"

# Alias count sanity range (see acceptance criteria: ~900-2600 given
# name+asciiname duplication).
ALIAS_COUNT_MIN = 900
ALIAS_COUNT_MAX = 2600

# Equivalent-zone resolution sampling window: the 1st and 15th of every
# month, 2015-01 through 2030-12 (16 years x 12 months x 2 = 384 samples),
# each taken at local noon to sidestep ambiguity right at a DST transition
# instant.
EQUIV_SAMPLE_YEARS = range(2015, 2031)
EQUIV_SAMPLE_DAYS = (1, 15)
EQUIV_SAMPLE_HOUR = 12


class CityRow(NamedTuple):
    name: str
    asciiname: str
    population: int
    timezone: str


def load_valid_zones(timezones_js_path: Path) -> List[str]:
    """Robustly extract the quoted zone-id strings from timezones.js.

    The file has the shape::

        export default [
          'UTC',
          'Europe/Andorra',
          ...
        ];

    We do not eval the file; instead we scan for single-quoted string
    literals, which is sufficient for this simple array-of-strings module
    and avoids executing untrusted JS.
    """
    text = timezones_js_path.read_text(encoding="utf-8")
    # Match '...' allowing escaped \' or \\ inside, mirroring how the
    # generator itself escapes output keys.
    pattern = re.compile(r"'((?:\\.|[^'\\])*)'")
    zones = [m.group(1) for m in pattern.finditer(text)]
    if not zones:
        raise ValueError(f"No quoted zone strings found in {timezones_js_path}")
    return zones


def read_cities_from_zip(zip_path: Path) -> List[CityRow]:
    rows: List[CityRow] = []
    with zipfile.ZipFile(zip_path) as zf:
        with zf.open(INNER_TXT_NAME) as raw:
            for raw_line in raw:
                line = raw_line.decode("utf-8")
                if not line.strip():
                    continue
                fields = line.rstrip("\n").split("\t")
                if len(fields) < 18:
                    continue
                name = fields[1]
                asciiname = fields[2]
                pop_str = fields[14]
                timezone = fields[17]
                try:
                    population = int(pop_str)
                except ValueError:
                    continue
                rows.append(
                    CityRow(
                        name=name,
                        asciiname=asciiname,
                        population=population,
                        timezone=timezone,
                    )
                )
    return rows


def escape_js_single_quoted(s: str) -> str:
    """Escape backslashes and single quotes for a single-quoted JS string."""
    return s.replace("\\", "\\\\").replace("'", "\\'")


def zone_final_segment_as_key(zone: str) -> str:
    """Lowercased final path segment of a zone id, spaces for underscores.

    e.g. 'America/Los_Angeles' -> 'los angeles'
    """
    last = zone.rsplit("/", 1)[-1]
    return last.replace("_", " ").lower()


def _equiv_sample_dates() -> List[Tuple[int, int, int]]:
    dates: List[Tuple[int, int, int]] = []
    for year in EQUIV_SAMPLE_YEARS:
        for month in range(1, 13):
            for day in EQUIV_SAMPLE_DAYS:
                dates.append((year, month, day))
    return dates


_EQUIV_SAMPLE_DATES = _equiv_sample_dates()


def _zone_offset_signature(zone_name: str) -> Optional[Tuple]:
    """UTC-offset sequence for a zone across the sample dates, or None if
    the runtime's tzdata has no such zone at all (never guess).
    """
    if zoneinfo is None:
        return None
    try:
        tz = zoneinfo.ZoneInfo(zone_name)
    except zoneinfo.ZoneInfoNotFoundError:
        return None
    offsets = []
    for (year, month, day) in _EQUIV_SAMPLE_DATES:
        dt = datetime(year, month, day, EQUIV_SAMPLE_HOUR, 0, 0, tzinfo=tz)
        offsets.append(dt.utcoffset())
    return tuple(offsets)


def _continent(zone: str) -> str:
    return zone.split("/", 1)[0]


def resolve_equivalent_zone(
    missing_zone: str,
    valid_zones: List[str],
    signature_cache: Dict[str, Optional[Tuple]],
) -> Tuple[str, Optional[str]]:
    """Empirically resolve a missing zone to an equivalent zone already in
    timezones.js.

    Returns (status, resolved_zone_or_None) where status is one of:
      'resolved'   -- resolved_zone_or_None is the chosen equivalent zone.
      'notfound'   -- zoneinfo has no data for missing_zone at all.
      'nomatch'    -- zoneinfo has missing_zone, but no zone in valid_zones
                      has an identical offset signature across all samples.
    """
    if missing_zone not in signature_cache:
        signature_cache[missing_zone] = _zone_offset_signature(missing_zone)
    missing_sig = signature_cache[missing_zone]
    if missing_sig is None:
        return "notfound", None

    candidates: List[str] = []
    for zone in valid_zones:
        if zone not in signature_cache:
            signature_cache[zone] = _zone_offset_signature(zone)
        cand_sig = signature_cache[zone]
        if cand_sig is not None and cand_sig == missing_sig:
            candidates.append(zone)

    if not candidates:
        return "nomatch", None

    missing_continent = _continent(missing_zone)
    missing_name = zone_final_segment_as_key(missing_zone)

    def sort_key(zone: str) -> Tuple[int, float, str]:
        same_continent = 0 if _continent(zone) == missing_continent else 1
        similarity = difflib.SequenceMatcher(
            None, zone_final_segment_as_key(zone), missing_name
        ).ratio()
        return (same_continent, -similarity, zone)

    candidates.sort(key=sort_key)
    return "resolved", candidates[0]


class BuildResult(NamedTuple):
    alias_map: Dict[str, Tuple[str, str]]  # key -> (zone, display_name)
    kept_city_count: int
    dropped_unknown_zone_count: int
    dropped_zone_counter: Dict[str, int]
    collisions_dropped: int
    equivalence_map: Dict[str, str]
    equivalence_city_counts: Dict[str, int]
    unresolved_notfound: Dict[str, int]
    unresolved_nomatch: Dict[str, int]


def build_aliases(
    rows: List[CityRow],
    valid_zones: set,
    skip_self_zone_name_keys: bool,
) -> BuildResult:
    kept_city_count = 0
    dropped_unknown_zone_count = 0
    dropped_zone_counter: Dict[str, int] = {}

    # candidate_key -> (population, zone, display_name) for collision
    # resolution.
    candidates: Dict[str, Tuple[int, str, str]] = {}
    collisions_dropped = 0

    # Empirical equivalent-zone resolution bookkeeping.
    valid_zones_list = list(valid_zones)
    signature_cache: Dict[str, Optional[Tuple]] = {}
    resolution_cache: Dict[str, Tuple[str, Optional[str]]] = {}
    equivalence_map: Dict[str, str] = {}  # missing_zone -> resolved_zone
    equivalence_city_counts: Dict[str, int] = {}  # missing_zone -> city count
    unresolved_notfound: Dict[str, int] = {}
    unresolved_nomatch: Dict[str, int] = {}

    for row in rows:
        if row.population < POPULATION_THRESHOLD:
            continue
        if not row.timezone:
            continue

        effective_zone = row.timezone

        if effective_zone not in valid_zones:
            if effective_zone not in resolution_cache:
                resolution_cache[effective_zone] = resolve_equivalent_zone(
                    effective_zone, valid_zones_list, signature_cache
                )
            status, resolved = resolution_cache[effective_zone]

            if status == "resolved":
                equivalence_map[effective_zone] = resolved
                equivalence_city_counts[effective_zone] = (
                    equivalence_city_counts.get(effective_zone, 0) + 1
                )
                effective_zone = resolved
            else:
                dropped_unknown_zone_count += 1
                dropped_zone_counter[row.timezone] = (
                    dropped_zone_counter.get(row.timezone, 0) + 1
                )
                if status == "notfound":
                    unresolved_notfound[row.timezone] = (
                        unresolved_notfound.get(row.timezone, 0) + 1
                    )
                else:
                    unresolved_nomatch[row.timezone] = (
                        unresolved_nomatch.get(row.timezone, 0) + 1
                    )
                continue

        kept_city_count += 1

        # Each key carries its OWN display form: name.lower() displays
        # `name`, asciiname.lower() displays `asciiname`. If both fields
        # lower-case to the same key within this row, `name`'s display
        # wins (inserted first, asciiname only fills in if the key is new).
        row_key_displays: Dict[str, str] = {}
        if row.name:
            row_key_displays[row.name.lower()] = row.name
        if row.asciiname and row.asciiname.lower() not in row_key_displays:
            row_key_displays[row.asciiname.lower()] = row.asciiname

        if skip_self_zone_name_keys:
            self_key = zone_final_segment_as_key(effective_zone)
            row_key_displays.pop(self_key, None)

        for key, display in row_key_displays.items():
            existing = candidates.get(key)
            if existing is None:
                candidates[key] = (row.population, effective_zone, display)
            else:
                existing_pop, existing_zone, existing_display = existing
                if existing_zone == effective_zone:
                    # Same key, same zone already recorded -- no-op
                    # (keep the higher population's display just in case,
                    # though the zone is identical so it mostly doesn't
                    # affect search behaviour).
                    if row.population > existing_pop:
                        candidates[key] = (row.population, effective_zone, display)
                    continue
                # Collision: different zone for the same key.
                collisions_dropped += 1
                if row.population > existing_pop:
                    candidates[key] = (row.population, effective_zone, display)
                # else keep existing (it already has the larger population)

    alias_map = {
        key: (zone, display) for key, (_, zone, display) in candidates.items()
    }
    return BuildResult(
        alias_map=alias_map,
        kept_city_count=kept_city_count,
        dropped_unknown_zone_count=dropped_unknown_zone_count,
        dropped_zone_counter=dropped_zone_counter,
        collisions_dropped=collisions_dropped,
        equivalence_map=equivalence_map,
        equivalence_city_counts=equivalence_city_counts,
        unresolved_notfound=unresolved_notfound,
        unresolved_nomatch=unresolved_nomatch,
    )


def describe_tzdata_source() -> str:
    """Best-effort human-readable description of which tzdata the running
    zoneinfo module is backed by, for the provenance header.
    """
    if zoneinfo is None:
        return "zoneinfo module unavailable"
    tzpath = ", ".join(zoneinfo.TZPATH) if zoneinfo.TZPATH else "(none)"
    tzdata_pkg_version = None
    try:
        import tzdata as _tzdata_pkg

        tzdata_pkg_version = getattr(_tzdata_pkg, "__version__", "unknown")
    except ImportError:
        pass
    parts = [f"zoneinfo.TZPATH=[{tzpath}]"]
    if tzdata_pkg_version is not None:
        parts.append(f"tzdata PyPI package fallback={tzdata_pkg_version}")
    else:
        parts.append("no tzdata PyPI package installed (system tzdata only)")
    return "; ".join(parts)


def render_output(
    alias_map: Dict[str, Tuple[str, str]], equivalence_map: Dict[str, str]
) -> str:
    tzdata_source = describe_tzdata_source()
    equiv_lines = ""
    if equivalence_map:
        equiv_lines = "//\n// Equivalent-zone resolution applied (missing GeoNames zone ->\n// equivalent zone already in timezones.js, chosen by empirically\n// comparing zoneinfo UTC-offset samples -- see generator header for\n// the full method):\n"
        for missing_zone in sorted(equivalence_map):
            equiv_lines += f"//   {missing_zone} -> {equivalence_map[missing_zone]}\n"

    header = f"""// cityAliases.js
// AUTO-GENERATED FILE -- do not edit by hand.
//
// Generated by tools/generate-city-aliases.py from the GeoNames
// "cities15000" dataset.
//
// Provenance:
//   Source URL:      {SOURCE_URL}
//   Downloaded:       {DOWNLOAD_DATE}
//   SHA-256:          {SOURCE_SHA256}
//   Size (bytes):     {SOURCE_SIZE_BYTES}
//   Population floor: {POPULATION_THRESHOLD}
//
// Equivalent-zone resolution method: for GeoNames zones not present in
// timezones.js, candidate zones from timezones.js are compared via
// Python's zoneinfo module by sampling datetime.utcoffset() at local noon
// on the 1st and 15th of every month, 2015-01 through 2030-12 (384
// samples). A zone is only substituted if its offset sequence matches the
// missing zone's at every sample; ties are broken by continent-prefix
// match, then string similarity of the final path segment, then
// alphabetical order. No rename table is hardcoded.
// tzdata source used at generation time: {tzdata_source}
{equiv_lines}//
// To regenerate: python3 tools/generate-city-aliases.py
//
// Value format: each lowercase searchable city name key maps to a
// 2-element array [zoneId, displayName]:
//   - zoneId:      an IANA timezone id already present in timezones.js
//                  (guaranteed by the generator's validation step).
//   - displayName: the properly-cased/diacritic city name that produced
//                  this key (from GeoNames `name` or `asciiname`), for
//                  rendering search results with correct casing, e.g.
//                  'seattle': ['America/Los_Angeles', 'Seattle'],
//                  'são paulo': ['America/Sao_Paulo', 'São Paulo'],
//                  'sao paulo': ['America/Sao_Paulo', 'Sao Paulo'],
"""
    lines = [header, "export default {"]
    for key in sorted(alias_map.keys()):
        zone, display = alias_map[key]
        escaped_key = escape_js_single_quoted(key)
        escaped_zone = escape_js_single_quoted(zone)
        escaped_display = escape_js_single_quoted(display)
        lines.append(f"  '{escaped_key}': ['{escaped_zone}', '{escaped_display}'],")
    lines.append("};")
    lines.append("")  # trailing newline
    return "\n".join(lines)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-self-zone-name-keys",
        action="store_true",
        default=False,
        help=(
            "Skip alias keys equal to the lowercased final path segment of "
            "their own zone id (e.g. 'los angeles' for America/Los_Angeles). "
            "Default: OFF (keep all keys; dedup handles redundancy)."
        ),
    )
    args = parser.parse_args()

    if not ZIP_PATH.exists():
        print(f"ERROR: input zip not found: {ZIP_PATH}", file=sys.stderr)
        return 1
    if not TIMEZONES_JS_PATH.exists():
        print(f"ERROR: timezones.js not found: {TIMEZONES_JS_PATH}", file=sys.stderr)
        return 1

    valid_zones_list = load_valid_zones(TIMEZONES_JS_PATH)
    valid_zones = set(valid_zones_list)

    rows = read_cities_from_zip(ZIP_PATH)

    result = build_aliases(rows, valid_zones, args.skip_self_zone_name_keys)
    alias_map = result.alias_map

    # --- Validation --------------------------------------------------------
    failures: List[str] = []

    alias_count = len(alias_map)
    if not (ALIAS_COUNT_MIN <= alias_count <= ALIAS_COUNT_MAX):
        failures.append(
            f"alias_count {alias_count} outside expected range "
            f"[{ALIAS_COUNT_MIN}, {ALIAS_COUNT_MAX}]"
        )

    # Every value must be a well-formed [zone, display] pair, every
    # referenced zone must exist in timezones.js (should always be true by
    # construction, but verify defensively), and every display string,
    # lowercased, must equal its own key.
    referenced_zones = set()
    for key, value in alias_map.items():
        if (
            not isinstance(value, tuple)
            or len(value) != 2
            or not isinstance(value[0], str)
            or not isinstance(value[1], str)
        ):
            failures.append(
                f"alias_map['{key}'] is not a 2-element (zone, display) pair of strings: {value!r}"
            )
            continue
        zone, display = value
        referenced_zones.add(zone)
        if display.lower() != key:
            failures.append(
                f"alias_map['{key}'] display {display!r} lowercased "
                f"({display.lower()!r}) does not equal its own key {key!r}"
            )

    unknown_referenced = referenced_zones - valid_zones
    if unknown_referenced:
        failures.append(
            f"alias_map references zones not in timezones.js: {sorted(unknown_referenced)}"
        )

    spot_checks = {
        "seattle": ("America/Los_Angeles", "Seattle"),
        "kathmandu": ("Asia/Kathmandu", "Kathmandu"),
        "adelaide": ("Australia/Adelaide", "Adelaide"),
        "kyiv": ("Europe/Kiev", "Kyiv"),
    }
    for key, (expected_zone, expected_display) in spot_checks.items():
        actual = alias_map.get(key)
        if actual is None:
            failures.append(f"spot check failed: '{key}' missing from alias_map entirely")
            continue
        actual_zone, actual_display = actual
        if actual_zone != expected_zone or actual_display != expected_display:
            failures.append(
                f"spot check failed: '{key}' -> {actual!r}, "
                f"expected ({expected_zone!r}, {expected_display!r})"
            )

    # 'luanda' must exist (i.e. survive equivalence resolution rather than
    # being dropped) and must map to *some* Africa/ zone in timezones.js
    # whose offset signature matches Africa/Luanda's -- we don't hardcode
    # the exact target id, only verify the empirical property that made it
    # eligible in the first place.
    luanda_entry = alias_map.get("luanda")
    if luanda_entry is None:
        failures.append("spot check failed: 'luanda' missing from alias_map entirely")
    else:
        luanda_zone, _luanda_display = luanda_entry
        if not luanda_zone.startswith("Africa/"):
            failures.append(
                f"spot check failed: 'luanda' -> {luanda_zone!r}, expected an Africa/ zone"
            )
        else:
            luanda_sig = _zone_offset_signature("Africa/Luanda")
            mapped_sig = _zone_offset_signature(luanda_zone)
            if luanda_sig is None or mapped_sig is None or luanda_sig != mapped_sig:
                failures.append(
                    f"spot check failed: 'luanda' -> {luanda_zone!r} does not have an "
                    f"identical UTC-offset signature to Africa/Luanda across the sample window"
                )

    # --- Summary -------------------------------------------------------------
    print("=" * 70)
    print("City alias generation summary")
    print("=" * 70)
    print(f"Rows read from {INNER_TXT_NAME}: {len(rows)}")
    print(f"Kept cities (population >= {POPULATION_THRESHOLD}, known/resolved zone): {result.kept_city_count}")
    print(f"Dropped for unresolvable timezone: {result.dropped_unknown_zone_count}")
    if result.dropped_zone_counter:
        print("  Unresolved zones encountered (zone: count, reason):")
        for zone, count in sorted(result.dropped_zone_counter.items(), key=lambda kv: -kv[1]):
            if zone in result.unresolved_notfound:
                reason = "zoneinfo has no data for this zone at all (ZoneInfoNotFoundError)"
            elif zone in result.unresolved_nomatch:
                reason = "zoneinfo has this zone, but no timezones.js zone matches its offsets across all samples"
            else:
                reason = "unknown"
            print(f"    {zone!r}: {count} ({reason})")
    print(f"Name collisions dropped (kept larger-population entry): {result.collisions_dropped}")
    print("-" * 70)
    print("Equivalence map applied (missing GeoNames zone -> chosen timezones.js zone, city count):")
    if result.equivalence_map:
        for missing_zone in sorted(result.equivalence_map):
            resolved = result.equivalence_map[missing_zone]
            count = result.equivalence_city_counts.get(missing_zone, 0)
            print(f"  {missing_zone} -> {resolved}  ({count} cities)")
    else:
        print("  (none)")
    print("-" * 70)
    print(f"Total alias entries emitted: {alias_count}")
    print(f"skip_self_zone_name_keys: {args.skip_self_zone_name_keys}")
    print(f"tzdata source: {describe_tzdata_source()}")
    print("Spot checks:")
    for key, expected in spot_checks.items():
        print(f"  {key!r} -> {alias_map.get(key)!r} (expected {expected!r})")
    print(f"  'luanda' -> {alias_map.get('luanda')!r} (expected: some Africa/ zone with matching offsets)")

    if failures:
        print("-" * 70)
        print("VALIDATION FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1

    output_text = render_output(alias_map, result.equivalence_map)
    OUTPUT_PATH.write_text(output_text, encoding="utf-8")
    print("-" * 70)
    print(f"Wrote {OUTPUT_PATH} ({alias_count} entries).")
    print("VALIDATION PASSED.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
