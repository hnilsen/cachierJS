'use strict';
var yamd5 = require('../lib/yamd5.js');

exports['YaMD5'] = {
    setUp: function (callback) {
        callback();
    },
    tearDown: function (callback) {
        callback();
    },
    'testing md5 strings': function (test) {
        var tests = [
            // from Appendix 5 of http://www.ietf.org/rfc/rfc1321.txt
            'd41d8cd98f00b204e9800998ecf8427e', '',
            '0cc175b9c0f1b6a831c399e269772661', 'a',
            '900150983cd24fb0d6963f7d28e17f72', 'abc',
            'f96b697d7cb7938d525a2f31aaf161d0', 'message digest',
            'c3fcd3d76192e4007dfb496cca67e13b', 'abcdefghijklmnopqrstuvwxyz',
            'd174ab98d277d9f5a5611c2c9f419d9f', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
            '57edf4a22be3c955ac49da2e2107b67a', '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
            // Unicode strings taken from http://en.wikipedia.org/wiki/List_of_pangrams
            // Then I ran them through md5sum
            'b69cf1b7b6888f1f8928e2e2b74da8bc', 'Voix ambiguë d\'un cœur qui au zéphyr préfère les jattes de kiwis',
            'd1ea7e7792c50a0386b1064ab220da0c', 'Жълтата дюля беше щастлива, че пухът, който цъфна, замръзна като гьон',
            'b6071a4fc17e44a7d0246e5b4c939a70', 'Hyvän lorun sangen pieneksi hyödyksi jäi suomen kirjaimet',
            '47ee7efa5573066d43ab5f9ae1830cf8', 'Ταχίστη αλώπηξ βαφής ψημένη γη, δρασκελίζει υπέρ νωθρού κυνός',
            '7e626d44cd9610f2fef198156730e7d9', '色は匂へど 散りぬるを 我が世誰ぞ 常ならむ 有為の奥山 今日越えて 浅き夢見じ 酔ひもせず',
            'ae5f9c6b87f4e50e68eb20c10e21733a', 'นายสังฆภัณฑ์ เฮงพิทักษ์ฝั่ง ผู้เฒ่าซึ่งมีอาชีพเป็นฅนขายฃวด ถูกตำรวจปฏิบัติการจับฟ้องศาล ฐานลักนาฬิกาคุณหญิงฉัตรชฎา ฌานสมาธิ'
        ];

        for(var i = 0; i < tests.length; i=i+2) {
            test.equal(yamd5.YaMD5.hashStr(tests[i+1]), tests[i], 'should match');
        }
        test.done();
    }
}