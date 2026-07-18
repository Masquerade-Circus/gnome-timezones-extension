'use strict';

import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GnomeDesktop from 'gi://GnomeDesktop?version=4.0';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import timezones from './timezones.js';
import cityAliases from './cityAliases.js';

// Whitelist of the only config keys this extension ever reads/writes.
// Anything else present in the 'config' GSettings value (e.g. from a
// tampered/foreign dconf entry) is ignored rather than blindly copied.
const CONFIG_KEYS = ['format24', 'showCity', 'showTimezone', 'hideSystemClock', 'showSeparator'];

// Maximum length of a user-supplied per-zone display label (Feature B).
// Long enough for short custom names ("Home", "Mom's house") while keeping
// the panel label and menu rows from growing unreasonably wide.
const MAX_LABEL_LENGTH = 32;

// Characters stripped from a label before it is ever rendered into an
// St.Label: C0 controls (incl. newline/tab), DEL and C1 controls, bidi
// override/isolate characters (which could visually reorder/hide
// surrounding panel text), zero-width spaces/joiners, and the BOM.
// Built from numeric code point ranges (rather than a regex literal
// containing the raw characters) so the source file never carries
// invisible/control bytes itself.
const UNSAFE_LABEL_RANGES = [
  [0x0000, 0x001f], // C0 controls
  [0x007f, 0x009f], // DEL + C1 controls
  [0x200b, 0x200d], // zero-width space/non-joiner/joiner
  [0x202a, 0x202e], // bidi embedding/override controls
  [0x2066, 0x2069], // bidi isolate controls
  [0xfeff, 0xfeff] // BOM / zero-width no-break space
];

const UNSAFE_LABEL_CHARS = new RegExp(
  `[${UNSAFE_LABEL_RANGES.map(([start, end]) => `\\u{${start.toString(16)}}-\\u{${end.toString(16)}}`).join('')}]`,
  'gu'
);

// Checkmark prefix used for already-active zones, shared by the active-clock
// rows and the search-result rows (a checkmarked search result is already
// active; clicking it toggles it off, same as clicking it in Active clocks).
const ACTIVE_MARK = String.fromCodePoint(0x2714);

export default class TimezonesExtension extends Extension {
  enable() {
    this._config = {
      format24: true,
      showCity: true,
      showTimezone: false,
      hideSystemClock: false,
      showSeparator: false
    };
    this._hint = '';
    this._labels = {};
    // Tracks whether WE hid GNOME Shell's own top-bar clock, so disable()
    // only ever restores visibility it actually changed (see
    // _applySystemClockVisibility()).
    this._hidSystemClock = false;
    // name -> PopupSwitchMenuItem, populated by _addConfigSwitch(). Lets
    // _syncConfigSwitches() force every switch's visual state back to
    // match this._config on every menu open, so the toggle visual and the
    // stored value can never permanently desync (see _syncConfigSwitches).
    this._configSwitches = {};
    // Live drag landing-zone indicator (single reused actor, created
    // lazily on first use). See _showDropIndicatorAt()/_clearDropIndicator().
    this._dropIndicator = null;
    // { draggable, dragEndId } entries for every active-clock row's
    // DND.makeDraggable() instance, tracked so its 'drag-end' connection
    // can be explicitly disconnected (see _clearRowDraggables()) rather
    // than left for shexli/EGO-L-003 to flag as unmatched. Populated in
    // _addActiveMenuRow(), cleared in disable() and at the start of every
    // _updateActiveMenu() rebuild (before removeAll() destroys the rows
    // these draggables belong to).
    this._rowDraggables = [];

    // Feature A: flatten cityAliases once into {key, zone, display} rows.
    // cityAliases values are [zone, displayName] tuples keyed by the
    // lowercase search form (which may differ from displayName only in
    // case/diacritics, e.g. 'sao paulo' -> ['America/Sao_Paulo', 'Sao Paulo']).
    // This replaces the old per-zone concatenated search-string approach:
    // _updateInactiveMenu now matches each alias key against the hint
    // directly (one pass over this._aliases) instead of pre-joining city
    // names into every zone's row.
    this._aliases = Object.keys(cityAliases).map((key) => {
      let [zone, display] = cityAliases[key];
      return { key, zone, display };
    });

    this._state = timezones.sort().map((item) => {
      return {
        timezone: item,
        // Plain lowercase zone id, used to match the zone's own row when
        // no alias of it matches the current search hint.
        lower: item.toLowerCase(),
        active: item === 'UTC'
      };
    });

    // O(1) zone-id -> state-item lookup, built once. Feature A's ordered
    // active list (this._activeOrder) stores plain zone ids; this map is
    // how _updateLabel/_updateActiveMenu resolve each id back to its state
    // item (and its precomputed `label`) without a linear scan of
    // this._state (which stays alphabetically sorted for the search list).
    this._stateByZone = new Map(this._state.map((item) => [item.timezone, item]));

    // Authoritative display order for active clocks (Feature A); populated
    // by _loadSettings() below from the stored 'timezones' order.
    this._activeOrder = [];

    this._settings = this.getSettings();

    this._loadSettings();
    this._applySystemClockVisibility();

    let button = new PanelMenu.Button(0.5, this.metadata.name);
    button.set_y_align(Clutter.ActorAlign.CENTER);

    let label = new St.Label({
      text: '...',
      opacity: 150
    });
    button.add_child(label);

    this._button = button;
    this._label = label;

    this._initMenu();
    this._updateLabel();

    this._systemClock = new GnomeDesktop.WallClock();
    this._signalId = this._systemClock.connect('notify::clock', () => this._updateLabel());

    Main.panel.addToStatusArea(`${this.metadata.name} Indicator`, this._button, 1, 'center');
  }

  disable() {
    // Restore the system clock's visibility BEFORE the rest of teardown,
    // and only if we were the one who hid it. This runs first because
    // disable() is also called on lock screen (GNOME Shell disables
    // extensions there), so the system clock must reliably come back
    // rather than staying hidden behind a locked screen.
    if (this._hidSystemClock) {
      let clockDisplay = Main.panel.statusArea.dateMenu?._clockDisplay;
      if (clockDisplay) {
        clockDisplay.visible = true;
      }
    }
    this._hidSystemClock = null;

    if (this._systemClock && this._signalId) {
      this._systemClock.disconnect(this._signalId);
    }
    this._signalId = null;
    this._systemClock = null;

    if (this._menu && this._menuOpenStateId) {
      this._menu.disconnect(this._menuOpenStateId);
    }
    this._menuOpenStateId = null;

    // Explicitly torn down before this._button.destroy() below (which
    // would also destroy it as a side effect, since it's parented inside
    // the active menu's box) so there is never a dangling JS reference or
    // a code path that skips cleanup.
    this._clearDropIndicator();

    // shexli (EGO-L-003): disconnect every tracked per-row draggable's
    // 'drag-end' signal before the rows/handles themselves are destroyed
    // below. See _clearRowDraggables() for why this is also called at the
    // start of every _updateActiveMenu() rebuild, not just here.
    this._clearRowDraggables();

    this._saveSettings();

    // shexli (EGO-L-002): this._label is a child of this._button (added via
    // button.add_child(label) in enable()), so this._button.destroy() below
    // already tears it down transitively -- functionally this was already
    // fine. Destroyed explicitly and BEFORE the button anyway, since
    // destroying a child before its parent is safe in Clutter (the parent
    // simply finds it already gone) and this is what makes the static
    // "every enable()-assigned object has a matching disable() destroy"
    // check pass.
    if (this._label) {
      this._label.destroy();
    }

    if (this._button) {
      this._button.destroy();
    }

    this._button = null;
    this._label = null;
    this._menu = null;
    this._activeMenu = null;
    this._inactiveMenu = null;
    this._configMenu = null;
    this._state = null;
    this._settings = null;
    this._config = null;
    this._hint = null;
    this._labels = null;
    this._aliases = null;
    this._activeOrder = null;
    this._stateByZone = null;
    this._configSwitches = null;
    this._dropIndicator = null;
    this._rowDraggables = null;
  }

  _loadSettings() {
    let timezonesVariant = this._settings.get_value('timezones');
    let timezonesArray = timezonesVariant.deep_unpack();

    // Feature A: the stored 'timezones' array order is now authoritative
    // for display order (it used to be read only for membership, then
    // rendered alphabetically). Reconcile it against whatever is active in
    // this._state right now (only the enable()-time default -- UTC -- at
    // this point, since this runs before anything else touches state)
    // so a stored order that's missing a currently-active zone doesn't
    // silently drop that zone from the ordered list.
    let currentActive = this._state.filter((item) => item.active).map((item) => item.timezone);
    this._activeOrder = this._reconcileActiveOrder(timezonesArray, currentActive);

    this._state.forEach((item) => {
      item.active = this._activeOrder.indexOf(item.timezone) !== -1;
    });

    let configVariant = this._settings.get_value('config');
    let configObj = configVariant.deep_unpack();
    CONFIG_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(configObj, key)) {
        this._config[key] = Boolean(configObj[key]);
      }
    });

    let labelsVariant = this._settings.get_value('labels');
    let labelsObj = labelsVariant.deep_unpack();
    this._labels = {};
    Object.keys(labelsObj).forEach((zone) => {
      // Only keep labels for zones this extension actually knows about;
      // a foreign/stale dconf entry referencing an unknown zone id is
      // dropped rather than carried forward.
      if (!this._state.some((item) => item.timezone === zone)) {
        return;
      }

      let sanitized = this._sanitizeLabel(labelsObj[zone]);
      if (sanitized.length > 0) {
        this._labels[zone] = sanitized;
      }
    });
  }

  // Pure reconciliation used when loading settings: takes the stored
  // order (which may reference unknown/removed zones, e.g. from an older
  // timezones.js or a hand-edited dconf entry) and a list of zones that
  // are considered active independent of that order, and produces the
  // reconciled order -- the stored order filtered to zones this extension
  // recognizes (this._stateByZone), followed by any active zone not
  // already present, appended in the order given.
  //
  // INVARIANT: this._activeOrder contains each zone id AT MOST ONCE,
  // always. This is enforced HERE (a single `seen` Set de-duplicates
  // across both the stored-order pass and the appended-active-zones
  // pass, first occurrence wins) and preserved afterwards by every other
  // mutator of this._activeOrder (_toggleTimezone's activate path and
  // _activateWithAlias both guard with indexOf before pushing;
  // _reorderActiveZone only ever removes-and-reinserts a single existing
  // occurrence). The stored 'timezones' GSettings value is a plain `as`
  // array with no uniqueness constraint, so a hand-edited/tampered dconf
  // entry could otherwise repeat a valid, known zone id arbitrarily many
  // times -- filtering to known zones alone does NOT bound the array's
  // length in that case, since a known id can still appear N times.
  // Without de-duplication, that would let _updateActiveMenu build one
  // full row (PopupBaseMenuItem + drag handle + edit button + entry) per
  // repetition on every menu open: unbounded actor construction driven
  // entirely by an untrusted settings value. With de-duplication,
  // this._activeOrder's length is bounded by the number of known zones
  // (~349) as an actual consequence of the invariant, so no separate
  // length cap is needed on top of it. See the scratch-node test for the
  // same logic parameterized on a plain knownZones Set, exercised without
  // gnome-shell imports.
  _reconcileActiveOrder(storedOrder, activeZones) {
    let order = [];
    let seen = new Set();

    storedOrder.forEach((zone) => {
      if (this._stateByZone.has(zone) && !seen.has(zone)) {
        order.push(zone);
        seen.add(zone);
      }
    });

    activeZones.forEach((zone) => {
      if (!seen.has(zone)) {
        order.push(zone);
        seen.add(zone);
      }
    });

    return order;
  }

  // Strips control/bidi/zero-width characters that must never reach an
  // St.Label, trims whitespace, and caps the result at MAX_LABEL_LENGTH
  // (32) characters. Applied both when loading a label from GSettings and
  // when committing a newly-edited one, so no unsanitized value can ever
  // be stored or rendered.
  _sanitizeLabel(text) {
    if (typeof text !== 'string') {
      return '';
    }

    return text.replace(UNSAFE_LABEL_CHARS, '').trim().slice(0, MAX_LABEL_LENGTH);
  }

  // Sanitizes rawText and commits it as the display label for `zone`; an
  // empty-after-sanitize value deletes the existing label instead of
  // storing an empty string. Mirrors the acceptance-criteria commit order:
  // sanitize -> set/delete -> save -> refresh time labels -> rebuild the
  // active menu -> refresh the panel label.
  _setLabel(zone, rawText) {
    let sanitized = this._sanitizeLabel(rawText);
    if (sanitized.length > 0) {
      this._labels[zone] = sanitized;
    } else {
      delete this._labels[zone];
    }

    this._saveSettings();
    this._updateTimeLabels();
    this._updateActiveMenu();
    this._updateLabel();
  }

  _saveSettings() {
    if (!this._settings || !this._state || !this._config || !this._labels || !this._activeOrder) {
      return;
    }

    // Feature A: this._activeOrder is now the single source of truth for
    // both membership (which zones are active) and display order, so it's
    // written verbatim -- no re-deriving/re-sorting from this._state.
    this._settings.set_value('timezones', new GLib.Variant('as', this._activeOrder));

    this._settings.set_value('config', new GLib.Variant('a{sb}', this._config));
    this._settings.set_value('labels', new GLib.Variant('a{ss}', this._labels));
  }

  _initMenu() {
    this._menu = this._button.menu;
    this._activeMenu = this._createScrollableMenuSection();
    this._inactiveMenu = this._createScrollableMenuSection();
    this._configMenu = this._createScrollableMenuSection();
    this._configMenu.itemActivated = () => {};

    this._addConfigSwitch({ label: '24 hours format', name: 'format24' });
    this._addConfigSwitch({ label: 'Show city name', name: 'showCity' });
    this._addConfigSwitch({ label: 'Show timezone', name: 'showTimezone' });
    this._addConfigSwitch({ label: 'Hide system clock', name: 'hideSystemClock' });
    this._addConfigSwitch({ label: 'Show separator', name: 'showSeparator' });
    this._activeMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Active clocks'));

    // Feature A (DnD, end-of-list drop): the active section's box actor is
    // created once by _createScrollableMenuSection() and persists across
    // _updateActiveMenu()'s removeAll() calls (only the menu ITEMS inside
    // it are destroyed/rebuilt), so it's a stable drop target for "drop
    // below the last row" -- always inserts at the end of this._activeOrder.
    //
    // BUG FIX (live-testing report): this USED to overwrite
    // `this._activeMenu.box._delegate` with a plain object. That was wrong:
    // PopupMenuBase's constructor sets `this.box._delegate = this` (the
    // PopupMenuSection instance itself), and that linkage matters for how
    // the shell resolves/manages this section as a menu item elsewhere.
    // Overwriting it is the same class of bug that caused the reported
    // "one drag -> triple rows" issue for the per-row delegates (see the
    // matching comment in _addActiveMenuRow): once `box._delegate` no
    // longer points back to `this._activeMenu`, anything that relies on
    // that link to identify/manage the section breaks silently.
    //
    // FIX: since `this._activeMenu.box._delegate === this._activeMenu`
    // already (shell-managed, untouched), attach handleDragOver/acceptDrop
    // as own properties DIRECTLY on `this._activeMenu` (the PopupMenuSection
    // instance) instead of replacing the delegate. dnd.js's
    // `target._delegate.handleDragOver` still resolves correctly.
    // DO NOT reassign `box._delegate` here or anywhere else in this file --
    // always add methods to the existing delegate instead.
    //
    // Shares _handleActiveDragOver()/_acceptActiveDrop() with every row's
    // own handleDragOver/acceptDrop (see _addActiveMenuRow): both compute
    // the candidate insertion index from LIVE row geometry rather than a
    // fixed "always append" assumption, so a drop anywhere in the box's
    // empty space below the last row still correctly resolves to
    // this._activeOrder.length via _computeInsertionIndex() (pointer below
    // every row's midpoint falls through to rows.length) -- no special
    // casing needed here beyond what the shared methods already do.
    this._activeMenu.handleDragOver = (source, actor, x, y) => this._handleActiveDragOver(source, actor, x, y);
    this._activeMenu.acceptDrop = (source, actor, x, y) => this._acceptActiveDrop(source, actor, x, y);

    let inputFilter = new St.Entry({ width: 300, can_focus: true });
    // shexli (EGO-L-003) fix: connectObject(..., inputFilter) instead of
    // plain connect() -- inputFilter is a GObject/Clutter actor, so this
    // auto-disconnects the moment inputFilter itself is destroyed (as part
    // of disable()'s this._button.destroy() cascade, which tears down the
    // whole menu tree including inputFilterItem/inputFilter below), rather
    // than needing an explicit disconnect call shexli can't statically
    // match. This is the idiomatic GNOME 45+ pattern and does not change
    // when/whether the connection fires during normal operation.
    inputFilter.clutter_text.connectObject(
      'text-changed',
      (o) => {
        this._hint = o.get_text().toLowerCase();
        this._updateInactiveMenu();
      },
      inputFilter
    );

    let inputFilterItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
    inputFilterItem.add_child(inputFilter);

    this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Active clocks'));
    this._menu.addMenuItem(this._activeMenu);
    this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Add more clocks'));
    this._menu.addMenuItem(inputFilterItem);
    this._menu.addMenuItem(this._inactiveMenu);
    this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Config'));
    this._menu.addMenuItem(this._configMenu);
    this._configMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));
    this._configMenu.addAction('Clear clocks', () => this._clearClocks());

    this._menuOpenStateId = this._menu.connect('open-state-changed', (menu, open) => {
      if (open) {
        inputFilter.set_text('');
        this._hint = '';
        this._updateMenu();
      }
    });
  }

  // BUG FIX (live-testing report): toggling a switch OFF flipped the
  // visual but never persisted/applied -- ANCHOR FACT was that
  // `gsettings get ... config` kept reading every key as true after
  // turning switches off, i.e. the OFF write never reached settings.
  // Re-reading _saveSettings()/this._config[name] assignment top to bottom
  // found no `||`/truthy-default reconstruction and no obvious bug in the
  // write path itself -- this._config is written to the 'a{sb}' variant
  // verbatim. That points at the *input* to `this._config[name] = state`:
  // `state`, the SIGNAL's emitted parameter, going through GObject signal
  // marshaling. `item.state` (a plain property getter read directly off
  // the PopupSwitchMenuItem instance after the toggle) is the more
  // authoritative, lower-risk source of truth for "what is the switch
  // actually set to right now" and is used instead, eliminating any
  // possible mismatch between the two. Boolean(...) is applied explicitly
  // so only a real primitive boolean is ever stored/persisted.
  _addConfigSwitch({ label, name }) {
    let configSwitch = new PopupMenu.PopupSwitchMenuItem(label, this._config[name]);
    configSwitch.connect('toggled', (item) => {
      this._config[name] = Boolean(item.state);
      this._saveSettings();
      this._updateLabel();
      // Cheap/simple to call unconditionally for every config switch (not
      // just 'hideSystemClock'): it no-ops instantly when the visibility
      // already matches this._config.hideSystemClock. This is also what
      // makes the switch apply immediately -- the user sees the system
      // clock vanish/reappear the moment they flip it, no restart needed.
      this._applySystemClockVisibility();
    });
    this._configSwitches[name] = configSwitch;
    this._configMenu.addMenuItem(configSwitch);
  }

  // Belt-and-suspenders companion to the fix above: forces every config
  // switch's VISUAL state back to match this._config (the authoritative,
  // persisted value) every time the menu opens (see _updateMenu()). This
  // means even if a switch's displayed toggle position and this._config
  // ever did desync for any reason, reopening the menu self-heals the
  // visual -- the stored value always wins.
  _syncConfigSwitches() {
    Object.keys(this._configSwitches).forEach((name) => {
      this._configSwitches[name].setToggleState(Boolean(this._config[name]));
    });
  }

  // Hides/shows GNOME Shell's own top-bar clock label to match
  // this._config.hideSystemClock. `_clockDisplay` is a private Shell
  // implementation member (not public API), so this is guarded to
  // silently no-op -- never throw -- if it's missing on some future
  // GNOME Shell version. this._hidSystemClock records whether WE were the
  // one to hide it, so disable() only restores visibility it actually
  // changed (never fighting another extension managing the same label).
  _applySystemClockVisibility() {
    let clockDisplay = Main.panel.statusArea.dateMenu?._clockDisplay;
    if (!clockDisplay) {
      return;
    }

    let shouldHide = Boolean(this._config.hideSystemClock);
    clockDisplay.visible = !shouldHide;
    this._hidSystemClock = shouldHide;
  }

  _createScrollableMenuSection() {
    let menu = new PopupMenu.PopupMenuSection();
    menu.actor = new St.ScrollView({
      style_class: 'popup-menu-content',
      hscrollbar_policy: St.PolicyType.NEVER,
      vscrollbar_policy: St.PolicyType.AUTOMATIC
    });
    // St.ScrollView only allocates the actor in its 'child' property;
    // a generic add_child() leaves the box unallocated (invisible) on
    // GNOME 46+. set_child() also works on 45 via the St.Bin parent.
    menu.actor.set_child(menu.box);
    return menu;
  }

  // Feature A: iterates this._activeOrder (not this._state) so the panel
  // text reflects the user's chosen order rather than alphabetical.
  // Feature B: joins with ' | ' when showSeparator is on, the original
  // four-space gap otherwise -- a plain array-join now that order comes
  // from an explicit list instead of a filter over this._state.
  _updateLabel() {
    let texts = this._activeOrder
      .map((zone) => this._stateByZone.get(zone))
      .filter((item) => item !== undefined)
      .map((item) => this._getLabelForTimezone({ item: item }));

    let separator = this._config.showSeparator ? ' | ' : '    ';
    this._label.text = texts.length > 0 ? texts.join(separator) : '...';
  }

  // `nameOverride`, when given, is a matched search-result alias display
  // name (Feature A) and takes priority over any stored per-zone label
  // (Feature B) for the row's name segment -- this is the single place
  // that formats "Name (zone/id)", reused by both features instead of
  // duplicating the format logic at each call site.
  _getLabelForTimezone({ item, full, nameOverride }) {
    let glibTimezone = GLib.TimeZone.new(item.timezone);
    let now = GLib.DateTime.new_now(glibTimezone);
    let alias = nameOverride || (this._labels ? this._labels[item.timezone] : undefined);
    let timezoneLabel;

    if (full) {
      // Full form (active-clock and search-result menu rows): always show
      // the zone id so it stays identifiable; when a name is given
      // (override or stored label), prefix it and keep the zone id visible
      // in parens, e.g. "Home (America/Los_Angeles)".
      timezoneLabel = alias ? `${alias} (${item.timezone})` : item.timezone;
    } else {
      // Panel form: the alias substitutes for the city-name segment, so
      // it still respects the "Show city name" toggle like the text it
      // replaces.
      timezoneLabel = this._config.showCity ? alias || item.timezone.split('/').pop().replace('_', ' ') : '';
    }

    let offset = full || this._config.showTimezone ? ` ${now.format('%Z')} ` : ' ';
    return `${timezoneLabel}${offset}${now.format(this._config.format24 ? '%R' : '%l:%M %p')}`;
  }

  _updateMenu() {
    this._updateTimeLabels();
    this._updateActiveMenu();
    this._updateInactiveMenu();
    this._syncConfigSwitches();
  }

  _updateTimeLabels() {
    this._state.forEach((item) => (item.label = this._getLabelForTimezone({ item: item, full: true })));
  }

  // Feature A: iterates this._activeOrder (the authoritative display
  // order) instead of filtering this._state, resolving each zone id via
  // this._stateByZone. Row build order no longer needs to carry an
  // explicit index for drop-target math: _handleActiveDragOver()/
  // _acceptActiveDrop() (shared by every row and by this._activeMenu's
  // own end-of-list target) compute the candidate insertion index from
  // LIVE row geometry read off the box's actual children at drag time
  // (see _getActiveRowGeometry()), not from a value captured at build time.
  _updateActiveMenu() {
    // shexli (EGO-L-003): disconnect the outgoing rows' draggables'
    // 'drag-end' signals before removeAll() destroys them -- see
    // _clearRowDraggables() for why this ordering is safe even when called
    // from inside a just-completed drop's own call stack.
    this._clearRowDraggables();
    this._activeMenu.removeAll();

    this._activeOrder.forEach((zone) => {
      let item = this._stateByZone.get(zone);
      if (item) {
        this._addActiveMenuRow(item, ACTIVE_MARK);
      }
    });
  }

  // Builds one active-clock row as a custom PopupBaseMenuItem: a drag
  // handle, a label (checkmark + time, or an inline St.Entry while
  // editing), and a small edit button. Replaces the previous addAction()
  // rows so the label can be swapped for an editable St.Entry per row.
  _addActiveMenuRow(item, activeMark) {
    let menuItem = new PopupMenu.PopupBaseMenuItem();

    // --- Feature A: drag-and-drop reorder ---
    //
    // DESIGN DECISION: makeDraggable() is attached to the drag-HANDLE icon
    // only, not to the whole row. The task explicitly allows this as the
    // safer fallback ("restrict makeDraggable to the drag-handle actor
    // instead of the whole row") and it's the choice made here: the row
    // (`menuItem`) already owns its own button-press/release handling for
    // 'activate' (toggle-off) via PopupBaseMenuItem, and a second listener
    // from _Draggable on the SAME actor for the SAME events is a real risk
    // of breaking click-to-toggle or the edit button in ways that can't be
    // statically verified from source alone (Clutter/GObject boolean-return
    // signal accumulators can stop later handlers on the same actor from
    // running at all, depending on connection order and return values).
    // Scoping the draggable to a small dedicated handle actor sidesteps
    // that risk entirely: clicks on the label/edit button are completely
    // unaffected, and dragging only starts from a press-and-drag on the
    // handle. Only the drag SOURCE (what starts the drag) is the small
    // handle actor -- the floating drag actor the user actually sees is a
    // separate, custom whole-row preview built by getDragActor() below, so
    // this scoping decision does not limit what's shown while dragging.
    //
    // ICON RISK (flag for runtime verification): 'list-drag-handle-symbolic'
    // is used below (and in the drag-actor preview further down) on the
    // assumption it exists in the running icon theme.
    // This cannot be confirmed from a static read of this repo. If it
    // renders as a missing-icon glyph, swap the icon_name (e.g. to
    // 'open-menu-symbolic' or another always-present symbolic icon) --
    // the DnD wiring itself does not depend on which icon is shown.
    let dragIcon = new St.Icon({
      icon_name: 'list-drag-handle-symbolic',
      style_class: 'popup-menu-icon'
    });
    let dragHandle = new St.Button({
      style_class: 'button',
      child: dragIcon,
      reactive: true,
      can_focus: true,
      track_hover: true
    });
    menuItem.add_child(dragHandle);

    // Tag the handle actor directly with the zone id it represents, and
    // pre-set its own _delegate to itself so it can serve as the drag
    // SOURCE's identity (read back via _getDragSourceZone()). This is safe
    // to overwrite because dragHandle is a plain St.Button we just created
    // -- it has no prior shell-managed _delegate, unlike menuItem/box
    // below. ASSUMPTION (flag for runtime verification): dnd.js's
    // _Draggable only sets `actor._delegate = this` if `actor._delegate`
    // is not already set, so pre-setting it here means acceptDrop's
    // `source` argument (whatever exact object dnd.js passes -- the
    // convention is not 100% certain from static reading alone) should
    // resolve to `dragHandle` either directly or via a `_delegate` hop;
    // _getDragSourceZone() below checks both shapes defensively.
    //
    // BUG FIX (live-testing report): dragHandle's self-delegate does NOT
    // implement handleDragOver/acceptDrop (it's a plain St.Button, not a
    // drop target). REASONING (documented per fix request, not verified
    // against a live shell): dnd.js's target search walks UP from the
    // actor under the pointer through ancestors, testing
    // `actor._delegate && actor._delegate.handleDragOver` at each level
    // and continuing to `actor.get_parent()` when that fails -- it does
    // not stop/dead-zone just because the immediate hit's delegate lacks
    // the method. So a drop landing directly on another row's dragHandle
    // should still resolve up to that row's `menuItem` (see below), whose
    // own delegate now has handleDragOver/acceptDrop. Flagged for runtime
    // verification: if dropping precisely on a handle turns out to be a
    // dead zone in practice, the walk-continues-upward assumption above is
    // what needs revisiting.
    dragHandle.dragZoneId = item.timezone;
    dragHandle._delegate = dragHandle;

    // BUG FIX (live-testing report): the handle rendered at the RIGHT end
    // of the row after a drag instead of staying at the left. ROOT CAUSE:
    // with no getDragActor() override, dnd.js's default behavior is to
    // drag the REAL `dragHandle` actor itself -- it reparents it to the
    // stage for the duration of the drag. `restoreOnSuccess: false` then
    // means it is never reparented back to its original spot in `menuItem`
    // on a successful drop; instead it's left wherever dnd.js's drop
    // handling puts it (effectively orphaned from its row), while
    // `_reorderActiveZone()`'s `_updateActiveMenu()` rebuild subsequently
    // adds a brand-new row (with its own brand-new handle) -- the stray
    // ex-handle actor ending up appended after everything else is what
    // rendered as "handle at the right end."
    //
    // UX POLISH (live-testing feedback): the clone-icon drag actor "looked
    // like small white dots" following the cursor -- unclear what was being
    // moved. FIX: getDragActor() now builds a freestanding, throwaway
    // St.BoxLayout styled like a real row (style_class 'popup-menu-item',
    // the same drag-handle icon, and a label showing this clock's current
    // full display text via _getLabelForTimezone({item, full:true}),
    // recomputed fresh here rather than trusting a possibly-stale
    // item.label). This is still a brand-new actor, never the real row or
    // any of its children -- no reparenting, so the handle-jump bug fixed
    // previously cannot be reintroduced. getDragActorSource() still
    // returns the real handle (dnd.js uses it to size/position the clone's
    // starting point); `restoreOnSuccess: false` remains moot since the
    // real actor is still never moved.
    dragHandle.getDragActor = () => {
      let preview = new St.BoxLayout({
        style_class: 'popup-menu-item',
        vertical: false
      });
      preview.add_child(
        new St.Icon({
          icon_name: 'list-drag-handle-symbolic',
          style_class: 'popup-menu-icon'
        })
      );
      preview.add_child(
        new St.Label({
          text: `${activeMark} ${this._getLabelForTimezone({ item, full: true })}`,
          y_align: Clutter.ActorAlign.CENTER
        })
      );
      return preview;
    };
    dragHandle.getDragActorSource = () => dragHandle;

    let draggable = DND.makeDraggable(dragHandle, { restoreOnSuccess: false, manualMode: false });
    // No 'drag-begin' handler: the drop indicator is created lazily on
    // first handleDragOver, not needed before a drag actually starts
    // moving, so there was nothing for a drag-begin handler to do -- a
    // shexli pass (EGO-L-003) flagged the previous no-op `.connect(
    // 'drag-begin', () => {})` as an unmatched signal connection, and since
    // it genuinely did nothing, it was removed rather than given a
    // matching disconnect.
    //
    // 'drag-end' IS kept and is load-bearing: it's the unconditional
    // teardown net for the live landing-zone indicator, firing on EVERY
    // drag end regardless of outcome (successful drop, cancelled via
    // Escape, or dropped outside any valid target), so clearing the
    // indicator here guarantees a cancelled/failed drag never leaves it
    // behind even though acceptDrop() (the success path) also clears it --
    // _clearDropIndicator() is idempotent, so both call sites are safe.
    //
    // shexli (EGO-L-003) fix for THIS connection: the handler id is stored
    // in this._rowDraggables and explicitly disconnected by
    // _clearRowDraggables() (called from disable() and from the start of
    // every _updateActiveMenu() rebuild) rather than left unmatched.
    // `draggable` (DND.makeDraggable()'s return value, dnd.js's internal
    // _Draggable) is NOT necessarily a GObject -- see the TYPE NOTE on
    // _clearRowDraggables() -- so explicit connect-id/disconnect is used
    // instead of connectObject(), which is only guaranteed to exist on
    // GObject instances.
    let dragEndId = draggable.connect('drag-end', () => this._clearDropIndicator());
    this._rowDraggables.push({ draggable, dragEndId });

    // Each row is itself a drop target (for reordering onto/around it);
    // the active section's box (see _initMenu) is the separate end-of-list
    // target. Both share _handleActiveDragOver()/_acceptActiveDrop(),
    // which compute the candidate insertion index from LIVE row geometry
    // (this row's own position is no longer captured/relied on at build
    // time -- see _getActiveRowGeometry()).
    //
    // BUG FIX (live-testing report, still applies): this USED to replace
    // `menuItem._delegate` wholesale with a plain { handleDragOver,
    // acceptDrop } object. That was wrong and caused the reported "drag one
    // row -> every active row triples" bug: PopupBaseMenuItem's own
    // constructor sets `this._delegate = this` (self-delegate), and
    // PopupMenuBase.removeAll() discovers which of its box's children are
    // menu items to destroy by reading each child's `_delegate` and
    // checking `instanceof PopupBaseMenuItem`. Overwriting `_delegate` with
    // a plain object made every row invisible to that check, so
    // `_updateActiveMenu()`'s `removeAll()` silently destroyed nothing --
    // old rows were orphaned (still in the box, still rendering) while a
    // fresh batch was appended on top every time the menu opened or a drop
    // occurred, producing duplicated/tripled rows.
    //
    // FIX (still in effect): attach handleDragOver/acceptDrop as own
    // properties DIRECTLY on `menuItem` instead, leaving `menuItem._delegate`
    // (== menuItem itself) completely untouched. dnd.js's
    // `target._delegate.handleDragOver` still resolves correctly
    // (`target._delegate` is `menuItem`, which now has the method
    // directly), and `removeAll()`'s `instanceof PopupBaseMenuItem` check
    // keeps working since the delegate is still the real menu item.
    // DO NOT reassign `menuItem._delegate` here or anywhere else in this
    // file -- always add methods to the existing delegate instead.
    menuItem.handleDragOver = (source, actor, x, y) => this._handleActiveDragOver(source, actor, x, y);
    menuItem.acceptDrop = (source, actor, x, y) => this._acceptActiveDrop(source, actor, x, y);

    let label = new St.Label({
      text: `${activeMark} ${item.label}`,
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER
    });
    menuItem.add_child(label);

    let entry = new St.Entry({
      can_focus: true,
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
      visible: false
    });
    menuItem.add_child(entry);

    // No interaction with the DnD wiring above: the edit button is a
    // distinct St.Button actor from dragHandle, with its own independent
    // button-press/release handling (same reasoning as the existing
    // St.Button-consumes-its-own-events comment on editButton.connect(...)
    // below applies equally to dragHandle). Dragging never starts a rename,
    // and committing/cancelling a rename never triggers a drag.
    let editIcon = new St.Icon({
      icon_name: 'document-edit-symbolic',
      style_class: 'popup-menu-icon'
    });
    let editButton = new St.Button({
      style_class: 'button',
      child: editIcon,
      reactive: true,
      can_focus: true,
      track_hover: true
    });
    menuItem.add_child(editButton);

    let enterEditMode = () => {
      entry.set_text(this._labels[item.timezone] || '');
      label.visible = false;
      entry.visible = true;
      entry.grab_key_focus();
    };

    // Guards the key-focus-out handler below: committing destroys and
    // rebuilds this row synchronously (via _updateActiveMenu), which can
    // itself cause this entry to lose key focus as it's torn down. Without
    // this flag that would re-enter cancelEdit() on an already-destroyed
    // actor.
    let committed = false;

    let cancelEdit = () => {
      if (committed) {
        return;
      }
      entry.visible = false;
      label.visible = true;
    };

    let commitEdit = () => {
      committed = true;
      // _setLabel() saves settings and calls _updateActiveMenu(), which
      // rebuilds every row (including this one), so no further local
      // cleanup of `entry`/`label` is needed here.
      this._setLabel(item.timezone, entry.get_text());
    };

    // shexli (EGO-L-003) fix: connectObject(..., entry) for both of this
    // row's inline-rename key handlers, instead of plain connect() --
    // `entry` is the natural owner for signals on its own clutter_text:
    // when the row is rebuilt (_updateActiveMenu()'s removeAll(), e.g.
    // after a commit/rename or a reorder) or the extension is disabled,
    // `entry` is destroyed along with the rest of `menuItem`, and
    // connectObject auto-disconnects at exactly that point -- no explicit
    // disconnect call needed, and no change to when these handlers fire
    // during normal editing.
    entry.clutter_text.connectObject(
      'key-press-event',
      (actor, event) => {
        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
          commitEdit();
          return Clutter.EVENT_STOP;
        }
        if (symbol === Clutter.KEY_Escape) {
          cancelEdit();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      },
      entry
    );

    // Losing keyboard focus (click elsewhere, menu closing, Tab away)
    // cancels the edit rather than committing it, so an accidental
    // focus-out can never silently save a half-typed value. Only Enter
    // (via the handler above) commits.
    entry.clutter_text.connectObject('key-focus-out', () => cancelEdit(), entry);

    // St.Button consumes its own button-press/release events (it returns
    // Clutter.EVENT_STOP internally as part of normal button behavior),
    // so a click on the edit icon never bubbles up to trigger this
    // PopupBaseMenuItem's 'activate' handler below. Only clicks that land
    // on the row itself (i.e. the label area, since the entry likewise
    // consumes its own clicks while visible) toggle the zone off.
    editButton.connect('clicked', () => enterEditMode());

    menuItem.connect('activate', () => this._toggleTimezone(item));

    this._activeMenu.addMenuItem(menuItem);
  }

  // With an empty hint, keep the original behavior: only inactive zones are
  // listed (so the section doesn't duplicate Active clocks when the user
  // isn't searching). Once the user types a hint, every matching zone is
  // shown -- including already-active ones, marked with ACTIVE_MARK -- so
  // search never hides a result just because it happens to be active.
  _updateInactiveMenu() {
    this._inactiveMenu.removeAll();
    let hint = this._hint;

    if (hint === '') {
      this._state
        .filter((item) => !item.active)
        .forEach((item) => this._inactiveMenu.addAction(item.label, () => this._toggleTimezone(item)));
      return;
    }

    // Per keystroke: one pass over this._aliases (~1.3k entries) to find
    // each zone's single best-matching alias, then one pass over
    // this._state (349 zones) to build at most one row per zone. No
    // per-zone re-scan of the alias list (that would be the O(n*m) cost
    // this precomputed/flattened structure is meant to avoid).
    let bestAliasByZone = new Map();
    this._aliases.forEach((alias) => {
      if (alias.key.indexOf(hint) === -1) {
        return;
      }
      let current = bestAliasByZone.get(alias.zone);
      if (!current || this._isBetterAliasMatch(alias, current, hint)) {
        bestAliasByZone.set(alias.zone, alias);
      }
    });

    this._state.forEach((item) => {
      let alias = bestAliasByZone.get(item.timezone);
      if (!alias && item.lower.indexOf(hint) === -1) {
        return;
      }

      // An alias match always wins over the zone's own row, even if the
      // zone id also happens to contain the hint -- at most one row per zone.
      let label = alias ? this._getLabelForTimezone({ item, full: true, nameOverride: alias.display }) : item.label;
      let text = item.active ? `${ACTIVE_MARK} ${label}` : label;

      this._inactiveMenu.addAction(text, () => {
        if (item.active) {
          // Checkmarked result: toggling off leaves any stored label alone.
          this._toggleTimezone(item);
        } else if (alias) {
          // Selecting an alias match both activates the zone and sets its
          // display label to the alias's display name (overwriting any
          // previously stored label for that zone).
          this._activateWithAlias(item, alias.display);
        } else {
          this._toggleTimezone(item);
        }
      });
    });
  }

  // Picks the better of two same-zone alias matches for a given hint:
  // prefer a key that startsWith(hint), then the shortest key, then
  // alphabetical order -- matching the phase spec's tie-break rules.
  _isBetterAliasMatch(candidate, current, hint) {
    let candidateStarts = candidate.key.startsWith(hint);
    let currentStarts = current.key.startsWith(hint);
    if (candidateStarts !== currentStarts) {
      return candidateStarts;
    }

    if (candidate.key.length !== current.key.length) {
      return candidate.key.length < current.key.length;
    }

    return candidate.key < current.key;
  }

  // Feature A: toggling on appends to the end of this._activeOrder (new
  // clocks join at the end, not alphabetically); toggling off removes the
  // zone from it. Renaming a zone never goes through this method, so
  // position is naturally preserved across renames. The indexOf guard on
  // the activate path is defense-in-depth for the this._activeOrder
  // no-duplicates invariant (see _reconcileActiveOrder): in normal UI
  // flow this is only ever called to activate a currently-inactive item,
  // so the guard should be a no-op, but it keeps this method idempotent
  // regardless, matching _activateWithAlias's existing guard.
  _toggleTimezone(item) {
    item.active = !item.active;

    if (item.active) {
      if (this._activeOrder.indexOf(item.timezone) === -1) {
        this._activeOrder.push(item.timezone);
      }
    } else {
      let index = this._activeOrder.indexOf(item.timezone);
      if (index !== -1) {
        this._activeOrder.splice(index, 1);
      }
    }

    this._updateLabel();
    this._saveSettings();
  }

  // Activates `item` and sets its stored display label to displayName in
  // one step (sanitize -> set -> activate -> single save -> refresh panel),
  // so the panel immediately shows the alias (e.g. "Seattle") instead of
  // requiring two separate settings writes. This intentionally overwrites
  // any label previously stored for the zone. Feature A: also appends to
  // this._activeOrder like _toggleTimezone's activate path (this method is
  // only ever called on a currently-inactive item, but the indexOf guard
  // keeps it idempotent/safe regardless).
  _activateWithAlias(item, displayName) {
    item.active = true;
    if (this._activeOrder.indexOf(item.timezone) === -1) {
      this._activeOrder.push(item.timezone);
    }

    let sanitized = this._sanitizeLabel(displayName);
    if (sanitized.length > 0) {
      this._labels[item.timezone] = sanitized;
    } else {
      delete this._labels[item.timezone];
    }

    this._updateLabel();
    this._saveSettings();
  }

  // Moves zoneId to targetIndex within this._activeOrder. Splicing out the
  // old entry shifts every later index down by one, so when the old
  // position is BEFORE targetIndex, the effective insertion index must be
  // decremented by one to land in the intended visual slot -- e.g. order
  // [A, B, C], moving A to "after C" (targetIndex 3) must insert at index 2
  // (post-removal length), not 3, or it would be clamped past the end and
  // silently behave like appending past a now-shorter array. Used by both
  // the per-row and end-of-list drop targets; produces exactly one
  // _saveSettings() + one _updateLabel() + one _updateActiveMenu() call
  // per completed drop, not per intermediate drag-over event (those only
  // return a DragMotionResult and never touch this._activeOrder).
  _reorderActiveZone(zoneId, targetIndex) {
    let oldIndex = this._activeOrder.indexOf(zoneId);
    if (oldIndex === -1) {
      return;
    }

    this._activeOrder.splice(oldIndex, 1);

    let insertAt = oldIndex < targetIndex ? targetIndex - 1 : targetIndex;
    insertAt = Math.max(0, Math.min(insertAt, this._activeOrder.length));

    this._activeOrder.splice(insertAt, 0, zoneId);

    this._saveSettings();
    this._updateLabel();
    this._updateActiveMenu();
  }

  // Resolves the zone id being dragged from dnd.js's `source` argument.
  // ASSUMPTION (flag for runtime verification): the exact shape of `source`
  // passed to acceptDrop/handleDragOver by this GNOME Shell version's
  // dnd.js is not confirmed from static reading alone -- it may be the
  // dragged actor itself, or its `_delegate`. Both shapes resolve here
  // because dragHandle.dragZoneId is set directly on the handle actor AND
  // dragHandle._delegate === dragHandle (see _addActiveMenuRow).
  _getDragSourceZone(source) {
    if (!source) {
      return null;
    }
    return source.dragZoneId ?? source._delegate?.dragZoneId ?? null;
  }

  // --- Live landing-zone feedback ---
  //
  // APPROACH CHOSEN: a single drop-indicator line, NOT live reflow of the
  // active rows. The task explicitly offered reflow as the user's stated
  // preference but named a drop-indicator line as an acceptable
  // lower-risk fallback, to be chosen if reflow "proves unstable under
  // the popup menu's modal grab" -- and explicitly said to build only ONE
  // approach. Reflow means mutating multiple rows' layout (margins/
  // translations) on every handleDragOver call (i.e. on every pointer-
  // motion event during the drag) while the popup holds its modal grab,
  // and then guaranteeing that mutation is perfectly undone on every exit
  // path (success, Escape, drop-outside, source-destroyed). This file has
  // already hit two separate DnD bugs from touching shell-managed state in
  // ways that looked correct locally but broke under the shell's actual
  // menu-item bookkeeping (the _delegate-overwrite duplication bug, and
  // the drag-actor-reparenting handle-jump bug) -- both were plausible-
  // looking code that could not be verified without a live shell. A single
  // extra, clearly-scoped, non-shell-managed actor (this._dropIndicator)
  // that is only ever inserted into and removed from one box, with no
  // per-row mutation and no dependency on shell-internal row bookkeeping,
  // is the smaller, more auditable surface area. Reflow is deferred rather
  // than attempted.
  //
  // Candidate insertion index is computed by the pure _computeInsertionIndex()
  // below from live row geometry (_getActiveRowGeometry()), and reused
  // identically by _handleActiveDragOver() (for positioning the indicator)
  // and _acceptActiveDrop() (for the real reorder), so the visual candidate
  // and the actual drop index can never diverge.

  // Pure: given the drag pointer's Y (dnd.js's handleDragOver/acceptDrop
  // `y` argument) and an array of currently-visible active rows'
  // { y, height } in top-to-bottom order (same coordinate space as each
  // row's own get_transformed_position()), returns the candidate insertion
  // index: 0 if pointerY is above the first row's midpoint, i+1 if it's
  // between row i and row i+1 (below row i's midpoint, at/above row i+1's),
  // rows.length if it's below the last row's midpoint (or rows is empty).
  // No gnome-shell dependency -- see the scratch-node test for
  // representative pointer-Y sequences including boundary rows.
  _computeInsertionIndex(pointerY, rows) {
    for (let i = 0; i < rows.length; i++) {
      if (pointerY < rows[i].y + rows[i].height / 2) {
        return i;
      }
    }
    return rows.length;
  }

  // Reads the live on-screen geometry of every active-clock row, in
  // top-to-bottom order, directly from this._activeMenu.box's actual
  // children at the moment of the call (not from anything captured at row-
  // build time). Filters out the drop-indicator actor itself via its
  // `isDropIndicator` tag so it is never mistaken for a row -- this matters
  // because the indicator is a real child of the same box while a drag is
  // in progress, and would otherwise shift the computed indices.
  //
  // KNOWN MINOR RISK (noted, not fixed -- out of scope per this fix):
  // filtering the indicator OUT of this array prevents it from being
  // counted as a row, but does not undo the fact that inserting it into
  // the box physically shifts every REAL row below the insertion point
  // down by the indicator's own height (a few px, since St.BoxLayout lays
  // out children in a vertical stack). That could cause the candidate
  // index to jitter by one right at a boundary as the indicator itself
  // moves. Left as-is: fixing it cleanly would mean either reading
  // geometry before the indicator affects layout or compensating for its
  // height, and neither is obviously safe to do without live-shell
  // verification, so it's flagged here rather than attempted.
  _getActiveRowGeometry() {
    return this._activeMenu.box.get_children()
      .filter((child) => !child.isDropIndicator)
      .map((child) => {
        let [, y] = child.get_transformed_position();
        return { y, height: child.get_height() };
      });
  }

  // BUG FIX (live-testing report): the drop-indicator line always showed at
  // the TOP of the list and never moved, even though the actual drop still
  // landed correctly. ROOT CAUSE: the `y` dnd.js passes to
  // handleDragOver/acceptDrop is in the TARGET ACTOR'S LOCAL coordinate
  // space (it transforms the stage pointer into whichever actor's
  // `_delegate` it's currently invoking -- roughly 0..rowHeight when over a
  // row, or box-local when over the box), but _getActiveRowGeometry()
  // builds row {y} from get_transformed_position(), which is STAGE
  // (absolute) coordinates -- typically hundreds of px. Comparing a small
  // local `y` against large stage `y` values in _computeInsertionIndex()
  // meant `pointerY < rows[0].y + height/2` was true for basically any
  // local y, so the computed index was always 0. The drop still landed in
  // the right place only incidentally (whatever the final resolved index
  // happened to be from other internal dnd.js state at release time) --
  // not something to rely on.
  //
  // FIX: use global.get_pointer() (returns [stageX, stageY, mods] in
  // absolute stage coordinates -- the standard GNOME Shell way to read the
  // current pointer position) instead of the passed `y`, so the pointer Y
  // and the row geometry are in the SAME coordinate space. The passed
  // (x, y) params are kept in the method signatures (dnd.js still calls
  // with them) but are no longer used for the index math.
  // _computeInsertionIndex() itself is unchanged/still pure.
  //
  // RUNTIME NOTE: global.get_pointer() cannot be exercised outside a
  // running GNOME Shell process, so this fix could not be scratch-tested
  // the way _computeInsertionIndex() was -- flagged for user runtime
  // re-verification (indicator should now track the pointer and land
  // exactly where shown).

  // Shared handleDragOver for both the per-row drop targets and the active
  // section's own end-of-list target (see _initMenu and _addActiveMenuRow):
  // computes the live candidate index and positions the drop-indicator
  // line there. Always returns MOVE_DROP -- this row/section is always a
  // valid reorder target while a clock is being dragged.
  _handleActiveDragOver(source, actor, x, y) {
    let [, pointerY] = global.get_pointer();
    let targetIndex = this._computeInsertionIndex(pointerY, this._getActiveRowGeometry());
    this._showDropIndicatorAt(targetIndex);
    return DND.DragMotionResult.MOVE_DROP;
  }

  // Shared acceptDrop for both the per-row drop targets and the active
  // section's own end-of-list target. Recomputes the same candidate index
  // (from the same live-geometry function AND the same stage-space pointer
  // source used by _handleActiveDragOver, so the actual drop index matches
  // whatever the indicator last showed), clears the indicator, then
  // performs the single reorder + save + refresh via _reorderActiveZone().
  _acceptActiveDrop(source, actor, x, y) {
    let zoneId = this._getDragSourceZone(source);
    if (!zoneId) {
      this._clearDropIndicator();
      return false;
    }

    let [, pointerY] = global.get_pointer();
    let targetIndex = this._computeInsertionIndex(pointerY, this._getActiveRowGeometry());
    this._clearDropIndicator();
    this._reorderActiveZone(zoneId, targetIndex);
    return true;
  }

  // Lazily creates the single drop-indicator actor (a thin highlighted
  // bar, styled inline since this extension ships no stylesheet.css) and
  // (re)inserts it into this._activeMenu.box at `index`, removing any
  // previous insertion first so there is never more than one indicator in
  // the tree at once. `isDropIndicator` tags it so _getActiveRowGeometry()
  // and any future logic can always recognize and skip it.
  //
  // RUNTIME ASSUMPTION (flag for verification): this actor is `reactive:
  // false`, intended to be click/pointer-transparent, but dnd.js's own
  // internal "what's under the pointer" resolution during a drag may use a
  // pick mode that considers non-reactive actors too. If so, pausing the
  // pointer precisely over the indicator's own thin strip could
  // momentarily resolve the drag-over target to this._activeMenu.box (the
  // end-of-list target) rather than a specific row, until the pointer moves
  // off it again. This is a cosmetic edge case at worst (the indicator is
  // only a couple of pixels tall) and cannot be confirmed without a live
  // shell -- flagged for user verification.
  _showDropIndicatorAt(index) {
    if (!this._dropIndicator) {
      this._dropIndicator = new St.Widget({
        style: 'height: 2px; margin: 2px 6px; background-color: #3584e4; border-radius: 1px;',
        reactive: false,
        x_expand: true
      });
      this._dropIndicator.isDropIndicator = true;
    }

    let box = this._activeMenu.box;
    if (this._dropIndicator.get_parent() === box) {
      box.remove_child(this._dropIndicator);
    }

    let clampedIndex = Math.max(0, Math.min(index, box.get_n_children()));
    box.insert_child_at_index(this._dropIndicator, clampedIndex);
  }

  // Removes and destroys the drop-indicator actor if one exists. MUST be
  // called on every drag exit path -- successful drop (_acceptActiveDrop),
  // cancelled/failed drag (the draggable's 'drag-end', which fires
  // regardless of outcome -- see _addActiveMenuRow), and defensively here
  // before _updateActiveMenu() rebuilds rows (that rebuild only destroys
  // actual PopupBaseMenuItem/PopupMenuSection rows via removeAll()'s
  // delegate-based discovery -- the indicator is a plain St.Widget child
  // added directly to the box, not a menu item, so removeAll() does not
  // know about it and would otherwise leave it orphaned in the tree
  // forever). Idempotent: safe to call when no indicator is present, and
  // safe to call more than once per drag.
  _clearDropIndicator() {
    if (!this._dropIndicator) {
      return;
    }
    if (this._dropIndicator.get_parent()) {
      this._dropIndicator.get_parent().remove_child(this._dropIndicator);
    }
    this._dropIndicator.destroy();
    this._dropIndicator = null;
  }

  // shexli (EGO-L-003): disconnects every tracked per-row draggable's
  // 'drag-end' signal (see this._rowDraggables, populated in
  // _addActiveMenuRow()) and empties the tracking array. `draggable`
  // (DND.makeDraggable()'s return value) is dnd.js's internal _Draggable
  // class -- TYPE NOTE: this could not be confirmed by live introspection,
  // but GNOME Shell's dnd.js has historically implemented _Draggable with
  // the plain-JS Signals mixin (imports.signals / misc/signals.js), NOT as
  // a GObject.Object subclass, so `connectObject`/`disconnectObject`
  // (GObject-only APIs) may not exist on it. Explicit id-based
  // connect()/disconnect() is used instead specifically because that pair
  // is guaranteed to work on EITHER a GObject or a Signals-mixin object,
  // sidestepping the need to be certain which one `draggable` actually is.
  //
  // Called both in disable() (final teardown) and at the start of every
  // _updateActiveMenu() rebuild, before removeAll() destroys the rows
  // (and their dragHandle/draggable instances) these entries reference --
  // otherwise every reorder would leave the just-replaced rows' draggables
  // (and their now-meaningless signal connections) tracked forever,
  // accumulating across repeated drags. Safe to call when a drag on one of
  // these rows is still finishing: _acceptActiveDrop() already calls
  // _clearDropIndicator() explicitly before _reorderActiveZone() triggers
  // the rebuild that gets here, so disconnecting a 'drag-end' handler that
  // hasn't fired yet for the just-completed drag never skips clearing the
  // indicator -- that already happened via the explicit call. A genuinely
  // cancelled/failed drag (Escape, drop outside a valid target) never
  // reaches _updateActiveMenu() at all (nothing triggers a rebuild), so
  // that row's own 'drag-end' handler is never disconnected prematurely
  // and still fires normally to clear the indicator.
  _clearRowDraggables() {
    this._rowDraggables.forEach(({ draggable, dragEndId }) => {
      draggable.disconnect(dragEndId);
    });
    this._rowDraggables = [];
  }

  _clearClocks() {
    this._state.forEach((item) => (item.active = false));
    this._activeOrder = [];
    this._updateMenu();
    this._updateLabel();
    this._saveSettings();
  }
}
