import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
/**
* @vue/shared v3.5.39
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
// @__NO_SIDE_EFFECTS__
function makeMap(str) {
  const map = /* @__PURE__ */ Object.create(null);
  for (const key of str.split(",")) map[key] = 1;
  return (val) => val in map;
}
const EMPTY_OBJ = {};
const EMPTY_ARR = [];
const NOOP = () => {
};
const NO = () => false;
const isOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // uppercase letter
(key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97);
const isModelListener = (key) => key.startsWith("onUpdate:");
const extend = Object.assign;
const remove = (arr, el) => {
  const i = arr.indexOf(el);
  if (i > -1) {
    arr.splice(i, 1);
  }
};
const hasOwnProperty$1 = Object.prototype.hasOwnProperty;
const hasOwn = (val, key) => hasOwnProperty$1.call(val, key);
const isArray = Array.isArray;
const isMap = (val) => toTypeString(val) === "[object Map]";
const isSet = (val) => toTypeString(val) === "[object Set]";
const isDate = (val) => toTypeString(val) === "[object Date]";
const isFunction = (val) => typeof val === "function";
const isString = (val) => typeof val === "string";
const isSymbol = (val) => typeof val === "symbol";
const isObject = (val) => val !== null && typeof val === "object";
const isPromise = (val) => {
  return (isObject(val) || isFunction(val)) && isFunction(val.then) && isFunction(val.catch);
};
const objectToString = Object.prototype.toString;
const toTypeString = (value) => objectToString.call(value);
const toRawType = (value) => {
  return toTypeString(value).slice(8, -1);
};
const isPlainObject = (val) => toTypeString(val) === "[object Object]";
const isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
const isReservedProp = /* @__PURE__ */ makeMap(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
);
const cacheStringFunction = (fn) => {
  const cache = /* @__PURE__ */ Object.create(null);
  return ((str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  });
};
const camelizeRE = /-\w/g;
const camelize = cacheStringFunction(
  (str) => {
    return str.replace(camelizeRE, (c) => c.slice(1).toUpperCase());
  }
);
const hyphenateRE = /\B([A-Z])/g;
const hyphenate = cacheStringFunction(
  (str) => str.replace(hyphenateRE, "-$1").toLowerCase()
);
const capitalize = cacheStringFunction((str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
});
const toHandlerKey = cacheStringFunction(
  (str) => {
    const s = str ? `on${capitalize(str)}` : ``;
    return s;
  }
);
const hasChanged = (value, oldValue) => !Object.is(value, oldValue);
const invokeArrayFns = (fns, ...arg) => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg);
  }
};
const def = (obj, key, value, writable = false) => {
  Object.defineProperty(obj, key, {
    configurable: true,
    enumerable: false,
    writable,
    value
  });
};
const looseToNumber = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? val : n;
};
let _globalThis;
const getGlobalThis = () => {
  return _globalThis || (_globalThis = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
};
function normalizeStyle(value) {
  if (isArray(value)) {
    const res = {};
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const normalized = isString(item) ? parseStringStyle(item) : normalizeStyle(item);
      if (normalized) {
        for (const key in normalized) {
          res[key] = normalized[key];
        }
      }
    }
    return res;
  } else if (isString(value) || isObject(value)) {
    return value;
  }
}
const listDelimiterRE = /;(?![^(]*\))/g;
const propertyDelimiterRE = /:([^]+)/;
const styleCommentRE = /\/\*[^]*?\*\//g;
function parseStringStyle(cssText) {
  const ret = {};
  cssText.replace(styleCommentRE, "").split(listDelimiterRE).forEach((item) => {
    if (item) {
      const tmp = item.split(propertyDelimiterRE);
      tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
    }
  });
  return ret;
}
function normalizeClass(value) {
  let res = "";
  if (isString(value)) {
    res = value;
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i]);
      if (normalized) {
        res += normalized + " ";
      }
    }
  } else if (isObject(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + " ";
      }
    }
  }
  return res.trim();
}
const specialBooleanAttrs = `itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly`;
const isSpecialBooleanAttr = /* @__PURE__ */ makeMap(specialBooleanAttrs);
function includeBooleanAttr(value) {
  return !!value || value === "";
}
function looseCompareArrays(a, b) {
  if (a.length !== b.length) return false;
  let equal = true;
  for (let i = 0; equal && i < a.length; i++) {
    equal = looseEqual(a[i], b[i]);
  }
  return equal;
}
function looseEqual(a, b) {
  if (a === b) return true;
  let aValidType = isDate(a);
  let bValidType = isDate(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? a.getTime() === b.getTime() : false;
  }
  aValidType = isSymbol(a);
  bValidType = isSymbol(b);
  if (aValidType || bValidType) {
    return a === b;
  }
  aValidType = isArray(a);
  bValidType = isArray(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? looseCompareArrays(a, b) : false;
  }
  aValidType = isObject(a);
  bValidType = isObject(b);
  if (aValidType || bValidType) {
    if (!aValidType || !bValidType) {
      return false;
    }
    const aKeysCount = Object.keys(a).length;
    const bKeysCount = Object.keys(b).length;
    if (aKeysCount !== bKeysCount) {
      return false;
    }
    for (const key in a) {
      const aHasKey = a.hasOwnProperty(key);
      const bHasKey = b.hasOwnProperty(key);
      if (aHasKey && !bHasKey || !aHasKey && bHasKey || !looseEqual(a[key], b[key])) {
        return false;
      }
    }
  }
  return String(a) === String(b);
}
const isRef$1 = (val) => {
  return !!(val && val["__v_isRef"] === true);
};
const toDisplayString = (val) => {
  return isString(val) ? val : val == null ? "" : isArray(val) || isObject(val) && (val.toString === objectToString || !isFunction(val.toString)) ? isRef$1(val) ? toDisplayString(val.value) : JSON.stringify(val, replacer, 2) : String(val);
};
const replacer = (_key, val) => {
  if (isRef$1(val)) {
    return replacer(_key, val.value);
  } else if (isMap(val)) {
    return {
      [`Map(${val.size})`]: [...val.entries()].reduce(
        (entries, [key, val2], i) => {
          entries[stringifySymbol(key, i) + " =>"] = val2;
          return entries;
        },
        {}
      )
    };
  } else if (isSet(val)) {
    return {
      [`Set(${val.size})`]: [...val.values()].map((v) => stringifySymbol(v))
    };
  } else if (isSymbol(val)) {
    return stringifySymbol(val);
  } else if (isObject(val) && !isArray(val) && !isPlainObject(val)) {
    return String(val);
  }
  return val;
};
const stringifySymbol = (v, i = "") => {
  var _a;
  return (
    // Symbol.description in es2019+ so we need to cast here to pass
    // the lib: es2016 check
    isSymbol(v) ? `Symbol(${(_a = v.description) != null ? _a : i})` : v
  );
};
/**
* @vue/reactivity v3.5.39
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let activeEffectScope;
class EffectScope {
  // TODO isolatedDeclarations "__v_skip"
  constructor(detached = false) {
    this.detached = detached;
    this._active = true;
    this._on = 0;
    this.effects = [];
    this.cleanups = [];
    this._isPaused = false;
    this._warnOnRun = true;
    this.__v_skip = true;
    if (!detached && activeEffectScope) {
      if (activeEffectScope.active) {
        this.parent = activeEffectScope;
        this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
          this
        ) - 1;
      } else {
        this._active = false;
        this._warnOnRun = false;
      }
    }
  }
  get active() {
    return this._active;
  }
  pause() {
    if (this._active) {
      this._isPaused = true;
      let i, l;
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].pause();
        }
      }
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].pause();
      }
    }
  }
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume() {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false;
        let i, l;
        if (this.scopes) {
          for (i = 0, l = this.scopes.length; i < l; i++) {
            this.scopes[i].resume();
          }
        }
        for (i = 0, l = this.effects.length; i < l; i++) {
          this.effects[i].resume();
        }
      }
    }
  }
  run(fn) {
    if (this._active) {
      const currentEffectScope = activeEffectScope;
      try {
        activeEffectScope = this;
        return fn();
      } finally {
        activeEffectScope = currentEffectScope;
      }
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    if (++this._on === 1) {
      this.prevScope = activeEffectScope;
      activeEffectScope = this;
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      if (activeEffectScope === this) {
        activeEffectScope = this.prevScope;
      } else {
        let current = activeEffectScope;
        while (current) {
          if (current.prevScope === this) {
            current.prevScope = this.prevScope;
            break;
          }
          current = current.prevScope;
        }
      }
      this.prevScope = void 0;
    }
  }
  stop(fromParent) {
    if (this._active) {
      this._active = false;
      let i, l;
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop();
      }
      this.effects.length = 0;
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]();
      }
      this.cleanups.length = 0;
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].stop(true);
        }
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !fromParent) {
        const last = this.parent.scopes.pop();
        if (last && last !== this) {
          this.parent.scopes[this.index] = last;
          last.index = this.index;
        }
      }
      this.parent = void 0;
    }
  }
}
function getCurrentScope() {
  return activeEffectScope;
}
let activeSub;
const pausedQueueEffects = /* @__PURE__ */ new WeakSet();
class ReactiveEffect {
  constructor(fn) {
    this.fn = fn;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 1 | 4;
    this.next = void 0;
    this.cleanup = void 0;
    this.scheduler = void 0;
    if (activeEffectScope) {
      if (activeEffectScope.active) {
        activeEffectScope.effects.push(this);
      } else {
        this.flags &= -2;
      }
    }
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    if (this.flags & 64) {
      this.flags &= -65;
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this);
        this.trigger();
      }
    }
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags & 2 && !(this.flags & 32)) {
      return;
    }
    if (!(this.flags & 8)) {
      batch(this);
    }
  }
  run() {
    if (!(this.flags & 1)) {
      return this.fn();
    }
    this.flags |= 2;
    cleanupEffect(this);
    prepareDeps(this);
    const prevEffect = activeSub;
    const prevShouldTrack = shouldTrack;
    activeSub = this;
    shouldTrack = true;
    try {
      return this.fn();
    } finally {
      cleanupDeps(this);
      activeSub = prevEffect;
      shouldTrack = prevShouldTrack;
      this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let link = this.deps; link; link = link.nextDep) {
        removeSub(link);
      }
      this.deps = this.depsTail = void 0;
      cleanupEffect(this);
      this.onStop && this.onStop();
      this.flags &= -2;
    }
  }
  trigger() {
    if (this.flags & 64) {
      pausedQueueEffects.add(this);
    } else if (this.scheduler) {
      this.scheduler();
    } else {
      this.runIfDirty();
    }
  }
  /**
   * @internal
   */
  runIfDirty() {
    if (isDirty(this)) {
      this.run();
    }
  }
  get dirty() {
    return isDirty(this);
  }
}
let batchDepth = 0;
let batchedSub;
let batchedComputed;
function batch(sub, isComputed = false) {
  sub.flags |= 8;
  if (isComputed) {
    sub.next = batchedComputed;
    batchedComputed = sub;
    return;
  }
  sub.next = batchedSub;
  batchedSub = sub;
}
function startBatch() {
  batchDepth++;
}
function endBatch() {
  if (--batchDepth > 0) {
    return;
  }
  if (batchedComputed) {
    let e = batchedComputed;
    batchedComputed = void 0;
    while (e) {
      const next = e.next;
      e.next = void 0;
      e.flags &= -9;
      e = next;
    }
  }
  let error;
  while (batchedSub) {
    let e = batchedSub;
    batchedSub = void 0;
    while (e) {
      const next = e.next;
      e.next = void 0;
      e.flags &= -9;
      if (e.flags & 1) {
        try {
          ;
          e.trigger();
        } catch (err) {
          if (!error) error = err;
        }
      }
      e = next;
    }
  }
  if (error) throw error;
}
function prepareDeps(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    link.version = -1;
    link.prevActiveLink = link.dep.activeLink;
    link.dep.activeLink = link;
  }
}
function cleanupDeps(sub) {
  let head;
  let tail = sub.depsTail;
  let link = tail;
  while (link) {
    const prev = link.prevDep;
    if (link.version === -1) {
      if (link === tail) tail = prev;
      removeSub(link);
      removeDep(link);
    } else {
      head = link;
    }
    link.dep.activeLink = link.prevActiveLink;
    link.prevActiveLink = void 0;
    link = prev;
  }
  sub.deps = head;
  sub.depsTail = tail;
}
function isDirty(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    if (link.dep.version !== link.version || link.dep.computed && (refreshComputed(link.dep.computed) || link.dep.version !== link.version)) {
      return true;
    }
  }
  if (sub._dirty) {
    return true;
  }
  return false;
}
function refreshComputed(computed2) {
  if (computed2.flags & 4 && !(computed2.flags & 16)) {
    return;
  }
  computed2.flags &= -17;
  if (computed2.globalVersion === globalVersion) {
    return;
  }
  computed2.globalVersion = globalVersion;
  if (!computed2.isSSR && computed2.flags & 128 && (!computed2.deps && !computed2._dirty || !isDirty(computed2))) {
    return;
  }
  computed2.flags |= 2;
  const dep = computed2.dep;
  const prevSub = activeSub;
  const prevShouldTrack = shouldTrack;
  activeSub = computed2;
  shouldTrack = true;
  try {
    prepareDeps(computed2);
    const value = computed2.fn(computed2._value);
    if (dep.version === 0 || hasChanged(value, computed2._value)) {
      computed2.flags |= 128;
      computed2._value = value;
      dep.version++;
    }
  } catch (err) {
    dep.version++;
    throw err;
  } finally {
    activeSub = prevSub;
    shouldTrack = prevShouldTrack;
    cleanupDeps(computed2);
    computed2.flags &= -3;
  }
}
function removeSub(link, soft = false) {
  const { dep, prevSub, nextSub } = link;
  if (prevSub) {
    prevSub.nextSub = nextSub;
    link.prevSub = void 0;
  }
  if (nextSub) {
    nextSub.prevSub = prevSub;
    link.nextSub = void 0;
  }
  if (dep.subs === link) {
    dep.subs = prevSub;
    if (!prevSub && dep.computed) {
      dep.computed.flags &= -5;
      for (let l = dep.computed.deps; l; l = l.nextDep) {
        removeSub(l, true);
      }
    }
  }
  if (!soft && !--dep.sc && dep.map) {
    dep.map.delete(dep.key);
  }
}
function removeDep(link) {
  const { prevDep, nextDep } = link;
  if (prevDep) {
    prevDep.nextDep = nextDep;
    link.prevDep = void 0;
  }
  if (nextDep) {
    nextDep.prevDep = prevDep;
    link.nextDep = void 0;
  }
}
let shouldTrack = true;
const trackStack = [];
function pauseTracking() {
  trackStack.push(shouldTrack);
  shouldTrack = false;
}
function resetTracking() {
  const last = trackStack.pop();
  shouldTrack = last === void 0 ? true : last;
}
function cleanupEffect(e) {
  const { cleanup } = e;
  e.cleanup = void 0;
  if (cleanup) {
    const prevSub = activeSub;
    activeSub = void 0;
    try {
      cleanup();
    } finally {
      activeSub = prevSub;
    }
  }
}
let globalVersion = 0;
class Link {
  constructor(sub, dep) {
    this.sub = sub;
    this.dep = dep;
    this.version = dep.version;
    this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class Dep {
  // TODO isolatedDeclarations "__v_skip"
  constructor(computed2) {
    this.computed = computed2;
    this.version = 0;
    this.activeLink = void 0;
    this.subs = void 0;
    this.map = void 0;
    this.key = void 0;
    this.sc = 0;
    this.__v_skip = true;
  }
  track(debugInfo) {
    if (!activeSub || !shouldTrack || activeSub === this.computed) {
      return;
    }
    let link = this.activeLink;
    if (link === void 0 || link.sub !== activeSub) {
      link = this.activeLink = new Link(activeSub, this);
      if (!activeSub.deps) {
        activeSub.deps = activeSub.depsTail = link;
      } else {
        link.prevDep = activeSub.depsTail;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
      }
      addSub(link);
    } else if (link.version === -1) {
      link.version = this.version;
      if (link.nextDep) {
        const next = link.nextDep;
        next.prevDep = link.prevDep;
        if (link.prevDep) {
          link.prevDep.nextDep = next;
        }
        link.prevDep = activeSub.depsTail;
        link.nextDep = void 0;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
        if (activeSub.deps === link) {
          activeSub.deps = next;
        }
      }
    }
    return link;
  }
  trigger(debugInfo) {
    this.version++;
    globalVersion++;
    this.notify(debugInfo);
  }
  notify(debugInfo) {
    startBatch();
    try {
      if (false) ;
      for (let link = this.subs; link; link = link.prevSub) {
        if (link.sub.notify()) {
          ;
          link.sub.dep.notify();
        }
      }
    } finally {
      endBatch();
    }
  }
}
function addSub(link) {
  link.dep.sc++;
  if (link.sub.flags & 4) {
    const computed2 = link.dep.computed;
    if (computed2 && !link.dep.subs) {
      computed2.flags |= 4 | 16;
      for (let l = computed2.deps; l; l = l.nextDep) {
        addSub(l);
      }
    }
    const currentTail = link.dep.subs;
    if (currentTail !== link) {
      link.prevSub = currentTail;
      if (currentTail) currentTail.nextSub = link;
    }
    link.dep.subs = link;
  }
}
const targetMap = /* @__PURE__ */ new WeakMap();
const ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
const MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
const ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
function track(target, type, key) {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
    }
    let dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, dep = new Dep());
      dep.map = depsMap;
      dep.key = key;
    }
    {
      dep.track();
    }
  }
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    globalVersion++;
    return;
  }
  const run = (dep) => {
    if (dep) {
      {
        dep.trigger();
      }
    }
  };
  startBatch();
  if (type === "clear") {
    depsMap.forEach(run);
  } else {
    const targetIsArray = isArray(target);
    const isArrayIndex = targetIsArray && isIntegerKey(key);
    if (targetIsArray && key === "length") {
      const newLength = Number(newValue);
      depsMap.forEach((dep, key2) => {
        if (key2 === "length" || key2 === ARRAY_ITERATE_KEY || !isSymbol(key2) && key2 >= newLength) {
          run(dep);
        }
      });
    } else {
      if (key !== void 0 || depsMap.has(void 0)) {
        run(depsMap.get(key));
      }
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY));
      }
      switch (type) {
        case "add":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          } else if (isArrayIndex) {
            run(depsMap.get("length"));
          }
          break;
        case "delete":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          }
          break;
        case "set":
          if (isMap(target)) {
            run(depsMap.get(ITERATE_KEY));
          }
          break;
      }
    }
  }
  endBatch();
}
function reactiveReadArray(array) {
  const raw = /* @__PURE__ */ toRaw(array);
  if (raw === array) return raw;
  track(raw, "iterate", ARRAY_ITERATE_KEY);
  return /* @__PURE__ */ isShallow(array) ? raw : raw.map(toReactive);
}
function shallowReadArray(arr) {
  track(arr = /* @__PURE__ */ toRaw(arr), "iterate", ARRAY_ITERATE_KEY);
  return arr;
}
function toWrapped(target, item) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return /* @__PURE__ */ isReactive(target) ? toReadonly(toReactive(item)) : toReadonly(item);
  }
  return toReactive(item);
}
const arrayInstrumentations = {
  __proto__: null,
  [Symbol.iterator]() {
    return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
  },
  concat(...args) {
    return reactiveReadArray(this).concat(
      ...args.map((x) => isArray(x) ? reactiveReadArray(x) : x)
    );
  },
  entries() {
    return iterator(this, "entries", (value) => {
      value[1] = toWrapped(this, value[1]);
      return value;
    });
  },
  every(fn, thisArg) {
    return apply(this, "every", fn, thisArg, void 0, arguments);
  },
  filter(fn, thisArg) {
    return apply(
      this,
      "filter",
      fn,
      thisArg,
      (v) => v.map((item) => toWrapped(this, item)),
      arguments
    );
  },
  find(fn, thisArg) {
    return apply(
      this,
      "find",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findIndex(fn, thisArg) {
    return apply(this, "findIndex", fn, thisArg, void 0, arguments);
  },
  findLast(fn, thisArg) {
    return apply(
      this,
      "findLast",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findLastIndex(fn, thisArg) {
    return apply(this, "findLastIndex", fn, thisArg, void 0, arguments);
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(fn, thisArg) {
    return apply(this, "forEach", fn, thisArg, void 0, arguments);
  },
  includes(...args) {
    return searchProxy(this, "includes", args);
  },
  indexOf(...args) {
    return searchProxy(this, "indexOf", args);
  },
  join(separator) {
    return reactiveReadArray(this).join(separator);
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...args) {
    return searchProxy(this, "lastIndexOf", args);
  },
  map(fn, thisArg) {
    return apply(this, "map", fn, thisArg, void 0, arguments);
  },
  pop() {
    return noTracking(this, "pop");
  },
  push(...args) {
    return noTracking(this, "push", args);
  },
  reduce(fn, ...args) {
    return reduce(this, "reduce", fn, args);
  },
  reduceRight(fn, ...args) {
    return reduce(this, "reduceRight", fn, args);
  },
  shift() {
    return noTracking(this, "shift");
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(fn, thisArg) {
    return apply(this, "some", fn, thisArg, void 0, arguments);
  },
  splice(...args) {
    return noTracking(this, "splice", args);
  },
  toReversed() {
    return reactiveReadArray(this).toReversed();
  },
  toSorted(comparer) {
    return reactiveReadArray(this).toSorted(comparer);
  },
  toSpliced(...args) {
    return reactiveReadArray(this).toSpliced(...args);
  },
  unshift(...args) {
    return noTracking(this, "unshift", args);
  },
  values() {
    return iterator(this, "values", (item) => toWrapped(this, item));
  }
};
function iterator(self2, method, wrapValue) {
  const arr = shallowReadArray(self2);
  const iter = arr[method]();
  if (arr !== self2 && !/* @__PURE__ */ isShallow(self2)) {
    iter._next = iter.next;
    iter.next = () => {
      const result = iter._next();
      if (!result.done) {
        result.value = wrapValue(result.value);
      }
      return result;
    };
  }
  return iter;
}
const arrayProto = Array.prototype;
function apply(self2, method, fn, thisArg, wrappedRetFn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !/* @__PURE__ */ isShallow(self2);
  const methodFn = arr[method];
  if (methodFn !== arrayProto[method]) {
    const result2 = methodFn.apply(self2, args);
    return needsWrap ? toReactive(result2) : result2;
  }
  let wrappedFn = fn;
  if (arr !== self2) {
    if (needsWrap) {
      wrappedFn = function(item, index) {
        return fn.call(this, toWrapped(self2, item), index, self2);
      };
    } else if (fn.length > 2) {
      wrappedFn = function(item, index) {
        return fn.call(this, item, index, self2);
      };
    }
  }
  const result = methodFn.call(arr, wrappedFn, thisArg);
  return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
}
function reduce(self2, method, fn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !/* @__PURE__ */ isShallow(self2);
  let wrappedFn = fn;
  let wrapInitialAccumulator = false;
  if (arr !== self2) {
    if (needsWrap) {
      wrapInitialAccumulator = args.length === 0;
      wrappedFn = function(acc, item, index) {
        if (wrapInitialAccumulator) {
          wrapInitialAccumulator = false;
          acc = toWrapped(self2, acc);
        }
        return fn.call(this, acc, toWrapped(self2, item), index, self2);
      };
    } else if (fn.length > 3) {
      wrappedFn = function(acc, item, index) {
        return fn.call(this, acc, item, index, self2);
      };
    }
  }
  const result = arr[method](wrappedFn, ...args);
  return wrapInitialAccumulator ? toWrapped(self2, result) : result;
}
function searchProxy(self2, method, args) {
  const arr = /* @__PURE__ */ toRaw(self2);
  track(arr, "iterate", ARRAY_ITERATE_KEY);
  const res = arr[method](...args);
  if ((res === -1 || res === false) && /* @__PURE__ */ isProxy(args[0])) {
    args[0] = /* @__PURE__ */ toRaw(args[0]);
    return arr[method](...args);
  }
  return res;
}
function noTracking(self2, method, args = []) {
  pauseTracking();
  startBatch();
  const res = (/* @__PURE__ */ toRaw(self2))[method].apply(self2, args);
  endBatch();
  resetTracking();
  return res;
}
const isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
const builtInSymbols = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((key) => key !== "arguments" && key !== "caller").map((key) => Symbol[key]).filter(isSymbol)
);
function hasOwnProperty(key) {
  if (!isSymbol(key)) key = String(key);
  const obj = /* @__PURE__ */ toRaw(this);
  track(obj, "has", key);
  return obj.hasOwnProperty(key);
}
class BaseReactiveHandler {
  constructor(_isReadonly = false, _isShallow = false) {
    this._isReadonly = _isReadonly;
    this._isShallow = _isShallow;
  }
  get(target, key, receiver) {
    if (key === "__v_skip") return target["__v_skip"];
    const isReadonly2 = this._isReadonly, isShallow2 = this._isShallow;
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_isShallow") {
      return isShallow2;
    } else if (key === "__v_raw") {
      if (receiver === (isReadonly2 ? isShallow2 ? shallowReadonlyMap : readonlyMap : isShallow2 ? shallowReactiveMap : reactiveMap).get(target) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)) {
        return target;
      }
      return;
    }
    const targetIsArray = isArray(target);
    if (!isReadonly2) {
      let fn;
      if (targetIsArray && (fn = arrayInstrumentations[key])) {
        return fn;
      }
      if (key === "hasOwnProperty") {
        return hasOwnProperty;
      }
    }
    const res = Reflect.get(
      target,
      key,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      /* @__PURE__ */ isRef(target) ? target : receiver
    );
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res;
    }
    if (!isReadonly2) {
      track(target, "get", key);
    }
    if (isShallow2) {
      return res;
    }
    if (/* @__PURE__ */ isRef(res)) {
      const value = targetIsArray && isIntegerKey(key) ? res : res.value;
      return isReadonly2 && isObject(value) ? /* @__PURE__ */ readonly(value) : value;
    }
    if (isObject(res)) {
      return isReadonly2 ? /* @__PURE__ */ readonly(res) : /* @__PURE__ */ reactive(res);
    }
    return res;
  }
}
class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(false, isShallow2);
  }
  set(target, key, value, receiver) {
    let oldValue = target[key];
    const isArrayWithIntegerKey = isArray(target) && isIntegerKey(key);
    if (!this._isShallow) {
      const isOldValueReadonly = /* @__PURE__ */ isReadonly(oldValue);
      if (!/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
        oldValue = /* @__PURE__ */ toRaw(oldValue);
        value = /* @__PURE__ */ toRaw(value);
      }
      if (!isArrayWithIntegerKey && /* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
        if (isOldValueReadonly) {
          return true;
        } else {
          oldValue.value = value;
          return true;
        }
      }
    }
    const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
    const result = Reflect.set(
      target,
      key,
      value,
      /* @__PURE__ */ isRef(target) ? target : receiver
    );
    if (target === /* @__PURE__ */ toRaw(receiver) && result) {
      if (!hadKey) {
        trigger(target, "add", key, value);
      } else if (hasChanged(value, oldValue)) {
        trigger(target, "set", key, value);
      }
    }
    return result;
  }
  deleteProperty(target, key) {
    const hadKey = hasOwn(target, key);
    target[key];
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
      trigger(target, "delete", key, void 0);
    }
    return result;
  }
  has(target, key) {
    const result = Reflect.has(target, key);
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, "has", key);
    }
    return result;
  }
  ownKeys(target) {
    track(
      target,
      "iterate",
      isArray(target) ? "length" : ITERATE_KEY
    );
    return Reflect.ownKeys(target);
  }
}
class ReadonlyReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(true, isShallow2);
  }
  set(target, key) {
    return true;
  }
  deleteProperty(target, key) {
    return true;
  }
}
const mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler();
const readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler();
const shallowReactiveHandlers = /* @__PURE__ */ new MutableReactiveHandler(true);
const shallowReadonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler(true);
const toShallow = (value) => value;
const getProto = (v) => Reflect.getPrototypeOf(v);
function createIterableMethod(method, isReadonly2, isShallow2) {
  return function(...args) {
    const target = this["__v_raw"];
    const rawTarget = /* @__PURE__ */ toRaw(target);
    const targetIsMap = isMap(rawTarget);
    const isPair = method === "entries" || method === Symbol.iterator && targetIsMap;
    const isKeyOnly = method === "keys" && targetIsMap;
    const innerIterator = target[method](...args);
    const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive;
    !isReadonly2 && track(
      rawTarget,
      "iterate",
      isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY
    );
    return extend(
      // inheriting all iterator properties
      Object.create(innerIterator),
      {
        // iterator protocol
        next() {
          const { value, done } = innerIterator.next();
          return done ? { value, done } : {
            value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
            done
          };
        }
      }
    );
  };
}
function createReadonlyMethod(type) {
  return function(...args) {
    return type === "delete" ? false : type === "clear" ? void 0 : this;
  };
}
function createInstrumentations(readonly2, shallow) {
  const instrumentations = {
    get(key) {
      const target = this["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const rawKey = /* @__PURE__ */ toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "get", key);
        }
        track(rawTarget, "get", rawKey);
      }
      const { has } = getProto(rawTarget);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      if (has.call(rawTarget, key)) {
        return wrap(target.get(key));
      } else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey));
      } else if (target !== rawTarget) {
        target.get(key);
      }
    },
    get size() {
      const target = this["__v_raw"];
      !readonly2 && track(/* @__PURE__ */ toRaw(target), "iterate", ITERATE_KEY);
      return target.size;
    },
    has(key) {
      const target = this["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const rawKey = /* @__PURE__ */ toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "has", key);
        }
        track(rawTarget, "has", rawKey);
      }
      return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
    },
    forEach(callback, thisArg) {
      const observed = this;
      const target = observed["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      !readonly2 && track(rawTarget, "iterate", ITERATE_KEY);
      return target.forEach((value, key) => {
        return callback.call(thisArg, wrap(value), wrap(key), observed);
      });
    }
  };
  extend(
    instrumentations,
    readonly2 ? {
      add: createReadonlyMethod("add"),
      set: createReadonlyMethod("set"),
      delete: createReadonlyMethod("delete"),
      clear: createReadonlyMethod("clear")
    } : {
      add(value) {
        const target = /* @__PURE__ */ toRaw(this);
        const proto = getProto(target);
        const rawValue = /* @__PURE__ */ toRaw(value);
        const valueToAdd = !shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value) ? rawValue : value;
        const hadKey = proto.has.call(target, valueToAdd) || hasChanged(value, valueToAdd) && proto.has.call(target, value) || hasChanged(rawValue, valueToAdd) && proto.has.call(target, rawValue);
        if (!hadKey) {
          target.add(valueToAdd);
          trigger(target, "add", valueToAdd, valueToAdd);
        }
        return this;
      },
      set(key, value) {
        if (!shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
          value = /* @__PURE__ */ toRaw(value);
        }
        const target = /* @__PURE__ */ toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = /* @__PURE__ */ toRaw(key);
          hadKey = has.call(target, key);
        }
        const oldValue = get.call(target, key);
        target.set(key, value);
        if (!hadKey) {
          trigger(target, "add", key, value);
        } else if (hasChanged(value, oldValue)) {
          trigger(target, "set", key, value);
        }
        return this;
      },
      delete(key) {
        const target = /* @__PURE__ */ toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = /* @__PURE__ */ toRaw(key);
          hadKey = has.call(target, key);
        }
        get ? get.call(target, key) : void 0;
        const result = target.delete(key);
        if (hadKey) {
          trigger(target, "delete", key, void 0);
        }
        return result;
      },
      clear() {
        const target = /* @__PURE__ */ toRaw(this);
        const hadItems = target.size !== 0;
        const result = target.clear();
        if (hadItems) {
          trigger(
            target,
            "clear",
            void 0,
            void 0
          );
        }
        return result;
      }
    }
  );
  const iteratorMethods = [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ];
  iteratorMethods.forEach((method) => {
    instrumentations[method] = createIterableMethod(method, readonly2, shallow);
  });
  return instrumentations;
}
function createInstrumentationGetter(isReadonly2, shallow) {
  const instrumentations = createInstrumentations(isReadonly2, shallow);
  return (target, key, receiver) => {
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_raw") {
      return target;
    }
    return Reflect.get(
      hasOwn(instrumentations, key) && key in target ? instrumentations : target,
      key,
      receiver
    );
  };
}
const mutableCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, false)
};
const shallowCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, true)
};
const readonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, false)
};
const shallowReadonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, true)
};
const reactiveMap = /* @__PURE__ */ new WeakMap();
const shallowReactiveMap = /* @__PURE__ */ new WeakMap();
const readonlyMap = /* @__PURE__ */ new WeakMap();
const shallowReadonlyMap = /* @__PURE__ */ new WeakMap();
function targetTypeMap(rawType) {
  switch (rawType) {
    case "Object":
    case "Array":
      return 1;
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return 2;
    default:
      return 0;
  }
}
// @__NO_SIDE_EFFECTS__
function reactive(target) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return target;
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap
  );
}
// @__NO_SIDE_EFFECTS__
function shallowReactive(target) {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap
  );
}
// @__NO_SIDE_EFFECTS__
function readonly(target) {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap
  );
}
// @__NO_SIDE_EFFECTS__
function shallowReadonly(target) {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap
  );
}
function createReactiveObject(target, isReadonly2, baseHandlers, collectionHandlers, proxyMap) {
  if (!isObject(target)) {
    return target;
  }
  if (target["__v_raw"] && !(isReadonly2 && target["__v_isReactive"])) {
    return target;
  }
  if (target["__v_skip"] || !Object.isExtensible(target)) {
    return target;
  }
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }
  const targetType = targetTypeMap(toRawType(target));
  if (targetType === 0) {
    return target;
  }
  const proxy = new Proxy(
    target,
    targetType === 2 ? collectionHandlers : baseHandlers
  );
  proxyMap.set(target, proxy);
  return proxy;
}
// @__NO_SIDE_EFFECTS__
function isReactive(value) {
  if (/* @__PURE__ */ isReadonly(value)) {
    return /* @__PURE__ */ isReactive(value["__v_raw"]);
  }
  return !!(value && value["__v_isReactive"]);
}
// @__NO_SIDE_EFFECTS__
function isReadonly(value) {
  return !!(value && value["__v_isReadonly"]);
}
// @__NO_SIDE_EFFECTS__
function isShallow(value) {
  return !!(value && value["__v_isShallow"]);
}
// @__NO_SIDE_EFFECTS__
function isProxy(value) {
  return value ? !!value["__v_raw"] : false;
}
// @__NO_SIDE_EFFECTS__
function toRaw(observed) {
  const raw = observed && observed["__v_raw"];
  return raw ? /* @__PURE__ */ toRaw(raw) : observed;
}
function markRaw(value) {
  if (!hasOwn(value, "__v_skip") && Object.isExtensible(value)) {
    def(value, "__v_skip", true);
  }
  return value;
}
const toReactive = (value) => isObject(value) ? /* @__PURE__ */ reactive(value) : value;
const toReadonly = (value) => isObject(value) ? /* @__PURE__ */ readonly(value) : value;
// @__NO_SIDE_EFFECTS__
function isRef(r) {
  return r ? r["__v_isRef"] === true : false;
}
// @__NO_SIDE_EFFECTS__
function ref(value) {
  return createRef(value, false);
}
function createRef(rawValue, shallow) {
  if (/* @__PURE__ */ isRef(rawValue)) {
    return rawValue;
  }
  return new RefImpl(rawValue, shallow);
}
class RefImpl {
  constructor(value, isShallow2) {
    this.dep = new Dep();
    this["__v_isRef"] = true;
    this["__v_isShallow"] = false;
    this._rawValue = isShallow2 ? value : /* @__PURE__ */ toRaw(value);
    this._value = isShallow2 ? value : toReactive(value);
    this["__v_isShallow"] = isShallow2;
  }
  get value() {
    {
      this.dep.track();
    }
    return this._value;
  }
  set value(newValue) {
    const oldValue = this._rawValue;
    const useDirectValue = this["__v_isShallow"] || /* @__PURE__ */ isShallow(newValue) || /* @__PURE__ */ isReadonly(newValue);
    newValue = useDirectValue ? newValue : /* @__PURE__ */ toRaw(newValue);
    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue;
      this._value = useDirectValue ? newValue : toReactive(newValue);
      {
        this.dep.trigger();
      }
    }
  }
}
function unref(ref2) {
  return /* @__PURE__ */ isRef(ref2) ? ref2.value : ref2;
}
const shallowUnwrapHandlers = {
  get: (target, key, receiver) => key === "__v_raw" ? target : unref(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key];
    if (/* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
      oldValue.value = value;
      return true;
    } else {
      return Reflect.set(target, key, value, receiver);
    }
  }
};
function proxyRefs(objectWithRefs) {
  return /* @__PURE__ */ isReactive(objectWithRefs) ? objectWithRefs : new Proxy(objectWithRefs, shallowUnwrapHandlers);
}
class ComputedRefImpl {
  constructor(fn, setter, isSSR) {
    this.fn = fn;
    this.setter = setter;
    this._value = void 0;
    this.dep = new Dep(this);
    this.__v_isRef = true;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 16;
    this.globalVersion = globalVersion - 1;
    this.next = void 0;
    this.effect = this;
    this["__v_isReadonly"] = !setter;
    this.isSSR = isSSR;
  }
  /**
   * @internal
   */
  notify() {
    this.flags |= 16;
    if (!(this.flags & 8) && // avoid infinite self recursion
    activeSub !== this) {
      batch(this, true);
      return true;
    }
  }
  get value() {
    const link = this.dep.track();
    refreshComputed(this);
    if (link) {
      link.version = this.dep.version;
    }
    return this._value;
  }
  set value(newValue) {
    if (this.setter) {
      this.setter(newValue);
    }
  }
}
// @__NO_SIDE_EFFECTS__
function computed$1(getterOrOptions, debugOptions, isSSR = false) {
  let getter;
  let setter;
  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions;
  } else {
    getter = getterOrOptions.get;
    setter = getterOrOptions.set;
  }
  const cRef = new ComputedRefImpl(getter, setter, isSSR);
  return cRef;
}
const INITIAL_WATCHER_VALUE = {};
const cleanupMap = /* @__PURE__ */ new WeakMap();
let activeWatcher = void 0;
function onWatcherCleanup(cleanupFn, failSilently = false, owner = activeWatcher) {
  if (owner) {
    let cleanups = cleanupMap.get(owner);
    if (!cleanups) cleanupMap.set(owner, cleanups = []);
    cleanups.push(cleanupFn);
  }
}
function watch$1(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, once, scheduler, augmentJob, call } = options;
  const reactiveGetter = (source2) => {
    if (deep) return source2;
    if (/* @__PURE__ */ isShallow(source2) || deep === false || deep === 0)
      return traverse(source2, 1);
    return traverse(source2);
  };
  let effect2;
  let getter;
  let cleanup;
  let boundCleanup;
  let forceTrigger = false;
  let isMultiSource = false;
  if (/* @__PURE__ */ isRef(source)) {
    getter = () => source.value;
    forceTrigger = /* @__PURE__ */ isShallow(source);
  } else if (/* @__PURE__ */ isReactive(source)) {
    getter = () => reactiveGetter(source);
    forceTrigger = true;
  } else if (isArray(source)) {
    isMultiSource = true;
    forceTrigger = source.some((s) => /* @__PURE__ */ isReactive(s) || /* @__PURE__ */ isShallow(s));
    getter = () => source.map((s) => {
      if (/* @__PURE__ */ isRef(s)) {
        return s.value;
      } else if (/* @__PURE__ */ isReactive(s)) {
        return reactiveGetter(s);
      } else if (isFunction(s)) {
        return call ? call(s, 2) : s();
      } else ;
    });
  } else if (isFunction(source)) {
    if (cb) {
      getter = call ? () => call(source, 2) : source;
    } else {
      getter = () => {
        if (cleanup) {
          pauseTracking();
          try {
            cleanup();
          } finally {
            resetTracking();
          }
        }
        const currentEffect = activeWatcher;
        activeWatcher = effect2;
        try {
          return call ? call(source, 3, [boundCleanup]) : source(boundCleanup);
        } finally {
          activeWatcher = currentEffect;
        }
      };
    }
  } else {
    getter = NOOP;
  }
  if (cb && deep) {
    const baseGetter = getter;
    const depth = deep === true ? Infinity : deep;
    getter = () => traverse(baseGetter(), depth);
  }
  const scope = getCurrentScope();
  const watchHandle = () => {
    effect2.stop();
    if (scope && scope.active) {
      remove(scope.effects, effect2);
    }
  };
  if (once && cb) {
    const _cb = cb;
    cb = (...args) => {
      const res = _cb(...args);
      watchHandle();
      return res;
    };
  }
  let oldValue = isMultiSource ? new Array(source.length).fill(INITIAL_WATCHER_VALUE) : INITIAL_WATCHER_VALUE;
  const job = (immediateFirstRun) => {
    if (!(effect2.flags & 1) || !effect2.dirty && !immediateFirstRun) {
      return;
    }
    if (cb) {
      const newValue = effect2.run();
      if (immediateFirstRun || deep || forceTrigger || (isMultiSource ? newValue.some((v, i) => hasChanged(v, oldValue[i])) : hasChanged(newValue, oldValue))) {
        if (cleanup) {
          cleanup();
        }
        const currentWatcher = activeWatcher;
        activeWatcher = effect2;
        try {
          const args = [
            newValue,
            // pass undefined as the old value when it's changed for the first time
            oldValue === INITIAL_WATCHER_VALUE ? void 0 : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE ? [] : oldValue,
            boundCleanup
          ];
          oldValue = newValue;
          call ? call(cb, 3, args) : (
            // @ts-expect-error
            cb(...args)
          );
        } finally {
          activeWatcher = currentWatcher;
        }
      }
    } else {
      effect2.run();
    }
  };
  if (augmentJob) {
    augmentJob(job);
  }
  effect2 = new ReactiveEffect(getter);
  effect2.scheduler = scheduler ? () => scheduler(job, false) : job;
  boundCleanup = (fn) => onWatcherCleanup(fn, false, effect2);
  cleanup = effect2.onStop = () => {
    const cleanups = cleanupMap.get(effect2);
    if (cleanups) {
      if (call) {
        call(cleanups, 4);
      } else {
        for (const cleanup2 of cleanups) cleanup2();
      }
      cleanupMap.delete(effect2);
    }
  };
  if (cb) {
    if (immediate) {
      job(true);
    } else {
      oldValue = effect2.run();
    }
  } else if (scheduler) {
    scheduler(job.bind(null, true), true);
  } else {
    effect2.run();
  }
  watchHandle.pause = effect2.pause.bind(effect2);
  watchHandle.resume = effect2.resume.bind(effect2);
  watchHandle.stop = watchHandle;
  return watchHandle;
}
function traverse(value, depth = Infinity, seen) {
  if (depth <= 0 || !isObject(value) || value["__v_skip"]) {
    return value;
  }
  seen = seen || /* @__PURE__ */ new Map();
  if ((seen.get(value) || 0) >= depth) {
    return value;
  }
  seen.set(value, depth);
  depth--;
  if (/* @__PURE__ */ isRef(value)) {
    traverse(value.value, depth, seen);
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], depth, seen);
    }
  } else if (isSet(value) || isMap(value)) {
    value.forEach((v) => {
      traverse(v, depth, seen);
    });
  } else if (isPlainObject(value)) {
    for (const key in value) {
      traverse(value[key], depth, seen);
    }
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        traverse(value[key], depth, seen);
      }
    }
  }
  return value;
}
/**
* @vue/runtime-core v3.5.39
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
const stack = [];
let isWarning = false;
function warn$1(msg, ...args) {
  if (isWarning) return;
  isWarning = true;
  pauseTracking();
  const instance = stack.length ? stack[stack.length - 1].component : null;
  const appWarnHandler = instance && instance.appContext.config.warnHandler;
  const trace = getComponentTrace();
  if (appWarnHandler) {
    callWithErrorHandling(
      appWarnHandler,
      instance,
      11,
      [
        // eslint-disable-next-line no-restricted-syntax
        msg + args.map((a) => {
          var _a, _b;
          return (_b = (_a = a.toString) == null ? void 0 : _a.call(a)) != null ? _b : JSON.stringify(a);
        }).join(""),
        instance && instance.proxy,
        trace.map(
          ({ vnode }) => `at <${formatComponentName(instance, vnode.type)}>`
        ).join("\n"),
        trace
      ]
    );
  } else {
    const warnArgs = [`[Vue warn]: ${msg}`, ...args];
    if (trace.length && // avoid spamming console during tests
    true) {
      warnArgs.push(`
`, ...formatTrace(trace));
    }
    console.warn(...warnArgs);
  }
  resetTracking();
  isWarning = false;
}
function getComponentTrace() {
  let currentVNode = stack[stack.length - 1];
  if (!currentVNode) {
    return [];
  }
  const normalizedStack = [];
  while (currentVNode) {
    const last = normalizedStack[0];
    if (last && last.vnode === currentVNode) {
      last.recurseCount++;
    } else {
      normalizedStack.push({
        vnode: currentVNode,
        recurseCount: 0
      });
    }
    const parentInstance = currentVNode.component && currentVNode.component.parent;
    currentVNode = parentInstance && parentInstance.vnode;
  }
  return normalizedStack;
}
function formatTrace(trace) {
  const logs = [];
  trace.forEach((entry, i) => {
    logs.push(...i === 0 ? [] : [`
`], ...formatTraceEntry(entry));
  });
  return logs;
}
function formatTraceEntry({ vnode, recurseCount }) {
  const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
  const isRoot = vnode.component ? vnode.component.parent == null : false;
  const open = ` at <${formatComponentName(
    vnode.component,
    vnode.type,
    isRoot
  )}`;
  const close = `>` + postfix;
  return vnode.props ? [open, ...formatProps(vnode.props), close] : [open + close];
}
function formatProps(props) {
  const res = [];
  const keys = Object.keys(props);
  keys.slice(0, 3).forEach((key) => {
    res.push(...formatProp(key, props[key]));
  });
  if (keys.length > 3) {
    res.push(` ...`);
  }
  return res;
}
function formatProp(key, value, raw) {
  if (isString(value)) {
    value = JSON.stringify(value);
    return raw ? value : [`${key}=${value}`];
  } else if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return raw ? value : [`${key}=${value}`];
  } else if (/* @__PURE__ */ isRef(value)) {
    value = formatProp(key, /* @__PURE__ */ toRaw(value.value), true);
    return raw ? value : [`${key}=Ref<`, value, `>`];
  } else if (isFunction(value)) {
    return [`${key}=fn${value.name ? `<${value.name}>` : ``}`];
  } else {
    value = /* @__PURE__ */ toRaw(value);
    return raw ? value : [`${key}=`, value];
  }
}
function callWithErrorHandling(fn, instance, type, args) {
  try {
    return args ? fn(...args) : fn();
  } catch (err) {
    handleError(err, instance, type);
  }
}
function callWithAsyncErrorHandling(fn, instance, type, args) {
  if (isFunction(fn)) {
    const res = callWithErrorHandling(fn, instance, type, args);
    if (res && isPromise(res)) {
      res.catch((err) => {
        handleError(err, instance, type);
      });
    }
    return res;
  }
  if (isArray(fn)) {
    const values = [];
    for (let i = 0; i < fn.length; i++) {
      values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
    }
    return values;
  }
}
function handleError(err, instance, type, throwInDev = true) {
  const contextVNode = instance ? instance.vnode : null;
  const { errorHandler, throwUnhandledErrorInProduction } = instance && instance.appContext.config || EMPTY_OBJ;
  if (instance) {
    let cur = instance.parent;
    const exposedInstance = instance.proxy;
    const errorInfo = `https://vuejs.org/error-reference/#runtime-${type}`;
    while (cur) {
      const errorCapturedHooks = cur.ec;
      if (errorCapturedHooks) {
        for (let i = 0; i < errorCapturedHooks.length; i++) {
          if (errorCapturedHooks[i](err, exposedInstance, errorInfo) === false) {
            return;
          }
        }
      }
      cur = cur.parent;
    }
    if (errorHandler) {
      pauseTracking();
      callWithErrorHandling(errorHandler, null, 10, [
        err,
        exposedInstance,
        errorInfo
      ]);
      resetTracking();
      return;
    }
  }
  logError(err, type, contextVNode, throwInDev, throwUnhandledErrorInProduction);
}
function logError(err, type, contextVNode, throwInDev = true, throwInProd = false) {
  if (throwInProd) {
    throw err;
  } else {
    console.error(err);
  }
}
const queue = [];
let flushIndex = -1;
const pendingPostFlushCbs = [];
let activePostFlushCbs = null;
let postFlushIndex = 0;
const resolvedPromise = /* @__PURE__ */ Promise.resolve();
let currentFlushPromise = null;
function nextTick(fn) {
  const p2 = currentFlushPromise || resolvedPromise;
  return fn ? p2.then(this ? fn.bind(this) : fn) : p2;
}
function findInsertionIndex(id) {
  let start = flushIndex + 1;
  let end = queue.length;
  while (start < end) {
    const middle = start + end >>> 1;
    const middleJob = queue[middle];
    const middleJobId = getId(middleJob);
    if (middleJobId < id || middleJobId === id && middleJob.flags & 2) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }
  return start;
}
function queueJob(job) {
  if (!(job.flags & 1)) {
    const jobId = getId(job);
    const lastJob = queue[queue.length - 1];
    if (!lastJob || // fast path when the job id is larger than the tail
    !(job.flags & 2) && jobId >= getId(lastJob)) {
      queue.push(job);
    } else {
      queue.splice(findInsertionIndex(jobId), 0, job);
    }
    job.flags |= 1;
    queueFlush();
  }
}
function queueFlush() {
  if (!currentFlushPromise) {
    currentFlushPromise = resolvedPromise.then(flushJobs);
  }
}
function queuePostFlushCb(cb) {
  if (!isArray(cb)) {
    if (activePostFlushCbs && cb.id === -1) {
      activePostFlushCbs.splice(postFlushIndex + 1, 0, cb);
    } else if (!(cb.flags & 1)) {
      pendingPostFlushCbs.push(cb);
      cb.flags |= 1;
    }
  } else {
    pendingPostFlushCbs.push(...cb);
  }
  queueFlush();
}
function flushPreFlushCbs(instance, seen, i = flushIndex + 1) {
  for (; i < queue.length; i++) {
    const cb = queue[i];
    if (cb && cb.flags & 2) {
      if (instance && cb.id !== instance.uid) {
        continue;
      }
      queue.splice(i, 1);
      i--;
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      cb();
      if (!(cb.flags & 4)) {
        cb.flags &= -2;
      }
    }
  }
}
function flushPostFlushCbs(seen) {
  if (pendingPostFlushCbs.length) {
    const deduped = [...new Set(pendingPostFlushCbs)].sort(
      (a, b) => getId(a) - getId(b)
    );
    pendingPostFlushCbs.length = 0;
    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped);
      return;
    }
    activePostFlushCbs = deduped;
    for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
      const cb = activePostFlushCbs[postFlushIndex];
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      if (!(cb.flags & 8)) cb();
      cb.flags &= -2;
    }
    activePostFlushCbs = null;
    postFlushIndex = 0;
  }
}
const getId = (job) => job.id == null ? job.flags & 2 ? -1 : Infinity : job.id;
function flushJobs(seen) {
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job && !(job.flags & 8)) {
        if (false) ;
        if (job.flags & 4) {
          job.flags &= ~1;
        }
        callWithErrorHandling(
          job,
          job.i,
          job.i ? 15 : 14
        );
        if (!(job.flags & 4)) {
          job.flags &= ~1;
        }
      }
    }
  } finally {
    for (; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job) {
        job.flags &= -2;
      }
    }
    flushIndex = -1;
    queue.length = 0;
    flushPostFlushCbs();
    currentFlushPromise = null;
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs();
    }
  }
}
let currentRenderingInstance = null;
let currentScopeId = null;
function setCurrentRenderingInstance(instance) {
  const prev = currentRenderingInstance;
  currentRenderingInstance = instance;
  currentScopeId = instance && instance.type.__scopeId || null;
  return prev;
}
function withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot) {
  if (!ctx) return fn;
  if (fn._n) {
    return fn;
  }
  const renderFnWithContext = (...args) => {
    if (renderFnWithContext._d) {
      setBlockTracking(-1);
    }
    const prevInstance = setCurrentRenderingInstance(ctx);
    let res;
    try {
      res = fn(...args);
    } finally {
      setCurrentRenderingInstance(prevInstance);
      if (renderFnWithContext._d) {
        setBlockTracking(1);
      }
    }
    return res;
  };
  renderFnWithContext._n = true;
  renderFnWithContext._c = true;
  renderFnWithContext._d = true;
  return renderFnWithContext;
}
function withDirectives(vnode, directives) {
  if (currentRenderingInstance === null) {
    return vnode;
  }
  const instance = getComponentPublicInstance(currentRenderingInstance);
  const bindings = vnode.dirs || (vnode.dirs = []);
  for (let i = 0; i < directives.length; i++) {
    let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i];
    if (dir) {
      if (isFunction(dir)) {
        dir = {
          mounted: dir,
          updated: dir
        };
      }
      if (dir.deep) {
        traverse(value);
      }
      bindings.push({
        dir,
        instance,
        value,
        oldValue: void 0,
        arg,
        modifiers
      });
    }
  }
  return vnode;
}
function invokeDirectiveHook(vnode, prevVNode, instance, name) {
  const bindings = vnode.dirs;
  const oldBindings = prevVNode && prevVNode.dirs;
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    if (oldBindings) {
      binding.oldValue = oldBindings[i].value;
    }
    let hook = binding.dir[name];
    if (hook) {
      pauseTracking();
      callWithAsyncErrorHandling(hook, instance, 8, [
        vnode.el,
        binding,
        vnode,
        prevVNode
      ]);
      resetTracking();
    }
  }
}
function provide(key, value) {
  if (currentInstance) {
    let provides = currentInstance.provides;
    const parentProvides = currentInstance.parent && currentInstance.parent.provides;
    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides);
    }
    provides[key] = value;
  }
}
function inject(key, defaultValue, treatDefaultAsFactory = false) {
  const instance = getCurrentInstance();
  if (instance || currentApp) {
    let provides = currentApp ? currentApp._context.provides : instance ? instance.parent == null || instance.ce ? instance.vnode.appContext && instance.vnode.appContext.provides : instance.parent.provides : void 0;
    if (provides && key in provides) {
      return provides[key];
    } else if (arguments.length > 1) {
      return treatDefaultAsFactory && isFunction(defaultValue) ? defaultValue.call(instance && instance.proxy) : defaultValue;
    } else ;
  }
}
const ssrContextKey = /* @__PURE__ */ Symbol.for("v-scx");
const useSSRContext = () => {
  {
    const ctx = inject(ssrContextKey);
    return ctx;
  }
};
function watch(source, cb, options) {
  return doWatch(source, cb, options);
}
function doWatch(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, flush, once } = options;
  const baseWatchOptions = extend({}, options);
  const runsImmediately = cb && immediate || !cb && flush !== "post";
  let ssrCleanup;
  if (isInSSRComponentSetup) {
    if (flush === "sync") {
      const ctx = useSSRContext();
      ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = []);
    } else if (!runsImmediately) {
      const watchStopHandle = () => {
      };
      watchStopHandle.stop = NOOP;
      watchStopHandle.resume = NOOP;
      watchStopHandle.pause = NOOP;
      return watchStopHandle;
    }
  }
  const instance = currentInstance;
  baseWatchOptions.call = (fn, type, args) => callWithAsyncErrorHandling(fn, instance, type, args);
  let isPre = false;
  if (flush === "post") {
    baseWatchOptions.scheduler = (job) => {
      queuePostRenderEffect(job, instance && instance.suspense);
    };
  } else if (flush !== "sync") {
    isPre = true;
    baseWatchOptions.scheduler = (job, isFirstRun) => {
      if (isFirstRun) {
        job();
      } else {
        queueJob(job);
      }
    };
  }
  baseWatchOptions.augmentJob = (job) => {
    if (cb) {
      job.flags |= 4;
    }
    if (isPre) {
      job.flags |= 2;
      if (instance) {
        job.id = instance.uid;
        job.i = instance;
      }
    }
  };
  const watchHandle = watch$1(source, cb, baseWatchOptions);
  if (isInSSRComponentSetup) {
    if (ssrCleanup) {
      ssrCleanup.push(watchHandle);
    } else if (runsImmediately) {
      watchHandle();
    }
  }
  return watchHandle;
}
function instanceWatch(source, value, options) {
  const publicThis = this.proxy;
  const getter = isString(source) ? source.includes(".") ? createPathGetter(publicThis, source) : () => publicThis[source] : source.bind(publicThis, publicThis);
  let cb;
  if (isFunction(value)) {
    cb = value;
  } else {
    cb = value.handler;
    options = value;
  }
  const reset = setCurrentInstance(this);
  const res = doWatch(getter, cb.bind(publicThis), options);
  reset();
  return res;
}
function createPathGetter(ctx, path) {
  const segments = path.split(".");
  return () => {
    let cur = ctx;
    for (let i = 0; i < segments.length && cur; i++) {
      cur = cur[segments[i]];
    }
    return cur;
  };
}
const TeleportEndKey = /* @__PURE__ */ Symbol("_vte");
const isTeleport = (type) => type.__isTeleport;
const leaveCbKey = /* @__PURE__ */ Symbol("_leaveCb");
function setTransitionHooks(vnode, hooks) {
  if (vnode.shapeFlag & 6 && vnode.component) {
    vnode.transition = hooks;
    setTransitionHooks(vnode.component.subTree, hooks);
  } else if (vnode.shapeFlag & 128) {
    vnode.ssContent.transition = hooks.clone(vnode.ssContent);
    vnode.ssFallback.transition = hooks.clone(vnode.ssFallback);
  } else {
    vnode.transition = hooks;
  }
}
// @__NO_SIDE_EFFECTS__
function defineComponent(options, extraOptions) {
  return isFunction(options) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    /* @__PURE__ */ (() => extend({ name: options.name }, extraOptions, { setup: options }))()
  ) : options;
}
function markAsyncBoundary(instance) {
  instance.ids = [instance.ids[0] + instance.ids[2]++ + "-", 0, 0];
}
function isTemplateRefKey(refs, key) {
  let desc;
  return !!((desc = Object.getOwnPropertyDescriptor(refs, key)) && !desc.configurable);
}
const pendingSetRefMap = /* @__PURE__ */ new WeakMap();
function setRef(rawRef, oldRawRef, parentSuspense, vnode, isUnmount = false) {
  if (isArray(rawRef)) {
    rawRef.forEach(
      (r, i) => setRef(
        r,
        oldRawRef && (isArray(oldRawRef) ? oldRawRef[i] : oldRawRef),
        parentSuspense,
        vnode,
        isUnmount
      )
    );
    return;
  }
  if (isAsyncWrapper(vnode) && !isUnmount) {
    if (vnode.shapeFlag & 512 && vnode.type.__asyncResolved && vnode.component.subTree.component) {
      setRef(rawRef, oldRawRef, parentSuspense, vnode.component.subTree);
    }
    return;
  }
  const refValue = vnode.shapeFlag & 4 ? getComponentPublicInstance(vnode.component) : vnode.el;
  const value = isUnmount ? null : refValue;
  const { i: owner, r: ref3 } = rawRef;
  const oldRef = oldRawRef && oldRawRef.r;
  const refs = owner.refs === EMPTY_OBJ ? owner.refs = {} : owner.refs;
  const setupState = owner.setupState;
  const rawSetupState = /* @__PURE__ */ toRaw(setupState);
  const canSetSetupRef = setupState === EMPTY_OBJ ? NO : (key) => {
    if (isTemplateRefKey(refs, key)) {
      return false;
    }
    return hasOwn(rawSetupState, key);
  };
  const canSetRef = (ref22, key) => {
    if (key && isTemplateRefKey(refs, key)) {
      return false;
    }
    return true;
  };
  if (oldRef != null && oldRef !== ref3) {
    invalidatePendingSetRef(oldRawRef);
    if (isString(oldRef)) {
      refs[oldRef] = null;
      if (canSetSetupRef(oldRef)) {
        setupState[oldRef] = null;
      }
    } else if (/* @__PURE__ */ isRef(oldRef)) {
      const oldRawRefAtom = oldRawRef;
      if (canSetRef(oldRef, oldRawRefAtom.k)) {
        oldRef.value = null;
      }
      if (oldRawRefAtom.k) refs[oldRawRefAtom.k] = null;
    }
  }
  if (isFunction(ref3)) {
    pauseTracking();
    try {
      callWithErrorHandling(ref3, owner, 12, [value, refs]);
    } finally {
      resetTracking();
    }
  } else {
    const _isString = isString(ref3);
    const _isRef = /* @__PURE__ */ isRef(ref3);
    if (_isString || _isRef) {
      const doSet = () => {
        if (rawRef.f) {
          const existing = _isString ? canSetSetupRef(ref3) ? setupState[ref3] : refs[ref3] : canSetRef() || !rawRef.k ? ref3.value : refs[rawRef.k];
          if (isUnmount) {
            isArray(existing) && remove(existing, refValue);
          } else {
            if (!isArray(existing)) {
              if (_isString) {
                refs[ref3] = [refValue];
                if (canSetSetupRef(ref3)) {
                  setupState[ref3] = refs[ref3];
                }
              } else {
                const newVal = [refValue];
                if (canSetRef(ref3, rawRef.k)) {
                  ref3.value = newVal;
                }
                if (rawRef.k) refs[rawRef.k] = newVal;
              }
            } else if (!existing.includes(refValue)) {
              existing.push(refValue);
            }
          }
        } else if (_isString) {
          refs[ref3] = value;
          if (canSetSetupRef(ref3)) {
            setupState[ref3] = value;
          }
        } else if (_isRef) {
          if (canSetRef(ref3, rawRef.k)) {
            ref3.value = value;
          }
          if (rawRef.k) refs[rawRef.k] = value;
        } else ;
      };
      if (value) {
        const job = () => {
          doSet();
          pendingSetRefMap.delete(rawRef);
        };
        job.id = -1;
        pendingSetRefMap.set(rawRef, job);
        queuePostRenderEffect(job, parentSuspense);
      } else {
        invalidatePendingSetRef(rawRef);
        doSet();
      }
    }
  }
}
function invalidatePendingSetRef(rawRef) {
  const pendingSetRef = pendingSetRefMap.get(rawRef);
  if (pendingSetRef) {
    pendingSetRef.flags |= 8;
    pendingSetRefMap.delete(rawRef);
  }
}
getGlobalThis().requestIdleCallback || ((cb) => setTimeout(cb, 1));
getGlobalThis().cancelIdleCallback || ((id) => clearTimeout(id));
const isAsyncWrapper = (i) => !!i.type.__asyncLoader;
const isKeepAlive = (vnode) => vnode.type.__isKeepAlive;
function onActivated(hook, target) {
  registerKeepAliveHook(hook, "a", target);
}
function onDeactivated(hook, target) {
  registerKeepAliveHook(hook, "da", target);
}
function registerKeepAliveHook(hook, type, target = currentInstance) {
  const wrappedHook = hook.__wdc || (hook.__wdc = () => {
    let current = target;
    while (current) {
      if (current.isDeactivated) {
        return;
      }
      current = current.parent;
    }
    return hook();
  });
  injectHook(type, wrappedHook, target);
  if (target) {
    let current = target.parent;
    while (current && current.parent) {
      if (isKeepAlive(current.parent.vnode)) {
        injectToKeepAliveRoot(wrappedHook, type, target, current);
      }
      current = current.parent;
    }
  }
}
function injectToKeepAliveRoot(hook, type, target, keepAliveRoot) {
  const injected = injectHook(
    type,
    hook,
    keepAliveRoot,
    true
    /* prepend */
  );
  onUnmounted(() => {
    remove(keepAliveRoot[type], injected);
  }, target);
}
function injectHook(type, hook, target = currentInstance, prepend = false) {
  if (target) {
    const hooks = target[type] || (target[type] = []);
    const wrappedHook = hook.__weh || (hook.__weh = (...args) => {
      pauseTracking();
      const reset = setCurrentInstance(target);
      const res = callWithAsyncErrorHandling(hook, target, type, args);
      reset();
      resetTracking();
      return res;
    });
    if (prepend) {
      hooks.unshift(wrappedHook);
    } else {
      hooks.push(wrappedHook);
    }
    return wrappedHook;
  }
}
const createHook = (lifecycle) => (hook, target = currentInstance) => {
  if (!isInSSRComponentSetup || lifecycle === "sp") {
    injectHook(lifecycle, (...args) => hook(...args), target);
  }
};
const onBeforeMount = createHook("bm");
const onMounted = createHook("m");
const onBeforeUpdate = createHook(
  "bu"
);
const onUpdated = createHook("u");
const onBeforeUnmount = createHook(
  "bum"
);
const onUnmounted = createHook("um");
const onServerPrefetch = createHook(
  "sp"
);
const onRenderTriggered = createHook("rtg");
const onRenderTracked = createHook("rtc");
function onErrorCaptured(hook, target = currentInstance) {
  injectHook("ec", hook, target);
}
const NULL_DYNAMIC_COMPONENT = /* @__PURE__ */ Symbol.for("v-ndc");
function renderList(source, renderItem, cache, index) {
  let ret;
  const cached = cache;
  const sourceIsArray = isArray(source);
  if (sourceIsArray || isString(source)) {
    const sourceIsReactiveArray = sourceIsArray && /* @__PURE__ */ isReactive(source);
    let needsWrap = false;
    let isReadonlySource = false;
    if (sourceIsReactiveArray) {
      needsWrap = !/* @__PURE__ */ isShallow(source);
      isReadonlySource = /* @__PURE__ */ isReadonly(source);
      source = shallowReadArray(source);
    }
    ret = new Array(source.length);
    for (let i = 0, l = source.length; i < l; i++) {
      ret[i] = renderItem(
        needsWrap ? isReadonlySource ? toReadonly(toReactive(source[i])) : toReactive(source[i]) : source[i],
        i,
        void 0,
        cached
      );
    }
  } else if (typeof source === "number") {
    {
      ret = new Array(source);
      for (let i = 0; i < source; i++) {
        ret[i] = renderItem(i + 1, i, void 0, cached);
      }
    }
  } else if (isObject(source)) {
    if (source[Symbol.iterator]) {
      ret = Array.from(
        source,
        (item, i) => renderItem(item, i, void 0, cached)
      );
    } else {
      const keys = Object.keys(source);
      ret = new Array(keys.length);
      for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i];
        ret[i] = renderItem(source[key], key, i, cached);
      }
    }
  } else {
    ret = [];
  }
  return ret;
}
const getPublicInstance = (i) => {
  if (!i) return null;
  if (isStatefulComponent(i)) return getComponentPublicInstance(i);
  return getPublicInstance(i.parent);
};
const publicPropertiesMap = (
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ extend(/* @__PURE__ */ Object.create(null), {
    $: (i) => i,
    $el: (i) => i.vnode.el,
    $data: (i) => i.data,
    $props: (i) => i.props,
    $attrs: (i) => i.attrs,
    $slots: (i) => i.slots,
    $refs: (i) => i.refs,
    $parent: (i) => getPublicInstance(i.parent),
    $root: (i) => getPublicInstance(i.root),
    $host: (i) => i.ce,
    $emit: (i) => i.emit,
    $options: (i) => resolveMergedOptions(i),
    $forceUpdate: (i) => i.f || (i.f = () => {
      queueJob(i.update);
    }),
    $nextTick: (i) => i.n || (i.n = nextTick.bind(i.proxy)),
    $watch: (i) => instanceWatch.bind(i)
  })
);
const hasSetupBinding = (state, key) => state !== EMPTY_OBJ && !state.__isScriptSetup && hasOwn(state, key);
const PublicInstanceProxyHandlers = {
  get({ _: instance }, key) {
    if (key === "__v_skip") {
      return true;
    }
    const { ctx, setupState, data, props, accessCache, type, appContext } = instance;
    if (key[0] !== "$") {
      const n = accessCache[key];
      if (n !== void 0) {
        switch (n) {
          case 1:
            return setupState[key];
          case 2:
            return data[key];
          case 4:
            return ctx[key];
          case 3:
            return props[key];
        }
      } else if (hasSetupBinding(setupState, key)) {
        accessCache[key] = 1;
        return setupState[key];
      } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
        accessCache[key] = 2;
        return data[key];
      } else if (hasOwn(props, key)) {
        accessCache[key] = 3;
        return props[key];
      } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
        accessCache[key] = 4;
        return ctx[key];
      } else if (shouldCacheAccess) {
        accessCache[key] = 0;
      }
    }
    const publicGetter = publicPropertiesMap[key];
    let cssModule, globalProperties;
    if (publicGetter) {
      if (key === "$attrs") {
        track(instance.attrs, "get", "");
      }
      return publicGetter(instance);
    } else if (
      // css module (injected by vue-loader)
      (cssModule = type.__cssModules) && (cssModule = cssModule[key])
    ) {
      return cssModule;
    } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
      accessCache[key] = 4;
      return ctx[key];
    } else if (
      // global properties
      globalProperties = appContext.config.globalProperties, hasOwn(globalProperties, key)
    ) {
      {
        return globalProperties[key];
      }
    } else ;
  },
  set({ _: instance }, key, value) {
    const { data, setupState, ctx } = instance;
    if (hasSetupBinding(setupState, key)) {
      setupState[key] = value;
      return true;
    } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
      data[key] = value;
      return true;
    } else if (hasOwn(instance.props, key)) {
      return false;
    }
    if (key[0] === "$" && key.slice(1) in instance) {
      return false;
    } else {
      {
        ctx[key] = value;
      }
    }
    return true;
  },
  has({
    _: { data, setupState, accessCache, ctx, appContext, props, type }
  }, key) {
    let cssModules;
    return !!(accessCache[key] || data !== EMPTY_OBJ && key[0] !== "$" && hasOwn(data, key) || hasSetupBinding(setupState, key) || hasOwn(props, key) || hasOwn(ctx, key) || hasOwn(publicPropertiesMap, key) || hasOwn(appContext.config.globalProperties, key) || (cssModules = type.__cssModules) && cssModules[key]);
  },
  defineProperty(target, key, descriptor) {
    if (descriptor.get != null) {
      target._.accessCache[key] = 0;
    } else if (hasOwn(descriptor, "value")) {
      this.set(target, key, descriptor.value, null);
    }
    return Reflect.defineProperty(target, key, descriptor);
  }
};
function normalizePropsOrEmits(props) {
  return isArray(props) ? props.reduce(
    (normalized, p2) => (normalized[p2] = null, normalized),
    {}
  ) : props;
}
let shouldCacheAccess = true;
function applyOptions(instance) {
  const options = resolveMergedOptions(instance);
  const publicThis = instance.proxy;
  const ctx = instance.ctx;
  shouldCacheAccess = false;
  if (options.beforeCreate) {
    callHook(options.beforeCreate, instance, "bc");
  }
  const {
    // state
    data: dataOptions,
    computed: computedOptions,
    methods,
    watch: watchOptions,
    provide: provideOptions,
    inject: injectOptions,
    // lifecycle
    created,
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    activated,
    deactivated,
    beforeDestroy,
    beforeUnmount,
    destroyed,
    unmounted,
    render,
    renderTracked,
    renderTriggered,
    errorCaptured,
    serverPrefetch,
    // public API
    expose,
    inheritAttrs,
    // assets
    components,
    directives,
    filters
  } = options;
  const checkDuplicateProperties = null;
  if (injectOptions) {
    resolveInjections(injectOptions, ctx, checkDuplicateProperties);
  }
  if (methods) {
    for (const key in methods) {
      const methodHandler = methods[key];
      if (isFunction(methodHandler)) {
        {
          ctx[key] = methodHandler.bind(publicThis);
        }
      }
    }
  }
  if (dataOptions) {
    const data = dataOptions.call(publicThis, publicThis);
    if (!isObject(data)) ;
    else {
      instance.data = /* @__PURE__ */ reactive(data);
    }
  }
  shouldCacheAccess = true;
  if (computedOptions) {
    for (const key in computedOptions) {
      const opt = computedOptions[key];
      const get = isFunction(opt) ? opt.bind(publicThis, publicThis) : isFunction(opt.get) ? opt.get.bind(publicThis, publicThis) : NOOP;
      const set = !isFunction(opt) && isFunction(opt.set) ? opt.set.bind(publicThis) : NOOP;
      const c = computed({
        get,
        set
      });
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => c.value,
        set: (v) => c.value = v
      });
    }
  }
  if (watchOptions) {
    for (const key in watchOptions) {
      createWatcher(watchOptions[key], ctx, publicThis, key);
    }
  }
  if (provideOptions) {
    const provides = isFunction(provideOptions) ? provideOptions.call(publicThis) : provideOptions;
    Reflect.ownKeys(provides).forEach((key) => {
      provide(key, provides[key]);
    });
  }
  if (created) {
    callHook(created, instance, "c");
  }
  function registerLifecycleHook(register, hook) {
    if (isArray(hook)) {
      hook.forEach((_hook) => register(_hook.bind(publicThis)));
    } else if (hook) {
      register(hook.bind(publicThis));
    }
  }
  registerLifecycleHook(onBeforeMount, beforeMount);
  registerLifecycleHook(onMounted, mounted);
  registerLifecycleHook(onBeforeUpdate, beforeUpdate);
  registerLifecycleHook(onUpdated, updated);
  registerLifecycleHook(onActivated, activated);
  registerLifecycleHook(onDeactivated, deactivated);
  registerLifecycleHook(onErrorCaptured, errorCaptured);
  registerLifecycleHook(onRenderTracked, renderTracked);
  registerLifecycleHook(onRenderTriggered, renderTriggered);
  registerLifecycleHook(onBeforeUnmount, beforeUnmount);
  registerLifecycleHook(onUnmounted, unmounted);
  registerLifecycleHook(onServerPrefetch, serverPrefetch);
  if (isArray(expose)) {
    if (expose.length) {
      const exposed = instance.exposed || (instance.exposed = {});
      expose.forEach((key) => {
        Object.defineProperty(exposed, key, {
          get: () => publicThis[key],
          set: (val) => publicThis[key] = val,
          enumerable: true
        });
      });
    } else if (!instance.exposed) {
      instance.exposed = {};
    }
  }
  if (render && instance.render === NOOP) {
    instance.render = render;
  }
  if (inheritAttrs != null) {
    instance.inheritAttrs = inheritAttrs;
  }
  if (components) instance.components = components;
  if (directives) instance.directives = directives;
  if (serverPrefetch) {
    markAsyncBoundary(instance);
  }
}
function resolveInjections(injectOptions, ctx, checkDuplicateProperties = NOOP) {
  if (isArray(injectOptions)) {
    injectOptions = normalizeInject(injectOptions);
  }
  for (const key in injectOptions) {
    const opt = injectOptions[key];
    let injected;
    if (isObject(opt)) {
      if ("default" in opt) {
        injected = inject(
          opt.from || key,
          opt.default,
          true
        );
      } else {
        injected = inject(opt.from || key);
      }
    } else {
      injected = inject(opt);
    }
    if (/* @__PURE__ */ isRef(injected)) {
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => injected.value,
        set: (v) => injected.value = v
      });
    } else {
      ctx[key] = injected;
    }
  }
}
function callHook(hook, instance, type) {
  callWithAsyncErrorHandling(
    isArray(hook) ? hook.map((h2) => h2.bind(instance.proxy)) : hook.bind(instance.proxy),
    instance,
    type
  );
}
function createWatcher(raw, ctx, publicThis, key) {
  let getter = key.includes(".") ? createPathGetter(publicThis, key) : () => publicThis[key];
  if (isString(raw)) {
    const handler = ctx[raw];
    if (isFunction(handler)) {
      {
        watch(getter, handler);
      }
    }
  } else if (isFunction(raw)) {
    {
      watch(getter, raw.bind(publicThis));
    }
  } else if (isObject(raw)) {
    if (isArray(raw)) {
      raw.forEach((r) => createWatcher(r, ctx, publicThis, key));
    } else {
      const handler = isFunction(raw.handler) ? raw.handler.bind(publicThis) : ctx[raw.handler];
      if (isFunction(handler)) {
        watch(getter, handler, raw);
      }
    }
  } else ;
}
function resolveMergedOptions(instance) {
  const base = instance.type;
  const { mixins, extends: extendsOptions } = base;
  const {
    mixins: globalMixins,
    optionsCache: cache,
    config: { optionMergeStrategies }
  } = instance.appContext;
  const cached = cache.get(base);
  let resolved;
  if (cached) {
    resolved = cached;
  } else if (!globalMixins.length && !mixins && !extendsOptions) {
    {
      resolved = base;
    }
  } else {
    resolved = {};
    if (globalMixins.length) {
      globalMixins.forEach(
        (m) => mergeOptions(resolved, m, optionMergeStrategies, true)
      );
    }
    mergeOptions(resolved, base, optionMergeStrategies);
  }
  if (isObject(base)) {
    cache.set(base, resolved);
  }
  return resolved;
}
function mergeOptions(to, from, strats, asMixin = false) {
  const { mixins, extends: extendsOptions } = from;
  if (extendsOptions) {
    mergeOptions(to, extendsOptions, strats, true);
  }
  if (mixins) {
    mixins.forEach(
      (m) => mergeOptions(to, m, strats, true)
    );
  }
  for (const key in from) {
    if (asMixin && key === "expose") ;
    else {
      const strat = internalOptionMergeStrats[key] || strats && strats[key];
      to[key] = strat ? strat(to[key], from[key]) : from[key];
    }
  }
  return to;
}
const internalOptionMergeStrats = {
  data: mergeDataFn,
  props: mergeEmitsOrPropsOptions,
  emits: mergeEmitsOrPropsOptions,
  // objects
  methods: mergeObjectOptions,
  computed: mergeObjectOptions,
  // lifecycle
  beforeCreate: mergeAsArray,
  created: mergeAsArray,
  beforeMount: mergeAsArray,
  mounted: mergeAsArray,
  beforeUpdate: mergeAsArray,
  updated: mergeAsArray,
  beforeDestroy: mergeAsArray,
  beforeUnmount: mergeAsArray,
  destroyed: mergeAsArray,
  unmounted: mergeAsArray,
  activated: mergeAsArray,
  deactivated: mergeAsArray,
  errorCaptured: mergeAsArray,
  serverPrefetch: mergeAsArray,
  // assets
  components: mergeObjectOptions,
  directives: mergeObjectOptions,
  // watch
  watch: mergeWatchOptions,
  // provide / inject
  provide: mergeDataFn,
  inject: mergeInject
};
function mergeDataFn(to, from) {
  if (!from) {
    return to;
  }
  if (!to) {
    return from;
  }
  return function mergedDataFn() {
    return extend(
      isFunction(to) ? to.call(this, this) : to,
      isFunction(from) ? from.call(this, this) : from
    );
  };
}
function mergeInject(to, from) {
  return mergeObjectOptions(normalizeInject(to), normalizeInject(from));
}
function normalizeInject(raw) {
  if (isArray(raw)) {
    const res = {};
    for (let i = 0; i < raw.length; i++) {
      res[raw[i]] = raw[i];
    }
    return res;
  }
  return raw;
}
function mergeAsArray(to, from) {
  return to ? [...new Set([].concat(to, from))] : from;
}
function mergeObjectOptions(to, from) {
  return to ? extend(/* @__PURE__ */ Object.create(null), to, from) : from;
}
function mergeEmitsOrPropsOptions(to, from) {
  if (to) {
    if (isArray(to) && isArray(from)) {
      return [.../* @__PURE__ */ new Set([...to, ...from])];
    }
    return extend(
      /* @__PURE__ */ Object.create(null),
      normalizePropsOrEmits(to),
      normalizePropsOrEmits(from != null ? from : {})
    );
  } else {
    return from;
  }
}
function mergeWatchOptions(to, from) {
  if (!to) return from;
  if (!from) return to;
  const merged = extend(/* @__PURE__ */ Object.create(null), to);
  for (const key in from) {
    merged[key] = mergeAsArray(to[key], from[key]);
  }
  return merged;
}
function createAppContext() {
  return {
    app: null,
    config: {
      isNativeTag: NO,
      performance: false,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {}
    },
    mixins: [],
    components: {},
    directives: {},
    provides: /* @__PURE__ */ Object.create(null),
    optionsCache: /* @__PURE__ */ new WeakMap(),
    propsCache: /* @__PURE__ */ new WeakMap(),
    emitsCache: /* @__PURE__ */ new WeakMap()
  };
}
let uid$1 = 0;
function createAppAPI(render, hydrate) {
  return function createApp2(rootComponent, rootProps = null) {
    if (!isFunction(rootComponent)) {
      rootComponent = extend({}, rootComponent);
    }
    if (rootProps != null && !isObject(rootProps)) {
      rootProps = null;
    }
    const context = createAppContext();
    const installedPlugins = /* @__PURE__ */ new WeakSet();
    const pluginCleanupFns = [];
    let isMounted = false;
    const app2 = context.app = {
      _uid: uid$1++,
      _component: rootComponent,
      _props: rootProps,
      _container: null,
      _context: context,
      _instance: null,
      version,
      get config() {
        return context.config;
      },
      set config(v) {
      },
      use(plugin, ...options) {
        if (installedPlugins.has(plugin)) ;
        else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin);
          plugin.install(app2, ...options);
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin);
          plugin(app2, ...options);
        } else ;
        return app2;
      },
      mixin(mixin) {
        {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin);
          }
        }
        return app2;
      },
      component(name, component) {
        if (!component) {
          return context.components[name];
        }
        context.components[name] = component;
        return app2;
      },
      directive(name, directive) {
        if (!directive) {
          return context.directives[name];
        }
        context.directives[name] = directive;
        return app2;
      },
      mount(rootContainer, isHydrate, namespace) {
        if (!isMounted) {
          const vnode = app2._ceVNode || createVNode(rootComponent, rootProps);
          vnode.appContext = context;
          if (namespace === true) {
            namespace = "svg";
          } else if (namespace === false) {
            namespace = void 0;
          }
          {
            render(vnode, rootContainer, namespace);
          }
          isMounted = true;
          app2._container = rootContainer;
          rootContainer.__vue_app__ = app2;
          return getComponentPublicInstance(vnode.component);
        }
      },
      onUnmount(cleanupFn) {
        pluginCleanupFns.push(cleanupFn);
      },
      unmount() {
        if (isMounted) {
          callWithAsyncErrorHandling(
            pluginCleanupFns,
            app2._instance,
            16
          );
          render(null, app2._container);
          delete app2._container.__vue_app__;
        }
      },
      provide(key, value) {
        context.provides[key] = value;
        return app2;
      },
      runWithContext(fn) {
        const lastApp = currentApp;
        currentApp = app2;
        try {
          return fn();
        } finally {
          currentApp = lastApp;
        }
      }
    };
    return app2;
  };
}
let currentApp = null;
const getModelModifiers = (props, modelName) => {
  return modelName === "modelValue" || modelName === "model-value" ? props.modelModifiers : props[`${modelName}Modifiers`] || props[`${camelize(modelName)}Modifiers`] || props[`${hyphenate(modelName)}Modifiers`];
};
function emit(instance, event, ...rawArgs) {
  if (instance.isUnmounted) return;
  const props = instance.vnode.props || EMPTY_OBJ;
  let args = rawArgs;
  const isModelListener2 = event.startsWith("update:");
  const modifiers = isModelListener2 && getModelModifiers(props, event.slice(7));
  if (modifiers) {
    if (modifiers.trim) {
      args = rawArgs.map((a) => isString(a) ? a.trim() : a);
    }
    if (modifiers.number) {
      args = rawArgs.map(looseToNumber);
    }
  }
  let handlerName;
  let handler = props[handlerName = toHandlerKey(event)] || // also try camelCase event handler (#2249)
  props[handlerName = toHandlerKey(camelize(event))];
  if (!handler && isModelListener2) {
    handler = props[handlerName = toHandlerKey(hyphenate(event))];
  }
  if (handler) {
    callWithAsyncErrorHandling(
      handler,
      instance,
      6,
      args
    );
  }
  const onceHandler = props[handlerName + `Once`];
  if (onceHandler) {
    if (!instance.emitted) {
      instance.emitted = {};
    } else if (instance.emitted[handlerName]) {
      return;
    }
    instance.emitted[handlerName] = true;
    callWithAsyncErrorHandling(
      onceHandler,
      instance,
      6,
      args
    );
  }
}
const mixinEmitsCache = /* @__PURE__ */ new WeakMap();
function normalizeEmitsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinEmitsCache : appContext.emitsCache;
  const cached = cache.get(comp);
  if (cached !== void 0) {
    return cached;
  }
  const raw = comp.emits;
  let normalized = {};
  let hasExtends = false;
  if (!isFunction(comp)) {
    const extendEmits = (raw2) => {
      const normalizedFromExtend = normalizeEmitsOptions(raw2, appContext, true);
      if (normalizedFromExtend) {
        hasExtends = true;
        extend(normalized, normalizedFromExtend);
      }
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendEmits);
    }
    if (comp.extends) {
      extendEmits(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendEmits);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, null);
    }
    return null;
  }
  if (isArray(raw)) {
    raw.forEach((key) => normalized[key] = null);
  } else {
    extend(normalized, raw);
  }
  if (isObject(comp)) {
    cache.set(comp, normalized);
  }
  return normalized;
}
function isEmitListener(options, key) {
  if (!options || !isOn(key)) {
    return false;
  }
  key = key.slice(2);
  key = key === "Once" ? key : key.replace(/Once$/, "");
  return hasOwn(options, key[0].toLowerCase() + key.slice(1)) || hasOwn(options, hyphenate(key)) || hasOwn(options, key);
}
function markAttrsAccessed() {
}
function renderComponentRoot(instance) {
  const {
    type: Component,
    vnode,
    proxy,
    withProxy,
    propsOptions: [propsOptions],
    slots,
    attrs,
    emit: emit2,
    render,
    renderCache,
    props,
    data,
    setupState,
    ctx,
    inheritAttrs
  } = instance;
  const prev = setCurrentRenderingInstance(instance);
  let result;
  let fallthroughAttrs;
  try {
    if (vnode.shapeFlag & 4) {
      const proxyToUse = withProxy || proxy;
      const thisProxy = false ? new Proxy(proxyToUse, {
        get(target, key, receiver) {
          warn$1(
            `Property '${String(
              key
            )}' was accessed via 'this'. Avoid using 'this' in templates.`
          );
          return Reflect.get(target, key, receiver);
        }
      }) : proxyToUse;
      result = normalizeVNode(
        render.call(
          thisProxy,
          proxyToUse,
          renderCache,
          false ? /* @__PURE__ */ shallowReadonly(props) : props,
          setupState,
          data,
          ctx
        )
      );
      fallthroughAttrs = attrs;
    } else {
      const render2 = Component;
      if (false) ;
      result = normalizeVNode(
        render2.length > 1 ? render2(
          false ? /* @__PURE__ */ shallowReadonly(props) : props,
          false ? {
            get attrs() {
              markAttrsAccessed();
              return /* @__PURE__ */ shallowReadonly(attrs);
            },
            slots,
            emit: emit2
          } : { attrs, slots, emit: emit2 }
        ) : render2(
          false ? /* @__PURE__ */ shallowReadonly(props) : props,
          null
        )
      );
      fallthroughAttrs = Component.props ? attrs : getFunctionalFallthrough(attrs);
    }
  } catch (err) {
    blockStack.length = 0;
    handleError(err, instance, 1);
    result = createVNode(Comment);
  }
  let root = result;
  if (fallthroughAttrs && inheritAttrs !== false) {
    const keys = Object.keys(fallthroughAttrs);
    const { shapeFlag } = root;
    if (keys.length) {
      if (shapeFlag & (1 | 6)) {
        if (propsOptions && keys.some(isModelListener)) {
          fallthroughAttrs = filterModelListeners(
            fallthroughAttrs,
            propsOptions
          );
        }
        root = cloneVNode(root, fallthroughAttrs, false, true);
      }
    }
  }
  if (vnode.dirs) {
    root = cloneVNode(root, null, false, true);
    root.dirs = root.dirs ? root.dirs.concat(vnode.dirs) : vnode.dirs;
  }
  if (vnode.transition) {
    setTransitionHooks(root, vnode.transition);
  }
  {
    result = root;
  }
  setCurrentRenderingInstance(prev);
  return result;
}
const getFunctionalFallthrough = (attrs) => {
  let res;
  for (const key in attrs) {
    if (key === "class" || key === "style" || isOn(key)) {
      (res || (res = {}))[key] = attrs[key];
    }
  }
  return res;
};
const filterModelListeners = (attrs, props) => {
  const res = {};
  for (const key in attrs) {
    if (!isModelListener(key) || !(key.slice(9) in props)) {
      res[key] = attrs[key];
    }
  }
  return res;
};
function shouldUpdateComponent(prevVNode, nextVNode, optimized) {
  const { props: prevProps, children: prevChildren, component } = prevVNode;
  const { props: nextProps, children: nextChildren, patchFlag } = nextVNode;
  const emits = component.emitsOptions;
  if (nextVNode.dirs || nextVNode.transition) {
    return true;
  }
  if (optimized && patchFlag >= 0) {
    if (patchFlag & 1024) {
      return true;
    }
    if (patchFlag & 16) {
      if (!prevProps) {
        return !!nextProps;
      }
      return hasPropsChanged(prevProps, nextProps, emits);
    } else if (patchFlag & 8) {
      const dynamicProps = nextVNode.dynamicProps;
      for (let i = 0; i < dynamicProps.length; i++) {
        const key = dynamicProps[i];
        if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emits, key)) {
          return true;
        }
      }
    }
  } else {
    if (prevChildren || nextChildren) {
      if (!nextChildren || !nextChildren.$stable) {
        return true;
      }
    }
    if (prevProps === nextProps) {
      return false;
    }
    if (!prevProps) {
      return !!nextProps;
    }
    if (!nextProps) {
      return true;
    }
    return hasPropsChanged(prevProps, nextProps, emits);
  }
  return false;
}
function hasPropsChanged(prevProps, nextProps, emitsOptions) {
  const nextKeys = Object.keys(nextProps);
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true;
  }
  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];
    if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emitsOptions, key)) {
      return true;
    }
  }
  return false;
}
function hasPropValueChanged(nextProps, prevProps, key) {
  const nextProp = nextProps[key];
  const prevProp = prevProps[key];
  if (key === "style" && isObject(nextProp) && isObject(prevProp)) {
    return !looseEqual(nextProp, prevProp);
  }
  return nextProp !== prevProp;
}
function updateHOCHostEl({ vnode, parent, suspense }, el) {
  while (parent) {
    const root = parent.subTree;
    if (root.suspense && root.suspense.activeBranch === vnode) {
      root.suspense.vnode.el = root.el = el;
      vnode = root;
    }
    if (root === vnode) {
      (vnode = parent.vnode).el = el;
      parent = parent.parent;
    } else {
      break;
    }
  }
  if (suspense && suspense.activeBranch === vnode) {
    suspense.vnode.el = el;
  }
}
const internalObjectProto = {};
const createInternalObject = () => Object.create(internalObjectProto);
const isInternalObject = (obj) => Object.getPrototypeOf(obj) === internalObjectProto;
function initProps(instance, rawProps, isStateful, isSSR = false) {
  const props = {};
  const attrs = createInternalObject();
  instance.propsDefaults = /* @__PURE__ */ Object.create(null);
  setFullProps(instance, rawProps, props, attrs);
  for (const key in instance.propsOptions[0]) {
    if (!(key in props)) {
      props[key] = void 0;
    }
  }
  if (isStateful) {
    instance.props = isSSR ? props : /* @__PURE__ */ shallowReactive(props);
  } else {
    if (!instance.type.props) {
      instance.props = attrs;
    } else {
      instance.props = props;
    }
  }
  instance.attrs = attrs;
}
function updateProps(instance, rawProps, rawPrevProps, optimized) {
  const {
    props,
    attrs,
    vnode: { patchFlag }
  } = instance;
  const rawCurrentProps = /* @__PURE__ */ toRaw(props);
  const [options] = instance.propsOptions;
  let hasAttrsChanged = false;
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    (optimized || patchFlag > 0) && !(patchFlag & 16)
  ) {
    if (patchFlag & 8) {
      const propsToUpdate = instance.vnode.dynamicProps;
      for (let i = 0; i < propsToUpdate.length; i++) {
        let key = propsToUpdate[i];
        if (isEmitListener(instance.emitsOptions, key)) {
          continue;
        }
        const value = rawProps[key];
        if (options) {
          if (hasOwn(attrs, key)) {
            if (value !== attrs[key]) {
              attrs[key] = value;
              hasAttrsChanged = true;
            }
          } else {
            const camelizedKey = camelize(key);
            props[camelizedKey] = resolvePropValue(
              options,
              rawCurrentProps,
              camelizedKey,
              value,
              instance,
              false
            );
          }
        } else {
          if (value !== attrs[key]) {
            attrs[key] = value;
            hasAttrsChanged = true;
          }
        }
      }
    }
  } else {
    if (setFullProps(instance, rawProps, props, attrs)) {
      hasAttrsChanged = true;
    }
    let kebabKey;
    for (const key in rawCurrentProps) {
      if (!rawProps || // for camelCase
      !hasOwn(rawProps, key) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey))) {
        if (options) {
          if (rawPrevProps && // for camelCase
          (rawPrevProps[key] !== void 0 || // for kebab-case
          rawPrevProps[kebabKey] !== void 0)) {
            props[key] = resolvePropValue(
              options,
              rawCurrentProps,
              key,
              void 0,
              instance,
              true
            );
          }
        } else {
          delete props[key];
        }
      }
    }
    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (!rawProps || !hasOwn(rawProps, key) && true) {
          delete attrs[key];
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (hasAttrsChanged) {
    trigger(instance.attrs, "set", "");
  }
}
function setFullProps(instance, rawProps, props, attrs) {
  const [options, needCastKeys] = instance.propsOptions;
  let hasAttrsChanged = false;
  let rawCastValues;
  if (rawProps) {
    for (let key in rawProps) {
      if (isReservedProp(key)) {
        continue;
      }
      const value = rawProps[key];
      let camelKey;
      if (options && hasOwn(options, camelKey = camelize(key))) {
        if (!needCastKeys || !needCastKeys.includes(camelKey)) {
          props[camelKey] = value;
        } else {
          (rawCastValues || (rawCastValues = {}))[camelKey] = value;
        }
      } else if (!isEmitListener(instance.emitsOptions, key)) {
        if (!(key in attrs) || value !== attrs[key]) {
          attrs[key] = value;
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (needCastKeys) {
    const rawCurrentProps = /* @__PURE__ */ toRaw(props);
    const castValues = rawCastValues || EMPTY_OBJ;
    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i];
      props[key] = resolvePropValue(
        options,
        rawCurrentProps,
        key,
        castValues[key],
        instance,
        !hasOwn(castValues, key)
      );
    }
  }
  return hasAttrsChanged;
}
function resolvePropValue(options, props, key, value, instance, isAbsent) {
  const opt = options[key];
  if (opt != null) {
    const hasDefault = hasOwn(opt, "default");
    if (hasDefault && value === void 0) {
      const defaultValue = opt.default;
      if (opt.type !== Function && !opt.skipFactory && isFunction(defaultValue)) {
        const { propsDefaults } = instance;
        if (key in propsDefaults) {
          value = propsDefaults[key];
        } else {
          const reset = setCurrentInstance(instance);
          value = propsDefaults[key] = defaultValue.call(
            null,
            props
          );
          reset();
        }
      } else {
        value = defaultValue;
      }
      if (instance.ce) {
        instance.ce._setProp(key, value);
      }
    }
    if (opt[
      0
      /* shouldCast */
    ]) {
      if (isAbsent && !hasDefault) {
        value = false;
      } else if (opt[
        1
        /* shouldCastTrue */
      ] && (value === "" || value === hyphenate(key))) {
        value = true;
      }
    }
  }
  return value;
}
const mixinPropsCache = /* @__PURE__ */ new WeakMap();
function normalizePropsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinPropsCache : appContext.propsCache;
  const cached = cache.get(comp);
  if (cached) {
    return cached;
  }
  const raw = comp.props;
  const normalized = {};
  const needCastKeys = [];
  let hasExtends = false;
  if (!isFunction(comp)) {
    const extendProps = (raw2) => {
      hasExtends = true;
      const [props, keys] = normalizePropsOptions(raw2, appContext, true);
      extend(normalized, props);
      if (keys) needCastKeys.push(...keys);
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendProps);
    }
    if (comp.extends) {
      extendProps(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendProps);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, EMPTY_ARR);
    }
    return EMPTY_ARR;
  }
  if (isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const normalizedKey = camelize(raw[i]);
      if (validatePropName(normalizedKey)) {
        normalized[normalizedKey] = EMPTY_OBJ;
      }
    }
  } else if (raw) {
    for (const key in raw) {
      const normalizedKey = camelize(key);
      if (validatePropName(normalizedKey)) {
        const opt = raw[key];
        const prop = normalized[normalizedKey] = isArray(opt) || isFunction(opt) ? { type: opt } : extend({}, opt);
        const propType = prop.type;
        let shouldCast = false;
        let shouldCastTrue = true;
        if (isArray(propType)) {
          for (let index = 0; index < propType.length; ++index) {
            const type = propType[index];
            const typeName = isFunction(type) && type.name;
            if (typeName === "Boolean") {
              shouldCast = true;
              break;
            } else if (typeName === "String") {
              shouldCastTrue = false;
            }
          }
        } else {
          shouldCast = isFunction(propType) && propType.name === "Boolean";
        }
        prop[
          0
          /* shouldCast */
        ] = shouldCast;
        prop[
          1
          /* shouldCastTrue */
        ] = shouldCastTrue;
        if (shouldCast || hasOwn(prop, "default")) {
          needCastKeys.push(normalizedKey);
        }
      }
    }
  }
  const res = [normalized, needCastKeys];
  if (isObject(comp)) {
    cache.set(comp, res);
  }
  return res;
}
function validatePropName(key) {
  if (key[0] !== "$" && !isReservedProp(key)) {
    return true;
  }
  return false;
}
const isInternalKey = (key) => key === "_" || key === "_ctx" || key === "$stable";
const normalizeSlotValue = (value) => isArray(value) ? value.map(normalizeVNode) : [normalizeVNode(value)];
const normalizeSlot = (key, rawSlot, ctx) => {
  if (rawSlot._n) {
    return rawSlot;
  }
  const normalized = withCtx((...args) => {
    if (false) ;
    return normalizeSlotValue(rawSlot(...args));
  }, ctx);
  normalized._c = false;
  return normalized;
};
const normalizeObjectSlots = (rawSlots, slots, instance) => {
  const ctx = rawSlots._ctx;
  for (const key in rawSlots) {
    if (isInternalKey(key)) continue;
    const value = rawSlots[key];
    if (isFunction(value)) {
      slots[key] = normalizeSlot(key, value, ctx);
    } else if (value != null) {
      const normalized = normalizeSlotValue(value);
      slots[key] = () => normalized;
    }
  }
};
const normalizeVNodeSlots = (instance, children) => {
  const normalized = normalizeSlotValue(children);
  instance.slots.default = () => normalized;
};
const assignSlots = (slots, children, optimized) => {
  for (const key in children) {
    if (optimized || !isInternalKey(key)) {
      slots[key] = children[key];
    }
  }
};
const initSlots = (instance, children, optimized) => {
  const slots = instance.slots = createInternalObject();
  if (instance.vnode.shapeFlag & 32) {
    const type = children._;
    if (type) {
      assignSlots(slots, children, optimized);
      if (optimized) {
        def(slots, "_", type, true);
      }
    } else {
      normalizeObjectSlots(children, slots);
    }
  } else if (children) {
    normalizeVNodeSlots(instance, children);
  }
};
const updateSlots = (instance, children, optimized) => {
  const { vnode, slots } = instance;
  let needDeletionCheck = true;
  let deletionComparisonTarget = EMPTY_OBJ;
  if (vnode.shapeFlag & 32) {
    const type = children._;
    if (type) {
      if (optimized && type === 1) {
        needDeletionCheck = false;
      } else {
        assignSlots(slots, children, optimized);
      }
    } else {
      needDeletionCheck = !children.$stable;
      normalizeObjectSlots(children, slots);
    }
    deletionComparisonTarget = children;
  } else if (children) {
    normalizeVNodeSlots(instance, children);
    deletionComparisonTarget = { default: 1 };
  }
  if (needDeletionCheck) {
    for (const key in slots) {
      if (!isInternalKey(key) && deletionComparisonTarget[key] == null) {
        delete slots[key];
      }
    }
  }
};
const queuePostRenderEffect = queueEffectWithSuspense;
function createRenderer(options) {
  return baseCreateRenderer(options);
}
function baseCreateRenderer(options, createHydrationFns) {
  const target = getGlobalThis();
  target.__VUE__ = true;
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    createComment: hostCreateComment,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    setScopeId: hostSetScopeId = NOOP,
    insertStaticContent: hostInsertStaticContent
  } = options;
  const patch = (n1, n2, container, anchor = null, parentComponent = null, parentSuspense = null, namespace = void 0, slotScopeIds = null, optimized = !!n2.dynamicChildren) => {
    if (n1 === n2) {
      return;
    }
    if (n1 && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1);
      unmount(n1, parentComponent, parentSuspense, true);
      n1 = null;
    }
    if (n2.patchFlag === -2) {
      optimized = false;
      n2.dynamicChildren = null;
    }
    const { type, ref: ref3, shapeFlag } = n2;
    switch (type) {
      case Text:
        processText(n1, n2, container, anchor);
        break;
      case Comment:
        processCommentNode(n1, n2, container, anchor);
        break;
      case Static:
        if (n1 == null) {
          mountStaticNode(n2, container, anchor, namespace);
        }
        break;
      case Fragment:
        processFragment(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        break;
      default:
        if (shapeFlag & 1) {
          processElement(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 6) {
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 64) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals
          );
        } else if (shapeFlag & 128) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals
          );
        } else ;
    }
    if (ref3 != null && parentComponent) {
      setRef(ref3, n1 && n1.ref, parentSuspense, n2 || n1, !n2);
    } else if (ref3 == null && n1 && n1.ref != null) {
      setRef(n1.ref, null, parentSuspense, n1, true);
    }
  };
  const processText = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateText(n2.children),
        container,
        anchor
      );
    } else {
      const el = n2.el = n1.el;
      if (n2.children !== n1.children) {
        hostSetText(el, n2.children);
      }
    }
  };
  const processCommentNode = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateComment(n2.children || ""),
        container,
        anchor
      );
    } else {
      n2.el = n1.el;
    }
  };
  const mountStaticNode = (n2, container, anchor, namespace) => {
    [n2.el, n2.anchor] = hostInsertStaticContent(
      n2.children,
      container,
      anchor,
      namespace,
      n2.el,
      n2.anchor
    );
  };
  const moveStaticNode = ({ el, anchor }, container, nextSibling) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostInsert(el, container, nextSibling);
      el = next;
    }
    hostInsert(anchor, container, nextSibling);
  };
  const removeStaticNode = ({ el, anchor }) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostRemove(el);
      el = next;
    }
    hostRemove(anchor);
  };
  const processElement = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    if (n2.type === "svg") {
      namespace = "svg";
    } else if (n2.type === "math") {
      namespace = "mathml";
    }
    if (n1 == null) {
      mountElement(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    } else {
      const customElement = n1.el && n1.el._isVueCE ? n1.el : null;
      try {
        if (customElement) {
          customElement._beginPatch();
        }
        patchElement(
          n1,
          n2,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } finally {
        if (customElement) {
          customElement._endPatch();
        }
      }
    }
  };
  const mountElement = (vnode, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    let el;
    let vnodeHook;
    const { props, shapeFlag, transition, dirs } = vnode;
    el = vnode.el = hostCreateElement(
      vnode.type,
      namespace,
      props && props.is,
      props
    );
    if (shapeFlag & 8) {
      hostSetElementText(el, vnode.children);
    } else if (shapeFlag & 16) {
      mountChildren(
        vnode.children,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(vnode, namespace),
        slotScopeIds,
        optimized
      );
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "created");
    }
    setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent);
    if (props) {
      for (const key in props) {
        if (key !== "value" && !isReservedProp(key)) {
          hostPatchProp(el, key, null, props[key], namespace, parentComponent);
        }
      }
      if ("value" in props) {
        hostPatchProp(el, "value", null, props.value, namespace);
      }
      if (vnodeHook = props.onVnodeBeforeMount) {
        invokeVNodeHook(vnodeHook, parentComponent, vnode);
      }
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "beforeMount");
    }
    const needCallTransitionHooks = needTransition(parentSuspense, transition);
    if (needCallTransitionHooks) {
      transition.beforeEnter(el);
    }
    hostInsert(el, container, anchor);
    if ((vnodeHook = props && props.onVnodeMounted) || needCallTransitionHooks || dirs) {
      queuePostRenderEffect(() => {
        try {
          vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
          needCallTransitionHooks && transition.enter(el);
          dirs && invokeDirectiveHook(vnode, null, parentComponent, "mounted");
        } finally {
        }
      }, parentSuspense);
    }
  };
  const setScopeId = (el, vnode, scopeId, slotScopeIds, parentComponent) => {
    if (scopeId) {
      hostSetScopeId(el, scopeId);
    }
    if (slotScopeIds) {
      for (let i = 0; i < slotScopeIds.length; i++) {
        hostSetScopeId(el, slotScopeIds[i]);
      }
    }
    if (parentComponent) {
      let subTree = parentComponent.subTree;
      if (vnode === subTree || isSuspense(subTree.type) && (subTree.ssContent === vnode || subTree.ssFallback === vnode)) {
        const parentVNode = parentComponent.vnode;
        setScopeId(
          el,
          parentVNode,
          parentVNode.scopeId,
          parentVNode.slotScopeIds,
          parentComponent.parent
        );
      }
    }
  };
  const mountChildren = (children, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, start = 0) => {
    for (let i = start; i < children.length; i++) {
      const child = children[i] = optimized ? cloneIfMounted(children[i]) : normalizeVNode(children[i]);
      patch(
        null,
        child,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    }
  };
  const patchElement = (n1, n2, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    const el = n2.el = n1.el;
    let { patchFlag, dynamicChildren, dirs } = n2;
    patchFlag |= n1.patchFlag & 16;
    const oldProps = n1.props || EMPTY_OBJ;
    const newProps = n2.props || EMPTY_OBJ;
    let vnodeHook;
    parentComponent && toggleRecurse(parentComponent, false);
    if (vnodeHook = newProps.onVnodeBeforeUpdate) {
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
    }
    if (dirs) {
      invokeDirectiveHook(n2, n1, parentComponent, "beforeUpdate");
    }
    parentComponent && toggleRecurse(parentComponent, true);
    if (
      // #6385 the old vnode may be a user-wrapped non-isomorphic block
      // Force full diff when block metadata is unstable.
      dynamicChildren && (!n1.dynamicChildren || n1.dynamicChildren.length !== dynamicChildren.length)
    ) {
      patchFlag = 0;
      optimized = false;
      dynamicChildren = null;
    }
    if (oldProps.innerHTML && newProps.innerHTML == null || oldProps.textContent && newProps.textContent == null) {
      hostSetElementText(el, "");
    }
    if (dynamicChildren) {
      patchBlockChildren(
        n1.dynamicChildren,
        dynamicChildren,
        el,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds
      );
    } else if (!optimized) {
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds,
        false
      );
    }
    if (patchFlag > 0) {
      if (patchFlag & 16) {
        patchProps(el, oldProps, newProps, parentComponent, namespace);
      } else {
        if (patchFlag & 2) {
          if (oldProps.class !== newProps.class) {
            hostPatchProp(el, "class", null, newProps.class, namespace);
          }
        }
        if (patchFlag & 4) {
          hostPatchProp(el, "style", oldProps.style, newProps.style, namespace);
        }
        if (patchFlag & 8) {
          const propsToUpdate = n2.dynamicProps;
          for (let i = 0; i < propsToUpdate.length; i++) {
            const key = propsToUpdate[i];
            const prev = oldProps[key];
            const next = newProps[key];
            if (next !== prev || key === "value") {
              hostPatchProp(el, key, prev, next, namespace, parentComponent);
            }
          }
        }
      }
      if (patchFlag & 1) {
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children);
        }
      }
    } else if (!optimized && dynamicChildren == null) {
      patchProps(el, oldProps, newProps, parentComponent, namespace);
    }
    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
        dirs && invokeDirectiveHook(n2, n1, parentComponent, "updated");
      }, parentSuspense);
    }
  };
  const patchBlockChildren = (oldChildren, newChildren, fallbackContainer, parentComponent, parentSuspense, namespace, slotScopeIds) => {
    for (let i = 0; i < newChildren.length; i++) {
      const oldVNode = oldChildren[i];
      const newVNode = newChildren[i];
      const container = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        oldVNode.el && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (oldVNode.type === Fragment || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !isSameVNodeType(oldVNode, newVNode) || // - In the case of a component, it could contain anything.
        oldVNode.shapeFlag & (6 | 64 | 128)) ? hostParentNode(oldVNode.el) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          fallbackContainer
        )
      );
      patch(
        oldVNode,
        newVNode,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        true
      );
    }
  };
  const patchProps = (el, oldProps, newProps, parentComponent, namespace) => {
    if (oldProps !== newProps) {
      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!isReservedProp(key) && !(key in newProps)) {
            hostPatchProp(
              el,
              key,
              oldProps[key],
              null,
              namespace,
              parentComponent
            );
          }
        }
      }
      for (const key in newProps) {
        if (isReservedProp(key)) continue;
        const next = newProps[key];
        const prev = oldProps[key];
        if (next !== prev && key !== "value") {
          hostPatchProp(el, key, prev, next, namespace, parentComponent);
        }
      }
      if ("value" in newProps) {
        hostPatchProp(el, "value", oldProps.value, newProps.value, namespace);
      }
    }
  };
  const processFragment = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    const fragmentStartAnchor = n2.el = n1 ? n1.el : hostCreateText("");
    const fragmentEndAnchor = n2.anchor = n1 ? n1.anchor : hostCreateText("");
    let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2;
    if (fragmentSlotScopeIds) {
      slotScopeIds = slotScopeIds ? slotScopeIds.concat(fragmentSlotScopeIds) : fragmentSlotScopeIds;
    }
    if (n1 == null) {
      hostInsert(fragmentStartAnchor, container, anchor);
      hostInsert(fragmentEndAnchor, container, anchor);
      mountChildren(
        // #10007
        // such fragment like `<></>` will be compiled into
        // a fragment which doesn't have a children.
        // In this case fallback to an empty array
        n2.children || [],
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    } else {
      if (patchFlag > 0 && patchFlag & 64 && dynamicChildren && // #2715 the previous fragment could've been a BAILed one as a result
      // of renderSlot() with no valid children
      n1.dynamicChildren && n1.dynamicChildren.length === dynamicChildren.length) {
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          container,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds
        );
        if (
          // #2080 if the stable fragment has a key, it's a <template v-for> that may
          //  get moved around. Make sure all root level vnodes inherit el.
          // #2134 or if it's a component root, it may also get moved around
          // as the component is being moved.
          n2.key != null || parentComponent && n2 === parentComponent.subTree
        ) {
          traverseStaticChildren(
            n1,
            n2,
            true
            /* shallow */
          );
        }
      } else {
        patchChildren(
          n1,
          n2,
          container,
          fragmentEndAnchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      }
    }
  };
  const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    n2.slotScopeIds = slotScopeIds;
    if (n1 == null) {
      if (n2.shapeFlag & 512) {
        parentComponent.ctx.activate(
          n2,
          container,
          anchor,
          namespace,
          optimized
        );
      } else {
        mountComponent(
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          optimized
        );
      }
    } else {
      updateComponent(n1, n2, optimized);
    }
  };
  const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, namespace, optimized) => {
    const instance = initialVNode.component = createComponentInstance(
      initialVNode,
      parentComponent,
      parentSuspense
    );
    if (isKeepAlive(initialVNode)) {
      instance.ctx.renderer = internals;
    }
    {
      setupComponent(instance, false, optimized);
    }
    if (instance.asyncDep) {
      parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect, optimized);
      if (!initialVNode.el) {
        const placeholder = instance.subTree = createVNode(Comment);
        processCommentNode(null, placeholder, container, anchor);
        initialVNode.placeholder = placeholder.el;
      }
    } else {
      setupRenderEffect(
        instance,
        initialVNode,
        container,
        anchor,
        parentSuspense,
        namespace,
        optimized
      );
    }
  };
  const updateComponent = (n1, n2, optimized) => {
    const instance = n2.component = n1.component;
    if (shouldUpdateComponent(n1, n2, optimized)) {
      if (instance.asyncDep && !instance.asyncResolved) {
        updateComponentPreRender(instance, n2, optimized);
        return;
      } else {
        instance.next = n2;
        instance.update();
      }
    } else {
      n2.el = n1.el;
      instance.vnode = n2;
    }
  };
  const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, namespace, optimized) => {
    const componentUpdateFn = () => {
      if (!instance.isMounted) {
        let vnodeHook;
        const { el, props } = initialVNode;
        const { bm, m, parent, root, type } = instance;
        const isAsyncWrapperVNode = isAsyncWrapper(initialVNode);
        toggleRecurse(instance, false);
        if (bm) {
          invokeArrayFns(bm);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeBeforeMount)) {
          invokeVNodeHook(vnodeHook, parent, initialVNode);
        }
        toggleRecurse(instance, true);
        {
          if (root.ce && root.ce._hasShadowRoot()) {
            root.ce._injectChildStyle(
              type,
              instance.parent ? instance.parent.type : void 0
            );
          }
          const subTree = instance.subTree = renderComponentRoot(instance);
          patch(
            null,
            subTree,
            container,
            anchor,
            instance,
            parentSuspense,
            namespace
          );
          initialVNode.el = subTree.el;
        }
        if (m) {
          queuePostRenderEffect(m, parentSuspense);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeMounted)) {
          const scopedInitialVNode = initialVNode;
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, scopedInitialVNode),
            parentSuspense
          );
        }
        if (initialVNode.shapeFlag & 256 || parent && isAsyncWrapper(parent.vnode) && parent.vnode.shapeFlag & 256) {
          instance.a && queuePostRenderEffect(instance.a, parentSuspense);
        }
        instance.isMounted = true;
        initialVNode = container = anchor = null;
      } else {
        let { next, bu, u, parent, vnode } = instance;
        {
          const nonHydratedAsyncRoot = locateNonHydratedAsyncRoot(instance);
          if (nonHydratedAsyncRoot) {
            if (next) {
              next.el = vnode.el;
              updateComponentPreRender(instance, next, optimized);
            }
            nonHydratedAsyncRoot.asyncDep.then(() => {
              queuePostRenderEffect(() => {
                if (!instance.isUnmounted) update();
              }, parentSuspense);
            });
            return;
          }
        }
        let originNext = next;
        let vnodeHook;
        toggleRecurse(instance, false);
        if (next) {
          next.el = vnode.el;
          updateComponentPreRender(instance, next, optimized);
        } else {
          next = vnode;
        }
        if (bu) {
          invokeArrayFns(bu);
        }
        if (vnodeHook = next.props && next.props.onVnodeBeforeUpdate) {
          invokeVNodeHook(vnodeHook, parent, next, vnode);
        }
        toggleRecurse(instance, true);
        const nextTree = renderComponentRoot(instance);
        const prevTree = instance.subTree;
        instance.subTree = nextTree;
        patch(
          prevTree,
          nextTree,
          // parent may have changed if it's in a teleport
          hostParentNode(prevTree.el),
          // anchor may have changed if it's in a fragment
          getNextHostNode(prevTree),
          instance,
          parentSuspense,
          namespace
        );
        next.el = nextTree.el;
        if (originNext === null) {
          updateHOCHostEl(instance, nextTree.el);
        }
        if (u) {
          queuePostRenderEffect(u, parentSuspense);
        }
        if (vnodeHook = next.props && next.props.onVnodeUpdated) {
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, next, vnode),
            parentSuspense
          );
        }
      }
    };
    instance.scope.on();
    const effect2 = instance.effect = new ReactiveEffect(componentUpdateFn);
    instance.scope.off();
    const update = instance.update = effect2.run.bind(effect2);
    const job = instance.job = effect2.runIfDirty.bind(effect2);
    job.i = instance;
    job.id = instance.uid;
    effect2.scheduler = () => queueJob(job);
    toggleRecurse(instance, true);
    update();
  };
  const updateComponentPreRender = (instance, nextVNode, optimized) => {
    nextVNode.component = instance;
    const prevProps = instance.vnode.props;
    instance.vnode = nextVNode;
    instance.next = null;
    updateProps(instance, nextVNode.props, prevProps, optimized);
    updateSlots(instance, nextVNode.children, optimized);
    pauseTracking();
    flushPreFlushCbs(instance);
    resetTracking();
  };
  const patchChildren = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized = false) => {
    const c1 = n1 && n1.children;
    const prevShapeFlag = n1 ? n1.shapeFlag : 0;
    const c2 = n2.children;
    const { patchFlag, shapeFlag } = n2;
    if (patchFlag > 0) {
      if (patchFlag & 128) {
        patchKeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        return;
      } else if (patchFlag & 256) {
        patchUnkeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        return;
      }
    }
    if (shapeFlag & 8) {
      if (prevShapeFlag & 16) {
        unmountChildren(c1, parentComponent, parentSuspense);
      }
      if (c2 !== c1) {
        hostSetElementText(container, c2);
      }
    } else {
      if (prevShapeFlag & 16) {
        if (shapeFlag & 16) {
          patchKeyedChildren(
            c1,
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else {
          unmountChildren(c1, parentComponent, parentSuspense, true);
        }
      } else {
        if (prevShapeFlag & 8) {
          hostSetElementText(container, "");
        }
        if (shapeFlag & 16) {
          mountChildren(
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        }
      }
    }
  };
  const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    c1 = c1 || EMPTY_ARR;
    c2 = c2 || EMPTY_ARR;
    const oldLength = c1.length;
    const newLength = c2.length;
    const commonLength = Math.min(oldLength, newLength);
    let i;
    for (i = 0; i < commonLength; i++) {
      const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      patch(
        c1[i],
        nextChild,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    }
    if (oldLength > newLength) {
      unmountChildren(
        c1,
        parentComponent,
        parentSuspense,
        true,
        false,
        commonLength
      );
    } else {
      mountChildren(
        c2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
        commonLength
      );
    }
  };
  const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    let i = 0;
    const l2 = c2.length;
    let e1 = c1.length - 1;
    let e2 = l2 - 1;
    while (i <= e1 && i <= e2) {
      const n1 = c1[i];
      const n2 = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      i++;
    }
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1];
      const n2 = c2[e2] = optimized ? cloneIfMounted(c2[e2]) : normalizeVNode(c2[e2]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      e1--;
      e2--;
    }
    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1;
        const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;
        while (i <= e2) {
          patch(
            null,
            c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]),
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
          i++;
        }
      }
    } else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i], parentComponent, parentSuspense, true);
        i++;
      }
    } else {
      const s1 = i;
      const s2 = i;
      const keyToNewIndexMap = /* @__PURE__ */ new Map();
      for (i = s2; i <= e2; i++) {
        const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
        if (nextChild.key != null) {
          keyToNewIndexMap.set(nextChild.key, i);
        }
      }
      let j;
      let patched = 0;
      const toBePatched = e2 - s2 + 1;
      let moved = false;
      let maxNewIndexSoFar = 0;
      const newIndexToOldIndexMap = new Array(toBePatched);
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0;
      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i];
        if (patched >= toBePatched) {
          unmount(prevChild, parentComponent, parentSuspense, true);
          continue;
        }
        let newIndex;
        if (prevChild.key != null) {
          newIndex = keyToNewIndexMap.get(prevChild.key);
        } else {
          for (j = s2; j <= e2; j++) {
            if (newIndexToOldIndexMap[j - s2] === 0 && isSameVNodeType(prevChild, c2[j])) {
              newIndex = j;
              break;
            }
          }
        }
        if (newIndex === void 0) {
          unmount(prevChild, parentComponent, parentSuspense, true);
        } else {
          newIndexToOldIndexMap[newIndex - s2] = i + 1;
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex;
          } else {
            moved = true;
          }
          patch(
            prevChild,
            c2[newIndex],
            container,
            null,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
          patched++;
        }
      }
      const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : EMPTY_ARR;
      j = increasingNewIndexSequence.length - 1;
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i;
        const nextChild = c2[nextIndex];
        const anchorVNode = c2[nextIndex + 1];
        const anchor = nextIndex + 1 < l2 ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          anchorVNode.el || resolveAsyncComponentPlaceholder(anchorVNode)
        ) : parentAnchor;
        if (newIndexToOldIndexMap[i] === 0) {
          patch(
            null,
            nextChild,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (moved) {
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            move(nextChild, container, anchor, 2);
          } else {
            j--;
          }
        }
      }
    }
  };
  const move = (vnode, container, anchor, moveType, parentSuspense = null) => {
    const { el, type, transition, children, shapeFlag } = vnode;
    if (shapeFlag & 6) {
      move(vnode.component.subTree, container, anchor, moveType);
      return;
    }
    if (shapeFlag & 128) {
      vnode.suspense.move(container, anchor, moveType);
      return;
    }
    if (shapeFlag & 64) {
      type.move(vnode, container, anchor, internals);
      return;
    }
    if (type === Fragment) {
      hostInsert(el, container, anchor);
      for (let i = 0; i < children.length; i++) {
        move(children[i], container, anchor, moveType);
      }
      hostInsert(vnode.anchor, container, anchor);
      return;
    }
    if (type === Static) {
      moveStaticNode(vnode, container, anchor);
      return;
    }
    const needTransition2 = moveType !== 2 && shapeFlag & 1 && transition;
    if (needTransition2) {
      if (moveType === 0) {
        if (transition.persisted && !el[leaveCbKey]) {
          hostInsert(el, container, anchor);
        } else {
          transition.beforeEnter(el);
          hostInsert(el, container, anchor);
          queuePostRenderEffect(() => transition.enter(el), parentSuspense);
        }
      } else {
        const { leave, delayLeave, afterLeave } = transition;
        const remove22 = () => {
          if (vnode.ctx.isUnmounted) {
            hostRemove(el);
          } else {
            hostInsert(el, container, anchor);
          }
        };
        const performLeave = () => {
          const wasLeaving = el._isLeaving || !!el[leaveCbKey];
          if (el._isLeaving) {
            el[leaveCbKey](
              true
              /* cancelled */
            );
          }
          if (transition.persisted && !wasLeaving) {
            remove22();
          } else {
            leave(el, () => {
              remove22();
              afterLeave && afterLeave();
            });
          }
        };
        if (delayLeave) {
          delayLeave(el, remove22, performLeave);
        } else {
          performLeave();
        }
      }
    } else {
      hostInsert(el, container, anchor);
    }
  };
  const unmount = (vnode, parentComponent, parentSuspense, doRemove = false, optimized = false) => {
    const {
      type,
      props,
      ref: ref3,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs,
      cacheIndex,
      memo
    } = vnode;
    if (patchFlag === -2) {
      optimized = false;
    }
    if (ref3 != null) {
      pauseTracking();
      setRef(ref3, null, parentSuspense, vnode, true);
      resetTracking();
    }
    if (cacheIndex != null) {
      parentComponent.renderCache[cacheIndex] = void 0;
    }
    if (shapeFlag & 256) {
      parentComponent.ctx.deactivate(vnode);
      return;
    }
    const shouldInvokeDirs = shapeFlag & 1 && dirs;
    const shouldInvokeVnodeHook = !isAsyncWrapper(vnode);
    let vnodeHook;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeBeforeUnmount)) {
      invokeVNodeHook(vnodeHook, parentComponent, vnode);
    }
    if (shapeFlag & 6) {
      unmountComponent(vnode.component, parentSuspense, doRemove);
    } else {
      if (shapeFlag & 128) {
        vnode.suspense.unmount(parentSuspense, doRemove);
        return;
      }
      if (shouldInvokeDirs) {
        invokeDirectiveHook(vnode, null, parentComponent, "beforeUnmount");
      }
      if (shapeFlag & 64) {
        vnode.type.remove(
          vnode,
          parentComponent,
          parentSuspense,
          internals,
          doRemove
        );
      } else if (dynamicChildren && // #5154
      // when v-once is used inside a block, setBlockTracking(-1) marks the
      // parent block with hasOnce: true
      // so that it doesn't take the fast path during unmount - otherwise
      // components nested in v-once are never unmounted.
      !dynamicChildren.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
      (type !== Fragment || patchFlag > 0 && patchFlag & 64)) {
        unmountChildren(
          dynamicChildren,
          parentComponent,
          parentSuspense,
          false,
          true
        );
      } else if (type === Fragment && patchFlag & (128 | 256) || !optimized && shapeFlag & 16) {
        unmountChildren(children, parentComponent, parentSuspense);
      }
      if (doRemove) {
        remove2(vnode);
      }
    }
    const shouldInvalidateMemo = memo != null && cacheIndex == null;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeUnmounted) || shouldInvokeDirs || shouldInvalidateMemo) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
        shouldInvokeDirs && invokeDirectiveHook(vnode, null, parentComponent, "unmounted");
        if (shouldInvalidateMemo) {
          vnode.el = null;
        }
      }, parentSuspense);
    }
  };
  const remove2 = (vnode) => {
    const { type, el, anchor, transition } = vnode;
    if (type === Fragment) {
      {
        removeFragment(el, anchor);
      }
      return;
    }
    if (type === Static) {
      removeStaticNode(vnode);
      return;
    }
    const performRemove = () => {
      hostRemove(el);
      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave();
      }
    };
    if (vnode.shapeFlag & 1 && transition && !transition.persisted) {
      const { leave, delayLeave } = transition;
      const performLeave = () => leave(el, performRemove);
      if (delayLeave) {
        delayLeave(vnode.el, performRemove, performLeave);
      } else {
        performLeave();
      }
    } else {
      performRemove();
    }
  };
  const removeFragment = (cur, end) => {
    let next;
    while (cur !== end) {
      next = hostNextSibling(cur);
      hostRemove(cur);
      cur = next;
    }
    hostRemove(end);
  };
  const unmountComponent = (instance, parentSuspense, doRemove) => {
    const { bum, scope, job, subTree, um, m, a } = instance;
    invalidateMount(m);
    invalidateMount(a);
    if (bum) {
      invokeArrayFns(bum);
    }
    scope.stop();
    if (job) {
      job.flags |= 8;
      unmount(subTree, instance, parentSuspense, doRemove);
    }
    if (um) {
      queuePostRenderEffect(um, parentSuspense);
    }
    queuePostRenderEffect(() => {
      instance.isUnmounted = true;
    }, parentSuspense);
  };
  const unmountChildren = (children, parentComponent, parentSuspense, doRemove = false, optimized = false, start = 0) => {
    for (let i = start; i < children.length; i++) {
      unmount(children[i], parentComponent, parentSuspense, doRemove, optimized);
    }
  };
  const getNextHostNode = (vnode) => {
    if (vnode.shapeFlag & 6) {
      return getNextHostNode(vnode.component.subTree);
    }
    if (vnode.shapeFlag & 128) {
      return vnode.suspense.next();
    }
    const el = hostNextSibling(vnode.anchor || vnode.el);
    const teleportEnd = el && el[TeleportEndKey];
    return teleportEnd ? hostNextSibling(teleportEnd) : el;
  };
  let isFlushing = false;
  const render = (vnode, container, namespace) => {
    let instance;
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null, null, true);
        instance = container._vnode.component;
      }
    } else {
      patch(
        container._vnode || null,
        vnode,
        container,
        null,
        null,
        null,
        namespace
      );
    }
    container._vnode = vnode;
    if (!isFlushing) {
      isFlushing = true;
      flushPreFlushCbs(instance);
      flushPostFlushCbs();
      isFlushing = false;
    }
  };
  const internals = {
    p: patch,
    um: unmount,
    m: move,
    r: remove2,
    mt: mountComponent,
    mc: mountChildren,
    pc: patchChildren,
    pbc: patchBlockChildren,
    n: getNextHostNode,
    o: options
  };
  let hydrate;
  return {
    render,
    hydrate,
    createApp: createAppAPI(render)
  };
}
function resolveChildrenNamespace({ type, props }, currentNamespace) {
  return currentNamespace === "svg" && type === "foreignObject" || currentNamespace === "mathml" && type === "annotation-xml" && props && props.encoding && props.encoding.includes("html") ? void 0 : currentNamespace;
}
function toggleRecurse({ effect: effect2, job }, allowed) {
  if (allowed) {
    effect2.flags |= 32;
    job.flags |= 4;
  } else {
    effect2.flags &= -33;
    job.flags &= -5;
  }
}
function needTransition(parentSuspense, transition) {
  return (!parentSuspense || parentSuspense && !parentSuspense.pendingBranch) && transition && !transition.persisted;
}
function traverseStaticChildren(n1, n2, shallow = false) {
  const ch1 = n1.children;
  const ch2 = n2.children;
  if (isArray(ch1) && isArray(ch2)) {
    for (let i = 0; i < ch1.length; i++) {
      const c1 = ch1[i];
      let c2 = ch2[i];
      if (c2.shapeFlag & 1 && !c2.dynamicChildren) {
        if (c2.patchFlag <= 0 || c2.patchFlag === 32) {
          c2 = ch2[i] = cloneIfMounted(ch2[i]);
          c2.el = c1.el;
        }
        if (!shallow && c2.patchFlag !== -2)
          traverseStaticChildren(c1, c2);
      }
      if (c2.type === Text) {
        if (c2.patchFlag === -1) {
          c2 = ch2[i] = cloneIfMounted(c2);
        }
        c2.el = c1.el;
      }
      if (c2.type === Comment && !c2.el) {
        c2.el = c1.el;
      }
    }
  }
}
function getSequence(arr) {
  const p2 = arr.slice();
  const result = [0];
  let i, j, u, v, c;
  const len = arr.length;
  for (i = 0; i < len; i++) {
    const arrI = arr[i];
    if (arrI !== 0) {
      j = result[result.length - 1];
      if (arr[j] < arrI) {
        p2[i] = j;
        result.push(i);
        continue;
      }
      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = u + v >> 1;
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p2[i] = result[u - 1];
        }
        result[u] = i;
      }
    }
  }
  u = result.length;
  v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p2[v];
  }
  return result;
}
function locateNonHydratedAsyncRoot(instance) {
  const subComponent = instance.subTree.component;
  if (subComponent) {
    if (subComponent.asyncDep && !subComponent.asyncResolved) {
      return subComponent;
    } else {
      return locateNonHydratedAsyncRoot(subComponent);
    }
  }
}
function invalidateMount(hooks) {
  if (hooks) {
    for (let i = 0; i < hooks.length; i++)
      hooks[i].flags |= 8;
  }
}
function resolveAsyncComponentPlaceholder(anchorVnode) {
  if (anchorVnode.placeholder) {
    return anchorVnode.placeholder;
  }
  const instance = anchorVnode.component;
  if (instance) {
    return resolveAsyncComponentPlaceholder(instance.subTree);
  }
  return null;
}
const isSuspense = (type) => type.__isSuspense;
function queueEffectWithSuspense(fn, suspense) {
  if (suspense && suspense.pendingBranch) {
    if (isArray(fn)) {
      suspense.effects.push(...fn);
    } else {
      suspense.effects.push(fn);
    }
  } else {
    queuePostFlushCb(fn);
  }
}
const Fragment = /* @__PURE__ */ Symbol.for("v-fgt");
const Text = /* @__PURE__ */ Symbol.for("v-txt");
const Comment = /* @__PURE__ */ Symbol.for("v-cmt");
const Static = /* @__PURE__ */ Symbol.for("v-stc");
const blockStack = [];
let currentBlock = null;
function openBlock(disableTracking = false) {
  blockStack.push(currentBlock = disableTracking ? null : []);
}
function closeBlock() {
  blockStack.pop();
  currentBlock = blockStack[blockStack.length - 1] || null;
}
let isBlockTreeEnabled = 1;
function setBlockTracking(value, inVOnce = false) {
  isBlockTreeEnabled += value;
  if (value < 0 && currentBlock && inVOnce) {
    currentBlock.hasOnce = true;
  }
}
function setupBlock(vnode) {
  vnode.dynamicChildren = isBlockTreeEnabled > 0 ? currentBlock || EMPTY_ARR : null;
  closeBlock();
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(vnode);
  }
  return vnode;
}
function createElementBlock(type, props, children, patchFlag, dynamicProps, shapeFlag) {
  return setupBlock(
    createBaseVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      shapeFlag,
      true
    )
  );
}
function isVNode(value) {
  return value ? value.__v_isVNode === true : false;
}
function isSameVNodeType(n1, n2) {
  return n1.type === n2.type && n1.key === n2.key;
}
const normalizeKey = ({ key }) => key != null ? key : null;
const normalizeRef = ({
  ref: ref3,
  ref_key,
  ref_for
}) => {
  if (typeof ref3 === "number") {
    ref3 = "" + ref3;
  }
  return ref3 != null ? isString(ref3) || /* @__PURE__ */ isRef(ref3) || isFunction(ref3) ? { i: currentRenderingInstance, r: ref3, k: ref_key, f: !!ref_for } : ref3 : null;
};
function createBaseVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, shapeFlag = type === Fragment ? 0 : 1, isBlockNode = false, needFullChildrenNormalization = false) {
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    slotScopeIds: null,
    children,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null,
    ctx: currentRenderingInstance
  };
  if (needFullChildrenNormalization) {
    normalizeChildren(vnode, children);
    if (shapeFlag & 128) {
      type.normalize(vnode);
    }
  } else if (children) {
    vnode.shapeFlag |= isString(children) ? 8 : 16;
  }
  if (isBlockTreeEnabled > 0 && // avoid a block node from tracking itself
  !isBlockNode && // has current parent block
  currentBlock && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (vnode.patchFlag > 0 || shapeFlag & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  vnode.patchFlag !== 32) {
    currentBlock.push(vnode);
  }
  return vnode;
}
const createVNode = _createVNode;
function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    type = Comment;
  }
  if (isVNode(type)) {
    const cloned = cloneVNode(
      type,
      props,
      true
      /* mergeRef: true */
    );
    if (children) {
      normalizeChildren(cloned, children);
    }
    if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
      if (cloned.shapeFlag & 6) {
        currentBlock[currentBlock.indexOf(type)] = cloned;
      } else {
        currentBlock.push(cloned);
      }
    }
    cloned.patchFlag = -2;
    return cloned;
  }
  if (isClassComponent(type)) {
    type = type.__vccOpts;
  }
  if (props) {
    props = guardReactiveProps(props);
    let { class: klass, style } = props;
    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass);
    }
    if (isObject(style)) {
      if (/* @__PURE__ */ isProxy(style) && !isArray(style)) {
        style = extend({}, style);
      }
      props.style = normalizeStyle(style);
    }
  }
  const shapeFlag = isString(type) ? 1 : isSuspense(type) ? 128 : isTeleport(type) ? 64 : isObject(type) ? 4 : isFunction(type) ? 2 : 0;
  return createBaseVNode(
    type,
    props,
    children,
    patchFlag,
    dynamicProps,
    shapeFlag,
    isBlockNode,
    true
  );
}
function guardReactiveProps(props) {
  if (!props) return null;
  return /* @__PURE__ */ isProxy(props) || isInternalObject(props) ? extend({}, props) : props;
}
function cloneVNode(vnode, extraProps, mergeRef = false, cloneTransition = false) {
  const { props, ref: ref3, patchFlag, children, transition } = vnode;
  const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props;
  const cloned = {
    __v_isVNode: true,
    __v_skip: true,
    type: vnode.type,
    props: mergedProps,
    key: mergedProps && normalizeKey(mergedProps),
    ref: extraProps && extraProps.ref ? (
      // #2078 in the case of <component :is="vnode" ref="extra"/>
      // if the vnode itself already has a ref, cloneVNode will need to merge
      // the refs so the single vnode can be set on multiple refs
      mergeRef && ref3 ? isArray(ref3) ? ref3.concat(normalizeRef(extraProps)) : [ref3, normalizeRef(extraProps)] : normalizeRef(extraProps)
    ) : ref3,
    scopeId: vnode.scopeId,
    slotScopeIds: vnode.slotScopeIds,
    children,
    target: vnode.target,
    targetStart: vnode.targetStart,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
    shapeFlag: vnode.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag: extraProps && vnode.type !== Fragment ? patchFlag === -1 ? 16 : patchFlag | 16 : patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,
    dirs: vnode.dirs,
    transition,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: vnode.component,
    suspense: vnode.suspense,
    ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
    ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
    placeholder: vnode.placeholder,
    el: vnode.el,
    anchor: vnode.anchor,
    ctx: vnode.ctx,
    ce: vnode.ce
  };
  if (transition && cloneTransition) {
    setTransitionHooks(
      cloned,
      transition.clone(cloned)
    );
  }
  return cloned;
}
function createTextVNode(text = " ", flag = 0) {
  return createVNode(Text, null, text, flag);
}
function normalizeVNode(child) {
  if (child == null || typeof child === "boolean") {
    return createVNode(Comment);
  } else if (isArray(child)) {
    return createVNode(
      Fragment,
      null,
      // #3666, avoid reference pollution when reusing vnode
      child.slice()
    );
  } else if (isVNode(child)) {
    return cloneIfMounted(child);
  } else {
    return createVNode(Text, null, String(child));
  }
}
function cloneIfMounted(child) {
  return child.el === null && child.patchFlag !== -1 || child.memo ? child : cloneVNode(child);
}
function normalizeChildren(vnode, children) {
  let type = 0;
  const { shapeFlag } = vnode;
  if (children == null) {
    children = null;
  } else if (isArray(children)) {
    type = 16;
  } else if (typeof children === "object") {
    if (shapeFlag & (1 | 64)) {
      const slot = children.default;
      if (slot) {
        slot._c && (slot._d = false);
        normalizeChildren(vnode, slot());
        slot._c && (slot._d = true);
      }
      return;
    } else {
      type = 32;
      const slotFlag = children._;
      if (!slotFlag && !isInternalObject(children)) {
        children._ctx = currentRenderingInstance;
      } else if (slotFlag === 3 && currentRenderingInstance) {
        if (currentRenderingInstance.slots._ === 1) {
          children._ = 1;
        } else {
          children._ = 2;
          vnode.patchFlag |= 1024;
        }
      }
    }
  } else if (isFunction(children)) {
    if (shapeFlag & (1 | 64)) {
      normalizeChildren(vnode, { default: children });
      return;
    }
    children = { default: children, _ctx: currentRenderingInstance };
    type = 32;
  } else {
    children = String(children);
    if (shapeFlag & 64) {
      type = 16;
      children = [createTextVNode(children)];
    } else {
      type = 8;
    }
  }
  vnode.children = children;
  vnode.shapeFlag |= type;
}
function mergeProps(...args) {
  const ret = {};
  for (let i = 0; i < args.length; i++) {
    const toMerge = args[i];
    for (const key in toMerge) {
      if (key === "class") {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class]);
        }
      } else if (key === "style") {
        ret.style = normalizeStyle([ret.style, toMerge.style]);
      } else if (isOn(key)) {
        const existing = ret[key];
        const incoming = toMerge[key];
        if (incoming && existing !== incoming && !(isArray(existing) && existing.includes(incoming))) {
          ret[key] = existing ? [].concat(existing, incoming) : incoming;
        } else if (incoming == null && existing == null && // mergeProps({ 'onUpdate:modelValue': undefined }) should not retain
        // the model listener.
        !isModelListener(key)) {
          ret[key] = incoming;
        }
      } else if (key !== "") {
        ret[key] = toMerge[key];
      }
    }
  }
  return ret;
}
function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
  callWithAsyncErrorHandling(hook, instance, 7, [
    vnode,
    prevVNode
  ]);
}
const emptyAppContext = createAppContext();
let uid = 0;
function createComponentInstance(vnode, parent, suspense) {
  const type = vnode.type;
  const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext;
  const instance = {
    uid: uid++,
    vnode,
    type,
    parent,
    appContext,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new EffectScope(
      true
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: parent ? parent.provides : Object.create(appContext.provides),
    ids: parent ? parent.ids : ["", 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: normalizePropsOptions(type, appContext),
    emitsOptions: normalizeEmitsOptions(type, appContext),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: EMPTY_OBJ,
    // inheritAttrs
    inheritAttrs: type.inheritAttrs,
    // state
    ctx: EMPTY_OBJ,
    data: EMPTY_OBJ,
    props: EMPTY_OBJ,
    attrs: EMPTY_OBJ,
    slots: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupState: EMPTY_OBJ,
    setupContext: null,
    // suspense related
    suspense,
    suspenseId: suspense ? suspense.pendingId : 0,
    asyncDep: null,
    asyncResolved: false,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: false,
    isUnmounted: false,
    isDeactivated: false,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null
  };
  {
    instance.ctx = { _: instance };
  }
  instance.root = parent ? parent.root : instance;
  instance.emit = emit.bind(null, instance);
  if (vnode.ce) {
    vnode.ce(instance);
  }
  return instance;
}
let currentInstance = null;
const getCurrentInstance = () => currentInstance || currentRenderingInstance;
let internalSetCurrentInstance;
let setInSSRSetupState;
{
  const g = getGlobalThis();
  const registerGlobalSetter = (key, setter) => {
    let setters;
    if (!(setters = g[key])) setters = g[key] = [];
    setters.push(setter);
    return (v) => {
      if (setters.length > 1) setters.forEach((set) => set(v));
      else setters[0](v);
    };
  };
  internalSetCurrentInstance = registerGlobalSetter(
    `__VUE_INSTANCE_SETTERS__`,
    (v) => currentInstance = v
  );
  setInSSRSetupState = registerGlobalSetter(
    `__VUE_SSR_SETTERS__`,
    (v) => isInSSRComponentSetup = v
  );
}
const setCurrentInstance = (instance) => {
  const prev = currentInstance;
  internalSetCurrentInstance(instance);
  instance.scope.on();
  return () => {
    instance.scope.off();
    internalSetCurrentInstance(prev);
  };
};
const unsetCurrentInstance = () => {
  currentInstance && currentInstance.scope.off();
  internalSetCurrentInstance(null);
};
function isStatefulComponent(instance) {
  return instance.vnode.shapeFlag & 4;
}
let isInSSRComponentSetup = false;
function setupComponent(instance, isSSR = false, optimized = false) {
  isSSR && setInSSRSetupState(isSSR);
  const { props, children } = instance.vnode;
  const isStateful = isStatefulComponent(instance);
  initProps(instance, props, isStateful, isSSR);
  initSlots(instance, children, optimized || isSSR);
  const setupResult = isStateful ? setupStatefulComponent(instance, isSSR) : void 0;
  isSSR && setInSSRSetupState(false);
  return setupResult;
}
function setupStatefulComponent(instance, isSSR) {
  const Component = instance.type;
  instance.accessCache = /* @__PURE__ */ Object.create(null);
  instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers);
  const { setup } = Component;
  if (setup) {
    pauseTracking();
    const setupContext = instance.setupContext = setup.length > 1 ? createSetupContext(instance) : null;
    const reset = setCurrentInstance(instance);
    const setupResult = callWithErrorHandling(
      setup,
      instance,
      0,
      [
        instance.props,
        setupContext
      ]
    );
    const isAsyncSetup = isPromise(setupResult);
    resetTracking();
    reset();
    if ((isAsyncSetup || instance.sp) && !isAsyncWrapper(instance)) {
      markAsyncBoundary(instance);
    }
    if (isAsyncSetup) {
      setupResult.then(unsetCurrentInstance, unsetCurrentInstance);
      if (isSSR) {
        return setupResult.then((resolvedResult) => {
          handleSetupResult(instance, resolvedResult);
        }).catch((e) => {
          handleError(e, instance, 0);
        });
      } else {
        instance.asyncDep = setupResult;
      }
    } else {
      handleSetupResult(instance, setupResult);
    }
  } else {
    finishComponentSetup(instance);
  }
}
function handleSetupResult(instance, setupResult, isSSR) {
  if (isFunction(setupResult)) {
    if (instance.type.__ssrInlineRender) {
      instance.ssrRender = setupResult;
    } else {
      instance.render = setupResult;
    }
  } else if (isObject(setupResult)) {
    instance.setupState = proxyRefs(setupResult);
  } else ;
  finishComponentSetup(instance);
}
function finishComponentSetup(instance, isSSR, skipOptions) {
  const Component = instance.type;
  if (!instance.render) {
    instance.render = Component.render || NOOP;
  }
  {
    const reset = setCurrentInstance(instance);
    pauseTracking();
    try {
      applyOptions(instance);
    } finally {
      resetTracking();
      reset();
    }
  }
}
const attrsProxyHandlers = {
  get(target, key) {
    track(target, "get", "");
    return target[key];
  }
};
function createSetupContext(instance) {
  const expose = (exposed) => {
    instance.exposed = exposed || {};
  };
  {
    return {
      attrs: new Proxy(instance.attrs, attrsProxyHandlers),
      slots: instance.slots,
      emit: instance.emit,
      expose
    };
  }
}
function getComponentPublicInstance(instance) {
  if (instance.exposed) {
    return instance.exposeProxy || (instance.exposeProxy = new Proxy(proxyRefs(markRaw(instance.exposed)), {
      get(target, key) {
        if (key in target) {
          return target[key];
        } else if (key in publicPropertiesMap) {
          return publicPropertiesMap[key](instance);
        }
      },
      has(target, key) {
        return key in target || key in publicPropertiesMap;
      }
    }));
  } else {
    return instance.proxy;
  }
}
const classifyRE = /(?:^|[-_])\w/g;
const classify = (str) => str.replace(classifyRE, (c) => c.toUpperCase()).replace(/[-_]/g, "");
function getComponentName(Component, includeInferred = true) {
  return isFunction(Component) ? Component.displayName || Component.name : Component.name || includeInferred && Component.__name;
}
function formatComponentName(instance, Component, isRoot = false) {
  let name = getComponentName(Component);
  if (!name && Component.__file) {
    const match = Component.__file.match(/([^/\\]+)\.\w+$/);
    if (match) {
      name = match[1];
    }
  }
  if (!name && instance) {
    const inferFromRegistry = (registry) => {
      for (const key in registry) {
        if (registry[key] === Component) {
          return key;
        }
      }
    };
    name = inferFromRegistry(instance.components) || instance.parent && inferFromRegistry(
      instance.parent.type.components
    ) || inferFromRegistry(instance.appContext.components);
  }
  return name ? classify(name) : isRoot ? `App` : `Anonymous`;
}
function isClassComponent(value) {
  return isFunction(value) && "__vccOpts" in value;
}
const computed = (getterOrOptions, debugOptions) => {
  const c = /* @__PURE__ */ computed$1(getterOrOptions, debugOptions, isInSSRComponentSetup);
  return c;
};
const version = "3.5.39";
/**
* @vue/runtime-dom v3.5.39
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let policy = void 0;
const tt = typeof window !== "undefined" && window.trustedTypes;
if (tt) {
  try {
    policy = /* @__PURE__ */ tt.createPolicy("vue", {
      createHTML: (val) => val
    });
  } catch (e) {
  }
}
const unsafeToTrustedHTML = policy ? (val) => policy.createHTML(val) : (val) => val;
const svgNS = "http://www.w3.org/2000/svg";
const mathmlNS = "http://www.w3.org/1998/Math/MathML";
const doc = typeof document !== "undefined" ? document : null;
const templateContainer = doc && /* @__PURE__ */ doc.createElement("template");
const nodeOps = {
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null);
  },
  remove: (child) => {
    const parent = child.parentNode;
    if (parent) {
      parent.removeChild(child);
    }
  },
  createElement: (tag, namespace, is, props) => {
    const el = namespace === "svg" ? doc.createElementNS(svgNS, tag) : namespace === "mathml" ? doc.createElementNS(mathmlNS, tag) : is ? doc.createElement(tag, { is }) : doc.createElement(tag);
    if (tag === "select" && props && props.multiple != null) {
      el.setAttribute("multiple", props.multiple);
    }
    return el;
  },
  createText: (text) => doc.createTextNode(text),
  createComment: (text) => doc.createComment(text),
  setText: (node, text) => {
    node.nodeValue = text;
  },
  setElementText: (el, text) => {
    el.textContent = text;
  },
  parentNode: (node) => node.parentNode,
  nextSibling: (node) => node.nextSibling,
  querySelector: (selector) => doc.querySelector(selector),
  setScopeId(el, id) {
    el.setAttribute(id, "");
  },
  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(content, parent, anchor, namespace, start, end) {
    const before = anchor ? anchor.previousSibling : parent.lastChild;
    if (start && (start === end || start.nextSibling)) {
      while (true) {
        parent.insertBefore(start.cloneNode(true), anchor);
        if (start === end || !(start = start.nextSibling)) break;
      }
    } else {
      templateContainer.innerHTML = unsafeToTrustedHTML(
        namespace === "svg" ? `<svg>${content}</svg>` : namespace === "mathml" ? `<math>${content}</math>` : content
      );
      const template = templateContainer.content;
      if (namespace === "svg" || namespace === "mathml") {
        const wrapper = template.firstChild;
        while (wrapper.firstChild) {
          template.appendChild(wrapper.firstChild);
        }
        template.removeChild(wrapper);
      }
      parent.insertBefore(template, anchor);
    }
    return [
      // first
      before ? before.nextSibling : parent.firstChild,
      // last
      anchor ? anchor.previousSibling : parent.lastChild
    ];
  }
};
const vtcKey = /* @__PURE__ */ Symbol("_vtc");
function patchClass(el, value, isSVG) {
  const transitionClasses = el[vtcKey];
  if (transitionClasses) {
    value = (value ? [value, ...transitionClasses] : [...transitionClasses]).join(" ");
  }
  if (value == null) {
    el.removeAttribute("class");
  } else if (isSVG) {
    el.setAttribute("class", value);
  } else {
    el.className = value;
  }
}
const vShowOriginalDisplay = /* @__PURE__ */ Symbol("_vod");
const vShowHidden = /* @__PURE__ */ Symbol("_vsh");
const CSS_VAR_TEXT = /* @__PURE__ */ Symbol("");
const displayRE = /(?:^|;)\s*display\s*:/;
function patchStyle(el, prev, next) {
  const style = el.style;
  const isCssString = isString(next);
  let hasControlledDisplay = false;
  if (next && !isCssString) {
    if (prev) {
      if (!isString(prev)) {
        for (const key in prev) {
          if (next[key] == null) {
            setStyle(style, key, "");
          }
        }
      } else {
        for (const prevStyle of prev.split(";")) {
          const key = prevStyle.slice(0, prevStyle.indexOf(":")).trim();
          if (next[key] == null) {
            setStyle(style, key, "");
          }
        }
      }
    }
    for (const key in next) {
      if (key === "display") {
        hasControlledDisplay = true;
      }
      const value = next[key];
      if (value != null) {
        if (!shouldPreserveTextareaResizeStyle(
          el,
          key,
          !isString(prev) && prev ? prev[key] : void 0,
          value
        )) {
          setStyle(style, key, value);
        }
      } else {
        setStyle(style, key, "");
      }
    }
  } else {
    if (isCssString) {
      if (prev !== next) {
        const cssVarText = style[CSS_VAR_TEXT];
        if (cssVarText) {
          next += ";" + cssVarText;
        }
        style.cssText = next;
        hasControlledDisplay = displayRE.test(next);
      }
    } else if (prev) {
      el.removeAttribute("style");
    }
  }
  if (vShowOriginalDisplay in el) {
    el[vShowOriginalDisplay] = hasControlledDisplay ? style.display : "";
    if (el[vShowHidden]) {
      style.display = "none";
    }
  }
}
const importantRE = /\s*!important$/;
function setStyle(style, name, val) {
  if (isArray(val)) {
    val.forEach((v) => setStyle(style, name, v));
  } else {
    if (val == null) val = "";
    if (name.startsWith("--")) {
      style.setProperty(name, val);
    } else {
      const prefixed = autoPrefix(style, name);
      if (importantRE.test(val)) {
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ""),
          "important"
        );
      } else {
        style[prefixed] = val;
      }
    }
  }
}
const prefixes = ["Webkit", "Moz", "ms"];
const prefixCache = {};
function autoPrefix(style, rawName) {
  const cached = prefixCache[rawName];
  if (cached) {
    return cached;
  }
  let name = camelize(rawName);
  if (name !== "filter" && name in style) {
    return prefixCache[rawName] = name;
  }
  name = capitalize(name);
  for (let i = 0; i < prefixes.length; i++) {
    const prefixed = prefixes[i] + name;
    if (prefixed in style) {
      return prefixCache[rawName] = prefixed;
    }
  }
  return rawName;
}
function shouldPreserveTextareaResizeStyle(el, key, prev, next) {
  return el.tagName === "TEXTAREA" && (key === "width" || key === "height") && isString(next) && prev === next;
}
const xlinkNS = "http://www.w3.org/1999/xlink";
function patchAttr(el, key, value, isSVG, instance, isBoolean = isSpecialBooleanAttr(key)) {
  if (isSVG && key.startsWith("xlink:")) {
    if (value == null) {
      el.removeAttributeNS(xlinkNS, key.slice(6, key.length));
    } else {
      el.setAttributeNS(xlinkNS, key, value);
    }
  } else {
    if (value == null || isBoolean && !includeBooleanAttr(value)) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(
        key,
        isBoolean ? "" : isSymbol(value) ? String(value) : value
      );
    }
  }
}
function patchDOMProp(el, key, value, parentComponent, attrName) {
  if (key === "innerHTML" || key === "textContent") {
    if (value != null) {
      el[key] = key === "innerHTML" ? unsafeToTrustedHTML(value) : value;
    }
    return;
  }
  const tag = el.tagName;
  if (key === "value" && tag !== "PROGRESS" && // custom elements may use _value internally
  !tag.includes("-")) {
    const oldValue = tag === "OPTION" ? el.getAttribute("value") || "" : el.value;
    const newValue = value == null ? (
      // #11647: value should be set as empty string for null and undefined,
      // but <input type="checkbox"> should be set as 'on'.
      el.type === "checkbox" ? "on" : ""
    ) : String(value);
    if (oldValue !== newValue || !("_value" in el)) {
      el.value = newValue;
    }
    if (value == null) {
      el.removeAttribute(key);
    }
    el._value = value;
    return;
  }
  let needRemove = false;
  if (value === "" || value == null) {
    const type = typeof el[key];
    if (type === "boolean") {
      value = includeBooleanAttr(value);
    } else if (value == null && type === "string") {
      value = "";
      needRemove = true;
    } else if (type === "number") {
      value = 0;
      needRemove = true;
    }
  }
  try {
    el[key] = value;
  } catch (e) {
  }
  needRemove && el.removeAttribute(attrName || key);
}
function addEventListener(el, event, handler, options) {
  el.addEventListener(event, handler, options);
}
function removeEventListener(el, event, handler, options) {
  el.removeEventListener(event, handler, options);
}
const veiKey = /* @__PURE__ */ Symbol("_vei");
function patchEvent(el, rawName, prevValue, nextValue, instance = null) {
  const invokers = el[veiKey] || (el[veiKey] = {});
  const existingInvoker = invokers[rawName];
  if (nextValue && existingInvoker) {
    existingInvoker.value = nextValue;
  } else {
    const [name, options] = parseName(rawName);
    if (nextValue) {
      const invoker = invokers[rawName] = createInvoker(
        nextValue,
        instance
      );
      addEventListener(el, name, invoker, options);
    } else if (existingInvoker) {
      removeEventListener(el, name, existingInvoker, options);
      invokers[rawName] = void 0;
    }
  }
}
const optionsModifierRE = /(Once|Passive|Capture)$/;
const optionsModifierEventRE = /^on:?(?:Once|Passive|Capture)$/;
function parseName(name) {
  let options;
  let m;
  while ((m = name.match(optionsModifierRE)) && !optionsModifierEventRE.test(name)) {
    if (!options) options = {};
    name = name.slice(0, name.length - m[1].length);
    options[m[1].toLowerCase()] = true;
  }
  const event = name[2] === ":" ? name.slice(3) : hyphenate(name.slice(2));
  return [event, options];
}
let cachedNow = 0;
const p = /* @__PURE__ */ Promise.resolve();
const getNow = () => cachedNow || (p.then(() => cachedNow = 0), cachedNow = Date.now());
function createInvoker(initialValue, instance) {
  const invoker = (e) => {
    if (!e._vts) {
      e._vts = Date.now();
    } else if (e._vts <= invoker.attached) {
      return;
    }
    const value = invoker.value;
    if (isArray(value)) {
      const originalStop = e.stopImmediatePropagation;
      e.stopImmediatePropagation = () => {
        originalStop.call(e);
        e._stopped = true;
      };
      const handlers = value.slice();
      const args = [e];
      for (let i = 0; i < handlers.length; i++) {
        if (e._stopped) {
          break;
        }
        const handler = handlers[i];
        if (handler) {
          callWithAsyncErrorHandling(
            handler,
            instance,
            5,
            args
          );
        }
      }
    } else {
      callWithAsyncErrorHandling(
        value,
        instance,
        5,
        [e]
      );
    }
  };
  invoker.value = initialValue;
  invoker.attached = getNow();
  return invoker;
}
const isNativeOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // lowercase letter
key.charCodeAt(2) > 96 && key.charCodeAt(2) < 123;
const patchProp = (el, key, prevValue, nextValue, namespace, parentComponent) => {
  const isSVG = namespace === "svg";
  if (key === "class") {
    patchClass(el, nextValue, isSVG);
  } else if (key === "style") {
    patchStyle(el, prevValue, nextValue);
  } else if (isOn(key)) {
    if (!isModelListener(key)) {
      patchEvent(el, key, prevValue, nextValue, parentComponent);
    }
  } else if (key[0] === "." ? (key = key.slice(1), true) : key[0] === "^" ? (key = key.slice(1), false) : shouldSetAsProp(el, key, nextValue, isSVG)) {
    patchDOMProp(el, key, nextValue);
    if (!el.tagName.includes("-") && (key === "value" || key === "checked" || key === "selected")) {
      patchAttr(el, key, nextValue, isSVG, parentComponent, key !== "value");
    }
  } else if (
    // #11081 force set props for possible async custom element
    el._isVueCE && // #12408 check if it's declared prop or it's async custom element
    (shouldSetAsPropForVueCE(el, key) || // @ts-expect-error _def is private
    el._def.__asyncLoader && (/[A-Z]/.test(key) || !isString(nextValue)))
  ) {
    patchDOMProp(el, camelize(key), nextValue, parentComponent, key);
  } else {
    if (key === "true-value") {
      el._trueValue = nextValue;
    } else if (key === "false-value") {
      el._falseValue = nextValue;
    }
    patchAttr(el, key, nextValue, isSVG);
  }
};
function shouldSetAsProp(el, key, value, isSVG) {
  if (isSVG) {
    if (key === "innerHTML" || key === "textContent") {
      return true;
    }
    if (key in el && isNativeOn(key) && isFunction(value)) {
      return true;
    }
    return false;
  }
  if (key === "spellcheck" || key === "draggable" || key === "translate" || key === "autocorrect") {
    return false;
  }
  if (key === "sandbox" && el.tagName === "IFRAME") {
    return false;
  }
  if (key === "form") {
    return false;
  }
  if (key === "list" && el.tagName === "INPUT") {
    return false;
  }
  if (key === "type" && el.tagName === "TEXTAREA") {
    return false;
  }
  if (key === "width" || key === "height") {
    const tag = el.tagName;
    if (tag === "IMG" || tag === "VIDEO" || tag === "CANVAS" || tag === "SOURCE") {
      return false;
    }
  }
  if (isNativeOn(key) && isString(value)) {
    return false;
  }
  return key in el;
}
function shouldSetAsPropForVueCE(el, key) {
  const props = (
    // @ts-expect-error _def is private
    el._def.props
  );
  if (!props) {
    return false;
  }
  const camelKey = camelize(key);
  return Array.isArray(props) ? props.some((prop) => camelize(prop) === camelKey) : Object.keys(props).some((prop) => camelize(prop) === camelKey);
}
const getModelAssigner = (vnode) => {
  const fn = vnode.props["onUpdate:modelValue"] || false;
  return isArray(fn) ? (value) => invokeArrayFns(fn, value) : fn;
};
function onCompositionStart(e) {
  e.target.composing = true;
}
function onCompositionEnd(e) {
  const target = e.target;
  if (target.composing) {
    target.composing = false;
    target.dispatchEvent(new Event("input"));
  }
}
const assignKey = /* @__PURE__ */ Symbol("_assign");
function castValue(value, trim, number) {
  if (trim) value = value.trim();
  if (number) value = looseToNumber(value);
  return value;
}
const vModelText = {
  created(el, { modifiers: { lazy, trim, number } }, vnode) {
    el[assignKey] = getModelAssigner(vnode);
    const castToNumber = number || vnode.props && vnode.props.type === "number";
    addEventListener(el, lazy ? "change" : "input", (e) => {
      if (e.target.composing) return;
      el[assignKey](castValue(el.value, trim, castToNumber));
    });
    if (trim || castToNumber) {
      addEventListener(el, "change", () => {
        el.value = castValue(el.value, trim, castToNumber);
      });
    }
    if (!lazy) {
      addEventListener(el, "compositionstart", onCompositionStart);
      addEventListener(el, "compositionend", onCompositionEnd);
      addEventListener(el, "change", onCompositionEnd);
    }
  },
  // set value on mounted so it's after min/max for type="range"
  mounted(el, { value }) {
    el.value = value == null ? "" : value;
  },
  beforeUpdate(el, { value, oldValue, modifiers: { lazy, trim, number } }, vnode) {
    el[assignKey] = getModelAssigner(vnode);
    if (el.composing) return;
    const elValue = (number || el.type === "number") && !/^0\d/.test(el.value) ? looseToNumber(el.value) : el.value;
    const newValue = value == null ? "" : value;
    if (elValue === newValue) {
      return;
    }
    const rootNode = el.getRootNode();
    if ((rootNode instanceof Document || rootNode instanceof ShadowRoot) && rootNode.activeElement === el && el.type !== "range") {
      if (lazy && value === oldValue) {
        return;
      }
      if (trim && el.value.trim() === newValue) {
        return;
      }
    }
    el.value = newValue;
  }
};
const systemModifiers = ["ctrl", "shift", "alt", "meta"];
const modifierGuards = {
  stop: (e) => e.stopPropagation(),
  prevent: (e) => e.preventDefault(),
  self: (e) => e.target !== e.currentTarget,
  ctrl: (e) => !e.ctrlKey,
  shift: (e) => !e.shiftKey,
  alt: (e) => !e.altKey,
  meta: (e) => !e.metaKey,
  left: (e) => "button" in e && e.button !== 0,
  middle: (e) => "button" in e && e.button !== 1,
  right: (e) => "button" in e && e.button !== 2,
  exact: (e, modifiers) => systemModifiers.some((m) => e[`${m}Key`] && !modifiers.includes(m))
};
const withModifiers = (fn, modifiers) => {
  if (!fn) return fn;
  const cache = fn._withMods || (fn._withMods = {});
  const cacheKey = modifiers.join(".");
  return cache[cacheKey] || (cache[cacheKey] = ((event, ...args) => {
    for (let i = 0; i < modifiers.length; i++) {
      const guard = modifierGuards[modifiers[i]];
      if (guard && guard(event, modifiers)) return;
    }
    return fn(event, ...args);
  }));
};
const rendererOptions = /* @__PURE__ */ extend({ patchProp }, nodeOps);
let renderer;
function ensureRenderer() {
  return renderer || (renderer = createRenderer(rendererOptions));
}
const createApp = ((...args) => {
  const app2 = ensureRenderer().createApp(...args);
  const { mount } = app2;
  app2.mount = (containerOrSelector) => {
    const container = normalizeContainer(containerOrSelector);
    if (!container) return;
    const component = app2._component;
    if (!isFunction(component) && !component.render && !component.template) {
      component.template = container.innerHTML;
    }
    if (container.nodeType === 1) {
      container.textContent = "";
    }
    const proxy = mount(container, false, resolveRootNamespace(container));
    if (container instanceof Element) {
      container.removeAttribute("v-cloak");
      container.setAttribute("data-v-app", "");
    }
    return proxy;
  };
  return app2;
});
function resolveRootNamespace(container) {
  if (container instanceof SVGElement) {
    return "svg";
  }
  if (typeof MathMLElement === "function" && container instanceof MathMLElement) {
    return "mathml";
  }
}
function normalizeContainer(container) {
  if (isString(container)) {
    const res = document.querySelector(container);
    return res;
  }
  return container;
}
const _hoisted_1$5 = { class: "nkd-pv-bar" };
const _hoisted_2$5 = ["title", "onClick"];
const _sfc_main$5 = /* @__PURE__ */ defineComponent({
  __name: "PromptVariablesWidget",
  props: {
    onChange: { type: Function }
  },
  setup(__props, { expose: __expose }) {
    const props = __props;
    const editor = /* @__PURE__ */ ref(null);
    const vars = /* @__PURE__ */ ref([]);
    let savedRange = null;
    let debounceTimer;
    const TOKEN_RE = /\{(variable_\d+)(:[rc])?\}/g;
    const NEXT_MODE = { "": "r", r: "c", c: "" };
    let draggedChip = null;
    function labelFor(name) {
      const v = vars.value.find((x) => x.name === name);
      if (v) return v.label;
      const m = name.match(/_(\d+)$/);
      return `Variable ${m ? Number(m[1]) + 1 : "?"}`;
    }
    function applyMode(span, mode) {
      span.dataset.mode = mode;
      span.classList.toggle("nkd-pv-chip-rand", mode === "r");
      span.classList.toggle("nkd-pv-chip-cycle", mode === "c");
    }
    function chipEl(name, mode = "") {
      const span = document.createElement("span");
      span.className = "nkd-pv-chip";
      span.contentEditable = "false";
      span.dataset.var = name;
      applyMode(span, mode);
      span.title = "Shift+clic: normal → aleatorio 🎲 → ciclo 🔁 · arrastra para mover";
      span.draggable = true;
      span.addEventListener("dragstart", (e) => {
        var _a;
        draggedChip = span;
        (_a = e.dataTransfer) == null ? void 0 : _a.setData("text/plain", "");
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      span.addEventListener("dragend", () => {
        draggedChip = null;
      });
      const dot = document.createElement("i");
      dot.className = "nkd-pv-dot";
      span.appendChild(dot);
      span.appendChild(document.createTextNode(labelFor(name)));
      const v = vars.value.find((x) => x.name === name);
      if (v && !v.connected) span.classList.add("nkd-pv-chip-off");
      return span;
    }
    function rangeFromPoint(x, y) {
      var _a;
      const doc2 = document;
      if (doc2.caretRangeFromPoint) return doc2.caretRangeFromPoint(x, y);
      const pos = (_a = doc2.caretPositionFromPoint) == null ? void 0 : _a.call(doc2, x, y);
      if (!pos) return null;
      const r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
      return r;
    }
    function onDragOver(e) {
      if (draggedChip && e.dataTransfer) e.dataTransfer.dropEffect = "move";
    }
    function onDrop(e) {
      const el = editor.value;
      if (!draggedChip || !el) return;
      const range = rangeFromPoint(e.clientX, e.clientY);
      if (!range || !el.contains(range.startContainer)) return;
      if (draggedChip.contains(range.startContainer)) return;
      range.insertNode(draggedChip);
      range.setStartAfter(draggedChip);
      range.collapse(true);
      const sel = window.getSelection();
      sel == null ? void 0 : sel.removeAllRanges();
      sel == null ? void 0 : sel.addRange(range);
      savedRange = range.cloneRange();
      draggedChip = null;
      emitChange();
    }
    function renderText(text) {
      var _a;
      const el = editor.value;
      if (!el) return;
      el.textContent = "";
      let last = 0;
      for (const m of text.matchAll(TOKEN_RE)) {
        if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
        el.appendChild(chipEl(m[1], ((_a = m[2]) == null ? void 0 : _a.slice(1)) ?? ""));
        last = m.index + m[0].length;
      }
      if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
    }
    function serialise() {
      const el = editor.value;
      if (!el) return "";
      let out = "";
      const walk = (node) => {
        for (const child of Array.from(node.childNodes)) {
          if (child.nodeType === Node.TEXT_NODE) {
            out += child.textContent ?? "";
          } else if (child instanceof HTMLElement && child.dataset.var) {
            const mode = child.dataset.mode ?? "";
            out += `{${child.dataset.var}${mode ? `:${mode}` : ""}}`;
          } else if (child instanceof HTMLBRElement) {
            out += "\n";
          } else if (child instanceof HTMLElement) {
            if (out && !out.endsWith("\n")) out += "\n";
            walk(child);
          }
        }
      };
      walk(el);
      return out;
    }
    function deserialise(text) {
      renderText(text);
    }
    function emitChange() {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => props.onChange(serialise()), 120);
    }
    function onInput() {
      emitChange();
    }
    function onKeydown(e) {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        insertAtCursor(document.createTextNode("\n"));
        emitChange();
      }
    }
    function onPaste(e) {
      var _a;
      const text = ((_a = e.clipboardData) == null ? void 0 : _a.getData("text/plain")) ?? "";
      if (text) {
        insertAtCursor(document.createTextNode(text));
        emitChange();
      }
    }
    function onEditorClick(e) {
      var _a, _b;
      const chip = (_b = (_a = e.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, ".nkd-pv-chip");
      if (!chip || !e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      applyMode(chip, NEXT_MODE[chip.dataset.mode ?? ""]);
      emitChange();
    }
    function saveSelection() {
      var _a;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && ((_a = editor.value) == null ? void 0 : _a.contains(sel.anchorNode))) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    }
    function insertAtCursor(node) {
      const el = editor.value;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      let range = savedRange;
      if (!range || !el.contains(range.startContainer)) {
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
      }
      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      sel == null ? void 0 : sel.removeAllRanges();
      sel == null ? void 0 : sel.addRange(range);
      savedRange = range.cloneRange();
    }
    function insertChip(name) {
      insertAtCursor(chipEl(name));
      insertAtCursor(document.createTextNode(" "));
      emitChange();
    }
    function setVariables(list) {
      var _a;
      const changed = JSON.stringify(list) !== JSON.stringify(vars.value);
      if (!changed) return;
      vars.value = list;
      (_a = editor.value) == null ? void 0 : _a.querySelectorAll(".nkd-pv-chip").forEach((chip) => {
        const v = list.find((x) => x.name === chip.dataset.var);
        chip.classList.toggle("nkd-pv-chip-off", !(v && v.connected));
        if (v && chip.lastChild && chip.lastChild.textContent !== v.label) {
          chip.lastChild.textContent = v.label;
        }
      });
    }
    function cleanup() {
      window.clearTimeout(debounceTimer);
    }
    onMounted(() => {
    });
    __expose({ serialise, deserialise, setVariables, cleanup });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "nkd-pv",
        onMousedown: _cache[1] || (_cache[1] = withModifiers(() => {
        }, ["stop"])),
        onMouseup: _cache[2] || (_cache[2] = withModifiers(() => {
        }, ["stop"])),
        onMousemove: _cache[3] || (_cache[3] = withModifiers(() => {
        }, ["stop"]))
      }, [
        createBaseVNode("div", {
          ref_key: "editor",
          ref: editor,
          class: "nkd-pv-editor",
          contenteditable: "true",
          spellcheck: "false",
          "data-placeholder": "Write your prompt…",
          onInput,
          onKeydown,
          onPaste: withModifiers(onPaste, ["prevent"]),
          onBlur: saveSelection,
          onKeyup: saveSelection,
          onMouseup: saveSelection,
          onDragover: withModifiers(onDragOver, ["prevent"]),
          onDrop: withModifiers(onDrop, ["prevent"]),
          onClick: onEditorClick,
          onContextmenu: _cache[0] || (_cache[0] = withModifiers(() => {
          }, ["stop"]))
        }, null, 544),
        createBaseVNode("div", _hoisted_1$5, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(vars.value, (v) => {
            return openBlock(), createElementBlock("button", {
              key: v.name,
              class: normalizeClass(["nkd-pv-add", { connected: v.connected }]),
              title: v.connected ? "Insert chip (wired)" : "Insert chip (not wired yet)",
              onClick: withModifiers(($event) => insertChip(v.name), ["stop", "prevent"])
            }, "+ " + toDisplayString(v.label), 11, _hoisted_2$5);
          }), 128))
        ])
      ], 32);
    };
  }
});
const _export_sfc = (sfc, props) => {
  const target = sfc.__vccOpts || sfc;
  for (const [key, val] of props) {
    target[key] = val;
  }
  return target;
};
const PromptVariablesWidget = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["__scopeId", "data-v-e3af9b8a"]]);
const MODES = ["smooth", "bezier", "steps"];
function midWarp(f, mid) {
  const m = Math.min(0.95, Math.max(0.05, mid ?? 0.5));
  if (Math.abs(m - 0.5) < 1e-4) return f;
  return f <= 0 ? 0 : Math.pow(f, Math.log(0.5) / Math.log(m));
}
function smoothstep(f) {
  return f * f * (3 - 2 * f);
}
function parseInterp(rampJson) {
  var _a;
  try {
    const m = (_a = JSON.parse(rampJson)) == null ? void 0 : _a.interp;
    if (MODES.includes(m)) return m;
  } catch {
  }
  return "smooth";
}
function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function buildRampLut(stops, interp) {
  const lut = new Uint8ClampedArray(256 * 3);
  let si = 0;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    if (interp === "steps") {
      let k = 0;
      while (k < stops.length - 1 && stops[k + 1].pos <= t) k++;
      const [r, g, b3] = hexToRgb(stops[k].color);
      lut[i * 3] = r;
      lut[i * 3 + 1] = g;
      lut[i * 3 + 2] = b3;
      continue;
    }
    while (si < stops.length - 2 && t > stops[si + 1].pos) si++;
    const a = stops[si], b = stops[Math.min(si + 1, stops.length - 1)];
    let f = Math.max(0, Math.min(1, (t - a.pos) / Math.max(1e-6, b.pos - a.pos)));
    f = midWarp(f, a.mid);
    if (interp === "bezier") f = smoothstep(f);
    const [r1, g1, b1] = hexToRgb(a.color), [r2, g2, b2] = hexToRgb(b.color);
    lut[i * 3] = r1 + (r2 - r1) * f;
    lut[i * 3 + 1] = g1 + (g2 - g1) * f;
    lut[i * 3 + 2] = b1 + (b2 - b1) * f;
  }
  return lut;
}
function lerpHex(c1, c2, t) {
  const [r1, g1, b1] = hexToRgb(c1), [r2, g2, b2] = hexToRgb(c2);
  const mix = (a, b) => Math.round(a + (b - a) * t);
  const hex = (v) => v.toString(16).padStart(2, "0");
  return `#${hex(mix(r1, r2))}${hex(mix(g1, g2))}${hex(mix(b1, b2))}`;
}
function expandStops(stops, interp, remap = (p2) => p2) {
  const out = [];
  if (interp === "steps") {
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (i > 0) out.push({ pos: remap(s.pos), color: stops[i - 1].color });
      out.push({ pos: remap(s.pos), color: s.color });
    }
    return out;
  }
  const SUB = 12;
  const warped = Math.abs(remap(0.25) - 0.25) > 1e-4;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    const needsSub = interp === "bezier" || warped || Math.abs((a.mid ?? 0.5) - 0.5) > 1e-4;
    const n = needsSub ? SUB : 1;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      let e = midWarp(u, a.mid);
      if (interp === "bezier") e = smoothstep(e);
      out.push({ pos: remap(a.pos + (b.pos - a.pos) * u), color: lerpHex(a.color, b.color, e) });
    }
  }
  return out;
}
const _hoisted_1$4 = { class: "nkd-bar" };
const _hoisted_2$4 = { class: "nkd-row nkd-row--controls" };
const _hoisted_3$4 = ["value"];
const _hoisted_4$3 = { class: "nkd-row nkd-row--presets" };
const _hoisted_5 = ["value"];
const _hoisted_6 = ["value"];
const _hoisted_7 = ["disabled"];
const CW = 380, CH = 64;
const HIT_R$1 = 10;
const MIN_RENDER_SCALE$4 = 2;
const _sfc_main$4 = /* @__PURE__ */ defineComponent({
  __name: "ColorRampWidget",
  props: {
    onChange: { type: Function }
  },
  setup(__props, { expose: __expose }) {
    const props = __props;
    const PAD2 = { top: 12, right: 16, bottom: 12, left: 16 };
    const IW = CW - PAD2.left - PAD2.right;
    const BAR_Y = PAD2.top;
    const BAR_H = CH - PAD2.top - PAD2.bottom;
    const BAR_MID = BAR_Y + BAR_H / 2;
    const C = {
      bg: "#111318",
      gridBorder: "rgba(255,255,255,0.16)",
      ptStroke: "rgba(0,0,0,0.65)",
      active: "rgba(74,180,255,0.65)",
      tooltipBg: "rgba(15,18,26,0.88)",
      tooltipBorder: "rgba(74,180,255,0.5)",
      tooltipText: "#e8eef8"
    };
    const canvas = /* @__PURE__ */ ref(null);
    const colorInput = /* @__PURE__ */ ref(null);
    let ctx = null;
    let ro = null;
    let dpr = window.devicePixelRatio || 1;
    const stops = /* @__PURE__ */ ref([{ pos: 0, color: "#000000" }, { pos: 1, color: "#ffffff" }]);
    const interp = /* @__PURE__ */ ref("smooth");
    let activeStop = null;
    let hoverStop = null;
    let draggingMid = null;
    let hoverMid = null;
    let dragging = false;
    let dragOffsetX = 0;
    let downX = 0, downY = 0, moved = false;
    function clamp01(v) {
      return Math.max(0, Math.min(1, v));
    }
    function normalizeHex(c) {
      return /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : "#000000";
    }
    function toCanvasX(pos) {
      return PAD2.left + pos * IW;
    }
    function fromCanvasX(x) {
      return clamp01((x - PAD2.left) / IW);
    }
    function eventToLogical(e) {
      const rect = canvas.value.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (CW / rect.width),
        y: (e.clientY - rect.top) * (CH / rect.height)
      };
    }
    function stopAt(x) {
      let best = null;
      let bestDist = HIT_R$1;
      for (const s of stops.value) {
        const d = Math.abs(toCanvasX(s.pos) - x);
        if (d <= bestDist) {
          best = s;
          bestDist = d;
        }
      }
      return best;
    }
    function syncCanvasSize() {
      const c = canvas.value;
      if (!c) return false;
      const rect = c.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const sx = Math.max(rect.width / CW * dpr, MIN_RENDER_SCALE$4);
      const sy = Math.max(rect.height / CH * dpr, MIN_RENDER_SCALE$4);
      const newW = Math.round(CW * sx), newH = Math.round(CH * sy);
      if (c.width !== newW || c.height !== newH) {
        c.width = newW;
        c.height = newH;
        ctx = c.getContext("2d");
        ctx == null ? void 0 : ctx.setTransform(sx, 0, 0, sy, 0, 0);
      }
      redraw();
      return true;
    }
    function redraw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, CW, CH);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, CW, CH);
      const grad = ctx.createLinearGradient(PAD2.left, 0, PAD2.left + IW, 0);
      const sorted = [...stops.value].sort((a, b) => a.pos - b.pos);
      for (const s of expandStops(sorted, interp.value)) grad.addColorStop(clamp01(s.pos), s.color);
      ctx.fillStyle = grad;
      roundRectPath(PAD2.left, BAR_Y, IW, BAR_H, 5);
      ctx.fill();
      ctx.strokeStyle = C.gridBorder;
      ctx.lineWidth = 0.75;
      roundRectPath(PAD2.left, BAR_Y, IW, BAR_H, 5);
      ctx.stroke();
      drawMidDiamonds();
      for (const s of stops.value) {
        const x = toCanvasX(s.pos);
        const isActive = s === activeStop;
        const isHover = s === hoverStop;
        const r = isActive ? 7 : isHover ? 6 : 4.5;
        if (isActive) {
          ctx.beginPath();
          ctx.arc(x, BAR_MID, r + 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = C.active;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 1;
        ctx.beginPath();
        ctx.arc(x, BAR_MID, r, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.restore();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = C.ptStroke;
        ctx.stroke();
      }
      const tip = dragging ? activeStop : hoverStop;
      if (tip) drawTooltip(tip);
    }
    function drawTooltip(stop) {
      if (!ctx) return;
      const x = toCanvasX(stop.pos);
      const label = `${Math.round(stop.pos * 100)}%  ${stop.color}`;
      ctx.font = "10px monospace";
      const textW = ctx.measureText(label).width;
      const padX = 6, h = 16;
      const w = textW + padX * 2;
      let tx = x - w / 2;
      tx = Math.max(2, Math.min(CW - w - 2, tx));
      const ty = BAR_MID - 5 - h - 6;
      ctx.fillStyle = C.tooltipBg;
      ctx.strokeStyle = dragging ? "rgba(255,107,107,0.6)" : C.tooltipBorder;
      ctx.lineWidth = 1;
      roundRectPath(tx, ty, w, h, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.tooltipText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, tx + w / 2, ty + h / 2 + 0.5);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    function sortedStops() {
      return [...stops.value].sort((a, b) => a.pos - b.pos);
    }
    function drawMidDiamonds() {
      if (!ctx) return;
      const sorted = sortedStops();
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i], b = sorted[i + 1];
        const mx = toCanvasX(a.pos + (b.pos - a.pos) * (a.mid ?? 0.5));
        if (mx - toCanvasX(a.pos) < 5 || toCanvasX(b.pos) - mx < 5) continue;
        const on = a === draggingMid || a === hoverMid;
        const r = on ? 4.5 : 3.5;
        ctx.save();
        ctx.translate(mx, BAR_MID);
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.rect(-r, -r, r * 2, r * 2);
        ctx.fillStyle = on ? "rgba(232,238,248,0.95)" : "rgba(232,238,248,0.6)";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.stroke();
        ctx.restore();
      }
    }
    function midpointAt(x, y) {
      if (Math.abs(y - BAR_MID) > HIT_R$1) return null;
      const sorted = sortedStops();
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i], b = sorted[i + 1];
        const mx = toCanvasX(a.pos + (b.pos - a.pos) * (a.mid ?? 0.5));
        if (Math.abs(mx - x) <= HIT_R$1) return a;
      }
      return null;
    }
    function roundRectPath(x, y, w, h, r) {
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function sampleColorAt(pos) {
      const sorted = [...stops.value].sort((a, b) => a.pos - b.pos);
      if (pos <= sorted[0].pos) return sorted[0].color;
      if (pos >= sorted[sorted.length - 1].pos) return sorted[sorted.length - 1].color;
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i], b = sorted[i + 1];
        if (pos >= a.pos && pos <= b.pos) {
          const t = (pos - a.pos) / Math.max(1e-6, b.pos - a.pos);
          return lerpHex2(a.color, b.color, t);
        }
      }
      return sorted[0].color;
    }
    function lerpHex2(c1, c2, t) {
      const p2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const [r1, g1, b1] = p2(c1), [r2, g2, b2] = p2(c2);
      const mix = (a, b) => Math.round(a + (b - a) * t);
      const hex = (v) => v.toString(16).padStart(2, "0");
      return `#${hex(mix(r1, r2))}${hex(mix(g1, g2))}${hex(mix(b1, b2))}`;
    }
    function onDown(e) {
      const { x, y } = eventToLogical(e);
      downX = x;
      downY = y;
      moved = false;
      const hit = stopAt(x);
      if (hit && e.shiftKey) {
        if (stops.value.length > 2) {
          stops.value = stops.value.filter((s) => s !== hit);
          activeStop = null;
          emitChange();
        }
        redraw();
        return;
      }
      if (hit) {
        activeStop = hit;
        dragOffsetX = hit.pos - fromCanvasX(x);
        dragging = true;
        redraw();
        return;
      }
      const mp = midpointAt(x, y);
      if (mp) {
        draggingMid = mp;
        redraw();
        return;
      }
      if (y >= BAR_Y - HIT_R$1 && y <= BAR_Y + BAR_H + HIT_R$1) {
        const pos = fromCanvasX(x);
        const newStop = { pos, color: sampleColorAt(pos), mid: 0.5 };
        stops.value.push(newStop);
        activeStop = newStop;
        dragOffsetX = 0;
        dragging = true;
        emitChange();
      }
      redraw();
    }
    function onMove(e) {
      const { x, y } = eventToLogical(e);
      if (Math.abs(x - downX) > 3 || Math.abs(y - downY) > 3) moved = true;
      if (draggingMid) {
        const sorted = sortedStops();
        const i = sorted.indexOf(draggingMid);
        if (i >= 0 && i < sorted.length - 1) {
          const a = sorted[i], b = sorted[i + 1];
          const span = Math.max(1e-6, b.pos - a.pos);
          draggingMid.mid = Math.min(0.95, Math.max(0.05, (fromCanvasX(x) - a.pos) / span));
          emitChange();
          redraw();
        }
        return;
      }
      if (dragging && activeStop) {
        activeStop.pos = clamp01(fromCanvasX(x) + dragOffsetX);
        stops.value.sort((a, b) => a.pos - b.pos);
        emitChange();
        redraw();
        return;
      }
      const prevHover = hoverStop, prevMid = hoverMid;
      hoverStop = stopAt(x);
      hoverMid = hoverStop ? null : midpointAt(x, y);
      if (hoverStop !== prevHover || hoverMid !== prevMid) redraw();
      if (canvas.value) canvas.value.style.cursor = hoverStop ? "grab" : hoverMid ? "ew-resize" : "crosshair";
    }
    function onUp() {
      if (draggingMid) {
        draggingMid = null;
        redraw();
        return;
      }
      if (dragging && activeStop && !moved) {
        openPickerFor(activeStop);
      }
      dragging = false;
      redraw();
    }
    function onLeave() {
      if (dragging) onUp();
      draggingMid = null;
      hoverStop = null;
      hoverMid = null;
      redraw();
    }
    function openPickerFor(stop) {
      activeStop = stop;
      const input = colorInput.value;
      if (!input) return;
      input.value = stop.color;
      input.click();
    }
    function onColorInput(e) {
      if (!activeStop) return;
      activeStop.color = normalizeHex(e.target.value);
      emitChange();
      redraw();
    }
    function reset() {
      stops.value = [{ pos: 0, color: "#000000" }, { pos: 1, color: "#ffffff" }];
      interp.value = "smooth";
      activeStop = null;
      emitChange();
      redraw();
    }
    function reverse() {
      stops.value = stops.value.map((s) => ({ pos: clamp01(1 - s.pos), color: s.color })).sort((a, b) => a.pos - b.pos);
      activeStop = null;
      emitChange();
      redraw();
    }
    function onInterpChange(mode) {
      interp.value = parseInterp(JSON.stringify({ interp: mode }));
      emitChange();
      redraw();
    }
    let debounceTimer;
    function serialise() {
      return JSON.stringify({
        stops: [...stops.value].sort((a, b) => a.pos - b.pos),
        interp: interp.value
      });
    }
    function emitChange() {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => props.onChange(serialise()), 60);
    }
    function deserialise(json) {
      try {
        const data = JSON.parse(json);
        if (Array.isArray(data.stops) && data.stops.length >= 2) {
          stops.value = data.stops.map((s) => ({
            pos: clamp01(Number(s.pos)),
            color: normalizeHex(String(s.color)),
            mid: Number.isFinite(s.mid) ? Math.min(0.95, Math.max(0.05, Number(s.mid))) : 0.5
          })).sort((a, b) => a.pos - b.pos);
          interp.value = parseInterp(json);
          redraw();
          return;
        }
      } catch {
      }
    }
    function forceResize() {
      return syncCanvasSize();
    }
    const userPresets = /* @__PURE__ */ ref([]);
    const selectedPreset = /* @__PURE__ */ ref("");
    async function loadPresets() {
      try {
        const res = await fetch("/nkd_color_ramp/presets");
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.user)) userPresets.value = data.user;
      } catch {
      }
    }
    function onPresetSelect(name) {
      selectedPreset.value = name;
      if (!name) return;
      const p2 = userPresets.value.find((x) => x.name === name);
      if (!p2) return;
      stops.value = p2.stops.map((s) => ({
        pos: clamp01(s.pos),
        color: normalizeHex(s.color),
        mid: Number.isFinite(s.mid) ? Math.min(0.95, Math.max(0.05, Number(s.mid))) : 0.5
      }));
      if (p2.interp) interp.value = parseInterp(JSON.stringify({ interp: p2.interp }));
      activeStop = null;
      emitChange();
      redraw();
    }
    async function saveCurrentAsPreset() {
      const raw = window.prompt("Preset name (1–64 chars: letters, numbers, spaces, -_().):");
      if (raw === null) return;
      const name = raw.trim();
      if (!name) return;
      if (!/^[\w \-().]{1,64}$/.test(name)) {
        window.alert("Invalid name. Use letters, numbers, spaces, or - _ ( ) .");
        return;
      }
      const exists = userPresets.value.some((p2) => p2.name.toLowerCase() === name.toLowerCase());
      if (exists && !window.confirm(`Overwrite existing preset "${name}"?`)) return;
      const payload = { name, stops: [...stops.value].sort((a, b) => a.pos - b.pos), interp: interp.value };
      try {
        const res = await fetch("/nkd_color_ramp/presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          window.alert(`Save failed: ${err.error ?? res.statusText}`);
          return;
        }
        await loadPresets();
        selectedPreset.value = name;
      } catch (e) {
        window.alert(`Save failed: ${e}`);
      }
    }
    async function deleteSelectedPreset() {
      const name = selectedPreset.value;
      if (!name) return;
      if (!window.confirm(`Delete preset "${name}"?`)) return;
      try {
        const res = await fetch(`/nkd_color_ramp/presets/${encodeURIComponent(name)}`, { method: "DELETE" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          window.alert(`Delete failed: ${err.error ?? res.statusText}`);
          return;
        }
        await loadPresets();
        selectedPreset.value = "";
      } catch (e) {
        window.alert(`Delete failed: ${e}`);
      }
    }
    function cleanup() {
      window.clearTimeout(debounceTimer);
      ro == null ? void 0 : ro.disconnect();
    }
    onMounted(() => {
      var _a;
      ctx = ((_a = canvas.value) == null ? void 0 : _a.getContext("2d")) ?? null;
      ro = new ResizeObserver(() => syncCanvasSize());
      if (canvas.value) ro.observe(canvas.value);
      syncCanvasSize();
      loadPresets();
    });
    onBeforeUnmount(cleanup);
    __expose({ serialise, deserialise, forceResize, cleanup });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "nkd-root",
        onMousedown: _cache[2] || (_cache[2] = withModifiers(() => {
        }, ["stop"])),
        onMouseup: _cache[3] || (_cache[3] = withModifiers(() => {
        }, ["stop"])),
        onMousemove: _cache[4] || (_cache[4] = withModifiers(() => {
        }, ["stop"])),
        onContextmenu: _cache[5] || (_cache[5] = withModifiers(() => {
        }, ["prevent"]))
      }, [
        createBaseVNode("canvas", {
          ref_key: "canvas",
          ref: canvas,
          class: "nkd-canvas",
          onMousedown: withModifiers(onDown, ["stop", "prevent"]),
          onMousemove: withModifiers(onMove, ["stop"]),
          onMouseup: withModifiers(onUp, ["stop"]),
          onMouseleave: withModifiers(onLeave, ["stop"])
        }, null, 544),
        createBaseVNode("div", _hoisted_1$4, [
          createBaseVNode("div", _hoisted_2$4, [
            _cache[7] || (_cache[7] = createBaseVNode("span", { class: "nkd-hint" }, "Click bar: add stop · click stop: color · Shift+click: delete · drag ◆: tension", -1)),
            _cache[8] || (_cache[8] = createBaseVNode("span", { class: "nkd-spacer" }, null, -1)),
            createBaseVNode("select", {
              class: "nkd-select nkd-select--interp",
              value: interp.value,
              title: "How colors blend between stops",
              onChange: _cache[0] || (_cache[0] = ($event) => onInterpChange($event.target.value))
            }, [..._cache[6] || (_cache[6] = [
              createBaseVNode("option", { value: "smooth" }, "Smooth", -1),
              createBaseVNode("option", { value: "bezier" }, "Bezier", -1),
              createBaseVNode("option", { value: "steps" }, "Steps", -1)
            ])], 40, _hoisted_3$4),
            createBaseVNode("button", {
              class: "nkd-btn",
              title: "Reverse the color order",
              onClick: withModifiers(reverse, ["stop"])
            }, "⇄"),
            createBaseVNode("button", {
              class: "nkd-btn",
              onClick: withModifiers(reset, ["stop"])
            }, "Reset")
          ]),
          createBaseVNode("div", _hoisted_4$3, [
            _cache[10] || (_cache[10] = createBaseVNode("span", { class: "nkd-label" }, "Preset", -1)),
            createBaseVNode("select", {
              class: "nkd-select nkd-select--preset",
              value: selectedPreset.value,
              onChange: _cache[1] || (_cache[1] = ($event) => onPresetSelect($event.target.value))
            }, [
              _cache[9] || (_cache[9] = createBaseVNode("option", { value: "" }, "— Select —", -1)),
              (openBlock(true), createElementBlock(Fragment, null, renderList(userPresets.value, (p2) => {
                return openBlock(), createElementBlock("option", {
                  key: p2.name,
                  value: p2.name
                }, toDisplayString(p2.name), 9, _hoisted_6);
              }), 128))
            ], 40, _hoisted_5),
            createBaseVNode("button", {
              class: "nkd-btn nkd-btn--preset",
              onClick: withModifiers(saveCurrentAsPreset, ["stop"])
            }, "Save"),
            createBaseVNode("button", {
              class: "nkd-btn nkd-btn--preset",
              disabled: !selectedPreset.value,
              onClick: withModifiers(deleteSelectedPreset, ["stop"])
            }, "Delete", 8, _hoisted_7)
          ])
        ]),
        createBaseVNode("input", {
          ref_key: "colorInput",
          ref: colorInput,
          type: "color",
          class: "nkd-color-input",
          onInput: onColorInput
        }, null, 544)
      ], 32);
    };
  }
});
const ColorRampWidget = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-3d741d05"]]);
const _hoisted_1$3 = { class: "nkd-bar" };
const _hoisted_2$3 = { class: "nkd-row nkd-row--controls" };
const _hoisted_3$3 = { class: "nkd-hint" };
const BOX_W = 320, BOX_H = 210, PAD = 14;
const HIT_R = 11;
const MIN_RENDER_SCALE$3 = 2;
const MID_MIN = 0.05, MID_MAX = 0.95;
const CANVAS_INSET = 5;
const DIAMOND_RES = 160;
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "GradientPreviewWidget",
  props: {
    onChange: { type: Function },
    getRamp: { type: Function },
    getShape: { type: Function },
    getSize: { type: Function },
    getSourceImg: { type: Function },
    getBlendMode: { type: Function },
    getOpacity: { type: Function }
  },
  setup(__props, { expose: __expose }) {
    const props = __props;
    const BLEND_OPS = {
      "none": "source-over",
      "normal": "source-over",
      "multiply": "multiply",
      "screen": "screen",
      "overlay": "overlay",
      "soft light": "soft-light",
      "hard light": "hard-light",
      "add": "lighter",
      "difference": "difference",
      "darken": "darken",
      "lighten": "lighten"
    };
    const SHAPE_DEFAULTS = {
      Linear: { p0: [0, 0.5], p1: [1, 0.5] },
      Radial: { p0: [0.5, 0.5], p1: [1, 0.5] },
      Angular: { p0: [0.5, 0.5], p1: [1, 0.5] },
      Diamond: { p0: [0.5, 0.5], p1: [1, 1] }
      // diagonal — a horizontal drag degenerates to a sliver
    };
    const HANDLE_LABELS = {
      Linear: ["Start", "End"],
      Radial: ["Center", "Edge"],
      Angular: ["Center", "Angle"],
      Diamond: ["Center", "Edge"]
    };
    const canvas = /* @__PURE__ */ ref(null);
    let ctx = null;
    let ro = null;
    let dpr = window.devicePixelRatio || 1;
    const p0 = /* @__PURE__ */ ref([0, 0.5]);
    const p1 = /* @__PURE__ */ ref([1, 0.5]);
    const mid = /* @__PURE__ */ ref(0.5);
    const hintText = /* @__PURE__ */ ref("Drag the handles to set direction");
    let lastShape = null;
    let dragging = null;
    let hover = null;
    let fitX = PAD, fitY = PAD, fitW = BOX_W - PAD * 2, fitH = BOX_H - PAD * 2;
    function toPx(pt) {
      return [fitX + pt[0] * fitW, fitY + pt[1] * fitH];
    }
    function fromPx(x, y) {
      const cx = Math.max(CANVAS_INSET, Math.min(BOX_W - CANVAS_INSET, x));
      const cy = Math.max(CANVAS_INSET, Math.min(BOX_H - CANVAS_INSET, y));
      return [(cx - fitX) / fitW, (cy - fitY) / fitH];
    }
    function midPx() {
      const a = toPx(p0.value), b = toPx(p1.value);
      return [a[0] + (b[0] - a[0]) * mid.value, a[1] + (b[1] - a[1]) * mid.value];
    }
    function warpExp() {
      const m = Math.min(MID_MAX, Math.max(MID_MIN, mid.value));
      return Math.log(0.5) / Math.log(m);
    }
    function eventToLogical(e) {
      const rect = canvas.value.getBoundingClientRect();
      return [(e.clientX - rect.left) * (BOX_W / rect.width), (e.clientY - rect.top) * (BOX_H / rect.height)];
    }
    function parseRamp() {
      try {
        const data = JSON.parse(props.getRamp());
        if (Array.isArray(data.stops) && data.stops.length >= 2) {
          return [...data.stops].sort((a, b) => a.pos - b.pos);
        }
      } catch {
      }
      return [{ pos: 0, color: "#000000" }, { pos: 1, color: "#ffffff" }];
    }
    function syncCanvasSize() {
      const c = canvas.value;
      if (!c) return false;
      const rect = c.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const sx = Math.max(rect.width / BOX_W * dpr, MIN_RENDER_SCALE$3);
      const sy = Math.max(rect.height / BOX_H * dpr, MIN_RENDER_SCALE$3);
      const newW = Math.round(BOX_W * sx), newH = Math.round(BOX_H * sy);
      if (c.width !== newW || c.height !== newH) {
        c.width = newW;
        c.height = newH;
        ctx = c.getContext("2d");
        ctx == null ? void 0 : ctx.setTransform(sx, 0, 0, sy, 0, 0);
      }
      redraw();
      return true;
    }
    function computeFitRect() {
      const [w, h] = props.getSize();
      const aspect = w > 0 && h > 0 ? w / h : 1;
      const maxW = BOX_W - PAD * 2, maxH = BOX_H - PAD * 2;
      let fw = maxW, fh = maxW / aspect;
      if (fh > maxH) {
        fh = maxH;
        fw = maxH * aspect;
      }
      fitX = PAD + (maxW - fw) / 2;
      fitY = PAD + (maxH - fh) / 2;
      fitW = fw;
      fitH = fh;
    }
    function warpStop(pos) {
      const g = Math.pow(Math.max(0, Math.min(1, pos)), 1 / warpExp());
      return Math.max(0, Math.min(1, g));
    }
    function buildFill(shape, stops, a, b) {
      if (!ctx) return null;
      if (shape === "Diamond") return null;
      const expanded = expandStops(stops, parseInterp(props.getRamp()), warpStop);
      const add = (g) => {
        expanded.forEach((s) => g.addColorStop(Math.max(0, Math.min(1, s.pos)), s.color));
        return g;
      };
      if (shape === "Radial") {
        const r = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 1);
        return add(ctx.createRadialGradient(a[0], a[1], 0, a[0], a[1], r));
      }
      if (shape === "Angular" && "createConicGradient" in ctx) {
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        return add(ctx.createConicGradient(angle, a[0], a[1]));
      }
      return add(ctx.createLinearGradient(a[0], a[1], b[0], b[1]));
    }
    let sentCanvas = null;
    function setSentImage(rgb, w, h) {
      const c = sentCanvas ?? document.createElement("canvas");
      c.width = w;
      c.height = h;
      const cx = c.getContext("2d");
      const img = cx.createImageData(w, h);
      for (let p2 = 0, i = 0, j = 0; p2 < w * h; p2++, i += 4, j += 3) {
        img.data[i] = rgb[j];
        img.data[i + 1] = rgb[j + 1];
        img.data[i + 2] = rgb[j + 2];
        img.data[i + 3] = 255;
      }
      cx.putImageData(img, 0, 0);
      sentCanvas = c;
      redraw();
    }
    function sourceCanvas() {
      var _a;
      const img = (_a = props.getSourceImg) == null ? void 0 : _a.call(props);
      if (img && img.complete && img.naturalWidth > 0) return img;
      return sentCanvas;
    }
    let rampLut = null;
    let lutKey = "";
    function rampLutFor(stops) {
      const key = props.getRamp();
      if (key !== lutKey) {
        rampLut = buildRampLut(stops, parseInterp(key));
        lutKey = key;
      }
      return rampLut;
    }
    let diamondCanvas = null;
    let diamondCtx = null;
    let diamondImg = null;
    function drawDiamond(stops, a, b) {
      if (!ctx) return;
      const aspect = fitW / fitH;
      const dw = DIAMOND_RES, dh = Math.max(1, Math.round(DIAMOND_RES / aspect));
      if (!diamondCanvas || diamondCanvas.width !== dw || diamondCanvas.height !== dh) {
        if (!diamondCanvas) diamondCanvas = document.createElement("canvas");
        diamondCanvas.width = dw;
        diamondCanvas.height = dh;
        diamondCtx = diamondCanvas.getContext("2d");
        diamondImg = diamondCtx.createImageData(dw, dh);
      }
      const lut = rampLutFor(stops);
      const exp = warpExp();
      const data = diamondImg.data;
      const p0n = [(a[0] - fitX) / fitW, (a[1] - fitY) / fitH];
      const p1n = [(b[0] - fitX) / fitW, (b[1] - fitY) / fitH];
      const ex = Math.max(Math.abs(p1n[0] - p0n[0]), 1e-4);
      const ey = Math.max(Math.abs(p1n[1] - p0n[1]), 1e-4);
      for (let py = 0; py < dh; py++) {
        const ny = (py + 0.5) / dh;
        for (let px = 0; px < dw; px++) {
          const nx = (px + 0.5) / dw;
          let t = Math.min(1, 0.5 * (Math.abs(nx - p0n[0]) / ex + Math.abs(ny - p0n[1]) / ey));
          t = Math.pow(t, exp);
          let idx = t * 255 | 0;
          if (idx > 255) idx = 255;
          const li = idx * 3;
          const i = (py * dw + px) * 4;
          data[i] = lut[li];
          data[i + 1] = lut[li + 1];
          data[i + 2] = lut[li + 2];
          data[i + 3] = 255;
        }
      }
      diamondCtx.putImageData(diamondImg, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(diamondCanvas, fitX, fitY, fitW, fitH);
    }
    function redraw() {
      var _a, _b;
      if (!ctx) return;
      computeFitRect();
      ctx.clearRect(0, 0, BOX_W, BOX_H);
      ctx.fillStyle = "#111318";
      ctx.fillRect(0, 0, BOX_W, BOX_H);
      const shape = props.getShape() || "Linear";
      const stops = parseRamp();
      const a = toPx(p0.value), b = toPx(p1.value);
      const base = sourceCanvas();
      if (base) ctx.drawImage(base, fitX, fitY, fitW, fitH);
      const mode = ((_a = props.getBlendMode) == null ? void 0 : _a.call(props)) ?? "none";
      const composite = !!base && mode !== "none";
      if (composite) {
        ctx.globalCompositeOperation = BLEND_OPS[mode] ?? "source-over";
        ctx.globalAlpha = Math.min(1, Math.max(0, ((_b = props.getOpacity) == null ? void 0 : _b.call(props)) ?? 1));
      }
      const fill = buildFill(shape, stops, a, b);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(fitX, fitY, fitW, fitH);
      } else {
        drawDiamond(stops, a, b);
      }
      if (composite) {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 0.75;
      ctx.strokeRect(fitX + 0.5, fitY + 0.5, fitW - 1, fitH - 1);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      const labels = HANDLE_LABELS[shape] ?? HANDLE_LABELS.Linear;
      const m = midPx();
      drawMidHandle(m);
      drawHandle(a, "p0", labels[0]);
      drawHandle(b, "p1", labels[1]);
      const tipWhich = dragging ?? hover;
      if (tipWhich === "mid") {
        drawTooltip(m, `Mid  ${Math.round(mid.value * 100)}%`);
      } else if (tipWhich) {
        const pos = tipWhich === "p0" ? p0.value : p1.value;
        const label = tipWhich === "p0" ? labels[0] : labels[1];
        drawTooltip(tipWhich === "p0" ? a : b, `${label}  ${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}`);
      }
    }
    function drawMidHandle(pos) {
      if (!ctx) return;
      const isDrag = dragging === "mid";
      const isHover = hover === "mid";
      const r = isDrag ? 6 : isHover ? 5.5 : 4;
      ctx.save();
      ctx.translate(pos[0], pos[1]);
      ctx.rotate(Math.PI / 4);
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      ctx.beginPath();
      ctx.rect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = "#e8eef8";
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(pos[0], pos[1]);
      ctx.rotate(Math.PI / 4);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
    function drawTooltip(at, text) {
      if (!ctx) return;
      ctx.font = "10px monospace";
      const textW = ctx.measureText(text).width;
      const padX = 6, h = 16;
      const w = textW + padX * 2;
      let tx = at[0] - w / 2;
      tx = Math.max(2, Math.min(BOX_W - w - 2, tx));
      let ty = at[1] - 12 - h;
      if (ty < 2) ty = at[1] + 12;
      ctx.fillStyle = "rgba(15,18,26,0.88)";
      ctx.strokeStyle = dragging ? "rgba(255,107,107,0.6)" : "rgba(74,180,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx + 4, ty);
      ctx.arcTo(tx + w, ty, tx + w, ty + h, 4);
      ctx.arcTo(tx + w, ty + h, tx, ty + h, 4);
      ctx.arcTo(tx, ty + h, tx, ty, 4);
      ctx.arcTo(tx, ty, tx + w, ty, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e8eef8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, tx + w / 2, ty + h / 2 + 0.5);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    function drawHandle(pos, which, label) {
      if (!ctx) return;
      const isDrag = dragging === which;
      const isHover = hover === which;
      const r = isDrag ? 7 : isHover ? 6 : 4.5;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1;
      ctx.beginPath();
      ctx.arc(pos[0], pos[1], r, 0, Math.PI * 2);
      ctx.fillStyle = which === "p0" ? "#4ab4ff" : "#ffd166";
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.stroke();
      ctx.font = "9px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.textAlign = pos[0] > BOX_W - 40 ? "right" : "left";
      ctx.fillText(label, pos[0] + (ctx.textAlign === "right" ? -r - 4 : r + 4), pos[1] + 3);
    }
    function hitTest(x, y) {
      const a = toPx(p0.value), b = toPx(p1.value);
      const da = Math.hypot(a[0] - x, a[1] - y);
      const db = Math.hypot(b[0] - x, b[1] - y);
      if (da <= HIT_R && da <= db) return "p0";
      if (db <= HIT_R) return "p1";
      const m = midPx();
      if (Math.hypot(m[0] - x, m[1] - y) <= HIT_R) return "mid";
      return null;
    }
    function onDown(e) {
      const [x, y] = eventToLogical(e);
      dragging = hitTest(x, y);
      redraw();
    }
    function onMove(e) {
      const [x, y] = eventToLogical(e);
      if (dragging === "mid") {
        const a = toPx(p0.value), b = toPx(p1.value);
        const abx = b[0] - a[0], aby = b[1] - a[1];
        const len2 = abx * abx + aby * aby || 1;
        const f = ((x - a[0]) * abx + (y - a[1]) * aby) / len2;
        mid.value = Math.min(MID_MAX, Math.max(MID_MIN, f));
        emitChange();
        redraw();
        return;
      }
      if (dragging) {
        const target = dragging === "p0" ? p0 : p1;
        target.value = fromPx(x, y);
        emitChange();
        redraw();
        return;
      }
      const prevHover = hover;
      hover = hitTest(x, y);
      if (hover !== prevHover) redraw();
      if (canvas.value) canvas.value.style.cursor = hover ? "grab" : "default";
    }
    function onUp() {
      dragging = null;
      redraw();
    }
    function onDblClick(e) {
      const [x, y] = eventToLogical(e);
      const which = hitTest(x, y);
      if (!which) return;
      if (which === "mid") {
        mid.value = 0.5;
      } else {
        const def2 = SHAPE_DEFAULTS[props.getShape() || "Linear"] ?? SHAPE_DEFAULTS.Linear;
        (which === "p0" ? p0 : p1).value = [...def2[which]];
      }
      dragging = null;
      emitChange();
      redraw();
    }
    function onLeave() {
      dragging = null;
      hover = null;
      redraw();
    }
    function resetHandles() {
      const shape = props.getShape() || "Linear";
      const def2 = SHAPE_DEFAULTS[shape] ?? SHAPE_DEFAULTS.Linear;
      p0.value = [...def2.p0];
      p1.value = [...def2.p1];
      mid.value = 0.5;
      emitChange();
      redraw();
    }
    let debounceTimer;
    function emitChange() {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        props.onChange(serialise());
      }, 40);
    }
    function serialise() {
      return JSON.stringify({ p0: p0.value, p1: p1.value, mid: mid.value });
    }
    function deserialise(json) {
      try {
        const data = JSON.parse(json);
        if (Array.isArray(data.p0) && Array.isArray(data.p1)) {
          p0.value = [Number(data.p0[0]), Number(data.p0[1])];
          p1.value = [Number(data.p1[0]), Number(data.p1[1])];
          mid.value = Number.isFinite(data.mid) ? Number(data.mid) : 0.5;
          lastShape = props.getShape();
          redraw();
          return;
        }
      } catch {
      }
      lastShape = props.getShape();
    }
    function refreshExternal() {
      var _a, _b, _c;
      const shape = props.getShape();
      if (lastShape !== null && shape !== lastShape) {
        const def2 = SHAPE_DEFAULTS[shape] ?? SHAPE_DEFAULTS.Linear;
        p0.value = [...def2.p0];
        p1.value = [...def2.p1];
        mid.value = 0.5;
        emitChange();
      }
      lastShape = shape;
      hintText.value = `Drag ${(HANDLE_LABELS[shape] ?? HANDLE_LABELS.Linear).join(" / ")}`;
      const sz = props.getSize();
      const src = (_a = props.getSourceImg) == null ? void 0 : _a.call(props);
      const sig = `${shape}|${props.getRamp()}|${sz[0]}x${sz[1]}|${(_b = props.getBlendMode) == null ? void 0 : _b.call(props)}|${(_c = props.getOpacity) == null ? void 0 : _c.call(props)}|${(src == null ? void 0 : src.currentSrc) ?? (src == null ? void 0 : src.src) ?? ""}`;
      if (sig !== lastExtSig) {
        lastExtSig = sig;
        redraw();
      }
    }
    let lastExtSig = "";
    function forceResize() {
      return syncCanvasSize();
    }
    function cleanup() {
      window.clearTimeout(debounceTimer);
      ro == null ? void 0 : ro.disconnect();
    }
    onMounted(() => {
      var _a;
      ctx = ((_a = canvas.value) == null ? void 0 : _a.getContext("2d")) ?? null;
      ro = new ResizeObserver(() => syncCanvasSize());
      if (canvas.value) ro.observe(canvas.value);
      syncCanvasSize();
    });
    onBeforeUnmount(cleanup);
    __expose({ serialise, deserialise, refreshExternal, forceResize, cleanup, setSentImage });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "nkd-root",
        onMousedown: _cache[0] || (_cache[0] = withModifiers(() => {
        }, ["stop"])),
        onMouseup: _cache[1] || (_cache[1] = withModifiers(() => {
        }, ["stop"])),
        onMousemove: _cache[2] || (_cache[2] = withModifiers(() => {
        }, ["stop"])),
        onContextmenu: _cache[3] || (_cache[3] = withModifiers(() => {
        }, ["prevent"]))
      }, [
        createBaseVNode("canvas", {
          ref_key: "canvas",
          ref: canvas,
          class: "nkd-canvas",
          onMousedown: withModifiers(onDown, ["stop", "prevent"]),
          onMousemove: withModifiers(onMove, ["stop"]),
          onMouseup: withModifiers(onUp, ["stop"]),
          onMouseleave: withModifiers(onLeave, ["stop"]),
          onDblclick: withModifiers(onDblClick, ["stop", "prevent"])
        }, null, 544),
        createBaseVNode("div", _hoisted_1$3, [
          createBaseVNode("div", _hoisted_2$3, [
            createBaseVNode("span", _hoisted_3$3, toDisplayString(hintText.value), 1),
            _cache[4] || (_cache[4] = createBaseVNode("span", { class: "nkd-spacer" }, null, -1)),
            createBaseVNode("button", {
              class: "nkd-btn",
              onClick: withModifiers(resetHandles, ["stop"])
            }, "Reset")
          ])
        ])
      ], 32);
    };
  }
});
const GradientPreviewWidget = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-8ab4835f"]]);
const _hoisted_1$2 = { class: "nkd-root" };
const _hoisted_2$2 = { class: "nkd-bar" };
const _hoisted_3$2 = { class: "nkd-row nkd-row--controls" };
const _hoisted_4$2 = { class: "nkd-hint" };
const MIN_RENDER_SCALE$2 = 2;
const CACHE_RES$1 = 640;
const DEFAULT_ASPECT$1 = "16 / 10";
const LUMA_R$1 = 0.2126, LUMA_G$1 = 0.7152, LUMA_B$1 = 0.0722;
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "GradientMapPreviewWidget",
  props: {
    getRamp: { type: Function },
    getInvert: { type: Function },
    getStrength: { type: Function },
    getSourceImg: { type: Function },
    getMaskImg: { type: Function }
  },
  setup(__props, { expose: __expose }) {
    const props = __props;
    const canvas = /* @__PURE__ */ ref(null);
    let ctx = null;
    let ro = null;
    let dpr = window.devicePixelRatio || 1;
    let logicalW = 0, logicalH = 0;
    const hintText = /* @__PURE__ */ ref("Connect an image");
    const canvasAspect = /* @__PURE__ */ ref(DEFAULT_ASPECT$1);
    let cacheW = 0, cacheH = 0;
    let cacheRgb = null;
    let cacheLuma = null;
    let lastSrc = null;
    let offscreen = null;
    let cacheMask = null;
    let lastMaskSrc = null;
    let maskOffscreen = null;
    let outCanvas = null;
    let outCtx = null;
    let outImg = null;
    let rampLut = null;
    let lutKey = "";
    let lastSig = "";
    function parseRamp() {
      try {
        const data = JSON.parse(props.getRamp());
        if (Array.isArray(data.stops) && data.stops.length >= 2) {
          return [...data.stops].sort((a, b) => a.pos - b.pos);
        }
      } catch {
      }
      return [{ pos: 0, color: "#000000" }, { pos: 1, color: "#ffffff" }];
    }
    function decodeSource(img) {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      if (!iw || !ih) return;
      const scale = CACHE_RES$1 / Math.max(iw, ih);
      cacheW = Math.max(1, Math.round(iw * scale));
      cacheH = Math.max(1, Math.round(ih * scale));
      if (!offscreen) offscreen = document.createElement("canvas");
      offscreen.width = cacheW;
      offscreen.height = cacheH;
      const octx = offscreen.getContext("2d");
      octx.drawImage(img, 0, 0, cacheW, cacheH);
      const data = octx.getImageData(0, 0, cacheW, cacheH).data;
      cacheRgb = data;
      cacheLuma = new Float32Array(cacheW * cacheH);
      for (let i = 0, p2 = 0; i < data.length; i += 4, p2++) {
        cacheLuma[p2] = (data[i] * LUMA_R$1 + data[i + 1] * LUMA_G$1 + data[i + 2] * LUMA_B$1) / 255;
      }
    }
    function decodeMask(img) {
      cacheMask = null;
      if (!cacheW || !cacheH) return;
      if (!maskOffscreen) maskOffscreen = document.createElement("canvas");
      maskOffscreen.width = cacheW;
      maskOffscreen.height = cacheH;
      const mctx = maskOffscreen.getContext("2d");
      mctx.clearRect(0, 0, cacheW, cacheH);
      mctx.drawImage(img, 0, 0, cacheW, cacheH);
      const data = mctx.getImageData(0, 0, cacheW, cacheH).data;
      let alphaVaries = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) {
          alphaVaries = true;
          break;
        }
      }
      if (!alphaVaries) return;
      const m = new Float32Array(cacheW * cacheH);
      for (let i = 0, p2 = 0; i < data.length; i += 4, p2++) m[p2] = 1 - data[i + 3] / 255;
      cacheMask = m;
    }
    function setSentImage(rgb, w, h) {
      const n = w * h;
      const data = new Uint8ClampedArray(n * 4);
      const luma = new Float32Array(n);
      for (let p2 = 0, i = 0, j = 0; p2 < n; p2++, i += 4, j += 3) {
        data[i] = rgb[j];
        data[i + 1] = rgb[j + 1];
        data[i + 2] = rgb[j + 2];
        data[i + 3] = 255;
        luma[p2] = (rgb[j] * LUMA_R$1 + rgb[j + 1] * LUMA_G$1 + rgb[j + 2] * LUMA_B$1) / 255;
      }
      cacheRgb = data;
      cacheLuma = luma;
      cacheMask = null;
      cacheW = w;
      cacheH = h;
      lastSrc = "__sent__";
      lastMaskSrc = null;
      hintText.value = "Live preview";
      const wantAspect = `${w} / ${h}`;
      if (wantAspect !== canvasAspect.value) canvasAspect.value = wantAspect;
      lastSig = "__force__";
      redraw();
    }
    function syncCanvasSize() {
      const c = canvas.value;
      if (!c) return false;
      const rect = c.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      logicalW = rect.width;
      logicalH = rect.height;
      const s = Math.max(dpr, MIN_RENDER_SCALE$2);
      const newW = Math.round(rect.width * s), newH = Math.round(rect.height * s);
      if (c.width !== newW || c.height !== newH) {
        c.width = newW;
        c.height = newH;
        ctx = c.getContext("2d");
      }
      ctx == null ? void 0 : ctx.setTransform(newW / rect.width, 0, 0, newH / rect.height, 0, 0);
      redraw();
      return true;
    }
    function redraw() {
      if (!ctx || logicalW < 1) return;
      ctx.clearRect(0, 0, logicalW, logicalH);
      ctx.fillStyle = "#111318";
      ctx.fillRect(0, 0, logicalW, logicalH);
      if (!cacheRgb || !cacheLuma) {
        ctx.font = "11px Inter, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.32)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Connect an image", logicalW / 2, logicalH / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        return;
      }
      const rampStr = props.getRamp();
      const invert = props.getInvert();
      const strength = Math.max(0, Math.min(1, props.getStrength()));
      if (rampStr !== lutKey) {
        rampLut = buildRampLut(parseRamp(), parseInterp(rampStr));
        lutKey = rampStr;
      }
      const lut = rampLut;
      if (!outCanvas || outCanvas.width !== cacheW || outCanvas.height !== cacheH) {
        outCanvas = document.createElement("canvas");
        outCanvas.width = cacheW;
        outCanvas.height = cacheH;
        outCtx = outCanvas.getContext("2d");
        outImg = outCtx.createImageData(cacheW, cacheH);
      }
      const data = outImg.data;
      for (let p2 = 0, i = 0; p2 < cacheW * cacheH; p2++, i += 4) {
        let idx = cacheLuma[p2] * 255 | 0;
        if (idx < 0) idx = 0;
        else if (idx > 255) idx = 255;
        if (invert) idx = 255 - idx;
        const li = idx * 3;
        const sf = cacheMask ? strength * cacheMask[p2] : strength;
        const inv = 1 - sf;
        data[i] = cacheRgb[i] * inv + lut[li] * sf;
        data[i + 1] = cacheRgb[i + 1] * inv + lut[li + 1] * sf;
        data[i + 2] = cacheRgb[i + 2] * inv + lut[li + 2] * sf;
        data[i + 3] = 255;
      }
      outCtx.putImageData(outImg, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(outCanvas, 0, 0, logicalW, logicalH);
    }
    function refreshExternal() {
      const img = props.getSourceImg();
      const src = (img == null ? void 0 : img.currentSrc) || (img == null ? void 0 : img.src) || null;
      let srcChanged = false;
      if (img && img.complete && src && src !== lastSrc) {
        decodeSource(img);
        lastSrc = src;
        srcChanged = true;
      } else if (!img && lastSrc !== null && lastSrc !== "__sent__") {
        cacheRgb = null;
        cacheLuma = null;
        cacheMask = null;
        lastSrc = null;
        lastMaskSrc = null;
      }
      const mimg = props.getMaskImg();
      const msrc = (mimg == null ? void 0 : mimg.currentSrc) || (mimg == null ? void 0 : mimg.src) || null;
      if (mimg && mimg.complete && cacheRgb && (msrc !== lastMaskSrc || srcChanged)) {
        decodeMask(mimg);
        lastMaskSrc = msrc;
      } else if (!mimg && lastMaskSrc !== null) {
        cacheMask = null;
        lastMaskSrc = null;
      }
      hintText.value = cacheRgb ? cacheMask ? "Live preview · masked" : "Live preview" : "Connect an image";
      const wantAspect = cacheRgb ? `${cacheW} / ${cacheH}` : DEFAULT_ASPECT$1;
      if (wantAspect !== canvasAspect.value) {
        canvasAspect.value = wantAspect;
        return;
      }
      const sig = `${lastSrc}|${lastMaskSrc}|${cacheW}x${cacheH}|${props.getRamp()}|${props.getInvert()}|${props.getStrength()}`;
      if (sig !== lastSig) {
        lastSig = sig;
        redraw();
      }
    }
    function forceResize() {
      return syncCanvasSize();
    }
    function cleanup() {
      ro == null ? void 0 : ro.disconnect();
    }
    onMounted(() => {
      var _a;
      ctx = ((_a = canvas.value) == null ? void 0 : _a.getContext("2d")) ?? null;
      ro = new ResizeObserver(() => syncCanvasSize());
      if (canvas.value) ro.observe(canvas.value);
      syncCanvasSize();
    });
    onBeforeUnmount(cleanup);
    __expose({ refreshExternal, forceResize, cleanup, setSentImage });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        createBaseVNode("canvas", {
          ref_key: "canvas",
          ref: canvas,
          class: "nkd-canvas",
          style: normalizeStyle({ aspectRatio: canvasAspect.value })
        }, null, 4),
        createBaseVNode("div", _hoisted_2$2, [
          createBaseVNode("div", _hoisted_3$2, [
            createBaseVNode("span", _hoisted_4$2, toDisplayString(hintText.value), 1)
          ])
        ])
      ]);
    };
  }
});
const GradientMapPreviewWidget = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-aa41997d"]]);
const _hoisted_1$1 = { class: "nkd-root" };
const _hoisted_2$1 = { class: "nkd-bar" };
const _hoisted_3$1 = { class: "nkd-row nkd-row--controls" };
const _hoisted_4$1 = { class: "nkd-hint" };
const PREVIEW_MAX = 256;
const MIN_RENDER_SCALE$1 = 2;
const LOOP_RADIUS = 1.5;
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "NoisePreviewWidget",
  props: {
    getParams: { type: Function }
  },
  setup(__props, { expose: __expose }) {
    const props = __props;
    const canvas = /* @__PURE__ */ ref(null);
    let ctx = null;
    let ro = null;
    const dpr = window.devicePixelRatio || 1;
    let logicalW = 0, logicalH = 0;
    const hint = /* @__PURE__ */ ref("Live preview");
    const aspect = /* @__PURE__ */ ref("1 / 1");
    let lastSig = "";
    function h32(x) {
      x = x >>> 0;
      x ^= x >>> 16;
      x = Math.imul(x, 2146121005) >>> 0;
      x ^= x >>> 15;
      x = Math.imul(x, 2221713035) >>> 0;
      x ^= x >>> 16;
      return x >>> 0;
    }
    function vnoise(c, seed) {
      const d = c.length;
      const fl = [], u = [];
      for (let k = 0; k < d; k++) {
        const f0 = Math.floor(c[k]);
        fl[k] = f0;
        const fr = c[k] - f0;
        u[k] = fr * fr * fr * (fr * (fr * 6 - 15) + 10);
      }
      let total = 0;
      for (let corner = 0; corner < 1 << d; corner++) {
        let w = 1, h = seed >>> 0;
        for (let k = 0; k < d; k++) {
          const bit = corner >> k & 1;
          h = h32(h + fl[k] + bit);
          w *= bit ? u[k] : 1 - u[k];
        }
        total += w * (h / 4294967296);
      }
      return total;
    }
    function fbm(gx, gy, tc, p2, seedLow) {
      let val = 0, amp = 1, freq = 1, norm = 0;
      const detail = Math.max(1, Math.round(p2.detail));
      for (let o = 0; o < detail; o++) {
        let cx = gx * freq, cy = gy * freq;
        const t = tc.map((v) => v * freq);
        if (p2.distortion > 0) {
          const wx = vnoise([cx + 17.3, cy + 5.1, ...t], (seedLow ^ 2654435761) >>> 0);
          const wy = vnoise([cx + 3.7, cy + 19.2, ...t], (seedLow ^ 2246822519) >>> 0);
          cx += (wx - 0.5) * 2 * p2.distortion;
          cy += (wy - 0.5) * 2 * p2.distortion;
        }
        val += amp * vnoise([cx, cy, ...t], seedLow + o * 1013 >>> 0);
        norm += amp;
        amp *= p2.roughness;
        freq *= p2.lacunarity;
      }
      return val / Math.max(norm, 1e-6);
    }
    function syncCanvasSize() {
      const c = canvas.value;
      if (!c) return false;
      const rect = c.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      logicalW = rect.width;
      logicalH = rect.height;
      const s = Math.max(dpr, MIN_RENDER_SCALE$1);
      const nw = Math.round(rect.width * s), nh = Math.round(rect.height * s);
      if (c.width !== nw || c.height !== nh) {
        c.width = nw;
        c.height = nh;
        ctx = c.getContext("2d");
      }
      ctx == null ? void 0 : ctx.setTransform(nw / rect.width, 0, 0, nh / rect.height, 0, 0);
      redraw();
      return true;
    }
    let offscreen = null;
    function redraw() {
      if (!ctx || logicalW < 1) return;
      const p2 = props.getParams();
      const W = Math.max(1, p2.width), H = Math.max(1, p2.height);
      const aspectN = W / H;
      const pw = aspectN >= 1 ? PREVIEW_MAX : Math.max(1, Math.round(PREVIEW_MAX * aspectN));
      const ph = aspectN >= 1 ? Math.max(1, Math.round(PREVIEW_MAX / aspectN)) : PREVIEW_MAX;
      const evo = Math.max(0, p2.evolution) / 100;
      let tc = [];
      if (p2.loop && evo > 0) tc = [evo * LOOP_RADIUS, 0];
      else if (evo > 0) tc = [0];
      const seedLow = (p2.seed % 4294967296 + 4294967296) % 4294967296;
      if (!offscreen || offscreen.width !== pw || offscreen.height !== ph) {
        offscreen = document.createElement("canvas");
        offscreen.width = pw;
        offscreen.height = ph;
      }
      const octx = offscreen.getContext("2d");
      const img = octx.createImageData(pw, ph);
      const data = img.data;
      for (let j = 0; j < ph; j++) {
        const gy = j / ph * p2.scale + p2.offset_y;
        for (let i = 0; i < pw; i++) {
          const gx = i / pw * p2.scale * aspectN + p2.offset_x;
          let v = fbm(gx, gy, tc, p2, seedLow);
          v = (v - 0.5) * p2.contrast + 0.5 + p2.brightness;
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          const px = (j * pw + i) * 4, g = v * 255 | 0;
          data[px] = g;
          data[px + 1] = g;
          data[px + 2] = g;
          data[px + 3] = 255;
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen, 0, 0, logicalW, logicalH);
    }
    function refreshExternal() {
      const p2 = props.getParams();
      const a = `${Math.max(1, p2.width)} / ${Math.max(1, p2.height)}`;
      if (a !== aspect.value) {
        aspect.value = a;
        return;
      }
      const sig = JSON.stringify(p2);
      if (sig !== lastSig) {
        lastSig = sig;
        redraw();
      }
    }
    function forceResize() {
      return syncCanvasSize();
    }
    function cleanup() {
      ro == null ? void 0 : ro.disconnect();
    }
    onMounted(() => {
      var _a;
      ctx = ((_a = canvas.value) == null ? void 0 : _a.getContext("2d")) ?? null;
      ro = new ResizeObserver(() => syncCanvasSize());
      if (canvas.value) ro.observe(canvas.value);
      syncCanvasSize();
    });
    onBeforeUnmount(cleanup);
    __expose({ refreshExternal, forceResize, cleanup });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("canvas", {
          ref_key: "canvas",
          ref: canvas,
          class: "nkd-canvas",
          style: normalizeStyle({ aspectRatio: aspect.value })
        }, null, 4),
        createBaseVNode("div", _hoisted_2$1, [
          createBaseVNode("div", _hoisted_3$1, [
            createBaseVNode("span", _hoisted_4$1, toDisplayString(hint.value), 1)
          ])
        ])
      ]);
    };
  }
});
const NoisePreviewWidget = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-773b27a5"]]);
const EPS = 1e-6;
const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;
function srgbToLinear(v) {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v) {
  if (v <= 0) return 0;
  return v <= 31308e-7 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}
function boxMean(src, w, h, r) {
  if (r < 1) return src;
  const k = 2 * r + 1;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[row + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / k;
      const add = row + Math.min(w - 1, x + r + 1);
      const sub = row + Math.min(w - 1, Math.max(0, x - r));
      acc += src[add] - src[sub];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / k;
      const add = Math.min(h - 1, y + r + 1) * w + x;
      const sub = Math.min(h - 1, Math.max(0, y - r)) * w + x;
      acc += tmp[add] - tmp[sub];
    }
  }
  return out;
}
function gaussian(src, w, h, r) {
  if (r < 1) return src;
  const sigma = Math.max(r / 2, 0.5);
  const k = 2 * r + 1;
  const ker = new Float32Array(k);
  let sum = 0;
  for (let i = 0; i < k; i++) {
    const t = i - r;
    ker[i] = Math.exp(-(t * t) / (2 * sigma * sigma));
    sum += ker[i];
  }
  for (let i = 0; i < k; i++) ker[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += ker[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))];
    tmp[y * w + x] = acc;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += ker[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
    out[y * w + x] = acc;
  }
  return out;
}
function guided(src, guide, w, h, r, eps) {
  const n = w * h;
  const meanG = boxMean(guide, w, h, r);
  const meanX = boxMean(src, w, h, r);
  const gg = new Float32Array(n), gx = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    gg[i] = guide[i] * guide[i];
    gx[i] = guide[i] * src[i];
  }
  const corrGG = boxMean(gg, w, h, r);
  const corrGX = boxMean(gx, w, h, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varG = corrGG[i] - meanG[i] * meanG[i];
    const covGX = corrGX[i] - meanG[i] * meanX[i];
    a[i] = covGX / (varG + eps);
    b[i] = meanX[i] - a[i] * meanG[i];
  }
  const ma = boxMean(a, w, h, r), mb = boxMean(b, w, h, r);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = ma[i] * guide[i] + mb[i];
  return out;
}
function rollingGuidance(src, w, h, r, eps) {
  let g = gaussian(src, w, h, r);
  for (let it = 0; it < 4; it++) g = guided(src, g, w, h, r, eps);
  return g;
}
function median(src, w, h, r) {
  if (r < 1) return src;
  r = Math.min(r, 5);
  const k = 2 * r + 1, area = k * k, mid = area >> 1;
  const out = new Float32Array(w * h);
  const win = new Float32Array(area);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const yy = Math.min(h - 1, Math.max(0, y + dy));
      const xx = Math.min(w - 1, Math.max(0, x + dx));
      win[m++] = src[yy * w + xx];
    }
    out[y * w + x] = win.slice().sort()[mid];
  }
  return out;
}
function lowFreq(plane, w, h, method, r, edge) {
  const eps = Math.pow(Math.max(edge, 1e-3), 2);
  if (method === "Guided") return guided(plane, plane, w, h, r, eps);
  if (method === "Rolling Guidance") return rollingGuidance(plane, w, h, r, eps);
  if (method === "Median") return median(plane, w, h, r);
  return gaussian(plane, w, h, r);
}
function computeSeparation(rgba, w, h, opts) {
  const n = w * h;
  const r = Math.max(1, Math.round(opts.radius));
  const hf = new Uint8ClampedArray(n * 4);
  const lf = new Uint8ClampedArray(n * 4);
  const toWork = (v) => opts.linear ? srgbToLinear(v) : v;
  const toDisp = (v) => opts.linear ? linearToSrgb(v) : v;
  const planes = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let p2 = 0, i = 0; p2 < n; p2++, i += 4) {
    planes[0][p2] = toWork(rgba[i] / 255);
    planes[1][p2] = toWork(rgba[i + 1] / 255);
    planes[2][p2] = toWork(rgba[i + 2] / 255);
  }
  const lfs = planes.map((pl) => lowFreq(pl, w, h, opts.method, r, opts.edge));
  for (let p2 = 0, i = 0; p2 < n; p2++, i += 4) {
    lf[i] = Math.round(toDisp(lfs[0][p2]) * 255);
    lf[i + 1] = Math.round(toDisp(lfs[1][p2]) * 255);
    lf[i + 2] = Math.round(toDisp(lfs[2][p2]) * 255);
    lf[i + 3] = 255;
  }
  if (opts.detail === "Luminance") {
    const luma = new Float32Array(n);
    for (let p2 = 0; p2 < n; p2++) luma[p2] = LUMA_R * planes[0][p2] + LUMA_G * planes[1][p2] + LUMA_B * planes[2][p2];
    const lfl = lowFreq(luma, w, h, opts.method, r, opts.edge);
    for (let p2 = 0, i = 0; p2 < n; p2++, i += 4) {
      const v = opts.mode === "Divide" ? luma[p2] / (lfl[p2] + EPS) : luma[p2] - lfl[p2];
      const g = v * 255;
      hf[i] = hf[i + 1] = hf[i + 2] = g;
      hf[i + 3] = 255;
    }
  } else {
    for (let p2 = 0, i = 0; p2 < n; p2++, i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = opts.mode === "Divide" ? planes[c][p2] / (lfs[c][p2] + EPS) : planes[c][p2] - lfs[c][p2];
        hf[i + c] = v * 255;
      }
      hf[i + 3] = 255;
    }
  }
  return { hf, lf };
}
const _hoisted_1 = { class: "nkd-bar" };
const _hoisted_2 = { class: "nkd-row nkd-row--controls" };
const _hoisted_3 = { class: "nkd-row nkd-row--controls" };
const _hoisted_4 = { class: "nkd-hint" };
const MIN_RENDER_SCALE = 2;
const CACHE_RES = 512;
const DEFAULT_ASPECT = "16 / 10";
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "FrequencyPreviewWidget",
  props: {
    getSourceImg: { type: Function },
    getMethod: { type: Function },
    getRadius: { type: Function },
    getEdge: { type: Function },
    getMode: { type: Function },
    getDetail: { type: Function },
    getLinear: { type: Function }
  },
  setup(__props, { expose: __expose }) {
    const props = __props;
    const canvas = /* @__PURE__ */ ref(null);
    let ctx = null;
    let ro = null;
    let dpr = window.devicePixelRatio || 1;
    let logicalW = 0, logicalH = 0;
    const hintText = /* @__PURE__ */ ref("Connect an image");
    const canvasAspect = /* @__PURE__ */ ref(DEFAULT_ASPECT);
    const blend = /* @__PURE__ */ ref(1);
    const zoom = /* @__PURE__ */ ref(false);
    const pan = /* @__PURE__ */ ref([0.5, 0.5]);
    const zoomLabel = /* @__PURE__ */ ref("1:1");
    let cacheW = 0, cacheH = 0;
    let cacheRgba = null;
    let lastSrc = null;
    let offscreen = null;
    let cacheScale = 1;
    let sentCanvas = null;
    let sentW = 0, sentH = 0, sentSrcW = 0, sentSrcH = 0;
    let sep = null;
    let outCanvas = null;
    let outCtx = null;
    let outImg = null;
    let lastSig = "";
    function source() {
      const img = props.getSourceImg();
      if ((img == null ? void 0 : img.complete) && img.naturalWidth > 0) {
        const w = img.naturalWidth, h = img.naturalHeight;
        return { drawable: img, natW: w, natH: h, srcW: w, srcH: h };
      }
      if (sentCanvas) {
        return {
          drawable: sentCanvas,
          natW: sentW,
          natH: sentH,
          srcW: sentSrcW || sentW,
          srcH: sentSrcH || sentH
        };
      }
      return null;
    }
    function buildCache() {
      const s = source();
      if (!s) {
        cacheRgba = null;
        return false;
      }
      if (!offscreen) offscreen = document.createElement("canvas");
      const octx = offscreen.getContext("2d", { willReadFrequently: true });
      if (zoom.value) {
        const cw = Math.max(16, Math.min(s.natW, Math.round(logicalW || 320)));
        const ch = Math.max(16, Math.min(s.natH, Math.round(logicalH || 210)));
        const sx = Math.round((s.natW - cw) * Math.min(1, Math.max(0, pan.value[0])));
        const sy = Math.round((s.natH - ch) * Math.min(1, Math.max(0, pan.value[1])));
        offscreen.width = cacheW = cw;
        offscreen.height = cacheH = ch;
        octx.drawImage(s.drawable, sx, sy, cw, ch, 0, 0, cw, ch);
        cacheScale = s.natW / s.srcW;
      } else {
        const fit = Math.min(CACHE_RES / Math.max(s.natW, s.natH), 1);
        offscreen.width = cacheW = Math.max(1, Math.round(s.natW * fit));
        offscreen.height = cacheH = Math.max(1, Math.round(s.natH * fit));
        octx.drawImage(s.drawable, 0, 0, cacheW, cacheH);
        cacheScale = cacheW / s.srcW;
      }
      cacheRgba = octx.getImageData(0, 0, cacheW, cacheH).data;
      return true;
    }
    function opts() {
      return {
        method: props.getMethod() || "Guided",
        // Scaled to the cache — see cacheScale. Never below 1: a sub-pixel radius
        // would mean "no filter at all", which is a worse lie than rounding up.
        radius: Math.max(1, Math.round((Number(props.getRadius()) || 8) * cacheScale)),
        edge: Number(props.getEdge()) || 0.1,
        mode: props.getMode() || "Divide",
        detail: props.getDetail() || "Luminance",
        linear: !!props.getLinear()
      };
    }
    function syncCanvasSize() {
      const c = canvas.value;
      if (!c) return false;
      const rect = c.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      logicalW = rect.width;
      logicalH = rect.height;
      const s = Math.max(dpr, MIN_RENDER_SCALE);
      const newW = Math.round(rect.width * s), newH = Math.round(rect.height * s);
      if (c.width !== newW || c.height !== newH) {
        c.width = newW;
        c.height = newH;
        ctx = c.getContext("2d");
      }
      ctx == null ? void 0 : ctx.setTransform(newW / rect.width, 0, 0, newH / rect.height, 0, 0);
      drawWipe();
      return true;
    }
    function recompute() {
      sep = buildCache() ? computeSeparation(cacheRgba, cacheW, cacheH, opts()) : null;
      drawWipe();
    }
    function toggleZoom() {
      zoom.value = !zoom.value;
      lastSig = "__force__";
      recompute();
    }
    let dragging = false;
    let dragX = 0, dragY = 0;
    let panTimer;
    function onDown(e) {
      if (!zoom.value) return;
      dragging = true;
      dragX = e.clientX;
      dragY = e.clientY;
    }
    function onMove(e) {
      if (!dragging) return;
      const s = source();
      if (!s) return;
      const spanX = Math.max(1, s.natW - cacheW), spanY = Math.max(1, s.natH - cacheH);
      pan.value = [
        Math.min(1, Math.max(0, pan.value[0] - (e.clientX - dragX) / spanX)),
        Math.min(1, Math.max(0, pan.value[1] - (e.clientY - dragY) / spanY))
      ];
      dragX = e.clientX;
      dragY = e.clientY;
      window.clearTimeout(panTimer);
      panTimer = window.setTimeout(() => {
        lastSig = "__force__";
        recompute();
      }, 80);
    }
    function onUp() {
      dragging = false;
    }
    function drawWipe() {
      if (!ctx || logicalW < 1) return;
      ctx.clearRect(0, 0, logicalW, logicalH);
      ctx.fillStyle = "#111318";
      ctx.fillRect(0, 0, logicalW, logicalH);
      if (!sep) {
        ctx.font = "11px Inter, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.32)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Connect an image", logicalW / 2, logicalH / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        return;
      }
      if (!outCanvas || outCanvas.width !== cacheW || outCanvas.height !== cacheH) {
        outCanvas = document.createElement("canvas");
        outCanvas.width = cacheW;
        outCanvas.height = cacheH;
        outCtx = outCanvas.getContext("2d");
        outImg = outCtx.createImageData(cacheW, cacheH);
      }
      const t = Math.max(0, Math.min(1, blend.value));
      const split = Math.round(t * cacheW);
      const d = outImg.data, hf = sep.hf, lf = sep.lf;
      for (let y = 0; y < cacheH; y++) {
        const row = y * cacheW;
        for (let x = 0; x < cacheW; x++) {
          const i = (row + x) * 4;
          const s = x < split ? hf : lf;
          d[i] = s[i];
          d[i + 1] = s[i + 1];
          d[i + 2] = s[i + 2];
          d[i + 3] = 255;
        }
      }
      outCtx.putImageData(outImg, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(outCanvas, 0, 0, logicalW, logicalH);
      if (split > 0 && split < cacheW) {
        const dx = split / cacheW * logicalW;
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dx, 0);
        ctx.lineTo(dx, logicalH);
        ctx.stroke();
      }
    }
    function setSentImage(rgb, w, h, srcW = 0, srcH = 0) {
      const n = w * h;
      const rgba = new Uint8ClampedArray(n * 4);
      for (let p2 = 0, i = 0, j = 0; p2 < n; p2++, i += 4, j += 3) {
        rgba[i] = rgb[j];
        rgba[i + 1] = rgb[j + 1];
        rgba[i + 2] = rgb[j + 2];
        rgba[i + 3] = 255;
      }
      sentW = w;
      sentH = h;
      sentSrcW = srcW || w;
      sentSrcH = srcH || h;
      const c = sentCanvas ?? document.createElement("canvas");
      c.width = w;
      c.height = h;
      const cx = c.getContext("2d");
      const id = cx.createImageData(w, h);
      id.data.set(rgba);
      cx.putImageData(id, 0, 0);
      sentCanvas = c;
      lastSrc = "__sent__";
      const wantAspect = `${sentSrcW} / ${sentSrcH}`;
      if (wantAspect !== canvasAspect.value) canvasAspect.value = wantAspect;
      lastSig = "__force__";
      recompute();
    }
    function refreshExternal() {
      const s = source();
      const img = props.getSourceImg();
      const src = (img == null ? void 0 : img.currentSrc) || (img == null ? void 0 : img.src) || (s ? "__sent__" : null);
      if (!s && lastSrc !== null) {
        cacheRgba = null;
        sep = null;
        lastSrc = null;
      } else if (s) lastSrc = src;
      const layer = blend.value >= 0.99 ? "all HF" : blend.value <= 0.01 ? "all LF" : "HF ◄ wipe ► LF";
      const rawR = Number(props.getRadius()) || 8;
      if (!s) {
        hintText.value = "Connect an image";
        zoomLabel.value = "1:1";
      } else if (zoom.value) {
        const pct = Math.round(cacheScale * 100);
        zoomLabel.value = "Fit";
        hintText.value = cacheScale >= 0.999 ? `${layer} · ${props.getMethod()} · r${rawR} · 1:1 · drag to pan` : `${layer} · r${rawR} · ${pct}% max (source not local) · drag to pan`;
      } else {
        zoomLabel.value = "1:1";
        const eff = Math.max(1, Math.round(rawR * cacheScale));
        hintText.value = `${layer} · ${props.getMethod()} · r${rawR} → r${eff} @ ${Math.round(cacheScale * 100)}%`;
      }
      const wantAspect = s ? `${s.srcW} / ${s.srcH}` : DEFAULT_ASPECT;
      if (wantAspect !== canvasAspect.value) {
        canvasAspect.value = wantAspect;
        return;
      }
      const o = opts();
      const sig = `${lastSrc}|${zoom.value}|${pan.value.join()}|${Math.round(logicalW)}|${o.method}|${rawR}|${o.edge}|${o.mode}|${o.detail}|${o.linear}`;
      if (sig !== lastSig) {
        lastSig = sig;
        recompute();
      }
    }
    function forceResize() {
      return syncCanvasSize();
    }
    function cleanup() {
      ro == null ? void 0 : ro.disconnect();
    }
    onMounted(() => {
      var _a;
      ctx = ((_a = canvas.value) == null ? void 0 : _a.getContext("2d")) ?? null;
      ro = new ResizeObserver(() => syncCanvasSize());
      if (canvas.value) ro.observe(canvas.value);
      syncCanvasSize();
    });
    onBeforeUnmount(cleanup);
    __expose({ refreshExternal, forceResize, cleanup, setSentImage });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "nkd-root",
        onMousedown: _cache[1] || (_cache[1] = withModifiers(() => {
        }, ["stop"])),
        onMouseup: _cache[2] || (_cache[2] = withModifiers(() => {
        }, ["stop"])),
        onMousemove: _cache[3] || (_cache[3] = withModifiers(() => {
        }, ["stop"]))
      }, [
        createBaseVNode("canvas", {
          ref_key: "canvas",
          ref: canvas,
          class: normalizeClass(["nkd-canvas", { "nkd-canvas--pan": zoom.value }]),
          style: normalizeStyle({ aspectRatio: canvasAspect.value }),
          onMousedown: withModifiers(onDown, ["stop", "prevent"]),
          onMousemove: withModifiers(onMove, ["stop"]),
          onMouseup: withModifiers(onUp, ["stop"]),
          onMouseleave: withModifiers(onUp, ["stop"])
        }, null, 38),
        createBaseVNode("div", _hoisted_1, [
          createBaseVNode("div", _hoisted_2, [
            _cache[4] || (_cache[4] = createBaseVNode("span", { class: "nkd-label" }, "Low", -1)),
            withDirectives(createBaseVNode("input", {
              class: "nkd-slider",
              type: "range",
              min: "0",
              max: "1",
              step: "0.01",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => blend.value = $event),
              onInput: drawWipe
            }, null, 544), [
              [
                vModelText,
                blend.value,
                void 0,
                { number: true }
              ]
            ]),
            _cache[5] || (_cache[5] = createBaseVNode("span", { class: "nkd-label" }, "High", -1))
          ]),
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("span", _hoisted_4, toDisplayString(hintText.value), 1),
            _cache[6] || (_cache[6] = createBaseVNode("span", { class: "nkd-spacer" }, null, -1)),
            createBaseVNode("button", {
              class: "nkd-btn",
              onClick: withModifiers(toggleZoom, ["stop"])
            }, toDisplayString(zoomLabel.value), 1)
          ])
        ])
      ], 32);
    };
  }
});
const FrequencyPreviewWidget = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-86ec67a6"]]);
const NODE_NAME = "NKDPromptVariables";
const EXT_NAME = "NKD.BasicTools.PromptVariables.Vue";
const MIN_W = 300;
const MIN_EDITOR_H = 190;
const ROW_SAFETY = 8;
function sizeDomWidgetToContent(node, domWidget, container, minW, estimate) {
  let measuredH = 0;
  let raf = 0;
  let settling = false;
  const inner = container.firstElementChild ?? container;
  const MAX_MARGIN = 40;
  const vueMode = () => {
    var _a;
    return !!((_a = window.LiteGraph) == null ? void 0 : _a.vueNodesMode);
  };
  let enforcingW = false;
  let goodMargin = 15;
  const clampWidth = () => {
    var _a;
    if (enforcingW) return;
    if (vueMode()) {
      if (container.style.width) container.style.width = "";
      return;
    }
    const nodeW = (_a = node.size) == null ? void 0 : _a[0];
    if (!nodeW) return;
    const host = container.parentElement;
    const hostW = host ? host.clientWidth : 0;
    const broken = hostW > 0 && (hostW > nodeW * 1.2 || hostW < nodeW * 0.7);
    if (!broken) {
      if (container.style.width) {
        enforcingW = true;
        container.style.width = "";
        requestAnimationFrame(() => {
          enforcingW = false;
        });
      }
      const cw = container.clientWidth;
      if (cw > 0 && cw <= nodeW && cw >= nodeW - MAX_MARGIN) goodMargin = nodeW - cw;
      return;
    }
    const ref2 = Math.round(nodeW - goodMargin);
    if (ref2 > 0 && Math.abs(container.clientWidth - ref2) > 2) {
      enforcingW = true;
      container.style.boxSizing = "border-box";
      container.style.width = ref2 + "px";
      requestAnimationFrame(() => {
        enforcingW = false;
      });
    }
  };
  clampWidth();
  domWidget.computeSize = (width) => {
    const w = Math.max(width ?? minW, minW);
    const h = (measuredH > 0 ? measuredH : estimate(w)) + ROW_SAFETY;
    return [w, h];
  };
  const apply2 = () => {
    raf = 0;
    if (!node.size) return;
    clampWidth();
    const needed = node.computeSize();
    if (Math.abs(needed[1] - node.size[1]) > 1) {
      settling = true;
      node.setSize([node.size[0], needed[1]]);
      node.setDirtyCanvas(true, true);
      requestAnimationFrame(() => {
        settling = false;
      });
    }
  };
  const ro = new ResizeObserver(() => {
    clampWidth();
    if (settling) return;
    const h = inner.offsetHeight;
    if (h < 1) return;
    if (Math.abs(h - measuredH) <= 1) return;
    measuredH = h;
    if (!raf) raf = requestAnimationFrame(apply2);
  });
  ro.observe(inner);
  if (container !== inner) ro.observe(container);
  const origOnResize = node.onResize;
  node.onResize = function() {
    origOnResize == null ? void 0 : origOnResize.apply(this, arguments);
    clampWidth();
  };
  const iv = window.setInterval(clampWidth, 250);
  const origRemoved = node.onRemoved;
  node.onRemoved = function() {
    clearInterval(iv);
    origRemoved == null ? void 0 : origRemoved.apply(this, arguments);
  };
  return ro;
}
function resolveDim(node, name, fallback) {
  var _a, _b, _c, _d, _e, _f, _g;
  const slot = (_a = node.inputs) == null ? void 0 : _a.find((i) => i.name === name);
  if (slot && slot.link != null) {
    const link = (_c = (_b = node.graph) == null ? void 0 : _b.links) == null ? void 0 : _c[slot.link];
    const src = link && ((_d = node.graph) == null ? void 0 : _d.getNodeById(link.origin_id));
    if (src) {
      const sw = ((_e = src.widgets) == null ? void 0 : _e.find((w2) => w2.name === name && Number.isFinite(Number(w2.value)))) ?? ((_f = src.widgets) == null ? void 0 : _f.find((w2) => Number.isFinite(Number(w2.value))));
      if (sw) return Number(sw.value);
    }
  }
  const w = (_g = node.widgets) == null ? void 0 : _g.find((w2) => w2.name === name);
  if (w && Number.isFinite(Number(w.value))) return Number(w.value);
  return fallback;
}
function syncLabels(node) {
  const props = node.properties ?? (node.properties = {});
  const store = props.nkd_var_labels ?? (props.nkd_var_labels = {});
  for (const inp of node.inputs ?? []) {
    const m = /(?:^|\.)variable_(\d+)$/.exec(inp.name);
    if (!m) continue;
    const local = `variable_${m[1]}`;
    const isDefault = !inp.label || inp.label === local || inp.label === inp.name;
    if (!isDefault) store[local] = inp.label;
    else if (store[local]) inp.label = store[local];
  }
}
function readVariables(node) {
  const list = [];
  for (const inp of node.inputs ?? []) {
    const m = /(?:^|\.)variable_(\d+)$/.exec(inp.name);
    if (!m) continue;
    const local = `variable_${m[1]}`;
    const renamed = inp.label && inp.label !== local && inp.label !== inp.name;
    list.push({
      name: local,
      label: renamed ? inp.label : `Variable ${Number(m[1]) + 1}`,
      connected: inp.link != null
    });
  }
  return list;
}
app.registerExtension({
  name: EXT_NAME,
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      var _a;
      const result = origCreated == null ? void 0 : origCreated.apply(this, arguments);
      const textWidget = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === "text");
      if (!textWidget) return result;
      textWidget.type = "hidden";
      textWidget.hidden = true;
      if (textWidget.options) textWidget.options.hidden = true;
      textWidget.computedHeight = 0;
      textWidget.computeSize = () => [0, -4];
      const container = document.createElement("div");
      let instance = null;
      const vueApp = createApp(PromptVariablesWidget, {
        onChange: (text) => {
          if (textWidget.value !== text) {
            textWidget.value = text;
          }
        }
      });
      instance = vueApp.mount(container);
      const domWidget = this.addDOMWidget("prompt_editor", "NKD_PROMPT_EDITOR", container, {
        getValue: () => textWidget.value,
        setValue: (v) => {
          textWidget.value = v;
          instance == null ? void 0 : instance.deserialise(v ?? "");
        },
        serialize: false,
        hideOnZoom: false
      });
      const promptRo = sizeDomWidgetToContent(
        this,
        domWidget,
        container,
        MIN_W,
        () => MIN_EDITOR_H
      );
      const origResize = this.onResize;
      this.onResize = function(size) {
        origResize == null ? void 0 : origResize.apply(this, arguments);
        if (size[0] < MIN_W) size[0] = MIN_W;
      };
      requestAnimationFrame(() => {
        instance == null ? void 0 : instance.deserialise(textWidget.value ?? "");
        instance == null ? void 0 : instance.setVariables(readVariables(this));
        this.setDirtyCanvas(true, true);
      });
      const origDrawBg = this.onDrawBackground;
      this.onDrawBackground = function(ctx) {
        origDrawBg == null ? void 0 : origDrawBg.apply(this, arguments);
        syncLabels(this);
        instance == null ? void 0 : instance.setVariables(readVariables(this));
      };
      const varsTimer = window.setInterval(() => {
        syncLabels(this);
        instance == null ? void 0 : instance.setVariables(readVariables(this));
      }, 800);
      const origConfigure = this.onConfigure;
      this.onConfigure = function() {
        const r = origConfigure == null ? void 0 : origConfigure.apply(this, arguments);
        requestAnimationFrame(() => {
          syncLabels(this);
          instance == null ? void 0 : instance.deserialise(textWidget.value ?? "");
          instance == null ? void 0 : instance.setVariables(readVariables(this));
        });
        return r;
      };
      const origRemoved = this.onRemoved;
      this.onRemoved = function() {
        var _a2;
        window.clearInterval(varsTimer);
        promptRo.disconnect();
        (_a2 = instance == null ? void 0 : instance.cleanup) == null ? void 0 : _a2.call(instance);
        vueApp.unmount();
        origRemoved == null ? void 0 : origRemoved.apply(this, arguments);
      };
      return result;
    };
  }
});
function findSourceImg(node, inputName = "image") {
  var _a, _b, _c, _d, _e;
  const inp = (_a = node.inputs) == null ? void 0 : _a.find((i) => i.name === inputName);
  const linkId = inp == null ? void 0 : inp.link;
  if (linkId == null) return null;
  const link = (_c = (_b = node.graph) == null ? void 0 : _b.links) == null ? void 0 : _c[linkId];
  if (!link) return null;
  const srcNode = (_d = node.graph) == null ? void 0 : _d.getNodeById(link.origin_id);
  return ((_e = srcNode == null ? void 0 : srcNode.imgs) == null ? void 0 : _e[0]) ?? null;
}
app.registerExtension({
  name: "NKD.BasicTools.GradientMapPreview.Vue",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "NKDGradientMap") return;
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      const result = origCreated == null ? void 0 : origCreated.apply(this, arguments);
      const container = document.createElement("div");
      const getRamp = () => {
        var _a, _b;
        return ((_b = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === "ramp")) == null ? void 0 : _b.value) ?? "{}";
      };
      const getInvert = () => {
        var _a, _b;
        return !!((_b = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === "invert")) == null ? void 0 : _b.value);
      };
      const getStrength = () => {
        var _a, _b;
        return Number((_b = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === "strength")) == null ? void 0 : _b.value) || 0;
      };
      let instance = null;
      const vueApp = createApp(GradientMapPreviewWidget, {
        getRamp,
        getInvert,
        getStrength,
        getSourceImg: () => findSourceImg(this),
        getMaskImg: () => findSourceImg(this, "mask")
      });
      instance = vueApp.mount(container);
      const domWidget = this.addDOMWidget("gradmap_preview", "NKD_GRADIENT_MAP_PREVIEW", container, {
        getValue: () => "",
        setValue: () => {
        },
        serialize: false,
        hideOnZoom: false
      });
      const ro = sizeDomWidgetToContent(
        this,
        domWidget,
        container,
        320,
        (w) => Math.round(w * (200 / 320)) + 30
      );
      const origResize = this.onResize;
      this.onResize = function(size) {
        origResize == null ? void 0 : origResize.apply(this, arguments);
        if (size[0] < 320) size[0] = 320;
      };
      const refreshTimer = window.setInterval(() => {
        var _a;
        return (_a = instance == null ? void 0 : instance.refreshExternal) == null ? void 0 : _a.call(instance);
      }, 300);
      requestAnimationFrame(() => {
        var _a;
        (_a = instance == null ? void 0 : instance.forceResize) == null ? void 0 : _a.call(instance);
      });
      const node = this;
      const onSource = (e) => {
        var _a;
        const d = e == null ? void 0 : e.detail;
        if (!d || String(d.node_id) !== String(node.id)) return;
        try {
          const bin = atob(d.img);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          (_a = instance == null ? void 0 : instance.setSentImage) == null ? void 0 : _a.call(instance, bytes, d.width, d.height);
        } catch {
        }
      };
      api.addEventListener("nkd-gradmap-source", onSource);
      const origConfigure = this.onConfigure;
      this.onConfigure = function() {
        const r = origConfigure == null ? void 0 : origConfigure.apply(this, arguments);
        requestAnimationFrame(() => {
          var _a;
          (_a = instance == null ? void 0 : instance.forceResize) == null ? void 0 : _a.call(instance);
        });
        return r;
      };
      const origRemoved = this.onRemoved;
      this.onRemoved = function() {
        var _a;
        window.clearInterval(refreshTimer);
        api.removeEventListener("nkd-gradmap-source", onSource);
        ro.disconnect();
        (_a = instance == null ? void 0 : instance.cleanup) == null ? void 0 : _a.call(instance);
        vueApp.unmount();
        origRemoved == null ? void 0 : origRemoved.apply(this, arguments);
      };
      return result;
    };
  }
});
app.registerExtension({
  name: "NKD.BasicTools.FrequencyPreview.Vue",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "NKDFrequencySeparate") return;
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      const result = origCreated == null ? void 0 : origCreated.apply(this, arguments);
      const container = document.createElement("div");
      const wv = (n) => {
        var _a, _b;
        return (_b = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === n)) == null ? void 0 : _b.value;
      };
      let instance = null;
      const vueApp = createApp(FrequencyPreviewWidget, {
        getSourceImg: () => findSourceImg(this, "image"),
        getMethod: () => wv("method") ?? "Guided",
        getRadius: () => Number(wv("radius")) || 8,
        getEdge: () => Number(wv("edge_threshold")) || 0.1,
        getMode: () => wv("mode") ?? "Divide",
        getDetail: () => wv("detail") ?? "Luminance",
        getLinear: () => !!wv("linear")
      });
      instance = vueApp.mount(container);
      const domWidget = this.addDOMWidget("freq_preview", "NKD_FREQUENCY_PREVIEW", container, {
        getValue: () => "",
        setValue: () => {
        },
        serialize: false,
        hideOnZoom: false
      });
      const ro = sizeDomWidgetToContent(
        this,
        domWidget,
        container,
        320,
        (w) => Math.round(w * (200 / 320)) + 52
      );
      const origResize = this.onResize;
      this.onResize = function(size) {
        origResize == null ? void 0 : origResize.apply(this, arguments);
        if (size[0] < 320) size[0] = 320;
      };
      const refreshTimer = window.setInterval(() => {
        var _a;
        return (_a = instance == null ? void 0 : instance.refreshExternal) == null ? void 0 : _a.call(instance);
      }, 300);
      requestAnimationFrame(() => {
        var _a;
        (_a = instance == null ? void 0 : instance.forceResize) == null ? void 0 : _a.call(instance);
      });
      const node = this;
      const onSource = (e) => {
        var _a;
        const d = e == null ? void 0 : e.detail;
        if (!d || String(d.node_id) !== String(node.id)) return;
        try {
          const bin = atob(d.img);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          (_a = instance == null ? void 0 : instance.setSentImage) == null ? void 0 : _a.call(instance, bytes, d.width, d.height, d.src_width, d.src_height);
        } catch {
        }
      };
      api.addEventListener("nkd-freq-source", onSource);
      const origConfigure = this.onConfigure;
      this.onConfigure = function() {
        const r = origConfigure == null ? void 0 : origConfigure.apply(this, arguments);
        requestAnimationFrame(() => {
          var _a;
          (_a = instance == null ? void 0 : instance.forceResize) == null ? void 0 : _a.call(instance);
        });
        return r;
      };
      const origRemoved = this.onRemoved;
      this.onRemoved = function() {
        var _a;
        window.clearInterval(refreshTimer);
        api.removeEventListener("nkd-freq-source", onSource);
        ro.disconnect();
        (_a = instance == null ? void 0 : instance.cleanup) == null ? void 0 : _a.call(instance);
        vueApp.unmount();
        origRemoved == null ? void 0 : origRemoved.apply(this, arguments);
      };
      return result;
    };
  }
});
app.registerExtension({
  name: "NKD.BasicTools.GradientPreview.Vue",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "NKDGradientGenerate") return;
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      var _a;
      const result = origCreated == null ? void 0 : origCreated.apply(this, arguments);
      const handlesWidget = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === "handles");
      if (!handlesWidget) return result;
      handlesWidget.type = "hidden";
      handlesWidget.hidden = true;
      if (handlesWidget.options) handlesWidget.options.hidden = true;
      handlesWidget.computedHeight = 0;
      handlesWidget.computeSize = () => [0, -4];
      const container = document.createElement("div");
      const getRamp = () => {
        var _a2, _b;
        return ((_b = (_a2 = this.widgets) == null ? void 0 : _a2.find((w) => w.name === "ramp")) == null ? void 0 : _b.value) ?? "{}";
      };
      const getShape = () => {
        var _a2, _b;
        return ((_b = (_a2 = this.widgets) == null ? void 0 : _a2.find((w) => w.name === "shape")) == null ? void 0 : _b.value) ?? "Linear";
      };
      let knownSize = null;
      const getSize = () => {
        const img = findSourceImg(this, "image");
        if (img == null ? void 0 : img.naturalWidth) return [img.naturalWidth, img.naturalHeight];
        return knownSize ?? [resolveDim(this, "width", 1024), resolveDim(this, "height", 1024)];
      };
      let instance = null;
      const vueApp = createApp(GradientPreviewWidget, {
        onChange: (json) => {
          if (handlesWidget.value !== json) handlesWidget.value = json;
        },
        getRamp,
        getShape,
        getSize,
        getSourceImg: () => findSourceImg(this, "image"),
        getBlendMode: () => {
          var _a2, _b;
          return ((_b = (_a2 = this.widgets) == null ? void 0 : _a2.find((w) => w.name === "blend_mode")) == null ? void 0 : _b.value) ?? "none";
        },
        getOpacity: () => {
          var _a2, _b;
          const v = Number((_b = (_a2 = this.widgets) == null ? void 0 : _a2.find((w) => w.name === "opacity")) == null ? void 0 : _b.value);
          return Number.isFinite(v) ? v : 1;
        }
      });
      instance = vueApp.mount(container);
      const domWidget = this.addDOMWidget("preview_editor", "NKD_GRADIENT_PREVIEW", container, {
        getValue: () => handlesWidget.value,
        setValue: (v) => {
          handlesWidget.value = v;
          instance == null ? void 0 : instance.deserialise(v ?? "");
        },
        serialize: false,
        hideOnZoom: false
      });
      const ro = sizeDomWidgetToContent(
        this,
        domWidget,
        container,
        320,
        (w) => Math.round(w * (210 / 320)) + 34
      );
      const origResize = this.onResize;
      this.onResize = function(size) {
        origResize == null ? void 0 : origResize.apply(this, arguments);
        if (size[0] < 320) size[0] = 320;
      };
      const refreshTimer = window.setInterval(() => {
        var _a2;
        return (_a2 = instance == null ? void 0 : instance.refreshExternal) == null ? void 0 : _a2.call(instance);
      }, 400);
      const gnode = this;
      const onSize = (e) => {
        var _a2;
        const d = e == null ? void 0 : e.detail;
        if (!d || String(d.node_id) !== String(gnode.id)) return;
        if (d.width > 0 && d.height > 0) {
          knownSize = [d.width, d.height];
          (_a2 = instance == null ? void 0 : instance.refreshExternal) == null ? void 0 : _a2.call(instance);
        }
      };
      api.addEventListener("nkd-gradient-size", onSize);
      const onSource = (e) => {
        var _a2;
        const d = e == null ? void 0 : e.detail;
        if (!d || String(d.node_id) !== String(gnode.id)) return;
        try {
          const bin = atob(d.img);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          (_a2 = instance == null ? void 0 : instance.setSentImage) == null ? void 0 : _a2.call(instance, bytes, d.width, d.height);
        } catch {
        }
      };
      api.addEventListener("nkd-gradgen-source", onSource);
      requestAnimationFrame(() => {
        var _a2;
        instance == null ? void 0 : instance.deserialise(handlesWidget.value ?? "");
        (_a2 = instance == null ? void 0 : instance.forceResize) == null ? void 0 : _a2.call(instance);
      });
      const origConfigure = this.onConfigure;
      this.onConfigure = function() {
        const r = origConfigure == null ? void 0 : origConfigure.apply(this, arguments);
        requestAnimationFrame(() => {
          var _a2;
          instance == null ? void 0 : instance.deserialise(handlesWidget.value ?? "");
          (_a2 = instance == null ? void 0 : instance.forceResize) == null ? void 0 : _a2.call(instance);
        });
        return r;
      };
      const origRemoved = this.onRemoved;
      this.onRemoved = function() {
        var _a2;
        window.clearInterval(refreshTimer);
        api.removeEventListener("nkd-gradient-size", onSize);
        api.removeEventListener("nkd-gradgen-source", onSource);
        ro.disconnect();
        (_a2 = instance == null ? void 0 : instance.cleanup) == null ? void 0 : _a2.call(instance);
        vueApp.unmount();
        origRemoved == null ? void 0 : origRemoved.apply(this, arguments);
      };
      return result;
    };
  }
});
const RAMP_NODES = ["NKDGradientMap", "NKDGradientGenerate"];
const RAMP_CANVAS_W = 380;
const RAMP_CANVAS_AR = 64 / RAMP_CANVAS_W;
const RAMP_MIN_W = 380;
const RAMP_BAR_EST = 56;
app.registerExtension({
  name: "NKD.BasicTools.ColorRamp.Vue",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!RAMP_NODES.includes(nodeData.name)) return;
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      var _a;
      const result = origCreated == null ? void 0 : origCreated.apply(this, arguments);
      const rampWidget = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === "ramp");
      if (!rampWidget) return result;
      rampWidget.type = "hidden";
      rampWidget.hidden = true;
      if (rampWidget.options) rampWidget.options.hidden = true;
      rampWidget.computedHeight = 0;
      rampWidget.computeSize = () => [0, -4];
      const container = document.createElement("div");
      let instance = null;
      const vueApp = createApp(ColorRampWidget, {
        onChange: (json) => {
          if (rampWidget.value !== json) rampWidget.value = json;
        }
      });
      instance = vueApp.mount(container);
      const domWidget = this.addDOMWidget("ramp_editor", "NKD_RAMP_EDITOR", container, {
        getValue: () => rampWidget.value,
        setValue: (v) => {
          rampWidget.value = v;
          instance == null ? void 0 : instance.deserialise(v ?? "");
        },
        serialize: false,
        hideOnZoom: false
      });
      const ro = sizeDomWidgetToContent(
        this,
        domWidget,
        container,
        RAMP_MIN_W,
        (w) => Math.round(w * RAMP_CANVAS_AR) + RAMP_BAR_EST
      );
      const origResize = this.onResize;
      this.onResize = function(size) {
        origResize == null ? void 0 : origResize.apply(this, arguments);
        if (size[0] < RAMP_MIN_W) size[0] = RAMP_MIN_W;
      };
      requestAnimationFrame(() => {
        var _a2;
        instance == null ? void 0 : instance.deserialise(rampWidget.value ?? "");
        (_a2 = instance == null ? void 0 : instance.forceResize) == null ? void 0 : _a2.call(instance);
      });
      const origConfigure = this.onConfigure;
      this.onConfigure = function() {
        const r = origConfigure == null ? void 0 : origConfigure.apply(this, arguments);
        requestAnimationFrame(() => {
          var _a2;
          instance == null ? void 0 : instance.deserialise(rampWidget.value ?? "");
          (_a2 = instance == null ? void 0 : instance.forceResize) == null ? void 0 : _a2.call(instance);
        });
        return r;
      };
      const origRemoved = this.onRemoved;
      this.onRemoved = function() {
        var _a2;
        ro.disconnect();
        (_a2 = instance == null ? void 0 : instance.cleanup) == null ? void 0 : _a2.call(instance);
        vueApp.unmount();
        origRemoved == null ? void 0 : origRemoved.apply(this, arguments);
      };
      return result;
    };
  }
});
const NOISE_MIN_W = 260;
app.registerExtension({
  name: "NKD.BasicTools.Noise.Vue",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "NKDNoise") return;
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      const result = origCreated == null ? void 0 : origCreated.apply(this, arguments);
      const num = (name, def2) => {
        var _a, _b;
        return Number(((_b = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === name)) == null ? void 0 : _b.value) ?? def2);
      };
      const getParams = () => {
        var _a, _b;
        return {
          width: resolveDim(this, "width", 1024),
          height: resolveDim(this, "height", 1024),
          scale: num("scale", 6),
          detail: num("detail", 4),
          roughness: num("roughness", 0.5),
          lacunarity: num("lacunarity", 2),
          distortion: num("distortion", 0),
          contrast: num("contrast", 1),
          brightness: num("brightness", 0),
          evolution: num("evolution", 0),
          loop: !!((_b = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === "loop")) == null ? void 0 : _b.value),
          offset_x: num("offset_x", 0),
          offset_y: num("offset_y", 0),
          seed: num("seed", 0)
        };
      };
      const container = document.createElement("div");
      let instance = null;
      const vueApp = createApp(NoisePreviewWidget, { getParams });
      instance = vueApp.mount(container);
      const domWidget = this.addDOMWidget("noise_preview", "NKD_NOISE_PREVIEW", container, {
        getValue: () => "",
        setValue: () => {
        },
        serialize: false,
        hideOnZoom: false
      });
      const ro = sizeDomWidgetToContent(
        this,
        domWidget,
        container,
        NOISE_MIN_W,
        (w) => Math.round(w) + 26
      );
      const origResize = this.onResize;
      this.onResize = function(size) {
        origResize == null ? void 0 : origResize.apply(this, arguments);
        if (size[0] < NOISE_MIN_W) size[0] = NOISE_MIN_W;
      };
      const refreshTimer = window.setInterval(() => {
        var _a;
        return (_a = instance == null ? void 0 : instance.refreshExternal) == null ? void 0 : _a.call(instance);
      }, 300);
      requestAnimationFrame(() => {
        var _a;
        (_a = instance == null ? void 0 : instance.forceResize) == null ? void 0 : _a.call(instance);
      });
      const origConfigure = this.onConfigure;
      this.onConfigure = function() {
        const r = origConfigure == null ? void 0 : origConfigure.apply(this, arguments);
        requestAnimationFrame(() => {
          var _a;
          (_a = instance == null ? void 0 : instance.forceResize) == null ? void 0 : _a.call(instance);
        });
        return r;
      };
      const origRemoved = this.onRemoved;
      this.onRemoved = function() {
        var _a;
        window.clearInterval(refreshTimer);
        ro.disconnect();
        (_a = instance == null ? void 0 : instance.cleanup) == null ? void 0 : _a.call(instance);
        vueApp.unmount();
        origRemoved == null ? void 0 : origRemoved.apply(this, arguments);
      };
      return result;
    };
  }
});
(function() {
  "use strict";
  try {
    if (typeof document != "undefined") {
      var elementStyle = document.createElement("style");
      elementStyle.appendChild(document.createTextNode('.nkd-pv[data-v-e3af9b8a] {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  box-sizing: border-box;\n  padding: 2px;\n}\n.nkd-pv-editor[data-v-e3af9b8a] {\n  height: 150px;\n  min-height: 90px;\n  resize: vertical;\n  overflow-y: auto;\n  background: #111318;\n  border: 1px solid #3a3d46;\n  border-radius: 4px;\n  padding: 8px 10px;\n  color: #c8d0e0;\n  font-size: 13px;\n  line-height: 1.7;\n  white-space: pre-wrap;\n  word-break: break-word;\n  outline: none;\n}\n.nkd-pv-editor[data-v-e3af9b8a]:focus {\n  border-color: #4ab4ff;\n}\n.nkd-pv-editor[data-v-e3af9b8a]:empty::before {\n  content: attr(data-placeholder);\n  color: rgba(255, 255, 255, 0.22);\n  pointer-events: none;\n}\n.nkd-pv-bar[data-v-e3af9b8a] {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  flex: 0 0 auto;\n}\n.nkd-pv-add[data-v-e3af9b8a] {\n  background: #252830;\n  border: 1px solid #3a3d46;\n  border-radius: 4px;\n  color: #c8d0e0;\n  font-size: 11px;\n  padding: 2px 8px;\n  cursor: pointer;\n}\n.nkd-pv-add[data-v-e3af9b8a]:hover {\n  border-color: #4ab4ff;\n  color: #4ab4ff;\n}\n.nkd-pv-add.connected[data-v-e3af9b8a] {\n  color: #4ab4ff;\n}\n\n.nkd-pv-chip {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  background: rgba(74, 180, 255, 0.14);\n  border: 1px solid rgba(74, 180, 255, 0.75);\n  color: #bfe3ff;\n  border-radius: 999px;\n  padding: 0 9px 0 7px;\n  margin: 0 2px;\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.2px;\n  line-height: 17px;\n  vertical-align: text-bottom;\n  user-select: none;\n  cursor: grab;\n  white-space: nowrap;\n  transform: translateY(-1px);\n}\n.nkd-pv-chip:active {\n  cursor: grabbing;\n}\n.nkd-pv-chip::selection,\n.nkd-pv-chip *::selection {\n  background: transparent;\n}\n.nkd-pv-dot {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: #4ab4ff;\n  flex: 0 0 auto;\n}\n.nkd-pv-chip-off {\n  border-style: dashed;\n  border-color: rgba(255, 255, 255, 0.32);\n  color: rgba(255, 255, 255, 0.5);\n  background: rgba(255, 255, 255, 0.05);\n}\n.nkd-pv-chip-off .nkd-pv-dot {\n  background: transparent;\n  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.35);\n}\n.nkd-pv-chip-rand {\n  border-color: rgba(255, 209, 102, 0.85);\n  color: #ffe3a8;\n  background: rgba(255, 209, 102, 0.12);\n}\n.nkd-pv-chip-rand::after {\n  content: "🎲";\n  font-size: 10px;\n  line-height: 1;\n}\n.nkd-pv-chip-rand .nkd-pv-dot {\n  background: #ffd166;\n}\n.nkd-pv-chip-rand.nkd-pv-chip-off .nkd-pv-dot {\n  background: transparent;\n  box-shadow: inset 0 0 0 1.5px rgba(255, 209, 102, 0.5);\n}\n.nkd-pv-chip-cycle {\n  border-color: rgba(102, 224, 170, 0.85);\n  color: #b6f2d8;\n  background: rgba(102, 224, 170, 0.12);\n}\n.nkd-pv-chip-cycle::after {\n  content: "🔁";\n  font-size: 10px;\n  line-height: 1;\n}\n.nkd-pv-chip-cycle .nkd-pv-dot {\n  background: #66e0aa;\n}\n.nkd-pv-chip-cycle.nkd-pv-chip-off .nkd-pv-dot {\n  background: transparent;\n  box-shadow: inset 0 0 0 1.5px rgba(102, 224, 170, 0.5);\n}\n\n.nkd-root[data-v-3d741d05] {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  box-sizing: border-box;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border: 1px solid var(--border-color, #2a2d36);\n  border-radius: 6px;\n  overflow: hidden;\n  font: 11px Inter, sans-serif;\n}\n.nkd-root[data-v-3d741d05], .nkd-root[data-v-3d741d05] *, .nkd-root[data-v-3d741d05] *::before, .nkd-root[data-v-3d741d05] *::after {\n  box-sizing: border-box;\n}\n.nkd-canvas[data-v-3d741d05] {\n  width: 100%;\n  aspect-ratio: 380 / 64;\n  height: auto;\n  display: block;\n  cursor: crosshair;\n  flex: 0 0 auto;\n}\n.nkd-color-input[data-v-3d741d05] {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  opacity: 0;\n  pointer-events: none;\n}\n.nkd-bar[data-v-3d741d05] {\n  flex: 0 0 auto;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border-top: 1px solid var(--border-color, #2a2d36);\n}\n.nkd-row[data-v-3d741d05] {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n.nkd-row--controls[data-v-3d741d05] { padding: 5px 8px 3px;\n}\n.nkd-row--presets[data-v-3d741d05]  { padding: 3px 8px 5px; border-top: 1px solid var(--border-color, rgba(255,255,255,0.06));\n}\n.nkd-spacer[data-v-3d741d05] { flex: 1 1 auto;\n}\n.nkd-hint[data-v-3d741d05] {\n  font-size: 9.5px;\n  color: rgba(255,255,255,0.32);\n  opacity: 0.7;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.nkd-label[data-v-3d741d05] {\n  font-size: 10px;\n  color: var(--descrip-text, rgba(255,255,255,0.45));\n  white-space: nowrap;\n}\n.nkd-select--preset[data-v-3d741d05] { flex: 1 1 auto; min-width: 0; max-width: 240px;\n}\n.nkd-select--interp[data-v-3d741d05] { flex: 0 0 auto; padding: 2px 4px; font-size: 10px;\n}\n.nkd-btn[data-v-3d741d05], .nkd-select[data-v-3d741d05] {\n  background: var(--comfy-input-bg, #252830);\n  border: 1px solid var(--border-color, #3a3d46);\n  color: var(--input-text, rgba(255,255,255,0.65));\n  border-radius: 5px;\n  padding: 2px 8px;\n  font-size: 11px;\n  transition: border-color 0.12s, color 0.12s, background 0.12s;\n  cursor: pointer;\n}\n.nkd-btn[data-v-3d741d05]:hover, .nkd-select[data-v-3d741d05]:hover, .nkd-select[data-v-3d741d05]:focus {\n  border-color: #4ab4ff;\n  color: rgba(255,255,255,0.95);\n}\n.nkd-btn[data-v-3d741d05]:disabled {\n  opacity: 0.35;\n  cursor: not-allowed;\n}\n\n.nkd-root[data-v-8ab4835f] {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  box-sizing: border-box;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border: 1px solid var(--border-color, #2a2d36);\n  border-radius: 6px;\n  overflow: hidden;\n  font: 11px Inter, sans-serif;\n}\n.nkd-root[data-v-8ab4835f], .nkd-root[data-v-8ab4835f] *, .nkd-root[data-v-8ab4835f] *::before, .nkd-root[data-v-8ab4835f] *::after {\n  box-sizing: border-box;\n}\n.nkd-canvas[data-v-8ab4835f] {\n  width: 100%;\n  aspect-ratio: 320 / 210;\n  height: auto;\n  display: block;\n  cursor: default;\n  flex: 0 0 auto;\n}\n.nkd-bar[data-v-8ab4835f] {\n  flex: 0 0 auto;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border-top: 1px solid var(--border-color, #2a2d36);\n}\n.nkd-row[data-v-8ab4835f] {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n.nkd-row--controls[data-v-8ab4835f] { padding: 5px 8px;\n}\n.nkd-spacer[data-v-8ab4835f] { flex: 1 1 auto;\n}\n.nkd-hint[data-v-8ab4835f] {\n  font-size: 9.5px;\n  color: rgba(255,255,255,0.32);\n  opacity: 0.7;\n  white-space: nowrap;\n}\n.nkd-btn[data-v-8ab4835f] {\n  background: var(--comfy-input-bg, #252830);\n  border: 1px solid var(--border-color, #3a3d46);\n  color: var(--input-text, rgba(255,255,255,0.65));\n  border-radius: 5px;\n  padding: 2px 8px;\n  font-size: 11px;\n  cursor: pointer;\n  transition: border-color 0.12s, color 0.12s, background 0.12s;\n}\n.nkd-btn[data-v-8ab4835f]:hover {\n  border-color: #4ab4ff;\n  color: rgba(255,255,255,0.95);\n}\n\n.nkd-root[data-v-aa41997d] {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  box-sizing: border-box;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border: 1px solid var(--border-color, #2a2d36);\n  border-radius: 6px;\n  overflow: hidden;\n  font: 11px Inter, sans-serif;\n}\n.nkd-root[data-v-aa41997d], .nkd-root[data-v-aa41997d] *, .nkd-root[data-v-aa41997d] *::before, .nkd-root[data-v-aa41997d] *::after {\n  box-sizing: border-box;\n}\n.nkd-canvas[data-v-aa41997d] {\n  width: 100%;\n  height: auto;\n  display: block;\n  flex: 0 0 auto;\n}\n.nkd-bar[data-v-aa41997d] {\n  flex: 0 0 auto;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border-top: 1px solid var(--border-color, #2a2d36);\n}\n.nkd-row[data-v-aa41997d] {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n.nkd-row--controls[data-v-aa41997d] { padding: 5px 8px;\n}\n.nkd-hint[data-v-aa41997d] {\n  font-size: 9.5px;\n  color: rgba(255,255,255,0.32);\n  opacity: 0.7;\n  white-space: nowrap;\n}\n\n.nkd-root[data-v-773b27a5] {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  box-sizing: border-box;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border: 1px solid var(--border-color, #2a2d36);\n  border-radius: 6px;\n  overflow: hidden;\n  font: 11px Inter, sans-serif;\n}\n.nkd-root[data-v-773b27a5], .nkd-root[data-v-773b27a5] *, .nkd-root[data-v-773b27a5] *::before, .nkd-root[data-v-773b27a5] *::after { box-sizing: border-box;\n}\n.nkd-canvas[data-v-773b27a5] { width: 100%; height: auto; display: block; flex: 0 0 auto;\n}\n.nkd-bar[data-v-773b27a5] {\n  flex: 0 0 auto;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border-top: 1px solid var(--border-color, #2a2d36);\n}\n.nkd-row[data-v-773b27a5] { display: flex; align-items: center; gap: 6px;\n}\n.nkd-row--controls[data-v-773b27a5] { padding: 5px 8px;\n}\n.nkd-hint[data-v-773b27a5] { font-size: 9.5px; color: rgba(255,255,255,0.32); opacity: 0.7; white-space: nowrap;\n}\n\n.nkd-root[data-v-86ec67a6] {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  box-sizing: border-box;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border: 1px solid var(--border-color, #2a2d36);\n  border-radius: 6px;\n  overflow: hidden;\n  font: 11px Inter, sans-serif;\n}\n.nkd-root[data-v-86ec67a6], .nkd-root[data-v-86ec67a6] *, .nkd-root[data-v-86ec67a6] *::before, .nkd-root[data-v-86ec67a6] *::after { box-sizing: border-box;\n}\n.nkd-canvas[data-v-86ec67a6] { width: 100%; height: auto; display: block; flex: 0 0 auto;\n}\n.nkd-canvas--pan[data-v-86ec67a6] { cursor: grab;\n}\n.nkd-canvas--pan[data-v-86ec67a6]:active { cursor: grabbing;\n}\n.nkd-spacer[data-v-86ec67a6] { flex: 1 1 auto;\n}\n.nkd-btn[data-v-86ec67a6] {\n  background: var(--comfy-input-bg, #252830);\n  border: 1px solid var(--border-color, #3a3d46);\n  color: var(--input-text, rgba(255,255,255,0.65));\n  border-radius: 5px;\n  padding: 1px 7px;\n  font-size: 10px;\n  cursor: pointer;\n  transition: border-color 0.12s, color 0.12s;\n}\n.nkd-btn[data-v-86ec67a6]:hover { border-color: #4ab4ff; color: rgba(255,255,255,0.95);\n}\n.nkd-bar[data-v-86ec67a6] { flex: 0 0 auto; background: var(--comfy-menu-bg, #1a1c22); border-top: 1px solid var(--border-color, #2a2d36);\n}\n.nkd-row[data-v-86ec67a6] { display: flex; align-items: center; gap: 6px;\n}\n.nkd-row--controls[data-v-86ec67a6] { padding: 5px 8px;\n}\n.nkd-hint[data-v-86ec67a6] { font-size: 9.5px; color: rgba(255,255,255,0.32); opacity: 0.7; white-space: nowrap;\n}\n.nkd-label[data-v-86ec67a6] { font-size: 9.5px; color: rgba(255,255,255,0.45); white-space: nowrap;\n}\n.nkd-slider[data-v-86ec67a6] {\n  flex: 1 1 auto;\n  min-width: 40px;\n  height: 3px;\n  accent-color: #4ab4ff;\n  cursor: ew-resize;\n}'));
      document.head.appendChild(elementStyle);
    }
  } catch (e) {
    console.error("vite-plugin-css-injected-by-js", e);
  }
})();
