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

describe("preloader manifest with four files, one tampered", function() {
    var server;
    var firstRun = true;
    var json = [{"url": "/file1.html", "hash": "bd01856bfd2065d0d1ee20c03bd3a9af"}, {"url": "/file2.html", "hash": "273604bfeef7126abe1f9bff1e45126c"}, {"url": "/file3.html", "hash": "113f6696d140c167070bcc5e24791f35" }, {"url": "/file4.html", "hash": "c474a02b4b89880c88f06bb48c362cda"}];
    var replaceJson = [{"url": "/file1.html", "hash": "abcdefabcdefabcdefabcdefabcdefab"}, {"url": "/file2.html", "hash": "273604bfeef7126abe1f9bff1e45126c"}, {"url": "/file3.html", "hash": "113f6696d140c167070bcc5e24791f35" }, {"url": "/file4.html", "hash": "c474a02b4b89880c88f06bb48c362cda"}];
    var preloader = preload;
    var filesInLocalStorage = [
        "_test2_/file1.html_bd01856bfd2065d0d1ee20c03bd3a9af",
        "_test2_/file2.html_273604bfeef7126abe1f9bff1e45126c",
        "_test2_/file3.html_113f6696d140c167070bcc5e24791f35",
        "_test2_/file4.html_c474a02b4b89880c88f06bb48c362cda"
    ];

    beforeEach(function () {
        var preloadConfig = {
            prefix: '_test2_',
            debug: true,
            progressStates: 1+2+4+8+16
        };
        preloader.init(preloadConfig);
/*
        preloader.ontamperedresource = function(url, hash) {
            console.log("TAMPER ON " + url + ", WHICH HAS WITH HASH " + hash);
        };
*/

        spyOn(preloader, "ontamperedresource");

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
        for(var i = 0; i < filesInLocalStorage.length; i++) {
            expect(localStorage[filesInLocalStorage[i]]).toBe(undefined);
        }
    });

    it("should check manifest and download file", function() {
        server.respondWith('GET', "/file1.html", [ 200, {'Content-type': 'application/json'}, 'file1.txt' ]);
        server.respondWith('GET', "/file2.html", [ 200, {'Content-type': 'application/json'}, 'file2.txt' ]);
        server.respondWith('GET', "/file3.html", [ 200, {'Content-type': 'application/json'}, 'file3.txt' ]);
        server.respondWith('GET', "/file4.html", [ 200, {'Content-type': 'application/json'}, 'file4.txt' ]);
        preloader.checkManifest(json);
        server.respond();
    });

    it("should now have the file in localStorage", function() {
//        var fileInLocalStorage = localStorage["_test_/file1.html_bd01856bfd2065d0d1ee20c03bd3a9af"];
        expect(localStorage[filesInLocalStorage[0]]).toBe('"file1.txt"');
        expect(localStorage[filesInLocalStorage[1]]).toBe('"file2.txt"');
        expect(localStorage[filesInLocalStorage[2]]).toBe('"file3.txt"');
        expect(localStorage[filesInLocalStorage[3]]).toBe('"file4.txt"');
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
        expect(preloader.ontamperedresource).toHaveBeenCalledWith("/file1.html_abcdefabcdefabcdefabcdefabcdefab", "bd01856bfd2065d0d1ee20c03bd3a9af");
    });
});