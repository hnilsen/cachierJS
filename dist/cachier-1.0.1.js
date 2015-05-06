/*! cachier - v1.0.1 - 2015-05-06
* https://github.com/SparebankenVest/cachierJS
* Copyright (c) 2015 Sparebanken Vest <opensource@spv.no>; Licensed MIT */
// Original can be found at:
//   https://bitbucket.org/lindenlab/llsd
// Modifications by Joshua Bell inexorabletash@gmail.com
//   https://github.com/inexorabletash/polyfill

// ES3/ES5 implementation of the Krhonos Typed Array Specification
//   Ref: http://www.khronos.org/registry/typedarray/specs/latest/
//   Date: 2011-02-01
//
// Variations:
//  * Allows typed_array.get/set() as alias for subscripts (typed_array[])
//  * Gradually migrating structure from Khronos spec to ES6 spec
(function(global) {
    'use strict';
    var undefined = (void 0); // Paranoia

    // Beyond this value, index getters/setters (i.e. array[0], array[1]) are so slow to
    // create, and consume so much memory, that the browser appears frozen.
    var MAX_ARRAY_LENGTH = 1e5;

    // Approximations of internal ECMAScript conversion functions
    function Type(v) {
        switch(typeof v) {
            case 'undefined': return 'undefined';
            case 'boolean': return 'boolean';
            case 'number': return 'number';
            case 'string': return 'string';
            default: return v === null ? 'null' : 'object';
        }
    }

    // Class returns internal [[Class]] property, used to avoid cross-frame instanceof issues:
    function Class(v) { return Object.prototype.toString.call(v).replace(/^\[object *|\]$/g, ''); }
    function IsCallable(o) { return typeof o === 'function'; }
    function ToObject(v) {
        if (v === null || v === undefined) throw TypeError();
        return Object(v);
    }
    function ToInt32(v) { return v >> 0; }
    function ToUint32(v) { return v >>> 0; }

    // Snapshot intrinsics
    var LN2 = Math.LN2,
        abs = Math.abs,
        floor = Math.floor,
        log = Math.log,
        max = Math.max,
        min = Math.min,
        pow = Math.pow,
        round = Math.round;

    // emulate ES5 getter/setter API using legacy APIs
    // http://blogs.msdn.com/b/ie/archive/2010/09/07/transitioning-existing-code-to-the-es5-getter-setter-apis.aspx
    // (second clause tests for Object.defineProperty() in IE<9 that only supports extending DOM prototypes, but
    // note that IE<9 does not support __defineGetter__ or __defineSetter__ so it just renders the method harmless)

    (function() {
        var orig = Object.defineProperty;
        var dom_only = !(function(){try{return Object.defineProperty({},'x',{});}catch(_){return false;}}());

        if (!orig || dom_only) {
            Object.defineProperty = function (o, prop, desc) {
                // In IE8 try built-in implementation for defining properties on DOM prototypes.
                if (orig)
                    try { return orig(o, prop, desc); } catch (_) {}
                if (o !== Object(o))
                    throw TypeError('Object.defineProperty called on non-object');
                if (Object.prototype.__defineGetter__ && ('get' in desc))
                    Object.prototype.__defineGetter__.call(o, prop, desc.get);
                if (Object.prototype.__defineSetter__ && ('set' in desc))
                    Object.prototype.__defineSetter__.call(o, prop, desc.set);
                if ('value' in desc)
                    o[prop] = desc.value;
                return o;
            };
        }
    }());

    // ES5: Make obj[index] an alias for obj._getter(index)/obj._setter(index, value)
    // for index in 0 ... obj.length
    function makeArrayAccessors(obj) {
        if (obj.length > MAX_ARRAY_LENGTH) throw RangeError('Array too large for polyfill');

        function makeArrayAccessor(index) {
            Object.defineProperty(obj, index, {
                'get': function() { return obj._getter(index); },
                'set': function(v) { obj._setter(index, v); },
                enumerable: true,
                configurable: false
            });
        }

        var i;
        for (i = 0; i < obj.length; i += 1) {
            makeArrayAccessor(i);
        }
    }

    // Internal conversion functions:
    //    pack<Type>()   - take a number (interpreted as Type), output a byte array
    //    unpack<Type>() - take a byte array, output a Type-like number

    function as_signed(value, bits) { var s = 32 - bits; return (value << s) >> s; }
    function as_unsigned(value, bits) { var s = 32 - bits; return (value << s) >>> s; }

    function packI8(n) { return [n & 0xff]; }
    function unpackI8(bytes) { return as_signed(bytes[0], 8); }

    function packU8(n) { return [n & 0xff]; }
    function unpackU8(bytes) { return as_unsigned(bytes[0], 8); }

    function packU8Clamped(n) { n = round(Number(n)); return [n < 0 ? 0 : n > 0xff ? 0xff : n & 0xff]; }

    function packI16(n) { return [n & 0xff, (n >> 8) & 0xff]; }
    function unpackI16(bytes) { return as_signed(bytes[1] << 8 | bytes[0], 16); }

    function packU16(n) { return [n & 0xff, (n >> 8) & 0xff]; }
    function unpackU16(bytes) { return as_unsigned(bytes[1] << 8 | bytes[0], 16); }

    function packI32(n) { return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]; }
    function unpackI32(bytes) { return as_signed(bytes[3] << 24 | bytes[2] << 16 | bytes[1] << 8 | bytes[0], 32); }

    function packU32(n) { return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]; }
    function unpackU32(bytes) { return as_unsigned(bytes[3] << 24 | bytes[2] << 16 | bytes[1] << 8 | bytes[0], 32); }

    function packIEEE754(v, ebits, fbits) {

        var bias = (1 << (ebits - 1)) - 1,
            s, e, f, ln,
            i, bits, str, bytes;

        function roundToEven(n) {
            var w = floor(n), f = n - w;
            if (f < 0.5)
                return w;
            if (f > 0.5)
                return w + 1;
            return w % 2 ? w + 1 : w;
        }

        // Compute sign, exponent, fraction
        if (v !== v) {
            // NaN
            // http://dev.w3.org/2006/webapi/WebIDL/#es-type-mapping
            e = (1 << ebits) - 1; f = pow(2, fbits - 1); s = 0;
        } else if (v === Infinity || v === -Infinity) {
            e = (1 << ebits) - 1; f = 0; s = (v < 0) ? 1 : 0;
        } else if (v === 0) {
            e = 0; f = 0; s = (1 / v === -Infinity) ? 1 : 0;
        } else {
            s = v < 0;
            v = abs(v);

            if (v >= pow(2, 1 - bias)) {
                e = min(floor(log(v) / LN2), 1023);
                f = roundToEven(v / pow(2, e) * pow(2, fbits));
                if (f / pow(2, fbits) >= 2) {
                    e = e + 1;
                    f = 1;
                }
                if (e > bias) {
                    // Overflow
                    e = (1 << ebits) - 1;
                    f = 0;
                } else {
                    // Normalized
                    e = e + bias;
                    f = f - pow(2, fbits);
                }
            } else {
                // Denormalized
                e = 0;
                f = roundToEven(v / pow(2, 1 - bias - fbits));
            }
        }

        // Pack sign, exponent, fraction
        bits = [];
        for (i = fbits; i; i -= 1) { bits.push(f % 2 ? 1 : 0); f = floor(f / 2); }
        for (i = ebits; i; i -= 1) { bits.push(e % 2 ? 1 : 0); e = floor(e / 2); }
        bits.push(s ? 1 : 0);
        bits.reverse();
        str = bits.join('');

        // Bits to bytes
        bytes = [];
        while (str.length) {
            bytes.unshift(parseInt(str.substring(0, 8), 2));
            str = str.substring(8);
        }
        return bytes;
    }

    function unpackIEEE754(bytes, ebits, fbits) {
        // Bytes to bits
        var bits = [], i, j, b, str,
            bias, s, e, f;

        for (i = 0; i < bytes.length; ++i) {
            b = bytes[i];
            for (j = 8; j; j -= 1) {
                bits.push(b % 2 ? 1 : 0); b = b >> 1;
            }
        }
        bits.reverse();
        str = bits.join('');

        // Unpack sign, exponent, fraction
        bias = (1 << (ebits - 1)) - 1;
        s = parseInt(str.substring(0, 1), 2) ? -1 : 1;
        e = parseInt(str.substring(1, 1 + ebits), 2);
        f = parseInt(str.substring(1 + ebits), 2);

        // Produce number
        if (e === (1 << ebits) - 1) {
            return f !== 0 ? NaN : s * Infinity;
        } else if (e > 0) {
            // Normalized
            return s * pow(2, e - bias) * (1 + f / pow(2, fbits));
        } else if (f !== 0) {
            // Denormalized
            return s * pow(2, -(bias - 1)) * (f / pow(2, fbits));
        } else {
            return s < 0 ? -0 : 0;
        }
    }

    function unpackF64(b) { return unpackIEEE754(b, 11, 52); }
    function packF64(v) { return packIEEE754(v, 11, 52); }
    function unpackF32(b) { return unpackIEEE754(b, 8, 23); }
    function packF32(v) { return packIEEE754(v, 8, 23); }

    //
    // 3 The ArrayBuffer Type
    //

    (function() {

        function ArrayBuffer(length) {
            length = ToInt32(length);
            if (length < 0) throw RangeError('ArrayBuffer size is not a small enough positive integer.');
            Object.defineProperty(this, 'byteLength', {value: length});
            Object.defineProperty(this, '_bytes', {value: Array(length)});

            for (var i = 0; i < length; i += 1)
                this._bytes[i] = 0;
        }

        global.ArrayBuffer = global.ArrayBuffer || ArrayBuffer;

        //
        // 5 The Typed Array View Types
        //

        function $TypedArray$() {

            // %TypedArray% ( length )
            if (!arguments.length || typeof arguments[0] !== 'object') {
                return (function(length) {
                    length = ToInt32(length);
                    if (length < 0) throw RangeError('length is not a small enough positive integer.');
                    Object.defineProperty(this, 'length', {value: length});
                    Object.defineProperty(this, 'byteLength', {value: length * this.BYTES_PER_ELEMENT});
                    Object.defineProperty(this, 'buffer', {value: new ArrayBuffer(this.byteLength)});
                    Object.defineProperty(this, 'byteOffset', {value: 0});

                }).apply(this, arguments);
            }

            // %TypedArray% ( typedArray )
            if (arguments.length >= 1 &&
                Type(arguments[0]) === 'object' &&
                arguments[0] instanceof $TypedArray$) {
                return (function(typedArray){
                    if (this.constructor !== typedArray.constructor) throw TypeError();

                    var byteLength = typedArray.length * this.BYTES_PER_ELEMENT;
                    Object.defineProperty(this, 'buffer', {value: new ArrayBuffer(byteLength)});
                    Object.defineProperty(this, 'byteLength', {value: byteLength});
                    Object.defineProperty(this, 'byteOffset', {value: 0});
                    Object.defineProperty(this, 'length', {value: typedArray.length});

                    for (var i = 0; i < this.length; i += 1)
                        this._setter(i, typedArray._getter(i));

                }).apply(this, arguments);
            }

            // %TypedArray% ( array )
            if (arguments.length >= 1 &&
                Type(arguments[0]) === 'object' &&
                !(arguments[0] instanceof $TypedArray$) &&
                !(arguments[0] instanceof ArrayBuffer || Class(arguments[0]) === 'ArrayBuffer')) {
                return (function(array) {

                    var byteLength = array.length * this.BYTES_PER_ELEMENT;
                    Object.defineProperty(this, 'buffer', {value: new ArrayBuffer(byteLength)});
                    Object.defineProperty(this, 'byteLength', {value: byteLength});
                    Object.defineProperty(this, 'byteOffset', {value: 0});
                    Object.defineProperty(this, 'length', {value: array.length});

                    for (var i = 0; i < this.length; i += 1) {
                        var s = array[i];
                        this._setter(i, Number(s));
                    }
                }).apply(this, arguments);
            }

            // %TypedArray% ( buffer, byteOffset=0, length=undefined )
            if (arguments.length >= 1 &&
                Type(arguments[0]) === 'object' &&
                (arguments[0] instanceof ArrayBuffer || Class(arguments[0]) === 'ArrayBuffer')) {
                return (function(buffer, byteOffset, length) {

                    byteOffset = ToUint32(byteOffset);
                    if (byteOffset > buffer.byteLength)
                        throw RangeError('byteOffset out of range');

                    // The given byteOffset must be a multiple of the element
                    // size of the specific type, otherwise an exception is raised.
                    if (byteOffset % this.BYTES_PER_ELEMENT)
                        throw RangeError('buffer length minus the byteOffset is not a multiple of the element size.');

                    if (length === undefined) {
                        var byteLength = buffer.byteLength - byteOffset;
                        if (byteLength % this.BYTES_PER_ELEMENT)
                            throw RangeError('length of buffer minus byteOffset not a multiple of the element size');
                        length = byteLength / this.BYTES_PER_ELEMENT;

                    } else {
                        length = ToUint32(length);
                        byteLength = length * this.BYTES_PER_ELEMENT;
                    }

                    if ((byteOffset + byteLength) > buffer.byteLength)
                        throw RangeError('byteOffset and length reference an area beyond the end of the buffer');

                    Object.defineProperty(this, 'buffer', {value: buffer});
                    Object.defineProperty(this, 'byteLength', {value: byteLength});
                    Object.defineProperty(this, 'byteOffset', {value: byteOffset});
                    Object.defineProperty(this, 'length', {value: length});

                }).apply(this, arguments);
            }

            // %TypedArray% ( all other argument combinations )
            throw TypeError();
        }

        // Properties of the %TypedArray Instrinsic Object

        // %TypedArray%.from ( source , mapfn=undefined, thisArg=undefined )
        Object.defineProperty($TypedArray$, 'from', {value: function(iterable) {
            return new this(iterable);
        }});

        // %TypedArray%.of ( ...items )
        Object.defineProperty($TypedArray$, 'of', {value: function(/*...items*/) {
            return new this(arguments);
        }});

        // %TypedArray%.prototype
        var $TypedArrayPrototype$ = {};
        $TypedArray$.prototype = $TypedArrayPrototype$;

        // WebIDL: getter type (unsigned long index);
        Object.defineProperty($TypedArray$.prototype, '_getter', {value: function(index) {
            if (arguments.length < 1) throw SyntaxError('Not enough arguments');

            index = ToUint32(index);
            if (index >= this.length)
                return undefined;

            var bytes = [], i, o;
            for (i = 0, o = this.byteOffset + index * this.BYTES_PER_ELEMENT;
                 i < this.BYTES_PER_ELEMENT;
                 i += 1, o += 1) {
                bytes.push(this.buffer._bytes[o]);
            }
            return this._unpack(bytes);
        }});

        // NONSTANDARD: convenience alias for getter: type get(unsigned long index);
        Object.defineProperty($TypedArray$.prototype, 'get', {value: $TypedArray$.prototype._getter});

        // WebIDL: setter void (unsigned long index, type value);
        Object.defineProperty($TypedArray$.prototype, '_setter', {value: function(index, value) {
            if (arguments.length < 2) throw SyntaxError('Not enough arguments');

            index = ToUint32(index);
            if (index >= this.length)
                return;

            var bytes = this._pack(value), i, o;
            for (i = 0, o = this.byteOffset + index * this.BYTES_PER_ELEMENT;
                 i < this.BYTES_PER_ELEMENT;
                 i += 1, o += 1) {
                this.buffer._bytes[o] = bytes[i];
            }
        }});

        // get %TypedArray%.prototype.buffer
        // get %TypedArray%.prototype.byteLength
        // get %TypedArray%.prototype.byteOffset
        // -- applied directly to the object in the constructor

        // %TypedArray%.prototype.constructor
        Object.defineProperty($TypedArray$.prototype, 'constructor', {value: $TypedArray$});

        // %TypedArray%.prototype.copyWithin (target, start, end = this.length )
        Object.defineProperty($TypedArray$.prototype, 'copyWithin', {value: function(target, start) {
            var end = arguments[2];

            var o = ToObject(this);
            var lenVal = o.length;
            var len = ToUint32(lenVal);
            len = max(len, 0);
            var relativeTarget = ToInt32(target);
            var to;
            if (relativeTarget < 0)
                to = max(len + relativeTarget, 0);
            else
                to = min(relativeTarget, len);
            var relativeStart = ToInt32(start);
            var from;
            if (relativeStart < 0)
                from = max(len + relativeStart, 0);
            else
                from = min(relativeStart, len);
            var relativeEnd;
            if (end === undefined)
                relativeEnd = len;
            else
                relativeEnd = ToInt32(end);
            var final;
            if (relativeEnd < 0)
                final = max(len + relativeEnd, 0);
            else
                final = min(relativeEnd, len);
            var count = min(final - from, len - to);
            var direction;
            if (from < to && to < from + count) {
                direction = -1;
                from = from + count - 1;
                to = to + count - 1;
            } else {
                direction = 1;
            }
            while (count > 0) {
                o._setter(to, o._getter(from));
                from = from + direction;
                to = to + direction;
                count = count - 1;
            }
            return o;
        }});

        // %TypedArray%.prototype.entries ( )
        // -- defined in es6.js to shim browsers w/ native TypedArrays

        // %TypedArray%.prototype.every ( callbackfn, thisArg = undefined )
        Object.defineProperty($TypedArray$.prototype, 'every', {value: function(callbackfn) {
            if (this === undefined || this === null) throw TypeError();
            var t = Object(this);
            var len = ToUint32(t.length);
            if (!IsCallable(callbackfn)) throw TypeError();
            var thisArg = arguments[1];
            for (var i = 0; i < len; i++) {
                if (!callbackfn.call(thisArg, t._getter(i), i, t))
                    return false;
            }
            return true;
        }});

        // %TypedArray%.prototype.fill (value, start = 0, end = this.length )
        Object.defineProperty($TypedArray$.prototype, 'fill', {value: function(value) {
            var start = arguments[1],
                end = arguments[2];

            var o = ToObject(this);
            var lenVal = o.length;
            var len = ToUint32(lenVal);
            len = max(len, 0);
            var relativeStart = ToInt32(start);
            var k;
            if (relativeStart < 0)
                k = max((len + relativeStart), 0);
            else
                k = min(relativeStart, len);
            var relativeEnd;
            if (end === undefined)
                relativeEnd = len;
            else
                relativeEnd = ToInt32(end);
            var final;
            if (relativeEnd < 0)
                final = max((len + relativeEnd), 0);
            else
                final = min(relativeEnd, len);
            while (k < final) {
                o._setter(k, value);
                k += 1;
            }
            return o;
        }});

        // %TypedArray%.prototype.filter ( callbackfn, thisArg = undefined )
        Object.defineProperty($TypedArray$.prototype, 'filter', {value: function(callbackfn) {
            if (this === undefined || this === null) throw TypeError();
            var t = Object(this);
            var len = ToUint32(t.length);
            if (!IsCallable(callbackfn)) throw TypeError();
            var res = [];
            var thisp = arguments[1];
            for (var i = 0; i < len; i++) {
                var val = t._getter(i); // in case fun mutates this
                if (callbackfn.call(thisp, val, i, t))
                    res.push(val);
            }
            return new this.constructor(res);
        }});

        // %TypedArray%.prototype.find (predicate, thisArg = undefined)
        Object.defineProperty($TypedArray$.prototype, 'find', {value: function(predicate) {
            var o = ToObject(this);
            var lenValue = o.length;
            var len = ToUint32(lenValue);
            if (!IsCallable(predicate)) throw TypeError();
            var t = arguments.length > 1 ? arguments[1] : undefined;
            var k = 0;
            while (k < len) {
                var kValue = o._getter(k);
                var testResult = predicate.call(t, kValue, k, o);
                if (Boolean(testResult))
                    return kValue;
                ++k;
            }
            return undefined;
        }});

        // %TypedArray%.prototype.findIndex ( predicate, thisArg = undefined )
        Object.defineProperty($TypedArray$.prototype, 'findIndex', {value: function(predicate) {
            var o = ToObject(this);
            var lenValue = o.length;
            var len = ToUint32(lenValue);
            if (!IsCallable(predicate)) throw TypeError();
            var t = arguments.length > 1 ? arguments[1] : undefined;
            var k = 0;
            while (k < len) {
                var kValue = o._getter(k);
                var testResult = predicate.call(t, kValue, k, o);
                if (Boolean(testResult))
                    return k;
                ++k;
            }
            return -1;
        }});

        // %TypedArray%.prototype.forEach ( callbackfn, thisArg = undefined )
        Object.defineProperty($TypedArray$.prototype, 'forEach', {value: function(callbackfn) {
            if (this === undefined || this === null) throw TypeError();
            var t = Object(this);
            var len = ToUint32(t.length);
            if (!IsCallable(callbackfn)) throw TypeError();
            var thisp = arguments[1];
            for (var i = 0; i < len; i++)
                callbackfn.call(thisp, t._getter(i), i, t);
        }});

        // %TypedArray%.prototype.indexOf (searchElement, fromIndex = 0 )
        Object.defineProperty($TypedArray$.prototype, 'indexOf', {value: function(searchElement) {
            if (this === undefined || this === null) throw TypeError();
            var t = Object(this);
            var len = ToUint32(t.length);
            if (len === 0) return -1;
            var n = 0;
            if (arguments.length > 0) {
                n = Number(arguments[1]);
                if (n !== n) {
                    n = 0;
                } else if (n !== 0 && n !== (1 / 0) && n !== -(1 / 0)) {
                    n = (n > 0 || -1) * floor(abs(n));
                }
            }
            if (n >= len) return -1;
            var k = n >= 0 ? n : max(len - abs(n), 0);
            for (; k < len; k++) {
                if (t._getter(k) === searchElement) {
                    return k;
                }
            }
            return -1;
        }});

        // %TypedArray%.prototype.join ( separator )
        Object.defineProperty($TypedArray$.prototype, 'join', {value: function(separator) {
            if (this === undefined || this === null) throw TypeError();
            var t = Object(this);
            var len = ToUint32(t.length);
            var tmp = Array(len);
            for (var i = 0; i < len; ++i)
                tmp[i] = t._getter(i);
            return tmp.join(separator === undefined ? ',' : separator); // Hack for IE7
        }});

        // %TypedArray%.prototype.keys ( )
        // -- defined in es6.js to shim browsers w/ native TypedArrays

        // %TypedArray%.prototype.lastIndexOf ( searchElement, fromIndex = this.length-1 )
        Object.defineProperty($TypedArray$.prototype, 'lastIndexOf', {value: function(searchElement) {
            if (this === undefined || this === null) throw TypeError();
            var t = Object(this);
            var len = ToUint32(t.length);
            if (len === 0) return -1;
            var n = len;
            if (arguments.length > 1) {
                n = Number(arguments[1]);
                if (n !== n) {
                    n = 0;
                } else if (n !== 0 && n !== (1 / 0) && n !== -(1 / 0)) {
                    n = (n > 0 || -1) * floor(abs(n));
                }
            }
            var k = n >= 0 ? min(n, len - 1) : len - abs(n);
            for (; k >= 0; k--) {
                if (t._getter(k) === searchElement)
                    return k;
            }
            return -1;
        }});

        // get %TypedArray%.prototype.length
        // -- applied directly to the object in the constructor

        // %TypedArray%.prototype.map ( callbackfn, thisArg = undefined )
        Object.defineProperty($TypedArray$.prototype, 'map', {value: function(callbackfn) {
            if (this === undefined || this === null) throw TypeError();
            var t = Object(this);
            var len = ToUint32(t.length);
            if (!IsCallable(callbackfn)) throw TypeError();
            var res = []; res.length = len;
            var thisp = arguments[1];
            for (var i = 0; i < len; i++)
                res[i] = callbackfn.call(thisp, t._getter(i), i, t);
            return new this.constructor(res);
        }});

        // %TypedArray%.prototype.reduce ( callbackfn [, initialValue] )
        Object.defineProperty($TypedArray$.prototype, 'reduce', {value: function(callbackfn) {
            if (this === undefined || this === null) throw TypeError();
            var t = Object(this);
            var len = ToUint32(t.length);
            if (!IsCallable(callbackfn)) throw TypeError();
            // no value to return if no initial value and an empty array
            if (len === 0 && arguments.length === 1) throw TypeError();
            var k = 0;
            var accumulator;
            if (arguments.length >= 2) {
                accumulator = arguments[1];
            } else {
                accumulator = t._getter(k++);
            }
            while (k < len) {
                accumulator = callbackfn.call(undefined, accumulator, t._getter(k), k, t);
                k++;
            }
            return accumulator;
        }});

        // %TypedArray%.prototype.reduceRight ( callbackfn [, initialValue] )
        Object.defineProperty($TypedArray$.prototype, 'reduceRight', {value: function(callbackfn) {
            if (this === undefined || this === null) throw TypeError();
            var t = Object(this);
            var len = ToUint32(t.length);
            if (!IsCallable(callbackfn)) throw TypeError();
            // no value to return if no initial value, empty array
            if (len === 0 && arguments.length === 1) throw TypeError();
            var k = len - 1;
            var accumulator;
            if (arguments.length >= 2) {
                accumulator = arguments[1];
            } else {
                accumulator = t._getter(k--);
            }
            while (k >= 0) {
                accumulator = callbackfn.call(undefined, accumulator, t._getter(k), k, t);
                k--;
            }
            return accumulator;
        }});

        // %TypedArray%.prototype.reverse ( )
        Object.defineProperty($TypedArray$.prototype, 'reverse', {value: function() {
            if (this === undefined || this === null) throw TypeError();
            var t = Object(this);
            var len = ToUint32(t.length);
            var half = floor(len / 2);
            for (var i = 0, j = len - 1; i < half; ++i, --j) {
                var tmp = t._getter(i);
                t._setter(i, t._getter(j));
                t._setter(j, tmp);
            }
            return t;
        }});

        // %TypedArray%.prototype.set(array, offset = 0 )
        // %TypedArray%.prototype.set(typedArray, offset = 0 )
        // WebIDL: void set(TypedArray array, optional unsigned long offset);
        // WebIDL: void set(sequence<type> array, optional unsigned long offset);
        Object.defineProperty($TypedArray$.prototype, 'set', {value: function(index, value) {
            if (arguments.length < 1) throw SyntaxError('Not enough arguments');
            var array, sequence, offset, len,
                i, s, d,
                byteOffset, byteLength, tmp;

            if (typeof arguments[0] === 'object' && arguments[0].constructor === this.constructor) {
                // void set(TypedArray array, optional unsigned long offset);
                array = arguments[0];
                offset = ToUint32(arguments[1]);

                if (offset + array.length > this.length) {
                    throw RangeError('Offset plus length of array is out of range');
                }

                byteOffset = this.byteOffset + offset * this.BYTES_PER_ELEMENT;
                byteLength = array.length * this.BYTES_PER_ELEMENT;

                if (array.buffer === this.buffer) {
                    tmp = [];
                    for (i = 0, s = array.byteOffset; i < byteLength; i += 1, s += 1) {
                        tmp[i] = array.buffer._bytes[s];
                    }
                    for (i = 0, d = byteOffset; i < byteLength; i += 1, d += 1) {
                        this.buffer._bytes[d] = tmp[i];
                    }
                } else {
                    for (i = 0, s = array.byteOffset, d = byteOffset;
                         i < byteLength; i += 1, s += 1, d += 1) {
                        this.buffer._bytes[d] = array.buffer._bytes[s];
                    }
                }
            } else if (typeof arguments[0] === 'object' && typeof arguments[0].length !== 'undefined') {
                // void set(sequence<type> array, optional unsigned long offset);
                sequence = arguments[0];
                len = ToUint32(sequence.length);
                offset = ToUint32(arguments[1]);

                if (offset + len > this.length) {
                    throw RangeError('Offset plus length of array is out of range');
                }

                for (i = 0; i < len; i += 1) {
                    s = sequence[i];
                    this._setter(offset + i, Number(s));
                }
            } else {
                throw TypeError('Unexpected argument type(s)');
            }
        }});

        // %TypedArray%.prototype.slice ( start, end )
        Object.defineProperty($TypedArray$.prototype, 'slice', {value: function(start, end) {
            var o = ToObject(this);
            var lenVal = o.length;
            var len = ToUint32(lenVal);
            var relativeStart = ToInt32(start);
            var k = (relativeStart < 0) ? max(len + relativeStart, 0) : min(relativeStart, len);
            var relativeEnd = (end === undefined) ? len : ToInt32(end);
            var final = (relativeEnd < 0) ? max(len + relativeEnd, 0) : min(relativeEnd, len);
            var count = final - k;
            var c = o.constructor;
            var a = new c(count);
            var n = 0;
            while (k < final) {
                var kValue = o._getter(k);
                a._setter(n, kValue);
                ++k;
                ++n;
            }
            return a;
        }});

        // %TypedArray%.prototype.some ( callbackfn, thisArg = undefined )
        Object.defineProperty($TypedArray$.prototype, 'some', {value: function(callbackfn) {
            if (this === undefined || this === null) throw TypeError();
            var t = Object(this);
            var len = ToUint32(t.length);
            if (!IsCallable(callbackfn)) throw TypeError();
            var thisp = arguments[1];
            for (var i = 0; i < len; i++) {
                if (callbackfn.call(thisp, t._getter(i), i, t)) {
                    return true;
                }
            }
            return false;
        }});

        // %TypedArray%.prototype.sort ( comparefn )
        Object.defineProperty($TypedArray$.prototype, 'sort', {value: function(comparefn) {
            if (this === undefined || this === null) throw TypeError();
            var t = Object(this);
            var len = ToUint32(t.length);
            var tmp = Array(len);
            for (var i = 0; i < len; ++i)
                tmp[i] = t._getter(i);
            if (comparefn) tmp.sort(comparefn); else tmp.sort(); // Hack for IE8/9
            for (i = 0; i < len; ++i)
                t._setter(i, tmp[i]);
            return t;
        }});

        // %TypedArray%.prototype.subarray(begin = 0, end = this.length )
        // WebIDL: TypedArray subarray(long begin, optional long end);
        Object.defineProperty($TypedArray$.prototype, 'subarray', {value: function(start, end) {
            function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

            start = ToInt32(start);
            end = ToInt32(end);

            if (arguments.length < 1) { start = 0; }
            if (arguments.length < 2) { end = this.length; }

            if (start < 0) { start = this.length + start; }
            if (end < 0) { end = this.length + end; }

            start = clamp(start, 0, this.length);
            end = clamp(end, 0, this.length);

            var len = end - start;
            if (len < 0) {
                len = 0;
            }

            return new this.constructor(
                this.buffer, this.byteOffset + start * this.BYTES_PER_ELEMENT, len);
        }});

        // %TypedArray%.prototype.toLocaleString ( )
        // %TypedArray%.prototype.toString ( )
        // %TypedArray%.prototype.values ( )
        // %TypedArray%.prototype [ @@iterator ] ( )
        // get %TypedArray%.prototype [ @@toStringTag ]
        // -- defined in es6.js to shim browsers w/ native TypedArrays

        function makeTypedArray(elementSize, pack, unpack) {
            // Each TypedArray type requires a distinct constructor instance with
            // identical logic, which this produces.
            var TypedArray = function() {
                Object.defineProperty(this, 'constructor', {value: TypedArray});
                $TypedArray$.apply(this, arguments);
                makeArrayAccessors(this);
            };
            if ('__proto__' in TypedArray) {
                TypedArray.__proto__ = $TypedArray$;
            } else {
                TypedArray.from = $TypedArray$.from;
                TypedArray.of = $TypedArray$.of;
            }

            TypedArray.BYTES_PER_ELEMENT = elementSize;

            var TypedArrayPrototype = function() {};
            TypedArrayPrototype.prototype = $TypedArrayPrototype$;

            TypedArray.prototype = new TypedArrayPrototype();

            Object.defineProperty(TypedArray.prototype, 'BYTES_PER_ELEMENT', {value: elementSize});
            Object.defineProperty(TypedArray.prototype, '_pack', {value: pack});
            Object.defineProperty(TypedArray.prototype, '_unpack', {value: unpack});

            return TypedArray;
        }

        var Int8Array = makeTypedArray(1, packI8, unpackI8);
        var Uint8Array = makeTypedArray(1, packU8, unpackU8);
        var Uint8ClampedArray = makeTypedArray(1, packU8Clamped, unpackU8);
        var Int16Array = makeTypedArray(2, packI16, unpackI16);
        var Uint16Array = makeTypedArray(2, packU16, unpackU16);
        var Int32Array = makeTypedArray(4, packI32, unpackI32);
        var Uint32Array = makeTypedArray(4, packU32, unpackU32);
        var Float32Array = makeTypedArray(4, packF32, unpackF32);
        var Float64Array = makeTypedArray(8, packF64, unpackF64);

        global.Int8Array = global.Int8Array || Int8Array;
        global.Uint8Array = global.Uint8Array || Uint8Array;
        global.Uint8ClampedArray = global.Uint8ClampedArray || Uint8ClampedArray;
        global.Int16Array = global.Int16Array || Int16Array;
        global.Uint16Array = global.Uint16Array || Uint16Array;
        global.Int32Array = global.Int32Array || Int32Array;
        global.Uint32Array = global.Uint32Array || Uint32Array;
        global.Float32Array = global.Float32Array || Float32Array;
        global.Float64Array = global.Float64Array || Float64Array;
    }());

    //
    // 6 The DataView View Type
    //

    (function() {
        function r(array, index) {
            return IsCallable(array.get) ? array.get(index) : array[index];
        }

        var IS_BIG_ENDIAN = (function() {
            var u16array = new Uint16Array([0x1234]),
                u8array = new Uint8Array(u16array.buffer);
            return r(u8array, 0) === 0x12;
        }());

        // DataView(buffer, byteOffset=0, byteLength=undefined)
        // WebIDL: Constructor(ArrayBuffer buffer,
        //                     optional unsigned long byteOffset,
        //                     optional unsigned long byteLength)
        function DataView(buffer, byteOffset, byteLength) {
            if (!(buffer instanceof ArrayBuffer || Class(buffer) === 'ArrayBuffer')) throw TypeError();

            byteOffset = ToUint32(byteOffset);
            if (byteOffset > buffer.byteLength)
                throw RangeError('byteOffset out of range');

            if (byteLength === undefined)
                byteLength = buffer.byteLength - byteOffset;
            else
                byteLength = ToUint32(byteLength);

            if ((byteOffset + byteLength) > buffer.byteLength)
                throw RangeError('byteOffset and length reference an area beyond the end of the buffer');

            Object.defineProperty(this, 'buffer', {value: buffer});
            Object.defineProperty(this, 'byteLength', {value: byteLength});
            Object.defineProperty(this, 'byteOffset', {value: byteOffset});
        };

        // get DataView.prototype.buffer
        // get DataView.prototype.byteLength
        // get DataView.prototype.byteOffset
        // -- applied directly to instances by the constructor

        function makeGetter(arrayType) {
            return function GetViewValue(byteOffset, littleEndian) {
                byteOffset = ToUint32(byteOffset);

                if (byteOffset + arrayType.BYTES_PER_ELEMENT > this.byteLength)
                    throw RangeError('Array index out of range');

                byteOffset += this.byteOffset;

                var uint8Array = new Uint8Array(this.buffer, byteOffset, arrayType.BYTES_PER_ELEMENT),
                    bytes = [];
                for (var i = 0; i < arrayType.BYTES_PER_ELEMENT; i += 1)
                    bytes.push(r(uint8Array, i));

                if (Boolean(littleEndian) === Boolean(IS_BIG_ENDIAN))
                    bytes.reverse();

                return r(new arrayType(new Uint8Array(bytes).buffer), 0);
            };
        }

        Object.defineProperty(DataView.prototype, 'getUint8', {value: makeGetter(Uint8Array)});
        Object.defineProperty(DataView.prototype, 'getInt8', {value: makeGetter(Int8Array)});
        Object.defineProperty(DataView.prototype, 'getUint16', {value: makeGetter(Uint16Array)});
        Object.defineProperty(DataView.prototype, 'getInt16', {value: makeGetter(Int16Array)});
        Object.defineProperty(DataView.prototype, 'getUint32', {value: makeGetter(Uint32Array)});
        Object.defineProperty(DataView.prototype, 'getInt32', {value: makeGetter(Int32Array)});
        Object.defineProperty(DataView.prototype, 'getFloat32', {value: makeGetter(Float32Array)});
        Object.defineProperty(DataView.prototype, 'getFloat64', {value: makeGetter(Float64Array)});

        function makeSetter(arrayType) {
            return function SetViewValue(byteOffset, value, littleEndian) {
                byteOffset = ToUint32(byteOffset);
                if (byteOffset + arrayType.BYTES_PER_ELEMENT > this.byteLength)
                    throw RangeError('Array index out of range');

                // Get bytes
                var typeArray = new arrayType([value]),
                    byteArray = new Uint8Array(typeArray.buffer),
                    bytes = [], i, byteView;

                for (i = 0; i < arrayType.BYTES_PER_ELEMENT; i += 1)
                    bytes.push(r(byteArray, i));

                // Flip if necessary
                if (Boolean(littleEndian) === Boolean(IS_BIG_ENDIAN))
                    bytes.reverse();

                // Write them
                byteView = new Uint8Array(this.buffer, byteOffset, arrayType.BYTES_PER_ELEMENT);
                byteView.set(bytes);
            };
        }

        Object.defineProperty(DataView.prototype, 'setUint8', {value: makeSetter(Uint8Array)});
        Object.defineProperty(DataView.prototype, 'setInt8', {value: makeSetter(Int8Array)});
        Object.defineProperty(DataView.prototype, 'setUint16', {value: makeSetter(Uint16Array)});
        Object.defineProperty(DataView.prototype, 'setInt16', {value: makeSetter(Int16Array)});
        Object.defineProperty(DataView.prototype, 'setUint32', {value: makeSetter(Uint32Array)});
        Object.defineProperty(DataView.prototype, 'setInt32', {value: makeSetter(Int32Array)});
        Object.defineProperty(DataView.prototype, 'setFloat32', {value: makeSetter(Float32Array)});
        Object.defineProperty(DataView.prototype, 'setFloat64', {value: makeSetter(Float64Array)});

        global.DataView = global.DataView || DataView;

    }());

}(this));
/* jshint bitwise: false */

(function(root) {

    'use strict';

    /*
     * Fastest md5 implementation around (JKM md5)
     * Credits: Joseph Myers
     *
     * @see http://www.myersdaily.org/joseph/javascript/md5-text.html
     * @see http://jsperf.com/md5-shootout/7
     */

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence

    var md5cycle = function(x, k) {
        var a = x[0],
            b = x[1],
            c = x[2],
            d = x[3];
        // ff()
        a += (b & c | ~b & d) + k[0] - 680876936 | 0;
        a  = (a << 7 | a >>> 25) + b | 0;
        d += (a & b | ~a & c) + k[1] - 389564586 | 0;
        d  = (d << 12 | d >>> 20) + a | 0;
        c += (d & a | ~d & b) + k[2] + 606105819 | 0;
        c  = (c << 17 | c >>> 15) + d | 0;
        b += (c & d | ~c & a) + k[3] - 1044525330 | 0;
        b  = (b << 22 | b >>> 10) + c | 0;
        a += (b & c | ~b & d) + k[4] - 176418897 | 0;
        a  = (a << 7 | a >>> 25) + b | 0;
        d += (a & b | ~a & c) + k[5] + 1200080426 | 0;
        d  = (d << 12 | d >>> 20) + a | 0;
        c += (d & a | ~d & b) + k[6] - 1473231341 | 0;
        c  = (c << 17 | c >>> 15) + d | 0;
        b += (c & d | ~c & a) + k[7] - 45705983 | 0;
        b  = (b << 22 | b >>> 10) + c | 0;
        a += (b & c | ~b & d) + k[8] + 1770035416 | 0;
        a  = (a << 7 | a >>> 25) + b | 0;
        d += (a & b | ~a & c) + k[9] - 1958414417 | 0;
        d  = (d << 12 | d >>> 20) + a | 0;
        c += (d & a | ~d & b) + k[10] - 42063 | 0;
        c  = (c << 17 | c >>> 15) + d | 0;
        b += (c & d | ~c & a) + k[11] - 1990404162 | 0;
        b  = (b << 22 | b >>> 10) + c | 0;
        a += (b & c | ~b & d) + k[12] + 1804603682 | 0;
        a  = (a << 7 | a >>> 25) + b | 0;
        d += (a & b | ~a & c) + k[13] - 40341101 | 0;
        d  = (d << 12 | d >>> 20) + a | 0;
        c += (d & a | ~d & b) + k[14] - 1502002290 | 0;
        c  = (c << 17 | c >>> 15) + d | 0;
        b += (c & d | ~c & a) + k[15] + 1236535329 | 0;
        b  = (b << 22 | b >>> 10) + c | 0;
        // gg()
        a += (b & d | c & ~d) + k[1] - 165796510 | 0;
        a  = (a << 5 | a >>> 27) + b | 0;
        d += (a & c | b & ~c) + k[6] - 1069501632 | 0;
        d  = (d << 9 | d >>> 23) + a | 0;
        c += (d & b | a & ~b) + k[11] + 643717713 | 0;
        c  = (c << 14 | c >>> 18) + d | 0;
        b += (c & a | d & ~a) + k[0] - 373897302 | 0;
        b  = (b << 20 | b >>> 12) + c | 0;
        a += (b & d | c & ~d) + k[5] - 701558691 | 0;
        a  = (a << 5 | a >>> 27) + b | 0;
        d += (a & c | b & ~c) + k[10] + 38016083 | 0;
        d  = (d << 9 | d >>> 23) + a | 0;
        c += (d & b | a & ~b) + k[15] - 660478335 | 0;
        c  = (c << 14 | c >>> 18) + d | 0;
        b += (c & a | d & ~a) + k[4] - 405537848 | 0;
        b  = (b << 20 | b >>> 12) + c | 0;
        a += (b & d | c & ~d) + k[9] + 568446438 | 0;
        a  = (a << 5 | a >>> 27) + b | 0;
        d += (a & c | b & ~c) + k[14] - 1019803690 | 0;
        d  = (d << 9 | d >>> 23) + a | 0;
        c += (d & b | a & ~b) + k[3] - 187363961 | 0;
        c  = (c << 14 | c >>> 18) + d | 0;
        b += (c & a | d & ~a) + k[8] + 1163531501 | 0;
        b  = (b << 20 | b >>> 12) + c | 0;
        a += (b & d | c & ~d) + k[13] - 1444681467 | 0;
        a  = (a << 5 | a >>> 27) + b | 0;
        d += (a & c | b & ~c) + k[2] - 51403784 | 0;
        d  = (d << 9 | d >>> 23) + a | 0;
        c += (d & b | a & ~b) + k[7] + 1735328473 | 0;
        c  = (c << 14 | c >>> 18) + d | 0;
        b += (c & a | d & ~a) + k[12] - 1926607734 | 0;
        b  = (b << 20 | b >>> 12) + c | 0;
        // hh()
        a += (b ^ c ^ d) + k[5] - 378558 | 0;
        a  = (a << 4 | a >>> 28) + b | 0;
        d += (a ^ b ^ c) + k[8] - 2022574463 | 0;
        d  = (d << 11 | d >>> 21) + a | 0;
        c += (d ^ a ^ b) + k[11] + 1839030562 | 0;
        c  = (c << 16 | c >>> 16) + d | 0;
        b += (c ^ d ^ a) + k[14] - 35309556 | 0;
        b  = (b << 23 | b >>> 9) + c | 0;
        a += (b ^ c ^ d) + k[1] - 1530992060 | 0;
        a  = (a << 4 | a >>> 28) + b | 0;
        d += (a ^ b ^ c) + k[4] + 1272893353 | 0;
        d  = (d << 11 | d >>> 21) + a | 0;
        c += (d ^ a ^ b) + k[7] - 155497632 | 0;
        c  = (c << 16 | c >>> 16) + d | 0;
        b += (c ^ d ^ a) + k[10] - 1094730640 | 0;
        b  = (b << 23 | b >>> 9) + c | 0;
        a += (b ^ c ^ d) + k[13] + 681279174 | 0;
        a  = (a << 4 | a >>> 28) + b | 0;
        d += (a ^ b ^ c) + k[0] - 358537222 | 0;
        d  = (d << 11 | d >>> 21) + a | 0;
        c += (d ^ a ^ b) + k[3] - 722521979 | 0;
        c  = (c << 16 | c >>> 16) + d | 0;
        b += (c ^ d ^ a) + k[6] + 76029189 | 0;
        b  = (b << 23 | b >>> 9) + c | 0;
        a += (b ^ c ^ d) + k[9] - 640364487 | 0;
        a  = (a << 4 | a >>> 28) + b | 0;
        d += (a ^ b ^ c) + k[12] - 421815835 | 0;
        d  = (d << 11 | d >>> 21) + a | 0;
        c += (d ^ a ^ b) + k[15] + 530742520 | 0;
        c  = (c << 16 | c >>> 16) + d | 0;
        b += (c ^ d ^ a) + k[2] - 995338651 | 0;
        b  = (b << 23 | b >>> 9) + c | 0;
        // ii()
        a += (c ^ (b | ~d)) + k[0] - 198630844 | 0;
        a  = (a << 6 | a >>> 26) + b | 0;
        d += (b ^ (a | ~c)) + k[7] + 1126891415 | 0;
        d  = (d << 10 | d >>> 22) + a | 0;
        c += (a ^ (d | ~b)) + k[14] - 1416354905 | 0;
        c  = (c << 15 | c >>> 17) + d | 0;
        b += (d ^ (c | ~a)) + k[5] - 57434055 | 0;
        b  = (b << 21 |b >>> 11) + c | 0;
        a += (c ^ (b | ~d)) + k[12] + 1700485571 | 0;
        a  = (a << 6 | a >>> 26) + b | 0;
        d += (b ^ (a | ~c)) + k[3] - 1894986606 | 0;
        d  = (d << 10 | d >>> 22) + a | 0;
        c += (a ^ (d | ~b)) + k[10] - 1051523 | 0;
        c  = (c << 15 | c >>> 17) + d | 0;
        b += (d ^ (c | ~a)) + k[1] - 2054922799 | 0;
        b  = (b << 21 |b >>> 11) + c | 0;
        a += (c ^ (b | ~d)) + k[8] + 1873313359 | 0;
        a  = (a << 6 | a >>> 26) + b | 0;
        d += (b ^ (a | ~c)) + k[15] - 30611744 | 0;
        d  = (d << 10 | d >>> 22) + a | 0;
        c += (a ^ (d | ~b)) + k[6] - 1560198380 | 0;
        c  = (c << 15 | c >>> 17) + d | 0;
        b += (d ^ (c | ~a)) + k[13] + 1309151649 | 0;
        b  = (b << 21 |b >>> 11) + c | 0;
        a += (c ^ (b | ~d)) + k[4] - 145523070 | 0;
        a  = (a << 6 | a >>> 26) + b | 0;
        d += (b ^ (a | ~c)) + k[11] - 1120210379 | 0;
        d  = (d << 10 | d >>> 22) + a | 0;
        c += (a ^ (d | ~b)) + k[2] + 718787259 | 0;
        c  = (c << 15 | c >>> 17) + d | 0;
        b += (d ^ (c | ~a)) + k[9] - 343485551 | 0;
        b  = (b << 21 | b >>> 11) + c | 0;

        x[0] = a + x[0] | 0;
        x[1] = b + x[1] | 0;
        x[2] = c + x[2] | 0;
        x[3] = d + x[3] | 0;
    };

    var hexChars = '0123456789abcdef';
    var hexOut = [];

    var hex = function(x) {
        var hc = hexChars;
        var ho = hexOut;
        var n, offset, j;
        for (var i = 0; i < 4; i++) {
            offset = i * 8;
            n = x[i];
            for ( j = 0; j < 8; j += 2 ) {
                ho[offset+1+j] = hc.charAt(n & 0x0F);
                n >>>= 4;
                ho[offset+0+j] = hc.charAt(n & 0x0F);
                n >>>= 4;
            }
        }
        return ho.join('');
    };

    var MD5 = function() {
        this._dataLength = 0;
        this._state = new Int32Array(4);
        this._buffer = new ArrayBuffer(68);
        this._bufferLength = 0;
        this._buffer8 = new Uint8Array(this._buffer, 0, 68);
        this._buffer32 = new Uint32Array(this._buffer, 0, 17);
        this.start();
    };

    var stateIdentity = new Int32Array([1732584193, -271733879, -1732584194, 271733878]);
    var buffer32Identity = new Int32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    // Char to code point to to array conversion:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charCodeAt#Example.3A_Fixing_charCodeAt_to_handle_non-Basic-Multilingual-Plane_characters_if_their_presence_earlier_in_the_string_is_unknown
    MD5.prototype.appendStr = function(str) {
        var buf8 = this._buffer8;
        var buf32 = this._buffer32;
        var bufLen = this._bufferLength;
        var code;
        for ( var i = 0; i < str.length; i++ ) {
            code = str.charCodeAt(i);
            if ( code < 128 ) {
                buf8[bufLen++] = code;
            } else if ( code < 0x800 ) {
                buf8[bufLen++] = (code >>> 6) + 0xC0;
                buf8[bufLen++] = code & 0x3F | 0x80;
            } else if ( code < 0xD800 || code > 0xDBFF ) {
                buf8[bufLen++] = (code >>> 12) + 0xE0;
                buf8[bufLen++] = (code >>> 6 & 0x3F) | 0x80;
                buf8[bufLen++] = (code & 0x3F) | 0x80;
            } else {
                code = ((code - 0xD800) * 0x400) + (str.charCodeAt(++i) - 0xDC00) + 0x10000;
                if ( code > 0x10FFFF ) {
                    throw 'Unicode standard supports code points up to U+10FFFF';
                }
                buf8[bufLen++] = (code >>> 18) + 0xF0;
                buf8[bufLen++] = (code >>> 12 & 0x3F) | 0x80;
                buf8[bufLen++] = (code >>> 6 & 0x3F) | 0x80;
                buf8[bufLen++] = (code & 0x3F) | 0x80;
            }
            if ( bufLen >= 64 ) {
                this._dataLength += 64;
                md5cycle(this._state, buf32);
                bufLen -= 64;
                buf32[0] = buf32[16];
            }
        }
        this._bufferLength = bufLen;
        return this;
    };

    MD5.prototype.appendAsciiStr = function(str) {
        var buf8 = this._buffer8;
        var buf32 = this._buffer32;
        var bufLen = this._bufferLength;
        var i, j = 0;
        for (;;) {
            i = Math.min(str.length-j, 64-bufLen);
            while ( i-- ) {
                buf8[bufLen++] = str.charCodeAt(j++);
            }
            if ( bufLen < 64 ) {
                break;
            }
            this._dataLength += 64;
            md5cycle(this._state, buf32);
            bufLen = 0;
        }
        this._bufferLength = bufLen;
        return this;
    };

    MD5.prototype.appendByteArray = function(input) {
        var buf8 = this._buffer8;
        var buf32 = this._buffer32;
        var bufLen = this._bufferLength;
        var i, j = 0;
        for (;;) {
            i = Math.min(input.length-j, 64-bufLen);
            while ( i-- ) {
                buf8[bufLen++] = input[j++];
            }
            if ( bufLen < 64 ) {
                break;
            }
            this._dataLength += 64;
            md5cycle(this._state, buf32);
            bufLen = 0;
        }
        this._bufferLength = bufLen;
        return this;
    };

    MD5.prototype.start = function() {
        this._dataLength = 0;
        this._bufferLength = 0;
        this._state.set(stateIdentity);
        return this;
    };

    MD5.prototype.end = function(raw) {
        var bufLen = this._bufferLength;
        this._dataLength += bufLen;
        var buf8 = this._buffer8;
        buf8[bufLen] = 0x80;
        buf8[bufLen+1] =  buf8[bufLen+2] =  buf8[bufLen+3] = 0;
        var buf32 = this._buffer32;
        var i = (bufLen >> 2) + 1;
        buf32.set(buffer32Identity.subarray(i), i);
        if (bufLen > 55) {
            md5cycle(this._state, buf32);
            buf32.set(buffer32Identity);
        }
        // Do the final computation based on the tail and length
        // Beware that the final length may not fit in 32 bits so we take care of that
        var dataBitsLen = this._dataLength * 8;
        if ( dataBitsLen <= 0xFFFFFFFF ) {
            buf32[14] = dataBitsLen;
        } else {
            var matches = dataBitsLen.toString(16).match(/(.*?)(.{0,8})$/);
            var lo = parseInt(matches[2], 16);
            var hi = parseInt(matches[1], 16) || 0;
            buf32[14] = lo;
            buf32[15] = hi;
        }
        md5cycle(this._state, buf32);

        return !!raw ? this._state : hex(this._state);
    };

    // This permanent instance is to use for one-call hashing
    var onePassHasher = new MD5();

    MD5.hashStr = function(str, raw) {
        return onePassHasher
            .start()
            .appendStr(str)
            .end(raw);
    };

    MD5.hashAsciiStr = function(str, raw) {
        return onePassHasher
            .start()
            .appendAsciiStr(str)
            .end(raw);
    };

    // Self-test
    // In some cases the fast add32 function cannot be used..
    if ( MD5.hashStr('hello') !== '5d41402abc4b2a76b9719d911017c592' ) {
        throw new Error('YaMD5> this javascript engine does not support YaMD5. Sorry.');
    }

    if ( typeof root === 'object' ) {
        root.YaMD5 = MD5;
    }
    return MD5;
}(this));
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