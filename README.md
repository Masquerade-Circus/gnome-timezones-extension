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
    - [Yarn](#yarn)
    - [Scripts](#scripts)
  - [Legal](#legal)

## How to use

- Click on a clock to make it active. 
- Click on an active clock to deactivate it. 
- You can search/filter for a timezone using the input field.
- [Configure it](#configuration) as you wish.

![Gnome Timezones extension](/screenshot.jpg)

## Configuration

- **24 hours format**: Toggle between 24 and 12 hours format. Defaults to 24.
- **Show city name**: Controls if in the clock shows the city name before the time. Defaults to true.
- **Show timezone**: Shows the timezone before the time and after the City name if it is shown. Defaults to false.
- **Clear clocks**: It will deactivate all current active clocks. In case you can't remove a clock, you can use this button to clear all clocks.

## Contributing

-   Use prettify and eslint to lint your code.
-   Update the readme with an example if you add or change any functionality.

### Installation
```bash
$ cd ~/.local/share/gnome-shell/extensions/
$ git clone git@github.com:Masquerade-Circus/gnome-timezones-extension.git timezones@masquerade-circus.net
```

### Yarn  
This extension use [yarn](https://yarnpkg.com/) as its main ally. So use the `yarn` command to install dependencies and run the scripts.

### Scripts  
Use the next scripts to easy the developing time: 

- `yarn dev:source`: Use rollup to watch for changes and rebuild the extension.js file.
- `yarn watch-log`: Keeps watching the journalctl gnome shell log. 
- `yarn enable`: To enable the extension.
- `yarn disable`: To disable the extension.
- `yarn compile`: To compile the settings schemas.
- `yarn build`: This build the source, compiles the schemas and makes the distributable zip file.

## Legal

Author: [Masquerade Circus](http://masquerade-circus.net). License [Apache-2.0](https://opensource.org/licenses/Apache-2.0)