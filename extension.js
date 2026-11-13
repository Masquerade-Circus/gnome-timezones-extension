import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GnomeDesktop from 'gi://GnomeDesktop';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import timezones from './lib/timezones.js';

const DEFAULT_CONFIG = {
  format24: true,
  showCity: true,
  showTimezone: false
};

export default class TimezonesExtension extends Extension {
  enable() {
    this._config = { ...DEFAULT_CONFIG };
    this._hint = '';
    this._state = [...timezones].sort().map((item) => ({
      timezone: item,
      lowerTimezone: item.toLowerCase(),
      active: item === 'UTC'
    }));

    this._settings = this.getSettings();
    this._loadSettings();

    this._button = new PanelMenu.Button(0.5, this.metadata.name);
    this._button.set_y_align(Clutter.ActorAlign.CENTER);

    this._label = new St.Label({
      text: '...',
      opacity: 150,
      y_align: Clutter.ActorAlign.CENTER
    });
    this._button.add_child(this._label);

    this._initMenu();
    this._updateLabel();

    this._wallClock = new GnomeDesktop.WallClock();
    this._wallClockId = this._wallClock.connect('notify::clock', () => this._updateLabel());

    Main.panel.addToStatusArea(this.uuid, this._button, 1, 'center');
  }

  disable() {
    this._saveSettings();

    if (this._wallClock) {
      this._wallClock.disconnect(this._wallClockId);
      this._wallClock.run_dispose();
    }
    this._button?.destroy();

    this._wallClock = null;
    this._wallClockId = null;
    this._button = null;
    this._label = null;
    this._menu = null;
    this._activeMenu = null;
    this._inactiveMenu = null;
    this._configMenu = null;
    this._settings = null;
    this._state = null;
    this._config = null;
  }

  _loadSettings() {
    let timezonesArray = this._settings.get_value('timezones').deep_unpack();
    if (timezonesArray.length > 0) {
      this._state.forEach((item) => {
        item.active = timezonesArray.includes(item.timezone);
      });
    }

    let configObj = this._settings.get_value('config').deep_unpack();
    for (let key in configObj) {
      this._config[key] = configObj[key];
    }
  }

  _saveSettings() {
    if (!this._settings) {
      return;
    }

    this._settings.set_value(
      'timezones',
      new GLib.Variant(
        'as',
        this._state.filter((item) => item.active).map((item) => item.timezone)
      )
    );

    this._settings.set_value('config', new GLib.Variant('a{sb}', this._config));
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

    let inputFilter = new St.Entry({ width: 300, can_focus: true, hint_text: 'Search timezone…' });
    inputFilter.clutter_text.connect('text-changed', (o) => {
      this._hint = o.get_text().toLowerCase();
      this._updateInactiveMenu();
    });

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

    this._menu.connect('open-state-changed', (menu, open) => {
      if (open) {
        inputFilter.set_text('');
        this._hint = '';
        this._updateMenu();
      }
    });
  }

  _addConfigSwitch({ label, name }) {
    let configSwitch = new PopupMenu.PopupSwitchMenuItem(label, this._config[name]);
    configSwitch.connect('toggled', (item, state) => {
      this._config[name] = state;
      this._saveSettings();
      this._updateLabel();
    });
    this._configMenu.addMenuItem(configSwitch);
  }

  _createScrollableMenuSection() {
    let menu = new PopupMenu.PopupMenuSection();
    menu.actor = new St.ScrollView({
      style_class: 'popup-menu-content',
      hscrollbar_policy: St.PolicyType.NEVER,
      vscrollbar_policy: St.PolicyType.AUTOMATIC
    });
    menu.actor.set_child(menu.box);
    return menu;
  }

  _updateLabel() {
    let text = this._state
      .filter((item) => item.active)
      .map((item) => this._getLabelForTimezone({ item }))
      .join('    ')
      .trim();

    this._label.text = text.length > 0 ? text : '...';
  }

  _getLabelForTimezone({ item, full }) {
    let glibTimezone = GLib.TimeZone.new_identifier(item.timezone) ?? GLib.TimeZone.new_utc();
    let now = GLib.DateTime.new_now(glibTimezone);
    let timezoneLabel = '';
    if (full) {
      timezoneLabel = item.timezone;
    } else if (this._config.showCity) {
      timezoneLabel = item.timezone.split('/').pop().replace(/_/g, ' ');
    }
    let offset = full || this._config.showTimezone ? ` ${now.format('%Z')} ` : ' ';
    return `${timezoneLabel}${offset}${now.format(this._config.format24 ? '%R' : '%l:%M %p')}`.trim();
  }

  _updateMenu() {
    this._updateTimeLabels();
    this._updateActiveMenu();
    this._updateInactiveMenu();
  }

  _updateTimeLabels() {
    this._state.forEach((item) => (item.label = this._getLabelForTimezone({ item, full: true })));
  }

  _updateActiveMenu() {
    this._activeMenu.removeAll();
    this._state
      .filter((item) => item.active)
      .forEach((item) => this._activeMenu.addAction(`✔ ${item.label}`, () => this._toggleTimezone(item)));
  }

  _updateInactiveMenu() {
    this._inactiveMenu.removeAll();
    this._state
      .filter((item) => !item.active && item.lowerTimezone.includes(this._hint))
      .forEach((item) => this._inactiveMenu.addAction(item.label, () => this._toggleTimezone(item)));
  }

  _toggleTimezone(item) {
    item.active = !item.active;
    this._updateLabel();
    this._saveSettings();
  }

  _clearClocks() {
    this._state.forEach((item) => (item.active = false));
    this._updateMenu();
    this._updateLabel();
    this._saveSettings();
  }
}
