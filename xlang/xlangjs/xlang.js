"use strict";
(function() {

Error.stackTraceLimit = Infinity;

var $global, $module;
if (typeof window !== "undefined") { /* web page */
  $global = window;
} else if (typeof self !== "undefined") { /* web worker */
  $global = self;
} else if (typeof global !== "undefined") { /* Node.js */
  $global = global;
  $global.require = require;
} else {
  console.log("warning: no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}

var $packages = {}, $reflect, $idCounter = 0;
var $keys = function(m) { return m ? Object.keys(m) : []; };
var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};

var $mapArray = function(array, f) {
  var newArray = new array.constructor(array.length), i;
  for (i = 0; i < array.length; i++) {
    newArray[i] = f(array[i]);
  }
  return newArray;
};

var $methodVal = function(recv, name) {
  var vals = recv.$methodVals || {};
  recv.$methodVals = vals; /* noop for primitives */
  var f = vals[name];
  if (f !== undefined) {
    return f;
  }
  var method = recv[name];
  f = function() {
    $stackDepthOffset--;
    try {
      return method.apply(recv, arguments);
    } finally {
      $stackDepthOffset++;
    }
  };
  vals[name] = f;
  return f;
};

var $methodExpr = function(method) {
  if (method.$expr === undefined) {
    method.$expr = function() {
      $stackDepthOffset--;
      try {
        return Function.call.apply(method, arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return method.$expr;
};

var $subslice = function(slice, low, high, max) {
  if (low < 0 || high < low || max < high || high > slice.$capacity || max > slice.$capacity) {
    $throwRuntimeError("slice bounds out of range");
  }
  var s = new slice.constructor(slice.$array);
  s.$offset = slice.$offset + low;
  s.$length = slice.$length - low;
  s.$capacity = slice.$capacity - low;
  if (high !== undefined) {
    s.$length = high - low;
  }
  if (max !== undefined) {
    s.$capacity = max - low;
  }
  return s;
};

var $sliceToArray = function(slice) {
  if (slice.$length === 0) {
    return [];
  }
  if (slice.$array.constructor !== Array) {
    return slice.$array.subarray(slice.$offset, slice.$offset + slice.$length);
  }
  return slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
};

var $decodeRune = function(str, pos) {
  var c0 = str.charCodeAt(pos);

  if (c0 < 0x80) {
    return [c0, 1];
  }

  if (c0 !== c0 || c0 < 0xC0) {
    return [0xFFFD, 1];
  }

  var c1 = str.charCodeAt(pos + 1);
  if (c1 !== c1 || c1 < 0x80 || 0xC0 <= c1) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xE0) {
    var r = (c0 & 0x1F) << 6 | (c1 & 0x3F);
    if (r <= 0x7F) {
      return [0xFFFD, 1];
    }
    return [r, 2];
  }

  var c2 = str.charCodeAt(pos + 2);
  if (c2 !== c2 || c2 < 0x80 || 0xC0 <= c2) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF0) {
    var r = (c0 & 0x0F) << 12 | (c1 & 0x3F) << 6 | (c2 & 0x3F);
    if (r <= 0x7FF) {
      return [0xFFFD, 1];
    }
    if (0xD800 <= r && r <= 0xDFFF) {
      return [0xFFFD, 1];
    }
    return [r, 3];
  }

  var c3 = str.charCodeAt(pos + 3);
  if (c3 !== c3 || c3 < 0x80 || 0xC0 <= c3) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF8) {
    var r = (c0 & 0x07) << 18 | (c1 & 0x3F) << 12 | (c2 & 0x3F) << 6 | (c3 & 0x3F);
    if (r <= 0xFFFF || 0x10FFFF < r) {
      return [0xFFFD, 1];
    }
    return [r, 4];
  }

  return [0xFFFD, 1];
};

var $encodeRune = function(r) {
  if (r < 0 || r > 0x10FFFF || (0xD800 <= r && r <= 0xDFFF)) {
    r = 0xFFFD;
  }
  if (r <= 0x7F) {
    return String.fromCharCode(r);
  }
  if (r <= 0x7FF) {
    return String.fromCharCode(0xC0 | r >> 6, 0x80 | (r & 0x3F));
  }
  if (r <= 0xFFFF) {
    return String.fromCharCode(0xE0 | r >> 12, 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
  }
  return String.fromCharCode(0xF0 | r >> 18, 0x80 | (r >> 12 & 0x3F), 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
};

var $stringToBytes = function(str) {
  var array = new Uint8Array(str.length), i;
  for (i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};

var $bytesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "", i;
  for (i = 0; i < slice.$length; i += 10000) {
    str += String.fromCharCode.apply(null, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
  }
  return str;
};

var $stringToRunes = function(str) {
  var array = new Int32Array(str.length);
  var rune, i, j = 0;
  for (i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};

var $runesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "", i;
  for (i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};

var $copyString = function(dst, src) {
  var n = Math.min(src.length, dst.$length), i;
  for (i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};

var $copySlice = function(dst, src) {
  var n = Math.min(src.$length, dst.$length), i;
  $internalCopy(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copy = function(dst, src, type) {
  var i;
  switch (type.kind) {
  case "Array":
    $internalCopy(dst, src, 0, 0, src.length, type.elem);
    return true;
  case "Struct":
    for (i = 0; i < type.fields.length; i++) {
      var field = type.fields[i];
      var name = field[0];
      if (!$copy(dst[name], src[name], field[3])) {
        dst[name] = src[name];
      }
    }
    return true;
  default:
    return false;
  }
};

var $internalCopy = function(dst, src, dstOffset, srcOffset, n, elem) {
  var i;
  if (n === 0) {
    return;
  }

  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }

  switch (elem.kind) {
  case "Array":
  case "Struct":
    for (i = 0; i < n; i++) {
      $copy(dst[dstOffset + i], src[srcOffset + i], elem);
    }
    return;
  }

  for (i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};

var $clone = function(src, type) {
  var clone = type.zero();
  $copy(clone, src, type);
  return clone;
};

var $append = function(slice) {
  return $internalAppend(slice, arguments, 1, arguments.length - 1);
};

var $appendSlice = function(slice, toAppend) {
  return $internalAppend(slice, toAppend.$array, toAppend.$offset, toAppend.$length);
};

var $internalAppend = function(slice, array, offset, length) {
  if (length === 0) {
    return slice;
  }

  var newArray = slice.$array;
  var newOffset = slice.$offset;
  var newLength = slice.$length + length;
  var newCapacity = slice.$capacity;

  if (newLength > newCapacity) {
    newOffset = 0;
    newCapacity = Math.max(newLength, slice.$capacity < 1024 ? slice.$capacity * 2 : Math.floor(slice.$capacity * 5 / 4));

    if (slice.$array.constructor === Array) {
      newArray = slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
      newArray.length = newCapacity;
      var zero = slice.constructor.elem.zero, i;
      for (i = slice.$length; i < newCapacity; i++) {
        newArray[i] = zero();
      }
    } else {
      newArray = new slice.$array.constructor(newCapacity);
      newArray.set(slice.$array.subarray(slice.$offset, slice.$offset + slice.$length));
    }
  }

  $internalCopy(newArray, array, newOffset + slice.$length, offset, length, slice.constructor.elem);

  var newSlice = new slice.constructor(newArray);
  newSlice.$offset = newOffset;
  newSlice.$length = newLength;
  newSlice.$capacity = newCapacity;
  return newSlice;
};

var $equal = function(a, b, type) {
  if (a === b) {
    return true;
  }
  var i;
  switch (type.kind) {
  case "Float32":
    return $float32IsEqual(a, b);
  case "Complex64":
    return $float32IsEqual(a.$real, b.$real) && $float32IsEqual(a.$imag, b.$imag);
  case "Complex128":
    return a.$real === b.$real && a.$imag === b.$imag;
  case "Int64":
  case "Uint64":
    return a.$high === b.$high && a.$low === b.$low;
  case "Ptr":
    if (a.constructor.Struct) {
      return false;
    }
    return $pointerIsEqual(a, b);
  case "Array":
    if (a.length != b.length) {
      return false;
    }
    var i;
    for (i = 0; i < a.length; i++) {
      if (!$equal(a[i], b[i], type.elem)) {
        return false;
      }
    }
    return true;
  case "Struct":
    for (i = 0; i < type.fields.length; i++) {
      var field = type.fields[i];
      var name = field[0];
      if (!$equal(a[name], b[name], field[3])) {
        return false;
      }
    }
    return true;
  default:
    return false;
  }
};

var $interfaceIsEqual = function(a, b) {
  if (a === null || b === null || a === undefined || b === undefined || a.constructor !== b.constructor) {
    return a === b;
  }
  switch (a.constructor.kind) {
  case "Func":
  case "Map":
  case "Slice":
  case "Struct":
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  case undefined: /* js.Object */
    return a === b;
  default:
    return $equal(a.$val, b.$val, a.constructor);
  }
};

var $float32IsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a === 0 || b === 0 || a === 1/0 || b === 1/0 || a === -1/0 || b === -1/0 || a !== a || b !== b) {
    return false;
  }
  var math = $packages["math"];
  return math !== undefined && math.Float32bits(a) === math.Float32bits(b);
};

var $pointerIsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a.$get === $throwNilPointerError || b.$get === $throwNilPointerError) {
    return a.$get === $throwNilPointerError && b.$get === $throwNilPointerError;
  }
  var va = a.$get();
  var vb = b.$get();
  if (va !== vb) {
    return false;
  }
  var dummy = va + 1;
  a.$set(dummy);
  var equal = b.$get() === dummy;
  a.$set(va);
  return equal;
};

var $newType = function(size, kind, string, name, pkgPath, constructor) {
  var typ;
  switch(kind) {
  case "Bool":
  case "Int":
  case "Int8":
  case "Int16":
  case "Int32":
  case "Uint":
  case "Uint8" :
  case "Uint16":
  case "Uint32":
  case "Uintptr":
  case "String":
  case "UnsafePointer":
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + this.$val; };
    break;

  case "Float32":
  case "Float64":
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + $floatKey(this.$val); };
    break;

  case "Int64":
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case "Uint64":
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case "Complex64":
  case "Complex128":
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$real + "$" + this.$imag; };
    break;

  case "Array":
    typ = function(v) { this.$val = v; };
    typ.Ptr = $newType(4, "Ptr", "*" + string, "", "", function(array) {
      this.$get = function() { return array; };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.prototype.$key = function() {
        return string + "$" + Array.prototype.join.call($mapArray(this.$val, function(e) {
          var key = e.$key ? e.$key() : String(e);
          return key.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.extendReflectType = function(rt) {
        rt.arrayType = new $reflect.arrayType.Ptr(rt, elem.reflectType(), undefined, len);
      };
      typ.Ptr.init(typ);
      Object.defineProperty(typ.Ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case "Chan":
    typ = function(capacity) {
      this.$val = this;
      this.$capacity = capacity;
      this.$buffer = [];
      this.$sendQueue = [];
      this.$recvQueue = [];
      this.$closed = false;
    };
    typ.prototype.$key = function() {
      if (this.$id === undefined) {
        $idCounter++;
        this.$id = $idCounter;
      }
      return String(this.$id);
    };
    typ.init = function(elem, sendOnly, recvOnly) {
      typ.elem = elem;
      typ.sendOnly = sendOnly;
      typ.recvOnly = recvOnly;
      typ.nil = new typ(0);
      typ.nil.$sendQueue = typ.nil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; }, indexOf: function() { return -1; } };
      typ.extendReflectType = function(rt) {
        rt.chanType = new $reflect.chanType.Ptr(rt, elem.reflectType(), sendOnly ? $reflect.SendDir : (recvOnly ? $reflect.RecvDir : $reflect.BothDir));
      };
    };
    break;

  case "Func":
    typ = function(v) { this.$val = v; };
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.extendReflectType = function(rt) {
        var typeSlice = ($sliceType($ptrType($reflect.rtype.Ptr)));
        rt.funcType = new $reflect.funcType.Ptr(rt, variadic, new typeSlice($mapArray(params, function(p) { return p.reflectType(); })), new typeSlice($mapArray(results, function(p) { return p.reflectType(); })));
      };
    };
    break;

  case "Interface":
    typ = { implementedBy: {}, missingMethodFor: {} };
    typ.init = function(methods) {
      typ.methods = methods;
      typ.extendReflectType = function(rt) {
        var imethods = $mapArray(methods, function(m) {
          return new $reflect.imethod.Ptr($newStringPtr(m[1]), $newStringPtr(m[2]), m[3].reflectType());
        });
        var methodSlice = ($sliceType($ptrType($reflect.imethod.Ptr)));
        rt.interfaceType = new $reflect.interfaceType.Ptr(rt, new methodSlice(imethods));
      };
    };
    break;

  case "Map":
    typ = function(v) { this.$val = v; };
    typ.init = function(key, elem) {
      typ.key = key;
      typ.elem = elem;
      typ.extendReflectType = function(rt) {
        rt.mapType = new $reflect.mapType.Ptr(rt, key.reflectType(), elem.reflectType(), undefined, undefined);
      };
    };
    break;

  case "Ptr":
    typ = constructor || function(getter, setter, target) {
      this.$get = getter;
      this.$set = setter;
      this.$target = target;
      this.$val = this;
    };
    typ.prototype.$key = function() {
      if (this.$id === undefined) {
        $idCounter++;
        this.$id = $idCounter;
      }
      return String(this.$id);
    };
    typ.init = function(elem) {
      typ.nil = new typ($throwNilPointerError, $throwNilPointerError);
      typ.extendReflectType = function(rt) {
        rt.ptrType = new $reflect.ptrType.Ptr(rt, elem.reflectType());
      };
    };
    break;

  case "Slice":
    var nativeArray;
    typ = function(array) {
      if (array.constructor !== nativeArray) {
        array = new nativeArray(array);
      }
      this.$array = array;
      this.$offset = 0;
      this.$length = array.length;
      this.$capacity = array.length;
      this.$val = this;
    };
    typ.make = function(length, capacity) {
      capacity = capacity || length;
      var array = new nativeArray(capacity), i;
      if (nativeArray === Array) {
        for (i = 0; i < capacity; i++) {
          array[i] = typ.elem.zero();
        }
      }
      var slice = new typ(array);
      slice.$length = length;
      return slice;
    };
    typ.init = function(elem) {
      typ.elem = elem;
      nativeArray = $nativeArray(elem.kind);
      typ.nil = new typ([]);
      typ.extendReflectType = function(rt) {
        rt.sliceType = new $reflect.sliceType.Ptr(rt, elem.reflectType());
      };
    };
    break;

  case "Struct":
    typ = function(v) { this.$val = v; };
    typ.Ptr = $newType(4, "Ptr", "*" + string, "", "", constructor);
    typ.Ptr.Struct = typ;
    typ.Ptr.prototype.$get = function() { return this; };
    typ.init = function(fields) {
      var i;
      typ.fields = fields;
      typ.prototype.$key = function() {
        var val = this.$val;
        return string + "$" + $mapArray(fields, function(field) {
          var e = val[field[0]];
          var key = e.$key ? e.$key() : String(e);
          return key.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }).join("$");
      };
      typ.Ptr.extendReflectType = function(rt) {
        rt.ptrType = new $reflect.ptrType.Ptr(rt, typ.reflectType());
      };
      /* nil value */
      typ.Ptr.nil = Object.create(constructor.prototype);
      typ.Ptr.nil.$val = typ.Ptr.nil;
      for (i = 0; i < fields.length; i++) {
        var field = fields[i];
        Object.defineProperty(typ.Ptr.nil, field[0], { get: $throwNilPointerError, set: $throwNilPointerError });
      }
      /* methods for embedded fields */
      for (i = 0; i < typ.methods.length; i++) {
        var m = typ.methods[i];
        if (m[4] != -1) {
          (function(field, methodName) {
            typ.prototype[methodName] = function() {
              var v = this.$val[field[0]];
              return v[methodName].apply(v, arguments);
            };
          })(fields[m[4]], m[0]);
        }
      }
      for (i = 0; i < typ.Ptr.methods.length; i++) {
        var m = typ.Ptr.methods[i];
        if (m[4] != -1) {
          (function(field, methodName) {
            typ.Ptr.prototype[methodName] = function() {
              var v = this[field[0]];
              if (v.$val === undefined) {
                v = new field[3](v);
              }
              return v[methodName].apply(v, arguments);
            };
          })(fields[m[4]], m[0]);
        }
      }
      /* reflect type */
      typ.extendReflectType = function(rt) {
        var reflectFields = new Array(fields.length), i;
        for (i = 0; i < fields.length; i++) {
          var field = fields[i];
          reflectFields[i] = new $reflect.structField.Ptr($newStringPtr(field[1]), $newStringPtr(field[2]), field[3].reflectType(), $newStringPtr(field[4]), i);
        }
        rt.structType = new $reflect.structType.Ptr(rt, new ($sliceType($reflect.structField.Ptr))(reflectFields));
      };
    };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  switch(kind) {
  case "Bool":
  case "Map":
    typ.zero = function() { return false; };
    break;

  case "Int":
  case "Int8":
  case "Int16":
  case "Int32":
  case "Uint":
  case "Uint8" :
  case "Uint16":
  case "Uint32":
  case "Uintptr":
  case "UnsafePointer":
  case "Float32":
  case "Float64":
    typ.zero = function() { return 0; };
    break;

  case "String":
    typ.zero = function() { return ""; };
    break;

  case "Int64":
  case "Uint64":
  case "Complex64":
  case "Complex128":
    var zero = new typ(0, 0);
    typ.zero = function() { return zero; };
    break;

  case "Chan":
  case "Ptr":
  case "Slice":
    typ.zero = function() { return typ.nil; };
    break;

  case "Func":
    typ.zero = function() { return $throwNilPointerError; };
    break;

  case "Interface":
    typ.zero = function() { return $ifaceNil; };
    break;

  case "Array":
    typ.zero = function() {
      var arrayClass = $nativeArray(typ.elem.kind);
      if (arrayClass !== Array) {
        return new arrayClass(typ.len);
      }
      var array = new Array(typ.len), i;
      for (i = 0; i < typ.len; i++) {
        array[i] = typ.elem.zero();
      }
      return array;
    };
    break;

  case "Struct":
    typ.zero = function() { return new typ.Ptr(); };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  typ.kind = kind;
  typ.string = string;
  typ.typeName = name;
  typ.pkgPath = pkgPath;
  typ.methods = [];
  var rt = null;
  typ.reflectType = function() {
    if (rt === null) {
      rt = new $reflect.rtype.Ptr(size, 0, 0, 0, 0, $reflect.kinds[kind], undefined, undefined, $newStringPtr(string), undefined, undefined);
      rt.jsType = typ;

      var methods = [];
      if (typ.methods !== undefined) {
        var i;
        for (i = 0; i < typ.methods.length; i++) {
          var m = typ.methods[i];
          var t = m[3];
          methods.push(new $reflect.method.Ptr($newStringPtr(m[1]), $newStringPtr(m[2]), t.reflectType(), $funcType([typ].concat(t.params), t.results, t.variadic).reflectType(), undefined, undefined));
        }
      }
      if (name !== "" || methods.length !== 0) {
        var methodSlice = ($sliceType($ptrType($reflect.method.Ptr)));
        rt.uncommonType = new $reflect.uncommonType.Ptr($newStringPtr(name), $newStringPtr(pkgPath), new methodSlice(methods));
        rt.uncommonType.jsType = typ;
      }

      if (typ.extendReflectType !== undefined) {
        typ.extendReflectType(rt);
      }
    }
    return rt;
  };
  return typ;
};

var $Bool          = $newType( 1, "Bool",          "bool",           "bool",       "", null);
var $Int           = $newType( 4, "Int",           "int",            "int",        "", null);
var $Int8          = $newType( 1, "Int8",          "int8",           "int8",       "", null);
var $Int16         = $newType( 2, "Int16",         "int16",          "int16",      "", null);
var $Int32         = $newType( 4, "Int32",         "int32",          "int32",      "", null);
var $Int64         = $newType( 8, "Int64",         "int64",          "int64",      "", null);
var $Uint          = $newType( 4, "Uint",          "uint",           "uint",       "", null);
var $Uint8         = $newType( 1, "Uint8",         "uint8",          "uint8",      "", null);
var $Uint16        = $newType( 2, "Uint16",        "uint16",         "uint16",     "", null);
var $Uint32        = $newType( 4, "Uint32",        "uint32",         "uint32",     "", null);
var $Uint64        = $newType( 8, "Uint64",        "uint64",         "uint64",     "", null);
var $Uintptr       = $newType( 4, "Uintptr",       "uintptr",        "uintptr",    "", null);
var $Float32       = $newType( 4, "Float32",       "float32",        "float32",    "", null);
var $Float64       = $newType( 8, "Float64",       "float64",        "float64",    "", null);
var $Complex64     = $newType( 8, "Complex64",     "complex64",      "complex64",  "", null);
var $Complex128    = $newType(16, "Complex128",    "complex128",     "complex128", "", null);
var $String        = $newType( 8, "String",        "string",         "string",     "", null);
var $UnsafePointer = $newType( 4, "UnsafePointer", "unsafe.Pointer", "Pointer",    "", null);

var $nativeArray = function(elemKind) {
  return ({ Int: Int32Array, Int8: Int8Array, Int16: Int16Array, Int32: Int32Array, Uint: Uint32Array, Uint8: Uint8Array, Uint16: Uint16Array, Uint32: Uint32Array, Uintptr: Uint32Array, Float32: Float32Array, Float64: Float64Array })[elemKind] || Array;
};
var $toNativeArray = function(elemKind, array) {
  var nativeArray = $nativeArray(elemKind);
  if (nativeArray === Array) {
    return array;
  }
  return new nativeArray(array);
};
var $arrayTypes = {};
var $arrayType = function(elem, len) {
  var string = "[" + len + "]" + elem.string;
  var typ = $arrayTypes[string];
  if (typ === undefined) {
    typ = $newType(12, "Array", string, "", "", null);
    typ.init(elem, len);
    $arrayTypes[string] = typ;
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ") + elem.string;
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, "Chan", string, "", "", null);
    typ.init(elem, sendOnly, recvOnly);
    elem[field] = typ;
  }
  return typ;
};

var $funcTypes = {};
var $funcType = function(params, results, variadic) {
  var paramTypes = $mapArray(params, function(p) { return p.string; });
  if (variadic) {
    paramTypes[paramTypes.length - 1] = "..." + paramTypes[paramTypes.length - 1].substr(2);
  }
  var string = "func(" + paramTypes.join(", ") + ")";
  if (results.length === 1) {
    string += " " + results[0].string;
  } else if (results.length > 1) {
    string += " (" + $mapArray(results, function(r) { return r.string; }).join(", ") + ")";
  }
  var typ = $funcTypes[string];
  if (typ === undefined) {
    typ = $newType(4, "Func", string, "", "", null);
    typ.init(params, results, variadic);
    $funcTypes[string] = typ;
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var string = "interface {}";
  if (methods.length !== 0) {
    string = "interface { " + $mapArray(methods, function(m) {
      return (m[2] !== "" ? m[2] + "." : "") + m[1] + m[3].string.substr(4);
    }).join("; ") + " }";
  }
  var typ = $interfaceTypes[string];
  if (typ === undefined) {
    typ = $newType(8, "Interface", string, "", "", null);
    typ.init(methods);
    $interfaceTypes[string] = typ;
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = { $key: function() { return "nil"; } };
var $error = $newType(8, "Interface", "error", "error", "", null);
$error.init([["Error", "Error", "", $funcType([], [$String], false)]]);

var $Map = function() {};
(function() {
  var names = Object.getOwnPropertyNames(Object.prototype), i;
  for (i = 0; i < names.length; i++) {
    $Map.prototype[names[i]] = undefined;
  }
})();
var $mapTypes = {};
var $mapType = function(key, elem) {
  var string = "map[" + key.string + "]" + elem.string;
  var typ = $mapTypes[string];
  if (typ === undefined) {
    typ = $newType(4, "Map", string, "", "", null);
    typ.init(key, elem);
    $mapTypes[string] = typ;
  }
  return typ;
};


var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };
var $ptrType = function(elem) {
  var typ = elem.Ptr;
  if (typ === undefined) {
    typ = $newType(4, "Ptr", "*" + elem.string, "", "", null);
    typ.init(elem);
    elem.Ptr = typ;
  }
  return typ;
};

var $stringPtrMap = new $Map();
var $newStringPtr = function(str) {
  if (str === undefined || str === "") {
    return $ptrType($String).nil;
  }
  var ptr = $stringPtrMap[str];
  if (ptr === undefined) {
    ptr = new ($ptrType($String))(function() { return str; }, function(v) { str = v; });
    $stringPtrMap[str] = ptr;
  }
  return ptr;
};

var $newDataPointer = function(data, constructor) {
  if (constructor.Struct) {
    return data;
  }
  return new constructor(function() { return data; }, function(v) { data = v; });
};

var $sliceType = function(elem) {
  var typ = elem.Slice;
  if (typ === undefined) {
    typ = $newType(12, "Slice", "[]" + elem.string, "", "", null);
    typ.init(elem);
    elem.Slice = typ;
  }
  return typ;
};

var $structTypes = {};
var $structType = function(fields) {
  var string = "struct { " + $mapArray(fields, function(f) {
    return f[1] + " " + f[3].string + (f[4] !== "" ? (" \"" + f[4].replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
  }).join("; ") + " }";
  if (fields.length === 0) {
    string = "struct {}";
  }
  var typ = $structTypes[string];
  if (typ === undefined) {
    typ = $newType(0, "Struct", string, "", "", function() {
      this.$val = this;
      var i;
      for (i = 0; i < fields.length; i++) {
        var field = fields[i];
        var arg = arguments[i];
        this[field[0]] = arg !== undefined ? arg : field[3].zero();
      }
    });
    /* collect methods for anonymous fields */
    var i, j;
    for (i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field[1] === "") {
        var methods = field[3].methods;
        for (j = 0; j < methods.length; j++) {
          var m = methods[j].slice(0, 6).concat([i]);
          typ.methods.push(m);
          typ.Ptr.methods.push(m);
        }
        if (field[3].kind === "Struct") {
          var methods = field[3].Ptr.methods;
          for (j = 0; j < methods.length; j++) {
            typ.Ptr.methods.push(methods[j].slice(0, 6).concat([i]));
          }
        }
      }
    }
    typ.init(fields);
    $structTypes[string] = typ;
  }
  return typ;
};

var $assertType = function(value, type, returnTuple) {
  var isInterface = (type.kind === "Interface"), ok, missingMethod = "";
  if (value === $ifaceNil) {
    ok = false;
  } else if (!isInterface) {
    ok = value.constructor === type;
  } else if (type.string === "js.Object") {
    ok = true;
  } else {
    var valueTypeString = value.constructor.string;
    ok = type.implementedBy[valueTypeString];
    if (ok === undefined) {
      ok = true;
      var valueMethods = value.constructor.methods;
      var typeMethods = type.methods;
      for (var i = 0; i < typeMethods.length; i++) {
        var tm = typeMethods[i];
        var found = false;
        for (var j = 0; j < valueMethods.length; j++) {
          var vm = valueMethods[j];
          if (vm[1] === tm[1] && vm[2] === tm[2] && vm[3] === tm[3]) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          type.missingMethodFor[valueTypeString] = tm[1];
          break;
        }
      }
      type.implementedBy[valueTypeString] = ok;
    }
    if (!ok) {
      missingMethod = type.missingMethodFor[valueTypeString];
    }
  }

  if (!ok) {
    if (returnTuple) {
      return [type.zero(), false];
    }
    $panic(new $packages["runtime"].TypeAssertionError.Ptr("", (value === $ifaceNil ? "" : value.constructor.string), type.string, missingMethod));
  }

  if (!isInterface) {
    value = value.$val;
  }
  return returnTuple ? [value, true] : value;
};

var $coerceFloat32 = function(f) {
  var math = $packages["math"];
  if (math === undefined) {
    return f;
  }
  return math.Float32frombits(math.Float32bits(f));
};

var $floatKey = function(f) {
  if (f !== f) {
    $idCounter++;
    return "NaN$" + $idCounter;
  }
  return String(f);
};

var $flatten64 = function(x) {
  return x.$high * 4294967296 + x.$low;
};

var $shiftLeft64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high << y | x.$low >>> (32 - y), (x.$low << y) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$low << (y - 32), 0);
  }
  return new x.constructor(0, 0);
};

var $shiftRightInt64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$high >> 31, (x.$high >> (y - 32)) >>> 0);
  }
  if (x.$high < 0) {
    return new x.constructor(-1, 4294967295);
  }
  return new x.constructor(0, 0);
};

var $shiftRightUint64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >>> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(0, x.$high >>> (y - 32));
  }
  return new x.constructor(0, 0);
};

var $mul64 = function(x, y) {
  var high = 0, low = 0, i;
  if ((y.$low & 1) !== 0) {
    high = x.$high;
    low = x.$low;
  }
  for (i = 1; i < 32; i++) {
    if ((y.$low & 1<<i) !== 0) {
      high += x.$high << i | x.$low >>> (32 - i);
      low += (x.$low << i) >>> 0;
    }
  }
  for (i = 0; i < 32; i++) {
    if ((y.$high & 1<<i) !== 0) {
      high += x.$low << i;
    }
  }
  return new x.constructor(high, low);
};

var $div64 = function(x, y, returnRemainder) {
  if (y.$high === 0 && y.$low === 0) {
    $throwRuntimeError("integer divide by zero");
  }

  var s = 1;
  var rs = 1;

  var xHigh = x.$high;
  var xLow = x.$low;
  if (xHigh < 0) {
    s = -1;
    rs = -1;
    xHigh = -xHigh;
    if (xLow !== 0) {
      xHigh--;
      xLow = 4294967296 - xLow;
    }
  }

  var yHigh = y.$high;
  var yLow = y.$low;
  if (y.$high < 0) {
    s *= -1;
    yHigh = -yHigh;
    if (yLow !== 0) {
      yHigh--;
      yLow = 4294967296 - yLow;
    }
  }

  var high = 0, low = 0, n = 0, i;
  while (yHigh < 2147483648 && ((xHigh > yHigh) || (xHigh === yHigh && xLow > yLow))) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = (yLow << 1) >>> 0;
    n++;
  }
  for (i = 0; i <= n; i++) {
    high = high << 1 | low >>> 31;
    low = (low << 1) >>> 0;
    if ((xHigh > yHigh) || (xHigh === yHigh && xLow >= yLow)) {
      xHigh = xHigh - yHigh;
      xLow = xLow - yLow;
      if (xLow < 0) {
        xHigh--;
        xLow += 4294967296;
      }
      low++;
      if (low === 4294967296) {
        high++;
        low = 0;
      }
    }
    yLow = (yLow >>> 1 | yHigh << (32 - 1)) >>> 0;
    yHigh = yHigh >>> 1;
  }

  if (returnRemainder) {
    return new x.constructor(xHigh * rs, xLow * rs);
  }
  return new x.constructor(high * s, low * s);
};

var $divComplex = function(n, d) {
  var ninf = n.$real === 1/0 || n.$real === -1/0 || n.$imag === 1/0 || n.$imag === -1/0;
  var dinf = d.$real === 1/0 || d.$real === -1/0 || d.$imag === 1/0 || d.$imag === -1/0;
  var nnan = !ninf && (n.$real !== n.$real || n.$imag !== n.$imag);
  var dnan = !dinf && (d.$real !== d.$real || d.$imag !== d.$imag);
  if(nnan || dnan) {
    return new n.constructor(0/0, 0/0);
  }
  if (ninf && !dinf) {
    return new n.constructor(1/0, 1/0);
  }
  if (!ninf && dinf) {
    return new n.constructor(0, 0);
  }
  if (d.$real === 0 && d.$imag === 0) {
    if (n.$real === 0 && n.$imag === 0) {
      return new n.constructor(0/0, 0/0);
    }
    return new n.constructor(1/0, 1/0);
  }
  var a = Math.abs(d.$real);
  var b = Math.abs(d.$imag);
  if (a <= b) {
    var ratio = d.$real / d.$imag;
    var denom = d.$real * ratio + d.$imag;
    return new n.constructor((n.$real * ratio + n.$imag) / denom, (n.$imag * ratio - n.$real) / denom);
  }
  var ratio = d.$imag / d.$real;
  var denom = d.$imag * ratio + d.$real;
  return new n.constructor((n.$imag * ratio + n.$real) / denom, (n.$imag - n.$real * ratio) / denom);
};

var $stackDepthOffset = 0;
var $getStackDepth = function() {
  var err = new Error();
  if (err.stack === undefined) {
    return undefined;
  }
  return $stackDepthOffset + err.stack.split("\n").length;
};

var $deferFrames = [], $skippedDeferFrames = 0, $jumpToDefer = false, $panicStackDepth = null, $panicValue;
var $callDeferred = function(deferred, jsErr) {
  if ($skippedDeferFrames !== 0) {
    $skippedDeferFrames--;
    throw jsErr;
  }
  if ($jumpToDefer) {
    $jumpToDefer = false;
    throw jsErr;
  }
  if (jsErr) {
    var newErr = null;
    try {
      $deferFrames.push(deferred);
      $panic(new $packages["github.com/gopherjs/gopherjs/js"].Error.Ptr(jsErr));
    } catch (err) {
      newErr = err;
    }
    $deferFrames.pop();
    $callDeferred(deferred, newErr);
    return;
  }

  $stackDepthOffset--;
  var outerPanicStackDepth = $panicStackDepth;
  var outerPanicValue = $panicValue;

  var localPanicValue = $curGoroutine.panicStack.pop();
  if (localPanicValue !== undefined) {
    $panicStackDepth = $getStackDepth();
    $panicValue = localPanicValue;
  }

  var call;
  try {
    while (true) {
      if (deferred === null) {
        deferred = $deferFrames[$deferFrames.length - 1 - $skippedDeferFrames];
        if (deferred === undefined) {
          if (localPanicValue.constructor === $String) {
            throw new Error(localPanicValue.$val);
          } else if (localPanicValue.Error !== undefined) {
            throw new Error(localPanicValue.Error());
          } else if (localPanicValue.String !== undefined) {
            throw new Error(localPanicValue.String());
          } else {
            throw new Error(localPanicValue);
          }
        }
      }
      var call = deferred.pop();
      if (call === undefined) {
        if (localPanicValue !== undefined) {
          $skippedDeferFrames++;
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(undefined, call[1]);
      if (r && r.$blocking) {
        deferred.push([r, []]);
      }

      if (localPanicValue !== undefined && $panicStackDepth === null) {
        throw null; /* error was recovered */
      }
    }
  } finally {
    if ($curGoroutine.asleep) {
      deferred.push(call);
      $jumpToDefer = true;
    }
    if (localPanicValue !== undefined) {
      if ($panicStackDepth !== null) {
        $curGoroutine.panicStack.push(localPanicValue);
      }
      $panicStackDepth = outerPanicStackDepth;
      $panicValue = outerPanicValue;
    }
    $stackDepthOffset++;
  }
};

var $panic = function(value) {
  $curGoroutine.panicStack.push(value);
  $callDeferred(null, null);
};
var $recover = function() {
  if ($panicStackDepth === null || ($panicStackDepth !== undefined && $panicStackDepth !== $getStackDepth() - 2)) {
    return $ifaceNil;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $nonblockingCall = function() {
  $panic(new $packages["runtime"].NotSupportedError.Ptr("non-blocking call to blocking function (mark call with \"//gopherjs:blocking\" to fix)"));
};
var $throw = function(err) { throw err; };
var $throwRuntimeError; /* set by package "runtime" */

var $dummyGoroutine = { asleep: false, exit: false, panicStack: [] };
var $curGoroutine = $dummyGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $go = function(fun, args, direct) {
  $totalGoroutines++;
  $awakeGoroutines++;
  args.push(true);
  var goroutine = function() {
    var rescheduled = false;
    try {
      $curGoroutine = goroutine;
      $skippedDeferFrames = 0;
      $jumpToDefer = false;
      var r = fun.apply(undefined, args);
      if (r && r.$blocking) {
        fun = r;
        args = [];
        $schedule(goroutine, direct);
        rescheduled = true;
        return;
      }
      goroutine.exit = true;
    } catch (err) {
      if (!$curGoroutine.asleep) {
        goroutine.exit = true;
        throw err;
      }
    } finally {
      $curGoroutine = $dummyGoroutine;
      if (goroutine.exit && !rescheduled) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        goroutine.asleep = true;
      }
      if (goroutine.asleep && !rescheduled) {
        $awakeGoroutines--;
        if ($awakeGoroutines === 0 && $totalGoroutines !== 0 && $checkForDeadlock) {
          console.error("fatal error: all goroutines are asleep - deadlock!");
        }
      }
    }
  };
  goroutine.asleep = false;
  goroutine.exit = false;
  goroutine.panicStack = [];
  $schedule(goroutine, direct);
};

var $scheduled = [], $schedulerLoopActive = false;
var $schedule = function(goroutine, direct) {
  if (goroutine.asleep) {
    goroutine.asleep = false;
    $awakeGoroutines++;
  }

  if (direct) {
    goroutine();
    return;
  }

  $scheduled.push(goroutine);
  if (!$schedulerLoopActive) {
    $schedulerLoopActive = true;
    setTimeout(function() {
      while (true) {
        var r = $scheduled.shift();
        if (r === undefined) {
          $schedulerLoopActive = false;
          break;
        }
        r();
      };
    }, 0);
  }
};

var $send = function(chan, value) {
  if (chan.$closed) {
    $throwRuntimeError("send on closed channel");
  }
  var queuedRecv = chan.$recvQueue.shift();
  if (queuedRecv !== undefined) {
    queuedRecv([value, true]);
    return;
  }
  if (chan.$buffer.length < chan.$capacity) {
    chan.$buffer.push(value);
    return;
  }

  var thisGoroutine = $curGoroutine;
  chan.$sendQueue.push(function() {
    $schedule(thisGoroutine);
    return value;
  });
  var blocked = false;
  var f = function() {
    if (blocked) {
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      return;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};
var $recv = function(chan) {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== undefined) {
    chan.$buffer.push(queuedSend());
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== undefined) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.constructor.elem.zero(), false];
  }

  var thisGoroutine = $curGoroutine, value;
  var queueEntry = function(v) {
    value = v;
    $schedule(thisGoroutine);
  };
  chan.$recvQueue.push(queueEntry);
  var blocked = false;
  var f = function() {
    if (blocked) {
      return value;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};
var $close = function(chan) {
  if (chan.$closed) {
    $throwRuntimeError("close of closed channel");
  }
  chan.$closed = true;
  while (true) {
    var queuedSend = chan.$sendQueue.shift();
    if (queuedSend === undefined) {
      break;
    }
    queuedSend(); /* will panic because of closed channel */
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === undefined) {
      break;
    }
    queuedRecv([chan.constructor.elem.zero(), false]);
  }
};
var $select = function(comms) {
  var ready = [], i;
  var selection = -1;
  for (i = 0; i < comms.length; i++) {
    var comm = comms[i];
    var chan = comm[0];
    switch (comm.length) {
    case 0: /* default */
      selection = i;
      break;
    case 1: /* recv */
      if (chan.$sendQueue.length !== 0 || chan.$buffer.length !== 0 || chan.$closed) {
        ready.push(i);
      }
      break;
    case 2: /* send */
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      if (chan.$recvQueue.length !== 0 || chan.$buffer.length < chan.$capacity) {
        ready.push(i);
      }
      break;
    }
  }

  if (ready.length !== 0) {
    selection = ready[Math.floor(Math.random() * ready.length)];
  }
  if (selection !== -1) {
    var comm = comms[selection];
    switch (comm.length) {
    case 0: /* default */
      return [selection];
    case 1: /* recv */
      return [selection, $recv(comm[0])];
    case 2: /* send */
      $send(comm[0], comm[1]);
      return [selection];
    }
  }

  var entries = [];
  var thisGoroutine = $curGoroutine;
  var removeFromQueues = function() {
    for (i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var queue = entry[0];
      var index = queue.indexOf(entry[1]);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };
  for (i = 0; i < comms.length; i++) {
    (function(i) {
      var comm = comms[i];
      switch (comm.length) {
      case 1: /* recv */
        var queueEntry = function(value) {
          selection = [i, value];
          removeFromQueues();
          $schedule(thisGoroutine);
        };
        entries.push([comm[0].$recvQueue, queueEntry]);
        comm[0].$recvQueue.push(queueEntry);
        break;
      case 2: /* send */
        var queueEntry = function() {
          if (comm[0].$closed) {
            $throwRuntimeError("send on closed channel");
          }
          selection = [i];
          removeFromQueues();
          $schedule(thisGoroutine);
          return comm[1];
        };
        entries.push([comm[0].$sendQueue, queueEntry]);
        comm[0].$sendQueue.push(queueEntry);
        break;
      }
    })(i);
  }
  var blocked = false;
  var f = function() {
    if (blocked) {
      return selection;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};

var $needsExternalization = function(t) {
  switch (t.kind) {
    case "Bool":
    case "Int":
    case "Int8":
    case "Int16":
    case "Int32":
    case "Uint":
    case "Uint8":
    case "Uint16":
    case "Uint32":
    case "Uintptr":
    case "Float32":
    case "Float64":
      return false;
    case "Interface":
      return t !== $packages["github.com/gopherjs/gopherjs/js"].Object;
    default:
      return true;
  }
};

var $externalize = function(v, t) {
  switch (t.kind) {
  case "Bool":
  case "Int":
  case "Int8":
  case "Int16":
  case "Int32":
  case "Uint":
  case "Uint8":
  case "Uint16":
  case "Uint32":
  case "Uintptr":
  case "Float32":
  case "Float64":
    return v;
  case "Int64":
  case "Uint64":
    return $flatten64(v);
  case "Array":
    if ($needsExternalization(t.elem)) {
      return $mapArray(v, function(e) { return $externalize(e, t.elem); });
    }
    return v;
  case "Func":
    if (v === $throwNilPointerError) {
      return null;
    }
    if (v.$externalizeWrapper === undefined) {
      $checkForDeadlock = false;
      var convert = false;
      var i;
      for (i = 0; i < t.params.length; i++) {
        convert = convert || (t.params[i] !== $packages["github.com/gopherjs/gopherjs/js"].Object);
      }
      for (i = 0; i < t.results.length; i++) {
        convert = convert || $needsExternalization(t.results[i]);
      }
      if (!convert) {
        return v;
      }
      v.$externalizeWrapper = function() {
        var args = [], i;
        for (i = 0; i < t.params.length; i++) {
          if (t.variadic && i === t.params.length - 1) {
            var vt = t.params[i].elem, varargs = [], j;
            for (j = i; j < arguments.length; j++) {
              varargs.push($internalize(arguments[j], vt));
            }
            args.push(new (t.params[i])(varargs));
            break;
          }
          args.push($internalize(arguments[i], t.params[i]));
        }
        var result = v.apply(this, args);
        switch (t.results.length) {
        case 0:
          return;
        case 1:
          return $externalize(result, t.results[0]);
        default:
          for (i = 0; i < t.results.length; i++) {
            result[i] = $externalize(result[i], t.results[i]);
          }
          return result;
        }
      };
    }
    return v.$externalizeWrapper;
  case "Interface":
    if (v === $ifaceNil) {
      return null;
    }
    if (t === $packages["github.com/gopherjs/gopherjs/js"].Object || v.constructor.kind === undefined) {
      return v;
    }
    return $externalize(v.$val, v.constructor);
  case "Map":
    var m = {};
    var keys = $keys(v), i;
    for (i = 0; i < keys.length; i++) {
      var entry = v[keys[i]];
      m[$externalize(entry.k, t.key)] = $externalize(entry.v, t.elem);
    }
    return m;
  case "Ptr":
    var o = {}, i;
    for (i = 0; i < t.methods.length; i++) {
      var m = t.methods[i];
      if (m[2] !== "") { /* not exported */
        continue;
      }
      (function(m) {
        o[m[1]] = $externalize(function() {
          return v[m[0]].apply(v, arguments);
        }, m[3]);
      })(m);
    }
    return o;
  case "Slice":
    if ($needsExternalization(t.elem)) {
      return $mapArray($sliceToArray(v), function(e) { return $externalize(e, t.elem); });
    }
    return $sliceToArray(v);
  case "String":
    var s = "", r, i, j = 0;
    for (i = 0; i < v.length; i += r[1], j++) {
      r = $decodeRune(v, i);
      s += String.fromCharCode(r[0]);
    }
    return s;
  case "Struct":
    var timePkg = $packages["time"];
    if (timePkg && v.constructor === timePkg.Time.Ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }
    var o = {}, i;
    for (i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (f[2] !== "") { /* not exported */
        continue;
      }
      o[f[1]] = $externalize(v[f[0]], f[3]);
    }
    return o;
  }
  $panic(new $String("cannot externalize " + t.string));
};

var $internalize = function(v, t, recv) {
  switch (t.kind) {
  case "Bool":
    return !!v;
  case "Int":
    return parseInt(v);
  case "Int8":
    return parseInt(v) << 24 >> 24;
  case "Int16":
    return parseInt(v) << 16 >> 16;
  case "Int32":
    return parseInt(v) >> 0;
  case "Uint":
    return parseInt(v);
  case "Uint8":
    return parseInt(v) << 24 >>> 24;
  case "Uint16":
    return parseInt(v) << 16 >>> 16;
  case "Uint32":
  case "Uintptr":
    return parseInt(v) >>> 0;
  case "Int64":
  case "Uint64":
    return new t(0, v);
  case "Float32":
  case "Float64":
    return parseFloat(v);
  case "Array":
    if (v.length !== t.len) {
      $throwRuntimeError("got array with wrong size from JavaScript native");
    }
    return $mapArray(v, function(e) { return $internalize(e, t.elem); });
  case "Func":
    return function() {
      var args = [], i;
      for (i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = arguments[i], j;
          for (j = 0; j < varargs.$length; j++) {
            args.push($externalize(varargs.$array[varargs.$offset + j], vt));
          }
          break;
        }
        args.push($externalize(arguments[i], t.params[i]));
      }
      var result = v.apply(recv, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $internalize(result, t.results[0]);
      default:
        for (i = 0; i < t.results.length; i++) {
          result[i] = $internalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  case "Interface":
    if (t === $packages["github.com/gopherjs/gopherjs/js"].Object) {
      return v;
    }
    if (v === null) {
      return $ifaceNil;
    }
    switch (v.constructor) {
    case Int8Array:
      return new ($sliceType($Int8))(v);
    case Int16Array:
      return new ($sliceType($Int16))(v);
    case Int32Array:
      return new ($sliceType($Int))(v);
    case Uint8Array:
      return new ($sliceType($Uint8))(v);
    case Uint16Array:
      return new ($sliceType($Uint16))(v);
    case Uint32Array:
      return new ($sliceType($Uint))(v);
    case Float32Array:
      return new ($sliceType($Float32))(v);
    case Float64Array:
      return new ($sliceType($Float64))(v);
    case Array:
      return $internalize(v, $sliceType($emptyInterface));
    case Boolean:
      return new $Bool(!!v);
    case Date:
      var timePkg = $packages["time"];
      if (timePkg) {
        return new timePkg.Time(timePkg.Unix(new $Int64(0, 0), new $Int64(0, v.getTime() * 1000000)));
      }
    case Function:
      var funcType = $funcType([$sliceType($emptyInterface)], [$packages["github.com/gopherjs/gopherjs/js"].Object], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      if ($global.Node && v instanceof $global.Node) {
        return v;
      }
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case "Map":
    var m = new $Map();
    var keys = $keys(v), i;
    for (i = 0; i < keys.length; i++) {
      var key = $internalize(keys[i], t.key);
      m[key.$key ? key.$key() : key] = { k: key, v: $internalize(v[keys[i]], t.elem) };
    }
    return m;
  case "Slice":
    return new t($mapArray(v, function(e) { return $internalize(e, t.elem); }));
  case "String":
    v = String(v);
    var s = "", i;
    for (i = 0; i < v.length; i++) {
      s += $encodeRune(v.charCodeAt(i));
    }
    return s;
  default:
    $panic(new $String("cannot internalize " + t.string));
  }
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, Object, Error, init;
	Object = $pkg.Object = $newType(8, "Interface", "js.Object", "Object", "github.com/gopherjs/gopherjs/js", null);
	Error = $pkg.Error = $newType(0, "Struct", "js.Error", "Error", "github.com/gopherjs/gopherjs/js", function(Object_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : $ifaceNil;
	});
	Error.Ptr.prototype.Error = function() {
		var err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	init = function() {
		var e;
		e = new Error.Ptr($ifaceNil);
	};
	$pkg.$init = function() {
		Object.init([["Bool", "Bool", "", $funcType([], [$Bool], false)], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [Object], true)], ["Delete", "Delete", "", $funcType([$String], [], false)], ["Float", "Float", "", $funcType([], [$Float64], false)], ["Get", "Get", "", $funcType([$String], [Object], false)], ["Index", "Index", "", $funcType([$Int], [Object], false)], ["Int", "Int", "", $funcType([], [$Int], false)], ["Int64", "Int64", "", $funcType([], [$Int64], false)], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false)], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [Object], true)], ["IsNull", "IsNull", "", $funcType([], [$Bool], false)], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false)], ["Length", "Length", "", $funcType([], [$Int], false)], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [Object], true)], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false)], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false)], ["Str", "Str", "", $funcType([], [$String], false)], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false)], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false)]]);
		Error.methods = [["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [Object], false), 0], ["Index", "Index", "", $funcType([$Int], [Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [Object], true), 0], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		($ptrType(Error)).methods = [["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Error", "Error", "", $funcType([], [$String], false), -1], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [Object], false), 0], ["Index", "Index", "", $funcType([$Int], [Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [Object], true), 0], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		Error.init([["Object", "", "", Object, ""]]);
		init();
	};
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], NotSupportedError, TypeAssertionError, errorString, MemStats, sizeof_C_MStats, init, getgoroot, Caller, Goexit, GOMAXPROCS, ReadMemStats, SetFinalizer, GOROOT, init$1;
	NotSupportedError = $pkg.NotSupportedError = $newType(0, "Struct", "runtime.NotSupportedError", "NotSupportedError", "runtime", function(Feature_) {
		this.$val = this;
		this.Feature = Feature_ !== undefined ? Feature_ : "";
	});
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, "Struct", "runtime.TypeAssertionError", "TypeAssertionError", "runtime", function(interfaceString_, concreteString_, assertedString_, missingMethod_) {
		this.$val = this;
		this.interfaceString = interfaceString_ !== undefined ? interfaceString_ : "";
		this.concreteString = concreteString_ !== undefined ? concreteString_ : "";
		this.assertedString = assertedString_ !== undefined ? assertedString_ : "";
		this.missingMethod = missingMethod_ !== undefined ? missingMethod_ : "";
	});
	errorString = $pkg.errorString = $newType(8, "String", "runtime.errorString", "errorString", "runtime", null);
	MemStats = $pkg.MemStats = $newType(0, "Struct", "runtime.MemStats", "MemStats", "runtime", function(Alloc_, TotalAlloc_, Sys_, Lookups_, Mallocs_, Frees_, HeapAlloc_, HeapSys_, HeapIdle_, HeapInuse_, HeapReleased_, HeapObjects_, StackInuse_, StackSys_, MSpanInuse_, MSpanSys_, MCacheInuse_, MCacheSys_, BuckHashSys_, GCSys_, OtherSys_, NextGC_, LastGC_, PauseTotalNs_, PauseNs_, NumGC_, EnableGC_, DebugGC_, BySize_) {
		this.$val = this;
		this.Alloc = Alloc_ !== undefined ? Alloc_ : new $Uint64(0, 0);
		this.TotalAlloc = TotalAlloc_ !== undefined ? TotalAlloc_ : new $Uint64(0, 0);
		this.Sys = Sys_ !== undefined ? Sys_ : new $Uint64(0, 0);
		this.Lookups = Lookups_ !== undefined ? Lookups_ : new $Uint64(0, 0);
		this.Mallocs = Mallocs_ !== undefined ? Mallocs_ : new $Uint64(0, 0);
		this.Frees = Frees_ !== undefined ? Frees_ : new $Uint64(0, 0);
		this.HeapAlloc = HeapAlloc_ !== undefined ? HeapAlloc_ : new $Uint64(0, 0);
		this.HeapSys = HeapSys_ !== undefined ? HeapSys_ : new $Uint64(0, 0);
		this.HeapIdle = HeapIdle_ !== undefined ? HeapIdle_ : new $Uint64(0, 0);
		this.HeapInuse = HeapInuse_ !== undefined ? HeapInuse_ : new $Uint64(0, 0);
		this.HeapReleased = HeapReleased_ !== undefined ? HeapReleased_ : new $Uint64(0, 0);
		this.HeapObjects = HeapObjects_ !== undefined ? HeapObjects_ : new $Uint64(0, 0);
		this.StackInuse = StackInuse_ !== undefined ? StackInuse_ : new $Uint64(0, 0);
		this.StackSys = StackSys_ !== undefined ? StackSys_ : new $Uint64(0, 0);
		this.MSpanInuse = MSpanInuse_ !== undefined ? MSpanInuse_ : new $Uint64(0, 0);
		this.MSpanSys = MSpanSys_ !== undefined ? MSpanSys_ : new $Uint64(0, 0);
		this.MCacheInuse = MCacheInuse_ !== undefined ? MCacheInuse_ : new $Uint64(0, 0);
		this.MCacheSys = MCacheSys_ !== undefined ? MCacheSys_ : new $Uint64(0, 0);
		this.BuckHashSys = BuckHashSys_ !== undefined ? BuckHashSys_ : new $Uint64(0, 0);
		this.GCSys = GCSys_ !== undefined ? GCSys_ : new $Uint64(0, 0);
		this.OtherSys = OtherSys_ !== undefined ? OtherSys_ : new $Uint64(0, 0);
		this.NextGC = NextGC_ !== undefined ? NextGC_ : new $Uint64(0, 0);
		this.LastGC = LastGC_ !== undefined ? LastGC_ : new $Uint64(0, 0);
		this.PauseTotalNs = PauseTotalNs_ !== undefined ? PauseTotalNs_ : new $Uint64(0, 0);
		this.PauseNs = PauseNs_ !== undefined ? PauseNs_ : ($arrayType($Uint64, 256)).zero();
		this.NumGC = NumGC_ !== undefined ? NumGC_ : 0;
		this.EnableGC = EnableGC_ !== undefined ? EnableGC_ : false;
		this.DebugGC = DebugGC_ !== undefined ? DebugGC_ : false;
		this.BySize = BySize_ !== undefined ? BySize_ : ($arrayType(($structType([["Size", "Size", "", $Uint32, ""], ["Mallocs", "Mallocs", "", $Uint64, ""], ["Frees", "Frees", "", $Uint64, ""]])), 61)).zero();
	});
	NotSupportedError.Ptr.prototype.Error = function() {
		var err;
		err = this;
		return "not supported by GopherJS: " + err.Feature;
	};
	NotSupportedError.prototype.Error = function() { return this.$val.Error(); };
	init = function() {
		var e;
		$throwRuntimeError = (function(msg) {
			$panic(new errorString(msg));
		});
		e = $ifaceNil;
		e = new TypeAssertionError.Ptr("", "", "", "");
		e = new NotSupportedError.Ptr("");
	};
	getgoroot = function() {
		var process, goroot;
		process = $global.process;
		if (process === undefined) {
			return "/";
		}
		goroot = process.env.GOROOT;
		if (goroot === undefined) {
			return "";
		}
		return $internalize(goroot, $String);
	};
	Caller = $pkg.Caller = function(skip) {
		var pc = 0, file = "", line = 0, ok = false, info, _tmp, _tmp$1, _tmp$2, _tmp$3, parts, _tmp$4, _tmp$5, _tmp$6, _tmp$7;
		info = new ($global.Error)().stack.split($externalize("\n", $String))[(skip + 2 >> 0)];
		if (info === undefined) {
			_tmp = 0; _tmp$1 = ""; _tmp$2 = 0; _tmp$3 = false; pc = _tmp; file = _tmp$1; line = _tmp$2; ok = _tmp$3;
			return [pc, file, line, ok];
		}
		parts = info.substring(($parseInt(info.indexOf($externalize("(", $String))) >> 0) + 1 >> 0, $parseInt(info.indexOf($externalize(")", $String))) >> 0).split($externalize(":", $String));
		_tmp$4 = 0; _tmp$5 = $internalize(parts[0], $String); _tmp$6 = $parseInt(parts[1]) >> 0; _tmp$7 = true; pc = _tmp$4; file = _tmp$5; line = _tmp$6; ok = _tmp$7;
		return [pc, file, line, ok];
	};
	Goexit = $pkg.Goexit = function() {
		$curGoroutine.exit = $externalize(true, $Bool);
		$throw(null);
	};
	GOMAXPROCS = $pkg.GOMAXPROCS = function(n) {
		if (n > 1) {
			$panic(new NotSupportedError.Ptr("GOMAXPROCS > 1"));
		}
		return 1;
	};
	ReadMemStats = $pkg.ReadMemStats = function(m$1) {
	};
	SetFinalizer = $pkg.SetFinalizer = function(x, f) {
	};
	TypeAssertionError.Ptr.prototype.RuntimeError = function() {
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.Ptr.prototype.Error = function() {
		var e, inter;
		e = this;
		inter = e.interfaceString;
		if (inter === "") {
			inter = "interface";
		}
		if (e.concreteString === "") {
			return "interface conversion: " + inter + " is nil, not " + e.assertedString;
		}
		if (e.missingMethod === "") {
			return "interface conversion: " + inter + " is " + e.concreteString + ", not " + e.assertedString;
		}
		return "interface conversion: " + e.concreteString + " is not " + e.assertedString + ": missing method " + e.missingMethod;
	};
	TypeAssertionError.prototype.Error = function() { return this.$val.Error(); };
	errorString.prototype.RuntimeError = function() {
		var e;
		e = this.$val !== undefined ? this.$val : this;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var e;
		e = this.$val !== undefined ? this.$val : this;
		return "runtime error: " + e;
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	GOROOT = $pkg.GOROOT = function() {
		var s;
		s = getgoroot();
		if (!(s === "")) {
			return s;
		}
		return "/usr/local/go";
	};
	init$1 = function() {
		var memStats;
		memStats = new MemStats.Ptr(); $copy(memStats, new MemStats.Ptr(), MemStats);
		if (!((sizeof_C_MStats === 3712))) {
			console.log(sizeof_C_MStats, 3712);
			$panic(new $String("MStats vs MemStatsType size mismatch"));
		}
	};
	$pkg.$init = function() {
		($ptrType(NotSupportedError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		NotSupportedError.init([["Feature", "Feature", "", $String, ""]]);
		($ptrType(TypeAssertionError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1], ["RuntimeError", "RuntimeError", "", $funcType([], [], false), -1]];
		TypeAssertionError.init([["interfaceString", "interfaceString", "runtime", $String, ""], ["concreteString", "concreteString", "runtime", $String, ""], ["assertedString", "assertedString", "runtime", $String, ""], ["missingMethod", "missingMethod", "runtime", $String, ""]]);
		errorString.methods = [["Error", "Error", "", $funcType([], [$String], false), -1], ["RuntimeError", "RuntimeError", "", $funcType([], [], false), -1]];
		($ptrType(errorString)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1], ["RuntimeError", "RuntimeError", "", $funcType([], [], false), -1]];
		MemStats.init([["Alloc", "Alloc", "", $Uint64, ""], ["TotalAlloc", "TotalAlloc", "", $Uint64, ""], ["Sys", "Sys", "", $Uint64, ""], ["Lookups", "Lookups", "", $Uint64, ""], ["Mallocs", "Mallocs", "", $Uint64, ""], ["Frees", "Frees", "", $Uint64, ""], ["HeapAlloc", "HeapAlloc", "", $Uint64, ""], ["HeapSys", "HeapSys", "", $Uint64, ""], ["HeapIdle", "HeapIdle", "", $Uint64, ""], ["HeapInuse", "HeapInuse", "", $Uint64, ""], ["HeapReleased", "HeapReleased", "", $Uint64, ""], ["HeapObjects", "HeapObjects", "", $Uint64, ""], ["StackInuse", "StackInuse", "", $Uint64, ""], ["StackSys", "StackSys", "", $Uint64, ""], ["MSpanInuse", "MSpanInuse", "", $Uint64, ""], ["MSpanSys", "MSpanSys", "", $Uint64, ""], ["MCacheInuse", "MCacheInuse", "", $Uint64, ""], ["MCacheSys", "MCacheSys", "", $Uint64, ""], ["BuckHashSys", "BuckHashSys", "", $Uint64, ""], ["GCSys", "GCSys", "", $Uint64, ""], ["OtherSys", "OtherSys", "", $Uint64, ""], ["NextGC", "NextGC", "", $Uint64, ""], ["LastGC", "LastGC", "", $Uint64, ""], ["PauseTotalNs", "PauseTotalNs", "", $Uint64, ""], ["PauseNs", "PauseNs", "", ($arrayType($Uint64, 256)), ""], ["NumGC", "NumGC", "", $Uint32, ""], ["EnableGC", "EnableGC", "", $Bool, ""], ["DebugGC", "DebugGC", "", $Bool, ""], ["BySize", "BySize", "", ($arrayType(($structType([["Size", "Size", "", $Uint32, ""], ["Mallocs", "Mallocs", "", $Uint64, ""], ["Frees", "Frees", "", $Uint64, ""]])), 61)), ""]]);
		sizeof_C_MStats = 3712;
		init();
		init$1();
	};
	return $pkg;
})();
$packages["errors"] = (function() {
	var $pkg = {}, errorString, New;
	errorString = $pkg.errorString = $newType(0, "Struct", "errors.errorString", "errorString", "errors", function(s_) {
		this.$val = this;
		this.s = s_ !== undefined ? s_ : "";
	});
	New = $pkg.New = function(text) {
		return new errorString.Ptr(text);
	};
	errorString.Ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.s;
	};
	errorString.prototype.Error = function() { return this.$val.Error(); };
	$pkg.$init = function() {
		($ptrType(errorString)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		errorString.init([["s", "s", "errors", $String, ""]]);
	};
	return $pkg;
})();
$packages["sync/atomic"] = (function() {
	var $pkg = {}, CompareAndSwapInt32, AddInt32, AddUint64, LoadInt32, LoadUint32, StoreInt32, StoreUint32;
	CompareAndSwapInt32 = $pkg.CompareAndSwapInt32 = function(addr, old, new$1) {
		if (addr.$get() === old) {
			addr.$set(new$1);
			return true;
		}
		return false;
	};
	AddInt32 = $pkg.AddInt32 = function(addr, delta) {
		var new$1;
		new$1 = addr.$get() + delta >> 0;
		addr.$set(new$1);
		return new$1;
	};
	AddUint64 = $pkg.AddUint64 = function(addr, delta) {
		var x, new$1;
		new$1 = (x = addr.$get(), new $Uint64(x.$high + delta.$high, x.$low + delta.$low));
		addr.$set(new$1);
		return new$1;
	};
	LoadInt32 = $pkg.LoadInt32 = function(addr) {
		return addr.$get();
	};
	LoadUint32 = $pkg.LoadUint32 = function(addr) {
		return addr.$get();
	};
	StoreInt32 = $pkg.StoreInt32 = function(addr, val) {
		addr.$set(val);
	};
	StoreUint32 = $pkg.StoreUint32 = function(addr, val) {
		addr.$set(val);
	};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["sync"] = (function() {
	var $pkg = {}, atomic = $packages["sync/atomic"], runtime = $packages["runtime"], Pool, Mutex, Locker, Once, poolLocal, syncSema, RWMutex, rlocker, WaitGroup, allPools, runtime_registerPoolCleanup, runtime_Syncsemcheck, poolCleanup, init, indexLocal, runtime_Semacquire, runtime_Semrelease, init$1;
	Pool = $pkg.Pool = $newType(0, "Struct", "sync.Pool", "Pool", "sync", function(local_, localSize_, store_, New_) {
		this.$val = this;
		this.local = local_ !== undefined ? local_ : 0;
		this.localSize = localSize_ !== undefined ? localSize_ : 0;
		this.store = store_ !== undefined ? store_ : ($sliceType($emptyInterface)).nil;
		this.New = New_ !== undefined ? New_ : $throwNilPointerError;
	});
	Mutex = $pkg.Mutex = $newType(0, "Struct", "sync.Mutex", "Mutex", "sync", function(state_, sema_) {
		this.$val = this;
		this.state = state_ !== undefined ? state_ : 0;
		this.sema = sema_ !== undefined ? sema_ : 0;
	});
	Locker = $pkg.Locker = $newType(8, "Interface", "sync.Locker", "Locker", "sync", null);
	Once = $pkg.Once = $newType(0, "Struct", "sync.Once", "Once", "sync", function(m_, done_) {
		this.$val = this;
		this.m = m_ !== undefined ? m_ : new Mutex.Ptr();
		this.done = done_ !== undefined ? done_ : 0;
	});
	poolLocal = $pkg.poolLocal = $newType(0, "Struct", "sync.poolLocal", "poolLocal", "sync", function(private$0_, shared_, Mutex_, pad_) {
		this.$val = this;
		this.private$0 = private$0_ !== undefined ? private$0_ : $ifaceNil;
		this.shared = shared_ !== undefined ? shared_ : ($sliceType($emptyInterface)).nil;
		this.Mutex = Mutex_ !== undefined ? Mutex_ : new Mutex.Ptr();
		this.pad = pad_ !== undefined ? pad_ : ($arrayType($Uint8, 128)).zero();
	});
	syncSema = $pkg.syncSema = $newType(12, "Array", "sync.syncSema", "syncSema", "sync", null);
	RWMutex = $pkg.RWMutex = $newType(0, "Struct", "sync.RWMutex", "RWMutex", "sync", function(w_, writerSem_, readerSem_, readerCount_, readerWait_) {
		this.$val = this;
		this.w = w_ !== undefined ? w_ : new Mutex.Ptr();
		this.writerSem = writerSem_ !== undefined ? writerSem_ : 0;
		this.readerSem = readerSem_ !== undefined ? readerSem_ : 0;
		this.readerCount = readerCount_ !== undefined ? readerCount_ : 0;
		this.readerWait = readerWait_ !== undefined ? readerWait_ : 0;
	});
	rlocker = $pkg.rlocker = $newType(0, "Struct", "sync.rlocker", "rlocker", "sync", function(w_, writerSem_, readerSem_, readerCount_, readerWait_) {
		this.$val = this;
		this.w = w_ !== undefined ? w_ : new Mutex.Ptr();
		this.writerSem = writerSem_ !== undefined ? writerSem_ : 0;
		this.readerSem = readerSem_ !== undefined ? readerSem_ : 0;
		this.readerCount = readerCount_ !== undefined ? readerCount_ : 0;
		this.readerWait = readerWait_ !== undefined ? readerWait_ : 0;
	});
	WaitGroup = $pkg.WaitGroup = $newType(0, "Struct", "sync.WaitGroup", "WaitGroup", "sync", function(m_, counter_, waiters_, sema_) {
		this.$val = this;
		this.m = m_ !== undefined ? m_ : new Mutex.Ptr();
		this.counter = counter_ !== undefined ? counter_ : 0;
		this.waiters = waiters_ !== undefined ? waiters_ : 0;
		this.sema = sema_ !== undefined ? sema_ : ($ptrType($Uint32)).nil;
	});
	Pool.Ptr.prototype.Get = function() {
		var p, x, x$1, x$2;
		p = this;
		if (p.store.$length === 0) {
			if (!(p.New === $throwNilPointerError)) {
				return p.New();
			}
			return $ifaceNil;
		}
		x$2 = (x = p.store, x$1 = p.store.$length - 1 >> 0, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1]));
		p.store = $subslice(p.store, 0, (p.store.$length - 1 >> 0));
		return x$2;
	};
	Pool.prototype.Get = function() { return this.$val.Get(); };
	Pool.Ptr.prototype.Put = function(x) {
		var p;
		p = this;
		if ($interfaceIsEqual(x, $ifaceNil)) {
			return;
		}
		p.store = $append(p.store, x);
	};
	Pool.prototype.Put = function(x) { return this.$val.Put(x); };
	runtime_registerPoolCleanup = function(cleanup) {
	};
	runtime_Syncsemcheck = function(size) {
	};
	Mutex.Ptr.prototype.Lock = function() {
		var m, awoke, old, new$1;
		m = this;
		if (atomic.CompareAndSwapInt32(new ($ptrType($Int32))(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), 0, 1)) {
			return;
		}
		awoke = false;
		while (true) {
			old = m.state;
			new$1 = old | 1;
			if (!(((old & 1) === 0))) {
				new$1 = old + 4 >> 0;
			}
			if (awoke) {
				new$1 = new$1 & ~(2);
			}
			if (atomic.CompareAndSwapInt32(new ($ptrType($Int32))(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) {
				if ((old & 1) === 0) {
					break;
				}
				runtime_Semacquire(new ($ptrType($Uint32))(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m));
				awoke = true;
			}
		}
	};
	Mutex.prototype.Lock = function() { return this.$val.Lock(); };
	Mutex.Ptr.prototype.Unlock = function() {
		var m, new$1, old;
		m = this;
		new$1 = atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), -1);
		if ((((new$1 + 1 >> 0)) & 1) === 0) {
			$panic(new $String("sync: unlock of unlocked mutex"));
		}
		old = new$1;
		while (true) {
			if (((old >> 2 >> 0) === 0) || !(((old & 3) === 0))) {
				return;
			}
			new$1 = ((old - 4 >> 0)) | 2;
			if (atomic.CompareAndSwapInt32(new ($ptrType($Int32))(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) {
				runtime_Semrelease(new ($ptrType($Uint32))(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m));
				return;
			}
			old = m.state;
		}
	};
	Mutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	Once.Ptr.prototype.Do = function(f) {
		var $deferred = [], $err = null, o;
		/* */ try { $deferFrames.push($deferred);
		o = this;
		if (atomic.LoadUint32(new ($ptrType($Uint32))(function() { return this.$target.done; }, function($v) { this.$target.done = $v; }, o)) === 1) {
			return;
		}
		o.m.Lock();
		$deferred.push([$methodVal(o.m, "Unlock"), []]);
		if (o.done === 0) {
			f();
			atomic.StoreUint32(new ($ptrType($Uint32))(function() { return this.$target.done; }, function($v) { this.$target.done = $v; }, o), 1);
		}
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	Once.prototype.Do = function(f) { return this.$val.Do(f); };
	poolCleanup = function() {
		var _ref, _i, i, p, i$1, l, _ref$1, _i$1, j, x;
		_ref = allPools;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			(i < 0 || i >= allPools.$length) ? $throwRuntimeError("index out of range") : allPools.$array[allPools.$offset + i] = ($ptrType(Pool)).nil;
			i$1 = 0;
			while (i$1 < (p.localSize >> 0)) {
				l = indexLocal(p.local, i$1);
				l.private$0 = $ifaceNil;
				_ref$1 = l.shared;
				_i$1 = 0;
				while (_i$1 < _ref$1.$length) {
					j = _i$1;
					(x = l.shared, (j < 0 || j >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + j] = $ifaceNil);
					_i$1++;
				}
				l.shared = ($sliceType($emptyInterface)).nil;
				i$1 = i$1 + (1) >> 0;
			}
			_i++;
		}
		allPools = new ($sliceType(($ptrType(Pool))))([]);
	};
	init = function() {
		runtime_registerPoolCleanup(poolCleanup);
	};
	indexLocal = function(l, i) {
		var x;
		return (x = l, (x.nilCheck, ((i < 0 || i >= x.length) ? $throwRuntimeError("index out of range") : x[i])));
	};
	runtime_Semacquire = function() {
		$panic("Native function not implemented: sync.runtime_Semacquire");
	};
	runtime_Semrelease = function() {
		$panic("Native function not implemented: sync.runtime_Semrelease");
	};
	init$1 = function() {
		var s;
		s = syncSema.zero(); $copy(s, syncSema.zero(), syncSema);
		runtime_Syncsemcheck(12);
	};
	RWMutex.Ptr.prototype.RLock = function() {
		var rw;
		rw = this;
		if (atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), 1) < 0) {
			runtime_Semacquire(new ($ptrType($Uint32))(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw));
		}
	};
	RWMutex.prototype.RLock = function() { return this.$val.RLock(); };
	RWMutex.Ptr.prototype.RUnlock = function() {
		var rw;
		rw = this;
		if (atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), -1) < 0) {
			if (atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw), -1) === 0) {
				runtime_Semrelease(new ($ptrType($Uint32))(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw));
			}
		}
	};
	RWMutex.prototype.RUnlock = function() { return this.$val.RUnlock(); };
	RWMutex.Ptr.prototype.Lock = function() {
		var rw, r;
		rw = this;
		rw.w.Lock();
		r = atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), -1073741824) + 1073741824 >> 0;
		if (!((r === 0)) && !((atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw), r) === 0))) {
			runtime_Semacquire(new ($ptrType($Uint32))(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw));
		}
	};
	RWMutex.prototype.Lock = function() { return this.$val.Lock(); };
	RWMutex.Ptr.prototype.Unlock = function() {
		var rw, r, i;
		rw = this;
		r = atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), 1073741824);
		i = 0;
		while (i < (r >> 0)) {
			runtime_Semrelease(new ($ptrType($Uint32))(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw));
			i = i + (1) >> 0;
		}
		rw.w.Unlock();
	};
	RWMutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	RWMutex.Ptr.prototype.RLocker = function() {
		var rw;
		rw = this;
		return $clone(rw, rlocker);
	};
	RWMutex.prototype.RLocker = function() { return this.$val.RLocker(); };
	rlocker.Ptr.prototype.Lock = function() {
		var r;
		r = this;
		$clone(r, RWMutex).RLock();
	};
	rlocker.prototype.Lock = function() { return this.$val.Lock(); };
	rlocker.Ptr.prototype.Unlock = function() {
		var r;
		r = this;
		$clone(r, RWMutex).RUnlock();
	};
	rlocker.prototype.Unlock = function() { return this.$val.Unlock(); };
	WaitGroup.Ptr.prototype.Add = function(delta) {
		var $deferred = [], $err = null, wg, v, i;
		/* */ try { $deferFrames.push($deferred);
		wg = this;
		v = atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.counter; }, function($v) { this.$target.counter = $v; }, wg), (delta >> 0));
		if (v < 0) {
			$panic(new $String("sync: negative WaitGroup counter"));
		}
		if (v > 0 || (atomic.LoadInt32(new ($ptrType($Int32))(function() { return this.$target.waiters; }, function($v) { this.$target.waiters = $v; }, wg)) === 0)) {
			return;
		}
		wg.m.Lock();
		if (atomic.LoadInt32(new ($ptrType($Int32))(function() { return this.$target.counter; }, function($v) { this.$target.counter = $v; }, wg)) === 0) {
			i = 0;
			while (i < wg.waiters) {
				runtime_Semrelease(wg.sema);
				i = i + (1) >> 0;
			}
			wg.waiters = 0;
			wg.sema = ($ptrType($Uint32)).nil;
		}
		wg.m.Unlock();
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	WaitGroup.prototype.Add = function(delta) { return this.$val.Add(delta); };
	WaitGroup.Ptr.prototype.Done = function() {
		var wg;
		wg = this;
		wg.Add(-1);
	};
	WaitGroup.prototype.Done = function() { return this.$val.Done(); };
	WaitGroup.Ptr.prototype.Wait = function() {
		var wg, w, s;
		wg = this;
		if (atomic.LoadInt32(new ($ptrType($Int32))(function() { return this.$target.counter; }, function($v) { this.$target.counter = $v; }, wg)) === 0) {
			return;
		}
		wg.m.Lock();
		w = atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.waiters; }, function($v) { this.$target.waiters = $v; }, wg), 1);
		if (atomic.LoadInt32(new ($ptrType($Int32))(function() { return this.$target.counter; }, function($v) { this.$target.counter = $v; }, wg)) === 0) {
			atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.waiters; }, function($v) { this.$target.waiters = $v; }, wg), -1);
			wg.m.Unlock();
			return;
		}
		if ($pointerIsEqual(wg.sema, ($ptrType($Uint32)).nil)) {
			wg.sema = $newDataPointer(0, ($ptrType($Uint32)));
		}
		s = wg.sema;
		wg.m.Unlock();
		runtime_Semacquire(s);
	};
	WaitGroup.prototype.Wait = function() { return this.$val.Wait(); };
	$pkg.$init = function() {
		($ptrType(Pool)).methods = [["Get", "Get", "", $funcType([], [$emptyInterface], false), -1], ["Put", "Put", "", $funcType([$emptyInterface], [], false), -1], ["getSlow", "getSlow", "sync", $funcType([], [$emptyInterface], false), -1], ["pin", "pin", "sync", $funcType([], [($ptrType(poolLocal))], false), -1], ["pinSlow", "pinSlow", "sync", $funcType([], [($ptrType(poolLocal))], false), -1]];
		Pool.init([["local", "local", "sync", $UnsafePointer, ""], ["localSize", "localSize", "sync", $Uintptr, ""], ["store", "store", "sync", ($sliceType($emptyInterface)), ""], ["New", "New", "", ($funcType([], [$emptyInterface], false)), ""]]);
		($ptrType(Mutex)).methods = [["Lock", "Lock", "", $funcType([], [], false), -1], ["Unlock", "Unlock", "", $funcType([], [], false), -1]];
		Mutex.init([["state", "state", "sync", $Int32, ""], ["sema", "sema", "sync", $Uint32, ""]]);
		Locker.init([["Lock", "Lock", "", $funcType([], [], false)], ["Unlock", "Unlock", "", $funcType([], [], false)]]);
		($ptrType(Once)).methods = [["Do", "Do", "", $funcType([($funcType([], [], false))], [], false), -1]];
		Once.init([["m", "m", "sync", Mutex, ""], ["done", "done", "sync", $Uint32, ""]]);
		($ptrType(poolLocal)).methods = [["Lock", "Lock", "", $funcType([], [], false), 2], ["Unlock", "Unlock", "", $funcType([], [], false), 2]];
		poolLocal.init([["private$0", "private", "sync", $emptyInterface, ""], ["shared", "shared", "sync", ($sliceType($emptyInterface)), ""], ["Mutex", "", "", Mutex, ""], ["pad", "pad", "sync", ($arrayType($Uint8, 128)), ""]]);
		syncSema.init($Uintptr, 3);
		($ptrType(RWMutex)).methods = [["Lock", "Lock", "", $funcType([], [], false), -1], ["RLock", "RLock", "", $funcType([], [], false), -1], ["RLocker", "RLocker", "", $funcType([], [Locker], false), -1], ["RUnlock", "RUnlock", "", $funcType([], [], false), -1], ["Unlock", "Unlock", "", $funcType([], [], false), -1]];
		RWMutex.init([["w", "w", "sync", Mutex, ""], ["writerSem", "writerSem", "sync", $Uint32, ""], ["readerSem", "readerSem", "sync", $Uint32, ""], ["readerCount", "readerCount", "sync", $Int32, ""], ["readerWait", "readerWait", "sync", $Int32, ""]]);
		($ptrType(rlocker)).methods = [["Lock", "Lock", "", $funcType([], [], false), -1], ["Unlock", "Unlock", "", $funcType([], [], false), -1]];
		rlocker.init([["w", "w", "sync", Mutex, ""], ["writerSem", "writerSem", "sync", $Uint32, ""], ["readerSem", "readerSem", "sync", $Uint32, ""], ["readerCount", "readerCount", "sync", $Int32, ""], ["readerWait", "readerWait", "sync", $Int32, ""]]);
		($ptrType(WaitGroup)).methods = [["Add", "Add", "", $funcType([$Int], [], false), -1], ["Done", "Done", "", $funcType([], [], false), -1], ["Wait", "Wait", "", $funcType([], [], false), -1]];
		WaitGroup.init([["m", "m", "sync", Mutex, ""], ["counter", "counter", "sync", $Int32, ""], ["waiters", "waiters", "sync", $Int32, ""], ["sema", "sema", "sync", ($ptrType($Uint32)), ""]]);
		allPools = ($sliceType(($ptrType(Pool)))).nil;
		init();
		init$1();
	};
	return $pkg;
})();
$packages["io"] = (function() {
	var $pkg = {}, runtime = $packages["runtime"], errors = $packages["errors"], sync = $packages["sync"], Reader, Writer, ReadCloser, ReaderFrom, WriterTo, RuneReader, stringWriter, errWhence, errOffset, WriteString;
	Reader = $pkg.Reader = $newType(8, "Interface", "io.Reader", "Reader", "io", null);
	Writer = $pkg.Writer = $newType(8, "Interface", "io.Writer", "Writer", "io", null);
	ReadCloser = $pkg.ReadCloser = $newType(8, "Interface", "io.ReadCloser", "ReadCloser", "io", null);
	ReaderFrom = $pkg.ReaderFrom = $newType(8, "Interface", "io.ReaderFrom", "ReaderFrom", "io", null);
	WriterTo = $pkg.WriterTo = $newType(8, "Interface", "io.WriterTo", "WriterTo", "io", null);
	RuneReader = $pkg.RuneReader = $newType(8, "Interface", "io.RuneReader", "RuneReader", "io", null);
	stringWriter = $pkg.stringWriter = $newType(8, "Interface", "io.stringWriter", "stringWriter", "io", null);
	WriteString = $pkg.WriteString = function(w, s) {
		var n = 0, err = $ifaceNil, _tuple, sw, ok, _tuple$1, _tuple$2;
		_tuple = $assertType(w, stringWriter, true); sw = _tuple[0]; ok = _tuple[1];
		if (ok) {
			_tuple$1 = sw.WriteString(s); n = _tuple$1[0]; err = _tuple$1[1];
			return [n, err];
		}
		_tuple$2 = w.Write(new ($sliceType($Uint8))($stringToBytes(s))); n = _tuple$2[0]; err = _tuple$2[1];
		return [n, err];
	};
	$pkg.$init = function() {
		Reader.init([["Read", "Read", "", $funcType([($sliceType($Uint8))], [$Int, $error], false)]]);
		Writer.init([["Write", "Write", "", $funcType([($sliceType($Uint8))], [$Int, $error], false)]]);
		ReadCloser.init([["Close", "Close", "", $funcType([], [$error], false)], ["Read", "Read", "", $funcType([($sliceType($Uint8))], [$Int, $error], false)]]);
		ReaderFrom.init([["ReadFrom", "ReadFrom", "", $funcType([Reader], [$Int64, $error], false)]]);
		WriterTo.init([["WriteTo", "WriteTo", "", $funcType([Writer], [$Int64, $error], false)]]);
		RuneReader.init([["ReadRune", "ReadRune", "", $funcType([], [$Int32, $Int, $error], false)]]);
		stringWriter.init([["WriteString", "WriteString", "", $funcType([$String], [$Int, $error], false)]]);
		$pkg.ErrShortWrite = errors.New("short write");
		$pkg.ErrShortBuffer = errors.New("short buffer");
		$pkg.EOF = errors.New("EOF");
		$pkg.ErrUnexpectedEOF = errors.New("unexpected EOF");
		$pkg.ErrNoProgress = errors.New("multiple Read calls return no data or error");
		errWhence = errors.New("Seek: invalid whence");
		errOffset = errors.New("Seek: invalid offset");
		$pkg.ErrClosedPipe = errors.New("io: read/write on closed pipe");
	};
	return $pkg;
})();
$packages["unicode"] = (function() {
	var $pkg = {}, RangeTable, Range16, Range32, _L, _M, _N, _P, _S, properties, IsPrint, In, is16, is32, Is;
	RangeTable = $pkg.RangeTable = $newType(0, "Struct", "unicode.RangeTable", "RangeTable", "unicode", function(R16_, R32_, LatinOffset_) {
		this.$val = this;
		this.R16 = R16_ !== undefined ? R16_ : ($sliceType(Range16)).nil;
		this.R32 = R32_ !== undefined ? R32_ : ($sliceType(Range32)).nil;
		this.LatinOffset = LatinOffset_ !== undefined ? LatinOffset_ : 0;
	});
	Range16 = $pkg.Range16 = $newType(0, "Struct", "unicode.Range16", "Range16", "unicode", function(Lo_, Hi_, Stride_) {
		this.$val = this;
		this.Lo = Lo_ !== undefined ? Lo_ : 0;
		this.Hi = Hi_ !== undefined ? Hi_ : 0;
		this.Stride = Stride_ !== undefined ? Stride_ : 0;
	});
	Range32 = $pkg.Range32 = $newType(0, "Struct", "unicode.Range32", "Range32", "unicode", function(Lo_, Hi_, Stride_) {
		this.$val = this;
		this.Lo = Lo_ !== undefined ? Lo_ : 0;
		this.Hi = Hi_ !== undefined ? Hi_ : 0;
		this.Stride = Stride_ !== undefined ? Stride_ : 0;
	});
	IsPrint = $pkg.IsPrint = function(r) {
		var x;
		if ((r >>> 0) <= 255) {
			return !(((((x = (r << 24 >>> 24), ((x < 0 || x >= properties.length) ? $throwRuntimeError("index out of range") : properties[x])) & 128) >>> 0) === 0));
		}
		return In(r, $pkg.PrintRanges);
	};
	In = $pkg.In = function(r, ranges) {
		var _ref, _i, inside;
		_ref = ranges;
		_i = 0;
		while (_i < _ref.$length) {
			inside = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (Is(inside, r)) {
				return true;
			}
			_i++;
		}
		return false;
	};
	is16 = function(ranges, r) {
		var _ref, _i, i, range_, _r, lo, hi, _q, m, range_$1, _r$1;
		if (ranges.$length <= 18 || r <= 255) {
			_ref = ranges;
			_i = 0;
			while (_i < _ref.$length) {
				i = _i;
				range_ = ((i < 0 || i >= ranges.$length) ? $throwRuntimeError("index out of range") : ranges.$array[ranges.$offset + i]);
				if (r < range_.Lo) {
					return false;
				}
				if (r <= range_.Hi) {
					return (_r = ((r - range_.Lo << 16 >>> 16)) % range_.Stride, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0;
				}
				_i++;
			}
			return false;
		}
		lo = 0;
		hi = ranges.$length;
		while (lo < hi) {
			m = lo + (_q = ((hi - lo >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			range_$1 = ((m < 0 || m >= ranges.$length) ? $throwRuntimeError("index out of range") : ranges.$array[ranges.$offset + m]);
			if (range_$1.Lo <= r && r <= range_$1.Hi) {
				return (_r$1 = ((r - range_$1.Lo << 16 >>> 16)) % range_$1.Stride, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) === 0;
			}
			if (r < range_$1.Lo) {
				hi = m;
			} else {
				lo = m + 1 >> 0;
			}
		}
		return false;
	};
	is32 = function(ranges, r) {
		var _ref, _i, i, range_, _r, lo, hi, _q, m, range_$1, _r$1;
		if (ranges.$length <= 18) {
			_ref = ranges;
			_i = 0;
			while (_i < _ref.$length) {
				i = _i;
				range_ = ((i < 0 || i >= ranges.$length) ? $throwRuntimeError("index out of range") : ranges.$array[ranges.$offset + i]);
				if (r < range_.Lo) {
					return false;
				}
				if (r <= range_.Hi) {
					return (_r = ((r - range_.Lo >>> 0)) % range_.Stride, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0;
				}
				_i++;
			}
			return false;
		}
		lo = 0;
		hi = ranges.$length;
		while (lo < hi) {
			m = lo + (_q = ((hi - lo >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			range_$1 = new Range32.Ptr(); $copy(range_$1, ((m < 0 || m >= ranges.$length) ? $throwRuntimeError("index out of range") : ranges.$array[ranges.$offset + m]), Range32);
			if (range_$1.Lo <= r && r <= range_$1.Hi) {
				return (_r$1 = ((r - range_$1.Lo >>> 0)) % range_$1.Stride, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) === 0;
			}
			if (r < range_$1.Lo) {
				hi = m;
			} else {
				lo = m + 1 >> 0;
			}
		}
		return false;
	};
	Is = $pkg.Is = function(rangeTab, r) {
		var r16, x, r32;
		r16 = rangeTab.R16;
		if (r16.$length > 0 && r <= ((x = r16.$length - 1 >> 0, ((x < 0 || x >= r16.$length) ? $throwRuntimeError("index out of range") : r16.$array[r16.$offset + x])).Hi >> 0)) {
			return is16(r16, (r << 16 >>> 16));
		}
		r32 = rangeTab.R32;
		if (r32.$length > 0 && r >= (((0 < 0 || 0 >= r32.$length) ? $throwRuntimeError("index out of range") : r32.$array[r32.$offset + 0]).Lo >> 0)) {
			return is32(r32, (r >>> 0));
		}
		return false;
	};
	$pkg.$init = function() {
		RangeTable.init([["R16", "R16", "", ($sliceType(Range16)), ""], ["R32", "R32", "", ($sliceType(Range32)), ""], ["LatinOffset", "LatinOffset", "", $Int, ""]]);
		Range16.init([["Lo", "Lo", "", $Uint16, ""], ["Hi", "Hi", "", $Uint16, ""], ["Stride", "Stride", "", $Uint16, ""]]);
		Range32.init([["Lo", "Lo", "", $Uint32, ""], ["Hi", "Hi", "", $Uint32, ""], ["Stride", "Stride", "", $Uint32, ""]]);
		_L = new RangeTable.Ptr(new ($sliceType(Range16))([new Range16.Ptr(65, 90, 1), new Range16.Ptr(97, 122, 1), new Range16.Ptr(170, 181, 11), new Range16.Ptr(186, 192, 6), new Range16.Ptr(193, 214, 1), new Range16.Ptr(216, 246, 1), new Range16.Ptr(248, 705, 1), new Range16.Ptr(710, 721, 1), new Range16.Ptr(736, 740, 1), new Range16.Ptr(748, 750, 2), new Range16.Ptr(880, 884, 1), new Range16.Ptr(886, 887, 1), new Range16.Ptr(890, 893, 1), new Range16.Ptr(902, 904, 2), new Range16.Ptr(905, 906, 1), new Range16.Ptr(908, 910, 2), new Range16.Ptr(911, 929, 1), new Range16.Ptr(931, 1013, 1), new Range16.Ptr(1015, 1153, 1), new Range16.Ptr(1162, 1319, 1), new Range16.Ptr(1329, 1366, 1), new Range16.Ptr(1369, 1377, 8), new Range16.Ptr(1378, 1415, 1), new Range16.Ptr(1488, 1514, 1), new Range16.Ptr(1520, 1522, 1), new Range16.Ptr(1568, 1610, 1), new Range16.Ptr(1646, 1647, 1), new Range16.Ptr(1649, 1747, 1), new Range16.Ptr(1749, 1765, 16), new Range16.Ptr(1766, 1774, 8), new Range16.Ptr(1775, 1786, 11), new Range16.Ptr(1787, 1788, 1), new Range16.Ptr(1791, 1808, 17), new Range16.Ptr(1810, 1839, 1), new Range16.Ptr(1869, 1957, 1), new Range16.Ptr(1969, 1994, 25), new Range16.Ptr(1995, 2026, 1), new Range16.Ptr(2036, 2037, 1), new Range16.Ptr(2042, 2048, 6), new Range16.Ptr(2049, 2069, 1), new Range16.Ptr(2074, 2084, 10), new Range16.Ptr(2088, 2112, 24), new Range16.Ptr(2113, 2136, 1), new Range16.Ptr(2208, 2210, 2), new Range16.Ptr(2211, 2220, 1), new Range16.Ptr(2308, 2361, 1), new Range16.Ptr(2365, 2384, 19), new Range16.Ptr(2392, 2401, 1), new Range16.Ptr(2417, 2423, 1), new Range16.Ptr(2425, 2431, 1), new Range16.Ptr(2437, 2444, 1), new Range16.Ptr(2447, 2448, 1), new Range16.Ptr(2451, 2472, 1), new Range16.Ptr(2474, 2480, 1), new Range16.Ptr(2482, 2486, 4), new Range16.Ptr(2487, 2489, 1), new Range16.Ptr(2493, 2510, 17), new Range16.Ptr(2524, 2525, 1), new Range16.Ptr(2527, 2529, 1), new Range16.Ptr(2544, 2545, 1), new Range16.Ptr(2565, 2570, 1), new Range16.Ptr(2575, 2576, 1), new Range16.Ptr(2579, 2600, 1), new Range16.Ptr(2602, 2608, 1), new Range16.Ptr(2610, 2611, 1), new Range16.Ptr(2613, 2614, 1), new Range16.Ptr(2616, 2617, 1), new Range16.Ptr(2649, 2652, 1), new Range16.Ptr(2654, 2674, 20), new Range16.Ptr(2675, 2676, 1), new Range16.Ptr(2693, 2701, 1), new Range16.Ptr(2703, 2705, 1), new Range16.Ptr(2707, 2728, 1), new Range16.Ptr(2730, 2736, 1), new Range16.Ptr(2738, 2739, 1), new Range16.Ptr(2741, 2745, 1), new Range16.Ptr(2749, 2768, 19), new Range16.Ptr(2784, 2785, 1), new Range16.Ptr(2821, 2828, 1), new Range16.Ptr(2831, 2832, 1), new Range16.Ptr(2835, 2856, 1), new Range16.Ptr(2858, 2864, 1), new Range16.Ptr(2866, 2867, 1), new Range16.Ptr(2869, 2873, 1), new Range16.Ptr(2877, 2908, 31), new Range16.Ptr(2909, 2911, 2), new Range16.Ptr(2912, 2913, 1), new Range16.Ptr(2929, 2947, 18), new Range16.Ptr(2949, 2954, 1), new Range16.Ptr(2958, 2960, 1), new Range16.Ptr(2962, 2965, 1), new Range16.Ptr(2969, 2970, 1), new Range16.Ptr(2972, 2974, 2), new Range16.Ptr(2975, 2979, 4), new Range16.Ptr(2980, 2984, 4), new Range16.Ptr(2985, 2986, 1), new Range16.Ptr(2990, 3001, 1), new Range16.Ptr(3024, 3077, 53), new Range16.Ptr(3078, 3084, 1), new Range16.Ptr(3086, 3088, 1), new Range16.Ptr(3090, 3112, 1), new Range16.Ptr(3114, 3123, 1), new Range16.Ptr(3125, 3129, 1), new Range16.Ptr(3133, 3160, 27), new Range16.Ptr(3161, 3168, 7), new Range16.Ptr(3169, 3205, 36), new Range16.Ptr(3206, 3212, 1), new Range16.Ptr(3214, 3216, 1), new Range16.Ptr(3218, 3240, 1), new Range16.Ptr(3242, 3251, 1), new Range16.Ptr(3253, 3257, 1), new Range16.Ptr(3261, 3294, 33), new Range16.Ptr(3296, 3297, 1), new Range16.Ptr(3313, 3314, 1), new Range16.Ptr(3333, 3340, 1), new Range16.Ptr(3342, 3344, 1), new Range16.Ptr(3346, 3386, 1), new Range16.Ptr(3389, 3406, 17), new Range16.Ptr(3424, 3425, 1), new Range16.Ptr(3450, 3455, 1), new Range16.Ptr(3461, 3478, 1), new Range16.Ptr(3482, 3505, 1), new Range16.Ptr(3507, 3515, 1), new Range16.Ptr(3517, 3520, 3), new Range16.Ptr(3521, 3526, 1), new Range16.Ptr(3585, 3632, 1), new Range16.Ptr(3634, 3635, 1), new Range16.Ptr(3648, 3654, 1), new Range16.Ptr(3713, 3714, 1), new Range16.Ptr(3716, 3719, 3), new Range16.Ptr(3720, 3722, 2), new Range16.Ptr(3725, 3732, 7), new Range16.Ptr(3733, 3735, 1), new Range16.Ptr(3737, 3743, 1), new Range16.Ptr(3745, 3747, 1), new Range16.Ptr(3749, 3751, 2), new Range16.Ptr(3754, 3755, 1), new Range16.Ptr(3757, 3760, 1), new Range16.Ptr(3762, 3763, 1), new Range16.Ptr(3773, 3776, 3), new Range16.Ptr(3777, 3780, 1), new Range16.Ptr(3782, 3804, 22), new Range16.Ptr(3805, 3807, 1), new Range16.Ptr(3840, 3904, 64), new Range16.Ptr(3905, 3911, 1), new Range16.Ptr(3913, 3948, 1), new Range16.Ptr(3976, 3980, 1), new Range16.Ptr(4096, 4138, 1), new Range16.Ptr(4159, 4176, 17), new Range16.Ptr(4177, 4181, 1), new Range16.Ptr(4186, 4189, 1), new Range16.Ptr(4193, 4197, 4), new Range16.Ptr(4198, 4206, 8), new Range16.Ptr(4207, 4208, 1), new Range16.Ptr(4213, 4225, 1), new Range16.Ptr(4238, 4256, 18), new Range16.Ptr(4257, 4293, 1), new Range16.Ptr(4295, 4301, 6), new Range16.Ptr(4304, 4346, 1), new Range16.Ptr(4348, 4680, 1), new Range16.Ptr(4682, 4685, 1), new Range16.Ptr(4688, 4694, 1), new Range16.Ptr(4696, 4698, 2), new Range16.Ptr(4699, 4701, 1), new Range16.Ptr(4704, 4744, 1), new Range16.Ptr(4746, 4749, 1), new Range16.Ptr(4752, 4784, 1), new Range16.Ptr(4786, 4789, 1), new Range16.Ptr(4792, 4798, 1), new Range16.Ptr(4800, 4802, 2), new Range16.Ptr(4803, 4805, 1), new Range16.Ptr(4808, 4822, 1), new Range16.Ptr(4824, 4880, 1), new Range16.Ptr(4882, 4885, 1), new Range16.Ptr(4888, 4954, 1), new Range16.Ptr(4992, 5007, 1), new Range16.Ptr(5024, 5108, 1), new Range16.Ptr(5121, 5740, 1), new Range16.Ptr(5743, 5759, 1), new Range16.Ptr(5761, 5786, 1), new Range16.Ptr(5792, 5866, 1), new Range16.Ptr(5888, 5900, 1), new Range16.Ptr(5902, 5905, 1), new Range16.Ptr(5920, 5937, 1), new Range16.Ptr(5952, 5969, 1), new Range16.Ptr(5984, 5996, 1), new Range16.Ptr(5998, 6000, 1), new Range16.Ptr(6016, 6067, 1), new Range16.Ptr(6103, 6108, 5), new Range16.Ptr(6176, 6263, 1), new Range16.Ptr(6272, 6312, 1), new Range16.Ptr(6314, 6320, 6), new Range16.Ptr(6321, 6389, 1), new Range16.Ptr(6400, 6428, 1), new Range16.Ptr(6480, 6509, 1), new Range16.Ptr(6512, 6516, 1), new Range16.Ptr(6528, 6571, 1), new Range16.Ptr(6593, 6599, 1), new Range16.Ptr(6656, 6678, 1), new Range16.Ptr(6688, 6740, 1), new Range16.Ptr(6823, 6917, 94), new Range16.Ptr(6918, 6963, 1), new Range16.Ptr(6981, 6987, 1), new Range16.Ptr(7043, 7072, 1), new Range16.Ptr(7086, 7087, 1), new Range16.Ptr(7098, 7141, 1), new Range16.Ptr(7168, 7203, 1), new Range16.Ptr(7245, 7247, 1), new Range16.Ptr(7258, 7293, 1), new Range16.Ptr(7401, 7404, 1), new Range16.Ptr(7406, 7409, 1), new Range16.Ptr(7413, 7414, 1), new Range16.Ptr(7424, 7615, 1), new Range16.Ptr(7680, 7957, 1), new Range16.Ptr(7960, 7965, 1), new Range16.Ptr(7968, 8005, 1), new Range16.Ptr(8008, 8013, 1), new Range16.Ptr(8016, 8023, 1), new Range16.Ptr(8025, 8031, 2), new Range16.Ptr(8032, 8061, 1), new Range16.Ptr(8064, 8116, 1), new Range16.Ptr(8118, 8124, 1), new Range16.Ptr(8126, 8130, 4), new Range16.Ptr(8131, 8132, 1), new Range16.Ptr(8134, 8140, 1), new Range16.Ptr(8144, 8147, 1), new Range16.Ptr(8150, 8155, 1), new Range16.Ptr(8160, 8172, 1), new Range16.Ptr(8178, 8180, 1), new Range16.Ptr(8182, 8188, 1), new Range16.Ptr(8305, 8319, 14), new Range16.Ptr(8336, 8348, 1), new Range16.Ptr(8450, 8455, 5), new Range16.Ptr(8458, 8467, 1), new Range16.Ptr(8469, 8473, 4), new Range16.Ptr(8474, 8477, 1), new Range16.Ptr(8484, 8490, 2), new Range16.Ptr(8491, 8493, 1), new Range16.Ptr(8495, 8505, 1), new Range16.Ptr(8508, 8511, 1), new Range16.Ptr(8517, 8521, 1), new Range16.Ptr(8526, 8579, 53), new Range16.Ptr(8580, 11264, 2684), new Range16.Ptr(11265, 11310, 1), new Range16.Ptr(11312, 11358, 1), new Range16.Ptr(11360, 11492, 1), new Range16.Ptr(11499, 11502, 1), new Range16.Ptr(11506, 11507, 1), new Range16.Ptr(11520, 11557, 1), new Range16.Ptr(11559, 11565, 6), new Range16.Ptr(11568, 11623, 1), new Range16.Ptr(11631, 11648, 17), new Range16.Ptr(11649, 11670, 1), new Range16.Ptr(11680, 11686, 1), new Range16.Ptr(11688, 11694, 1), new Range16.Ptr(11696, 11702, 1), new Range16.Ptr(11704, 11710, 1), new Range16.Ptr(11712, 11718, 1), new Range16.Ptr(11720, 11726, 1), new Range16.Ptr(11728, 11734, 1), new Range16.Ptr(11736, 11742, 1), new Range16.Ptr(11823, 12293, 470), new Range16.Ptr(12294, 12337, 43), new Range16.Ptr(12338, 12341, 1), new Range16.Ptr(12347, 12348, 1), new Range16.Ptr(12353, 12438, 1), new Range16.Ptr(12445, 12447, 1), new Range16.Ptr(12449, 12538, 1), new Range16.Ptr(12540, 12543, 1), new Range16.Ptr(12549, 12589, 1), new Range16.Ptr(12593, 12686, 1), new Range16.Ptr(12704, 12730, 1), new Range16.Ptr(12784, 12799, 1), new Range16.Ptr(13312, 19893, 1), new Range16.Ptr(19968, 40908, 1), new Range16.Ptr(40960, 42124, 1), new Range16.Ptr(42192, 42237, 1), new Range16.Ptr(42240, 42508, 1), new Range16.Ptr(42512, 42527, 1), new Range16.Ptr(42538, 42539, 1), new Range16.Ptr(42560, 42606, 1), new Range16.Ptr(42623, 42647, 1), new Range16.Ptr(42656, 42725, 1), new Range16.Ptr(42775, 42783, 1), new Range16.Ptr(42786, 42888, 1), new Range16.Ptr(42891, 42894, 1), new Range16.Ptr(42896, 42899, 1), new Range16.Ptr(42912, 42922, 1), new Range16.Ptr(43000, 43009, 1), new Range16.Ptr(43011, 43013, 1), new Range16.Ptr(43015, 43018, 1), new Range16.Ptr(43020, 43042, 1), new Range16.Ptr(43072, 43123, 1), new Range16.Ptr(43138, 43187, 1), new Range16.Ptr(43250, 43255, 1), new Range16.Ptr(43259, 43274, 15), new Range16.Ptr(43275, 43301, 1), new Range16.Ptr(43312, 43334, 1), new Range16.Ptr(43360, 43388, 1), new Range16.Ptr(43396, 43442, 1), new Range16.Ptr(43471, 43520, 49), new Range16.Ptr(43521, 43560, 1), new Range16.Ptr(43584, 43586, 1), new Range16.Ptr(43588, 43595, 1), new Range16.Ptr(43616, 43638, 1), new Range16.Ptr(43642, 43648, 6), new Range16.Ptr(43649, 43695, 1), new Range16.Ptr(43697, 43701, 4), new Range16.Ptr(43702, 43705, 3), new Range16.Ptr(43706, 43709, 1), new Range16.Ptr(43712, 43714, 2), new Range16.Ptr(43739, 43741, 1), new Range16.Ptr(43744, 43754, 1), new Range16.Ptr(43762, 43764, 1), new Range16.Ptr(43777, 43782, 1), new Range16.Ptr(43785, 43790, 1), new Range16.Ptr(43793, 43798, 1), new Range16.Ptr(43808, 43814, 1), new Range16.Ptr(43816, 43822, 1), new Range16.Ptr(43968, 44002, 1), new Range16.Ptr(44032, 55203, 1), new Range16.Ptr(55216, 55238, 1), new Range16.Ptr(55243, 55291, 1), new Range16.Ptr(63744, 64109, 1), new Range16.Ptr(64112, 64217, 1), new Range16.Ptr(64256, 64262, 1), new Range16.Ptr(64275, 64279, 1), new Range16.Ptr(64285, 64287, 2), new Range16.Ptr(64288, 64296, 1), new Range16.Ptr(64298, 64310, 1), new Range16.Ptr(64312, 64316, 1), new Range16.Ptr(64318, 64320, 2), new Range16.Ptr(64321, 64323, 2), new Range16.Ptr(64324, 64326, 2), new Range16.Ptr(64327, 64433, 1), new Range16.Ptr(64467, 64829, 1), new Range16.Ptr(64848, 64911, 1), new Range16.Ptr(64914, 64967, 1), new Range16.Ptr(65008, 65019, 1), new Range16.Ptr(65136, 65140, 1), new Range16.Ptr(65142, 65276, 1), new Range16.Ptr(65313, 65338, 1), new Range16.Ptr(65345, 65370, 1), new Range16.Ptr(65382, 65470, 1), new Range16.Ptr(65474, 65479, 1), new Range16.Ptr(65482, 65487, 1), new Range16.Ptr(65490, 65495, 1), new Range16.Ptr(65498, 65500, 1)]), new ($sliceType(Range32))([new Range32.Ptr(65536, 65547, 1), new Range32.Ptr(65549, 65574, 1), new Range32.Ptr(65576, 65594, 1), new Range32.Ptr(65596, 65597, 1), new Range32.Ptr(65599, 65613, 1), new Range32.Ptr(65616, 65629, 1), new Range32.Ptr(65664, 65786, 1), new Range32.Ptr(66176, 66204, 1), new Range32.Ptr(66208, 66256, 1), new Range32.Ptr(66304, 66334, 1), new Range32.Ptr(66352, 66368, 1), new Range32.Ptr(66370, 66377, 1), new Range32.Ptr(66432, 66461, 1), new Range32.Ptr(66464, 66499, 1), new Range32.Ptr(66504, 66511, 1), new Range32.Ptr(66560, 66717, 1), new Range32.Ptr(67584, 67589, 1), new Range32.Ptr(67592, 67594, 2), new Range32.Ptr(67595, 67637, 1), new Range32.Ptr(67639, 67640, 1), new Range32.Ptr(67644, 67647, 3), new Range32.Ptr(67648, 67669, 1), new Range32.Ptr(67840, 67861, 1), new Range32.Ptr(67872, 67897, 1), new Range32.Ptr(67968, 68023, 1), new Range32.Ptr(68030, 68031, 1), new Range32.Ptr(68096, 68112, 16), new Range32.Ptr(68113, 68115, 1), new Range32.Ptr(68117, 68119, 1), new Range32.Ptr(68121, 68147, 1), new Range32.Ptr(68192, 68220, 1), new Range32.Ptr(68352, 68405, 1), new Range32.Ptr(68416, 68437, 1), new Range32.Ptr(68448, 68466, 1), new Range32.Ptr(68608, 68680, 1), new Range32.Ptr(69635, 69687, 1), new Range32.Ptr(69763, 69807, 1), new Range32.Ptr(69840, 69864, 1), new Range32.Ptr(69891, 69926, 1), new Range32.Ptr(70019, 70066, 1), new Range32.Ptr(70081, 70084, 1), new Range32.Ptr(71296, 71338, 1), new Range32.Ptr(73728, 74606, 1), new Range32.Ptr(77824, 78894, 1), new Range32.Ptr(92160, 92728, 1), new Range32.Ptr(93952, 94020, 1), new Range32.Ptr(94032, 94099, 67), new Range32.Ptr(94100, 94111, 1), new Range32.Ptr(110592, 110593, 1), new Range32.Ptr(119808, 119892, 1), new Range32.Ptr(119894, 119964, 1), new Range32.Ptr(119966, 119967, 1), new Range32.Ptr(119970, 119973, 3), new Range32.Ptr(119974, 119977, 3), new Range32.Ptr(119978, 119980, 1), new Range32.Ptr(119982, 119993, 1), new Range32.Ptr(119995, 119997, 2), new Range32.Ptr(119998, 120003, 1), new Range32.Ptr(120005, 120069, 1), new Range32.Ptr(120071, 120074, 1), new Range32.Ptr(120077, 120084, 1), new Range32.Ptr(120086, 120092, 1), new Range32.Ptr(120094, 120121, 1), new Range32.Ptr(120123, 120126, 1), new Range32.Ptr(120128, 120132, 1), new Range32.Ptr(120134, 120138, 4), new Range32.Ptr(120139, 120144, 1), new Range32.Ptr(120146, 120485, 1), new Range32.Ptr(120488, 120512, 1), new Range32.Ptr(120514, 120538, 1), new Range32.Ptr(120540, 120570, 1), new Range32.Ptr(120572, 120596, 1), new Range32.Ptr(120598, 120628, 1), new Range32.Ptr(120630, 120654, 1), new Range32.Ptr(120656, 120686, 1), new Range32.Ptr(120688, 120712, 1), new Range32.Ptr(120714, 120744, 1), new Range32.Ptr(120746, 120770, 1), new Range32.Ptr(120772, 120779, 1), new Range32.Ptr(126464, 126467, 1), new Range32.Ptr(126469, 126495, 1), new Range32.Ptr(126497, 126498, 1), new Range32.Ptr(126500, 126503, 3), new Range32.Ptr(126505, 126514, 1), new Range32.Ptr(126516, 126519, 1), new Range32.Ptr(126521, 126523, 2), new Range32.Ptr(126530, 126535, 5), new Range32.Ptr(126537, 126541, 2), new Range32.Ptr(126542, 126543, 1), new Range32.Ptr(126545, 126546, 1), new Range32.Ptr(126548, 126551, 3), new Range32.Ptr(126553, 126561, 2), new Range32.Ptr(126562, 126564, 2), new Range32.Ptr(126567, 126570, 1), new Range32.Ptr(126572, 126578, 1), new Range32.Ptr(126580, 126583, 1), new Range32.Ptr(126585, 126588, 1), new Range32.Ptr(126590, 126592, 2), new Range32.Ptr(126593, 126601, 1), new Range32.Ptr(126603, 126619, 1), new Range32.Ptr(126625, 126627, 1), new Range32.Ptr(126629, 126633, 1), new Range32.Ptr(126635, 126651, 1), new Range32.Ptr(131072, 173782, 1), new Range32.Ptr(173824, 177972, 1), new Range32.Ptr(177984, 178205, 1), new Range32.Ptr(194560, 195101, 1)]), 6);
		_M = new RangeTable.Ptr(new ($sliceType(Range16))([new Range16.Ptr(768, 879, 1), new Range16.Ptr(1155, 1161, 1), new Range16.Ptr(1425, 1469, 1), new Range16.Ptr(1471, 1473, 2), new Range16.Ptr(1474, 1476, 2), new Range16.Ptr(1477, 1479, 2), new Range16.Ptr(1552, 1562, 1), new Range16.Ptr(1611, 1631, 1), new Range16.Ptr(1648, 1750, 102), new Range16.Ptr(1751, 1756, 1), new Range16.Ptr(1759, 1764, 1), new Range16.Ptr(1767, 1768, 1), new Range16.Ptr(1770, 1773, 1), new Range16.Ptr(1809, 1840, 31), new Range16.Ptr(1841, 1866, 1), new Range16.Ptr(1958, 1968, 1), new Range16.Ptr(2027, 2035, 1), new Range16.Ptr(2070, 2073, 1), new Range16.Ptr(2075, 2083, 1), new Range16.Ptr(2085, 2087, 1), new Range16.Ptr(2089, 2093, 1), new Range16.Ptr(2137, 2139, 1), new Range16.Ptr(2276, 2302, 1), new Range16.Ptr(2304, 2307, 1), new Range16.Ptr(2362, 2364, 1), new Range16.Ptr(2366, 2383, 1), new Range16.Ptr(2385, 2391, 1), new Range16.Ptr(2402, 2403, 1), new Range16.Ptr(2433, 2435, 1), new Range16.Ptr(2492, 2494, 2), new Range16.Ptr(2495, 2500, 1), new Range16.Ptr(2503, 2504, 1), new Range16.Ptr(2507, 2509, 1), new Range16.Ptr(2519, 2530, 11), new Range16.Ptr(2531, 2561, 30), new Range16.Ptr(2562, 2563, 1), new Range16.Ptr(2620, 2622, 2), new Range16.Ptr(2623, 2626, 1), new Range16.Ptr(2631, 2632, 1), new Range16.Ptr(2635, 2637, 1), new Range16.Ptr(2641, 2672, 31), new Range16.Ptr(2673, 2677, 4), new Range16.Ptr(2689, 2691, 1), new Range16.Ptr(2748, 2750, 2), new Range16.Ptr(2751, 2757, 1), new Range16.Ptr(2759, 2761, 1), new Range16.Ptr(2763, 2765, 1), new Range16.Ptr(2786, 2787, 1), new Range16.Ptr(2817, 2819, 1), new Range16.Ptr(2876, 2878, 2), new Range16.Ptr(2879, 2884, 1), new Range16.Ptr(2887, 2888, 1), new Range16.Ptr(2891, 2893, 1), new Range16.Ptr(2902, 2903, 1), new Range16.Ptr(2914, 2915, 1), new Range16.Ptr(2946, 3006, 60), new Range16.Ptr(3007, 3010, 1), new Range16.Ptr(3014, 3016, 1), new Range16.Ptr(3018, 3021, 1), new Range16.Ptr(3031, 3073, 42), new Range16.Ptr(3074, 3075, 1), new Range16.Ptr(3134, 3140, 1), new Range16.Ptr(3142, 3144, 1), new Range16.Ptr(3146, 3149, 1), new Range16.Ptr(3157, 3158, 1), new Range16.Ptr(3170, 3171, 1), new Range16.Ptr(3202, 3203, 1), new Range16.Ptr(3260, 3262, 2), new Range16.Ptr(3263, 3268, 1), new Range16.Ptr(3270, 3272, 1), new Range16.Ptr(3274, 3277, 1), new Range16.Ptr(3285, 3286, 1), new Range16.Ptr(3298, 3299, 1), new Range16.Ptr(3330, 3331, 1), new Range16.Ptr(3390, 3396, 1), new Range16.Ptr(3398, 3400, 1), new Range16.Ptr(3402, 3405, 1), new Range16.Ptr(3415, 3426, 11), new Range16.Ptr(3427, 3458, 31), new Range16.Ptr(3459, 3530, 71), new Range16.Ptr(3535, 3540, 1), new Range16.Ptr(3542, 3544, 2), new Range16.Ptr(3545, 3551, 1), new Range16.Ptr(3570, 3571, 1), new Range16.Ptr(3633, 3636, 3), new Range16.Ptr(3637, 3642, 1), new Range16.Ptr(3655, 3662, 1), new Range16.Ptr(3761, 3764, 3), new Range16.Ptr(3765, 3769, 1), new Range16.Ptr(3771, 3772, 1), new Range16.Ptr(3784, 3789, 1), new Range16.Ptr(3864, 3865, 1), new Range16.Ptr(3893, 3897, 2), new Range16.Ptr(3902, 3903, 1), new Range16.Ptr(3953, 3972, 1), new Range16.Ptr(3974, 3975, 1), new Range16.Ptr(3981, 3991, 1), new Range16.Ptr(3993, 4028, 1), new Range16.Ptr(4038, 4139, 101), new Range16.Ptr(4140, 4158, 1), new Range16.Ptr(4182, 4185, 1), new Range16.Ptr(4190, 4192, 1), new Range16.Ptr(4194, 4196, 1), new Range16.Ptr(4199, 4205, 1), new Range16.Ptr(4209, 4212, 1), new Range16.Ptr(4226, 4237, 1), new Range16.Ptr(4239, 4250, 11), new Range16.Ptr(4251, 4253, 1), new Range16.Ptr(4957, 4959, 1), new Range16.Ptr(5906, 5908, 1), new Range16.Ptr(5938, 5940, 1), new Range16.Ptr(5970, 5971, 1), new Range16.Ptr(6002, 6003, 1), new Range16.Ptr(6068, 6099, 1), new Range16.Ptr(6109, 6155, 46), new Range16.Ptr(6156, 6157, 1), new Range16.Ptr(6313, 6432, 119), new Range16.Ptr(6433, 6443, 1), new Range16.Ptr(6448, 6459, 1), new Range16.Ptr(6576, 6592, 1), new Range16.Ptr(6600, 6601, 1), new Range16.Ptr(6679, 6683, 1), new Range16.Ptr(6741, 6750, 1), new Range16.Ptr(6752, 6780, 1), new Range16.Ptr(6783, 6912, 129), new Range16.Ptr(6913, 6916, 1), new Range16.Ptr(6964, 6980, 1), new Range16.Ptr(7019, 7027, 1), new Range16.Ptr(7040, 7042, 1), new Range16.Ptr(7073, 7085, 1), new Range16.Ptr(7142, 7155, 1), new Range16.Ptr(7204, 7223, 1), new Range16.Ptr(7376, 7378, 1), new Range16.Ptr(7380, 7400, 1), new Range16.Ptr(7405, 7410, 5), new Range16.Ptr(7411, 7412, 1), new Range16.Ptr(7616, 7654, 1), new Range16.Ptr(7676, 7679, 1), new Range16.Ptr(8400, 8432, 1), new Range16.Ptr(11503, 11505, 1), new Range16.Ptr(11647, 11744, 97), new Range16.Ptr(11745, 11775, 1), new Range16.Ptr(12330, 12335, 1), new Range16.Ptr(12441, 12442, 1), new Range16.Ptr(42607, 42610, 1), new Range16.Ptr(42612, 42621, 1), new Range16.Ptr(42655, 42736, 81), new Range16.Ptr(42737, 43010, 273), new Range16.Ptr(43014, 43019, 5), new Range16.Ptr(43043, 43047, 1), new Range16.Ptr(43136, 43137, 1), new Range16.Ptr(43188, 43204, 1), new Range16.Ptr(43232, 43249, 1), new Range16.Ptr(43302, 43309, 1), new Range16.Ptr(43335, 43347, 1), new Range16.Ptr(43392, 43395, 1), new Range16.Ptr(43443, 43456, 1), new Range16.Ptr(43561, 43574, 1), new Range16.Ptr(43587, 43596, 9), new Range16.Ptr(43597, 43643, 46), new Range16.Ptr(43696, 43698, 2), new Range16.Ptr(43699, 43700, 1), new Range16.Ptr(43703, 43704, 1), new Range16.Ptr(43710, 43711, 1), new Range16.Ptr(43713, 43755, 42), new Range16.Ptr(43756, 43759, 1), new Range16.Ptr(43765, 43766, 1), new Range16.Ptr(44003, 44010, 1), new Range16.Ptr(44012, 44013, 1), new Range16.Ptr(64286, 65024, 738), new Range16.Ptr(65025, 65039, 1), new Range16.Ptr(65056, 65062, 1)]), new ($sliceType(Range32))([new Range32.Ptr(66045, 68097, 2052), new Range32.Ptr(68098, 68099, 1), new Range32.Ptr(68101, 68102, 1), new Range32.Ptr(68108, 68111, 1), new Range32.Ptr(68152, 68154, 1), new Range32.Ptr(68159, 69632, 1473), new Range32.Ptr(69633, 69634, 1), new Range32.Ptr(69688, 69702, 1), new Range32.Ptr(69760, 69762, 1), new Range32.Ptr(69808, 69818, 1), new Range32.Ptr(69888, 69890, 1), new Range32.Ptr(69927, 69940, 1), new Range32.Ptr(70016, 70018, 1), new Range32.Ptr(70067, 70080, 1), new Range32.Ptr(71339, 71351, 1), new Range32.Ptr(94033, 94078, 1), new Range32.Ptr(94095, 94098, 1), new Range32.Ptr(119141, 119145, 1), new Range32.Ptr(119149, 119154, 1), new Range32.Ptr(119163, 119170, 1), new Range32.Ptr(119173, 119179, 1), new Range32.Ptr(119210, 119213, 1), new Range32.Ptr(119362, 119364, 1), new Range32.Ptr(917760, 917999, 1)]), 0);
		_N = new RangeTable.Ptr(new ($sliceType(Range16))([new Range16.Ptr(48, 57, 1), new Range16.Ptr(178, 179, 1), new Range16.Ptr(185, 188, 3), new Range16.Ptr(189, 190, 1), new Range16.Ptr(1632, 1641, 1), new Range16.Ptr(1776, 1785, 1), new Range16.Ptr(1984, 1993, 1), new Range16.Ptr(2406, 2415, 1), new Range16.Ptr(2534, 2543, 1), new Range16.Ptr(2548, 2553, 1), new Range16.Ptr(2662, 2671, 1), new Range16.Ptr(2790, 2799, 1), new Range16.Ptr(2918, 2927, 1), new Range16.Ptr(2930, 2935, 1), new Range16.Ptr(3046, 3058, 1), new Range16.Ptr(3174, 3183, 1), new Range16.Ptr(3192, 3198, 1), new Range16.Ptr(3302, 3311, 1), new Range16.Ptr(3430, 3445, 1), new Range16.Ptr(3664, 3673, 1), new Range16.Ptr(3792, 3801, 1), new Range16.Ptr(3872, 3891, 1), new Range16.Ptr(4160, 4169, 1), new Range16.Ptr(4240, 4249, 1), new Range16.Ptr(4969, 4988, 1), new Range16.Ptr(5870, 5872, 1), new Range16.Ptr(6112, 6121, 1), new Range16.Ptr(6128, 6137, 1), new Range16.Ptr(6160, 6169, 1), new Range16.Ptr(6470, 6479, 1), new Range16.Ptr(6608, 6618, 1), new Range16.Ptr(6784, 6793, 1), new Range16.Ptr(6800, 6809, 1), new Range16.Ptr(6992, 7001, 1), new Range16.Ptr(7088, 7097, 1), new Range16.Ptr(7232, 7241, 1), new Range16.Ptr(7248, 7257, 1), new Range16.Ptr(8304, 8308, 4), new Range16.Ptr(8309, 8313, 1), new Range16.Ptr(8320, 8329, 1), new Range16.Ptr(8528, 8578, 1), new Range16.Ptr(8581, 8585, 1), new Range16.Ptr(9312, 9371, 1), new Range16.Ptr(9450, 9471, 1), new Range16.Ptr(10102, 10131, 1), new Range16.Ptr(11517, 12295, 778), new Range16.Ptr(12321, 12329, 1), new Range16.Ptr(12344, 12346, 1), new Range16.Ptr(12690, 12693, 1), new Range16.Ptr(12832, 12841, 1), new Range16.Ptr(12872, 12879, 1), new Range16.Ptr(12881, 12895, 1), new Range16.Ptr(12928, 12937, 1), new Range16.Ptr(12977, 12991, 1), new Range16.Ptr(42528, 42537, 1), new Range16.Ptr(42726, 42735, 1), new Range16.Ptr(43056, 43061, 1), new Range16.Ptr(43216, 43225, 1), new Range16.Ptr(43264, 43273, 1), new Range16.Ptr(43472, 43481, 1), new Range16.Ptr(43600, 43609, 1), new Range16.Ptr(44016, 44025, 1), new Range16.Ptr(65296, 65305, 1)]), new ($sliceType(Range32))([new Range32.Ptr(65799, 65843, 1), new Range32.Ptr(65856, 65912, 1), new Range32.Ptr(65930, 66336, 406), new Range32.Ptr(66337, 66339, 1), new Range32.Ptr(66369, 66378, 9), new Range32.Ptr(66513, 66517, 1), new Range32.Ptr(66720, 66729, 1), new Range32.Ptr(67672, 67679, 1), new Range32.Ptr(67862, 67867, 1), new Range32.Ptr(68160, 68167, 1), new Range32.Ptr(68221, 68222, 1), new Range32.Ptr(68440, 68447, 1), new Range32.Ptr(68472, 68479, 1), new Range32.Ptr(69216, 69246, 1), new Range32.Ptr(69714, 69743, 1), new Range32.Ptr(69872, 69881, 1), new Range32.Ptr(69942, 69951, 1), new Range32.Ptr(70096, 70105, 1), new Range32.Ptr(71360, 71369, 1), new Range32.Ptr(74752, 74850, 1), new Range32.Ptr(119648, 119665, 1), new Range32.Ptr(120782, 120831, 1), new Range32.Ptr(127232, 127242, 1)]), 4);
		_P = new RangeTable.Ptr(new ($sliceType(Range16))([new Range16.Ptr(33, 35, 1), new Range16.Ptr(37, 42, 1), new Range16.Ptr(44, 47, 1), new Range16.Ptr(58, 59, 1), new Range16.Ptr(63, 64, 1), new Range16.Ptr(91, 93, 1), new Range16.Ptr(95, 123, 28), new Range16.Ptr(125, 161, 36), new Range16.Ptr(167, 171, 4), new Range16.Ptr(182, 183, 1), new Range16.Ptr(187, 191, 4), new Range16.Ptr(894, 903, 9), new Range16.Ptr(1370, 1375, 1), new Range16.Ptr(1417, 1418, 1), new Range16.Ptr(1470, 1472, 2), new Range16.Ptr(1475, 1478, 3), new Range16.Ptr(1523, 1524, 1), new Range16.Ptr(1545, 1546, 1), new Range16.Ptr(1548, 1549, 1), new Range16.Ptr(1563, 1566, 3), new Range16.Ptr(1567, 1642, 75), new Range16.Ptr(1643, 1645, 1), new Range16.Ptr(1748, 1792, 44), new Range16.Ptr(1793, 1805, 1), new Range16.Ptr(2039, 2041, 1), new Range16.Ptr(2096, 2110, 1), new Range16.Ptr(2142, 2404, 262), new Range16.Ptr(2405, 2416, 11), new Range16.Ptr(2800, 3572, 772), new Range16.Ptr(3663, 3674, 11), new Range16.Ptr(3675, 3844, 169), new Range16.Ptr(3845, 3858, 1), new Range16.Ptr(3860, 3898, 38), new Range16.Ptr(3899, 3901, 1), new Range16.Ptr(3973, 4048, 75), new Range16.Ptr(4049, 4052, 1), new Range16.Ptr(4057, 4058, 1), new Range16.Ptr(4170, 4175, 1), new Range16.Ptr(4347, 4960, 613), new Range16.Ptr(4961, 4968, 1), new Range16.Ptr(5120, 5741, 621), new Range16.Ptr(5742, 5787, 45), new Range16.Ptr(5788, 5867, 79), new Range16.Ptr(5868, 5869, 1), new Range16.Ptr(5941, 5942, 1), new Range16.Ptr(6100, 6102, 1), new Range16.Ptr(6104, 6106, 1), new Range16.Ptr(6144, 6154, 1), new Range16.Ptr(6468, 6469, 1), new Range16.Ptr(6686, 6687, 1), new Range16.Ptr(6816, 6822, 1), new Range16.Ptr(6824, 6829, 1), new Range16.Ptr(7002, 7008, 1), new Range16.Ptr(7164, 7167, 1), new Range16.Ptr(7227, 7231, 1), new Range16.Ptr(7294, 7295, 1), new Range16.Ptr(7360, 7367, 1), new Range16.Ptr(7379, 8208, 829), new Range16.Ptr(8209, 8231, 1), new Range16.Ptr(8240, 8259, 1), new Range16.Ptr(8261, 8273, 1), new Range16.Ptr(8275, 8286, 1), new Range16.Ptr(8317, 8318, 1), new Range16.Ptr(8333, 8334, 1), new Range16.Ptr(8968, 8971, 1), new Range16.Ptr(9001, 9002, 1), new Range16.Ptr(10088, 10101, 1), new Range16.Ptr(10181, 10182, 1), new Range16.Ptr(10214, 10223, 1), new Range16.Ptr(10627, 10648, 1), new Range16.Ptr(10712, 10715, 1), new Range16.Ptr(10748, 10749, 1), new Range16.Ptr(11513, 11516, 1), new Range16.Ptr(11518, 11519, 1), new Range16.Ptr(11632, 11776, 144), new Range16.Ptr(11777, 11822, 1), new Range16.Ptr(11824, 11835, 1), new Range16.Ptr(12289, 12291, 1), new Range16.Ptr(12296, 12305, 1), new Range16.Ptr(12308, 12319, 1), new Range16.Ptr(12336, 12349, 13), new Range16.Ptr(12448, 12539, 91), new Range16.Ptr(42238, 42239, 1), new Range16.Ptr(42509, 42511, 1), new Range16.Ptr(42611, 42622, 11), new Range16.Ptr(42738, 42743, 1), new Range16.Ptr(43124, 43127, 1), new Range16.Ptr(43214, 43215, 1), new Range16.Ptr(43256, 43258, 1), new Range16.Ptr(43310, 43311, 1), new Range16.Ptr(43359, 43457, 98), new Range16.Ptr(43458, 43469, 1), new Range16.Ptr(43486, 43487, 1), new Range16.Ptr(43612, 43615, 1), new Range16.Ptr(43742, 43743, 1), new Range16.Ptr(43760, 43761, 1), new Range16.Ptr(44011, 64830, 20819), new Range16.Ptr(64831, 65040, 209), new Range16.Ptr(65041, 65049, 1), new Range16.Ptr(65072, 65106, 1), new Range16.Ptr(65108, 65121, 1), new Range16.Ptr(65123, 65128, 5), new Range16.Ptr(65130, 65131, 1), new Range16.Ptr(65281, 65283, 1), new Range16.Ptr(65285, 65290, 1), new Range16.Ptr(65292, 65295, 1), new Range16.Ptr(65306, 65307, 1), new Range16.Ptr(65311, 65312, 1), new Range16.Ptr(65339, 65341, 1), new Range16.Ptr(65343, 65371, 28), new Range16.Ptr(65373, 65375, 2), new Range16.Ptr(65376, 65381, 1)]), new ($sliceType(Range32))([new Range32.Ptr(65792, 65794, 1), new Range32.Ptr(66463, 66512, 49), new Range32.Ptr(67671, 67871, 200), new Range32.Ptr(67903, 68176, 273), new Range32.Ptr(68177, 68184, 1), new Range32.Ptr(68223, 68409, 186), new Range32.Ptr(68410, 68415, 1), new Range32.Ptr(69703, 69709, 1), new Range32.Ptr(69819, 69820, 1), new Range32.Ptr(69822, 69825, 1), new Range32.Ptr(69952, 69955, 1), new Range32.Ptr(70085, 70088, 1), new Range32.Ptr(74864, 74867, 1)]), 11);
		_S = new RangeTable.Ptr(new ($sliceType(Range16))([new Range16.Ptr(36, 43, 7), new Range16.Ptr(60, 62, 1), new Range16.Ptr(94, 96, 2), new Range16.Ptr(124, 126, 2), new Range16.Ptr(162, 166, 1), new Range16.Ptr(168, 169, 1), new Range16.Ptr(172, 174, 2), new Range16.Ptr(175, 177, 1), new Range16.Ptr(180, 184, 4), new Range16.Ptr(215, 247, 32), new Range16.Ptr(706, 709, 1), new Range16.Ptr(722, 735, 1), new Range16.Ptr(741, 747, 1), new Range16.Ptr(749, 751, 2), new Range16.Ptr(752, 767, 1), new Range16.Ptr(885, 900, 15), new Range16.Ptr(901, 1014, 113), new Range16.Ptr(1154, 1423, 269), new Range16.Ptr(1542, 1544, 1), new Range16.Ptr(1547, 1550, 3), new Range16.Ptr(1551, 1758, 207), new Range16.Ptr(1769, 1789, 20), new Range16.Ptr(1790, 2038, 248), new Range16.Ptr(2546, 2547, 1), new Range16.Ptr(2554, 2555, 1), new Range16.Ptr(2801, 2928, 127), new Range16.Ptr(3059, 3066, 1), new Range16.Ptr(3199, 3449, 250), new Range16.Ptr(3647, 3841, 194), new Range16.Ptr(3842, 3843, 1), new Range16.Ptr(3859, 3861, 2), new Range16.Ptr(3862, 3863, 1), new Range16.Ptr(3866, 3871, 1), new Range16.Ptr(3892, 3896, 2), new Range16.Ptr(4030, 4037, 1), new Range16.Ptr(4039, 4044, 1), new Range16.Ptr(4046, 4047, 1), new Range16.Ptr(4053, 4056, 1), new Range16.Ptr(4254, 4255, 1), new Range16.Ptr(5008, 5017, 1), new Range16.Ptr(6107, 6464, 357), new Range16.Ptr(6622, 6655, 1), new Range16.Ptr(7009, 7018, 1), new Range16.Ptr(7028, 7036, 1), new Range16.Ptr(8125, 8127, 2), new Range16.Ptr(8128, 8129, 1), new Range16.Ptr(8141, 8143, 1), new Range16.Ptr(8157, 8159, 1), new Range16.Ptr(8173, 8175, 1), new Range16.Ptr(8189, 8190, 1), new Range16.Ptr(8260, 8274, 14), new Range16.Ptr(8314, 8316, 1), new Range16.Ptr(8330, 8332, 1), new Range16.Ptr(8352, 8378, 1), new Range16.Ptr(8448, 8449, 1), new Range16.Ptr(8451, 8454, 1), new Range16.Ptr(8456, 8457, 1), new Range16.Ptr(8468, 8470, 2), new Range16.Ptr(8471, 8472, 1), new Range16.Ptr(8478, 8483, 1), new Range16.Ptr(8485, 8489, 2), new Range16.Ptr(8494, 8506, 12), new Range16.Ptr(8507, 8512, 5), new Range16.Ptr(8513, 8516, 1), new Range16.Ptr(8522, 8525, 1), new Range16.Ptr(8527, 8592, 65), new Range16.Ptr(8593, 8967, 1), new Range16.Ptr(8972, 9000, 1), new Range16.Ptr(9003, 9203, 1), new Range16.Ptr(9216, 9254, 1), new Range16.Ptr(9280, 9290, 1), new Range16.Ptr(9372, 9449, 1), new Range16.Ptr(9472, 9983, 1), new Range16.Ptr(9985, 10087, 1), new Range16.Ptr(10132, 10180, 1), new Range16.Ptr(10183, 10213, 1), new Range16.Ptr(10224, 10626, 1), new Range16.Ptr(10649, 10711, 1), new Range16.Ptr(10716, 10747, 1), new Range16.Ptr(10750, 11084, 1), new Range16.Ptr(11088, 11097, 1), new Range16.Ptr(11493, 11498, 1), new Range16.Ptr(11904, 11929, 1), new Range16.Ptr(11931, 12019, 1), new Range16.Ptr(12032, 12245, 1), new Range16.Ptr(12272, 12283, 1), new Range16.Ptr(12292, 12306, 14), new Range16.Ptr(12307, 12320, 13), new Range16.Ptr(12342, 12343, 1), new Range16.Ptr(12350, 12351, 1), new Range16.Ptr(12443, 12444, 1), new Range16.Ptr(12688, 12689, 1), new Range16.Ptr(12694, 12703, 1), new Range16.Ptr(12736, 12771, 1), new Range16.Ptr(12800, 12830, 1), new Range16.Ptr(12842, 12871, 1), new Range16.Ptr(12880, 12896, 16), new Range16.Ptr(12897, 12927, 1), new Range16.Ptr(12938, 12976, 1), new Range16.Ptr(12992, 13054, 1), new Range16.Ptr(13056, 13311, 1), new Range16.Ptr(19904, 19967, 1), new Range16.Ptr(42128, 42182, 1), new Range16.Ptr(42752, 42774, 1), new Range16.Ptr(42784, 42785, 1), new Range16.Ptr(42889, 42890, 1), new Range16.Ptr(43048, 43051, 1), new Range16.Ptr(43062, 43065, 1), new Range16.Ptr(43639, 43641, 1), new Range16.Ptr(64297, 64434, 137), new Range16.Ptr(64435, 64449, 1), new Range16.Ptr(65020, 65021, 1), new Range16.Ptr(65122, 65124, 2), new Range16.Ptr(65125, 65126, 1), new Range16.Ptr(65129, 65284, 155), new Range16.Ptr(65291, 65308, 17), new Range16.Ptr(65309, 65310, 1), new Range16.Ptr(65342, 65344, 2), new Range16.Ptr(65372, 65374, 2), new Range16.Ptr(65504, 65510, 1), new Range16.Ptr(65512, 65518, 1), new Range16.Ptr(65532, 65533, 1)]), new ($sliceType(Range32))([new Range32.Ptr(65847, 65855, 1), new Range32.Ptr(65913, 65929, 1), new Range32.Ptr(65936, 65947, 1), new Range32.Ptr(66000, 66044, 1), new Range32.Ptr(118784, 119029, 1), new Range32.Ptr(119040, 119078, 1), new Range32.Ptr(119081, 119140, 1), new Range32.Ptr(119146, 119148, 1), new Range32.Ptr(119171, 119172, 1), new Range32.Ptr(119180, 119209, 1), new Range32.Ptr(119214, 119261, 1), new Range32.Ptr(119296, 119361, 1), new Range32.Ptr(119365, 119552, 187), new Range32.Ptr(119553, 119638, 1), new Range32.Ptr(120513, 120539, 26), new Range32.Ptr(120571, 120597, 26), new Range32.Ptr(120629, 120655, 26), new Range32.Ptr(120687, 120713, 26), new Range32.Ptr(120745, 120771, 26), new Range32.Ptr(126704, 126705, 1), new Range32.Ptr(126976, 127019, 1), new Range32.Ptr(127024, 127123, 1), new Range32.Ptr(127136, 127150, 1), new Range32.Ptr(127153, 127166, 1), new Range32.Ptr(127169, 127183, 1), new Range32.Ptr(127185, 127199, 1), new Range32.Ptr(127248, 127278, 1), new Range32.Ptr(127280, 127339, 1), new Range32.Ptr(127344, 127386, 1), new Range32.Ptr(127462, 127490, 1), new Range32.Ptr(127504, 127546, 1), new Range32.Ptr(127552, 127560, 1), new Range32.Ptr(127568, 127569, 1), new Range32.Ptr(127744, 127776, 1), new Range32.Ptr(127792, 127797, 1), new Range32.Ptr(127799, 127868, 1), new Range32.Ptr(127872, 127891, 1), new Range32.Ptr(127904, 127940, 1), new Range32.Ptr(127942, 127946, 1), new Range32.Ptr(127968, 127984, 1), new Range32.Ptr(128000, 128062, 1), new Range32.Ptr(128064, 128066, 2), new Range32.Ptr(128067, 128247, 1), new Range32.Ptr(128249, 128252, 1), new Range32.Ptr(128256, 128317, 1), new Range32.Ptr(128320, 128323, 1), new Range32.Ptr(128336, 128359, 1), new Range32.Ptr(128507, 128576, 1), new Range32.Ptr(128581, 128591, 1), new Range32.Ptr(128640, 128709, 1), new Range32.Ptr(128768, 128883, 1)]), 10);
		$pkg.L = _L;
		$pkg.M = _M;
		$pkg.N = _N;
		$pkg.P = _P;
		$pkg.S = _S;
		$pkg.PrintRanges = new ($sliceType(($ptrType(RangeTable))))([$pkg.L, $pkg.M, $pkg.N, $pkg.P, $pkg.S]);
		properties = $toNativeArray("Uint8", [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 144, 130, 130, 130, 136, 130, 130, 130, 130, 130, 130, 136, 130, 130, 130, 130, 132, 132, 132, 132, 132, 132, 132, 132, 132, 132, 130, 130, 136, 136, 136, 130, 130, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 130, 130, 130, 136, 130, 136, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 130, 136, 130, 136, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 16, 130, 136, 136, 136, 136, 136, 130, 136, 136, 224, 130, 136, 0, 136, 136, 136, 136, 132, 132, 136, 192, 130, 130, 136, 132, 224, 130, 132, 132, 132, 130, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 160, 136, 160, 160, 160, 160, 160, 160, 160, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 136, 192, 192, 192, 192, 192, 192, 192, 192]);
	};
	return $pkg;
})();
$packages["unicode/utf8"] = (function() {
	var $pkg = {}, decodeRuneInternal, decodeRuneInStringInternal, FullRune, DecodeRune, DecodeRuneInString, DecodeLastRune, RuneLen, EncodeRune, RuneCountInString, RuneStart;
	decodeRuneInternal = function(p) {
		var r = 0, size = 0, short$1 = false, n, _tmp, _tmp$1, _tmp$2, c0, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tmp$10, _tmp$11, c1, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$20, _tmp$21, _tmp$22, _tmp$23, c2, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, c3, _tmp$39, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$50;
		n = p.$length;
		if (n < 1) {
			_tmp = 65533; _tmp$1 = 0; _tmp$2 = true; r = _tmp; size = _tmp$1; short$1 = _tmp$2;
			return [r, size, short$1];
		}
		c0 = ((0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0]);
		if (c0 < 128) {
			_tmp$3 = (c0 >> 0); _tmp$4 = 1; _tmp$5 = false; r = _tmp$3; size = _tmp$4; short$1 = _tmp$5;
			return [r, size, short$1];
		}
		if (c0 < 192) {
			_tmp$6 = 65533; _tmp$7 = 1; _tmp$8 = false; r = _tmp$6; size = _tmp$7; short$1 = _tmp$8;
			return [r, size, short$1];
		}
		if (n < 2) {
			_tmp$9 = 65533; _tmp$10 = 1; _tmp$11 = true; r = _tmp$9; size = _tmp$10; short$1 = _tmp$11;
			return [r, size, short$1];
		}
		c1 = ((1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1]);
		if (c1 < 128 || 192 <= c1) {
			_tmp$12 = 65533; _tmp$13 = 1; _tmp$14 = false; r = _tmp$12; size = _tmp$13; short$1 = _tmp$14;
			return [r, size, short$1];
		}
		if (c0 < 224) {
			r = ((((c0 & 31) >>> 0) >> 0) << 6 >> 0) | (((c1 & 63) >>> 0) >> 0);
			if (r <= 127) {
				_tmp$15 = 65533; _tmp$16 = 1; _tmp$17 = false; r = _tmp$15; size = _tmp$16; short$1 = _tmp$17;
				return [r, size, short$1];
			}
			_tmp$18 = r; _tmp$19 = 2; _tmp$20 = false; r = _tmp$18; size = _tmp$19; short$1 = _tmp$20;
			return [r, size, short$1];
		}
		if (n < 3) {
			_tmp$21 = 65533; _tmp$22 = 1; _tmp$23 = true; r = _tmp$21; size = _tmp$22; short$1 = _tmp$23;
			return [r, size, short$1];
		}
		c2 = ((2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2]);
		if (c2 < 128 || 192 <= c2) {
			_tmp$24 = 65533; _tmp$25 = 1; _tmp$26 = false; r = _tmp$24; size = _tmp$25; short$1 = _tmp$26;
			return [r, size, short$1];
		}
		if (c0 < 240) {
			r = (((((c0 & 15) >>> 0) >> 0) << 12 >> 0) | ((((c1 & 63) >>> 0) >> 0) << 6 >> 0)) | (((c2 & 63) >>> 0) >> 0);
			if (r <= 2047) {
				_tmp$27 = 65533; _tmp$28 = 1; _tmp$29 = false; r = _tmp$27; size = _tmp$28; short$1 = _tmp$29;
				return [r, size, short$1];
			}
			if (55296 <= r && r <= 57343) {
				_tmp$30 = 65533; _tmp$31 = 1; _tmp$32 = false; r = _tmp$30; size = _tmp$31; short$1 = _tmp$32;
				return [r, size, short$1];
			}
			_tmp$33 = r; _tmp$34 = 3; _tmp$35 = false; r = _tmp$33; size = _tmp$34; short$1 = _tmp$35;
			return [r, size, short$1];
		}
		if (n < 4) {
			_tmp$36 = 65533; _tmp$37 = 1; _tmp$38 = true; r = _tmp$36; size = _tmp$37; short$1 = _tmp$38;
			return [r, size, short$1];
		}
		c3 = ((3 < 0 || 3 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 3]);
		if (c3 < 128 || 192 <= c3) {
			_tmp$39 = 65533; _tmp$40 = 1; _tmp$41 = false; r = _tmp$39; size = _tmp$40; short$1 = _tmp$41;
			return [r, size, short$1];
		}
		if (c0 < 248) {
			r = ((((((c0 & 7) >>> 0) >> 0) << 18 >> 0) | ((((c1 & 63) >>> 0) >> 0) << 12 >> 0)) | ((((c2 & 63) >>> 0) >> 0) << 6 >> 0)) | (((c3 & 63) >>> 0) >> 0);
			if (r <= 65535 || 1114111 < r) {
				_tmp$42 = 65533; _tmp$43 = 1; _tmp$44 = false; r = _tmp$42; size = _tmp$43; short$1 = _tmp$44;
				return [r, size, short$1];
			}
			_tmp$45 = r; _tmp$46 = 4; _tmp$47 = false; r = _tmp$45; size = _tmp$46; short$1 = _tmp$47;
			return [r, size, short$1];
		}
		_tmp$48 = 65533; _tmp$49 = 1; _tmp$50 = false; r = _tmp$48; size = _tmp$49; short$1 = _tmp$50;
		return [r, size, short$1];
	};
	decodeRuneInStringInternal = function(s) {
		var r = 0, size = 0, short$1 = false, n, _tmp, _tmp$1, _tmp$2, c0, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tmp$10, _tmp$11, c1, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$20, _tmp$21, _tmp$22, _tmp$23, c2, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, c3, _tmp$39, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$50;
		n = s.length;
		if (n < 1) {
			_tmp = 65533; _tmp$1 = 0; _tmp$2 = true; r = _tmp; size = _tmp$1; short$1 = _tmp$2;
			return [r, size, short$1];
		}
		c0 = s.charCodeAt(0);
		if (c0 < 128) {
			_tmp$3 = (c0 >> 0); _tmp$4 = 1; _tmp$5 = false; r = _tmp$3; size = _tmp$4; short$1 = _tmp$5;
			return [r, size, short$1];
		}
		if (c0 < 192) {
			_tmp$6 = 65533; _tmp$7 = 1; _tmp$8 = false; r = _tmp$6; size = _tmp$7; short$1 = _tmp$8;
			return [r, size, short$1];
		}
		if (n < 2) {
			_tmp$9 = 65533; _tmp$10 = 1; _tmp$11 = true; r = _tmp$9; size = _tmp$10; short$1 = _tmp$11;
			return [r, size, short$1];
		}
		c1 = s.charCodeAt(1);
		if (c1 < 128 || 192 <= c1) {
			_tmp$12 = 65533; _tmp$13 = 1; _tmp$14 = false; r = _tmp$12; size = _tmp$13; short$1 = _tmp$14;
			return [r, size, short$1];
		}
		if (c0 < 224) {
			r = ((((c0 & 31) >>> 0) >> 0) << 6 >> 0) | (((c1 & 63) >>> 0) >> 0);
			if (r <= 127) {
				_tmp$15 = 65533; _tmp$16 = 1; _tmp$17 = false; r = _tmp$15; size = _tmp$16; short$1 = _tmp$17;
				return [r, size, short$1];
			}
			_tmp$18 = r; _tmp$19 = 2; _tmp$20 = false; r = _tmp$18; size = _tmp$19; short$1 = _tmp$20;
			return [r, size, short$1];
		}
		if (n < 3) {
			_tmp$21 = 65533; _tmp$22 = 1; _tmp$23 = true; r = _tmp$21; size = _tmp$22; short$1 = _tmp$23;
			return [r, size, short$1];
		}
		c2 = s.charCodeAt(2);
		if (c2 < 128 || 192 <= c2) {
			_tmp$24 = 65533; _tmp$25 = 1; _tmp$26 = false; r = _tmp$24; size = _tmp$25; short$1 = _tmp$26;
			return [r, size, short$1];
		}
		if (c0 < 240) {
			r = (((((c0 & 15) >>> 0) >> 0) << 12 >> 0) | ((((c1 & 63) >>> 0) >> 0) << 6 >> 0)) | (((c2 & 63) >>> 0) >> 0);
			if (r <= 2047) {
				_tmp$27 = 65533; _tmp$28 = 1; _tmp$29 = false; r = _tmp$27; size = _tmp$28; short$1 = _tmp$29;
				return [r, size, short$1];
			}
			if (55296 <= r && r <= 57343) {
				_tmp$30 = 65533; _tmp$31 = 1; _tmp$32 = false; r = _tmp$30; size = _tmp$31; short$1 = _tmp$32;
				return [r, size, short$1];
			}
			_tmp$33 = r; _tmp$34 = 3; _tmp$35 = false; r = _tmp$33; size = _tmp$34; short$1 = _tmp$35;
			return [r, size, short$1];
		}
		if (n < 4) {
			_tmp$36 = 65533; _tmp$37 = 1; _tmp$38 = true; r = _tmp$36; size = _tmp$37; short$1 = _tmp$38;
			return [r, size, short$1];
		}
		c3 = s.charCodeAt(3);
		if (c3 < 128 || 192 <= c3) {
			_tmp$39 = 65533; _tmp$40 = 1; _tmp$41 = false; r = _tmp$39; size = _tmp$40; short$1 = _tmp$41;
			return [r, size, short$1];
		}
		if (c0 < 248) {
			r = ((((((c0 & 7) >>> 0) >> 0) << 18 >> 0) | ((((c1 & 63) >>> 0) >> 0) << 12 >> 0)) | ((((c2 & 63) >>> 0) >> 0) << 6 >> 0)) | (((c3 & 63) >>> 0) >> 0);
			if (r <= 65535 || 1114111 < r) {
				_tmp$42 = 65533; _tmp$43 = 1; _tmp$44 = false; r = _tmp$42; size = _tmp$43; short$1 = _tmp$44;
				return [r, size, short$1];
			}
			_tmp$45 = r; _tmp$46 = 4; _tmp$47 = false; r = _tmp$45; size = _tmp$46; short$1 = _tmp$47;
			return [r, size, short$1];
		}
		_tmp$48 = 65533; _tmp$49 = 1; _tmp$50 = false; r = _tmp$48; size = _tmp$49; short$1 = _tmp$50;
		return [r, size, short$1];
	};
	FullRune = $pkg.FullRune = function(p) {
		var _tuple, short$1;
		_tuple = decodeRuneInternal(p); short$1 = _tuple[2];
		return !short$1;
	};
	DecodeRune = $pkg.DecodeRune = function(p) {
		var r = 0, size = 0, _tuple;
		_tuple = decodeRuneInternal(p); r = _tuple[0]; size = _tuple[1];
		return [r, size];
	};
	DecodeRuneInString = $pkg.DecodeRuneInString = function(s) {
		var r = 0, size = 0, _tuple;
		_tuple = decodeRuneInStringInternal(s); r = _tuple[0]; size = _tuple[1];
		return [r, size];
	};
	DecodeLastRune = $pkg.DecodeLastRune = function(p) {
		var r = 0, size = 0, end, _tmp, _tmp$1, start, _tmp$2, _tmp$3, lim, _tuple, _tmp$4, _tmp$5, _tmp$6, _tmp$7;
		end = p.$length;
		if (end === 0) {
			_tmp = 65533; _tmp$1 = 0; r = _tmp; size = _tmp$1;
			return [r, size];
		}
		start = end - 1 >> 0;
		r = (((start < 0 || start >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + start]) >> 0);
		if (r < 128) {
			_tmp$2 = r; _tmp$3 = 1; r = _tmp$2; size = _tmp$3;
			return [r, size];
		}
		lim = end - 4 >> 0;
		if (lim < 0) {
			lim = 0;
		}
		start = start - (1) >> 0;
		while (start >= lim) {
			if (RuneStart(((start < 0 || start >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + start]))) {
				break;
			}
			start = start - (1) >> 0;
		}
		if (start < 0) {
			start = 0;
		}
		_tuple = DecodeRune($subslice(p, start, end)); r = _tuple[0]; size = _tuple[1];
		if (!(((start + size >> 0) === end))) {
			_tmp$4 = 65533; _tmp$5 = 1; r = _tmp$4; size = _tmp$5;
			return [r, size];
		}
		_tmp$6 = r; _tmp$7 = size; r = _tmp$6; size = _tmp$7;
		return [r, size];
	};
	RuneLen = $pkg.RuneLen = function(r) {
		if (r < 0) {
			return -1;
		} else if (r <= 127) {
			return 1;
		} else if (r <= 2047) {
			return 2;
		} else if (55296 <= r && r <= 57343) {
			return -1;
		} else if (r <= 65535) {
			return 3;
		} else if (r <= 1114111) {
			return 4;
		}
		return -1;
	};
	EncodeRune = $pkg.EncodeRune = function(p, r) {
		var i;
		i = (r >>> 0);
		if (i <= 127) {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (r << 24 >>> 24);
			return 1;
		} else if (i <= 2047) {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (192 | ((r >> 6 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 2;
		} else if (i > 1114111 || 55296 <= i && i <= 57343) {
			r = 65533;
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (224 | ((r >> 12 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | ((((r >> 6 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 3;
		} else if (i <= 65535) {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (224 | ((r >> 12 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | ((((r >> 6 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 3;
		} else {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (240 | ((r >> 18 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | ((((r >> 12 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2] = (128 | ((((r >> 6 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(3 < 0 || 3 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 3] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 4;
		}
	};
	RuneCountInString = $pkg.RuneCountInString = function(s) {
		var n = 0, _ref, _i, _rune;
		_ref = s;
		_i = 0;
		while (_i < _ref.length) {
			_rune = $decodeRune(_ref, _i);
			n = n + (1) >> 0;
			_i += _rune[1];
		}
		return n;
	};
	RuneStart = $pkg.RuneStart = function(b) {
		return !((((b & 192) >>> 0) === 128));
	};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["bytes"] = (function() {
	var $pkg = {}, errors = $packages["errors"], io = $packages["io"], utf8 = $packages["unicode/utf8"], unicode = $packages["unicode"], Buffer, readOp, IndexByte, makeSlice, Map;
	Buffer = $pkg.Buffer = $newType(0, "Struct", "bytes.Buffer", "Buffer", "bytes", function(buf_, off_, runeBytes_, bootstrap_, lastRead_) {
		this.$val = this;
		this.buf = buf_ !== undefined ? buf_ : ($sliceType($Uint8)).nil;
		this.off = off_ !== undefined ? off_ : 0;
		this.runeBytes = runeBytes_ !== undefined ? runeBytes_ : ($arrayType($Uint8, 4)).zero();
		this.bootstrap = bootstrap_ !== undefined ? bootstrap_ : ($arrayType($Uint8, 64)).zero();
		this.lastRead = lastRead_ !== undefined ? lastRead_ : 0;
	});
	readOp = $pkg.readOp = $newType(4, "Int", "bytes.readOp", "readOp", "bytes", null);
	IndexByte = $pkg.IndexByte = function(s, c) {
		var _ref, _i, i, b;
		_ref = s;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			b = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (b === c) {
				return i;
			}
			_i++;
		}
		return -1;
	};
	Buffer.Ptr.prototype.Bytes = function() {
		var b;
		b = this;
		return $subslice(b.buf, b.off);
	};
	Buffer.prototype.Bytes = function() { return this.$val.Bytes(); };
	Buffer.Ptr.prototype.String = function() {
		var b;
		b = this;
		if (b === ($ptrType(Buffer)).nil) {
			return "<nil>";
		}
		return $bytesToString($subslice(b.buf, b.off));
	};
	Buffer.prototype.String = function() { return this.$val.String(); };
	Buffer.Ptr.prototype.Len = function() {
		var b;
		b = this;
		return b.buf.$length - b.off >> 0;
	};
	Buffer.prototype.Len = function() { return this.$val.Len(); };
	Buffer.Ptr.prototype.Truncate = function(n) {
		var b;
		b = this;
		b.lastRead = 0;
		if (n < 0 || n > b.Len()) {
			$panic(new $String("bytes.Buffer: truncation out of range"));
		} else if (n === 0) {
			b.off = 0;
		}
		b.buf = $subslice(b.buf, 0, (b.off + n >> 0));
	};
	Buffer.prototype.Truncate = function(n) { return this.$val.Truncate(n); };
	Buffer.Ptr.prototype.Reset = function() {
		var b;
		b = this;
		b.Truncate(0);
	};
	Buffer.prototype.Reset = function() { return this.$val.Reset(); };
	Buffer.Ptr.prototype.grow = function(n) {
		var b, m, buf, _q, x;
		b = this;
		m = b.Len();
		if ((m === 0) && !((b.off === 0))) {
			b.Truncate(0);
		}
		if ((b.buf.$length + n >> 0) > b.buf.$capacity) {
			buf = ($sliceType($Uint8)).nil;
			if (b.buf === ($sliceType($Uint8)).nil && n <= 64) {
				buf = $subslice(new ($sliceType($Uint8))(b.bootstrap), 0);
			} else if ((m + n >> 0) <= (_q = b.buf.$capacity / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"))) {
				$copySlice(b.buf, $subslice(b.buf, b.off));
				buf = $subslice(b.buf, 0, m);
			} else {
				buf = makeSlice((x = b.buf.$capacity, (((2 >>> 16 << 16) * x >> 0) + (2 << 16 >>> 16) * x) >> 0) + n >> 0);
				$copySlice(buf, $subslice(b.buf, b.off));
			}
			b.buf = buf;
			b.off = 0;
		}
		b.buf = $subslice(b.buf, 0, ((b.off + m >> 0) + n >> 0));
		return b.off + m >> 0;
	};
	Buffer.prototype.grow = function(n) { return this.$val.grow(n); };
	Buffer.Ptr.prototype.Grow = function(n) {
		var b, m;
		b = this;
		if (n < 0) {
			$panic(new $String("bytes.Buffer.Grow: negative count"));
		}
		m = b.grow(n);
		b.buf = $subslice(b.buf, 0, m);
	};
	Buffer.prototype.Grow = function(n) { return this.$val.Grow(n); };
	Buffer.Ptr.prototype.Write = function(p) {
		var n = 0, err = $ifaceNil, b, m, _tmp, _tmp$1;
		b = this;
		b.lastRead = 0;
		m = b.grow(p.$length);
		_tmp = $copySlice($subslice(b.buf, m), p); _tmp$1 = $ifaceNil; n = _tmp; err = _tmp$1;
		return [n, err];
	};
	Buffer.prototype.Write = function(p) { return this.$val.Write(p); };
	Buffer.Ptr.prototype.WriteString = function(s) {
		var n = 0, err = $ifaceNil, b, m, _tmp, _tmp$1;
		b = this;
		b.lastRead = 0;
		m = b.grow(s.length);
		_tmp = $copyString($subslice(b.buf, m), s); _tmp$1 = $ifaceNil; n = _tmp; err = _tmp$1;
		return [n, err];
	};
	Buffer.prototype.WriteString = function(s) { return this.$val.WriteString(s); };
	Buffer.Ptr.prototype.ReadFrom = function(r) {
		var n = new $Int64(0, 0), err = $ifaceNil, b, free, newBuf, x, _tuple, m, e, x$1, _tmp, _tmp$1, _tmp$2, _tmp$3;
		b = this;
		b.lastRead = 0;
		if (b.off >= b.buf.$length) {
			b.Truncate(0);
		}
		while (true) {
			free = b.buf.$capacity - b.buf.$length >> 0;
			if (free < 512) {
				newBuf = b.buf;
				if ((b.off + free >> 0) < 512) {
					newBuf = makeSlice((x = b.buf.$capacity, (((2 >>> 16 << 16) * x >> 0) + (2 << 16 >>> 16) * x) >> 0) + 512 >> 0);
				}
				$copySlice(newBuf, $subslice(b.buf, b.off));
				b.buf = $subslice(newBuf, 0, (b.buf.$length - b.off >> 0));
				b.off = 0;
			}
			_tuple = r.Read($subslice(b.buf, b.buf.$length, b.buf.$capacity)); m = _tuple[0]; e = _tuple[1];
			b.buf = $subslice(b.buf, 0, (b.buf.$length + m >> 0));
			n = (x$1 = new $Int64(0, m), new $Int64(n.$high + x$1.$high, n.$low + x$1.$low));
			if ($interfaceIsEqual(e, io.EOF)) {
				break;
			}
			if (!($interfaceIsEqual(e, $ifaceNil))) {
				_tmp = n; _tmp$1 = e; n = _tmp; err = _tmp$1;
				return [n, err];
			}
		}
		_tmp$2 = n; _tmp$3 = $ifaceNil; n = _tmp$2; err = _tmp$3;
		return [n, err];
	};
	Buffer.prototype.ReadFrom = function(r) { return this.$val.ReadFrom(r); };
	makeSlice = function(n) {
		var $deferred = [], $err = null;
		/* */ try { $deferFrames.push($deferred);
		$deferred.push([(function() {
			if (!($interfaceIsEqual($recover(), $ifaceNil))) {
				$panic($pkg.ErrTooLarge);
			}
		}), []]);
		return ($sliceType($Uint8)).make(n);
		/* */ } catch(err) { $err = err; return ($sliceType($Uint8)).nil; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	Buffer.Ptr.prototype.WriteTo = function(w) {
		var n = new $Int64(0, 0), err = $ifaceNil, b, nBytes, _tuple, m, e, _tmp, _tmp$1, _tmp$2, _tmp$3;
		b = this;
		b.lastRead = 0;
		if (b.off < b.buf.$length) {
			nBytes = b.Len();
			_tuple = w.Write($subslice(b.buf, b.off)); m = _tuple[0]; e = _tuple[1];
			if (m > nBytes) {
				$panic(new $String("bytes.Buffer.WriteTo: invalid Write count"));
			}
			b.off = b.off + (m) >> 0;
			n = new $Int64(0, m);
			if (!($interfaceIsEqual(e, $ifaceNil))) {
				_tmp = n; _tmp$1 = e; n = _tmp; err = _tmp$1;
				return [n, err];
			}
			if (!((m === nBytes))) {
				_tmp$2 = n; _tmp$3 = io.ErrShortWrite; n = _tmp$2; err = _tmp$3;
				return [n, err];
			}
		}
		b.Truncate(0);
		return [n, err];
	};
	Buffer.prototype.WriteTo = function(w) { return this.$val.WriteTo(w); };
	Buffer.Ptr.prototype.WriteByte = function(c) {
		var b, m, x;
		b = this;
		b.lastRead = 0;
		m = b.grow(1);
		(x = b.buf, (m < 0 || m >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + m] = c);
		return $ifaceNil;
	};
	Buffer.prototype.WriteByte = function(c) { return this.$val.WriteByte(c); };
	Buffer.Ptr.prototype.WriteRune = function(r) {
		var n = 0, err = $ifaceNil, b, _tmp, _tmp$1, _tmp$2, _tmp$3;
		b = this;
		if (r < 128) {
			b.WriteByte((r << 24 >>> 24));
			_tmp = 1; _tmp$1 = $ifaceNil; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		n = utf8.EncodeRune($subslice(new ($sliceType($Uint8))(b.runeBytes), 0), r);
		b.Write($subslice(new ($sliceType($Uint8))(b.runeBytes), 0, n));
		_tmp$2 = n; _tmp$3 = $ifaceNil; n = _tmp$2; err = _tmp$3;
		return [n, err];
	};
	Buffer.prototype.WriteRune = function(r) { return this.$val.WriteRune(r); };
	Buffer.Ptr.prototype.Read = function(p) {
		var n = 0, err = $ifaceNil, b, _tmp, _tmp$1;
		b = this;
		b.lastRead = 0;
		if (b.off >= b.buf.$length) {
			b.Truncate(0);
			if (p.$length === 0) {
				return [n, err];
			}
			_tmp = 0; _tmp$1 = io.EOF; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		n = $copySlice(p, $subslice(b.buf, b.off));
		b.off = b.off + (n) >> 0;
		if (n > 0) {
			b.lastRead = 2;
		}
		return [n, err];
	};
	Buffer.prototype.Read = function(p) { return this.$val.Read(p); };
	Buffer.Ptr.prototype.Next = function(n) {
		var b, m, data;
		b = this;
		b.lastRead = 0;
		m = b.Len();
		if (n > m) {
			n = m;
		}
		data = $subslice(b.buf, b.off, (b.off + n >> 0));
		b.off = b.off + (n) >> 0;
		if (n > 0) {
			b.lastRead = 2;
		}
		return data;
	};
	Buffer.prototype.Next = function(n) { return this.$val.Next(n); };
	Buffer.Ptr.prototype.ReadByte = function() {
		var c = 0, err = $ifaceNil, b, _tmp, _tmp$1, x, x$1, _tmp$2, _tmp$3;
		b = this;
		b.lastRead = 0;
		if (b.off >= b.buf.$length) {
			b.Truncate(0);
			_tmp = 0; _tmp$1 = io.EOF; c = _tmp; err = _tmp$1;
			return [c, err];
		}
		c = (x = b.buf, x$1 = b.off, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1]));
		b.off = b.off + (1) >> 0;
		b.lastRead = 2;
		_tmp$2 = c; _tmp$3 = $ifaceNil; c = _tmp$2; err = _tmp$3;
		return [c, err];
	};
	Buffer.prototype.ReadByte = function() { return this.$val.ReadByte(); };
	Buffer.Ptr.prototype.ReadRune = function() {
		var r = 0, size = 0, err = $ifaceNil, b, _tmp, _tmp$1, _tmp$2, x, x$1, c, _tmp$3, _tmp$4, _tmp$5, _tuple, n, _tmp$6, _tmp$7, _tmp$8;
		b = this;
		b.lastRead = 0;
		if (b.off >= b.buf.$length) {
			b.Truncate(0);
			_tmp = 0; _tmp$1 = 0; _tmp$2 = io.EOF; r = _tmp; size = _tmp$1; err = _tmp$2;
			return [r, size, err];
		}
		b.lastRead = 1;
		c = (x = b.buf, x$1 = b.off, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1]));
		if (c < 128) {
			b.off = b.off + (1) >> 0;
			_tmp$3 = (c >> 0); _tmp$4 = 1; _tmp$5 = $ifaceNil; r = _tmp$3; size = _tmp$4; err = _tmp$5;
			return [r, size, err];
		}
		_tuple = utf8.DecodeRune($subslice(b.buf, b.off)); r = _tuple[0]; n = _tuple[1];
		b.off = b.off + (n) >> 0;
		_tmp$6 = r; _tmp$7 = n; _tmp$8 = $ifaceNil; r = _tmp$6; size = _tmp$7; err = _tmp$8;
		return [r, size, err];
	};
	Buffer.prototype.ReadRune = function() { return this.$val.ReadRune(); };
	Buffer.Ptr.prototype.UnreadRune = function() {
		var b, _tuple, n;
		b = this;
		if (!((b.lastRead === 1))) {
			return errors.New("bytes.Buffer: UnreadRune: previous operation was not ReadRune");
		}
		b.lastRead = 0;
		if (b.off > 0) {
			_tuple = utf8.DecodeLastRune($subslice(b.buf, 0, b.off)); n = _tuple[1];
			b.off = b.off - (n) >> 0;
		}
		return $ifaceNil;
	};
	Buffer.prototype.UnreadRune = function() { return this.$val.UnreadRune(); };
	Buffer.Ptr.prototype.UnreadByte = function() {
		var b;
		b = this;
		if (!((b.lastRead === 1)) && !((b.lastRead === 2))) {
			return errors.New("bytes.Buffer: UnreadByte: previous operation was not a read");
		}
		b.lastRead = 0;
		if (b.off > 0) {
			b.off = b.off - (1) >> 0;
		}
		return $ifaceNil;
	};
	Buffer.prototype.UnreadByte = function() { return this.$val.UnreadByte(); };
	Buffer.Ptr.prototype.ReadBytes = function(delim) {
		var line = ($sliceType($Uint8)).nil, err = $ifaceNil, b, _tuple, slice;
		b = this;
		_tuple = b.readSlice(delim); slice = _tuple[0]; err = _tuple[1];
		line = $appendSlice(line, slice);
		return [line, err];
	};
	Buffer.prototype.ReadBytes = function(delim) { return this.$val.ReadBytes(delim); };
	Buffer.Ptr.prototype.readSlice = function(delim) {
		var line = ($sliceType($Uint8)).nil, err = $ifaceNil, b, i, end, _tmp, _tmp$1;
		b = this;
		i = IndexByte($subslice(b.buf, b.off), delim);
		end = (b.off + i >> 0) + 1 >> 0;
		if (i < 0) {
			end = b.buf.$length;
			err = io.EOF;
		}
		line = $subslice(b.buf, b.off, end);
		b.off = end;
		b.lastRead = 2;
		_tmp = line; _tmp$1 = err; line = _tmp; err = _tmp$1;
		return [line, err];
	};
	Buffer.prototype.readSlice = function(delim) { return this.$val.readSlice(delim); };
	Buffer.Ptr.prototype.ReadString = function(delim) {
		var line = "", err = $ifaceNil, b, _tuple, slice, _tmp, _tmp$1;
		b = this;
		_tuple = b.readSlice(delim); slice = _tuple[0]; err = _tuple[1];
		_tmp = $bytesToString(slice); _tmp$1 = err; line = _tmp; err = _tmp$1;
		return [line, err];
	};
	Buffer.prototype.ReadString = function(delim) { return this.$val.ReadString(delim); };
	Map = $pkg.Map = function(mapping, s) {
		var maxbytes, nbytes, b, i, wid, r, _tuple, rl, nb;
		maxbytes = s.$length;
		nbytes = 0;
		b = ($sliceType($Uint8)).make(maxbytes);
		i = 0;
		while (i < s.$length) {
			wid = 1;
			r = (((i < 0 || i >= s.$length) ? $throwRuntimeError("index out of range") : s.$array[s.$offset + i]) >> 0);
			if (r >= 128) {
				_tuple = utf8.DecodeRune($subslice(s, i)); r = _tuple[0]; wid = _tuple[1];
			}
			r = mapping(r);
			if (r >= 0) {
				rl = utf8.RuneLen(r);
				if (rl < 0) {
					rl = 3;
				}
				if ((nbytes + rl >> 0) > maxbytes) {
					maxbytes = ((((maxbytes >>> 16 << 16) * 2 >> 0) + (maxbytes << 16 >>> 16) * 2) >> 0) + 4 >> 0;
					nb = ($sliceType($Uint8)).make(maxbytes);
					$copySlice(nb, $subslice(b, 0, nbytes));
					b = nb;
				}
				nbytes = nbytes + (utf8.EncodeRune($subslice(b, nbytes, maxbytes), r)) >> 0;
			}
			i = i + (wid) >> 0;
		}
		return $subslice(b, 0, nbytes);
	};
	$pkg.$init = function() {
		($ptrType(Buffer)).methods = [["Bytes", "Bytes", "", $funcType([], [($sliceType($Uint8))], false), -1], ["Grow", "Grow", "", $funcType([$Int], [], false), -1], ["Len", "Len", "", $funcType([], [$Int], false), -1], ["Next", "Next", "", $funcType([$Int], [($sliceType($Uint8))], false), -1], ["Read", "Read", "", $funcType([($sliceType($Uint8))], [$Int, $error], false), -1], ["ReadByte", "ReadByte", "", $funcType([], [$Uint8, $error], false), -1], ["ReadBytes", "ReadBytes", "", $funcType([$Uint8], [($sliceType($Uint8)), $error], false), -1], ["ReadFrom", "ReadFrom", "", $funcType([io.Reader], [$Int64, $error], false), -1], ["ReadRune", "ReadRune", "", $funcType([], [$Int32, $Int, $error], false), -1], ["ReadString", "ReadString", "", $funcType([$Uint8], [$String, $error], false), -1], ["Reset", "Reset", "", $funcType([], [], false), -1], ["String", "String", "", $funcType([], [$String], false), -1], ["Truncate", "Truncate", "", $funcType([$Int], [], false), -1], ["UnreadByte", "UnreadByte", "", $funcType([], [$error], false), -1], ["UnreadRune", "UnreadRune", "", $funcType([], [$error], false), -1], ["Write", "Write", "", $funcType([($sliceType($Uint8))], [$Int, $error], false), -1], ["WriteByte", "WriteByte", "", $funcType([$Uint8], [$error], false), -1], ["WriteRune", "WriteRune", "", $funcType([$Int32], [$Int, $error], false), -1], ["WriteString", "WriteString", "", $funcType([$String], [$Int, $error], false), -1], ["WriteTo", "WriteTo", "", $funcType([io.Writer], [$Int64, $error], false), -1], ["grow", "grow", "bytes", $funcType([$Int], [$Int], false), -1], ["readSlice", "readSlice", "bytes", $funcType([$Uint8], [($sliceType($Uint8)), $error], false), -1]];
		Buffer.init([["buf", "buf", "bytes", ($sliceType($Uint8)), ""], ["off", "off", "bytes", $Int, ""], ["runeBytes", "runeBytes", "bytes", ($arrayType($Uint8, 4)), ""], ["bootstrap", "bootstrap", "bytes", ($arrayType($Uint8, 64)), ""], ["lastRead", "lastRead", "bytes", readOp, ""]]);
		$pkg.ErrTooLarge = errors.New("bytes.Buffer: too large");
	};
	return $pkg;
})();
$packages["math"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], math, zero, posInf, negInf, nan, pow10tab, init, Inf, IsInf, Ldexp, NaN, Float32bits, Float32frombits, Float64bits, Float64frombits, init$1;
	init = function() {
		Float32bits(0);
		Float32frombits(0);
	};
	Inf = $pkg.Inf = function(sign) {
		if (sign >= 0) {
			return posInf;
		} else {
			return negInf;
		}
	};
	IsInf = $pkg.IsInf = function(f, sign) {
		if (f === posInf) {
			return sign >= 0;
		}
		if (f === negInf) {
			return sign <= 0;
		}
		return false;
	};
	Ldexp = $pkg.Ldexp = function(frac, exp$1) {
		if (frac === 0) {
			return frac;
		}
		if (exp$1 >= 1024) {
			return frac * $parseFloat(math.pow(2, 1023)) * $parseFloat(math.pow(2, exp$1 - 1023 >> 0));
		}
		if (exp$1 <= -1024) {
			return frac * $parseFloat(math.pow(2, -1023)) * $parseFloat(math.pow(2, exp$1 + 1023 >> 0));
		}
		return frac * $parseFloat(math.pow(2, exp$1));
	};
	NaN = $pkg.NaN = function() {
		return nan;
	};
	Float32bits = $pkg.Float32bits = function(f) {
		var s, e, r;
		if ($float32IsEqual(f, 0)) {
			if ($float32IsEqual(1 / f, negInf)) {
				return 2147483648;
			}
			return 0;
		}
		if (!(($float32IsEqual(f, f)))) {
			return 2143289344;
		}
		s = 0;
		if (f < 0) {
			s = 2147483648;
			f = -f;
		}
		e = 150;
		while (f >= 1.6777216e+07) {
			f = f / (2);
			if (e === 255) {
				break;
			}
			e = e + (1) >>> 0;
		}
		while (f < 8.388608e+06) {
			e = e - (1) >>> 0;
			if (e === 0) {
				break;
			}
			f = f * (2);
		}
		r = $parseFloat($mod(f, 2));
		if ((r > 0.5 && r < 1) || r >= 1.5) {
			f = f + (1);
		}
		return (((s | (e << 23 >>> 0)) >>> 0) | (((f >> 0) & ~8388608))) >>> 0;
	};
	Float32frombits = $pkg.Float32frombits = function(b) {
		var s, e, m;
		s = 1;
		if (!((((b & 2147483648) >>> 0) === 0))) {
			s = -1;
		}
		e = (((b >>> 23 >>> 0)) & 255) >>> 0;
		m = (b & 8388607) >>> 0;
		if (e === 255) {
			if (m === 0) {
				return s / 0;
			}
			return nan;
		}
		if (!((e === 0))) {
			m = m + (8388608) >>> 0;
		}
		if (e === 0) {
			e = 1;
		}
		return Ldexp(m, ((e >> 0) - 127 >> 0) - 23 >> 0) * s;
	};
	Float64bits = $pkg.Float64bits = function(f) {
		var s, e, x, x$1, x$2, x$3;
		if (f === 0) {
			if (1 / f === negInf) {
				return new $Uint64(2147483648, 0);
			}
			return new $Uint64(0, 0);
		}
		if (!((f === f))) {
			return new $Uint64(2146959360, 1);
		}
		s = new $Uint64(0, 0);
		if (f < 0) {
			s = new $Uint64(2147483648, 0);
			f = -f;
		}
		e = 1075;
		while (f >= 9.007199254740992e+15) {
			f = f / (2);
			if (e === 2047) {
				break;
			}
			e = e + (1) >>> 0;
		}
		while (f < 4.503599627370496e+15) {
			e = e - (1) >>> 0;
			if (e === 0) {
				break;
			}
			f = f * (2);
		}
		return (x = (x$1 = $shiftLeft64(new $Uint64(0, e), 52), new $Uint64(s.$high | x$1.$high, (s.$low | x$1.$low) >>> 0)), x$2 = (x$3 = new $Uint64(0, f), new $Uint64(x$3.$high &~ 1048576, (x$3.$low &~ 0) >>> 0)), new $Uint64(x.$high | x$2.$high, (x.$low | x$2.$low) >>> 0));
	};
	Float64frombits = $pkg.Float64frombits = function(b) {
		var s, x, x$1, e, m, x$2;
		s = 1;
		if (!((x = new $Uint64(b.$high & 2147483648, (b.$low & 0) >>> 0), (x.$high === 0 && x.$low === 0)))) {
			s = -1;
		}
		e = (x$1 = $shiftRightUint64(b, 52), new $Uint64(x$1.$high & 0, (x$1.$low & 2047) >>> 0));
		m = new $Uint64(b.$high & 1048575, (b.$low & 4294967295) >>> 0);
		if ((e.$high === 0 && e.$low === 2047)) {
			if ((m.$high === 0 && m.$low === 0)) {
				return s / 0;
			}
			return nan;
		}
		if (!((e.$high === 0 && e.$low === 0))) {
			m = (x$2 = new $Uint64(1048576, 0), new $Uint64(m.$high + x$2.$high, m.$low + x$2.$low));
		}
		if ((e.$high === 0 && e.$low === 0)) {
			e = new $Uint64(0, 1);
		}
		return Ldexp($flatten64(m), ((e.$low >> 0) - 1023 >> 0) - 52 >> 0) * s;
	};
	init$1 = function() {
		var i, _q, m, x;
		pow10tab[0] = 1;
		pow10tab[1] = 10;
		i = 2;
		while (i < 70) {
			m = (_q = i / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			(i < 0 || i >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[i] = ((m < 0 || m >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[m]) * (x = i - m >> 0, ((x < 0 || x >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[x]));
			i = i + (1) >> 0;
		}
	};
	$pkg.$init = function() {
		pow10tab = ($arrayType($Float64, 70)).zero();
		math = $global.Math;
		zero = 0;
		posInf = 1 / zero;
		negInf = -1 / zero;
		nan = 0 / zero;
		init();
		init$1();
	};
	return $pkg;
})();
$packages["syscall"] = (function() {
	var $pkg = {}, bytes = $packages["bytes"], js = $packages["github.com/gopherjs/gopherjs/js"], sync = $packages["sync"], runtime = $packages["runtime"], errors = $packages["errors"], mmapper, Errno, _C_int, Timespec, Stat_t, Dirent, warningPrinted, lineBuffer, syscallModule, alreadyTriedToLoad, minusOne, envOnce, envLock, env, envs, mapper, errors$1, printWarning, printToConsole, init, syscall, Syscall, Syscall6, BytePtrFromString, copyenv, Getenv, itoa, ByteSliceFromString, ReadDirent, Sysctl, nametomib, ParseDirent, Read, Write, sysctl, Close, Exit, Fchdir, Fchmod, Fchown, Fstat, Fsync, Ftruncate, Getdirentries, Lstat, Pread, Pwrite, read, Seek, write, mmap, munmap;
	mmapper = $pkg.mmapper = $newType(0, "Struct", "syscall.mmapper", "mmapper", "syscall", function(Mutex_, active_, mmap_, munmap_) {
		this.$val = this;
		this.Mutex = Mutex_ !== undefined ? Mutex_ : new sync.Mutex.Ptr();
		this.active = active_ !== undefined ? active_ : false;
		this.mmap = mmap_ !== undefined ? mmap_ : $throwNilPointerError;
		this.munmap = munmap_ !== undefined ? munmap_ : $throwNilPointerError;
	});
	Errno = $pkg.Errno = $newType(4, "Uintptr", "syscall.Errno", "Errno", "syscall", null);
	_C_int = $pkg._C_int = $newType(4, "Int32", "syscall._C_int", "_C_int", "syscall", null);
	Timespec = $pkg.Timespec = $newType(0, "Struct", "syscall.Timespec", "Timespec", "syscall", function(Sec_, Nsec_) {
		this.$val = this;
		this.Sec = Sec_ !== undefined ? Sec_ : new $Int64(0, 0);
		this.Nsec = Nsec_ !== undefined ? Nsec_ : new $Int64(0, 0);
	});
	Stat_t = $pkg.Stat_t = $newType(0, "Struct", "syscall.Stat_t", "Stat_t", "syscall", function(Dev_, Mode_, Nlink_, Ino_, Uid_, Gid_, Rdev_, Pad_cgo_0_, Atimespec_, Mtimespec_, Ctimespec_, Birthtimespec_, Size_, Blocks_, Blksize_, Flags_, Gen_, Lspare_, Qspare_) {
		this.$val = this;
		this.Dev = Dev_ !== undefined ? Dev_ : 0;
		this.Mode = Mode_ !== undefined ? Mode_ : 0;
		this.Nlink = Nlink_ !== undefined ? Nlink_ : 0;
		this.Ino = Ino_ !== undefined ? Ino_ : new $Uint64(0, 0);
		this.Uid = Uid_ !== undefined ? Uid_ : 0;
		this.Gid = Gid_ !== undefined ? Gid_ : 0;
		this.Rdev = Rdev_ !== undefined ? Rdev_ : 0;
		this.Pad_cgo_0 = Pad_cgo_0_ !== undefined ? Pad_cgo_0_ : ($arrayType($Uint8, 4)).zero();
		this.Atimespec = Atimespec_ !== undefined ? Atimespec_ : new Timespec.Ptr();
		this.Mtimespec = Mtimespec_ !== undefined ? Mtimespec_ : new Timespec.Ptr();
		this.Ctimespec = Ctimespec_ !== undefined ? Ctimespec_ : new Timespec.Ptr();
		this.Birthtimespec = Birthtimespec_ !== undefined ? Birthtimespec_ : new Timespec.Ptr();
		this.Size = Size_ !== undefined ? Size_ : new $Int64(0, 0);
		this.Blocks = Blocks_ !== undefined ? Blocks_ : new $Int64(0, 0);
		this.Blksize = Blksize_ !== undefined ? Blksize_ : 0;
		this.Flags = Flags_ !== undefined ? Flags_ : 0;
		this.Gen = Gen_ !== undefined ? Gen_ : 0;
		this.Lspare = Lspare_ !== undefined ? Lspare_ : 0;
		this.Qspare = Qspare_ !== undefined ? Qspare_ : ($arrayType($Int64, 2)).zero();
	});
	Dirent = $pkg.Dirent = $newType(0, "Struct", "syscall.Dirent", "Dirent", "syscall", function(Ino_, Seekoff_, Reclen_, Namlen_, Type_, Name_, Pad_cgo_0_) {
		this.$val = this;
		this.Ino = Ino_ !== undefined ? Ino_ : new $Uint64(0, 0);
		this.Seekoff = Seekoff_ !== undefined ? Seekoff_ : new $Uint64(0, 0);
		this.Reclen = Reclen_ !== undefined ? Reclen_ : 0;
		this.Namlen = Namlen_ !== undefined ? Namlen_ : 0;
		this.Type = Type_ !== undefined ? Type_ : 0;
		this.Name = Name_ !== undefined ? Name_ : ($arrayType($Int8, 1024)).zero();
		this.Pad_cgo_0 = Pad_cgo_0_ !== undefined ? Pad_cgo_0_ : ($arrayType($Uint8, 3)).zero();
	});
	printWarning = function() {
		if (!warningPrinted) {
			console.log("warning: system calls not available, see https://github.com/gopherjs/gopherjs/blob/master/doc/syscalls.md");
		}
		warningPrinted = true;
	};
	printToConsole = function(b) {
		var goPrintToConsole, i;
		goPrintToConsole = $global.goPrintToConsole;
		if (!(goPrintToConsole === undefined)) {
			goPrintToConsole(b);
			return;
		}
		lineBuffer = $appendSlice(lineBuffer, b);
		while (true) {
			i = bytes.IndexByte(lineBuffer, 10);
			if (i === -1) {
				break;
			}
			$global.console.log($externalize($bytesToString($subslice(lineBuffer, 0, i)), $String));
			lineBuffer = $subslice(lineBuffer, (i + 1 >> 0));
		}
	};
	init = function() {
		var process, jsEnv, envkeys, i, key;
		process = $global.process;
		if (!(process === undefined)) {
			jsEnv = process.env;
			envkeys = $global.Object.keys(jsEnv);
			envs = ($sliceType($String)).make($parseInt(envkeys.length));
			i = 0;
			while (i < $parseInt(envkeys.length)) {
				key = $internalize(envkeys[i], $String);
				(i < 0 || i >= envs.$length) ? $throwRuntimeError("index out of range") : envs.$array[envs.$offset + i] = key + "=" + $internalize(jsEnv[$externalize(key, $String)], $String);
				i = i + (1) >> 0;
			}
		}
	};
	syscall = function(name) {
		var $deferred = [], $err = null, require;
		/* */ try { $deferFrames.push($deferred);
		$deferred.push([(function() {
			$recover();
		}), []]);
		if (syscallModule === $ifaceNil) {
			if (alreadyTriedToLoad) {
				return $ifaceNil;
			}
			alreadyTriedToLoad = true;
			require = $global.require;
			if (require === undefined) {
				$panic(new $String(""));
			}
			syscallModule = require($externalize("syscall", $String));
		}
		return syscallModule[$externalize(name, $String)];
		/* */ } catch(err) { $err = err; return $ifaceNil; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	Syscall = $pkg.Syscall = function(trap, a1, a2, a3) {
		var r1 = 0, r2 = 0, err = 0, f, r, _tmp, _tmp$1, _tmp$2, array, slice, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8;
		f = syscall("Syscall");
		if (!(f === $ifaceNil)) {
			r = f(trap, a1, a2, a3);
			_tmp = (($parseInt(r[0]) >> 0) >>> 0); _tmp$1 = (($parseInt(r[1]) >> 0) >>> 0); _tmp$2 = (($parseInt(r[2]) >> 0) >>> 0); r1 = _tmp; r2 = _tmp$1; err = _tmp$2;
			return [r1, r2, err];
		}
		if ((trap === 4) && ((a1 === 1) || (a1 === 2))) {
			array = a2;
			slice = ($sliceType($Uint8)).make($parseInt(array.length));
			slice.$array = array;
			printToConsole(slice);
			_tmp$3 = ($parseInt(array.length) >>> 0); _tmp$4 = 0; _tmp$5 = 0; r1 = _tmp$3; r2 = _tmp$4; err = _tmp$5;
			return [r1, r2, err];
		}
		printWarning();
		_tmp$6 = (minusOne >>> 0); _tmp$7 = 0; _tmp$8 = 13; r1 = _tmp$6; r2 = _tmp$7; err = _tmp$8;
		return [r1, r2, err];
	};
	Syscall6 = $pkg.Syscall6 = function(trap, a1, a2, a3, a4, a5, a6) {
		var r1 = 0, r2 = 0, err = 0, f, r, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
		f = syscall("Syscall6");
		if (!(f === $ifaceNil)) {
			r = f(trap, a1, a2, a3, a4, a5, a6);
			_tmp = (($parseInt(r[0]) >> 0) >>> 0); _tmp$1 = (($parseInt(r[1]) >> 0) >>> 0); _tmp$2 = (($parseInt(r[2]) >> 0) >>> 0); r1 = _tmp; r2 = _tmp$1; err = _tmp$2;
			return [r1, r2, err];
		}
		if (!((trap === 202))) {
			printWarning();
		}
		_tmp$3 = (minusOne >>> 0); _tmp$4 = 0; _tmp$5 = 13; r1 = _tmp$3; r2 = _tmp$4; err = _tmp$5;
		return [r1, r2, err];
	};
	BytePtrFromString = $pkg.BytePtrFromString = function(s) {
		var array, _ref, _i, i, b;
		array = new ($global.Uint8Array)(s.length + 1 >> 0);
		_ref = new ($sliceType($Uint8))($stringToBytes(s));
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			b = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (b === 0) {
				return [($ptrType($Uint8)).nil, new Errno(22)];
			}
			array[i] = b;
			_i++;
		}
		array[s.length] = 0;
		return [array, $ifaceNil];
	};
	copyenv = function() {
		var _ref, _i, i, s, j, key, _tuple, _entry, ok, _key;
		env = new $Map();
		_ref = envs;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			s = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			j = 0;
			while (j < s.length) {
				if (s.charCodeAt(j) === 61) {
					key = s.substring(0, j);
					_tuple = (_entry = env[key], _entry !== undefined ? [_entry.v, true] : [0, false]); ok = _tuple[1];
					if (!ok) {
						_key = key; (env || $throwRuntimeError("assignment to entry in nil map"))[_key] = { k: _key, v: i };
					}
					break;
				}
				j = j + (1) >> 0;
			}
			_i++;
		}
	};
	Getenv = $pkg.Getenv = function(key) {
		var value = "", found = false, $deferred = [], $err = null, _tmp, _tmp$1, _tuple, _entry, i, ok, _tmp$2, _tmp$3, s, i$1, _tmp$4, _tmp$5, _tmp$6, _tmp$7;
		/* */ try { $deferFrames.push($deferred);
		envOnce.Do(copyenv);
		if (key.length === 0) {
			_tmp = ""; _tmp$1 = false; value = _tmp; found = _tmp$1;
			return [value, found];
		}
		envLock.RLock();
		$deferred.push([$methodVal(envLock, "RUnlock"), []]);
		_tuple = (_entry = env[key], _entry !== undefined ? [_entry.v, true] : [0, false]); i = _tuple[0]; ok = _tuple[1];
		if (!ok) {
			_tmp$2 = ""; _tmp$3 = false; value = _tmp$2; found = _tmp$3;
			return [value, found];
		}
		s = ((i < 0 || i >= envs.$length) ? $throwRuntimeError("index out of range") : envs.$array[envs.$offset + i]);
		i$1 = 0;
		while (i$1 < s.length) {
			if (s.charCodeAt(i$1) === 61) {
				_tmp$4 = s.substring((i$1 + 1 >> 0)); _tmp$5 = true; value = _tmp$4; found = _tmp$5;
				return [value, found];
			}
			i$1 = i$1 + (1) >> 0;
		}
		_tmp$6 = ""; _tmp$7 = false; value = _tmp$6; found = _tmp$7;
		return [value, found];
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return [value, found]; }
	};
	itoa = function(val) {
		var buf, i, _r, _q;
		if (val < 0) {
			return "-" + itoa(-val);
		}
		buf = ($arrayType($Uint8, 32)).zero(); $copy(buf, ($arrayType($Uint8, 32)).zero(), ($arrayType($Uint8, 32)));
		i = 31;
		while (val >= 10) {
			(i < 0 || i >= buf.length) ? $throwRuntimeError("index out of range") : buf[i] = (((_r = val % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >> 0) << 24 >>> 24);
			i = i - (1) >> 0;
			val = (_q = val / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		}
		(i < 0 || i >= buf.length) ? $throwRuntimeError("index out of range") : buf[i] = ((val + 48 >> 0) << 24 >>> 24);
		return $bytesToString($subslice(new ($sliceType($Uint8))(buf), i));
	};
	ByteSliceFromString = $pkg.ByteSliceFromString = function(s) {
		var i, a;
		i = 0;
		while (i < s.length) {
			if (s.charCodeAt(i) === 0) {
				return [($sliceType($Uint8)).nil, new Errno(22)];
			}
			i = i + (1) >> 0;
		}
		a = ($sliceType($Uint8)).make((s.length + 1 >> 0));
		$copyString(a, s);
		return [a, $ifaceNil];
	};
	Timespec.Ptr.prototype.Unix = function() {
		var sec = new $Int64(0, 0), nsec = new $Int64(0, 0), ts, _tmp, _tmp$1;
		ts = this;
		_tmp = ts.Sec; _tmp$1 = ts.Nsec; sec = _tmp; nsec = _tmp$1;
		return [sec, nsec];
	};
	Timespec.prototype.Unix = function() { return this.$val.Unix(); };
	Timespec.Ptr.prototype.Nano = function() {
		var ts, x, x$1;
		ts = this;
		return (x = $mul64(ts.Sec, new $Int64(0, 1000000000)), x$1 = ts.Nsec, new $Int64(x.$high + x$1.$high, x.$low + x$1.$low));
	};
	Timespec.prototype.Nano = function() { return this.$val.Nano(); };
	ReadDirent = $pkg.ReadDirent = function(fd, buf) {
		var n = 0, err = $ifaceNil, base, _tuple;
		base = new Uint8Array(8);
		_tuple = Getdirentries(fd, buf, base); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	Sysctl = $pkg.Sysctl = function(name) {
		var value = "", err = $ifaceNil, _tuple, mib, _tmp, _tmp$1, n, _tmp$2, _tmp$3, _tmp$4, _tmp$5, buf, _tmp$6, _tmp$7, x, _tmp$8, _tmp$9;
		_tuple = nametomib(name); mib = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp = ""; _tmp$1 = err; value = _tmp; err = _tmp$1;
			return [value, err];
		}
		n = 0;
		err = sysctl(mib, ($ptrType($Uint8)).nil, new ($ptrType($Uintptr))(function() { return n; }, function($v) { n = $v; }), ($ptrType($Uint8)).nil, 0);
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp$2 = ""; _tmp$3 = err; value = _tmp$2; err = _tmp$3;
			return [value, err];
		}
		if (n === 0) {
			_tmp$4 = ""; _tmp$5 = $ifaceNil; value = _tmp$4; err = _tmp$5;
			return [value, err];
		}
		buf = ($sliceType($Uint8)).make(n);
		err = sysctl(mib, new ($ptrType($Uint8))(function() { return ((0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0]); }, function($v) { (0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0] = $v; }, buf), new ($ptrType($Uintptr))(function() { return n; }, function($v) { n = $v; }), ($ptrType($Uint8)).nil, 0);
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp$6 = ""; _tmp$7 = err; value = _tmp$6; err = _tmp$7;
			return [value, err];
		}
		if (n > 0 && ((x = n - 1 >>> 0, ((x < 0 || x >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + x])) === 0)) {
			n = n - (1) >>> 0;
		}
		_tmp$8 = $bytesToString($subslice(buf, 0, n)); _tmp$9 = $ifaceNil; value = _tmp$8; err = _tmp$9;
		return [value, err];
	};
	nametomib = function(name) {
		var mib = ($sliceType(_C_int)).nil, err = $ifaceNil, buf, n, p, _tuple, bytes$1, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _q, _tmp$5;
		buf = ($arrayType(_C_int, 14)).zero(); $copy(buf, ($arrayType(_C_int, 14)).zero(), ($arrayType(_C_int, 14)));
		n = 48;
		p = $sliceToArray(new ($sliceType($Uint8))(buf));
		_tuple = ByteSliceFromString(name); bytes$1 = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp = ($sliceType(_C_int)).nil; _tmp$1 = err; mib = _tmp; err = _tmp$1;
			return [mib, err];
		}
		err = sysctl(new ($sliceType(_C_int))([0, 3]), p, new ($ptrType($Uintptr))(function() { return n; }, function($v) { n = $v; }), new ($ptrType($Uint8))(function() { return ((0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0]); }, function($v) { (0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0] = $v; }, bytes$1), (name.length >>> 0));
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp$2 = ($sliceType(_C_int)).nil; _tmp$3 = err; mib = _tmp$2; err = _tmp$3;
			return [mib, err];
		}
		_tmp$4 = $subslice(new ($sliceType(_C_int))(buf), 0, (_q = n / 4, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"))); _tmp$5 = $ifaceNil; mib = _tmp$4; err = _tmp$5;
		return [mib, err];
	};
	ParseDirent = $pkg.ParseDirent = function(buf, max, names) {
		var consumed = 0, count = 0, newnames = ($sliceType($String)).nil, origlen, dirent, _array, _struct, _view, x, bytes$1, name, _tmp, _tmp$1, _tmp$2;
		origlen = buf.$length;
		while (!((max === 0)) && buf.$length > 0) {
			dirent = [undefined];
			dirent[0] = (_array = $sliceToArray(buf), _struct = new Dirent.Ptr(), _view = new DataView(_array.buffer, _array.byteOffset), _struct.Ino = new $Uint64(_view.getUint32(4, true), _view.getUint32(0, true)), _struct.Seekoff = new $Uint64(_view.getUint32(12, true), _view.getUint32(8, true)), _struct.Reclen = _view.getUint16(16, true), _struct.Namlen = _view.getUint16(18, true), _struct.Type = _view.getUint8(20, true), _struct.Name = new ($nativeArray("Int8"))(_array.buffer, $min(_array.byteOffset + 21, _array.buffer.byteLength)), _struct.Pad_cgo_0 = new ($nativeArray("Uint8"))(_array.buffer, $min(_array.byteOffset + 1045, _array.buffer.byteLength)), _struct);
			if (dirent[0].Reclen === 0) {
				buf = ($sliceType($Uint8)).nil;
				break;
			}
			buf = $subslice(buf, dirent[0].Reclen);
			if ((x = dirent[0].Ino, (x.$high === 0 && x.$low === 0))) {
				continue;
			}
			bytes$1 = $sliceToArray(new ($sliceType($Uint8))(dirent[0].Name));
			name = $bytesToString($subslice(new ($sliceType($Uint8))(bytes$1), 0, dirent[0].Namlen));
			if (name === "." || name === "..") {
				continue;
			}
			max = max - (1) >> 0;
			count = count + (1) >> 0;
			names = $append(names, name);
		}
		_tmp = origlen - buf.$length >> 0; _tmp$1 = count; _tmp$2 = names; consumed = _tmp; count = _tmp$1; newnames = _tmp$2;
		return [consumed, count, newnames];
	};
	mmapper.Ptr.prototype.Mmap = function(fd, offset, length, prot, flags) {
		var data = ($sliceType($Uint8)).nil, err = $ifaceNil, $deferred = [], $err = null, m, _tmp, _tmp$1, _tuple, addr, errno, _tmp$2, _tmp$3, sl, b, x, x$1, p, _key, _tmp$4, _tmp$5;
		/* */ try { $deferFrames.push($deferred);
		m = this;
		if (length <= 0) {
			_tmp = ($sliceType($Uint8)).nil; _tmp$1 = new Errno(22); data = _tmp; err = _tmp$1;
			return [data, err];
		}
		_tuple = m.mmap(0, (length >>> 0), prot, flags, fd, offset); addr = _tuple[0]; errno = _tuple[1];
		if (!($interfaceIsEqual(errno, $ifaceNil))) {
			_tmp$2 = ($sliceType($Uint8)).nil; _tmp$3 = errno; data = _tmp$2; err = _tmp$3;
			return [data, err];
		}
		sl = new ($structType([["addr", "addr", "syscall", $Uintptr, ""], ["len", "len", "syscall", $Int, ""], ["cap", "cap", "syscall", $Int, ""]])).Ptr(addr, length, length);
		b = sl;
		p = new ($ptrType($Uint8))(function() { return (x$1 = b.$capacity - 1 >> 0, ((x$1 < 0 || x$1 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x$1])); }, function($v) { (x = b.$capacity - 1 >> 0, (x < 0 || x >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x] = $v); }, b);
		m.Mutex.Lock();
		$deferred.push([$methodVal(m, "Unlock"), []]);
		_key = p; (m.active || $throwRuntimeError("assignment to entry in nil map"))[_key.$key()] = { k: _key, v: b };
		_tmp$4 = b; _tmp$5 = $ifaceNil; data = _tmp$4; err = _tmp$5;
		return [data, err];
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return [data, err]; }
	};
	mmapper.prototype.Mmap = function(fd, offset, length, prot, flags) { return this.$val.Mmap(fd, offset, length, prot, flags); };
	mmapper.Ptr.prototype.Munmap = function(data) {
		var err = $ifaceNil, $deferred = [], $err = null, m, x, x$1, p, _entry, b, errno;
		/* */ try { $deferFrames.push($deferred);
		m = this;
		if ((data.$length === 0) || !((data.$length === data.$capacity))) {
			err = new Errno(22);
			return err;
		}
		p = new ($ptrType($Uint8))(function() { return (x$1 = data.$capacity - 1 >> 0, ((x$1 < 0 || x$1 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x$1])); }, function($v) { (x = data.$capacity - 1 >> 0, (x < 0 || x >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x] = $v); }, data);
		m.Mutex.Lock();
		$deferred.push([$methodVal(m, "Unlock"), []]);
		b = (_entry = m.active[p.$key()], _entry !== undefined ? _entry.v : ($sliceType($Uint8)).nil);
		if (b === ($sliceType($Uint8)).nil || !($pointerIsEqual(new ($ptrType($Uint8))(function() { return ((0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0]); }, function($v) { (0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0] = $v; }, b), new ($ptrType($Uint8))(function() { return ((0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0]); }, function($v) { (0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0] = $v; }, data)))) {
			err = new Errno(22);
			return err;
		}
		errno = m.munmap($sliceToArray(b), (b.$length >>> 0));
		if (!($interfaceIsEqual(errno, $ifaceNil))) {
			err = errno;
			return err;
		}
		delete m.active[p.$key()];
		err = $ifaceNil;
		return err;
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return err; }
	};
	mmapper.prototype.Munmap = function(data) { return this.$val.Munmap(data); };
	Errno.prototype.Error = function() {
		var e, s;
		e = this.$val !== undefined ? this.$val : this;
		if (0 <= (e >> 0) && (e >> 0) < 106) {
			s = ((e < 0 || e >= errors$1.length) ? $throwRuntimeError("index out of range") : errors$1[e]);
			if (!(s === "")) {
				return s;
			}
		}
		return "errno " + itoa((e >> 0));
	};
	$ptrType(Errno).prototype.Error = function() { return new Errno(this.$get()).Error(); };
	Errno.prototype.Temporary = function() {
		var e;
		e = this.$val !== undefined ? this.$val : this;
		return (e === 4) || (e === 24) || (new Errno(e)).Timeout();
	};
	$ptrType(Errno).prototype.Temporary = function() { return new Errno(this.$get()).Temporary(); };
	Errno.prototype.Timeout = function() {
		var e;
		e = this.$val !== undefined ? this.$val : this;
		return (e === 35) || (e === 35) || (e === 60);
	};
	$ptrType(Errno).prototype.Timeout = function() { return new Errno(this.$get()).Timeout(); };
	Read = $pkg.Read = function(fd, p) {
		var n = 0, err = $ifaceNil, _tuple;
		_tuple = read(fd, p); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	Write = $pkg.Write = function(fd, p) {
		var n = 0, err = $ifaceNil, _tuple;
		_tuple = write(fd, p); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	sysctl = function(mib, old, oldlen, new$1, newlen) {
		var err = $ifaceNil, _p0, _tuple, e1;
		_p0 = 0;
		if (mib.$length > 0) {
			_p0 = $sliceToArray(mib);
		} else {
			_p0 = new Uint8Array(0);
		}
		_tuple = Syscall6(202, _p0, (mib.$length >>> 0), old, oldlen, new$1, newlen); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Close = $pkg.Close = function(fd) {
		var err = $ifaceNil, _tuple, e1;
		_tuple = Syscall(6, (fd >>> 0), 0, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Exit = $pkg.Exit = function(code) {
		Syscall(1, (code >>> 0), 0, 0);
		return;
	};
	Fchdir = $pkg.Fchdir = function(fd) {
		var err = $ifaceNil, _tuple, e1;
		_tuple = Syscall(13, (fd >>> 0), 0, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fchmod = $pkg.Fchmod = function(fd, mode) {
		var err = $ifaceNil, _tuple, e1;
		_tuple = Syscall(124, (fd >>> 0), (mode >>> 0), 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fchown = $pkg.Fchown = function(fd, uid, gid) {
		var err = $ifaceNil, _tuple, e1;
		_tuple = Syscall(123, (fd >>> 0), (uid >>> 0), (gid >>> 0)); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fstat = $pkg.Fstat = function(fd, stat) {
		var err = $ifaceNil, _tuple, _array, _struct, _view, e1;
		_array = new Uint8Array(144);
		_tuple = Syscall(339, (fd >>> 0), _array, 0); e1 = _tuple[2];
		_struct = stat, _view = new DataView(_array.buffer, _array.byteOffset), _struct.Dev = _view.getInt32(0, true), _struct.Mode = _view.getUint16(4, true), _struct.Nlink = _view.getUint16(6, true), _struct.Ino = new $Uint64(_view.getUint32(12, true), _view.getUint32(8, true)), _struct.Uid = _view.getUint32(16, true), _struct.Gid = _view.getUint32(20, true), _struct.Rdev = _view.getInt32(24, true), _struct.Pad_cgo_0 = new ($nativeArray("Uint8"))(_array.buffer, $min(_array.byteOffset + 28, _array.buffer.byteLength)), _struct.Atimespec.Sec = new $Int64(_view.getUint32(36, true), _view.getUint32(32, true)), _struct.Atimespec.Nsec = new $Int64(_view.getUint32(44, true), _view.getUint32(40, true)), _struct.Mtimespec.Sec = new $Int64(_view.getUint32(52, true), _view.getUint32(48, true)), _struct.Mtimespec.Nsec = new $Int64(_view.getUint32(60, true), _view.getUint32(56, true)), _struct.Ctimespec.Sec = new $Int64(_view.getUint32(68, true), _view.getUint32(64, true)), _struct.Ctimespec.Nsec = new $Int64(_view.getUint32(76, true), _view.getUint32(72, true)), _struct.Birthtimespec.Sec = new $Int64(_view.getUint32(84, true), _view.getUint32(80, true)), _struct.Birthtimespec.Nsec = new $Int64(_view.getUint32(92, true), _view.getUint32(88, true)), _struct.Size = new $Int64(_view.getUint32(100, true), _view.getUint32(96, true)), _struct.Blocks = new $Int64(_view.getUint32(108, true), _view.getUint32(104, true)), _struct.Blksize = _view.getInt32(112, true), _struct.Flags = _view.getUint32(116, true), _struct.Gen = _view.getUint32(120, true), _struct.Lspare = _view.getInt32(124, true), _struct.Qspare = new ($nativeArray("Int64"))(_array.buffer, $min(_array.byteOffset + 128, _array.buffer.byteLength));
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fsync = $pkg.Fsync = function(fd) {
		var err = $ifaceNil, _tuple, e1;
		_tuple = Syscall(95, (fd >>> 0), 0, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Ftruncate = $pkg.Ftruncate = function(fd, length) {
		var err = $ifaceNil, _tuple, e1;
		_tuple = Syscall(201, (fd >>> 0), (length.$low >>> 0), 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Getdirentries = $pkg.Getdirentries = function(fd, buf, basep) {
		var n = 0, err = $ifaceNil, _p0, _tuple, r0, e1;
		_p0 = 0;
		if (buf.$length > 0) {
			_p0 = $sliceToArray(buf);
		} else {
			_p0 = new Uint8Array(0);
		}
		_tuple = Syscall6(344, (fd >>> 0), _p0, (buf.$length >>> 0), basep, 0, 0); r0 = _tuple[0]; e1 = _tuple[2];
		n = (r0 >> 0);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [n, err];
	};
	Lstat = $pkg.Lstat = function(path, stat) {
		var err = $ifaceNil, _p0, _tuple, _tuple$1, _array, _struct, _view, e1;
		_p0 = ($ptrType($Uint8)).nil;
		_tuple = BytePtrFromString(path); _p0 = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return err;
		}
		_array = new Uint8Array(144);
		_tuple$1 = Syscall(340, _p0, _array, 0); e1 = _tuple$1[2];
		_struct = stat, _view = new DataView(_array.buffer, _array.byteOffset), _struct.Dev = _view.getInt32(0, true), _struct.Mode = _view.getUint16(4, true), _struct.Nlink = _view.getUint16(6, true), _struct.Ino = new $Uint64(_view.getUint32(12, true), _view.getUint32(8, true)), _struct.Uid = _view.getUint32(16, true), _struct.Gid = _view.getUint32(20, true), _struct.Rdev = _view.getInt32(24, true), _struct.Pad_cgo_0 = new ($nativeArray("Uint8"))(_array.buffer, $min(_array.byteOffset + 28, _array.buffer.byteLength)), _struct.Atimespec.Sec = new $Int64(_view.getUint32(36, true), _view.getUint32(32, true)), _struct.Atimespec.Nsec = new $Int64(_view.getUint32(44, true), _view.getUint32(40, true)), _struct.Mtimespec.Sec = new $Int64(_view.getUint32(52, true), _view.getUint32(48, true)), _struct.Mtimespec.Nsec = new $Int64(_view.getUint32(60, true), _view.getUint32(56, true)), _struct.Ctimespec.Sec = new $Int64(_view.getUint32(68, true), _view.getUint32(64, true)), _struct.Ctimespec.Nsec = new $Int64(_view.getUint32(76, true), _view.getUint32(72, true)), _struct.Birthtimespec.Sec = new $Int64(_view.getUint32(84, true), _view.getUint32(80, true)), _struct.Birthtimespec.Nsec = new $Int64(_view.getUint32(92, true), _view.getUint32(88, true)), _struct.Size = new $Int64(_view.getUint32(100, true), _view.getUint32(96, true)), _struct.Blocks = new $Int64(_view.getUint32(108, true), _view.getUint32(104, true)), _struct.Blksize = _view.getInt32(112, true), _struct.Flags = _view.getUint32(116, true), _struct.Gen = _view.getUint32(120, true), _struct.Lspare = _view.getInt32(124, true), _struct.Qspare = new ($nativeArray("Int64"))(_array.buffer, $min(_array.byteOffset + 128, _array.buffer.byteLength));
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Pread = $pkg.Pread = function(fd, p, offset) {
		var n = 0, err = $ifaceNil, _p0, _tuple, r0, e1;
		_p0 = 0;
		if (p.$length > 0) {
			_p0 = $sliceToArray(p);
		} else {
			_p0 = new Uint8Array(0);
		}
		_tuple = Syscall6(153, (fd >>> 0), _p0, (p.$length >>> 0), (offset.$low >>> 0), 0, 0); r0 = _tuple[0]; e1 = _tuple[2];
		n = (r0 >> 0);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [n, err];
	};
	Pwrite = $pkg.Pwrite = function(fd, p, offset) {
		var n = 0, err = $ifaceNil, _p0, _tuple, r0, e1;
		_p0 = 0;
		if (p.$length > 0) {
			_p0 = $sliceToArray(p);
		} else {
			_p0 = new Uint8Array(0);
		}
		_tuple = Syscall6(154, (fd >>> 0), _p0, (p.$length >>> 0), (offset.$low >>> 0), 0, 0); r0 = _tuple[0]; e1 = _tuple[2];
		n = (r0 >> 0);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [n, err];
	};
	read = function(fd, p) {
		var n = 0, err = $ifaceNil, _p0, _tuple, r0, e1;
		_p0 = 0;
		if (p.$length > 0) {
			_p0 = $sliceToArray(p);
		} else {
			_p0 = new Uint8Array(0);
		}
		_tuple = Syscall(3, (fd >>> 0), _p0, (p.$length >>> 0)); r0 = _tuple[0]; e1 = _tuple[2];
		n = (r0 >> 0);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [n, err];
	};
	Seek = $pkg.Seek = function(fd, offset, whence) {
		var newoffset = new $Int64(0, 0), err = $ifaceNil, _tuple, r0, e1;
		_tuple = Syscall(199, (fd >>> 0), (offset.$low >>> 0), (whence >>> 0)); r0 = _tuple[0]; e1 = _tuple[2];
		newoffset = new $Int64(0, r0.constructor === Number ? r0 : 1);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [newoffset, err];
	};
	write = function(fd, p) {
		var n = 0, err = $ifaceNil, _p0, _tuple, r0, e1;
		_p0 = 0;
		if (p.$length > 0) {
			_p0 = $sliceToArray(p);
		} else {
			_p0 = new Uint8Array(0);
		}
		_tuple = Syscall(4, (fd >>> 0), _p0, (p.$length >>> 0)); r0 = _tuple[0]; e1 = _tuple[2];
		n = (r0 >> 0);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [n, err];
	};
	mmap = function(addr, length, prot, flag, fd, pos) {
		var ret = 0, err = $ifaceNil, _tuple, r0, e1;
		_tuple = Syscall6(197, addr, length, (prot >>> 0), (flag >>> 0), (fd >>> 0), (pos.$low >>> 0)); r0 = _tuple[0]; e1 = _tuple[2];
		ret = r0;
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [ret, err];
	};
	munmap = function(addr, length) {
		var err = $ifaceNil, _tuple, e1;
		_tuple = Syscall(73, addr, length, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	$pkg.$init = function() {
		($ptrType(mmapper)).methods = [["Lock", "Lock", "", $funcType([], [], false), 0], ["Mmap", "Mmap", "", $funcType([$Int, $Int64, $Int, $Int, $Int], [($sliceType($Uint8)), $error], false), -1], ["Munmap", "Munmap", "", $funcType([($sliceType($Uint8))], [$error], false), -1], ["Unlock", "Unlock", "", $funcType([], [], false), 0]];
		mmapper.init([["Mutex", "", "", sync.Mutex, ""], ["active", "active", "syscall", ($mapType(($ptrType($Uint8)), ($sliceType($Uint8)))), ""], ["mmap", "mmap", "syscall", ($funcType([$Uintptr, $Uintptr, $Int, $Int, $Int, $Int64], [$Uintptr, $error], false)), ""], ["munmap", "munmap", "syscall", ($funcType([$Uintptr, $Uintptr], [$error], false)), ""]]);
		Errno.methods = [["Error", "Error", "", $funcType([], [$String], false), -1], ["Temporary", "Temporary", "", $funcType([], [$Bool], false), -1], ["Timeout", "Timeout", "", $funcType([], [$Bool], false), -1]];
		($ptrType(Errno)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1], ["Temporary", "Temporary", "", $funcType([], [$Bool], false), -1], ["Timeout", "Timeout", "", $funcType([], [$Bool], false), -1]];
		($ptrType(Timespec)).methods = [["Nano", "Nano", "", $funcType([], [$Int64], false), -1], ["Unix", "Unix", "", $funcType([], [$Int64, $Int64], false), -1]];
		Timespec.init([["Sec", "Sec", "", $Int64, ""], ["Nsec", "Nsec", "", $Int64, ""]]);
		Stat_t.init([["Dev", "Dev", "", $Int32, ""], ["Mode", "Mode", "", $Uint16, ""], ["Nlink", "Nlink", "", $Uint16, ""], ["Ino", "Ino", "", $Uint64, ""], ["Uid", "Uid", "", $Uint32, ""], ["Gid", "Gid", "", $Uint32, ""], ["Rdev", "Rdev", "", $Int32, ""], ["Pad_cgo_0", "Pad_cgo_0", "", ($arrayType($Uint8, 4)), ""], ["Atimespec", "Atimespec", "", Timespec, ""], ["Mtimespec", "Mtimespec", "", Timespec, ""], ["Ctimespec", "Ctimespec", "", Timespec, ""], ["Birthtimespec", "Birthtimespec", "", Timespec, ""], ["Size", "Size", "", $Int64, ""], ["Blocks", "Blocks", "", $Int64, ""], ["Blksize", "Blksize", "", $Int32, ""], ["Flags", "Flags", "", $Uint32, ""], ["Gen", "Gen", "", $Uint32, ""], ["Lspare", "Lspare", "", $Int32, ""], ["Qspare", "Qspare", "", ($arrayType($Int64, 2)), ""]]);
		Dirent.init([["Ino", "Ino", "", $Uint64, ""], ["Seekoff", "Seekoff", "", $Uint64, ""], ["Reclen", "Reclen", "", $Uint16, ""], ["Namlen", "Namlen", "", $Uint16, ""], ["Type", "Type", "", $Uint8, ""], ["Name", "Name", "", ($arrayType($Int8, 1024)), ""], ["Pad_cgo_0", "Pad_cgo_0", "", ($arrayType($Uint8, 3)), ""]]);
		lineBuffer = ($sliceType($Uint8)).nil;
		syscallModule = $ifaceNil;
		envOnce = new sync.Once.Ptr();
		envLock = new sync.RWMutex.Ptr();
		env = false;
		envs = ($sliceType($String)).nil;
		warningPrinted = false;
		alreadyTriedToLoad = false;
		minusOne = -1;
		$pkg.Stdin = 0;
		$pkg.Stdout = 1;
		$pkg.Stderr = 2;
		errors$1 = $toNativeArray("String", ["", "operation not permitted", "no such file or directory", "no such process", "interrupted system call", "input/output error", "device not configured", "argument list too long", "exec format error", "bad file descriptor", "no child processes", "resource deadlock avoided", "cannot allocate memory", "permission denied", "bad address", "block device required", "resource busy", "file exists", "cross-device link", "operation not supported by device", "not a directory", "is a directory", "invalid argument", "too many open files in system", "too many open files", "inappropriate ioctl for device", "text file busy", "file too large", "no space left on device", "illegal seek", "read-only file system", "too many links", "broken pipe", "numerical argument out of domain", "result too large", "resource temporarily unavailable", "operation now in progress", "operation already in progress", "socket operation on non-socket", "destination address required", "message too long", "protocol wrong type for socket", "protocol not available", "protocol not supported", "socket type not supported", "operation not supported", "protocol family not supported", "address family not supported by protocol family", "address already in use", "can't assign requested address", "network is down", "network is unreachable", "network dropped connection on reset", "software caused connection abort", "connection reset by peer", "no buffer space available", "socket is already connected", "socket is not connected", "can't send after socket shutdown", "too many references: can't splice", "operation timed out", "connection refused", "too many levels of symbolic links", "file name too long", "host is down", "no route to host", "directory not empty", "too many processes", "too many users", "disc quota exceeded", "stale NFS file handle", "too many levels of remote in path", "RPC struct is bad", "RPC version wrong", "RPC prog. not avail", "program version wrong", "bad procedure for program", "no locks available", "function not implemented", "inappropriate file type or format", "authentication error", "need authenticator", "device power is off", "device error", "value too large to be stored in data type", "bad executable (or shared library)", "bad CPU type in executable", "shared library version mismatch", "malformed Mach-o file", "operation canceled", "identifier removed", "no message of desired type", "illegal byte sequence", "attribute not found", "bad message", "EMULTIHOP (Reserved)", "no message available on STREAM", "ENOLINK (Reserved)", "no STREAM resources", "not a STREAM", "protocol error", "STREAM ioctl timeout", "operation not supported on socket", "policy not found", "state not recoverable", "previous owner died"]);
		mapper = new mmapper.Ptr(new sync.Mutex.Ptr(), new $Map(), mmap, munmap);
		init();
	};
	return $pkg;
})();
$packages["strings"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], errors = $packages["errors"], io = $packages["io"], utf8 = $packages["unicode/utf8"], unicode = $packages["unicode"], Reader, IndexByte, NewReader, explode, hashstr, Count, LastIndex, IndexAny, genSplit, Split, Map, IndexFunc, indexFunc;
	Reader = $pkg.Reader = $newType(0, "Struct", "strings.Reader", "Reader", "strings", function(s_, i_, prevRune_) {
		this.$val = this;
		this.s = s_ !== undefined ? s_ : "";
		this.i = i_ !== undefined ? i_ : new $Int64(0, 0);
		this.prevRune = prevRune_ !== undefined ? prevRune_ : 0;
	});
	IndexByte = $pkg.IndexByte = function(s, c) {
		return $parseInt(s.indexOf($global.String.fromCharCode(c))) >> 0;
	};
	Reader.Ptr.prototype.Len = function() {
		var r, x, x$1, x$2, x$3, x$4;
		r = this;
		if ((x = r.i, x$1 = new $Int64(0, r.s.length), (x.$high > x$1.$high || (x.$high === x$1.$high && x.$low >= x$1.$low)))) {
			return 0;
		}
		return ((x$2 = (x$3 = new $Int64(0, r.s.length), x$4 = r.i, new $Int64(x$3.$high - x$4.$high, x$3.$low - x$4.$low)), x$2.$low + ((x$2.$high >> 31) * 4294967296)) >> 0);
	};
	Reader.prototype.Len = function() { return this.$val.Len(); };
	Reader.Ptr.prototype.Read = function(b) {
		var n = 0, err = $ifaceNil, r, _tmp, _tmp$1, x, x$1, _tmp$2, _tmp$3, x$2, x$3;
		r = this;
		if (b.$length === 0) {
			_tmp = 0; _tmp$1 = $ifaceNil; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		if ((x = r.i, x$1 = new $Int64(0, r.s.length), (x.$high > x$1.$high || (x.$high === x$1.$high && x.$low >= x$1.$low)))) {
			_tmp$2 = 0; _tmp$3 = io.EOF; n = _tmp$2; err = _tmp$3;
			return [n, err];
		}
		r.prevRune = -1;
		n = $copyString(b, r.s.substring($flatten64(r.i)));
		r.i = (x$2 = r.i, x$3 = new $Int64(0, n), new $Int64(x$2.$high + x$3.$high, x$2.$low + x$3.$low));
		return [n, err];
	};
	Reader.prototype.Read = function(b) { return this.$val.Read(b); };
	Reader.Ptr.prototype.ReadAt = function(b, off) {
		var n = 0, err = $ifaceNil, r, _tmp, _tmp$1, x, _tmp$2, _tmp$3;
		r = this;
		if ((off.$high < 0 || (off.$high === 0 && off.$low < 0))) {
			_tmp = 0; _tmp$1 = errors.New("strings.Reader.ReadAt: negative offset"); n = _tmp; err = _tmp$1;
			return [n, err];
		}
		if ((x = new $Int64(0, r.s.length), (off.$high > x.$high || (off.$high === x.$high && off.$low >= x.$low)))) {
			_tmp$2 = 0; _tmp$3 = io.EOF; n = _tmp$2; err = _tmp$3;
			return [n, err];
		}
		n = $copyString(b, r.s.substring($flatten64(off)));
		if (n < b.$length) {
			err = io.EOF;
		}
		return [n, err];
	};
	Reader.prototype.ReadAt = function(b, off) { return this.$val.ReadAt(b, off); };
	Reader.Ptr.prototype.ReadByte = function() {
		var b = 0, err = $ifaceNil, r, x, x$1, _tmp, _tmp$1, x$2, x$3;
		r = this;
		r.prevRune = -1;
		if ((x = r.i, x$1 = new $Int64(0, r.s.length), (x.$high > x$1.$high || (x.$high === x$1.$high && x.$low >= x$1.$low)))) {
			_tmp = 0; _tmp$1 = io.EOF; b = _tmp; err = _tmp$1;
			return [b, err];
		}
		b = r.s.charCodeAt($flatten64(r.i));
		r.i = (x$2 = r.i, x$3 = new $Int64(0, 1), new $Int64(x$2.$high + x$3.$high, x$2.$low + x$3.$low));
		return [b, err];
	};
	Reader.prototype.ReadByte = function() { return this.$val.ReadByte(); };
	Reader.Ptr.prototype.UnreadByte = function() {
		var r, x, x$1, x$2;
		r = this;
		r.prevRune = -1;
		if ((x = r.i, (x.$high < 0 || (x.$high === 0 && x.$low <= 0)))) {
			return errors.New("strings.Reader.UnreadByte: at beginning of string");
		}
		r.i = (x$1 = r.i, x$2 = new $Int64(0, 1), new $Int64(x$1.$high - x$2.$high, x$1.$low - x$2.$low));
		return $ifaceNil;
	};
	Reader.prototype.UnreadByte = function() { return this.$val.UnreadByte(); };
	Reader.Ptr.prototype.ReadRune = function() {
		var ch = 0, size = 0, err = $ifaceNil, r, x, x$1, _tmp, _tmp$1, _tmp$2, x$2, c, x$3, x$4, _tmp$3, _tmp$4, _tmp$5, _tuple, x$5, x$6;
		r = this;
		if ((x = r.i, x$1 = new $Int64(0, r.s.length), (x.$high > x$1.$high || (x.$high === x$1.$high && x.$low >= x$1.$low)))) {
			r.prevRune = -1;
			_tmp = 0; _tmp$1 = 0; _tmp$2 = io.EOF; ch = _tmp; size = _tmp$1; err = _tmp$2;
			return [ch, size, err];
		}
		r.prevRune = ((x$2 = r.i, x$2.$low + ((x$2.$high >> 31) * 4294967296)) >> 0);
		c = r.s.charCodeAt($flatten64(r.i));
		if (c < 128) {
			r.i = (x$3 = r.i, x$4 = new $Int64(0, 1), new $Int64(x$3.$high + x$4.$high, x$3.$low + x$4.$low));
			_tmp$3 = (c >> 0); _tmp$4 = 1; _tmp$5 = $ifaceNil; ch = _tmp$3; size = _tmp$4; err = _tmp$5;
			return [ch, size, err];
		}
		_tuple = utf8.DecodeRuneInString(r.s.substring($flatten64(r.i))); ch = _tuple[0]; size = _tuple[1];
		r.i = (x$5 = r.i, x$6 = new $Int64(0, size), new $Int64(x$5.$high + x$6.$high, x$5.$low + x$6.$low));
		return [ch, size, err];
	};
	Reader.prototype.ReadRune = function() { return this.$val.ReadRune(); };
	Reader.Ptr.prototype.UnreadRune = function() {
		var r;
		r = this;
		if (r.prevRune < 0) {
			return errors.New("strings.Reader.UnreadRune: previous operation was not ReadRune");
		}
		r.i = new $Int64(0, r.prevRune);
		r.prevRune = -1;
		return $ifaceNil;
	};
	Reader.prototype.UnreadRune = function() { return this.$val.UnreadRune(); };
	Reader.Ptr.prototype.Seek = function(offset, whence) {
		var r, abs, _ref, x, x$1;
		r = this;
		r.prevRune = -1;
		abs = new $Int64(0, 0);
		_ref = whence;
		if (_ref === 0) {
			abs = offset;
		} else if (_ref === 1) {
			abs = (x = r.i, new $Int64(x.$high + offset.$high, x.$low + offset.$low));
		} else if (_ref === 2) {
			abs = (x$1 = new $Int64(0, r.s.length), new $Int64(x$1.$high + offset.$high, x$1.$low + offset.$low));
		} else {
			return [new $Int64(0, 0), errors.New("strings.Reader.Seek: invalid whence")];
		}
		if ((abs.$high < 0 || (abs.$high === 0 && abs.$low < 0))) {
			return [new $Int64(0, 0), errors.New("strings.Reader.Seek: negative position")];
		}
		r.i = abs;
		return [abs, $ifaceNil];
	};
	Reader.prototype.Seek = function(offset, whence) { return this.$val.Seek(offset, whence); };
	Reader.Ptr.prototype.WriteTo = function(w) {
		var n = new $Int64(0, 0), err = $ifaceNil, r, x, x$1, _tmp, _tmp$1, s, _tuple, m, x$2, x$3;
		r = this;
		r.prevRune = -1;
		if ((x = r.i, x$1 = new $Int64(0, r.s.length), (x.$high > x$1.$high || (x.$high === x$1.$high && x.$low >= x$1.$low)))) {
			_tmp = new $Int64(0, 0); _tmp$1 = $ifaceNil; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		s = r.s.substring($flatten64(r.i));
		_tuple = io.WriteString(w, s); m = _tuple[0]; err = _tuple[1];
		if (m > s.length) {
			$panic(new $String("strings.Reader.WriteTo: invalid WriteString count"));
		}
		r.i = (x$2 = r.i, x$3 = new $Int64(0, m), new $Int64(x$2.$high + x$3.$high, x$2.$low + x$3.$low));
		n = new $Int64(0, m);
		if (!((m === s.length)) && $interfaceIsEqual(err, $ifaceNil)) {
			err = io.ErrShortWrite;
		}
		return [n, err];
	};
	Reader.prototype.WriteTo = function(w) { return this.$val.WriteTo(w); };
	NewReader = $pkg.NewReader = function(s) {
		return new Reader.Ptr(s, new $Int64(0, 0), -1);
	};
	explode = function(s, n) {
		var l, a, size, ch, _tmp, _tmp$1, i, cur, _tuple;
		if (n === 0) {
			return ($sliceType($String)).nil;
		}
		l = utf8.RuneCountInString(s);
		if (n <= 0 || n > l) {
			n = l;
		}
		a = ($sliceType($String)).make(n);
		size = 0;
		ch = 0;
		_tmp = 0; _tmp$1 = 0; i = _tmp; cur = _tmp$1;
		while ((i + 1 >> 0) < n) {
			_tuple = utf8.DecodeRuneInString(s.substring(cur)); ch = _tuple[0]; size = _tuple[1];
			if (ch === 65533) {
				(i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i] = "\xEF\xBF\xBD";
			} else {
				(i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i] = s.substring(cur, (cur + size >> 0));
			}
			cur = cur + (size) >> 0;
			i = i + (1) >> 0;
		}
		if (cur < s.length) {
			(i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i] = s.substring(cur);
		}
		return a;
	};
	hashstr = function(sep) {
		var hash, i, _tmp, _tmp$1, pow, sq, i$1, x, x$1;
		hash = 0;
		i = 0;
		while (i < sep.length) {
			hash = ((((hash >>> 16 << 16) * 16777619 >>> 0) + (hash << 16 >>> 16) * 16777619) >>> 0) + (sep.charCodeAt(i) >>> 0) >>> 0;
			i = i + (1) >> 0;
		}
		_tmp = 1; _tmp$1 = 16777619; pow = _tmp; sq = _tmp$1;
		i$1 = sep.length;
		while (i$1 > 0) {
			if (!(((i$1 & 1) === 0))) {
				pow = (x = sq, (((pow >>> 16 << 16) * x >>> 0) + (pow << 16 >>> 16) * x) >>> 0);
			}
			sq = (x$1 = sq, (((sq >>> 16 << 16) * x$1 >>> 0) + (sq << 16 >>> 16) * x$1) >>> 0);
			i$1 = (i$1 >> $min((1), 31)) >> 0;
		}
		return [hash, pow];
	};
	Count = $pkg.Count = function(s, sep) {
		var n, c, i, _tuple, hashsep, pow, h, i$1, lastmatch, i$2, x, x$1;
		n = 0;
		if (sep.length === 0) {
			return utf8.RuneCountInString(s) + 1 >> 0;
		} else if (sep.length === 1) {
			c = sep.charCodeAt(0);
			i = 0;
			while (i < s.length) {
				if (s.charCodeAt(i) === c) {
					n = n + (1) >> 0;
				}
				i = i + (1) >> 0;
			}
			return n;
		} else if (sep.length > s.length) {
			return 0;
		} else if (sep.length === s.length) {
			if (sep === s) {
				return 1;
			}
			return 0;
		}
		_tuple = hashstr(sep); hashsep = _tuple[0]; pow = _tuple[1];
		h = 0;
		i$1 = 0;
		while (i$1 < sep.length) {
			h = ((((h >>> 16 << 16) * 16777619 >>> 0) + (h << 16 >>> 16) * 16777619) >>> 0) + (s.charCodeAt(i$1) >>> 0) >>> 0;
			i$1 = i$1 + (1) >> 0;
		}
		lastmatch = 0;
		if ((h === hashsep) && s.substring(0, sep.length) === sep) {
			n = n + (1) >> 0;
			lastmatch = sep.length;
		}
		i$2 = sep.length;
		while (i$2 < s.length) {
			h = (x = 16777619, (((h >>> 16 << 16) * x >>> 0) + (h << 16 >>> 16) * x) >>> 0);
			h = h + ((s.charCodeAt(i$2) >>> 0)) >>> 0;
			h = h - ((x$1 = (s.charCodeAt((i$2 - sep.length >> 0)) >>> 0), (((pow >>> 16 << 16) * x$1 >>> 0) + (pow << 16 >>> 16) * x$1) >>> 0)) >>> 0;
			i$2 = i$2 + (1) >> 0;
			if ((h === hashsep) && lastmatch <= (i$2 - sep.length >> 0) && s.substring((i$2 - sep.length >> 0), i$2) === sep) {
				n = n + (1) >> 0;
				lastmatch = i$2;
			}
		}
		return n;
	};
	LastIndex = $pkg.LastIndex = function(s, sep) {
		var n, c, i, i$1;
		n = sep.length;
		if (n === 0) {
			return s.length;
		}
		c = sep.charCodeAt(0);
		if (n === 1) {
			i = s.length - 1 >> 0;
			while (i >= 0) {
				if (s.charCodeAt(i) === c) {
					return i;
				}
				i = i - (1) >> 0;
			}
			return -1;
		}
		i$1 = s.length - n >> 0;
		while (i$1 >= 0) {
			if ((s.charCodeAt(i$1) === c) && s.substring(i$1, (i$1 + n >> 0)) === sep) {
				return i$1;
			}
			i$1 = i$1 - (1) >> 0;
		}
		return -1;
	};
	IndexAny = $pkg.IndexAny = function(s, chars) {
		var _ref, _i, _rune, i, c, _ref$1, _i$1, _rune$1, m;
		if (chars.length > 0) {
			_ref = s;
			_i = 0;
			while (_i < _ref.length) {
				_rune = $decodeRune(_ref, _i);
				i = _i;
				c = _rune[0];
				_ref$1 = chars;
				_i$1 = 0;
				while (_i$1 < _ref$1.length) {
					_rune$1 = $decodeRune(_ref$1, _i$1);
					m = _rune$1[0];
					if (c === m) {
						return i;
					}
					_i$1 += _rune$1[1];
				}
				_i += _rune[1];
			}
		}
		return -1;
	};
	genSplit = function(s, sep, sepSave, n) {
		var c, start, a, na, i;
		if (n === 0) {
			return ($sliceType($String)).nil;
		}
		if (sep === "") {
			return explode(s, n);
		}
		if (n < 0) {
			n = Count(s, sep) + 1 >> 0;
		}
		c = sep.charCodeAt(0);
		start = 0;
		a = ($sliceType($String)).make(n);
		na = 0;
		i = 0;
		while ((i + sep.length >> 0) <= s.length && (na + 1 >> 0) < n) {
			if ((s.charCodeAt(i) === c) && ((sep.length === 1) || s.substring(i, (i + sep.length >> 0)) === sep)) {
				(na < 0 || na >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + na] = s.substring(start, (i + sepSave >> 0));
				na = na + (1) >> 0;
				start = i + sep.length >> 0;
				i = i + ((sep.length - 1 >> 0)) >> 0;
			}
			i = i + (1) >> 0;
		}
		(na < 0 || na >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + na] = s.substring(start);
		return $subslice(a, 0, (na + 1 >> 0));
	};
	Split = $pkg.Split = function(s, sep) {
		return genSplit(s, sep, 0, -1);
	};
	Map = $pkg.Map = function(mapping, s) {
		var maxbytes, nbytes, b, _ref, _i, _rune, i, c, r, wid, nb;
		maxbytes = s.length;
		nbytes = 0;
		b = ($sliceType($Uint8)).nil;
		_ref = s;
		_i = 0;
		while (_i < _ref.length) {
			_rune = $decodeRune(_ref, _i);
			i = _i;
			c = _rune[0];
			r = mapping(c);
			if (b === ($sliceType($Uint8)).nil) {
				if (r === c) {
					_i += _rune[1];
					continue;
				}
				b = ($sliceType($Uint8)).make(maxbytes);
				nbytes = $copyString(b, s.substring(0, i));
			}
			if (r >= 0) {
				wid = 1;
				if (r >= 128) {
					wid = utf8.RuneLen(r);
				}
				if ((nbytes + wid >> 0) > maxbytes) {
					maxbytes = ((((maxbytes >>> 16 << 16) * 2 >> 0) + (maxbytes << 16 >>> 16) * 2) >> 0) + 4 >> 0;
					nb = ($sliceType($Uint8)).make(maxbytes);
					$copySlice(nb, $subslice(b, 0, nbytes));
					b = nb;
				}
				nbytes = nbytes + (utf8.EncodeRune($subslice(b, nbytes, maxbytes), r)) >> 0;
			}
			_i += _rune[1];
		}
		if (b === ($sliceType($Uint8)).nil) {
			return s;
		}
		return $bytesToString($subslice(b, 0, nbytes));
	};
	IndexFunc = $pkg.IndexFunc = function(s, f) {
		return indexFunc(s, f, true);
	};
	indexFunc = function(s, f, truth) {
		var start, wid, r, _tuple;
		start = 0;
		while (start < s.length) {
			wid = 1;
			r = (s.charCodeAt(start) >> 0);
			if (r >= 128) {
				_tuple = utf8.DecodeRuneInString(s.substring(start)); r = _tuple[0]; wid = _tuple[1];
			}
			if (f(r) === truth) {
				return start;
			}
			start = start + (wid) >> 0;
		}
		return -1;
	};
	$pkg.$init = function() {
		($ptrType(Reader)).methods = [["Len", "Len", "", $funcType([], [$Int], false), -1], ["Read", "Read", "", $funcType([($sliceType($Uint8))], [$Int, $error], false), -1], ["ReadAt", "ReadAt", "", $funcType([($sliceType($Uint8)), $Int64], [$Int, $error], false), -1], ["ReadByte", "ReadByte", "", $funcType([], [$Uint8, $error], false), -1], ["ReadRune", "ReadRune", "", $funcType([], [$Int32, $Int, $error], false), -1], ["Seek", "Seek", "", $funcType([$Int64, $Int], [$Int64, $error], false), -1], ["UnreadByte", "UnreadByte", "", $funcType([], [$error], false), -1], ["UnreadRune", "UnreadRune", "", $funcType([], [$error], false), -1], ["WriteTo", "WriteTo", "", $funcType([io.Writer], [$Int64, $error], false), -1]];
		Reader.init([["s", "s", "strings", $String, ""], ["i", "i", "strings", $Int64, ""], ["prevRune", "prevRune", "strings", $Int, ""]]);
	};
	return $pkg;
})();
$packages["time"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], strings = $packages["strings"], errors = $packages["errors"], syscall = $packages["syscall"], sync = $packages["sync"], runtime = $packages["runtime"], ParseError, Time, Month, Weekday, Duration, Location, zone, zoneTrans, std0x, longDayNames, shortDayNames, shortMonthNames, longMonthNames, atoiError, errBad, errLeadingInt, unitMap, months, days, daysBefore, utcLoc, localLoc, localOnce, zoneinfo, badData, zoneDirs, _map, _key, _tuple, initLocal, runtimeNano, now, startsWithLowerCase, nextStdChunk, match, lookup, appendUint, atoi, formatNano, quote, isDigit, getnum, cutspace, skip, Parse, parse, parseTimeZone, parseGMT, parseNanoseconds, leadingInt, ParseDuration, absWeekday, absClock, fmtFrac, fmtInt, absDate, Now, Unix, isLeap, norm, Date, div, FixedZone;
	ParseError = $pkg.ParseError = $newType(0, "Struct", "time.ParseError", "ParseError", "time", function(Layout_, Value_, LayoutElem_, ValueElem_, Message_) {
		this.$val = this;
		this.Layout = Layout_ !== undefined ? Layout_ : "";
		this.Value = Value_ !== undefined ? Value_ : "";
		this.LayoutElem = LayoutElem_ !== undefined ? LayoutElem_ : "";
		this.ValueElem = ValueElem_ !== undefined ? ValueElem_ : "";
		this.Message = Message_ !== undefined ? Message_ : "";
	});
	Time = $pkg.Time = $newType(0, "Struct", "time.Time", "Time", "time", function(sec_, nsec_, loc_) {
		this.$val = this;
		this.sec = sec_ !== undefined ? sec_ : new $Int64(0, 0);
		this.nsec = nsec_ !== undefined ? nsec_ : 0;
		this.loc = loc_ !== undefined ? loc_ : ($ptrType(Location)).nil;
	});
	Month = $pkg.Month = $newType(4, "Int", "time.Month", "Month", "time", null);
	Weekday = $pkg.Weekday = $newType(4, "Int", "time.Weekday", "Weekday", "time", null);
	Duration = $pkg.Duration = $newType(8, "Int64", "time.Duration", "Duration", "time", null);
	Location = $pkg.Location = $newType(0, "Struct", "time.Location", "Location", "time", function(name_, zone_, tx_, cacheStart_, cacheEnd_, cacheZone_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : "";
		this.zone = zone_ !== undefined ? zone_ : ($sliceType(zone)).nil;
		this.tx = tx_ !== undefined ? tx_ : ($sliceType(zoneTrans)).nil;
		this.cacheStart = cacheStart_ !== undefined ? cacheStart_ : new $Int64(0, 0);
		this.cacheEnd = cacheEnd_ !== undefined ? cacheEnd_ : new $Int64(0, 0);
		this.cacheZone = cacheZone_ !== undefined ? cacheZone_ : ($ptrType(zone)).nil;
	});
	zone = $pkg.zone = $newType(0, "Struct", "time.zone", "zone", "time", function(name_, offset_, isDST_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : "";
		this.offset = offset_ !== undefined ? offset_ : 0;
		this.isDST = isDST_ !== undefined ? isDST_ : false;
	});
	zoneTrans = $pkg.zoneTrans = $newType(0, "Struct", "time.zoneTrans", "zoneTrans", "time", function(when_, index_, isstd_, isutc_) {
		this.$val = this;
		this.when = when_ !== undefined ? when_ : new $Int64(0, 0);
		this.index = index_ !== undefined ? index_ : 0;
		this.isstd = isstd_ !== undefined ? isstd_ : false;
		this.isutc = isutc_ !== undefined ? isutc_ : false;
	});
	initLocal = function() {
		var d, s, i, j, x;
		d = new ($global.Date)();
		s = $internalize(d, $String);
		i = strings.IndexByte(s, 40);
		j = strings.IndexByte(s, 41);
		if ((i === -1) || (j === -1)) {
			localLoc.name = "UTC";
			return;
		}
		localLoc.name = s.substring((i + 1 >> 0), j);
		localLoc.zone = new ($sliceType(zone))([new zone.Ptr(localLoc.name, (x = $parseInt(d.getTimezoneOffset()) >> 0, (((x >>> 16 << 16) * -60 >> 0) + (x << 16 >>> 16) * -60) >> 0), false)]);
	};
	runtimeNano = function() {
		return $mul64($internalize(new ($global.Date)().getTime(), $Int64), new $Int64(0, 1000000));
	};
	now = function() {
		var sec = new $Int64(0, 0), nsec = 0, n, _tmp, _tmp$1, x;
		n = runtimeNano();
		_tmp = $div64(n, new $Int64(0, 1000000000), false); _tmp$1 = ((x = $div64(n, new $Int64(0, 1000000000), true), x.$low + ((x.$high >> 31) * 4294967296)) >> 0); sec = _tmp; nsec = _tmp$1;
		return [sec, nsec];
	};
	startsWithLowerCase = function(str) {
		var c;
		if (str.length === 0) {
			return false;
		}
		c = str.charCodeAt(0);
		return 97 <= c && c <= 122;
	};
	nextStdChunk = function(layout) {
		var prefix = "", std = 0, suffix = "", i, c, _ref, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, x, _tmp$17, _tmp$18, _tmp$19, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$50, _tmp$51, _tmp$52, _tmp$53, _tmp$54, _tmp$55, _tmp$56, _tmp$57, _tmp$58, _tmp$59, _tmp$60, _tmp$61, _tmp$62, _tmp$63, _tmp$64, _tmp$65, _tmp$66, _tmp$67, _tmp$68, _tmp$69, _tmp$70, _tmp$71, _tmp$72, _tmp$73, _tmp$74, ch, j, std$1, _tmp$75, _tmp$76, _tmp$77, _tmp$78, _tmp$79, _tmp$80;
		i = 0;
		while (i < layout.length) {
			c = (layout.charCodeAt(i) >> 0);
			_ref = c;
			if (_ref === 74) {
				if (layout.length >= (i + 3 >> 0) && layout.substring(i, (i + 3 >> 0)) === "Jan") {
					if (layout.length >= (i + 7 >> 0) && layout.substring(i, (i + 7 >> 0)) === "January") {
						_tmp = layout.substring(0, i); _tmp$1 = 257; _tmp$2 = layout.substring((i + 7 >> 0)); prefix = _tmp; std = _tmp$1; suffix = _tmp$2;
						return [prefix, std, suffix];
					}
					if (!startsWithLowerCase(layout.substring((i + 3 >> 0)))) {
						_tmp$3 = layout.substring(0, i); _tmp$4 = 258; _tmp$5 = layout.substring((i + 3 >> 0)); prefix = _tmp$3; std = _tmp$4; suffix = _tmp$5;
						return [prefix, std, suffix];
					}
				}
			} else if (_ref === 77) {
				if (layout.length >= (i + 3 >> 0)) {
					if (layout.substring(i, (i + 3 >> 0)) === "Mon") {
						if (layout.length >= (i + 6 >> 0) && layout.substring(i, (i + 6 >> 0)) === "Monday") {
							_tmp$6 = layout.substring(0, i); _tmp$7 = 261; _tmp$8 = layout.substring((i + 6 >> 0)); prefix = _tmp$6; std = _tmp$7; suffix = _tmp$8;
							return [prefix, std, suffix];
						}
						if (!startsWithLowerCase(layout.substring((i + 3 >> 0)))) {
							_tmp$9 = layout.substring(0, i); _tmp$10 = 262; _tmp$11 = layout.substring((i + 3 >> 0)); prefix = _tmp$9; std = _tmp$10; suffix = _tmp$11;
							return [prefix, std, suffix];
						}
					}
					if (layout.substring(i, (i + 3 >> 0)) === "MST") {
						_tmp$12 = layout.substring(0, i); _tmp$13 = 21; _tmp$14 = layout.substring((i + 3 >> 0)); prefix = _tmp$12; std = _tmp$13; suffix = _tmp$14;
						return [prefix, std, suffix];
					}
				}
			} else if (_ref === 48) {
				if (layout.length >= (i + 2 >> 0) && 49 <= layout.charCodeAt((i + 1 >> 0)) && layout.charCodeAt((i + 1 >> 0)) <= 54) {
					_tmp$15 = layout.substring(0, i); _tmp$16 = (x = layout.charCodeAt((i + 1 >> 0)) - 49 << 24 >>> 24, ((x < 0 || x >= std0x.length) ? $throwRuntimeError("index out of range") : std0x[x])); _tmp$17 = layout.substring((i + 2 >> 0)); prefix = _tmp$15; std = _tmp$16; suffix = _tmp$17;
					return [prefix, std, suffix];
				}
			} else if (_ref === 49) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 53)) {
					_tmp$18 = layout.substring(0, i); _tmp$19 = 522; _tmp$20 = layout.substring((i + 2 >> 0)); prefix = _tmp$18; std = _tmp$19; suffix = _tmp$20;
					return [prefix, std, suffix];
				}
				_tmp$21 = layout.substring(0, i); _tmp$22 = 259; _tmp$23 = layout.substring((i + 1 >> 0)); prefix = _tmp$21; std = _tmp$22; suffix = _tmp$23;
				return [prefix, std, suffix];
			} else if (_ref === 50) {
				if (layout.length >= (i + 4 >> 0) && layout.substring(i, (i + 4 >> 0)) === "2006") {
					_tmp$24 = layout.substring(0, i); _tmp$25 = 273; _tmp$26 = layout.substring((i + 4 >> 0)); prefix = _tmp$24; std = _tmp$25; suffix = _tmp$26;
					return [prefix, std, suffix];
				}
				_tmp$27 = layout.substring(0, i); _tmp$28 = 263; _tmp$29 = layout.substring((i + 1 >> 0)); prefix = _tmp$27; std = _tmp$28; suffix = _tmp$29;
				return [prefix, std, suffix];
			} else if (_ref === 95) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 50)) {
					_tmp$30 = layout.substring(0, i); _tmp$31 = 264; _tmp$32 = layout.substring((i + 2 >> 0)); prefix = _tmp$30; std = _tmp$31; suffix = _tmp$32;
					return [prefix, std, suffix];
				}
			} else if (_ref === 51) {
				_tmp$33 = layout.substring(0, i); _tmp$34 = 523; _tmp$35 = layout.substring((i + 1 >> 0)); prefix = _tmp$33; std = _tmp$34; suffix = _tmp$35;
				return [prefix, std, suffix];
			} else if (_ref === 52) {
				_tmp$36 = layout.substring(0, i); _tmp$37 = 525; _tmp$38 = layout.substring((i + 1 >> 0)); prefix = _tmp$36; std = _tmp$37; suffix = _tmp$38;
				return [prefix, std, suffix];
			} else if (_ref === 53) {
				_tmp$39 = layout.substring(0, i); _tmp$40 = 527; _tmp$41 = layout.substring((i + 1 >> 0)); prefix = _tmp$39; std = _tmp$40; suffix = _tmp$41;
				return [prefix, std, suffix];
			} else if (_ref === 80) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 77)) {
					_tmp$42 = layout.substring(0, i); _tmp$43 = 531; _tmp$44 = layout.substring((i + 2 >> 0)); prefix = _tmp$42; std = _tmp$43; suffix = _tmp$44;
					return [prefix, std, suffix];
				}
			} else if (_ref === 112) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 109)) {
					_tmp$45 = layout.substring(0, i); _tmp$46 = 532; _tmp$47 = layout.substring((i + 2 >> 0)); prefix = _tmp$45; std = _tmp$46; suffix = _tmp$47;
					return [prefix, std, suffix];
				}
			} else if (_ref === 45) {
				if (layout.length >= (i + 7 >> 0) && layout.substring(i, (i + 7 >> 0)) === "-070000") {
					_tmp$48 = layout.substring(0, i); _tmp$49 = 27; _tmp$50 = layout.substring((i + 7 >> 0)); prefix = _tmp$48; std = _tmp$49; suffix = _tmp$50;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 9 >> 0) && layout.substring(i, (i + 9 >> 0)) === "-07:00:00") {
					_tmp$51 = layout.substring(0, i); _tmp$52 = 30; _tmp$53 = layout.substring((i + 9 >> 0)); prefix = _tmp$51; std = _tmp$52; suffix = _tmp$53;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 5 >> 0) && layout.substring(i, (i + 5 >> 0)) === "-0700") {
					_tmp$54 = layout.substring(0, i); _tmp$55 = 26; _tmp$56 = layout.substring((i + 5 >> 0)); prefix = _tmp$54; std = _tmp$55; suffix = _tmp$56;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 6 >> 0) && layout.substring(i, (i + 6 >> 0)) === "-07:00") {
					_tmp$57 = layout.substring(0, i); _tmp$58 = 29; _tmp$59 = layout.substring((i + 6 >> 0)); prefix = _tmp$57; std = _tmp$58; suffix = _tmp$59;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 3 >> 0) && layout.substring(i, (i + 3 >> 0)) === "-07") {
					_tmp$60 = layout.substring(0, i); _tmp$61 = 28; _tmp$62 = layout.substring((i + 3 >> 0)); prefix = _tmp$60; std = _tmp$61; suffix = _tmp$62;
					return [prefix, std, suffix];
				}
			} else if (_ref === 90) {
				if (layout.length >= (i + 7 >> 0) && layout.substring(i, (i + 7 >> 0)) === "Z070000") {
					_tmp$63 = layout.substring(0, i); _tmp$64 = 23; _tmp$65 = layout.substring((i + 7 >> 0)); prefix = _tmp$63; std = _tmp$64; suffix = _tmp$65;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 9 >> 0) && layout.substring(i, (i + 9 >> 0)) === "Z07:00:00") {
					_tmp$66 = layout.substring(0, i); _tmp$67 = 25; _tmp$68 = layout.substring((i + 9 >> 0)); prefix = _tmp$66; std = _tmp$67; suffix = _tmp$68;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 5 >> 0) && layout.substring(i, (i + 5 >> 0)) === "Z0700") {
					_tmp$69 = layout.substring(0, i); _tmp$70 = 22; _tmp$71 = layout.substring((i + 5 >> 0)); prefix = _tmp$69; std = _tmp$70; suffix = _tmp$71;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 6 >> 0) && layout.substring(i, (i + 6 >> 0)) === "Z07:00") {
					_tmp$72 = layout.substring(0, i); _tmp$73 = 24; _tmp$74 = layout.substring((i + 6 >> 0)); prefix = _tmp$72; std = _tmp$73; suffix = _tmp$74;
					return [prefix, std, suffix];
				}
			} else if (_ref === 46) {
				if ((i + 1 >> 0) < layout.length && ((layout.charCodeAt((i + 1 >> 0)) === 48) || (layout.charCodeAt((i + 1 >> 0)) === 57))) {
					ch = layout.charCodeAt((i + 1 >> 0));
					j = i + 1 >> 0;
					while (j < layout.length && (layout.charCodeAt(j) === ch)) {
						j = j + (1) >> 0;
					}
					if (!isDigit(layout, j)) {
						std$1 = 31;
						if (layout.charCodeAt((i + 1 >> 0)) === 57) {
							std$1 = 32;
						}
						std$1 = std$1 | ((((j - ((i + 1 >> 0)) >> 0)) << 16 >> 0));
						_tmp$75 = layout.substring(0, i); _tmp$76 = std$1; _tmp$77 = layout.substring(j); prefix = _tmp$75; std = _tmp$76; suffix = _tmp$77;
						return [prefix, std, suffix];
					}
				}
			}
			i = i + (1) >> 0;
		}
		_tmp$78 = layout; _tmp$79 = 0; _tmp$80 = ""; prefix = _tmp$78; std = _tmp$79; suffix = _tmp$80;
		return [prefix, std, suffix];
	};
	match = function(s1, s2) {
		var i, c1, c2;
		i = 0;
		while (i < s1.length) {
			c1 = s1.charCodeAt(i);
			c2 = s2.charCodeAt(i);
			if (!((c1 === c2))) {
				c1 = (c1 | (32)) >>> 0;
				c2 = (c2 | (32)) >>> 0;
				if (!((c1 === c2)) || c1 < 97 || c1 > 122) {
					return false;
				}
			}
			i = i + (1) >> 0;
		}
		return true;
	};
	lookup = function(tab, val) {
		var _ref, _i, i, v;
		_ref = tab;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			v = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (val.length >= v.length && match(val.substring(0, v.length), v)) {
				return [i, val.substring(v.length), $ifaceNil];
			}
			_i++;
		}
		return [-1, val, errBad];
	};
	appendUint = function(b, x, pad) {
		var _q, _r, buf, n, _r$1, _q$1;
		if (x < 10) {
			if (!((pad === 0))) {
				b = $append(b, pad);
			}
			return $append(b, ((48 + x >>> 0) << 24 >>> 24));
		}
		if (x < 100) {
			b = $append(b, ((48 + (_q = x / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero")) >>> 0) << 24 >>> 24));
			b = $append(b, ((48 + (_r = x % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) >>> 0) << 24 >>> 24));
			return b;
		}
		buf = ($arrayType($Uint8, 32)).zero(); $copy(buf, ($arrayType($Uint8, 32)).zero(), ($arrayType($Uint8, 32)));
		n = 32;
		if (x === 0) {
			return $append(b, 48);
		}
		while (x >= 10) {
			n = n - (1) >> 0;
			(n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n] = (((_r$1 = x % 10, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) + 48 >>> 0) << 24 >>> 24);
			x = (_q$1 = x / (10), (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
		}
		n = n - (1) >> 0;
		(n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n] = ((x + 48 >>> 0) << 24 >>> 24);
		return $appendSlice(b, $subslice(new ($sliceType($Uint8))(buf), n));
	};
	atoi = function(s) {
		var x = 0, err = $ifaceNil, neg, _tuple$1, q, rem, _tmp, _tmp$1, _tmp$2, _tmp$3;
		neg = false;
		if (!(s === "") && ((s.charCodeAt(0) === 45) || (s.charCodeAt(0) === 43))) {
			neg = s.charCodeAt(0) === 45;
			s = s.substring(1);
		}
		_tuple$1 = leadingInt(s); q = _tuple$1[0]; rem = _tuple$1[1]; err = _tuple$1[2];
		x = ((q.$low + ((q.$high >> 31) * 4294967296)) >> 0);
		if (!($interfaceIsEqual(err, $ifaceNil)) || !(rem === "")) {
			_tmp = 0; _tmp$1 = atoiError; x = _tmp; err = _tmp$1;
			return [x, err];
		}
		if (neg) {
			x = -x;
		}
		_tmp$2 = x; _tmp$3 = $ifaceNil; x = _tmp$2; err = _tmp$3;
		return [x, err];
	};
	formatNano = function(b, nanosec, n, trim) {
		var u, buf, start, _r, _q, x;
		u = nanosec;
		buf = ($arrayType($Uint8, 9)).zero(); $copy(buf, ($arrayType($Uint8, 9)).zero(), ($arrayType($Uint8, 9)));
		start = 9;
		while (start > 0) {
			start = start - (1) >> 0;
			(start < 0 || start >= buf.length) ? $throwRuntimeError("index out of range") : buf[start] = (((_r = u % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >>> 0) << 24 >>> 24);
			u = (_q = u / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
		}
		if (n > 9) {
			n = 9;
		}
		if (trim) {
			while (n > 0 && ((x = n - 1 >> 0, ((x < 0 || x >= buf.length) ? $throwRuntimeError("index out of range") : buf[x])) === 48)) {
				n = n - (1) >> 0;
			}
			if (n === 0) {
				return b;
			}
		}
		b = $append(b, 46);
		return $appendSlice(b, $subslice(new ($sliceType($Uint8))(buf), 0, n));
	};
	Time.Ptr.prototype.String = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		return t.Format("2006-01-02 15:04:05.999999999 -0700 MST");
	};
	Time.prototype.String = function() { return this.$val.String(); };
	Time.Ptr.prototype.Format = function(layout) {
		var t, _tuple$1, name, offset, abs, year, month, day, hour, min, sec, b, buf, max, _tuple$2, prefix, std, suffix, _tuple$3, _tuple$4, _ref, y, _r, y$1, m, s, _r$1, hr, _r$2, hr$1, _q, zone$1, absoffset, _q$1, _r$3, _r$4, _q$2, zone$2, _q$3, _r$5;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.locabs(); name = _tuple$1[0]; offset = _tuple$1[1]; abs = _tuple$1[2];
		year = -1;
		month = 0;
		day = 0;
		hour = -1;
		min = 0;
		sec = 0;
		b = ($sliceType($Uint8)).nil;
		buf = ($arrayType($Uint8, 64)).zero(); $copy(buf, ($arrayType($Uint8, 64)).zero(), ($arrayType($Uint8, 64)));
		max = layout.length + 10 >> 0;
		if (max <= 64) {
			b = $subslice(new ($sliceType($Uint8))(buf), 0, 0);
		} else {
			b = ($sliceType($Uint8)).make(0, max);
		}
		while (!(layout === "")) {
			_tuple$2 = nextStdChunk(layout); prefix = _tuple$2[0]; std = _tuple$2[1]; suffix = _tuple$2[2];
			if (!(prefix === "")) {
				b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes(prefix)));
			}
			if (std === 0) {
				break;
			}
			layout = suffix;
			if (year < 0 && !(((std & 256) === 0))) {
				_tuple$3 = absDate(abs, true); year = _tuple$3[0]; month = _tuple$3[1]; day = _tuple$3[2];
			}
			if (hour < 0 && !(((std & 512) === 0))) {
				_tuple$4 = absClock(abs); hour = _tuple$4[0]; min = _tuple$4[1]; sec = _tuple$4[2];
			}
			_ref = std & 65535;
			switch (0) { default: if (_ref === 274) {
				y = year;
				if (y < 0) {
					y = -y;
				}
				b = appendUint(b, ((_r = y % 100, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
			} else if (_ref === 273) {
				y$1 = year;
				if (year <= -1000) {
					b = $append(b, 45);
					y$1 = -y$1;
				} else if (year <= -100) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("-0")));
					y$1 = -y$1;
				} else if (year <= -10) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("-00")));
					y$1 = -y$1;
				} else if (year < 0) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("-000")));
					y$1 = -y$1;
				} else if (year < 10) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("000")));
				} else if (year < 100) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("00")));
				} else if (year < 1000) {
					b = $append(b, 48);
				}
				b = appendUint(b, (y$1 >>> 0), 0);
			} else if (_ref === 258) {
				b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes((new Month(month)).String().substring(0, 3))));
			} else if (_ref === 257) {
				m = (new Month(month)).String();
				b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes(m)));
			} else if (_ref === 259) {
				b = appendUint(b, (month >>> 0), 0);
			} else if (_ref === 260) {
				b = appendUint(b, (month >>> 0), 48);
			} else if (_ref === 262) {
				b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes((new Weekday(absWeekday(abs))).String().substring(0, 3))));
			} else if (_ref === 261) {
				s = (new Weekday(absWeekday(abs))).String();
				b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes(s)));
			} else if (_ref === 263) {
				b = appendUint(b, (day >>> 0), 0);
			} else if (_ref === 264) {
				b = appendUint(b, (day >>> 0), 32);
			} else if (_ref === 265) {
				b = appendUint(b, (day >>> 0), 48);
			} else if (_ref === 522) {
				b = appendUint(b, (hour >>> 0), 48);
			} else if (_ref === 523) {
				hr = (_r$1 = hour % 12, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero"));
				if (hr === 0) {
					hr = 12;
				}
				b = appendUint(b, (hr >>> 0), 0);
			} else if (_ref === 524) {
				hr$1 = (_r$2 = hour % 12, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero"));
				if (hr$1 === 0) {
					hr$1 = 12;
				}
				b = appendUint(b, (hr$1 >>> 0), 48);
			} else if (_ref === 525) {
				b = appendUint(b, (min >>> 0), 0);
			} else if (_ref === 526) {
				b = appendUint(b, (min >>> 0), 48);
			} else if (_ref === 527) {
				b = appendUint(b, (sec >>> 0), 0);
			} else if (_ref === 528) {
				b = appendUint(b, (sec >>> 0), 48);
			} else if (_ref === 531) {
				if (hour >= 12) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("PM")));
				} else {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("AM")));
				}
			} else if (_ref === 532) {
				if (hour >= 12) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("pm")));
				} else {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("am")));
				}
			} else if (_ref === 22 || _ref === 24 || _ref === 23 || _ref === 25 || _ref === 26 || _ref === 29 || _ref === 27 || _ref === 30) {
				if ((offset === 0) && ((std === 22) || (std === 24) || (std === 23) || (std === 25))) {
					b = $append(b, 90);
					break;
				}
				zone$1 = (_q = offset / 60, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
				absoffset = offset;
				if (zone$1 < 0) {
					b = $append(b, 45);
					zone$1 = -zone$1;
					absoffset = -absoffset;
				} else {
					b = $append(b, 43);
				}
				b = appendUint(b, ((_q$1 = zone$1 / 60, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
				if ((std === 24) || (std === 29)) {
					b = $append(b, 58);
				}
				b = appendUint(b, ((_r$3 = zone$1 % 60, _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
				if ((std === 23) || (std === 27) || (std === 30) || (std === 25)) {
					if ((std === 30) || (std === 25)) {
						b = $append(b, 58);
					}
					b = appendUint(b, ((_r$4 = absoffset % 60, _r$4 === _r$4 ? _r$4 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
				}
			} else if (_ref === 21) {
				if (!(name === "")) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes(name)));
					break;
				}
				zone$2 = (_q$2 = offset / 60, (_q$2 === _q$2 && _q$2 !== 1/0 && _q$2 !== -1/0) ? _q$2 >> 0 : $throwRuntimeError("integer divide by zero"));
				if (zone$2 < 0) {
					b = $append(b, 45);
					zone$2 = -zone$2;
				} else {
					b = $append(b, 43);
				}
				b = appendUint(b, ((_q$3 = zone$2 / 60, (_q$3 === _q$3 && _q$3 !== 1/0 && _q$3 !== -1/0) ? _q$3 >> 0 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
				b = appendUint(b, ((_r$5 = zone$2 % 60, _r$5 === _r$5 ? _r$5 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
			} else if (_ref === 31 || _ref === 32) {
				b = formatNano(b, (t.Nanosecond() >>> 0), std >> 16 >> 0, (std & 65535) === 32);
			} }
		}
		return $bytesToString(b);
	};
	Time.prototype.Format = function(layout) { return this.$val.Format(layout); };
	quote = function(s) {
		return "\"" + s + "\"";
	};
	ParseError.Ptr.prototype.Error = function() {
		var e;
		e = this;
		if (e.Message === "") {
			return "parsing time " + quote(e.Value) + " as " + quote(e.Layout) + ": cannot parse " + quote(e.ValueElem) + " as " + quote(e.LayoutElem);
		}
		return "parsing time " + quote(e.Value) + e.Message;
	};
	ParseError.prototype.Error = function() { return this.$val.Error(); };
	isDigit = function(s, i) {
		var c;
		if (s.length <= i) {
			return false;
		}
		c = s.charCodeAt(i);
		return 48 <= c && c <= 57;
	};
	getnum = function(s, fixed) {
		var x;
		if (!isDigit(s, 0)) {
			return [0, s, errBad];
		}
		if (!isDigit(s, 1)) {
			if (fixed) {
				return [0, s, errBad];
			}
			return [((s.charCodeAt(0) - 48 << 24 >>> 24) >> 0), s.substring(1), $ifaceNil];
		}
		return [(x = ((s.charCodeAt(0) - 48 << 24 >>> 24) >> 0), (((x >>> 16 << 16) * 10 >> 0) + (x << 16 >>> 16) * 10) >> 0) + ((s.charCodeAt(1) - 48 << 24 >>> 24) >> 0) >> 0, s.substring(2), $ifaceNil];
	};
	cutspace = function(s) {
		while (s.length > 0 && (s.charCodeAt(0) === 32)) {
			s = s.substring(1);
		}
		return s;
	};
	skip = function(value, prefix) {
		while (prefix.length > 0) {
			if (prefix.charCodeAt(0) === 32) {
				if (value.length > 0 && !((value.charCodeAt(0) === 32))) {
					return [value, errBad];
				}
				prefix = cutspace(prefix);
				value = cutspace(value);
				continue;
			}
			if ((value.length === 0) || !((value.charCodeAt(0) === prefix.charCodeAt(0)))) {
				return [value, errBad];
			}
			prefix = prefix.substring(1);
			value = value.substring(1);
		}
		return [value, $ifaceNil];
	};
	Parse = $pkg.Parse = function(layout, value) {
		return parse(layout, value, $pkg.UTC, $pkg.Local);
	};
	parse = function(layout, value, defaultLocation, local) {
		var _tmp, _tmp$1, alayout, avalue, rangeErrString, amSet, pmSet, year, month, day, hour, min, sec, nsec, z, zoneOffset, zoneName, err, _tuple$1, prefix, std, suffix, stdstr, _tuple$2, p, _ref, _tmp$2, _tmp$3, _tuple$3, _tmp$4, _tmp$5, _tuple$4, _tuple$5, _tuple$6, _tuple$7, _tuple$8, _tuple$9, _tuple$10, _tuple$11, _tuple$12, _tuple$13, _tuple$14, _tuple$15, n, _tuple$16, _tmp$6, _tmp$7, _ref$1, _tmp$8, _tmp$9, _ref$2, _tmp$10, _tmp$11, _tmp$12, _tmp$13, sign, hour$1, min$1, seconds, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$40, _tmp$41, hr, mm, ss, _tuple$17, _tuple$18, _tuple$19, x, _ref$3, _tuple$20, n$1, ok, _tmp$42, _tmp$43, ndigit, _tuple$21, i, _tuple$22, t, x$1, x$2, _tuple$23, x$3, name, offset, t$1, _tuple$24, x$4, offset$1, ok$1, x$5, x$6, _tuple$25, x$7;
		_tmp = layout; _tmp$1 = value; alayout = _tmp; avalue = _tmp$1;
		rangeErrString = "";
		amSet = false;
		pmSet = false;
		year = 0;
		month = 1;
		day = 1;
		hour = 0;
		min = 0;
		sec = 0;
		nsec = 0;
		z = ($ptrType(Location)).nil;
		zoneOffset = -1;
		zoneName = "";
		while (true) {
			err = $ifaceNil;
			_tuple$1 = nextStdChunk(layout); prefix = _tuple$1[0]; std = _tuple$1[1]; suffix = _tuple$1[2];
			stdstr = layout.substring(prefix.length, (layout.length - suffix.length >> 0));
			_tuple$2 = skip(value, prefix); value = _tuple$2[0]; err = _tuple$2[1];
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				return [new Time.Ptr(new $Int64(0, 0), 0, ($ptrType(Location)).nil), new ParseError.Ptr(alayout, avalue, prefix, value, "")];
			}
			if (std === 0) {
				if (!((value.length === 0))) {
					return [new Time.Ptr(new $Int64(0, 0), 0, ($ptrType(Location)).nil), new ParseError.Ptr(alayout, avalue, "", value, ": extra text: " + value)];
				}
				break;
			}
			layout = suffix;
			p = "";
			_ref = std & 65535;
			switch (0) { default: if (_ref === 274) {
				if (value.length < 2) {
					err = errBad;
					break;
				}
				_tmp$2 = value.substring(0, 2); _tmp$3 = value.substring(2); p = _tmp$2; value = _tmp$3;
				_tuple$3 = atoi(p); year = _tuple$3[0]; err = _tuple$3[1];
				if (year >= 69) {
					year = year + (1900) >> 0;
				} else {
					year = year + (2000) >> 0;
				}
			} else if (_ref === 273) {
				if (value.length < 4 || !isDigit(value, 0)) {
					err = errBad;
					break;
				}
				_tmp$4 = value.substring(0, 4); _tmp$5 = value.substring(4); p = _tmp$4; value = _tmp$5;
				_tuple$4 = atoi(p); year = _tuple$4[0]; err = _tuple$4[1];
			} else if (_ref === 258) {
				_tuple$5 = lookup(shortMonthNames, value); month = _tuple$5[0]; value = _tuple$5[1]; err = _tuple$5[2];
			} else if (_ref === 257) {
				_tuple$6 = lookup(longMonthNames, value); month = _tuple$6[0]; value = _tuple$6[1]; err = _tuple$6[2];
			} else if (_ref === 259 || _ref === 260) {
				_tuple$7 = getnum(value, std === 260); month = _tuple$7[0]; value = _tuple$7[1]; err = _tuple$7[2];
				if (month <= 0 || 12 < month) {
					rangeErrString = "month";
				}
			} else if (_ref === 262) {
				_tuple$8 = lookup(shortDayNames, value); value = _tuple$8[1]; err = _tuple$8[2];
			} else if (_ref === 261) {
				_tuple$9 = lookup(longDayNames, value); value = _tuple$9[1]; err = _tuple$9[2];
			} else if (_ref === 263 || _ref === 264 || _ref === 265) {
				if ((std === 264) && value.length > 0 && (value.charCodeAt(0) === 32)) {
					value = value.substring(1);
				}
				_tuple$10 = getnum(value, std === 265); day = _tuple$10[0]; value = _tuple$10[1]; err = _tuple$10[2];
				if (day < 0 || 31 < day) {
					rangeErrString = "day";
				}
			} else if (_ref === 522) {
				_tuple$11 = getnum(value, false); hour = _tuple$11[0]; value = _tuple$11[1]; err = _tuple$11[2];
				if (hour < 0 || 24 <= hour) {
					rangeErrString = "hour";
				}
			} else if (_ref === 523 || _ref === 524) {
				_tuple$12 = getnum(value, std === 524); hour = _tuple$12[0]; value = _tuple$12[1]; err = _tuple$12[2];
				if (hour < 0 || 12 < hour) {
					rangeErrString = "hour";
				}
			} else if (_ref === 525 || _ref === 526) {
				_tuple$13 = getnum(value, std === 526); min = _tuple$13[0]; value = _tuple$13[1]; err = _tuple$13[2];
				if (min < 0 || 60 <= min) {
					rangeErrString = "minute";
				}
			} else if (_ref === 527 || _ref === 528) {
				_tuple$14 = getnum(value, std === 528); sec = _tuple$14[0]; value = _tuple$14[1]; err = _tuple$14[2];
				if (sec < 0 || 60 <= sec) {
					rangeErrString = "second";
				}
				if (value.length >= 2 && (value.charCodeAt(0) === 46) && isDigit(value, 1)) {
					_tuple$15 = nextStdChunk(layout); std = _tuple$15[1];
					std = std & (65535);
					if ((std === 31) || (std === 32)) {
						break;
					}
					n = 2;
					while (n < value.length && isDigit(value, n)) {
						n = n + (1) >> 0;
					}
					_tuple$16 = parseNanoseconds(value, n); nsec = _tuple$16[0]; rangeErrString = _tuple$16[1]; err = _tuple$16[2];
					value = value.substring(n);
				}
			} else if (_ref === 531) {
				if (value.length < 2) {
					err = errBad;
					break;
				}
				_tmp$6 = value.substring(0, 2); _tmp$7 = value.substring(2); p = _tmp$6; value = _tmp$7;
				_ref$1 = p;
				if (_ref$1 === "PM") {
					pmSet = true;
				} else if (_ref$1 === "AM") {
					amSet = true;
				} else {
					err = errBad;
				}
			} else if (_ref === 532) {
				if (value.length < 2) {
					err = errBad;
					break;
				}
				_tmp$8 = value.substring(0, 2); _tmp$9 = value.substring(2); p = _tmp$8; value = _tmp$9;
				_ref$2 = p;
				if (_ref$2 === "pm") {
					pmSet = true;
				} else if (_ref$2 === "am") {
					amSet = true;
				} else {
					err = errBad;
				}
			} else if (_ref === 22 || _ref === 24 || _ref === 23 || _ref === 25 || _ref === 26 || _ref === 28 || _ref === 29 || _ref === 27 || _ref === 30) {
				if (((std === 22) || (std === 24)) && value.length >= 1 && (value.charCodeAt(0) === 90)) {
					value = value.substring(1);
					z = $pkg.UTC;
					break;
				}
				_tmp$10 = ""; _tmp$11 = ""; _tmp$12 = ""; _tmp$13 = ""; sign = _tmp$10; hour$1 = _tmp$11; min$1 = _tmp$12; seconds = _tmp$13;
				if ((std === 24) || (std === 29)) {
					if (value.length < 6) {
						err = errBad;
						break;
					}
					if (!((value.charCodeAt(3) === 58))) {
						err = errBad;
						break;
					}
					_tmp$14 = value.substring(0, 1); _tmp$15 = value.substring(1, 3); _tmp$16 = value.substring(4, 6); _tmp$17 = "00"; _tmp$18 = value.substring(6); sign = _tmp$14; hour$1 = _tmp$15; min$1 = _tmp$16; seconds = _tmp$17; value = _tmp$18;
				} else if (std === 28) {
					if (value.length < 3) {
						err = errBad;
						break;
					}
					_tmp$19 = value.substring(0, 1); _tmp$20 = value.substring(1, 3); _tmp$21 = "00"; _tmp$22 = "00"; _tmp$23 = value.substring(3); sign = _tmp$19; hour$1 = _tmp$20; min$1 = _tmp$21; seconds = _tmp$22; value = _tmp$23;
				} else if ((std === 25) || (std === 30)) {
					if (value.length < 9) {
						err = errBad;
						break;
					}
					if (!((value.charCodeAt(3) === 58)) || !((value.charCodeAt(6) === 58))) {
						err = errBad;
						break;
					}
					_tmp$24 = value.substring(0, 1); _tmp$25 = value.substring(1, 3); _tmp$26 = value.substring(4, 6); _tmp$27 = value.substring(7, 9); _tmp$28 = value.substring(9); sign = _tmp$24; hour$1 = _tmp$25; min$1 = _tmp$26; seconds = _tmp$27; value = _tmp$28;
				} else if ((std === 23) || (std === 27)) {
					if (value.length < 7) {
						err = errBad;
						break;
					}
					_tmp$29 = value.substring(0, 1); _tmp$30 = value.substring(1, 3); _tmp$31 = value.substring(3, 5); _tmp$32 = value.substring(5, 7); _tmp$33 = value.substring(7); sign = _tmp$29; hour$1 = _tmp$30; min$1 = _tmp$31; seconds = _tmp$32; value = _tmp$33;
				} else {
					if (value.length < 5) {
						err = errBad;
						break;
					}
					_tmp$34 = value.substring(0, 1); _tmp$35 = value.substring(1, 3); _tmp$36 = value.substring(3, 5); _tmp$37 = "00"; _tmp$38 = value.substring(5); sign = _tmp$34; hour$1 = _tmp$35; min$1 = _tmp$36; seconds = _tmp$37; value = _tmp$38;
				}
				_tmp$39 = 0; _tmp$40 = 0; _tmp$41 = 0; hr = _tmp$39; mm = _tmp$40; ss = _tmp$41;
				_tuple$17 = atoi(hour$1); hr = _tuple$17[0]; err = _tuple$17[1];
				if ($interfaceIsEqual(err, $ifaceNil)) {
					_tuple$18 = atoi(min$1); mm = _tuple$18[0]; err = _tuple$18[1];
				}
				if ($interfaceIsEqual(err, $ifaceNil)) {
					_tuple$19 = atoi(seconds); ss = _tuple$19[0]; err = _tuple$19[1];
				}
				zoneOffset = (x = (((((hr >>> 16 << 16) * 60 >> 0) + (hr << 16 >>> 16) * 60) >> 0) + mm >> 0), (((x >>> 16 << 16) * 60 >> 0) + (x << 16 >>> 16) * 60) >> 0) + ss >> 0;
				_ref$3 = sign.charCodeAt(0);
				if (_ref$3 === 43) {
				} else if (_ref$3 === 45) {
					zoneOffset = -zoneOffset;
				} else {
					err = errBad;
				}
			} else if (_ref === 21) {
				if (value.length >= 3 && value.substring(0, 3) === "UTC") {
					z = $pkg.UTC;
					value = value.substring(3);
					break;
				}
				_tuple$20 = parseTimeZone(value); n$1 = _tuple$20[0]; ok = _tuple$20[1];
				if (!ok) {
					err = errBad;
					break;
				}
				_tmp$42 = value.substring(0, n$1); _tmp$43 = value.substring(n$1); zoneName = _tmp$42; value = _tmp$43;
			} else if (_ref === 31) {
				ndigit = 1 + ((std >> 16 >> 0)) >> 0;
				if (value.length < ndigit) {
					err = errBad;
					break;
				}
				_tuple$21 = parseNanoseconds(value, ndigit); nsec = _tuple$21[0]; rangeErrString = _tuple$21[1]; err = _tuple$21[2];
				value = value.substring(ndigit);
			} else if (_ref === 32) {
				if (value.length < 2 || !((value.charCodeAt(0) === 46)) || value.charCodeAt(1) < 48 || 57 < value.charCodeAt(1)) {
					break;
				}
				i = 0;
				while (i < 9 && (i + 1 >> 0) < value.length && 48 <= value.charCodeAt((i + 1 >> 0)) && value.charCodeAt((i + 1 >> 0)) <= 57) {
					i = i + (1) >> 0;
				}
				_tuple$22 = parseNanoseconds(value, 1 + i >> 0); nsec = _tuple$22[0]; rangeErrString = _tuple$22[1]; err = _tuple$22[2];
				value = value.substring((1 + i >> 0));
			} }
			if (!(rangeErrString === "")) {
				return [new Time.Ptr(new $Int64(0, 0), 0, ($ptrType(Location)).nil), new ParseError.Ptr(alayout, avalue, stdstr, value, ": " + rangeErrString + " out of range")];
			}
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				return [new Time.Ptr(new $Int64(0, 0), 0, ($ptrType(Location)).nil), new ParseError.Ptr(alayout, avalue, stdstr, value, "")];
			}
		}
		if (pmSet && hour < 12) {
			hour = hour + (12) >> 0;
		} else if (amSet && (hour === 12)) {
			hour = 0;
		}
		if (!(z === ($ptrType(Location)).nil)) {
			return [Date(year, (month >> 0), day, hour, min, sec, nsec, z), $ifaceNil];
		}
		if (!((zoneOffset === -1))) {
			t = new Time.Ptr(); $copy(t, Date(year, (month >> 0), day, hour, min, sec, nsec, $pkg.UTC), Time);
			t.sec = (x$1 = t.sec, x$2 = new $Int64(0, zoneOffset), new $Int64(x$1.$high - x$2.$high, x$1.$low - x$2.$low));
			_tuple$23 = local.lookup((x$3 = t.sec, new $Int64(x$3.$high + -15, x$3.$low + 2288912640))); name = _tuple$23[0]; offset = _tuple$23[1];
			if ((offset === zoneOffset) && (zoneName === "" || name === zoneName)) {
				t.loc = local;
				return [t, $ifaceNil];
			}
			t.loc = FixedZone(zoneName, zoneOffset);
			return [t, $ifaceNil];
		}
		if (!(zoneName === "")) {
			t$1 = new Time.Ptr(); $copy(t$1, Date(year, (month >> 0), day, hour, min, sec, nsec, $pkg.UTC), Time);
			_tuple$24 = local.lookupName(zoneName, (x$4 = t$1.sec, new $Int64(x$4.$high + -15, x$4.$low + 2288912640))); offset$1 = _tuple$24[0]; ok$1 = _tuple$24[2];
			if (ok$1) {
				t$1.sec = (x$5 = t$1.sec, x$6 = new $Int64(0, offset$1), new $Int64(x$5.$high - x$6.$high, x$5.$low - x$6.$low));
				t$1.loc = local;
				return [t$1, $ifaceNil];
			}
			if (zoneName.length > 3 && zoneName.substring(0, 3) === "GMT") {
				_tuple$25 = atoi(zoneName.substring(3)); offset$1 = _tuple$25[0];
				offset$1 = (x$7 = 3600, (((offset$1 >>> 16 << 16) * x$7 >> 0) + (offset$1 << 16 >>> 16) * x$7) >> 0);
			}
			t$1.loc = FixedZone(zoneName, offset$1);
			return [t$1, $ifaceNil];
		}
		return [Date(year, (month >> 0), day, hour, min, sec, nsec, defaultLocation), $ifaceNil];
	};
	parseTimeZone = function(value) {
		var length = 0, ok = false, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, nUpper, c, _ref, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15;
		if (value.length < 3) {
			_tmp = 0; _tmp$1 = false; length = _tmp; ok = _tmp$1;
			return [length, ok];
		}
		if (value.length >= 4 && (value.substring(0, 4) === "ChST" || value.substring(0, 4) === "MeST")) {
			_tmp$2 = 4; _tmp$3 = true; length = _tmp$2; ok = _tmp$3;
			return [length, ok];
		}
		if (value.substring(0, 3) === "GMT") {
			length = parseGMT(value);
			_tmp$4 = length; _tmp$5 = true; length = _tmp$4; ok = _tmp$5;
			return [length, ok];
		}
		nUpper = 0;
		nUpper = 0;
		while (nUpper < 6) {
			if (nUpper >= value.length) {
				break;
			}
			c = value.charCodeAt(nUpper);
			if (c < 65 || 90 < c) {
				break;
			}
			nUpper = nUpper + (1) >> 0;
		}
		_ref = nUpper;
		if (_ref === 0 || _ref === 1 || _ref === 2 || _ref === 6) {
			_tmp$6 = 0; _tmp$7 = false; length = _tmp$6; ok = _tmp$7;
			return [length, ok];
		} else if (_ref === 5) {
			if (value.charCodeAt(4) === 84) {
				_tmp$8 = 5; _tmp$9 = true; length = _tmp$8; ok = _tmp$9;
				return [length, ok];
			}
		} else if (_ref === 4) {
			if (value.charCodeAt(3) === 84) {
				_tmp$10 = 4; _tmp$11 = true; length = _tmp$10; ok = _tmp$11;
				return [length, ok];
			}
		} else if (_ref === 3) {
			_tmp$12 = 3; _tmp$13 = true; length = _tmp$12; ok = _tmp$13;
			return [length, ok];
		}
		_tmp$14 = 0; _tmp$15 = false; length = _tmp$14; ok = _tmp$15;
		return [length, ok];
	};
	parseGMT = function(value) {
		var sign, _tuple$1, x, rem, err;
		value = value.substring(3);
		if (value.length === 0) {
			return 3;
		}
		sign = value.charCodeAt(0);
		if (!((sign === 45)) && !((sign === 43))) {
			return 3;
		}
		_tuple$1 = leadingInt(value.substring(1)); x = _tuple$1[0]; rem = _tuple$1[1]; err = _tuple$1[2];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return 3;
		}
		if (sign === 45) {
			x = new $Int64(-x.$high, -x.$low);
		}
		if ((x.$high === 0 && x.$low === 0) || (x.$high < -1 || (x.$high === -1 && x.$low < 4294967282)) || (0 < x.$high || (0 === x.$high && 12 < x.$low))) {
			return 3;
		}
		return (3 + value.length >> 0) - rem.length >> 0;
	};
	parseNanoseconds = function(value, nbytes) {
		var ns = 0, rangeErrString = "", err = $ifaceNil, _tuple$1, scaleDigits, i, x;
		if (!((value.charCodeAt(0) === 46))) {
			err = errBad;
			return [ns, rangeErrString, err];
		}
		_tuple$1 = atoi(value.substring(1, nbytes)); ns = _tuple$1[0]; err = _tuple$1[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return [ns, rangeErrString, err];
		}
		if (ns < 0 || 1000000000 <= ns) {
			rangeErrString = "fractional second";
			return [ns, rangeErrString, err];
		}
		scaleDigits = 10 - nbytes >> 0;
		i = 0;
		while (i < scaleDigits) {
			ns = (x = 10, (((ns >>> 16 << 16) * x >> 0) + (ns << 16 >>> 16) * x) >> 0);
			i = i + (1) >> 0;
		}
		return [ns, rangeErrString, err];
	};
	leadingInt = function(s) {
		var x = new $Int64(0, 0), rem = "", err = $ifaceNil, i, c, _tmp, _tmp$1, _tmp$2, x$1, x$2, x$3, _tmp$3, _tmp$4, _tmp$5;
		i = 0;
		while (i < s.length) {
			c = s.charCodeAt(i);
			if (c < 48 || c > 57) {
				break;
			}
			if ((x.$high > 214748364 || (x.$high === 214748364 && x.$low >= 3435973835))) {
				_tmp = new $Int64(0, 0); _tmp$1 = ""; _tmp$2 = errLeadingInt; x = _tmp; rem = _tmp$1; err = _tmp$2;
				return [x, rem, err];
			}
			x = (x$1 = (x$2 = $mul64(x, new $Int64(0, 10)), x$3 = new $Int64(0, c), new $Int64(x$2.$high + x$3.$high, x$2.$low + x$3.$low)), new $Int64(x$1.$high - 0, x$1.$low - 48));
			i = i + (1) >> 0;
		}
		_tmp$3 = x; _tmp$4 = s.substring(i); _tmp$5 = $ifaceNil; x = _tmp$3; rem = _tmp$4; err = _tmp$5;
		return [x, rem, err];
	};
	ParseDuration = $pkg.ParseDuration = function(s) {
		var orig, f, neg, c, g, x, err, pl, _tuple$1, pre, post, pl$1, _tuple$2, scale, n, i, c$1, u, _tuple$3, _entry, unit, ok;
		orig = s;
		f = 0;
		neg = false;
		if (!(s === "")) {
			c = s.charCodeAt(0);
			if ((c === 45) || (c === 43)) {
				neg = c === 45;
				s = s.substring(1);
			}
		}
		if (s === "0") {
			return [new Duration(0, 0), $ifaceNil];
		}
		if (s === "") {
			return [new Duration(0, 0), errors.New("time: invalid duration " + orig)];
		}
		while (!(s === "")) {
			g = 0;
			x = new $Int64(0, 0);
			err = $ifaceNil;
			if (!((s.charCodeAt(0) === 46) || (48 <= s.charCodeAt(0) && s.charCodeAt(0) <= 57))) {
				return [new Duration(0, 0), errors.New("time: invalid duration " + orig)];
			}
			pl = s.length;
			_tuple$1 = leadingInt(s); x = _tuple$1[0]; s = _tuple$1[1]; err = _tuple$1[2];
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				return [new Duration(0, 0), errors.New("time: invalid duration " + orig)];
			}
			g = $flatten64(x);
			pre = !((pl === s.length));
			post = false;
			if (!(s === "") && (s.charCodeAt(0) === 46)) {
				s = s.substring(1);
				pl$1 = s.length;
				_tuple$2 = leadingInt(s); x = _tuple$2[0]; s = _tuple$2[1]; err = _tuple$2[2];
				if (!($interfaceIsEqual(err, $ifaceNil))) {
					return [new Duration(0, 0), errors.New("time: invalid duration " + orig)];
				}
				scale = 1;
				n = pl$1 - s.length >> 0;
				while (n > 0) {
					scale = scale * (10);
					n = n - (1) >> 0;
				}
				g = g + ($flatten64(x) / scale);
				post = !((pl$1 === s.length));
			}
			if (!pre && !post) {
				return [new Duration(0, 0), errors.New("time: invalid duration " + orig)];
			}
			i = 0;
			while (i < s.length) {
				c$1 = s.charCodeAt(i);
				if ((c$1 === 46) || (48 <= c$1 && c$1 <= 57)) {
					break;
				}
				i = i + (1) >> 0;
			}
			if (i === 0) {
				return [new Duration(0, 0), errors.New("time: missing unit in duration " + orig)];
			}
			u = s.substring(0, i);
			s = s.substring(i);
			_tuple$3 = (_entry = unitMap[u], _entry !== undefined ? [_entry.v, true] : [0, false]); unit = _tuple$3[0]; ok = _tuple$3[1];
			if (!ok) {
				return [new Duration(0, 0), errors.New("time: unknown unit " + u + " in duration " + orig)];
			}
			f = f + (g * unit);
		}
		if (neg) {
			f = -f;
		}
		if (f < -9.223372036854776e+18 || f > 9.223372036854776e+18) {
			return [new Duration(0, 0), errors.New("time: overflow parsing duration")];
		}
		return [new Duration(0, f), $ifaceNil];
	};
	Time.Ptr.prototype.After = function(u) {
		var t, x, x$1, x$2, x$3;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (x = t.sec, x$1 = u.sec, (x.$high > x$1.$high || (x.$high === x$1.$high && x.$low > x$1.$low))) || (x$2 = t.sec, x$3 = u.sec, (x$2.$high === x$3.$high && x$2.$low === x$3.$low)) && t.nsec > u.nsec;
	};
	Time.prototype.After = function(u) { return this.$val.After(u); };
	Time.Ptr.prototype.Before = function(u) {
		var t, x, x$1, x$2, x$3;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (x = t.sec, x$1 = u.sec, (x.$high < x$1.$high || (x.$high === x$1.$high && x.$low < x$1.$low))) || (x$2 = t.sec, x$3 = u.sec, (x$2.$high === x$3.$high && x$2.$low === x$3.$low)) && t.nsec < u.nsec;
	};
	Time.prototype.Before = function(u) { return this.$val.Before(u); };
	Time.Ptr.prototype.Equal = function(u) {
		var t, x, x$1;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (x = t.sec, x$1 = u.sec, (x.$high === x$1.$high && x.$low === x$1.$low)) && (t.nsec === u.nsec);
	};
	Time.prototype.Equal = function(u) { return this.$val.Equal(u); };
	Month.prototype.String = function() {
		var m, x;
		m = this.$val !== undefined ? this.$val : this;
		return (x = m - 1 >> 0, ((x < 0 || x >= months.length) ? $throwRuntimeError("index out of range") : months[x]));
	};
	$ptrType(Month).prototype.String = function() { return new Month(this.$get()).String(); };
	Weekday.prototype.String = function() {
		var d;
		d = this.$val !== undefined ? this.$val : this;
		return ((d < 0 || d >= days.length) ? $throwRuntimeError("index out of range") : days[d]);
	};
	$ptrType(Weekday).prototype.String = function() { return new Weekday(this.$get()).String(); };
	Time.Ptr.prototype.IsZero = function() {
		var t, x;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (x = t.sec, (x.$high === 0 && x.$low === 0)) && (t.nsec === 0);
	};
	Time.prototype.IsZero = function() { return this.$val.IsZero(); };
	Time.Ptr.prototype.abs = function() {
		var t, l, x, sec, x$1, x$2, x$3, _tuple$1, offset, x$4, x$5;
		t = new Time.Ptr(); $copy(t, this, Time);
		l = t.loc;
		if (l === ($ptrType(Location)).nil || l === localLoc) {
			l = l.get();
		}
		sec = (x = t.sec, new $Int64(x.$high + -15, x.$low + 2288912640));
		if (!(l === utcLoc)) {
			if (!(l.cacheZone === ($ptrType(zone)).nil) && (x$1 = l.cacheStart, (x$1.$high < sec.$high || (x$1.$high === sec.$high && x$1.$low <= sec.$low))) && (x$2 = l.cacheEnd, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) {
				sec = (x$3 = new $Int64(0, l.cacheZone.offset), new $Int64(sec.$high + x$3.$high, sec.$low + x$3.$low));
			} else {
				_tuple$1 = l.lookup(sec); offset = _tuple$1[1];
				sec = (x$4 = new $Int64(0, offset), new $Int64(sec.$high + x$4.$high, sec.$low + x$4.$low));
			}
		}
		return (x$5 = new $Int64(sec.$high + 2147483646, sec.$low + 450480384), new $Uint64(x$5.$high, x$5.$low));
	};
	Time.prototype.abs = function() { return this.$val.abs(); };
	Time.Ptr.prototype.locabs = function() {
		var name = "", offset = 0, abs = new $Uint64(0, 0), t, l, x, sec, x$1, x$2, _tuple$1, x$3, x$4;
		t = new Time.Ptr(); $copy(t, this, Time);
		l = t.loc;
		if (l === ($ptrType(Location)).nil || l === localLoc) {
			l = l.get();
		}
		sec = (x = t.sec, new $Int64(x.$high + -15, x.$low + 2288912640));
		if (!(l === utcLoc)) {
			if (!(l.cacheZone === ($ptrType(zone)).nil) && (x$1 = l.cacheStart, (x$1.$high < sec.$high || (x$1.$high === sec.$high && x$1.$low <= sec.$low))) && (x$2 = l.cacheEnd, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) {
				name = l.cacheZone.name;
				offset = l.cacheZone.offset;
			} else {
				_tuple$1 = l.lookup(sec); name = _tuple$1[0]; offset = _tuple$1[1];
			}
			sec = (x$3 = new $Int64(0, offset), new $Int64(sec.$high + x$3.$high, sec.$low + x$3.$low));
		} else {
			name = "UTC";
		}
		abs = (x$4 = new $Int64(sec.$high + 2147483646, sec.$low + 450480384), new $Uint64(x$4.$high, x$4.$low));
		return [name, offset, abs];
	};
	Time.prototype.locabs = function() { return this.$val.locabs(); };
	Time.Ptr.prototype.Date = function() {
		var year = 0, month = 0, day = 0, t, _tuple$1;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.date(true); year = _tuple$1[0]; month = _tuple$1[1]; day = _tuple$1[2];
		return [year, month, day];
	};
	Time.prototype.Date = function() { return this.$val.Date(); };
	Time.Ptr.prototype.Year = function() {
		var t, _tuple$1, year;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.date(false); year = _tuple$1[0];
		return year;
	};
	Time.prototype.Year = function() { return this.$val.Year(); };
	Time.Ptr.prototype.Month = function() {
		var t, _tuple$1, month;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.date(true); month = _tuple$1[1];
		return month;
	};
	Time.prototype.Month = function() { return this.$val.Month(); };
	Time.Ptr.prototype.Day = function() {
		var t, _tuple$1, day;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.date(true); day = _tuple$1[2];
		return day;
	};
	Time.prototype.Day = function() { return this.$val.Day(); };
	Time.Ptr.prototype.Weekday = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		return absWeekday(t.abs());
	};
	Time.prototype.Weekday = function() { return this.$val.Weekday(); };
	absWeekday = function(abs) {
		var sec, _q;
		sec = $div64((new $Uint64(abs.$high + 0, abs.$low + 86400)), new $Uint64(0, 604800), true);
		return ((_q = (sec.$low >> 0) / 86400, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0);
	};
	Time.Ptr.prototype.ISOWeek = function() {
		var year = 0, week = 0, t, _tuple$1, month, day, yday, _r, wday, _q, _r$1, jan1wday, _r$2, dec31wday;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.date(true); year = _tuple$1[0]; month = _tuple$1[1]; day = _tuple$1[2]; yday = _tuple$1[3];
		wday = (_r = ((t.Weekday() + 6 >> 0) >> 0) % 7, _r === _r ? _r : $throwRuntimeError("integer divide by zero"));
		week = (_q = (((yday - wday >> 0) + 7 >> 0)) / 7, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		jan1wday = (_r$1 = (((wday - yday >> 0) + 371 >> 0)) % 7, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero"));
		if (1 <= jan1wday && jan1wday <= 3) {
			week = week + (1) >> 0;
		}
		if (week === 0) {
			year = year - (1) >> 0;
			week = 52;
			if ((jan1wday === 4) || ((jan1wday === 5) && isLeap(year))) {
				week = week + (1) >> 0;
			}
		}
		if ((month === 12) && day >= 29 && wday < 3) {
			dec31wday = (_r$2 = (((wday + 31 >> 0) - day >> 0)) % 7, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero"));
			if (0 <= dec31wday && dec31wday <= 2) {
				year = year + (1) >> 0;
				week = 1;
			}
		}
		return [year, week];
	};
	Time.prototype.ISOWeek = function() { return this.$val.ISOWeek(); };
	Time.Ptr.prototype.Clock = function() {
		var hour = 0, min = 0, sec = 0, t, _tuple$1;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = absClock(t.abs()); hour = _tuple$1[0]; min = _tuple$1[1]; sec = _tuple$1[2];
		return [hour, min, sec];
	};
	Time.prototype.Clock = function() { return this.$val.Clock(); };
	absClock = function(abs) {
		var hour = 0, min = 0, sec = 0, _q, _q$1;
		sec = ($div64(abs, new $Uint64(0, 86400), true).$low >> 0);
		hour = (_q = sec / 3600, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		sec = sec - (((((hour >>> 16 << 16) * 3600 >> 0) + (hour << 16 >>> 16) * 3600) >> 0)) >> 0;
		min = (_q$1 = sec / 60, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
		sec = sec - (((((min >>> 16 << 16) * 60 >> 0) + (min << 16 >>> 16) * 60) >> 0)) >> 0;
		return [hour, min, sec];
	};
	Time.Ptr.prototype.Hour = function() {
		var t, _q;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (_q = ($div64(t.abs(), new $Uint64(0, 86400), true).$low >> 0) / 3600, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
	};
	Time.prototype.Hour = function() { return this.$val.Hour(); };
	Time.Ptr.prototype.Minute = function() {
		var t, _q;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (_q = ($div64(t.abs(), new $Uint64(0, 3600), true).$low >> 0) / 60, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
	};
	Time.prototype.Minute = function() { return this.$val.Minute(); };
	Time.Ptr.prototype.Second = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		return ($div64(t.abs(), new $Uint64(0, 60), true).$low >> 0);
	};
	Time.prototype.Second = function() { return this.$val.Second(); };
	Time.Ptr.prototype.Nanosecond = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (t.nsec >> 0);
	};
	Time.prototype.Nanosecond = function() { return this.$val.Nanosecond(); };
	Time.Ptr.prototype.YearDay = function() {
		var t, _tuple$1, yday;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.date(false); yday = _tuple$1[3];
		return yday + 1 >> 0;
	};
	Time.prototype.YearDay = function() { return this.$val.YearDay(); };
	Duration.prototype.String = function() {
		var d, buf, w, u, neg, prec, unit, x, _tuple$1, _tuple$2;
		d = this;
		buf = ($arrayType($Uint8, 32)).zero(); $copy(buf, ($arrayType($Uint8, 32)).zero(), ($arrayType($Uint8, 32)));
		w = 32;
		u = new $Uint64(d.$high, d.$low);
		neg = (d.$high < 0 || (d.$high === 0 && d.$low < 0));
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000000000))) {
			prec = 0;
			unit = 0;
			if ((u.$high === 0 && u.$low === 0)) {
				return "0";
			} else if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000))) {
				prec = 0;
				unit = 110;
			} else if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000000))) {
				prec = 3;
				unit = 117;
			} else {
				prec = 6;
				unit = 109;
			}
			w = w - (2) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = unit;
			(x = w + 1 >> 0, (x < 0 || x >= buf.length) ? $throwRuntimeError("index out of range") : buf[x] = 115);
			_tuple$1 = fmtFrac($subslice(new ($sliceType($Uint8))(buf), 0, w), u, prec); w = _tuple$1[0]; u = _tuple$1[1];
			w = fmtInt($subslice(new ($sliceType($Uint8))(buf), 0, w), u);
		} else {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 115;
			_tuple$2 = fmtFrac($subslice(new ($sliceType($Uint8))(buf), 0, w), u, 9); w = _tuple$2[0]; u = _tuple$2[1];
			w = fmtInt($subslice(new ($sliceType($Uint8))(buf), 0, w), $div64(u, new $Uint64(0, 60), true));
			u = $div64(u, (new $Uint64(0, 60)), false);
			if ((u.$high > 0 || (u.$high === 0 && u.$low > 0))) {
				w = w - (1) >> 0;
				(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 109;
				w = fmtInt($subslice(new ($sliceType($Uint8))(buf), 0, w), $div64(u, new $Uint64(0, 60), true));
				u = $div64(u, (new $Uint64(0, 60)), false);
				if ((u.$high > 0 || (u.$high === 0 && u.$low > 0))) {
					w = w - (1) >> 0;
					(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 104;
					w = fmtInt($subslice(new ($sliceType($Uint8))(buf), 0, w), u);
				}
			}
		}
		if (neg) {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 45;
		}
		return $bytesToString($subslice(new ($sliceType($Uint8))(buf), w));
	};
	$ptrType(Duration).prototype.String = function() { return this.$get().String(); };
	fmtFrac = function(buf, v, prec) {
		var nw = 0, nv = new $Uint64(0, 0), w, print, i, digit, _tmp, _tmp$1;
		w = buf.$length;
		print = false;
		i = 0;
		while (i < prec) {
			digit = $div64(v, new $Uint64(0, 10), true);
			print = print || !((digit.$high === 0 && digit.$low === 0));
			if (print) {
				w = w - (1) >> 0;
				(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = (digit.$low << 24 >>> 24) + 48 << 24 >>> 24;
			}
			v = $div64(v, (new $Uint64(0, 10)), false);
			i = i + (1) >> 0;
		}
		if (print) {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 46;
		}
		_tmp = w; _tmp$1 = v; nw = _tmp; nv = _tmp$1;
		return [nw, nv];
	};
	fmtInt = function(buf, v) {
		var w;
		w = buf.$length;
		if ((v.$high === 0 && v.$low === 0)) {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 48;
		} else {
			while ((v.$high > 0 || (v.$high === 0 && v.$low > 0))) {
				w = w - (1) >> 0;
				(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = ($div64(v, new $Uint64(0, 10), true).$low << 24 >>> 24) + 48 << 24 >>> 24;
				v = $div64(v, (new $Uint64(0, 10)), false);
			}
		}
		return w;
	};
	Duration.prototype.Nanoseconds = function() {
		var d;
		d = this;
		return new $Int64(d.$high, d.$low);
	};
	$ptrType(Duration).prototype.Nanoseconds = function() { return this.$get().Nanoseconds(); };
	Duration.prototype.Seconds = function() {
		var d, sec, nsec;
		d = this;
		sec = $div64(d, new Duration(0, 1000000000), false);
		nsec = $div64(d, new Duration(0, 1000000000), true);
		return $flatten64(sec) + $flatten64(nsec) * 1e-09;
	};
	$ptrType(Duration).prototype.Seconds = function() { return this.$get().Seconds(); };
	Duration.prototype.Minutes = function() {
		var d, min, nsec;
		d = this;
		min = $div64(d, new Duration(13, 4165425152), false);
		nsec = $div64(d, new Duration(13, 4165425152), true);
		return $flatten64(min) + $flatten64(nsec) * 1.6666666666666667e-11;
	};
	$ptrType(Duration).prototype.Minutes = function() { return this.$get().Minutes(); };
	Duration.prototype.Hours = function() {
		var d, hour, nsec;
		d = this;
		hour = $div64(d, new Duration(838, 817405952), false);
		nsec = $div64(d, new Duration(838, 817405952), true);
		return $flatten64(hour) + $flatten64(nsec) * 2.777777777777778e-13;
	};
	$ptrType(Duration).prototype.Hours = function() { return this.$get().Hours(); };
	Time.Ptr.prototype.Add = function(d) {
		var t, x, x$1, x$2, x$3, nsec, x$4, x$5, x$6, x$7;
		t = new Time.Ptr(); $copy(t, this, Time);
		t.sec = (x = t.sec, x$1 = (x$2 = $div64(d, new Duration(0, 1000000000), false), new $Int64(x$2.$high, x$2.$low)), new $Int64(x.$high + x$1.$high, x.$low + x$1.$low));
		nsec = (t.nsec >> 0) + ((x$3 = $div64(d, new Duration(0, 1000000000), true), x$3.$low + ((x$3.$high >> 31) * 4294967296)) >> 0) >> 0;
		if (nsec >= 1000000000) {
			t.sec = (x$4 = t.sec, x$5 = new $Int64(0, 1), new $Int64(x$4.$high + x$5.$high, x$4.$low + x$5.$low));
			nsec = nsec - (1000000000) >> 0;
		} else if (nsec < 0) {
			t.sec = (x$6 = t.sec, x$7 = new $Int64(0, 1), new $Int64(x$6.$high - x$7.$high, x$6.$low - x$7.$low));
			nsec = nsec + (1000000000) >> 0;
		}
		t.nsec = (nsec >>> 0);
		return t;
	};
	Time.prototype.Add = function(d) { return this.$val.Add(d); };
	Time.Ptr.prototype.Sub = function(u) {
		var t, x, x$1, x$2, x$3, x$4, d;
		t = new Time.Ptr(); $copy(t, this, Time);
		d = (x = $mul64((x$1 = (x$2 = t.sec, x$3 = u.sec, new $Int64(x$2.$high - x$3.$high, x$2.$low - x$3.$low)), new Duration(x$1.$high, x$1.$low)), new Duration(0, 1000000000)), x$4 = new Duration(0, ((t.nsec >> 0) - (u.nsec >> 0) >> 0)), new Duration(x.$high + x$4.$high, x.$low + x$4.$low));
		if (u.Add(d).Equal($clone(t, Time))) {
			return d;
		} else if (t.Before($clone(u, Time))) {
			return new Duration(-2147483648, 0);
		} else {
			return new Duration(2147483647, 4294967295);
		}
	};
	Time.prototype.Sub = function(u) { return this.$val.Sub(u); };
	Time.Ptr.prototype.AddDate = function(years, months$1, days$1) {
		var t, _tuple$1, year, month, day, _tuple$2, hour, min, sec;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.Date(); year = _tuple$1[0]; month = _tuple$1[1]; day = _tuple$1[2];
		_tuple$2 = t.Clock(); hour = _tuple$2[0]; min = _tuple$2[1]; sec = _tuple$2[2];
		return Date(year + years >> 0, month + (months$1 >> 0) >> 0, day + days$1 >> 0, hour, min, sec, (t.nsec >> 0), t.loc);
	};
	Time.prototype.AddDate = function(years, months$1, days$1) { return this.$val.AddDate(years, months$1, days$1); };
	Time.Ptr.prototype.date = function(full) {
		var year = 0, month = 0, day = 0, yday = 0, t, _tuple$1;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = absDate(t.abs(), full); year = _tuple$1[0]; month = _tuple$1[1]; day = _tuple$1[2]; yday = _tuple$1[3];
		return [year, month, day, yday];
	};
	Time.prototype.date = function(full) { return this.$val.date(full); };
	absDate = function(abs, full) {
		var year = 0, month = 0, day = 0, yday = 0, d, n, y, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, x$10, _q, x$11, end, begin;
		d = $div64(abs, new $Uint64(0, 86400), false);
		n = $div64(d, new $Uint64(0, 146097), false);
		y = $mul64(new $Uint64(0, 400), n);
		d = (x = $mul64(new $Uint64(0, 146097), n), new $Uint64(d.$high - x.$high, d.$low - x.$low));
		n = $div64(d, new $Uint64(0, 36524), false);
		n = (x$1 = $shiftRightUint64(n, 2), new $Uint64(n.$high - x$1.$high, n.$low - x$1.$low));
		y = (x$2 = $mul64(new $Uint64(0, 100), n), new $Uint64(y.$high + x$2.$high, y.$low + x$2.$low));
		d = (x$3 = $mul64(new $Uint64(0, 36524), n), new $Uint64(d.$high - x$3.$high, d.$low - x$3.$low));
		n = $div64(d, new $Uint64(0, 1461), false);
		y = (x$4 = $mul64(new $Uint64(0, 4), n), new $Uint64(y.$high + x$4.$high, y.$low + x$4.$low));
		d = (x$5 = $mul64(new $Uint64(0, 1461), n), new $Uint64(d.$high - x$5.$high, d.$low - x$5.$low));
		n = $div64(d, new $Uint64(0, 365), false);
		n = (x$6 = $shiftRightUint64(n, 2), new $Uint64(n.$high - x$6.$high, n.$low - x$6.$low));
		y = (x$7 = n, new $Uint64(y.$high + x$7.$high, y.$low + x$7.$low));
		d = (x$8 = $mul64(new $Uint64(0, 365), n), new $Uint64(d.$high - x$8.$high, d.$low - x$8.$low));
		year = ((x$9 = (x$10 = new $Int64(y.$high, y.$low), new $Int64(x$10.$high + -69, x$10.$low + 4075721025)), x$9.$low + ((x$9.$high >> 31) * 4294967296)) >> 0);
		yday = (d.$low >> 0);
		if (!full) {
			return [year, month, day, yday];
		}
		day = yday;
		if (isLeap(year)) {
			if (day > 59) {
				day = day - (1) >> 0;
			} else if (day === 59) {
				month = 2;
				day = 29;
				return [year, month, day, yday];
			}
		}
		month = ((_q = day / 31, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0);
		end = ((x$11 = month + 1 >> 0, ((x$11 < 0 || x$11 >= daysBefore.length) ? $throwRuntimeError("index out of range") : daysBefore[x$11])) >> 0);
		begin = 0;
		if (day >= end) {
			month = month + (1) >> 0;
			begin = end;
		} else {
			begin = (((month < 0 || month >= daysBefore.length) ? $throwRuntimeError("index out of range") : daysBefore[month]) >> 0);
		}
		month = month + (1) >> 0;
		day = (day - begin >> 0) + 1 >> 0;
		return [year, month, day, yday];
	};
	Now = $pkg.Now = function() {
		var _tuple$1, sec, nsec;
		_tuple$1 = now(); sec = _tuple$1[0]; nsec = _tuple$1[1];
		return new Time.Ptr(new $Int64(sec.$high + 14, sec.$low + 2006054656), (nsec >>> 0), $pkg.Local);
	};
	Time.Ptr.prototype.UTC = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		t.loc = $pkg.UTC;
		return t;
	};
	Time.prototype.UTC = function() { return this.$val.UTC(); };
	Time.Ptr.prototype.Local = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		t.loc = $pkg.Local;
		return t;
	};
	Time.prototype.Local = function() { return this.$val.Local(); };
	Time.Ptr.prototype.In = function(loc) {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		if (loc === ($ptrType(Location)).nil) {
			$panic(new $String("time: missing Location in call to Time.In"));
		}
		t.loc = loc;
		return t;
	};
	Time.prototype.In = function(loc) { return this.$val.In(loc); };
	Time.Ptr.prototype.Location = function() {
		var t, l;
		t = new Time.Ptr(); $copy(t, this, Time);
		l = t.loc;
		if (l === ($ptrType(Location)).nil) {
			l = $pkg.UTC;
		}
		return l;
	};
	Time.prototype.Location = function() { return this.$val.Location(); };
	Time.Ptr.prototype.Zone = function() {
		var name = "", offset = 0, t, _tuple$1, x;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.loc.lookup((x = t.sec, new $Int64(x.$high + -15, x.$low + 2288912640))); name = _tuple$1[0]; offset = _tuple$1[1];
		return [name, offset];
	};
	Time.prototype.Zone = function() { return this.$val.Zone(); };
	Time.Ptr.prototype.Unix = function() {
		var t, x;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (x = t.sec, new $Int64(x.$high + -15, x.$low + 2288912640));
	};
	Time.prototype.Unix = function() { return this.$val.Unix(); };
	Time.Ptr.prototype.UnixNano = function() {
		var t, x, x$1, x$2, x$3;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (x = $mul64(((x$1 = t.sec, new $Int64(x$1.$high + -15, x$1.$low + 2288912640))), new $Int64(0, 1000000000)), x$2 = (x$3 = t.nsec, new $Int64(0, x$3.constructor === Number ? x$3 : 1)), new $Int64(x.$high + x$2.$high, x.$low + x$2.$low));
	};
	Time.prototype.UnixNano = function() { return this.$val.UnixNano(); };
	Time.Ptr.prototype.MarshalBinary = function() {
		var t, offsetMin, _tuple$1, offset, _r, _q, enc;
		t = new Time.Ptr(); $copy(t, this, Time);
		offsetMin = 0;
		if (t.Location() === utcLoc) {
			offsetMin = -1;
		} else {
			_tuple$1 = t.Zone(); offset = _tuple$1[1];
			if (!(((_r = offset % 60, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0))) {
				return [($sliceType($Uint8)).nil, errors.New("Time.MarshalBinary: zone offset has fractional minute")];
			}
			offset = (_q = offset / (60), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			if (offset < -32768 || (offset === -1) || offset > 32767) {
				return [($sliceType($Uint8)).nil, errors.New("Time.MarshalBinary: unexpected zone offset")];
			}
			offsetMin = (offset << 16 >> 16);
		}
		enc = new ($sliceType($Uint8))([1, ($shiftRightInt64(t.sec, 56).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 48).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 40).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 32).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 24).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 16).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 8).$low << 24 >>> 24), (t.sec.$low << 24 >>> 24), ((t.nsec >>> 24 >>> 0) << 24 >>> 24), ((t.nsec >>> 16 >>> 0) << 24 >>> 24), ((t.nsec >>> 8 >>> 0) << 24 >>> 24), (t.nsec << 24 >>> 24), ((offsetMin >> 8 << 16 >> 16) << 24 >>> 24), (offsetMin << 24 >>> 24)]);
		return [enc, $ifaceNil];
	};
	Time.prototype.MarshalBinary = function() { return this.$val.MarshalBinary(); };
	Time.Ptr.prototype.UnmarshalBinary = function(data$1) {
		var t, buf, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, x$10, x$11, x$12, x$13, x$14, offset, _tuple$1, x$15, localoff;
		t = this;
		buf = data$1;
		if (buf.$length === 0) {
			return errors.New("Time.UnmarshalBinary: no data");
		}
		if (!((((0 < 0 || 0 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 0]) === 1))) {
			return errors.New("Time.UnmarshalBinary: unsupported version");
		}
		if (!((buf.$length === 15))) {
			return errors.New("Time.UnmarshalBinary: invalid length");
		}
		buf = $subslice(buf, 1);
		t.sec = (x = (x$1 = (x$2 = (x$3 = (x$4 = (x$5 = (x$6 = new $Int64(0, ((7 < 0 || 7 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 7])), x$7 = $shiftLeft64(new $Int64(0, ((6 < 0 || 6 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 6])), 8), new $Int64(x$6.$high | x$7.$high, (x$6.$low | x$7.$low) >>> 0)), x$8 = $shiftLeft64(new $Int64(0, ((5 < 0 || 5 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 5])), 16), new $Int64(x$5.$high | x$8.$high, (x$5.$low | x$8.$low) >>> 0)), x$9 = $shiftLeft64(new $Int64(0, ((4 < 0 || 4 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 4])), 24), new $Int64(x$4.$high | x$9.$high, (x$4.$low | x$9.$low) >>> 0)), x$10 = $shiftLeft64(new $Int64(0, ((3 < 0 || 3 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 3])), 32), new $Int64(x$3.$high | x$10.$high, (x$3.$low | x$10.$low) >>> 0)), x$11 = $shiftLeft64(new $Int64(0, ((2 < 0 || 2 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 2])), 40), new $Int64(x$2.$high | x$11.$high, (x$2.$low | x$11.$low) >>> 0)), x$12 = $shiftLeft64(new $Int64(0, ((1 < 0 || 1 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 1])), 48), new $Int64(x$1.$high | x$12.$high, (x$1.$low | x$12.$low) >>> 0)), x$13 = $shiftLeft64(new $Int64(0, ((0 < 0 || 0 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 0])), 56), new $Int64(x.$high | x$13.$high, (x.$low | x$13.$low) >>> 0));
		buf = $subslice(buf, 8);
		t.nsec = (((((((3 < 0 || 3 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 3]) >> 0) | ((((2 < 0 || 2 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 2]) >> 0) << 8 >> 0)) | ((((1 < 0 || 1 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 1]) >> 0) << 16 >> 0)) | ((((0 < 0 || 0 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 0]) >> 0) << 24 >> 0)) >>> 0);
		buf = $subslice(buf, 4);
		offset = (x$14 = (((((1 < 0 || 1 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 1]) << 16 >> 16) | ((((0 < 0 || 0 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 0]) << 16 >> 16) << 8 << 16 >> 16)) >> 0), (((x$14 >>> 16 << 16) * 60 >> 0) + (x$14 << 16 >>> 16) * 60) >> 0);
		if (offset === -60) {
			t.loc = utcLoc;
		} else {
			_tuple$1 = $pkg.Local.lookup((x$15 = t.sec, new $Int64(x$15.$high + -15, x$15.$low + 2288912640))); localoff = _tuple$1[1];
			if (offset === localoff) {
				t.loc = $pkg.Local;
			} else {
				t.loc = FixedZone("", offset);
			}
		}
		return $ifaceNil;
	};
	Time.prototype.UnmarshalBinary = function(data$1) { return this.$val.UnmarshalBinary(data$1); };
	Time.Ptr.prototype.GobEncode = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		return t.MarshalBinary();
	};
	Time.prototype.GobEncode = function() { return this.$val.GobEncode(); };
	Time.Ptr.prototype.GobDecode = function(data$1) {
		var t;
		t = this;
		return t.UnmarshalBinary(data$1);
	};
	Time.prototype.GobDecode = function(data$1) { return this.$val.GobDecode(data$1); };
	Time.Ptr.prototype.MarshalJSON = function() {
		var t, y;
		t = new Time.Ptr(); $copy(t, this, Time);
		y = t.Year();
		if (y < 0 || y >= 10000) {
			return [($sliceType($Uint8)).nil, errors.New("Time.MarshalJSON: year outside of range [0,9999]")];
		}
		return [new ($sliceType($Uint8))($stringToBytes(t.Format("\"2006-01-02T15:04:05.999999999Z07:00\""))), $ifaceNil];
	};
	Time.prototype.MarshalJSON = function() { return this.$val.MarshalJSON(); };
	Time.Ptr.prototype.UnmarshalJSON = function(data$1) {
		var err = $ifaceNil, t, _tuple$1;
		t = this;
		_tuple$1 = Parse("\"2006-01-02T15:04:05Z07:00\"", $bytesToString(data$1)); $copy(t, _tuple$1[0], Time); err = _tuple$1[1];
		return err;
	};
	Time.prototype.UnmarshalJSON = function(data$1) { return this.$val.UnmarshalJSON(data$1); };
	Time.Ptr.prototype.MarshalText = function() {
		var t, y;
		t = new Time.Ptr(); $copy(t, this, Time);
		y = t.Year();
		if (y < 0 || y >= 10000) {
			return [($sliceType($Uint8)).nil, errors.New("Time.MarshalText: year outside of range [0,9999]")];
		}
		return [new ($sliceType($Uint8))($stringToBytes(t.Format("2006-01-02T15:04:05.999999999Z07:00"))), $ifaceNil];
	};
	Time.prototype.MarshalText = function() { return this.$val.MarshalText(); };
	Time.Ptr.prototype.UnmarshalText = function(data$1) {
		var err = $ifaceNil, t, _tuple$1;
		t = this;
		_tuple$1 = Parse("2006-01-02T15:04:05Z07:00", $bytesToString(data$1)); $copy(t, _tuple$1[0], Time); err = _tuple$1[1];
		return err;
	};
	Time.prototype.UnmarshalText = function(data$1) { return this.$val.UnmarshalText(data$1); };
	Unix = $pkg.Unix = function(sec, nsec) {
		var n, x, x$1, x$2, x$3;
		if ((nsec.$high < 0 || (nsec.$high === 0 && nsec.$low < 0)) || (nsec.$high > 0 || (nsec.$high === 0 && nsec.$low >= 1000000000))) {
			n = $div64(nsec, new $Int64(0, 1000000000), false);
			sec = (x = n, new $Int64(sec.$high + x.$high, sec.$low + x.$low));
			nsec = (x$1 = $mul64(n, new $Int64(0, 1000000000)), new $Int64(nsec.$high - x$1.$high, nsec.$low - x$1.$low));
			if ((nsec.$high < 0 || (nsec.$high === 0 && nsec.$low < 0))) {
				nsec = (x$2 = new $Int64(0, 1000000000), new $Int64(nsec.$high + x$2.$high, nsec.$low + x$2.$low));
				sec = (x$3 = new $Int64(0, 1), new $Int64(sec.$high - x$3.$high, sec.$low - x$3.$low));
			}
		}
		return new Time.Ptr(new $Int64(sec.$high + 14, sec.$low + 2006054656), (nsec.$low >>> 0), $pkg.Local);
	};
	isLeap = function(year) {
		var _r, _r$1, _r$2;
		return ((_r = year % 4, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0) && (!(((_r$1 = year % 100, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) === 0)) || ((_r$2 = year % 400, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")) === 0));
	};
	norm = function(hi, lo, base) {
		var nhi = 0, nlo = 0, _q, n, _q$1, n$1, _tmp, _tmp$1;
		if (lo < 0) {
			n = (_q = ((-lo - 1 >> 0)) / base, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) + 1 >> 0;
			hi = hi - (n) >> 0;
			lo = lo + (((((n >>> 16 << 16) * base >> 0) + (n << 16 >>> 16) * base) >> 0)) >> 0;
		}
		if (lo >= base) {
			n$1 = (_q$1 = lo / base, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
			hi = hi + (n$1) >> 0;
			lo = lo - (((((n$1 >>> 16 << 16) * base >> 0) + (n$1 << 16 >>> 16) * base) >> 0)) >> 0;
		}
		_tmp = hi; _tmp$1 = lo; nhi = _tmp; nlo = _tmp$1;
		return [nhi, nlo];
	};
	Date = $pkg.Date = function(year, month, day, hour, min, sec, nsec, loc) {
		var m, _tuple$1, _tuple$2, _tuple$3, _tuple$4, _tuple$5, x, x$1, y, n, x$2, d, x$3, x$4, x$5, x$6, x$7, x$8, x$9, x$10, x$11, abs, x$12, x$13, unix, _tuple$6, offset, start, end, x$14, utc, _tuple$7, _tuple$8, x$15;
		if (loc === ($ptrType(Location)).nil) {
			$panic(new $String("time: missing Location in call to Date"));
		}
		m = (month >> 0) - 1 >> 0;
		_tuple$1 = norm(year, m, 12); year = _tuple$1[0]; m = _tuple$1[1];
		month = (m >> 0) + 1 >> 0;
		_tuple$2 = norm(sec, nsec, 1000000000); sec = _tuple$2[0]; nsec = _tuple$2[1];
		_tuple$3 = norm(min, sec, 60); min = _tuple$3[0]; sec = _tuple$3[1];
		_tuple$4 = norm(hour, min, 60); hour = _tuple$4[0]; min = _tuple$4[1];
		_tuple$5 = norm(day, hour, 24); day = _tuple$5[0]; hour = _tuple$5[1];
		y = (x = (x$1 = new $Int64(0, year), new $Int64(x$1.$high - -69, x$1.$low - 4075721025)), new $Uint64(x.$high, x.$low));
		n = $div64(y, new $Uint64(0, 400), false);
		y = (x$2 = $mul64(new $Uint64(0, 400), n), new $Uint64(y.$high - x$2.$high, y.$low - x$2.$low));
		d = $mul64(new $Uint64(0, 146097), n);
		n = $div64(y, new $Uint64(0, 100), false);
		y = (x$3 = $mul64(new $Uint64(0, 100), n), new $Uint64(y.$high - x$3.$high, y.$low - x$3.$low));
		d = (x$4 = $mul64(new $Uint64(0, 36524), n), new $Uint64(d.$high + x$4.$high, d.$low + x$4.$low));
		n = $div64(y, new $Uint64(0, 4), false);
		y = (x$5 = $mul64(new $Uint64(0, 4), n), new $Uint64(y.$high - x$5.$high, y.$low - x$5.$low));
		d = (x$6 = $mul64(new $Uint64(0, 1461), n), new $Uint64(d.$high + x$6.$high, d.$low + x$6.$low));
		n = y;
		d = (x$7 = $mul64(new $Uint64(0, 365), n), new $Uint64(d.$high + x$7.$high, d.$low + x$7.$low));
		d = (x$8 = new $Uint64(0, (x$9 = month - 1 >> 0, ((x$9 < 0 || x$9 >= daysBefore.length) ? $throwRuntimeError("index out of range") : daysBefore[x$9]))), new $Uint64(d.$high + x$8.$high, d.$low + x$8.$low));
		if (isLeap(year) && month >= 3) {
			d = (x$10 = new $Uint64(0, 1), new $Uint64(d.$high + x$10.$high, d.$low + x$10.$low));
		}
		d = (x$11 = new $Uint64(0, (day - 1 >> 0)), new $Uint64(d.$high + x$11.$high, d.$low + x$11.$low));
		abs = $mul64(d, new $Uint64(0, 86400));
		abs = (x$12 = new $Uint64(0, ((((((hour >>> 16 << 16) * 3600 >> 0) + (hour << 16 >>> 16) * 3600) >> 0) + ((((min >>> 16 << 16) * 60 >> 0) + (min << 16 >>> 16) * 60) >> 0) >> 0) + sec >> 0)), new $Uint64(abs.$high + x$12.$high, abs.$low + x$12.$low));
		unix = (x$13 = new $Int64(abs.$high, abs.$low), new $Int64(x$13.$high + -2147483647, x$13.$low + 3844486912));
		_tuple$6 = loc.lookup(unix); offset = _tuple$6[1]; start = _tuple$6[3]; end = _tuple$6[4];
		if (!((offset === 0))) {
			utc = (x$14 = new $Int64(0, offset), new $Int64(unix.$high - x$14.$high, unix.$low - x$14.$low));
			if ((utc.$high < start.$high || (utc.$high === start.$high && utc.$low < start.$low))) {
				_tuple$7 = loc.lookup(new $Int64(start.$high - 0, start.$low - 1)); offset = _tuple$7[1];
			} else if ((utc.$high > end.$high || (utc.$high === end.$high && utc.$low >= end.$low))) {
				_tuple$8 = loc.lookup(end); offset = _tuple$8[1];
			}
			unix = (x$15 = new $Int64(0, offset), new $Int64(unix.$high - x$15.$high, unix.$low - x$15.$low));
		}
		return new Time.Ptr(new $Int64(unix.$high + 14, unix.$low + 2006054656), (nsec >>> 0), loc);
	};
	Time.Ptr.prototype.Truncate = function(d) {
		var t, _tuple$1, r;
		t = new Time.Ptr(); $copy(t, this, Time);
		if ((d.$high < 0 || (d.$high === 0 && d.$low <= 0))) {
			return t;
		}
		_tuple$1 = div($clone(t, Time), d); r = _tuple$1[1];
		return t.Add(new Duration(-r.$high, -r.$low));
	};
	Time.prototype.Truncate = function(d) { return this.$val.Truncate(d); };
	Time.Ptr.prototype.Round = function(d) {
		var t, _tuple$1, r, x;
		t = new Time.Ptr(); $copy(t, this, Time);
		if ((d.$high < 0 || (d.$high === 0 && d.$low <= 0))) {
			return t;
		}
		_tuple$1 = div($clone(t, Time), d); r = _tuple$1[1];
		if ((x = new Duration(r.$high + r.$high, r.$low + r.$low), (x.$high < d.$high || (x.$high === d.$high && x.$low < d.$low)))) {
			return t.Add(new Duration(-r.$high, -r.$low));
		}
		return t.Add(new Duration(d.$high - r.$high, d.$low - r.$low));
	};
	Time.prototype.Round = function(d) { return this.$val.Round(d); };
	div = function(t, d) {
		var qmod2 = 0, r = new Duration(0, 0), neg, nsec, x, x$1, x$2, x$3, x$4, x$5, _q, _r, x$6, d1, x$7, x$8, x$9, x$10, x$11, sec, tmp, u1, u0, _tmp, _tmp$1, u0x, x$12, _tmp$2, _tmp$3, x$13, x$14, d1$1, x$15, d0, _tmp$4, _tmp$5, x$16, x$17, x$18, x$19;
		neg = false;
		nsec = (t.nsec >> 0);
		if ((x = t.sec, (x.$high < 0 || (x.$high === 0 && x.$low < 0)))) {
			neg = true;
			t.sec = (x$1 = t.sec, new $Int64(-x$1.$high, -x$1.$low));
			nsec = -nsec;
			if (nsec < 0) {
				nsec = nsec + (1000000000) >> 0;
				t.sec = (x$2 = t.sec, x$3 = new $Int64(0, 1), new $Int64(x$2.$high - x$3.$high, x$2.$low - x$3.$low));
			}
		}
		if ((d.$high < 0 || (d.$high === 0 && d.$low < 1000000000)) && (x$4 = $div64(new Duration(0, 1000000000), (new Duration(d.$high + d.$high, d.$low + d.$low)), true), (x$4.$high === 0 && x$4.$low === 0))) {
			qmod2 = ((_q = nsec / ((d.$low + ((d.$high >> 31) * 4294967296)) >> 0), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0) & 1;
			r = new Duration(0, (_r = nsec % ((d.$low + ((d.$high >> 31) * 4294967296)) >> 0), _r === _r ? _r : $throwRuntimeError("integer divide by zero")));
		} else if ((x$5 = $div64(d, new Duration(0, 1000000000), true), (x$5.$high === 0 && x$5.$low === 0))) {
			d1 = (x$6 = $div64(d, new Duration(0, 1000000000), false), new $Int64(x$6.$high, x$6.$low));
			qmod2 = ((x$7 = $div64(t.sec, d1, false), x$7.$low + ((x$7.$high >> 31) * 4294967296)) >> 0) & 1;
			r = (x$8 = $mul64((x$9 = $div64(t.sec, d1, true), new Duration(x$9.$high, x$9.$low)), new Duration(0, 1000000000)), x$10 = new Duration(0, nsec), new Duration(x$8.$high + x$10.$high, x$8.$low + x$10.$low));
		} else {
			sec = (x$11 = t.sec, new $Uint64(x$11.$high, x$11.$low));
			tmp = $mul64(($shiftRightUint64(sec, 32)), new $Uint64(0, 1000000000));
			u1 = $shiftRightUint64(tmp, 32);
			u0 = $shiftLeft64(tmp, 32);
			tmp = $mul64(new $Uint64(sec.$high & 0, (sec.$low & 4294967295) >>> 0), new $Uint64(0, 1000000000));
			_tmp = u0; _tmp$1 = new $Uint64(u0.$high + tmp.$high, u0.$low + tmp.$low); u0x = _tmp; u0 = _tmp$1;
			if ((u0.$high < u0x.$high || (u0.$high === u0x.$high && u0.$low < u0x.$low))) {
				u1 = (x$12 = new $Uint64(0, 1), new $Uint64(u1.$high + x$12.$high, u1.$low + x$12.$low));
			}
			_tmp$2 = u0; _tmp$3 = (x$13 = new $Uint64(0, nsec), new $Uint64(u0.$high + x$13.$high, u0.$low + x$13.$low)); u0x = _tmp$2; u0 = _tmp$3;
			if ((u0.$high < u0x.$high || (u0.$high === u0x.$high && u0.$low < u0x.$low))) {
				u1 = (x$14 = new $Uint64(0, 1), new $Uint64(u1.$high + x$14.$high, u1.$low + x$14.$low));
			}
			d1$1 = new $Uint64(d.$high, d.$low);
			while (!((x$15 = $shiftRightUint64(d1$1, 63), (x$15.$high === 0 && x$15.$low === 1)))) {
				d1$1 = $shiftLeft64(d1$1, (1));
			}
			d0 = new $Uint64(0, 0);
			while (true) {
				qmod2 = 0;
				if ((u1.$high > d1$1.$high || (u1.$high === d1$1.$high && u1.$low > d1$1.$low)) || (u1.$high === d1$1.$high && u1.$low === d1$1.$low) && (u0.$high > d0.$high || (u0.$high === d0.$high && u0.$low >= d0.$low))) {
					qmod2 = 1;
					_tmp$4 = u0; _tmp$5 = new $Uint64(u0.$high - d0.$high, u0.$low - d0.$low); u0x = _tmp$4; u0 = _tmp$5;
					if ((u0.$high > u0x.$high || (u0.$high === u0x.$high && u0.$low > u0x.$low))) {
						u1 = (x$16 = new $Uint64(0, 1), new $Uint64(u1.$high - x$16.$high, u1.$low - x$16.$low));
					}
					u1 = (x$17 = d1$1, new $Uint64(u1.$high - x$17.$high, u1.$low - x$17.$low));
				}
				if ((d1$1.$high === 0 && d1$1.$low === 0) && (x$18 = new $Uint64(d.$high, d.$low), (d0.$high === x$18.$high && d0.$low === x$18.$low))) {
					break;
				}
				d0 = $shiftRightUint64(d0, (1));
				d0 = (x$19 = $shiftLeft64((new $Uint64(d1$1.$high & 0, (d1$1.$low & 1) >>> 0)), 63), new $Uint64(d0.$high | x$19.$high, (d0.$low | x$19.$low) >>> 0));
				d1$1 = $shiftRightUint64(d1$1, (1));
			}
			r = new Duration(u0.$high, u0.$low);
		}
		if (neg && !((r.$high === 0 && r.$low === 0))) {
			qmod2 = (qmod2 ^ (1)) >> 0;
			r = new Duration(d.$high - r.$high, d.$low - r.$low);
		}
		return [qmod2, r];
	};
	Location.Ptr.prototype.get = function() {
		var l;
		l = this;
		if (l === ($ptrType(Location)).nil) {
			return utcLoc;
		}
		if (l === localLoc) {
			localOnce.Do(initLocal);
		}
		return l;
	};
	Location.prototype.get = function() { return this.$val.get(); };
	Location.Ptr.prototype.String = function() {
		var l;
		l = this;
		return l.get().name;
	};
	Location.prototype.String = function() { return this.$val.String(); };
	FixedZone = $pkg.FixedZone = function(name, offset) {
		var l, x;
		l = new Location.Ptr(name, new ($sliceType(zone))([new zone.Ptr(name, offset, false)]), new ($sliceType(zoneTrans))([new zoneTrans.Ptr(new $Int64(-2147483648, 0), 0, false, false)]), new $Int64(-2147483648, 0), new $Int64(2147483647, 4294967295), ($ptrType(zone)).nil);
		l.cacheZone = (x = l.zone, ((0 < 0 || 0 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + 0]));
		return l;
	};
	Location.Ptr.prototype.lookup = function(sec) {
		var name = "", offset = 0, isDST = false, start = new $Int64(0, 0), end = new $Int64(0, 0), l, zone$1, x, x$1, x$2, x$3, x$4, x$5, zone$2, x$6, tx, lo, hi, _q, m, lim, x$7, x$8, zone$3;
		l = this;
		l = l.get();
		if (l.zone.$length === 0) {
			name = "UTC";
			offset = 0;
			isDST = false;
			start = new $Int64(-2147483648, 0);
			end = new $Int64(2147483647, 4294967295);
			return [name, offset, isDST, start, end];
		}
		zone$1 = l.cacheZone;
		if (!(zone$1 === ($ptrType(zone)).nil) && (x = l.cacheStart, (x.$high < sec.$high || (x.$high === sec.$high && x.$low <= sec.$low))) && (x$1 = l.cacheEnd, (sec.$high < x$1.$high || (sec.$high === x$1.$high && sec.$low < x$1.$low)))) {
			name = zone$1.name;
			offset = zone$1.offset;
			isDST = zone$1.isDST;
			start = l.cacheStart;
			end = l.cacheEnd;
			return [name, offset, isDST, start, end];
		}
		if ((l.tx.$length === 0) || (x$2 = (x$3 = l.tx, ((0 < 0 || 0 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + 0])).when, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) {
			zone$2 = (x$4 = l.zone, x$5 = l.lookupFirstZone(), ((x$5 < 0 || x$5 >= x$4.$length) ? $throwRuntimeError("index out of range") : x$4.$array[x$4.$offset + x$5]));
			name = zone$2.name;
			offset = zone$2.offset;
			isDST = zone$2.isDST;
			start = new $Int64(-2147483648, 0);
			if (l.tx.$length > 0) {
				end = (x$6 = l.tx, ((0 < 0 || 0 >= x$6.$length) ? $throwRuntimeError("index out of range") : x$6.$array[x$6.$offset + 0])).when;
			} else {
				end = new $Int64(2147483647, 4294967295);
			}
			return [name, offset, isDST, start, end];
		}
		tx = l.tx;
		end = new $Int64(2147483647, 4294967295);
		lo = 0;
		hi = tx.$length;
		while ((hi - lo >> 0) > 1) {
			m = lo + (_q = ((hi - lo >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			lim = ((m < 0 || m >= tx.$length) ? $throwRuntimeError("index out of range") : tx.$array[tx.$offset + m]).when;
			if ((sec.$high < lim.$high || (sec.$high === lim.$high && sec.$low < lim.$low))) {
				end = lim;
				hi = m;
			} else {
				lo = m;
			}
		}
		zone$3 = (x$7 = l.zone, x$8 = ((lo < 0 || lo >= tx.$length) ? $throwRuntimeError("index out of range") : tx.$array[tx.$offset + lo]).index, ((x$8 < 0 || x$8 >= x$7.$length) ? $throwRuntimeError("index out of range") : x$7.$array[x$7.$offset + x$8]));
		name = zone$3.name;
		offset = zone$3.offset;
		isDST = zone$3.isDST;
		start = ((lo < 0 || lo >= tx.$length) ? $throwRuntimeError("index out of range") : tx.$array[tx.$offset + lo]).when;
		return [name, offset, isDST, start, end];
	};
	Location.prototype.lookup = function(sec) { return this.$val.lookup(sec); };
	Location.Ptr.prototype.lookupFirstZone = function() {
		var l, x, x$1, x$2, x$3, zi, x$4, _ref, _i, zi$1, x$5;
		l = this;
		if (!l.firstZoneUsed()) {
			return 0;
		}
		if (l.tx.$length > 0 && (x = l.zone, x$1 = (x$2 = l.tx, ((0 < 0 || 0 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + 0])).index, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1])).isDST) {
			zi = ((x$3 = l.tx, ((0 < 0 || 0 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + 0])).index >> 0) - 1 >> 0;
			while (zi >= 0) {
				if (!(x$4 = l.zone, ((zi < 0 || zi >= x$4.$length) ? $throwRuntimeError("index out of range") : x$4.$array[x$4.$offset + zi])).isDST) {
					return zi;
				}
				zi = zi - (1) >> 0;
			}
		}
		_ref = l.zone;
		_i = 0;
		while (_i < _ref.$length) {
			zi$1 = _i;
			if (!(x$5 = l.zone, ((zi$1 < 0 || zi$1 >= x$5.$length) ? $throwRuntimeError("index out of range") : x$5.$array[x$5.$offset + zi$1])).isDST) {
				return zi$1;
			}
			_i++;
		}
		return 0;
	};
	Location.prototype.lookupFirstZone = function() { return this.$val.lookupFirstZone(); };
	Location.Ptr.prototype.firstZoneUsed = function() {
		var l, _ref, _i, tx;
		l = this;
		_ref = l.tx;
		_i = 0;
		while (_i < _ref.$length) {
			tx = new zoneTrans.Ptr(); $copy(tx, ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), zoneTrans);
			if (tx.index === 0) {
				return true;
			}
			_i++;
		}
		return false;
	};
	Location.prototype.firstZoneUsed = function() { return this.$val.firstZoneUsed(); };
	Location.Ptr.prototype.lookupName = function(name, unix) {
		var offset = 0, isDST = false, ok = false, l, _ref, _i, i, x, zone$1, _tuple$1, x$1, nam, offset$1, isDST$1, _tmp, _tmp$1, _tmp$2, _ref$1, _i$1, i$1, x$2, zone$2, _tmp$3, _tmp$4, _tmp$5;
		l = this;
		l = l.get();
		_ref = l.zone;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			zone$1 = (x = l.zone, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (zone$1.name === name) {
				_tuple$1 = l.lookup((x$1 = new $Int64(0, zone$1.offset), new $Int64(unix.$high - x$1.$high, unix.$low - x$1.$low))); nam = _tuple$1[0]; offset$1 = _tuple$1[1]; isDST$1 = _tuple$1[2];
				if (nam === zone$1.name) {
					_tmp = offset$1; _tmp$1 = isDST$1; _tmp$2 = true; offset = _tmp; isDST = _tmp$1; ok = _tmp$2;
					return [offset, isDST, ok];
				}
			}
			_i++;
		}
		_ref$1 = l.zone;
		_i$1 = 0;
		while (_i$1 < _ref$1.$length) {
			i$1 = _i$1;
			zone$2 = (x$2 = l.zone, ((i$1 < 0 || i$1 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + i$1]));
			if (zone$2.name === name) {
				_tmp$3 = zone$2.offset; _tmp$4 = zone$2.isDST; _tmp$5 = true; offset = _tmp$3; isDST = _tmp$4; ok = _tmp$5;
				return [offset, isDST, ok];
			}
			_i$1++;
		}
		return [offset, isDST, ok];
	};
	Location.prototype.lookupName = function(name, unix) { return this.$val.lookupName(name, unix); };
	$pkg.$init = function() {
		($ptrType(ParseError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		ParseError.init([["Layout", "Layout", "", $String, ""], ["Value", "Value", "", $String, ""], ["LayoutElem", "LayoutElem", "", $String, ""], ["ValueElem", "ValueElem", "", $String, ""], ["Message", "Message", "", $String, ""]]);
		Time.methods = [["Add", "Add", "", $funcType([Duration], [Time], false), -1], ["AddDate", "AddDate", "", $funcType([$Int, $Int, $Int], [Time], false), -1], ["After", "After", "", $funcType([Time], [$Bool], false), -1], ["Before", "Before", "", $funcType([Time], [$Bool], false), -1], ["Clock", "Clock", "", $funcType([], [$Int, $Int, $Int], false), -1], ["Date", "Date", "", $funcType([], [$Int, Month, $Int], false), -1], ["Day", "Day", "", $funcType([], [$Int], false), -1], ["Equal", "Equal", "", $funcType([Time], [$Bool], false), -1], ["Format", "Format", "", $funcType([$String], [$String], false), -1], ["GobEncode", "GobEncode", "", $funcType([], [($sliceType($Uint8)), $error], false), -1], ["Hour", "Hour", "", $funcType([], [$Int], false), -1], ["ISOWeek", "ISOWeek", "", $funcType([], [$Int, $Int], false), -1], ["In", "In", "", $funcType([($ptrType(Location))], [Time], false), -1], ["IsZero", "IsZero", "", $funcType([], [$Bool], false), -1], ["Local", "Local", "", $funcType([], [Time], false), -1], ["Location", "Location", "", $funcType([], [($ptrType(Location))], false), -1], ["MarshalBinary", "MarshalBinary", "", $funcType([], [($sliceType($Uint8)), $error], false), -1], ["MarshalJSON", "MarshalJSON", "", $funcType([], [($sliceType($Uint8)), $error], false), -1], ["MarshalText", "MarshalText", "", $funcType([], [($sliceType($Uint8)), $error], false), -1], ["Minute", "Minute", "", $funcType([], [$Int], false), -1], ["Month", "Month", "", $funcType([], [Month], false), -1], ["Nanosecond", "Nanosecond", "", $funcType([], [$Int], false), -1], ["Round", "Round", "", $funcType([Duration], [Time], false), -1], ["Second", "Second", "", $funcType([], [$Int], false), -1], ["String", "String", "", $funcType([], [$String], false), -1], ["Sub", "Sub", "", $funcType([Time], [Duration], false), -1], ["Truncate", "Truncate", "", $funcType([Duration], [Time], false), -1], ["UTC", "UTC", "", $funcType([], [Time], false), -1], ["Unix", "Unix", "", $funcType([], [$Int64], false), -1], ["UnixNano", "UnixNano", "", $funcType([], [$Int64], false), -1], ["Weekday", "Weekday", "", $funcType([], [Weekday], false), -1], ["Year", "Year", "", $funcType([], [$Int], false), -1], ["YearDay", "YearDay", "", $funcType([], [$Int], false), -1], ["Zone", "Zone", "", $funcType([], [$String, $Int], false), -1], ["abs", "abs", "time", $funcType([], [$Uint64], false), -1], ["date", "date", "time", $funcType([$Bool], [$Int, Month, $Int, $Int], false), -1], ["locabs", "locabs", "time", $funcType([], [$String, $Int, $Uint64], false), -1]];
		($ptrType(Time)).methods = [["Add", "Add", "", $funcType([Duration], [Time], false), -1], ["AddDate", "AddDate", "", $funcType([$Int, $Int, $Int], [Time], false), -1], ["After", "After", "", $funcType([Time], [$Bool], false), -1], ["Before", "Before", "", $funcType([Time], [$Bool], false), -1], ["Clock", "Clock", "", $funcType([], [$Int, $Int, $Int], false), -1], ["Date", "Date", "", $funcType([], [$Int, Month, $Int], false), -1], ["Day", "Day", "", $funcType([], [$Int], false), -1], ["Equal", "Equal", "", $funcType([Time], [$Bool], false), -1], ["Format", "Format", "", $funcType([$String], [$String], false), -1], ["GobDecode", "GobDecode", "", $funcType([($sliceType($Uint8))], [$error], false), -1], ["GobEncode", "GobEncode", "", $funcType([], [($sliceType($Uint8)), $error], false), -1], ["Hour", "Hour", "", $funcType([], [$Int], false), -1], ["ISOWeek", "ISOWeek", "", $funcType([], [$Int, $Int], false), -1], ["In", "In", "", $funcType([($ptrType(Location))], [Time], false), -1], ["IsZero", "IsZero", "", $funcType([], [$Bool], false), -1], ["Local", "Local", "", $funcType([], [Time], false), -1], ["Location", "Location", "", $funcType([], [($ptrType(Location))], false), -1], ["MarshalBinary", "MarshalBinary", "", $funcType([], [($sliceType($Uint8)), $error], false), -1], ["MarshalJSON", "MarshalJSON", "", $funcType([], [($sliceType($Uint8)), $error], false), -1], ["MarshalText", "MarshalText", "", $funcType([], [($sliceType($Uint8)), $error], false), -1], ["Minute", "Minute", "", $funcType([], [$Int], false), -1], ["Month", "Month", "", $funcType([], [Month], false), -1], ["Nanosecond", "Nanosecond", "", $funcType([], [$Int], false), -1], ["Round", "Round", "", $funcType([Duration], [Time], false), -1], ["Second", "Second", "", $funcType([], [$Int], false), -1], ["String", "String", "", $funcType([], [$String], false), -1], ["Sub", "Sub", "", $funcType([Time], [Duration], false), -1], ["Truncate", "Truncate", "", $funcType([Duration], [Time], false), -1], ["UTC", "UTC", "", $funcType([], [Time], false), -1], ["Unix", "Unix", "", $funcType([], [$Int64], false), -1], ["UnixNano", "UnixNano", "", $funcType([], [$Int64], false), -1], ["UnmarshalBinary", "UnmarshalBinary", "", $funcType([($sliceType($Uint8))], [$error], false), -1], ["UnmarshalJSON", "UnmarshalJSON", "", $funcType([($sliceType($Uint8))], [$error], false), -1], ["UnmarshalText", "UnmarshalText", "", $funcType([($sliceType($Uint8))], [$error], false), -1], ["Weekday", "Weekday", "", $funcType([], [Weekday], false), -1], ["Year", "Year", "", $funcType([], [$Int], false), -1], ["YearDay", "YearDay", "", $funcType([], [$Int], false), -1], ["Zone", "Zone", "", $funcType([], [$String, $Int], false), -1], ["abs", "abs", "time", $funcType([], [$Uint64], false), -1], ["date", "date", "time", $funcType([$Bool], [$Int, Month, $Int, $Int], false), -1], ["locabs", "locabs", "time", $funcType([], [$String, $Int, $Uint64], false), -1]];
		Time.init([["sec", "sec", "time", $Int64, ""], ["nsec", "nsec", "time", $Uintptr, ""], ["loc", "loc", "time", ($ptrType(Location)), ""]]);
		Month.methods = [["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(Month)).methods = [["String", "String", "", $funcType([], [$String], false), -1]];
		Weekday.methods = [["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(Weekday)).methods = [["String", "String", "", $funcType([], [$String], false), -1]];
		Duration.methods = [["Hours", "Hours", "", $funcType([], [$Float64], false), -1], ["Minutes", "Minutes", "", $funcType([], [$Float64], false), -1], ["Nanoseconds", "Nanoseconds", "", $funcType([], [$Int64], false), -1], ["Seconds", "Seconds", "", $funcType([], [$Float64], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(Duration)).methods = [["Hours", "Hours", "", $funcType([], [$Float64], false), -1], ["Minutes", "Minutes", "", $funcType([], [$Float64], false), -1], ["Nanoseconds", "Nanoseconds", "", $funcType([], [$Int64], false), -1], ["Seconds", "Seconds", "", $funcType([], [$Float64], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(Location)).methods = [["String", "String", "", $funcType([], [$String], false), -1], ["firstZoneUsed", "firstZoneUsed", "time", $funcType([], [$Bool], false), -1], ["get", "get", "time", $funcType([], [($ptrType(Location))], false), -1], ["lookup", "lookup", "time", $funcType([$Int64], [$String, $Int, $Bool, $Int64, $Int64], false), -1], ["lookupFirstZone", "lookupFirstZone", "time", $funcType([], [$Int], false), -1], ["lookupName", "lookupName", "time", $funcType([$String, $Int64], [$Int, $Bool, $Bool], false), -1]];
		Location.init([["name", "name", "time", $String, ""], ["zone", "zone", "time", ($sliceType(zone)), ""], ["tx", "tx", "time", ($sliceType(zoneTrans)), ""], ["cacheStart", "cacheStart", "time", $Int64, ""], ["cacheEnd", "cacheEnd", "time", $Int64, ""], ["cacheZone", "cacheZone", "time", ($ptrType(zone)), ""]]);
		zone.init([["name", "name", "time", $String, ""], ["offset", "offset", "time", $Int, ""], ["isDST", "isDST", "time", $Bool, ""]]);
		zoneTrans.init([["when", "when", "time", $Int64, ""], ["index", "index", "time", $Uint8, ""], ["isstd", "isstd", "time", $Bool, ""], ["isutc", "isutc", "time", $Bool, ""]]);
		localLoc = new Location.Ptr();
		localOnce = new sync.Once.Ptr();
		std0x = $toNativeArray("Int", [260, 265, 524, 526, 528, 274]);
		longDayNames = new ($sliceType($String))(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
		shortDayNames = new ($sliceType($String))(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
		shortMonthNames = new ($sliceType($String))(["---", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
		longMonthNames = new ($sliceType($String))(["---", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
		atoiError = errors.New("time: invalid number");
		errBad = errors.New("bad value for field");
		errLeadingInt = errors.New("time: bad [0-9]*");
		months = $toNativeArray("String", ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
		days = $toNativeArray("String", ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
		unitMap = (_map = new $Map(), _key = "ns", _map[_key] = { k: _key, v: 1 }, _key = "us", _map[_key] = { k: _key, v: 1000 }, _key = "\xC2\xB5s", _map[_key] = { k: _key, v: 1000 }, _key = "\xCE\xBCs", _map[_key] = { k: _key, v: 1000 }, _key = "ms", _map[_key] = { k: _key, v: 1e+06 }, _key = "s", _map[_key] = { k: _key, v: 1e+09 }, _key = "m", _map[_key] = { k: _key, v: 6e+10 }, _key = "h", _map[_key] = { k: _key, v: 3.6e+12 }, _map);
		daysBefore = $toNativeArray("Int32", [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]);
		utcLoc = new Location.Ptr("UTC", ($sliceType(zone)).nil, ($sliceType(zoneTrans)).nil, new $Int64(0, 0), new $Int64(0, 0), ($ptrType(zone)).nil);
		$pkg.UTC = utcLoc;
		$pkg.Local = localLoc;
		_tuple = syscall.Getenv("ZONEINFO"); zoneinfo = _tuple[0];
		badData = errors.New("malformed time zone information");
		zoneDirs = new ($sliceType($String))(["/usr/share/zoneinfo/", "/usr/share/lib/zoneinfo/", "/usr/lib/locale/TZ/", runtime.GOROOT() + "/lib/time/zoneinfo.zip"]);
	};
	return $pkg;
})();
$packages["os"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], io = $packages["io"], syscall = $packages["syscall"], time = $packages["time"], errors = $packages["errors"], runtime = $packages["runtime"], atomic = $packages["sync/atomic"], sync = $packages["sync"], PathError, SyscallError, LinkError, File, file, dirInfo, FileInfo, FileMode, fileStat, lstat, useSyscallwd, supportsCloseOnExec, init, NewSyscallError, IsNotExist, isNotExist, sigpipe, syscallMode, NewFile, epipecheck, Lstat, basename, init$1, useSyscallwdDarwin, Exit, fileInfoFromStat, timespecToTime, init$2;
	PathError = $pkg.PathError = $newType(0, "Struct", "os.PathError", "PathError", "os", function(Op_, Path_, Err_) {
		this.$val = this;
		this.Op = Op_ !== undefined ? Op_ : "";
		this.Path = Path_ !== undefined ? Path_ : "";
		this.Err = Err_ !== undefined ? Err_ : $ifaceNil;
	});
	SyscallError = $pkg.SyscallError = $newType(0, "Struct", "os.SyscallError", "SyscallError", "os", function(Syscall_, Err_) {
		this.$val = this;
		this.Syscall = Syscall_ !== undefined ? Syscall_ : "";
		this.Err = Err_ !== undefined ? Err_ : $ifaceNil;
	});
	LinkError = $pkg.LinkError = $newType(0, "Struct", "os.LinkError", "LinkError", "os", function(Op_, Old_, New_, Err_) {
		this.$val = this;
		this.Op = Op_ !== undefined ? Op_ : "";
		this.Old = Old_ !== undefined ? Old_ : "";
		this.New = New_ !== undefined ? New_ : "";
		this.Err = Err_ !== undefined ? Err_ : $ifaceNil;
	});
	File = $pkg.File = $newType(0, "Struct", "os.File", "File", "os", function(file_) {
		this.$val = this;
		this.file = file_ !== undefined ? file_ : ($ptrType(file)).nil;
	});
	file = $pkg.file = $newType(0, "Struct", "os.file", "file", "os", function(fd_, name_, dirinfo_, nepipe_) {
		this.$val = this;
		this.fd = fd_ !== undefined ? fd_ : 0;
		this.name = name_ !== undefined ? name_ : "";
		this.dirinfo = dirinfo_ !== undefined ? dirinfo_ : ($ptrType(dirInfo)).nil;
		this.nepipe = nepipe_ !== undefined ? nepipe_ : 0;
	});
	dirInfo = $pkg.dirInfo = $newType(0, "Struct", "os.dirInfo", "dirInfo", "os", function(buf_, nbuf_, bufp_) {
		this.$val = this;
		this.buf = buf_ !== undefined ? buf_ : ($sliceType($Uint8)).nil;
		this.nbuf = nbuf_ !== undefined ? nbuf_ : 0;
		this.bufp = bufp_ !== undefined ? bufp_ : 0;
	});
	FileInfo = $pkg.FileInfo = $newType(8, "Interface", "os.FileInfo", "FileInfo", "os", null);
	FileMode = $pkg.FileMode = $newType(4, "Uint32", "os.FileMode", "FileMode", "os", null);
	fileStat = $pkg.fileStat = $newType(0, "Struct", "os.fileStat", "fileStat", "os", function(name_, size_, mode_, modTime_, sys_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : "";
		this.size = size_ !== undefined ? size_ : new $Int64(0, 0);
		this.mode = mode_ !== undefined ? mode_ : 0;
		this.modTime = modTime_ !== undefined ? modTime_ : new time.Time.Ptr();
		this.sys = sys_ !== undefined ? sys_ : $ifaceNil;
	});
	init = function() {
		var process, args, i;
		process = $global.process;
		if (process === undefined) {
			$pkg.Args = new ($sliceType($String))(["browser"]);
			return;
		}
		args = process.argv;
		$pkg.Args = ($sliceType($String)).make(($parseInt(args.length) - 1 >> 0));
		i = 0;
		while (i < ($parseInt(args.length) - 1 >> 0)) {
			(i < 0 || i >= $pkg.Args.$length) ? $throwRuntimeError("index out of range") : $pkg.Args.$array[$pkg.Args.$offset + i] = $internalize(args[(i + 1 >> 0)], $String);
			i = i + (1) >> 0;
		}
	};
	File.Ptr.prototype.readdirnames = function(n) {
		var names = ($sliceType($String)).nil, err = $ifaceNil, f, d, size, errno, _tuple, _tmp, _tmp$1, _tmp$2, _tmp$3, nb, nc, _tuple$1, _tmp$4, _tmp$5, _tmp$6, _tmp$7;
		f = this;
		if (f.file.dirinfo === ($ptrType(dirInfo)).nil) {
			f.file.dirinfo = new dirInfo.Ptr();
			f.file.dirinfo.buf = ($sliceType($Uint8)).make(4096);
		}
		d = f.file.dirinfo;
		size = n;
		if (size <= 0) {
			size = 100;
			n = -1;
		}
		names = ($sliceType($String)).make(0, size);
		while (!((n === 0))) {
			if (d.bufp >= d.nbuf) {
				d.bufp = 0;
				errno = $ifaceNil;
				_tuple = syscall.ReadDirent(f.file.fd, d.buf); d.nbuf = _tuple[0]; errno = _tuple[1];
				if (!($interfaceIsEqual(errno, $ifaceNil))) {
					_tmp = names; _tmp$1 = NewSyscallError("readdirent", errno); names = _tmp; err = _tmp$1;
					return [names, err];
				}
				if (d.nbuf <= 0) {
					break;
				}
			}
			_tmp$2 = 0; _tmp$3 = 0; nb = _tmp$2; nc = _tmp$3;
			_tuple$1 = syscall.ParseDirent($subslice(d.buf, d.bufp, d.nbuf), n, names); nb = _tuple$1[0]; nc = _tuple$1[1]; names = _tuple$1[2];
			d.bufp = d.bufp + (nb) >> 0;
			n = n - (nc) >> 0;
		}
		if (n >= 0 && (names.$length === 0)) {
			_tmp$4 = names; _tmp$5 = io.EOF; names = _tmp$4; err = _tmp$5;
			return [names, err];
		}
		_tmp$6 = names; _tmp$7 = $ifaceNil; names = _tmp$6; err = _tmp$7;
		return [names, err];
	};
	File.prototype.readdirnames = function(n) { return this.$val.readdirnames(n); };
	File.Ptr.prototype.Readdir = function(n) {
		var fi = ($sliceType(FileInfo)).nil, err = $ifaceNil, f, _tmp, _tmp$1, _tuple;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = ($sliceType(FileInfo)).nil; _tmp$1 = $pkg.ErrInvalid; fi = _tmp; err = _tmp$1;
			return [fi, err];
		}
		_tuple = f.readdir(n); fi = _tuple[0]; err = _tuple[1];
		return [fi, err];
	};
	File.prototype.Readdir = function(n) { return this.$val.Readdir(n); };
	File.Ptr.prototype.Readdirnames = function(n) {
		var names = ($sliceType($String)).nil, err = $ifaceNil, f, _tmp, _tmp$1, _tuple;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = ($sliceType($String)).nil; _tmp$1 = $pkg.ErrInvalid; names = _tmp; err = _tmp$1;
			return [names, err];
		}
		_tuple = f.readdirnames(n); names = _tuple[0]; err = _tuple[1];
		return [names, err];
	};
	File.prototype.Readdirnames = function(n) { return this.$val.Readdirnames(n); };
	PathError.Ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.Op + " " + e.Path + ": " + e.Err.Error();
	};
	PathError.prototype.Error = function() { return this.$val.Error(); };
	SyscallError.Ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.Syscall + ": " + e.Err.Error();
	};
	SyscallError.prototype.Error = function() { return this.$val.Error(); };
	NewSyscallError = $pkg.NewSyscallError = function(syscall$1, err) {
		if ($interfaceIsEqual(err, $ifaceNil)) {
			return $ifaceNil;
		}
		return new SyscallError.Ptr(syscall$1, err);
	};
	IsNotExist = $pkg.IsNotExist = function(err) {
		return isNotExist(err);
	};
	isNotExist = function(err) {
		var pe, _ref;
		_ref = err;
		if (_ref === $ifaceNil) {
			pe = _ref;
			return false;
		} else if ($assertType(_ref, ($ptrType(PathError)), true)[1]) {
			pe = _ref.$val;
			err = pe.Err;
		} else if ($assertType(_ref, ($ptrType(LinkError)), true)[1]) {
			pe = _ref.$val;
			err = pe.Err;
		}
		return $interfaceIsEqual(err, new syscall.Errno(2)) || $interfaceIsEqual(err, $pkg.ErrNotExist);
	};
	File.Ptr.prototype.Name = function() {
		var f;
		f = this;
		return f.file.name;
	};
	File.prototype.Name = function() { return this.$val.Name(); };
	LinkError.Ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.Op + " " + e.Old + " " + e.New + ": " + e.Err.Error();
	};
	LinkError.prototype.Error = function() { return this.$val.Error(); };
	File.Ptr.prototype.Read = function(b) {
		var n = 0, err = $ifaceNil, f, _tmp, _tmp$1, _tuple, e, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		_tuple = f.read(b); n = _tuple[0]; e = _tuple[1];
		if (n < 0) {
			n = 0;
		}
		if ((n === 0) && b.$length > 0 && $interfaceIsEqual(e, $ifaceNil)) {
			_tmp$2 = 0; _tmp$3 = io.EOF; n = _tmp$2; err = _tmp$3;
			return [n, err];
		}
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			err = new PathError.Ptr("read", f.file.name, e);
		}
		_tmp$4 = n; _tmp$5 = err; n = _tmp$4; err = _tmp$5;
		return [n, err];
	};
	File.prototype.Read = function(b) { return this.$val.Read(b); };
	File.Ptr.prototype.ReadAt = function(b, off) {
		var n = 0, err = $ifaceNil, f, _tmp, _tmp$1, _tuple, m, e, _tmp$2, _tmp$3, x;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		while (b.$length > 0) {
			_tuple = f.pread(b, off); m = _tuple[0]; e = _tuple[1];
			if ((m === 0) && $interfaceIsEqual(e, $ifaceNil)) {
				_tmp$2 = n; _tmp$3 = io.EOF; n = _tmp$2; err = _tmp$3;
				return [n, err];
			}
			if (!($interfaceIsEqual(e, $ifaceNil))) {
				err = new PathError.Ptr("read", f.file.name, e);
				break;
			}
			n = n + (m) >> 0;
			b = $subslice(b, m);
			off = (x = new $Int64(0, m), new $Int64(off.$high + x.$high, off.$low + x.$low));
		}
		return [n, err];
	};
	File.prototype.ReadAt = function(b, off) { return this.$val.ReadAt(b, off); };
	File.Ptr.prototype.Write = function(b) {
		var n = 0, err = $ifaceNil, f, _tmp, _tmp$1, _tuple, e, _tmp$2, _tmp$3;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		_tuple = f.write(b); n = _tuple[0]; e = _tuple[1];
		if (n < 0) {
			n = 0;
		}
		if (!((n === b.$length))) {
			err = io.ErrShortWrite;
		}
		epipecheck(f, e);
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			err = new PathError.Ptr("write", f.file.name, e);
		}
		_tmp$2 = n; _tmp$3 = err; n = _tmp$2; err = _tmp$3;
		return [n, err];
	};
	File.prototype.Write = function(b) { return this.$val.Write(b); };
	File.Ptr.prototype.WriteAt = function(b, off) {
		var n = 0, err = $ifaceNil, f, _tmp, _tmp$1, _tuple, m, e, x;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		while (b.$length > 0) {
			_tuple = f.pwrite(b, off); m = _tuple[0]; e = _tuple[1];
			if (!($interfaceIsEqual(e, $ifaceNil))) {
				err = new PathError.Ptr("write", f.file.name, e);
				break;
			}
			n = n + (m) >> 0;
			b = $subslice(b, m);
			off = (x = new $Int64(0, m), new $Int64(off.$high + x.$high, off.$low + x.$low));
		}
		return [n, err];
	};
	File.prototype.WriteAt = function(b, off) { return this.$val.WriteAt(b, off); };
	File.Ptr.prototype.Seek = function(offset, whence) {
		var ret = new $Int64(0, 0), err = $ifaceNil, f, _tmp, _tmp$1, _tuple, r, e, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = new $Int64(0, 0); _tmp$1 = $pkg.ErrInvalid; ret = _tmp; err = _tmp$1;
			return [ret, err];
		}
		_tuple = f.seek(offset, whence); r = _tuple[0]; e = _tuple[1];
		if ($interfaceIsEqual(e, $ifaceNil) && !(f.file.dirinfo === ($ptrType(dirInfo)).nil) && !((r.$high === 0 && r.$low === 0))) {
			e = new syscall.Errno(21);
		}
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			_tmp$2 = new $Int64(0, 0); _tmp$3 = new PathError.Ptr("seek", f.file.name, e); ret = _tmp$2; err = _tmp$3;
			return [ret, err];
		}
		_tmp$4 = r; _tmp$5 = $ifaceNil; ret = _tmp$4; err = _tmp$5;
		return [ret, err];
	};
	File.prototype.Seek = function(offset, whence) { return this.$val.Seek(offset, whence); };
	File.Ptr.prototype.WriteString = function(s) {
		var ret = 0, err = $ifaceNil, f, _tmp, _tmp$1, _tuple;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; ret = _tmp; err = _tmp$1;
			return [ret, err];
		}
		_tuple = f.Write(new ($sliceType($Uint8))($stringToBytes(s))); ret = _tuple[0]; err = _tuple[1];
		return [ret, err];
	};
	File.prototype.WriteString = function(s) { return this.$val.WriteString(s); };
	File.Ptr.prototype.Chdir = function() {
		var f, e;
		f = this;
		if (f === ($ptrType(File)).nil) {
			return $pkg.ErrInvalid;
		}
		e = syscall.Fchdir(f.file.fd);
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			return new PathError.Ptr("chdir", f.file.name, e);
		}
		return $ifaceNil;
	};
	File.prototype.Chdir = function() { return this.$val.Chdir(); };
	sigpipe = function() {
		$panic("Native function not implemented: os.sigpipe");
	};
	syscallMode = function(i) {
		var o = 0;
		o = (o | (((new FileMode(i)).Perm() >>> 0))) >>> 0;
		if (!((((i & 8388608) >>> 0) === 0))) {
			o = (o | (2048)) >>> 0;
		}
		if (!((((i & 4194304) >>> 0) === 0))) {
			o = (o | (1024)) >>> 0;
		}
		if (!((((i & 1048576) >>> 0) === 0))) {
			o = (o | (512)) >>> 0;
		}
		return o;
	};
	File.Ptr.prototype.Chmod = function(mode) {
		var f, e;
		f = this;
		if (f === ($ptrType(File)).nil) {
			return $pkg.ErrInvalid;
		}
		e = syscall.Fchmod(f.file.fd, syscallMode(mode));
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			return new PathError.Ptr("chmod", f.file.name, e);
		}
		return $ifaceNil;
	};
	File.prototype.Chmod = function(mode) { return this.$val.Chmod(mode); };
	File.Ptr.prototype.Chown = function(uid, gid) {
		var f, e;
		f = this;
		if (f === ($ptrType(File)).nil) {
			return $pkg.ErrInvalid;
		}
		e = syscall.Fchown(f.file.fd, uid, gid);
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			return new PathError.Ptr("chown", f.file.name, e);
		}
		return $ifaceNil;
	};
	File.prototype.Chown = function(uid, gid) { return this.$val.Chown(uid, gid); };
	File.Ptr.prototype.Truncate = function(size) {
		var f, e;
		f = this;
		if (f === ($ptrType(File)).nil) {
			return $pkg.ErrInvalid;
		}
		e = syscall.Ftruncate(f.file.fd, size);
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			return new PathError.Ptr("truncate", f.file.name, e);
		}
		return $ifaceNil;
	};
	File.prototype.Truncate = function(size) { return this.$val.Truncate(size); };
	File.Ptr.prototype.Sync = function() {
		var err = $ifaceNil, f, e;
		f = this;
		if (f === ($ptrType(File)).nil) {
			err = $pkg.ErrInvalid;
			return err;
		}
		e = syscall.Fsync(f.file.fd);
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			err = NewSyscallError("fsync", e);
			return err;
		}
		err = $ifaceNil;
		return err;
	};
	File.prototype.Sync = function() { return this.$val.Sync(); };
	File.Ptr.prototype.Fd = function() {
		var f;
		f = this;
		if (f === ($ptrType(File)).nil) {
			return 4294967295;
		}
		return (f.file.fd >>> 0);
	};
	File.prototype.Fd = function() { return this.$val.Fd(); };
	NewFile = $pkg.NewFile = function(fd, name) {
		var fdi, f;
		fdi = (fd >> 0);
		if (fdi < 0) {
			return ($ptrType(File)).nil;
		}
		f = new File.Ptr(new file.Ptr(fdi, name, ($ptrType(dirInfo)).nil, 0));
		runtime.SetFinalizer(f.file, new ($funcType([($ptrType(file))], [$error], false))($methodExpr(($ptrType(file)).prototype.close)));
		return f;
	};
	epipecheck = function(file$1, e) {
		if ($interfaceIsEqual(e, new syscall.Errno(32))) {
			if (atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.file.nepipe; }, function($v) { this.$target.file.nepipe = $v; }, file$1), 1) >= 10) {
				sigpipe();
			}
		} else {
			atomic.StoreInt32(new ($ptrType($Int32))(function() { return this.$target.file.nepipe; }, function($v) { this.$target.file.nepipe = $v; }, file$1), 0);
		}
	};
	File.Ptr.prototype.Close = function() {
		var f;
		f = this;
		if (f === ($ptrType(File)).nil) {
			return $pkg.ErrInvalid;
		}
		return f.file.close();
	};
	File.prototype.Close = function() { return this.$val.Close(); };
	file.Ptr.prototype.close = function() {
		var file$1, err, e;
		file$1 = this;
		if (file$1 === ($ptrType(file)).nil || file$1.fd < 0) {
			return new syscall.Errno(22);
		}
		err = $ifaceNil;
		e = syscall.Close(file$1.fd);
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			err = new PathError.Ptr("close", file$1.name, e);
		}
		file$1.fd = -1;
		runtime.SetFinalizer(file$1, $ifaceNil);
		return err;
	};
	file.prototype.close = function() { return this.$val.close(); };
	File.Ptr.prototype.Stat = function() {
		var fi = $ifaceNil, err = $ifaceNil, f, _tmp, _tmp$1, stat, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = $ifaceNil; _tmp$1 = $pkg.ErrInvalid; fi = _tmp; err = _tmp$1;
			return [fi, err];
		}
		stat = new syscall.Stat_t.Ptr(); $copy(stat, new syscall.Stat_t.Ptr(), syscall.Stat_t);
		err = syscall.Fstat(f.file.fd, stat);
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp$2 = $ifaceNil; _tmp$3 = new PathError.Ptr("stat", f.file.name, err); fi = _tmp$2; err = _tmp$3;
			return [fi, err];
		}
		_tmp$4 = fileInfoFromStat(stat, f.file.name); _tmp$5 = $ifaceNil; fi = _tmp$4; err = _tmp$5;
		return [fi, err];
	};
	File.prototype.Stat = function() { return this.$val.Stat(); };
	Lstat = $pkg.Lstat = function(name) {
		var fi = $ifaceNil, err = $ifaceNil, stat, _tmp, _tmp$1, _tmp$2, _tmp$3;
		stat = new syscall.Stat_t.Ptr(); $copy(stat, new syscall.Stat_t.Ptr(), syscall.Stat_t);
		err = syscall.Lstat(name, stat);
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp = $ifaceNil; _tmp$1 = new PathError.Ptr("lstat", name, err); fi = _tmp; err = _tmp$1;
			return [fi, err];
		}
		_tmp$2 = fileInfoFromStat(stat, name); _tmp$3 = $ifaceNil; fi = _tmp$2; err = _tmp$3;
		return [fi, err];
	};
	File.Ptr.prototype.readdir = function(n) {
		var fi = ($sliceType(FileInfo)).nil, err = $ifaceNil, f, dirname, _tuple, names, _ref, _i, filename, _tuple$1, fip, lerr, _tmp, _tmp$1, _tmp$2, _tmp$3;
		f = this;
		dirname = f.file.name;
		if (dirname === "") {
			dirname = ".";
		}
		_tuple = f.Readdirnames(n); names = _tuple[0]; err = _tuple[1];
		fi = ($sliceType(FileInfo)).make(0, names.$length);
		_ref = names;
		_i = 0;
		while (_i < _ref.$length) {
			filename = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			_tuple$1 = lstat(dirname + "/" + filename); fip = _tuple$1[0]; lerr = _tuple$1[1];
			if (IsNotExist(lerr)) {
				_i++;
				continue;
			}
			if (!($interfaceIsEqual(lerr, $ifaceNil))) {
				_tmp = fi; _tmp$1 = lerr; fi = _tmp; err = _tmp$1;
				return [fi, err];
			}
			fi = $append(fi, fip);
			_i++;
		}
		_tmp$2 = fi; _tmp$3 = err; fi = _tmp$2; err = _tmp$3;
		return [fi, err];
	};
	File.prototype.readdir = function(n) { return this.$val.readdir(n); };
	File.Ptr.prototype.read = function(b) {
		var n = 0, err = $ifaceNil, f, _tuple;
		f = this;
		if (true && b.$length > 1073741824) {
			b = $subslice(b, 0, 1073741824);
		}
		_tuple = syscall.Read(f.file.fd, b); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	File.prototype.read = function(b) { return this.$val.read(b); };
	File.Ptr.prototype.pread = function(b, off) {
		var n = 0, err = $ifaceNil, f, _tuple;
		f = this;
		if (true && b.$length > 1073741824) {
			b = $subslice(b, 0, 1073741824);
		}
		_tuple = syscall.Pread(f.file.fd, b, off); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	File.prototype.pread = function(b, off) { return this.$val.pread(b, off); };
	File.Ptr.prototype.write = function(b) {
		var n = 0, err = $ifaceNil, f, bcap, _tuple, m, err$1, _tmp, _tmp$1;
		f = this;
		while (true) {
			bcap = b;
			if (true && bcap.$length > 1073741824) {
				bcap = $subslice(bcap, 0, 1073741824);
			}
			_tuple = syscall.Write(f.file.fd, bcap); m = _tuple[0]; err$1 = _tuple[1];
			n = n + (m) >> 0;
			if (0 < m && m < bcap.$length || $interfaceIsEqual(err$1, new syscall.Errno(4))) {
				b = $subslice(b, m);
				continue;
			}
			if (true && !((bcap.$length === b.$length)) && $interfaceIsEqual(err$1, $ifaceNil)) {
				b = $subslice(b, m);
				continue;
			}
			_tmp = n; _tmp$1 = err$1; n = _tmp; err = _tmp$1;
			return [n, err];
		}
	};
	File.prototype.write = function(b) { return this.$val.write(b); };
	File.Ptr.prototype.pwrite = function(b, off) {
		var n = 0, err = $ifaceNil, f, _tuple;
		f = this;
		if (true && b.$length > 1073741824) {
			b = $subslice(b, 0, 1073741824);
		}
		_tuple = syscall.Pwrite(f.file.fd, b, off); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	File.prototype.pwrite = function(b, off) { return this.$val.pwrite(b, off); };
	File.Ptr.prototype.seek = function(offset, whence) {
		var ret = new $Int64(0, 0), err = $ifaceNil, f, _tuple;
		f = this;
		_tuple = syscall.Seek(f.file.fd, offset, whence); ret = _tuple[0]; err = _tuple[1];
		return [ret, err];
	};
	File.prototype.seek = function(offset, whence) { return this.$val.seek(offset, whence); };
	basename = function(name) {
		var i;
		i = name.length - 1 >> 0;
		while (i > 0 && (name.charCodeAt(i) === 47)) {
			name = name.substring(0, i);
			i = i - (1) >> 0;
		}
		i = i - (1) >> 0;
		while (i >= 0) {
			if (name.charCodeAt(i) === 47) {
				name = name.substring((i + 1 >> 0));
				break;
			}
			i = i - (1) >> 0;
		}
		return name;
	};
	init$1 = function() {
		useSyscallwd = useSyscallwdDarwin;
	};
	useSyscallwdDarwin = function(err) {
		return !($interfaceIsEqual(err, new syscall.Errno(45)));
	};
	Exit = $pkg.Exit = function(code) {
		syscall.Exit(code);
	};
	fileInfoFromStat = function(st, name) {
		var fs, _ref;
		fs = new fileStat.Ptr(basename(name), st.Size, 0, timespecToTime($clone(st.Mtimespec, syscall.Timespec)), st);
		fs.mode = (((st.Mode & 511) >>> 0) >>> 0);
		_ref = (st.Mode & 61440) >>> 0;
		if (_ref === 24576 || _ref === 57344) {
			fs.mode = (fs.mode | (67108864)) >>> 0;
		} else if (_ref === 8192) {
			fs.mode = (fs.mode | (69206016)) >>> 0;
		} else if (_ref === 16384) {
			fs.mode = (fs.mode | (2147483648)) >>> 0;
		} else if (_ref === 4096) {
			fs.mode = (fs.mode | (33554432)) >>> 0;
		} else if (_ref === 40960) {
			fs.mode = (fs.mode | (134217728)) >>> 0;
		} else if (_ref === 32768) {
		} else if (_ref === 49152) {
			fs.mode = (fs.mode | (16777216)) >>> 0;
		}
		if (!((((st.Mode & 1024) >>> 0) === 0))) {
			fs.mode = (fs.mode | (4194304)) >>> 0;
		}
		if (!((((st.Mode & 2048) >>> 0) === 0))) {
			fs.mode = (fs.mode | (8388608)) >>> 0;
		}
		if (!((((st.Mode & 512) >>> 0) === 0))) {
			fs.mode = (fs.mode | (1048576)) >>> 0;
		}
		return fs;
	};
	timespecToTime = function(ts) {
		return time.Unix(ts.Sec, ts.Nsec);
	};
	init$2 = function() {
		var _tuple, osver, err, i, _ref, _i, _rune;
		_tuple = syscall.Sysctl("kern.osrelease"); osver = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return;
		}
		i = 0;
		_ref = osver;
		_i = 0;
		while (_i < _ref.length) {
			_rune = $decodeRune(_ref, _i);
			i = _i;
			if (!((osver.charCodeAt(i) === 46))) {
				_i += _rune[1];
				continue;
			}
			_i += _rune[1];
		}
		if (i > 2 || (i === 2) && osver.charCodeAt(0) >= 49 && osver.charCodeAt(1) >= 49) {
			supportsCloseOnExec = true;
		}
	};
	FileMode.prototype.String = function() {
		var m, buf, w, _ref, _i, _rune, i, c, y, _ref$1, _i$1, _rune$1, i$1, c$1, y$1;
		m = this.$val !== undefined ? this.$val : this;
		buf = ($arrayType($Uint8, 32)).zero(); $copy(buf, ($arrayType($Uint8, 32)).zero(), ($arrayType($Uint8, 32)));
		w = 0;
		_ref = "dalTLDpSugct";
		_i = 0;
		while (_i < _ref.length) {
			_rune = $decodeRune(_ref, _i);
			i = _i;
			c = _rune[0];
			if (!((((m & (((y = ((31 - i >> 0) >>> 0), y < 32 ? (1 << y) : 0) >>> 0))) >>> 0) === 0))) {
				(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = (c << 24 >>> 24);
				w = w + (1) >> 0;
			}
			_i += _rune[1];
		}
		if (w === 0) {
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 45;
			w = w + (1) >> 0;
		}
		_ref$1 = "rwxrwxrwx";
		_i$1 = 0;
		while (_i$1 < _ref$1.length) {
			_rune$1 = $decodeRune(_ref$1, _i$1);
			i$1 = _i$1;
			c$1 = _rune$1[0];
			if (!((((m & (((y$1 = ((8 - i$1 >> 0) >>> 0), y$1 < 32 ? (1 << y$1) : 0) >>> 0))) >>> 0) === 0))) {
				(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = (c$1 << 24 >>> 24);
			} else {
				(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 45;
			}
			w = w + (1) >> 0;
			_i$1 += _rune$1[1];
		}
		return $bytesToString($subslice(new ($sliceType($Uint8))(buf), 0, w));
	};
	$ptrType(FileMode).prototype.String = function() { return new FileMode(this.$get()).String(); };
	FileMode.prototype.IsDir = function() {
		var m;
		m = this.$val !== undefined ? this.$val : this;
		return !((((m & 2147483648) >>> 0) === 0));
	};
	$ptrType(FileMode).prototype.IsDir = function() { return new FileMode(this.$get()).IsDir(); };
	FileMode.prototype.IsRegular = function() {
		var m;
		m = this.$val !== undefined ? this.$val : this;
		return ((m & 2399141888) >>> 0) === 0;
	};
	$ptrType(FileMode).prototype.IsRegular = function() { return new FileMode(this.$get()).IsRegular(); };
	FileMode.prototype.Perm = function() {
		var m;
		m = this.$val !== undefined ? this.$val : this;
		return (m & 511) >>> 0;
	};
	$ptrType(FileMode).prototype.Perm = function() { return new FileMode(this.$get()).Perm(); };
	fileStat.Ptr.prototype.Name = function() {
		var fs;
		fs = this;
		return fs.name;
	};
	fileStat.prototype.Name = function() { return this.$val.Name(); };
	fileStat.Ptr.prototype.IsDir = function() {
		var fs;
		fs = this;
		return (new FileMode(fs.Mode())).IsDir();
	};
	fileStat.prototype.IsDir = function() { return this.$val.IsDir(); };
	fileStat.Ptr.prototype.Size = function() {
		var fs;
		fs = this;
		return fs.size;
	};
	fileStat.prototype.Size = function() { return this.$val.Size(); };
	fileStat.Ptr.prototype.Mode = function() {
		var fs;
		fs = this;
		return fs.mode;
	};
	fileStat.prototype.Mode = function() { return this.$val.Mode(); };
	fileStat.Ptr.prototype.ModTime = function() {
		var fs;
		fs = this;
		return fs.modTime;
	};
	fileStat.prototype.ModTime = function() { return this.$val.ModTime(); };
	fileStat.Ptr.prototype.Sys = function() {
		var fs;
		fs = this;
		return fs.sys;
	};
	fileStat.prototype.Sys = function() { return this.$val.Sys(); };
	$pkg.$init = function() {
		($ptrType(PathError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		PathError.init([["Op", "Op", "", $String, ""], ["Path", "Path", "", $String, ""], ["Err", "Err", "", $error, ""]]);
		($ptrType(SyscallError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		SyscallError.init([["Syscall", "Syscall", "", $String, ""], ["Err", "Err", "", $error, ""]]);
		($ptrType(LinkError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		LinkError.init([["Op", "Op", "", $String, ""], ["Old", "Old", "", $String, ""], ["New", "New", "", $String, ""], ["Err", "Err", "", $error, ""]]);
		File.methods = [["close", "close", "os", $funcType([], [$error], false), 0]];
		($ptrType(File)).methods = [["Chdir", "Chdir", "", $funcType([], [$error], false), -1], ["Chmod", "Chmod", "", $funcType([FileMode], [$error], false), -1], ["Chown", "Chown", "", $funcType([$Int, $Int], [$error], false), -1], ["Close", "Close", "", $funcType([], [$error], false), -1], ["Fd", "Fd", "", $funcType([], [$Uintptr], false), -1], ["Name", "Name", "", $funcType([], [$String], false), -1], ["Read", "Read", "", $funcType([($sliceType($Uint8))], [$Int, $error], false), -1], ["ReadAt", "ReadAt", "", $funcType([($sliceType($Uint8)), $Int64], [$Int, $error], false), -1], ["Readdir", "Readdir", "", $funcType([$Int], [($sliceType(FileInfo)), $error], false), -1], ["Readdirnames", "Readdirnames", "", $funcType([$Int], [($sliceType($String)), $error], false), -1], ["Seek", "Seek", "", $funcType([$Int64, $Int], [$Int64, $error], false), -1], ["Stat", "Stat", "", $funcType([], [FileInfo, $error], false), -1], ["Sync", "Sync", "", $funcType([], [$error], false), -1], ["Truncate", "Truncate", "", $funcType([$Int64], [$error], false), -1], ["Write", "Write", "", $funcType([($sliceType($Uint8))], [$Int, $error], false), -1], ["WriteAt", "WriteAt", "", $funcType([($sliceType($Uint8)), $Int64], [$Int, $error], false), -1], ["WriteString", "WriteString", "", $funcType([$String], [$Int, $error], false), -1], ["close", "close", "os", $funcType([], [$error], false), 0], ["pread", "pread", "os", $funcType([($sliceType($Uint8)), $Int64], [$Int, $error], false), -1], ["pwrite", "pwrite", "os", $funcType([($sliceType($Uint8)), $Int64], [$Int, $error], false), -1], ["read", "read", "os", $funcType([($sliceType($Uint8))], [$Int, $error], false), -1], ["readdir", "readdir", "os", $funcType([$Int], [($sliceType(FileInfo)), $error], false), -1], ["readdirnames", "readdirnames", "os", $funcType([$Int], [($sliceType($String)), $error], false), -1], ["seek", "seek", "os", $funcType([$Int64, $Int], [$Int64, $error], false), -1], ["write", "write", "os", $funcType([($sliceType($Uint8))], [$Int, $error], false), -1]];
		File.init([["file", "", "os", ($ptrType(file)), ""]]);
		($ptrType(file)).methods = [["close", "close", "os", $funcType([], [$error], false), -1]];
		file.init([["fd", "fd", "os", $Int, ""], ["name", "name", "os", $String, ""], ["dirinfo", "dirinfo", "os", ($ptrType(dirInfo)), ""], ["nepipe", "nepipe", "os", $Int32, ""]]);
		dirInfo.init([["buf", "buf", "os", ($sliceType($Uint8)), ""], ["nbuf", "nbuf", "os", $Int, ""], ["bufp", "bufp", "os", $Int, ""]]);
		FileInfo.init([["IsDir", "IsDir", "", $funcType([], [$Bool], false)], ["ModTime", "ModTime", "", $funcType([], [time.Time], false)], ["Mode", "Mode", "", $funcType([], [FileMode], false)], ["Name", "Name", "", $funcType([], [$String], false)], ["Size", "Size", "", $funcType([], [$Int64], false)], ["Sys", "Sys", "", $funcType([], [$emptyInterface], false)]]);
		FileMode.methods = [["IsDir", "IsDir", "", $funcType([], [$Bool], false), -1], ["IsRegular", "IsRegular", "", $funcType([], [$Bool], false), -1], ["Perm", "Perm", "", $funcType([], [FileMode], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(FileMode)).methods = [["IsDir", "IsDir", "", $funcType([], [$Bool], false), -1], ["IsRegular", "IsRegular", "", $funcType([], [$Bool], false), -1], ["Perm", "Perm", "", $funcType([], [FileMode], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(fileStat)).methods = [["IsDir", "IsDir", "", $funcType([], [$Bool], false), -1], ["ModTime", "ModTime", "", $funcType([], [time.Time], false), -1], ["Mode", "Mode", "", $funcType([], [FileMode], false), -1], ["Name", "Name", "", $funcType([], [$String], false), -1], ["Size", "Size", "", $funcType([], [$Int64], false), -1], ["Sys", "Sys", "", $funcType([], [$emptyInterface], false), -1]];
		fileStat.init([["name", "name", "os", $String, ""], ["size", "size", "os", $Int64, ""], ["mode", "mode", "os", FileMode, ""], ["modTime", "modTime", "os", time.Time, ""], ["sys", "sys", "os", $emptyInterface, ""]]);
		$pkg.Args = ($sliceType($String)).nil;
		supportsCloseOnExec = false;
		$pkg.ErrInvalid = errors.New("invalid argument");
		$pkg.ErrPermission = errors.New("permission denied");
		$pkg.ErrExist = errors.New("file already exists");
		$pkg.ErrNotExist = errors.New("file does not exist");
		$pkg.Stdin = NewFile((syscall.Stdin >>> 0), "/dev/stdin");
		$pkg.Stdout = NewFile((syscall.Stdout >>> 0), "/dev/stdout");
		$pkg.Stderr = NewFile((syscall.Stderr >>> 0), "/dev/stderr");
		useSyscallwd = (function() {
			return true;
		});
		lstat = Lstat;
		init();
		init$1();
		init$2();
	};
	return $pkg;
})();
$packages["strconv"] = (function() {
	var $pkg = {}, math = $packages["math"], errors = $packages["errors"], utf8 = $packages["unicode/utf8"], NumError, decimal, leftCheat, extFloat, floatInfo, decimalSlice, optimize, powtab, float64pow10, float32pow10, leftcheats, smallPowersOfTen, powersOfTen, uint64pow10, float32info, float64info, isPrint16, isNotPrint16, isPrint32, isNotPrint32, shifts, ParseBool, equalIgnoreCase, special, readFloat, atof64exact, atof32exact, atof32, atof64, ParseFloat, syntaxError, rangeError, cutoff64, ParseUint, ParseInt, digitZero, trim, rightShift, prefixIsLessThan, leftShift, shouldRoundUp, frexp10Many, adjustLastDigitFixed, adjustLastDigit, AppendFloat, genericFtoa, bigFtoa, formatDigits, roundShortest, fmtE, fmtF, fmtB, max, FormatInt, Itoa, formatBits, quoteWith, Quote, QuoteToASCII, QuoteRune, AppendQuoteRune, QuoteRuneToASCII, AppendQuoteRuneToASCII, CanBackquote, unhex, UnquoteChar, Unquote, contains, bsearch16, bsearch32, IsPrint;
	NumError = $pkg.NumError = $newType(0, "Struct", "strconv.NumError", "NumError", "strconv", function(Func_, Num_, Err_) {
		this.$val = this;
		this.Func = Func_ !== undefined ? Func_ : "";
		this.Num = Num_ !== undefined ? Num_ : "";
		this.Err = Err_ !== undefined ? Err_ : $ifaceNil;
	});
	decimal = $pkg.decimal = $newType(0, "Struct", "strconv.decimal", "decimal", "strconv", function(d_, nd_, dp_, neg_, trunc_) {
		this.$val = this;
		this.d = d_ !== undefined ? d_ : ($arrayType($Uint8, 800)).zero();
		this.nd = nd_ !== undefined ? nd_ : 0;
		this.dp = dp_ !== undefined ? dp_ : 0;
		this.neg = neg_ !== undefined ? neg_ : false;
		this.trunc = trunc_ !== undefined ? trunc_ : false;
	});
	leftCheat = $pkg.leftCheat = $newType(0, "Struct", "strconv.leftCheat", "leftCheat", "strconv", function(delta_, cutoff_) {
		this.$val = this;
		this.delta = delta_ !== undefined ? delta_ : 0;
		this.cutoff = cutoff_ !== undefined ? cutoff_ : "";
	});
	extFloat = $pkg.extFloat = $newType(0, "Struct", "strconv.extFloat", "extFloat", "strconv", function(mant_, exp_, neg_) {
		this.$val = this;
		this.mant = mant_ !== undefined ? mant_ : new $Uint64(0, 0);
		this.exp = exp_ !== undefined ? exp_ : 0;
		this.neg = neg_ !== undefined ? neg_ : false;
	});
	floatInfo = $pkg.floatInfo = $newType(0, "Struct", "strconv.floatInfo", "floatInfo", "strconv", function(mantbits_, expbits_, bias_) {
		this.$val = this;
		this.mantbits = mantbits_ !== undefined ? mantbits_ : 0;
		this.expbits = expbits_ !== undefined ? expbits_ : 0;
		this.bias = bias_ !== undefined ? bias_ : 0;
	});
	decimalSlice = $pkg.decimalSlice = $newType(0, "Struct", "strconv.decimalSlice", "decimalSlice", "strconv", function(d_, nd_, dp_, neg_) {
		this.$val = this;
		this.d = d_ !== undefined ? d_ : ($sliceType($Uint8)).nil;
		this.nd = nd_ !== undefined ? nd_ : 0;
		this.dp = dp_ !== undefined ? dp_ : 0;
		this.neg = neg_ !== undefined ? neg_ : false;
	});
	ParseBool = $pkg.ParseBool = function(str) {
		var value = false, err = $ifaceNil, _ref, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
		_ref = str;
		if (_ref === "1" || _ref === "t" || _ref === "T" || _ref === "true" || _ref === "TRUE" || _ref === "True") {
			_tmp = true; _tmp$1 = $ifaceNil; value = _tmp; err = _tmp$1;
			return [value, err];
		} else if (_ref === "0" || _ref === "f" || _ref === "F" || _ref === "false" || _ref === "FALSE" || _ref === "False") {
			_tmp$2 = false; _tmp$3 = $ifaceNil; value = _tmp$2; err = _tmp$3;
			return [value, err];
		}
		_tmp$4 = false; _tmp$5 = syntaxError("ParseBool", str); value = _tmp$4; err = _tmp$5;
		return [value, err];
	};
	equalIgnoreCase = function(s1, s2) {
		var i, c1, c2;
		if (!((s1.length === s2.length))) {
			return false;
		}
		i = 0;
		while (i < s1.length) {
			c1 = s1.charCodeAt(i);
			if (65 <= c1 && c1 <= 90) {
				c1 = c1 + (32) << 24 >>> 24;
			}
			c2 = s2.charCodeAt(i);
			if (65 <= c2 && c2 <= 90) {
				c2 = c2 + (32) << 24 >>> 24;
			}
			if (!((c1 === c2))) {
				return false;
			}
			i = i + (1) >> 0;
		}
		return true;
	};
	special = function(s) {
		var f = 0, ok = false, _ref, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7;
		if (s.length === 0) {
			return [f, ok];
		}
		_ref = s.charCodeAt(0);
		if (_ref === 43) {
			if (equalIgnoreCase(s, "+inf") || equalIgnoreCase(s, "+infinity")) {
				_tmp = math.Inf(1); _tmp$1 = true; f = _tmp; ok = _tmp$1;
				return [f, ok];
			}
		} else if (_ref === 45) {
			if (equalIgnoreCase(s, "-inf") || equalIgnoreCase(s, "-infinity")) {
				_tmp$2 = math.Inf(-1); _tmp$3 = true; f = _tmp$2; ok = _tmp$3;
				return [f, ok];
			}
		} else if (_ref === 110 || _ref === 78) {
			if (equalIgnoreCase(s, "nan")) {
				_tmp$4 = math.NaN(); _tmp$5 = true; f = _tmp$4; ok = _tmp$5;
				return [f, ok];
			}
		} else if (_ref === 105 || _ref === 73) {
			if (equalIgnoreCase(s, "inf") || equalIgnoreCase(s, "infinity")) {
				_tmp$6 = math.Inf(1); _tmp$7 = true; f = _tmp$6; ok = _tmp$7;
				return [f, ok];
			}
		} else {
			return [f, ok];
		}
		return [f, ok];
	};
	decimal.Ptr.prototype.set = function(s) {
		var ok = false, b, i, sawdot, sawdigits, x, x$1, esign, e;
		b = this;
		i = 0;
		b.neg = false;
		b.trunc = false;
		if (i >= s.length) {
			return ok;
		}
		if (s.charCodeAt(i) === 43) {
			i = i + (1) >> 0;
		} else if (s.charCodeAt(i) === 45) {
			b.neg = true;
			i = i + (1) >> 0;
		}
		sawdot = false;
		sawdigits = false;
		while (i < s.length) {
			if (s.charCodeAt(i) === 46) {
				if (sawdot) {
					return ok;
				}
				sawdot = true;
				b.dp = b.nd;
				i = i + (1) >> 0;
				continue;
			} else if (48 <= s.charCodeAt(i) && s.charCodeAt(i) <= 57) {
				sawdigits = true;
				if ((s.charCodeAt(i) === 48) && (b.nd === 0)) {
					b.dp = b.dp - (1) >> 0;
					i = i + (1) >> 0;
					continue;
				}
				if (b.nd < 800) {
					(x = b.d, x$1 = b.nd, (x$1 < 0 || x$1 >= x.length) ? $throwRuntimeError("index out of range") : x[x$1] = s.charCodeAt(i));
					b.nd = b.nd + (1) >> 0;
				} else if (!((s.charCodeAt(i) === 48))) {
					b.trunc = true;
				}
				i = i + (1) >> 0;
				continue;
			}
			break;
		}
		if (!sawdigits) {
			return ok;
		}
		if (!sawdot) {
			b.dp = b.nd;
		}
		if (i < s.length && ((s.charCodeAt(i) === 101) || (s.charCodeAt(i) === 69))) {
			i = i + (1) >> 0;
			if (i >= s.length) {
				return ok;
			}
			esign = 1;
			if (s.charCodeAt(i) === 43) {
				i = i + (1) >> 0;
			} else if (s.charCodeAt(i) === 45) {
				i = i + (1) >> 0;
				esign = -1;
			}
			if (i >= s.length || s.charCodeAt(i) < 48 || s.charCodeAt(i) > 57) {
				return ok;
			}
			e = 0;
			while (i < s.length && 48 <= s.charCodeAt(i) && s.charCodeAt(i) <= 57) {
				if (e < 10000) {
					e = (((((e >>> 16 << 16) * 10 >> 0) + (e << 16 >>> 16) * 10) >> 0) + (s.charCodeAt(i) >> 0) >> 0) - 48 >> 0;
				}
				i = i + (1) >> 0;
			}
			b.dp = b.dp + (((((e >>> 16 << 16) * esign >> 0) + (e << 16 >>> 16) * esign) >> 0)) >> 0;
		}
		if (!((i === s.length))) {
			return ok;
		}
		ok = true;
		return ok;
	};
	decimal.prototype.set = function(s) { return this.$val.set(s); };
	readFloat = function(s) {
		var mantissa = new $Uint64(0, 0), exp = 0, neg = false, trunc = false, ok = false, i, sawdot, sawdigits, nd, ndMant, dp, c, _ref, x, esign, e;
		i = 0;
		if (i >= s.length) {
			return [mantissa, exp, neg, trunc, ok];
		}
		if (s.charCodeAt(i) === 43) {
			i = i + (1) >> 0;
		} else if (s.charCodeAt(i) === 45) {
			neg = true;
			i = i + (1) >> 0;
		}
		sawdot = false;
		sawdigits = false;
		nd = 0;
		ndMant = 0;
		dp = 0;
		while (i < s.length) {
			c = s.charCodeAt(i);
			_ref = true;
			if (_ref === (c === 46)) {
				if (sawdot) {
					return [mantissa, exp, neg, trunc, ok];
				}
				sawdot = true;
				dp = nd;
				i = i + (1) >> 0;
				continue;
			} else if (_ref === 48 <= c && c <= 57) {
				sawdigits = true;
				if ((c === 48) && (nd === 0)) {
					dp = dp - (1) >> 0;
					i = i + (1) >> 0;
					continue;
				}
				nd = nd + (1) >> 0;
				if (ndMant < 19) {
					mantissa = $mul64(mantissa, (new $Uint64(0, 10)));
					mantissa = (x = new $Uint64(0, (c - 48 << 24 >>> 24)), new $Uint64(mantissa.$high + x.$high, mantissa.$low + x.$low));
					ndMant = ndMant + (1) >> 0;
				} else if (!((s.charCodeAt(i) === 48))) {
					trunc = true;
				}
				i = i + (1) >> 0;
				continue;
			}
			break;
		}
		if (!sawdigits) {
			return [mantissa, exp, neg, trunc, ok];
		}
		if (!sawdot) {
			dp = nd;
		}
		if (i < s.length && ((s.charCodeAt(i) === 101) || (s.charCodeAt(i) === 69))) {
			i = i + (1) >> 0;
			if (i >= s.length) {
				return [mantissa, exp, neg, trunc, ok];
			}
			esign = 1;
			if (s.charCodeAt(i) === 43) {
				i = i + (1) >> 0;
			} else if (s.charCodeAt(i) === 45) {
				i = i + (1) >> 0;
				esign = -1;
			}
			if (i >= s.length || s.charCodeAt(i) < 48 || s.charCodeAt(i) > 57) {
				return [mantissa, exp, neg, trunc, ok];
			}
			e = 0;
			while (i < s.length && 48 <= s.charCodeAt(i) && s.charCodeAt(i) <= 57) {
				if (e < 10000) {
					e = (((((e >>> 16 << 16) * 10 >> 0) + (e << 16 >>> 16) * 10) >> 0) + (s.charCodeAt(i) >> 0) >> 0) - 48 >> 0;
				}
				i = i + (1) >> 0;
			}
			dp = dp + (((((e >>> 16 << 16) * esign >> 0) + (e << 16 >>> 16) * esign) >> 0)) >> 0;
		}
		if (!((i === s.length))) {
			return [mantissa, exp, neg, trunc, ok];
		}
		exp = dp - ndMant >> 0;
		ok = true;
		return [mantissa, exp, neg, trunc, ok];
	};
	decimal.Ptr.prototype.floatBits = function(flt) {
		var $this = this, $args = arguments, b = new $Uint64(0, 0), overflow = false, $s = 0, d, exp, mant, n, x, n$1, x$1, n$2, y, x$2, y$1, x$3, x$4, y$2, x$5, x$6, bits, x$7, y$3, x$8, _tmp, _tmp$1;
		/* */ while (true) { switch ($s) { case 0:
		d = $this;
		exp = 0;
		mant = new $Uint64(0, 0);
		/* if (d.nd === 0) { */ if (d.nd === 0) {} else { $s = 3; continue; }
			mant = new $Uint64(0, 0);
			exp = flt.bias;
			/* goto out */ $s = 1; continue;
		/* } */ case 3:
		/* if (d.dp > 310) { */ if (d.dp > 310) {} else { $s = 4; continue; }
			/* goto overflow */ $s = 2; continue;
		/* } */ case 4:
		/* if (d.dp < -330) { */ if (d.dp < -330) {} else { $s = 5; continue; }
			mant = new $Uint64(0, 0);
			exp = flt.bias;
			/* goto out */ $s = 1; continue;
		/* } */ case 5:
		exp = 0;
		while (d.dp > 0) {
			n = 0;
			if (d.dp >= powtab.$length) {
				n = 27;
			} else {
				n = (x = d.dp, ((x < 0 || x >= powtab.$length) ? $throwRuntimeError("index out of range") : powtab.$array[powtab.$offset + x]));
			}
			d.Shift(-n);
			exp = exp + (n) >> 0;
		}
		while (d.dp < 0 || (d.dp === 0) && d.d[0] < 53) {
			n$1 = 0;
			if (-d.dp >= powtab.$length) {
				n$1 = 27;
			} else {
				n$1 = (x$1 = -d.dp, ((x$1 < 0 || x$1 >= powtab.$length) ? $throwRuntimeError("index out of range") : powtab.$array[powtab.$offset + x$1]));
			}
			d.Shift(n$1);
			exp = exp - (n$1) >> 0;
		}
		exp = exp - (1) >> 0;
		if (exp < (flt.bias + 1 >> 0)) {
			n$2 = (flt.bias + 1 >> 0) - exp >> 0;
			d.Shift(-n$2);
			exp = exp + (n$2) >> 0;
		}
		/* if ((exp - flt.bias >> 0) >= (((y = flt.expbits, y < 32 ? (1 << y) : 0) >> 0) - 1 >> 0)) { */ if ((exp - flt.bias >> 0) >= (((y = flt.expbits, y < 32 ? (1 << y) : 0) >> 0) - 1 >> 0)) {} else { $s = 6; continue; }
			/* goto overflow */ $s = 2; continue;
		/* } */ case 6:
		d.Shift(((1 + flt.mantbits >>> 0) >> 0));
		mant = d.RoundedInteger();
		/* if ((x$2 = $shiftLeft64(new $Uint64(0, 2), flt.mantbits), (mant.$high === x$2.$high && mant.$low === x$2.$low))) { */ if ((x$2 = $shiftLeft64(new $Uint64(0, 2), flt.mantbits), (mant.$high === x$2.$high && mant.$low === x$2.$low))) {} else { $s = 7; continue; }
			mant = $shiftRightUint64(mant, (1));
			exp = exp + (1) >> 0;
			/* if ((exp - flt.bias >> 0) >= (((y$1 = flt.expbits, y$1 < 32 ? (1 << y$1) : 0) >> 0) - 1 >> 0)) { */ if ((exp - flt.bias >> 0) >= (((y$1 = flt.expbits, y$1 < 32 ? (1 << y$1) : 0) >> 0) - 1 >> 0)) {} else { $s = 8; continue; }
				/* goto overflow */ $s = 2; continue;
			/* } */ case 8:
		/* } */ case 7:
		if ((x$3 = (x$4 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(mant.$high & x$4.$high, (mant.$low & x$4.$low) >>> 0)), (x$3.$high === 0 && x$3.$low === 0))) {
			exp = flt.bias;
		}
		/* goto out */ $s = 1; continue;
		/* overflow: */ case 2:
		mant = new $Uint64(0, 0);
		exp = (((y$2 = flt.expbits, y$2 < 32 ? (1 << y$2) : 0) >> 0) - 1 >> 0) + flt.bias >> 0;
		overflow = true;
		/* out: */ case 1:
		bits = (x$5 = (x$6 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(x$6.$high - 0, x$6.$low - 1)), new $Uint64(mant.$high & x$5.$high, (mant.$low & x$5.$low) >>> 0));
		bits = (x$7 = $shiftLeft64(new $Uint64(0, (((exp - flt.bias >> 0)) & ((((y$3 = flt.expbits, y$3 < 32 ? (1 << y$3) : 0) >> 0) - 1 >> 0)))), flt.mantbits), new $Uint64(bits.$high | x$7.$high, (bits.$low | x$7.$low) >>> 0));
		if (d.neg) {
			bits = (x$8 = $shiftLeft64($shiftLeft64(new $Uint64(0, 1), flt.mantbits), flt.expbits), new $Uint64(bits.$high | x$8.$high, (bits.$low | x$8.$low) >>> 0));
		}
		_tmp = bits; _tmp$1 = overflow; b = _tmp; overflow = _tmp$1;
		return [b, overflow];
		/* */ case -1: } return; }
	};
	decimal.prototype.floatBits = function(flt) { return this.$val.floatBits(flt); };
	atof64exact = function(mantissa, exp, neg) {
		var f = 0, ok = false, x, _tmp, _tmp$1, x$1, _tmp$2, _tmp$3, _tmp$4, x$2, _tmp$5;
		if (!((x = $shiftRightUint64(mantissa, float64info.mantbits), (x.$high === 0 && x.$low === 0)))) {
			return [f, ok];
		}
		f = $flatten64(mantissa);
		if (neg) {
			f = -f;
		}
		if (exp === 0) {
			_tmp = f; _tmp$1 = true; f = _tmp; ok = _tmp$1;
			return [f, ok];
		} else if (exp > 0 && exp <= 37) {
			if (exp > 22) {
				f = f * ((x$1 = exp - 22 >> 0, ((x$1 < 0 || x$1 >= float64pow10.$length) ? $throwRuntimeError("index out of range") : float64pow10.$array[float64pow10.$offset + x$1])));
				exp = 22;
			}
			if (f > 1e+15 || f < -1e+15) {
				return [f, ok];
			}
			_tmp$2 = f * ((exp < 0 || exp >= float64pow10.$length) ? $throwRuntimeError("index out of range") : float64pow10.$array[float64pow10.$offset + exp]); _tmp$3 = true; f = _tmp$2; ok = _tmp$3;
			return [f, ok];
		} else if (exp < 0 && exp >= -22) {
			_tmp$4 = f / (x$2 = -exp, ((x$2 < 0 || x$2 >= float64pow10.$length) ? $throwRuntimeError("index out of range") : float64pow10.$array[float64pow10.$offset + x$2])); _tmp$5 = true; f = _tmp$4; ok = _tmp$5;
			return [f, ok];
		}
		return [f, ok];
	};
	atof32exact = function(mantissa, exp, neg) {
		var f = 0, ok = false, x, _tmp, _tmp$1, x$1, _tmp$2, _tmp$3, _tmp$4, x$2, _tmp$5;
		if (!((x = $shiftRightUint64(mantissa, float32info.mantbits), (x.$high === 0 && x.$low === 0)))) {
			return [f, ok];
		}
		f = $flatten64(mantissa);
		if (neg) {
			f = -f;
		}
		if (exp === 0) {
			_tmp = f; _tmp$1 = true; f = _tmp; ok = _tmp$1;
			return [f, ok];
		} else if (exp > 0 && exp <= 17) {
			if (exp > 10) {
				f = f * ((x$1 = exp - 10 >> 0, ((x$1 < 0 || x$1 >= float32pow10.$length) ? $throwRuntimeError("index out of range") : float32pow10.$array[float32pow10.$offset + x$1])));
				exp = 10;
			}
			if (f > 1e+07 || f < -1e+07) {
				return [f, ok];
			}
			_tmp$2 = f * ((exp < 0 || exp >= float32pow10.$length) ? $throwRuntimeError("index out of range") : float32pow10.$array[float32pow10.$offset + exp]); _tmp$3 = true; f = _tmp$2; ok = _tmp$3;
			return [f, ok];
		} else if (exp < 0 && exp >= -10) {
			_tmp$4 = f / (x$2 = -exp, ((x$2 < 0 || x$2 >= float32pow10.$length) ? $throwRuntimeError("index out of range") : float32pow10.$array[float32pow10.$offset + x$2])); _tmp$5 = true; f = _tmp$4; ok = _tmp$5;
			return [f, ok];
		}
		return [f, ok];
	};
	atof32 = function(s) {
		var f = 0, err = $ifaceNil, _tuple, val, ok, _tmp, _tmp$1, _tuple$1, mantissa, exp, neg, trunc, ok$1, _tuple$2, f$1, ok$2, _tmp$2, _tmp$3, ext, ok$3, _tuple$3, b, ovf, _tmp$4, _tmp$5, d, _tmp$6, _tmp$7, _tuple$4, b$1, ovf$1, _tmp$8, _tmp$9;
		_tuple = special(s); val = _tuple[0]; ok = _tuple[1];
		if (ok) {
			_tmp = val; _tmp$1 = $ifaceNil; f = _tmp; err = _tmp$1;
			return [f, err];
		}
		if (optimize) {
			_tuple$1 = readFloat(s); mantissa = _tuple$1[0]; exp = _tuple$1[1]; neg = _tuple$1[2]; trunc = _tuple$1[3]; ok$1 = _tuple$1[4];
			if (ok$1) {
				if (!trunc) {
					_tuple$2 = atof32exact(mantissa, exp, neg); f$1 = _tuple$2[0]; ok$2 = _tuple$2[1];
					if (ok$2) {
						_tmp$2 = f$1; _tmp$3 = $ifaceNil; f = _tmp$2; err = _tmp$3;
						return [f, err];
					}
				}
				ext = new extFloat.Ptr();
				ok$3 = ext.AssignDecimal(mantissa, exp, neg, trunc, float32info);
				if (ok$3) {
					_tuple$3 = ext.floatBits(float32info); b = _tuple$3[0]; ovf = _tuple$3[1];
					f = math.Float32frombits((b.$low >>> 0));
					if (ovf) {
						err = rangeError("ParseFloat", s);
					}
					_tmp$4 = f; _tmp$5 = err; f = _tmp$4; err = _tmp$5;
					return [f, err];
				}
			}
		}
		d = new decimal.Ptr(); $copy(d, new decimal.Ptr(), decimal);
		if (!d.set(s)) {
			_tmp$6 = 0; _tmp$7 = syntaxError("ParseFloat", s); f = _tmp$6; err = _tmp$7;
			return [f, err];
		}
		_tuple$4 = d.floatBits(float32info); b$1 = _tuple$4[0]; ovf$1 = _tuple$4[1];
		f = math.Float32frombits((b$1.$low >>> 0));
		if (ovf$1) {
			err = rangeError("ParseFloat", s);
		}
		_tmp$8 = f; _tmp$9 = err; f = _tmp$8; err = _tmp$9;
		return [f, err];
	};
	atof64 = function(s) {
		var f = 0, err = $ifaceNil, _tuple, val, ok, _tmp, _tmp$1, _tuple$1, mantissa, exp, neg, trunc, ok$1, _tuple$2, f$1, ok$2, _tmp$2, _tmp$3, ext, ok$3, _tuple$3, b, ovf, _tmp$4, _tmp$5, d, _tmp$6, _tmp$7, _tuple$4, b$1, ovf$1, _tmp$8, _tmp$9;
		_tuple = special(s); val = _tuple[0]; ok = _tuple[1];
		if (ok) {
			_tmp = val; _tmp$1 = $ifaceNil; f = _tmp; err = _tmp$1;
			return [f, err];
		}
		if (optimize) {
			_tuple$1 = readFloat(s); mantissa = _tuple$1[0]; exp = _tuple$1[1]; neg = _tuple$1[2]; trunc = _tuple$1[3]; ok$1 = _tuple$1[4];
			if (ok$1) {
				if (!trunc) {
					_tuple$2 = atof64exact(mantissa, exp, neg); f$1 = _tuple$2[0]; ok$2 = _tuple$2[1];
					if (ok$2) {
						_tmp$2 = f$1; _tmp$3 = $ifaceNil; f = _tmp$2; err = _tmp$3;
						return [f, err];
					}
				}
				ext = new extFloat.Ptr();
				ok$3 = ext.AssignDecimal(mantissa, exp, neg, trunc, float64info);
				if (ok$3) {
					_tuple$3 = ext.floatBits(float64info); b = _tuple$3[0]; ovf = _tuple$3[1];
					f = math.Float64frombits(b);
					if (ovf) {
						err = rangeError("ParseFloat", s);
					}
					_tmp$4 = f; _tmp$5 = err; f = _tmp$4; err = _tmp$5;
					return [f, err];
				}
			}
		}
		d = new decimal.Ptr(); $copy(d, new decimal.Ptr(), decimal);
		if (!d.set(s)) {
			_tmp$6 = 0; _tmp$7 = syntaxError("ParseFloat", s); f = _tmp$6; err = _tmp$7;
			return [f, err];
		}
		_tuple$4 = d.floatBits(float64info); b$1 = _tuple$4[0]; ovf$1 = _tuple$4[1];
		f = math.Float64frombits(b$1);
		if (ovf$1) {
			err = rangeError("ParseFloat", s);
		}
		_tmp$8 = f; _tmp$9 = err; f = _tmp$8; err = _tmp$9;
		return [f, err];
	};
	ParseFloat = $pkg.ParseFloat = function(s, bitSize) {
		var f = 0, err = $ifaceNil, _tuple, f1, err1, _tmp, _tmp$1, _tuple$1, f1$1, err1$1, _tmp$2, _tmp$3;
		if (bitSize === 32) {
			_tuple = atof32(s); f1 = _tuple[0]; err1 = _tuple[1];
			_tmp = $coerceFloat32(f1); _tmp$1 = err1; f = _tmp; err = _tmp$1;
			return [f, err];
		}
		_tuple$1 = atof64(s); f1$1 = _tuple$1[0]; err1$1 = _tuple$1[1];
		_tmp$2 = f1$1; _tmp$3 = err1$1; f = _tmp$2; err = _tmp$3;
		return [f, err];
	};
	NumError.Ptr.prototype.Error = function() {
		var e;
		e = this;
		return "strconv." + e.Func + ": " + "parsing " + Quote(e.Num) + ": " + e.Err.Error();
	};
	NumError.prototype.Error = function() { return this.$val.Error(); };
	syntaxError = function(fn, str) {
		return new NumError.Ptr(fn, str, $pkg.ErrSyntax);
	};
	rangeError = function(fn, str) {
		return new NumError.Ptr(fn, str, $pkg.ErrRange);
	};
	cutoff64 = function(base) {
		var x;
		if (base < 2) {
			return new $Uint64(0, 0);
		}
		return (x = $div64(new $Uint64(4294967295, 4294967295), new $Uint64(0, base), false), new $Uint64(x.$high + 0, x.$low + 1));
	};
	ParseUint = $pkg.ParseUint = function(s, base, bitSize) {
		var $this = this, $args = arguments, n = new $Uint64(0, 0), err = $ifaceNil, $s = 0, _tmp, _tmp$1, cutoff, maxVal, s0, x, i, v, d, x$1, n1, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
		/* */ while (true) { switch ($s) { case 0:
		_tmp = new $Uint64(0, 0); _tmp$1 = new $Uint64(0, 0); cutoff = _tmp; maxVal = _tmp$1;
		if (bitSize === 0) {
			bitSize = 32;
		}
		s0 = s;
		/* if (s.length < 1) { */ if (s.length < 1) {} else if (2 <= base && base <= 36) { $s = 2; continue; } else if (base === 0) { $s = 3; continue; } else { $s = 4; continue; }
			err = $pkg.ErrSyntax;
			/* goto Error */ $s = 1; continue;
		/* } else if (2 <= base && base <= 36) { */ $s = 5; continue; case 2: 
		/* } else if (base === 0) { */ $s = 5; continue; case 3: 
			/* if ((s.charCodeAt(0) === 48) && s.length > 1 && ((s.charCodeAt(1) === 120) || (s.charCodeAt(1) === 88))) { */ if ((s.charCodeAt(0) === 48) && s.length > 1 && ((s.charCodeAt(1) === 120) || (s.charCodeAt(1) === 88))) {} else if (s.charCodeAt(0) === 48) { $s = 6; continue; } else { $s = 7; continue; }
				base = 16;
				s = s.substring(2);
				/* if (s.length < 1) { */ if (s.length < 1) {} else { $s = 9; continue; }
					err = $pkg.ErrSyntax;
					/* goto Error */ $s = 1; continue;
				/* } */ case 9:
			/* } else if (s.charCodeAt(0) === 48) { */ $s = 8; continue; case 6: 
				base = 8;
			/* } else { */ $s = 8; continue; case 7: 
				base = 10;
			/* } */ case 8:
		/* } else { */ $s = 5; continue; case 4: 
			err = errors.New("invalid base " + Itoa(base));
			/* goto Error */ $s = 1; continue;
		/* } */ case 5:
		n = new $Uint64(0, 0);
		cutoff = cutoff64(base);
		maxVal = (x = $shiftLeft64(new $Uint64(0, 1), (bitSize >>> 0)), new $Uint64(x.$high - 0, x.$low - 1));
		i = 0;
		/* while (i < s.length) { */ case 10: if(!(i < s.length)) { $s = 11; continue; }
			v = 0;
			d = s.charCodeAt(i);
			/* if (48 <= d && d <= 57) { */ if (48 <= d && d <= 57) {} else if (97 <= d && d <= 122) { $s = 12; continue; } else if (65 <= d && d <= 90) { $s = 13; continue; } else { $s = 14; continue; }
				v = d - 48 << 24 >>> 24;
			/* } else if (97 <= d && d <= 122) { */ $s = 15; continue; case 12: 
				v = (d - 97 << 24 >>> 24) + 10 << 24 >>> 24;
			/* } else if (65 <= d && d <= 90) { */ $s = 15; continue; case 13: 
				v = (d - 65 << 24 >>> 24) + 10 << 24 >>> 24;
			/* } else { */ $s = 15; continue; case 14: 
				n = new $Uint64(0, 0);
				err = $pkg.ErrSyntax;
				/* goto Error */ $s = 1; continue;
			/* } */ case 15:
			/* if ((v >> 0) >= base) { */ if ((v >> 0) >= base) {} else { $s = 16; continue; }
				n = new $Uint64(0, 0);
				err = $pkg.ErrSyntax;
				/* goto Error */ $s = 1; continue;
			/* } */ case 16:
			/* if ((n.$high > cutoff.$high || (n.$high === cutoff.$high && n.$low >= cutoff.$low))) { */ if ((n.$high > cutoff.$high || (n.$high === cutoff.$high && n.$low >= cutoff.$low))) {} else { $s = 17; continue; }
				n = new $Uint64(4294967295, 4294967295);
				err = $pkg.ErrRange;
				/* goto Error */ $s = 1; continue;
			/* } */ case 17:
			n = $mul64(n, (new $Uint64(0, base)));
			n1 = (x$1 = new $Uint64(0, v), new $Uint64(n.$high + x$1.$high, n.$low + x$1.$low));
			/* if ((n1.$high < n.$high || (n1.$high === n.$high && n1.$low < n.$low)) || (n1.$high > maxVal.$high || (n1.$high === maxVal.$high && n1.$low > maxVal.$low))) { */ if ((n1.$high < n.$high || (n1.$high === n.$high && n1.$low < n.$low)) || (n1.$high > maxVal.$high || (n1.$high === maxVal.$high && n1.$low > maxVal.$low))) {} else { $s = 18; continue; }
				n = new $Uint64(4294967295, 4294967295);
				err = $pkg.ErrRange;
				/* goto Error */ $s = 1; continue;
			/* } */ case 18:
			n = n1;
			i = i + (1) >> 0;
		/* } */ $s = 10; continue; case 11:
		_tmp$2 = n; _tmp$3 = $ifaceNil; n = _tmp$2; err = _tmp$3;
		return [n, err];
		/* Error: */ case 1:
		_tmp$4 = n; _tmp$5 = new NumError.Ptr("ParseUint", s0, err); n = _tmp$4; err = _tmp$5;
		return [n, err];
		/* */ case -1: } return; }
	};
	ParseInt = $pkg.ParseInt = function(s, base, bitSize) {
		var i = new $Int64(0, 0), err = $ifaceNil, _tmp, _tmp$1, s0, neg, un, _tuple, _tmp$2, _tmp$3, cutoff, _tmp$4, x, _tmp$5, _tmp$6, x$1, _tmp$7, n, _tmp$8, _tmp$9;
		if (bitSize === 0) {
			bitSize = 32;
		}
		if (s.length === 0) {
			_tmp = new $Int64(0, 0); _tmp$1 = syntaxError("ParseInt", s); i = _tmp; err = _tmp$1;
			return [i, err];
		}
		s0 = s;
		neg = false;
		if (s.charCodeAt(0) === 43) {
			s = s.substring(1);
		} else if (s.charCodeAt(0) === 45) {
			neg = true;
			s = s.substring(1);
		}
		un = new $Uint64(0, 0);
		_tuple = ParseUint(s, base, bitSize); un = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil)) && !($interfaceIsEqual($assertType(err, ($ptrType(NumError))).Err, $pkg.ErrRange))) {
			$assertType(err, ($ptrType(NumError))).Func = "ParseInt";
			$assertType(err, ($ptrType(NumError))).Num = s0;
			_tmp$2 = new $Int64(0, 0); _tmp$3 = err; i = _tmp$2; err = _tmp$3;
			return [i, err];
		}
		cutoff = $shiftLeft64(new $Uint64(0, 1), ((bitSize - 1 >> 0) >>> 0));
		if (!neg && (un.$high > cutoff.$high || (un.$high === cutoff.$high && un.$low >= cutoff.$low))) {
			_tmp$4 = (x = new $Uint64(cutoff.$high - 0, cutoff.$low - 1), new $Int64(x.$high, x.$low)); _tmp$5 = rangeError("ParseInt", s0); i = _tmp$4; err = _tmp$5;
			return [i, err];
		}
		if (neg && (un.$high > cutoff.$high || (un.$high === cutoff.$high && un.$low > cutoff.$low))) {
			_tmp$6 = (x$1 = new $Int64(cutoff.$high, cutoff.$low), new $Int64(-x$1.$high, -x$1.$low)); _tmp$7 = rangeError("ParseInt", s0); i = _tmp$6; err = _tmp$7;
			return [i, err];
		}
		n = new $Int64(un.$high, un.$low);
		if (neg) {
			n = new $Int64(-n.$high, -n.$low);
		}
		_tmp$8 = n; _tmp$9 = $ifaceNil; i = _tmp$8; err = _tmp$9;
		return [i, err];
	};
	decimal.Ptr.prototype.String = function() {
		var a, n, buf, w;
		a = this;
		n = 10 + a.nd >> 0;
		if (a.dp > 0) {
			n = n + (a.dp) >> 0;
		}
		if (a.dp < 0) {
			n = n + (-a.dp) >> 0;
		}
		buf = ($sliceType($Uint8)).make(n);
		w = 0;
		if (a.nd === 0) {
			return "0";
		} else if (a.dp <= 0) {
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 48;
			w = w + (1) >> 0;
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 46;
			w = w + (1) >> 0;
			w = w + (digitZero($subslice(buf, w, (w + -a.dp >> 0)))) >> 0;
			w = w + ($copySlice($subslice(buf, w), $subslice(new ($sliceType($Uint8))(a.d), 0, a.nd))) >> 0;
		} else if (a.dp < a.nd) {
			w = w + ($copySlice($subslice(buf, w), $subslice(new ($sliceType($Uint8))(a.d), 0, a.dp))) >> 0;
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 46;
			w = w + (1) >> 0;
			w = w + ($copySlice($subslice(buf, w), $subslice(new ($sliceType($Uint8))(a.d), a.dp, a.nd))) >> 0;
		} else {
			w = w + ($copySlice($subslice(buf, w), $subslice(new ($sliceType($Uint8))(a.d), 0, a.nd))) >> 0;
			w = w + (digitZero($subslice(buf, w, ((w + a.dp >> 0) - a.nd >> 0)))) >> 0;
		}
		return $bytesToString($subslice(buf, 0, w));
	};
	decimal.prototype.String = function() { return this.$val.String(); };
	digitZero = function(dst) {
		var _ref, _i, i;
		_ref = dst;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			(i < 0 || i >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + i] = 48;
			_i++;
		}
		return dst.$length;
	};
	trim = function(a) {
		var x, x$1;
		while (a.nd > 0 && ((x = a.d, x$1 = a.nd - 1 >> 0, ((x$1 < 0 || x$1 >= x.length) ? $throwRuntimeError("index out of range") : x[x$1])) === 48)) {
			a.nd = a.nd - (1) >> 0;
		}
		if (a.nd === 0) {
			a.dp = 0;
		}
	};
	decimal.Ptr.prototype.Assign = function(v) {
		var a, buf, n, v1, x, x$1, x$2;
		a = this;
		buf = ($arrayType($Uint8, 24)).zero(); $copy(buf, ($arrayType($Uint8, 24)).zero(), ($arrayType($Uint8, 24)));
		n = 0;
		while ((v.$high > 0 || (v.$high === 0 && v.$low > 0))) {
			v1 = $div64(v, new $Uint64(0, 10), false);
			v = (x = $mul64(new $Uint64(0, 10), v1), new $Uint64(v.$high - x.$high, v.$low - x.$low));
			(n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n] = (new $Uint64(v.$high + 0, v.$low + 48).$low << 24 >>> 24);
			n = n + (1) >> 0;
			v = v1;
		}
		a.nd = 0;
		n = n - (1) >> 0;
		while (n >= 0) {
			(x$1 = a.d, x$2 = a.nd, (x$2 < 0 || x$2 >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[x$2] = ((n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n]));
			a.nd = a.nd + (1) >> 0;
			n = n - (1) >> 0;
		}
		a.dp = a.nd;
		trim(a);
	};
	decimal.prototype.Assign = function(v) { return this.$val.Assign(v); };
	rightShift = function(a, k) {
		var r, w, n, x, c, x$1, c$1, dig, y, x$2, dig$1, y$1, x$3;
		r = 0;
		w = 0;
		n = 0;
		while (((n >> $min(k, 31)) >> 0) === 0) {
			if (r >= a.nd) {
				if (n === 0) {
					a.nd = 0;
					return;
				}
				while (((n >> $min(k, 31)) >> 0) === 0) {
					n = (((n >>> 16 << 16) * 10 >> 0) + (n << 16 >>> 16) * 10) >> 0;
					r = r + (1) >> 0;
				}
				break;
			}
			c = ((x = a.d, ((r < 0 || r >= x.length) ? $throwRuntimeError("index out of range") : x[r])) >> 0);
			n = (((((n >>> 16 << 16) * 10 >> 0) + (n << 16 >>> 16) * 10) >> 0) + c >> 0) - 48 >> 0;
			r = r + (1) >> 0;
		}
		a.dp = a.dp - ((r - 1 >> 0)) >> 0;
		while (r < a.nd) {
			c$1 = ((x$1 = a.d, ((r < 0 || r >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[r])) >> 0);
			dig = (n >> $min(k, 31)) >> 0;
			n = n - (((y = k, y < 32 ? (dig << y) : 0) >> 0)) >> 0;
			(x$2 = a.d, (w < 0 || w >= x$2.length) ? $throwRuntimeError("index out of range") : x$2[w] = ((dig + 48 >> 0) << 24 >>> 24));
			w = w + (1) >> 0;
			n = (((((n >>> 16 << 16) * 10 >> 0) + (n << 16 >>> 16) * 10) >> 0) + c$1 >> 0) - 48 >> 0;
			r = r + (1) >> 0;
		}
		while (n > 0) {
			dig$1 = (n >> $min(k, 31)) >> 0;
			n = n - (((y$1 = k, y$1 < 32 ? (dig$1 << y$1) : 0) >> 0)) >> 0;
			if (w < 800) {
				(x$3 = a.d, (w < 0 || w >= x$3.length) ? $throwRuntimeError("index out of range") : x$3[w] = ((dig$1 + 48 >> 0) << 24 >>> 24));
				w = w + (1) >> 0;
			} else if (dig$1 > 0) {
				a.trunc = true;
			}
			n = (((n >>> 16 << 16) * 10 >> 0) + (n << 16 >>> 16) * 10) >> 0;
		}
		a.nd = w;
		trim(a);
	};
	prefixIsLessThan = function(b, s) {
		var i;
		i = 0;
		while (i < s.length) {
			if (i >= b.$length) {
				return true;
			}
			if (!((((i < 0 || i >= b.$length) ? $throwRuntimeError("index out of range") : b.$array[b.$offset + i]) === s.charCodeAt(i)))) {
				return ((i < 0 || i >= b.$length) ? $throwRuntimeError("index out of range") : b.$array[b.$offset + i]) < s.charCodeAt(i);
			}
			i = i + (1) >> 0;
		}
		return false;
	};
	leftShift = function(a, k) {
		var delta, r, w, n, y, x, _q, quo, rem, x$1, _q$1, quo$1, rem$1, x$2;
		delta = ((k < 0 || k >= leftcheats.$length) ? $throwRuntimeError("index out of range") : leftcheats.$array[leftcheats.$offset + k]).delta;
		if (prefixIsLessThan($subslice(new ($sliceType($Uint8))(a.d), 0, a.nd), ((k < 0 || k >= leftcheats.$length) ? $throwRuntimeError("index out of range") : leftcheats.$array[leftcheats.$offset + k]).cutoff)) {
			delta = delta - (1) >> 0;
		}
		r = a.nd;
		w = a.nd + delta >> 0;
		n = 0;
		r = r - (1) >> 0;
		while (r >= 0) {
			n = n + (((y = k, y < 32 ? (((((x = a.d, ((r < 0 || r >= x.length) ? $throwRuntimeError("index out of range") : x[r])) >> 0) - 48 >> 0)) << y) : 0) >> 0)) >> 0;
			quo = (_q = n / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			rem = n - ((((10 >>> 16 << 16) * quo >> 0) + (10 << 16 >>> 16) * quo) >> 0) >> 0;
			w = w - (1) >> 0;
			if (w < 800) {
				(x$1 = a.d, (w < 0 || w >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[w] = ((rem + 48 >> 0) << 24 >>> 24));
			} else if (!((rem === 0))) {
				a.trunc = true;
			}
			n = quo;
			r = r - (1) >> 0;
		}
		while (n > 0) {
			quo$1 = (_q$1 = n / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
			rem$1 = n - ((((10 >>> 16 << 16) * quo$1 >> 0) + (10 << 16 >>> 16) * quo$1) >> 0) >> 0;
			w = w - (1) >> 0;
			if (w < 800) {
				(x$2 = a.d, (w < 0 || w >= x$2.length) ? $throwRuntimeError("index out of range") : x$2[w] = ((rem$1 + 48 >> 0) << 24 >>> 24));
			} else if (!((rem$1 === 0))) {
				a.trunc = true;
			}
			n = quo$1;
		}
		a.nd = a.nd + (delta) >> 0;
		if (a.nd >= 800) {
			a.nd = 800;
		}
		a.dp = a.dp + (delta) >> 0;
		trim(a);
	};
	decimal.Ptr.prototype.Shift = function(k) {
		var a;
		a = this;
		if (a.nd === 0) {
		} else if (k > 0) {
			while (k > 27) {
				leftShift(a, 27);
				k = k - (27) >> 0;
			}
			leftShift(a, (k >>> 0));
		} else if (k < 0) {
			while (k < -27) {
				rightShift(a, 27);
				k = k + (27) >> 0;
			}
			rightShift(a, (-k >>> 0));
		}
	};
	decimal.prototype.Shift = function(k) { return this.$val.Shift(k); };
	shouldRoundUp = function(a, nd) {
		var x, _r, x$1, x$2, x$3;
		if (nd < 0 || nd >= a.nd) {
			return false;
		}
		if (((x = a.d, ((nd < 0 || nd >= x.length) ? $throwRuntimeError("index out of range") : x[nd])) === 53) && ((nd + 1 >> 0) === a.nd)) {
			if (a.trunc) {
				return true;
			}
			return nd > 0 && !(((_r = (((x$1 = a.d, x$2 = nd - 1 >> 0, ((x$2 < 0 || x$2 >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[x$2])) - 48 << 24 >>> 24)) % 2, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0));
		}
		return (x$3 = a.d, ((nd < 0 || nd >= x$3.length) ? $throwRuntimeError("index out of range") : x$3[nd])) >= 53;
	};
	decimal.Ptr.prototype.Round = function(nd) {
		var a;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		if (shouldRoundUp(a, nd)) {
			a.RoundUp(nd);
		} else {
			a.RoundDown(nd);
		}
	};
	decimal.prototype.Round = function(nd) { return this.$val.Round(nd); };
	decimal.Ptr.prototype.RoundDown = function(nd) {
		var a;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		a.nd = nd;
		trim(a);
	};
	decimal.prototype.RoundDown = function(nd) { return this.$val.RoundDown(nd); };
	decimal.Ptr.prototype.RoundUp = function(nd) {
		var a, i, x, c, _lhs, _index;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		i = nd - 1 >> 0;
		while (i >= 0) {
			c = (x = a.d, ((i < 0 || i >= x.length) ? $throwRuntimeError("index out of range") : x[i]));
			if (c < 57) {
				_lhs = a.d; _index = i; (_index < 0 || _index >= _lhs.length) ? $throwRuntimeError("index out of range") : _lhs[_index] = ((_index < 0 || _index >= _lhs.length) ? $throwRuntimeError("index out of range") : _lhs[_index]) + (1) << 24 >>> 24;
				a.nd = i + 1 >> 0;
				return;
			}
			i = i - (1) >> 0;
		}
		a.d[0] = 49;
		a.nd = 1;
		a.dp = a.dp + (1) >> 0;
	};
	decimal.prototype.RoundUp = function(nd) { return this.$val.RoundUp(nd); };
	decimal.Ptr.prototype.RoundedInteger = function() {
		var a, i, n, x, x$1, x$2, x$3;
		a = this;
		if (a.dp > 20) {
			return new $Uint64(4294967295, 4294967295);
		}
		i = 0;
		n = new $Uint64(0, 0);
		i = 0;
		while (i < a.dp && i < a.nd) {
			n = (x = $mul64(n, new $Uint64(0, 10)), x$1 = new $Uint64(0, ((x$2 = a.d, ((i < 0 || i >= x$2.length) ? $throwRuntimeError("index out of range") : x$2[i])) - 48 << 24 >>> 24)), new $Uint64(x.$high + x$1.$high, x.$low + x$1.$low));
			i = i + (1) >> 0;
		}
		while (i < a.dp) {
			n = $mul64(n, (new $Uint64(0, 10)));
			i = i + (1) >> 0;
		}
		if (shouldRoundUp(a, a.dp)) {
			n = (x$3 = new $Uint64(0, 1), new $Uint64(n.$high + x$3.$high, n.$low + x$3.$low));
		}
		return n;
	};
	decimal.prototype.RoundedInteger = function() { return this.$val.RoundedInteger(); };
	extFloat.Ptr.prototype.floatBits = function(flt) {
		var bits = new $Uint64(0, 0), overflow = false, f, exp, n, mant, x, x$1, x$2, x$3, x$4, y, x$5, x$6, y$1, x$7, x$8, x$9, y$2, x$10;
		f = this;
		f.Normalize();
		exp = f.exp + 63 >> 0;
		if (exp < (flt.bias + 1 >> 0)) {
			n = (flt.bias + 1 >> 0) - exp >> 0;
			f.mant = $shiftRightUint64(f.mant, ((n >>> 0)));
			exp = exp + (n) >> 0;
		}
		mant = $shiftRightUint64(f.mant, ((63 - flt.mantbits >>> 0)));
		if (!((x = (x$1 = f.mant, x$2 = $shiftLeft64(new $Uint64(0, 1), ((62 - flt.mantbits >>> 0))), new $Uint64(x$1.$high & x$2.$high, (x$1.$low & x$2.$low) >>> 0)), (x.$high === 0 && x.$low === 0)))) {
			mant = (x$3 = new $Uint64(0, 1), new $Uint64(mant.$high + x$3.$high, mant.$low + x$3.$low));
		}
		if ((x$4 = $shiftLeft64(new $Uint64(0, 2), flt.mantbits), (mant.$high === x$4.$high && mant.$low === x$4.$low))) {
			mant = $shiftRightUint64(mant, (1));
			exp = exp + (1) >> 0;
		}
		if ((exp - flt.bias >> 0) >= (((y = flt.expbits, y < 32 ? (1 << y) : 0) >> 0) - 1 >> 0)) {
			mant = new $Uint64(0, 0);
			exp = (((y$1 = flt.expbits, y$1 < 32 ? (1 << y$1) : 0) >> 0) - 1 >> 0) + flt.bias >> 0;
			overflow = true;
		} else if ((x$5 = (x$6 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(mant.$high & x$6.$high, (mant.$low & x$6.$low) >>> 0)), (x$5.$high === 0 && x$5.$low === 0))) {
			exp = flt.bias;
		}
		bits = (x$7 = (x$8 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(x$8.$high - 0, x$8.$low - 1)), new $Uint64(mant.$high & x$7.$high, (mant.$low & x$7.$low) >>> 0));
		bits = (x$9 = $shiftLeft64(new $Uint64(0, (((exp - flt.bias >> 0)) & ((((y$2 = flt.expbits, y$2 < 32 ? (1 << y$2) : 0) >> 0) - 1 >> 0)))), flt.mantbits), new $Uint64(bits.$high | x$9.$high, (bits.$low | x$9.$low) >>> 0));
		if (f.neg) {
			bits = (x$10 = $shiftLeft64(new $Uint64(0, 1), ((flt.mantbits + flt.expbits >>> 0))), new $Uint64(bits.$high | x$10.$high, (bits.$low | x$10.$low) >>> 0));
		}
		return [bits, overflow];
	};
	extFloat.prototype.floatBits = function(flt) { return this.$val.floatBits(flt); };
	extFloat.Ptr.prototype.AssignComputeBounds = function(mant, exp, neg, flt) {
		var lower = new extFloat.Ptr(), upper = new extFloat.Ptr(), f, x, _tmp, _tmp$1, expBiased, x$1, x$2, x$3, x$4;
		f = this;
		f.mant = mant;
		f.exp = exp - (flt.mantbits >> 0) >> 0;
		f.neg = neg;
		if (f.exp <= 0 && (x = $shiftLeft64(($shiftRightUint64(mant, (-f.exp >>> 0))), (-f.exp >>> 0)), (mant.$high === x.$high && mant.$low === x.$low))) {
			f.mant = $shiftRightUint64(f.mant, ((-f.exp >>> 0)));
			f.exp = 0;
			_tmp = new extFloat.Ptr(); $copy(_tmp, f, extFloat); _tmp$1 = new extFloat.Ptr(); $copy(_tmp$1, f, extFloat); $copy(lower, _tmp, extFloat); $copy(upper, _tmp$1, extFloat);
			return [lower, upper];
		}
		expBiased = exp - flt.bias >> 0;
		$copy(upper, new extFloat.Ptr((x$1 = $mul64(new $Uint64(0, 2), f.mant), new $Uint64(x$1.$high + 0, x$1.$low + 1)), f.exp - 1 >> 0, f.neg), extFloat);
		if (!((x$2 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), (mant.$high === x$2.$high && mant.$low === x$2.$low))) || (expBiased === 1)) {
			$copy(lower, new extFloat.Ptr((x$3 = $mul64(new $Uint64(0, 2), f.mant), new $Uint64(x$3.$high - 0, x$3.$low - 1)), f.exp - 1 >> 0, f.neg), extFloat);
		} else {
			$copy(lower, new extFloat.Ptr((x$4 = $mul64(new $Uint64(0, 4), f.mant), new $Uint64(x$4.$high - 0, x$4.$low - 1)), f.exp - 2 >> 0, f.neg), extFloat);
		}
		return [lower, upper];
	};
	extFloat.prototype.AssignComputeBounds = function(mant, exp, neg, flt) { return this.$val.AssignComputeBounds(mant, exp, neg, flt); };
	extFloat.Ptr.prototype.Normalize = function() {
		var shift = 0, f, _tmp, _tmp$1, mant, exp, x, x$1, x$2, x$3, x$4, x$5, _tmp$2, _tmp$3;
		f = this;
		_tmp = f.mant; _tmp$1 = f.exp; mant = _tmp; exp = _tmp$1;
		if ((mant.$high === 0 && mant.$low === 0)) {
			shift = 0;
			return shift;
		}
		if ((x = $shiftRightUint64(mant, 32), (x.$high === 0 && x.$low === 0))) {
			mant = $shiftLeft64(mant, (32));
			exp = exp - (32) >> 0;
		}
		if ((x$1 = $shiftRightUint64(mant, 48), (x$1.$high === 0 && x$1.$low === 0))) {
			mant = $shiftLeft64(mant, (16));
			exp = exp - (16) >> 0;
		}
		if ((x$2 = $shiftRightUint64(mant, 56), (x$2.$high === 0 && x$2.$low === 0))) {
			mant = $shiftLeft64(mant, (8));
			exp = exp - (8) >> 0;
		}
		if ((x$3 = $shiftRightUint64(mant, 60), (x$3.$high === 0 && x$3.$low === 0))) {
			mant = $shiftLeft64(mant, (4));
			exp = exp - (4) >> 0;
		}
		if ((x$4 = $shiftRightUint64(mant, 62), (x$4.$high === 0 && x$4.$low === 0))) {
			mant = $shiftLeft64(mant, (2));
			exp = exp - (2) >> 0;
		}
		if ((x$5 = $shiftRightUint64(mant, 63), (x$5.$high === 0 && x$5.$low === 0))) {
			mant = $shiftLeft64(mant, (1));
			exp = exp - (1) >> 0;
		}
		shift = ((f.exp - exp >> 0) >>> 0);
		_tmp$2 = mant; _tmp$3 = exp; f.mant = _tmp$2; f.exp = _tmp$3;
		return shift;
	};
	extFloat.prototype.Normalize = function() { return this.$val.Normalize(); };
	extFloat.Ptr.prototype.Multiply = function(g) {
		var f, _tmp, _tmp$1, fhi, flo, _tmp$2, _tmp$3, ghi, glo, cross1, cross2, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, rem, x$8, x$9, x$10;
		f = this;
		_tmp = $shiftRightUint64(f.mant, 32); _tmp$1 = new $Uint64(0, (f.mant.$low >>> 0)); fhi = _tmp; flo = _tmp$1;
		_tmp$2 = $shiftRightUint64(g.mant, 32); _tmp$3 = new $Uint64(0, (g.mant.$low >>> 0)); ghi = _tmp$2; glo = _tmp$3;
		cross1 = $mul64(fhi, glo);
		cross2 = $mul64(flo, ghi);
		f.mant = (x = (x$1 = $mul64(fhi, ghi), x$2 = $shiftRightUint64(cross1, 32), new $Uint64(x$1.$high + x$2.$high, x$1.$low + x$2.$low)), x$3 = $shiftRightUint64(cross2, 32), new $Uint64(x.$high + x$3.$high, x.$low + x$3.$low));
		rem = (x$4 = (x$5 = new $Uint64(0, (cross1.$low >>> 0)), x$6 = new $Uint64(0, (cross2.$low >>> 0)), new $Uint64(x$5.$high + x$6.$high, x$5.$low + x$6.$low)), x$7 = $shiftRightUint64(($mul64(flo, glo)), 32), new $Uint64(x$4.$high + x$7.$high, x$4.$low + x$7.$low));
		rem = (x$8 = new $Uint64(0, 2147483648), new $Uint64(rem.$high + x$8.$high, rem.$low + x$8.$low));
		f.mant = (x$9 = f.mant, x$10 = ($shiftRightUint64(rem, 32)), new $Uint64(x$9.$high + x$10.$high, x$9.$low + x$10.$low));
		f.exp = (f.exp + g.exp >> 0) + 64 >> 0;
	};
	extFloat.prototype.Multiply = function(g) { return this.$val.Multiply(g); };
	extFloat.Ptr.prototype.AssignDecimal = function(mantissa, exp10, neg, trunc, flt) {
		var ok = false, f, errors$1, _q, i, _r, adjExp, x, x$1, shift, y, denormalExp, extrabits, halfway, x$2, x$3, x$4, mant_extra, x$5, x$6, x$7, x$8, x$9, x$10, x$11, x$12;
		f = this;
		errors$1 = 0;
		if (trunc) {
			errors$1 = errors$1 + (4) >> 0;
		}
		f.mant = mantissa;
		f.exp = 0;
		f.neg = neg;
		i = (_q = ((exp10 - -348 >> 0)) / 8, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		if (exp10 < -348 || i >= 87) {
			ok = false;
			return ok;
		}
		adjExp = (_r = ((exp10 - -348 >> 0)) % 8, _r === _r ? _r : $throwRuntimeError("integer divide by zero"));
		if (adjExp < 19 && (x = (x$1 = 19 - adjExp >> 0, ((x$1 < 0 || x$1 >= uint64pow10.length) ? $throwRuntimeError("index out of range") : uint64pow10[x$1])), (mantissa.$high < x.$high || (mantissa.$high === x.$high && mantissa.$low < x.$low)))) {
			f.mant = $mul64(f.mant, (((adjExp < 0 || adjExp >= uint64pow10.length) ? $throwRuntimeError("index out of range") : uint64pow10[adjExp])));
			f.Normalize();
		} else {
			f.Normalize();
			f.Multiply($clone(((adjExp < 0 || adjExp >= smallPowersOfTen.length) ? $throwRuntimeError("index out of range") : smallPowersOfTen[adjExp]), extFloat));
			errors$1 = errors$1 + (4) >> 0;
		}
		f.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]), extFloat));
		if (errors$1 > 0) {
			errors$1 = errors$1 + (1) >> 0;
		}
		errors$1 = errors$1 + (4) >> 0;
		shift = f.Normalize();
		errors$1 = (y = (shift), y < 32 ? (errors$1 << y) : 0) >> 0;
		denormalExp = flt.bias - 63 >> 0;
		extrabits = 0;
		if (f.exp <= denormalExp) {
			extrabits = (((63 - flt.mantbits >>> 0) + 1 >>> 0) + ((denormalExp - f.exp >> 0) >>> 0) >>> 0);
		} else {
			extrabits = (63 - flt.mantbits >>> 0);
		}
		halfway = $shiftLeft64(new $Uint64(0, 1), ((extrabits - 1 >>> 0)));
		mant_extra = (x$2 = f.mant, x$3 = (x$4 = $shiftLeft64(new $Uint64(0, 1), extrabits), new $Uint64(x$4.$high - 0, x$4.$low - 1)), new $Uint64(x$2.$high & x$3.$high, (x$2.$low & x$3.$low) >>> 0));
		if ((x$5 = (x$6 = new $Int64(halfway.$high, halfway.$low), x$7 = new $Int64(0, errors$1), new $Int64(x$6.$high - x$7.$high, x$6.$low - x$7.$low)), x$8 = new $Int64(mant_extra.$high, mant_extra.$low), (x$5.$high < x$8.$high || (x$5.$high === x$8.$high && x$5.$low < x$8.$low))) && (x$9 = new $Int64(mant_extra.$high, mant_extra.$low), x$10 = (x$11 = new $Int64(halfway.$high, halfway.$low), x$12 = new $Int64(0, errors$1), new $Int64(x$11.$high + x$12.$high, x$11.$low + x$12.$low)), (x$9.$high < x$10.$high || (x$9.$high === x$10.$high && x$9.$low < x$10.$low)))) {
			ok = false;
			return ok;
		}
		ok = true;
		return ok;
	};
	extFloat.prototype.AssignDecimal = function(mantissa, exp10, neg, trunc, flt) { return this.$val.AssignDecimal(mantissa, exp10, neg, trunc, flt); };
	extFloat.Ptr.prototype.frexp10 = function() {
		var exp10 = 0, index = 0, f, _q, x, approxExp10, _q$1, i, exp, _tmp, _tmp$1;
		f = this;
		approxExp10 = (_q = (x = (-46 - f.exp >> 0), (((x >>> 16 << 16) * 28 >> 0) + (x << 16 >>> 16) * 28) >> 0) / 93, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		i = (_q$1 = ((approxExp10 - -348 >> 0)) / 8, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
		Loop:
		while (true) {
			exp = (f.exp + ((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]).exp >> 0) + 64 >> 0;
			if (exp < -60) {
				i = i + (1) >> 0;
			} else if (exp > -32) {
				i = i - (1) >> 0;
			} else {
				break Loop;
			}
		}
		f.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]), extFloat));
		_tmp = -((-348 + ((((i >>> 16 << 16) * 8 >> 0) + (i << 16 >>> 16) * 8) >> 0) >> 0)); _tmp$1 = i; exp10 = _tmp; index = _tmp$1;
		return [exp10, index];
	};
	extFloat.prototype.frexp10 = function() { return this.$val.frexp10(); };
	frexp10Many = function(a, b, c) {
		var exp10 = 0, _tuple, i;
		_tuple = c.frexp10(); exp10 = _tuple[0]; i = _tuple[1];
		a.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]), extFloat));
		b.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]), extFloat));
		return exp10;
	};
	extFloat.Ptr.prototype.FixedDecimal = function(d, n) {
		var f, x, _tuple, exp10, shift, integer, x$1, x$2, fraction, nonAsciiName, needed, integerDigits, pow10, _tmp, _tmp$1, i, pow, x$3, rest, x$4, _q, x$5, buf, pos, v, _q$1, v1, i$1, x$6, x$7, nd, x$8, x$9, digit, x$10, x$11, x$12, ok, i$2, x$13;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			d.nd = 0;
			d.dp = 0;
			d.neg = f.neg;
			return true;
		}
		if (n === 0) {
			$panic(new $String("strconv: internal error: extFloat.FixedDecimal called with n == 0"));
		}
		f.Normalize();
		_tuple = f.frexp10(); exp10 = _tuple[0];
		shift = (-f.exp >>> 0);
		integer = ($shiftRightUint64(f.mant, shift).$low >>> 0);
		fraction = (x$1 = f.mant, x$2 = $shiftLeft64(new $Uint64(0, integer), shift), new $Uint64(x$1.$high - x$2.$high, x$1.$low - x$2.$low));
		nonAsciiName = new $Uint64(0, 1);
		needed = n;
		integerDigits = 0;
		pow10 = new $Uint64(0, 1);
		_tmp = 0; _tmp$1 = new $Uint64(0, 1); i = _tmp; pow = _tmp$1;
		while (i < 20) {
			if ((x$3 = new $Uint64(0, integer), (pow.$high > x$3.$high || (pow.$high === x$3.$high && pow.$low > x$3.$low)))) {
				integerDigits = i;
				break;
			}
			pow = $mul64(pow, (new $Uint64(0, 10)));
			i = i + (1) >> 0;
		}
		rest = integer;
		if (integerDigits > needed) {
			pow10 = (x$4 = integerDigits - needed >> 0, ((x$4 < 0 || x$4 >= uint64pow10.length) ? $throwRuntimeError("index out of range") : uint64pow10[x$4]));
			integer = (_q = integer / ((pow10.$low >>> 0)), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			rest = rest - ((x$5 = (pow10.$low >>> 0), (((integer >>> 16 << 16) * x$5 >>> 0) + (integer << 16 >>> 16) * x$5) >>> 0)) >>> 0;
		} else {
			rest = 0;
		}
		buf = ($arrayType($Uint8, 32)).zero(); $copy(buf, ($arrayType($Uint8, 32)).zero(), ($arrayType($Uint8, 32)));
		pos = 32;
		v = integer;
		while (v > 0) {
			v1 = (_q$1 = v / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
			v = v - (((((10 >>> 16 << 16) * v1 >>> 0) + (10 << 16 >>> 16) * v1) >>> 0)) >>> 0;
			pos = pos - (1) >> 0;
			(pos < 0 || pos >= buf.length) ? $throwRuntimeError("index out of range") : buf[pos] = ((v + 48 >>> 0) << 24 >>> 24);
			v = v1;
		}
		i$1 = pos;
		while (i$1 < 32) {
			(x$6 = d.d, x$7 = i$1 - pos >> 0, (x$7 < 0 || x$7 >= x$6.$length) ? $throwRuntimeError("index out of range") : x$6.$array[x$6.$offset + x$7] = ((i$1 < 0 || i$1 >= buf.length) ? $throwRuntimeError("index out of range") : buf[i$1]));
			i$1 = i$1 + (1) >> 0;
		}
		nd = 32 - pos >> 0;
		d.nd = nd;
		d.dp = integerDigits + exp10 >> 0;
		needed = needed - (nd) >> 0;
		if (needed > 0) {
			if (!((rest === 0)) || !((pow10.$high === 0 && pow10.$low === 1))) {
				$panic(new $String("strconv: internal error, rest != 0 but needed > 0"));
			}
			while (needed > 0) {
				fraction = $mul64(fraction, (new $Uint64(0, 10)));
				nonAsciiName = $mul64(nonAsciiName, (new $Uint64(0, 10)));
				if ((x$8 = $mul64(new $Uint64(0, 2), nonAsciiName), x$9 = $shiftLeft64(new $Uint64(0, 1), shift), (x$8.$high > x$9.$high || (x$8.$high === x$9.$high && x$8.$low > x$9.$low)))) {
					return false;
				}
				digit = $shiftRightUint64(fraction, shift);
				(x$10 = d.d, (nd < 0 || nd >= x$10.$length) ? $throwRuntimeError("index out of range") : x$10.$array[x$10.$offset + nd] = (new $Uint64(digit.$high + 0, digit.$low + 48).$low << 24 >>> 24));
				fraction = (x$11 = $shiftLeft64(digit, shift), new $Uint64(fraction.$high - x$11.$high, fraction.$low - x$11.$low));
				nd = nd + (1) >> 0;
				needed = needed - (1) >> 0;
			}
			d.nd = nd;
		}
		ok = adjustLastDigitFixed(d, (x$12 = $shiftLeft64(new $Uint64(0, rest), shift), new $Uint64(x$12.$high | fraction.$high, (x$12.$low | fraction.$low) >>> 0)), pow10, shift, nonAsciiName);
		if (!ok) {
			return false;
		}
		i$2 = d.nd - 1 >> 0;
		while (i$2 >= 0) {
			if (!(((x$13 = d.d, ((i$2 < 0 || i$2 >= x$13.$length) ? $throwRuntimeError("index out of range") : x$13.$array[x$13.$offset + i$2])) === 48))) {
				d.nd = i$2 + 1 >> 0;
				break;
			}
			i$2 = i$2 - (1) >> 0;
		}
		return true;
	};
	extFloat.prototype.FixedDecimal = function(d, n) { return this.$val.FixedDecimal(d, n); };
	adjustLastDigitFixed = function(d, num, den, shift, nonAsciiName) {
		var x, x$1, x$2, x$3, x$4, x$5, x$6, i, x$7, x$8, _lhs, _index;
		if ((x = $shiftLeft64(den, shift), (num.$high > x.$high || (num.$high === x.$high && num.$low > x.$low)))) {
			$panic(new $String("strconv: num > den<<shift in adjustLastDigitFixed"));
		}
		if ((x$1 = $mul64(new $Uint64(0, 2), nonAsciiName), x$2 = $shiftLeft64(den, shift), (x$1.$high > x$2.$high || (x$1.$high === x$2.$high && x$1.$low > x$2.$low)))) {
			$panic(new $String("strconv: \xCE\xB5 > (den<<shift)/2"));
		}
		if ((x$3 = $mul64(new $Uint64(0, 2), (new $Uint64(num.$high + nonAsciiName.$high, num.$low + nonAsciiName.$low))), x$4 = $shiftLeft64(den, shift), (x$3.$high < x$4.$high || (x$3.$high === x$4.$high && x$3.$low < x$4.$low)))) {
			return true;
		}
		if ((x$5 = $mul64(new $Uint64(0, 2), (new $Uint64(num.$high - nonAsciiName.$high, num.$low - nonAsciiName.$low))), x$6 = $shiftLeft64(den, shift), (x$5.$high > x$6.$high || (x$5.$high === x$6.$high && x$5.$low > x$6.$low)))) {
			i = d.nd - 1 >> 0;
			while (i >= 0) {
				if ((x$7 = d.d, ((i < 0 || i >= x$7.$length) ? $throwRuntimeError("index out of range") : x$7.$array[x$7.$offset + i])) === 57) {
					d.nd = d.nd - (1) >> 0;
				} else {
					break;
				}
				i = i - (1) >> 0;
			}
			if (i < 0) {
				(x$8 = d.d, (0 < 0 || 0 >= x$8.$length) ? $throwRuntimeError("index out of range") : x$8.$array[x$8.$offset + 0] = 49);
				d.nd = 1;
				d.dp = d.dp + (1) >> 0;
			} else {
				_lhs = d.d; _index = i; (_index < 0 || _index >= _lhs.$length) ? $throwRuntimeError("index out of range") : _lhs.$array[_lhs.$offset + _index] = ((_index < 0 || _index >= _lhs.$length) ? $throwRuntimeError("index out of range") : _lhs.$array[_lhs.$offset + _index]) + (1) << 24 >>> 24;
			}
			return true;
		}
		return false;
	};
	extFloat.Ptr.prototype.ShortestDecimal = function(d, lower, upper) {
		var f, x, buf, n, v, v1, x$1, nd, i, x$2, x$3, _tmp, _tmp$1, x$4, x$5, exp10, x$6, x$7, x$8, x$9, shift, integer, x$10, x$11, fraction, x$12, x$13, allowance, x$14, x$15, targetDiff, integerDigits, _tmp$2, _tmp$3, i$1, pow, x$16, i$2, x$17, pow$1, _q, digit, x$18, x$19, x$20, currentDiff, digit$1, multiplier, x$21, x$22, x$23, x$24;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			d.nd = 0;
			d.dp = 0;
			d.neg = f.neg;
			return true;
		}
		if ((f.exp === 0) && $equal(lower, f, extFloat) && $equal(lower, upper, extFloat)) {
			buf = ($arrayType($Uint8, 24)).zero(); $copy(buf, ($arrayType($Uint8, 24)).zero(), ($arrayType($Uint8, 24)));
			n = 23;
			v = f.mant;
			while ((v.$high > 0 || (v.$high === 0 && v.$low > 0))) {
				v1 = $div64(v, new $Uint64(0, 10), false);
				v = (x$1 = $mul64(new $Uint64(0, 10), v1), new $Uint64(v.$high - x$1.$high, v.$low - x$1.$low));
				(n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n] = (new $Uint64(v.$high + 0, v.$low + 48).$low << 24 >>> 24);
				n = n - (1) >> 0;
				v = v1;
			}
			nd = (24 - n >> 0) - 1 >> 0;
			i = 0;
			while (i < nd) {
				(x$3 = d.d, (i < 0 || i >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + i] = (x$2 = (n + 1 >> 0) + i >> 0, ((x$2 < 0 || x$2 >= buf.length) ? $throwRuntimeError("index out of range") : buf[x$2])));
				i = i + (1) >> 0;
			}
			_tmp = nd; _tmp$1 = nd; d.nd = _tmp; d.dp = _tmp$1;
			while (d.nd > 0 && ((x$4 = d.d, x$5 = d.nd - 1 >> 0, ((x$5 < 0 || x$5 >= x$4.$length) ? $throwRuntimeError("index out of range") : x$4.$array[x$4.$offset + x$5])) === 48)) {
				d.nd = d.nd - (1) >> 0;
			}
			if (d.nd === 0) {
				d.dp = 0;
			}
			d.neg = f.neg;
			return true;
		}
		upper.Normalize();
		if (f.exp > upper.exp) {
			f.mant = $shiftLeft64(f.mant, (((f.exp - upper.exp >> 0) >>> 0)));
			f.exp = upper.exp;
		}
		if (lower.exp > upper.exp) {
			lower.mant = $shiftLeft64(lower.mant, (((lower.exp - upper.exp >> 0) >>> 0)));
			lower.exp = upper.exp;
		}
		exp10 = frexp10Many(lower, f, upper);
		upper.mant = (x$6 = upper.mant, x$7 = new $Uint64(0, 1), new $Uint64(x$6.$high + x$7.$high, x$6.$low + x$7.$low));
		lower.mant = (x$8 = lower.mant, x$9 = new $Uint64(0, 1), new $Uint64(x$8.$high - x$9.$high, x$8.$low - x$9.$low));
		shift = (-upper.exp >>> 0);
		integer = ($shiftRightUint64(upper.mant, shift).$low >>> 0);
		fraction = (x$10 = upper.mant, x$11 = $shiftLeft64(new $Uint64(0, integer), shift), new $Uint64(x$10.$high - x$11.$high, x$10.$low - x$11.$low));
		allowance = (x$12 = upper.mant, x$13 = lower.mant, new $Uint64(x$12.$high - x$13.$high, x$12.$low - x$13.$low));
		targetDiff = (x$14 = upper.mant, x$15 = f.mant, new $Uint64(x$14.$high - x$15.$high, x$14.$low - x$15.$low));
		integerDigits = 0;
		_tmp$2 = 0; _tmp$3 = new $Uint64(0, 1); i$1 = _tmp$2; pow = _tmp$3;
		while (i$1 < 20) {
			if ((x$16 = new $Uint64(0, integer), (pow.$high > x$16.$high || (pow.$high === x$16.$high && pow.$low > x$16.$low)))) {
				integerDigits = i$1;
				break;
			}
			pow = $mul64(pow, (new $Uint64(0, 10)));
			i$1 = i$1 + (1) >> 0;
		}
		i$2 = 0;
		while (i$2 < integerDigits) {
			pow$1 = (x$17 = (integerDigits - i$2 >> 0) - 1 >> 0, ((x$17 < 0 || x$17 >= uint64pow10.length) ? $throwRuntimeError("index out of range") : uint64pow10[x$17]));
			digit = (_q = integer / (pow$1.$low >>> 0), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			(x$18 = d.d, (i$2 < 0 || i$2 >= x$18.$length) ? $throwRuntimeError("index out of range") : x$18.$array[x$18.$offset + i$2] = ((digit + 48 >>> 0) << 24 >>> 24));
			integer = integer - ((x$19 = (pow$1.$low >>> 0), (((digit >>> 16 << 16) * x$19 >>> 0) + (digit << 16 >>> 16) * x$19) >>> 0)) >>> 0;
			currentDiff = (x$20 = $shiftLeft64(new $Uint64(0, integer), shift), new $Uint64(x$20.$high + fraction.$high, x$20.$low + fraction.$low));
			if ((currentDiff.$high < allowance.$high || (currentDiff.$high === allowance.$high && currentDiff.$low < allowance.$low))) {
				d.nd = i$2 + 1 >> 0;
				d.dp = integerDigits + exp10 >> 0;
				d.neg = f.neg;
				return adjustLastDigit(d, currentDiff, targetDiff, allowance, $shiftLeft64(pow$1, shift), new $Uint64(0, 2));
			}
			i$2 = i$2 + (1) >> 0;
		}
		d.nd = integerDigits;
		d.dp = d.nd + exp10 >> 0;
		d.neg = f.neg;
		digit$1 = 0;
		multiplier = new $Uint64(0, 1);
		while (true) {
			fraction = $mul64(fraction, (new $Uint64(0, 10)));
			multiplier = $mul64(multiplier, (new $Uint64(0, 10)));
			digit$1 = ($shiftRightUint64(fraction, shift).$low >> 0);
			(x$21 = d.d, x$22 = d.nd, (x$22 < 0 || x$22 >= x$21.$length) ? $throwRuntimeError("index out of range") : x$21.$array[x$21.$offset + x$22] = ((digit$1 + 48 >> 0) << 24 >>> 24));
			d.nd = d.nd + (1) >> 0;
			fraction = (x$23 = $shiftLeft64(new $Uint64(0, digit$1), shift), new $Uint64(fraction.$high - x$23.$high, fraction.$low - x$23.$low));
			if ((x$24 = $mul64(allowance, multiplier), (fraction.$high < x$24.$high || (fraction.$high === x$24.$high && fraction.$low < x$24.$low)))) {
				return adjustLastDigit(d, fraction, $mul64(targetDiff, multiplier), $mul64(allowance, multiplier), $shiftLeft64(new $Uint64(0, 1), shift), $mul64(multiplier, new $Uint64(0, 2)));
			}
		}
	};
	extFloat.prototype.ShortestDecimal = function(d, lower, upper) { return this.$val.ShortestDecimal(d, lower, upper); };
	adjustLastDigit = function(d, currentDiff, targetDiff, maxDiff, ulpDecimal, ulpBinary) {
		var x, x$1, x$2, x$3, _lhs, _index, x$4, x$5, x$6, x$7, x$8, x$9, x$10;
		if ((x = $mul64(new $Uint64(0, 2), ulpBinary), (ulpDecimal.$high < x.$high || (ulpDecimal.$high === x.$high && ulpDecimal.$low < x.$low)))) {
			return false;
		}
		while ((x$1 = (x$2 = (x$3 = $div64(ulpDecimal, new $Uint64(0, 2), false), new $Uint64(currentDiff.$high + x$3.$high, currentDiff.$low + x$3.$low)), new $Uint64(x$2.$high + ulpBinary.$high, x$2.$low + ulpBinary.$low)), (x$1.$high < targetDiff.$high || (x$1.$high === targetDiff.$high && x$1.$low < targetDiff.$low)))) {
			_lhs = d.d; _index = d.nd - 1 >> 0; (_index < 0 || _index >= _lhs.$length) ? $throwRuntimeError("index out of range") : _lhs.$array[_lhs.$offset + _index] = ((_index < 0 || _index >= _lhs.$length) ? $throwRuntimeError("index out of range") : _lhs.$array[_lhs.$offset + _index]) - (1) << 24 >>> 24;
			currentDiff = (x$4 = ulpDecimal, new $Uint64(currentDiff.$high + x$4.$high, currentDiff.$low + x$4.$low));
		}
		if ((x$5 = new $Uint64(currentDiff.$high + ulpDecimal.$high, currentDiff.$low + ulpDecimal.$low), x$6 = (x$7 = (x$8 = $div64(ulpDecimal, new $Uint64(0, 2), false), new $Uint64(targetDiff.$high + x$8.$high, targetDiff.$low + x$8.$low)), new $Uint64(x$7.$high + ulpBinary.$high, x$7.$low + ulpBinary.$low)), (x$5.$high < x$6.$high || (x$5.$high === x$6.$high && x$5.$low <= x$6.$low)))) {
			return false;
		}
		if ((currentDiff.$high < ulpBinary.$high || (currentDiff.$high === ulpBinary.$high && currentDiff.$low < ulpBinary.$low)) || (x$9 = new $Uint64(maxDiff.$high - ulpBinary.$high, maxDiff.$low - ulpBinary.$low), (currentDiff.$high > x$9.$high || (currentDiff.$high === x$9.$high && currentDiff.$low > x$9.$low)))) {
			return false;
		}
		if ((d.nd === 1) && ((x$10 = d.d, ((0 < 0 || 0 >= x$10.$length) ? $throwRuntimeError("index out of range") : x$10.$array[x$10.$offset + 0])) === 48)) {
			d.nd = 0;
			d.dp = 0;
		}
		return true;
	};
	AppendFloat = $pkg.AppendFloat = function(dst, f, fmt, prec, bitSize) {
		return genericFtoa(dst, f, fmt, prec, bitSize);
	};
	genericFtoa = function(dst, val, fmt, prec, bitSize) {
		var bits, flt, _ref, x, neg, y, exp, x$1, x$2, mant, _ref$1, y$1, s, x$3, digs, ok, shortest, f, _tuple, lower, upper, buf, _ref$2, digits, _ref$3, buf$1, f$1;
		bits = new $Uint64(0, 0);
		flt = ($ptrType(floatInfo)).nil;
		_ref = bitSize;
		if (_ref === 32) {
			bits = new $Uint64(0, math.Float32bits(val));
			flt = float32info;
		} else if (_ref === 64) {
			bits = math.Float64bits(val);
			flt = float64info;
		} else {
			$panic(new $String("strconv: illegal AppendFloat/FormatFloat bitSize"));
		}
		neg = !((x = $shiftRightUint64(bits, ((flt.expbits + flt.mantbits >>> 0))), (x.$high === 0 && x.$low === 0)));
		exp = ($shiftRightUint64(bits, flt.mantbits).$low >> 0) & ((((y = flt.expbits, y < 32 ? (1 << y) : 0) >> 0) - 1 >> 0));
		mant = (x$1 = (x$2 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(x$2.$high - 0, x$2.$low - 1)), new $Uint64(bits.$high & x$1.$high, (bits.$low & x$1.$low) >>> 0));
		_ref$1 = exp;
		if (_ref$1 === (((y$1 = flt.expbits, y$1 < 32 ? (1 << y$1) : 0) >> 0) - 1 >> 0)) {
			s = "";
			if (!((mant.$high === 0 && mant.$low === 0))) {
				s = "NaN";
			} else if (neg) {
				s = "-Inf";
			} else {
				s = "+Inf";
			}
			return $appendSlice(dst, new ($sliceType($Uint8))($stringToBytes(s)));
		} else if (_ref$1 === 0) {
			exp = exp + (1) >> 0;
		} else {
			mant = (x$3 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(mant.$high | x$3.$high, (mant.$low | x$3.$low) >>> 0));
		}
		exp = exp + (flt.bias) >> 0;
		if (fmt === 98) {
			return fmtB(dst, neg, mant, exp, flt);
		}
		if (!optimize) {
			return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
		}
		digs = new decimalSlice.Ptr(); $copy(digs, new decimalSlice.Ptr(), decimalSlice);
		ok = false;
		shortest = prec < 0;
		if (shortest) {
			f = new extFloat.Ptr();
			_tuple = f.AssignComputeBounds(mant, exp, neg, flt); lower = new extFloat.Ptr(); $copy(lower, _tuple[0], extFloat); upper = new extFloat.Ptr(); $copy(upper, _tuple[1], extFloat);
			buf = ($arrayType($Uint8, 32)).zero(); $copy(buf, ($arrayType($Uint8, 32)).zero(), ($arrayType($Uint8, 32)));
			digs.d = new ($sliceType($Uint8))(buf);
			ok = f.ShortestDecimal(digs, lower, upper);
			if (!ok) {
				return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
			}
			_ref$2 = fmt;
			if (_ref$2 === 101 || _ref$2 === 69) {
				prec = digs.nd - 1 >> 0;
			} else if (_ref$2 === 102) {
				prec = max(digs.nd - digs.dp >> 0, 0);
			} else if (_ref$2 === 103 || _ref$2 === 71) {
				prec = digs.nd;
			}
		} else if (!((fmt === 102))) {
			digits = prec;
			_ref$3 = fmt;
			if (_ref$3 === 101 || _ref$3 === 69) {
				digits = digits + (1) >> 0;
			} else if (_ref$3 === 103 || _ref$3 === 71) {
				if (prec === 0) {
					prec = 1;
				}
				digits = prec;
			}
			if (digits <= 15) {
				buf$1 = ($arrayType($Uint8, 24)).zero(); $copy(buf$1, ($arrayType($Uint8, 24)).zero(), ($arrayType($Uint8, 24)));
				digs.d = new ($sliceType($Uint8))(buf$1);
				f$1 = new extFloat.Ptr(mant, exp - (flt.mantbits >> 0) >> 0, neg);
				ok = f$1.FixedDecimal(digs, digits);
			}
		}
		if (!ok) {
			return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
		}
		return formatDigits(dst, shortest, neg, $clone(digs, decimalSlice), prec, fmt);
	};
	bigFtoa = function(dst, prec, fmt, neg, mant, exp, flt) {
		var d, digs, shortest, _ref, _ref$1;
		d = new decimal.Ptr();
		d.Assign(mant);
		d.Shift(exp - (flt.mantbits >> 0) >> 0);
		digs = new decimalSlice.Ptr(); $copy(digs, new decimalSlice.Ptr(), decimalSlice);
		shortest = prec < 0;
		if (shortest) {
			roundShortest(d, mant, exp, flt);
			$copy(digs, new decimalSlice.Ptr(new ($sliceType($Uint8))(d.d), d.nd, d.dp, false), decimalSlice);
			_ref = fmt;
			if (_ref === 101 || _ref === 69) {
				prec = digs.nd - 1 >> 0;
			} else if (_ref === 102) {
				prec = max(digs.nd - digs.dp >> 0, 0);
			} else if (_ref === 103 || _ref === 71) {
				prec = digs.nd;
			}
		} else {
			_ref$1 = fmt;
			if (_ref$1 === 101 || _ref$1 === 69) {
				d.Round(prec + 1 >> 0);
			} else if (_ref$1 === 102) {
				d.Round(d.dp + prec >> 0);
			} else if (_ref$1 === 103 || _ref$1 === 71) {
				if (prec === 0) {
					prec = 1;
				}
				d.Round(prec);
			}
			$copy(digs, new decimalSlice.Ptr(new ($sliceType($Uint8))(d.d), d.nd, d.dp, false), decimalSlice);
		}
		return formatDigits(dst, shortest, neg, $clone(digs, decimalSlice), prec, fmt);
	};
	formatDigits = function(dst, shortest, neg, digs, prec, fmt) {
		var _ref, eprec, exp;
		_ref = fmt;
		if (_ref === 101 || _ref === 69) {
			return fmtE(dst, neg, $clone(digs, decimalSlice), prec, fmt);
		} else if (_ref === 102) {
			return fmtF(dst, neg, $clone(digs, decimalSlice), prec);
		} else if (_ref === 103 || _ref === 71) {
			eprec = prec;
			if (eprec > digs.nd && digs.nd >= digs.dp) {
				eprec = digs.nd;
			}
			if (shortest) {
				eprec = 6;
			}
			exp = digs.dp - 1 >> 0;
			if (exp < -4 || exp >= eprec) {
				if (prec > digs.nd) {
					prec = digs.nd;
				}
				return fmtE(dst, neg, $clone(digs, decimalSlice), prec - 1 >> 0, (fmt + 101 << 24 >>> 24) - 103 << 24 >>> 24);
			}
			if (prec > digs.dp) {
				prec = digs.nd;
			}
			return fmtF(dst, neg, $clone(digs, decimalSlice), max(prec - digs.dp >> 0, 0));
		}
		return $append(dst, 37, fmt);
	};
	roundShortest = function(d, mant, exp, flt) {
		var minexp, x, x$1, upper, x$2, mantlo, explo, x$3, x$4, lower, x$5, x$6, inclusive, i, _tmp, _tmp$1, _tmp$2, l, m, u, x$7, x$8, x$9, okdown, okup;
		if ((mant.$high === 0 && mant.$low === 0)) {
			d.nd = 0;
			return;
		}
		minexp = flt.bias + 1 >> 0;
		if (exp > minexp && (x = (d.dp - d.nd >> 0), (((332 >>> 16 << 16) * x >> 0) + (332 << 16 >>> 16) * x) >> 0) >= (x$1 = (exp - (flt.mantbits >> 0) >> 0), (((100 >>> 16 << 16) * x$1 >> 0) + (100 << 16 >>> 16) * x$1) >> 0)) {
			return;
		}
		upper = new decimal.Ptr();
		upper.Assign((x$2 = $mul64(mant, new $Uint64(0, 2)), new $Uint64(x$2.$high + 0, x$2.$low + 1)));
		upper.Shift((exp - (flt.mantbits >> 0) >> 0) - 1 >> 0);
		mantlo = new $Uint64(0, 0);
		explo = 0;
		if ((x$3 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), (mant.$high > x$3.$high || (mant.$high === x$3.$high && mant.$low > x$3.$low))) || (exp === minexp)) {
			mantlo = new $Uint64(mant.$high - 0, mant.$low - 1);
			explo = exp;
		} else {
			mantlo = (x$4 = $mul64(mant, new $Uint64(0, 2)), new $Uint64(x$4.$high - 0, x$4.$low - 1));
			explo = exp - 1 >> 0;
		}
		lower = new decimal.Ptr();
		lower.Assign((x$5 = $mul64(mantlo, new $Uint64(0, 2)), new $Uint64(x$5.$high + 0, x$5.$low + 1)));
		lower.Shift((explo - (flt.mantbits >> 0) >> 0) - 1 >> 0);
		inclusive = (x$6 = $div64(mant, new $Uint64(0, 2), true), (x$6.$high === 0 && x$6.$low === 0));
		i = 0;
		while (i < d.nd) {
			_tmp = 0; _tmp$1 = 0; _tmp$2 = 0; l = _tmp; m = _tmp$1; u = _tmp$2;
			if (i < lower.nd) {
				l = (x$7 = lower.d, ((i < 0 || i >= x$7.length) ? $throwRuntimeError("index out of range") : x$7[i]));
			} else {
				l = 48;
			}
			m = (x$8 = d.d, ((i < 0 || i >= x$8.length) ? $throwRuntimeError("index out of range") : x$8[i]));
			if (i < upper.nd) {
				u = (x$9 = upper.d, ((i < 0 || i >= x$9.length) ? $throwRuntimeError("index out of range") : x$9[i]));
			} else {
				u = 48;
			}
			okdown = !((l === m)) || (inclusive && (l === m) && ((i + 1 >> 0) === lower.nd));
			okup = !((m === u)) && (inclusive || (m + 1 << 24 >>> 24) < u || (i + 1 >> 0) < upper.nd);
			if (okdown && okup) {
				d.Round(i + 1 >> 0);
				return;
			} else if (okdown) {
				d.RoundDown(i + 1 >> 0);
				return;
			} else if (okup) {
				d.RoundUp(i + 1 >> 0);
				return;
			}
			i = i + (1) >> 0;
		}
	};
	fmtE = function(dst, neg, d, prec, fmt) {
		var ch, x, i, m, x$1, exp, buf, i$1, _r, _q, _ref;
		if (neg) {
			dst = $append(dst, 45);
		}
		ch = 48;
		if (!((d.nd === 0))) {
			ch = (x = d.d, ((0 < 0 || 0 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + 0]));
		}
		dst = $append(dst, ch);
		if (prec > 0) {
			dst = $append(dst, 46);
			i = 1;
			m = ((d.nd + prec >> 0) + 1 >> 0) - max(d.nd, prec + 1 >> 0) >> 0;
			while (i < m) {
				dst = $append(dst, (x$1 = d.d, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i])));
				i = i + (1) >> 0;
			}
			while (i <= prec) {
				dst = $append(dst, 48);
				i = i + (1) >> 0;
			}
		}
		dst = $append(dst, fmt);
		exp = d.dp - 1 >> 0;
		if (d.nd === 0) {
			exp = 0;
		}
		if (exp < 0) {
			ch = 45;
			exp = -exp;
		} else {
			ch = 43;
		}
		dst = $append(dst, ch);
		buf = ($arrayType($Uint8, 3)).zero(); $copy(buf, ($arrayType($Uint8, 3)).zero(), ($arrayType($Uint8, 3)));
		i$1 = 3;
		while (exp >= 10) {
			i$1 = i$1 - (1) >> 0;
			(i$1 < 0 || i$1 >= buf.length) ? $throwRuntimeError("index out of range") : buf[i$1] = (((_r = exp % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >> 0) << 24 >>> 24);
			exp = (_q = exp / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		}
		i$1 = i$1 - (1) >> 0;
		(i$1 < 0 || i$1 >= buf.length) ? $throwRuntimeError("index out of range") : buf[i$1] = ((exp + 48 >> 0) << 24 >>> 24);
		_ref = i$1;
		if (_ref === 0) {
			dst = $append(dst, buf[0], buf[1], buf[2]);
		} else if (_ref === 1) {
			dst = $append(dst, buf[1], buf[2]);
		} else if (_ref === 2) {
			dst = $append(dst, 48, buf[2]);
		}
		return dst;
	};
	fmtF = function(dst, neg, d, prec) {
		var i, x, i$1, ch, j, x$1;
		if (neg) {
			dst = $append(dst, 45);
		}
		if (d.dp > 0) {
			i = 0;
			i = 0;
			while (i < d.dp && i < d.nd) {
				dst = $append(dst, (x = d.d, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])));
				i = i + (1) >> 0;
			}
			while (i < d.dp) {
				dst = $append(dst, 48);
				i = i + (1) >> 0;
			}
		} else {
			dst = $append(dst, 48);
		}
		if (prec > 0) {
			dst = $append(dst, 46);
			i$1 = 0;
			while (i$1 < prec) {
				ch = 48;
				j = d.dp + i$1 >> 0;
				if (0 <= j && j < d.nd) {
					ch = (x$1 = d.d, ((j < 0 || j >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + j]));
				}
				dst = $append(dst, ch);
				i$1 = i$1 + (1) >> 0;
			}
		}
		return dst;
	};
	fmtB = function(dst, neg, mant, exp, flt) {
		var buf, w, esign, n, _r, _q, x;
		buf = ($arrayType($Uint8, 50)).zero(); $copy(buf, ($arrayType($Uint8, 50)).zero(), ($arrayType($Uint8, 50)));
		w = 50;
		exp = exp - ((flt.mantbits >> 0)) >> 0;
		esign = 43;
		if (exp < 0) {
			esign = 45;
			exp = -exp;
		}
		n = 0;
		while (exp > 0 || n < 1) {
			n = n + (1) >> 0;
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = (((_r = exp % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >> 0) << 24 >>> 24);
			exp = (_q = exp / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		}
		w = w - (1) >> 0;
		(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = esign;
		w = w - (1) >> 0;
		(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 112;
		n = 0;
		while ((mant.$high > 0 || (mant.$high === 0 && mant.$low > 0)) || n < 1) {
			n = n + (1) >> 0;
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = ((x = $div64(mant, new $Uint64(0, 10), true), new $Uint64(x.$high + 0, x.$low + 48)).$low << 24 >>> 24);
			mant = $div64(mant, (new $Uint64(0, 10)), false);
		}
		if (neg) {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 45;
		}
		return $appendSlice(dst, $subslice(new ($sliceType($Uint8))(buf), w));
	};
	max = function(a, b) {
		if (a > b) {
			return a;
		}
		return b;
	};
	FormatInt = $pkg.FormatInt = function(i, base) {
		var _tuple, s;
		_tuple = formatBits(($sliceType($Uint8)).nil, new $Uint64(i.$high, i.$low), base, (i.$high < 0 || (i.$high === 0 && i.$low < 0)), false); s = _tuple[1];
		return s;
	};
	Itoa = $pkg.Itoa = function(i) {
		return FormatInt(new $Int64(0, i), 10);
	};
	formatBits = function(dst, u, base, neg, append_) {
		var d = ($sliceType($Uint8)).nil, s = "", a, i, q, x, j, x$1, x$2, q$1, x$3, s$1, b, m, b$1;
		if (base < 2 || base > 36) {
			$panic(new $String("strconv: illegal AppendInt/FormatInt base"));
		}
		a = ($arrayType($Uint8, 65)).zero(); $copy(a, ($arrayType($Uint8, 65)).zero(), ($arrayType($Uint8, 65)));
		i = 65;
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if (base === 10) {
			while ((u.$high > 0 || (u.$high === 0 && u.$low >= 100))) {
				i = i - (2) >> 0;
				q = $div64(u, new $Uint64(0, 100), false);
				j = ((x = $mul64(q, new $Uint64(0, 100)), new $Uint64(u.$high - x.$high, u.$low - x.$low)).$low >>> 0);
				(x$1 = i + 1 >> 0, (x$1 < 0 || x$1 >= a.length) ? $throwRuntimeError("index out of range") : a[x$1] = "0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789".charCodeAt(j));
				(x$2 = i + 0 >> 0, (x$2 < 0 || x$2 >= a.length) ? $throwRuntimeError("index out of range") : a[x$2] = "0000000000111111111122222222223333333333444444444455555555556666666666777777777788888888889999999999".charCodeAt(j));
				u = q;
			}
			if ((u.$high > 0 || (u.$high === 0 && u.$low >= 10))) {
				i = i - (1) >> 0;
				q$1 = $div64(u, new $Uint64(0, 10), false);
				(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((x$3 = $mul64(q$1, new $Uint64(0, 10)), new $Uint64(u.$high - x$3.$high, u.$low - x$3.$low)).$low >>> 0));
				u = q$1;
			}
		} else {
			s$1 = ((base < 0 || base >= shifts.length) ? $throwRuntimeError("index out of range") : shifts[base]);
			if (s$1 > 0) {
				b = new $Uint64(0, base);
				m = (b.$low >>> 0) - 1 >>> 0;
				while ((u.$high > b.$high || (u.$high === b.$high && u.$low >= b.$low))) {
					i = i - (1) >> 0;
					(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((((u.$low >>> 0) & m) >>> 0));
					u = $shiftRightUint64(u, (s$1));
				}
			} else {
				b$1 = new $Uint64(0, base);
				while ((u.$high > b$1.$high || (u.$high === b$1.$high && u.$low >= b$1.$low))) {
					i = i - (1) >> 0;
					(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(($div64(u, b$1, true).$low >>> 0));
					u = $div64(u, (b$1), false);
				}
			}
		}
		i = i - (1) >> 0;
		(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((u.$low >>> 0));
		if (neg) {
			i = i - (1) >> 0;
			(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = 45;
		}
		if (append_) {
			d = $appendSlice(dst, $subslice(new ($sliceType($Uint8))(a), i));
			return [d, s];
		}
		s = $bytesToString($subslice(new ($sliceType($Uint8))(a), i));
		return [d, s];
	};
	quoteWith = function(s, quote, ASCIIonly) {
		var runeTmp, _q, x, buf, width, r, _tuple, n, _ref, s$1, s$2;
		runeTmp = ($arrayType($Uint8, 4)).zero(); $copy(runeTmp, ($arrayType($Uint8, 4)).zero(), ($arrayType($Uint8, 4)));
		buf = ($sliceType($Uint8)).make(0, (_q = (x = s.length, (((3 >>> 16 << 16) * x >> 0) + (3 << 16 >>> 16) * x) >> 0) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")));
		buf = $append(buf, quote);
		width = 0;
		while (s.length > 0) {
			r = (s.charCodeAt(0) >> 0);
			width = 1;
			if (r >= 128) {
				_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; width = _tuple[1];
			}
			if ((width === 1) && (r === 65533)) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\x")));
				buf = $append(buf, "0123456789abcdef".charCodeAt((s.charCodeAt(0) >>> 4 << 24 >>> 24)));
				buf = $append(buf, "0123456789abcdef".charCodeAt(((s.charCodeAt(0) & 15) >>> 0)));
				s = s.substring(width);
				continue;
			}
			if ((r === (quote >> 0)) || (r === 92)) {
				buf = $append(buf, 92);
				buf = $append(buf, (r << 24 >>> 24));
				s = s.substring(width);
				continue;
			}
			if (ASCIIonly) {
				if (r < 128 && IsPrint(r)) {
					buf = $append(buf, (r << 24 >>> 24));
					s = s.substring(width);
					continue;
				}
			} else if (IsPrint(r)) {
				n = utf8.EncodeRune(new ($sliceType($Uint8))(runeTmp), r);
				buf = $appendSlice(buf, $subslice(new ($sliceType($Uint8))(runeTmp), 0, n));
				s = s.substring(width);
				continue;
			}
			_ref = r;
			if (_ref === 7) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\a")));
			} else if (_ref === 8) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\b")));
			} else if (_ref === 12) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\f")));
			} else if (_ref === 10) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\n")));
			} else if (_ref === 13) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\r")));
			} else if (_ref === 9) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\t")));
			} else if (_ref === 11) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\v")));
			} else {
				if (r < 32) {
					buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\x")));
					buf = $append(buf, "0123456789abcdef".charCodeAt((s.charCodeAt(0) >>> 4 << 24 >>> 24)));
					buf = $append(buf, "0123456789abcdef".charCodeAt(((s.charCodeAt(0) & 15) >>> 0)));
				} else if (r > 1114111) {
					r = 65533;
					buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\u")));
					s$1 = 12;
					while (s$1 >= 0) {
						buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min((s$1 >>> 0), 31)) >> 0) & 15)));
						s$1 = s$1 - (4) >> 0;
					}
				} else if (r < 65536) {
					buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\u")));
					s$1 = 12;
					while (s$1 >= 0) {
						buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min((s$1 >>> 0), 31)) >> 0) & 15)));
						s$1 = s$1 - (4) >> 0;
					}
				} else {
					buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\U")));
					s$2 = 28;
					while (s$2 >= 0) {
						buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min((s$2 >>> 0), 31)) >> 0) & 15)));
						s$2 = s$2 - (4) >> 0;
					}
				}
			}
			s = s.substring(width);
		}
		buf = $append(buf, quote);
		return $bytesToString(buf);
	};
	Quote = $pkg.Quote = function(s) {
		return quoteWith(s, 34, false);
	};
	QuoteToASCII = $pkg.QuoteToASCII = function(s) {
		return quoteWith(s, 34, true);
	};
	QuoteRune = $pkg.QuoteRune = function(r) {
		return quoteWith($encodeRune(r), 39, false);
	};
	AppendQuoteRune = $pkg.AppendQuoteRune = function(dst, r) {
		return $appendSlice(dst, new ($sliceType($Uint8))($stringToBytes(QuoteRune(r))));
	};
	QuoteRuneToASCII = $pkg.QuoteRuneToASCII = function(r) {
		return quoteWith($encodeRune(r), 39, true);
	};
	AppendQuoteRuneToASCII = $pkg.AppendQuoteRuneToASCII = function(dst, r) {
		return $appendSlice(dst, new ($sliceType($Uint8))($stringToBytes(QuoteRuneToASCII(r))));
	};
	CanBackquote = $pkg.CanBackquote = function(s) {
		var i, c;
		i = 0;
		while (i < s.length) {
			c = s.charCodeAt(i);
			if ((c < 32 && !((c === 9))) || (c === 96) || (c === 127)) {
				return false;
			}
			i = i + (1) >> 0;
		}
		return true;
	};
	unhex = function(b) {
		var v = 0, ok = false, c, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
		c = (b >> 0);
		if (48 <= c && c <= 57) {
			_tmp = c - 48 >> 0; _tmp$1 = true; v = _tmp; ok = _tmp$1;
			return [v, ok];
		} else if (97 <= c && c <= 102) {
			_tmp$2 = (c - 97 >> 0) + 10 >> 0; _tmp$3 = true; v = _tmp$2; ok = _tmp$3;
			return [v, ok];
		} else if (65 <= c && c <= 70) {
			_tmp$4 = (c - 65 >> 0) + 10 >> 0; _tmp$5 = true; v = _tmp$4; ok = _tmp$5;
			return [v, ok];
		}
		return [v, ok];
	};
	UnquoteChar = $pkg.UnquoteChar = function(s, quote) {
		var value = 0, multibyte = false, tail = "", err = $ifaceNil, c, _tuple, r, size, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, c$1, _ref, n, _ref$1, v, j, _tuple$1, x, ok, v$1, j$1, x$1;
		c = s.charCodeAt(0);
		if ((c === quote) && ((quote === 39) || (quote === 34))) {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		} else if (c >= 128) {
			_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; size = _tuple[1];
			_tmp = r; _tmp$1 = true; _tmp$2 = s.substring(size); _tmp$3 = $ifaceNil; value = _tmp; multibyte = _tmp$1; tail = _tmp$2; err = _tmp$3;
			return [value, multibyte, tail, err];
		} else if (!((c === 92))) {
			_tmp$4 = (s.charCodeAt(0) >> 0); _tmp$5 = false; _tmp$6 = s.substring(1); _tmp$7 = $ifaceNil; value = _tmp$4; multibyte = _tmp$5; tail = _tmp$6; err = _tmp$7;
			return [value, multibyte, tail, err];
		}
		if (s.length <= 1) {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		}
		c$1 = s.charCodeAt(1);
		s = s.substring(2);
		_ref = c$1;
		switch (0) { default: if (_ref === 97) {
			value = 7;
		} else if (_ref === 98) {
			value = 8;
		} else if (_ref === 102) {
			value = 12;
		} else if (_ref === 110) {
			value = 10;
		} else if (_ref === 114) {
			value = 13;
		} else if (_ref === 116) {
			value = 9;
		} else if (_ref === 118) {
			value = 11;
		} else if (_ref === 120 || _ref === 117 || _ref === 85) {
			n = 0;
			_ref$1 = c$1;
			if (_ref$1 === 120) {
				n = 2;
			} else if (_ref$1 === 117) {
				n = 4;
			} else if (_ref$1 === 85) {
				n = 8;
			}
			v = 0;
			if (s.length < n) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			j = 0;
			while (j < n) {
				_tuple$1 = unhex(s.charCodeAt(j)); x = _tuple$1[0]; ok = _tuple$1[1];
				if (!ok) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				v = (v << 4 >> 0) | x;
				j = j + (1) >> 0;
			}
			s = s.substring(n);
			if (c$1 === 120) {
				value = v;
				break;
			}
			if (v > 1114111) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			value = v;
			multibyte = true;
		} else if (_ref === 48 || _ref === 49 || _ref === 50 || _ref === 51 || _ref === 52 || _ref === 53 || _ref === 54 || _ref === 55) {
			v$1 = (c$1 >> 0) - 48 >> 0;
			if (s.length < 2) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			j$1 = 0;
			while (j$1 < 2) {
				x$1 = (s.charCodeAt(j$1) >> 0) - 48 >> 0;
				if (x$1 < 0 || x$1 > 7) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				v$1 = ((v$1 << 3 >> 0)) | x$1;
				j$1 = j$1 + (1) >> 0;
			}
			s = s.substring(2);
			if (v$1 > 255) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			value = v$1;
		} else if (_ref === 92) {
			value = 92;
		} else if (_ref === 39 || _ref === 34) {
			if (!((c$1 === quote))) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			value = (c$1 >> 0);
		} else {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		} }
		tail = s;
		return [value, multibyte, tail, err];
	};
	Unquote = $pkg.Unquote = function(s) {
		var t = "", err = $ifaceNil, n, _tmp, _tmp$1, quote, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tmp$10, _tmp$11, _ref, _tmp$12, _tmp$13, _tuple, r, size, _tmp$14, _tmp$15, runeTmp, _q, x, buf, _tuple$1, c, multibyte, ss, err$1, _tmp$16, _tmp$17, n$1, _tmp$18, _tmp$19, _tmp$20, _tmp$21;
		n = s.length;
		if (n < 2) {
			_tmp = ""; _tmp$1 = $pkg.ErrSyntax; t = _tmp; err = _tmp$1;
			return [t, err];
		}
		quote = s.charCodeAt(0);
		if (!((quote === s.charCodeAt((n - 1 >> 0))))) {
			_tmp$2 = ""; _tmp$3 = $pkg.ErrSyntax; t = _tmp$2; err = _tmp$3;
			return [t, err];
		}
		s = s.substring(1, (n - 1 >> 0));
		if (quote === 96) {
			if (contains(s, 96)) {
				_tmp$4 = ""; _tmp$5 = $pkg.ErrSyntax; t = _tmp$4; err = _tmp$5;
				return [t, err];
			}
			_tmp$6 = s; _tmp$7 = $ifaceNil; t = _tmp$6; err = _tmp$7;
			return [t, err];
		}
		if (!((quote === 34)) && !((quote === 39))) {
			_tmp$8 = ""; _tmp$9 = $pkg.ErrSyntax; t = _tmp$8; err = _tmp$9;
			return [t, err];
		}
		if (contains(s, 10)) {
			_tmp$10 = ""; _tmp$11 = $pkg.ErrSyntax; t = _tmp$10; err = _tmp$11;
			return [t, err];
		}
		if (!contains(s, 92) && !contains(s, quote)) {
			_ref = quote;
			if (_ref === 34) {
				_tmp$12 = s; _tmp$13 = $ifaceNil; t = _tmp$12; err = _tmp$13;
				return [t, err];
			} else if (_ref === 39) {
				_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; size = _tuple[1];
				if ((size === s.length) && (!((r === 65533)) || !((size === 1)))) {
					_tmp$14 = s; _tmp$15 = $ifaceNil; t = _tmp$14; err = _tmp$15;
					return [t, err];
				}
			}
		}
		runeTmp = ($arrayType($Uint8, 4)).zero(); $copy(runeTmp, ($arrayType($Uint8, 4)).zero(), ($arrayType($Uint8, 4)));
		buf = ($sliceType($Uint8)).make(0, (_q = (x = s.length, (((3 >>> 16 << 16) * x >> 0) + (3 << 16 >>> 16) * x) >> 0) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")));
		while (s.length > 0) {
			_tuple$1 = UnquoteChar(s, quote); c = _tuple$1[0]; multibyte = _tuple$1[1]; ss = _tuple$1[2]; err$1 = _tuple$1[3];
			if (!($interfaceIsEqual(err$1, $ifaceNil))) {
				_tmp$16 = ""; _tmp$17 = err$1; t = _tmp$16; err = _tmp$17;
				return [t, err];
			}
			s = ss;
			if (c < 128 || !multibyte) {
				buf = $append(buf, (c << 24 >>> 24));
			} else {
				n$1 = utf8.EncodeRune(new ($sliceType($Uint8))(runeTmp), c);
				buf = $appendSlice(buf, $subslice(new ($sliceType($Uint8))(runeTmp), 0, n$1));
			}
			if ((quote === 39) && !((s.length === 0))) {
				_tmp$18 = ""; _tmp$19 = $pkg.ErrSyntax; t = _tmp$18; err = _tmp$19;
				return [t, err];
			}
		}
		_tmp$20 = $bytesToString(buf); _tmp$21 = $ifaceNil; t = _tmp$20; err = _tmp$21;
		return [t, err];
	};
	contains = function(s, c) {
		var i;
		i = 0;
		while (i < s.length) {
			if (s.charCodeAt(i) === c) {
				return true;
			}
			i = i + (1) >> 0;
		}
		return false;
	};
	bsearch16 = function(a, x) {
		var _tmp, _tmp$1, i, j, _q, h;
		_tmp = 0; _tmp$1 = a.$length; i = _tmp; j = _tmp$1;
		while (i < j) {
			h = i + (_q = ((j - i >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			if (((h < 0 || h >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + h]) < x) {
				i = h + 1 >> 0;
			} else {
				j = h;
			}
		}
		return i;
	};
	bsearch32 = function(a, x) {
		var _tmp, _tmp$1, i, j, _q, h;
		_tmp = 0; _tmp$1 = a.$length; i = _tmp; j = _tmp$1;
		while (i < j) {
			h = i + (_q = ((j - i >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			if (((h < 0 || h >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + h]) < x) {
				i = h + 1 >> 0;
			} else {
				j = h;
			}
		}
		return i;
	};
	IsPrint = $pkg.IsPrint = function(r) {
		var _tmp, _tmp$1, _tmp$2, rr, isPrint, isNotPrint, i, x, x$1, j, _tmp$3, _tmp$4, _tmp$5, rr$1, isPrint$1, isNotPrint$1, i$1, x$2, x$3, j$1;
		if (r <= 255) {
			if (32 <= r && r <= 126) {
				return true;
			}
			if (161 <= r && r <= 255) {
				return !((r === 173));
			}
			return false;
		}
		if (0 <= r && r < 65536) {
			_tmp = (r << 16 >>> 16); _tmp$1 = isPrint16; _tmp$2 = isNotPrint16; rr = _tmp; isPrint = _tmp$1; isNotPrint = _tmp$2;
			i = bsearch16(isPrint, rr);
			if (i >= isPrint.$length || rr < (x = i & ~1, ((x < 0 || x >= isPrint.$length) ? $throwRuntimeError("index out of range") : isPrint.$array[isPrint.$offset + x])) || (x$1 = i | 1, ((x$1 < 0 || x$1 >= isPrint.$length) ? $throwRuntimeError("index out of range") : isPrint.$array[isPrint.$offset + x$1])) < rr) {
				return false;
			}
			j = bsearch16(isNotPrint, rr);
			return j >= isNotPrint.$length || !((((j < 0 || j >= isNotPrint.$length) ? $throwRuntimeError("index out of range") : isNotPrint.$array[isNotPrint.$offset + j]) === rr));
		}
		_tmp$3 = (r >>> 0); _tmp$4 = isPrint32; _tmp$5 = isNotPrint32; rr$1 = _tmp$3; isPrint$1 = _tmp$4; isNotPrint$1 = _tmp$5;
		i$1 = bsearch32(isPrint$1, rr$1);
		if (i$1 >= isPrint$1.$length || rr$1 < (x$2 = i$1 & ~1, ((x$2 < 0 || x$2 >= isPrint$1.$length) ? $throwRuntimeError("index out of range") : isPrint$1.$array[isPrint$1.$offset + x$2])) || (x$3 = i$1 | 1, ((x$3 < 0 || x$3 >= isPrint$1.$length) ? $throwRuntimeError("index out of range") : isPrint$1.$array[isPrint$1.$offset + x$3])) < rr$1) {
			return false;
		}
		if (r >= 131072) {
			return true;
		}
		r = r - (65536) >> 0;
		j$1 = bsearch16(isNotPrint$1, (r << 16 >>> 16));
		return j$1 >= isNotPrint$1.$length || !((((j$1 < 0 || j$1 >= isNotPrint$1.$length) ? $throwRuntimeError("index out of range") : isNotPrint$1.$array[isNotPrint$1.$offset + j$1]) === (r << 16 >>> 16)));
	};
	$pkg.$init = function() {
		($ptrType(NumError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		NumError.init([["Func", "Func", "", $String, ""], ["Num", "Num", "", $String, ""], ["Err", "Err", "", $error, ""]]);
		($ptrType(decimal)).methods = [["Assign", "Assign", "", $funcType([$Uint64], [], false), -1], ["Round", "Round", "", $funcType([$Int], [], false), -1], ["RoundDown", "RoundDown", "", $funcType([$Int], [], false), -1], ["RoundUp", "RoundUp", "", $funcType([$Int], [], false), -1], ["RoundedInteger", "RoundedInteger", "", $funcType([], [$Uint64], false), -1], ["Shift", "Shift", "", $funcType([$Int], [], false), -1], ["String", "String", "", $funcType([], [$String], false), -1], ["floatBits", "floatBits", "strconv", $funcType([($ptrType(floatInfo))], [$Uint64, $Bool], false), -1], ["set", "set", "strconv", $funcType([$String], [$Bool], false), -1]];
		decimal.init([["d", "d", "strconv", ($arrayType($Uint8, 800)), ""], ["nd", "nd", "strconv", $Int, ""], ["dp", "dp", "strconv", $Int, ""], ["neg", "neg", "strconv", $Bool, ""], ["trunc", "trunc", "strconv", $Bool, ""]]);
		leftCheat.init([["delta", "delta", "strconv", $Int, ""], ["cutoff", "cutoff", "strconv", $String, ""]]);
		($ptrType(extFloat)).methods = [["AssignComputeBounds", "AssignComputeBounds", "", $funcType([$Uint64, $Int, $Bool, ($ptrType(floatInfo))], [extFloat, extFloat], false), -1], ["AssignDecimal", "AssignDecimal", "", $funcType([$Uint64, $Int, $Bool, $Bool, ($ptrType(floatInfo))], [$Bool], false), -1], ["FixedDecimal", "FixedDecimal", "", $funcType([($ptrType(decimalSlice)), $Int], [$Bool], false), -1], ["Multiply", "Multiply", "", $funcType([extFloat], [], false), -1], ["Normalize", "Normalize", "", $funcType([], [$Uint], false), -1], ["ShortestDecimal", "ShortestDecimal", "", $funcType([($ptrType(decimalSlice)), ($ptrType(extFloat)), ($ptrType(extFloat))], [$Bool], false), -1], ["floatBits", "floatBits", "strconv", $funcType([($ptrType(floatInfo))], [$Uint64, $Bool], false), -1], ["frexp10", "frexp10", "strconv", $funcType([], [$Int, $Int], false), -1]];
		extFloat.init([["mant", "mant", "strconv", $Uint64, ""], ["exp", "exp", "strconv", $Int, ""], ["neg", "neg", "strconv", $Bool, ""]]);
		floatInfo.init([["mantbits", "mantbits", "strconv", $Uint, ""], ["expbits", "expbits", "strconv", $Uint, ""], ["bias", "bias", "strconv", $Int, ""]]);
		decimalSlice.init([["d", "d", "strconv", ($sliceType($Uint8)), ""], ["nd", "nd", "strconv", $Int, ""], ["dp", "dp", "strconv", $Int, ""], ["neg", "neg", "strconv", $Bool, ""]]);
		optimize = true;
		powtab = new ($sliceType($Int))([1, 3, 6, 9, 13, 16, 19, 23, 26]);
		float64pow10 = new ($sliceType($Float64))([1, 10, 100, 1000, 10000, 100000, 1e+06, 1e+07, 1e+08, 1e+09, 1e+10, 1e+11, 1e+12, 1e+13, 1e+14, 1e+15, 1e+16, 1e+17, 1e+18, 1e+19, 1e+20, 1e+21, 1e+22]);
		float32pow10 = new ($sliceType($Float32))([1, 10, 100, 1000, 10000, 100000, 1e+06, 1e+07, 1e+08, 1e+09, 1e+10]);
		$pkg.ErrRange = errors.New("value out of range");
		$pkg.ErrSyntax = errors.New("invalid syntax");
		leftcheats = new ($sliceType(leftCheat))([new leftCheat.Ptr(0, ""), new leftCheat.Ptr(1, "5"), new leftCheat.Ptr(1, "25"), new leftCheat.Ptr(1, "125"), new leftCheat.Ptr(2, "625"), new leftCheat.Ptr(2, "3125"), new leftCheat.Ptr(2, "15625"), new leftCheat.Ptr(3, "78125"), new leftCheat.Ptr(3, "390625"), new leftCheat.Ptr(3, "1953125"), new leftCheat.Ptr(4, "9765625"), new leftCheat.Ptr(4, "48828125"), new leftCheat.Ptr(4, "244140625"), new leftCheat.Ptr(4, "1220703125"), new leftCheat.Ptr(5, "6103515625"), new leftCheat.Ptr(5, "30517578125"), new leftCheat.Ptr(5, "152587890625"), new leftCheat.Ptr(6, "762939453125"), new leftCheat.Ptr(6, "3814697265625"), new leftCheat.Ptr(6, "19073486328125"), new leftCheat.Ptr(7, "95367431640625"), new leftCheat.Ptr(7, "476837158203125"), new leftCheat.Ptr(7, "2384185791015625"), new leftCheat.Ptr(7, "11920928955078125"), new leftCheat.Ptr(8, "59604644775390625"), new leftCheat.Ptr(8, "298023223876953125"), new leftCheat.Ptr(8, "1490116119384765625"), new leftCheat.Ptr(9, "7450580596923828125")]);
		smallPowersOfTen = $toNativeArray("Struct", [new extFloat.Ptr(new $Uint64(2147483648, 0), -63, false), new extFloat.Ptr(new $Uint64(2684354560, 0), -60, false), new extFloat.Ptr(new $Uint64(3355443200, 0), -57, false), new extFloat.Ptr(new $Uint64(4194304000, 0), -54, false), new extFloat.Ptr(new $Uint64(2621440000, 0), -50, false), new extFloat.Ptr(new $Uint64(3276800000, 0), -47, false), new extFloat.Ptr(new $Uint64(4096000000, 0), -44, false), new extFloat.Ptr(new $Uint64(2560000000, 0), -40, false)]);
		powersOfTen = $toNativeArray("Struct", [new extFloat.Ptr(new $Uint64(4203730336, 136053384), -1220, false), new extFloat.Ptr(new $Uint64(3132023167, 2722021238), -1193, false), new extFloat.Ptr(new $Uint64(2333539104, 810921078), -1166, false), new extFloat.Ptr(new $Uint64(3477244234, 1573795306), -1140, false), new extFloat.Ptr(new $Uint64(2590748842, 1432697645), -1113, false), new extFloat.Ptr(new $Uint64(3860516611, 1025131999), -1087, false), new extFloat.Ptr(new $Uint64(2876309015, 3348809418), -1060, false), new extFloat.Ptr(new $Uint64(4286034428, 3200048207), -1034, false), new extFloat.Ptr(new $Uint64(3193344495, 1097586188), -1007, false), new extFloat.Ptr(new $Uint64(2379227053, 2424306748), -980, false), new extFloat.Ptr(new $Uint64(3545324584, 827693699), -954, false), new extFloat.Ptr(new $Uint64(2641472655, 2913388981), -927, false), new extFloat.Ptr(new $Uint64(3936100983, 602835915), -901, false), new extFloat.Ptr(new $Uint64(2932623761, 1081627501), -874, false), new extFloat.Ptr(new $Uint64(2184974969, 1572261463), -847, false), new extFloat.Ptr(new $Uint64(3255866422, 1308317239), -821, false), new extFloat.Ptr(new $Uint64(2425809519, 944281679), -794, false), new extFloat.Ptr(new $Uint64(3614737867, 629291719), -768, false), new extFloat.Ptr(new $Uint64(2693189581, 2545915892), -741, false), new extFloat.Ptr(new $Uint64(4013165208, 388672741), -715, false), new extFloat.Ptr(new $Uint64(2990041083, 708162190), -688, false), new extFloat.Ptr(new $Uint64(2227754207, 3536207675), -661, false), new extFloat.Ptr(new $Uint64(3319612455, 450088378), -635, false), new extFloat.Ptr(new $Uint64(2473304014, 3139815830), -608, false), new extFloat.Ptr(new $Uint64(3685510180, 2103616900), -582, false), new extFloat.Ptr(new $Uint64(2745919064, 224385782), -555, false), new extFloat.Ptr(new $Uint64(4091738259, 3737383206), -529, false), new extFloat.Ptr(new $Uint64(3048582568, 2868871352), -502, false), new extFloat.Ptr(new $Uint64(2271371013, 1820084875), -475, false), new extFloat.Ptr(new $Uint64(3384606560, 885076051), -449, false), new extFloat.Ptr(new $Uint64(2521728396, 2444895829), -422, false), new extFloat.Ptr(new $Uint64(3757668132, 1881767613), -396, false), new extFloat.Ptr(new $Uint64(2799680927, 3102062735), -369, false), new extFloat.Ptr(new $Uint64(4171849679, 2289335700), -343, false), new extFloat.Ptr(new $Uint64(3108270227, 2410191823), -316, false), new extFloat.Ptr(new $Uint64(2315841784, 3205436779), -289, false), new extFloat.Ptr(new $Uint64(3450873173, 1697722806), -263, false), new extFloat.Ptr(new $Uint64(2571100870, 3497754540), -236, false), new extFloat.Ptr(new $Uint64(3831238852, 707476230), -210, false), new extFloat.Ptr(new $Uint64(2854495385, 1769181907), -183, false), new extFloat.Ptr(new $Uint64(4253529586, 2197867022), -157, false), new extFloat.Ptr(new $Uint64(3169126500, 2450594539), -130, false), new extFloat.Ptr(new $Uint64(2361183241, 1867548876), -103, false), new extFloat.Ptr(new $Uint64(3518437208, 3793315116), -77, false), new extFloat.Ptr(new $Uint64(2621440000, 0), -50, false), new extFloat.Ptr(new $Uint64(3906250000, 0), -24, false), new extFloat.Ptr(new $Uint64(2910383045, 2892103680), 3, false), new extFloat.Ptr(new $Uint64(2168404344, 4170451332), 30, false), new extFloat.Ptr(new $Uint64(3231174267, 3372684723), 56, false), new extFloat.Ptr(new $Uint64(2407412430, 2078956656), 83, false), new extFloat.Ptr(new $Uint64(3587324068, 2884206696), 109, false), new extFloat.Ptr(new $Uint64(2672764710, 395977285), 136, false), new extFloat.Ptr(new $Uint64(3982729777, 3569679143), 162, false), new extFloat.Ptr(new $Uint64(2967364920, 2361961896), 189, false), new extFloat.Ptr(new $Uint64(2210859150, 447440347), 216, false), new extFloat.Ptr(new $Uint64(3294436857, 1114709402), 242, false), new extFloat.Ptr(new $Uint64(2454546732, 2786846552), 269, false), new extFloat.Ptr(new $Uint64(3657559652, 443583978), 295, false), new extFloat.Ptr(new $Uint64(2725094297, 2599384906), 322, false), new extFloat.Ptr(new $Uint64(4060706939, 3028118405), 348, false), new extFloat.Ptr(new $Uint64(3025462433, 2044532855), 375, false), new extFloat.Ptr(new $Uint64(2254145170, 1536935362), 402, false), new extFloat.Ptr(new $Uint64(3358938053, 3365297469), 428, false), new extFloat.Ptr(new $Uint64(2502603868, 4204241075), 455, false), new extFloat.Ptr(new $Uint64(3729170365, 2577424355), 481, false), new extFloat.Ptr(new $Uint64(2778448436, 3677981733), 508, false), new extFloat.Ptr(new $Uint64(4140210802, 2744688476), 534, false), new extFloat.Ptr(new $Uint64(3084697427, 1424604878), 561, false), new extFloat.Ptr(new $Uint64(2298278679, 4062331362), 588, false), new extFloat.Ptr(new $Uint64(3424702107, 3546052773), 614, false), new extFloat.Ptr(new $Uint64(2551601907, 2065781727), 641, false), new extFloat.Ptr(new $Uint64(3802183132, 2535403578), 667, false), new extFloat.Ptr(new $Uint64(2832847187, 1558426518), 694, false), new extFloat.Ptr(new $Uint64(4221271257, 2762425404), 720, false), new extFloat.Ptr(new $Uint64(3145092172, 2812560400), 747, false), new extFloat.Ptr(new $Uint64(2343276271, 3057687578), 774, false), new extFloat.Ptr(new $Uint64(3491753744, 2790753324), 800, false), new extFloat.Ptr(new $Uint64(2601559269, 3918606633), 827, false), new extFloat.Ptr(new $Uint64(3876625403, 2711358621), 853, false), new extFloat.Ptr(new $Uint64(2888311001, 1648096297), 880, false), new extFloat.Ptr(new $Uint64(2151959390, 2057817989), 907, false), new extFloat.Ptr(new $Uint64(3206669376, 61660461), 933, false), new extFloat.Ptr(new $Uint64(2389154863, 1581580175), 960, false), new extFloat.Ptr(new $Uint64(3560118173, 2626467905), 986, false), new extFloat.Ptr(new $Uint64(2652494738, 3034782633), 1013, false), new extFloat.Ptr(new $Uint64(3952525166, 3135207385), 1039, false), new extFloat.Ptr(new $Uint64(2944860731, 2616258155), 1066, false)]);
		uint64pow10 = $toNativeArray("Uint64", [new $Uint64(0, 1), new $Uint64(0, 10), new $Uint64(0, 100), new $Uint64(0, 1000), new $Uint64(0, 10000), new $Uint64(0, 100000), new $Uint64(0, 1000000), new $Uint64(0, 10000000), new $Uint64(0, 100000000), new $Uint64(0, 1000000000), new $Uint64(2, 1410065408), new $Uint64(23, 1215752192), new $Uint64(232, 3567587328), new $Uint64(2328, 1316134912), new $Uint64(23283, 276447232), new $Uint64(232830, 2764472320), new $Uint64(2328306, 1874919424), new $Uint64(23283064, 1569325056), new $Uint64(232830643, 2808348672), new $Uint64(2328306436, 2313682944)]);
		float32info = new floatInfo.Ptr(23, 8, -127);
		float64info = new floatInfo.Ptr(52, 11, -1023);
		isPrint16 = new ($sliceType($Uint16))([32, 126, 161, 887, 890, 894, 900, 1319, 1329, 1366, 1369, 1418, 1423, 1479, 1488, 1514, 1520, 1524, 1542, 1563, 1566, 1805, 1808, 1866, 1869, 1969, 1984, 2042, 2048, 2093, 2096, 2139, 2142, 2142, 2208, 2220, 2276, 2444, 2447, 2448, 2451, 2482, 2486, 2489, 2492, 2500, 2503, 2504, 2507, 2510, 2519, 2519, 2524, 2531, 2534, 2555, 2561, 2570, 2575, 2576, 2579, 2617, 2620, 2626, 2631, 2632, 2635, 2637, 2641, 2641, 2649, 2654, 2662, 2677, 2689, 2745, 2748, 2765, 2768, 2768, 2784, 2787, 2790, 2801, 2817, 2828, 2831, 2832, 2835, 2873, 2876, 2884, 2887, 2888, 2891, 2893, 2902, 2903, 2908, 2915, 2918, 2935, 2946, 2954, 2958, 2965, 2969, 2975, 2979, 2980, 2984, 2986, 2990, 3001, 3006, 3010, 3014, 3021, 3024, 3024, 3031, 3031, 3046, 3066, 3073, 3129, 3133, 3149, 3157, 3161, 3168, 3171, 3174, 3183, 3192, 3199, 3202, 3257, 3260, 3277, 3285, 3286, 3294, 3299, 3302, 3314, 3330, 3386, 3389, 3406, 3415, 3415, 3424, 3427, 3430, 3445, 3449, 3455, 3458, 3478, 3482, 3517, 3520, 3526, 3530, 3530, 3535, 3551, 3570, 3572, 3585, 3642, 3647, 3675, 3713, 3716, 3719, 3722, 3725, 3725, 3732, 3751, 3754, 3773, 3776, 3789, 3792, 3801, 3804, 3807, 3840, 3948, 3953, 4058, 4096, 4295, 4301, 4301, 4304, 4685, 4688, 4701, 4704, 4749, 4752, 4789, 4792, 4805, 4808, 4885, 4888, 4954, 4957, 4988, 4992, 5017, 5024, 5108, 5120, 5788, 5792, 5872, 5888, 5908, 5920, 5942, 5952, 5971, 5984, 6003, 6016, 6109, 6112, 6121, 6128, 6137, 6144, 6157, 6160, 6169, 6176, 6263, 6272, 6314, 6320, 6389, 6400, 6428, 6432, 6443, 6448, 6459, 6464, 6464, 6468, 6509, 6512, 6516, 6528, 6571, 6576, 6601, 6608, 6618, 6622, 6683, 6686, 6780, 6783, 6793, 6800, 6809, 6816, 6829, 6912, 6987, 6992, 7036, 7040, 7155, 7164, 7223, 7227, 7241, 7245, 7295, 7360, 7367, 7376, 7414, 7424, 7654, 7676, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8061, 8064, 8147, 8150, 8175, 8178, 8190, 8208, 8231, 8240, 8286, 8304, 8305, 8308, 8348, 8352, 8378, 8400, 8432, 8448, 8585, 8592, 9203, 9216, 9254, 9280, 9290, 9312, 11084, 11088, 11097, 11264, 11507, 11513, 11559, 11565, 11565, 11568, 11623, 11631, 11632, 11647, 11670, 11680, 11835, 11904, 12019, 12032, 12245, 12272, 12283, 12289, 12438, 12441, 12543, 12549, 12589, 12593, 12730, 12736, 12771, 12784, 19893, 19904, 40908, 40960, 42124, 42128, 42182, 42192, 42539, 42560, 42647, 42655, 42743, 42752, 42899, 42912, 42922, 43000, 43051, 43056, 43065, 43072, 43127, 43136, 43204, 43214, 43225, 43232, 43259, 43264, 43347, 43359, 43388, 43392, 43481, 43486, 43487, 43520, 43574, 43584, 43597, 43600, 43609, 43612, 43643, 43648, 43714, 43739, 43766, 43777, 43782, 43785, 43790, 43793, 43798, 43808, 43822, 43968, 44013, 44016, 44025, 44032, 55203, 55216, 55238, 55243, 55291, 63744, 64109, 64112, 64217, 64256, 64262, 64275, 64279, 64285, 64449, 64467, 64831, 64848, 64911, 64914, 64967, 65008, 65021, 65024, 65049, 65056, 65062, 65072, 65131, 65136, 65276, 65281, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500, 65504, 65518, 65532, 65533]);
		isNotPrint16 = new ($sliceType($Uint16))([173, 907, 909, 930, 1376, 1416, 1424, 1757, 2111, 2209, 2303, 2424, 2432, 2436, 2473, 2481, 2526, 2564, 2601, 2609, 2612, 2615, 2621, 2653, 2692, 2702, 2706, 2729, 2737, 2740, 2758, 2762, 2820, 2857, 2865, 2868, 2910, 2948, 2961, 2971, 2973, 3017, 3076, 3085, 3089, 3113, 3124, 3141, 3145, 3159, 3204, 3213, 3217, 3241, 3252, 3269, 3273, 3295, 3312, 3332, 3341, 3345, 3397, 3401, 3460, 3506, 3516, 3541, 3543, 3715, 3721, 3736, 3744, 3748, 3750, 3756, 3770, 3781, 3783, 3912, 3992, 4029, 4045, 4294, 4681, 4695, 4697, 4745, 4785, 4799, 4801, 4823, 4881, 5760, 5901, 5997, 6001, 6751, 8024, 8026, 8028, 8030, 8117, 8133, 8156, 8181, 8335, 9984, 11311, 11359, 11558, 11687, 11695, 11703, 11711, 11719, 11727, 11735, 11743, 11930, 12352, 12687, 12831, 13055, 42895, 43470, 43815, 64311, 64317, 64319, 64322, 64325, 65107, 65127, 65141, 65511]);
		isPrint32 = new ($sliceType($Uint32))([65536, 65613, 65616, 65629, 65664, 65786, 65792, 65794, 65799, 65843, 65847, 65930, 65936, 65947, 66000, 66045, 66176, 66204, 66208, 66256, 66304, 66339, 66352, 66378, 66432, 66499, 66504, 66517, 66560, 66717, 66720, 66729, 67584, 67589, 67592, 67640, 67644, 67644, 67647, 67679, 67840, 67867, 67871, 67897, 67903, 67903, 67968, 68023, 68030, 68031, 68096, 68102, 68108, 68147, 68152, 68154, 68159, 68167, 68176, 68184, 68192, 68223, 68352, 68405, 68409, 68437, 68440, 68466, 68472, 68479, 68608, 68680, 69216, 69246, 69632, 69709, 69714, 69743, 69760, 69825, 69840, 69864, 69872, 69881, 69888, 69955, 70016, 70088, 70096, 70105, 71296, 71351, 71360, 71369, 73728, 74606, 74752, 74850, 74864, 74867, 77824, 78894, 92160, 92728, 93952, 94020, 94032, 94078, 94095, 94111, 110592, 110593, 118784, 119029, 119040, 119078, 119081, 119154, 119163, 119261, 119296, 119365, 119552, 119638, 119648, 119665, 119808, 119967, 119970, 119970, 119973, 119974, 119977, 120074, 120077, 120134, 120138, 120485, 120488, 120779, 120782, 120831, 126464, 126500, 126503, 126523, 126530, 126530, 126535, 126548, 126551, 126564, 126567, 126619, 126625, 126651, 126704, 126705, 126976, 127019, 127024, 127123, 127136, 127150, 127153, 127166, 127169, 127199, 127232, 127242, 127248, 127339, 127344, 127386, 127462, 127490, 127504, 127546, 127552, 127560, 127568, 127569, 127744, 127776, 127792, 127868, 127872, 127891, 127904, 127946, 127968, 127984, 128000, 128252, 128256, 128317, 128320, 128323, 128336, 128359, 128507, 128576, 128581, 128591, 128640, 128709, 128768, 128883, 131072, 173782, 173824, 177972, 177984, 178205, 194560, 195101, 917760, 917999]);
		isNotPrint32 = new ($sliceType($Uint16))([12, 39, 59, 62, 799, 926, 2057, 2102, 2134, 2564, 2580, 2584, 4285, 4405, 54357, 54429, 54445, 54458, 54460, 54468, 54534, 54549, 54557, 54586, 54591, 54597, 54609, 60932, 60960, 60963, 60968, 60979, 60984, 60986, 61000, 61002, 61004, 61008, 61011, 61016, 61018, 61020, 61022, 61024, 61027, 61035, 61043, 61048, 61053, 61055, 61066, 61092, 61098, 61648, 61743, 62262, 62405, 62527, 62529, 62712]);
		shifts = $toNativeArray("Uint", [0, 0, 1, 0, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0]);
	};
	return $pkg;
})();
$packages["reflect"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], runtime = $packages["runtime"], strconv = $packages["strconv"], sync = $packages["sync"], math = $packages["math"], mapIter, Type, Kind, rtype, method, uncommonType, ChanDir, arrayType, chanType, funcType, imethod, interfaceType, mapType, ptrType, sliceType, structField, structType, Method, StructField, StructTag, fieldScan, Value, flag, ValueError, iword, nonEmptyInterface, initialized, kindNames, uint8Type, init, jsType, reflectType, isWrapped, copyStruct, makeValue, MakeSlice, jsObject, TypeOf, ValueOf, SliceOf, Zero, unsafe_New, makeInt, memmove, loadScalar, mapaccess, mapassign, mapdelete, mapiterinit, mapiterkey, mapiternext, maplen, cvtDirect, methodReceiver, valueInterface, ifaceE2I, methodName, makeMethodValue, PtrTo, implements$1, directlyAssignable, haveIdenticalUnderlyingType, toType, overflowFloat32, New, convertOp, makeFloat, makeComplex, makeString, makeBytes, makeRunes, cvtInt, cvtUint, cvtFloatInt, cvtFloatUint, cvtIntFloat, cvtUintFloat, cvtFloat, cvtComplex, cvtIntString, cvtUintString, cvtBytesString, cvtStringBytes, cvtRunesString, cvtStringRunes, cvtT2I, cvtI2I, call;
	mapIter = $pkg.mapIter = $newType(0, "Struct", "reflect.mapIter", "mapIter", "reflect", function(t_, m_, keys_, i_) {
		this.$val = this;
		this.t = t_ !== undefined ? t_ : $ifaceNil;
		this.m = m_ !== undefined ? m_ : $ifaceNil;
		this.keys = keys_ !== undefined ? keys_ : $ifaceNil;
		this.i = i_ !== undefined ? i_ : 0;
	});
	Type = $pkg.Type = $newType(8, "Interface", "reflect.Type", "Type", "reflect", null);
	Kind = $pkg.Kind = $newType(4, "Uint", "reflect.Kind", "Kind", "reflect", null);
	rtype = $pkg.rtype = $newType(0, "Struct", "reflect.rtype", "rtype", "reflect", function(size_, hash_, _$2_, align_, fieldAlign_, kind_, alg_, gc_, string_, uncommonType_, ptrToThis_, zero_) {
		this.$val = this;
		this.size = size_ !== undefined ? size_ : 0;
		this.hash = hash_ !== undefined ? hash_ : 0;
		this._$2 = _$2_ !== undefined ? _$2_ : 0;
		this.align = align_ !== undefined ? align_ : 0;
		this.fieldAlign = fieldAlign_ !== undefined ? fieldAlign_ : 0;
		this.kind = kind_ !== undefined ? kind_ : 0;
		this.alg = alg_ !== undefined ? alg_ : ($ptrType($Uintptr)).nil;
		this.gc = gc_ !== undefined ? gc_ : 0;
		this.string = string_ !== undefined ? string_ : ($ptrType($String)).nil;
		this.uncommonType = uncommonType_ !== undefined ? uncommonType_ : ($ptrType(uncommonType)).nil;
		this.ptrToThis = ptrToThis_ !== undefined ? ptrToThis_ : ($ptrType(rtype)).nil;
		this.zero = zero_ !== undefined ? zero_ : 0;
	});
	method = $pkg.method = $newType(0, "Struct", "reflect.method", "method", "reflect", function(name_, pkgPath_, mtyp_, typ_, ifn_, tfn_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ($ptrType($String)).nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ($ptrType($String)).nil;
		this.mtyp = mtyp_ !== undefined ? mtyp_ : ($ptrType(rtype)).nil;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(rtype)).nil;
		this.ifn = ifn_ !== undefined ? ifn_ : 0;
		this.tfn = tfn_ !== undefined ? tfn_ : 0;
	});
	uncommonType = $pkg.uncommonType = $newType(0, "Struct", "reflect.uncommonType", "uncommonType", "reflect", function(name_, pkgPath_, methods_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ($ptrType($String)).nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ($ptrType($String)).nil;
		this.methods = methods_ !== undefined ? methods_ : ($sliceType(method)).nil;
	});
	ChanDir = $pkg.ChanDir = $newType(4, "Int", "reflect.ChanDir", "ChanDir", "reflect", null);
	arrayType = $pkg.arrayType = $newType(0, "Struct", "reflect.arrayType", "arrayType", "reflect", function(rtype_, elem_, slice_, len_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
		this.slice = slice_ !== undefined ? slice_ : ($ptrType(rtype)).nil;
		this.len = len_ !== undefined ? len_ : 0;
	});
	chanType = $pkg.chanType = $newType(0, "Struct", "reflect.chanType", "chanType", "reflect", function(rtype_, elem_, dir_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
		this.dir = dir_ !== undefined ? dir_ : 0;
	});
	funcType = $pkg.funcType = $newType(0, "Struct", "reflect.funcType", "funcType", "reflect", function(rtype_, dotdotdot_, in$2_, out_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.dotdotdot = dotdotdot_ !== undefined ? dotdotdot_ : false;
		this.in$2 = in$2_ !== undefined ? in$2_ : ($sliceType(($ptrType(rtype)))).nil;
		this.out = out_ !== undefined ? out_ : ($sliceType(($ptrType(rtype)))).nil;
	});
	imethod = $pkg.imethod = $newType(0, "Struct", "reflect.imethod", "imethod", "reflect", function(name_, pkgPath_, typ_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ($ptrType($String)).nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ($ptrType($String)).nil;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(rtype)).nil;
	});
	interfaceType = $pkg.interfaceType = $newType(0, "Struct", "reflect.interfaceType", "interfaceType", "reflect", function(rtype_, methods_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.methods = methods_ !== undefined ? methods_ : ($sliceType(imethod)).nil;
	});
	mapType = $pkg.mapType = $newType(0, "Struct", "reflect.mapType", "mapType", "reflect", function(rtype_, key_, elem_, bucket_, hmap_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.key = key_ !== undefined ? key_ : ($ptrType(rtype)).nil;
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
		this.bucket = bucket_ !== undefined ? bucket_ : ($ptrType(rtype)).nil;
		this.hmap = hmap_ !== undefined ? hmap_ : ($ptrType(rtype)).nil;
	});
	ptrType = $pkg.ptrType = $newType(0, "Struct", "reflect.ptrType", "ptrType", "reflect", function(rtype_, elem_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
	});
	sliceType = $pkg.sliceType = $newType(0, "Struct", "reflect.sliceType", "sliceType", "reflect", function(rtype_, elem_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
	});
	structField = $pkg.structField = $newType(0, "Struct", "reflect.structField", "structField", "reflect", function(name_, pkgPath_, typ_, tag_, offset_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ($ptrType($String)).nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ($ptrType($String)).nil;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(rtype)).nil;
		this.tag = tag_ !== undefined ? tag_ : ($ptrType($String)).nil;
		this.offset = offset_ !== undefined ? offset_ : 0;
	});
	structType = $pkg.structType = $newType(0, "Struct", "reflect.structType", "structType", "reflect", function(rtype_, fields_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.fields = fields_ !== undefined ? fields_ : ($sliceType(structField)).nil;
	});
	Method = $pkg.Method = $newType(0, "Struct", "reflect.Method", "Method", "reflect", function(Name_, PkgPath_, Type_, Func_, Index_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.PkgPath = PkgPath_ !== undefined ? PkgPath_ : "";
		this.Type = Type_ !== undefined ? Type_ : $ifaceNil;
		this.Func = Func_ !== undefined ? Func_ : new Value.Ptr();
		this.Index = Index_ !== undefined ? Index_ : 0;
	});
	StructField = $pkg.StructField = $newType(0, "Struct", "reflect.StructField", "StructField", "reflect", function(Name_, PkgPath_, Type_, Tag_, Offset_, Index_, Anonymous_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.PkgPath = PkgPath_ !== undefined ? PkgPath_ : "";
		this.Type = Type_ !== undefined ? Type_ : $ifaceNil;
		this.Tag = Tag_ !== undefined ? Tag_ : "";
		this.Offset = Offset_ !== undefined ? Offset_ : 0;
		this.Index = Index_ !== undefined ? Index_ : ($sliceType($Int)).nil;
		this.Anonymous = Anonymous_ !== undefined ? Anonymous_ : false;
	});
	StructTag = $pkg.StructTag = $newType(8, "String", "reflect.StructTag", "StructTag", "reflect", null);
	fieldScan = $pkg.fieldScan = $newType(0, "Struct", "reflect.fieldScan", "fieldScan", "reflect", function(typ_, index_) {
		this.$val = this;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(structType)).nil;
		this.index = index_ !== undefined ? index_ : ($sliceType($Int)).nil;
	});
	Value = $pkg.Value = $newType(0, "Struct", "reflect.Value", "Value", "reflect", function(typ_, ptr_, scalar_, flag_) {
		this.$val = this;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(rtype)).nil;
		this.ptr = ptr_ !== undefined ? ptr_ : 0;
		this.scalar = scalar_ !== undefined ? scalar_ : 0;
		this.flag = flag_ !== undefined ? flag_ : 0;
	});
	flag = $pkg.flag = $newType(4, "Uintptr", "reflect.flag", "flag", "reflect", null);
	ValueError = $pkg.ValueError = $newType(0, "Struct", "reflect.ValueError", "ValueError", "reflect", function(Method_, Kind_) {
		this.$val = this;
		this.Method = Method_ !== undefined ? Method_ : "";
		this.Kind = Kind_ !== undefined ? Kind_ : 0;
	});
	iword = $pkg.iword = $newType(4, "UnsafePointer", "reflect.iword", "iword", "reflect", null);
	nonEmptyInterface = $pkg.nonEmptyInterface = $newType(0, "Struct", "reflect.nonEmptyInterface", "nonEmptyInterface", "reflect", function(itab_, word_) {
		this.$val = this;
		this.itab = itab_ !== undefined ? itab_ : ($ptrType(($structType([["ityp", "ityp", "reflect", ($ptrType(rtype)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["link", "link", "reflect", $UnsafePointer, ""], ["bad", "bad", "reflect", $Int32, ""], ["unused", "unused", "reflect", $Int32, ""], ["fun", "fun", "reflect", ($arrayType($UnsafePointer, 100000)), ""]])))).nil;
		this.word = word_ !== undefined ? word_ : 0;
	});
	init = function() {
		var used, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, x$10, x$11, x$12, pkg, _map, _key;
		used = (function(i) {
		});
		used((x = new rtype.Ptr(0, 0, 0, 0, 0, 0, ($ptrType($Uintptr)).nil, 0, ($ptrType($String)).nil, ($ptrType(uncommonType)).nil, ($ptrType(rtype)).nil, 0), new x.constructor.Struct(x)));
		used((x$1 = new uncommonType.Ptr(($ptrType($String)).nil, ($ptrType($String)).nil, ($sliceType(method)).nil), new x$1.constructor.Struct(x$1)));
		used((x$2 = new method.Ptr(($ptrType($String)).nil, ($ptrType($String)).nil, ($ptrType(rtype)).nil, ($ptrType(rtype)).nil, 0, 0), new x$2.constructor.Struct(x$2)));
		used((x$3 = new arrayType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil, ($ptrType(rtype)).nil, 0), new x$3.constructor.Struct(x$3)));
		used((x$4 = new chanType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil, 0), new x$4.constructor.Struct(x$4)));
		used((x$5 = new funcType.Ptr(new rtype.Ptr(), false, ($sliceType(($ptrType(rtype)))).nil, ($sliceType(($ptrType(rtype)))).nil), new x$5.constructor.Struct(x$5)));
		used((x$6 = new interfaceType.Ptr(new rtype.Ptr(), ($sliceType(imethod)).nil), new x$6.constructor.Struct(x$6)));
		used((x$7 = new mapType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil, ($ptrType(rtype)).nil, ($ptrType(rtype)).nil, ($ptrType(rtype)).nil), new x$7.constructor.Struct(x$7)));
		used((x$8 = new ptrType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil), new x$8.constructor.Struct(x$8)));
		used((x$9 = new sliceType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil), new x$9.constructor.Struct(x$9)));
		used((x$10 = new structType.Ptr(new rtype.Ptr(), ($sliceType(structField)).nil), new x$10.constructor.Struct(x$10)));
		used((x$11 = new imethod.Ptr(($ptrType($String)).nil, ($ptrType($String)).nil, ($ptrType(rtype)).nil), new x$11.constructor.Struct(x$11)));
		used((x$12 = new structField.Ptr(($ptrType($String)).nil, ($ptrType($String)).nil, ($ptrType(rtype)).nil, ($ptrType($String)).nil, 0), new x$12.constructor.Struct(x$12)));
		pkg = $pkg;
		pkg.kinds = $externalize((_map = new $Map(), _key = "Bool", _map[_key] = { k: _key, v: 1 }, _key = "Int", _map[_key] = { k: _key, v: 2 }, _key = "Int8", _map[_key] = { k: _key, v: 3 }, _key = "Int16", _map[_key] = { k: _key, v: 4 }, _key = "Int32", _map[_key] = { k: _key, v: 5 }, _key = "Int64", _map[_key] = { k: _key, v: 6 }, _key = "Uint", _map[_key] = { k: _key, v: 7 }, _key = "Uint8", _map[_key] = { k: _key, v: 8 }, _key = "Uint16", _map[_key] = { k: _key, v: 9 }, _key = "Uint32", _map[_key] = { k: _key, v: 10 }, _key = "Uint64", _map[_key] = { k: _key, v: 11 }, _key = "Uintptr", _map[_key] = { k: _key, v: 12 }, _key = "Float32", _map[_key] = { k: _key, v: 13 }, _key = "Float64", _map[_key] = { k: _key, v: 14 }, _key = "Complex64", _map[_key] = { k: _key, v: 15 }, _key = "Complex128", _map[_key] = { k: _key, v: 16 }, _key = "Array", _map[_key] = { k: _key, v: 17 }, _key = "Chan", _map[_key] = { k: _key, v: 18 }, _key = "Func", _map[_key] = { k: _key, v: 19 }, _key = "Interface", _map[_key] = { k: _key, v: 20 }, _key = "Map", _map[_key] = { k: _key, v: 21 }, _key = "Ptr", _map[_key] = { k: _key, v: 22 }, _key = "Slice", _map[_key] = { k: _key, v: 23 }, _key = "String", _map[_key] = { k: _key, v: 24 }, _key = "Struct", _map[_key] = { k: _key, v: 25 }, _key = "UnsafePointer", _map[_key] = { k: _key, v: 26 }, _map), ($mapType($String, Kind)));
		pkg.RecvDir = 1;
		pkg.SendDir = 2;
		pkg.BothDir = 3;
		$reflect = pkg;
		initialized = true;
		uint8Type = $assertType(TypeOf(new $Uint8(0)), ($ptrType(rtype)));
	};
	jsType = function(typ) {
		return typ.jsType;
	};
	reflectType = function(typ) {
		return typ.reflectType();
	};
	isWrapped = function(typ) {
		var _ref;
		_ref = typ.Kind();
		if (_ref === 1 || _ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 7 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 12 || _ref === 13 || _ref === 14 || _ref === 17 || _ref === 21 || _ref === 19 || _ref === 24 || _ref === 25) {
			return true;
		} else if (_ref === 22) {
			return typ.Elem().Kind() === 17;
		}
		return false;
	};
	copyStruct = function(dst, src, typ) {
		var fields, i, name;
		fields = jsType(typ).fields;
		i = 0;
		while (i < $parseInt(fields.length)) {
			name = $internalize(fields[i][0], $String);
			dst[$externalize(name, $String)] = src[$externalize(name, $String)];
			i = i + (1) >> 0;
		}
	};
	makeValue = function(t, v, fl) {
		var rt;
		rt = t.common();
		if ((t.Kind() === 17) || (t.Kind() === 25) || rt.pointers()) {
			return new Value.Ptr(rt, v, 0, (fl | ((t.Kind() >>> 0) << 4 >>> 0)) >>> 0);
		}
		if (t.Size() > 4 || (t.Kind() === 24)) {
			return new Value.Ptr(rt, $newDataPointer(v, jsType(rt.ptrTo())), 0, (((fl | ((t.Kind() >>> 0) << 4 >>> 0)) >>> 0) | 2) >>> 0);
		}
		return new Value.Ptr(rt, 0, v, (fl | ((t.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	MakeSlice = $pkg.MakeSlice = function(typ, len, cap) {
		if (!((typ.Kind() === 23))) {
			$panic(new $String("reflect.MakeSlice of non-slice type"));
		}
		if (len < 0) {
			$panic(new $String("reflect.MakeSlice: negative len"));
		}
		if (cap < 0) {
			$panic(new $String("reflect.MakeSlice: negative cap"));
		}
		if (len > cap) {
			$panic(new $String("reflect.MakeSlice: len > cap"));
		}
		return makeValue(typ, jsType(typ).make(len, cap, $externalize((function() {
			return jsType(typ.Elem()).zero();
		}), ($funcType([], [js.Object], false)))), 0);
	};
	jsObject = function() {
		return reflectType($packages[$externalize("github.com/gopherjs/gopherjs/js", $String)].Object);
	};
	TypeOf = $pkg.TypeOf = function(i) {
		var c;
		if (!initialized) {
			return new rtype.Ptr(0, 0, 0, 0, 0, 0, ($ptrType($Uintptr)).nil, 0, ($ptrType($String)).nil, ($ptrType(uncommonType)).nil, ($ptrType(rtype)).nil, 0);
		}
		if ($interfaceIsEqual(i, $ifaceNil)) {
			return $ifaceNil;
		}
		c = i.constructor;
		if (c.kind === undefined) {
			return jsObject();
		}
		return reflectType(c);
	};
	ValueOf = $pkg.ValueOf = function(i) {
		var c;
		if ($interfaceIsEqual(i, $ifaceNil)) {
			return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
		}
		c = i.constructor;
		if (c.kind === undefined) {
			return new Value.Ptr(jsObject(), 0, i, 320);
		}
		return makeValue(reflectType(c), i.$val, 0);
	};
	rtype.Ptr.prototype.ptrTo = function() {
		var t;
		t = this;
		return reflectType($ptrType(jsType(t)));
	};
	rtype.prototype.ptrTo = function() { return this.$val.ptrTo(); };
	SliceOf = $pkg.SliceOf = function(t) {
		return reflectType($sliceType(jsType(t)));
	};
	Zero = $pkg.Zero = function(typ) {
		return makeValue(typ, jsType(typ).zero(), 0);
	};
	unsafe_New = function(typ) {
		var _ref;
		_ref = typ.Kind();
		if (_ref === 25) {
			return new (jsType(typ).Ptr)();
		} else if (_ref === 17) {
			return jsType(typ).zero();
		} else {
			return $newDataPointer(jsType(typ).zero(), jsType(typ.ptrTo()));
		}
	};
	makeInt = function(f, bits, t) {
		var typ, ptr, s, _ref;
		typ = t.common();
		if (typ.size > 4) {
			ptr = unsafe_New(typ);
			ptr.$set(bits);
			return new Value.Ptr(typ, ptr, 0, (((f | 2) >>> 0) | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
		}
		s = 0;
		_ref = typ.Kind();
		if (_ref === 3) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low << 24 >> 24));
		} else if (_ref === 4) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low << 16 >> 16));
		} else if (_ref === 2 || _ref === 5) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low >> 0));
		} else if (_ref === 8) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low << 24 >>> 24));
		} else if (_ref === 9) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low << 16 >>> 16));
		} else if (_ref === 7 || _ref === 10 || _ref === 12) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low >>> 0));
		}
		return new Value.Ptr(typ, 0, s, (f | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	memmove = function(adst, asrc, n) {
		adst.$set(asrc.$get());
	};
	loadScalar = function(p, n) {
		return p.$get();
	};
	mapaccess = function(t, m, key) {
		var k, entry;
		k = key.$get();
		if (!(k.$key === undefined)) {
			k = k.$key();
		}
		entry = m[$externalize($internalize(k, $String), $String)];
		if (entry === undefined) {
			return 0;
		}
		return $newDataPointer(entry.v, jsType(PtrTo(t.Elem())));
	};
	mapassign = function(t, m, key, val) {
		var kv, k, jsVal, et, newVal, entry;
		kv = key.$get();
		k = kv;
		if (!(k.$key === undefined)) {
			k = k.$key();
		}
		jsVal = val.$get();
		et = t.Elem();
		if (et.Kind() === 25) {
			newVal = jsType(et).zero();
			copyStruct(newVal, jsVal, et);
			jsVal = newVal;
		}
		entry = new ($global.Object)();
		entry.k = kv;
		entry.v = jsVal;
		m[$externalize($internalize(k, $String), $String)] = entry;
	};
	mapdelete = function(t, m, key) {
		var k;
		k = key.$get();
		if (!(k.$key === undefined)) {
			k = k.$key();
		}
		delete m[$externalize($internalize(k, $String), $String)];
	};
	mapiterinit = function(t, m) {
		return new mapIter.Ptr(t, m, $keys(m), 0);
	};
	mapiterkey = function(it) {
		var iter, k;
		iter = it;
		k = iter.keys[iter.i];
		return $newDataPointer(iter.m[$externalize($internalize(k, $String), $String)].k, jsType(PtrTo(iter.t.Key())));
	};
	mapiternext = function(it) {
		var iter;
		iter = it;
		iter.i = iter.i + (1) >> 0;
	};
	maplen = function(m) {
		return $parseInt($keys(m).length);
	};
	cvtDirect = function(v, typ) {
		var srcVal, val, k, _ref, slice;
		srcVal = v.iword();
		if (srcVal === jsType(v.typ).nil) {
			return makeValue(typ, jsType(typ).nil, v.flag);
		}
		val = $ifaceNil;
		k = typ.Kind();
		_ref = k;
		switch (0) { default: if (_ref === 18) {
			val = new (jsType(typ))();
		} else if (_ref === 23) {
			slice = new (jsType(typ))(srcVal.$array);
			slice.$offset = srcVal.$offset;
			slice.$length = srcVal.$length;
			slice.$capacity = srcVal.$capacity;
			val = $newDataPointer(slice, jsType(PtrTo(typ)));
		} else if (_ref === 22) {
			if (typ.Elem().Kind() === 25) {
				if ($interfaceIsEqual(typ.Elem(), v.typ.Elem())) {
					val = srcVal;
					break;
				}
				val = new (jsType(typ))();
				copyStruct(val, srcVal, typ.Elem());
				break;
			}
			val = new (jsType(typ))(srcVal.$get, srcVal.$set);
		} else if (_ref === 25) {
			val = new (jsType(typ).Ptr)();
			copyStruct(val, srcVal, typ);
		} else if (_ref === 17 || _ref === 19 || _ref === 20 || _ref === 21 || _ref === 24) {
			val = v.ptr;
		} else {
			$panic(new ValueError.Ptr("reflect.Convert", k));
		} }
		return new Value.Ptr(typ.common(), val, 0, (((v.flag & 3) >>> 0) | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	methodReceiver = function(op, v, i) {
		var rcvrtype = ($ptrType(rtype)).nil, t = ($ptrType(rtype)).nil, fn = 0, name, tt, x, m, iface, ut, x$1, m$1, rcvr;
		name = "";
		if (v.typ.Kind() === 20) {
			tt = v.typ.interfaceType;
			if (i < 0 || i >= tt.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x = tt.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (!($pointerIsEqual(m.pkgPath, ($ptrType($String)).nil))) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			iface = $clone(v.ptr, nonEmptyInterface);
			if (iface.itab === ($ptrType(($structType([["ityp", "ityp", "reflect", ($ptrType(rtype)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["link", "link", "reflect", $UnsafePointer, ""], ["bad", "bad", "reflect", $Int32, ""], ["unused", "unused", "reflect", $Int32, ""], ["fun", "fun", "reflect", ($arrayType($UnsafePointer, 100000)), ""]])))).nil) {
				$panic(new $String("reflect: " + op + " of method on nil interface value"));
			}
			t = m.typ;
			name = m.name.$get();
		} else {
			ut = v.typ.uncommonType.uncommon();
			if (ut === ($ptrType(uncommonType)).nil || i < 0 || i >= ut.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m$1 = (x$1 = ut.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
			if (!($pointerIsEqual(m$1.pkgPath, ($ptrType($String)).nil))) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			t = m$1.mtyp;
			name = $internalize(jsType(v.typ).methods[i][0], $String);
		}
		rcvr = v.iword();
		if (isWrapped(v.typ)) {
			rcvr = new (jsType(v.typ))(rcvr);
		}
		fn = rcvr[$externalize(name, $String)];
		return [rcvrtype, t, fn];
	};
	valueInterface = function(v, safe) {
		if (v.flag === 0) {
			$panic(new ValueError.Ptr("reflect.Value.Interface", 0));
		}
		if (safe && !((((v.flag & 1) >>> 0) === 0))) {
			$panic(new $String("reflect.Value.Interface: cannot return value obtained from unexported field or method"));
		}
		if (!((((v.flag & 8) >>> 0) === 0))) {
			$copy(v, makeMethodValue("Interface", $clone(v, Value)), Value);
		}
		if (isWrapped(v.typ)) {
			return new (jsType(v.typ))(v.iword());
		}
		return v.iword();
	};
	ifaceE2I = function(t, src, dst) {
		dst.$set(src);
	};
	methodName = function() {
		return "?FIXME?";
	};
	makeMethodValue = function(op, v) {
		var _tuple, fn, rcvr, fv;
		if (((v.flag & 8) >>> 0) === 0) {
			$panic(new $String("reflect: internal error: invalid use of makePartialFunc"));
		}
		_tuple = methodReceiver(op, $clone(v, Value), (v.flag >> 0) >> 9 >> 0); fn = _tuple[2];
		rcvr = v.iword();
		if (isWrapped(v.typ)) {
			rcvr = new (jsType(v.typ))(rcvr);
		}
		fv = (function() {
			return fn.apply(rcvr, $externalize(new ($sliceType(js.Object))($global.Array.prototype.slice.call(arguments, [])), ($sliceType(js.Object))));
		});
		return new Value.Ptr(v.Type().common(), fv, 0, (((v.flag & 1) >>> 0) | 304) >>> 0);
	};
	rtype.Ptr.prototype.pointers = function() {
		var t, _ref;
		t = this;
		_ref = t.Kind();
		if (_ref === 22 || _ref === 21 || _ref === 18 || _ref === 19 || _ref === 25 || _ref === 17) {
			return true;
		} else {
			return false;
		}
	};
	rtype.prototype.pointers = function() { return this.$val.pointers(); };
	uncommonType.Ptr.prototype.Method = function(i) {
		var m = new Method.Ptr(), t, x, p, fl, mt, name, fn;
		t = this;
		if (t === ($ptrType(uncommonType)).nil || i < 0 || i >= t.methods.$length) {
			$panic(new $String("reflect: Method index out of range"));
		}
		p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		if (!($pointerIsEqual(p.name, ($ptrType($String)).nil))) {
			m.Name = p.name.$get();
		}
		fl = 304;
		if (!($pointerIsEqual(p.pkgPath, ($ptrType($String)).nil))) {
			m.PkgPath = p.pkgPath.$get();
			fl = (fl | (1)) >>> 0;
		}
		mt = p.typ;
		m.Type = mt;
		name = $internalize(t.jsType.methods[i][0], $String);
		fn = (function(rcvr) {
			return rcvr[$externalize(name, $String)].apply(rcvr, $externalize($subslice(new ($sliceType(js.Object))($global.Array.prototype.slice.call(arguments, [])), 1), ($sliceType(js.Object))));
		});
		$copy(m.Func, new Value.Ptr(mt, fn, 0, fl), Value);
		m.Index = i;
		return m;
	};
	uncommonType.prototype.Method = function(i) { return this.$val.Method(i); };
	Value.Ptr.prototype.iword = function() {
		var v, val, _ref, newVal;
		v = new Value.Ptr(); $copy(v, this, Value);
		if ((v.typ.Kind() === 17) || (v.typ.Kind() === 25)) {
			return v.ptr;
		}
		if (!((((v.flag & 2) >>> 0) === 0))) {
			val = v.ptr.$get();
			if (!(val === $ifaceNil) && !(val.constructor === jsType(v.typ))) {
				_ref = v.typ.Kind();
				switch (0) { default: if (_ref === 11 || _ref === 6) {
					val = new (jsType(v.typ))(val.$high, val.$low);
				} else if (_ref === 15 || _ref === 16) {
					val = new (jsType(v.typ))(val.$real, val.$imag);
				} else if (_ref === 23) {
					if (val === val.constructor.nil) {
						val = jsType(v.typ).nil;
						break;
					}
					newVal = new (jsType(v.typ))(val.$array);
					newVal.$offset = val.$offset;
					newVal.$length = val.$length;
					newVal.$capacity = val.$capacity;
					val = newVal;
				} }
			}
			return val;
		}
		if (v.typ.pointers()) {
			return v.ptr;
		}
		return v.scalar;
	};
	Value.prototype.iword = function() { return this.$val.iword(); };
	Value.Ptr.prototype.call = function(op, in$1) {
		var v, t, fn, rcvr, _tuple, isSlice, n, _ref, _i, x, i, _tmp, _tmp$1, xt, targ, m, slice, elem, i$1, x$1, x$2, xt$1, origIn, nin, nout, argsArray, _ref$1, _i$1, i$2, arg, results, _ref$2, ret, _ref$3, _i$2, i$3;
		v = new Value.Ptr(); $copy(v, this, Value);
		t = v.typ;
		fn = 0;
		rcvr = $ifaceNil;
		if (!((((v.flag & 8) >>> 0) === 0))) {
			_tuple = methodReceiver(op, $clone(v, Value), (v.flag >> 0) >> 9 >> 0); t = _tuple[1]; fn = _tuple[2];
			rcvr = v.iword();
			if (isWrapped(v.typ)) {
				rcvr = new (jsType(v.typ))(rcvr);
			}
		} else {
			fn = v.iword();
		}
		if (fn === 0) {
			$panic(new $String("reflect.Value.Call: call of nil function"));
		}
		isSlice = op === "CallSlice";
		n = t.NumIn();
		if (isSlice) {
			if (!t.IsVariadic()) {
				$panic(new $String("reflect: CallSlice of non-variadic function"));
			}
			if (in$1.$length < n) {
				$panic(new $String("reflect: CallSlice with too few input arguments"));
			}
			if (in$1.$length > n) {
				$panic(new $String("reflect: CallSlice with too many input arguments"));
			}
		} else {
			if (t.IsVariadic()) {
				n = n - (1) >> 0;
			}
			if (in$1.$length < n) {
				$panic(new $String("reflect: Call with too few input arguments"));
			}
			if (!t.IsVariadic() && in$1.$length > n) {
				$panic(new $String("reflect: Call with too many input arguments"));
			}
		}
		_ref = in$1;
		_i = 0;
		while (_i < _ref.$length) {
			x = new Value.Ptr(); $copy(x, ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), Value);
			if (x.Kind() === 0) {
				$panic(new $String("reflect: " + op + " using zero Value argument"));
			}
			_i++;
		}
		i = 0;
		while (i < n) {
			_tmp = ((i < 0 || i >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + i]).Type(); _tmp$1 = t.In(i); xt = _tmp; targ = _tmp$1;
			if (!xt.AssignableTo(targ)) {
				$panic(new $String("reflect: " + op + " using " + xt.String() + " as type " + targ.String()));
			}
			i = i + (1) >> 0;
		}
		if (!isSlice && t.IsVariadic()) {
			m = in$1.$length - n >> 0;
			slice = new Value.Ptr(); $copy(slice, MakeSlice(t.In(n), m, m), Value);
			elem = t.In(n).Elem();
			i$1 = 0;
			while (i$1 < m) {
				x$2 = new Value.Ptr(); $copy(x$2, (x$1 = n + i$1 >> 0, ((x$1 < 0 || x$1 >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + x$1])), Value);
				xt$1 = x$2.Type();
				if (!xt$1.AssignableTo(elem)) {
					$panic(new $String("reflect: cannot use " + xt$1.String() + " as type " + elem.String() + " in " + op));
				}
				slice.Index(i$1).Set($clone(x$2, Value));
				i$1 = i$1 + (1) >> 0;
			}
			origIn = in$1;
			in$1 = ($sliceType(Value)).make((n + 1 >> 0));
			$copySlice($subslice(in$1, 0, n), origIn);
			$copy(((n < 0 || n >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + n]), slice, Value);
		}
		nin = in$1.$length;
		if (!((nin === t.NumIn()))) {
			$panic(new $String("reflect.Value.Call: wrong argument count"));
		}
		nout = t.NumOut();
		argsArray = new ($global.Array)(t.NumIn());
		_ref$1 = in$1;
		_i$1 = 0;
		while (_i$1 < _ref$1.$length) {
			i$2 = _i$1;
			arg = new Value.Ptr(); $copy(arg, ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i$1]), Value);
			argsArray[i$2] = arg.assignTo("reflect.Value.Call", t.In(i$2).common(), ($ptrType($emptyInterface)).nil).iword();
			_i$1++;
		}
		results = fn.apply(rcvr, argsArray);
		_ref$2 = nout;
		if (_ref$2 === 0) {
			return ($sliceType(Value)).nil;
		} else if (_ref$2 === 1) {
			return new ($sliceType(Value))([$clone(makeValue(t.Out(0), results, 0), Value)]);
		} else {
			ret = ($sliceType(Value)).make(nout);
			_ref$3 = ret;
			_i$2 = 0;
			while (_i$2 < _ref$3.$length) {
				i$3 = _i$2;
				$copy(((i$3 < 0 || i$3 >= ret.$length) ? $throwRuntimeError("index out of range") : ret.$array[ret.$offset + i$3]), makeValue(t.Out(i$3), results[i$3], 0), Value);
				_i$2++;
			}
			return ret;
		}
	};
	Value.prototype.call = function(op, in$1) { return this.$val.call(op, in$1); };
	Value.Ptr.prototype.Cap = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 17) {
			return v.typ.Len();
		} else if (_ref === 18 || _ref === 23) {
			return $parseInt(v.iword().$capacity) >> 0;
		}
		$panic(new ValueError.Ptr("reflect.Value.Cap", k));
	};
	Value.prototype.Cap = function() { return this.$val.Cap(); };
	Value.Ptr.prototype.Elem = function() {
		var v, k, _ref, val, typ, val$1, tt, fl;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 20) {
			val = v.iword();
			if (val === $ifaceNil) {
				return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
			}
			typ = reflectType(val.constructor);
			return makeValue(typ, val.$val, (v.flag & 1) >>> 0);
		} else if (_ref === 22) {
			if (v.IsNil()) {
				return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
			}
			val$1 = v.iword();
			tt = v.typ.ptrType;
			fl = (((((v.flag & 1) >>> 0) | 2) >>> 0) | 4) >>> 0;
			fl = (fl | (((tt.elem.Kind() >>> 0) << 4 >>> 0))) >>> 0;
			return new Value.Ptr(tt.elem, val$1, 0, fl);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Elem", k));
		}
	};
	Value.prototype.Elem = function() { return this.$val.Elem(); };
	Value.Ptr.prototype.Field = function(i) {
		var v, tt, x, field, name, typ, fl, s;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		tt = v.typ.structType;
		if (i < 0 || i >= tt.fields.$length) {
			$panic(new $String("reflect: Field index out of range"));
		}
		field = (x = tt.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		name = $internalize(jsType(v.typ).fields[i][0], $String);
		typ = field.typ;
		fl = (v.flag & 7) >>> 0;
		if (!($pointerIsEqual(field.pkgPath, ($ptrType($String)).nil))) {
			fl = (fl | (1)) >>> 0;
		}
		fl = (fl | (((typ.Kind() >>> 0) << 4 >>> 0))) >>> 0;
		s = v.ptr;
		if (!((((fl & 2) >>> 0) === 0)) && !((typ.Kind() === 17)) && !((typ.Kind() === 25))) {
			return new Value.Ptr(typ, new (jsType(PtrTo(typ)))($externalize((function() {
				return s[$externalize(name, $String)];
			}), ($funcType([], [js.Object], false))), $externalize((function(v$1) {
				s[$externalize(name, $String)] = v$1;
			}), ($funcType([js.Object], [], false)))), 0, fl);
		}
		return makeValue(typ, s[$externalize(name, $String)], fl);
	};
	Value.prototype.Field = function(i) { return this.$val.Field(i); };
	Value.Ptr.prototype.Index = function(i) {
		var v, k, _ref, tt, typ, fl, a, s, tt$1, typ$1, fl$1, a$1, str, fl$2;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 17) {
			tt = v.typ.arrayType;
			if (i < 0 || i > (tt.len >> 0)) {
				$panic(new $String("reflect: array index out of range"));
			}
			typ = tt.elem;
			fl = (v.flag & 7) >>> 0;
			fl = (fl | (((typ.Kind() >>> 0) << 4 >>> 0))) >>> 0;
			a = v.ptr;
			if (!((((fl & 2) >>> 0) === 0)) && !((typ.Kind() === 17)) && !((typ.Kind() === 25))) {
				return new Value.Ptr(typ, new (jsType(PtrTo(typ)))($externalize((function() {
					return a[i];
				}), ($funcType([], [js.Object], false))), $externalize((function(v$1) {
					a[i] = v$1;
				}), ($funcType([js.Object], [], false)))), 0, fl);
			}
			return makeValue(typ, a[i], fl);
		} else if (_ref === 23) {
			s = v.iword();
			if (i < 0 || i >= ($parseInt(s.$length) >> 0)) {
				$panic(new $String("reflect: slice index out of range"));
			}
			tt$1 = v.typ.sliceType;
			typ$1 = tt$1.elem;
			fl$1 = (6 | ((v.flag & 1) >>> 0)) >>> 0;
			fl$1 = (fl$1 | (((typ$1.Kind() >>> 0) << 4 >>> 0))) >>> 0;
			i = i + (($parseInt(s.$offset) >> 0)) >> 0;
			a$1 = s.$array;
			if (!((((fl$1 & 2) >>> 0) === 0)) && !((typ$1.Kind() === 17)) && !((typ$1.Kind() === 25))) {
				return new Value.Ptr(typ$1, new (jsType(PtrTo(typ$1)))($externalize((function() {
					return a$1[i];
				}), ($funcType([], [js.Object], false))), $externalize((function(v$1) {
					a$1[i] = v$1;
				}), ($funcType([js.Object], [], false)))), 0, fl$1);
			}
			return makeValue(typ$1, a$1[i], fl$1);
		} else if (_ref === 24) {
			str = v.ptr.$get();
			if (i < 0 || i >= str.length) {
				$panic(new $String("reflect: string index out of range"));
			}
			fl$2 = (((v.flag & 1) >>> 0) | 128) >>> 0;
			return new Value.Ptr(uint8Type, 0, (str.charCodeAt(i) >>> 0), fl$2);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Index", k));
		}
	};
	Value.prototype.Index = function(i) { return this.$val.Index(i); };
	Value.Ptr.prototype.IsNil = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 18 || _ref === 22 || _ref === 23) {
			return v.iword() === jsType(v.typ).nil;
		} else if (_ref === 19) {
			return v.iword() === $throwNilPointerError;
		} else if (_ref === 21) {
			return v.iword() === false;
		} else if (_ref === 20) {
			return v.iword() === $ifaceNil;
		} else {
			$panic(new ValueError.Ptr("reflect.Value.IsNil", k));
		}
	};
	Value.prototype.IsNil = function() { return this.$val.IsNil(); };
	Value.Ptr.prototype.Len = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 17 || _ref === 24) {
			return $parseInt(v.iword().length);
		} else if (_ref === 23) {
			return $parseInt(v.iword().$length) >> 0;
		} else if (_ref === 18) {
			return $parseInt(v.iword().$buffer.length) >> 0;
		} else if (_ref === 21) {
			return $parseInt($keys(v.iword()).length);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Len", k));
		}
	};
	Value.prototype.Len = function() { return this.$val.Len(); };
	Value.Ptr.prototype.Pointer = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 18 || _ref === 21 || _ref === 22 || _ref === 23 || _ref === 26) {
			if (v.IsNil()) {
				return 0;
			}
			return v.iword();
		} else if (_ref === 19) {
			if (v.IsNil()) {
				return 0;
			}
			return 1;
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Pointer", k));
		}
	};
	Value.prototype.Pointer = function() { return this.$val.Pointer(); };
	Value.Ptr.prototype.Set = function(x) {
		var v, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(x.flag)).mustBeExported();
		$copy(x, x.assignTo("reflect.Set", v.typ, ($ptrType($emptyInterface)).nil), Value);
		if (!((((v.flag & 2) >>> 0) === 0))) {
			_ref = v.typ.Kind();
			if (_ref === 17) {
				$copy(v.ptr, x.ptr, jsType(v.typ));
			} else if (_ref === 20) {
				v.ptr.$set(valueInterface($clone(x, Value), false));
			} else if (_ref === 25) {
				copyStruct(v.ptr, x.ptr, v.typ);
			} else {
				v.ptr.$set(x.iword());
			}
			return;
		}
		v.ptr = x.ptr;
	};
	Value.prototype.Set = function(x) { return this.$val.Set(x); };
	Value.Ptr.prototype.SetCap = function(n) {
		var v, s, newSlice;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(23);
		s = v.ptr.$get();
		if (n < ($parseInt(s.$length) >> 0) || n > ($parseInt(s.$capacity) >> 0)) {
			$panic(new $String("reflect: slice capacity out of range in SetCap"));
		}
		newSlice = new (jsType(v.typ))(s.$array);
		newSlice.$offset = s.$offset;
		newSlice.$length = s.$length;
		newSlice.$capacity = n;
		v.ptr.$set(newSlice);
	};
	Value.prototype.SetCap = function(n) { return this.$val.SetCap(n); };
	Value.Ptr.prototype.SetLen = function(n) {
		var v, s, newSlice;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(23);
		s = v.ptr.$get();
		if (n < 0 || n > ($parseInt(s.$capacity) >> 0)) {
			$panic(new $String("reflect: slice length out of range in SetLen"));
		}
		newSlice = new (jsType(v.typ))(s.$array);
		newSlice.$offset = s.$offset;
		newSlice.$length = n;
		newSlice.$capacity = s.$capacity;
		v.ptr.$set(newSlice);
	};
	Value.prototype.SetLen = function(n) { return this.$val.SetLen(n); };
	Value.Ptr.prototype.Slice = function(i, j) {
		var v, cap, typ, s, kind, _ref, tt, str;
		v = new Value.Ptr(); $copy(v, this, Value);
		cap = 0;
		typ = $ifaceNil;
		s = $ifaceNil;
		kind = (new flag(v.flag)).kind();
		_ref = kind;
		if (_ref === 17) {
			if (((v.flag & 4) >>> 0) === 0) {
				$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
			}
			tt = v.typ.arrayType;
			cap = (tt.len >> 0);
			typ = SliceOf(tt.elem);
			s = new (jsType(typ))(v.iword());
		} else if (_ref === 23) {
			typ = v.typ;
			s = v.iword();
			cap = $parseInt(s.$capacity) >> 0;
		} else if (_ref === 24) {
			str = v.ptr.$get();
			if (i < 0 || j < i || j > str.length) {
				$panic(new $String("reflect.Value.Slice: string slice index out of bounds"));
			}
			return ValueOf(new $String(str.substring(i, j)));
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Slice", kind));
		}
		if (i < 0 || j < i || j > cap) {
			$panic(new $String("reflect.Value.Slice: slice index out of bounds"));
		}
		return makeValue(typ, $subslice(s, i, j), (v.flag & 1) >>> 0);
	};
	Value.prototype.Slice = function(i, j) { return this.$val.Slice(i, j); };
	Value.Ptr.prototype.Slice3 = function(i, j, k) {
		var v, cap, typ, s, kind, _ref, tt;
		v = new Value.Ptr(); $copy(v, this, Value);
		cap = 0;
		typ = $ifaceNil;
		s = $ifaceNil;
		kind = (new flag(v.flag)).kind();
		_ref = kind;
		if (_ref === 17) {
			if (((v.flag & 4) >>> 0) === 0) {
				$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
			}
			tt = v.typ.arrayType;
			cap = (tt.len >> 0);
			typ = SliceOf(tt.elem);
			s = new (jsType(typ))(v.iword());
		} else if (_ref === 23) {
			typ = v.typ;
			s = v.iword();
			cap = $parseInt(s.$capacity) >> 0;
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Slice3", kind));
		}
		if (i < 0 || j < i || k < j || k > cap) {
			$panic(new $String("reflect.Value.Slice3: slice index out of bounds"));
		}
		return makeValue(typ, $subslice(s, i, j, k), (v.flag & 1) >>> 0);
	};
	Value.prototype.Slice3 = function(i, j, k) { return this.$val.Slice3(i, j, k); };
	Value.Ptr.prototype.Close = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(18);
		(new flag(v.flag)).mustBeExported();
		$close(v.iword());
	};
	Value.prototype.Close = function() { return this.$val.Close(); };
	Value.Ptr.prototype.TrySend = function(x) {
		var v, tt, c;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(18);
		(new flag(v.flag)).mustBeExported();
		tt = v.typ.chanType;
		if (((tt.dir >> 0) & 2) === 0) {
			$panic(new $String("reflect: send on recv-only channel"));
		}
		(new flag(x.flag)).mustBeExported();
		c = v.iword();
		if (!!!(c.$closed) && ($parseInt(c.$recvQueue.length) === 0) && ($parseInt(c.$buffer.length) === ($parseInt(c.$capacity) >> 0))) {
			return false;
		}
		$copy(x, x.assignTo("reflect.Value.Send", tt.elem, ($ptrType($emptyInterface)).nil), Value);
		$send(c, x.iword());
		return true;
	};
	Value.prototype.TrySend = function(x) { return this.$val.TrySend(x); };
	Value.Ptr.prototype.Send = function(x) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		$panic(new runtime.NotSupportedError.Ptr("reflect.Value.Send, use reflect.Value.TrySend is possible"));
	};
	Value.prototype.Send = function(x) { return this.$val.Send(x); };
	Value.Ptr.prototype.TryRecv = function() {
		var x = new Value.Ptr(), ok = false, v, tt, res, _tmp, _tmp$1, _tmp$2, _tmp$3;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(18);
		(new flag(v.flag)).mustBeExported();
		tt = v.typ.chanType;
		if (((tt.dir >> 0) & 1) === 0) {
			$panic(new $String("reflect: recv on send-only channel"));
		}
		res = $recv(v.iword());
		if (res.constructor === $global.Function) {
			_tmp = new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0); _tmp$1 = false; $copy(x, _tmp, Value); ok = _tmp$1;
			return [x, ok];
		}
		_tmp$2 = new Value.Ptr(); $copy(_tmp$2, makeValue(tt.elem, res[0], 0), Value); _tmp$3 = !!(res[1]); $copy(x, _tmp$2, Value); ok = _tmp$3;
		return [x, ok];
	};
	Value.prototype.TryRecv = function() { return this.$val.TryRecv(); };
	Value.Ptr.prototype.Recv = function() {
		var x = new Value.Ptr(), ok = false, v;
		v = new Value.Ptr(); $copy(v, this, Value);
		$panic(new runtime.NotSupportedError.Ptr("reflect.Value.Recv, use reflect.Value.TryRecv is possible"));
	};
	Value.prototype.Recv = function() { return this.$val.Recv(); };
	Kind.prototype.String = function() {
		var k;
		k = this.$val !== undefined ? this.$val : this;
		if ((k >> 0) < kindNames.$length) {
			return ((k < 0 || k >= kindNames.$length) ? $throwRuntimeError("index out of range") : kindNames.$array[kindNames.$offset + k]);
		}
		return "kind" + strconv.Itoa((k >> 0));
	};
	$ptrType(Kind).prototype.String = function() { return new Kind(this.$get()).String(); };
	uncommonType.Ptr.prototype.uncommon = function() {
		var t;
		t = this;
		return t;
	};
	uncommonType.prototype.uncommon = function() { return this.$val.uncommon(); };
	uncommonType.Ptr.prototype.PkgPath = function() {
		var t;
		t = this;
		if (t === ($ptrType(uncommonType)).nil || $pointerIsEqual(t.pkgPath, ($ptrType($String)).nil)) {
			return "";
		}
		return t.pkgPath.$get();
	};
	uncommonType.prototype.PkgPath = function() { return this.$val.PkgPath(); };
	uncommonType.Ptr.prototype.Name = function() {
		var t;
		t = this;
		if (t === ($ptrType(uncommonType)).nil || $pointerIsEqual(t.name, ($ptrType($String)).nil)) {
			return "";
		}
		return t.name.$get();
	};
	uncommonType.prototype.Name = function() { return this.$val.Name(); };
	rtype.Ptr.prototype.String = function() {
		var t;
		t = this;
		return t.string.$get();
	};
	rtype.prototype.String = function() { return this.$val.String(); };
	rtype.Ptr.prototype.Size = function() {
		var t;
		t = this;
		return t.size;
	};
	rtype.prototype.Size = function() { return this.$val.Size(); };
	rtype.Ptr.prototype.Bits = function() {
		var t, k, x;
		t = this;
		if (t === ($ptrType(rtype)).nil) {
			$panic(new $String("reflect: Bits of nil Type"));
		}
		k = t.Kind();
		if (k < 2 || k > 16) {
			$panic(new $String("reflect: Bits of non-arithmetic Type " + t.String()));
		}
		return (x = (t.size >> 0), (((x >>> 16 << 16) * 8 >> 0) + (x << 16 >>> 16) * 8) >> 0);
	};
	rtype.prototype.Bits = function() { return this.$val.Bits(); };
	rtype.Ptr.prototype.Align = function() {
		var t;
		t = this;
		return (t.align >> 0);
	};
	rtype.prototype.Align = function() { return this.$val.Align(); };
	rtype.Ptr.prototype.FieldAlign = function() {
		var t;
		t = this;
		return (t.fieldAlign >> 0);
	};
	rtype.prototype.FieldAlign = function() { return this.$val.FieldAlign(); };
	rtype.Ptr.prototype.Kind = function() {
		var t;
		t = this;
		return (((t.kind & 127) >>> 0) >>> 0);
	};
	rtype.prototype.Kind = function() { return this.$val.Kind(); };
	rtype.Ptr.prototype.common = function() {
		var t;
		t = this;
		return t;
	};
	rtype.prototype.common = function() { return this.$val.common(); };
	uncommonType.Ptr.prototype.NumMethod = function() {
		var t;
		t = this;
		if (t === ($ptrType(uncommonType)).nil) {
			return 0;
		}
		return t.methods.$length;
	};
	uncommonType.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	uncommonType.Ptr.prototype.MethodByName = function(name) {
		var m = new Method.Ptr(), ok = false, t, p, _ref, _i, i, x, _tmp, _tmp$1;
		t = this;
		if (t === ($ptrType(uncommonType)).nil) {
			return [m, ok];
		}
		p = ($ptrType(method)).nil;
		_ref = t.methods;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (!($pointerIsEqual(p.name, ($ptrType($String)).nil)) && p.name.$get() === name) {
				_tmp = new Method.Ptr(); $copy(_tmp, t.Method(i), Method); _tmp$1 = true; $copy(m, _tmp, Method); ok = _tmp$1;
				return [m, ok];
			}
			_i++;
		}
		return [m, ok];
	};
	uncommonType.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	rtype.Ptr.prototype.NumMethod = function() {
		var t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = t.interfaceType;
			return tt.NumMethod();
		}
		return t.uncommonType.NumMethod();
	};
	rtype.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	rtype.Ptr.prototype.Method = function(i) {
		var m = new Method.Ptr(), t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = t.interfaceType;
			$copy(m, tt.Method(i), Method);
			return m;
		}
		$copy(m, t.uncommonType.Method(i), Method);
		return m;
	};
	rtype.prototype.Method = function(i) { return this.$val.Method(i); };
	rtype.Ptr.prototype.MethodByName = function(name) {
		var m = new Method.Ptr(), ok = false, t, tt, _tuple, _tuple$1;
		t = this;
		if (t.Kind() === 20) {
			tt = t.interfaceType;
			_tuple = tt.MethodByName(name); $copy(m, _tuple[0], Method); ok = _tuple[1];
			return [m, ok];
		}
		_tuple$1 = t.uncommonType.MethodByName(name); $copy(m, _tuple$1[0], Method); ok = _tuple$1[1];
		return [m, ok];
	};
	rtype.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	rtype.Ptr.prototype.PkgPath = function() {
		var t;
		t = this;
		return t.uncommonType.PkgPath();
	};
	rtype.prototype.PkgPath = function() { return this.$val.PkgPath(); };
	rtype.Ptr.prototype.Name = function() {
		var t;
		t = this;
		return t.uncommonType.Name();
	};
	rtype.prototype.Name = function() { return this.$val.Name(); };
	rtype.Ptr.prototype.ChanDir = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 18))) {
			$panic(new $String("reflect: ChanDir of non-chan type"));
		}
		tt = t.chanType;
		return (tt.dir >> 0);
	};
	rtype.prototype.ChanDir = function() { return this.$val.ChanDir(); };
	rtype.Ptr.prototype.IsVariadic = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: IsVariadic of non-func type"));
		}
		tt = t.funcType;
		return tt.dotdotdot;
	};
	rtype.prototype.IsVariadic = function() { return this.$val.IsVariadic(); };
	rtype.Ptr.prototype.Elem = function() {
		var t, _ref, tt, tt$1, tt$2, tt$3, tt$4;
		t = this;
		_ref = t.Kind();
		if (_ref === 17) {
			tt = t.arrayType;
			return toType(tt.elem);
		} else if (_ref === 18) {
			tt$1 = t.chanType;
			return toType(tt$1.elem);
		} else if (_ref === 21) {
			tt$2 = t.mapType;
			return toType(tt$2.elem);
		} else if (_ref === 22) {
			tt$3 = t.ptrType;
			return toType(tt$3.elem);
		} else if (_ref === 23) {
			tt$4 = t.sliceType;
			return toType(tt$4.elem);
		}
		$panic(new $String("reflect: Elem of invalid type"));
	};
	rtype.prototype.Elem = function() { return this.$val.Elem(); };
	rtype.Ptr.prototype.Field = function(i) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: Field of non-struct type"));
		}
		tt = t.structType;
		return tt.Field(i);
	};
	rtype.prototype.Field = function(i) { return this.$val.Field(i); };
	rtype.Ptr.prototype.FieldByIndex = function(index) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByIndex of non-struct type"));
		}
		tt = t.structType;
		return tt.FieldByIndex(index);
	};
	rtype.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	rtype.Ptr.prototype.FieldByName = function(name) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByName of non-struct type"));
		}
		tt = t.structType;
		return tt.FieldByName(name);
	};
	rtype.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	rtype.Ptr.prototype.FieldByNameFunc = function(match) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByNameFunc of non-struct type"));
		}
		tt = t.structType;
		return tt.FieldByNameFunc(match);
	};
	rtype.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	rtype.Ptr.prototype.In = function(i) {
		var t, tt, x;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: In of non-func type"));
		}
		tt = t.funcType;
		return toType((x = tt.in$2, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])));
	};
	rtype.prototype.In = function(i) { return this.$val.In(i); };
	rtype.Ptr.prototype.Key = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 21))) {
			$panic(new $String("reflect: Key of non-map type"));
		}
		tt = t.mapType;
		return toType(tt.key);
	};
	rtype.prototype.Key = function() { return this.$val.Key(); };
	rtype.Ptr.prototype.Len = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 17))) {
			$panic(new $String("reflect: Len of non-array type"));
		}
		tt = t.arrayType;
		return (tt.len >> 0);
	};
	rtype.prototype.Len = function() { return this.$val.Len(); };
	rtype.Ptr.prototype.NumField = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: NumField of non-struct type"));
		}
		tt = t.structType;
		return tt.fields.$length;
	};
	rtype.prototype.NumField = function() { return this.$val.NumField(); };
	rtype.Ptr.prototype.NumIn = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumIn of non-func type"));
		}
		tt = t.funcType;
		return tt.in$2.$length;
	};
	rtype.prototype.NumIn = function() { return this.$val.NumIn(); };
	rtype.Ptr.prototype.NumOut = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumOut of non-func type"));
		}
		tt = t.funcType;
		return tt.out.$length;
	};
	rtype.prototype.NumOut = function() { return this.$val.NumOut(); };
	rtype.Ptr.prototype.Out = function(i) {
		var t, tt, x;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: Out of non-func type"));
		}
		tt = t.funcType;
		return toType((x = tt.out, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])));
	};
	rtype.prototype.Out = function(i) { return this.$val.Out(i); };
	ChanDir.prototype.String = function() {
		var d, _ref;
		d = this.$val !== undefined ? this.$val : this;
		_ref = d;
		if (_ref === 2) {
			return "chan<-";
		} else if (_ref === 1) {
			return "<-chan";
		} else if (_ref === 3) {
			return "chan";
		}
		return "ChanDir" + strconv.Itoa((d >> 0));
	};
	$ptrType(ChanDir).prototype.String = function() { return new ChanDir(this.$get()).String(); };
	interfaceType.Ptr.prototype.Method = function(i) {
		var m = new Method.Ptr(), t, x, p;
		t = this;
		if (i < 0 || i >= t.methods.$length) {
			return m;
		}
		p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		m.Name = p.name.$get();
		if (!($pointerIsEqual(p.pkgPath, ($ptrType($String)).nil))) {
			m.PkgPath = p.pkgPath.$get();
		}
		m.Type = toType(p.typ);
		m.Index = i;
		return m;
	};
	interfaceType.prototype.Method = function(i) { return this.$val.Method(i); };
	interfaceType.Ptr.prototype.NumMethod = function() {
		var t;
		t = this;
		return t.methods.$length;
	};
	interfaceType.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	interfaceType.Ptr.prototype.MethodByName = function(name) {
		var m = new Method.Ptr(), ok = false, t, p, _ref, _i, i, x, _tmp, _tmp$1;
		t = this;
		if (t === ($ptrType(interfaceType)).nil) {
			return [m, ok];
		}
		p = ($ptrType(imethod)).nil;
		_ref = t.methods;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (p.name.$get() === name) {
				_tmp = new Method.Ptr(); $copy(_tmp, t.Method(i), Method); _tmp$1 = true; $copy(m, _tmp, Method); ok = _tmp$1;
				return [m, ok];
			}
			_i++;
		}
		return [m, ok];
	};
	interfaceType.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	StructTag.prototype.Get = function(key) {
		var tag, i, name, qvalue, _tuple, value;
		tag = this.$val !== undefined ? this.$val : this;
		while (!(tag === "")) {
			i = 0;
			while (i < tag.length && (tag.charCodeAt(i) === 32)) {
				i = i + (1) >> 0;
			}
			tag = tag.substring(i);
			if (tag === "") {
				break;
			}
			i = 0;
			while (i < tag.length && !((tag.charCodeAt(i) === 32)) && !((tag.charCodeAt(i) === 58)) && !((tag.charCodeAt(i) === 34))) {
				i = i + (1) >> 0;
			}
			if ((i + 1 >> 0) >= tag.length || !((tag.charCodeAt(i) === 58)) || !((tag.charCodeAt((i + 1 >> 0)) === 34))) {
				break;
			}
			name = tag.substring(0, i);
			tag = tag.substring((i + 1 >> 0));
			i = 1;
			while (i < tag.length && !((tag.charCodeAt(i) === 34))) {
				if (tag.charCodeAt(i) === 92) {
					i = i + (1) >> 0;
				}
				i = i + (1) >> 0;
			}
			if (i >= tag.length) {
				break;
			}
			qvalue = tag.substring(0, (i + 1 >> 0));
			tag = tag.substring((i + 1 >> 0));
			if (key === name) {
				_tuple = strconv.Unquote(qvalue); value = _tuple[0];
				return value;
			}
		}
		return "";
	};
	$ptrType(StructTag).prototype.Get = function(key) { return new StructTag(this.$get()).Get(key); };
	structType.Ptr.prototype.Field = function(i) {
		var f = new StructField.Ptr(), t, x, p, t$1;
		t = this;
		if (i < 0 || i >= t.fields.$length) {
			return f;
		}
		p = (x = t.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		f.Type = toType(p.typ);
		if (!($pointerIsEqual(p.name, ($ptrType($String)).nil))) {
			f.Name = p.name.$get();
		} else {
			t$1 = f.Type;
			if (t$1.Kind() === 22) {
				t$1 = t$1.Elem();
			}
			f.Name = t$1.Name();
			f.Anonymous = true;
		}
		if (!($pointerIsEqual(p.pkgPath, ($ptrType($String)).nil))) {
			f.PkgPath = p.pkgPath.$get();
		}
		if (!($pointerIsEqual(p.tag, ($ptrType($String)).nil))) {
			f.Tag = p.tag.$get();
		}
		f.Offset = p.offset;
		f.Index = new ($sliceType($Int))([i]);
		return f;
	};
	structType.prototype.Field = function(i) { return this.$val.Field(i); };
	structType.Ptr.prototype.FieldByIndex = function(index) {
		var f = new StructField.Ptr(), t, _ref, _i, i, x, ft;
		t = this;
		f.Type = toType(t.rtype);
		_ref = index;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			x = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (i > 0) {
				ft = f.Type;
				if ((ft.Kind() === 22) && (ft.Elem().Kind() === 25)) {
					ft = ft.Elem();
				}
				f.Type = ft;
			}
			$copy(f, f.Type.Field(x), StructField);
			_i++;
		}
		return f;
	};
	structType.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	structType.Ptr.prototype.FieldByNameFunc = function(match) {
		var result = new StructField.Ptr(), ok = false, t, current, next, nextCount, visited, _map, _key, _tmp, _tmp$1, count, _ref, _i, scan, t$1, _entry, _key$1, _ref$1, _i$1, i, x, f, fname, ntyp, _entry$1, _tmp$2, _tmp$3, styp, _entry$2, _key$2, _map$1, _key$3, _key$4, _entry$3, _key$5, index;
		t = this;
		current = new ($sliceType(fieldScan))([]);
		next = new ($sliceType(fieldScan))([new fieldScan.Ptr(t, ($sliceType($Int)).nil)]);
		nextCount = false;
		visited = (_map = new $Map(), _map);
		while (next.$length > 0) {
			_tmp = next; _tmp$1 = $subslice(current, 0, 0); current = _tmp; next = _tmp$1;
			count = nextCount;
			nextCount = false;
			_ref = current;
			_i = 0;
			while (_i < _ref.$length) {
				scan = new fieldScan.Ptr(); $copy(scan, ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), fieldScan);
				t$1 = scan.typ;
				if ((_entry = visited[t$1.$key()], _entry !== undefined ? _entry.v : false)) {
					_i++;
					continue;
				}
				_key$1 = t$1; (visited || $throwRuntimeError("assignment to entry in nil map"))[_key$1.$key()] = { k: _key$1, v: true };
				_ref$1 = t$1.fields;
				_i$1 = 0;
				while (_i$1 < _ref$1.$length) {
					i = _i$1;
					f = (x = t$1.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
					fname = "";
					ntyp = ($ptrType(rtype)).nil;
					if (!($pointerIsEqual(f.name, ($ptrType($String)).nil))) {
						fname = f.name.$get();
					} else {
						ntyp = f.typ;
						if (ntyp.Kind() === 22) {
							ntyp = ntyp.Elem().common();
						}
						fname = ntyp.Name();
					}
					if (match(fname)) {
						if ((_entry$1 = count[t$1.$key()], _entry$1 !== undefined ? _entry$1.v : 0) > 1 || ok) {
							_tmp$2 = new StructField.Ptr("", "", $ifaceNil, "", 0, ($sliceType($Int)).nil, false); _tmp$3 = false; $copy(result, _tmp$2, StructField); ok = _tmp$3;
							return [result, ok];
						}
						$copy(result, t$1.Field(i), StructField);
						result.Index = ($sliceType($Int)).nil;
						result.Index = $appendSlice(result.Index, scan.index);
						result.Index = $append(result.Index, i);
						ok = true;
						_i$1++;
						continue;
					}
					if (ok || ntyp === ($ptrType(rtype)).nil || !((ntyp.Kind() === 25))) {
						_i$1++;
						continue;
					}
					styp = ntyp.structType;
					if ((_entry$2 = nextCount[styp.$key()], _entry$2 !== undefined ? _entry$2.v : 0) > 0) {
						_key$2 = styp; (nextCount || $throwRuntimeError("assignment to entry in nil map"))[_key$2.$key()] = { k: _key$2, v: 2 };
						_i$1++;
						continue;
					}
					if (nextCount === false) {
						nextCount = (_map$1 = new $Map(), _map$1);
					}
					_key$4 = styp; (nextCount || $throwRuntimeError("assignment to entry in nil map"))[_key$4.$key()] = { k: _key$4, v: 1 };
					if ((_entry$3 = count[t$1.$key()], _entry$3 !== undefined ? _entry$3.v : 0) > 1) {
						_key$5 = styp; (nextCount || $throwRuntimeError("assignment to entry in nil map"))[_key$5.$key()] = { k: _key$5, v: 2 };
					}
					index = ($sliceType($Int)).nil;
					index = $appendSlice(index, scan.index);
					index = $append(index, i);
					next = $append(next, new fieldScan.Ptr(styp, index));
					_i$1++;
				}
				_i++;
			}
			if (ok) {
				break;
			}
		}
		return [result, ok];
	};
	structType.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	structType.Ptr.prototype.FieldByName = function(name) {
		var f = new StructField.Ptr(), present = false, t, hasAnon, _ref, _i, i, x, tf, _tmp, _tmp$1, _tuple;
		t = this;
		hasAnon = false;
		if (!(name === "")) {
			_ref = t.fields;
			_i = 0;
			while (_i < _ref.$length) {
				i = _i;
				tf = (x = t.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
				if ($pointerIsEqual(tf.name, ($ptrType($String)).nil)) {
					hasAnon = true;
					_i++;
					continue;
				}
				if (tf.name.$get() === name) {
					_tmp = new StructField.Ptr(); $copy(_tmp, t.Field(i), StructField); _tmp$1 = true; $copy(f, _tmp, StructField); present = _tmp$1;
					return [f, present];
				}
				_i++;
			}
		}
		if (!hasAnon) {
			return [f, present];
		}
		_tuple = t.FieldByNameFunc((function(s) {
			return s === name;
		})); $copy(f, _tuple[0], StructField); present = _tuple[1];
		return [f, present];
	};
	structType.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	PtrTo = $pkg.PtrTo = function(t) {
		return $assertType(t, ($ptrType(rtype))).ptrTo();
	};
	rtype.Ptr.prototype.Implements = function(u) {
		var t;
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.Implements"));
		}
		if (!((u.Kind() === 20))) {
			$panic(new $String("reflect: non-interface type passed to Type.Implements"));
		}
		return implements$1($assertType(u, ($ptrType(rtype))), t);
	};
	rtype.prototype.Implements = function(u) { return this.$val.Implements(u); };
	rtype.Ptr.prototype.AssignableTo = function(u) {
		var t, uu;
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.AssignableTo"));
		}
		uu = $assertType(u, ($ptrType(rtype)));
		return directlyAssignable(uu, t) || implements$1(uu, t);
	};
	rtype.prototype.AssignableTo = function(u) { return this.$val.AssignableTo(u); };
	rtype.Ptr.prototype.ConvertibleTo = function(u) {
		var t, uu;
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.ConvertibleTo"));
		}
		uu = $assertType(u, ($ptrType(rtype)));
		return !(convertOp(uu, t) === $throwNilPointerError);
	};
	rtype.prototype.ConvertibleTo = function(u) { return this.$val.ConvertibleTo(u); };
	implements$1 = function(T, V) {
		var t, v, i, j, x, tm, x$1, vm, v$1, i$1, j$1, x$2, tm$1, x$3, vm$1;
		if (!((T.Kind() === 20))) {
			return false;
		}
		t = T.interfaceType;
		if (t.methods.$length === 0) {
			return true;
		}
		if (V.Kind() === 20) {
			v = V.interfaceType;
			i = 0;
			j = 0;
			while (j < v.methods.$length) {
				tm = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
				vm = (x$1 = v.methods, ((j < 0 || j >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + j]));
				if ($pointerIsEqual(vm.name, tm.name) && $pointerIsEqual(vm.pkgPath, tm.pkgPath) && vm.typ === tm.typ) {
					i = i + (1) >> 0;
					if (i >= t.methods.$length) {
						return true;
					}
				}
				j = j + (1) >> 0;
			}
			return false;
		}
		v$1 = V.uncommonType.uncommon();
		if (v$1 === ($ptrType(uncommonType)).nil) {
			return false;
		}
		i$1 = 0;
		j$1 = 0;
		while (j$1 < v$1.methods.$length) {
			tm$1 = (x$2 = t.methods, ((i$1 < 0 || i$1 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + i$1]));
			vm$1 = (x$3 = v$1.methods, ((j$1 < 0 || j$1 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + j$1]));
			if ($pointerIsEqual(vm$1.name, tm$1.name) && $pointerIsEqual(vm$1.pkgPath, tm$1.pkgPath) && vm$1.mtyp === tm$1.typ) {
				i$1 = i$1 + (1) >> 0;
				if (i$1 >= t.methods.$length) {
					return true;
				}
			}
			j$1 = j$1 + (1) >> 0;
		}
		return false;
	};
	directlyAssignable = function(T, V) {
		if (T === V) {
			return true;
		}
		if (!(T.Name() === "") && !(V.Name() === "") || !((T.Kind() === V.Kind()))) {
			return false;
		}
		return haveIdenticalUnderlyingType(T, V);
	};
	haveIdenticalUnderlyingType = function(T, V) {
		var kind, _ref, t, v, _ref$1, _i, i, typ, x, _ref$2, _i$1, i$1, typ$1, x$1, t$1, v$1, t$2, v$2, _ref$3, _i$2, i$2, x$2, tf, x$3, vf;
		if (T === V) {
			return true;
		}
		kind = T.Kind();
		if (!((kind === V.Kind()))) {
			return false;
		}
		if (1 <= kind && kind <= 16 || (kind === 24) || (kind === 26)) {
			return true;
		}
		_ref = kind;
		if (_ref === 17) {
			return $interfaceIsEqual(T.Elem(), V.Elem()) && (T.Len() === V.Len());
		} else if (_ref === 18) {
			if ((V.ChanDir() === 3) && $interfaceIsEqual(T.Elem(), V.Elem())) {
				return true;
			}
			return (V.ChanDir() === T.ChanDir()) && $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 19) {
			t = T.funcType;
			v = V.funcType;
			if (!(t.dotdotdot === v.dotdotdot) || !((t.in$2.$length === v.in$2.$length)) || !((t.out.$length === v.out.$length))) {
				return false;
			}
			_ref$1 = t.in$2;
			_i = 0;
			while (_i < _ref$1.$length) {
				i = _i;
				typ = ((_i < 0 || _i >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i]);
				if (!(typ === (x = v.in$2, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])))) {
					return false;
				}
				_i++;
			}
			_ref$2 = t.out;
			_i$1 = 0;
			while (_i$1 < _ref$2.$length) {
				i$1 = _i$1;
				typ$1 = ((_i$1 < 0 || _i$1 >= _ref$2.$length) ? $throwRuntimeError("index out of range") : _ref$2.$array[_ref$2.$offset + _i$1]);
				if (!(typ$1 === (x$1 = v.out, ((i$1 < 0 || i$1 >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i$1])))) {
					return false;
				}
				_i$1++;
			}
			return true;
		} else if (_ref === 20) {
			t$1 = T.interfaceType;
			v$1 = V.interfaceType;
			if ((t$1.methods.$length === 0) && (v$1.methods.$length === 0)) {
				return true;
			}
			return false;
		} else if (_ref === 21) {
			return $interfaceIsEqual(T.Key(), V.Key()) && $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 22 || _ref === 23) {
			return $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 25) {
			t$2 = T.structType;
			v$2 = V.structType;
			if (!((t$2.fields.$length === v$2.fields.$length))) {
				return false;
			}
			_ref$3 = t$2.fields;
			_i$2 = 0;
			while (_i$2 < _ref$3.$length) {
				i$2 = _i$2;
				tf = (x$2 = t$2.fields, ((i$2 < 0 || i$2 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + i$2]));
				vf = (x$3 = v$2.fields, ((i$2 < 0 || i$2 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + i$2]));
				if (!($pointerIsEqual(tf.name, vf.name)) && ($pointerIsEqual(tf.name, ($ptrType($String)).nil) || $pointerIsEqual(vf.name, ($ptrType($String)).nil) || !(tf.name.$get() === vf.name.$get()))) {
					return false;
				}
				if (!($pointerIsEqual(tf.pkgPath, vf.pkgPath)) && ($pointerIsEqual(tf.pkgPath, ($ptrType($String)).nil) || $pointerIsEqual(vf.pkgPath, ($ptrType($String)).nil) || !(tf.pkgPath.$get() === vf.pkgPath.$get()))) {
					return false;
				}
				if (!(tf.typ === vf.typ)) {
					return false;
				}
				if (!($pointerIsEqual(tf.tag, vf.tag)) && ($pointerIsEqual(tf.tag, ($ptrType($String)).nil) || $pointerIsEqual(vf.tag, ($ptrType($String)).nil) || !(tf.tag.$get() === vf.tag.$get()))) {
					return false;
				}
				if (!((tf.offset === vf.offset))) {
					return false;
				}
				_i$2++;
			}
			return true;
		}
		return false;
	};
	toType = function(t) {
		if (t === ($ptrType(rtype)).nil) {
			return $ifaceNil;
		}
		return t;
	};
	flag.prototype.kind = function() {
		var f;
		f = this.$val !== undefined ? this.$val : this;
		return (((((f >>> 4 >>> 0)) & 31) >>> 0) >>> 0);
	};
	$ptrType(flag).prototype.kind = function() { return new flag(this.$get()).kind(); };
	Value.Ptr.prototype.pointer = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (!((v.typ.size === 4)) || !v.typ.pointers()) {
			$panic(new $String("can't call pointer on a non-pointer Value"));
		}
		if (!((((v.flag & 2) >>> 0) === 0))) {
			return v.ptr.$get();
		}
		return v.ptr;
	};
	Value.prototype.pointer = function() { return this.$val.pointer(); };
	ValueError.Ptr.prototype.Error = function() {
		var e;
		e = this;
		if (e.Kind === 0) {
			return "reflect: call of " + e.Method + " on zero Value";
		}
		return "reflect: call of " + e.Method + " on " + (new Kind(e.Kind)).String() + " Value";
	};
	ValueError.prototype.Error = function() { return this.$val.Error(); };
	flag.prototype.mustBe = function(expected) {
		var f, k;
		f = this.$val !== undefined ? this.$val : this;
		k = (new flag(f)).kind();
		if (!((k === expected))) {
			$panic(new ValueError.Ptr(methodName(), k));
		}
	};
	$ptrType(flag).prototype.mustBe = function(expected) { return new flag(this.$get()).mustBe(expected); };
	flag.prototype.mustBeExported = function() {
		var f;
		f = this.$val !== undefined ? this.$val : this;
		if (f === 0) {
			$panic(new ValueError.Ptr(methodName(), 0));
		}
		if (!((((f & 1) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
	};
	$ptrType(flag).prototype.mustBeExported = function() { return new flag(this.$get()).mustBeExported(); };
	flag.prototype.mustBeAssignable = function() {
		var f;
		f = this.$val !== undefined ? this.$val : this;
		if (f === 0) {
			$panic(new ValueError.Ptr(methodName(), 0));
		}
		if (!((((f & 1) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
		if (((f & 4) >>> 0) === 0) {
			$panic(new $String("reflect: " + methodName() + " using unaddressable value"));
		}
	};
	$ptrType(flag).prototype.mustBeAssignable = function() { return new flag(this.$get()).mustBeAssignable(); };
	Value.Ptr.prototype.Addr = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (((v.flag & 4) >>> 0) === 0) {
			$panic(new $String("reflect.Value.Addr of unaddressable value"));
		}
		return new Value.Ptr(v.typ.ptrTo(), v.ptr, 0, ((((v.flag & 1) >>> 0)) | 352) >>> 0);
	};
	Value.prototype.Addr = function() { return this.$val.Addr(); };
	Value.Ptr.prototype.Bool = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(1);
		if (!((((v.flag & 2) >>> 0) === 0))) {
			return v.ptr.$get();
		}
		return v.scalar;
	};
	Value.prototype.Bool = function() { return this.$val.Bool(); };
	Value.Ptr.prototype.Bytes = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(23);
		if (!((v.typ.Elem().Kind() === 8))) {
			$panic(new $String("reflect.Value.Bytes of non-byte slice"));
		}
		return v.ptr.$get();
	};
	Value.prototype.Bytes = function() { return this.$val.Bytes(); };
	Value.Ptr.prototype.runes = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(23);
		if (!((v.typ.Elem().Kind() === 5))) {
			$panic(new $String("reflect.Value.Bytes of non-rune slice"));
		}
		return v.ptr.$get();
	};
	Value.prototype.runes = function() { return this.$val.runes(); };
	Value.Ptr.prototype.CanAddr = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		return !((((v.flag & 4) >>> 0) === 0));
	};
	Value.prototype.CanAddr = function() { return this.$val.CanAddr(); };
	Value.Ptr.prototype.CanSet = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		return ((v.flag & 5) >>> 0) === 4;
	};
	Value.prototype.CanSet = function() { return this.$val.CanSet(); };
	Value.Ptr.prototype.Call = function(in$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(19);
		(new flag(v.flag)).mustBeExported();
		return v.call("Call", in$1);
	};
	Value.prototype.Call = function(in$1) { return this.$val.Call(in$1); };
	Value.Ptr.prototype.CallSlice = function(in$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(19);
		(new flag(v.flag)).mustBeExported();
		return v.call("CallSlice", in$1);
	};
	Value.prototype.CallSlice = function(in$1) { return this.$val.CallSlice(in$1); };
	Value.Ptr.prototype.Complex = function() {
		var v, k, _ref, x, x$1;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 15) {
			if (!((((v.flag & 2) >>> 0) === 0))) {
				return (x = v.ptr.$get(), new $Complex128(x.$real, x.$imag));
			}
			return (x$1 = v.scalar, new $Complex128(x$1.$real, x$1.$imag));
		} else if (_ref === 16) {
			return v.ptr.$get();
		}
		$panic(new ValueError.Ptr("reflect.Value.Complex", k));
	};
	Value.prototype.Complex = function() { return this.$val.Complex(); };
	Value.Ptr.prototype.FieldByIndex = function(index) {
		var v, _ref, _i, i, x;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		_ref = index;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			x = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (i > 0) {
				if ((v.Kind() === 22) && (v.typ.Elem().Kind() === 25)) {
					if (v.IsNil()) {
						$panic(new $String("reflect: indirection through nil pointer to embedded struct"));
					}
					$copy(v, v.Elem(), Value);
				}
			}
			$copy(v, v.Field(x), Value);
			_i++;
		}
		return v;
	};
	Value.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	Value.Ptr.prototype.FieldByName = function(name) {
		var v, _tuple, f, ok;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		_tuple = v.typ.FieldByName(name); f = new StructField.Ptr(); $copy(f, _tuple[0], StructField); ok = _tuple[1];
		if (ok) {
			return v.FieldByIndex(f.Index);
		}
		return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
	};
	Value.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	Value.Ptr.prototype.FieldByNameFunc = function(match) {
		var v, _tuple, f, ok;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		_tuple = v.typ.FieldByNameFunc(match); f = new StructField.Ptr(); $copy(f, _tuple[0], StructField); ok = _tuple[1];
		if (ok) {
			return v.FieldByIndex(f.Index);
		}
		return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
	};
	Value.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	Value.Ptr.prototype.Float = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 13) {
			if (!((((v.flag & 2) >>> 0) === 0))) {
				return $coerceFloat32(v.ptr.$get());
			}
			return $coerceFloat32(v.scalar);
		} else if (_ref === 14) {
			if (!((((v.flag & 2) >>> 0) === 0))) {
				return v.ptr.$get();
			}
			return v.scalar;
		}
		$panic(new ValueError.Ptr("reflect.Value.Float", k));
	};
	Value.prototype.Float = function() { return this.$val.Float(); };
	Value.Ptr.prototype.Int = function() {
		var v, k, p, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		p = 0;
		if (!((((v.flag & 2) >>> 0) === 0))) {
			p = v.ptr;
		} else {
			p = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, v);
		}
		_ref = k;
		if (_ref === 2) {
			return new $Int64(0, p.$get());
		} else if (_ref === 3) {
			return new $Int64(0, p.$get());
		} else if (_ref === 4) {
			return new $Int64(0, p.$get());
		} else if (_ref === 5) {
			return new $Int64(0, p.$get());
		} else if (_ref === 6) {
			return p.$get();
		}
		$panic(new ValueError.Ptr("reflect.Value.Int", k));
	};
	Value.prototype.Int = function() { return this.$val.Int(); };
	Value.Ptr.prototype.CanInterface = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.flag === 0) {
			$panic(new ValueError.Ptr("reflect.Value.CanInterface", 0));
		}
		return ((v.flag & 1) >>> 0) === 0;
	};
	Value.prototype.CanInterface = function() { return this.$val.CanInterface(); };
	Value.Ptr.prototype.Interface = function() {
		var i = $ifaceNil, v;
		v = new Value.Ptr(); $copy(v, this, Value);
		i = valueInterface($clone(v, Value), true);
		return i;
	};
	Value.prototype.Interface = function() { return this.$val.Interface(); };
	Value.Ptr.prototype.InterfaceData = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(20);
		return v.ptr;
	};
	Value.prototype.InterfaceData = function() { return this.$val.InterfaceData(); };
	Value.Ptr.prototype.IsValid = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		return !((v.flag === 0));
	};
	Value.prototype.IsValid = function() { return this.$val.IsValid(); };
	Value.Ptr.prototype.Kind = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		return (new flag(v.flag)).kind();
	};
	Value.prototype.Kind = function() { return this.$val.Kind(); };
	Value.Ptr.prototype.MapIndex = function(key) {
		var v, tt, k, e, typ, fl, c;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(21);
		tt = v.typ.mapType;
		$copy(key, key.assignTo("reflect.Value.MapIndex", tt.key, ($ptrType($emptyInterface)).nil), Value);
		k = 0;
		if (!((((key.flag & 2) >>> 0) === 0))) {
			k = key.ptr;
		} else if (key.typ.pointers()) {
			k = new ($ptrType($UnsafePointer))(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key);
		} else {
			k = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, key);
		}
		e = mapaccess(v.typ, v.pointer(), k);
		if (e === 0) {
			return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
		}
		typ = tt.elem;
		fl = ((((v.flag | key.flag) >>> 0)) & 1) >>> 0;
		fl = (fl | (((typ.Kind() >>> 0) << 4 >>> 0))) >>> 0;
		if (typ.size > 4) {
			c = unsafe_New(typ);
			memmove(c, e, typ.size);
			return new Value.Ptr(typ, c, 0, (fl | 2) >>> 0);
		} else if (typ.pointers()) {
			return new Value.Ptr(typ, e.$get(), 0, fl);
		} else {
			return new Value.Ptr(typ, 0, loadScalar(e, typ.size), fl);
		}
	};
	Value.prototype.MapIndex = function(key) { return this.$val.MapIndex(key); };
	Value.Ptr.prototype.MapKeys = function() {
		var v, tt, keyType, fl, m, mlen, it, a, i, key, c;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(21);
		tt = v.typ.mapType;
		keyType = tt.key;
		fl = (((v.flag & 1) >>> 0) | ((keyType.Kind() >>> 0) << 4 >>> 0)) >>> 0;
		m = v.pointer();
		mlen = 0;
		if (!(m === 0)) {
			mlen = maplen(m);
		}
		it = mapiterinit(v.typ, m);
		a = ($sliceType(Value)).make(mlen);
		i = 0;
		i = 0;
		while (i < a.$length) {
			key = mapiterkey(it);
			if (key === 0) {
				break;
			}
			if (keyType.size > 4) {
				c = unsafe_New(keyType);
				memmove(c, key, keyType.size);
				$copy(((i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i]), new Value.Ptr(keyType, c, 0, (fl | 2) >>> 0), Value);
			} else if (keyType.pointers()) {
				$copy(((i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i]), new Value.Ptr(keyType, key.$get(), 0, fl), Value);
			} else {
				$copy(((i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i]), new Value.Ptr(keyType, 0, loadScalar(key, keyType.size), fl), Value);
			}
			mapiternext(it);
			i = i + (1) >> 0;
		}
		return $subslice(a, 0, i);
	};
	Value.prototype.MapKeys = function() { return this.$val.MapKeys(); };
	Value.Ptr.prototype.Method = function(i) {
		var v, fl;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.typ === ($ptrType(rtype)).nil) {
			$panic(new ValueError.Ptr("reflect.Value.Method", 0));
		}
		if (!((((v.flag & 8) >>> 0) === 0)) || i < 0 || i >= v.typ.NumMethod()) {
			$panic(new $String("reflect: Method index out of range"));
		}
		if ((v.typ.Kind() === 20) && v.IsNil()) {
			$panic(new $String("reflect: Method on nil interface value"));
		}
		fl = (v.flag & 3) >>> 0;
		fl = (fl | (304)) >>> 0;
		fl = (fl | (((((i >>> 0) << 9 >>> 0) | 8) >>> 0))) >>> 0;
		return new Value.Ptr(v.typ, v.ptr, v.scalar, fl);
	};
	Value.prototype.Method = function(i) { return this.$val.Method(i); };
	Value.Ptr.prototype.NumMethod = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.typ === ($ptrType(rtype)).nil) {
			$panic(new ValueError.Ptr("reflect.Value.NumMethod", 0));
		}
		if (!((((v.flag & 8) >>> 0) === 0))) {
			return 0;
		}
		return v.typ.NumMethod();
	};
	Value.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	Value.Ptr.prototype.MethodByName = function(name) {
		var v, _tuple, m, ok;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.typ === ($ptrType(rtype)).nil) {
			$panic(new ValueError.Ptr("reflect.Value.MethodByName", 0));
		}
		if (!((((v.flag & 8) >>> 0) === 0))) {
			return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
		}
		_tuple = v.typ.MethodByName(name); m = new Method.Ptr(); $copy(m, _tuple[0], Method); ok = _tuple[1];
		if (!ok) {
			return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
		}
		return v.Method(m.Index);
	};
	Value.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	Value.Ptr.prototype.NumField = function() {
		var v, tt;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		tt = v.typ.structType;
		return tt.fields.$length;
	};
	Value.prototype.NumField = function() { return this.$val.NumField(); };
	Value.Ptr.prototype.OverflowComplex = function(x) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 15) {
			return overflowFloat32(x.$real) || overflowFloat32(x.$imag);
		} else if (_ref === 16) {
			return false;
		}
		$panic(new ValueError.Ptr("reflect.Value.OverflowComplex", k));
	};
	Value.prototype.OverflowComplex = function(x) { return this.$val.OverflowComplex(x); };
	Value.Ptr.prototype.OverflowFloat = function(x) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 13) {
			return overflowFloat32(x);
		} else if (_ref === 14) {
			return false;
		}
		$panic(new ValueError.Ptr("reflect.Value.OverflowFloat", k));
	};
	Value.prototype.OverflowFloat = function(x) { return this.$val.OverflowFloat(x); };
	overflowFloat32 = function(x) {
		if (x < 0) {
			x = -x;
		}
		return 3.4028234663852886e+38 < x && x <= 1.7976931348623157e+308;
	};
	Value.Ptr.prototype.OverflowInt = function(x) {
		var v, k, _ref, x$1, bitSize, trunc;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			bitSize = (x$1 = v.typ.size, (((x$1 >>> 16 << 16) * 8 >>> 0) + (x$1 << 16 >>> 16) * 8) >>> 0);
			trunc = $shiftRightInt64(($shiftLeft64(x, ((64 - bitSize >>> 0)))), ((64 - bitSize >>> 0)));
			return !((x.$high === trunc.$high && x.$low === trunc.$low));
		}
		$panic(new ValueError.Ptr("reflect.Value.OverflowInt", k));
	};
	Value.prototype.OverflowInt = function(x) { return this.$val.OverflowInt(x); };
	Value.Ptr.prototype.OverflowUint = function(x) {
		var v, k, _ref, x$1, bitSize, trunc;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 7 || _ref === 12 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11) {
			bitSize = (x$1 = v.typ.size, (((x$1 >>> 16 << 16) * 8 >>> 0) + (x$1 << 16 >>> 16) * 8) >>> 0);
			trunc = $shiftRightUint64(($shiftLeft64(x, ((64 - bitSize >>> 0)))), ((64 - bitSize >>> 0)));
			return !((x.$high === trunc.$high && x.$low === trunc.$low));
		}
		$panic(new ValueError.Ptr("reflect.Value.OverflowUint", k));
	};
	Value.prototype.OverflowUint = function(x) { return this.$val.OverflowUint(x); };
	Value.Ptr.prototype.SetBool = function(x) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(1);
		v.ptr.$set(x);
	};
	Value.prototype.SetBool = function(x) { return this.$val.SetBool(x); };
	Value.Ptr.prototype.SetBytes = function(x) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(23);
		if (!((v.typ.Elem().Kind() === 8))) {
			$panic(new $String("reflect.Value.SetBytes of non-byte slice"));
		}
		v.ptr.$set(x);
	};
	Value.prototype.SetBytes = function(x) { return this.$val.SetBytes(x); };
	Value.Ptr.prototype.setRunes = function(x) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(23);
		if (!((v.typ.Elem().Kind() === 5))) {
			$panic(new $String("reflect.Value.setRunes of non-rune slice"));
		}
		v.ptr.$set(x);
	};
	Value.prototype.setRunes = function(x) { return this.$val.setRunes(x); };
	Value.Ptr.prototype.SetComplex = function(x) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 15) {
			v.ptr.$set(new $Complex64(x.$real, x.$imag));
		} else if (_ref === 16) {
			v.ptr.$set(x);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.SetComplex", k));
		}
	};
	Value.prototype.SetComplex = function(x) { return this.$val.SetComplex(x); };
	Value.Ptr.prototype.SetFloat = function(x) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 13) {
			v.ptr.$set(x);
		} else if (_ref === 14) {
			v.ptr.$set(x);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.SetFloat", k));
		}
	};
	Value.prototype.SetFloat = function(x) { return this.$val.SetFloat(x); };
	Value.Ptr.prototype.SetInt = function(x) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 2) {
			v.ptr.$set(((x.$low + ((x.$high >> 31) * 4294967296)) >> 0));
		} else if (_ref === 3) {
			v.ptr.$set(((x.$low + ((x.$high >> 31) * 4294967296)) << 24 >> 24));
		} else if (_ref === 4) {
			v.ptr.$set(((x.$low + ((x.$high >> 31) * 4294967296)) << 16 >> 16));
		} else if (_ref === 5) {
			v.ptr.$set(((x.$low + ((x.$high >> 31) * 4294967296)) >> 0));
		} else if (_ref === 6) {
			v.ptr.$set(x);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.SetInt", k));
		}
	};
	Value.prototype.SetInt = function(x) { return this.$val.SetInt(x); };
	Value.Ptr.prototype.SetMapIndex = function(key, val) {
		var v, tt, k, e;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(21);
		(new flag(v.flag)).mustBeExported();
		(new flag(key.flag)).mustBeExported();
		tt = v.typ.mapType;
		$copy(key, key.assignTo("reflect.Value.SetMapIndex", tt.key, ($ptrType($emptyInterface)).nil), Value);
		k = 0;
		if (!((((key.flag & 2) >>> 0) === 0))) {
			k = key.ptr;
		} else if (key.typ.pointers()) {
			k = new ($ptrType($UnsafePointer))(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key);
		} else {
			k = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, key);
		}
		if (val.typ === ($ptrType(rtype)).nil) {
			mapdelete(v.typ, v.pointer(), k);
			return;
		}
		(new flag(val.flag)).mustBeExported();
		$copy(val, val.assignTo("reflect.Value.SetMapIndex", tt.elem, ($ptrType($emptyInterface)).nil), Value);
		e = 0;
		if (!((((val.flag & 2) >>> 0) === 0))) {
			e = val.ptr;
		} else if (val.typ.pointers()) {
			e = new ($ptrType($UnsafePointer))(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, val);
		} else {
			e = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, val);
		}
		mapassign(v.typ, v.pointer(), k, e);
	};
	Value.prototype.SetMapIndex = function(key, val) { return this.$val.SetMapIndex(key, val); };
	Value.Ptr.prototype.SetUint = function(x) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 7) {
			v.ptr.$set((x.$low >>> 0));
		} else if (_ref === 8) {
			v.ptr.$set((x.$low << 24 >>> 24));
		} else if (_ref === 9) {
			v.ptr.$set((x.$low << 16 >>> 16));
		} else if (_ref === 10) {
			v.ptr.$set((x.$low >>> 0));
		} else if (_ref === 11) {
			v.ptr.$set(x);
		} else if (_ref === 12) {
			v.ptr.$set((x.$low >>> 0));
		} else {
			$panic(new ValueError.Ptr("reflect.Value.SetUint", k));
		}
	};
	Value.prototype.SetUint = function(x) { return this.$val.SetUint(x); };
	Value.Ptr.prototype.SetPointer = function(x) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(26);
		v.ptr.$set(x);
	};
	Value.prototype.SetPointer = function(x) { return this.$val.SetPointer(x); };
	Value.Ptr.prototype.SetString = function(x) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(24);
		v.ptr.$set(x);
	};
	Value.prototype.SetString = function(x) { return this.$val.SetString(x); };
	Value.Ptr.prototype.String = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 0) {
			return "<invalid Value>";
		} else if (_ref === 24) {
			return v.ptr.$get();
		}
		return "<" + v.typ.String() + " Value>";
	};
	Value.prototype.String = function() { return this.$val.String(); };
	Value.Ptr.prototype.Type = function() {
		var v, f, i, tt, x, m, ut, x$1, m$1;
		v = new Value.Ptr(); $copy(v, this, Value);
		f = v.flag;
		if (f === 0) {
			$panic(new ValueError.Ptr("reflect.Value.Type", 0));
		}
		if (((f & 8) >>> 0) === 0) {
			return v.typ;
		}
		i = (v.flag >> 0) >> 9 >> 0;
		if (v.typ.Kind() === 20) {
			tt = v.typ.interfaceType;
			if (i < 0 || i >= tt.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x = tt.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			return m.typ;
		}
		ut = v.typ.uncommonType.uncommon();
		if (ut === ($ptrType(uncommonType)).nil || i < 0 || i >= ut.methods.$length) {
			$panic(new $String("reflect: internal error: invalid method index"));
		}
		m$1 = (x$1 = ut.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
		return m$1.mtyp;
	};
	Value.prototype.Type = function() { return this.$val.Type(); };
	Value.Ptr.prototype.Uint = function() {
		var v, k, p, _ref, x;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		p = 0;
		if (!((((v.flag & 2) >>> 0) === 0))) {
			p = v.ptr;
		} else {
			p = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, v);
		}
		_ref = k;
		if (_ref === 7) {
			return new $Uint64(0, p.$get());
		} else if (_ref === 8) {
			return new $Uint64(0, p.$get());
		} else if (_ref === 9) {
			return new $Uint64(0, p.$get());
		} else if (_ref === 10) {
			return new $Uint64(0, p.$get());
		} else if (_ref === 11) {
			return p.$get();
		} else if (_ref === 12) {
			return (x = p.$get(), new $Uint64(0, x.constructor === Number ? x : 1));
		}
		$panic(new ValueError.Ptr("reflect.Value.Uint", k));
	};
	Value.prototype.Uint = function() { return this.$val.Uint(); };
	Value.Ptr.prototype.UnsafeAddr = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.typ === ($ptrType(rtype)).nil) {
			$panic(new ValueError.Ptr("reflect.Value.UnsafeAddr", 0));
		}
		if (((v.flag & 4) >>> 0) === 0) {
			$panic(new $String("reflect.Value.UnsafeAddr of unaddressable value"));
		}
		return v.ptr;
	};
	Value.prototype.UnsafeAddr = function() { return this.$val.UnsafeAddr(); };
	New = $pkg.New = function(typ) {
		var ptr, fl;
		if ($interfaceIsEqual(typ, $ifaceNil)) {
			$panic(new $String("reflect: New(nil)"));
		}
		ptr = unsafe_New($assertType(typ, ($ptrType(rtype))));
		fl = 352;
		return new Value.Ptr(typ.common().ptrTo(), ptr, 0, fl);
	};
	Value.Ptr.prototype.assignTo = function(context, dst, target) {
		var v, fl, x;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (!((((v.flag & 8) >>> 0) === 0))) {
			$copy(v, makeMethodValue(context, $clone(v, Value)), Value);
		}
		if (directlyAssignable(dst, v.typ)) {
			v.typ = dst;
			fl = (v.flag & 7) >>> 0;
			fl = (fl | (((dst.Kind() >>> 0) << 4 >>> 0))) >>> 0;
			return new Value.Ptr(dst, v.ptr, v.scalar, fl);
		} else if (implements$1(dst, v.typ)) {
			if (target === ($ptrType($emptyInterface)).nil) {
				target = $newDataPointer($ifaceNil, ($ptrType($emptyInterface)));
			}
			x = valueInterface($clone(v, Value), false);
			if (dst.NumMethod() === 0) {
				target.$set(x);
			} else {
				ifaceE2I(dst, x, target);
			}
			return new Value.Ptr(dst, target, 0, 322);
		}
		$panic(new $String(context + ": value of type " + v.typ.String() + " is not assignable to type " + dst.String()));
	};
	Value.prototype.assignTo = function(context, dst, target) { return this.$val.assignTo(context, dst, target); };
	Value.Ptr.prototype.Convert = function(t) {
		var v, op;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (!((((v.flag & 8) >>> 0) === 0))) {
			$copy(v, makeMethodValue("Convert", $clone(v, Value)), Value);
		}
		op = convertOp(t.common(), v.typ);
		if (op === $throwNilPointerError) {
			$panic(new $String("reflect.Value.Convert: value of type " + v.typ.String() + " cannot be converted to type " + t.String()));
		}
		return op($clone(v, Value), t);
	};
	Value.prototype.Convert = function(t) { return this.$val.Convert(t); };
	convertOp = function(dst, src) {
		var _ref, _ref$1, _ref$2, _ref$3, _ref$4, _ref$5, _ref$6;
		_ref = src.Kind();
		if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			_ref$1 = dst.Kind();
			if (_ref$1 === 2 || _ref$1 === 3 || _ref$1 === 4 || _ref$1 === 5 || _ref$1 === 6 || _ref$1 === 7 || _ref$1 === 8 || _ref$1 === 9 || _ref$1 === 10 || _ref$1 === 11 || _ref$1 === 12) {
				return cvtInt;
			} else if (_ref$1 === 13 || _ref$1 === 14) {
				return cvtIntFloat;
			} else if (_ref$1 === 24) {
				return cvtIntString;
			}
		} else if (_ref === 7 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11 || _ref === 12) {
			_ref$2 = dst.Kind();
			if (_ref$2 === 2 || _ref$2 === 3 || _ref$2 === 4 || _ref$2 === 5 || _ref$2 === 6 || _ref$2 === 7 || _ref$2 === 8 || _ref$2 === 9 || _ref$2 === 10 || _ref$2 === 11 || _ref$2 === 12) {
				return cvtUint;
			} else if (_ref$2 === 13 || _ref$2 === 14) {
				return cvtUintFloat;
			} else if (_ref$2 === 24) {
				return cvtUintString;
			}
		} else if (_ref === 13 || _ref === 14) {
			_ref$3 = dst.Kind();
			if (_ref$3 === 2 || _ref$3 === 3 || _ref$3 === 4 || _ref$3 === 5 || _ref$3 === 6) {
				return cvtFloatInt;
			} else if (_ref$3 === 7 || _ref$3 === 8 || _ref$3 === 9 || _ref$3 === 10 || _ref$3 === 11 || _ref$3 === 12) {
				return cvtFloatUint;
			} else if (_ref$3 === 13 || _ref$3 === 14) {
				return cvtFloat;
			}
		} else if (_ref === 15 || _ref === 16) {
			_ref$4 = dst.Kind();
			if (_ref$4 === 15 || _ref$4 === 16) {
				return cvtComplex;
			}
		} else if (_ref === 24) {
			if ((dst.Kind() === 23) && dst.Elem().PkgPath() === "") {
				_ref$5 = dst.Elem().Kind();
				if (_ref$5 === 8) {
					return cvtStringBytes;
				} else if (_ref$5 === 5) {
					return cvtStringRunes;
				}
			}
		} else if (_ref === 23) {
			if ((dst.Kind() === 24) && src.Elem().PkgPath() === "") {
				_ref$6 = src.Elem().Kind();
				if (_ref$6 === 8) {
					return cvtBytesString;
				} else if (_ref$6 === 5) {
					return cvtRunesString;
				}
			}
		}
		if (haveIdenticalUnderlyingType(dst, src)) {
			return cvtDirect;
		}
		if ((dst.Kind() === 22) && dst.Name() === "" && (src.Kind() === 22) && src.Name() === "" && haveIdenticalUnderlyingType(dst.Elem().common(), src.Elem().common())) {
			return cvtDirect;
		}
		if (implements$1(dst, src)) {
			if (src.Kind() === 20) {
				return cvtI2I;
			}
			return cvtT2I;
		}
		return $throwNilPointerError;
	};
	makeFloat = function(f, v, t) {
		var typ, ptr, s, _ref;
		typ = t.common();
		if (typ.size > 4) {
			ptr = unsafe_New(typ);
			ptr.$set(v);
			return new Value.Ptr(typ, ptr, 0, (((f | 2) >>> 0) | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
		}
		s = 0;
		_ref = typ.size;
		if (_ref === 4) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set(v);
		} else if (_ref === 8) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set(v);
		}
		return new Value.Ptr(typ, 0, s, (f | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	makeComplex = function(f, v, t) {
		var typ, ptr, _ref, s;
		typ = t.common();
		if (typ.size > 4) {
			ptr = unsafe_New(typ);
			_ref = typ.size;
			if (_ref === 8) {
				ptr.$set(new $Complex64(v.$real, v.$imag));
			} else if (_ref === 16) {
				ptr.$set(v);
			}
			return new Value.Ptr(typ, ptr, 0, (((f | 2) >>> 0) | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
		}
		s = 0;
		new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set(new $Complex64(v.$real, v.$imag));
		return new Value.Ptr(typ, 0, s, (f | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	makeString = function(f, v, t) {
		var ret;
		ret = new Value.Ptr(); $copy(ret, New(t).Elem(), Value);
		ret.SetString(v);
		ret.flag = ((ret.flag & ~4) | f) >>> 0;
		return ret;
	};
	makeBytes = function(f, v, t) {
		var ret;
		ret = new Value.Ptr(); $copy(ret, New(t).Elem(), Value);
		ret.SetBytes(v);
		ret.flag = ((ret.flag & ~4) | f) >>> 0;
		return ret;
	};
	makeRunes = function(f, v, t) {
		var ret;
		ret = new Value.Ptr(); $copy(ret, New(t).Elem(), Value);
		ret.setRunes(v);
		ret.flag = ((ret.flag & ~4) | f) >>> 0;
		return ret;
	};
	cvtInt = function(v, t) {
		var x;
		return makeInt((v.flag & 1) >>> 0, (x = v.Int(), new $Uint64(x.$high, x.$low)), t);
	};
	cvtUint = function(v, t) {
		return makeInt((v.flag & 1) >>> 0, v.Uint(), t);
	};
	cvtFloatInt = function(v, t) {
		var x;
		return makeInt((v.flag & 1) >>> 0, (x = new $Int64(0, v.Float()), new $Uint64(x.$high, x.$low)), t);
	};
	cvtFloatUint = function(v, t) {
		return makeInt((v.flag & 1) >>> 0, new $Uint64(0, v.Float()), t);
	};
	cvtIntFloat = function(v, t) {
		return makeFloat((v.flag & 1) >>> 0, $flatten64(v.Int()), t);
	};
	cvtUintFloat = function(v, t) {
		return makeFloat((v.flag & 1) >>> 0, $flatten64(v.Uint()), t);
	};
	cvtFloat = function(v, t) {
		return makeFloat((v.flag & 1) >>> 0, v.Float(), t);
	};
	cvtComplex = function(v, t) {
		return makeComplex((v.flag & 1) >>> 0, v.Complex(), t);
	};
	cvtIntString = function(v, t) {
		return makeString((v.flag & 1) >>> 0, $encodeRune(v.Int().$low), t);
	};
	cvtUintString = function(v, t) {
		return makeString((v.flag & 1) >>> 0, $encodeRune(v.Uint().$low), t);
	};
	cvtBytesString = function(v, t) {
		return makeString((v.flag & 1) >>> 0, $bytesToString(v.Bytes()), t);
	};
	cvtStringBytes = function(v, t) {
		return makeBytes((v.flag & 1) >>> 0, new ($sliceType($Uint8))($stringToBytes(v.String())), t);
	};
	cvtRunesString = function(v, t) {
		return makeString((v.flag & 1) >>> 0, $runesToString(v.runes()), t);
	};
	cvtStringRunes = function(v, t) {
		return makeRunes((v.flag & 1) >>> 0, new ($sliceType($Int32))($stringToRunes(v.String())), t);
	};
	cvtT2I = function(v, typ) {
		var target, x;
		target = $newDataPointer($ifaceNil, ($ptrType($emptyInterface)));
		x = valueInterface($clone(v, Value), false);
		if (typ.NumMethod() === 0) {
			target.$set(x);
		} else {
			ifaceE2I($assertType(typ, ($ptrType(rtype))), x, target);
		}
		return new Value.Ptr(typ.common(), target, 0, (((((v.flag & 1) >>> 0) | 2) >>> 0) | 320) >>> 0);
	};
	cvtI2I = function(v, typ) {
		var ret;
		if (v.IsNil()) {
			ret = new Value.Ptr(); $copy(ret, Zero(typ), Value);
			ret.flag = (ret.flag | (((v.flag & 1) >>> 0))) >>> 0;
			return ret;
		}
		return cvtT2I($clone(v.Elem(), Value), typ);
	};
	call = function() {
		$panic("Native function not implemented: reflect.call");
	};
	$pkg.$init = function() {
		mapIter.init([["t", "t", "reflect", Type, ""], ["m", "m", "reflect", js.Object, ""], ["keys", "keys", "reflect", js.Object, ""], ["i", "i", "reflect", $Int, ""]]);
		Type.init([["Align", "Align", "", $funcType([], [$Int], false)], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false)], ["Bits", "Bits", "", $funcType([], [$Int], false)], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false)], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false)], ["Elem", "Elem", "", $funcType([], [Type], false)], ["Field", "Field", "", $funcType([$Int], [StructField], false)], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false)], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false)], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false)], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false)], ["Implements", "Implements", "", $funcType([Type], [$Bool], false)], ["In", "In", "", $funcType([$Int], [Type], false)], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false)], ["Key", "Key", "", $funcType([], [Type], false)], ["Kind", "Kind", "", $funcType([], [Kind], false)], ["Len", "Len", "", $funcType([], [$Int], false)], ["Method", "Method", "", $funcType([$Int], [Method], false)], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false)], ["Name", "Name", "", $funcType([], [$String], false)], ["NumField", "NumField", "", $funcType([], [$Int], false)], ["NumIn", "NumIn", "", $funcType([], [$Int], false)], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false)], ["NumOut", "NumOut", "", $funcType([], [$Int], false)], ["Out", "Out", "", $funcType([$Int], [Type], false)], ["PkgPath", "PkgPath", "", $funcType([], [$String], false)], ["Size", "Size", "", $funcType([], [$Uintptr], false)], ["String", "String", "", $funcType([], [$String], false)], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false)], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false)]]);
		Kind.methods = [["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(Kind)).methods = [["String", "String", "", $funcType([], [$String], false), -1]];
		rtype.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 9]];
		($ptrType(rtype)).methods = [["Align", "Align", "", $funcType([], [$Int], false), -1], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), -1], ["Bits", "Bits", "", $funcType([], [$Int], false), -1], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), -1], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), -1], ["Elem", "Elem", "", $funcType([], [Type], false), -1], ["Field", "Field", "", $funcType([$Int], [StructField], false), -1], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), -1], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), -1], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), -1], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), -1], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), -1], ["In", "In", "", $funcType([$Int], [Type], false), -1], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), -1], ["Key", "Key", "", $funcType([], [Type], false), -1], ["Kind", "Kind", "", $funcType([], [Kind], false), -1], ["Len", "Len", "", $funcType([], [$Int], false), -1], ["Method", "Method", "", $funcType([$Int], [Method], false), -1], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), -1], ["Name", "Name", "", $funcType([], [$String], false), -1], ["NumField", "NumField", "", $funcType([], [$Int], false), -1], ["NumIn", "NumIn", "", $funcType([], [$Int], false), -1], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), -1], ["NumOut", "NumOut", "", $funcType([], [$Int], false), -1], ["Out", "Out", "", $funcType([$Int], [Type], false), -1], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), -1], ["Size", "Size", "", $funcType([], [$Uintptr], false), -1], ["String", "String", "", $funcType([], [$String], false), -1], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), -1], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), -1], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), -1], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 9]];
		rtype.init([["size", "size", "reflect", $Uintptr, ""], ["hash", "hash", "reflect", $Uint32, ""], ["_$2", "_", "reflect", $Uint8, ""], ["align", "align", "reflect", $Uint8, ""], ["fieldAlign", "fieldAlign", "reflect", $Uint8, ""], ["kind", "kind", "reflect", $Uint8, ""], ["alg", "alg", "reflect", ($ptrType($Uintptr)), ""], ["gc", "gc", "reflect", $UnsafePointer, ""], ["string", "string", "reflect", ($ptrType($String)), ""], ["uncommonType", "", "reflect", ($ptrType(uncommonType)), ""], ["ptrToThis", "ptrToThis", "reflect", ($ptrType(rtype)), ""], ["zero", "zero", "reflect", $UnsafePointer, ""]]);
		method.init([["name", "name", "reflect", ($ptrType($String)), ""], ["pkgPath", "pkgPath", "reflect", ($ptrType($String)), ""], ["mtyp", "mtyp", "reflect", ($ptrType(rtype)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["ifn", "ifn", "reflect", $UnsafePointer, ""], ["tfn", "tfn", "reflect", $UnsafePointer, ""]]);
		($ptrType(uncommonType)).methods = [["Method", "Method", "", $funcType([$Int], [Method], false), -1], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), -1], ["Name", "Name", "", $funcType([], [$String], false), -1], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), -1], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), -1], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), -1]];
		uncommonType.init([["name", "name", "reflect", ($ptrType($String)), ""], ["pkgPath", "pkgPath", "reflect", ($ptrType($String)), ""], ["methods", "methods", "reflect", ($sliceType(method)), ""]]);
		ChanDir.methods = [["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(ChanDir)).methods = [["String", "String", "", $funcType([], [$String], false), -1]];
		arrayType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(arrayType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		arrayType.init([["rtype", "", "reflect", rtype, "reflect:\"array\""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""], ["slice", "slice", "reflect", ($ptrType(rtype)), ""], ["len", "len", "reflect", $Uintptr, ""]]);
		chanType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(chanType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		chanType.init([["rtype", "", "reflect", rtype, "reflect:\"chan\""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""], ["dir", "dir", "reflect", $Uintptr, ""]]);
		funcType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(funcType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		funcType.init([["rtype", "", "reflect", rtype, "reflect:\"func\""], ["dotdotdot", "dotdotdot", "reflect", $Bool, ""], ["in$2", "in", "reflect", ($sliceType(($ptrType(rtype)))), ""], ["out", "out", "reflect", ($sliceType(($ptrType(rtype)))), ""]]);
		imethod.init([["name", "name", "reflect", ($ptrType($String)), ""], ["pkgPath", "pkgPath", "reflect", ($ptrType($String)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""]]);
		interfaceType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(interfaceType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), -1], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), -1], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), -1], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		interfaceType.init([["rtype", "", "reflect", rtype, "reflect:\"interface\""], ["methods", "methods", "reflect", ($sliceType(imethod)), ""]]);
		mapType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(mapType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		mapType.init([["rtype", "", "reflect", rtype, "reflect:\"map\""], ["key", "key", "reflect", ($ptrType(rtype)), ""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""], ["bucket", "bucket", "reflect", ($ptrType(rtype)), ""], ["hmap", "hmap", "reflect", ($ptrType(rtype)), ""]]);
		ptrType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(ptrType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		ptrType.init([["rtype", "", "reflect", rtype, "reflect:\"ptr\""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""]]);
		sliceType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(sliceType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		sliceType.init([["rtype", "", "reflect", rtype, "reflect:\"slice\""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""]]);
		structField.init([["name", "name", "reflect", ($ptrType($String)), ""], ["pkgPath", "pkgPath", "reflect", ($ptrType($String)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["tag", "tag", "reflect", ($ptrType($String)), ""], ["offset", "offset", "reflect", $Uintptr, ""]]);
		structType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(structType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), -1], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), -1], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), -1], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), -1], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		structType.init([["rtype", "", "reflect", rtype, "reflect:\"struct\""], ["fields", "fields", "reflect", ($sliceType(structField)), ""]]);
		Method.init([["Name", "Name", "", $String, ""], ["PkgPath", "PkgPath", "", $String, ""], ["Type", "Type", "", Type, ""], ["Func", "Func", "", Value, ""], ["Index", "Index", "", $Int, ""]]);
		StructField.init([["Name", "Name", "", $String, ""], ["PkgPath", "PkgPath", "", $String, ""], ["Type", "Type", "", Type, ""], ["Tag", "Tag", "", StructTag, ""], ["Offset", "Offset", "", $Uintptr, ""], ["Index", "Index", "", ($sliceType($Int)), ""], ["Anonymous", "Anonymous", "", $Bool, ""]]);
		StructTag.methods = [["Get", "Get", "", $funcType([$String], [$String], false), -1]];
		($ptrType(StructTag)).methods = [["Get", "Get", "", $funcType([$String], [$String], false), -1]];
		fieldScan.init([["typ", "typ", "reflect", ($ptrType(structType)), ""], ["index", "index", "reflect", ($sliceType($Int)), ""]]);
		Value.methods = [["Addr", "Addr", "", $funcType([], [Value], false), -1], ["Bool", "Bool", "", $funcType([], [$Bool], false), -1], ["Bytes", "Bytes", "", $funcType([], [($sliceType($Uint8))], false), -1], ["Call", "Call", "", $funcType([($sliceType(Value))], [($sliceType(Value))], false), -1], ["CallSlice", "CallSlice", "", $funcType([($sliceType(Value))], [($sliceType(Value))], false), -1], ["CanAddr", "CanAddr", "", $funcType([], [$Bool], false), -1], ["CanInterface", "CanInterface", "", $funcType([], [$Bool], false), -1], ["CanSet", "CanSet", "", $funcType([], [$Bool], false), -1], ["Cap", "Cap", "", $funcType([], [$Int], false), -1], ["Close", "Close", "", $funcType([], [], false), -1], ["Complex", "Complex", "", $funcType([], [$Complex128], false), -1], ["Convert", "Convert", "", $funcType([Type], [Value], false), -1], ["Elem", "Elem", "", $funcType([], [Value], false), -1], ["Field", "Field", "", $funcType([$Int], [Value], false), -1], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [Value], false), -1], ["FieldByName", "FieldByName", "", $funcType([$String], [Value], false), -1], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [Value], false), -1], ["Float", "Float", "", $funcType([], [$Float64], false), -1], ["Index", "Index", "", $funcType([$Int], [Value], false), -1], ["Int", "Int", "", $funcType([], [$Int64], false), -1], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), -1], ["InterfaceData", "InterfaceData", "", $funcType([], [($arrayType($Uintptr, 2))], false), -1], ["IsNil", "IsNil", "", $funcType([], [$Bool], false), -1], ["IsValid", "IsValid", "", $funcType([], [$Bool], false), -1], ["Kind", "Kind", "", $funcType([], [Kind], false), -1], ["Len", "Len", "", $funcType([], [$Int], false), -1], ["MapIndex", "MapIndex", "", $funcType([Value], [Value], false), -1], ["MapKeys", "MapKeys", "", $funcType([], [($sliceType(Value))], false), -1], ["Method", "Method", "", $funcType([$Int], [Value], false), -1], ["MethodByName", "MethodByName", "", $funcType([$String], [Value], false), -1], ["NumField", "NumField", "", $funcType([], [$Int], false), -1], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), -1], ["OverflowComplex", "OverflowComplex", "", $funcType([$Complex128], [$Bool], false), -1], ["OverflowFloat", "OverflowFloat", "", $funcType([$Float64], [$Bool], false), -1], ["OverflowInt", "OverflowInt", "", $funcType([$Int64], [$Bool], false), -1], ["OverflowUint", "OverflowUint", "", $funcType([$Uint64], [$Bool], false), -1], ["Pointer", "Pointer", "", $funcType([], [$Uintptr], false), -1], ["Recv", "Recv", "", $funcType([], [Value, $Bool], false), -1], ["Send", "Send", "", $funcType([Value], [], false), -1], ["Set", "Set", "", $funcType([Value], [], false), -1], ["SetBool", "SetBool", "", $funcType([$Bool], [], false), -1], ["SetBytes", "SetBytes", "", $funcType([($sliceType($Uint8))], [], false), -1], ["SetCap", "SetCap", "", $funcType([$Int], [], false), -1], ["SetComplex", "SetComplex", "", $funcType([$Complex128], [], false), -1], ["SetFloat", "SetFloat", "", $funcType([$Float64], [], false), -1], ["SetInt", "SetInt", "", $funcType([$Int64], [], false), -1], ["SetLen", "SetLen", "", $funcType([$Int], [], false), -1], ["SetMapIndex", "SetMapIndex", "", $funcType([Value, Value], [], false), -1], ["SetPointer", "SetPointer", "", $funcType([$UnsafePointer], [], false), -1], ["SetString", "SetString", "", $funcType([$String], [], false), -1], ["SetUint", "SetUint", "", $funcType([$Uint64], [], false), -1], ["Slice", "Slice", "", $funcType([$Int, $Int], [Value], false), -1], ["Slice3", "Slice3", "", $funcType([$Int, $Int, $Int], [Value], false), -1], ["String", "String", "", $funcType([], [$String], false), -1], ["TryRecv", "TryRecv", "", $funcType([], [Value, $Bool], false), -1], ["TrySend", "TrySend", "", $funcType([Value], [$Bool], false), -1], ["Type", "Type", "", $funcType([], [Type], false), -1], ["Uint", "Uint", "", $funcType([], [$Uint64], false), -1], ["UnsafeAddr", "UnsafeAddr", "", $funcType([], [$Uintptr], false), -1], ["assignTo", "assignTo", "reflect", $funcType([$String, ($ptrType(rtype)), ($ptrType($emptyInterface))], [Value], false), -1], ["call", "call", "reflect", $funcType([$String, ($sliceType(Value))], [($sliceType(Value))], false), -1], ["iword", "iword", "reflect", $funcType([], [iword], false), -1], ["kind", "kind", "reflect", $funcType([], [Kind], false), 3], ["mustBe", "mustBe", "reflect", $funcType([Kind], [], false), 3], ["mustBeAssignable", "mustBeAssignable", "reflect", $funcType([], [], false), 3], ["mustBeExported", "mustBeExported", "reflect", $funcType([], [], false), 3], ["pointer", "pointer", "reflect", $funcType([], [$UnsafePointer], false), -1], ["recv", "recv", "reflect", $funcType([$Bool], [Value, $Bool], false), -1], ["runes", "runes", "reflect", $funcType([], [($sliceType($Int32))], false), -1], ["send", "send", "reflect", $funcType([Value, $Bool], [$Bool], false), -1], ["setRunes", "setRunes", "reflect", $funcType([($sliceType($Int32))], [], false), -1]];
		($ptrType(Value)).methods = [["Addr", "Addr", "", $funcType([], [Value], false), -1], ["Bool", "Bool", "", $funcType([], [$Bool], false), -1], ["Bytes", "Bytes", "", $funcType([], [($sliceType($Uint8))], false), -1], ["Call", "Call", "", $funcType([($sliceType(Value))], [($sliceType(Value))], false), -1], ["CallSlice", "CallSlice", "", $funcType([($sliceType(Value))], [($sliceType(Value))], false), -1], ["CanAddr", "CanAddr", "", $funcType([], [$Bool], false), -1], ["CanInterface", "CanInterface", "", $funcType([], [$Bool], false), -1], ["CanSet", "CanSet", "", $funcType([], [$Bool], false), -1], ["Cap", "Cap", "", $funcType([], [$Int], false), -1], ["Close", "Close", "", $funcType([], [], false), -1], ["Complex", "Complex", "", $funcType([], [$Complex128], false), -1], ["Convert", "Convert", "", $funcType([Type], [Value], false), -1], ["Elem", "Elem", "", $funcType([], [Value], false), -1], ["Field", "Field", "", $funcType([$Int], [Value], false), -1], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [Value], false), -1], ["FieldByName", "FieldByName", "", $funcType([$String], [Value], false), -1], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [Value], false), -1], ["Float", "Float", "", $funcType([], [$Float64], false), -1], ["Index", "Index", "", $funcType([$Int], [Value], false), -1], ["Int", "Int", "", $funcType([], [$Int64], false), -1], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), -1], ["InterfaceData", "InterfaceData", "", $funcType([], [($arrayType($Uintptr, 2))], false), -1], ["IsNil", "IsNil", "", $funcType([], [$Bool], false), -1], ["IsValid", "IsValid", "", $funcType([], [$Bool], false), -1], ["Kind", "Kind", "", $funcType([], [Kind], false), -1], ["Len", "Len", "", $funcType([], [$Int], false), -1], ["MapIndex", "MapIndex", "", $funcType([Value], [Value], false), -1], ["MapKeys", "MapKeys", "", $funcType([], [($sliceType(Value))], false), -1], ["Method", "Method", "", $funcType([$Int], [Value], false), -1], ["MethodByName", "MethodByName", "", $funcType([$String], [Value], false), -1], ["NumField", "NumField", "", $funcType([], [$Int], false), -1], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), -1], ["OverflowComplex", "OverflowComplex", "", $funcType([$Complex128], [$Bool], false), -1], ["OverflowFloat", "OverflowFloat", "", $funcType([$Float64], [$Bool], false), -1], ["OverflowInt", "OverflowInt", "", $funcType([$Int64], [$Bool], false), -1], ["OverflowUint", "OverflowUint", "", $funcType([$Uint64], [$Bool], false), -1], ["Pointer", "Pointer", "", $funcType([], [$Uintptr], false), -1], ["Recv", "Recv", "", $funcType([], [Value, $Bool], false), -1], ["Send", "Send", "", $funcType([Value], [], false), -1], ["Set", "Set", "", $funcType([Value], [], false), -1], ["SetBool", "SetBool", "", $funcType([$Bool], [], false), -1], ["SetBytes", "SetBytes", "", $funcType([($sliceType($Uint8))], [], false), -1], ["SetCap", "SetCap", "", $funcType([$Int], [], false), -1], ["SetComplex", "SetComplex", "", $funcType([$Complex128], [], false), -1], ["SetFloat", "SetFloat", "", $funcType([$Float64], [], false), -1], ["SetInt", "SetInt", "", $funcType([$Int64], [], false), -1], ["SetLen", "SetLen", "", $funcType([$Int], [], false), -1], ["SetMapIndex", "SetMapIndex", "", $funcType([Value, Value], [], false), -1], ["SetPointer", "SetPointer", "", $funcType([$UnsafePointer], [], false), -1], ["SetString", "SetString", "", $funcType([$String], [], false), -1], ["SetUint", "SetUint", "", $funcType([$Uint64], [], false), -1], ["Slice", "Slice", "", $funcType([$Int, $Int], [Value], false), -1], ["Slice3", "Slice3", "", $funcType([$Int, $Int, $Int], [Value], false), -1], ["String", "String", "", $funcType([], [$String], false), -1], ["TryRecv", "TryRecv", "", $funcType([], [Value, $Bool], false), -1], ["TrySend", "TrySend", "", $funcType([Value], [$Bool], false), -1], ["Type", "Type", "", $funcType([], [Type], false), -1], ["Uint", "Uint", "", $funcType([], [$Uint64], false), -1], ["UnsafeAddr", "UnsafeAddr", "", $funcType([], [$Uintptr], false), -1], ["assignTo", "assignTo", "reflect", $funcType([$String, ($ptrType(rtype)), ($ptrType($emptyInterface))], [Value], false), -1], ["call", "call", "reflect", $funcType([$String, ($sliceType(Value))], [($sliceType(Value))], false), -1], ["iword", "iword", "reflect", $funcType([], [iword], false), -1], ["kind", "kind", "reflect", $funcType([], [Kind], false), 3], ["mustBe", "mustBe", "reflect", $funcType([Kind], [], false), 3], ["mustBeAssignable", "mustBeAssignable", "reflect", $funcType([], [], false), 3], ["mustBeExported", "mustBeExported", "reflect", $funcType([], [], false), 3], ["pointer", "pointer", "reflect", $funcType([], [$UnsafePointer], false), -1], ["recv", "recv", "reflect", $funcType([$Bool], [Value, $Bool], false), -1], ["runes", "runes", "reflect", $funcType([], [($sliceType($Int32))], false), -1], ["send", "send", "reflect", $funcType([Value, $Bool], [$Bool], false), -1], ["setRunes", "setRunes", "reflect", $funcType([($sliceType($Int32))], [], false), -1]];
		Value.init([["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["ptr", "ptr", "reflect", $UnsafePointer, ""], ["scalar", "scalar", "reflect", $Uintptr, ""], ["flag", "", "reflect", flag, ""]]);
		flag.methods = [["kind", "kind", "reflect", $funcType([], [Kind], false), -1], ["mustBe", "mustBe", "reflect", $funcType([Kind], [], false), -1], ["mustBeAssignable", "mustBeAssignable", "reflect", $funcType([], [], false), -1], ["mustBeExported", "mustBeExported", "reflect", $funcType([], [], false), -1]];
		($ptrType(flag)).methods = [["kind", "kind", "reflect", $funcType([], [Kind], false), -1], ["mustBe", "mustBe", "reflect", $funcType([Kind], [], false), -1], ["mustBeAssignable", "mustBeAssignable", "reflect", $funcType([], [], false), -1], ["mustBeExported", "mustBeExported", "reflect", $funcType([], [], false), -1]];
		($ptrType(ValueError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		ValueError.init([["Method", "Method", "", $String, ""], ["Kind", "Kind", "", Kind, ""]]);
		nonEmptyInterface.init([["itab", "itab", "reflect", ($ptrType(($structType([["ityp", "ityp", "reflect", ($ptrType(rtype)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["link", "link", "reflect", $UnsafePointer, ""], ["bad", "bad", "reflect", $Int32, ""], ["unused", "unused", "reflect", $Int32, ""], ["fun", "fun", "reflect", ($arrayType($UnsafePointer, 100000)), ""]])))), ""], ["word", "word", "reflect", iword, ""]]);
		initialized = false;
		kindNames = new ($sliceType($String))(["invalid", "bool", "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr", "float32", "float64", "complex64", "complex128", "array", "chan", "func", "interface", "map", "ptr", "slice", "string", "struct", "unsafe.Pointer"]);
		uint8Type = $assertType(TypeOf(new $Uint8(0)), ($ptrType(rtype)));
		init();
	};
	return $pkg;
})();
$packages["fmt"] = (function() {
	var $pkg = {}, math = $packages["math"], strconv = $packages["strconv"], utf8 = $packages["unicode/utf8"], errors = $packages["errors"], io = $packages["io"], os = $packages["os"], reflect = $packages["reflect"], sync = $packages["sync"], fmt, State, Formatter, Stringer, GoStringer, buffer, pp, runeUnreader, scanError, ss, ssave, padZeroBytes, padSpaceBytes, trueBytes, falseBytes, commaSpaceBytes, nilAngleBytes, nilParenBytes, nilBytes, mapBytes, percentBangBytes, missingBytes, badIndexBytes, panicBytes, extraBytes, irparenBytes, bytesBytes, badWidthBytes, badPrecBytes, noVerbBytes, ppFree, intBits, uintptrBits, space, ssFree, complexError, boolError, init, doPrec, newPrinter, Fprintf, Printf, Sprintf, Errorf, Fprint, Sprint, Fprintln, Println, Sprintln, getField, parsenum, intFromArg, parseArgNumber, isSpace, notSpace, indexRune;
	fmt = $pkg.fmt = $newType(0, "Struct", "fmt.fmt", "fmt", "fmt", function(intbuf_, buf_, wid_, prec_, widPresent_, precPresent_, minus_, plus_, sharp_, space_, unicode_, uniQuote_, zero_) {
		this.$val = this;
		this.intbuf = intbuf_ !== undefined ? intbuf_ : ($arrayType($Uint8, 65)).zero();
		this.buf = buf_ !== undefined ? buf_ : ($ptrType(buffer)).nil;
		this.wid = wid_ !== undefined ? wid_ : 0;
		this.prec = prec_ !== undefined ? prec_ : 0;
		this.widPresent = widPresent_ !== undefined ? widPresent_ : false;
		this.precPresent = precPresent_ !== undefined ? precPresent_ : false;
		this.minus = minus_ !== undefined ? minus_ : false;
		this.plus = plus_ !== undefined ? plus_ : false;
		this.sharp = sharp_ !== undefined ? sharp_ : false;
		this.space = space_ !== undefined ? space_ : false;
		this.unicode = unicode_ !== undefined ? unicode_ : false;
		this.uniQuote = uniQuote_ !== undefined ? uniQuote_ : false;
		this.zero = zero_ !== undefined ? zero_ : false;
	});
	State = $pkg.State = $newType(8, "Interface", "fmt.State", "State", "fmt", null);
	Formatter = $pkg.Formatter = $newType(8, "Interface", "fmt.Formatter", "Formatter", "fmt", null);
	Stringer = $pkg.Stringer = $newType(8, "Interface", "fmt.Stringer", "Stringer", "fmt", null);
	GoStringer = $pkg.GoStringer = $newType(8, "Interface", "fmt.GoStringer", "GoStringer", "fmt", null);
	buffer = $pkg.buffer = $newType(12, "Slice", "fmt.buffer", "buffer", "fmt", null);
	pp = $pkg.pp = $newType(0, "Struct", "fmt.pp", "pp", "fmt", function(n_, panicking_, erroring_, buf_, arg_, value_, reordered_, goodArgNum_, runeBuf_, fmt_) {
		this.$val = this;
		this.n = n_ !== undefined ? n_ : 0;
		this.panicking = panicking_ !== undefined ? panicking_ : false;
		this.erroring = erroring_ !== undefined ? erroring_ : false;
		this.buf = buf_ !== undefined ? buf_ : buffer.nil;
		this.arg = arg_ !== undefined ? arg_ : $ifaceNil;
		this.value = value_ !== undefined ? value_ : new reflect.Value.Ptr();
		this.reordered = reordered_ !== undefined ? reordered_ : false;
		this.goodArgNum = goodArgNum_ !== undefined ? goodArgNum_ : false;
		this.runeBuf = runeBuf_ !== undefined ? runeBuf_ : ($arrayType($Uint8, 4)).zero();
		this.fmt = fmt_ !== undefined ? fmt_ : new fmt.Ptr();
	});
	runeUnreader = $pkg.runeUnreader = $newType(8, "Interface", "fmt.runeUnreader", "runeUnreader", "fmt", null);
	scanError = $pkg.scanError = $newType(0, "Struct", "fmt.scanError", "scanError", "fmt", function(err_) {
		this.$val = this;
		this.err = err_ !== undefined ? err_ : $ifaceNil;
	});
	ss = $pkg.ss = $newType(0, "Struct", "fmt.ss", "ss", "fmt", function(rr_, buf_, peekRune_, prevRune_, count_, atEOF_, ssave_) {
		this.$val = this;
		this.rr = rr_ !== undefined ? rr_ : $ifaceNil;
		this.buf = buf_ !== undefined ? buf_ : buffer.nil;
		this.peekRune = peekRune_ !== undefined ? peekRune_ : 0;
		this.prevRune = prevRune_ !== undefined ? prevRune_ : 0;
		this.count = count_ !== undefined ? count_ : 0;
		this.atEOF = atEOF_ !== undefined ? atEOF_ : false;
		this.ssave = ssave_ !== undefined ? ssave_ : new ssave.Ptr();
	});
	ssave = $pkg.ssave = $newType(0, "Struct", "fmt.ssave", "ssave", "fmt", function(validSave_, nlIsEnd_, nlIsSpace_, argLimit_, limit_, maxWid_) {
		this.$val = this;
		this.validSave = validSave_ !== undefined ? validSave_ : false;
		this.nlIsEnd = nlIsEnd_ !== undefined ? nlIsEnd_ : false;
		this.nlIsSpace = nlIsSpace_ !== undefined ? nlIsSpace_ : false;
		this.argLimit = argLimit_ !== undefined ? argLimit_ : 0;
		this.limit = limit_ !== undefined ? limit_ : 0;
		this.maxWid = maxWid_ !== undefined ? maxWid_ : 0;
	});
	init = function() {
		var i;
		i = 0;
		while (i < 65) {
			(i < 0 || i >= padZeroBytes.$length) ? $throwRuntimeError("index out of range") : padZeroBytes.$array[padZeroBytes.$offset + i] = 48;
			(i < 0 || i >= padSpaceBytes.$length) ? $throwRuntimeError("index out of range") : padSpaceBytes.$array[padSpaceBytes.$offset + i] = 32;
			i = i + (1) >> 0;
		}
	};
	fmt.Ptr.prototype.clearflags = function() {
		var f;
		f = this;
		f.wid = 0;
		f.widPresent = false;
		f.prec = 0;
		f.precPresent = false;
		f.minus = false;
		f.plus = false;
		f.sharp = false;
		f.space = false;
		f.unicode = false;
		f.uniQuote = false;
		f.zero = false;
	};
	fmt.prototype.clearflags = function() { return this.$val.clearflags(); };
	fmt.Ptr.prototype.init = function(buf) {
		var f;
		f = this;
		f.buf = buf;
		f.clearflags();
	};
	fmt.prototype.init = function(buf) { return this.$val.init(buf); };
	fmt.Ptr.prototype.computePadding = function(width) {
		var padding = ($sliceType($Uint8)).nil, leftWidth = 0, rightWidth = 0, f, left, w, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8;
		f = this;
		left = !f.minus;
		w = f.wid;
		if (w < 0) {
			left = false;
			w = -w;
		}
		w = w - (width) >> 0;
		if (w > 0) {
			if (left && f.zero) {
				_tmp = padZeroBytes; _tmp$1 = w; _tmp$2 = 0; padding = _tmp; leftWidth = _tmp$1; rightWidth = _tmp$2;
				return [padding, leftWidth, rightWidth];
			}
			if (left) {
				_tmp$3 = padSpaceBytes; _tmp$4 = w; _tmp$5 = 0; padding = _tmp$3; leftWidth = _tmp$4; rightWidth = _tmp$5;
				return [padding, leftWidth, rightWidth];
			} else {
				_tmp$6 = padSpaceBytes; _tmp$7 = 0; _tmp$8 = w; padding = _tmp$6; leftWidth = _tmp$7; rightWidth = _tmp$8;
				return [padding, leftWidth, rightWidth];
			}
		}
		return [padding, leftWidth, rightWidth];
	};
	fmt.prototype.computePadding = function(width) { return this.$val.computePadding(width); };
	fmt.Ptr.prototype.writePadding = function(n, padding) {
		var f, m;
		f = this;
		while (n > 0) {
			m = n;
			if (m > 65) {
				m = 65;
			}
			f.buf.Write($subslice(padding, 0, m));
			n = n - (m) >> 0;
		}
	};
	fmt.prototype.writePadding = function(n, padding) { return this.$val.writePadding(n, padding); };
	fmt.Ptr.prototype.pad = function(b) {
		var f, _tuple, padding, left, right;
		f = this;
		if (!f.widPresent || (f.wid === 0)) {
			f.buf.Write(b);
			return;
		}
		_tuple = f.computePadding(b.$length); padding = _tuple[0]; left = _tuple[1]; right = _tuple[2];
		if (left > 0) {
			f.writePadding(left, padding);
		}
		f.buf.Write(b);
		if (right > 0) {
			f.writePadding(right, padding);
		}
	};
	fmt.prototype.pad = function(b) { return this.$val.pad(b); };
	fmt.Ptr.prototype.padString = function(s) {
		var f, _tuple, padding, left, right;
		f = this;
		if (!f.widPresent || (f.wid === 0)) {
			f.buf.WriteString(s);
			return;
		}
		_tuple = f.computePadding(utf8.RuneCountInString(s)); padding = _tuple[0]; left = _tuple[1]; right = _tuple[2];
		if (left > 0) {
			f.writePadding(left, padding);
		}
		f.buf.WriteString(s);
		if (right > 0) {
			f.writePadding(right, padding);
		}
	};
	fmt.prototype.padString = function(s) { return this.$val.padString(s); };
	fmt.Ptr.prototype.fmt_boolean = function(v) {
		var f;
		f = this;
		if (v) {
			f.pad(trueBytes);
		} else {
			f.pad(falseBytes);
		}
	};
	fmt.prototype.fmt_boolean = function(v) { return this.$val.fmt_boolean(v); };
	fmt.Ptr.prototype.integer = function(a, base, signedness, digits) {
		var f, buf, width, negative, prec, i, ua, _ref, runeWidth, width$1, j;
		f = this;
		if (f.precPresent && (f.prec === 0) && (a.$high === 0 && a.$low === 0)) {
			return;
		}
		buf = $subslice(new ($sliceType($Uint8))(f.intbuf), 0);
		if (f.widPresent) {
			width = f.wid;
			if ((base.$high === 0 && base.$low === 16) && f.sharp) {
				width = width + (2) >> 0;
			}
			if (width > 65) {
				buf = ($sliceType($Uint8)).make(width);
			}
		}
		negative = signedness === true && (a.$high < 0 || (a.$high === 0 && a.$low < 0));
		if (negative) {
			a = new $Int64(-a.$high, -a.$low);
		}
		prec = 0;
		if (f.precPresent) {
			prec = f.prec;
			f.zero = false;
		} else if (f.zero && f.widPresent && !f.minus && f.wid > 0) {
			prec = f.wid;
			if (negative || f.plus || f.space) {
				prec = prec - (1) >> 0;
			}
		}
		i = buf.$length;
		ua = new $Uint64(a.$high, a.$low);
		while ((ua.$high > base.$high || (ua.$high === base.$high && ua.$low >= base.$low))) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = digits.charCodeAt($flatten64($div64(ua, base, true)));
			ua = $div64(ua, (base), false);
		}
		i = i - (1) >> 0;
		(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = digits.charCodeAt($flatten64(ua));
		while (i > 0 && prec > (buf.$length - i >> 0)) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 48;
		}
		if (f.sharp) {
			_ref = base;
			if ((_ref.$high === 0 && _ref.$low === 8)) {
				if (!((((i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i]) === 48))) {
					i = i - (1) >> 0;
					(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 48;
				}
			} else if ((_ref.$high === 0 && _ref.$low === 16)) {
				i = i - (1) >> 0;
				(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = (120 + digits.charCodeAt(10) << 24 >>> 24) - 97 << 24 >>> 24;
				i = i - (1) >> 0;
				(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 48;
			}
		}
		if (f.unicode) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 43;
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 85;
		}
		if (negative) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 45;
		} else if (f.plus) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 43;
		} else if (f.space) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 32;
		}
		if (f.unicode && f.uniQuote && (a.$high > 0 || (a.$high === 0 && a.$low >= 0)) && (a.$high < 0 || (a.$high === 0 && a.$low <= 1114111)) && strconv.IsPrint(((a.$low + ((a.$high >> 31) * 4294967296)) >> 0))) {
			runeWidth = utf8.RuneLen(((a.$low + ((a.$high >> 31) * 4294967296)) >> 0));
			width$1 = (2 + runeWidth >> 0) + 1 >> 0;
			$copySlice($subslice(buf, (i - width$1 >> 0)), $subslice(buf, i));
			i = i - (width$1) >> 0;
			j = buf.$length - width$1 >> 0;
			(j < 0 || j >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + j] = 32;
			j = j + (1) >> 0;
			(j < 0 || j >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + j] = 39;
			j = j + (1) >> 0;
			utf8.EncodeRune($subslice(buf, j), ((a.$low + ((a.$high >> 31) * 4294967296)) >> 0));
			j = j + (runeWidth) >> 0;
			(j < 0 || j >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + j] = 39;
		}
		f.pad($subslice(buf, i));
	};
	fmt.prototype.integer = function(a, base, signedness, digits) { return this.$val.integer(a, base, signedness, digits); };
	fmt.Ptr.prototype.truncate = function(s) {
		var f, n, _ref, _i, _rune, i;
		f = this;
		if (f.precPresent && f.prec < utf8.RuneCountInString(s)) {
			n = f.prec;
			_ref = s;
			_i = 0;
			while (_i < _ref.length) {
				_rune = $decodeRune(_ref, _i);
				i = _i;
				if (n === 0) {
					s = s.substring(0, i);
					break;
				}
				n = n - (1) >> 0;
				_i += _rune[1];
			}
		}
		return s;
	};
	fmt.prototype.truncate = function(s) { return this.$val.truncate(s); };
	fmt.Ptr.prototype.fmt_s = function(s) {
		var f;
		f = this;
		s = f.truncate(s);
		f.padString(s);
	};
	fmt.prototype.fmt_s = function(s) { return this.$val.fmt_s(s); };
	fmt.Ptr.prototype.fmt_sbx = function(s, b, digits) {
		var f, n, x, buf, i, c;
		f = this;
		n = b.$length;
		if (b === ($sliceType($Uint8)).nil) {
			n = s.length;
		}
		x = (digits.charCodeAt(10) - 97 << 24 >>> 24) + 120 << 24 >>> 24;
		buf = ($sliceType($Uint8)).nil;
		i = 0;
		while (i < n) {
			if (i > 0 && f.space) {
				buf = $append(buf, 32);
			}
			if (f.sharp) {
				buf = $append(buf, 48, x);
			}
			c = 0;
			if (b === ($sliceType($Uint8)).nil) {
				c = s.charCodeAt(i);
			} else {
				c = ((i < 0 || i >= b.$length) ? $throwRuntimeError("index out of range") : b.$array[b.$offset + i]);
			}
			buf = $append(buf, digits.charCodeAt((c >>> 4 << 24 >>> 24)), digits.charCodeAt(((c & 15) >>> 0)));
			i = i + (1) >> 0;
		}
		f.pad(buf);
	};
	fmt.prototype.fmt_sbx = function(s, b, digits) { return this.$val.fmt_sbx(s, b, digits); };
	fmt.Ptr.prototype.fmt_sx = function(s, digits) {
		var f;
		f = this;
		f.fmt_sbx(s, ($sliceType($Uint8)).nil, digits);
	};
	fmt.prototype.fmt_sx = function(s, digits) { return this.$val.fmt_sx(s, digits); };
	fmt.Ptr.prototype.fmt_bx = function(b, digits) {
		var f;
		f = this;
		f.fmt_sbx("", b, digits);
	};
	fmt.prototype.fmt_bx = function(b, digits) { return this.$val.fmt_bx(b, digits); };
	fmt.Ptr.prototype.fmt_q = function(s) {
		var f, quoted;
		f = this;
		s = f.truncate(s);
		quoted = "";
		if (f.sharp && strconv.CanBackquote(s)) {
			quoted = "`" + s + "`";
		} else {
			if (f.plus) {
				quoted = strconv.QuoteToASCII(s);
			} else {
				quoted = strconv.Quote(s);
			}
		}
		f.padString(quoted);
	};
	fmt.prototype.fmt_q = function(s) { return this.$val.fmt_q(s); };
	fmt.Ptr.prototype.fmt_qc = function(c) {
		var f, quoted;
		f = this;
		quoted = ($sliceType($Uint8)).nil;
		if (f.plus) {
			quoted = strconv.AppendQuoteRuneToASCII($subslice(new ($sliceType($Uint8))(f.intbuf), 0, 0), ((c.$low + ((c.$high >> 31) * 4294967296)) >> 0));
		} else {
			quoted = strconv.AppendQuoteRune($subslice(new ($sliceType($Uint8))(f.intbuf), 0, 0), ((c.$low + ((c.$high >> 31) * 4294967296)) >> 0));
		}
		f.pad(quoted);
	};
	fmt.prototype.fmt_qc = function(c) { return this.$val.fmt_qc(c); };
	doPrec = function(f, def) {
		if (f.precPresent) {
			return f.prec;
		}
		return def;
	};
	fmt.Ptr.prototype.formatFloat = function(v, verb, prec, n) {
		var $deferred = [], $err = null, f, num;
		/* */ try { $deferFrames.push($deferred);
		f = this;
		num = strconv.AppendFloat($subslice(new ($sliceType($Uint8))(f.intbuf), 0, 1), v, verb, prec, n);
		if ((((1 < 0 || 1 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 1]) === 45) || (((1 < 0 || 1 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 1]) === 43)) {
			num = $subslice(num, 1);
		} else {
			(0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0] = 43;
		}
		if (math.IsInf(v, 0)) {
			if (f.zero) {
				$deferred.push([(function() {
					f.zero = true;
				}), []]);
				f.zero = false;
			}
		}
		if (f.zero && f.widPresent && f.wid > num.$length) {
			if (f.space && v >= 0) {
				f.buf.WriteByte(32);
				f.wid = f.wid - (1) >> 0;
			} else if (f.plus || v < 0) {
				f.buf.WriteByte(((0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0]));
				f.wid = f.wid - (1) >> 0;
			}
			f.pad($subslice(num, 1));
			return;
		}
		if (f.space && (((0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0]) === 43)) {
			(0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0] = 32;
			f.pad(num);
			return;
		}
		if (f.plus || (((0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0]) === 45) || math.IsInf(v, 0)) {
			f.pad(num);
			return;
		}
		f.pad($subslice(num, 1));
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	fmt.prototype.formatFloat = function(v, verb, prec, n) { return this.$val.formatFloat(v, verb, prec, n); };
	fmt.Ptr.prototype.fmt_e64 = function(v) {
		var f;
		f = this;
		f.formatFloat(v, 101, doPrec(f, 6), 64);
	};
	fmt.prototype.fmt_e64 = function(v) { return this.$val.fmt_e64(v); };
	fmt.Ptr.prototype.fmt_E64 = function(v) {
		var f;
		f = this;
		f.formatFloat(v, 69, doPrec(f, 6), 64);
	};
	fmt.prototype.fmt_E64 = function(v) { return this.$val.fmt_E64(v); };
	fmt.Ptr.prototype.fmt_f64 = function(v) {
		var f;
		f = this;
		f.formatFloat(v, 102, doPrec(f, 6), 64);
	};
	fmt.prototype.fmt_f64 = function(v) { return this.$val.fmt_f64(v); };
	fmt.Ptr.prototype.fmt_g64 = function(v) {
		var f;
		f = this;
		f.formatFloat(v, 103, doPrec(f, -1), 64);
	};
	fmt.prototype.fmt_g64 = function(v) { return this.$val.fmt_g64(v); };
	fmt.Ptr.prototype.fmt_G64 = function(v) {
		var f;
		f = this;
		f.formatFloat(v, 71, doPrec(f, -1), 64);
	};
	fmt.prototype.fmt_G64 = function(v) { return this.$val.fmt_G64(v); };
	fmt.Ptr.prototype.fmt_fb64 = function(v) {
		var f;
		f = this;
		f.formatFloat(v, 98, 0, 64);
	};
	fmt.prototype.fmt_fb64 = function(v) { return this.$val.fmt_fb64(v); };
	fmt.Ptr.prototype.fmt_e32 = function(v) {
		var f;
		f = this;
		f.formatFloat($coerceFloat32(v), 101, doPrec(f, 6), 32);
	};
	fmt.prototype.fmt_e32 = function(v) { return this.$val.fmt_e32(v); };
	fmt.Ptr.prototype.fmt_E32 = function(v) {
		var f;
		f = this;
		f.formatFloat($coerceFloat32(v), 69, doPrec(f, 6), 32);
	};
	fmt.prototype.fmt_E32 = function(v) { return this.$val.fmt_E32(v); };
	fmt.Ptr.prototype.fmt_f32 = function(v) {
		var f;
		f = this;
		f.formatFloat($coerceFloat32(v), 102, doPrec(f, 6), 32);
	};
	fmt.prototype.fmt_f32 = function(v) { return this.$val.fmt_f32(v); };
	fmt.Ptr.prototype.fmt_g32 = function(v) {
		var f;
		f = this;
		f.formatFloat($coerceFloat32(v), 103, doPrec(f, -1), 32);
	};
	fmt.prototype.fmt_g32 = function(v) { return this.$val.fmt_g32(v); };
	fmt.Ptr.prototype.fmt_G32 = function(v) {
		var f;
		f = this;
		f.formatFloat($coerceFloat32(v), 71, doPrec(f, -1), 32);
	};
	fmt.prototype.fmt_G32 = function(v) { return this.$val.fmt_G32(v); };
	fmt.Ptr.prototype.fmt_fb32 = function(v) {
		var f;
		f = this;
		f.formatFloat($coerceFloat32(v), 98, 0, 32);
	};
	fmt.prototype.fmt_fb32 = function(v) { return this.$val.fmt_fb32(v); };
	fmt.Ptr.prototype.fmt_c64 = function(v, verb) {
		var f;
		f = this;
		f.fmt_complex($coerceFloat32(v.$real), $coerceFloat32(v.$imag), 32, verb);
	};
	fmt.prototype.fmt_c64 = function(v, verb) { return this.$val.fmt_c64(v, verb); };
	fmt.Ptr.prototype.fmt_c128 = function(v, verb) {
		var f;
		f = this;
		f.fmt_complex(v.$real, v.$imag, 64, verb);
	};
	fmt.prototype.fmt_c128 = function(v, verb) { return this.$val.fmt_c128(v, verb); };
	fmt.Ptr.prototype.fmt_complex = function(r, j, size, verb) {
		var f, oldPlus, oldSpace, oldWid, i, _ref;
		f = this;
		f.buf.WriteByte(40);
		oldPlus = f.plus;
		oldSpace = f.space;
		oldWid = f.wid;
		i = 0;
		while (true) {
			_ref = verb;
			if (_ref === 98) {
				f.formatFloat(r, 98, 0, size);
			} else if (_ref === 101) {
				f.formatFloat(r, 101, doPrec(f, 6), size);
			} else if (_ref === 69) {
				f.formatFloat(r, 69, doPrec(f, 6), size);
			} else if (_ref === 102 || _ref === 70) {
				f.formatFloat(r, 102, doPrec(f, 6), size);
			} else if (_ref === 103) {
				f.formatFloat(r, 103, doPrec(f, -1), size);
			} else if (_ref === 71) {
				f.formatFloat(r, 71, doPrec(f, -1), size);
			}
			if (!((i === 0))) {
				break;
			}
			f.plus = true;
			f.space = false;
			f.wid = oldWid;
			r = j;
			i = i + (1) >> 0;
		}
		f.space = oldSpace;
		f.plus = oldPlus;
		f.wid = oldWid;
		f.buf.Write(irparenBytes);
	};
	fmt.prototype.fmt_complex = function(r, j, size, verb) { return this.$val.fmt_complex(r, j, size, verb); };
	$ptrType(buffer).prototype.Write = function(p) {
		var n = 0, err = $ifaceNil, b, _tmp, _tmp$1;
		b = this;
		b.$set($appendSlice(b.$get(), p));
		_tmp = p.$length; _tmp$1 = $ifaceNil; n = _tmp; err = _tmp$1;
		return [n, err];
	};
	$ptrType(buffer).prototype.WriteString = function(s) {
		var n = 0, err = $ifaceNil, b, _tmp, _tmp$1;
		b = this;
		b.$set($appendSlice(b.$get(), new buffer($stringToBytes(s))));
		_tmp = s.length; _tmp$1 = $ifaceNil; n = _tmp; err = _tmp$1;
		return [n, err];
	};
	$ptrType(buffer).prototype.WriteByte = function(c) {
		var b;
		b = this;
		b.$set($append(b.$get(), c));
		return $ifaceNil;
	};
	$ptrType(buffer).prototype.WriteRune = function(r) {
		var bp, b, n, x, w;
		bp = this;
		if (r < 128) {
			bp.$set($append(bp.$get(), (r << 24 >>> 24)));
			return $ifaceNil;
		}
		b = bp.$get();
		n = b.$length;
		while ((n + 4 >> 0) > b.$capacity) {
			b = $append(b, 0);
		}
		w = utf8.EncodeRune((x = $subslice(b, n, (n + 4 >> 0)), $subslice(new ($sliceType($Uint8))(x.$array), x.$offset, x.$offset + x.$length)), r);
		bp.$set($subslice(b, 0, (n + w >> 0)));
		return $ifaceNil;
	};
	newPrinter = function() {
		var p;
		p = $assertType(ppFree.Get(), ($ptrType(pp)));
		p.panicking = false;
		p.erroring = false;
		p.fmt.init(new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p));
		return p;
	};
	pp.Ptr.prototype.free = function() {
		var p;
		p = this;
		if (p.buf.$capacity > 1024) {
			return;
		}
		p.buf = $subslice(p.buf, 0, 0);
		p.arg = $ifaceNil;
		$copy(p.value, new reflect.Value.Ptr(($ptrType(reflect.rtype)).nil, 0, 0, 0), reflect.Value);
		ppFree.Put(p);
	};
	pp.prototype.free = function() { return this.$val.free(); };
	pp.Ptr.prototype.Width = function() {
		var wid = 0, ok = false, p, _tmp, _tmp$1;
		p = this;
		_tmp = p.fmt.wid; _tmp$1 = p.fmt.widPresent; wid = _tmp; ok = _tmp$1;
		return [wid, ok];
	};
	pp.prototype.Width = function() { return this.$val.Width(); };
	pp.Ptr.prototype.Precision = function() {
		var prec = 0, ok = false, p, _tmp, _tmp$1;
		p = this;
		_tmp = p.fmt.prec; _tmp$1 = p.fmt.precPresent; prec = _tmp; ok = _tmp$1;
		return [prec, ok];
	};
	pp.prototype.Precision = function() { return this.$val.Precision(); };
	pp.Ptr.prototype.Flag = function(b) {
		var p, _ref;
		p = this;
		_ref = b;
		if (_ref === 45) {
			return p.fmt.minus;
		} else if (_ref === 43) {
			return p.fmt.plus;
		} else if (_ref === 35) {
			return p.fmt.sharp;
		} else if (_ref === 32) {
			return p.fmt.space;
		} else if (_ref === 48) {
			return p.fmt.zero;
		}
		return false;
	};
	pp.prototype.Flag = function(b) { return this.$val.Flag(b); };
	pp.Ptr.prototype.add = function(c) {
		var p;
		p = this;
		new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteRune(c);
	};
	pp.prototype.add = function(c) { return this.$val.add(c); };
	pp.Ptr.prototype.Write = function(b) {
		var ret = 0, err = $ifaceNil, p, _tuple;
		p = this;
		_tuple = new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(b); ret = _tuple[0]; err = _tuple[1];
		return [ret, err];
	};
	pp.prototype.Write = function(b) { return this.$val.Write(b); };
	Fprintf = $pkg.Fprintf = function(w, format, a) {
		var n = 0, err = $ifaceNil, p, _tuple, x;
		p = newPrinter();
		p.doPrintf(format, a);
		_tuple = w.Write((x = p.buf, $subslice(new ($sliceType($Uint8))(x.$array), x.$offset, x.$offset + x.$length))); n = _tuple[0]; err = _tuple[1];
		p.free();
		return [n, err];
	};
	Printf = $pkg.Printf = function(format, a) {
		var n = 0, err = $ifaceNil, _tuple;
		_tuple = Fprintf(os.Stdout, format, a); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	Sprintf = $pkg.Sprintf = function(format, a) {
		var p, s;
		p = newPrinter();
		p.doPrintf(format, a);
		s = $bytesToString(p.buf);
		p.free();
		return s;
	};
	Errorf = $pkg.Errorf = function(format, a) {
		return errors.New(Sprintf(format, a));
	};
	Fprint = $pkg.Fprint = function(w, a) {
		var n = 0, err = $ifaceNil, p, _tuple, x;
		p = newPrinter();
		p.doPrint(a, false, false);
		_tuple = w.Write((x = p.buf, $subslice(new ($sliceType($Uint8))(x.$array), x.$offset, x.$offset + x.$length))); n = _tuple[0]; err = _tuple[1];
		p.free();
		return [n, err];
	};
	Sprint = $pkg.Sprint = function(a) {
		var p, s;
		p = newPrinter();
		p.doPrint(a, false, false);
		s = $bytesToString(p.buf);
		p.free();
		return s;
	};
	Fprintln = $pkg.Fprintln = function(w, a) {
		var n = 0, err = $ifaceNil, p, _tuple, x;
		p = newPrinter();
		p.doPrint(a, true, true);
		_tuple = w.Write((x = p.buf, $subslice(new ($sliceType($Uint8))(x.$array), x.$offset, x.$offset + x.$length))); n = _tuple[0]; err = _tuple[1];
		p.free();
		return [n, err];
	};
	Println = $pkg.Println = function(a) {
		var n = 0, err = $ifaceNil, _tuple;
		_tuple = Fprintln(os.Stdout, a); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	Sprintln = $pkg.Sprintln = function(a) {
		var p, s;
		p = newPrinter();
		p.doPrint(a, true, true);
		s = $bytesToString(p.buf);
		p.free();
		return s;
	};
	getField = function(v, i) {
		var val;
		val = new reflect.Value.Ptr(); $copy(val, v.Field(i), reflect.Value);
		if ((val.Kind() === 20) && !val.IsNil()) {
			$copy(val, val.Elem(), reflect.Value);
		}
		return val;
	};
	parsenum = function(s, start, end) {
		var num = 0, isnum = false, newi = 0, _tmp, _tmp$1, _tmp$2;
		if (start >= end) {
			_tmp = 0; _tmp$1 = false; _tmp$2 = end; num = _tmp; isnum = _tmp$1; newi = _tmp$2;
			return [num, isnum, newi];
		}
		newi = start;
		while (newi < end && 48 <= s.charCodeAt(newi) && s.charCodeAt(newi) <= 57) {
			num = ((((num >>> 16 << 16) * 10 >> 0) + (num << 16 >>> 16) * 10) >> 0) + ((s.charCodeAt(newi) - 48 << 24 >>> 24) >> 0) >> 0;
			isnum = true;
			newi = newi + (1) >> 0;
		}
		return [num, isnum, newi];
	};
	pp.Ptr.prototype.unknownType = function(v) {
		var p;
		p = this;
		if ($interfaceIsEqual(v, $ifaceNil)) {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
			return;
		}
		new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(63);
		new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(reflect.TypeOf(v).String());
		new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(63);
	};
	pp.prototype.unknownType = function(v) { return this.$val.unknownType(v); };
	pp.Ptr.prototype.badVerb = function(verb) {
		var p;
		p = this;
		p.erroring = true;
		p.add(37);
		p.add(33);
		p.add(verb);
		p.add(40);
		if (!($interfaceIsEqual(p.arg, $ifaceNil))) {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(reflect.TypeOf(p.arg).String());
			p.add(61);
			p.printArg(p.arg, 118, false, false, 0);
		} else if (p.value.IsValid()) {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(p.value.Type().String());
			p.add(61);
			p.printValue($clone(p.value, reflect.Value), 118, false, false, 0);
		} else {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
		}
		p.add(41);
		p.erroring = false;
	};
	pp.prototype.badVerb = function(verb) { return this.$val.badVerb(verb); };
	pp.Ptr.prototype.fmtBool = function(v, verb) {
		var p, _ref;
		p = this;
		_ref = verb;
		if (_ref === 116 || _ref === 118) {
			p.fmt.fmt_boolean(v);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtBool = function(v, verb) { return this.$val.fmtBool(v, verb); };
	pp.Ptr.prototype.fmtC = function(c) {
		var p, r, x, w;
		p = this;
		r = ((c.$low + ((c.$high >> 31) * 4294967296)) >> 0);
		if (!((x = new $Int64(0, r), (x.$high === c.$high && x.$low === c.$low)))) {
			r = 65533;
		}
		w = utf8.EncodeRune($subslice(new ($sliceType($Uint8))(p.runeBuf), 0, 4), r);
		p.fmt.pad($subslice(new ($sliceType($Uint8))(p.runeBuf), 0, w));
	};
	pp.prototype.fmtC = function(c) { return this.$val.fmtC(c); };
	pp.Ptr.prototype.fmtInt64 = function(v, verb) {
		var p, _ref;
		p = this;
		_ref = verb;
		if (_ref === 98) {
			p.fmt.integer(v, new $Uint64(0, 2), true, "0123456789abcdef");
		} else if (_ref === 99) {
			p.fmtC(v);
		} else if (_ref === 100 || _ref === 118) {
			p.fmt.integer(v, new $Uint64(0, 10), true, "0123456789abcdef");
		} else if (_ref === 111) {
			p.fmt.integer(v, new $Uint64(0, 8), true, "0123456789abcdef");
		} else if (_ref === 113) {
			if ((0 < v.$high || (0 === v.$high && 0 <= v.$low)) && (v.$high < 0 || (v.$high === 0 && v.$low <= 1114111))) {
				p.fmt.fmt_qc(v);
			} else {
				p.badVerb(verb);
			}
		} else if (_ref === 120) {
			p.fmt.integer(v, new $Uint64(0, 16), true, "0123456789abcdef");
		} else if (_ref === 85) {
			p.fmtUnicode(v);
		} else if (_ref === 88) {
			p.fmt.integer(v, new $Uint64(0, 16), true, "0123456789ABCDEF");
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtInt64 = function(v, verb) { return this.$val.fmtInt64(v, verb); };
	pp.Ptr.prototype.fmt0x64 = function(v, leading0x) {
		var p, sharp;
		p = this;
		sharp = p.fmt.sharp;
		p.fmt.sharp = leading0x;
		p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 16), false, "0123456789abcdef");
		p.fmt.sharp = sharp;
	};
	pp.prototype.fmt0x64 = function(v, leading0x) { return this.$val.fmt0x64(v, leading0x); };
	pp.Ptr.prototype.fmtUnicode = function(v) {
		var p, precPresent, sharp, prec;
		p = this;
		precPresent = p.fmt.precPresent;
		sharp = p.fmt.sharp;
		p.fmt.sharp = false;
		prec = p.fmt.prec;
		if (!precPresent) {
			p.fmt.prec = 4;
			p.fmt.precPresent = true;
		}
		p.fmt.unicode = true;
		p.fmt.uniQuote = sharp;
		p.fmt.integer(v, new $Uint64(0, 16), false, "0123456789ABCDEF");
		p.fmt.unicode = false;
		p.fmt.uniQuote = false;
		p.fmt.prec = prec;
		p.fmt.precPresent = precPresent;
		p.fmt.sharp = sharp;
	};
	pp.prototype.fmtUnicode = function(v) { return this.$val.fmtUnicode(v); };
	pp.Ptr.prototype.fmtUint64 = function(v, verb, goSyntax) {
		var p, _ref;
		p = this;
		_ref = verb;
		if (_ref === 98) {
			p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 2), false, "0123456789abcdef");
		} else if (_ref === 99) {
			p.fmtC(new $Int64(v.$high, v.$low));
		} else if (_ref === 100) {
			p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 10), false, "0123456789abcdef");
		} else if (_ref === 118) {
			if (goSyntax) {
				p.fmt0x64(v, true);
			} else {
				p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 10), false, "0123456789abcdef");
			}
		} else if (_ref === 111) {
			p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 8), false, "0123456789abcdef");
		} else if (_ref === 113) {
			if ((0 < v.$high || (0 === v.$high && 0 <= v.$low)) && (v.$high < 0 || (v.$high === 0 && v.$low <= 1114111))) {
				p.fmt.fmt_qc(new $Int64(v.$high, v.$low));
			} else {
				p.badVerb(verb);
			}
		} else if (_ref === 120) {
			p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 16), false, "0123456789abcdef");
		} else if (_ref === 88) {
			p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 16), false, "0123456789ABCDEF");
		} else if (_ref === 85) {
			p.fmtUnicode(new $Int64(v.$high, v.$low));
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtUint64 = function(v, verb, goSyntax) { return this.$val.fmtUint64(v, verb, goSyntax); };
	pp.Ptr.prototype.fmtFloat32 = function(v, verb) {
		var p, _ref;
		p = this;
		_ref = verb;
		if (_ref === 98) {
			p.fmt.fmt_fb32(v);
		} else if (_ref === 101) {
			p.fmt.fmt_e32(v);
		} else if (_ref === 69) {
			p.fmt.fmt_E32(v);
		} else if (_ref === 102 || _ref === 70) {
			p.fmt.fmt_f32(v);
		} else if (_ref === 103 || _ref === 118) {
			p.fmt.fmt_g32(v);
		} else if (_ref === 71) {
			p.fmt.fmt_G32(v);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtFloat32 = function(v, verb) { return this.$val.fmtFloat32(v, verb); };
	pp.Ptr.prototype.fmtFloat64 = function(v, verb) {
		var p, _ref;
		p = this;
		_ref = verb;
		if (_ref === 98) {
			p.fmt.fmt_fb64(v);
		} else if (_ref === 101) {
			p.fmt.fmt_e64(v);
		} else if (_ref === 69) {
			p.fmt.fmt_E64(v);
		} else if (_ref === 102 || _ref === 70) {
			p.fmt.fmt_f64(v);
		} else if (_ref === 103 || _ref === 118) {
			p.fmt.fmt_g64(v);
		} else if (_ref === 71) {
			p.fmt.fmt_G64(v);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtFloat64 = function(v, verb) { return this.$val.fmtFloat64(v, verb); };
	pp.Ptr.prototype.fmtComplex64 = function(v, verb) {
		var p, _ref;
		p = this;
		_ref = verb;
		if (_ref === 98 || _ref === 101 || _ref === 69 || _ref === 102 || _ref === 70 || _ref === 103 || _ref === 71) {
			p.fmt.fmt_c64(v, verb);
		} else if (_ref === 118) {
			p.fmt.fmt_c64(v, 103);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtComplex64 = function(v, verb) { return this.$val.fmtComplex64(v, verb); };
	pp.Ptr.prototype.fmtComplex128 = function(v, verb) {
		var p, _ref;
		p = this;
		_ref = verb;
		if (_ref === 98 || _ref === 101 || _ref === 69 || _ref === 102 || _ref === 70 || _ref === 103 || _ref === 71) {
			p.fmt.fmt_c128(v, verb);
		} else if (_ref === 118) {
			p.fmt.fmt_c128(v, 103);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtComplex128 = function(v, verb) { return this.$val.fmtComplex128(v, verb); };
	pp.Ptr.prototype.fmtString = function(v, verb, goSyntax) {
		var p, _ref;
		p = this;
		_ref = verb;
		if (_ref === 118) {
			if (goSyntax) {
				p.fmt.fmt_q(v);
			} else {
				p.fmt.fmt_s(v);
			}
		} else if (_ref === 115) {
			p.fmt.fmt_s(v);
		} else if (_ref === 120) {
			p.fmt.fmt_sx(v, "0123456789abcdef");
		} else if (_ref === 88) {
			p.fmt.fmt_sx(v, "0123456789ABCDEF");
		} else if (_ref === 113) {
			p.fmt.fmt_q(v);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtString = function(v, verb, goSyntax) { return this.$val.fmtString(v, verb, goSyntax); };
	pp.Ptr.prototype.fmtBytes = function(v, verb, goSyntax, typ, depth) {
		var p, _ref, _i, i, c, _ref$1;
		p = this;
		if ((verb === 118) || (verb === 100)) {
			if (goSyntax) {
				if (v === ($sliceType($Uint8)).nil) {
					if ($interfaceIsEqual(typ, $ifaceNil)) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString("[]byte(nil)");
					} else {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(typ.String());
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilParenBytes);
					}
					return;
				}
				if ($interfaceIsEqual(typ, $ifaceNil)) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(bytesBytes);
				} else {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(typ.String());
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(123);
				}
			} else {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(91);
			}
			_ref = v;
			_i = 0;
			while (_i < _ref.$length) {
				i = _i;
				c = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
				if (i > 0) {
					if (goSyntax) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
					} else {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
					}
				}
				p.printArg(new $Uint8(c), 118, p.fmt.plus, goSyntax, depth + 1 >> 0);
				_i++;
			}
			if (goSyntax) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(125);
			} else {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(93);
			}
			return;
		}
		_ref$1 = verb;
		if (_ref$1 === 115) {
			p.fmt.fmt_s($bytesToString(v));
		} else if (_ref$1 === 120) {
			p.fmt.fmt_bx(v, "0123456789abcdef");
		} else if (_ref$1 === 88) {
			p.fmt.fmt_bx(v, "0123456789ABCDEF");
		} else if (_ref$1 === 113) {
			p.fmt.fmt_q($bytesToString(v));
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtBytes = function(v, verb, goSyntax, typ, depth) { return this.$val.fmtBytes(v, verb, goSyntax, typ, depth); };
	pp.Ptr.prototype.fmtPointer = function(value, verb, goSyntax) {
		var p, use0x64, _ref, u, _ref$1;
		p = this;
		use0x64 = true;
		_ref = verb;
		if (_ref === 112 || _ref === 118) {
		} else if (_ref === 98 || _ref === 100 || _ref === 111 || _ref === 120 || _ref === 88) {
			use0x64 = false;
		} else {
			p.badVerb(verb);
			return;
		}
		u = 0;
		_ref$1 = value.Kind();
		if (_ref$1 === 18 || _ref$1 === 19 || _ref$1 === 21 || _ref$1 === 22 || _ref$1 === 23 || _ref$1 === 26) {
			u = value.Pointer();
		} else {
			p.badVerb(verb);
			return;
		}
		if (goSyntax) {
			p.add(40);
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(value.Type().String());
			p.add(41);
			p.add(40);
			if (u === 0) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilBytes);
			} else {
				p.fmt0x64(new $Uint64(0, u.constructor === Number ? u : 1), true);
			}
			p.add(41);
		} else if ((verb === 118) && (u === 0)) {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
		} else {
			if (use0x64) {
				p.fmt0x64(new $Uint64(0, u.constructor === Number ? u : 1), !p.fmt.sharp);
			} else {
				p.fmtUint64(new $Uint64(0, u.constructor === Number ? u : 1), verb, false);
			}
		}
	};
	pp.prototype.fmtPointer = function(value, verb, goSyntax) { return this.$val.fmtPointer(value, verb, goSyntax); };
	pp.Ptr.prototype.catchPanic = function(arg, verb) {
		var p, err, v;
		p = this;
		err = $recover();
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			v = new reflect.Value.Ptr(); $copy(v, reflect.ValueOf(arg), reflect.Value);
			if ((v.Kind() === 22) && v.IsNil()) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
				return;
			}
			if (p.panicking) {
				$panic(err);
			}
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(percentBangBytes);
			p.add(verb);
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(panicBytes);
			p.panicking = true;
			p.printArg(err, 118, false, false, 0);
			p.panicking = false;
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(41);
		}
	};
	pp.prototype.catchPanic = function(arg, verb) { return this.$val.catchPanic(arg, verb); };
	pp.Ptr.prototype.handleMethods = function(verb, plus, goSyntax, depth) {
		var wasString = false, handled = false, $deferred = [], $err = null, p, _tuple, formatter, ok, _tuple$1, stringer, ok$1, _ref, v, _ref$1;
		/* */ try { $deferFrames.push($deferred);
		p = this;
		if (p.erroring) {
			return [wasString, handled];
		}
		_tuple = $assertType(p.arg, Formatter, true); formatter = _tuple[0]; ok = _tuple[1];
		if (ok) {
			handled = true;
			wasString = false;
			$deferred.push([$methodVal(p, "catchPanic"), [p.arg, verb]]);
			formatter.Format(p, verb);
			return [wasString, handled];
		}
		if (plus) {
			p.fmt.plus = false;
		}
		if (goSyntax) {
			p.fmt.sharp = false;
			_tuple$1 = $assertType(p.arg, GoStringer, true); stringer = _tuple$1[0]; ok$1 = _tuple$1[1];
			if (ok$1) {
				wasString = false;
				handled = true;
				$deferred.push([$methodVal(p, "catchPanic"), [p.arg, verb]]);
				p.fmtString(stringer.GoString(), 115, false);
				return [wasString, handled];
			}
		} else {
			_ref = verb;
			if (_ref === 118 || _ref === 115 || _ref === 120 || _ref === 88 || _ref === 113) {
				_ref$1 = p.arg;
				if ($assertType(_ref$1, $error, true)[1]) {
					v = _ref$1;
					wasString = false;
					handled = true;
					$deferred.push([$methodVal(p, "catchPanic"), [p.arg, verb]]);
					p.printArg(new $String(v.Error()), verb, plus, false, depth);
					return [wasString, handled];
				} else if ($assertType(_ref$1, Stringer, true)[1]) {
					v = _ref$1;
					wasString = false;
					handled = true;
					$deferred.push([$methodVal(p, "catchPanic"), [p.arg, verb]]);
					p.printArg(new $String(v.String()), verb, plus, false, depth);
					return [wasString, handled];
				}
			}
		}
		handled = false;
		return [wasString, handled];
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return [wasString, handled]; }
	};
	pp.prototype.handleMethods = function(verb, plus, goSyntax, depth) { return this.$val.handleMethods(verb, plus, goSyntax, depth); };
	pp.Ptr.prototype.printArg = function(arg, verb, plus, goSyntax, depth) {
		var wasString = false, p, _ref, oldPlus, oldSharp, f, _ref$1, _tuple, isString, handled;
		p = this;
		p.arg = arg;
		$copy(p.value, new reflect.Value.Ptr(($ptrType(reflect.rtype)).nil, 0, 0, 0), reflect.Value);
		if ($interfaceIsEqual(arg, $ifaceNil)) {
			if ((verb === 84) || (verb === 118)) {
				p.fmt.pad(nilAngleBytes);
			} else {
				p.badVerb(verb);
			}
			wasString = false;
			return wasString;
		}
		_ref = verb;
		if (_ref === 84) {
			p.printArg(new $String(reflect.TypeOf(arg).String()), 115, false, false, 0);
			wasString = false;
			return wasString;
		} else if (_ref === 112) {
			p.fmtPointer($clone(reflect.ValueOf(arg), reflect.Value), verb, goSyntax);
			wasString = false;
			return wasString;
		}
		oldPlus = p.fmt.plus;
		oldSharp = p.fmt.sharp;
		if (plus) {
			p.fmt.plus = false;
		}
		if (goSyntax) {
			p.fmt.sharp = false;
		}
		_ref$1 = arg;
		if ($assertType(_ref$1, $Bool, true)[1]) {
			f = _ref$1.$val;
			p.fmtBool(f, verb);
		} else if ($assertType(_ref$1, $Float32, true)[1]) {
			f = _ref$1.$val;
			p.fmtFloat32(f, verb);
		} else if ($assertType(_ref$1, $Float64, true)[1]) {
			f = _ref$1.$val;
			p.fmtFloat64(f, verb);
		} else if ($assertType(_ref$1, $Complex64, true)[1]) {
			f = _ref$1.$val;
			p.fmtComplex64(f, verb);
		} else if ($assertType(_ref$1, $Complex128, true)[1]) {
			f = _ref$1.$val;
			p.fmtComplex128(f, verb);
		} else if ($assertType(_ref$1, $Int, true)[1]) {
			f = _ref$1.$val;
			p.fmtInt64(new $Int64(0, f), verb);
		} else if ($assertType(_ref$1, $Int8, true)[1]) {
			f = _ref$1.$val;
			p.fmtInt64(new $Int64(0, f), verb);
		} else if ($assertType(_ref$1, $Int16, true)[1]) {
			f = _ref$1.$val;
			p.fmtInt64(new $Int64(0, f), verb);
		} else if ($assertType(_ref$1, $Int32, true)[1]) {
			f = _ref$1.$val;
			p.fmtInt64(new $Int64(0, f), verb);
		} else if ($assertType(_ref$1, $Int64, true)[1]) {
			f = _ref$1.$val;
			p.fmtInt64(f, verb);
		} else if ($assertType(_ref$1, $Uint, true)[1]) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f), verb, goSyntax);
		} else if ($assertType(_ref$1, $Uint8, true)[1]) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f), verb, goSyntax);
		} else if ($assertType(_ref$1, $Uint16, true)[1]) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f), verb, goSyntax);
		} else if ($assertType(_ref$1, $Uint32, true)[1]) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f), verb, goSyntax);
		} else if ($assertType(_ref$1, $Uint64, true)[1]) {
			f = _ref$1.$val;
			p.fmtUint64(f, verb, goSyntax);
		} else if ($assertType(_ref$1, $Uintptr, true)[1]) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f.constructor === Number ? f : 1), verb, goSyntax);
		} else if ($assertType(_ref$1, $String, true)[1]) {
			f = _ref$1.$val;
			p.fmtString(f, verb, goSyntax);
			wasString = (verb === 115) || (verb === 118);
		} else if ($assertType(_ref$1, ($sliceType($Uint8)), true)[1]) {
			f = _ref$1.$val;
			p.fmtBytes(f, verb, goSyntax, $ifaceNil, depth);
			wasString = verb === 115;
		} else {
			f = _ref$1;
			p.fmt.plus = oldPlus;
			p.fmt.sharp = oldSharp;
			_tuple = p.handleMethods(verb, plus, goSyntax, depth); isString = _tuple[0]; handled = _tuple[1];
			if (handled) {
				wasString = isString;
				return wasString;
			}
			wasString = p.printReflectValue($clone(reflect.ValueOf(arg), reflect.Value), verb, plus, goSyntax, depth);
			return wasString;
		}
		p.arg = $ifaceNil;
		return wasString;
	};
	pp.prototype.printArg = function(arg, verb, plus, goSyntax, depth) { return this.$val.printArg(arg, verb, plus, goSyntax, depth); };
	pp.Ptr.prototype.printValue = function(value, verb, plus, goSyntax, depth) {
		var wasString = false, p, _ref, _tuple, isString, handled;
		p = this;
		if (!value.IsValid()) {
			if ((verb === 84) || (verb === 118)) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
			} else {
				p.badVerb(verb);
			}
			wasString = false;
			return wasString;
		}
		_ref = verb;
		if (_ref === 84) {
			p.printArg(new $String(value.Type().String()), 115, false, false, 0);
			wasString = false;
			return wasString;
		} else if (_ref === 112) {
			p.fmtPointer($clone(value, reflect.Value), verb, goSyntax);
			wasString = false;
			return wasString;
		}
		p.arg = $ifaceNil;
		if (value.CanInterface()) {
			p.arg = value.Interface();
		}
		_tuple = p.handleMethods(verb, plus, goSyntax, depth); isString = _tuple[0]; handled = _tuple[1];
		if (handled) {
			wasString = isString;
			return wasString;
		}
		wasString = p.printReflectValue($clone(value, reflect.Value), verb, plus, goSyntax, depth);
		return wasString;
	};
	pp.prototype.printValue = function(value, verb, plus, goSyntax, depth) { return this.$val.printValue(value, verb, plus, goSyntax, depth); };
	pp.Ptr.prototype.printReflectValue = function(value, verb, plus, goSyntax, depth) {
		var wasString = false, p, oldValue, f, _ref, x, keys, _ref$1, _i, i, key, v, t, i$1, f$1, value$1, typ, bytes, _ref$2, _i$1, i$2, i$3, v$1, a, _ref$3;
		p = this;
		oldValue = new reflect.Value.Ptr(); $copy(oldValue, p.value, reflect.Value);
		$copy(p.value, value, reflect.Value);
		f = new reflect.Value.Ptr(); $copy(f, value, reflect.Value);
		_ref = f.Kind();
		BigSwitch:
		switch (0) { default: if (_ref === 1) {
			p.fmtBool(f.Bool(), verb);
		} else if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			p.fmtInt64(f.Int(), verb);
		} else if (_ref === 7 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11 || _ref === 12) {
			p.fmtUint64(f.Uint(), verb, goSyntax);
		} else if (_ref === 13 || _ref === 14) {
			if (f.Type().Size() === 4) {
				p.fmtFloat32(f.Float(), verb);
			} else {
				p.fmtFloat64(f.Float(), verb);
			}
		} else if (_ref === 15 || _ref === 16) {
			if (f.Type().Size() === 8) {
				p.fmtComplex64((x = f.Complex(), new $Complex64(x.$real, x.$imag)), verb);
			} else {
				p.fmtComplex128(f.Complex(), verb);
			}
		} else if (_ref === 24) {
			p.fmtString(f.String(), verb, goSyntax);
		} else if (_ref === 21) {
			if (goSyntax) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(f.Type().String());
				if (f.IsNil()) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString("(nil)");
					break;
				}
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(123);
			} else {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(mapBytes);
			}
			keys = f.MapKeys();
			_ref$1 = keys;
			_i = 0;
			while (_i < _ref$1.$length) {
				i = _i;
				key = new reflect.Value.Ptr(); $copy(key, ((_i < 0 || _i >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i]), reflect.Value);
				if (i > 0) {
					if (goSyntax) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
					} else {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
					}
				}
				p.printValue($clone(key, reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(58);
				p.printValue($clone(f.MapIndex($clone(key, reflect.Value)), reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
				_i++;
			}
			if (goSyntax) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(125);
			} else {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(93);
			}
		} else if (_ref === 25) {
			if (goSyntax) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(value.Type().String());
			}
			p.add(123);
			v = new reflect.Value.Ptr(); $copy(v, f, reflect.Value);
			t = v.Type();
			i$1 = 0;
			while (i$1 < v.NumField()) {
				if (i$1 > 0) {
					if (goSyntax) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
					} else {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
					}
				}
				if (plus || goSyntax) {
					f$1 = new reflect.StructField.Ptr(); $copy(f$1, t.Field(i$1), reflect.StructField);
					if (!(f$1.Name === "")) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(f$1.Name);
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(58);
					}
				}
				p.printValue($clone(getField($clone(v, reflect.Value), i$1), reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
				i$1 = i$1 + (1) >> 0;
			}
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(125);
		} else if (_ref === 20) {
			value$1 = new reflect.Value.Ptr(); $copy(value$1, f.Elem(), reflect.Value);
			if (!value$1.IsValid()) {
				if (goSyntax) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(f.Type().String());
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilParenBytes);
				} else {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
				}
			} else {
				wasString = p.printValue($clone(value$1, reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
			}
		} else if (_ref === 17 || _ref === 23) {
			typ = f.Type();
			if (typ.Elem().Kind() === 8) {
				bytes = ($sliceType($Uint8)).nil;
				if (f.Kind() === 23) {
					bytes = f.Bytes();
				} else if (f.CanAddr()) {
					bytes = f.Slice(0, f.Len()).Bytes();
				} else {
					bytes = ($sliceType($Uint8)).make(f.Len());
					_ref$2 = bytes;
					_i$1 = 0;
					while (_i$1 < _ref$2.$length) {
						i$2 = _i$1;
						(i$2 < 0 || i$2 >= bytes.$length) ? $throwRuntimeError("index out of range") : bytes.$array[bytes.$offset + i$2] = (f.Index(i$2).Uint().$low << 24 >>> 24);
						_i$1++;
					}
				}
				p.fmtBytes(bytes, verb, goSyntax, typ, depth);
				wasString = verb === 115;
				break;
			}
			if (goSyntax) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(value.Type().String());
				if ((f.Kind() === 23) && f.IsNil()) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString("(nil)");
					break;
				}
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(123);
			} else {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(91);
			}
			i$3 = 0;
			while (i$3 < f.Len()) {
				if (i$3 > 0) {
					if (goSyntax) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
					} else {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
					}
				}
				p.printValue($clone(f.Index(i$3), reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
				i$3 = i$3 + (1) >> 0;
			}
			if (goSyntax) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(125);
			} else {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(93);
			}
		} else if (_ref === 22) {
			v$1 = f.Pointer();
			if (!((v$1 === 0)) && (depth === 0)) {
				a = new reflect.Value.Ptr(); $copy(a, f.Elem(), reflect.Value);
				_ref$3 = a.Kind();
				if (_ref$3 === 17 || _ref$3 === 23) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(38);
					p.printValue($clone(a, reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
					break BigSwitch;
				} else if (_ref$3 === 25) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(38);
					p.printValue($clone(a, reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
					break BigSwitch;
				}
			}
			p.fmtPointer($clone(value, reflect.Value), verb, goSyntax);
		} else if (_ref === 18 || _ref === 19 || _ref === 26) {
			p.fmtPointer($clone(value, reflect.Value), verb, goSyntax);
		} else {
			p.unknownType(new f.constructor.Struct(f));
		} }
		$copy(p.value, oldValue, reflect.Value);
		wasString = wasString;
		return wasString;
	};
	pp.prototype.printReflectValue = function(value, verb, plus, goSyntax, depth) { return this.$val.printReflectValue(value, verb, plus, goSyntax, depth); };
	intFromArg = function(a, argNum) {
		var num = 0, isInt = false, newArgNum = 0, _tuple;
		newArgNum = argNum;
		if (argNum < a.$length) {
			_tuple = $assertType(((argNum < 0 || argNum >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + argNum]), $Int, true); num = _tuple[0]; isInt = _tuple[1];
			newArgNum = argNum + 1 >> 0;
		}
		return [num, isInt, newArgNum];
	};
	parseArgNumber = function(format) {
		var index = 0, wid = 0, ok = false, i, _tuple, width, ok$1, newi, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8;
		i = 1;
		while (i < format.length) {
			if (format.charCodeAt(i) === 93) {
				_tuple = parsenum(format, 1, i); width = _tuple[0]; ok$1 = _tuple[1]; newi = _tuple[2];
				if (!ok$1 || !((newi === i))) {
					_tmp = 0; _tmp$1 = i + 1 >> 0; _tmp$2 = false; index = _tmp; wid = _tmp$1; ok = _tmp$2;
					return [index, wid, ok];
				}
				_tmp$3 = width - 1 >> 0; _tmp$4 = i + 1 >> 0; _tmp$5 = true; index = _tmp$3; wid = _tmp$4; ok = _tmp$5;
				return [index, wid, ok];
			}
			i = i + (1) >> 0;
		}
		_tmp$6 = 0; _tmp$7 = 1; _tmp$8 = false; index = _tmp$6; wid = _tmp$7; ok = _tmp$8;
		return [index, wid, ok];
	};
	pp.Ptr.prototype.argNumber = function(argNum, format, i, numArgs) {
		var newArgNum = 0, newi = 0, found = false, p, _tmp, _tmp$1, _tmp$2, _tuple, index, wid, ok, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8;
		p = this;
		if (format.length <= i || !((format.charCodeAt(i) === 91))) {
			_tmp = argNum; _tmp$1 = i; _tmp$2 = false; newArgNum = _tmp; newi = _tmp$1; found = _tmp$2;
			return [newArgNum, newi, found];
		}
		p.reordered = true;
		_tuple = parseArgNumber(format.substring(i)); index = _tuple[0]; wid = _tuple[1]; ok = _tuple[2];
		if (ok && 0 <= index && index < numArgs) {
			_tmp$3 = index; _tmp$4 = i + wid >> 0; _tmp$5 = true; newArgNum = _tmp$3; newi = _tmp$4; found = _tmp$5;
			return [newArgNum, newi, found];
		}
		p.goodArgNum = false;
		_tmp$6 = argNum; _tmp$7 = i + wid >> 0; _tmp$8 = true; newArgNum = _tmp$6; newi = _tmp$7; found = _tmp$8;
		return [newArgNum, newi, found];
	};
	pp.prototype.argNumber = function(argNum, format, i, numArgs) { return this.$val.argNumber(argNum, format, i, numArgs); };
	pp.Ptr.prototype.doPrintf = function(format, a) {
		var p, end, argNum, afterIndex, i, lasti, _ref, _tuple, _tuple$1, _tuple$2, _tuple$3, _tuple$4, _tuple$5, _tuple$6, _tuple$7, c, w, arg, goSyntax, plus, arg$1;
		p = this;
		end = format.length;
		argNum = 0;
		afterIndex = false;
		p.reordered = false;
		i = 0;
		while (i < end) {
			p.goodArgNum = true;
			lasti = i;
			while (i < end && !((format.charCodeAt(i) === 37))) {
				i = i + (1) >> 0;
			}
			if (i > lasti) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(format.substring(lasti, i));
			}
			if (i >= end) {
				break;
			}
			i = i + (1) >> 0;
			p.fmt.clearflags();
			F:
			while (i < end) {
				_ref = format.charCodeAt(i);
				if (_ref === 35) {
					p.fmt.sharp = true;
				} else if (_ref === 48) {
					p.fmt.zero = true;
				} else if (_ref === 43) {
					p.fmt.plus = true;
				} else if (_ref === 45) {
					p.fmt.minus = true;
				} else if (_ref === 32) {
					p.fmt.space = true;
				} else {
					break F;
				}
				i = i + (1) >> 0;
			}
			_tuple = p.argNumber(argNum, format, i, a.$length); argNum = _tuple[0]; i = _tuple[1]; afterIndex = _tuple[2];
			if (i < end && (format.charCodeAt(i) === 42)) {
				i = i + (1) >> 0;
				_tuple$1 = intFromArg(a, argNum); p.fmt.wid = _tuple$1[0]; p.fmt.widPresent = _tuple$1[1]; argNum = _tuple$1[2];
				if (!p.fmt.widPresent) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(badWidthBytes);
				}
				afterIndex = false;
			} else {
				_tuple$2 = parsenum(format, i, end); p.fmt.wid = _tuple$2[0]; p.fmt.widPresent = _tuple$2[1]; i = _tuple$2[2];
				if (afterIndex && p.fmt.widPresent) {
					p.goodArgNum = false;
				}
			}
			if ((i + 1 >> 0) < end && (format.charCodeAt(i) === 46)) {
				i = i + (1) >> 0;
				if (afterIndex) {
					p.goodArgNum = false;
				}
				_tuple$3 = p.argNumber(argNum, format, i, a.$length); argNum = _tuple$3[0]; i = _tuple$3[1]; afterIndex = _tuple$3[2];
				if (format.charCodeAt(i) === 42) {
					i = i + (1) >> 0;
					_tuple$4 = intFromArg(a, argNum); p.fmt.prec = _tuple$4[0]; p.fmt.precPresent = _tuple$4[1]; argNum = _tuple$4[2];
					if (!p.fmt.precPresent) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(badPrecBytes);
					}
					afterIndex = false;
				} else {
					_tuple$5 = parsenum(format, i, end); p.fmt.prec = _tuple$5[0]; p.fmt.precPresent = _tuple$5[1]; i = _tuple$5[2];
					if (!p.fmt.precPresent) {
						p.fmt.prec = 0;
						p.fmt.precPresent = true;
					}
				}
			}
			if (!afterIndex) {
				_tuple$6 = p.argNumber(argNum, format, i, a.$length); argNum = _tuple$6[0]; i = _tuple$6[1]; afterIndex = _tuple$6[2];
			}
			if (i >= end) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(noVerbBytes);
				continue;
			}
			_tuple$7 = utf8.DecodeRuneInString(format.substring(i)); c = _tuple$7[0]; w = _tuple$7[1];
			i = i + (w) >> 0;
			if (c === 37) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(37);
				continue;
			}
			if (!p.goodArgNum) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(percentBangBytes);
				p.add(c);
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(badIndexBytes);
				continue;
			} else if (argNum >= a.$length) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(percentBangBytes);
				p.add(c);
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(missingBytes);
				continue;
			}
			arg = ((argNum < 0 || argNum >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + argNum]);
			argNum = argNum + (1) >> 0;
			goSyntax = (c === 118) && p.fmt.sharp;
			plus = (c === 118) && p.fmt.plus;
			p.printArg(arg, c, plus, goSyntax, 0);
		}
		if (!p.reordered && argNum < a.$length) {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(extraBytes);
			while (argNum < a.$length) {
				arg$1 = ((argNum < 0 || argNum >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + argNum]);
				if (!($interfaceIsEqual(arg$1, $ifaceNil))) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(reflect.TypeOf(arg$1).String());
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(61);
				}
				p.printArg(arg$1, 118, false, false, 0);
				if ((argNum + 1 >> 0) < a.$length) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
				}
				argNum = argNum + (1) >> 0;
			}
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(41);
		}
	};
	pp.prototype.doPrintf = function(format, a) { return this.$val.doPrintf(format, a); };
	pp.Ptr.prototype.doPrint = function(a, addspace, addnewline) {
		var p, prevString, argNum, arg, isString;
		p = this;
		prevString = false;
		argNum = 0;
		while (argNum < a.$length) {
			p.fmt.clearflags();
			arg = ((argNum < 0 || argNum >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + argNum]);
			if (argNum > 0) {
				isString = !($interfaceIsEqual(arg, $ifaceNil)) && (reflect.TypeOf(arg).Kind() === 24);
				if (addspace || !isString && !prevString) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
				}
			}
			prevString = p.printArg(arg, 118, false, false, 0);
			argNum = argNum + (1) >> 0;
		}
		if (addnewline) {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(10);
		}
	};
	pp.prototype.doPrint = function(a, addspace, addnewline) { return this.$val.doPrint(a, addspace, addnewline); };
	ss.Ptr.prototype.Read = function(buf) {
		var n = 0, err = $ifaceNil, s, _tmp, _tmp$1;
		s = this;
		_tmp = 0; _tmp$1 = errors.New("ScanState's Read should not be called. Use ReadRune"); n = _tmp; err = _tmp$1;
		return [n, err];
	};
	ss.prototype.Read = function(buf) { return this.$val.Read(buf); };
	ss.Ptr.prototype.ReadRune = function() {
		var r = 0, size = 0, err = $ifaceNil, s, _tuple;
		s = this;
		if (s.peekRune >= 0) {
			s.count = s.count + (1) >> 0;
			r = s.peekRune;
			size = utf8.RuneLen(r);
			s.prevRune = r;
			s.peekRune = -1;
			return [r, size, err];
		}
		if (s.atEOF || s.ssave.nlIsEnd && (s.prevRune === 10) || s.count >= s.ssave.argLimit) {
			err = io.EOF;
			return [r, size, err];
		}
		_tuple = s.rr.ReadRune(); r = _tuple[0]; size = _tuple[1]; err = _tuple[2];
		if ($interfaceIsEqual(err, $ifaceNil)) {
			s.count = s.count + (1) >> 0;
			s.prevRune = r;
		} else if ($interfaceIsEqual(err, io.EOF)) {
			s.atEOF = true;
		}
		return [r, size, err];
	};
	ss.prototype.ReadRune = function() { return this.$val.ReadRune(); };
	ss.Ptr.prototype.Width = function() {
		var wid = 0, ok = false, s, _tmp, _tmp$1, _tmp$2, _tmp$3;
		s = this;
		if (s.ssave.maxWid === 1073741824) {
			_tmp = 0; _tmp$1 = false; wid = _tmp; ok = _tmp$1;
			return [wid, ok];
		}
		_tmp$2 = s.ssave.maxWid; _tmp$3 = true; wid = _tmp$2; ok = _tmp$3;
		return [wid, ok];
	};
	ss.prototype.Width = function() { return this.$val.Width(); };
	ss.Ptr.prototype.getRune = function() {
		var r = 0, s, _tuple, err;
		s = this;
		_tuple = s.ReadRune(); r = _tuple[0]; err = _tuple[2];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			if ($interfaceIsEqual(err, io.EOF)) {
				r = -1;
				return r;
			}
			s.error(err);
		}
		return r;
	};
	ss.prototype.getRune = function() { return this.$val.getRune(); };
	ss.Ptr.prototype.UnreadRune = function() {
		var s, _tuple, u, ok;
		s = this;
		_tuple = $assertType(s.rr, runeUnreader, true); u = _tuple[0]; ok = _tuple[1];
		if (ok) {
			u.UnreadRune();
		} else {
			s.peekRune = s.prevRune;
		}
		s.prevRune = -1;
		s.count = s.count - (1) >> 0;
		return $ifaceNil;
	};
	ss.prototype.UnreadRune = function() { return this.$val.UnreadRune(); };
	ss.Ptr.prototype.error = function(err) {
		var s, x;
		s = this;
		$panic((x = new scanError.Ptr(err), new x.constructor.Struct(x)));
	};
	ss.prototype.error = function(err) { return this.$val.error(err); };
	ss.Ptr.prototype.errorString = function(err) {
		var s, x;
		s = this;
		$panic((x = new scanError.Ptr(errors.New(err)), new x.constructor.Struct(x)));
	};
	ss.prototype.errorString = function(err) { return this.$val.errorString(err); };
	ss.Ptr.prototype.Token = function(skipSpace, f) {
		var tok = ($sliceType($Uint8)).nil, err = $ifaceNil, $deferred = [], $err = null, s;
		/* */ try { $deferFrames.push($deferred);
		s = this;
		$deferred.push([(function() {
			var e, _tuple, se, ok;
			e = $recover();
			if (!($interfaceIsEqual(e, $ifaceNil))) {
				_tuple = $assertType(e, scanError, true); se = new scanError.Ptr(); $copy(se, _tuple[0], scanError); ok = _tuple[1];
				if (ok) {
					err = se.err;
				} else {
					$panic(e);
				}
			}
		}), []]);
		if (f === $throwNilPointerError) {
			f = notSpace;
		}
		s.buf = $subslice(s.buf, 0, 0);
		tok = s.token(skipSpace, f);
		return [tok, err];
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return [tok, err]; }
	};
	ss.prototype.Token = function(skipSpace, f) { return this.$val.Token(skipSpace, f); };
	isSpace = function(r) {
		var rx, _ref, _i, rng;
		if (r >= 65536) {
			return false;
		}
		rx = (r << 16 >>> 16);
		_ref = space;
		_i = 0;
		while (_i < _ref.$length) {
			rng = ($arrayType($Uint16, 2)).zero(); $copy(rng, ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), ($arrayType($Uint16, 2)));
			if (rx < rng[0]) {
				return false;
			}
			if (rx <= rng[1]) {
				return true;
			}
			_i++;
		}
		return false;
	};
	notSpace = function(r) {
		return !isSpace(r);
	};
	ss.Ptr.prototype.SkipSpace = function() {
		var s;
		s = this;
		s.skipSpace(false);
	};
	ss.prototype.SkipSpace = function() { return this.$val.SkipSpace(); };
	ss.Ptr.prototype.free = function(old) {
		var s;
		s = this;
		if (old.validSave) {
			$copy(s.ssave, old, ssave);
			return;
		}
		if (s.buf.$capacity > 1024) {
			return;
		}
		s.buf = $subslice(s.buf, 0, 0);
		s.rr = $ifaceNil;
		ssFree.Put(s);
	};
	ss.prototype.free = function(old) { return this.$val.free(old); };
	ss.Ptr.prototype.skipSpace = function(stopAtNewline) {
		var s, r;
		s = this;
		while (true) {
			r = s.getRune();
			if (r === -1) {
				return;
			}
			if ((r === 13) && s.peek("\n")) {
				continue;
			}
			if (r === 10) {
				if (stopAtNewline) {
					break;
				}
				if (s.ssave.nlIsSpace) {
					continue;
				}
				s.errorString("unexpected newline");
				return;
			}
			if (!isSpace(r)) {
				s.UnreadRune();
				break;
			}
		}
	};
	ss.prototype.skipSpace = function(stopAtNewline) { return this.$val.skipSpace(stopAtNewline); };
	ss.Ptr.prototype.token = function(skipSpace, f) {
		var s, r, x;
		s = this;
		if (skipSpace) {
			s.skipSpace(false);
		}
		while (true) {
			r = s.getRune();
			if (r === -1) {
				break;
			}
			if (!f(r)) {
				s.UnreadRune();
				break;
			}
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, s).WriteRune(r);
		}
		return (x = s.buf, $subslice(new ($sliceType($Uint8))(x.$array), x.$offset, x.$offset + x.$length));
	};
	ss.prototype.token = function(skipSpace, f) { return this.$val.token(skipSpace, f); };
	indexRune = function(s, r) {
		var _ref, _i, _rune, i, c;
		_ref = s;
		_i = 0;
		while (_i < _ref.length) {
			_rune = $decodeRune(_ref, _i);
			i = _i;
			c = _rune[0];
			if (c === r) {
				return i;
			}
			_i += _rune[1];
		}
		return -1;
	};
	ss.Ptr.prototype.peek = function(ok) {
		var s, r;
		s = this;
		r = s.getRune();
		if (!((r === -1))) {
			s.UnreadRune();
		}
		return indexRune(ok, r) >= 0;
	};
	ss.prototype.peek = function(ok) { return this.$val.peek(ok); };
	$pkg.$init = function() {
		($ptrType(fmt)).methods = [["clearflags", "clearflags", "fmt", $funcType([], [], false), -1], ["computePadding", "computePadding", "fmt", $funcType([$Int], [($sliceType($Uint8)), $Int, $Int], false), -1], ["fmt_E32", "fmt_E32", "fmt", $funcType([$Float32], [], false), -1], ["fmt_E64", "fmt_E64", "fmt", $funcType([$Float64], [], false), -1], ["fmt_G32", "fmt_G32", "fmt", $funcType([$Float32], [], false), -1], ["fmt_G64", "fmt_G64", "fmt", $funcType([$Float64], [], false), -1], ["fmt_boolean", "fmt_boolean", "fmt", $funcType([$Bool], [], false), -1], ["fmt_bx", "fmt_bx", "fmt", $funcType([($sliceType($Uint8)), $String], [], false), -1], ["fmt_c128", "fmt_c128", "fmt", $funcType([$Complex128, $Int32], [], false), -1], ["fmt_c64", "fmt_c64", "fmt", $funcType([$Complex64, $Int32], [], false), -1], ["fmt_complex", "fmt_complex", "fmt", $funcType([$Float64, $Float64, $Int, $Int32], [], false), -1], ["fmt_e32", "fmt_e32", "fmt", $funcType([$Float32], [], false), -1], ["fmt_e64", "fmt_e64", "fmt", $funcType([$Float64], [], false), -1], ["fmt_f32", "fmt_f32", "fmt", $funcType([$Float32], [], false), -1], ["fmt_f64", "fmt_f64", "fmt", $funcType([$Float64], [], false), -1], ["fmt_fb32", "fmt_fb32", "fmt", $funcType([$Float32], [], false), -1], ["fmt_fb64", "fmt_fb64", "fmt", $funcType([$Float64], [], false), -1], ["fmt_g32", "fmt_g32", "fmt", $funcType([$Float32], [], false), -1], ["fmt_g64", "fmt_g64", "fmt", $funcType([$Float64], [], false), -1], ["fmt_q", "fmt_q", "fmt", $funcType([$String], [], false), -1], ["fmt_qc", "fmt_qc", "fmt", $funcType([$Int64], [], false), -1], ["fmt_s", "fmt_s", "fmt", $funcType([$String], [], false), -1], ["fmt_sbx", "fmt_sbx", "fmt", $funcType([$String, ($sliceType($Uint8)), $String], [], false), -1], ["fmt_sx", "fmt_sx", "fmt", $funcType([$String, $String], [], false), -1], ["formatFloat", "formatFloat", "fmt", $funcType([$Float64, $Uint8, $Int, $Int], [], false), -1], ["init", "init", "fmt", $funcType([($ptrType(buffer))], [], false), -1], ["integer", "integer", "fmt", $funcType([$Int64, $Uint64, $Bool, $String], [], false), -1], ["pad", "pad", "fmt", $funcType([($sliceType($Uint8))], [], false), -1], ["padString", "padString", "fmt", $funcType([$String], [], false), -1], ["truncate", "truncate", "fmt", $funcType([$String], [$String], false), -1], ["writePadding", "writePadding", "fmt", $funcType([$Int, ($sliceType($Uint8))], [], false), -1]];
		fmt.init([["intbuf", "intbuf", "fmt", ($arrayType($Uint8, 65)), ""], ["buf", "buf", "fmt", ($ptrType(buffer)), ""], ["wid", "wid", "fmt", $Int, ""], ["prec", "prec", "fmt", $Int, ""], ["widPresent", "widPresent", "fmt", $Bool, ""], ["precPresent", "precPresent", "fmt", $Bool, ""], ["minus", "minus", "fmt", $Bool, ""], ["plus", "plus", "fmt", $Bool, ""], ["sharp", "sharp", "fmt", $Bool, ""], ["space", "space", "fmt", $Bool, ""], ["unicode", "unicode", "fmt", $Bool, ""], ["uniQuote", "uniQuote", "fmt", $Bool, ""], ["zero", "zero", "fmt", $Bool, ""]]);
		State.init([["Flag", "Flag", "", $funcType([$Int], [$Bool], false)], ["Precision", "Precision", "", $funcType([], [$Int, $Bool], false)], ["Width", "Width", "", $funcType([], [$Int, $Bool], false)], ["Write", "Write", "", $funcType([($sliceType($Uint8))], [$Int, $error], false)]]);
		Formatter.init([["Format", "Format", "", $funcType([State, $Int32], [], false)]]);
		Stringer.init([["String", "String", "", $funcType([], [$String], false)]]);
		GoStringer.init([["GoString", "GoString", "", $funcType([], [$String], false)]]);
		($ptrType(buffer)).methods = [["Write", "Write", "", $funcType([($sliceType($Uint8))], [$Int, $error], false), -1], ["WriteByte", "WriteByte", "", $funcType([$Uint8], [$error], false), -1], ["WriteRune", "WriteRune", "", $funcType([$Int32], [$error], false), -1], ["WriteString", "WriteString", "", $funcType([$String], [$Int, $error], false), -1]];
		buffer.init($Uint8);
		($ptrType(pp)).methods = [["Flag", "Flag", "", $funcType([$Int], [$Bool], false), -1], ["Precision", "Precision", "", $funcType([], [$Int, $Bool], false), -1], ["Width", "Width", "", $funcType([], [$Int, $Bool], false), -1], ["Write", "Write", "", $funcType([($sliceType($Uint8))], [$Int, $error], false), -1], ["add", "add", "fmt", $funcType([$Int32], [], false), -1], ["argNumber", "argNumber", "fmt", $funcType([$Int, $String, $Int, $Int], [$Int, $Int, $Bool], false), -1], ["badVerb", "badVerb", "fmt", $funcType([$Int32], [], false), -1], ["catchPanic", "catchPanic", "fmt", $funcType([$emptyInterface, $Int32], [], false), -1], ["doPrint", "doPrint", "fmt", $funcType([($sliceType($emptyInterface)), $Bool, $Bool], [], false), -1], ["doPrintf", "doPrintf", "fmt", $funcType([$String, ($sliceType($emptyInterface))], [], false), -1], ["fmt0x64", "fmt0x64", "fmt", $funcType([$Uint64, $Bool], [], false), -1], ["fmtBool", "fmtBool", "fmt", $funcType([$Bool, $Int32], [], false), -1], ["fmtBytes", "fmtBytes", "fmt", $funcType([($sliceType($Uint8)), $Int32, $Bool, reflect.Type, $Int], [], false), -1], ["fmtC", "fmtC", "fmt", $funcType([$Int64], [], false), -1], ["fmtComplex128", "fmtComplex128", "fmt", $funcType([$Complex128, $Int32], [], false), -1], ["fmtComplex64", "fmtComplex64", "fmt", $funcType([$Complex64, $Int32], [], false), -1], ["fmtFloat32", "fmtFloat32", "fmt", $funcType([$Float32, $Int32], [], false), -1], ["fmtFloat64", "fmtFloat64", "fmt", $funcType([$Float64, $Int32], [], false), -1], ["fmtInt64", "fmtInt64", "fmt", $funcType([$Int64, $Int32], [], false), -1], ["fmtPointer", "fmtPointer", "fmt", $funcType([reflect.Value, $Int32, $Bool], [], false), -1], ["fmtString", "fmtString", "fmt", $funcType([$String, $Int32, $Bool], [], false), -1], ["fmtUint64", "fmtUint64", "fmt", $funcType([$Uint64, $Int32, $Bool], [], false), -1], ["fmtUnicode", "fmtUnicode", "fmt", $funcType([$Int64], [], false), -1], ["free", "free", "fmt", $funcType([], [], false), -1], ["handleMethods", "handleMethods", "fmt", $funcType([$Int32, $Bool, $Bool, $Int], [$Bool, $Bool], false), -1], ["printArg", "printArg", "fmt", $funcType([$emptyInterface, $Int32, $Bool, $Bool, $Int], [$Bool], false), -1], ["printReflectValue", "printReflectValue", "fmt", $funcType([reflect.Value, $Int32, $Bool, $Bool, $Int], [$Bool], false), -1], ["printValue", "printValue", "fmt", $funcType([reflect.Value, $Int32, $Bool, $Bool, $Int], [$Bool], false), -1], ["unknownType", "unknownType", "fmt", $funcType([$emptyInterface], [], false), -1]];
		pp.init([["n", "n", "fmt", $Int, ""], ["panicking", "panicking", "fmt", $Bool, ""], ["erroring", "erroring", "fmt", $Bool, ""], ["buf", "buf", "fmt", buffer, ""], ["arg", "arg", "fmt", $emptyInterface, ""], ["value", "value", "fmt", reflect.Value, ""], ["reordered", "reordered", "fmt", $Bool, ""], ["goodArgNum", "goodArgNum", "fmt", $Bool, ""], ["runeBuf", "runeBuf", "fmt", ($arrayType($Uint8, 4)), ""], ["fmt", "fmt", "fmt", fmt, ""]]);
		runeUnreader.init([["UnreadRune", "UnreadRune", "", $funcType([], [$error], false)]]);
		scanError.init([["err", "err", "fmt", $error, ""]]);
		($ptrType(ss)).methods = [["Read", "Read", "", $funcType([($sliceType($Uint8))], [$Int, $error], false), -1], ["ReadRune", "ReadRune", "", $funcType([], [$Int32, $Int, $error], false), -1], ["SkipSpace", "SkipSpace", "", $funcType([], [], false), -1], ["Token", "Token", "", $funcType([$Bool, ($funcType([$Int32], [$Bool], false))], [($sliceType($Uint8)), $error], false), -1], ["UnreadRune", "UnreadRune", "", $funcType([], [$error], false), -1], ["Width", "Width", "", $funcType([], [$Int, $Bool], false), -1], ["accept", "accept", "fmt", $funcType([$String], [$Bool], false), -1], ["advance", "advance", "fmt", $funcType([$String], [$Int], false), -1], ["complexTokens", "complexTokens", "fmt", $funcType([], [$String, $String], false), -1], ["consume", "consume", "fmt", $funcType([$String, $Bool], [$Bool], false), -1], ["convertFloat", "convertFloat", "fmt", $funcType([$String, $Int], [$Float64], false), -1], ["convertString", "convertString", "fmt", $funcType([$Int32], [$String], false), -1], ["doScan", "doScan", "fmt", $funcType([($sliceType($emptyInterface))], [$Int, $error], false), -1], ["doScanf", "doScanf", "fmt", $funcType([$String, ($sliceType($emptyInterface))], [$Int, $error], false), -1], ["error", "error", "fmt", $funcType([$error], [], false), -1], ["errorString", "errorString", "fmt", $funcType([$String], [], false), -1], ["floatToken", "floatToken", "fmt", $funcType([], [$String], false), -1], ["free", "free", "fmt", $funcType([ssave], [], false), -1], ["getBase", "getBase", "fmt", $funcType([$Int32], [$Int, $String], false), -1], ["getRune", "getRune", "fmt", $funcType([], [$Int32], false), -1], ["hexByte", "hexByte", "fmt", $funcType([], [$Uint8, $Bool], false), -1], ["hexDigit", "hexDigit", "fmt", $funcType([$Int32], [$Int], false), -1], ["hexString", "hexString", "fmt", $funcType([], [$String], false), -1], ["mustReadRune", "mustReadRune", "fmt", $funcType([], [$Int32], false), -1], ["notEOF", "notEOF", "fmt", $funcType([], [], false), -1], ["okVerb", "okVerb", "fmt", $funcType([$Int32, $String, $String], [$Bool], false), -1], ["peek", "peek", "fmt", $funcType([$String], [$Bool], false), -1], ["quotedString", "quotedString", "fmt", $funcType([], [$String], false), -1], ["scanBasePrefix", "scanBasePrefix", "fmt", $funcType([], [$Int, $String, $Bool], false), -1], ["scanBool", "scanBool", "fmt", $funcType([$Int32], [$Bool], false), -1], ["scanComplex", "scanComplex", "fmt", $funcType([$Int32, $Int], [$Complex128], false), -1], ["scanInt", "scanInt", "fmt", $funcType([$Int32, $Int], [$Int64], false), -1], ["scanNumber", "scanNumber", "fmt", $funcType([$String, $Bool], [$String], false), -1], ["scanOne", "scanOne", "fmt", $funcType([$Int32, $emptyInterface], [], false), -1], ["scanRune", "scanRune", "fmt", $funcType([$Int], [$Int64], false), -1], ["scanUint", "scanUint", "fmt", $funcType([$Int32, $Int], [$Uint64], false), -1], ["skipSpace", "skipSpace", "fmt", $funcType([$Bool], [], false), -1], ["token", "token", "fmt", $funcType([$Bool, ($funcType([$Int32], [$Bool], false))], [($sliceType($Uint8))], false), -1]];
		ss.init([["rr", "rr", "fmt", io.RuneReader, ""], ["buf", "buf", "fmt", buffer, ""], ["peekRune", "peekRune", "fmt", $Int32, ""], ["prevRune", "prevRune", "fmt", $Int32, ""], ["count", "count", "fmt", $Int, ""], ["atEOF", "atEOF", "fmt", $Bool, ""], ["ssave", "", "fmt", ssave, ""]]);
		ssave.init([["validSave", "validSave", "fmt", $Bool, ""], ["nlIsEnd", "nlIsEnd", "fmt", $Bool, ""], ["nlIsSpace", "nlIsSpace", "fmt", $Bool, ""], ["argLimit", "argLimit", "fmt", $Int, ""], ["limit", "limit", "fmt", $Int, ""], ["maxWid", "maxWid", "fmt", $Int, ""]]);
		padZeroBytes = ($sliceType($Uint8)).make(65);
		padSpaceBytes = ($sliceType($Uint8)).make(65);
		trueBytes = new ($sliceType($Uint8))($stringToBytes("true"));
		falseBytes = new ($sliceType($Uint8))($stringToBytes("false"));
		commaSpaceBytes = new ($sliceType($Uint8))($stringToBytes(", "));
		nilAngleBytes = new ($sliceType($Uint8))($stringToBytes("<nil>"));
		nilParenBytes = new ($sliceType($Uint8))($stringToBytes("(nil)"));
		nilBytes = new ($sliceType($Uint8))($stringToBytes("nil"));
		mapBytes = new ($sliceType($Uint8))($stringToBytes("map["));
		percentBangBytes = new ($sliceType($Uint8))($stringToBytes("%!"));
		missingBytes = new ($sliceType($Uint8))($stringToBytes("(MISSING)"));
		badIndexBytes = new ($sliceType($Uint8))($stringToBytes("(BADINDEX)"));
		panicBytes = new ($sliceType($Uint8))($stringToBytes("(PANIC="));
		extraBytes = new ($sliceType($Uint8))($stringToBytes("%!(EXTRA "));
		irparenBytes = new ($sliceType($Uint8))($stringToBytes("i)"));
		bytesBytes = new ($sliceType($Uint8))($stringToBytes("[]byte{"));
		badWidthBytes = new ($sliceType($Uint8))($stringToBytes("%!(BADWIDTH)"));
		badPrecBytes = new ($sliceType($Uint8))($stringToBytes("%!(BADPREC)"));
		noVerbBytes = new ($sliceType($Uint8))($stringToBytes("%!(NOVERB)"));
		ppFree = new sync.Pool.Ptr(0, 0, ($sliceType($emptyInterface)).nil, (function() {
			return new pp.Ptr();
		}));
		intBits = reflect.TypeOf(new $Int(0)).Bits();
		uintptrBits = reflect.TypeOf(new $Uintptr(0)).Bits();
		space = new ($sliceType(($arrayType($Uint16, 2))))([$toNativeArray("Uint16", [9, 13]), $toNativeArray("Uint16", [32, 32]), $toNativeArray("Uint16", [133, 133]), $toNativeArray("Uint16", [160, 160]), $toNativeArray("Uint16", [5760, 5760]), $toNativeArray("Uint16", [8192, 8202]), $toNativeArray("Uint16", [8232, 8233]), $toNativeArray("Uint16", [8239, 8239]), $toNativeArray("Uint16", [8287, 8287]), $toNativeArray("Uint16", [12288, 12288])]);
		ssFree = new sync.Pool.Ptr(0, 0, ($sliceType($emptyInterface)).nil, (function() {
			return new ss.Ptr();
		}));
		complexError = errors.New("syntax error scanning complex number");
		boolError = errors.New("syntax error scanning boolean");
		init();
	};
	return $pkg;
})();
$packages["bufio"] = (function() {
	var $pkg = {}, bytes = $packages["bytes"], errors = $packages["errors"], io = $packages["io"], utf8 = $packages["unicode/utf8"], Reader, errNegativeRead, NewReaderSize, NewReader;
	Reader = $pkg.Reader = $newType(0, "Struct", "bufio.Reader", "Reader", "bufio", function(buf_, rd_, r_, w_, err_, lastByte_, lastRuneSize_) {
		this.$val = this;
		this.buf = buf_ !== undefined ? buf_ : ($sliceType($Uint8)).nil;
		this.rd = rd_ !== undefined ? rd_ : $ifaceNil;
		this.r = r_ !== undefined ? r_ : 0;
		this.w = w_ !== undefined ? w_ : 0;
		this.err = err_ !== undefined ? err_ : $ifaceNil;
		this.lastByte = lastByte_ !== undefined ? lastByte_ : 0;
		this.lastRuneSize = lastRuneSize_ !== undefined ? lastRuneSize_ : 0;
	});
	NewReaderSize = $pkg.NewReaderSize = function(rd, size) {
		var _tuple, b, ok, r;
		_tuple = $assertType(rd, ($ptrType(Reader)), true); b = _tuple[0]; ok = _tuple[1];
		if (ok && b.buf.$length >= size) {
			return b;
		}
		if (size < 16) {
			size = 16;
		}
		r = new Reader.Ptr();
		r.reset(($sliceType($Uint8)).make(size), rd);
		return r;
	};
	NewReader = $pkg.NewReader = function(rd) {
		return NewReaderSize(rd, 4096);
	};
	Reader.Ptr.prototype.Reset = function(r) {
		var b;
		b = this;
		b.reset(b.buf, r);
	};
	Reader.prototype.Reset = function(r) { return this.$val.Reset(r); };
	Reader.Ptr.prototype.reset = function(buf, r) {
		var b;
		b = this;
		$copy(b, new Reader.Ptr(buf, r, 0, 0, $ifaceNil, -1, -1), Reader);
	};
	Reader.prototype.reset = function(buf, r) { return this.$val.reset(buf, r); };
	Reader.Ptr.prototype.fill = function() {
		var b, i, _tuple, n, err;
		b = this;
		if (b.r > 0) {
			$copySlice(b.buf, $subslice(b.buf, b.r, b.w));
			b.w = b.w - (b.r) >> 0;
			b.r = 0;
		}
		if (b.w >= b.buf.$length) {
			$panic(new $String("bufio: tried to fill full buffer"));
		}
		i = 100;
		while (i > 0) {
			_tuple = b.rd.Read($subslice(b.buf, b.w)); n = _tuple[0]; err = _tuple[1];
			if (n < 0) {
				$panic(errNegativeRead);
			}
			b.w = b.w + (n) >> 0;
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				b.err = err;
				return;
			}
			if (n > 0) {
				return;
			}
			i = i - (1) >> 0;
		}
		b.err = io.ErrNoProgress;
	};
	Reader.prototype.fill = function() { return this.$val.fill(); };
	Reader.Ptr.prototype.readErr = function() {
		var b, err;
		b = this;
		err = b.err;
		b.err = $ifaceNil;
		return err;
	};
	Reader.prototype.readErr = function() { return this.$val.readErr(); };
	Reader.Ptr.prototype.Peek = function(n) {
		var b, m, err;
		b = this;
		if (n < 0) {
			return [($sliceType($Uint8)).nil, $pkg.ErrNegativeCount];
		}
		if (n > b.buf.$length) {
			return [($sliceType($Uint8)).nil, $pkg.ErrBufferFull];
		}
		while ((b.w - b.r >> 0) < n && $interfaceIsEqual(b.err, $ifaceNil)) {
			b.fill();
		}
		m = b.w - b.r >> 0;
		if (m > n) {
			m = n;
		}
		err = $ifaceNil;
		if (m < n) {
			err = b.readErr();
			if ($interfaceIsEqual(err, $ifaceNil)) {
				err = $pkg.ErrBufferFull;
			}
		}
		return [$subslice(b.buf, b.r, (b.r + m >> 0)), err];
	};
	Reader.prototype.Peek = function(n) { return this.$val.Peek(n); };
	Reader.Ptr.prototype.Read = function(p) {
		var n = 0, err = $ifaceNil, b, _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, x, _tmp$4, _tmp$5, _tmp$6, _tmp$7, x$1, x$2, _tmp$8, _tmp$9;
		b = this;
		n = p.$length;
		if (n === 0) {
			_tmp = 0; _tmp$1 = b.readErr(); n = _tmp; err = _tmp$1;
			return [n, err];
		}
		if (b.r === b.w) {
			if (!($interfaceIsEqual(b.err, $ifaceNil))) {
				_tmp$2 = 0; _tmp$3 = b.readErr(); n = _tmp$2; err = _tmp$3;
				return [n, err];
			}
			if (p.$length >= b.buf.$length) {
				_tuple = b.rd.Read(p); n = _tuple[0]; b.err = _tuple[1];
				if (n < 0) {
					$panic(errNegativeRead);
				}
				if (n > 0) {
					b.lastByte = ((x = n - 1 >> 0, ((x < 0 || x >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + x])) >> 0);
					b.lastRuneSize = -1;
				}
				_tmp$4 = n; _tmp$5 = b.readErr(); n = _tmp$4; err = _tmp$5;
				return [n, err];
			}
			b.fill();
			if (b.w === b.r) {
				_tmp$6 = 0; _tmp$7 = b.readErr(); n = _tmp$6; err = _tmp$7;
				return [n, err];
			}
		}
		if (n > (b.w - b.r >> 0)) {
			n = b.w - b.r >> 0;
		}
		$copySlice($subslice(p, 0, n), $subslice(b.buf, b.r));
		b.r = b.r + (n) >> 0;
		b.lastByte = ((x$1 = b.buf, x$2 = b.r - 1 >> 0, ((x$2 < 0 || x$2 >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + x$2])) >> 0);
		b.lastRuneSize = -1;
		_tmp$8 = n; _tmp$9 = $ifaceNil; n = _tmp$8; err = _tmp$9;
		return [n, err];
	};
	Reader.prototype.Read = function(p) { return this.$val.Read(p); };
	Reader.Ptr.prototype.ReadByte = function() {
		var c = 0, err = $ifaceNil, b, _tmp, _tmp$1, x, x$1, _tmp$2, _tmp$3;
		b = this;
		b.lastRuneSize = -1;
		while (b.r === b.w) {
			if (!($interfaceIsEqual(b.err, $ifaceNil))) {
				_tmp = 0; _tmp$1 = b.readErr(); c = _tmp; err = _tmp$1;
				return [c, err];
			}
			b.fill();
		}
		c = (x = b.buf, x$1 = b.r, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1]));
		b.r = b.r + (1) >> 0;
		b.lastByte = (c >> 0);
		_tmp$2 = c; _tmp$3 = $ifaceNil; c = _tmp$2; err = _tmp$3;
		return [c, err];
	};
	Reader.prototype.ReadByte = function() { return this.$val.ReadByte(); };
	Reader.Ptr.prototype.UnreadByte = function() {
		var b, x, x$1;
		b = this;
		if (b.lastByte < 0 || (b.r === 0) && b.w > 0) {
			return $pkg.ErrInvalidUnreadByte;
		}
		if (b.r > 0) {
			b.r = b.r - (1) >> 0;
		} else {
			b.w = 1;
		}
		(x = b.buf, x$1 = b.r, (x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1] = (b.lastByte << 24 >>> 24));
		b.lastByte = -1;
		b.lastRuneSize = -1;
		return $ifaceNil;
	};
	Reader.prototype.UnreadByte = function() { return this.$val.UnreadByte(); };
	Reader.Ptr.prototype.ReadRune = function() {
		var r = 0, size = 0, err = $ifaceNil, b, _tmp, _tmp$1, _tmp$2, _tmp$3, x, x$1, _tmp$4, _tuple, x$2, x$3, _tmp$5, _tmp$6, _tmp$7;
		b = this;
		while ((b.r + 4 >> 0) > b.w && !utf8.FullRune($subslice(b.buf, b.r, b.w)) && $interfaceIsEqual(b.err, $ifaceNil) && (b.w - b.r >> 0) < b.buf.$length) {
			b.fill();
		}
		b.lastRuneSize = -1;
		if (b.r === b.w) {
			_tmp = 0; _tmp$1 = 0; _tmp$2 = b.readErr(); r = _tmp; size = _tmp$1; err = _tmp$2;
			return [r, size, err];
		}
		_tmp$3 = ((x = b.buf, x$1 = b.r, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1])) >> 0); _tmp$4 = 1; r = _tmp$3; size = _tmp$4;
		if (r >= 128) {
			_tuple = utf8.DecodeRune($subslice(b.buf, b.r, b.w)); r = _tuple[0]; size = _tuple[1];
		}
		b.r = b.r + (size) >> 0;
		b.lastByte = ((x$2 = b.buf, x$3 = b.r - 1 >> 0, ((x$3 < 0 || x$3 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + x$3])) >> 0);
		b.lastRuneSize = size;
		_tmp$5 = r; _tmp$6 = size; _tmp$7 = $ifaceNil; r = _tmp$5; size = _tmp$6; err = _tmp$7;
		return [r, size, err];
	};
	Reader.prototype.ReadRune = function() { return this.$val.ReadRune(); };
	Reader.Ptr.prototype.UnreadRune = function() {
		var b;
		b = this;
		if (b.lastRuneSize < 0 || b.r < b.lastRuneSize) {
			return $pkg.ErrInvalidUnreadRune;
		}
		b.r = b.r - (b.lastRuneSize) >> 0;
		b.lastByte = -1;
		b.lastRuneSize = -1;
		return $ifaceNil;
	};
	Reader.prototype.UnreadRune = function() { return this.$val.UnreadRune(); };
	Reader.Ptr.prototype.Buffered = function() {
		var b;
		b = this;
		return b.w - b.r >> 0;
	};
	Reader.prototype.Buffered = function() { return this.$val.Buffered(); };
	Reader.Ptr.prototype.ReadSlice = function(delim) {
		var line = ($sliceType($Uint8)).nil, err = $ifaceNil, b, i, n, i$1;
		b = this;
		while (true) {
			i = bytes.IndexByte($subslice(b.buf, b.r, b.w), delim);
			if (i >= 0) {
				line = $subslice(b.buf, b.r, ((b.r + i >> 0) + 1 >> 0));
				b.r = b.r + ((i + 1 >> 0)) >> 0;
				break;
			}
			if (!($interfaceIsEqual(b.err, $ifaceNil))) {
				line = $subslice(b.buf, b.r, b.w);
				b.r = b.w;
				err = b.readErr();
				break;
			}
			n = b.Buffered();
			if (n >= b.buf.$length) {
				b.r = b.w;
				line = b.buf;
				err = $pkg.ErrBufferFull;
				break;
			}
			b.fill();
		}
		i$1 = line.$length - 1 >> 0;
		if (i$1 >= 0) {
			b.lastByte = (((i$1 < 0 || i$1 >= line.$length) ? $throwRuntimeError("index out of range") : line.$array[line.$offset + i$1]) >> 0);
		}
		return [line, err];
	};
	Reader.prototype.ReadSlice = function(delim) { return this.$val.ReadSlice(delim); };
	Reader.Ptr.prototype.ReadLine = function() {
		var line = ($sliceType($Uint8)).nil, isPrefix = false, err = $ifaceNil, b, _tuple, x, _tmp, _tmp$1, _tmp$2, x$1, drop, x$2;
		b = this;
		_tuple = b.ReadSlice(10); line = _tuple[0]; err = _tuple[1];
		if ($interfaceIsEqual(err, $pkg.ErrBufferFull)) {
			if (line.$length > 0 && ((x = line.$length - 1 >> 0, ((x < 0 || x >= line.$length) ? $throwRuntimeError("index out of range") : line.$array[line.$offset + x])) === 13)) {
				if (b.r === 0) {
					$panic(new $String("bufio: tried to rewind past start of buffer"));
				}
				b.r = b.r - (1) >> 0;
				line = $subslice(line, 0, (line.$length - 1 >> 0));
			}
			_tmp = line; _tmp$1 = true; _tmp$2 = $ifaceNil; line = _tmp; isPrefix = _tmp$1; err = _tmp$2;
			return [line, isPrefix, err];
		}
		if (line.$length === 0) {
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				line = ($sliceType($Uint8)).nil;
			}
			return [line, isPrefix, err];
		}
		err = $ifaceNil;
		if ((x$1 = line.$length - 1 >> 0, ((x$1 < 0 || x$1 >= line.$length) ? $throwRuntimeError("index out of range") : line.$array[line.$offset + x$1])) === 10) {
			drop = 1;
			if (line.$length > 1 && ((x$2 = line.$length - 2 >> 0, ((x$2 < 0 || x$2 >= line.$length) ? $throwRuntimeError("index out of range") : line.$array[line.$offset + x$2])) === 13)) {
				drop = 2;
			}
			line = $subslice(line, 0, (line.$length - drop >> 0));
		}
		return [line, isPrefix, err];
	};
	Reader.prototype.ReadLine = function() { return this.$val.ReadLine(); };
	Reader.Ptr.prototype.ReadBytes = function(delim) {
		var line = ($sliceType($Uint8)).nil, err = $ifaceNil, b, frag, full, e, _tuple, buf, n, _ref, _i, i, buf$1, _ref$1, _i$1, i$1, _tmp, _tmp$1;
		b = this;
		frag = ($sliceType($Uint8)).nil;
		full = ($sliceType(($sliceType($Uint8)))).nil;
		err = $ifaceNil;
		while (true) {
			e = $ifaceNil;
			_tuple = b.ReadSlice(delim); frag = _tuple[0]; e = _tuple[1];
			if ($interfaceIsEqual(e, $ifaceNil)) {
				break;
			}
			if (!($interfaceIsEqual(e, $pkg.ErrBufferFull))) {
				err = e;
				break;
			}
			buf = ($sliceType($Uint8)).make(frag.$length);
			$copySlice(buf, frag);
			full = $append(full, buf);
		}
		n = 0;
		_ref = full;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			n = n + (((i < 0 || i >= full.$length) ? $throwRuntimeError("index out of range") : full.$array[full.$offset + i]).$length) >> 0;
			_i++;
		}
		n = n + (frag.$length) >> 0;
		buf$1 = ($sliceType($Uint8)).make(n);
		n = 0;
		_ref$1 = full;
		_i$1 = 0;
		while (_i$1 < _ref$1.$length) {
			i$1 = _i$1;
			n = n + ($copySlice($subslice(buf$1, n), ((i$1 < 0 || i$1 >= full.$length) ? $throwRuntimeError("index out of range") : full.$array[full.$offset + i$1]))) >> 0;
			_i$1++;
		}
		$copySlice($subslice(buf$1, n), frag);
		_tmp = buf$1; _tmp$1 = err; line = _tmp; err = _tmp$1;
		return [line, err];
	};
	Reader.prototype.ReadBytes = function(delim) { return this.$val.ReadBytes(delim); };
	Reader.Ptr.prototype.ReadString = function(delim) {
		var line = "", err = $ifaceNil, b, _tuple, bytes$1, _tmp, _tmp$1;
		b = this;
		_tuple = b.ReadBytes(delim); bytes$1 = _tuple[0]; err = _tuple[1];
		line = $bytesToString(bytes$1);
		_tmp = line; _tmp$1 = err; line = _tmp; err = _tmp$1;
		return [line, err];
	};
	Reader.prototype.ReadString = function(delim) { return this.$val.ReadString(delim); };
	Reader.Ptr.prototype.WriteTo = function(w) {
		var n = new $Int64(0, 0), err = $ifaceNil, b, _tuple, _tuple$1, r, ok, _tuple$2, m, err$1, x, _tmp, _tmp$1, _tuple$3, w$1, ok$1, _tuple$4, m$1, err$2, x$1, _tmp$2, _tmp$3, _tuple$5, m$2, err$3, x$2, _tmp$4, _tmp$5, _tmp$6, _tmp$7;
		b = this;
		_tuple = b.writeBuf(w); n = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return [n, err];
		}
		_tuple$1 = $assertType(b.rd, io.WriterTo, true); r = _tuple$1[0]; ok = _tuple$1[1];
		if (ok) {
			_tuple$2 = r.WriteTo(w); m = _tuple$2[0]; err$1 = _tuple$2[1];
			n = (x = m, new $Int64(n.$high + x.$high, n.$low + x.$low));
			_tmp = n; _tmp$1 = err$1; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		_tuple$3 = $assertType(w, io.ReaderFrom, true); w$1 = _tuple$3[0]; ok$1 = _tuple$3[1];
		if (ok$1) {
			_tuple$4 = w$1.ReadFrom(b.rd); m$1 = _tuple$4[0]; err$2 = _tuple$4[1];
			n = (x$1 = m$1, new $Int64(n.$high + x$1.$high, n.$low + x$1.$low));
			_tmp$2 = n; _tmp$3 = err$2; n = _tmp$2; err = _tmp$3;
			return [n, err];
		}
		if ((b.w - b.r >> 0) < b.buf.$length) {
			b.fill();
		}
		while (b.r < b.w) {
			_tuple$5 = b.writeBuf(w); m$2 = _tuple$5[0]; err$3 = _tuple$5[1];
			n = (x$2 = m$2, new $Int64(n.$high + x$2.$high, n.$low + x$2.$low));
			if (!($interfaceIsEqual(err$3, $ifaceNil))) {
				_tmp$4 = n; _tmp$5 = err$3; n = _tmp$4; err = _tmp$5;
				return [n, err];
			}
			b.fill();
		}
		if ($interfaceIsEqual(b.err, io.EOF)) {
			b.err = $ifaceNil;
		}
		_tmp$6 = n; _tmp$7 = b.readErr(); n = _tmp$6; err = _tmp$7;
		return [n, err];
	};
	Reader.prototype.WriteTo = function(w) { return this.$val.WriteTo(w); };
	Reader.Ptr.prototype.writeBuf = function(w) {
		var b, _tuple, n, err;
		b = this;
		_tuple = w.Write($subslice(b.buf, b.r, b.w)); n = _tuple[0]; err = _tuple[1];
		if (n < (b.r - b.w >> 0)) {
			$panic(errors.New("bufio: writer did not write all data"));
		}
		b.r = b.r + (n) >> 0;
		return [new $Int64(0, n), err];
	};
	Reader.prototype.writeBuf = function(w) { return this.$val.writeBuf(w); };
	$pkg.$init = function() {
		($ptrType(Reader)).methods = [["Buffered", "Buffered", "", $funcType([], [$Int], false), -1], ["Peek", "Peek", "", $funcType([$Int], [($sliceType($Uint8)), $error], false), -1], ["Read", "Read", "", $funcType([($sliceType($Uint8))], [$Int, $error], false), -1], ["ReadByte", "ReadByte", "", $funcType([], [$Uint8, $error], false), -1], ["ReadBytes", "ReadBytes", "", $funcType([$Uint8], [($sliceType($Uint8)), $error], false), -1], ["ReadLine", "ReadLine", "", $funcType([], [($sliceType($Uint8)), $Bool, $error], false), -1], ["ReadRune", "ReadRune", "", $funcType([], [$Int32, $Int, $error], false), -1], ["ReadSlice", "ReadSlice", "", $funcType([$Uint8], [($sliceType($Uint8)), $error], false), -1], ["ReadString", "ReadString", "", $funcType([$Uint8], [$String, $error], false), -1], ["Reset", "Reset", "", $funcType([io.Reader], [], false), -1], ["UnreadByte", "UnreadByte", "", $funcType([], [$error], false), -1], ["UnreadRune", "UnreadRune", "", $funcType([], [$error], false), -1], ["WriteTo", "WriteTo", "", $funcType([io.Writer], [$Int64, $error], false), -1], ["fill", "fill", "bufio", $funcType([], [], false), -1], ["readErr", "readErr", "bufio", $funcType([], [$error], false), -1], ["reset", "reset", "bufio", $funcType([($sliceType($Uint8)), io.Reader], [], false), -1], ["writeBuf", "writeBuf", "bufio", $funcType([io.Writer], [$Int64, $error], false), -1]];
		Reader.init([["buf", "buf", "bufio", ($sliceType($Uint8)), ""], ["rd", "rd", "bufio", io.Reader, ""], ["r", "r", "bufio", $Int, ""], ["w", "w", "bufio", $Int, ""], ["err", "err", "bufio", $error, ""], ["lastByte", "lastByte", "bufio", $Int, ""], ["lastRuneSize", "lastRuneSize", "bufio", $Int, ""]]);
		$pkg.ErrInvalidUnreadByte = errors.New("bufio: invalid use of UnreadByte");
		$pkg.ErrInvalidUnreadRune = errors.New("bufio: invalid use of UnreadRune");
		$pkg.ErrBufferFull = errors.New("bufio: buffer full");
		$pkg.ErrNegativeCount = errors.New("bufio: negative count");
		errNegativeRead = errors.New("bufio: reader returned negative count from Read");
		$pkg.ErrTooLong = errors.New("bufio.Scanner: token too long");
		$pkg.ErrNegativeAdvance = errors.New("bufio.Scanner: SplitFunc returns negative advance count");
		$pkg.ErrAdvanceTooFar = errors.New("bufio.Scanner: SplitFunc returns advance count beyond input");
	};
	return $pkg;
})();
$packages["sort"] = (function() {
	var $pkg = {}, StringSlice, Search, SearchStrings, min, insertionSort, siftDown, heapSort, medianOfThree, swapRange, doPivot, quickSort, Sort;
	StringSlice = $pkg.StringSlice = $newType(12, "Slice", "sort.StringSlice", "StringSlice", "sort", null);
	Search = $pkg.Search = function(n, f) {
		var _tmp, _tmp$1, i, j, _q, h;
		_tmp = 0; _tmp$1 = n; i = _tmp; j = _tmp$1;
		while (i < j) {
			h = i + (_q = ((j - i >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			if (!f(h)) {
				i = h + 1 >> 0;
			} else {
				j = h;
			}
		}
		return i;
	};
	SearchStrings = $pkg.SearchStrings = function(a, x) {
		return Search(a.$length, (function(i) {
			return ((i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i]) >= x;
		}));
	};
	StringSlice.prototype.Search = function(x) {
		var p;
		p = this;
		return SearchStrings($subslice(new ($sliceType($String))(p.$array), p.$offset, p.$offset + p.$length), x);
	};
	$ptrType(StringSlice).prototype.Search = function(x) { return this.$get().Search(x); };
	min = function(a, b) {
		if (a < b) {
			return a;
		}
		return b;
	};
	insertionSort = function(data, a, b) {
		var i, j;
		i = a + 1 >> 0;
		while (i < b) {
			j = i;
			while (j > a && data.Less(j, j - 1 >> 0)) {
				data.Swap(j, j - 1 >> 0);
				j = j - (1) >> 0;
			}
			i = i + (1) >> 0;
		}
	};
	siftDown = function(data, lo, hi, first) {
		var root, child;
		root = lo;
		while (true) {
			child = ((((2 >>> 16 << 16) * root >> 0) + (2 << 16 >>> 16) * root) >> 0) + 1 >> 0;
			if (child >= hi) {
				break;
			}
			if ((child + 1 >> 0) < hi && data.Less(first + child >> 0, (first + child >> 0) + 1 >> 0)) {
				child = child + (1) >> 0;
			}
			if (!data.Less(first + root >> 0, first + child >> 0)) {
				return;
			}
			data.Swap(first + root >> 0, first + child >> 0);
			root = child;
		}
	};
	heapSort = function(data, a, b) {
		var first, lo, hi, _q, i, i$1;
		first = a;
		lo = 0;
		hi = b - a >> 0;
		i = (_q = ((hi - 1 >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		while (i >= 0) {
			siftDown(data, i, hi, first);
			i = i - (1) >> 0;
		}
		i$1 = hi - 1 >> 0;
		while (i$1 >= 0) {
			data.Swap(first, first + i$1 >> 0);
			siftDown(data, lo, i$1, first);
			i$1 = i$1 - (1) >> 0;
		}
	};
	medianOfThree = function(data, a, b, c) {
		var m0, m1, m2;
		m0 = b;
		m1 = a;
		m2 = c;
		if (data.Less(m1, m0)) {
			data.Swap(m1, m0);
		}
		if (data.Less(m2, m1)) {
			data.Swap(m2, m1);
		}
		if (data.Less(m1, m0)) {
			data.Swap(m1, m0);
		}
	};
	swapRange = function(data, a, b, n) {
		var i;
		i = 0;
		while (i < n) {
			data.Swap(a + i >> 0, b + i >> 0);
			i = i + (1) >> 0;
		}
	};
	doPivot = function(data, lo, hi) {
		var midlo = 0, midhi = 0, _q, m, _q$1, s, pivot, _tmp, _tmp$1, _tmp$2, _tmp$3, a, b, c, d, n, _tmp$4, _tmp$5;
		m = lo + (_q = ((hi - lo >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
		if ((hi - lo >> 0) > 40) {
			s = (_q$1 = ((hi - lo >> 0)) / 8, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
			medianOfThree(data, lo, lo + s >> 0, lo + ((((2 >>> 16 << 16) * s >> 0) + (2 << 16 >>> 16) * s) >> 0) >> 0);
			medianOfThree(data, m, m - s >> 0, m + s >> 0);
			medianOfThree(data, hi - 1 >> 0, (hi - 1 >> 0) - s >> 0, (hi - 1 >> 0) - ((((2 >>> 16 << 16) * s >> 0) + (2 << 16 >>> 16) * s) >> 0) >> 0);
		}
		medianOfThree(data, lo, m, hi - 1 >> 0);
		pivot = lo;
		_tmp = lo + 1 >> 0; _tmp$1 = lo + 1 >> 0; _tmp$2 = hi; _tmp$3 = hi; a = _tmp; b = _tmp$1; c = _tmp$2; d = _tmp$3;
		while (true) {
			while (b < c) {
				if (data.Less(b, pivot)) {
					b = b + (1) >> 0;
				} else if (!data.Less(pivot, b)) {
					data.Swap(a, b);
					a = a + (1) >> 0;
					b = b + (1) >> 0;
				} else {
					break;
				}
			}
			while (b < c) {
				if (data.Less(pivot, c - 1 >> 0)) {
					c = c - (1) >> 0;
				} else if (!data.Less(c - 1 >> 0, pivot)) {
					data.Swap(c - 1 >> 0, d - 1 >> 0);
					c = c - (1) >> 0;
					d = d - (1) >> 0;
				} else {
					break;
				}
			}
			if (b >= c) {
				break;
			}
			data.Swap(b, c - 1 >> 0);
			b = b + (1) >> 0;
			c = c - (1) >> 0;
		}
		n = min(b - a >> 0, a - lo >> 0);
		swapRange(data, lo, b - n >> 0, n);
		n = min(hi - d >> 0, d - c >> 0);
		swapRange(data, c, hi - n >> 0, n);
		_tmp$4 = (lo + b >> 0) - a >> 0; _tmp$5 = hi - ((d - c >> 0)) >> 0; midlo = _tmp$4; midhi = _tmp$5;
		return [midlo, midhi];
	};
	quickSort = function(data, a, b, maxDepth) {
		var _tuple, mlo, mhi;
		while ((b - a >> 0) > 7) {
			if (maxDepth === 0) {
				heapSort(data, a, b);
				return;
			}
			maxDepth = maxDepth - (1) >> 0;
			_tuple = doPivot(data, a, b); mlo = _tuple[0]; mhi = _tuple[1];
			if ((mlo - a >> 0) < (b - mhi >> 0)) {
				quickSort(data, a, mlo, maxDepth);
				a = mhi;
			} else {
				quickSort(data, mhi, b, maxDepth);
				b = mlo;
			}
		}
		if ((b - a >> 0) > 1) {
			insertionSort(data, a, b);
		}
	};
	Sort = $pkg.Sort = function(data) {
		var n, maxDepth, i, x;
		n = data.Len();
		maxDepth = 0;
		i = n;
		while (i > 0) {
			maxDepth = maxDepth + (1) >> 0;
			i = (i >> $min((1), 31)) >> 0;
		}
		maxDepth = (x = 2, (((maxDepth >>> 16 << 16) * x >> 0) + (maxDepth << 16 >>> 16) * x) >> 0);
		quickSort(data, 0, n, maxDepth);
	};
	StringSlice.prototype.Len = function() {
		var p;
		p = this;
		return p.$length;
	};
	$ptrType(StringSlice).prototype.Len = function() { return this.$get().Len(); };
	StringSlice.prototype.Less = function(i, j) {
		var p;
		p = this;
		return ((i < 0 || i >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + i]) < ((j < 0 || j >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + j]);
	};
	$ptrType(StringSlice).prototype.Less = function(i, j) { return this.$get().Less(i, j); };
	StringSlice.prototype.Swap = function(i, j) {
		var p, _tmp, _tmp$1;
		p = this;
		_tmp = ((j < 0 || j >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + j]); _tmp$1 = ((i < 0 || i >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + i]); (i < 0 || i >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + i] = _tmp; (j < 0 || j >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + j] = _tmp$1;
	};
	$ptrType(StringSlice).prototype.Swap = function(i, j) { return this.$get().Swap(i, j); };
	StringSlice.prototype.Sort = function() {
		var p;
		p = this;
		Sort(p);
	};
	$ptrType(StringSlice).prototype.Sort = function() { return this.$get().Sort(); };
	$pkg.$init = function() {
		StringSlice.methods = [["Len", "Len", "", $funcType([], [$Int], false), -1], ["Less", "Less", "", $funcType([$Int, $Int], [$Bool], false), -1], ["Search", "Search", "", $funcType([$String], [$Int], false), -1], ["Sort", "Sort", "", $funcType([], [], false), -1], ["Swap", "Swap", "", $funcType([$Int, $Int], [], false), -1]];
		($ptrType(StringSlice)).methods = [["Len", "Len", "", $funcType([], [$Int], false), -1], ["Less", "Less", "", $funcType([$Int, $Int], [$Bool], false), -1], ["Search", "Search", "", $funcType([$String], [$Int], false), -1], ["Sort", "Sort", "", $funcType([], [], false), -1], ["Swap", "Swap", "", $funcType([$Int, $Int], [], false), -1]];
		StringSlice.init($String);
	};
	return $pkg;
})();
$packages["path/filepath"] = (function() {
	var $pkg = {}, errors = $packages["errors"], os = $packages["os"], runtime = $packages["runtime"], sort = $packages["sort"], strings = $packages["strings"], utf8 = $packages["unicode/utf8"], bytes = $packages["bytes"];
	$pkg.$init = function() {
		$pkg.ErrBadPattern = errors.New("syntax error in pattern");
		$pkg.SkipDir = errors.New("skip this directory");
	};
	return $pkg;
})();
$packages["io/ioutil"] = (function() {
	var $pkg = {}, bytes = $packages["bytes"], io = $packages["io"], os = $packages["os"], sort = $packages["sort"], sync = $packages["sync"], filepath = $packages["path/filepath"], strconv = $packages["strconv"], time = $packages["time"], nopCloser, blackHolePool, NopCloser;
	nopCloser = $pkg.nopCloser = $newType(0, "Struct", "ioutil.nopCloser", "nopCloser", "io/ioutil", function(Reader_) {
		this.$val = this;
		this.Reader = Reader_ !== undefined ? Reader_ : $ifaceNil;
	});
	nopCloser.Ptr.prototype.Close = function() {
		return $ifaceNil;
	};
	nopCloser.prototype.Close = function() { return this.$val.Close(); };
	NopCloser = $pkg.NopCloser = function(r) {
		var x;
		return (x = new nopCloser.Ptr(r), new x.constructor.Struct(x));
	};
	$pkg.$init = function() {
		nopCloser.methods = [["Close", "Close", "", $funcType([], [$error], false), -1], ["Read", "Read", "", $funcType([($sliceType($Uint8))], [$Int, $error], false), 0]];
		($ptrType(nopCloser)).methods = [["Close", "Close", "", $funcType([], [$error], false), -1], ["Read", "Read", "", $funcType([($sliceType($Uint8))], [$Int, $error], false), 0]];
		nopCloser.init([["Reader", "", "", io.Reader, ""]]);
		blackHolePool = new sync.Pool.Ptr(0, 0, ($sliceType($emptyInterface)).nil, (function() {
			var b;
			b = ($sliceType($Uint8)).make(8192);
			return new ($ptrType(($sliceType($Uint8))))(function() { return b; }, function($v) { b = $v; });
		}));
	};
	return $pkg;
})();
$packages["github.com/h8liu/xlang/parser"] = (function() {
	var $pkg = {}, bytes = $packages["bytes"], io = $packages["io"], fmt = $packages["fmt"], ioutil = $packages["io/ioutil"], os = $packages["os"], strings = $packages["strings"], bufio = $packages["bufio"], Block, Stmt, Entry, cursor, ErrList, errList, Error, Lexer, parser, Pos, runeScanner, Type, Tok, keywords, typeStr, typeShortStr, _map, _key, _map$1, _key$1, newCursor, newErrList, isKeyword, Lex, LexStr, singleErr, newParser, endStmtToken, endBlockToken, startBlockToken, Parse, ParseStr, newRuneScanner, isDigit, isLetter, isWhite, isOperator;
	Block = $pkg.Block = $newType(12, "Slice", "parser.Block", "Block", "github.com/h8liu/xlang/parser", null);
	Stmt = $pkg.Stmt = $newType(12, "Slice", "parser.Stmt", "Stmt", "github.com/h8liu/xlang/parser", null);
	Entry = $pkg.Entry = $newType(0, "Struct", "parser.Entry", "Entry", "github.com/h8liu/xlang/parser", function(Tok_, Block_) {
		this.$val = this;
		this.Tok = Tok_ !== undefined ? Tok_ : ($ptrType(Tok)).nil;
		this.Block = Block_ !== undefined ? Block_ : Block.nil;
	});
	cursor = $pkg.cursor = $newType(0, "Struct", "parser.cursor", "cursor", "github.com/h8liu/xlang/parser", function(file_, s_, buf_, row_, col_, head_, eof_) {
		this.$val = this;
		this.file = file_ !== undefined ? file_ : "";
		this.s = s_ !== undefined ? s_ : ($ptrType(runeScanner)).nil;
		this.buf = buf_ !== undefined ? buf_ : ($ptrType(bytes.Buffer)).nil;
		this.row = row_ !== undefined ? row_ : 0;
		this.col = col_ !== undefined ? col_ : 0;
		this.head = head_ !== undefined ? head_ : 0;
		this.eof = eof_ !== undefined ? eof_ : false;
	});
	ErrList = $pkg.ErrList = $newType(8, "Interface", "parser.ErrList", "ErrList", "github.com/h8liu/xlang/parser", null);
	errList = $pkg.errList = $newType(0, "Struct", "parser.errList", "errList", "github.com/h8liu/xlang/parser", function(maxError_, errs_, scanned_, scanPtr_, hold_) {
		this.$val = this;
		this.maxError = maxError_ !== undefined ? maxError_ : 0;
		this.errs = errs_ !== undefined ? errs_ : ($sliceType(($ptrType(Error)))).nil;
		this.scanned = scanned_ !== undefined ? scanned_ : false;
		this.scanPtr = scanPtr_ !== undefined ? scanPtr_ : 0;
		this.hold = hold_ !== undefined ? hold_ : ($ptrType(Error)).nil;
	});
	Error = $pkg.Error = $newType(0, "Struct", "parser.Error", "Error", "github.com/h8liu/xlang/parser", function(Pos_, S_) {
		this.$val = this;
		this.Pos = Pos_ !== undefined ? Pos_ : ($ptrType(Pos)).nil;
		this.S = S_ !== undefined ? S_ : "";
	});
	Lexer = $pkg.Lexer = $newType(0, "Struct", "parser.Lexer", "Lexer", "github.com/h8liu/xlang/parser", function(c_, last_, hold_, errs_, NoKeyword_) {
		this.$val = this;
		this.c = c_ !== undefined ? c_ : ($ptrType(cursor)).nil;
		this.last = last_ !== undefined ? last_ : ($ptrType(Tok)).nil;
		this.hold = hold_ !== undefined ? hold_ : ($ptrType(Tok)).nil;
		this.errs = errs_ !== undefined ? errs_ : ($ptrType(errList)).nil;
		this.NoKeyword = NoKeyword_ !== undefined ? NoKeyword_ : false;
	});
	parser = $pkg.parser = $newType(0, "Struct", "parser.parser", "parser", "github.com/h8liu/xlang/parser", function(lex_, block_, errs_, eofErrored_) {
		this.$val = this;
		this.lex = lex_ !== undefined ? lex_ : ($ptrType(Lexer)).nil;
		this.block = block_ !== undefined ? block_ : Block.nil;
		this.errs = errs_ !== undefined ? errs_ : ($ptrType(errList)).nil;
		this.eofErrored = eofErrored_ !== undefined ? eofErrored_ : false;
	});
	Pos = $pkg.Pos = $newType(0, "Struct", "parser.Pos", "Pos", "github.com/h8liu/xlang/parser", function(File_, Row_, Col_) {
		this.$val = this;
		this.File = File_ !== undefined ? File_ : "";
		this.Row = Row_ !== undefined ? Row_ : 0;
		this.Col = Col_ !== undefined ? Col_ : 0;
	});
	runeScanner = $pkg.runeScanner = $newType(0, "Struct", "parser.runeScanner", "runeScanner", "github.com/h8liu/xlang/parser", function(rc_, r_, row_, col_, closed_, scanned_, hold_, e_) {
		this.$val = this;
		this.rc = rc_ !== undefined ? rc_ : $ifaceNil;
		this.r = r_ !== undefined ? r_ : ($ptrType(bufio.Reader)).nil;
		this.row = row_ !== undefined ? row_ : 0;
		this.col = col_ !== undefined ? col_ : 0;
		this.closed = closed_ !== undefined ? closed_ : false;
		this.scanned = scanned_ !== undefined ? scanned_ : false;
		this.hold = hold_ !== undefined ? hold_ : 0;
		this.e = e_ !== undefined ? e_ : $ifaceNil;
	});
	Type = $pkg.Type = $newType(4, "Int", "parser.Type", "Type", "github.com/h8liu/xlang/parser", null);
	Tok = $pkg.Tok = $newType(0, "Struct", "parser.Tok", "Tok", "github.com/h8liu/xlang/parser", function(Type_, Lit_, Pos_) {
		this.$val = this;
		this.Type = Type_ !== undefined ? Type_ : 0;
		this.Lit = Lit_ !== undefined ? Lit_ : "";
		this.Pos = Pos_ !== undefined ? Pos_ : ($ptrType(Pos)).nil;
	});
	newCursor = function(f, r) {
		var ret, _tuple;
		ret = new cursor.Ptr();
		ret.s = newRuneScanner(r);
		ret.file = f;
		ret.buf = new bytes.Buffer.Ptr();
		_tuple = ret.s.Pos(); ret.row = _tuple[0]; ret.col = _tuple[1];
		if (!ret.s.Scan()) {
			ret.eof = true;
		}
		return ret;
	};
	cursor.Ptr.prototype.Accept = function() {
		var c;
		c = this;
		if (c.eof) {
			return false;
		}
		c.buf.WriteRune(c.s.Rune());
		if (!c.s.Scan()) {
			c.eof = true;
		}
		return true;
	};
	cursor.prototype.Accept = function() { return this.$val.Accept(); };
	cursor.Ptr.prototype.Scan = function() {
		var c;
		c = this;
		return c.Accept() && !c.EOF();
	};
	cursor.prototype.Scan = function() { return this.$val.Scan(); };
	cursor.Ptr.prototype.Pos = function() {
		var c;
		c = this;
		return new Pos.Ptr(c.file, c.row, c.col);
	};
	cursor.prototype.Pos = function() { return this.$val.Pos(); };
	cursor.Ptr.prototype.Token = function(t) {
		var c, ret;
		c = this;
		if (c.buf.Len() === 0) {
			$panic(new $String("nothing buffered"));
		}
		ret = new Tok.Ptr();
		ret.Type = t;
		ret.Lit = c.buf.String();
		ret.Pos = c.Pos();
		c.resetBuf();
		return ret;
	};
	cursor.prototype.Token = function(t) { return this.$val.Token(t); };
	cursor.Ptr.prototype.Discard = function() {
		var c;
		c = this;
		c.resetBuf();
	};
	cursor.prototype.Discard = function() { return this.$val.Discard(); };
	cursor.Ptr.prototype.resetBuf = function() {
		var c, _tuple;
		c = this;
		c.buf.Reset();
		_tuple = c.s.Pos(); c.row = _tuple[0]; c.col = _tuple[1];
	};
	cursor.prototype.resetBuf = function() { return this.$val.resetBuf(); };
	cursor.Ptr.prototype.Buffered = function() {
		var c;
		c = this;
		return c.buf.String();
	};
	cursor.prototype.Buffered = function() { return this.$val.Buffered(); };
	cursor.Ptr.prototype.EOF = function() {
		var c;
		c = this;
		return c.eof;
	};
	cursor.prototype.EOF = function() { return this.$val.EOF(); };
	cursor.Ptr.prototype.Next = function() {
		var c;
		c = this;
		if (c.eof) {
			$panic(new $String("cursor pointing to the end of the file"));
		}
		return c.s.Rune();
	};
	cursor.prototype.Next = function() { return this.$val.Next(); };
	cursor.Ptr.prototype.Err = function() {
		var c;
		c = this;
		return c.s.Err();
	};
	cursor.prototype.Err = function() { return this.$val.Err(); };
	newErrList = function() {
		var ret;
		ret = new errList.Ptr();
		ret.maxError = 20;
		return ret;
	};
	errList.Ptr.prototype.Log = function(p, f, args) {
		var lst, e;
		lst = this;
		if (lst.errs.$length < lst.maxError) {
			e = new Error.Ptr(p, fmt.Sprintf(f, args));
			lst.errs = $append(lst.errs, e);
		}
	};
	errList.prototype.Log = function(p, f, args) { return this.$val.Log(p, f, args); };
	errList.Ptr.prototype.Len = function() {
		var lst;
		lst = this;
		return lst.errs.$length;
	};
	errList.prototype.Len = function() { return this.$val.Len(); };
	errList.Ptr.prototype.Scan = function() {
		var lst, x, x$1;
		lst = this;
		if (lst.scanned) {
			lst.scanPtr = lst.scanPtr + (1) >> 0;
		} else {
			lst.scanned = true;
		}
		if (lst.scanPtr < lst.errs.$length) {
			lst.hold = (x = lst.errs, x$1 = lst.scanPtr, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1]));
			return true;
		}
		lst.hold = ($ptrType(Error)).nil;
		return false;
	};
	errList.prototype.Scan = function() { return this.$val.Scan(); };
	errList.Ptr.prototype.Error = function() {
		var lst;
		lst = this;
		if (lst.hold === ($ptrType(Error)).nil) {
			$panic(new $String("invalid operation"));
		}
		return lst.hold;
	};
	errList.prototype.Error = function() { return this.$val.Error(); };
	Error.Ptr.prototype.Error = function() {
		var e;
		e = this;
		if (!(e.Pos === ($ptrType(Pos)).nil)) {
			return fmt.Sprintf("%s: %s", new ($sliceType($emptyInterface))([new $String(e.Pos.StrRowOnly()), new $String(e.S)]));
		}
		return fmt.Sprintf("error: %s", new ($sliceType($emptyInterface))([new $String(e.S)]));
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	Error.Ptr.prototype.String = function() {
		var e;
		e = this;
		return e.Error();
	};
	Error.prototype.String = function() { return this.$val.String(); };
	isKeyword = function(s) {
		var _entry;
		return (_entry = keywords[s], _entry !== undefined ? _entry.v : false);
	};
	Lex = $pkg.Lex = function(file, r) {
		var ret;
		ret = new Lexer.Ptr();
		ret.c = newCursor(file, r);
		ret.errs = newErrList();
		return ret;
	};
	Lexer.Ptr.prototype.emitTok = function(t) {
		var lex;
		lex = this;
		lex.hold = t;
		if (!((lex.hold.Type === 1))) {
			lex.last = t;
		}
	};
	Lexer.prototype.emitTok = function(t) { return this.$val.emitTok(t); };
	Lexer.Ptr.prototype.Errors = function() {
		var lex;
		lex = this;
		return lex.errs;
	};
	Lexer.prototype.Errors = function() { return this.$val.Errors(); };
	Lexer.Ptr.prototype.emitType = function(t) {
		var lex, tok;
		lex = this;
		tok = lex.c.Token(t);
		lex.emitTok(tok);
	};
	Lexer.prototype.emitType = function(t) { return this.$val.emitType(t); };
	Lexer.Ptr.prototype.skipEndl = function() {
		var lex, t, _ref, lit;
		lex = this;
		if (lex.last === ($ptrType(Tok)).nil) {
			return true;
		}
		t = lex.last.Type;
		_ref = t;
		if (_ref === 3 || _ref === 7 || _ref === 4 || _ref === 5 || _ref === 6) {
			return false;
		} else if (_ref === 2) {
			lit = lex.last.Lit;
			return !(lit === "}" || lit === "]" || lit === ")");
		}
		return true;
	};
	Lexer.prototype.skipEndl = function() { return this.$val.skipEndl(); };
	Lexer.Ptr.prototype.scanInt = function() {
		var lex, r;
		lex = this;
		while (lex.c.Scan()) {
			r = lex.c.Next();
			if (!isDigit(r)) {
				break;
			}
		}
		lex.emitType(4);
	};
	Lexer.prototype.scanInt = function() { return this.$val.scanInt(); };
	Lexer.Ptr.prototype.scanIdent = function() {
		var lex, r;
		lex = this;
		while (lex.c.Scan()) {
			r = lex.c.Next();
			if (!isDigit(r) && !isLetter(r)) {
				break;
			}
		}
		if (!lex.NoKeyword && isKeyword(lex.c.Buffered())) {
			lex.emitType(7);
		} else {
			lex.emitType(3);
		}
	};
	Lexer.prototype.scanIdent = function() { return this.$val.scanIdent(); };
	Lexer.Ptr.prototype.scanLineComment = function() {
		var lex, r;
		lex = this;
		while (lex.c.Scan()) {
			r = lex.c.Next();
			if (r === 10) {
				break;
			}
		}
		lex.emitType(1);
	};
	Lexer.prototype.scanLineComment = function() { return this.$val.scanLineComment(); };
	Lexer.Ptr.prototype.scanBlockComment = function() {
		var lex, star, complete, r;
		lex = this;
		star = false;
		complete = false;
		while (lex.c.Scan()) {
			r = lex.c.Next();
			if (star && (r === 47)) {
				lex.c.Accept();
				complete = true;
				break;
			}
			star = r === 42;
		}
		lex.emitType(1);
		if (!complete) {
			lex.errs.Log(lex.c.Pos(), "eof in block comment", new ($sliceType($emptyInterface))([]));
		}
	};
	Lexer.prototype.scanBlockComment = function() { return this.$val.scanBlockComment(); };
	Lexer.Ptr.prototype.isWhite = function(r) {
		var lex;
		lex = this;
		if (isWhite(r)) {
			return true;
		}
		if (r === 10) {
			return lex.skipEndl();
		}
		return false;
	};
	Lexer.prototype.isWhite = function(r) { return this.$val.isWhite(r); };
	Lexer.Ptr.prototype.skipWhite = function() {
		var lex, r;
		lex = this;
		if (lex.c.EOF() || !lex.isWhite(lex.c.Next())) {
			return;
		}
		while (lex.c.Scan()) {
			r = lex.c.Next();
			if (!lex.isWhite(r)) {
				break;
			}
		}
		lex.c.Discard();
	};
	Lexer.prototype.skipWhite = function() { return this.$val.skipWhite(); };
	Lexer.Ptr.prototype.scanOperator = function() {
		var lex, r, r2;
		lex = this;
		r = lex.c.Next();
		if (lex.c.Scan() && (r === 47)) {
			r2 = lex.c.Next();
			if (r2 === 47) {
				lex.scanLineComment();
				return;
			} else if (r2 === 42) {
				lex.scanBlockComment();
				return;
			}
		}
		if ((r === 10) && lex.skipEndl()) {
			$panic(new $String("bug"));
		}
		lex.emitType(2);
	};
	Lexer.prototype.scanOperator = function() { return this.$val.scanOperator(); };
	Lexer.Ptr.prototype.scanInvalid = function() {
		var lex;
		lex = this;
		lex.c.Accept();
		lex.emitType(0);
	};
	Lexer.prototype.scanInvalid = function() { return this.$val.scanInvalid(); };
	Lexer.Ptr.prototype.Scan = function() {
		var lex, r;
		lex = this;
		lex.skipWhite();
		if (lex.c.EOF()) {
			lex.hold = ($ptrType(Tok)).nil;
			return false;
		}
		r = lex.c.Next();
		if (isDigit(r)) {
			lex.scanInt();
		} else if (isLetter(r)) {
			lex.scanIdent();
		} else if (isOperator(r)) {
			lex.scanOperator();
		} else {
			lex.scanInvalid();
		}
		return true;
	};
	Lexer.prototype.Scan = function() { return this.$val.Scan(); };
	Lexer.Ptr.prototype.EOF = function() {
		var lex;
		lex = this;
		return lex.hold === ($ptrType(Tok)).nil && lex.c.EOF();
	};
	Lexer.prototype.EOF = function() { return this.$val.EOF(); };
	Lexer.Ptr.prototype.Pos = function() {
		var lex;
		lex = this;
		return lex.c.Pos();
	};
	Lexer.prototype.Pos = function() { return this.$val.Pos(); };
	Lexer.Ptr.prototype.Token = function() {
		var lex;
		lex = this;
		return lex.hold;
	};
	Lexer.prototype.Token = function() { return this.$val.Token(); };
	Lexer.Ptr.prototype.IOErr = function() {
		var lex;
		lex = this;
		return lex.c.Err();
	};
	Lexer.prototype.IOErr = function() { return this.$val.IOErr(); };
	LexStr = $pkg.LexStr = function(file, s) {
		var r;
		r = ioutil.NopCloser(strings.NewReader(s));
		return Lex(file, r);
	};
	singleErr = function(e) {
		var errs;
		errs = newErrList();
		errs.Log(($ptrType(Pos)).nil, e.Error(), new ($sliceType($emptyInterface))([]));
		return errs;
	};
	newParser = function(lex) {
		var ret;
		ret = new parser.Ptr();
		ret.lex = lex;
		ret.errs = newErrList();
		return ret;
	};
	endStmtToken = function(t) {
		return (t.Type === 2) && (t.Lit === "\n" || t.Lit === ";" || t.Lit === "}");
	};
	endBlockToken = function(t) {
		return (t.Type === 2) && t.Lit === "}";
	};
	startBlockToken = function(t) {
		return (t.Type === 2) && t.Lit === "{";
	};
	parser.Ptr.prototype.parseEntry = function() {
		var p, t, b;
		p = this;
		t = ($ptrType(Tok)).nil;
		while (true) {
			if (!p.lex.Scan()) {
				return ($ptrType(Entry)).nil;
			}
			t = p.lex.Token();
			if (!((t.Type === 1))) {
				break;
			}
		}
		if (endStmtToken(t)) {
			return ($ptrType(Entry)).nil;
		}
		if (startBlockToken(t)) {
			b = p.parseBlock();
			if (p.lex.EOF() && !p.eofErrored) {
				p.errs.Log(p.lex.Pos(), "unexpected EOF", new ($sliceType($emptyInterface))([]));
				p.eofErrored = true;
			}
			return new Entry.Ptr(($ptrType(Tok)).nil, b);
		}
		return new Entry.Ptr(t, Block.nil);
	};
	parser.prototype.parseEntry = function() { return this.$val.parseEntry(); };
	parser.Ptr.prototype.parseStmt = function() {
		var p, ret, e;
		p = this;
		ret = Stmt.nil;
		while (true) {
			e = p.parseEntry();
			if (e === ($ptrType(Entry)).nil) {
				break;
			}
			ret = $append(ret, e);
		}
		if (ret === Stmt.nil) {
			if (p.lex.EOF() || endBlockToken(p.lex.Token())) {
				return Stmt.nil;
			} else {
				return Stmt.make(0);
			}
		}
		return ret;
	};
	parser.prototype.parseStmt = function() { return this.$val.parseStmt(); };
	parser.Ptr.prototype.parseBlock = function() {
		var p, b, s;
		p = this;
		b = Block.make(0, 8);
		while (true) {
			s = p.parseStmt();
			if (s === Stmt.nil) {
				break;
			}
			b = $append(b, s);
			if (p.lex.EOF() || endBlockToken(p.lex.Token())) {
				break;
			}
		}
		return b;
	};
	parser.prototype.parseBlock = function() { return this.$val.parseBlock(); };
	parser.Ptr.prototype.parse = function() {
		var p, ret, t;
		p = this;
		ret = p.parseBlock();
		if (!p.lex.EOF()) {
			t = p.lex.Token();
			if (!endBlockToken(t)) {
				$panic(new $String("bug"));
			}
			p.errs.Log(t.Pos, "unmatched }", new ($sliceType($emptyInterface))([]));
		}
		return ret;
	};
	parser.prototype.parse = function() { return this.$val.parse(); };
	Parse = $pkg.Parse = function(file, r) {
		var lex, p, ret, ioErr, lexErrs;
		lex = Lex(file, r);
		p = newParser(lex);
		ret = p.parse();
		ioErr = lex.IOErr();
		if (!($interfaceIsEqual(ioErr, $ifaceNil))) {
			return [Block.nil, singleErr(ioErr)];
		}
		lexErrs = lex.Errors();
		if (lexErrs.Len() > 0) {
			return [Block.nil, lexErrs];
		}
		if (p.errs.Len() > 0) {
			return [Block.nil, p.errs];
		}
		return [ret, $ifaceNil];
	};
	ParseStr = $pkg.ParseStr = function(file, s) {
		var r;
		r = ioutil.NopCloser(strings.NewReader(s));
		return Parse(file, r);
	};
	Pos.Ptr.prototype.String = function() {
		var p;
		p = this;
		return fmt.Sprintf("%s:%d:%d", new ($sliceType($emptyInterface))([new $String(p.File), new $Int(p.Row), new $Int(p.Col)]));
	};
	Pos.prototype.String = function() { return this.$val.String(); };
	Pos.Ptr.prototype.StrRowOnly = function() {
		var p;
		p = this;
		return fmt.Sprintf("%s:%d", new ($sliceType($emptyInterface))([new $String(p.File), new $Int(p.Row)]));
	};
	Pos.prototype.StrRowOnly = function() { return this.$val.StrRowOnly(); };
	newRuneScanner = function(rc) {
		var ret;
		ret = new runeScanner.Ptr();
		ret.r = bufio.NewReader(rc);
		ret.rc = rc;
		return ret;
	};
	runeScanner.Ptr.prototype.Pos = function() {
		var row = 0, col = 0, s, _tmp, _tmp$1;
		s = this;
		_tmp = s.row + 1 >> 0; _tmp$1 = s.col + 1 >> 0; row = _tmp; col = _tmp$1;
		return [row, col];
	};
	runeScanner.prototype.Pos = function() { return this.$val.Pos(); };
	runeScanner.Ptr.prototype.Scan = function() {
		var s, wasEndl, _tuple, e;
		s = this;
		if (s.closed) {
			return false;
		}
		wasEndl = s.hold === 10;
		_tuple = s.r.ReadRune(); s.hold = _tuple[0]; s.e = _tuple[2];
		if (!($interfaceIsEqual(s.e, $ifaceNil))) {
			e = s.rc.Close();
			if ($interfaceIsEqual(s.e, io.EOF)) {
				s.e = e;
			}
			s.closed = true;
			return false;
		}
		if (wasEndl) {
			s.row = s.row + (1) >> 0;
			s.col = 0;
		} else if (s.scanned) {
			s.col = s.col + (1) >> 0;
		} else {
			s.scanned = true;
		}
		return true;
	};
	runeScanner.prototype.Scan = function() { return this.$val.Scan(); };
	runeScanner.Ptr.prototype.Err = function() {
		var s;
		s = this;
		return s.e;
	};
	runeScanner.prototype.Err = function() { return this.$val.Err(); };
	runeScanner.Ptr.prototype.Rune = function() {
		var s;
		s = this;
		if (s.closed) {
			$panic(new $String("scanner closed"));
		}
		if (!($interfaceIsEqual(s.e, $ifaceNil))) {
			$panic(new $String("scanning error encountered"));
		}
		if (!s.scanned) {
			$panic(new $String("not scanned yet"));
		}
		return s.hold;
	};
	runeScanner.prototype.Rune = function() { return this.$val.Rune(); };
	isDigit = function(r) {
		return r >= 48 && r <= 57;
	};
	isLetter = function(r) {
		if (r >= 97 && r <= 122) {
			return true;
		}
		if (r >= 65 && r <= 90) {
			return true;
		}
		return false;
	};
	isWhite = function(r) {
		return (r === 32) || (r === 9) || (r === 13);
	};
	isOperator = function(r) {
		if (r >= 33 && r <= 47) {
			return true;
		}
		if (r >= 58 && r <= 64) {
			return true;
		}
		if (r >= 91 && r <= 96) {
			return true;
		}
		if (r >= 123 && r <= 126) {
			return true;
		}
		if (r === 10) {
			return true;
		}
		return false;
	};
	Type.prototype.String = function() {
		var t, _tuple, _entry, ret, found;
		t = this.$val !== undefined ? this.$val : this;
		_tuple = (_entry = typeStr[t], _entry !== undefined ? [_entry.v, true] : ["", false]); ret = _tuple[0]; found = _tuple[1];
		if (!found) {
			ret = fmt.Sprintf("type-%d", new ($sliceType($emptyInterface))([new Type(t)]));
		}
		return ret;
	};
	$ptrType(Type).prototype.String = function() { return new Type(this.$get()).String(); };
	Type.prototype.ShortStr = function() {
		var t, _tuple, _entry, ret, found;
		t = this.$val !== undefined ? this.$val : this;
		_tuple = (_entry = typeShortStr[t], _entry !== undefined ? [_entry.v, true] : ["", false]); ret = _tuple[0]; found = _tuple[1];
		if (!found) {
			ret = fmt.Sprintf("type-%d", new ($sliceType($emptyInterface))([new Type(t)]));
		}
		return ret;
	};
	$ptrType(Type).prototype.ShortStr = function() { return new Type(this.$get()).ShortStr(); };
	Tok.Ptr.prototype.String = function() {
		var t;
		t = this;
		return fmt.Sprintf("%s: <%s> %q", new ($sliceType($emptyInterface))([new $String(t.Pos.String()), new $String((new Type(t.Type)).String()), new $String(t.Lit)]));
	};
	Tok.prototype.String = function() { return this.$val.String(); };
	$pkg.$init = function() {
		Block.init(Stmt);
		Stmt.init(($ptrType(Entry)));
		Entry.init([["Tok", "Tok", "", ($ptrType(Tok)), ""], ["Block", "Block", "", Block, ""]]);
		($ptrType(cursor)).methods = [["Accept", "Accept", "", $funcType([], [$Bool], false), -1], ["Buffered", "Buffered", "", $funcType([], [$String], false), -1], ["Discard", "Discard", "", $funcType([], [], false), -1], ["EOF", "EOF", "", $funcType([], [$Bool], false), -1], ["Err", "Err", "", $funcType([], [$error], false), -1], ["Next", "Next", "", $funcType([], [$Int32], false), -1], ["Pos", "Pos", "", $funcType([], [($ptrType(Pos))], false), -1], ["Scan", "Scan", "", $funcType([], [$Bool], false), -1], ["Token", "Token", "", $funcType([Type], [($ptrType(Tok))], false), -1], ["resetBuf", "resetBuf", "github.com/h8liu/xlang/parser", $funcType([], [], false), -1]];
		cursor.init([["file", "file", "github.com/h8liu/xlang/parser", $String, ""], ["s", "s", "github.com/h8liu/xlang/parser", ($ptrType(runeScanner)), ""], ["buf", "buf", "github.com/h8liu/xlang/parser", ($ptrType(bytes.Buffer)), ""], ["row", "row", "github.com/h8liu/xlang/parser", $Int, ""], ["col", "col", "github.com/h8liu/xlang/parser", $Int, ""], ["head", "head", "github.com/h8liu/xlang/parser", $Int32, ""], ["eof", "eof", "github.com/h8liu/xlang/parser", $Bool, ""]]);
		ErrList.init([["Error", "Error", "", $funcType([], [($ptrType(Error))], false)], ["Len", "Len", "", $funcType([], [$Int], false)], ["Scan", "Scan", "", $funcType([], [$Bool], false)]]);
		($ptrType(errList)).methods = [["Error", "Error", "", $funcType([], [($ptrType(Error))], false), -1], ["Len", "Len", "", $funcType([], [$Int], false), -1], ["Log", "Log", "", $funcType([($ptrType(Pos)), $String, ($sliceType($emptyInterface))], [], true), -1], ["Scan", "Scan", "", $funcType([], [$Bool], false), -1]];
		errList.init([["maxError", "maxError", "github.com/h8liu/xlang/parser", $Int, ""], ["errs", "errs", "github.com/h8liu/xlang/parser", ($sliceType(($ptrType(Error)))), ""], ["scanned", "scanned", "github.com/h8liu/xlang/parser", $Bool, ""], ["scanPtr", "scanPtr", "github.com/h8liu/xlang/parser", $Int, ""], ["hold", "hold", "github.com/h8liu/xlang/parser", ($ptrType(Error)), ""]]);
		Error.methods = [["StrRowOnly", "StrRowOnly", "", $funcType([], [$String], false), 0]];
		($ptrType(Error)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1], ["StrRowOnly", "StrRowOnly", "", $funcType([], [$String], false), 0], ["String", "String", "", $funcType([], [$String], false), -1]];
		Error.init([["Pos", "", "", ($ptrType(Pos)), ""], ["S", "S", "", $String, ""]]);
		($ptrType(Lexer)).methods = [["EOF", "EOF", "", $funcType([], [$Bool], false), -1], ["Errors", "Errors", "", $funcType([], [ErrList], false), -1], ["IOErr", "IOErr", "", $funcType([], [$error], false), -1], ["Pos", "Pos", "", $funcType([], [($ptrType(Pos))], false), -1], ["Scan", "Scan", "", $funcType([], [$Bool], false), -1], ["Token", "Token", "", $funcType([], [($ptrType(Tok))], false), -1], ["emitTok", "emitTok", "github.com/h8liu/xlang/parser", $funcType([($ptrType(Tok))], [], false), -1], ["emitType", "emitType", "github.com/h8liu/xlang/parser", $funcType([Type], [], false), -1], ["isWhite", "isWhite", "github.com/h8liu/xlang/parser", $funcType([$Int32], [$Bool], false), -1], ["scanBlockComment", "scanBlockComment", "github.com/h8liu/xlang/parser", $funcType([], [], false), -1], ["scanIdent", "scanIdent", "github.com/h8liu/xlang/parser", $funcType([], [], false), -1], ["scanInt", "scanInt", "github.com/h8liu/xlang/parser", $funcType([], [], false), -1], ["scanInvalid", "scanInvalid", "github.com/h8liu/xlang/parser", $funcType([], [], false), -1], ["scanLineComment", "scanLineComment", "github.com/h8liu/xlang/parser", $funcType([], [], false), -1], ["scanOperator", "scanOperator", "github.com/h8liu/xlang/parser", $funcType([], [], false), -1], ["skipEndl", "skipEndl", "github.com/h8liu/xlang/parser", $funcType([], [$Bool], false), -1], ["skipWhite", "skipWhite", "github.com/h8liu/xlang/parser", $funcType([], [], false), -1]];
		Lexer.init([["c", "c", "github.com/h8liu/xlang/parser", ($ptrType(cursor)), ""], ["last", "last", "github.com/h8liu/xlang/parser", ($ptrType(Tok)), ""], ["hold", "hold", "github.com/h8liu/xlang/parser", ($ptrType(Tok)), ""], ["errs", "errs", "github.com/h8liu/xlang/parser", ($ptrType(errList)), ""], ["NoKeyword", "NoKeyword", "", $Bool, ""]]);
		($ptrType(parser)).methods = [["parse", "parse", "github.com/h8liu/xlang/parser", $funcType([], [Block], false), -1], ["parseBlock", "parseBlock", "github.com/h8liu/xlang/parser", $funcType([], [Block], false), -1], ["parseEntry", "parseEntry", "github.com/h8liu/xlang/parser", $funcType([], [($ptrType(Entry))], false), -1], ["parseStmt", "parseStmt", "github.com/h8liu/xlang/parser", $funcType([], [Stmt], false), -1]];
		parser.init([["lex", "lex", "github.com/h8liu/xlang/parser", ($ptrType(Lexer)), ""], ["block", "block", "github.com/h8liu/xlang/parser", Block, ""], ["errs", "errs", "github.com/h8liu/xlang/parser", ($ptrType(errList)), ""], ["eofErrored", "eofErrored", "github.com/h8liu/xlang/parser", $Bool, ""]]);
		($ptrType(Pos)).methods = [["StrRowOnly", "StrRowOnly", "", $funcType([], [$String], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		Pos.init([["File", "File", "", $String, ""], ["Row", "Row", "", $Int, ""], ["Col", "Col", "", $Int, ""]]);
		($ptrType(runeScanner)).methods = [["Err", "Err", "", $funcType([], [$error], false), -1], ["Pos", "Pos", "", $funcType([], [$Int, $Int], false), -1], ["Rune", "Rune", "", $funcType([], [$Int32], false), -1], ["Scan", "Scan", "", $funcType([], [$Bool], false), -1]];
		runeScanner.init([["rc", "rc", "github.com/h8liu/xlang/parser", io.ReadCloser, ""], ["r", "r", "github.com/h8liu/xlang/parser", ($ptrType(bufio.Reader)), ""], ["row", "row", "github.com/h8liu/xlang/parser", $Int, ""], ["col", "col", "github.com/h8liu/xlang/parser", $Int, ""], ["closed", "closed", "github.com/h8liu/xlang/parser", $Bool, ""], ["scanned", "scanned", "github.com/h8liu/xlang/parser", $Bool, ""], ["hold", "hold", "github.com/h8liu/xlang/parser", $Int32, ""], ["e", "e", "github.com/h8liu/xlang/parser", $error, ""]]);
		Type.methods = [["ShortStr", "ShortStr", "", $funcType([], [$String], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(Type)).methods = [["ShortStr", "ShortStr", "", $funcType([], [$String], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		Tok.methods = [["StrRowOnly", "StrRowOnly", "", $funcType([], [$String], false), 2]];
		($ptrType(Tok)).methods = [["StrRowOnly", "StrRowOnly", "", $funcType([], [$String], false), 2], ["String", "String", "", $funcType([], [$String], false), -1]];
		Tok.init([["Type", "Type", "", Type, ""], ["Lit", "Lit", "", $String, ""], ["Pos", "", "", ($ptrType(Pos)), ""]]);
		keywords = (function() {
			var ret, _ref, _i, k, _key;
			ret = new $Map();
			_ref = new ($sliceType($String))(["func", "var", "import", "for", "if", "else", "return"]);
			_i = 0;
			while (_i < _ref.$length) {
				k = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
				_key = k; (ret || $throwRuntimeError("assignment to entry in nil map"))[_key] = { k: _key, v: true };
				_i++;
			}
			return ret;
		})();
		typeStr = (_map = new $Map(), _key = 0, _map[_key] = { k: _key, v: "invalid" }, _key = 1, _map[_key] = { k: _key, v: "comment" }, _key = 2, _map[_key] = { k: _key, v: "operator" }, _key = 3, _map[_key] = { k: _key, v: "ident" }, _key = 7, _map[_key] = { k: _key, v: "keyword" }, _key = 4, _map[_key] = { k: _key, v: "int" }, _key = 5, _map[_key] = { k: _key, v: "float" }, _key = 6, _map[_key] = { k: _key, v: "string" }, _map);
		typeShortStr = (_map$1 = new $Map(), _key$1 = 0, _map$1[_key$1] = { k: _key$1, v: "iv" }, _key$1 = 1, _map$1[_key$1] = { k: _key$1, v: "cm" }, _key$1 = 2, _map$1[_key$1] = { k: _key$1, v: "op" }, _key$1 = 3, _map$1[_key$1] = { k: _key$1, v: "id" }, _key$1 = 7, _map$1[_key$1] = { k: _key$1, v: "kw" }, _key$1 = 4, _map$1[_key$1] = { k: _key$1, v: "i" }, _key$1 = 5, _map$1[_key$1] = { k: _key$1, v: "f" }, _key$1 = 6, _map$1[_key$1] = { k: _key$1, v: "str" }, _map$1);
	};
	return $pkg;
})();
$packages["encoding"] = (function() {
	var $pkg = {}, TextMarshaler;
	TextMarshaler = $pkg.TextMarshaler = $newType(8, "Interface", "encoding.TextMarshaler", "TextMarshaler", "encoding", null);
	$pkg.$init = function() {
		TextMarshaler.init([["MarshalText", "MarshalText", "", $funcType([], [($sliceType($Uint8)), $error], false)]]);
	};
	return $pkg;
})();
$packages["flag"] = (function() {
	var $pkg = {}, errors = $packages["errors"], fmt = $packages["fmt"], io = $packages["io"], os = $packages["os"], sort = $packages["sort"], strconv = $packages["strconv"], time = $packages["time"], boolValue, boolFlag, intValue, int64Value, uintValue, uint64Value, stringValue, float64Value, durationValue, Value, ErrorHandling, FlagSet, Flag, x, newBoolValue, newIntValue, newInt64Value, newUintValue, newUint64Value, newStringValue, newFloat64Value, newDurationValue, sortFlags, PrintDefaults, defaultUsage, Bool, Int, String, Duration, Parse, NewFlagSet;
	boolValue = $pkg.boolValue = $newType(1, "Bool", "flag.boolValue", "boolValue", "flag", null);
	boolFlag = $pkg.boolFlag = $newType(8, "Interface", "flag.boolFlag", "boolFlag", "flag", null);
	intValue = $pkg.intValue = $newType(4, "Int", "flag.intValue", "intValue", "flag", null);
	int64Value = $pkg.int64Value = $newType(8, "Int64", "flag.int64Value", "int64Value", "flag", null);
	uintValue = $pkg.uintValue = $newType(4, "Uint", "flag.uintValue", "uintValue", "flag", null);
	uint64Value = $pkg.uint64Value = $newType(8, "Uint64", "flag.uint64Value", "uint64Value", "flag", null);
	stringValue = $pkg.stringValue = $newType(8, "String", "flag.stringValue", "stringValue", "flag", null);
	float64Value = $pkg.float64Value = $newType(8, "Float64", "flag.float64Value", "float64Value", "flag", null);
	durationValue = $pkg.durationValue = $newType(8, "Int64", "flag.durationValue", "durationValue", "flag", null);
	Value = $pkg.Value = $newType(8, "Interface", "flag.Value", "Value", "flag", null);
	ErrorHandling = $pkg.ErrorHandling = $newType(4, "Int", "flag.ErrorHandling", "ErrorHandling", "flag", null);
	FlagSet = $pkg.FlagSet = $newType(0, "Struct", "flag.FlagSet", "FlagSet", "flag", function(Usage_, name_, parsed_, actual_, formal_, args_, errorHandling_, output_) {
		this.$val = this;
		this.Usage = Usage_ !== undefined ? Usage_ : $throwNilPointerError;
		this.name = name_ !== undefined ? name_ : "";
		this.parsed = parsed_ !== undefined ? parsed_ : false;
		this.actual = actual_ !== undefined ? actual_ : false;
		this.formal = formal_ !== undefined ? formal_ : false;
		this.args = args_ !== undefined ? args_ : ($sliceType($String)).nil;
		this.errorHandling = errorHandling_ !== undefined ? errorHandling_ : 0;
		this.output = output_ !== undefined ? output_ : $ifaceNil;
	});
	Flag = $pkg.Flag = $newType(0, "Struct", "flag.Flag", "Flag", "flag", function(Name_, Usage_, Value_, DefValue_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.Usage = Usage_ !== undefined ? Usage_ : "";
		this.Value = Value_ !== undefined ? Value_ : $ifaceNil;
		this.DefValue = DefValue_ !== undefined ? DefValue_ : "";
	});
	newBoolValue = function(val, p) {
		p.$set(val);
		return new ($ptrType(boolValue))(p.$get, p.$set);
	};
	$ptrType(boolValue).prototype.Set = function(s) {
		var b, _tuple, v, err;
		b = this;
		_tuple = strconv.ParseBool(s); v = _tuple[0]; err = _tuple[1];
		b.$set(v);
		return err;
	};
	$ptrType(boolValue).prototype.Get = function() {
		var b;
		b = this;
		return new $Bool(b.$get());
	};
	$ptrType(boolValue).prototype.String = function() {
		var b;
		b = this;
		return fmt.Sprintf("%v", new ($sliceType($emptyInterface))([new boolValue(b.$get())]));
	};
	$ptrType(boolValue).prototype.IsBoolFlag = function() {
		var b;
		b = this;
		return true;
	};
	newIntValue = function(val, p) {
		p.$set(val);
		return new ($ptrType(intValue))(p.$get, p.$set);
	};
	$ptrType(intValue).prototype.Set = function(s) {
		var i, _tuple, v, err;
		i = this;
		_tuple = strconv.ParseInt(s, 0, 64); v = _tuple[0]; err = _tuple[1];
		i.$set(((v.$low + ((v.$high >> 31) * 4294967296)) >> 0));
		return err;
	};
	$ptrType(intValue).prototype.Get = function() {
		var i;
		i = this;
		return new $Int((i.$get() >> 0));
	};
	$ptrType(intValue).prototype.String = function() {
		var i;
		i = this;
		return fmt.Sprintf("%v", new ($sliceType($emptyInterface))([new intValue(i.$get())]));
	};
	newInt64Value = function(val, p) {
		p.$set(val);
		return new ($ptrType(int64Value))(p.$get, p.$set);
	};
	$ptrType(int64Value).prototype.Set = function(s) {
		var i, _tuple, v, err;
		i = this;
		_tuple = strconv.ParseInt(s, 0, 64); v = _tuple[0]; err = _tuple[1];
		i.$set(new int64Value(v.$high, v.$low));
		return err;
	};
	$ptrType(int64Value).prototype.Get = function() {
		var i, x$1;
		i = this;
		return (x$1 = i.$get(), new $Int64(x$1.$high, x$1.$low));
	};
	$ptrType(int64Value).prototype.String = function() {
		var i;
		i = this;
		return fmt.Sprintf("%v", new ($sliceType($emptyInterface))([i.$get()]));
	};
	newUintValue = function(val, p) {
		p.$set(val);
		return new ($ptrType(uintValue))(p.$get, p.$set);
	};
	$ptrType(uintValue).prototype.Set = function(s) {
		var i, _tuple, v, err;
		i = this;
		_tuple = strconv.ParseUint(s, 0, 64); v = _tuple[0]; err = _tuple[1];
		i.$set((v.$low >>> 0));
		return err;
	};
	$ptrType(uintValue).prototype.Get = function() {
		var i;
		i = this;
		return new $Uint((i.$get() >>> 0));
	};
	$ptrType(uintValue).prototype.String = function() {
		var i;
		i = this;
		return fmt.Sprintf("%v", new ($sliceType($emptyInterface))([new uintValue(i.$get())]));
	};
	newUint64Value = function(val, p) {
		p.$set(val);
		return new ($ptrType(uint64Value))(p.$get, p.$set);
	};
	$ptrType(uint64Value).prototype.Set = function(s) {
		var i, _tuple, v, err;
		i = this;
		_tuple = strconv.ParseUint(s, 0, 64); v = _tuple[0]; err = _tuple[1];
		i.$set(new uint64Value(v.$high, v.$low));
		return err;
	};
	$ptrType(uint64Value).prototype.Get = function() {
		var i, x$1;
		i = this;
		return (x$1 = i.$get(), new $Uint64(x$1.$high, x$1.$low));
	};
	$ptrType(uint64Value).prototype.String = function() {
		var i;
		i = this;
		return fmt.Sprintf("%v", new ($sliceType($emptyInterface))([i.$get()]));
	};
	newStringValue = function(val, p) {
		p.$set(val);
		return new ($ptrType(stringValue))(p.$get, p.$set);
	};
	$ptrType(stringValue).prototype.Set = function(val) {
		var s;
		s = this;
		s.$set(val);
		return $ifaceNil;
	};
	$ptrType(stringValue).prototype.Get = function() {
		var s;
		s = this;
		return new $String(s.$get());
	};
	$ptrType(stringValue).prototype.String = function() {
		var s;
		s = this;
		return fmt.Sprintf("%s", new ($sliceType($emptyInterface))([new stringValue(s.$get())]));
	};
	newFloat64Value = function(val, p) {
		p.$set(val);
		return new ($ptrType(float64Value))(p.$get, p.$set);
	};
	$ptrType(float64Value).prototype.Set = function(s) {
		var f, _tuple, v, err;
		f = this;
		_tuple = strconv.ParseFloat(s, 64); v = _tuple[0]; err = _tuple[1];
		f.$set(v);
		return err;
	};
	$ptrType(float64Value).prototype.Get = function() {
		var f;
		f = this;
		return new $Float64(f.$get());
	};
	$ptrType(float64Value).prototype.String = function() {
		var f;
		f = this;
		return fmt.Sprintf("%v", new ($sliceType($emptyInterface))([new float64Value(f.$get())]));
	};
	newDurationValue = function(val, p) {
		p.$set(val);
		return new ($ptrType(durationValue))(p.$get, p.$set);
	};
	$ptrType(durationValue).prototype.Set = function(s) {
		var d, _tuple, v, err;
		d = this;
		_tuple = time.ParseDuration(s); v = _tuple[0]; err = _tuple[1];
		d.$set(new durationValue(v.$high, v.$low));
		return err;
	};
	$ptrType(durationValue).prototype.Get = function() {
		var d, x$1;
		d = this;
		return (x$1 = d.$get(), new time.Duration(x$1.$high, x$1.$low));
	};
	$ptrType(durationValue).prototype.String = function() {
		var d;
		d = this;
		return new ($ptrType(time.Duration))(d.$get, d.$set).String();
	};
	sortFlags = function(flags) {
		var list, i, _ref, _i, _keys, _entry, f, result, _ref$1, _i$1, i$1, name, _entry$1;
		list = sort.StringSlice.make($keys(flags).length);
		i = 0;
		_ref = flags;
		_i = 0;
		_keys = $keys(_ref);
		while (_i < _keys.length) {
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				continue;
			}
			f = _entry.v;
			(i < 0 || i >= list.$length) ? $throwRuntimeError("index out of range") : list.$array[list.$offset + i] = f.Name;
			i = i + (1) >> 0;
			_i++;
		}
		list.Sort();
		result = ($sliceType(($ptrType(Flag)))).make(list.$length);
		_ref$1 = list;
		_i$1 = 0;
		while (_i$1 < _ref$1.$length) {
			i$1 = _i$1;
			name = ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i$1]);
			(i$1 < 0 || i$1 >= result.$length) ? $throwRuntimeError("index out of range") : result.$array[result.$offset + i$1] = (_entry$1 = flags[name], _entry$1 !== undefined ? _entry$1.v : ($ptrType(Flag)).nil);
			_i$1++;
		}
		return result;
	};
	FlagSet.Ptr.prototype.out = function() {
		var f;
		f = this;
		if ($interfaceIsEqual(f.output, $ifaceNil)) {
			return os.Stderr;
		}
		return f.output;
	};
	FlagSet.prototype.out = function() { return this.$val.out(); };
	FlagSet.Ptr.prototype.SetOutput = function(output) {
		var f;
		f = this;
		f.output = output;
	};
	FlagSet.prototype.SetOutput = function(output) { return this.$val.SetOutput(output); };
	FlagSet.Ptr.prototype.VisitAll = function(fn) {
		var f, _ref, _i, flag;
		f = this;
		_ref = sortFlags(f.formal);
		_i = 0;
		while (_i < _ref.$length) {
			flag = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			fn(flag);
			_i++;
		}
	};
	FlagSet.prototype.VisitAll = function(fn) { return this.$val.VisitAll(fn); };
	FlagSet.Ptr.prototype.Visit = function(fn) {
		var f, _ref, _i, flag;
		f = this;
		_ref = sortFlags(f.actual);
		_i = 0;
		while (_i < _ref.$length) {
			flag = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			fn(flag);
			_i++;
		}
	};
	FlagSet.prototype.Visit = function(fn) { return this.$val.Visit(fn); };
	FlagSet.Ptr.prototype.Lookup = function(name) {
		var f, _entry;
		f = this;
		return (_entry = f.formal[name], _entry !== undefined ? _entry.v : ($ptrType(Flag)).nil);
	};
	FlagSet.prototype.Lookup = function(name) { return this.$val.Lookup(name); };
	FlagSet.Ptr.prototype.Set = function(name, value) {
		var f, _tuple, _entry, flag, ok, err, _key;
		f = this;
		_tuple = (_entry = f.formal[name], _entry !== undefined ? [_entry.v, true] : [($ptrType(Flag)).nil, false]); flag = _tuple[0]; ok = _tuple[1];
		if (!ok) {
			return fmt.Errorf("no such flag -%v", new ($sliceType($emptyInterface))([new $String(name)]));
		}
		err = flag.Value.Set(value);
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return err;
		}
		if (f.actual === false) {
			f.actual = new $Map();
		}
		_key = name; (f.actual || $throwRuntimeError("assignment to entry in nil map"))[_key] = { k: _key, v: flag };
		return $ifaceNil;
	};
	FlagSet.prototype.Set = function(name, value) { return this.$val.Set(name, value); };
	FlagSet.Ptr.prototype.PrintDefaults = function() {
		var f;
		f = this;
		f.VisitAll((function(flag) {
			var format, _tuple, ok;
			format = "  -%s=%s: %s\n";
			_tuple = $assertType(flag.Value, ($ptrType(stringValue)), true); ok = _tuple[1];
			if (ok) {
				format = "  -%s=%q: %s\n";
			}
			fmt.Fprintf(f.out(), format, new ($sliceType($emptyInterface))([new $String(flag.Name), new $String(flag.DefValue), new $String(flag.Usage)]));
		}));
	};
	FlagSet.prototype.PrintDefaults = function() { return this.$val.PrintDefaults(); };
	PrintDefaults = $pkg.PrintDefaults = function() {
		$pkg.CommandLine.PrintDefaults();
	};
	defaultUsage = function(f) {
		if (f.name === "") {
			fmt.Fprintf(f.out(), "Usage:\n", new ($sliceType($emptyInterface))([]));
		} else {
			fmt.Fprintf(f.out(), "Usage of %s:\n", new ($sliceType($emptyInterface))([new $String(f.name)]));
		}
		f.PrintDefaults();
	};
	FlagSet.Ptr.prototype.NFlag = function() {
		var f;
		f = this;
		return $keys(f.actual).length;
	};
	FlagSet.prototype.NFlag = function() { return this.$val.NFlag(); };
	FlagSet.Ptr.prototype.Arg = function(i) {
		var f, x$1;
		f = this;
		if (i < 0 || i >= f.args.$length) {
			return "";
		}
		return (x$1 = f.args, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
	};
	FlagSet.prototype.Arg = function(i) { return this.$val.Arg(i); };
	FlagSet.Ptr.prototype.NArg = function() {
		var f;
		f = this;
		return f.args.$length;
	};
	FlagSet.prototype.NArg = function() { return this.$val.NArg(); };
	FlagSet.Ptr.prototype.Args = function() {
		var f;
		f = this;
		return f.args;
	};
	FlagSet.prototype.Args = function() { return this.$val.Args(); };
	FlagSet.Ptr.prototype.BoolVar = function(p, name, value, usage) {
		var f;
		f = this;
		f.Var(newBoolValue(value, p), name, usage);
	};
	FlagSet.prototype.BoolVar = function(p, name, value, usage) { return this.$val.BoolVar(p, name, value, usage); };
	FlagSet.Ptr.prototype.Bool = function(name, value, usage) {
		var f, p;
		f = this;
		p = $newDataPointer(false, ($ptrType($Bool)));
		f.BoolVar(p, name, value, usage);
		return p;
	};
	FlagSet.prototype.Bool = function(name, value, usage) { return this.$val.Bool(name, value, usage); };
	Bool = $pkg.Bool = function(name, value, usage) {
		return $pkg.CommandLine.Bool(name, value, usage);
	};
	FlagSet.Ptr.prototype.IntVar = function(p, name, value, usage) {
		var f;
		f = this;
		f.Var(newIntValue(value, p), name, usage);
	};
	FlagSet.prototype.IntVar = function(p, name, value, usage) { return this.$val.IntVar(p, name, value, usage); };
	FlagSet.Ptr.prototype.Int = function(name, value, usage) {
		var f, p;
		f = this;
		p = $newDataPointer(0, ($ptrType($Int)));
		f.IntVar(p, name, value, usage);
		return p;
	};
	FlagSet.prototype.Int = function(name, value, usage) { return this.$val.Int(name, value, usage); };
	Int = $pkg.Int = function(name, value, usage) {
		return $pkg.CommandLine.Int(name, value, usage);
	};
	FlagSet.Ptr.prototype.Int64Var = function(p, name, value, usage) {
		var f;
		f = this;
		f.Var(newInt64Value(value, p), name, usage);
	};
	FlagSet.prototype.Int64Var = function(p, name, value, usage) { return this.$val.Int64Var(p, name, value, usage); };
	FlagSet.Ptr.prototype.Int64 = function(name, value, usage) {
		var f, p;
		f = this;
		p = $newDataPointer(new $Int64(0, 0), ($ptrType($Int64)));
		f.Int64Var(p, name, value, usage);
		return p;
	};
	FlagSet.prototype.Int64 = function(name, value, usage) { return this.$val.Int64(name, value, usage); };
	FlagSet.Ptr.prototype.UintVar = function(p, name, value, usage) {
		var f;
		f = this;
		f.Var(newUintValue(value, p), name, usage);
	};
	FlagSet.prototype.UintVar = function(p, name, value, usage) { return this.$val.UintVar(p, name, value, usage); };
	FlagSet.Ptr.prototype.Uint = function(name, value, usage) {
		var f, p;
		f = this;
		p = $newDataPointer(0, ($ptrType($Uint)));
		f.UintVar(p, name, value, usage);
		return p;
	};
	FlagSet.prototype.Uint = function(name, value, usage) { return this.$val.Uint(name, value, usage); };
	FlagSet.Ptr.prototype.Uint64Var = function(p, name, value, usage) {
		var f;
		f = this;
		f.Var(newUint64Value(value, p), name, usage);
	};
	FlagSet.prototype.Uint64Var = function(p, name, value, usage) { return this.$val.Uint64Var(p, name, value, usage); };
	FlagSet.Ptr.prototype.Uint64 = function(name, value, usage) {
		var f, p;
		f = this;
		p = $newDataPointer(new $Uint64(0, 0), ($ptrType($Uint64)));
		f.Uint64Var(p, name, value, usage);
		return p;
	};
	FlagSet.prototype.Uint64 = function(name, value, usage) { return this.$val.Uint64(name, value, usage); };
	FlagSet.Ptr.prototype.StringVar = function(p, name, value, usage) {
		var f;
		f = this;
		f.Var(newStringValue(value, p), name, usage);
	};
	FlagSet.prototype.StringVar = function(p, name, value, usage) { return this.$val.StringVar(p, name, value, usage); };
	FlagSet.Ptr.prototype.String = function(name, value, usage) {
		var f, p;
		f = this;
		p = $newDataPointer("", ($ptrType($String)));
		f.StringVar(p, name, value, usage);
		return p;
	};
	FlagSet.prototype.String = function(name, value, usage) { return this.$val.String(name, value, usage); };
	String = $pkg.String = function(name, value, usage) {
		return $pkg.CommandLine.String(name, value, usage);
	};
	FlagSet.Ptr.prototype.Float64Var = function(p, name, value, usage) {
		var f;
		f = this;
		f.Var(newFloat64Value(value, p), name, usage);
	};
	FlagSet.prototype.Float64Var = function(p, name, value, usage) { return this.$val.Float64Var(p, name, value, usage); };
	FlagSet.Ptr.prototype.Float64 = function(name, value, usage) {
		var f, p;
		f = this;
		p = $newDataPointer(0, ($ptrType($Float64)));
		f.Float64Var(p, name, value, usage);
		return p;
	};
	FlagSet.prototype.Float64 = function(name, value, usage) { return this.$val.Float64(name, value, usage); };
	FlagSet.Ptr.prototype.DurationVar = function(p, name, value, usage) {
		var f;
		f = this;
		f.Var(newDurationValue(value, p), name, usage);
	};
	FlagSet.prototype.DurationVar = function(p, name, value, usage) { return this.$val.DurationVar(p, name, value, usage); };
	FlagSet.Ptr.prototype.Duration = function(name, value, usage) {
		var f, p;
		f = this;
		p = $newDataPointer(new time.Duration(0, 0), ($ptrType(time.Duration)));
		f.DurationVar(p, name, value, usage);
		return p;
	};
	FlagSet.prototype.Duration = function(name, value, usage) { return this.$val.Duration(name, value, usage); };
	Duration = $pkg.Duration = function(name, value, usage) {
		return $pkg.CommandLine.Duration(name, value, usage);
	};
	FlagSet.Ptr.prototype.Var = function(value, name, usage) {
		var f, flag, _tuple, _entry, alreadythere, msg, _key;
		f = this;
		flag = new Flag.Ptr(name, usage, value, value.String());
		_tuple = (_entry = f.formal[name], _entry !== undefined ? [_entry.v, true] : [($ptrType(Flag)).nil, false]); alreadythere = _tuple[1];
		if (alreadythere) {
			msg = "";
			if (f.name === "") {
				msg = fmt.Sprintf("flag redefined: %s", new ($sliceType($emptyInterface))([new $String(name)]));
			} else {
				msg = fmt.Sprintf("%s flag redefined: %s", new ($sliceType($emptyInterface))([new $String(f.name), new $String(name)]));
			}
			fmt.Fprintln(f.out(), new ($sliceType($emptyInterface))([new $String(msg)]));
			$panic(new $String(msg));
		}
		if (f.formal === false) {
			f.formal = new $Map();
		}
		_key = name; (f.formal || $throwRuntimeError("assignment to entry in nil map"))[_key] = { k: _key, v: flag };
	};
	FlagSet.prototype.Var = function(value, name, usage) { return this.$val.Var(value, name, usage); };
	FlagSet.Ptr.prototype.failf = function(format, a) {
		var f, err;
		f = this;
		err = fmt.Errorf(format, a);
		fmt.Fprintln(f.out(), new ($sliceType($emptyInterface))([err]));
		f.usage();
		return err;
	};
	FlagSet.prototype.failf = function(format, a) { return this.$val.failf(format, a); };
	FlagSet.Ptr.prototype.usage = function() {
		var f;
		f = this;
		if (f === $pkg.CommandLine) {
			$pkg.Usage();
		} else if (f.Usage === $throwNilPointerError) {
			defaultUsage(f);
		} else {
			f.Usage();
		}
	};
	FlagSet.prototype.usage = function() { return this.$val.usage(); };
	FlagSet.Ptr.prototype.parseOne = function() {
		var f, x$1, s, num_minuses, name, has_value, value, i, m, _tuple, _entry, flag, alreadythere, _tuple$1, fv, ok, err, _tmp, x$2, _tmp$1, err$1, _key;
		f = this;
		if (f.args.$length === 0) {
			return [false, $ifaceNil];
		}
		s = (x$1 = f.args, ((0 < 0 || 0 >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + 0]));
		if ((s.length === 0) || !((s.charCodeAt(0) === 45)) || (s.length === 1)) {
			return [false, $ifaceNil];
		}
		num_minuses = 1;
		if (s.charCodeAt(1) === 45) {
			num_minuses = num_minuses + (1) >> 0;
			if (s.length === 2) {
				f.args = $subslice(f.args, 1);
				return [false, $ifaceNil];
			}
		}
		name = s.substring(num_minuses);
		if ((name.length === 0) || (name.charCodeAt(0) === 45) || (name.charCodeAt(0) === 61)) {
			return [false, f.failf("bad flag syntax: %s", new ($sliceType($emptyInterface))([new $String(s)]))];
		}
		f.args = $subslice(f.args, 1);
		has_value = false;
		value = "";
		i = 1;
		while (i < name.length) {
			if (name.charCodeAt(i) === 61) {
				value = name.substring((i + 1 >> 0));
				has_value = true;
				name = name.substring(0, i);
				break;
			}
			i = i + (1) >> 0;
		}
		m = f.formal;
		_tuple = (_entry = m[name], _entry !== undefined ? [_entry.v, true] : [($ptrType(Flag)).nil, false]); flag = _tuple[0]; alreadythere = _tuple[1];
		if (!alreadythere) {
			if (name === "help" || name === "h") {
				f.usage();
				return [false, $pkg.ErrHelp];
			}
			return [false, f.failf("flag provided but not defined: -%s", new ($sliceType($emptyInterface))([new $String(name)]))];
		}
		_tuple$1 = $assertType(flag.Value, boolFlag, true); fv = _tuple$1[0]; ok = _tuple$1[1];
		if (ok && fv.IsBoolFlag()) {
			if (has_value) {
				err = fv.Set(value);
				if (!($interfaceIsEqual(err, $ifaceNil))) {
					return [false, f.failf("invalid boolean value %q for -%s: %v", new ($sliceType($emptyInterface))([new $String(value), new $String(name), err]))];
				}
			} else {
				fv.Set("true");
			}
		} else {
			if (!has_value && f.args.$length > 0) {
				has_value = true;
				_tmp = (x$2 = f.args, ((0 < 0 || 0 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + 0])); _tmp$1 = $subslice(f.args, 1); value = _tmp; f.args = _tmp$1;
			}
			if (!has_value) {
				return [false, f.failf("flag needs an argument: -%s", new ($sliceType($emptyInterface))([new $String(name)]))];
			}
			err$1 = flag.Value.Set(value);
			if (!($interfaceIsEqual(err$1, $ifaceNil))) {
				return [false, f.failf("invalid value %q for flag -%s: %v", new ($sliceType($emptyInterface))([new $String(value), new $String(name), err$1]))];
			}
		}
		if (f.actual === false) {
			f.actual = new $Map();
		}
		_key = name; (f.actual || $throwRuntimeError("assignment to entry in nil map"))[_key] = { k: _key, v: flag };
		return [true, $ifaceNil];
	};
	FlagSet.prototype.parseOne = function() { return this.$val.parseOne(); };
	FlagSet.Ptr.prototype.Parse = function(arguments$1) {
		var f, _tuple, seen, err, _ref;
		f = this;
		f.parsed = true;
		f.args = arguments$1;
		while (true) {
			_tuple = f.parseOne(); seen = _tuple[0]; err = _tuple[1];
			if (seen) {
				continue;
			}
			if ($interfaceIsEqual(err, $ifaceNil)) {
				break;
			}
			_ref = f.errorHandling;
			if (_ref === 0) {
				return err;
			} else if (_ref === 1) {
				os.Exit(2);
			} else if (_ref === 2) {
				$panic(err);
			}
		}
		return $ifaceNil;
	};
	FlagSet.prototype.Parse = function(arguments$1) { return this.$val.Parse(arguments$1); };
	FlagSet.Ptr.prototype.Parsed = function() {
		var f;
		f = this;
		return f.parsed;
	};
	FlagSet.prototype.Parsed = function() { return this.$val.Parsed(); };
	Parse = $pkg.Parse = function() {
		$pkg.CommandLine.Parse($subslice(os.Args, 1));
	};
	NewFlagSet = $pkg.NewFlagSet = function(name, errorHandling) {
		var f;
		f = new FlagSet.Ptr($throwNilPointerError, name, false, false, false, ($sliceType($String)).nil, errorHandling, $ifaceNil);
		return f;
	};
	FlagSet.Ptr.prototype.Init = function(name, errorHandling) {
		var f;
		f = this;
		f.name = name;
		f.errorHandling = errorHandling;
	};
	FlagSet.prototype.Init = function(name, errorHandling) { return this.$val.Init(name, errorHandling); };
	$pkg.$init = function() {
		($ptrType(boolValue)).methods = [["Get", "Get", "", $funcType([], [$emptyInterface], false), -1], ["IsBoolFlag", "IsBoolFlag", "", $funcType([], [$Bool], false), -1], ["Set", "Set", "", $funcType([$String], [$error], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		boolFlag.init([["IsBoolFlag", "IsBoolFlag", "", $funcType([], [$Bool], false)], ["Set", "Set", "", $funcType([$String], [$error], false)], ["String", "String", "", $funcType([], [$String], false)]]);
		($ptrType(intValue)).methods = [["Get", "Get", "", $funcType([], [$emptyInterface], false), -1], ["Set", "Set", "", $funcType([$String], [$error], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(int64Value)).methods = [["Get", "Get", "", $funcType([], [$emptyInterface], false), -1], ["Set", "Set", "", $funcType([$String], [$error], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(uintValue)).methods = [["Get", "Get", "", $funcType([], [$emptyInterface], false), -1], ["Set", "Set", "", $funcType([$String], [$error], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(uint64Value)).methods = [["Get", "Get", "", $funcType([], [$emptyInterface], false), -1], ["Set", "Set", "", $funcType([$String], [$error], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(stringValue)).methods = [["Get", "Get", "", $funcType([], [$emptyInterface], false), -1], ["Set", "Set", "", $funcType([$String], [$error], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(float64Value)).methods = [["Get", "Get", "", $funcType([], [$emptyInterface], false), -1], ["Set", "Set", "", $funcType([$String], [$error], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(durationValue)).methods = [["Get", "Get", "", $funcType([], [$emptyInterface], false), -1], ["Set", "Set", "", $funcType([$String], [$error], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		Value.init([["Set", "Set", "", $funcType([$String], [$error], false)], ["String", "String", "", $funcType([], [$String], false)]]);
		($ptrType(FlagSet)).methods = [["Arg", "Arg", "", $funcType([$Int], [$String], false), -1], ["Args", "Args", "", $funcType([], [($sliceType($String))], false), -1], ["Bool", "Bool", "", $funcType([$String, $Bool, $String], [($ptrType($Bool))], false), -1], ["BoolVar", "BoolVar", "", $funcType([($ptrType($Bool)), $String, $Bool, $String], [], false), -1], ["Duration", "Duration", "", $funcType([$String, time.Duration, $String], [($ptrType(time.Duration))], false), -1], ["DurationVar", "DurationVar", "", $funcType([($ptrType(time.Duration)), $String, time.Duration, $String], [], false), -1], ["Float64", "Float64", "", $funcType([$String, $Float64, $String], [($ptrType($Float64))], false), -1], ["Float64Var", "Float64Var", "", $funcType([($ptrType($Float64)), $String, $Float64, $String], [], false), -1], ["Init", "Init", "", $funcType([$String, ErrorHandling], [], false), -1], ["Int", "Int", "", $funcType([$String, $Int, $String], [($ptrType($Int))], false), -1], ["Int64", "Int64", "", $funcType([$String, $Int64, $String], [($ptrType($Int64))], false), -1], ["Int64Var", "Int64Var", "", $funcType([($ptrType($Int64)), $String, $Int64, $String], [], false), -1], ["IntVar", "IntVar", "", $funcType([($ptrType($Int)), $String, $Int, $String], [], false), -1], ["Lookup", "Lookup", "", $funcType([$String], [($ptrType(Flag))], false), -1], ["NArg", "NArg", "", $funcType([], [$Int], false), -1], ["NFlag", "NFlag", "", $funcType([], [$Int], false), -1], ["Parse", "Parse", "", $funcType([($sliceType($String))], [$error], false), -1], ["Parsed", "Parsed", "", $funcType([], [$Bool], false), -1], ["PrintDefaults", "PrintDefaults", "", $funcType([], [], false), -1], ["Set", "Set", "", $funcType([$String, $String], [$error], false), -1], ["SetOutput", "SetOutput", "", $funcType([io.Writer], [], false), -1], ["String", "String", "", $funcType([$String, $String, $String], [($ptrType($String))], false), -1], ["StringVar", "StringVar", "", $funcType([($ptrType($String)), $String, $String, $String], [], false), -1], ["Uint", "Uint", "", $funcType([$String, $Uint, $String], [($ptrType($Uint))], false), -1], ["Uint64", "Uint64", "", $funcType([$String, $Uint64, $String], [($ptrType($Uint64))], false), -1], ["Uint64Var", "Uint64Var", "", $funcType([($ptrType($Uint64)), $String, $Uint64, $String], [], false), -1], ["UintVar", "UintVar", "", $funcType([($ptrType($Uint)), $String, $Uint, $String], [], false), -1], ["Var", "Var", "", $funcType([Value, $String, $String], [], false), -1], ["Visit", "Visit", "", $funcType([($funcType([($ptrType(Flag))], [], false))], [], false), -1], ["VisitAll", "VisitAll", "", $funcType([($funcType([($ptrType(Flag))], [], false))], [], false), -1], ["failf", "failf", "flag", $funcType([$String, ($sliceType($emptyInterface))], [$error], true), -1], ["out", "out", "flag", $funcType([], [io.Writer], false), -1], ["parseOne", "parseOne", "flag", $funcType([], [$Bool, $error], false), -1], ["usage", "usage", "flag", $funcType([], [], false), -1]];
		FlagSet.init([["Usage", "Usage", "", ($funcType([], [], false)), ""], ["name", "name", "flag", $String, ""], ["parsed", "parsed", "flag", $Bool, ""], ["actual", "actual", "flag", ($mapType($String, ($ptrType(Flag)))), ""], ["formal", "formal", "flag", ($mapType($String, ($ptrType(Flag)))), ""], ["args", "args", "flag", ($sliceType($String)), ""], ["errorHandling", "errorHandling", "flag", ErrorHandling, ""], ["output", "output", "flag", io.Writer, ""]]);
		Flag.init([["Name", "Name", "", $String, ""], ["Usage", "Usage", "", $String, ""], ["Value", "Value", "", Value, ""], ["DefValue", "DefValue", "", $String, ""]]);
		$pkg.ErrHelp = errors.New("flag: help requested");
		$pkg.CommandLine = NewFlagSet((x = os.Args, ((0 < 0 || 0 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + 0])), 1);
		$pkg.Usage = (function() {
			var x$1;
			fmt.Fprintf(os.Stderr, "Usage of %s:\n", new ($sliceType($emptyInterface))([new $String((x$1 = os.Args, ((0 < 0 || 0 >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + 0])))]));
			PrintDefaults();
		});
	};
	return $pkg;
})();
$packages["text/tabwriter"] = (function() {
	var $pkg = {}, bytes = $packages["bytes"], io = $packages["io"], utf8 = $packages["unicode/utf8"];
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["runtime/pprof"] = (function() {
	var $pkg = {}, bufio = $packages["bufio"], bytes = $packages["bytes"], fmt = $packages["fmt"], io = $packages["io"], runtime = $packages["runtime"], sort = $packages["sort"], strings = $packages["strings"], sync = $packages["sync"], tabwriter = $packages["text/tabwriter"];
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["testing"] = (function() {
	var $pkg = {}, flag = $packages["flag"], fmt = $packages["fmt"], os = $packages["os"], runtime = $packages["runtime"], time = $packages["time"], sync = $packages["sync"], atomic = $packages["sync/atomic"], bytes = $packages["bytes"], io = $packages["io"], strings = $packages["strings"], pprof = $packages["runtime/pprof"], strconv = $packages["strconv"], InternalBenchmark, B, BenchmarkResult, PB, InternalExample, common, T, InternalTest, matchBenchmarks, benchTime, benchmarkMemory, memStats, short$1, outputDir, chatty, coverProfile, match, memProfile, memProfileRate, cpuProfile, blockProfile, blockProfileRate, timeout, cpuListStr, parallel, init, Main, decorate;
	InternalBenchmark = $pkg.InternalBenchmark = $newType(0, "Struct", "testing.InternalBenchmark", "InternalBenchmark", "testing", function(Name_, F_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.F = F_ !== undefined ? F_ : $throwNilPointerError;
	});
	B = $pkg.B = $newType(0, "Struct", "testing.B", "B", "testing", function(common_, N_, previousN_, previousDuration_, benchmark_, bytes_, timerOn_, showAllocResult_, result_, parallelism_, startAllocs_, startBytes_, netAllocs_, netBytes_) {
		this.$val = this;
		this.common = common_ !== undefined ? common_ : new common.Ptr();
		this.N = N_ !== undefined ? N_ : 0;
		this.previousN = previousN_ !== undefined ? previousN_ : 0;
		this.previousDuration = previousDuration_ !== undefined ? previousDuration_ : new time.Duration(0, 0);
		this.benchmark = benchmark_ !== undefined ? benchmark_ : new InternalBenchmark.Ptr();
		this.bytes = bytes_ !== undefined ? bytes_ : new $Int64(0, 0);
		this.timerOn = timerOn_ !== undefined ? timerOn_ : false;
		this.showAllocResult = showAllocResult_ !== undefined ? showAllocResult_ : false;
		this.result = result_ !== undefined ? result_ : new BenchmarkResult.Ptr();
		this.parallelism = parallelism_ !== undefined ? parallelism_ : 0;
		this.startAllocs = startAllocs_ !== undefined ? startAllocs_ : new $Uint64(0, 0);
		this.startBytes = startBytes_ !== undefined ? startBytes_ : new $Uint64(0, 0);
		this.netAllocs = netAllocs_ !== undefined ? netAllocs_ : new $Uint64(0, 0);
		this.netBytes = netBytes_ !== undefined ? netBytes_ : new $Uint64(0, 0);
	});
	BenchmarkResult = $pkg.BenchmarkResult = $newType(0, "Struct", "testing.BenchmarkResult", "BenchmarkResult", "testing", function(N_, T_, Bytes_, MemAllocs_, MemBytes_) {
		this.$val = this;
		this.N = N_ !== undefined ? N_ : 0;
		this.T = T_ !== undefined ? T_ : new time.Duration(0, 0);
		this.Bytes = Bytes_ !== undefined ? Bytes_ : new $Int64(0, 0);
		this.MemAllocs = MemAllocs_ !== undefined ? MemAllocs_ : new $Uint64(0, 0);
		this.MemBytes = MemBytes_ !== undefined ? MemBytes_ : new $Uint64(0, 0);
	});
	PB = $pkg.PB = $newType(0, "Struct", "testing.PB", "PB", "testing", function(globalN_, grain_, cache_, bN_) {
		this.$val = this;
		this.globalN = globalN_ !== undefined ? globalN_ : ($ptrType($Uint64)).nil;
		this.grain = grain_ !== undefined ? grain_ : new $Uint64(0, 0);
		this.cache = cache_ !== undefined ? cache_ : new $Uint64(0, 0);
		this.bN = bN_ !== undefined ? bN_ : new $Uint64(0, 0);
	});
	InternalExample = $pkg.InternalExample = $newType(0, "Struct", "testing.InternalExample", "InternalExample", "testing", function(Name_, F_, Output_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.F = F_ !== undefined ? F_ : $throwNilPointerError;
		this.Output = Output_ !== undefined ? Output_ : "";
	});
	common = $pkg.common = $newType(0, "Struct", "testing.common", "common", "testing", function(mu_, output_, failed_, skipped_, finished_, start_, duration_, self_, signal_) {
		this.$val = this;
		this.mu = mu_ !== undefined ? mu_ : new sync.RWMutex.Ptr();
		this.output = output_ !== undefined ? output_ : ($sliceType($Uint8)).nil;
		this.failed = failed_ !== undefined ? failed_ : false;
		this.skipped = skipped_ !== undefined ? skipped_ : false;
		this.finished = finished_ !== undefined ? finished_ : false;
		this.start = start_ !== undefined ? start_ : new time.Time.Ptr();
		this.duration = duration_ !== undefined ? duration_ : new time.Duration(0, 0);
		this.self = self_ !== undefined ? self_ : $ifaceNil;
		this.signal = signal_ !== undefined ? signal_ : ($chanType($emptyInterface, false, false)).nil;
	});
	T = $pkg.T = $newType(0, "Struct", "testing.T", "T", "testing", function(common_, name_, startParallel_) {
		this.$val = this;
		this.common = common_ !== undefined ? common_ : new common.Ptr();
		this.name = name_ !== undefined ? name_ : "";
		this.startParallel = startParallel_ !== undefined ? startParallel_ : ($chanType($Bool, false, false)).nil;
	});
	InternalTest = $pkg.InternalTest = $newType(0, "Struct", "testing.InternalTest", "InternalTest", "testing", function(Name_, F_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.F = F_ !== undefined ? F_ : $throwNilPointerError;
	});
	init = function($b) {
		var $this = this, $args = arguments, $r, $s = 0, x;
		/* */ if(!$b) { $nonblockingCall(); }; var $f = function() { while (true) { switch ($s) { case 0:
		x = false;
		/* if (x) { */ if (x) {} else { $s = 1; continue; }
			$r = Main($throwNilPointerError, ($sliceType(InternalTest)).nil, ($sliceType(InternalBenchmark)).nil, ($sliceType(InternalExample)).nil, true); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		/* } */ case 1:
		/* */ case -1: } return; } }; $f.$blocking = true; return $f;
	};
	Main = $pkg.Main = function(matchString, tests, benchmarks, examples, $b) {
		var $this = this, $args = arguments, $r, $s = 0, failed, _ref, _i, err, done, t, test, _r, _tuple, e, ok;
		/* */ if(!$b) { $nonblockingCall(); }; var $f = function() { while (true) { switch ($s) { case 0:
		flag.Parse();
		if (tests.$length === 0) {
			fmt.Println(new ($sliceType($emptyInterface))([new $String("testing: warning: no tests to run")]));
		}
		failed = false;
		_ref = tests;
		_i = 0;
		/* while (_i < _ref.$length) { */ case 1: if(!(_i < _ref.$length)) { $s = 2; continue; }
			err = [undefined];
			done = [undefined];
			t = [undefined];
			test = new InternalTest.Ptr(); $copy(test, ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), InternalTest);
			t[0] = new T.Ptr(new common.Ptr(new sync.RWMutex.Ptr(), ($sliceType($Uint8)).nil, false, false, false, time.Now(), new time.Duration(0, 0), $ifaceNil, ($chanType($emptyInterface, false, false)).nil), test.Name, ($chanType($Bool, false, false)).nil);
			t[0].common.self = t[0];
			if (chatty.$get()) {
				fmt.Printf("=== RUN %s\n", new ($sliceType($emptyInterface))([new $String(t[0].name)]));
			}
			done[0] = new ($chanType(($structType([])), false, false))(0);
			err[0] = $ifaceNil;
			$go((function(done, err, t) { return function($b) {
				var $this = this, $args = arguments, $r, $deferred = [], $err = null, $s = 0;
				/* */ if(!$b) { $nonblockingCall(); }; var $f = function() { try { $deferFrames.push($deferred); while (true) { switch ($s) { case 0:
				$deferred.push([(function(done, err, t) { return function() {
					err[0] = $recover();
					$close(done[0]);
				}; })(done, err, t), [true]]);
				$r = test.F(t[0], true); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
				/* */ case -1: } return; } } catch(err) { $err = err; } finally { $deferFrames.pop(); if ($curGoroutine.asleep && !$jumpToDefer) { throw null; } $s = -1; $callDeferred($deferred, $err); } }; $f.$blocking = true; return $f;
			}; })(done, err, t), []);
			_r = $recv(done[0], true); /* */ $s = 3; case 3: if (_r && _r.$blocking) { _r = _r(); }
			_r[0];
			t[0].common.duration = time.Now().Sub($clone(t[0].common.start, time.Time));
			_tuple = $assertType(err[0], ($ptrType(runtime.NotSupportedError)), true); e = _tuple[0]; ok = _tuple[1];
			if (ok) {
				t[0].common.log(e.Error());
				t[0].common.skip();
				err[0] = $ifaceNil;
			}
			if (!($interfaceIsEqual(err[0], $ifaceNil))) {
				t[0].common.Fail();
			}
			t[0].report();
			if (!($interfaceIsEqual(err[0], $ifaceNil))) {
				$panic(err[0]);
			}
			failed = failed || t[0].common.failed;
			_i++;
		/* } */ $s = 1; continue; case 2:
		if (failed) {
			os.Exit(1);
		}
		os.Exit(0);
		/* */ case -1: } return; } }; $f.$blocking = true; return $f;
	};
	B.Ptr.prototype.StartTimer = function() {
		var b;
		b = this;
		if (!b.timerOn) {
			runtime.ReadMemStats(memStats);
			b.startAllocs = memStats.Mallocs;
			b.startBytes = memStats.TotalAlloc;
			$copy(b.common.start, time.Now(), time.Time);
			b.timerOn = true;
		}
	};
	B.prototype.StartTimer = function() { return this.$val.StartTimer(); };
	B.Ptr.prototype.StopTimer = function() {
		var b, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		b = this;
		if (b.timerOn) {
			b.common.duration = (x = b.common.duration, x$1 = time.Now().Sub($clone(b.common.start, time.Time)), new time.Duration(x.$high + x$1.$high, x.$low + x$1.$low));
			runtime.ReadMemStats(memStats);
			b.netAllocs = (x$2 = b.netAllocs, x$3 = (x$4 = memStats.Mallocs, x$5 = b.startAllocs, new $Uint64(x$4.$high - x$5.$high, x$4.$low - x$5.$low)), new $Uint64(x$2.$high + x$3.$high, x$2.$low + x$3.$low));
			b.netBytes = (x$6 = b.netBytes, x$7 = (x$8 = memStats.TotalAlloc, x$9 = b.startBytes, new $Uint64(x$8.$high - x$9.$high, x$8.$low - x$9.$low)), new $Uint64(x$6.$high + x$7.$high, x$6.$low + x$7.$low));
			b.timerOn = false;
		}
	};
	B.prototype.StopTimer = function() { return this.$val.StopTimer(); };
	B.Ptr.prototype.ResetTimer = function() {
		var b;
		b = this;
		if (b.timerOn) {
			runtime.ReadMemStats(memStats);
			b.startAllocs = memStats.Mallocs;
			b.startBytes = memStats.TotalAlloc;
			$copy(b.common.start, time.Now(), time.Time);
		}
		b.common.duration = new time.Duration(0, 0);
		b.netAllocs = new $Uint64(0, 0);
		b.netBytes = new $Uint64(0, 0);
	};
	B.prototype.ResetTimer = function() { return this.$val.ResetTimer(); };
	B.Ptr.prototype.SetBytes = function(n) {
		var b;
		b = this;
		b.bytes = n;
	};
	B.prototype.SetBytes = function(n) { return this.$val.SetBytes(n); };
	B.Ptr.prototype.ReportAllocs = function() {
		var b;
		b = this;
		b.showAllocResult = true;
	};
	B.prototype.ReportAllocs = function() { return this.$val.ReportAllocs(); };
	BenchmarkResult.Ptr.prototype.NsPerOp = function() {
		var r;
		r = new BenchmarkResult.Ptr(); $copy(r, this, BenchmarkResult);
		if (r.N <= 0) {
			return new $Int64(0, 0);
		}
		return $div64(r.T.Nanoseconds(), new $Int64(0, r.N), false);
	};
	BenchmarkResult.prototype.NsPerOp = function() { return this.$val.NsPerOp(); };
	BenchmarkResult.Ptr.prototype.mbPerSec = function() {
		var r, x, x$1;
		r = new BenchmarkResult.Ptr(); $copy(r, this, BenchmarkResult);
		if ((x = r.Bytes, (x.$high < 0 || (x.$high === 0 && x.$low <= 0))) || (x$1 = r.T, (x$1.$high < 0 || (x$1.$high === 0 && x$1.$low <= 0))) || r.N <= 0) {
			return 0;
		}
		return ($flatten64(r.Bytes) * r.N / 1e+06) / r.T.Seconds();
	};
	BenchmarkResult.prototype.mbPerSec = function() { return this.$val.mbPerSec(); };
	BenchmarkResult.Ptr.prototype.AllocsPerOp = function() {
		var r, x;
		r = new BenchmarkResult.Ptr(); $copy(r, this, BenchmarkResult);
		if (r.N <= 0) {
			return new $Int64(0, 0);
		}
		return $div64((x = r.MemAllocs, new $Int64(x.$high, x.$low)), new $Int64(0, r.N), false);
	};
	BenchmarkResult.prototype.AllocsPerOp = function() { return this.$val.AllocsPerOp(); };
	BenchmarkResult.Ptr.prototype.AllocedBytesPerOp = function() {
		var r, x;
		r = new BenchmarkResult.Ptr(); $copy(r, this, BenchmarkResult);
		if (r.N <= 0) {
			return new $Int64(0, 0);
		}
		return $div64((x = r.MemBytes, new $Int64(x.$high, x.$low)), new $Int64(0, r.N), false);
	};
	BenchmarkResult.prototype.AllocedBytesPerOp = function() { return this.$val.AllocedBytesPerOp(); };
	BenchmarkResult.Ptr.prototype.String = function() {
		var r, mbs, mb, nsop, ns;
		r = new BenchmarkResult.Ptr(); $copy(r, this, BenchmarkResult);
		mbs = r.mbPerSec();
		mb = "";
		if (!((mbs === 0))) {
			mb = fmt.Sprintf("\t%7.2f MB/s", new ($sliceType($emptyInterface))([new $Float64(mbs)]));
		}
		nsop = r.NsPerOp();
		ns = fmt.Sprintf("%10d ns/op", new ($sliceType($emptyInterface))([nsop]));
		if (r.N > 0 && (nsop.$high < 0 || (nsop.$high === 0 && nsop.$low < 100))) {
			if ((nsop.$high < 0 || (nsop.$high === 0 && nsop.$low < 10))) {
				ns = fmt.Sprintf("%13.2f ns/op", new ($sliceType($emptyInterface))([new $Float64($flatten64(r.T.Nanoseconds()) / r.N)]));
			} else {
				ns = fmt.Sprintf("%12.1f ns/op", new ($sliceType($emptyInterface))([new $Float64($flatten64(r.T.Nanoseconds()) / r.N)]));
			}
		}
		return fmt.Sprintf("%8d\t%s%s", new ($sliceType($emptyInterface))([new $Int(r.N), new $String(ns), new $String(mb)]));
	};
	BenchmarkResult.prototype.String = function() { return this.$val.String(); };
	BenchmarkResult.Ptr.prototype.MemString = function() {
		var r;
		r = new BenchmarkResult.Ptr(); $copy(r, this, BenchmarkResult);
		return fmt.Sprintf("%8d B/op\t%8d allocs/op", new ($sliceType($emptyInterface))([r.AllocedBytesPerOp(), r.AllocsPerOp()]));
	};
	BenchmarkResult.prototype.MemString = function() { return this.$val.MemString(); };
	PB.Ptr.prototype.Next = function() {
		var pb, x, n, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		pb = this;
		if ((x = pb.cache, (x.$high === 0 && x.$low === 0))) {
			n = atomic.AddUint64(pb.globalN, pb.grain);
			if ((x$1 = pb.bN, (n.$high < x$1.$high || (n.$high === x$1.$high && n.$low <= x$1.$low)))) {
				pb.cache = pb.grain;
			} else if ((x$2 = (x$3 = pb.bN, x$4 = pb.grain, new $Uint64(x$3.$high + x$4.$high, x$3.$low + x$4.$low)), (n.$high < x$2.$high || (n.$high === x$2.$high && n.$low < x$2.$low)))) {
				pb.cache = (x$5 = (x$6 = pb.bN, x$7 = pb.grain, new $Uint64(x$6.$high + x$7.$high, x$6.$low + x$7.$low)), new $Uint64(x$5.$high - n.$high, x$5.$low - n.$low));
			} else {
				return false;
			}
		}
		pb.cache = (x$8 = pb.cache, x$9 = new $Uint64(0, 1), new $Uint64(x$8.$high - x$9.$high, x$8.$low - x$9.$low));
		return true;
	};
	PB.prototype.Next = function() { return this.$val.Next(); };
	B.Ptr.prototype.RunParallel = function(body) {
		var b, grain, x, x$1, n, x$2, x$3, numProcs, wg, p, x$4;
		b = this;
		grain = new $Uint64(0, 0);
		if (b.previousN > 0 && (x = b.previousDuration, (x.$high > 0 || (x.$high === 0 && x.$low > 0)))) {
			grain = $div64($mul64(new $Uint64(0, 100000), new $Uint64(0, b.previousN)), (x$1 = b.previousDuration, new $Uint64(x$1.$high, x$1.$low)), false);
		}
		if ((grain.$high < 0 || (grain.$high === 0 && grain.$low < 1))) {
			grain = new $Uint64(0, 1);
		}
		if ((grain.$high > 0 || (grain.$high === 0 && grain.$low > 10000))) {
			grain = new $Uint64(0, 10000);
		}
		n = new $Uint64(0, 0);
		numProcs = (x$2 = b.parallelism, x$3 = runtime.GOMAXPROCS(0), (((x$2 >>> 16 << 16) * x$3 >> 0) + (x$2 << 16 >>> 16) * x$3) >> 0);
		wg = new sync.WaitGroup.Ptr(); $copy(wg, new sync.WaitGroup.Ptr(), sync.WaitGroup);
		wg.Add(numProcs);
		p = 0;
		while (p < numProcs) {
			$go((function() {
				var $deferred = [], $err = null, pb;
				/* */ try { $deferFrames.push($deferred);
				$deferred.push([$methodVal(wg, "Done"), []]);
				pb = new PB.Ptr(new ($ptrType($Uint64))(function() { return n; }, function($v) { n = $v; }), grain, new $Uint64(0, 0), new $Uint64(0, b.N));
				body(pb);
				/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
			}), []);
			p = p + (1) >> 0;
		}
		wg.Wait();
		if ((x$4 = new $Uint64(0, b.N), (n.$high < x$4.$high || (n.$high === x$4.$high && n.$low <= x$4.$low))) && !b.common.Failed()) {
			b.common.Fatal(new ($sliceType($emptyInterface))([new $String("RunParallel: body exited without pb.Next() == false")]));
		}
	};
	B.prototype.RunParallel = function(body) { return this.$val.RunParallel(body); };
	B.Ptr.prototype.SetParallelism = function(p) {
		var b;
		b = this;
		if (p >= 1) {
			b.parallelism = p;
		}
	};
	B.prototype.SetParallelism = function(p) { return this.$val.SetParallelism(p); };
	decorate = function(s) {
		var _tuple, file, line, ok, index, buf, lines, l, x, _ref, _i, i, line$1;
		_tuple = runtime.Caller(3); file = _tuple[1]; line = _tuple[2]; ok = _tuple[3];
		if (ok) {
			index = strings.LastIndex(file, "/");
			if (index >= 0) {
				file = file.substring((index + 1 >> 0));
			} else {
				index = strings.LastIndex(file, "\\");
				if (index >= 0) {
					file = file.substring((index + 1 >> 0));
				}
			}
		} else {
			file = "???";
			line = 1;
		}
		buf = new bytes.Buffer.Ptr();
		buf.WriteByte(9);
		fmt.Fprintf(buf, "%s:%d: ", new ($sliceType($emptyInterface))([new $String(file), new $Int(line)]));
		lines = strings.Split(s, "\n");
		l = lines.$length;
		if (l > 1 && (x = l - 1 >> 0, ((x < 0 || x >= lines.$length) ? $throwRuntimeError("index out of range") : lines.$array[lines.$offset + x])) === "") {
			lines = $subslice(lines, 0, (l - 1 >> 0));
		}
		_ref = lines;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			line$1 = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (i > 0) {
				buf.WriteString("\n\t\t");
			}
			buf.WriteString(line$1);
			_i++;
		}
		buf.WriteByte(10);
		return buf.String();
	};
	common.Ptr.prototype.Fail = function() {
		var $deferred = [], $err = null, c;
		/* */ try { $deferFrames.push($deferred);
		c = this;
		c.mu.Lock();
		$deferred.push([$methodVal(c.mu, "Unlock"), []]);
		c.failed = true;
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	common.prototype.Fail = function() { return this.$val.Fail(); };
	common.Ptr.prototype.Failed = function() {
		var $deferred = [], $err = null, c;
		/* */ try { $deferFrames.push($deferred);
		c = this;
		c.mu.RLock();
		$deferred.push([$methodVal(c.mu, "RUnlock"), []]);
		return c.failed;
		/* */ } catch(err) { $err = err; return false; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	common.prototype.Failed = function() { return this.$val.Failed(); };
	common.Ptr.prototype.FailNow = function() {
		var c;
		c = this;
		c.Fail();
		c.finished = true;
		runtime.Goexit();
	};
	common.prototype.FailNow = function() { return this.$val.FailNow(); };
	common.Ptr.prototype.log = function(s) {
		var $deferred = [], $err = null, c;
		/* */ try { $deferFrames.push($deferred);
		c = this;
		c.mu.Lock();
		$deferred.push([$methodVal(c.mu, "Unlock"), []]);
		c.output = $appendSlice(c.output, new ($sliceType($Uint8))($stringToBytes(decorate(s))));
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	common.prototype.log = function(s) { return this.$val.log(s); };
	common.Ptr.prototype.Log = function(args) {
		var c;
		c = this;
		c.log(fmt.Sprintln(args));
	};
	common.prototype.Log = function(args) { return this.$val.Log(args); };
	common.Ptr.prototype.Logf = function(format, args) {
		var c;
		c = this;
		c.log(fmt.Sprintf(format, args));
	};
	common.prototype.Logf = function(format, args) { return this.$val.Logf(format, args); };
	common.Ptr.prototype.Error = function(args) {
		var c;
		c = this;
		c.log(fmt.Sprintln(args));
		c.Fail();
	};
	common.prototype.Error = function(args) { return this.$val.Error(args); };
	common.Ptr.prototype.Errorf = function(format, args) {
		var c;
		c = this;
		c.log(fmt.Sprintf(format, args));
		c.Fail();
	};
	common.prototype.Errorf = function(format, args) { return this.$val.Errorf(format, args); };
	common.Ptr.prototype.Fatal = function(args) {
		var c;
		c = this;
		c.log(fmt.Sprintln(args));
		c.FailNow();
	};
	common.prototype.Fatal = function(args) { return this.$val.Fatal(args); };
	common.Ptr.prototype.Fatalf = function(format, args) {
		var c;
		c = this;
		c.log(fmt.Sprintf(format, args));
		c.FailNow();
	};
	common.prototype.Fatalf = function(format, args) { return this.$val.Fatalf(format, args); };
	common.Ptr.prototype.Skip = function(args) {
		var c;
		c = this;
		c.log(fmt.Sprintln(args));
		c.SkipNow();
	};
	common.prototype.Skip = function(args) { return this.$val.Skip(args); };
	common.Ptr.prototype.Skipf = function(format, args) {
		var c;
		c = this;
		c.log(fmt.Sprintf(format, args));
		c.SkipNow();
	};
	common.prototype.Skipf = function(format, args) { return this.$val.Skipf(format, args); };
	common.Ptr.prototype.SkipNow = function() {
		var c;
		c = this;
		c.skip();
		c.finished = true;
		runtime.Goexit();
	};
	common.prototype.SkipNow = function() { return this.$val.SkipNow(); };
	common.Ptr.prototype.skip = function() {
		var $deferred = [], $err = null, c;
		/* */ try { $deferFrames.push($deferred);
		c = this;
		c.mu.Lock();
		$deferred.push([$methodVal(c.mu, "Unlock"), []]);
		c.skipped = true;
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	common.prototype.skip = function() { return this.$val.skip(); };
	common.Ptr.prototype.Skipped = function() {
		var $deferred = [], $err = null, c;
		/* */ try { $deferFrames.push($deferred);
		c = this;
		c.mu.RLock();
		$deferred.push([$methodVal(c.mu, "RUnlock"), []]);
		return c.skipped;
		/* */ } catch(err) { $err = err; return false; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	common.prototype.Skipped = function() { return this.$val.Skipped(); };
	T.Ptr.prototype.Parallel = function($b) {
		var $this = this, $args = arguments, $r, $s = 0, t, _r;
		/* */ if(!$b) { $nonblockingCall(); }; var $f = function() { while (true) { switch ($s) { case 0:
		t = $this;
		$r = $send(t.common.signal, ($ptrType(T)).nil, true); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		_r = $recv(t.startParallel, true); /* */ $s = 2; case 2: if (_r && _r.$blocking) { _r = _r(); }
		_r[0];
		$copy(t.common.start, time.Now(), time.Time);
		/* */ case -1: } return; } }; $f.$blocking = true; return $f;
	};
	T.prototype.Parallel = function($b) { return this.$val.Parallel($b); };
	T.Ptr.prototype.report = function() {
		var t, tstr, format;
		t = this;
		tstr = fmt.Sprintf("(%.2f seconds)", new ($sliceType($emptyInterface))([new $Float64(t.common.duration.Seconds())]));
		format = "--- %s: %s %s\n%s";
		if (t.common.Failed()) {
			fmt.Printf(format, new ($sliceType($emptyInterface))([new $String("FAIL"), new $String(t.name), new $String(tstr), t.common.output]));
		} else if (chatty.$get()) {
			if (t.common.Skipped()) {
				fmt.Printf(format, new ($sliceType($emptyInterface))([new $String("SKIP"), new $String(t.name), new $String(tstr), t.common.output]));
			} else {
				fmt.Printf(format, new ($sliceType($emptyInterface))([new $String("PASS"), new $String(t.name), new $String(tstr), t.common.output]));
			}
		}
	};
	T.prototype.report = function() { return this.$val.report(); };
	$pkg.$init = function() {
		/* */ var $r, $s = 0; var $f = function() { while (true) { switch ($s) { case 0:
		InternalBenchmark.init([["Name", "Name", "", $String, ""], ["F", "F", "", ($funcType([($ptrType(B))], [], false)), ""]]);
		($ptrType(B)).methods = [["Error", "Error", "", $funcType([($sliceType($emptyInterface))], [], true), 0], ["Errorf", "Errorf", "", $funcType([$String, ($sliceType($emptyInterface))], [], true), 0], ["Fail", "Fail", "", $funcType([], [], false), 0], ["FailNow", "FailNow", "", $funcType([], [], false), 0], ["Failed", "Failed", "", $funcType([], [$Bool], false), 0], ["Fatal", "Fatal", "", $funcType([($sliceType($emptyInterface))], [], true), 0], ["Fatalf", "Fatalf", "", $funcType([$String, ($sliceType($emptyInterface))], [], true), 0], ["Log", "Log", "", $funcType([($sliceType($emptyInterface))], [], true), 0], ["Logf", "Logf", "", $funcType([$String, ($sliceType($emptyInterface))], [], true), 0], ["ReportAllocs", "ReportAllocs", "", $funcType([], [], false), -1], ["ResetTimer", "ResetTimer", "", $funcType([], [], false), -1], ["RunParallel", "RunParallel", "", $funcType([($funcType([($ptrType(PB))], [], false))], [], false), -1], ["SetBytes", "SetBytes", "", $funcType([$Int64], [], false), -1], ["SetParallelism", "SetParallelism", "", $funcType([$Int], [], false), -1], ["Skip", "Skip", "", $funcType([($sliceType($emptyInterface))], [], true), 0], ["SkipNow", "SkipNow", "", $funcType([], [], false), 0], ["Skipf", "Skipf", "", $funcType([$String, ($sliceType($emptyInterface))], [], true), 0], ["Skipped", "Skipped", "", $funcType([], [$Bool], false), 0], ["StartTimer", "StartTimer", "", $funcType([], [], false), -1], ["StopTimer", "StopTimer", "", $funcType([], [], false), -1], ["launch", "launch", "testing", $funcType([], [], false), -1], ["log", "log", "testing", $funcType([$String], [], false), 0], ["nsPerOp", "nsPerOp", "testing", $funcType([], [$Int64], false), -1], ["private$", "private", "testing", $funcType([], [], false), 0], ["run", "run", "testing", $funcType([], [BenchmarkResult], false), -1], ["runN", "runN", "testing", $funcType([$Int], [], false), -1], ["skip", "skip", "testing", $funcType([], [], false), 0], ["trimOutput", "trimOutput", "testing", $funcType([], [], false), -1]];
		B.init([["common", "", "testing", common, ""], ["N", "N", "", $Int, ""], ["previousN", "previousN", "testing", $Int, ""], ["previousDuration", "previousDuration", "testing", time.Duration, ""], ["benchmark", "benchmark", "testing", InternalBenchmark, ""], ["bytes", "bytes", "testing", $Int64, ""], ["timerOn", "timerOn", "testing", $Bool, ""], ["showAllocResult", "showAllocResult", "testing", $Bool, ""], ["result", "result", "testing", BenchmarkResult, ""], ["parallelism", "parallelism", "testing", $Int, ""], ["startAllocs", "startAllocs", "testing", $Uint64, ""], ["startBytes", "startBytes", "testing", $Uint64, ""], ["netAllocs", "netAllocs", "testing", $Uint64, ""], ["netBytes", "netBytes", "testing", $Uint64, ""]]);
		BenchmarkResult.methods = [["AllocedBytesPerOp", "AllocedBytesPerOp", "", $funcType([], [$Int64], false), -1], ["AllocsPerOp", "AllocsPerOp", "", $funcType([], [$Int64], false), -1], ["MemString", "MemString", "", $funcType([], [$String], false), -1], ["NsPerOp", "NsPerOp", "", $funcType([], [$Int64], false), -1], ["String", "String", "", $funcType([], [$String], false), -1], ["mbPerSec", "mbPerSec", "testing", $funcType([], [$Float64], false), -1]];
		($ptrType(BenchmarkResult)).methods = [["AllocedBytesPerOp", "AllocedBytesPerOp", "", $funcType([], [$Int64], false), -1], ["AllocsPerOp", "AllocsPerOp", "", $funcType([], [$Int64], false), -1], ["MemString", "MemString", "", $funcType([], [$String], false), -1], ["NsPerOp", "NsPerOp", "", $funcType([], [$Int64], false), -1], ["String", "String", "", $funcType([], [$String], false), -1], ["mbPerSec", "mbPerSec", "testing", $funcType([], [$Float64], false), -1]];
		BenchmarkResult.init([["N", "N", "", $Int, ""], ["T", "T", "", time.Duration, ""], ["Bytes", "Bytes", "", $Int64, ""], ["MemAllocs", "MemAllocs", "", $Uint64, ""], ["MemBytes", "MemBytes", "", $Uint64, ""]]);
		($ptrType(PB)).methods = [["Next", "Next", "", $funcType([], [$Bool], false), -1]];
		PB.init([["globalN", "globalN", "testing", ($ptrType($Uint64)), ""], ["grain", "grain", "testing", $Uint64, ""], ["cache", "cache", "testing", $Uint64, ""], ["bN", "bN", "testing", $Uint64, ""]]);
		InternalExample.init([["Name", "Name", "", $String, ""], ["F", "F", "", ($funcType([], [], false)), ""], ["Output", "Output", "", $String, ""]]);
		($ptrType(common)).methods = [["Error", "Error", "", $funcType([($sliceType($emptyInterface))], [], true), -1], ["Errorf", "Errorf", "", $funcType([$String, ($sliceType($emptyInterface))], [], true), -1], ["Fail", "Fail", "", $funcType([], [], false), -1], ["FailNow", "FailNow", "", $funcType([], [], false), -1], ["Failed", "Failed", "", $funcType([], [$Bool], false), -1], ["Fatal", "Fatal", "", $funcType([($sliceType($emptyInterface))], [], true), -1], ["Fatalf", "Fatalf", "", $funcType([$String, ($sliceType($emptyInterface))], [], true), -1], ["Log", "Log", "", $funcType([($sliceType($emptyInterface))], [], true), -1], ["Logf", "Logf", "", $funcType([$String, ($sliceType($emptyInterface))], [], true), -1], ["Skip", "Skip", "", $funcType([($sliceType($emptyInterface))], [], true), -1], ["SkipNow", "SkipNow", "", $funcType([], [], false), -1], ["Skipf", "Skipf", "", $funcType([$String, ($sliceType($emptyInterface))], [], true), -1], ["Skipped", "Skipped", "", $funcType([], [$Bool], false), -1], ["log", "log", "testing", $funcType([$String], [], false), -1], ["private$", "private", "testing", $funcType([], [], false), -1], ["skip", "skip", "testing", $funcType([], [], false), -1]];
		common.init([["mu", "mu", "testing", sync.RWMutex, ""], ["output", "output", "testing", ($sliceType($Uint8)), ""], ["failed", "failed", "testing", $Bool, ""], ["skipped", "skipped", "testing", $Bool, ""], ["finished", "finished", "testing", $Bool, ""], ["start", "start", "testing", time.Time, ""], ["duration", "duration", "testing", time.Duration, ""], ["self", "self", "testing", $emptyInterface, ""], ["signal", "signal", "testing", ($chanType($emptyInterface, false, false)), ""]]);
		($ptrType(T)).methods = [["Error", "Error", "", $funcType([($sliceType($emptyInterface))], [], true), 0], ["Errorf", "Errorf", "", $funcType([$String, ($sliceType($emptyInterface))], [], true), 0], ["Fail", "Fail", "", $funcType([], [], false), 0], ["FailNow", "FailNow", "", $funcType([], [], false), 0], ["Failed", "Failed", "", $funcType([], [$Bool], false), 0], ["Fatal", "Fatal", "", $funcType([($sliceType($emptyInterface))], [], true), 0], ["Fatalf", "Fatalf", "", $funcType([$String, ($sliceType($emptyInterface))], [], true), 0], ["Log", "Log", "", $funcType([($sliceType($emptyInterface))], [], true), 0], ["Logf", "Logf", "", $funcType([$String, ($sliceType($emptyInterface))], [], true), 0], ["Parallel", "Parallel", "", $funcType([], [], false), -1], ["Skip", "Skip", "", $funcType([($sliceType($emptyInterface))], [], true), 0], ["SkipNow", "SkipNow", "", $funcType([], [], false), 0], ["Skipf", "Skipf", "", $funcType([$String, ($sliceType($emptyInterface))], [], true), 0], ["Skipped", "Skipped", "", $funcType([], [$Bool], false), 0], ["log", "log", "testing", $funcType([$String], [], false), 0], ["private$", "private", "testing", $funcType([], [], false), 0], ["report", "report", "testing", $funcType([], [], false), -1], ["skip", "skip", "testing", $funcType([], [], false), 0]];
		T.init([["common", "", "testing", common, ""], ["name", "name", "testing", $String, ""], ["startParallel", "startParallel", "testing", ($chanType($Bool, false, false)), ""]]);
		InternalTest.init([["Name", "Name", "", $String, ""], ["F", "F", "", ($funcType([($ptrType(T))], [], false)), ""]]);
		memStats = new runtime.MemStats.Ptr();
		matchBenchmarks = flag.String("test.bench", "", "regular expression to select benchmarks to run");
		benchTime = flag.Duration("test.benchtime", new time.Duration(0, 1000000000), "approximate run time for each benchmark");
		benchmarkMemory = flag.Bool("test.benchmem", false, "print memory allocations for benchmarks");
		short$1 = flag.Bool("test.short", false, "run smaller test suite to save time");
		outputDir = flag.String("test.outputdir", "", "directory in which to write profiles");
		chatty = flag.Bool("test.v", false, "verbose: print additional output");
		coverProfile = flag.String("test.coverprofile", "", "write a coverage profile to the named file after execution");
		match = flag.String("test.run", "", "regular expression to select tests and examples to run");
		memProfile = flag.String("test.memprofile", "", "write a memory profile to the named file after execution");
		memProfileRate = flag.Int("test.memprofilerate", 0, "if >=0, sets runtime.MemProfileRate");
		cpuProfile = flag.String("test.cpuprofile", "", "write a cpu profile to the named file during execution");
		blockProfile = flag.String("test.blockprofile", "", "write a goroutine blocking profile to the named file after execution");
		blockProfileRate = flag.Int("test.blockprofilerate", 1, "if >= 0, calls runtime.SetBlockProfileRate()");
		timeout = flag.Duration("test.timeout", new time.Duration(0, 0), "if positive, sets an aggregate time limit for all tests");
		cpuListStr = flag.String("test.cpu", "", "comma-separated list of number of CPUs to use for each test");
		parallel = flag.Int("test.parallel", runtime.GOMAXPROCS(0), "maximum test parallelism");
		$r = init(true); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		/* */ } return; } }; $f.$blocking = true; return $f;
	};
	return $pkg;
})();
$packages["encoding/base64"] = (function() {
	var $pkg = {}, testing = $packages["testing"], bytes = $packages["bytes"], io = $packages["io"], strconv = $packages["strconv"], strings = $packages["strings"], Encoding, CorruptInputError, removeNewlinesMapper, NewEncoding;
	Encoding = $pkg.Encoding = $newType(0, "Struct", "base64.Encoding", "Encoding", "encoding/base64", function(encode_, decodeMap_) {
		this.$val = this;
		this.encode = encode_ !== undefined ? encode_ : "";
		this.decodeMap = decodeMap_ !== undefined ? decodeMap_ : ($arrayType($Uint8, 256)).zero();
	});
	CorruptInputError = $pkg.CorruptInputError = $newType(8, "Int64", "base64.CorruptInputError", "CorruptInputError", "encoding/base64", null);
	NewEncoding = $pkg.NewEncoding = function(encoder$1) {
		var e, i, x, i$1, x$1, x$2;
		e = new Encoding.Ptr();
		e.encode = encoder$1;
		i = 0;
		while (i < 256) {
			(x = e.decodeMap, (i < 0 || i >= x.length) ? $throwRuntimeError("index out of range") : x[i] = 255);
			i = i + (1) >> 0;
		}
		i$1 = 0;
		while (i$1 < encoder$1.length) {
			(x$1 = e.decodeMap, x$2 = encoder$1.charCodeAt(i$1), (x$2 < 0 || x$2 >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[x$2] = (i$1 << 24 >>> 24));
			i$1 = i$1 + (1) >> 0;
		}
		return e;
	};
	Encoding.Ptr.prototype.Encode = function(dst, src) {
		var enc, _ref, _lhs, _index, _lhs$1, _index$1, _lhs$2, _index$2, _lhs$3, _index$3, _lhs$4, _index$4, _lhs$5, _index$5, _lhs$6, _index$6, _lhs$7, _index$7, _lhs$8, _index$8, _lhs$9, _index$9, _lhs$10, _index$10, _lhs$11, _index$11, j;
		enc = this;
		if (src.$length === 0) {
			return;
		}
		while (src.$length > 0) {
			(0 < 0 || 0 >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + 0] = 0;
			(1 < 0 || 1 >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + 1] = 0;
			(2 < 0 || 2 >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + 2] = 0;
			(3 < 0 || 3 >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + 3] = 0;
			_ref = src.$length;
			if (_ref === 2) {
				_lhs = dst; _index = 2; (_index < 0 || _index >= _lhs.$length) ? $throwRuntimeError("index out of range") : _lhs.$array[_lhs.$offset + _index] = (((_index < 0 || _index >= _lhs.$length) ? $throwRuntimeError("index out of range") : _lhs.$array[_lhs.$offset + _index]) | (((((((1 < 0 || 1 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 1]) << 2 << 24 >>> 24)) & 63) >>> 0))) >>> 0;
				_lhs$1 = dst; _index$1 = 1; (_index$1 < 0 || _index$1 >= _lhs$1.$length) ? $throwRuntimeError("index out of range") : _lhs$1.$array[_lhs$1.$offset + _index$1] = (((_index$1 < 0 || _index$1 >= _lhs$1.$length) ? $throwRuntimeError("index out of range") : _lhs$1.$array[_lhs$1.$offset + _index$1]) | ((((1 < 0 || 1 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 1]) >>> 4 << 24 >>> 24))) >>> 0;
				_lhs$2 = dst; _index$2 = 1; (_index$2 < 0 || _index$2 >= _lhs$2.$length) ? $throwRuntimeError("index out of range") : _lhs$2.$array[_lhs$2.$offset + _index$2] = (((_index$2 < 0 || _index$2 >= _lhs$2.$length) ? $throwRuntimeError("index out of range") : _lhs$2.$array[_lhs$2.$offset + _index$2]) | (((((((0 < 0 || 0 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 0]) << 4 << 24 >>> 24)) & 63) >>> 0))) >>> 0;
				_lhs$3 = dst; _index$3 = 0; (_index$3 < 0 || _index$3 >= _lhs$3.$length) ? $throwRuntimeError("index out of range") : _lhs$3.$array[_lhs$3.$offset + _index$3] = (((_index$3 < 0 || _index$3 >= _lhs$3.$length) ? $throwRuntimeError("index out of range") : _lhs$3.$array[_lhs$3.$offset + _index$3]) | ((((0 < 0 || 0 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 0]) >>> 2 << 24 >>> 24))) >>> 0;
			} else if (_ref === 1) {
				_lhs$4 = dst; _index$4 = 1; (_index$4 < 0 || _index$4 >= _lhs$4.$length) ? $throwRuntimeError("index out of range") : _lhs$4.$array[_lhs$4.$offset + _index$4] = (((_index$4 < 0 || _index$4 >= _lhs$4.$length) ? $throwRuntimeError("index out of range") : _lhs$4.$array[_lhs$4.$offset + _index$4]) | (((((((0 < 0 || 0 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 0]) << 4 << 24 >>> 24)) & 63) >>> 0))) >>> 0;
				_lhs$5 = dst; _index$5 = 0; (_index$5 < 0 || _index$5 >= _lhs$5.$length) ? $throwRuntimeError("index out of range") : _lhs$5.$array[_lhs$5.$offset + _index$5] = (((_index$5 < 0 || _index$5 >= _lhs$5.$length) ? $throwRuntimeError("index out of range") : _lhs$5.$array[_lhs$5.$offset + _index$5]) | ((((0 < 0 || 0 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 0]) >>> 2 << 24 >>> 24))) >>> 0;
			} else {
				_lhs$6 = dst; _index$6 = 3; (_index$6 < 0 || _index$6 >= _lhs$6.$length) ? $throwRuntimeError("index out of range") : _lhs$6.$array[_lhs$6.$offset + _index$6] = (((_index$6 < 0 || _index$6 >= _lhs$6.$length) ? $throwRuntimeError("index out of range") : _lhs$6.$array[_lhs$6.$offset + _index$6]) | (((((2 < 0 || 2 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 2]) & 63) >>> 0))) >>> 0;
				_lhs$7 = dst; _index$7 = 2; (_index$7 < 0 || _index$7 >= _lhs$7.$length) ? $throwRuntimeError("index out of range") : _lhs$7.$array[_lhs$7.$offset + _index$7] = (((_index$7 < 0 || _index$7 >= _lhs$7.$length) ? $throwRuntimeError("index out of range") : _lhs$7.$array[_lhs$7.$offset + _index$7]) | ((((2 < 0 || 2 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 2]) >>> 6 << 24 >>> 24))) >>> 0;
				_lhs$8 = dst; _index$8 = 2; (_index$8 < 0 || _index$8 >= _lhs$8.$length) ? $throwRuntimeError("index out of range") : _lhs$8.$array[_lhs$8.$offset + _index$8] = (((_index$8 < 0 || _index$8 >= _lhs$8.$length) ? $throwRuntimeError("index out of range") : _lhs$8.$array[_lhs$8.$offset + _index$8]) | (((((((1 < 0 || 1 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 1]) << 2 << 24 >>> 24)) & 63) >>> 0))) >>> 0;
				_lhs$9 = dst; _index$9 = 1; (_index$9 < 0 || _index$9 >= _lhs$9.$length) ? $throwRuntimeError("index out of range") : _lhs$9.$array[_lhs$9.$offset + _index$9] = (((_index$9 < 0 || _index$9 >= _lhs$9.$length) ? $throwRuntimeError("index out of range") : _lhs$9.$array[_lhs$9.$offset + _index$9]) | ((((1 < 0 || 1 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 1]) >>> 4 << 24 >>> 24))) >>> 0;
				_lhs$10 = dst; _index$10 = 1; (_index$10 < 0 || _index$10 >= _lhs$10.$length) ? $throwRuntimeError("index out of range") : _lhs$10.$array[_lhs$10.$offset + _index$10] = (((_index$10 < 0 || _index$10 >= _lhs$10.$length) ? $throwRuntimeError("index out of range") : _lhs$10.$array[_lhs$10.$offset + _index$10]) | (((((((0 < 0 || 0 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 0]) << 4 << 24 >>> 24)) & 63) >>> 0))) >>> 0;
				_lhs$11 = dst; _index$11 = 0; (_index$11 < 0 || _index$11 >= _lhs$11.$length) ? $throwRuntimeError("index out of range") : _lhs$11.$array[_lhs$11.$offset + _index$11] = (((_index$11 < 0 || _index$11 >= _lhs$11.$length) ? $throwRuntimeError("index out of range") : _lhs$11.$array[_lhs$11.$offset + _index$11]) | ((((0 < 0 || 0 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 0]) >>> 2 << 24 >>> 24))) >>> 0;
			}
			j = 0;
			while (j < 4) {
				(j < 0 || j >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + j] = enc.encode.charCodeAt(((j < 0 || j >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + j]));
				j = j + (1) >> 0;
			}
			if (src.$length < 3) {
				(3 < 0 || 3 >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + 3] = 61;
				if (src.$length < 2) {
					(2 < 0 || 2 >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + 2] = 61;
				}
				break;
			}
			src = $subslice(src, 3);
			dst = $subslice(dst, 4);
		}
	};
	Encoding.prototype.Encode = function(dst, src) { return this.$val.Encode(dst, src); };
	Encoding.Ptr.prototype.EncodeToString = function(src) {
		var enc, buf;
		enc = this;
		buf = ($sliceType($Uint8)).make(enc.EncodedLen(src.$length));
		enc.Encode(buf, src);
		return $bytesToString(buf);
	};
	Encoding.prototype.EncodeToString = function(src) { return this.$val.EncodeToString(src); };
	Encoding.Ptr.prototype.EncodedLen = function(n) {
		var enc, x, _q;
		enc = this;
		return (x = (_q = ((n + 2 >> 0)) / 3, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")), (((x >>> 16 << 16) * 4 >> 0) + (x << 16 >>> 16) * 4) >> 0);
	};
	Encoding.prototype.EncodedLen = function(n) { return this.$val.EncodedLen(n); };
	CorruptInputError.prototype.Error = function() {
		var e;
		e = this;
		return "illegal base64 data at input byte " + strconv.FormatInt(new $Int64(e.$high, e.$low), 10);
	};
	$ptrType(CorruptInputError).prototype.Error = function() { return this.$get().Error(); };
	Encoding.Ptr.prototype.decode = function(dst, src) {
		var n = 0, end = false, err = $ifaceNil, enc, olen, dbuf, dlen, _ref, _i, j, _tmp, _tmp$1, _tmp$2, in$1, _ref$1, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tmp$10, _tmp$11, _tmp$12, _tmp$13, x, _tmp$14, _tmp$15, _tmp$16, _ref$2, _tmp$17, _tmp$18, _tmp$19;
		enc = this;
		olen = src.$length;
		while (src.$length > 0 && !end) {
			dbuf = ($arrayType($Uint8, 4)).zero(); $copy(dbuf, ($arrayType($Uint8, 4)).zero(), ($arrayType($Uint8, 4)));
			dlen = 4;
			_ref = dbuf;
			_i = 0;
			while (_i < 4) {
				j = _i;
				if (src.$length === 0) {
					_tmp = n; _tmp$1 = false; _tmp$2 = new CorruptInputError(0, ((olen - src.$length >> 0) - j >> 0)); n = _tmp; end = _tmp$1; err = _tmp$2;
					return [n, end, err];
				}
				in$1 = ((0 < 0 || 0 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 0]);
				src = $subslice(src, 1);
				if (in$1 === 61) {
					_ref$1 = j;
					if (_ref$1 === 0 || _ref$1 === 1) {
						_tmp$3 = n; _tmp$4 = false; _tmp$5 = new CorruptInputError(0, ((olen - src.$length >> 0) - 1 >> 0)); n = _tmp$3; end = _tmp$4; err = _tmp$5;
						return [n, end, err];
					} else if (_ref$1 === 2) {
						if (src.$length === 0) {
							_tmp$6 = n; _tmp$7 = false; _tmp$8 = new CorruptInputError(0, olen); n = _tmp$6; end = _tmp$7; err = _tmp$8;
							return [n, end, err];
						}
						if (!((((0 < 0 || 0 >= src.$length) ? $throwRuntimeError("index out of range") : src.$array[src.$offset + 0]) === 61))) {
							_tmp$9 = n; _tmp$10 = false; _tmp$11 = new CorruptInputError(0, ((olen - src.$length >> 0) - 1 >> 0)); n = _tmp$9; end = _tmp$10; err = _tmp$11;
							return [n, end, err];
						}
						src = $subslice(src, 1);
					}
					if (src.$length > 0) {
						err = new CorruptInputError(0, (olen - src.$length >> 0));
					}
					_tmp$12 = j; _tmp$13 = true; dlen = _tmp$12; end = _tmp$13;
					break;
				}
				(j < 0 || j >= dbuf.length) ? $throwRuntimeError("index out of range") : dbuf[j] = (x = enc.decodeMap, ((in$1 < 0 || in$1 >= x.length) ? $throwRuntimeError("index out of range") : x[in$1]));
				if (((j < 0 || j >= dbuf.length) ? $throwRuntimeError("index out of range") : dbuf[j]) === 255) {
					_tmp$14 = n; _tmp$15 = false; _tmp$16 = new CorruptInputError(0, ((olen - src.$length >> 0) - 1 >> 0)); n = _tmp$14; end = _tmp$15; err = _tmp$16;
					return [n, end, err];
				}
				_i++;
			}
			_ref$2 = dlen;
			if (_ref$2 === 4) {
				(2 < 0 || 2 >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + 2] = ((dbuf[2] << 6 << 24 >>> 24) | dbuf[3]) >>> 0;
				(1 < 0 || 1 >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + 1] = ((dbuf[1] << 4 << 24 >>> 24) | (dbuf[2] >>> 2 << 24 >>> 24)) >>> 0;
				(0 < 0 || 0 >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + 0] = ((dbuf[0] << 2 << 24 >>> 24) | (dbuf[1] >>> 4 << 24 >>> 24)) >>> 0;
			} else if (_ref$2 === 3) {
				(1 < 0 || 1 >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + 1] = ((dbuf[1] << 4 << 24 >>> 24) | (dbuf[2] >>> 2 << 24 >>> 24)) >>> 0;
				(0 < 0 || 0 >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + 0] = ((dbuf[0] << 2 << 24 >>> 24) | (dbuf[1] >>> 4 << 24 >>> 24)) >>> 0;
			} else if (_ref$2 === 2) {
				(0 < 0 || 0 >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + 0] = ((dbuf[0] << 2 << 24 >>> 24) | (dbuf[1] >>> 4 << 24 >>> 24)) >>> 0;
			}
			dst = $subslice(dst, 3);
			n = n + ((dlen - 1 >> 0)) >> 0;
		}
		_tmp$17 = n; _tmp$18 = end; _tmp$19 = err; n = _tmp$17; end = _tmp$18; err = _tmp$19;
		return [n, end, err];
	};
	Encoding.prototype.decode = function(dst, src) { return this.$val.decode(dst, src); };
	Encoding.Ptr.prototype.Decode = function(dst, src) {
		var n = 0, err = $ifaceNil, enc, _tuple;
		enc = this;
		src = bytes.Map(removeNewlinesMapper, src);
		_tuple = enc.decode(dst, src); n = _tuple[0]; err = _tuple[2];
		return [n, err];
	};
	Encoding.prototype.Decode = function(dst, src) { return this.$val.Decode(dst, src); };
	Encoding.Ptr.prototype.DecodeString = function(s) {
		var enc, dbuf, _tuple, n, err;
		enc = this;
		s = strings.Map(removeNewlinesMapper, s);
		dbuf = ($sliceType($Uint8)).make(enc.DecodedLen(s.length));
		_tuple = enc.Decode(dbuf, new ($sliceType($Uint8))($stringToBytes(s))); n = _tuple[0]; err = _tuple[1];
		return [$subslice(dbuf, 0, n), err];
	};
	Encoding.prototype.DecodeString = function(s) { return this.$val.DecodeString(s); };
	Encoding.Ptr.prototype.DecodedLen = function(n) {
		var enc, x, _q;
		enc = this;
		return (x = (_q = n / 4, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")), (((x >>> 16 << 16) * 3 >> 0) + (x << 16 >>> 16) * 3) >> 0);
	};
	Encoding.prototype.DecodedLen = function(n) { return this.$val.DecodedLen(n); };
	$pkg.$init = function() {
		($ptrType(Encoding)).methods = [["Decode", "Decode", "", $funcType([($sliceType($Uint8)), ($sliceType($Uint8))], [$Int, $error], false), -1], ["DecodeString", "DecodeString", "", $funcType([$String], [($sliceType($Uint8)), $error], false), -1], ["DecodedLen", "DecodedLen", "", $funcType([$Int], [$Int], false), -1], ["Encode", "Encode", "", $funcType([($sliceType($Uint8)), ($sliceType($Uint8))], [], false), -1], ["EncodeToString", "EncodeToString", "", $funcType([($sliceType($Uint8))], [$String], false), -1], ["EncodedLen", "EncodedLen", "", $funcType([$Int], [$Int], false), -1], ["decode", "decode", "encoding/base64", $funcType([($sliceType($Uint8)), ($sliceType($Uint8))], [$Int, $Bool, $error], false), -1]];
		Encoding.init([["encode", "encode", "encoding/base64", $String, ""], ["decodeMap", "decodeMap", "encoding/base64", ($arrayType($Uint8, 256)), ""]]);
		CorruptInputError.methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		($ptrType(CorruptInputError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		$pkg.StdEncoding = NewEncoding("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
		$pkg.URLEncoding = NewEncoding("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_");
		removeNewlinesMapper = (function(r) {
			if ((r === 13) || (r === 10)) {
				return -1;
			}
			return r;
		});
	};
	return $pkg;
})();
$packages["unicode/utf16"] = (function() {
	var $pkg = {};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["encoding/json"] = (function() {
	var $pkg = {}, bytes = $packages["bytes"], encoding = $packages["encoding"], base64 = $packages["encoding/base64"], errors = $packages["errors"], fmt = $packages["fmt"], reflect = $packages["reflect"], runtime = $packages["runtime"], strconv = $packages["strconv"], unicode = $packages["unicode"], utf16 = $packages["unicode/utf16"], utf8 = $packages["unicode/utf8"], math = $packages["math"], sort = $packages["sort"], strings = $packages["strings"], sync = $packages["sync"], io = $packages["io"], Number, Marshaler, errPhase, numberType, byteSliceType, marshalerType, textMarshalerType;
	Number = $pkg.Number = $newType(8, "String", "json.Number", "Number", "encoding/json", null);
	Marshaler = $pkg.Marshaler = $newType(8, "Interface", "json.Marshaler", "Marshaler", "encoding/json", null);
	Number.prototype.String = function() {
		var n;
		n = this.$val !== undefined ? this.$val : this;
		return n;
	};
	$ptrType(Number).prototype.String = function() { return new Number(this.$get()).String(); };
	Number.prototype.Float64 = function() {
		var n;
		n = this.$val !== undefined ? this.$val : this;
		return strconv.ParseFloat(n, 64);
	};
	$ptrType(Number).prototype.Float64 = function() { return new Number(this.$get()).Float64(); };
	Number.prototype.Int64 = function() {
		var n;
		n = this.$val !== undefined ? this.$val : this;
		return strconv.ParseInt(n, 10, 64);
	};
	$ptrType(Number).prototype.Int64 = function() { return new Number(this.$get()).Int64(); };
	$pkg.$init = function() {
		Number.methods = [["Float64", "Float64", "", $funcType([], [$Float64, $error], false), -1], ["Int64", "Int64", "", $funcType([], [$Int64, $error], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(Number)).methods = [["Float64", "Float64", "", $funcType([], [$Float64, $error], false), -1], ["Int64", "Int64", "", $funcType([], [$Int64, $error], false), -1], ["String", "String", "", $funcType([], [$String], false), -1]];
		Marshaler.init([["MarshalJSON", "MarshalJSON", "", $funcType([], [($sliceType($Uint8)), $error], false)]]);
		errPhase = errors.New("JSON decoder out of sync - data changing underfoot?");
		numberType = reflect.TypeOf(new Number(""));
		byteSliceType = reflect.TypeOf(($sliceType($Uint8)).nil);
		marshalerType = reflect.TypeOf($newDataPointer($ifaceNil, ($ptrType(Marshaler)))).Elem();
		textMarshalerType = reflect.TypeOf($newDataPointer($ifaceNil, ($ptrType(encoding.TextMarshaler)))).Elem();
	};
	return $pkg;
})();
$packages["html"] = (function() {
	var $pkg = {}, bytes = $packages["bytes"], strings = $packages["strings"], utf8 = $packages["unicode/utf8"];
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["net/url"] = (function() {
	var $pkg = {}, bytes = $packages["bytes"], errors = $packages["errors"], sort = $packages["sort"], strconv = $packages["strconv"], strings = $packages["strings"], shouldEscape, QueryEscape, escape;
	shouldEscape = function(c, mode) {
		var _ref, _ref$1;
		if (65 <= c && c <= 90 || 97 <= c && c <= 122 || 48 <= c && c <= 57) {
			return false;
		}
		_ref = c;
		if (_ref === 45 || _ref === 95 || _ref === 46 || _ref === 126) {
			return false;
		} else if (_ref === 36 || _ref === 38 || _ref === 43 || _ref === 44 || _ref === 47 || _ref === 58 || _ref === 59 || _ref === 61 || _ref === 63 || _ref === 64) {
			_ref$1 = mode;
			if (_ref$1 === 1) {
				return c === 63;
			} else if (_ref$1 === 2) {
				return (c === 64) || (c === 47) || (c === 58);
			} else if (_ref$1 === 3) {
				return true;
			} else if (_ref$1 === 4) {
				return false;
			}
		}
		return true;
	};
	QueryEscape = $pkg.QueryEscape = function(s) {
		return escape(s, 3);
	};
	escape = function(s, mode) {
		var _tmp, _tmp$1, spaceCount, hexCount, i, c, t, j, i$1, c$1, x, x$1;
		_tmp = 0; _tmp$1 = 0; spaceCount = _tmp; hexCount = _tmp$1;
		i = 0;
		while (i < s.length) {
			c = s.charCodeAt(i);
			if (shouldEscape(c, mode)) {
				if ((c === 32) && (mode === 3)) {
					spaceCount = spaceCount + (1) >> 0;
				} else {
					hexCount = hexCount + (1) >> 0;
				}
			}
			i = i + (1) >> 0;
		}
		if ((spaceCount === 0) && (hexCount === 0)) {
			return s;
		}
		t = ($sliceType($Uint8)).make((s.length + ((((2 >>> 16 << 16) * hexCount >> 0) + (2 << 16 >>> 16) * hexCount) >> 0) >> 0));
		j = 0;
		i$1 = 0;
		while (i$1 < s.length) {
			c$1 = s.charCodeAt(i$1);
			if ((c$1 === 32) && (mode === 3)) {
				(j < 0 || j >= t.$length) ? $throwRuntimeError("index out of range") : t.$array[t.$offset + j] = 43;
				j = j + (1) >> 0;
			} else if (shouldEscape(c$1, mode)) {
				(j < 0 || j >= t.$length) ? $throwRuntimeError("index out of range") : t.$array[t.$offset + j] = 37;
				(x = j + 1 >> 0, (x < 0 || x >= t.$length) ? $throwRuntimeError("index out of range") : t.$array[t.$offset + x] = "0123456789ABCDEF".charCodeAt((c$1 >>> 4 << 24 >>> 24)));
				(x$1 = j + 2 >> 0, (x$1 < 0 || x$1 >= t.$length) ? $throwRuntimeError("index out of range") : t.$array[t.$offset + x$1] = "0123456789ABCDEF".charCodeAt(((c$1 & 15) >>> 0)));
				j = j + (3) >> 0;
			} else {
				(j < 0 || j >= t.$length) ? $throwRuntimeError("index out of range") : t.$array[t.$offset + j] = s.charCodeAt(i$1);
				j = j + (1) >> 0;
			}
			i$1 = i$1 + (1) >> 0;
		}
		return $bytesToString(t);
	};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["container/list"] = (function() {
	var $pkg = {};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["text/template/parse"] = (function() {
	var $pkg = {}, list = $packages["container/list"], fmt = $packages["fmt"], strings = $packages["strings"], unicode = $packages["unicode"], utf8 = $packages["unicode/utf8"], bytes = $packages["bytes"], strconv = $packages["strconv"], runtime = $packages["runtime"];
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["text/template"] = (function() {
	var $pkg = {}, bytes = $packages["bytes"], fmt = $packages["fmt"], io = $packages["io"], reflect = $packages["reflect"], runtime = $packages["runtime"], sort = $packages["sort"], strings = $packages["strings"], parse = $packages["text/template/parse"], errors = $packages["errors"], url = $packages["net/url"], unicode = $packages["unicode"], utf8 = $packages["unicode/utf8"], ioutil = $packages["io/ioutil"], filepath = $packages["path/filepath"], errorType, fmtStringerType, builtins, builtinFuncs, errBadComparisonType, errBadComparison, errNoComparison, htmlQuot, htmlApos, htmlAmp, htmlLt, htmlGt, jsLowUni, hex, jsBackslash, jsApos, jsQuot, jsLt, jsGt, _map, _key, isTrue, canBeNil, indirect, printableValue, createValueFuncs, addValueFuncs, goodFunc, index, length, call, truth, and, or, not, basicKind, eq, ne, lt, le, gt, ge, HTMLEscape, HTMLEscapeString, HTMLEscaper, JSEscape, JSEscapeString, jsIsSpecial, JSEscaper, URLQueryEscaper, evalArgs;
	isTrue = function(val) {
		var truth$1 = false, ok = false, _tmp, _tmp$1, _ref, x, x$1, x$2, _tmp$2, _tmp$3;
		if (!val.IsValid()) {
			_tmp = false; _tmp$1 = true; truth$1 = _tmp; ok = _tmp$1;
			return [truth$1, ok];
		}
		_ref = val.Kind();
		if (_ref === 17 || _ref === 21 || _ref === 23 || _ref === 24) {
			truth$1 = val.Len() > 0;
		} else if (_ref === 1) {
			truth$1 = val.Bool();
		} else if (_ref === 15 || _ref === 16) {
			truth$1 = !((x = val.Complex(), (x.$real === 0 && x.$imag === 0)));
		} else if (_ref === 18 || _ref === 19 || _ref === 22 || _ref === 20) {
			truth$1 = !val.IsNil();
		} else if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			truth$1 = !((x$1 = val.Int(), (x$1.$high === 0 && x$1.$low === 0)));
		} else if (_ref === 13 || _ref === 14) {
			truth$1 = !((val.Float() === 0));
		} else if (_ref === 7 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11 || _ref === 12) {
			truth$1 = !((x$2 = val.Uint(), (x$2.$high === 0 && x$2.$low === 0)));
		} else if (_ref === 25) {
			truth$1 = true;
		} else {
			return [truth$1, ok];
		}
		_tmp$2 = truth$1; _tmp$3 = true; truth$1 = _tmp$2; ok = _tmp$3;
		return [truth$1, ok];
	};
	canBeNil = function(typ) {
		var _ref;
		_ref = typ.Kind();
		if (_ref === 18 || _ref === 19 || _ref === 20 || _ref === 21 || _ref === 22 || _ref === 23) {
			return true;
		}
		return false;
	};
	indirect = function(v) {
		var rv = new reflect.Value.Ptr(), isNil = false, _tmp, _tmp$1, _tmp$2, _tmp$3;
		while ((v.Kind() === 22) || (v.Kind() === 20)) {
			if (v.IsNil()) {
				_tmp = new reflect.Value.Ptr(); $copy(_tmp, v, reflect.Value); _tmp$1 = true; $copy(rv, _tmp, reflect.Value); isNil = _tmp$1;
				return [rv, isNil];
			}
			if ((v.Kind() === 20) && v.NumMethod() > 0) {
				break;
			}
			$copy(v, v.Elem(), reflect.Value);
		}
		_tmp$2 = new reflect.Value.Ptr(); $copy(_tmp$2, v, reflect.Value); _tmp$3 = false; $copy(rv, _tmp$2, reflect.Value); isNil = _tmp$3;
		return [rv, isNil];
	};
	printableValue = function(v) {
		var _tuple, _ref;
		if (v.Kind() === 22) {
			_tuple = indirect($clone(v, reflect.Value)); $copy(v, _tuple[0], reflect.Value);
		}
		if (!v.IsValid()) {
			return [new $String("<no value>"), true];
		}
		if (!v.Type().Implements(errorType) && !v.Type().Implements(fmtStringerType)) {
			if (v.CanAddr() && (reflect.PtrTo(v.Type()).Implements(errorType) || reflect.PtrTo(v.Type()).Implements(fmtStringerType))) {
				$copy(v, v.Addr(), reflect.Value);
			} else {
				_ref = v.Kind();
				if (_ref === 18 || _ref === 19) {
					return [$ifaceNil, false];
				}
			}
		}
		return [v.Interface(), true];
	};
	createValueFuncs = function(funcMap) {
		var m;
		m = new $Map();
		addValueFuncs(m, funcMap);
		return m;
	};
	addValueFuncs = function(out, in$1) {
		var _ref, _i, _keys, _entry, name, fn, v, _key$1;
		_ref = in$1;
		_i = 0;
		_keys = $keys(_ref);
		while (_i < _keys.length) {
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				continue;
			}
			name = _entry.k;
			fn = _entry.v;
			v = new reflect.Value.Ptr(); $copy(v, reflect.ValueOf(fn), reflect.Value);
			if (!((v.Kind() === 19))) {
				$panic(new $String("value for " + name + " not a function"));
			}
			if (!goodFunc(v.Type())) {
				$panic(fmt.Errorf("can't install method/function %q with %d results", new ($sliceType($emptyInterface))([new $String(name), new $Int(v.Type().NumOut())])));
			}
			_key$1 = name; (out || $throwRuntimeError("assignment to entry in nil map"))[_key$1] = { k: _key$1, v: v };
			_i++;
		}
	};
	goodFunc = function(typ) {
		if (typ.NumOut() === 1) {
			return true;
		} else if ((typ.NumOut() === 2) && $interfaceIsEqual(typ.Out(1), errorType)) {
			return true;
		}
		return false;
	};
	index = function(item, indices) {
		var v, _ref, _i, i, index$1, isNil, _tuple, _ref$1, x, _ref$2, x$1, x$2, x$3;
		v = new reflect.Value.Ptr(); $copy(v, reflect.ValueOf(item), reflect.Value);
		_ref = indices;
		_i = 0;
		while (_i < _ref.$length) {
			i = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			index$1 = new reflect.Value.Ptr(); $copy(index$1, reflect.ValueOf(i), reflect.Value);
			isNil = false;
			_tuple = indirect($clone(v, reflect.Value)); $copy(v, _tuple[0], reflect.Value); isNil = _tuple[1];
			if (isNil) {
				return [$ifaceNil, fmt.Errorf("index of nil pointer", new ($sliceType($emptyInterface))([]))];
			}
			_ref$1 = v.Kind();
			if (_ref$1 === 17 || _ref$1 === 23 || _ref$1 === 24) {
				x = new $Int64(0, 0);
				_ref$2 = index$1.Kind();
				if (_ref$2 === 2 || _ref$2 === 3 || _ref$2 === 4 || _ref$2 === 5 || _ref$2 === 6) {
					x = index$1.Int();
				} else if (_ref$2 === 7 || _ref$2 === 8 || _ref$2 === 9 || _ref$2 === 10 || _ref$2 === 11 || _ref$2 === 12) {
					x = (x$1 = index$1.Uint(), new $Int64(x$1.$high, x$1.$low));
				} else {
					return [$ifaceNil, fmt.Errorf("cannot index slice/array with type %s", new ($sliceType($emptyInterface))([index$1.Type()]))];
				}
				if ((x.$high < 0 || (x.$high === 0 && x.$low < 0)) || (x$2 = new $Int64(0, v.Len()), (x.$high > x$2.$high || (x.$high === x$2.$high && x.$low >= x$2.$low)))) {
					return [$ifaceNil, fmt.Errorf("index out of range: %d", new ($sliceType($emptyInterface))([x]))];
				}
				$copy(v, v.Index(((x.$low + ((x.$high >> 31) * 4294967296)) >> 0)), reflect.Value);
			} else if (_ref$1 === 21) {
				if (!index$1.IsValid()) {
					$copy(index$1, reflect.Zero(v.Type().Key()), reflect.Value);
				}
				if (!index$1.Type().AssignableTo(v.Type().Key())) {
					return [$ifaceNil, fmt.Errorf("%s is not index type for %s", new ($sliceType($emptyInterface))([index$1.Type(), v.Type()]))];
				}
				x$3 = new reflect.Value.Ptr(); $copy(x$3, v.MapIndex($clone(index$1, reflect.Value)), reflect.Value);
				if (x$3.IsValid()) {
					$copy(v, x$3, reflect.Value);
				} else {
					$copy(v, reflect.Zero(v.Type().Elem()), reflect.Value);
				}
			} else {
				return [$ifaceNil, fmt.Errorf("can't index item of type %s", new ($sliceType($emptyInterface))([v.Type()]))];
			}
			_i++;
		}
		return [v.Interface(), $ifaceNil];
	};
	length = function(item) {
		var _tuple, v, isNil, _ref;
		_tuple = indirect($clone(reflect.ValueOf(item), reflect.Value)); v = new reflect.Value.Ptr(); $copy(v, _tuple[0], reflect.Value); isNil = _tuple[1];
		if (isNil) {
			return [0, fmt.Errorf("len of nil pointer", new ($sliceType($emptyInterface))([]))];
		}
		_ref = v.Kind();
		if (_ref === 17 || _ref === 18 || _ref === 21 || _ref === 23 || _ref === 24) {
			return [v.Len(), $ifaceNil];
		}
		return [0, fmt.Errorf("len of type %s", new ($sliceType($emptyInterface))([v.Type()]))];
	};
	call = function(fn, args) {
		var v, typ, numIn, dddType, argv, _ref, _i, i, arg, value, argType, result;
		v = new reflect.Value.Ptr(); $copy(v, reflect.ValueOf(fn), reflect.Value);
		typ = v.Type();
		if (!((typ.Kind() === 19))) {
			return [$ifaceNil, fmt.Errorf("non-function of type %s", new ($sliceType($emptyInterface))([typ]))];
		}
		if (!goodFunc(typ)) {
			return [$ifaceNil, fmt.Errorf("function called with %d args; should be 1 or 2", new ($sliceType($emptyInterface))([new $Int(typ.NumOut())]))];
		}
		numIn = typ.NumIn();
		dddType = $ifaceNil;
		if (typ.IsVariadic()) {
			if (args.$length < (numIn - 1 >> 0)) {
				return [$ifaceNil, fmt.Errorf("wrong number of args: got %d want at least %d", new ($sliceType($emptyInterface))([new $Int(args.$length), new $Int((numIn - 1 >> 0))]))];
			}
			dddType = typ.In(numIn - 1 >> 0).Elem();
		} else {
			if (!((args.$length === numIn))) {
				return [$ifaceNil, fmt.Errorf("wrong number of args: got %d want %d", new ($sliceType($emptyInterface))([new $Int(args.$length), new $Int(numIn)]))];
			}
		}
		argv = ($sliceType(reflect.Value)).make(args.$length);
		_ref = args;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			arg = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			value = new reflect.Value.Ptr(); $copy(value, reflect.ValueOf(arg), reflect.Value);
			argType = $ifaceNil;
			if (!typ.IsVariadic() || i < (numIn - 1 >> 0)) {
				argType = typ.In(i);
			} else {
				argType = dddType;
			}
			if (!value.IsValid() && canBeNil(argType)) {
				$copy(value, reflect.Zero(argType), reflect.Value);
			}
			if (!value.Type().AssignableTo(argType)) {
				return [$ifaceNil, fmt.Errorf("arg %d has type %s; should be %s", new ($sliceType($emptyInterface))([new $Int(i), value.Type(), argType]))];
			}
			$copy(((i < 0 || i >= argv.$length) ? $throwRuntimeError("index out of range") : argv.$array[argv.$offset + i]), value, reflect.Value);
			_i++;
		}
		result = v.Call(argv);
		if ((result.$length === 2) && !((1 < 0 || 1 >= result.$length) ? $throwRuntimeError("index out of range") : result.$array[result.$offset + 1]).IsNil()) {
			return [((0 < 0 || 0 >= result.$length) ? $throwRuntimeError("index out of range") : result.$array[result.$offset + 0]).Interface(), $assertType(((1 < 0 || 1 >= result.$length) ? $throwRuntimeError("index out of range") : result.$array[result.$offset + 1]).Interface(), $error)];
		}
		return [((0 < 0 || 0 >= result.$length) ? $throwRuntimeError("index out of range") : result.$array[result.$offset + 0]).Interface(), $ifaceNil];
	};
	truth = function(a) {
		var _tuple, t;
		_tuple = isTrue($clone(reflect.ValueOf(a), reflect.Value)); t = _tuple[0];
		return t;
	};
	and = function(arg0, args) {
		var _ref, _i, i;
		if (!truth(arg0)) {
			return arg0;
		}
		_ref = args;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			arg0 = ((i < 0 || i >= args.$length) ? $throwRuntimeError("index out of range") : args.$array[args.$offset + i]);
			if (!truth(arg0)) {
				break;
			}
			_i++;
		}
		return arg0;
	};
	or = function(arg0, args) {
		var _ref, _i, i;
		if (truth(arg0)) {
			return arg0;
		}
		_ref = args;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			arg0 = ((i < 0 || i >= args.$length) ? $throwRuntimeError("index out of range") : args.$array[args.$offset + i]);
			if (truth(arg0)) {
				break;
			}
			_i++;
		}
		return arg0;
	};
	not = function(arg) {
		var truth$1 = false, _tuple;
		_tuple = isTrue($clone(reflect.ValueOf(arg), reflect.Value)); truth$1 = _tuple[0];
		truth$1 = !truth$1;
		return truth$1;
	};
	basicKind = function(v) {
		var _ref;
		_ref = v.Kind();
		if (_ref === 1) {
			return [1, $ifaceNil];
		} else if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			return [3, $ifaceNil];
		} else if (_ref === 7 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11 || _ref === 12) {
			return [7, $ifaceNil];
		} else if (_ref === 13 || _ref === 14) {
			return [4, $ifaceNil];
		} else if (_ref === 15 || _ref === 16) {
			return [2, $ifaceNil];
		} else if (_ref === 24) {
			return [6, $ifaceNil];
		}
		return [0, errBadComparisonType];
	};
	eq = function(arg1, arg2) {
		var v1, _tuple, k1, err, _ref, _i, arg, v2, _tuple$1, k2, err$1, truth$1, _ref$1, x, x$1, x$2, x$3, x$4, x$5;
		v1 = new reflect.Value.Ptr(); $copy(v1, reflect.ValueOf(arg1), reflect.Value);
		_tuple = basicKind($clone(v1, reflect.Value)); k1 = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return [false, err];
		}
		if (arg2.$length === 0) {
			return [false, errNoComparison];
		}
		_ref = arg2;
		_i = 0;
		while (_i < _ref.$length) {
			arg = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			v2 = new reflect.Value.Ptr(); $copy(v2, reflect.ValueOf(arg), reflect.Value);
			_tuple$1 = basicKind($clone(v2, reflect.Value)); k2 = _tuple$1[0]; err$1 = _tuple$1[1];
			if (!($interfaceIsEqual(err$1, $ifaceNil))) {
				return [false, err$1];
			}
			if (!((k1 === k2))) {
				return [false, errBadComparison];
			}
			truth$1 = false;
			_ref$1 = k1;
			if (_ref$1 === 1) {
				truth$1 = v1.Bool() === v2.Bool();
			} else if (_ref$1 === 2) {
				truth$1 = (x = v1.Complex(), x$1 = v2.Complex(), (x.$real === x$1.$real && x.$imag === x$1.$imag));
			} else if (_ref$1 === 4) {
				truth$1 = v1.Float() === v2.Float();
			} else if (_ref$1 === 3) {
				truth$1 = (x$2 = v1.Int(), x$3 = v2.Int(), (x$2.$high === x$3.$high && x$2.$low === x$3.$low));
			} else if (_ref$1 === 6) {
				truth$1 = v1.String() === v2.String();
			} else if (_ref$1 === 7) {
				truth$1 = (x$4 = v1.Uint(), x$5 = v2.Uint(), (x$4.$high === x$5.$high && x$4.$low === x$5.$low));
			} else {
				$panic(new $String("invalid kind"));
			}
			if (truth$1) {
				return [true, $ifaceNil];
			}
			_i++;
		}
		return [false, $ifaceNil];
	};
	ne = function(arg1, arg2) {
		var _tuple, equal, err;
		_tuple = eq(arg1, new ($sliceType($emptyInterface))([arg2])); equal = _tuple[0]; err = _tuple[1];
		return [!equal, err];
	};
	lt = function(arg1, arg2) {
		var v1, _tuple, k1, err, v2, _tuple$1, k2, truth$1, _ref, x, x$1, x$2, x$3;
		v1 = new reflect.Value.Ptr(); $copy(v1, reflect.ValueOf(arg1), reflect.Value);
		_tuple = basicKind($clone(v1, reflect.Value)); k1 = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return [false, err];
		}
		v2 = new reflect.Value.Ptr(); $copy(v2, reflect.ValueOf(arg2), reflect.Value);
		_tuple$1 = basicKind($clone(v2, reflect.Value)); k2 = _tuple$1[0]; err = _tuple$1[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return [false, err];
		}
		if (!((k1 === k2))) {
			return [false, errBadComparison];
		}
		truth$1 = false;
		_ref = k1;
		if (_ref === 1 || _ref === 2) {
			return [false, errBadComparisonType];
		} else if (_ref === 4) {
			truth$1 = v1.Float() < v2.Float();
		} else if (_ref === 3) {
			truth$1 = (x = v1.Int(), x$1 = v2.Int(), (x.$high < x$1.$high || (x.$high === x$1.$high && x.$low < x$1.$low)));
		} else if (_ref === 6) {
			truth$1 = v1.String() < v2.String();
		} else if (_ref === 7) {
			truth$1 = (x$2 = v1.Uint(), x$3 = v2.Uint(), (x$2.$high < x$3.$high || (x$2.$high === x$3.$high && x$2.$low < x$3.$low)));
		} else {
			$panic(new $String("invalid kind"));
		}
		return [truth$1, $ifaceNil];
	};
	le = function(arg1, arg2) {
		var _tuple, lessThan, err;
		_tuple = lt(arg1, arg2); lessThan = _tuple[0]; err = _tuple[1];
		if (lessThan || !($interfaceIsEqual(err, $ifaceNil))) {
			return [lessThan, err];
		}
		return eq(arg1, new ($sliceType($emptyInterface))([arg2]));
	};
	gt = function(arg1, arg2) {
		var _tuple, lessOrEqual, err;
		_tuple = le(arg1, arg2); lessOrEqual = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return [false, err];
		}
		return [!lessOrEqual, $ifaceNil];
	};
	ge = function(arg1, arg2) {
		var _tuple, lessThan, err;
		_tuple = lt(arg1, arg2); lessThan = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return [false, err];
		}
		return [!lessThan, $ifaceNil];
	};
	HTMLEscape = $pkg.HTMLEscape = function(w, b) {
		var last, _ref, _i, i, c, html, _ref$1;
		last = 0;
		_ref = b;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			c = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			html = ($sliceType($Uint8)).nil;
			_ref$1 = c;
			if (_ref$1 === 34) {
				html = htmlQuot;
			} else if (_ref$1 === 39) {
				html = htmlApos;
			} else if (_ref$1 === 38) {
				html = htmlAmp;
			} else if (_ref$1 === 60) {
				html = htmlLt;
			} else if (_ref$1 === 62) {
				html = htmlGt;
			} else {
				_i++;
				continue;
			}
			w.Write($subslice(b, last, i));
			w.Write(html);
			last = i + 1 >> 0;
			_i++;
		}
		w.Write($subslice(b, last));
	};
	HTMLEscapeString = $pkg.HTMLEscapeString = function(s) {
		var b;
		if (strings.IndexAny(s, "'\"&<>") < 0) {
			return s;
		}
		b = new bytes.Buffer.Ptr(); $copy(b, new bytes.Buffer.Ptr(), bytes.Buffer);
		HTMLEscape(b, new ($sliceType($Uint8))($stringToBytes(s)));
		return b.String();
	};
	HTMLEscaper = $pkg.HTMLEscaper = function(args) {
		return HTMLEscapeString(evalArgs(args));
	};
	JSEscape = $pkg.JSEscape = function(w, b) {
		var last, i, c, _ref, _tmp, _tmp$1, t, b$1, _tuple, r, size;
		last = 0;
		i = 0;
		while (i < b.$length) {
			c = ((i < 0 || i >= b.$length) ? $throwRuntimeError("index out of range") : b.$array[b.$offset + i]);
			if (!jsIsSpecial((c >> 0))) {
				i = i + (1) >> 0;
				continue;
			}
			w.Write($subslice(b, last, i));
			if (c < 128) {
				_ref = c;
				if (_ref === 92) {
					w.Write(jsBackslash);
				} else if (_ref === 39) {
					w.Write(jsApos);
				} else if (_ref === 34) {
					w.Write(jsQuot);
				} else if (_ref === 60) {
					w.Write(jsLt);
				} else if (_ref === 62) {
					w.Write(jsGt);
				} else {
					w.Write(jsLowUni);
					_tmp = c >>> 4 << 24 >>> 24; _tmp$1 = (c & 15) >>> 0; t = _tmp; b$1 = _tmp$1;
					w.Write($subslice(hex, t, (t + 1 << 24 >>> 24)));
					w.Write($subslice(hex, b$1, (b$1 + 1 << 24 >>> 24)));
				}
			} else {
				_tuple = utf8.DecodeRune($subslice(b, i)); r = _tuple[0]; size = _tuple[1];
				if (unicode.IsPrint(r)) {
					w.Write($subslice(b, i, (i + size >> 0)));
				} else {
					fmt.Fprintf(w, "\\u%04X", new ($sliceType($emptyInterface))([new $Int32(r)]));
				}
				i = i + ((size - 1 >> 0)) >> 0;
			}
			last = i + 1 >> 0;
			i = i + (1) >> 0;
		}
		w.Write($subslice(b, last));
	};
	JSEscapeString = $pkg.JSEscapeString = function(s) {
		var b;
		if (strings.IndexFunc(s, jsIsSpecial) < 0) {
			return s;
		}
		b = new bytes.Buffer.Ptr(); $copy(b, new bytes.Buffer.Ptr(), bytes.Buffer);
		JSEscape(b, new ($sliceType($Uint8))($stringToBytes(s)));
		return b.String();
	};
	jsIsSpecial = function(r) {
		var _ref;
		_ref = r;
		if (_ref === 92 || _ref === 39 || _ref === 34 || _ref === 60 || _ref === 62) {
			return true;
		}
		return r < 32 || 128 <= r;
	};
	JSEscaper = $pkg.JSEscaper = function(args) {
		return JSEscapeString(evalArgs(args));
	};
	URLQueryEscaper = $pkg.URLQueryEscaper = function(args) {
		return url.QueryEscape(evalArgs(args));
	};
	evalArgs = function(args) {
		var ok, s, _tuple, _ref, _i, i, arg, _tuple$1, a, ok$1;
		ok = false;
		s = "";
		if (args.$length === 1) {
			_tuple = $assertType(((0 < 0 || 0 >= args.$length) ? $throwRuntimeError("index out of range") : args.$array[args.$offset + 0]), $String, true); s = _tuple[0]; ok = _tuple[1];
		}
		if (!ok) {
			_ref = args;
			_i = 0;
			while (_i < _ref.$length) {
				i = _i;
				arg = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
				_tuple$1 = printableValue($clone(reflect.ValueOf(arg), reflect.Value)); a = _tuple$1[0]; ok$1 = _tuple$1[1];
				if (ok$1) {
					(i < 0 || i >= args.$length) ? $throwRuntimeError("index out of range") : args.$array[args.$offset + i] = a;
				}
				_i++;
			}
			s = fmt.Sprint(args);
		}
		return s;
	};
	$pkg.$init = function() {
		errorType = reflect.TypeOf(($ptrType($error)).nil).Elem();
		fmtStringerType = reflect.TypeOf(($ptrType(fmt.Stringer)).nil).Elem();
		errBadComparisonType = errors.New("invalid type for comparison");
		errBadComparison = errors.New("incompatible types for comparison");
		errNoComparison = errors.New("missing argument for comparison");
		htmlQuot = new ($sliceType($Uint8))($stringToBytes("&#34;"));
		htmlApos = new ($sliceType($Uint8))($stringToBytes("&#39;"));
		htmlAmp = new ($sliceType($Uint8))($stringToBytes("&amp;"));
		htmlLt = new ($sliceType($Uint8))($stringToBytes("&lt;"));
		htmlGt = new ($sliceType($Uint8))($stringToBytes("&gt;"));
		jsLowUni = new ($sliceType($Uint8))($stringToBytes("\\u00"));
		hex = new ($sliceType($Uint8))($stringToBytes("0123456789ABCDEF"));
		jsBackslash = new ($sliceType($Uint8))($stringToBytes("\\\\"));
		jsApos = new ($sliceType($Uint8))($stringToBytes("\\'"));
		jsQuot = new ($sliceType($Uint8))($stringToBytes("\\\""));
		jsLt = new ($sliceType($Uint8))($stringToBytes("\\x3C"));
		jsGt = new ($sliceType($Uint8))($stringToBytes("\\x3E"));
		builtins = (_map = new $Map(), _key = "and", _map[_key] = { k: _key, v: new ($funcType([$emptyInterface, ($sliceType($emptyInterface))], [$emptyInterface], true))(and) }, _key = "call", _map[_key] = { k: _key, v: new ($funcType([$emptyInterface, ($sliceType($emptyInterface))], [$emptyInterface, $error], true))(call) }, _key = "html", _map[_key] = { k: _key, v: new ($funcType([($sliceType($emptyInterface))], [$String], true))(HTMLEscaper) }, _key = "index", _map[_key] = { k: _key, v: new ($funcType([$emptyInterface, ($sliceType($emptyInterface))], [$emptyInterface, $error], true))(index) }, _key = "js", _map[_key] = { k: _key, v: new ($funcType([($sliceType($emptyInterface))], [$String], true))(JSEscaper) }, _key = "len", _map[_key] = { k: _key, v: new ($funcType([$emptyInterface], [$Int, $error], false))(length) }, _key = "not", _map[_key] = { k: _key, v: new ($funcType([$emptyInterface], [$Bool], false))(not) }, _key = "or", _map[_key] = { k: _key, v: new ($funcType([$emptyInterface, ($sliceType($emptyInterface))], [$emptyInterface], true))(or) }, _key = "print", _map[_key] = { k: _key, v: new ($funcType([($sliceType($emptyInterface))], [$String], true))(fmt.Sprint) }, _key = "printf", _map[_key] = { k: _key, v: new ($funcType([$String, ($sliceType($emptyInterface))], [$String], true))(fmt.Sprintf) }, _key = "println", _map[_key] = { k: _key, v: new ($funcType([($sliceType($emptyInterface))], [$String], true))(fmt.Sprintln) }, _key = "urlquery", _map[_key] = { k: _key, v: new ($funcType([($sliceType($emptyInterface))], [$String], true))(URLQueryEscaper) }, _key = "eq", _map[_key] = { k: _key, v: new ($funcType([$emptyInterface, ($sliceType($emptyInterface))], [$Bool, $error], true))(eq) }, _key = "ge", _map[_key] = { k: _key, v: new ($funcType([$emptyInterface, $emptyInterface], [$Bool, $error], false))(ge) }, _key = "gt", _map[_key] = { k: _key, v: new ($funcType([$emptyInterface, $emptyInterface], [$Bool, $error], false))(gt) }, _key = "le", _map[_key] = { k: _key, v: new ($funcType([$emptyInterface, $emptyInterface], [$Bool, $error], false))(le) }, _key = "lt", _map[_key] = { k: _key, v: new ($funcType([$emptyInterface, $emptyInterface], [$Bool, $error], false))(lt) }, _key = "ne", _map[_key] = { k: _key, v: new ($funcType([$emptyInterface, $emptyInterface], [$Bool, $error], false))(ne) }, _map);
		builtinFuncs = createValueFuncs(builtins);
	};
	return $pkg;
})();
$packages["html/template"] = (function() {
	var $pkg = {}, strings = $packages["strings"], fmt = $packages["fmt"], reflect = $packages["reflect"], bytes = $packages["bytes"], unicode = $packages["unicode"], utf8 = $packages["unicode/utf8"], html = $packages["html"], io = $packages["io"], template = $packages["text/template"], parse = $packages["text/template/parse"], json = $packages["encoding/json"], ioutil = $packages["io/ioutil"], filepath = $packages["path/filepath"], sync = $packages["sync"], errorType, fmtStringerType, jsonMarshalType, HTMLEscapeString;
	HTMLEscapeString = $pkg.HTMLEscapeString = function(s) {
		return template.HTMLEscapeString(s);
	};
	$pkg.$init = function() {
		errorType = reflect.TypeOf(($ptrType($error)).nil).Elem();
		fmtStringerType = reflect.TypeOf(($ptrType(fmt.Stringer)).nil).Elem();
		jsonMarshalType = reflect.TypeOf(($ptrType(json.Marshaler)).nil).Elem();
	};
	return $pkg;
})();
$packages["/Users/h8liu/projects/github.io/xlang/xlangjs"] = (function() {
	var $pkg = {}, bytes = $packages["bytes"], fmt = $packages["fmt"], template = $packages["html/template"], strings = $packages["strings"], js = $packages["github.com/gopherjs/gopherjs/js"], parser = $packages["github.com/h8liu/xlang/parser"], main, parse, tokenClass, parseTokens, _parse;
	main = function() {
		var _map, _key;
		$global.xlang = $externalize((_map = new $Map(), _key = "parseTokens", _map[_key] = { k: _key, v: new ($funcType([$String, $String], [$String], false))(parseTokens) }, _key = "parse", _map[_key] = { k: _key, v: new ($funcType([$String, $String], [($mapType($String, $emptyInterface))], false))(parse) }, _map), ($mapType($String, $emptyInterface)));
	};
	parse = function(file, code$1) {
		var ret, _tuple, block, errs, _key, _key$1;
		ret = new $Map();
		_tuple = _parse(file, code$1); block = _tuple[0]; errs = _tuple[1];
		_key = "block"; (ret || $throwRuntimeError("assignment to entry in nil map"))[_key] = { k: _key, v: new $String(block) };
		_key$1 = "errs"; (ret || $throwRuntimeError("assignment to entry in nil map"))[_key$1] = { k: _key$1, v: new $String(errs) };
		return ret;
	};
	tokenClass = function(t) {
		var _ref;
		if (t.Lit === "\n" && (t.Type === 2)) {
			return "implicit-semi";
		}
		_ref = t.Type;
		if (_ref === 3) {
			return "ident";
		} else if (_ref === 4 || _ref === 5) {
			return "num";
		} else if (_ref === 2) {
			return "operator";
		} else if (_ref === 7) {
			return "keyword";
		} else if (_ref === 1) {
			return "comment";
		}
		return "na";
	};
	parseTokens = function(file, code$1) {
		var lex, out, lines, toks, t, _key, x, x$1, curTok, curPos, curLit, emit, _ref, _i, row, line, _ref$1, _i$1, _rune, col, r;
		lex = parser.LexStr(file, code$1);
		out = new bytes.Buffer.Ptr();
		lines = strings.Split(code$1, "\n");
		toks = new $Map();
		while (lex.Scan()) {
			t = lex.Token();
			_key = (x = $shiftLeft64(new $Uint64(0, t.Pos.Row), 32), x$1 = new $Uint64(0, t.Pos.Col), new $Uint64(x.$high + x$1.$high, x.$low + x$1.$low)); (toks || $throwRuntimeError("assignment to entry in nil map"))[_key.$key()] = { k: _key, v: t };
		}
		curTok = ($ptrType(parser.Tok)).nil;
		curPos = 0;
		curLit = ($sliceType($Int32)).nil;
		emit = (function(row, col, r) {
			var x$2, x$3, index, _entry, tok, class$1, _ref, _i, _rune, r$1, _entry$1;
			index = (x$2 = $shiftLeft64(new $Uint64(0, row), 32), x$3 = new $Uint64(0, col), new $Uint64(x$2.$high + x$3.$high, x$2.$low + x$3.$low));
			if (curTok === ($ptrType(parser.Tok)).nil) {
				tok = (_entry = toks[index.$key()], _entry !== undefined ? _entry.v : ($ptrType(parser.Tok)).nil);
				if (!(tok === ($ptrType(parser.Tok)).nil)) {
					curTok = tok;
					class$1 = tokenClass(tok);
					fmt.Fprintf(out, "<span class=\"%s\">", new ($sliceType($emptyInterface))([new $String(class$1)]));
					if (class$1 === "implicit-semi") {
						fmt.Fprintf(out, ";", new ($sliceType($emptyInterface))([]));
					}
					curPos = 0;
					curLit = ($sliceType($Int32)).nil;
					_ref = tok.Lit;
					_i = 0;
					while (_i < _ref.length) {
						_rune = $decodeRune(_ref, _i);
						r$1 = _rune[0];
						curLit = $append(curLit, r$1);
						_i += _rune[1];
					}
				}
			} else {
				if (!((_entry$1 = toks[index.$key()], _entry$1 !== undefined ? _entry$1.v : ($ptrType(parser.Tok)).nil) === ($ptrType(parser.Tok)).nil)) {
					fmt.Println(new ($sliceType($emptyInterface))([new $String("overlapping token %d:%d\n"), new $Int(row), new $Int(col)]));
				}
			}
			if (r === 9) {
				fmt.Fprint(out, new ($sliceType($emptyInterface))([new $String("&nbsp;&nbsp;&nbsp;&nbsp;")]));
			} else if (r === 10) {
				fmt.Fprint(out, new ($sliceType($emptyInterface))([new $String("<br/>")]));
			} else if (r === 32) {
				fmt.Fprint(out, new ($sliceType($emptyInterface))([new $String("&nbsp;")]));
			} else {
				fmt.Fprint(out, new ($sliceType($emptyInterface))([new $String(template.HTMLEscapeString($encodeRune(r)))]));
			}
			if (!(curTok === ($ptrType(parser.Tok)).nil)) {
				if (!((((curPos < 0 || curPos >= curLit.$length) ? $throwRuntimeError("index out of range") : curLit.$array[curLit.$offset + curPos]) === r))) {
					fmt.Printf("mismatch at %d:%d\n", new ($sliceType($emptyInterface))([new $Int(row), new $Int(col)]));
				}
				curPos = curPos + (1) >> 0;
				if (curPos >= curTok.Lit.length) {
					curTok = ($ptrType(parser.Tok)).nil;
					fmt.Fprintf(out, "</span>", new ($sliceType($emptyInterface))([]));
				}
			}
		});
		_ref = lines;
		_i = 0;
		while (_i < _ref.$length) {
			row = _i;
			line = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			_ref$1 = line;
			_i$1 = 0;
			while (_i$1 < _ref$1.length) {
				_rune = $decodeRune(_ref$1, _i$1);
				col = _i$1;
				r = _rune[0];
				emit(row + 1 >> 0, col + 1 >> 0, r);
				_i$1 += _rune[1];
			}
			emit(row + 1 >> 0, line.length + 1 >> 0, 10);
			_i++;
		}
		return out.String();
	};
	_parse = function(file, code$1) {
		var block = "", errs = "", ident, printStmt, out, errOut, printIdent, printBlock, _tuple, b, es, _tmp, _tmp$1, _tmp$2, _tmp$3;
		ident = 0;
		printStmt = $throwNilPointerError;
		out = new bytes.Buffer.Ptr();
		errOut = new bytes.Buffer.Ptr();
		printIdent = (function() {
			var i;
			i = 0;
			while (i < ident) {
				fmt.Fprint(out, new ($sliceType($emptyInterface))([new $String("&nbsp;&nbsp;&nbsp;&nbsp;")]));
				i = i + (1) >> 0;
			}
		});
		printBlock = (function(b) {
			var _ref, _i, stmt;
			fmt.Fprintf(out, "<span class=\"brace\">{</span><br/>\n", new ($sliceType($emptyInterface))([]));
			ident = ident + (1) >> 0;
			_ref = b;
			_i = 0;
			while (_i < _ref.$length) {
				stmt = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
				printStmt(stmt);
				_i++;
			}
			ident = ident - (1) >> 0;
			printIdent();
			fmt.Fprintf(out, "<span class=\"brace\">}</span> ", new ($sliceType($emptyInterface))([]));
		});
		printStmt = (function(s) {
			var _ref, _i, e, t, class$1;
			printIdent();
			if (s.$length === 0) {
				fmt.Fprintf(out, "<span class=\"empty\">(empty statement)</span>", new ($sliceType($emptyInterface))([]));
			} else {
				_ref = s;
				_i = 0;
				while (_i < _ref.$length) {
					e = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
					if (!(e.Block === parser.Block.nil)) {
						printBlock(e.Block);
					} else {
						t = e.Tok;
						class$1 = tokenClass(t);
						fmt.Fprintf(out, "<span class=\"%s\">%s</span> ", new ($sliceType($emptyInterface))([new $String(class$1), new $String(template.HTMLEscapeString(t.Lit))]));
					}
					_i++;
				}
			}
			fmt.Fprintf(out, "<br/>\n", new ($sliceType($emptyInterface))([]));
		});
		_tuple = parser.ParseStr(file, code$1); b = _tuple[0]; es = _tuple[1];
		if (!($interfaceIsEqual(es, $ifaceNil))) {
			while (es.Scan()) {
				fmt.Fprintf(errOut, "<div class=\"error\">%s</div>", new ($sliceType($emptyInterface))([new $String(template.HTMLEscapeString(es.Error().String()))]));
			}
			_tmp = ""; _tmp$1 = errOut.String(); block = _tmp; errs = _tmp$1;
			return [block, errs];
		}
		printBlock(b);
		_tmp$2 = out.String(); _tmp$3 = ""; block = _tmp$2; errs = _tmp$3;
		return [block, errs];
	};
	$pkg.$run = function($b) {
		var $this = this, $args = arguments, $r, $s = 0;
		/* */ if(!$b) { $nonblockingCall(); }; var $f = function() { while (true) { switch ($s) { case 0:
		$packages["github.com/gopherjs/gopherjs/js"].$init();
		$packages["runtime"].$init();
		$packages["errors"].$init();
		$packages["sync/atomic"].$init();
		$packages["sync"].$init();
		$packages["io"].$init();
		$packages["unicode"].$init();
		$packages["unicode/utf8"].$init();
		$packages["bytes"].$init();
		$packages["math"].$init();
		$packages["syscall"].$init();
		$packages["strings"].$init();
		$packages["time"].$init();
		$packages["os"].$init();
		$packages["strconv"].$init();
		$packages["reflect"].$init();
		$packages["fmt"].$init();
		$packages["bufio"].$init();
		$packages["sort"].$init();
		$packages["path/filepath"].$init();
		$packages["io/ioutil"].$init();
		$packages["github.com/h8liu/xlang/parser"].$init();
		$packages["encoding"].$init();
		$packages["flag"].$init();
		$packages["text/tabwriter"].$init();
		$packages["runtime/pprof"].$init();
		$r = $packages["testing"].$init(true); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$packages["encoding/base64"].$init();
		$packages["unicode/utf16"].$init();
		$packages["encoding/json"].$init();
		$packages["html"].$init();
		$packages["net/url"].$init();
		$packages["container/list"].$init();
		$packages["text/template/parse"].$init();
		$packages["text/template"].$init();
		$packages["html/template"].$init();
		$pkg.$init();
		main();
		/* */ case -1: } return; } }; $f.$blocking = true; return $f;
	};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$go($packages["/Users/h8liu/projects/github.io/xlang/xlangjs"].$run, [], true);

})();
//# sourceMappingURL=xlang.js.map
