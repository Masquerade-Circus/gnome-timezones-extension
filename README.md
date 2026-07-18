# Gnome Timezones Extension
Show multiple clocks in the panel. 

For those who need more than one additional clock, this extension makes very easy to add two, three or more clocks to the main panel area.

There is already an excellent [MultiClock](https://github.com/mibus/MultiClock) extension, but that extension only displays a second clock. What i need is to reference 3 different clocks, my local time, UTC time and Puerto Rico time. If you have the same need, this extension can help you.

## Table of contents
- [Gnome Timezones Extension](#gnome-timezones-extension)
  - [Table of contents](#table-of-contents)
  - [How to use](#how-to-use)
  - [Configuration](#configuration)
  - [Contributing](#contributing)
    - [Installation](#installation)
    - [Development](#development)
  - [Legal](#legal)

## How to use

- Click on a clock to make it active.
- Click on an active clock to deactivate it.
- **Search by city, not just timezone.** Type into the filter field and it matches city names as well as timezone IDs — searching `Seattle` surfaces `America/Los_Angeles`, `Osaka` surfaces `Asia/Tokyo`, and so on. The list is drawn from world cities with a population of 500,000 or more. Matches show the city name you searched for, and adding one from a search sets that city as the clock's label automatically.
- **Rename any active clock.** Each active clock row has a pencil button — click it to type a custom label (e.g. `Home`, `Head Office`) that then shows in the panel and the menu. Submit with Enter; clear the field and press Enter to revert to the default name.
- **Reorder by drag-and-drop.** Drag the handle on the left of an active clock row to move it. While dragging, the whole row follows the pointer and a line shows where it will land; the order you choose is used in both the panel and the Active clocks menu section.
- [Configure it](#configuration) as you wish.

![Gnome Timezones extension](/screenshot.jpg)

## Configuration

- **24 hours format**: Toggle between 24 and 12 hours format. Defaults to 24.
- **Show city name**: Controls if in the clock shows the city name before the time. Defaults to true. Custom labels set via the pencil button take the place of the city name here.
- **Show timezone**: Shows the timezone before the time and after the City name if it is shown. Defaults to false.
- **Hide system clock**: Hides GNOME Shell's own clock text in the top bar (the date/calendar button itself stays, so notifications and the calendar remain reachable). Reverts immediately when toggled off, and the system clock always returns on the lock screen. Defaults to false.
- **Show separator**: Joins the panel clocks with ` | ` instead of the default spacing. Defaults to false. Only affects the panel label, not the menu rows.
- **Clear clocks**: It will deactivate all current active clocks. In case you can't remove a clock, you can use this button to clear all clocks.

## Contributing

-   This extension is plain, unbundled GJS ESM (GNOME Shell 45+ extension format) — there is no build/bundle step. Edit `extension.js` / `timezones.js` directly.
-   Update the readme with an example if you add or change any functionality.

### Installation

This fork installs and runs on its own — you do **not** need to wait for the
upstream [port pull request](https://github.com/Masquerade-Circus/gnome-timezones-extension/pulls)
to be accepted (the original project has been unmaintained since 2022, so it may
never be). Use either route below.

**From extensions.gnome.org** (once the store review clears): search for
*Timezones extension (continued)* and toggle it on. This route handles updates
for you and is the easiest for most users.

**From source — the maintained port branch.** Clone the fork's
[`gnome-47-port`](https://github.com/ipswitch8/gnome-timezones-extension/tree/gnome-47-port)
branch directly into your extensions directory, compile the settings schema, and
enable it:

```bash
$ git clone --branch gnome-47-port \
    https://github.com/ipswitch8/gnome-timezones-extension.git \
    ~/.local/share/gnome-shell/extensions/timezones@masquerade-circus.net
$ cd ~/.local/share/gnome-shell/extensions/timezones@masquerade-circus.net
$ glib-compile-schemas schemas/
$ gnome-extensions enable timezones@masquerade-circus.net
```

Then reload GNOME Shell so it picks up the new extension: on X11 press Alt+F2,
type `r`, Enter; on Wayland log out and back in.

> **On the directory name / uuid:** GNOME loads an extension from a directory
> whose name matches its `uuid`. This branch keeps the original uuid
> `timezones@masquerade-circus.net` (so it can also serve as the upstream PR),
> so clone it into a directory of that exact name as shown above. The
> extensions.gnome.org listing is published under a separate uuid
> (`inquiries@itwerx.net`), which the store requires for a separately-listed
> fork — pick one route or the other, not both at once.

> Prefer the original, unmodified extension instead? It lives at
> [Masquerade-Circus/gnome-timezones-extension](https://github.com/Masquerade-Circus/gnome-timezones-extension)
> (GNOME Shell 42, without city search, custom labels, or drag-to-reorder).

### Development

Work against **this fork**, branch
[`gnome-47-port`](https://github.com/ipswitch8/gnome-timezones-extension/tree/gnome-47-port) —
that is where the GNOME Shell 45+ ESM port and every new feature (city-name
search, custom labels, drag-to-reorder) live. The
[original repository](https://github.com/Masquerade-Circus/gnome-timezones-extension)
is the historical upstream and has been unmaintained since 2022; a port PR is
open there but may never be merged, so treat the fork as the canonical source
and send pull requests to it. Clone `gnome-47-port` straight into your extensions
directory (see [Installation](#installation)) so your edits run live in the
shell.

The extension has no dependencies and no `package.json`/bundler — `extension.js`, `timezones.js`, and `cityAliases.js` are loaded by GNOME Shell as-is. Active-clock reordering uses GNOME Shell's built-in `resource:///org/gnome/shell/ui/dnd.js` module (`DND.makeDraggable` on a per-row drag handle); this is a stable Shell-internal module, not a new dependency.

`cityAliases.js` (the city-name → timezone search index) is generated data, not hand-edited. Regenerate it with `tools/generate-city-aliases.py` (see `tools/README.md` for the GeoNames source and provenance). Useful commands while developing:

- `journalctl -f -o cat /usr/bin/gnome-shell`: Watch the GNOME Shell log for errors.
- `gnome-extensions enable timezones@masquerade-circus.net`: Enable the extension.
- `gnome-extensions disable timezones@masquerade-circus.net`: Disable the extension.
- `glib-compile-schemas schemas/`: Recompile the settings schema after editing `schemas/org.gnome.shell.extensions.timezones.gschema.xml`.

On X11 you can reload the shell with Alt+F2, `r`, Enter after making changes; on Wayland you must log out/in (or use a nested shell via `dbus-run-session -- gnome-shell --nested --wayland` for testing).

## Legal

Author: [Masquerade Circus](http://masquerade-circus.net). License [Apache-2.0](https://opensource.org/licenses/Apache-2.0)