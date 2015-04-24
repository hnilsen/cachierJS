# CachierJS

[min]: https://raw.github.com/SparebankenVest/cachierJS/master/dist/cachier-1.0.0.min.js
[max]: https://raw.github.com/SparebankenVest/cachierJS/master/dist/cachier-1.0.0.js

Javascript preloader for Javascript, CSS and HTML (Application Cache alternative)

## Getting Started

### In the browser
Download the [production version][min] or the [development version][max].

In your web page (example):

```html
<script src="dist/cachier-1.0.0.min.js"></script>
<script>
var preloadConfig = {
    prefix: '__myprefix__',
    debug: true,
    progressStates: 1+2+4+8+16
}

preload.init(preloadConfig); // initialize with config
preload.loadManifest('/manifest.json'); // load manifest for awesome stuff
</script>
```

## Documentation
CachierJS is a complete offline cache preloading solution for all your html, css and javascript. It uses MD5 as both version
control and integrity checking. It can integrity (tamper) check files on initialization and/or on loading of files (eval).

The preloader relies on a ```manifest``` that describes the resources it should preload in the following format:
```javascript
[
    {
    "url": "/index.html",
    "hash": "bd01856bfd2065d0d1ee20c03bd3a9af"
    },
    {
    "url": "/myscript.js",
    "hash": "273604bfeef7126abe1f9bff1e45126c"
    }
]
```

The preloader has a few options which can be overridden:
```javascript
   var config = {
        prefix: "__ls__",
        debug: false,
        hashLength: 32,
        hashCheck: /^[0-9a-f]{32}$/i, // 32 character hex (lower case)
        outputToConsole: console.log.bind(console),
        outputError: console.error.bind(console),
        cachebustFileTypes: undefined, // these files should be cache-busted, undefined means all, can be specified with an array [".js",".css"]
        tamperCheckFileTypes: undefined, // undefined means all, can be specified with an array [".js",".css"]
        progressStates: loadStates.ADD + loadStates.NOUPDATE + loadStates.REPLACE + loadStates.REMOVE + loadStates.TAMPEREDREMOVE,
        doTamperCheckOnLoad: false, // perform tamper checking on dynamic script/css/page load
        doTamperCheckOnInit: true, // perform tamper checking when preloader is initialized
        tamperChecker: function (file) { // included YaMD5 hasher can be overwritten by a different hasher
            return window.YaMD5.hashStr(file);
        },
        resourceTimeout: 30000
    };
```

The config initializes the preloader by running ```preload.init(config);```.

To start preloading, there are two options;
 - preload.loadManifest(url);
 - preload.checkManifest(json);

loadManifest(url) fetches the manifest online, and pushes it into checkManifest afterwards. If you do not have an online
manifest, you can simply push the json directly into preload.checkManifest(json);

## Examples
_(Coming soon)_

## Building

```
npm install
```

```
grunt
```

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

_Also, please don't edit files in the "dist" subdirectory as they are generated via Grunt. You'll find source code in the "lib" subdirectory!_

## Release History
2015-04-24 - v1.0.0 - Initial release

## TODO
* Proper AMD
* Add more testing
* Create wiki page for preloader config options

## License
Copyright (c) 2015 Sparebanken Vest
Licensed under the MIT license.
