var timezones = [
  'UTC',
  'Europe/Andorra',
  'Asia/Dubai',
  'Asia/Kabul',
  'Europe/Tirane',
  'Asia/Yerevan',
  'Antarctica/Casey',
  'Antarctica/Davis',
  'Antarctica/DumontDUrville',
  'Antarctica/Mawson',
  'Antarctica/Palmer',
  'Antarctica/Rothera',
  'Antarctica/Syowa',
  'Antarctica/Troll',
  'Antarctica/Vostok',
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Cordoba',
  'America/Argentina/Salta',
  'America/Argentina/Jujuy',
  'America/Argentina/Tucuman',
  'America/Argentina/Catamarca',
  'America/Argentina/La_Rioja',
  'America/Argentina/San_Juan',
  'America/Argentina/Mendoza',
  'America/Argentina/San_Luis',
  'America/Argentina/Rio_Gallegos',
  'America/Argentina/Ushuaia',
  'Pacific/Pago_Pago',
  'Europe/Vienna',
  'Australia/Lord_Howe',
  'Antarctica/Macquarie',
  'Australia/Hobart',
  'Australia/Currie',
  'Australia/Melbourne',
  'Australia/Sydney',
  'Australia/Broken_Hill',
  'Australia/Brisbane',
  'Australia/Lindeman',
  'Australia/Adelaide',
  'Australia/Darwin',
  'Australia/Perth',
  'Australia/Eucla',
  'Asia/Baku',
  'America/Barbados',
  'Asia/Dhaka',
  'Europe/Brussels',
  'Europe/Sofia',
  'Atlantic/Bermuda',
  'Asia/Brunei',
  'America/La_Paz',
  'America/Noronha',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Araguaina',
  'America/Maceio',
  'America/Bahia',
  'America/Sao_Paulo',
  'America/Campo_Grande',
  'America/Cuiaba',
  'America/Santarem',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Manaus',
  'America/Eirunepe',
  'America/Rio_Branco',
  'America/Nassau',
  'Asia/Thimphu',
  'Europe/Minsk',
  'America/Belize',
  'America/St_Johns',
  'America/Halifax',
  'America/Glace_Bay',
  'America/Moncton',
  'America/Goose_Bay',
  'America/Blanc-Sablon',
  'America/Toronto',
  'America/Nipigon',
  'America/Thunder_Bay',
  'America/Iqaluit',
  'America/Pangnirtung',
  'America/Atikokan',
  'America/Winnipeg',
  'America/Rainy_River',
  'America/Resolute',
  'America/Rankin_Inlet',
  'America/Regina',
  'America/Swift_Current',
  'America/Edmonton',
  'America/Cambridge_Bay',
  'America/Yellowknife',
  'America/Inuvik',
  'America/Creston',
  'America/Dawson_Creek',
  'America/Fort_Nelson',
  'America/Vancouver',
  'America/Whitehorse',
  'America/Dawson',
  'Indian/Cocos',
  'Europe/Zurich',
  'Africa/Abidjan',
  'Pacific/Rarotonga',
  'America/Santiago',
  'America/Punta_Arenas',
  'Pacific/Easter',
  'Asia/Shanghai',
  'Asia/Urumqi',
  'America/Bogota',
  'America/Costa_Rica',
  'America/Havana',
  'Atlantic/Cape_Verde',
  'America/Curacao',
  'Indian/Christmas',
  'Asia/Nicosia',
  'Asia/Famagusta',
  'Europe/Prague',
  'Europe/Berlin',
  'Europe/Copenhagen',
  'America/Santo_Domingo',
  'Africa/Algiers',
  'America/Guayaquil',
  'Pacific/Galapagos',
  'Europe/Tallinn',
  'Africa/Cairo',
  'Africa/El_Aaiun',
  'Europe/Madrid',
  'Africa/Ceuta',
  'Atlantic/Canary',
  'Europe/Helsinki',
  'Pacific/Fiji',
  'Atlantic/Stanley',
  'Pacific/Chuuk',
  'Pacific/Pohnpei',
  'Pacific/Kosrae',
  'Atlantic/Faroe',
  'Europe/Paris',
  'Europe/London',
  'Asia/Tbilisi',
  'America/Cayenne',
  'Africa/Accra',
  'Europe/Gibraltar',
  'America/Godthab',
  'America/Danmarkshavn',
  'America/Scoresbysund',
  'America/Thule',
  'Europe/Athens',
  'Atlantic/South_Georgia',
  'America/Guatemala',
  'Pacific/Guam',
  'Africa/Bissau',
  'America/Guyana',
  'Asia/Hong_Kong',
  'America/Tegucigalpa',
  'America/Port-au-Prince',
  'Europe/Budapest',
  'Asia/Jakarta',
  'Asia/Pontianak',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Europe/Dublin',
  'Asia/Jerusalem',
  'Asia/Kolkata',
  'Indian/Chagos',
  'Asia/Baghdad',
  'Asia/Tehran',
  'Atlantic/Reykjavik',
  'Europe/Rome',
  'America/Jamaica',
  'Asia/Amman',
  'Asia/Tokyo',
  'Africa/Nairobi',
  'Asia/Bishkek',
  'Pacific/Tarawa',
  'Pacific/Enderbury',
  'Pacific/Kiritimati',
  'Asia/Pyongyang',
  'Asia/Seoul',
  'Asia/Almaty',
  'Asia/Qyzylorda',
  'Asia/Qostanay', // https://bugs.chromium.org/p/chromium/issues/detail?id=928068
  'Asia/Aqtobe',
  'Asia/Aqtau',
  'Asia/Atyrau',
  'Asia/Oral',
  'Asia/Beirut',
  'Asia/Colombo',
  'Africa/Monrovia',
  'Europe/Vilnius',
  'Europe/Luxembourg',
  'Europe/Riga',
  'Africa/Tripoli',
  'Africa/Casablanca',
  'Europe/Monaco',
  'Europe/Chisinau',
  'Pacific/Majuro',
  'Pacific/Kwajalein',
  'Asia/Yangon',
  'Asia/Ulaanbaatar',
  'Asia/Hovd',
  'Asia/Choibalsan',
  'Asia/Macau',
  'America/Martinique',
  'Europe/Malta',
  'Indian/Mauritius',
  'Indian/Maldives',
  'America/Mexico_City',
  'America/Cancun',
  'America/Merida',
  'America/Monterrey',
  'America/Matamoros',
  'America/Mazatlan',
  'America/Chihuahua',
  'America/Ojinaga',
  'America/Hermosillo',
  'America/Tijuana',
  'America/Bahia_Banderas',
  'Asia/Kuala_Lumpur',
  'Asia/Kuching',
  'Africa/Maputo',
  'Africa/Windhoek',
  'Pacific/Noumea',
  'Pacific/Norfolk',
  'Africa/Lagos',
  'America/Managua',
  'Europe/Amsterdam',
  'Europe/Oslo',
  'Asia/Kathmandu',
  'Pacific/Nauru',
  'Pacific/Niue',
  'Pacific/Auckland',
  'Pacific/Chatham',
  'America/Panama',
  'America/Lima',
  'Pacific/Tahiti',
  'Pacific/Marquesas',
  'Pacific/Gambier',
  'Pacific/Port_Moresby',
  'Pacific/Bougainville',
  'Asia/Manila',
  'Asia/Karachi',
  'Europe/Warsaw',
  'America/Miquelon',
  'Pacific/Pitcairn',
  'America/Puerto_Rico',
  'Asia/Gaza',
  'Asia/Hebron',
  'Europe/Lisbon',
  'Atlantic/Madeira',
  'Atlantic/Azores',
  'Pacific/Palau',
  'America/Asuncion',
  'Asia/Qatar',
  'Indian/Reunion',
  'Europe/Bucharest',
  'Europe/Belgrade',
  'Europe/Kaliningrad',
  'Europe/Moscow',
  'Europe/Simferopol',
  'Europe/Kirov',
  'Europe/Astrakhan',
  'Europe/Volgograd',
  'Europe/Saratov',
  'Europe/Ulyanovsk',
  'Europe/Samara',
  'Asia/Yekaterinburg',
  'Asia/Omsk',
  'Asia/Novosibirsk',
  'Asia/Barnaul',
  'Asia/Tomsk',
  'Asia/Novokuznetsk',
  'Asia/Krasnoyarsk',
  'Asia/Irkutsk',
  'Asia/Chita',
  'Asia/Yakutsk',
  'Asia/Khandyga',
  'Asia/Vladivostok',
  'Asia/Ust-Nera',
  'Asia/Magadan',
  'Asia/Sakhalin',
  'Asia/Srednekolymsk',
  'Asia/Kamchatka',
  'Asia/Anadyr',
  'Asia/Riyadh',
  'Pacific/Guadalcanal',
  'Indian/Mahe',
  'Africa/Khartoum',
  'Europe/Stockholm',
  'Asia/Singapore',
  'America/Paramaribo',
  'Africa/Juba',
  'Africa/Sao_Tome',
  'America/El_Salvador',
  'Asia/Damascus',
  'America/Grand_Turk',
  'Africa/Ndjamena',
  'Indian/Kerguelen',
  'Asia/Bangkok',
  'Asia/Dushanbe',
  'Pacific/Fakaofo',
  'Asia/Dili',
  'Asia/Ashgabat',
  'Africa/Tunis',
  'Pacific/Tongatapu',
  'Europe/Istanbul',
  'America/Port_of_Spain',
  'Pacific/Funafuti',
  'Asia/Taipei',
  'Europe/Kiev',
  'Europe/Uzhgorod',
  'Europe/Zaporozhye',
  'Pacific/Wake',
  'America/New_York',
  'America/Detroit',
  'America/Kentucky/Louisville',
  'America/Kentucky/Monticello',
  'America/Indiana/Indianapolis',
  'America/Indiana/Vincennes',
  'America/Indiana/Winamac',
  'America/Indiana/Marengo',
  'America/Indiana/Petersburg',
  'America/Indiana/Vevay',
  'America/Chicago',
  'America/Indiana/Tell_City',
  'America/Indiana/Knox',
  'America/Menominee',
  'America/North_Dakota/Center',
  'America/North_Dakota/New_Salem',
  'America/North_Dakota/Beulah',
  'America/Denver',
  'America/Boise',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Juneau',
  'America/Sitka',
  'America/Metlakatla',
  'America/Yakutat',
  'America/Nome',
  'America/Adak',
  'Pacific/Honolulu',
  'America/Montevideo',
  'Asia/Samarkand',
  'Asia/Tashkent',
  'America/Caracas',
  'Asia/Ho_Chi_Minh',
  'Pacific/Efate',
  'Pacific/Wallis',
  'Pacific/Apia',
  'Africa/Johannesburg'
];'use strict';

const {GLib, St, Clutter, GnomeDesktop, Gio } = imports.gi;
const { main, panelMenu, popupMenu } = imports.ui;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

let Clock = {
  config: {
    format24: true,
    showCity: true,
    showTimezone: false
  },
  enable: function () {
    Clock.state = timezones.sort().map(item => {
      return {
        timezone: item,
        lowerTimezone: item.toLowerCase(),
        active: item === 'UTC'
      };
    });

    Clock.schema = Gio.SettingsSchemaSource.new_from_directory(
      Me.dir.get_child('schemas').get_path(),
      Gio.SettingsSchemaSource.get_default(),
      false
    );
    Clock.settings = new Gio.Settings({
      settings_schema: Clock.schema.lookup('org.gnome.shell.extensions.timezones', true)
    });

    Clock.loadSettings();

    let button = new panelMenu.Button(0.50, Me.metadata.name);
    button.set_y_align(Clutter.ActorAlign.CENTER);

    let label = new St.Label({
      text: '...',
      opacity: 150
    });
    button.actor.add_child(label);

    Clock.button = button;
    Clock.label = label;

    Clock.initMenu();
    Clock.updateLabel();

    Clock.SystemClock = new GnomeDesktop.WallClock();
    Clock.signalId = Clock.SystemClock.connect('notify::clock', Clock.updateLabel);

    main.panel.addToStatusArea(`${Me.metadata.name} Indicator`, Clock.button, 1, 'center');
  },
  disable: function () {
    Clock.SystemClock.disconnect(Clock.signalId);
    Clock.button.destroy();
    Clock.saveSettings();
  },
  loadSettings: function () {
    let timezones = Clock.settings.get_value('timezones');
    let timezonesArray = timezones.deep_unpack();
    if (timezonesArray.length > 0) {
      Clock.state.forEach(item => {
        item.active = timezonesArray.indexOf(item.timezone) !== -1;
      });
    }

    let config = Clock.settings.get_value('config');
    let configObj = config.deep_unpack();
    if (Object.keys(configObj).length > 0) {
      for (let key in configObj) {
        Clock.config[key] = configObj[key];
      }
    }
  },
  saveSettings: function () {
    Clock.settings.set_value(
      'timezones',
      new GLib.Variant('as', Clock.state.filter(item => item.active).map(item => item.timezone))
    );

    Clock.settings.set_value('config', new GLib.Variant('a{sb}', Clock.config));
  },
  initMenu: function () {
    Clock.menu = Clock.button.menu;
    Clock.activeMenu = Clock.createScrollableMenuSection();
    Clock.inactiveMenu = Clock.createScrollableMenuSection();
    Clock.configMenu = Clock.createScrollableMenuSection();
    Clock.configMenu.itemActivated = () => {};

    Clock.addConfigSwitch({label: '24 hours format', name: 'format24'});
    Clock.addConfigSwitch({label: 'Show city name', name: 'showCity'});
    Clock.addConfigSwitch({label: 'Show timezone', name: 'showTimezone'});

    let inputFilter = new St.Entry({ width: 300, can_focus: true });
    inputFilter.clutter_text.connect('text-changed', (o) => {
      Clock.hint = o.get_text().toLowerCase();
      Clock.updateInactiveMenu();
    });

    let inputFilterItem = new popupMenu.PopupBaseMenuItem({reactive: false});
    inputFilterItem.actor.add_child(inputFilter);

    Clock.menu.addMenuItem(new popupMenu.PopupSeparatorMenuItem('Active clocks'));
    Clock.menu.addMenuItem(Clock.activeMenu);
    Clock.menu.addMenuItem(new popupMenu.PopupSeparatorMenuItem('Add more clocks'));
    Clock.menu.addMenuItem(inputFilterItem);
    Clock.menu.addMenuItem(Clock.inactiveMenu);
    Clock.menu.addMenuItem(new popupMenu.PopupSeparatorMenuItem('Config'));
    Clock.menu.addMenuItem(Clock.configMenu);

    Clock.menu.connect('open-state-changed', (menu, open) => {
      if (open) {
        inputFilter.set_text('');
        Clock.hint = '';
        Clock.updateMenu();
      }
    });
  },
  addConfigSwitch: function ({label, name}) {
    let configSwitch = new popupMenu.PopupSwitchMenuItem(label, Clock.config[name]);
    configSwitch.connect('toggled', (event, state) => {
      Clock.config[name] = state;
      Clock.saveSettings();
      Clock.updateLabel();
    });
    Clock.configMenu.addMenuItem(configSwitch);
  },
  createScrollableMenuSection: function () {
    let menu = new popupMenu.PopupMenuSection();
    menu.actor = new St.ScrollView({
      style_class: 'popup-menu-content',
      hscrollbar_policy: St.PolicyType.NEVER,
      vscrollbar_policy: St.PolicyType.AUTOMATIC
    });
    menu.actor.add_actor(menu.box);
    return menu;
  },
  updateLabel: function () {
    let text = '';
    Clock.state.forEach(item => text += item.active ? `    ${Clock.getLabelForTimezone({item: item})}` : '');
    text = text.trim();

    if (text.length === 0) {
      text = '...';
    }

    Clock.label.text = text;
  },
  getLabelForTimezone: function ({item, full}) {
    let glibTimezone = GLib.TimeZone.new(item.timezone);
    let now = GLib.DateTime.new_now(glibTimezone);
    let timezoneLabel = full ? item.timezone : Clock.config.showCity ? item.timezone.split('/').pop().replace('_', ' ') : '';
    let offset = full || Clock.config.showTimezone ? ` ${now.format('%Z')} ` : ' ';
    return `${timezoneLabel}${offset}${now.format(Clock.config.format24 ? '%R' : '%l:%M %p')}`;
  },
  updateMenu: function () {
    Clock.updateTimeLabels();
    Clock.updateActiveMenu();
    Clock.updateInactiveMenu();
  },
  updateTimeLabels: function () {
    Clock.state.forEach(item => item.label = Clock.getLabelForTimezone({item: item, full: true}));
  },
  updateActiveMenu: function () {
    let active = String.fromCodePoint(parseInt('2714', 16));
    Clock.activeMenu.removeAll();

    Clock.state.filter(item => item.active).forEach(item => Clock.activeMenu.addAction(
      `${active} ${item.label}`,
      () => Clock.toggleTimezone(item))
    );
  },
  updateInactiveMenu: function () {
    Clock.inactiveMenu.removeAll();
    Clock.state
      .filter(item => !item.active && item.lowerTimezone.indexOf(Clock.hint) !== -1)
      .forEach(item => Clock.inactiveMenu.addAction(
        item.label,
        () => Clock.toggleTimezone(item))
      );
  },
  toggleTimezone: function (item) {
    item.active = !item.active;
    Clock.updateLabel();
    Clock.saveSettings();
  }
};


function init() {
  log(`initializing ${Me.metadata.name} version ${Me.metadata.version}`);
}

function enable() {
  log(`enabling ${Me.metadata.name} version ${Me.metadata.version}`);
  try {
    Clock.enable();
  } catch (error) {
    logError(error);
  }
}

function disable() {
  log(`disabling ${Me.metadata.name} version ${Me.metadata.version}`);
  try {
    Clock.disable();
  } catch (error) {
    logError(error);
  }
}