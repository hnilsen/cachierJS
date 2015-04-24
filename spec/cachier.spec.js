

describe("preloader init", function () {
    it("should return true", function () {
        expect(preload.init({})).toBe(true);
       // expect(false).toBe(true);

    });
    it("should fail when not given a config", function () {
        expect(function() {
            preload.init()
        }).toThrowError();
    });
});

describe("preloader manifest with one file", function() {
    var server;
    var firstRun = true;
    var json = [{"url": "/file1.html", "hash": "bd01856bfd2065d0d1ee20c03bd3a9af"}]; //, {"url": "/file2.html", "hash": "273604bfeef7126abe1f9bff1e45126c"}, {"url": "/file3.html", "hash": "113f6696d140c167070bcc5e24791f35" }, {"url": "/file4.html", "hash": "c474a02b4b89880c88f06bb48c362cda"}];
    var replaceJson = [{"url": "/file1.html", "hash": "abcdefabcdefabcdefabcdefabcdefab"}]; //, {"url": "/file2.html", "hash": "273604bfeef7126abe1f9bff1e45126c"}, {"url": "/file3.html", "hash": "113f6696d140c167070bcc5e24791f35" }, {"url": "/file4.html", "hash": "c474a02b4b89880c88f06bb48c362cda"}];
    var preloader = preload;

    beforeEach(function () {
        var preloadConfig = {
            prefix: '_test_',
            debug: true,
            progressStates: 1+2+4+8+16
        };
        preloader.init(preloadConfig);

        if(firstRun) {
            preloader.clear();
            firstRun = false;
        }

        server = sinon.fakeServer.create();
    });

    afterEach(function() {
        server.restore();
    });

    it("should not have the file in localStorage", function() {
        var fileInLocalStorage = localStorage["_test_/file1.html_bd01856bfd2065d0d1ee20c03bd3a9af"];
        expect(fileInLocalStorage).toBe(undefined);
    });

    it("should check manifest and download file", function() {
        server.respondWith('GET', "/file1.html", [ 200, {'Content-type': 'application/json'}, 'file1.txt' ]);
        preloader.checkManifest(json);
        server.respond();
    });

    it("should now have the file in localStorage", function() {
        var fileInLocalStorage = localStorage["_test_/file1.html_bd01856bfd2065d0d1ee20c03bd3a9af"];
        expect(fileInLocalStorage).toBe('"file1.txt"');
    });

    it("should have the file in localStorage on second run", function() {
        preloader.checkManifest(json);
    });

    it("should be replaced by a file with a different hash", function() {
        server.respondWith('GET', "/file1.html", [ 200, {'Content-type': 'application/json'}, 'file1.txt' ]);
        preloader.checkManifest(replaceJson);
        server.respond();
    });

    it("should trigger tamper on this file", function() {
        preloader.checkManifest(replaceJson);
    });
});