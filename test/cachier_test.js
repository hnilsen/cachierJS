'use strict';

var preloader = require('../lib/cachier.js');

/**
 ======== A Handy Little Nodeunit Reference ========
 https://github.com/caolan/nodeunit

 Test methods:
 test.expect(numAssertions)
 test.done()
 Test assertions:
 test.ok(value, [message])
 test.equal(actual, expected, [message])
 test.notEqual(actual, expected, [message])
 test.deepEqual(actual, expected, [message])
 test.notDeepEqual(actual, expected, [message])
 test.strictEqual(actual, expected, [message])
 test.notStrictEqual(actual, expected, [message])
 test.throws(block, [error], [message])
 test.doesNotThrow(block, [error], [message])
 test.ifError(value)
 */

exports['preload'] = {
    setUp: function (callback) {
        // setup here
        callback();
    },
    tearDown: function (callback) {
        // clean up
        callback();
    },
    'asserting functions exists in namespace': function (test) {
        test.expect(13);
        // tests here
        test.equal(typeof preloader.preload.init, 'function', 'should be a function');
        test.equal(typeof preloader.preload.loadManifest, 'function', 'should be a function');
        test.equal(typeof preloader.preload.checkManifest, 'function', 'should be a function');
        test.equal(typeof preloader.preload.bootstrapCss, 'function', 'should be a function');
        test.equal(typeof preloader.preload.clear, 'function', 'should be a function');
        test.equal(typeof preloader.preload.loadResource, 'function', 'should be a function');
        test.equal(typeof preloader.preload.getTamperCheckedResource, 'function', 'should be a function');
        test.equal(typeof preloader.preload.onprogress, 'function', 'should be a function');
        test.equal(typeof preloader.preload.oncomplete, 'function', 'should be a function');
        test.equal(typeof preloader.preload.onload, 'function', 'should be a function');
        test.equal(typeof preloader.preload.onstart, 'function', 'should be a function');
        test.equal(typeof preloader.preload.ontamperedresource, 'function', 'should be a function');
        test.notEqual(typeof preloader.preload.nonfunction, 'function', 'should NOT be a function');
        test.done();
    },
    'init should accept parameters and return true': function (test) {
        test.equal(preloader.preload.init({}), true, 'should return true');
        test.throws(
            function () {
                preloader.preload.init()
            },
            Error,
            'no arguments should return TypeError');
        test.done();
    }
};
