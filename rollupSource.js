let rollup = require('rollup');
let commonjs = require('rollup-plugin-commonjs');
let nodeResolve = require('rollup-plugin-node-resolve');
let includepaths = require('rollup-plugin-includepaths');
let filesize = require('rollup-plugin-filesize');
let progress = require('rollup-plugin-progress');
let {sizeSnapshot } = require('rollup-plugin-size-snapshot');
let buble = require('@rollup/plugin-buble');
let json = require('@rollup/plugin-json');

let inputOptions = {
  input: './lib/index.js',
  plugins: [
    json(),
    progress({ clearLine: false }),
    includepaths({ paths: ['./lib', './node_modules'] }),
    nodeResolve({
      jsnext: true,
      main: true,
      browser: true
    }),
    buble({ jsx: 'v', transforms: {asyncAwait: false}, target: { chrome: 71, firefox: 64, safari: 10, node: 8.7 } }),
    commonjs({
      include: ['./node_modules/**'], // Default: undefined
      // if false then skip sourceMap generation for CommonJS modules
      sourceMap: true // Default: true
    }),
    filesize(),
    sizeSnapshot()
  ],
  cache: undefined,
  treeshake: false
};

let outputOptions = {
  file: './extension.js',
  format: 'esm',
  sourcemap: false,
  compact: true
};

if (process.env.NODE_ENV === 'production') {
  rollup
    .rollup(inputOptions)
    .then((bundle) => bundle.write(outputOptions))
    .then(() => console.log('Bundle finished.'));
}

if (process.env.NODE_ENV !== 'production') {
  inputOptions.output = outputOptions;
  inputOptions.watch = {
    include: ['./lib/**'],
    chokidar: false
  };

  const watch = rollup.watch(inputOptions);
  const stderr = console.error.bind(console);

  watch.on('event', (event) => {
    switch (event.code) {
      case 'START':
        stderr('checking rollup-watch version...');
        break;
      case 'BUNDLE_START':
        stderr(`bundling ${outputOptions.file}...`);
        break;
      case 'BUNDLE_END':
        stderr(`${outputOptions.file} bundled in ${event.duration}ms.`);
        break;
      case 'ERROR':
        stderr(`error: ${event.error}`);
        break;
      case 'FATAL':
        stderr(`error: ${event.error}`);
        break;
      case 'END':
        stderr(`Watching for changes...`);
        break;
      default:
        stderr(`unknown event: ${event}`);
    }
  });
}
