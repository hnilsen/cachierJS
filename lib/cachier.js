/*
 * cachierJS
 * https://github.com/SparebankenVest/cachierJS
 *
 * Copyright (c) 2015 Sparebanken Vest
 * Licensed under the MIT license.
 */
Function.prototype.bind = Function.prototype.bind || function (thisp) {
    'use strict';
    var fn = this;
    return function () {
        return fn.apply(thisp, arguments);
    };
};

(function (exports) {
    'use strict';

    var loadStates = {
        ADD: 1,             // 00001
        NOUPDATE: 2,        // 00010
        REPLACE: 4,         // 00100
        REMOVE: 8,          // 01000
        TAMPEREDREMOVE: 16  // 10000
    };

    var config = {
        prefix: "__ls__",
        debug: false,
        hashLength: 32,
        hashCheck: /^[0-9a-f]{32}$/i, // 32 character hex (lower case)
        outputToConsole: console.log.bind(console), // jshint ignore:line
        outputError: console.error.bind(console), // jshint ignore:line
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

    var output = function (text) {
        if (config.debug) {
            config.outputToConsole(text);
        }
    };

    var error = function (text) {
        setTimeout(function () {
            throw new Error(text);
        }, 0); // setTimeout doesn't interrupt execution
    };

    var index = 0, completeIndex = 0;
    var total = 0, completeTotal = 0;
    var masterCallback;
    var boot;
    var hasCompleted = false;

    var jsonparsesum = 0, hashsum = 0, totaltime = 0;

    var noupdateQ = [],
        replaceQ = [],
        removeQ = [],
        addQ = [],
        tamperQ = [];

    //noinspection UnnecessaryLocalVariableJS
    var lsImpl = {
        replace: function (oldKey, key, responseText, messageHandler) {
            this.remove(oldKey);
            this.set(key, responseText, messageHandler, loadStates.REPLACE);
        },
        remove: function (key, messageHandler, overrideState) {
            var state = overrideState !== undefined ? overrideState : loadStates.REMOVE;
            var success = false;
            try {
                var value = localStorage[config.prefix + key];
                if (value !== null && value !== undefined) {
                    localStorage.removeItem(config.prefix + key);
                    success = true;
                } else {
                    //noinspection ExceptionCaughtLocallyJS
                    throw new Error("Preload remove: Couldn't find " + key + ", can't be removed");
                }
            } catch (e) {
                error(e.stack);
            }
            if (messageHandler) {
                messageHandler(key, state, success);
            }
        },
        clear: function () {
            var ls = this.getAll();

            for (var ind in ls) {
                if (ls.hasOwnProperty(ind)) {
                    this.remove(ls[ind]);
                }
            }
        },
        removeTampered: function (key) {
            try {
                var value = localStorage[config.prefix + key];
                if (value !== null && value !== undefined) {
                    localStorage.removeItem(config.prefix + key);
                } else {
                    //noinspection ExceptionCaughtLocallyJS
                    throw new Error("Preload removeTampered: Couldn't find " + key + ", can't be removed");
                }
            } catch (e) {
                error(e.stack);
            }
        },
        get: function (key, handler, messageHandler) {
            var success = false;
            var value = null;
            try {
                value = localStorage[config.prefix + key];
                if (value !== undefined && value !== null && value.length > 0) {
                    value = JSON.parse(value);

                    if (handler) {
                        handler(value);
                    }

                    success = true;
                } else {
                    //noinspection ExceptionCaughtLocallyJS
                    throw new Error("Preload get: Result from " + key + " is null or undefined");
                }
            } catch (e) {
                error(e.stack);
            }
            if (messageHandler) {
                messageHandler(key, undefined, success);
            }
            if (!handler) {
                return value;
            }
            return null;
        },
        getAll: function () {
            var keys = [];
            for (var key in localStorage) {
                //noinspection JSUnfilteredForInLoop
                if (key.indexOf(config.prefix) > -1) {
                    //noinspection JSUnfilteredForInLoop
                    keys.push(key.substring(config.prefix.length));
                }
            }
            return keys;
        },
        set: function (key, entry, messageHandler, overrideState) {
            var state = overrideState !== undefined ? overrideState : loadStates.ADD;
            var success = false;
            try {
                if (entry) {
                    localStorage[config.prefix + key] = JSON.stringify(entry);
                    success = true;
                } else {
                    //noinspection ExceptionCaughtLocallyJS
                    throw new Error("Preload set: Can't set key " + key + " to undefined or null");
                }
            } catch (e) {
                error(e.stack);
            }
            if (messageHandler) {
                messageHandler(key, state, success);
            }
        },
        hasKey: function (match) {
            var ls = this.getAll();
            for (var ind in ls) {
                if(ls.hasOwnProperty(ind)) {
                    var key = ls[ind];
                    // TODO Jasmine test is needed for this; path /test can give a match on /testing
                    if (key.indexOf(match) > -1) {
                        return true;
                    }
                }
            }
            return false;
        },
        hasPartialKey: function (url) {
            var ls = this.getAll();

            if (url.substring(url.length) === "/") {
                url = url.substring(0, url.length - 1); // strip trailing slash
            }
            for (var i = 0; i < ls.length; i++) {
                var key = ls[i].substring(0, ls[i].lastIndexOf("_"));
                var hash = ls[i].substring(key.length + 1);

                if (key.substring(key.length) === "/") {
                    key = key.substring(0, key.length - 1); // strip trailing slash
                }
                if (key === url && hash.length === config.hashLength) {
                    return ls[i];
                }
            }
            return null;
        },
        hasHash: function (url) {
            var hash = url.lastIndexOf("_") > -1 ? url.substring(url.lastIndexOf("_") + 1) : "";
            return config.hashCheck.test(hash);
        },
        isTampered: function (key) {
            // return true for tamper, false for untampered
            var performTamperCheckForThisFile = false;
            if (config.tamperCheckFileTypes === undefined) { // if we have specified file types for tamper checking (undefined means "all")
                performTamperCheckForThisFile = true;
            } else {
                var fileTypes = config.tamperCheckFileTypes;
                for (var i = 0; i < fileTypes.length; i++) {
                    if (key.indexOf(fileTypes[i]) > -1) {
                        performTamperCheckForThisFile = true; // found a match - this file should be checked for tampering
                        break;
                    }
                }
            }

            if (performTamperCheckForThisFile) {
                var prefixedKey = key.indexOf(config.prefix) > -1 ? key : config.prefix + key;
                var measure = new Date().getTime();
                var tamperCheck;
                try {
                    tamperCheck = JSON.parse(localStorage[prefixedKey]); // bruke storage.get i stedet?
                } catch (e) {
                    tamperCheck = "";
                }
                jsonparsesum += (new Date().getTime() - measure);

                measure = new Date().getTime();
                var fileHash = config.tamperChecker(tamperCheck);
                if (fileHash === prefixedKey.substring(prefixedKey.lastIndexOf("_") + 1)) {
                    hashsum += (new Date().getTime() - measure);
                    return false; // tampering not detected, report untampered
                } else {
                    return fileHash; // tamper detected!
                }
            } else {
                return false; // not checking this file, report untampered
            }
        },

        getTamperCheckedResource: function (url) {
            if (this.hasHash(url)) { // has full key
                if (this.hasKey(url)) {
                    if (config.doTamperCheckOnLoad === true && this.isTampered(url)) {
                        return undefined; // is tampered
                    }
                    return this.get(url);
                }
            } else { // has partial key
                var key = this.hasPartialKey(url);
                if (key) {
                    if (config.doTamperCheckOnLoad === true && this.isTampered(key)) {
                        return undefined; // is tampered
                    }
                    return this.get(key);
                }
            }
            return undefined;
        }
    };

    var storage = lsImpl;

    var reset = function () {
        index = completeIndex = total = completeTotal = 0;
        masterCallback = undefined;
        boot = undefined;

        jsonparsesum = 0;
        hashsum = 0;
        totaltime = 0;

        noupdateQ = [];
        replaceQ = [];
        removeQ = [];
        addQ = [];
        tamperQ = [];
    };

    var preloadCompleted = function () {
        output("[LocalStorage loading complete]");

        if (boot) {
            output("[Booting up " + boot + "]");

            ls.loadResource(boot);
            hasCompleted = true;
        }

        if (masterCallback) {
            masterCallback(true);
        }

        output("* * * * * * PRELOADER FINISHED IN " + (new Date().getTime() - totaltime) + "ms");
        reset();
        ls.oncomplete();
    };

    var manifestFeed = function (key, state, success) {
        /**
         1  = doesn't exist, needs to be inserted
         2  = exists, doesn't need update
         4  = exists, but needs update
         8  = exists, but should be removed
         16 = tampered
         */
        completeIndex++;
        if (config.progressStates & state && ls.onprogress && index < total) { // jshint ignore:line
            index++;

            var message = "[" + index + " of " + total;
            switch (state) {
                case loadStates.ADD:
                    message += " ADD";
                    message += success ? " SUCCESS" : " FAILED";
                    break;
                case loadStates.NOUPDATE:
                    message += " NOUPDATE";
                    break;
                case loadStates.REPLACE:
                    message += " REPLACE";
                    message += success ? " SUCCESS" : " FAILED";
                    break;
                case loadStates.REMOVE:
                    message += " REMOVE";
                    message += success ? " SUCCESS" : " FAILED";
                    break;
                case loadStates.TAMPEREDREMOVE:
                    message += " TAMPER FORCE REMOVE";
                    message += success ? " SUCCESS" : " FAILED";
                    break;
                default:
                    message += " UNKNOWN";
                    break;
            }

            message += " " + key + "]";

            output(message);
            ls.onprogress({total: total, index: index, key: key, loadstate: state, success: success});
        }

        if (completeIndex === completeTotal && !hasCompleted) {
            preloadCompleted();
        }
    };

    var removeFromArray = function (array, key) {
        var index = array.indexOf(key);
        if (index > -1) {
            array.splice(index, 1); // remove if it exists
        }
        return array;
    };

    var getModule = function (url, callback) {
        var xhr = new XMLHttpRequest();

        var doCacheBusting = false;

        if (config) {
            if (config.cachebustFileTypes === undefined) {
                doCacheBusting = true;
            } else if (config.cachebustFileTypes.length > 0) {
                for (var i = 0; i < config.cachebustFileTypes.length; i++) {
                    if (url.indexOf(config.cachebustFileTypes[i]) > -1) {
                        doCacheBusting = true;
                    }
                }
            }
        }

        xhr.open("GET", url, true);
        xhr.timeout = config.resourceTimeout;

        if (doCacheBusting) {
            var bustdate = new Date();
            bustdate.setFullYear(new Date().getFullYear() - 1);
            xhr.setRequestHeader("Cache-Control", "no-cache");
            xhr.setRequestHeader("If-Modified-Since", bustdate.toUTCString());
            xhr.setRequestHeader("If-None-Match", "\"" + Math.abs(Math.random() * 1e9 | 0).toString() + "\""); // jshint ignore:line
            xhr.setRequestHeader("Pragma", "no-cache");
        }
        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    callback(xhr.responseText);
                } else {
                    callback(null);
                }
            }
        };

        xhr.ontimeout = function () {
            xhr.abort();
        };

        xhr.send(null);
    };

    var setFileContentToLocalStorage = function (lsKey, url, messageHandler) {
        getModule(url, function (responseText) {
            if (responseText) {
                storage.set(lsKey, responseText, messageHandler);
            } else {
                // empty/null/undefined responses should report a failed state to the preloader
                manifestFeed(lsKey, loadStates.ADD, false);
            }
        });
    };

    var replaceFileContentToLocalStorage = function (oldKey, lsKey, url, messageHandler) {
        getModule(url, function (responseText) {
            if (responseText) {
                storage.replace(oldKey, lsKey, responseText, messageHandler);
            } else {
                // empty/null/undefined responses should report a failed state to the preloader
                manifestFeed(lsKey, loadStates.REPLACE, false);
            }
        });
    };

    // use globalEval to evaluate files, inspiration taken from jQuery
    var globalEval = function (expr) {
        // jshint evil:true
        if (expr && expr.length > 0) {
            (window.execScript || function (expr) {
                window["eval"].call(window, expr);
            })(expr);
            return true;
        } else {
            return false;
        }
    };

    var loadResource = function (url) {
        var retVal = false;
        var file = storage.getTamperCheckedResource(url);
        if (storage.hasHash(url)) {
            url = url.substring(0, url.length - 33);
        }
        if (file && file.length > 0) {
            retVal = globalEval(file + "//# sourceURL=" + location.protocol + "//" + location.host + "/" + url);
            //noinspection JSUnusedAssignment
            file = undefined;
        }
        return retVal;
    };

    var ls = {
        init: function (myconfig) {
            if (myconfig.prefix !== undefined) {
                config.prefix = myconfig.prefix;
            }
            if (myconfig.debug !== undefined) {
                config.debug = myconfig.debug ? true : false;
            }
            if (myconfig.outputToConsole !== undefined) {
                config.outputToConsole = myconfig.outputToConsole;
            }
            if (myconfig.outputError !== undefined) {
                config.outputError = myconfig.outputError;
            }
            if (myconfig.progressStates !== undefined) {
                config.progressStates = myconfig.progressStates;
            }
            if (myconfig.hashCheck !== undefined) {
                config.hashCheck = myconfig.hashCheck;
            }
            if (myconfig.hashLength !== undefined) {
                config.hashLength = myconfig.hashLength;
            }
            if (myconfig.cachebustFileTypes !== undefined) {
                config.cachebustFileTypes = myconfig.cachebustFileTypes;
            }
            if (myconfig.tamperCheckFileTypes !== undefined) {
                config.tamperCheckFileTypes = myconfig.tamperCheckFileTypes;
            }
            if (myconfig.doTamperCheckOnLoad !== undefined) {
                config.doTamperCheckOnLoad = myconfig.doTamperCheckOnLoad;
            }
            if (myconfig.doTamperCheckOnInit !== undefined) {
                config.doTamperCheckOnInit = myconfig.doTamperCheckOnInit;
            }
            if (myconfig.tamperChecker !== undefined) {
                config.tamperChecker = myconfig.tamperChecker;
            }
            if (myconfig.resourceTimeout !== undefined) {
                config.resourceTimeout = myconfig.resourceTimeout;
            }

            return true;
        },

        loadManifest: function (url, callback) {
            totaltime = new Date().getTime();
            ls.onload();
            getModule(url, function (responseText) {
                if (!responseText) {
                    responseText = "[]";
                }
                ls.checkManifest(JSON.parse(responseText), callback);
            });
        },

        checkManifest: function (json, callback) {
            if (callback) {
                masterCallback = callback;
            }

            /**
             * if the manifest is empty, trigger the complete callback and jump out
             */
            if (json.length === 0) {
                storage.clear(); // remove all objects if the manifest is empty or erroneous
                preloadCompleted();
                return;
            }

            var lsItems = storage.getAll(), lsItem, itemKey;
            var i, url, hash, key, newKey, oldKey;

            /**
             * tampering control on localStorage
             *  - remove tampered files, report status later
             */
            if (config.doTamperCheckOnInit === true) {
                for (itemKey in lsItems) {
                    if(lsItems.hasOwnProperty(itemKey)) {
                        lsItem = lsItems[itemKey];
                        var tamperHash = storage.isTampered(lsItem);
                        if (tamperHash) {
                            tamperQ.push({key: lsItem, tamperHash: tamperHash});
                            storage.removeTampered(lsItem);
                        }
                    }
                }
            }

            lsItems = storage.getAll();

            for (i = 0; i < json.length; i++) {
                url = json[i].url;
                hash = json[i].hash;
                key = url + "_" + hash;

                // file to boot
                if (json[i].boot) {
                    boot = key;
                }

                // noupdate quene
                if (storage.hasKey(key, lsItems)) {
                    noupdateQ.push({key: key});
                    lsItems = removeFromArray(lsItems, key);
                    continue;
                }

                // replace quene
                if (lsItems.length > 0) {
                    var partialKey = storage.hasPartialKey(url);
                    if (partialKey && partialKey.indexOf("_") > -1) {
                        var item = [partialKey.substring(0, partialKey.lastIndexOf("_")), partialKey.substring(partialKey.lastIndexOf("_") + 1)];
                        if (item[1].length) {
                            if (item[1] !== hash) { // file needs to be replaced
                                if (url && item[1]) {
                                    oldKey = url + "_" + item[1];
                                    replaceQ.push({oldKey: oldKey, key: key, url: url});
                                    lsItems = removeFromArray(lsItems, oldKey);
                                    continue;
                                }
                            }
                        }
                    }
                }
                addQ.push({key: key, url: url}); // add queue (anything that makes it here will be added)
            }


            // clean up (remove files not listed in manifest)
            for (itemKey in lsItems) {
                if(lsItems.hasOwnProperty(itemKey)) {
                    lsItem = lsItems[itemKey];
                    removeQ.push({key: lsItem});
                }
            }

            completeTotal = noupdateQ.length + replaceQ.length + addQ.length + removeQ.length + tamperQ.length;
            //jshint bitwise:false
            total = ((config.progressStates & loadStates.NOUPDATE) ? noupdateQ.length : 0) +
                    ((config.progressStates & loadStates.REPLACE) ? replaceQ.length : 0) +
                    ((config.progressStates & loadStates.ADD) ? addQ.length : 0) +
                    ((config.progressStates & loadStates.REMOVE) ? removeQ.length : 0);
            //jshint bitwise:true
            ls.onstart(total);

            // tampered files reporting (removal done before)
            for (i = 0; i < tamperQ.length; i++) {
                ls.ontamperedresource(tamperQ[i].key, tamperQ[i].tamperHash);
                manifestFeed(tamperQ[i].key, loadStates.TAMPEREDREMOVE, true);
            }

            // replace files
            for (i = 0; i < replaceQ.length; i++) {
                oldKey = replaceQ[i].oldKey;
                newKey = replaceQ[i].key;
                url = replaceQ[i].url;
                replaceFileContentToLocalStorage(oldKey, newKey, url, manifestFeed);
            }

            // add files
            for (i = 0; i < addQ.length; i++) {
                key = addQ[i].key;
                url = addQ[i].url;
                setFileContentToLocalStorage(key, url, manifestFeed);
            }

            // remove files
            for (i = 0; i < removeQ.length; i++) {
                key = removeQ[i].key;
                storage.remove(key, manifestFeed);
            }

            // noupdate statements
            for (i = 0; i < noupdateQ.length; i++) {
                key = noupdateQ[i].key;
                manifestFeed(key, loadStates.NOUPDATE, true);
            }
        },

        bootstrapCss: function (url, optId) {
            if (!document.getElementById(url)) {
                var key = storage.hasPartialKey(url);
                if (key) {
                    storage.get(key, function (value) {
                        var style = document.createElement('style');
                        if (optId) {
                            style.id = optId;
                        } else {
                            style.id = url;
                        }
                        style.type = 'text/css';
                        style.innerHTML = value;
                        style.dontRemove = true; // Så de ikke fjernes fra navkontroller

                        document.getElementsByTagName('head')[0].appendChild(style);
                    });
                } else {
                    var link = document.createElement('link');
                    link.id = url;
                    link.rel = 'stylesheet';
                    link.type = 'text/css';
                    link.media = 'all';
                    link.setAttribute('href', url);
                    link.dontRemove = true; // Saa de ikke fjernes i NavigationController

                    document.getElementsByTagName('head')[0].appendChild(link);
                }
            }
        },

        clear: function () {
            storage.clear();
        },

        // returns true if successful, false if unsuccessful
        loadResource: function (url) {
            return loadResource(url);
        },

        getTamperCheckedResource: function (url) {
            return storage.getTamperCheckedResource(url);
        },

        /**
         * Reports progress according to the processState in config
         * i.e. if only ADD or REPLACE should be reported the index and total will
         * be affected
         *
         * e is an object
         * { total: int, index: int, key: string, loadstate: int, success: bool }
         */
        onprogress: function (e) { },

        /**
         * When preloader reports completed
         */
        oncomplete: function () { },

        /**
         * On loading of preloader, before manifest is loaded
         */
        onload: function () { },

        /**
         * When manifest has been loaded, and preloader starts to sync items
         */
        onstart: function (total) { },

        /**
         * If a file is tampered this function can be used to log
         */
        ontamperedresource: function (resource, tamperHash) { }
    };

    if (typeof exports === 'object') {
        exports.preload = ls;
    }
    return ls;
}(typeof exports === 'object' && exports || this));