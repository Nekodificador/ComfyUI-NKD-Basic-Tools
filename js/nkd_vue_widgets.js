var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
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
    function serialise2() {
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
    function deserialise2(text) {
      renderText(text);
    }
    function emitChange() {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => props.onChange(serialise2()), 120);
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
    __expose({ serialise: serialise2, deserialise: deserialise2, setVariables, cleanup });
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
function buildRampLut(stops, interp2) {
  const lut = new Uint8ClampedArray(256 * 3);
  let si = 0;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    if (interp2 === "steps") {
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
    if (interp2 === "bezier") f = smoothstep(f);
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
function expandStops(stops, interp2, remap = (p2) => p2) {
  const out = [];
  if (interp2 === "steps") {
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
    const needsSub = interp2 === "bezier" || warped || Math.abs((a.mid ?? 0.5) - 0.5) > 1e-4;
    const n = needsSub ? SUB : 1;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      let e = midWarp(u, a.mid);
      if (interp2 === "bezier") e = smoothstep(e);
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
    const C2 = {
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
    const interp2 = /* @__PURE__ */ ref("smooth");
    let activeStop = null;
    let hoverStop = null;
    let draggingMid = null;
    let hoverMid = null;
    let dragging = false;
    let dragOffsetX = 0;
    let downX = 0, downY = 0, moved = false;
    function clamp012(v) {
      return Math.max(0, Math.min(1, v));
    }
    function normalizeHex(c) {
      return /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : "#000000";
    }
    function toCanvasX(pos) {
      return PAD2.left + pos * IW;
    }
    function fromCanvasX(x) {
      return clamp012((x - PAD2.left) / IW);
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
      ctx.fillStyle = C2.bg;
      ctx.fillRect(0, 0, CW, CH);
      const grad = ctx.createLinearGradient(PAD2.left, 0, PAD2.left + IW, 0);
      const sorted = [...stops.value].sort((a, b) => a.pos - b.pos);
      for (const s of expandStops(sorted, interp2.value)) grad.addColorStop(clamp012(s.pos), s.color);
      ctx.fillStyle = grad;
      roundRectPath(PAD2.left, BAR_Y, IW, BAR_H, 5);
      ctx.fill();
      ctx.strokeStyle = C2.gridBorder;
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
          ctx.strokeStyle = C2.active;
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
        ctx.strokeStyle = C2.ptStroke;
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
      ctx.fillStyle = C2.tooltipBg;
      ctx.strokeStyle = dragging ? "rgba(255,107,107,0.6)" : C2.tooltipBorder;
      ctx.lineWidth = 1;
      roundRectPath(tx, ty, w, h, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C2.tooltipText;
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
        activeStop.pos = clamp012(fromCanvasX(x) + dragOffsetX);
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
      interp2.value = "smooth";
      activeStop = null;
      emitChange();
      redraw();
    }
    function reverse() {
      stops.value = stops.value.map((s) => ({ pos: clamp012(1 - s.pos), color: s.color })).sort((a, b) => a.pos - b.pos);
      activeStop = null;
      emitChange();
      redraw();
    }
    function onInterpChange(mode) {
      interp2.value = parseInterp(JSON.stringify({ interp: mode }));
      emitChange();
      redraw();
    }
    let debounceTimer;
    function serialise2() {
      return JSON.stringify({
        stops: [...stops.value].sort((a, b) => a.pos - b.pos),
        interp: interp2.value
      });
    }
    function emitChange() {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => props.onChange(serialise2()), 60);
    }
    function deserialise2(json) {
      try {
        const data = JSON.parse(json);
        if (Array.isArray(data.stops) && data.stops.length >= 2) {
          stops.value = data.stops.map((s) => ({
            pos: clamp012(Number(s.pos)),
            color: normalizeHex(String(s.color)),
            mid: Number.isFinite(s.mid) ? Math.min(0.95, Math.max(0.05, Number(s.mid))) : 0.5
          })).sort((a, b) => a.pos - b.pos);
          interp2.value = parseInterp(json);
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
        pos: clamp012(s.pos),
        color: normalizeHex(s.color),
        mid: Number.isFinite(s.mid) ? Math.min(0.95, Math.max(0.05, Number(s.mid))) : 0.5
      }));
      if (p2.interp) interp2.value = parseInterp(JSON.stringify({ interp: p2.interp }));
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
      const payload = { name, stops: [...stops.value].sort((a, b) => a.pos - b.pos), interp: interp2.value };
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
    __expose({ serialise: serialise2, deserialise: deserialise2, forceResize, cleanup });
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
              value: interp2.value,
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
    function drawTooltip(at2, text) {
      if (!ctx) return;
      ctx.font = "10px monospace";
      const textW = ctx.measureText(text).width;
      const padX = 6, h = 16;
      const w = textW + padX * 2;
      let tx = at2[0] - w / 2;
      tx = Math.max(2, Math.min(BOX_W - w - 2, tx));
      let ty = at2[1] - 12 - h;
      if (ty < 2) ty = at2[1] + 12;
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
        props.onChange(serialise2());
      }, 40);
    }
    function serialise2() {
      return JSON.stringify({ p0: p0.value, p1: p1.value, mid: mid.value });
    }
    function deserialise2(json) {
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
    __expose({ serialise: serialise2, deserialise: deserialise2, refreshExternal, forceResize, cleanup, setSentImage });
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
const GradientPreviewWidget = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-f11c2d3f"]]);
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
function srgbToLinear$1(v) {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearToSrgb$1(v) {
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
  const toWork = (v) => opts.linear ? srgbToLinear$1(v) : v;
  const toDisp = (v) => opts.linear ? linearToSrgb$1(v) : v;
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
const FrequencyPreviewWidget = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-cf839f24"]]);
const _M1 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005]
];
const _M2 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766]
];
const _M1_INV = [
  [4.076741661347994, -3.3077115904081933, 0.23096992872942793],
  [-1.2684380040921763, 2.6097574006633715, -0.3413193963102196],
  [-0.004196086541837079, -0.7034186144594495, 1.7076147009309446]
];
const _M2_INV = [
  [0.9999999984505196, 0.39633779217376774, 0.2158037580607588],
  [1.0000000088817607, -0.10556134232365633, -0.0638541747717059],
  [1.0000000546724108, -0.08948418209496574, -1.2914855378640917]
];
function matVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}
const cbrt = Math.cbrt;
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  return c <= 31308e-7 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
}
function srgbToOklab(rgb) {
  const lin = [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
  const lms = matVec(_M1, lin);
  const lms_ = [cbrt(lms[0]), cbrt(lms[1]), cbrt(lms[2])];
  return matVec(_M2, lms_);
}
function oklabToLinear(lab) {
  const lms_ = matVec(_M2_INV, lab);
  const lms = [lms_[0] ** 3, lms_[1] ** 3, lms_[2] ** 3];
  return matVec(_M1_INV, lms);
}
function oklabToSrgb(lab) {
  const lin = oklabToLinear(lab);
  return [linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2])];
}
const DEG = 180 / Math.PI;
const RAD$2 = Math.PI / 180;
function mod(a, n) {
  return (a % n + n) % n;
}
function oklabToOklch(lab) {
  const [L, a, b] = lab;
  const C2 = Math.hypot(a, b);
  const h = mod(Math.atan2(b, a) * DEG, 360);
  return [L, C2, h];
}
function oklchToOklab(lch) {
  const [L, C2, h] = lch;
  const r = h * RAD$2;
  return [L, C2 * Math.cos(r), C2 * Math.sin(r)];
}
function srgbToHsl(rgb) {
  const [r, g, b] = rgb;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const L = (mx + mn) / 2;
  const S = d === 0 ? 0 : d / (1 - Math.abs(2 * L - 1) + 1e-12);
  let h = 0;
  if (d !== 0) {
    if (mx === r) {
      h = mod((g - b) / (d + 1e-12), 6);
    } else if (mx === g) {
      h = (b - r) / (d + 1e-12) + 2;
    } else if (mx === b) {
      h = (r - g) / (d + 1e-12) + 4;
    }
  }
  h = mod(h * 60, 360);
  return [h, S, L];
}
const RYB_ANCHORS = [
  [0, 29.2339],
  // red
  [60, 52.7757],
  // orange
  [120, 109.7692],
  // yellow
  [180, 142.4953],
  // green
  [240, 264.052],
  // blue
  [300, 293.774],
  // violet
  [360, 389.2339]
  // red (wrap)
];
const RGB_ANCHORS = [
  [0, 29.2339],
  // red
  [60, 109.7692],
  // yellow
  [120, 142.4953],
  // green
  [180, 194.7689],
  // cyan
  [240, 264.052],
  // blue
  [300, 328.3634],
  // magenta
  [360, 389.2339]
  // red (wrap)
];
const OKLCH_ANCHORS = [[0, 0], [360, 360]];
const DEFAULT_ANCHORS = RYB_ANCHORS;
const WHEEL_MODES = {
  ryb: { label: "RYB", anchors: RYB_ANCHORS },
  rgb: { label: "RGB", anchors: RGB_ANCHORS },
  oklch: { label: "OKLCh", anchors: OKLCH_ANCHORS }
};
function interp(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  const n = xs.length;
  if (x >= xs[n - 1]) return ys[n - 1];
  for (let i = 1; i < n; i++) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[n - 1];
}
function displayToHue(displayDeg, anchors = DEFAULT_ANCHORS) {
  const xs = anchors.map((a) => a[0]);
  const ys = anchors.map((a) => a[1]);
  return mod(interp(mod(displayDeg, 360), xs, ys), 360);
}
function hueToDisplay(hueDeg, anchors = DEFAULT_ANCHORS) {
  const xs = anchors.map((a) => a[0]);
  const ys = anchors.map((a) => a[1]);
  const h = mod(hueDeg - ys[0], 360) + ys[0];
  return mod(interp(h, ys, xs), 360);
}
function srgbToEngine(rgb) {
  const [, C2, h] = oklabToOklch(srgbToOklab(rgb));
  return [h, C2 / C_REF];
}
function meshColumnHues(m) {
  if (m.hues && m.hues.length === m.hue_segments) return m.hues;
  const out = [];
  for (let s = 0; s < m.hue_segments; s++) out.push(s * 360 / m.hue_segments);
  return out;
}
function wheelColumnHues(S, anchors = DEFAULT_ANCHORS) {
  const out = [];
  let prev = -Infinity;
  for (let s = 0; s < S; s++) {
    let h = displayToHue(s * 360 / S, anchors);
    while (h < prev) h += 360;
    prev = h;
    out.push(h);
  }
  return out;
}
function meshIdentity(hueSegments = 12, satRings = 6, hues = null) {
  const offsets = [];
  for (let r = 0; r <= satRings; r++) {
    const ring = [];
    for (let s = 0; s < hueSegments; s++) ring.push([0, 0, 0]);
    offsets.push(ring);
  }
  return {
    hue_segments: hueSegments | 0,
    sat_rings: satRings | 0,
    offsets,
    neutral: [0, 0],
    hues: hues ? hues.slice() : null
  };
}
function meshFromDict(d) {
  return {
    hue_segments: d.hue_segments | 0,
    sat_rings: d.sat_rings | 0,
    offsets: d.offsets.map((ring) => ring.map((c) => [c[0], c[1], c[2]])),
    neutral: d.neutral ? [d.neutral[0], d.neutral[1]] : [0, 0],
    hues: d.hues ? d.hues.map((x) => +x) : null
  };
}
function meshToDict(m) {
  return {
    hue_segments: m.hue_segments,
    sat_rings: m.sat_rings,
    offsets: m.offsets.map((ring) => ring.map((c) => [c[0], c[1], c[2]])),
    neutral: m.neutral ? [m.neutral[0], m.neutral[1]] : [0, 0],
    hues: m.hues ? m.hues.slice() : null
  };
}
function meshSample(m, hueDeg, satNorm) {
  const off = m.offsets;
  const R = m.sat_rings;
  const S = m.hue_segments;
  const hue = mod(hueDeg, 360);
  const sat = Math.min(Math.max(satNorm, 0), 1);
  const rf = sat * R;
  let ri = Math.floor(rf);
  ri = Math.min(Math.max(ri, 0), R - 1);
  const rt = rf - ri;
  const hs = meshColumnHues(m);
  const h2 = mod(hue - hs[0], 360) + hs[0];
  let sj = S - 1;
  for (let j = S - 1; j >= 0; j--) {
    if (h2 >= hs[j]) {
      sj = j;
      break;
    }
  }
  const hiEdge = sj === S - 1 ? hs[0] + 360 : hs[sj + 1];
  const st = (h2 - hs[sj]) / (hiEdge - hs[sj]);
  const sj1 = mod(sj + 1, S);
  const disp = (rr, ss) => {
    const baseSat = rr / R;
    const bh = hs[ss] * RAD$2;
    const o = off[rr][ss];
    const ang = bh + o[0] * RAD$2;
    const dsat = Math.max(baseSat + o[1], 0);
    return [
      dsat * Math.cos(ang) - baseSat * Math.cos(bh),
      dsat * Math.sin(ang) - baseSat * Math.sin(bh)
    ];
  };
  const v00 = disp(ri, sj), v01 = disp(ri, sj1);
  const v10 = disp(ri + 1, sj), v11 = disp(ri + 1, sj1);
  const vx = (v00[0] * (1 - st) + v01[0] * st) * (1 - rt) + (v10[0] * (1 - st) + v11[0] * st) * rt;
  const vy = (v00[1] * (1 - st) + v01[1] * st) * (1 - rt) + (v10[1] * (1 - st) + v11[1] * st) * rt;
  const hr = hue * RAD$2;
  const ux = sat * Math.cos(hr) + vx;
  const uy = sat * Math.sin(hr) + vy;
  const sat2 = Math.hypot(ux, uy);
  const outH = Math.atan2(uy, ux) / RAD$2;
  const dh = sat2 > 1e-12 ? mod(outH - hue + 180, 360) - 180 : 0;
  const ds = sat2 - sat;
  const dl = (off[ri][sj][2] * (1 - st) + off[ri][sj1][2] * st) * (1 - rt) + (off[ri + 1][sj][2] * (1 - st) + off[ri + 1][sj1][2] * st) * rt;
  return [dh, ds, dl];
}
const SKIN_LOCUS = {
  hueLo: 26.3,
  hueHi: 58.2,
  // [OKLab L, max chroma] — linearly interpolated, clamped outside the range.
  envelope: [
    [0.325, 0.0579],
    [0.375, 0.0654],
    [0.425, 0.071],
    [0.475, 0.0796],
    [0.525, 0.0894],
    [0.575, 0.0988],
    [0.625, 0.1055],
    [0.675, 0.1135],
    [0.725, 0.1235],
    [0.775, 0.1275],
    [0.825, 0.1146]
  ]
};
function skinChromaAt(L) {
  const e = SKIN_LOCUS.envelope;
  if (L < e[0][0] || L > e[e.length - 1][0]) return 0;
  for (let i = 1; i < e.length; i++) {
    if (L <= e[i][0]) {
      const t = (L - e[i - 1][0]) / (e[i][0] - e[i - 1][0]);
      return e[i - 1][1] + t * (e[i][1] - e[i - 1][1]);
    }
  }
  return e[e.length - 1][1];
}
function dither(seed) {
  let v = (seed ^ 2654435769) >>> 0;
  v = Math.imul(v ^ v >>> 15, 2246822507) >>> 0;
  v = Math.imul(v ^ v >>> 13, 3266489909) >>> 0;
  return ((v ^ v >>> 16) >>> 0) / 4294967296 - 0.5;
}
function latticeStep(data) {
  let g = 0;
  for (let i = 0; i < data.length; i++) {
    let a = g, b = data[i];
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    g = a;
    if (g === 1) return 1;
  }
  return g;
}
const KNEE_SAT = 0.12;
const KNEE_R = 0.45;
const OUT_SLOPE = (1 - KNEE_R) / (1 - KNEE_SAT);
const RADIAL_MODES = {
  // Metric-honest: screen distance ∝ perceptual chroma. Everything crushed in.
  linear: {
    label: "Linear",
    toRadius: (s) => s <= 0 ? 0 : s,
    toSat: (r) => r <= 0 ? 0 : r
  },
  // Magnifying glass on the neutral band. Locally LINEAR on both sides of the
  // knee, so within the band a cast twice as strong is still drawn twice as far
  // out — and the gain is bounded (×3.75), unlike sqrt, which blows near-zero
  // shadow noise into a fat ball.
  neutral: {
    label: "Neutrals",
    toRadius: (s) => s <= 0 ? 0 : s <= KNEE_SAT ? s * (KNEE_R / KNEE_SAT) : KNEE_R + (s - KNEE_SAT) * OUT_SLOPE,
    toSat: (r) => r <= 0 ? 0 : r <= KNEE_R ? r * (KNEE_SAT / KNEE_R) : KNEE_SAT + (r - KNEE_R) / OUT_SLOPE
  },
  // Continuous spread, no knee to reason about; gain → ∞ at the centre.
  sqrt: {
    label: "Sqrt",
    toRadius: (s) => s <= 0 ? 0 : Math.sqrt(s),
    toSat: (r) => r <= 0 ? 0 : r * r
  }
};
const C_REF = 0.35;
function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}
const GAMUT_EPS = 1e-9;
const GAMUT_ITERS = 22;
function inGamut(lin) {
  return lin[0] >= -GAMUT_EPS && lin[0] <= 1 + GAMUT_EPS && lin[1] >= -GAMUT_EPS && lin[1] <= 1 + GAMUT_EPS && lin[2] >= -GAMUT_EPS && lin[2] <= 1 + GAMUT_EPS;
}
function compressToGamut(lab) {
  if (inGamut(oklabToLinear(lab))) return lab;
  const [L, a, b] = lab;
  let lo = 0, hi = 1;
  for (let i = 0; i < GAMUT_ITERS; i++) {
    const mid = 0.5 * (lo + hi);
    if (inGamut(oklabToLinear([L, a * mid, b * mid]))) lo = mid;
    else hi = mid;
  }
  return [L, a * lo, b * lo];
}
function bakeLut(m, size = 33) {
  const out = new Float64Array(size * size * size * 3);
  const step = size > 1 ? 1 / (size - 1) : 0;
  const na = m.neutral ? m.neutral[0] : 0, nb = m.neutral ? m.neutral[1] : 0;
  for (let ri = 0; ri < size; ri++) {
    const r = ri * step;
    for (let gi = 0; gi < size; gi++) {
      const g = gi * step;
      for (let bi = 0; bi < size; bi++) {
        const b = bi * step;
        const lab = srgbToOklab([r, g, b]);
        const [L, C2, h] = oklabToOklch(lab);
        const sat = C2 / C_REF;
        const [dh, ds, dl] = meshSample(m, h, sat);
        const h2 = mod(h + dh, 360);
        const sat2 = Math.max(sat + ds, 0);
        const C22 = sat2 * C_REF;
        const L2 = clamp(L + dl, 0, 1);
        const lab2 = oklchToOklab([L2, C22, h2]);
        lab2[1] += na;
        lab2[2] += nb;
        const rgb = oklabToSrgb(compressToGamut(lab2));
        const idx = ((ri * size + gi) * size + bi) * 3;
        out[idx] = clamp(rgb[0], 0, 1);
        out[idx + 1] = clamp(rgb[1], 0, 1);
        out[idx + 2] = clamp(rgb[2], 0, 1);
      }
    }
  }
  return out;
}
function applyRgb(lut, size, rgb) {
  const N = size;
  const r = clamp(rgb[0], 0, 1);
  const g = clamp(rgb[1], 0, 1);
  const b = clamp(rgb[2], 0, 1);
  const pr = r * (N - 1);
  const pg = g * (N - 1);
  const pb = b * (N - 1);
  const r0 = clamp(Math.floor(pr), 0, N - 2);
  const g0 = clamp(Math.floor(pg), 0, N - 2);
  const b0 = clamp(Math.floor(pb), 0, N - 2);
  const fr = pr - r0;
  const fg = pg - g0;
  const fb = pb - b0;
  const at2 = (dr, dg, db, c) => lut[(((r0 + dr) * N + (g0 + dg)) * N + (b0 + db)) * 3 + c];
  const res = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c00 = at2(0, 0, 0, c) * (1 - fr) + at2(1, 0, 0, c) * fr;
    const c01 = at2(0, 0, 1, c) * (1 - fr) + at2(1, 0, 1, c) * fr;
    const c10 = at2(0, 1, 0, c) * (1 - fr) + at2(1, 1, 0, c) * fr;
    const c11 = at2(0, 1, 1, c) * (1 - fr) + at2(1, 1, 1, c) * fr;
    const c0 = c00 * (1 - fg) + c10 * fg;
    const c1 = c01 * (1 - fg) + c11 * fg;
    res[c] = c0 * (1 - fb) + c1 * fb;
  }
  return res;
}
const GRID_LINE = "rgba(120,180,255,0.35)";
const WEB_LINE = "rgba(120,180,255,0.55)";
const ACCENT$1 = "#4ab4ff";
const RAD$1 = Math.PI / 180;
const SKIN_HSL_LO = 15;
const SKIN_HSL_LINE = 20;
const SKIN_HSL_HI = 25;
const SKIN_LINE = "rgba(255,190,150,0.6)";
const SKIN_FAN = "rgba(255,190,150,0.10)";
const SKIN_CALIB_SAT = 0.5;
function wheelHslHue(engHue, sat) {
  const rad = engHue * RAD$1, ca = Math.cos(rad), sb = Math.sin(rad);
  const L = WHEEL_L + (cuspL(engHue) - WHEEL_L) * sat;
  let C2 = sat * C_REF * WHEEL_CHROMA;
  if (!linInGamut(oklabToLinear([L, C2 * ca, C2 * sb]))) {
    let lo = 0, hi = C2;
    for (let it = 0; it < 24; it++) {
      const mid = (lo + hi) / 2;
      if (linInGamut(oklabToLinear([L, mid * ca, mid * sb]))) lo = mid;
      else hi = mid;
    }
    C2 = lo;
  }
  const lin = oklabToLinear([L, C2 * ca, C2 * sb]);
  return srgbToHsl([linearToSrgb(clamp01$2(lin[0])), linearToSrgb(clamp01$2(lin[1])), linearToSrgb(clamp01$2(lin[2]))])[0];
}
function engineHueForWheelHsl(hslHue) {
  let lo = 0, hi = 110;
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2;
    if (wheelHslHue(mid, SKIN_CALIB_SAT) < hslHue) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
let skinHuesTab = null;
function skinHues() {
  if (!skinHuesTab) skinHuesTab = {
    lo: engineHueForWheelHsl(SKIN_HSL_LO),
    line: engineHueForWheelHsl(SKIN_HSL_LINE),
    hi: engineHueForWheelHsl(SKIN_HSL_HI)
  };
  return skinHuesTab;
}
const R_IDLE = 6;
const R_HOVER = 7;
const R_CENTER = 4.5;
const R_DEP = 3;
const HIT_PX = 14;
const MARQUEE_MIN$1 = 4;
const SHIFT_ROT_PER_PX = 0.3;
const SHIFT_SAT_PER_PX = 3e-3;
const SHIFT_AXIS_MIN = 4;
const LUMA_PER_WHEEL = 15e-4;
function angleRad(displayDeg) {
  return (displayDeg - 90) * RAD$1;
}
function clamp01$2(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function wrapDeg(d) {
  return ((d + 180) % 360 + 360) % 360 - 180;
}
const WHEEL_L = 0.72;
const WHEEL_CHROMA = 0.9;
const WHEEL_L_SMOOTH_DEG = 12;
const WHEEL_OOG_FADE = 0;
let gammaLut = null;
function srgbByte(lin) {
  if (!gammaLut) {
    gammaLut = new Uint8Array(4097);
    for (let i = 0; i <= 4096; i++) gammaLut[i] = Math.round(linearToSrgb(i / 4096) * 255);
  }
  return gammaLut[lin <= 0 ? 0 : lin >= 1 ? 4096 : Math.round(lin * 4096)];
}
function linInGamut(lin) {
  return lin[0] >= 0 && lin[0] <= 1 && lin[1] >= 0 && lin[1] <= 1 && lin[2] >= 0 && lin[2] <= 1;
}
let cuspLTab = null;
function cuspL(hueDeg) {
  if (!cuspLTab) {
    cuspLTab = new Float64Array(721);
    const PHI = 0.6180339887498949;
    for (let i = 0; i <= 720; i++) {
      const rad = i * 0.5 * RAD$1;
      const ca = Math.cos(rad), sb = Math.sin(rad);
      const maxC = (L) => {
        let lo = 0, hi = 0.5;
        for (let it = 0; it < 16; it++) {
          const mid = (lo + hi) / 2;
          if (linInGamut(oklabToLinear([L, mid * ca, mid * sb]))) lo = mid;
          else hi = mid;
        }
        return lo;
      };
      let a = 0.02, b = 0.998;
      let x1 = b - PHI * (b - a), x2 = a + PHI * (b - a);
      let f1 = maxC(x1), f2 = maxC(x2);
      for (let it = 0; it < 30; it++) {
        if (f1 < f2) {
          a = x1;
          x1 = x2;
          f1 = f2;
          x2 = a + PHI * (b - a);
          f2 = maxC(x2);
        } else {
          b = x2;
          x2 = x1;
          f2 = f1;
          x1 = b - PHI * (b - a);
          f1 = maxC(x1);
        }
      }
      cuspLTab[i] = (a + b) / 2;
    }
    {
      const sigma = WHEEL_L_SMOOTH_DEG * 2;
      const radius = Math.ceil(sigma * 3);
      const kernel = new Float64Array(radius * 2 + 1);
      let ksum = 0;
      for (let k = -radius; k <= radius; k++) {
        const w = Math.exp(-(k * k) / (2 * sigma * sigma));
        kernel[k + radius] = w;
        ksum += w;
      }
      const raw = cuspLTab.slice(0, 720);
      for (let i = 0; i < 720; i++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += raw[(i + k + 720 * 4) % 720] * kernel[k + radius];
        cuspLTab[i] = s / ksum;
      }
      cuspLTab[720] = cuspLTab[0];
    }
  }
  const h = (hueDeg % 360 + 360) % 360;
  const p2 = h * 2;
  const i0 = Math.floor(p2), f = p2 - i0;
  return cuspLTab[i0] * (1 - f) + cuspLTab[Math.min(i0 + 1, 720)] * f;
}
class ColorWarpGrid {
  constructor(canvas) {
    __publicField(this, "canvas");
    __publicField(this, "ctx");
    __publicField(this, "dpr", Math.max(window.devicePixelRatio || 1, 2));
    __publicField(this, "mesh", null);
    __publicField(this, "source", null);
    // Public interaction toggles (viewer toolbar drives these).
    __publicField(this, "pin", false);
    __publicField(this, "labels", false);
    // A1… node coordinate labels
    __publicField(this, "cb", {});
    // Active wheel mode: the display↔OKLCh-hue projection. Mesh data is engine-
    // space, so switching modes only reprojects the view.
    __publicField(this, "modeName", "ryb");
    __publicField(this, "anchors", WHEEL_MODES.ryb.anchors);
    // Cached h2d table (0.5° steps) for per-point hot paths (scatter/indicator).
    __publicField(this, "h2dTab", null);
    // Active radial mode: the sat↔radius twin of the above. Same contract — the
    // mesh stays in engine sat, only the drawing/hit-testing radius changes.
    __publicField(this, "radialName", "neutral");
    __publicField(this, "radial", RADIAL_MODES.neutral);
    __publicField(this, "remoteRaf", 0);
    __publicField(this, "remoteDx", 0);
    __publicField(this, "remoteDy", 0);
    // Geometry in CSS px, recomputed on resize.
    __publicField(this, "cx", 0);
    __publicField(this, "cy", 0);
    __publicField(this, "R", 0);
    __publicField(this, "cssW", 0);
    __publicField(this, "cssH", 0);
    // Cached wheel (device-px ImageData) keyed by device size.
    __publicField(this, "wheel", null);
    __publicField(this, "wheelKey", "");
    // Cached scatter: ENGINE [oklchHueDeg, sat] per sampled pixel — wheel-mode
    // independent; projected through h2dFast at draw time.
    __publicField(this, "scatter", null);
    // Drag / hover state.
    __publicField(this, "hover", null);
    // [ri, sj] under cursor
    __publicField(this, "drag", null);
    // Box-select: nodes moved together + the live marquee rect [x0,y0,x1,y1].
    __publicField(this, "selected", /* @__PURE__ */ new Set());
    __publicField(this, "marquee", null);
    // Preview-hover indicator: ENGINE [oklchHueDeg, sat, cssColor] or null.
    __publicField(this, "indicator", null);
    // Autonomy: nodes the user has fixed ("ri,sj"). Rim nodes are autonomous by
    // default (each arm's root). A dependent node is interpolated between its two
    // bracketing autonomous nodes on its arm; dragging a node makes it autonomous.
    __publicField(this, "autonomous", /* @__PURE__ */ new Set());
    __publicField(this, "scatter16", null);
    __publicField(this, "onDown", (e) => {
      if (!this.mesh || this.R < 2) return;
      const [x, y] = this.localXY(e);
      if (e.shiftKey) {
        const hit = this.hitTest(x, y);
        if (!hit) return;
        this.drag = { kind: "shift", ri: hit[0], sj: hit[1], startX: x, startY: y, start: this.cloneOffsets(), pointerId: e.pointerId };
      } else {
        const hit = this.hitTest(x, y);
        if (hit && this.selected.has(this.key(hit[0], hit[1]))) {
          this.drag = { kind: "group", ri: hit[0], sj: hit[1], startX: x, startY: y, start: [], pointerId: e.pointerId, groupStart: this.selectionSnapshot() };
        } else if (hit) {
          if (this.selected.size) {
            this.selected.clear();
            this.draw();
          }
          this.drag = { kind: "node", ri: hit[0], sj: hit[1], startX: x, startY: y, start: this.cloneOffsets(), pointerId: e.pointerId };
        } else {
          this.drag = { kind: "marquee", ri: 0, sj: 0, startX: x, startY: y, start: [], pointerId: e.pointerId };
          this.marquee = [x, y, x, y];
        }
      }
      this.canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    // Drag moves are COALESCED to one per animation frame: each applied move
    // triggers scatter warp + preview rebake downstream, and pointermove fires at
    // the mouse rate (125-1000 Hz) — driving the pipeline per event ran ~5 fps.
    __publicField(this, "moveRaf", 0);
    __publicField(this, "lastMoveEv", null);
    __publicField(this, "onMove", (e) => {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      if (!this.mesh || this.R < 2) return;
      if (this.drag) {
        this.lastMoveEv = e;
        if (!this.moveRaf) {
          this.moveRaf = requestAnimationFrame(() => {
            this.moveRaf = 0;
            if (this.lastMoveEv) this.applyDragMove(this.lastMoveEv);
          });
        }
        return;
      }
      const [x, y] = this.localXY(e);
      const hit = this.hitTest(x, y);
      const changed = (hit == null ? void 0 : hit[0]) !== ((_a = this.hover) == null ? void 0 : _a[0]) || (hit == null ? void 0 : hit[1]) !== ((_b = this.hover) == null ? void 0 : _b[1]);
      this.hover = hit;
      if (changed) this.draw();
      if (hit) {
        const off = this.mesh.offsets[hit[0]][hit[1]];
        (_d = (_c = this.cb).onHover) == null ? void 0 : _d.call(_c, { ri: hit[0], sj: hit[1], dh: off[0], ds: off[1], dl: off[2] }, e.clientX, e.clientY);
      } else {
        (_f = (_e = this.cb).onHover) == null ? void 0 : _f.call(_e, null, e.clientX, e.clientY);
      }
      const [disp, sat] = this.toPolar(x, y);
      const inside = Math.hypot(x - this.cx, y - this.cy) <= this.R;
      (_h = (_g = this.cb).onGridCursor) == null ? void 0 : _h.call(_g, this.d2h(disp), sat, e.altKey, inside);
    });
    __publicField(this, "onUp", (e) => {
      if (!this.drag) return;
      if (this.moveRaf) {
        cancelAnimationFrame(this.moveRaf);
        this.moveRaf = 0;
      }
      if (this.lastMoveEv) {
        this.applyDragMove(this.lastMoveEv);
        this.lastMoveEv = null;
      }
      try {
        this.canvas.releasePointerCapture(this.drag.pointerId);
      } catch {
      }
      const wasMarquee = this.drag.kind === "marquee";
      this.drag = null;
      if (wasMarquee) {
        this.finishMarquee();
        this.marquee = null;
        this.draw();
        return;
      }
      this.draw();
      this.emit(true);
    });
    __publicField(this, "onDblClick", (e) => {
      if (!this.mesh) return;
      const [x, y] = this.localXY(e);
      const hit = this.hitTest(x, y);
      if (!hit) return;
      const [ri, sj] = hit;
      const o = this.mesh.offsets[ri][sj];
      o[0] = 0;
      o[1] = 0;
      o[2] = 0;
      if (ri !== this.mesh.sat_rings) this.autonomous.delete(this.key(ri, sj));
      if (ri === 0) {
        this.mesh.neutral = [0, 0];
        for (let s = 0; s < this.mesh.hue_segments; s++) this.recomputeSpoke(s);
      } else {
        this.recomputeSpoke(sj);
      }
      this.draw();
      this.emit(true);
      e.preventDefault();
    });
    // Alt+wheel over a node adjusts its luma (dl ∈ [-1,1]) (Phase 6.2). Over a
    // box-selected node the delta applies to every selected node — relative, so
    // each keeps its own prior dl.
    __publicField(this, "onWheel", (e) => {
      if (!this.mesh || !e.altKey) return;
      const [x, y] = this.localXY(e);
      const hit = this.hitTest(x, y);
      if (!hit) return;
      e.preventDefault();
      this.nudgeLuma(hit[0], hit[1], e.deltaY);
    });
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("dblclick", this.onDblClick);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }
  d2h(displayDeg) {
    return displayToHue(displayDeg, this.anchors);
  }
  h2d(hueDeg) {
    return hueToDisplay(hueDeg, this.anchors);
  }
  h2dFast(hueDeg) {
    if (!this.h2dTab) {
      const t = new Float32Array(721);
      for (let i = 0; i <= 720; i++) t[i] = this.h2d(i * 0.5);
      this.h2dTab = t;
    }
    const h = (hueDeg % 360 + 360) % 360;
    return this.h2dTab[Math.round(h * 2)];
  }
  // --- remote editing from the image preview (3DLC-style) -------------------
  // The viewer grabs the node governing the SOURCE color under the cursor and
  // replays pointer deltas here. Shift / selection / luma behave like local
  // drags because the same drag machinery runs underneath.
  // Node governing a SOURCE engine position: nearest ring (≥1) + nearest column.
  nodeForEngine(hueDeg, sat) {
    const m = this.mesh;
    if (!m) return null;
    const R = m.sat_rings;
    const ri = Math.min(Math.max(Math.round(clamp01$2(sat) * R), 1), R);
    const hues = meshColumnHues(m);
    let best = 0, bestD = Infinity;
    for (let s = 0; s < m.hue_segments; s++) {
      const d = Math.abs(wrapDeg(hueDeg - hues[s]));
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return [ri, best];
  }
  beginRemoteDrag(ri, sj, shift) {
    const [px, py] = this.nodePt(ri, sj);
    const kind = shift ? "shift" : this.selected.has(this.key(ri, sj)) ? "group" : "node";
    this.drag = {
      kind,
      ri,
      sj,
      startX: px,
      startY: py,
      start: this.cloneOffsets(),
      pointerId: -1,
      groupStart: kind === "group" ? this.selectionSnapshot() : void 0
    };
    this.remoteDx = 0;
    this.remoteDy = 0;
    this.draw();
  }
  moveRemoteDrag(dx, dy) {
    this.remoteDx = dx;
    this.remoteDy = dy;
    if (this.remoteRaf) return;
    this.remoteRaf = requestAnimationFrame(() => {
      this.remoteRaf = 0;
      this.applyRemote(false);
    });
  }
  endRemoteDrag() {
    if (this.remoteRaf) {
      cancelAnimationFrame(this.remoteRaf);
      this.remoteRaf = 0;
    }
    this.applyRemote(true);
    this.drag = null;
    this.draw();
  }
  applyRemote(commit) {
    const d = this.drag;
    if (!d || !this.mesh) return;
    const x = d.startX + this.remoteDx, y = d.startY + this.remoteDy;
    if (d.kind === "node") this.dragNode(x, y);
    else if (d.kind === "group") this.dragGroup(x, y);
    else this.dragShift(x, y);
    this.draw();
    this.emit(commit);
  }
  // Luma nudge (wheel): applies to the whole selection when the node is in one.
  nudgeLuma(ri, sj, deltaY) {
    if (!this.mesh) return;
    const targets = this.selected.has(this.key(ri, sj)) ? [...this.selected].map((k) => k.split(",").map(Number)) : [[ri, sj]];
    for (const [rr, ss] of targets) {
      if (rr === 0) continue;
      const o = this.mesh.offsets[rr][ss];
      o[2] = Math.min(Math.max(o[2] - deltaY * LUMA_PER_WHEEL, -1), 1);
    }
    this.draw();
    this.emit(true);
  }
  // Minimal API for external editors sharing this mesh (the Hue/Luma strip
  // mutates the same Mesh object, then notifies through here).
  notifyExternalEdit(commit) {
    this.draw();
    this.emit(commit);
  }
  refresh() {
    this.draw();
  }
  projectHue(hue) {
    return this.h2d(hue);
  }
  engineHueAt(displayDeg) {
    return this.d2h(displayDeg);
  }
  getWheelMode() {
    return this.modeName;
  }
  setWheelMode(name) {
    this.modeName = name;
    this.anchors = WHEEL_MODES[name].anchors;
    this.h2dTab = null;
    this.wheelKey = "";
    if (this.mesh && isIdentityMesh(this.mesh)) {
      this.mesh.hues = wheelColumnHues(this.mesh.hue_segments, this.anchors);
      this.initAutonomy();
    }
    this.draw();
  }
  getRadialMode() {
    return this.radialName;
  }
  setRadialMode(name) {
    this.radialName = name;
    this.radial = RADIAL_MODES[name];
    this.wheelKey = "";
    this.draw();
  }
  setMesh(mesh) {
    this.mesh = mesh;
    if (isIdentityMesh(mesh)) mesh.hues = wheelColumnHues(mesh.hue_segments, this.anchors);
    this.initAutonomy();
    this.draw();
  }
  getMesh() {
    return this.mesh;
  }
  setSource(src) {
    this.source = src;
    this.scatter = null;
    this.draw();
  }
  // Optional 16-bit source companion (backend push, RGB uint16 row-major):
  // the scatter reconstructs from this instead of the 8-bit canvas — 65536
  // levels make the cloud effectively continuous, no dither needed.
  setScatter16(s) {
    this.scatter16 = s;
    this.scatter = null;
    this.draw();
  }
  // Preview → grid indicator dot (Phase 7.1). ENGINE coords (OKLCh hue + sat);
  // stored engine-side so a wheel-mode switch reprojects it. Pass null to clear.
  setIndicator(engineHue, sat = 0, css = "#fff") {
    this.indicator = engineHue == null ? null : [engineHue, sat, css];
    this.draw();
  }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.cx = w / 2;
    this.cy = h / 2;
    this.R = Math.min(w, h) / 2 * 0.9;
    this.draw();
  }
  dispose() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("dblclick", this.onDblClick);
    c.removeEventListener("wheel", this.onWheel);
  }
  // --- geometry ------------------------------------------------------------
  // display angle + ENGINE sat → CSS-px screen point. The radius goes through
  // the active radial mode: every node, dot, ring and indicator inherits the
  // projection from here, so the mesh keeps living in absolute chroma.
  polar(displayDeg, sat) {
    const a = angleRad(displayDeg);
    const r = this.radial.toRadius(sat) * this.R;
    return [this.cx + r * Math.cos(a), this.cy + r * Math.sin(a)];
  }
  // Inverse: CSS-px screen point → [displayDeg, engine sat] (clamped to [0,1]).
  toPolar(x, y) {
    const dx = x - this.cx, dy = y - this.cy;
    const sat = this.radial.toSat(clamp01$2(Math.hypot(dx, dy) / (this.R || 1)));
    let disp = Math.atan2(dy, dx) / RAD$1 + 90;
    disp = (disp % 360 + 360) % 360;
    return [disp, sat];
  }
  // A mesh node's warped on-screen position (matches meshSample's center-safe
  // hue push: warpedHue = baseHue + dhRaw*baseSat). This is THE hit-test/inverse
  // reference used by every drag path.
  nodePt(ri, sj) {
    const m = this.mesh;
    if (ri === 0) {
      const n = m.neutral ?? [0, 0];
      const C2 = Math.hypot(n[0], n[1]);
      const hue = (Math.atan2(n[1], n[0]) * 180 / Math.PI + 360) % 360;
      return this.polar(this.h2d(hue), Math.min(C2 / C_REF, 1));
    }
    const R = m.sat_rings;
    const baseSat = ri / R;
    const off = m.offsets[ri][sj];
    const warpedHue = meshColumnHues(m)[sj] + off[0];
    const warpedDisp = this.h2d(warpedHue);
    const warpedSat = clamp01$2(baseSat + off[1]);
    return this.polar(warpedDisp, warpedSat);
  }
  // --- autonomy / hierarchy ------------------------------------------------
  key(ri, sj) {
    return ri + "," + sj;
  }
  // A node's warped polar position [displayAngle, sat] (polar twin of nodePt).
  nodePolar(ri, sj) {
    const m = this.mesh;
    const R = m.sat_rings;
    const baseSat = ri / R;
    const off = m.offsets[ri][sj];
    const warpedHue = meshColumnHues(m)[sj] + off[0];
    return [this.h2d(warpedHue), clamp01$2(baseSat + off[1])];
  }
  // Write the offset that places node (ri,sj) at a display angle + sat (keeps luma).
  setNodePolar(ri, sj, angle, sat) {
    const m = this.mesh;
    const R = m.sat_rings;
    const baseSat = ri / R;
    const baseHue = meshColumnHues(m)[sj];
    const o = m.offsets[ri][sj];
    o[0] = wrapDeg(this.d2h(angle) - baseHue);
    o[1] = sat - baseSat;
  }
  // Default anchors: the rim node of every spoke (each arm's root).
  initAutonomy() {
    this.autonomous.clear();
    const m = this.mesh;
    if (!m) return;
    for (let sj = 0; sj < m.hue_segments; sj++) this.autonomous.add(this.key(m.sat_rings, sj));
  }
  // Reposition one spoke's dependent nodes: each is INTERPOLATED between its two
  // bracketing autonomous nodes on this arm — the nearest inward (or the centre,
  // sat 0) and the nearest outward (the rim is a default anchor). Autonomous
  // nodes keep their explicit position.
  recomputeSpoke(sj) {
    const m = this.mesh, R = m.sat_rings;
    for (let rr = 1; rr <= R; rr++) {
      if (this.autonomous.has(this.key(rr, sj))) continue;
      let abv = -1;
      for (let aa = rr + 1; aa <= R; aa++) if (this.autonomous.has(this.key(aa, sj))) {
        abv = aa;
        break;
      }
      if (abv < 0) continue;
      let blo = 0;
      for (let bb = rr - 1; bb >= 1; bb--) if (this.autonomous.has(this.key(bb, sj))) {
        blo = bb;
        break;
      }
      const [angA, satA] = this.nodePolar(abv, sj);
      const t = (rr - blo) / (abv - blo);
      let angle, sat;
      if (blo === 0) {
        const [bx, by] = this.polar(angA, satA * t);
        const [vx, vy] = this.centerDisp();
        const w = 1 - t;
        [angle, sat] = this.toPolar(bx + vx * w, by + vy * w);
      } else {
        const [angB, satB] = this.nodePolar(blo, sj);
        const [axS, ayS] = this.polar(angA, satA);
        const [bxS, byS] = this.polar(angB, satB);
        [angle, sat] = this.toPolar(bxS + (axS - bxS) * t, byS + (ayS - byS) * t);
      }
      this.setNodePolar(rr, sj, angle, sat);
    }
  }
  // Nearest control node to a CSS-px point, within HIT_PX. Center (ri=0) counted
  // once. Returns [ri, sj] or null.
  hitTest(x, y) {
    const m = this.mesh;
    if (!m) return null;
    const R = m.sat_rings, S = m.hue_segments;
    let best = null;
    let bestD = HIT_PX * HIT_PX;
    const consider = (ri, sj) => {
      const [px, py] = this.nodePt(ri, sj);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < bestD) {
        bestD = d;
        best = [ri, sj];
      }
    };
    for (let ri = 1; ri <= R; ri++) for (let sj = 0; sj < S; sj++) consider(ri, sj);
    consider(0, 0);
    return best;
  }
  // --- interaction ---------------------------------------------------------
  localXY(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  cloneOffsets() {
    return this.mesh.offsets.map((ring) => ring.map((c) => [c[0], c[1], c[2]]));
  }
  // The centre node's screen-space displacement from the canvas origin (the
  // vector by which the centre was dragged), used to stretch — not collapse — the web.
  centerDisp() {
    const [px, py] = this.nodePt(0, 0);
    return [px - this.cx, py - this.cy];
  }
  // Snapshot selected nodes' current screen positions (for group/scale/rotate).
  selectionSnapshot() {
    return [...this.selected].map((k) => {
      const [ri, sj] = k.split(",").map(Number);
      const [x, y] = this.nodePt(ri, sj);
      return { ri, sj, x, y };
    });
  }
  emit(commit) {
    var _a, _b;
    (_b = (_a = this.cb).onEdit) == null ? void 0 : _b.call(_a, JSON.stringify(meshToDict(this.mesh)), commit);
  }
  // Apply the latest coalesced drag move (one per frame).
  applyDragMove(e) {
    var _a, _b;
    if (!this.drag || !this.mesh) return;
    const [x, y] = this.localXY(e);
    if (this.drag.kind === "marquee") {
      this.marquee = [this.drag.startX, this.drag.startY, x, y];
      this.draw();
      return;
    }
    if (this.drag.kind === "node") this.dragNode(x, y);
    else if (this.drag.kind === "group") this.dragGroup(x, y);
    else this.dragShift(x, y);
    this.draw();
    this.emit(false);
    const { ri, sj } = this.drag;
    const off = this.mesh.offsets[ri][sj];
    (_b = (_a = this.cb).onHover) == null ? void 0 : _b.call(_a, { ri, sj, dh: off[0], ds: off[1], dl: off[2] }, e.clientX, e.clientY);
  }
  // Move every selected node by the same screen delta (box-select group drag).
  dragGroup(x, y) {
    const d = this.drag;
    const dx = x - d.startX, dy = y - d.startY;
    const spokes = /* @__PURE__ */ new Set();
    for (const g of d.groupStart) {
      if (g.ri === 0) continue;
      const [disp, sat] = this.toPolar(g.x + dx, g.y + dy);
      this.autonomous.add(this.key(g.ri, g.sj));
      this.setNodePolar(g.ri, g.sj, disp, sat);
      spokes.add(g.sj);
    }
    for (const sj of spokes) this.recomputeSpoke(sj);
  }
  // Select every node whose handle falls inside the marquee rect. A tiny rect
  // (a click, not a drag) clears the selection instead.
  finishMarquee() {
    const m = this.marquee;
    if (!m || !this.mesh) return;
    const x0 = Math.min(m[0], m[2]), x1 = Math.max(m[0], m[2]);
    const y0 = Math.min(m[1], m[3]), y1 = Math.max(m[1], m[3]);
    this.selected.clear();
    if (x1 - x0 < MARQUEE_MIN$1 && y1 - y0 < MARQUEE_MIN$1) return;
    const R = this.mesh.sat_rings, S = this.mesh.hue_segments;
    for (let ri = 1; ri <= R; ri++)
      for (let sj = 0; sj < S; sj++) {
        const [px, py] = this.nodePt(ri, sj);
        if (px >= x0 && px <= x1 && py >= y0 && py <= y1) this.selected.add(this.key(ri, sj));
      }
  }
  // Clear the selection; returns whether there was one (Esc handling).
  clearSelection() {
    if (!this.selected.size) return false;
    this.selected.clear();
    this.draw();
    return true;
  }
  // Drag a node → it becomes AUTONOMOUS (fixed at the cursor); the dependent nodes
  // on its arm re-interpolate between the autonomous anchors (nearest inward/centre
  // ↔ nearest outward/rim). Other spokes stay put (3DLC hierarchy). Pin All moves
  // only the grabbed node.
  dragNode(x, y) {
    const m = this.mesh;
    const { ri, sj } = this.drag;
    const [disp, sat] = this.toPolar(x, y);
    if (ri === 0) {
      const rad = this.d2h(disp) * Math.PI / 180;
      const C2 = sat * C_REF;
      m.neutral = [C2 * Math.cos(rad), C2 * Math.sin(rad)];
      for (let s = 0; s < m.hue_segments; s++) this.recomputeSpoke(s);
      return;
    }
    this.autonomous.add(this.key(ri, sj));
    this.setNodePolar(ri, sj, disp, sat);
    if (!this.pin) this.recomputeSpoke(sj);
  }
  // Shift = a normal node drag (dependents follow the same) but on locked SCREEN
  // axes, independent of the node's position: horizontal mouse pivots the hue
  // (rotate around the circle at constant radius), vertical moves it in/out (sat).
  // If the grabbed node belongs to a box-selection, the SAME delta applies to
  // every selected node — each from its OWN starting offsets (relative move).
  dragShift(x, y) {
    const m = this.mesh;
    const R = m.sat_rings;
    const d = this.drag;
    const { ri, sj, startX, startY, start } = d;
    if (ri === 0) return;
    const dx = x - startX, dy = y - startY;
    if (!d.axis && Math.hypot(dx, dy) > SHIFT_AXIS_MIN) d.axis = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
    const targets = this.selected.has(this.key(ri, sj)) ? [...this.selected].map((k) => k.split(",").map(Number)) : [[ri, sj]];
    const hues = meshColumnHues(m);
    const spokes = /* @__PURE__ */ new Set();
    for (const [rr, ss] of targets) {
      if (rr === 0) continue;
      const baseSat = rr / R;
      const snapAngle = this.h2d(hues[ss] + start[rr][ss][0]);
      const snapSat = clamp01$2(baseSat + start[rr][ss][1]);
      const angle = d.axis === "h" ? snapAngle + dx * SHIFT_ROT_PER_PX : snapAngle;
      const sat = d.axis === "v" ? clamp01$2(this.radial.toSat(clamp01$2(this.radial.toRadius(snapSat) - dy * SHIFT_SAT_PER_PX))) : snapSat;
      this.autonomous.add(this.key(rr, ss));
      this.setNodePolar(rr, ss, angle, sat);
      spokes.add(ss);
    }
    if (!this.pin) for (const ss of spokes) this.recomputeSpoke(ss);
  }
  // Reset all offsets to identity (keeps current density) (Phase 8).
  resetAll() {
    if (!this.mesh) return;
    const R = this.mesh.sat_rings, S = this.mesh.hue_segments;
    for (let rr = 0; rr <= R; rr++)
      for (let ss = 0; ss < S; ss++) this.mesh.offsets[rr][ss] = [0, 0, 0];
    this.mesh.neutral = [0, 0];
    this.initAutonomy();
    this.draw();
    this.emit(true);
  }
  // Change grid density (spokes and/or rings, DaVinci-style). Resets offsets to
  // identity at the new resolution — remapping arbitrary warps across densities
  // isn't meaningful. Columns anchor on the ACTIVE wheel mode's layout.
  setDensity(hueSegments, satRings) {
    var _a, _b;
    const S = hueSegments ?? ((_a = this.mesh) == null ? void 0 : _a.hue_segments) ?? 12;
    const R = satRings ?? ((_b = this.mesh) == null ? void 0 : _b.sat_rings) ?? 6;
    this.mesh = meshIdentity(S, R, wheelColumnHues(S, this.anchors));
    this.initAutonomy();
    this.hover = null;
    this.selected.clear();
    this.draw();
    this.emit(true);
  }
  // --- rendering -----------------------------------------------------------
  // Paint the background wheel in ENGINE space: radius = C/C_REF, angle through
  // the active mode's projection. Per sample, L blends from WHEEL_L (centre)
  // to the hue's gamut-cusp L (rim) and chroma is COMPRESSED to the sRGB
  // boundary at constant L/hue — never per-channel clamped, which washed the
  // blue/violet/cyan sectors into one pale tone. Colors are computed on a small
  // polar table (0.5° × NR radii) and bilinearly sampled per pixel, so the cost
  // is independent of canvas resolution.
  buildWheel() {
    const dw = this.canvas.width, dh = this.canvas.height;
    const key = `${dw}x${dh}:${this.modeName}:${this.radialName}`;
    if (this.wheel && this.wheelKey === key) return;
    const NA = 720, NR = 48;
    const tab = new Uint8Array(NA * (NR + 1) * 3);
    for (let a = 0; a < NA; a++) {
      const hue = this.d2h(a * 360 / NA);
      const rad = hue * RAD$1, ca = Math.cos(rad), sb = Math.sin(rad);
      const Lc = cuspL(hue);
      for (let r = 0; r <= NR; r++) {
        const sat = this.radial.toSat(r / NR);
        const L = WHEEL_L + (Lc - WHEEL_L) * sat;
        const C2 = sat * C_REF * WHEEL_CHROMA;
        let lin = oklabToLinear([L, C2 * ca, C2 * sb]);
        if (!linInGamut(lin)) {
          let lo = 0, hi = C2;
          for (let it = 0; it < 12; it++) {
            const mid = (lo + hi) / 2;
            if (linInGamut(oklabToLinear([L, mid * ca, mid * sb]))) lo = mid;
            else hi = mid;
          }
          lin = oklabToLinear([L, lo * ca, lo * sb]);
          const t = Math.min(1, (C2 - lo) / (0.35 * C_REF));
          const fade = 1 - WHEEL_OOG_FADE * t * t;
          lin = [lin[0] * fade, lin[1] * fade, lin[2] * fade];
        }
        const o = (a * (NR + 1) + r) * 3;
        tab[o] = srgbByte(lin[0]);
        tab[o + 1] = srgbByte(lin[1]);
        tab[o + 2] = srgbByte(lin[2]);
      }
    }
    const img = new ImageData(dw, dh);
    const data = img.data;
    const cx = this.cx * this.dpr, cy = this.cy * this.dpr, R = this.R * this.dpr;
    for (let y = 0; y < dh; y++) {
      const dy = y - cy;
      for (let x = 0; x < dw; x++) {
        const dx = x - cx;
        const dist = Math.hypot(dx, dy);
        const k = (y * dw + x) * 4;
        if (dist > R) {
          data[k + 3] = 0;
          continue;
        }
        let disp = Math.atan2(dy, dx) / RAD$1 + 90;
        disp = (disp % 360 + 360) % 360;
        const ap = disp / 360 * NA;
        const a0 = Math.floor(ap) % NA, a1 = (a0 + 1) % NA, fa = ap - Math.floor(ap);
        const rp = Math.min(dist / R, 1) * NR;
        const r0 = Math.min(Math.floor(rp), NR - 1), fr = rp - r0;
        const o00 = (a0 * (NR + 1) + r0) * 3, o01 = o00 + 3;
        const o10 = (a1 * (NR + 1) + r0) * 3, o11 = o10 + 3;
        for (let c = 0; c < 3; c++) {
          const v0 = tab[o00 + c] * (1 - fr) + tab[o01 + c] * fr;
          const v1 = tab[o10 + c] * (1 - fr) + tab[o11 + c] * fr;
          data[k + c] = Math.round(v0 * (1 - fa) + v1 * fa);
        }
        data[k + 3] = 255;
      }
    }
    this.wheel = img;
    this.wheelKey = key;
  }
  // Sample source pixels → ENGINE [oklchHueDeg, sat] cloud (Phase 3). Downsample
  // longest side to ≤256. Engine coords = where the mesh actually warps each
  // pixel; the wheel projection is applied at draw time (h2dFast).
  buildScatter() {
    if (this.scatter) return;
    if (this.scatter16) {
      const { data, width: sw2, height: sh2 } = this.scatter16;
      const q = latticeStep(data);
      const step2 = Math.max(1, Math.round(Math.sqrt(sw2 * sh2 / 2e4)));
      const out2 = new Float32Array(Math.ceil(sw2 / step2) * Math.ceil(sh2 / step2) * 2);
      let n2 = 0;
      for (let y = 0; y < sh2; y += step2) {
        for (let x = 0; x < sw2; x += step2) {
          const k = (y * sw2 + x) * 3;
          const [h, s] = q > 1 ? srgbToEngine([
            clamp01$2((data[k] + dither(k) * q) / 65535),
            clamp01$2((data[k + 1] + dither(k + 1) * q) / 65535),
            clamp01$2((data[k + 2] + dither(k + 2) * q) / 65535)
          ]) : srgbToEngine([data[k] / 65535, data[k + 1] / 65535, data[k + 2] / 65535]);
          out2[n2++] = h;
          out2[n2++] = clamp01$2(s);
        }
      }
      this.scatter = out2.subarray(0, n2);
      return;
    }
    if (!this.source) return;
    const iw = this.source.width, ih = this.source.height;
    if (!iw || !ih) return;
    const longest = Math.max(iw, ih);
    const scale = longest > 256 ? 256 / longest : 1;
    const sw = Math.max(1, Math.round(iw * scale));
    const sh = Math.max(1, Math.round(ih * scale));
    const tmp = document.createElement("canvas");
    tmp.width = sw;
    tmp.height = sh;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(this.source, 0, 0, sw, sh);
    const px = tctx.getImageData(0, 0, sw, sh).data;
    const step = Math.max(1, Math.round(Math.sqrt(sw * sh / 2e4)));
    const out = new Float32Array(Math.ceil(sw / step) * Math.ceil(sh / step) * 2);
    let n = 0;
    for (let y = 0; y < sh; y += step) {
      for (let x = 0; x < sw; x += step) {
        const k = (y * sw + x) * 4;
        const [h, s] = srgbToEngine([
          clamp01$2((px[k] + dither(k)) / 255),
          clamp01$2((px[k + 1] + dither(k + 1)) / 255),
          clamp01$2((px[k + 2] + dither(k + 2)) / 255)
        ]);
        out[n++] = h;
        out[n++] = clamp01$2(s);
      }
    }
    this.scatter = out.subarray(0, n);
  }
  draw() {
    if (!this.ctx || this.cssW < 2) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.buildWheel();
    if (this.wheel) ctx.putImageData(this.wheel, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawScatter(ctx);
    this.drawReferenceGrid(ctx);
    if (this.mesh) this.drawWeb(ctx, this.mesh);
    if (this.labels && this.mesh) this.drawLabels(ctx);
    this.drawIndicator(ctx);
    this.drawMarquee(ctx);
  }
  drawMarquee(ctx) {
    if (!this.marquee) return;
    const [x0, y0, x1, y1] = this.marquee;
    const rx = Math.min(x0, x1), ry = Math.min(y0, y1);
    const rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
    ctx.save();
    ctx.fillStyle = "rgba(74,180,255,0.10)";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = ACCENT$1;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
  }
  // Coordinate labels (letter = spoke, number = ring) next to each node, so
  // drag behaviour can be discussed by exact node name (toolbar "Labels").
  drawLabels(ctx) {
    const R = this.mesh.sat_rings, S = this.mesh.hue_segments;
    ctx.save();
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const label = (x, y, text) => {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(text, x + 9, y - 9);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, x + 9, y - 9);
    };
    for (let ri = 1; ri <= R; ri++)
      for (let sj = 0; sj < S; sj++) {
        const [x, y] = this.nodePt(ri, sj);
        label(x, y, `${sj < 26 ? String.fromCharCode(65 + sj) : String(sj)}${ri}`);
      }
    const [cx, cy] = this.nodePt(0, 0);
    label(cx, cy, "0");
    ctx.restore();
  }
  // Vectorscope cloud: the dots are pushed through the SAME meshSample +
  // neutral cast the LUT bakes, so the cloud shows live where the image's
  // colors are LANDING. Destination only — a faint source "ghost" was tried
  // and dropped: dense clusters stack alpha into a bright blob that reads as
  // unmoved colors (the Alt mask already shows what a cell grabs).
  drawScatter(ctx) {
    this.buildScatter();
    if (!this.scatter) return;
    const s = this.scatter;
    const m = this.mesh;
    const warped = !!m && !isIdentityMesh(m);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    const d = Math.min(Math.max(this.R / 400, 1), 2.5);
    const o = d / 2;
    ctx.globalAlpha = Math.min(0.5, 0.55 / d);
    for (let i = 0; i < s.length; i += 2) {
      let h = s[i], sat = s[i + 1];
      if (warped) [h, sat] = this.warpPoint(m, h, sat);
      const [x, y] = this.polar(this.h2dFast(h), sat);
      ctx.fillRect(x - o, y - o, d, d);
    }
    ctx.restore();
  }
  // Engine-space warp of one scatter point: meshSample (dh, ds) + the global
  // neutral (a,b) cast — the polar mirror of what lut.bake does (sans gamut).
  warpPoint(m, h, sat) {
    const [dh, ds] = meshSample(m, h, sat);
    let hue = h + dh;
    let s2 = clamp01$2(sat + ds);
    const n = m.neutral;
    if (n && (n[0] || n[1])) {
      const C2 = s2 * C_REF;
      const rad = hue * RAD$1;
      const a = C2 * Math.cos(rad) + n[0];
      const b = C2 * Math.sin(rad) + n[1];
      hue = Math.atan2(b, a) / RAD$1;
      s2 = clamp01$2(Math.hypot(a, b) / C_REF);
    }
    return [hue, s2];
  }
  // Static reference net: sat_rings concentric circles + hue_segments spokes.
  // Spokes sit at the PROJECTED column hues — on the wheel the mesh was created
  // in they are display-uniform; other modes show them where they truly act.
  drawReferenceGrid(ctx) {
    if (!this.mesh) return;
    const R = this.mesh.sat_rings, S = this.mesh.hue_segments;
    const hues = meshColumnHues(this.mesh);
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    for (let i = 1; i <= R; i++) {
      const rad = this.radial.toRadius(i / R) * this.R;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let j = 0; j < S; j++) {
      const [x, y] = this.polar(this.h2d(hues[j]), 1);
      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.save();
    ctx.fillStyle = SKIN_FAN;
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy);
    const skin = skinHues();
    const FAN_STEPS = 16;
    for (let i = 0; i <= FAN_STEPS; i++) {
      const h = skin.lo + (skin.hi - skin.lo) * (i / FAN_STEPS);
      const [fx, fy] = this.polar(this.h2d(h), 1);
      ctx.lineTo(fx, fy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const [sx, sy] = this.polar(this.h2d(skin.line), 1);
    ctx.save();
    ctx.strokeStyle = SKIN_LINE;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = SKIN_LINE;
    ctx.font = "600 10px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    const [lx, ly] = this.polar(this.h2d(skin.line), this.radial.toSat(1.045));
    ctx.fillText("skin", lx, ly);
    ctx.restore();
  }
  // The deformable mesh web: each control node placed at its warped position,
  // ring polylines + spoke polylines through them, plus handles.
  drawWeb(ctx, mesh) {
    var _a, _b;
    const R = mesh.sat_rings, S = mesh.hue_segments;
    const pt = (ri, sj) => this.nodePt(ri, sj);
    ctx.strokeStyle = WEB_LINE;
    ctx.lineWidth = 1;
    for (let ri = 1; ri <= R; ri++) {
      ctx.beginPath();
      for (let sj = 0; sj <= S; sj++) {
        const [x, y] = pt(ri, sj % S);
        sj ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    for (let sj = 0; sj < S; sj++) {
      ctx.beginPath();
      for (let ri = 0; ri <= R; ri++) {
        const [x, y] = pt(ri, sj);
        ri ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1.5;
    const hovRi = this.drag ? this.drag.ri : (_a = this.hover) == null ? void 0 : _a[0];
    const hovSj = this.drag ? this.drag.sj : (_b = this.hover) == null ? void 0 : _b[1];
    const drawHandle = (x, y, ri, sj, base) => {
      const isHot = ri === hovRi && sj === hovSj;
      const r = isHot ? R_HOVER : base;
      const dl = mesh.offsets[ri][sj][2];
      ctx.fillStyle = dl === 0 ? ACCENT$1 : mixLuma(ACCENT$1, dl);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (isHot) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
      } else if (this.selected.has(this.key(ri, sj))) {
        ctx.strokeStyle = ACCENT$1;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1.5;
      }
    };
    for (let ri = 1; ri <= R; ri++) {
      for (let sj = 0; sj < S; sj++) {
        const [x, y] = pt(ri, sj);
        drawHandle(x, y, ri, sj, this.autonomous.has(this.key(ri, sj)) ? R_IDLE : R_DEP);
      }
    }
    const [cx0, cy0] = pt(0, 0);
    drawHandle(cx0, cy0, 0, 0, R_CENTER);
  }
  drawIndicator(ctx) {
    if (!this.indicator) return;
    const [engHue, sat, css] = this.indicator;
    const [x, y] = this.polar(this.h2dFast(engHue), sat);
    ctx.save();
    ctx.fillStyle = css;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
const DL_RANGE = 0.5;
const STRIP_PAD_X = 14;
const STRIP_PAD_Y = 10;
const STRIP_HIT = 16;
class ColorWarpLumaStrip {
  constructor(canvas, grid) {
    __publicField(this, "canvas");
    __publicField(this, "ctx");
    __publicField(this, "dpr", Math.max(window.devicePixelRatio || 1, 2));
    __publicField(this, "grid");
    __publicField(this, "cssW", 0);
    __publicField(this, "cssH", 0);
    __publicField(this, "drag", null);
    __publicField(this, "hover", null);
    __publicField(this, "onDown", (e) => {
      const [x, y] = this.localXY(e);
      const hit = this.hitTest(x, y);
      if (hit == null) return;
      this.drag = { sj: hit, pointerId: e.pointerId };
      this.canvas.setPointerCapture(e.pointerId);
      this.apply(hit, y, false);
      e.preventDefault();
    });
    __publicField(this, "onMove", (e) => {
      const [x, y] = this.localXY(e);
      if (this.drag) {
        this.apply(this.drag.sj, y, false);
        return;
      }
      const hit = this.hitTest(x, y);
      if (hit !== this.hover) {
        this.hover = hit;
        this.draw();
      }
      this.canvas.style.cursor = hit == null ? "default" : "ns-resize";
    });
    __publicField(this, "onUp", (e) => {
      if (!this.drag) return;
      try {
        this.canvas.releasePointerCapture(this.drag.pointerId);
      } catch {
      }
      const sj = this.drag.sj;
      this.drag = null;
      const [, y] = this.localXY(e);
      this.apply(sj, y, true);
    });
    __publicField(this, "onDblClick", (e) => {
      const [x, y] = this.localXY(e);
      const hit = this.hitTest(x, y);
      const m = this.mesh();
      if (hit == null || !m) return;
      for (let r = 1; r <= m.sat_rings; r++) m.offsets[r][hit][2] = 0;
      this.grid.notifyExternalEdit(true);
      this.draw();
      e.preventDefault();
    });
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.grid = grid;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("dblclick", this.onDblClick);
  }
  dispose() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("dblclick", this.onDblClick);
  }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.draw();
  }
  refresh() {
    this.draw();
  }
  mesh() {
    return this.grid.getMesh();
  }
  xOf(displayDeg) {
    return STRIP_PAD_X + displayDeg / 360 * (this.cssW - 2 * STRIP_PAD_X);
  }
  yOf(dl) {
    const half = this.cssH / 2 - STRIP_PAD_Y;
    const t = Math.max(-1, Math.min(1, dl / DL_RANGE));
    return this.cssH / 2 - t * half;
  }
  dlAt(y) {
    const half = this.cssH / 2 - STRIP_PAD_Y;
    return Math.max(-1, Math.min(1, (this.cssH / 2 - y) / half)) * DL_RANGE;
  }
  // Handle per column at its projected x, sorted for the polyline.
  columns() {
    const m = this.mesh();
    if (!m || this.cssW < 2) return [];
    const hues = meshColumnHues(m);
    const R = m.sat_rings;
    const cols = [];
    for (let sj = 0; sj < m.hue_segments; sj++) {
      const dl = m.offsets[R][sj][2];
      cols.push({ sj, x: this.xOf(this.grid.projectHue(hues[sj])), y: this.yOf(dl), dl });
    }
    cols.sort((a, b) => a.x - b.x);
    return cols;
  }
  localXY(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  hitTest(x, y) {
    let best = null;
    let bestD = STRIP_HIT * STRIP_HIT;
    for (const c of this.columns()) {
      const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
      if (d < bestD) {
        bestD = d;
        best = c.sj;
      }
    }
    return best;
  }
  apply(sj, y, commit) {
    const m = this.mesh();
    if (!m) return;
    const dl = this.dlAt(y);
    for (let r = 1; r <= m.sat_rings; r++) m.offsets[r][sj][2] = dl;
    this.grid.notifyExternalEdit(commit);
    this.draw();
  }
  draw() {
    const ctx = this.ctx;
    if (!ctx || this.cssW < 2) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#14161b";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const m = this.mesh();
    if (!m) return;
    const x0 = STRIP_PAD_X, x1 = this.cssW - STRIP_PAD_X;
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    for (let i = 0; i <= 72; i++) {
      const hue = this.grid.engineHueAt(i / 72 * 360);
      const r = hue * RAD$1;
      const lin = oklabToLinear([cuspL(hue), 0.14 * Math.cos(r), 0.14 * Math.sin(r)]);
      grad.addColorStop(i / 72, `rgb(${srgbByte(lin[0])},${srgbByte(lin[1])},${srgbByte(lin[2])})`);
    }
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = grad;
    ctx.fillRect(x0, STRIP_PAD_Y, x1 - x0, this.cssH - 2 * STRIP_PAD_Y);
    ctx.globalAlpha = 1;
    const midY = this.cssH / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, midY);
    ctx.lineTo(x1, midY);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "600 9px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("+L", 2, STRIP_PAD_Y + 4);
    ctx.fillText("−L", 2, this.cssH - STRIP_PAD_Y - 4);
    const cols = this.columns();
    if (!cols.length) return;
    ctx.strokeStyle = WEB_LINE;
    ctx.beginPath();
    cols.forEach((c, i) => i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y));
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1.5;
    for (const c of cols) {
      const hot = this.drag ? c.sj === this.drag.sj : c.sj === this.hover;
      ctx.fillStyle = c.dl === 0 ? ACCENT$1 : mixLuma(ACCENT$1, c.dl);
      ctx.beginPath();
      ctx.arc(c.x, c.y, hot ? R_HOVER : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (hot) {
        ctx.strokeStyle = "#fff";
        ctx.beginPath();
        ctx.arc(c.x, c.y, (hot ? R_HOVER : 5) + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.fillStyle = "#fff";
        ctx.font = "600 10px Inter, system-ui, sans-serif";
        ctx.fillText(`dl ${c.dl >= 0 ? "+" : ""}${c.dl.toFixed(2)}`, Math.min(c.x + 10, this.cssW - 52), c.y - 10);
      }
    }
  }
}
function isIdentityMesh(m) {
  const n = m.neutral;
  if (n && (n[0] !== 0 || n[1] !== 0)) return false;
  for (const ring of m.offsets)
    for (const c of ring) if (c[0] !== 0 || c[1] !== 0 || c[2] !== 0) return false;
  return true;
}
function mixLuma(hex, dl) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  const t = Math.min(Math.abs(dl), 1) * 0.7;
  const tgt = dl < 0 ? 0 : 255;
  r = Math.round(r + (tgt - r) * t);
  g = Math.round(g + (tgt - g) * t);
  b = Math.round(b + (tgt - b) * t);
  return `rgb(${r},${g},${b})`;
}
const LUT_SIZE = 33;
const DRAFT_SIZE = 17;
const VERT$2 = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
const FRAG$2 = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
uniform sampler2D uImg;
uniform highp sampler3D uLut;
uniform float uN;
uniform float uMask;    // 0 = off, 1 = affected-region mask
uniform float uMaskHue; // target OKLCh hue in turns [0,1)
uniform float uMaskSat; // target engine sat (C/C_REF) [0,1]
out vec4 outColor;

// OKLab (a,b) of an sRGB color — ENGINE space, so the mask selects exactly the
// pixels the mesh cell under the cursor warps. Mirrors colorCore srgbToOklab;
// mat3 constants are column-major (transposed from the row-major JS tables).
const mat3 M1 = mat3(
  0.4122214708, 0.2119034982, 0.0883024619,
  0.5363325363, 0.6806995451, 0.2817188376,
  0.0514459929, 0.1073969566, 0.6299787005);
const mat3 M2 = mat3(
  0.2104542553, 1.9779984951, 0.0259040371,
  0.7936177850, -2.4285922050, 0.7827717662,
  -0.0040720468, 0.4505937099, -0.8086757660);
vec2 oklabAB(vec3 c) {
  vec3 lin = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  vec3 lms = pow(max(M1 * lin, 0.0), vec3(1.0 / 3.0));
  return (M2 * lms).yz;
}

void main() {
  vec3 c = clamp(texture(uImg, vUv).rgb, 0.0, 1.0);
  // Half-texel scale/offset so grid endpoints hit texel centers — matches the
  // CPU applyRgb which samples on the [0, N-1] integer lattice.
  vec3 coord = (c * (uN - 1.0) + 0.5) / uN;
  vec3 graded = texture(uLut, coord).rgb;
  if (uMask > 0.5) {
    // Weight the SOURCE pixel by how close its engine (hue,sat) is to the grid
    // cursor cell; show that region in colour over a grayscale base.
    vec2 ab = oklabAB(c);
    float sat = length(ab) / 0.35;              // C / C_REF
    float hue = fract(atan(ab.y, ab.x) / 6.28318530718);
    float dh = abs(hue - uMaskHue); dh = min(dh, 1.0 - dh);
    float w = smoothstep(0.11, 0.0, dh) * smoothstep(0.33, 0.0, abs(sat - uMaskSat));
    // Non-selected region: grayscale AND heavily dimmed — desaturation alone
    // is unreadable under color blindness; the luminance drop carries the cue.
    float g = dot(graded, vec3(0.299, 0.587, 0.114));
    outColor = vec4(mix(vec3(g * 0.22), graded, w), 1.0);
    return;
  }
  outColor = vec4(graded, 1.0);
}`;
class ColorWarpPreview {
  constructor(canvas) {
    __publicField(this, "canvas");
    __publicField(this, "dpr", Math.max(window.devicePixelRatio || 1, 1));
    __publicField(this, "mesh", null);
    __publicField(this, "source", null);
    __publicField(this, "gl", null);
    __publicField(this, "prog", null);
    __publicField(this, "imgTex", null);
    __publicField(this, "lutTex", null);
    __publicField(this, "vao", null);
    __publicField(this, "uImg", -1);
    __publicField(this, "uLut", -1);
    __publicField(this, "uN", -1);
    __publicField(this, "uMask", -1);
    __publicField(this, "uMaskHue", -1);
    __publicField(this, "uMaskSat", -1);
    __publicField(this, "cpu", false);
    __publicField(this, "ctx2d", null);
    __publicField(this, "lutDirty", true);
    __publicField(this, "raf", 0);
    // Baked LUT cache (Float64) — reused by GL upload, CPU render and readPixel.
    // Baked LAZILY (in render/readPixel, once per rAF) — baking synchronously in
    // setMesh ran 30-80ms per pointermove and dragged the UI to ~5fps.
    __publicField(this, "lutF", null);
    __publicField(this, "lutSize", LUT_SIZE);
    __publicField(this, "draft", false);
    // Cached source pixels (for the hover readout) + last draw geometry (device px).
    __publicField(this, "srcData", null);
    __publicField(this, "rect", { x: 0, y: 0, w: 0, h: 0, iw: 0, ih: 0 });
    // Alt affected-region mask target (HSL): null = off.
    __publicField(this, "mask", null);
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2");
    if (gl && this.initGL(gl)) {
      this.gl = gl;
    } else {
      this.cpu = true;
      this.ctx2d = canvas.getContext("2d");
    }
  }
  initGL(gl) {
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("[ColorWarp] shader compile failed:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT$2);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG$2);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[ColorWarp] program link failed:", gl.getProgramInfoLog(prog));
      return false;
    }
    this.prog = prog;
    this.uImg = gl.getUniformLocation(prog, "uImg");
    this.uLut = gl.getUniformLocation(prog, "uLut");
    this.uN = gl.getUniformLocation(prog, "uN");
    this.uMask = gl.getUniformLocation(prog, "uMask");
    this.uMaskHue = gl.getUniformLocation(prog, "uMaskHue");
    this.uMaskSat = gl.getUniformLocation(prog, "uMaskSat");
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,
      -1,
      1,
      -1,
      -1,
      1,
      -1,
      1,
      1,
      -1,
      1,
      1
    ]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;
    this.imgTex = gl.createTexture();
    this.lutTex = gl.createTexture();
    return true;
  }
  // draft=true → interactive-quality LUT (DRAFT_SIZE) while dragging; the
  // commit call (draft=false) rebakes at full LUT_SIZE.
  setMesh(mesh, draft = false) {
    this.mesh = mesh;
    this.draft = draft;
    this.lutF = null;
    this.lutDirty = true;
    this.schedule();
  }
  ensureLut() {
    if (this.lutF || !this.mesh) return;
    this.lutSize = this.draft ? DRAFT_SIZE : LUT_SIZE;
    this.lutF = bakeLut(this.mesh, this.lutSize);
    this.lutDirty = true;
  }
  setSource(src) {
    this.source = src;
    try {
      const tc = document.createElement("canvas");
      tc.width = src.width;
      tc.height = src.height;
      const tx = tc.getContext("2d");
      tx.drawImage(src, 0, 0);
      this.srcData = tx.getImageData(0, 0, src.width, src.height);
    } catch {
      this.srcData = null;
    }
    if (this.gl) this.uploadImage();
    this.schedule();
  }
  // Alt affected-region mask (Phase 7.2). hueDeg = engine OKLCh hue; sat = C/C_REF.
  setMask(hueDeg, sat) {
    const next = { hue: hueDeg, sat };
    if (this.mask && this.mask.hue === hueDeg && this.mask.sat === sat) return;
    this.mask = next;
    this.schedule();
  }
  clearMask() {
    if (!this.mask) return;
    this.mask = null;
    this.schedule();
  }
  // Index into cached source pixels for a client point, or null outside image.
  srcIndexAt(clientX, clientY) {
    if (!this.srcData) return null;
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const dx = (clientX - r.left) * (this.canvas.width / r.width);
    const dy = (clientY - r.top) * (this.canvas.height / r.height);
    const { x, y, w, h, iw, ih } = this.rect;
    if (w < 1 || h < 1 || dx < x || dy < y || dx >= x + w || dy >= y + h) return null;
    const sx = Math.min(iw - 1, Math.floor((dx - x) / w * iw));
    const sy = Math.min(ih - 1, Math.floor((dy - y) / h * ih));
    return (sy * iw + sx) * 4;
  }
  // Read the GRADED colour under a client point (for the hover HSL readout).
  // Computed from cached source pixels + baked LUT so it's exact and independent
  // of GL readback quirks. Returns [r,g,b] in 0..1, or null if outside the image.
  readPixel(clientX, clientY) {
    this.ensureLut();
    const k = this.srcIndexAt(clientX, clientY);
    if (k == null || !this.lutF) return null;
    const d = this.srcData.data;
    return applyRgb(this.lutF, this.lutSize, [d[k] / 255, d[k + 1] / 255, d[k + 2] / 255]);
  }
  // Read the SOURCE colour under a client point (ungraded) — determines which
  // mesh cell governs the pixel, for remote editing from the image.
  readSourcePixel(clientX, clientY) {
    const k = this.srcIndexAt(clientX, clientY);
    if (k == null) return null;
    const d = this.srcData.data;
    return [d[k] / 255, d[k + 1] / 255, d[k + 2] / 255];
  }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.render();
  }
  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    const gl = this.gl;
    if (!gl) return;
    if (this.imgTex) gl.deleteTexture(this.imgTex);
    if (this.lutTex) gl.deleteTexture(this.lutTex);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.prog) gl.deleteProgram(this.prog);
    const lose = gl.getExtension("WEBGL_lose_context");
    lose == null ? void 0 : lose.loseContext();
  }
  // Debounce rebake/re-upload + render into one rAF (Phase 4.2).
  schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }
  uploadImage() {
    const gl = this.gl;
    if (!gl || !this.source) return;
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  // Rebake the 3D LUT and upload as an RGBA8 TEXTURE_3D. RGBA8 is always
  // LINEAR-filterable (float 3D textures need OES_texture_float_linear, which
  // isn't guaranteed) — 8-bit precision is ample for a screen preview.
  uploadLut() {
    const gl = this.gl;
    if (!gl || !this.mesh) return;
    this.ensureLut();
    const size = this.lutSize;
    const lut = this.lutF;
    const data = new Uint8Array(size * size * size * 4);
    for (let r = 0; r < size; r++) {
      for (let g = 0; g < size; g++) {
        for (let b = 0; b < size; b++) {
          const s = ((r * size + g) * size + b) * 3;
          const d = (r + g * size + b * size * size) * 4;
          data[d] = Math.round(lut[s] * 255);
          data[d + 1] = Math.round(lut[s + 1] * 255);
          data[d + 2] = Math.round(lut[s + 2] * 255);
          data[d + 3] = 255;
        }
      }
    }
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA8,
      size,
      size,
      size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data
    );
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    this.lutDirty = false;
  }
  render() {
    if (this.cpu) return this.renderCPU();
    const gl = this.gl;
    if (!gl || !this.prog) return;
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.067, 0.075, 0.094, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.source || !this.mesh) return;
    if (this.lutDirty) this.uploadLut();
    const iw = this.source.width, ih = this.source.height;
    const r = Math.min(W / iw, H / ih);
    const dw = iw * r, dh = ih * r;
    const ox = Math.round((W - dw) / 2), oy = Math.round((H - dh) / 2);
    this.rect = { x: ox, y: H - oy - Math.round(dh), w: Math.round(dw), h: Math.round(dh), iw, ih };
    gl.viewport(ox, oy, Math.round(dw), Math.round(dh));
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.uniform1i(this.uImg, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.uniform1i(this.uLut, 1);
    gl.uniform1f(this.uN, this.lutSize);
    gl.uniform1f(this.uMask, this.mask ? 1 : 0);
    gl.uniform1f(this.uMaskHue, this.mask ? (this.mask.hue % 360 + 360) % 360 / 360 : 0);
    gl.uniform1f(this.uMaskSat, this.mask ? this.mask.sat : 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }
  // CPU fallback: apply the LUT to a ≤512px copy and blit letterboxed.
  renderCPU() {
    const ctx = this.ctx2d;
    if (!ctx) return;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, W, H);
    if (!this.source || !this.mesh) return;
    this.ensureLut();
    const lut = this.lutF;
    const iw = this.source.width, ih = this.source.height;
    const longest = Math.max(iw, ih);
    const scale = longest > 512 ? 512 / longest : 1;
    const sw = Math.max(1, Math.round(iw * scale));
    const sh = Math.max(1, Math.round(ih * scale));
    const tmp = document.createElement("canvas");
    tmp.width = sw;
    tmp.height = sh;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(this.source, 0, 0, sw, sh);
    const img = tctx.getImageData(0, 0, sw, sh);
    const px = img.data;
    const maskHue = this.mask ? (this.mask.hue % 360 + 360) % 360 : 0;
    for (let k = 0; k < px.length; k += 4) {
      const src = [px[k] / 255, px[k + 1] / 255, px[k + 2] / 255];
      const rgb = applyRgb(lut, this.lutSize, src);
      if (this.mask) {
        const [h, s] = srgbToEngine(src);
        let dh2 = Math.abs(h - maskHue);
        dh2 = Math.min(dh2, 360 - dh2) / 180;
        const wh = Math.max(0, 1 - dh2 / 0.22);
        const ws = Math.max(0, 1 - Math.abs(s - this.mask.sat) / 0.33);
        const w = wh * ws;
        const dim = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) * 0.22;
        rgb[0] = dim + (rgb[0] - dim) * w;
        rgb[1] = dim + (rgb[1] - dim) * w;
        rgb[2] = dim + (rgb[2] - dim) * w;
      }
      px[k] = Math.round(rgb[0] * 255);
      px[k + 1] = Math.round(rgb[1] * 255);
      px[k + 2] = Math.round(rgb[2] * 255);
    }
    tctx.putImageData(img, 0, 0);
    const r = Math.min(W / iw, H / ih);
    const dw = iw * r, dh = ih * r;
    const ox = (W - dw) / 2, oy = (H - dh) / 2;
    this.rect = { x: ox, y: oy, w: dw, h: dh, iw, ih };
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, ox, oy, dw, dh);
  }
}
const RAD = Math.PI / 180;
const VERT$1 = `#version 300 es
in vec3 aPos;
in vec3 aCol;
uniform mat4 uMVP;
uniform float uPtSize;
out vec3 vCol;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  gl_PointSize = uPtSize / max(gl_Position.w, 0.1);
  vCol = aCol;
}`;
const FRAG$1 = `#version 300 es
precision mediump float;
in vec3 vCol;
uniform float uAlpha;
uniform float uRound; // 1 = round point sprite, 0 = plain (lines)
out vec4 outColor;
void main() {
  float w = 1.0;
  if (uRound > 0.5) {
    vec2 d = gl_PointCoord - 0.5;
    w = smoothstep(0.5, 0.30, length(d));
  }
  outColor = vec4(vCol, uAlpha * w);
}`;
function clamp01$1(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function matPerspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}
function matMul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
function matLookAt(eye, center) {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  let xx = zz, xy = 0, xz = -zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx;
  m[4] = xy;
  m[8] = xz;
  m[1] = yx;
  m[5] = yy;
  m[9] = yz;
  m[2] = zx;
  m[6] = zy;
  m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}
class ColorWarpScope3D {
  constructor(canvas) {
    __publicField(this, "trails", false);
    __publicField(this, "canvas");
    __publicField(this, "gl", null);
    __publicField(this, "prog", null);
    __publicField(this, "uMVP", null);
    __publicField(this, "uPtSize", null);
    __publicField(this, "uAlpha", null);
    __publicField(this, "uRound", null);
    __publicField(this, "aPos", -1);
    __publicField(this, "aCol", -1);
    __publicField(this, "ptsBuf", null);
    __publicField(this, "trailBuf", null);
    __publicField(this, "refBuf", null);
    __publicField(this, "skinBuf", null);
    __publicField(this, "nPts", 0);
    __publicField(this, "nTrail", 0);
    __publicField(this, "nRef", 0);
    __publicField(this, "nSkin", 0);
    // ≥2 supersamples the mini window so the cloud stays crisp at small sizes.
    __publicField(this, "dpr", Math.max(window.devicePixelRatio || 1, 2));
    __publicField(this, "mesh", null);
    __publicField(this, "visible", false);
    __publicField(this, "dirty", true);
    __publicField(this, "raf", 0);
    // Source cloud (built once per source): OKLab positions + source colors.
    __publicField(this, "srcLab", null);
    // [L, a, b] * n
    __publicField(this, "srcRgb", null);
    // [r, g, b] * n
    // Orbit camera around the L axis midpoint.
    __publicField(this, "yaw", -35 * RAD);
    __publicField(this, "pitch", -22 * RAD);
    __publicField(this, "dist", 2.9);
    __publicField(this, "orbiting", null);
    __publicField(this, "lastX", 0);
    __publicField(this, "lastY", 0);
    __publicField(this, "radial", RADIAL_MODES.neutral);
    // --- orbit -------------------------------------------------------------------
    __publicField(this, "onDown", (e) => {
      this.orbiting = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    __publicField(this, "onMove", (e) => {
      if (this.orbiting == null) return;
      this.yaw -= (e.clientX - this.lastX) * 8e-3;
      this.pitch += (e.clientY - this.lastY) * 8e-3;
      const lim = 88 * RAD;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.schedule();
    });
    __publicField(this, "onUp", (e) => {
      if (this.orbiting == null) return;
      try {
        this.canvas.releasePointerCapture(this.orbiting);
      } catch {
      }
      this.orbiting = null;
    });
    __publicField(this, "onWheel", (e) => {
      e.preventDefault();
      this.dist = Math.max(1.4, Math.min(6, this.dist * Math.exp(e.deltaY * 1e-3)));
      this.schedule();
    });
    this.canvas = canvas;
    canvas.style.touchAction = "none";
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (gl && this.initGL(gl)) this.gl = gl;
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }
  initGL(gl) {
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("[ColorWarp scope3d] shader:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT$1);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG$1);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    this.prog = prog;
    this.uMVP = gl.getUniformLocation(prog, "uMVP");
    this.uPtSize = gl.getUniformLocation(prog, "uPtSize");
    this.uAlpha = gl.getUniformLocation(prog, "uAlpha");
    this.uRound = gl.getUniformLocation(prog, "uRound");
    this.aPos = gl.getAttribLocation(prog, "aPos");
    this.aCol = gl.getAttribLocation(prog, "aCol");
    this.ptsBuf = gl.createBuffer();
    this.trailBuf = gl.createBuffer();
    this.refBuf = gl.createBuffer();
    this.skinBuf = gl.createBuffer();
    this.buildRef(gl);
    this.buildSkin(gl);
    return true;
  }
  // Reference cage: unit chroma circle at L=0.5, faint circles at L=0/1, the
  // neutral axis, and 4 corner posts — enough to read orientation in orbit.
  buildRef(gl) {
    const v = [];
    const C2 = [0.35, 0.45, 0.55];
    const circle = (y) => {
      const N = 72;
      for (let i = 0; i < N; i++) {
        const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
        v.push(Math.cos(a0), y, Math.sin(a0), ...C2, Math.cos(a1), y, Math.sin(a1), ...C2);
      }
    };
    circle(0.5);
    circle(0);
    circle(1);
    v.push(0, 0, 0, ...C2, 0, 1, 0, ...C2);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      v.push(Math.cos(a), 0, Math.sin(a), ...C2, Math.cos(a), 1, Math.sin(a), ...C2);
    }
    const arr = new Float32Array(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.refBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    this.nRef = arr.length / 6;
  }
  // Skin locus cage: the hue wedge of SKIN_LOCUS swept up the L axis, with its
  // radius following the measured chroma ceiling — a cone that pinches shut in
  // the shadows, which is the part the 2D disc cannot show. Wireframe rather
  // than a translucent solid: the scope draws additively with depth testing off
  // (a solid would just wash out whatever is behind it), and lines reuse the
  // existing pipeline with no new shader.
  // Rebuilt with the cage because it depends on the radial mode, same as the cloud.
  buildSkin(gl) {
    const v = [];
    const C2 = [0.95, 0.62, 0.42];
    const { hueLo, hueHi, envelope } = SKIN_LOCUS;
    const L0 = envelope[0][0], L1 = envelope[envelope.length - 1][0];
    const ARC = 12, RUNGS = 9;
    const pt = (t, L) => {
      const h = (hueLo + (hueHi - hueLo) * t) * RAD;
      const sat = skinChromaAt(L) / C_REF;
      const r = this.radial.toRadius(sat);
      return [r * Math.cos(h), L, r * Math.sin(h)];
    };
    const seg = (a, b) => v.push(a[0], a[1], a[2], ...C2, b[0], b[1], b[2], ...C2);
    for (let k = 0; k < RUNGS; k++) {
      const L = L0 + (L1 - L0) * (k / (RUNGS - 1));
      for (let i = 0; i < ARC; i++) seg(pt(i / ARC, L), pt((i + 1) / ARC, L));
    }
    for (const t of [0, 1]) {
      for (let k = 0; k < RUNGS - 1; k++) {
        const La = L0 + (L1 - L0) * (k / (RUNGS - 1));
        const Lb = L0 + (L1 - L0) * ((k + 1) / (RUNGS - 1));
        seg(pt(t, La), pt(t, Lb));
      }
      seg([0, L0, 0], pt(t, L0));
      seg([0, L1, 0], pt(t, L1));
    }
    const arr = new Float32Array(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skinBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    this.nSkin = arr.length / 6;
  }
  // --- data ------------------------------------------------------------------
  // Build the source cloud from the 16-bit push (preferred) or a canvas.
  setSource(canvas, s16) {
    let rgb;
    let sw = 0, sh = 0;
    let imgData = null;
    if (s16) {
      sw = s16.width;
      sh = s16.height;
      rgb = (i) => [s16.data[i * 3] / 65535, s16.data[i * 3 + 1] / 65535, s16.data[i * 3 + 2] / 65535];
    } else if (canvas && canvas.width && canvas.height) {
      const long = Math.max(canvas.width, canvas.height);
      const scale = long > 256 ? 256 / long : 1;
      sw = Math.max(1, Math.round(canvas.width * scale));
      sh = Math.max(1, Math.round(canvas.height * scale));
      const tmp = document.createElement("canvas");
      tmp.width = sw;
      tmp.height = sh;
      const tctx = tmp.getContext("2d");
      tctx.drawImage(canvas, 0, 0, sw, sh);
      imgData = tctx.getImageData(0, 0, sw, sh).data;
      const d = imgData;
      rgb = (i) => [d[i * 4] / 255, d[i * 4 + 1] / 255, d[i * 4 + 2] / 255];
    } else {
      this.srcLab = null;
      this.srcRgb = null;
      this.dirty = true;
      this.schedule();
      return;
    }
    const step = Math.max(1, Math.round(Math.sqrt(sw * sh / 2e4)));
    const cap = Math.ceil(sw / step) * Math.ceil(sh / step);
    const lab = new Float32Array(cap * 3);
    const col = new Float32Array(cap * 3);
    let n = 0;
    for (let y = 0; y < sh; y += step) {
      for (let x = 0; x < sw; x += step) {
        const [r, g, b] = rgb(y * sw + x);
        const L = srgbToOklab([r, g, b]);
        lab[n * 3] = L[0];
        lab[n * 3 + 1] = L[1];
        lab[n * 3 + 2] = L[2];
        col[n * 3] = r;
        col[n * 3 + 1] = g;
        col[n * 3 + 2] = b;
        n++;
      }
    }
    this.srcLab = lab.subarray(0, n * 3);
    this.srcRgb = col.subarray(0, n * 3);
    this.dirty = true;
    this.schedule();
  }
  setMesh(m) {
    this.mesh = m;
    this.dirty = true;
    this.schedule();
  }
  // Same radial projection as the 2D wheel — the floor plane IS the wheel seen
  // from above, so if they disagree the two views stop being the same picture.
  setRadialMode(name) {
    this.radial = RADIAL_MODES[name];
    if (this.gl) this.buildSkin(this.gl);
    this.dirty = true;
    this.schedule();
  }
  setTrails(t) {
    this.trails = t;
    this.schedule();
  }
  setVisible(v) {
    this.visible = v;
    if (v) {
      this.resize();
      this.schedule();
    }
  }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.schedule();
  }
  dispose() {
    var _a;
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
    if (this.raf) cancelAnimationFrame(this.raf);
    const gl = this.gl;
    if (!gl) return;
    if (this.ptsBuf) gl.deleteBuffer(this.ptsBuf);
    if (this.trailBuf) gl.deleteBuffer(this.trailBuf);
    if (this.refBuf) gl.deleteBuffer(this.refBuf);
    if (this.prog) gl.deleteProgram(this.prog);
    (_a = gl.getExtension("WEBGL_lose_context")) == null ? void 0 : _a.loseContext();
  }
  // --- render ------------------------------------------------------------------
  schedule() {
    if (!this.visible || this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }
  // Radius gain for an OKLab (a,b): displayRadius / sat, so scaling the vector
  // by it lands the point where the 2D wheel draws that same colour.
  floorGain(a, b) {
    const sat = Math.hypot(a, b) / C_REF;
    return sat > 1e-9 ? this.radial.toRadius(sat) / sat : 1;
  }
  // Warp the source cloud through the ENGINE (meshSample + neutral, same math
  // as the LUT bake sans gamut clip) and upload point/trail vertex buffers.
  rebuild(gl) {
    var _a, _b;
    this.dirty = false;
    const lab = this.srcLab, srcCol = this.srcRgb;
    if (!lab || !srcCol) {
      this.nPts = 0;
      this.nTrail = 0;
      return;
    }
    const n = lab.length / 3;
    const m = this.mesh;
    const na = ((_a = m == null ? void 0 : m.neutral) == null ? void 0 : _a[0]) ?? 0, nb = ((_b = m == null ? void 0 : m.neutral) == null ? void 0 : _b[1]) ?? 0;
    const pts = new Float32Array(n * 6);
    const trl = new Float32Array(n * 12);
    for (let i = 0; i < n; i++) {
      const L = lab[i * 3], a = lab[i * 3 + 1], b = lab[i * 3 + 2];
      let L2 = L, a2 = a, b2 = b;
      if (m) {
        const C2 = Math.hypot(a, b);
        const h = (Math.atan2(b, a) / RAD % 360 + 360) % 360;
        const sat = C2 / C_REF;
        const [dh, ds, dl] = meshSample(m, h, sat);
        const C22 = Math.max(sat + ds, 0) * C_REF;
        const h2 = (h + dh) * RAD;
        a2 = C22 * Math.cos(h2) + na;
        b2 = C22 * Math.sin(h2) + nb;
        L2 = clamp01$1(L + dl);
      }
      const rgb = oklabToSrgb([L2, a2, b2]);
      const r = clamp01$1(rgb[0]), g = clamp01$1(rgb[1]), bl = clamp01$1(rgb[2]);
      const dg = this.floorGain(a2, b2);
      const px = a2 / C_REF * dg, py = L2, pz = b2 / C_REF * dg;
      const o = i * 6;
      pts[o] = px;
      pts[o + 1] = py;
      pts[o + 2] = pz;
      pts[o + 3] = r;
      pts[o + 4] = g;
      pts[o + 5] = bl;
      const t = i * 12;
      const sg = this.floorGain(lab[i * 3 + 1], lab[i * 3 + 2]);
      trl[t] = lab[i * 3 + 1] / C_REF * sg;
      trl[t + 1] = L;
      trl[t + 2] = lab[i * 3 + 2] / C_REF * sg;
      trl[t + 3] = srcCol[i * 3] * 0.45;
      trl[t + 4] = srcCol[i * 3 + 1] * 0.45;
      trl[t + 5] = srcCol[i * 3 + 2] * 0.45;
      trl[t + 6] = px;
      trl[t + 7] = py;
      trl[t + 8] = pz;
      trl[t + 9] = r;
      trl[t + 10] = g;
      trl[t + 11] = bl;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pts, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf);
    gl.bufferData(gl.ARRAY_BUFFER, trl, gl.DYNAMIC_DRAW);
    this.nPts = n;
    this.nTrail = n * 2;
  }
  bindAttribs(gl, buf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.aCol);
    gl.vertexAttribPointer(this.aCol, 3, gl.FLOAT, false, 24, 12);
  }
  draw() {
    const gl = this.gl;
    if (!gl || !this.prog || !this.visible) return;
    if (this.dirty) this.rebuild(gl);
    const W = this.canvas.width, H = this.canvas.height;
    if (W < 2 || H < 2) return;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.05, 0.057, 0.075, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const cy = 0.5;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const eye = [
      this.dist * cp * Math.sin(this.yaw),
      cy + this.dist * sp,
      this.dist * cp * Math.cos(this.yaw)
    ];
    const mvp = matMul(
      matPerspective(45 * RAD, W / H, 0.1, 30),
      matLookAt(eye, [0, cy, 0])
    );
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.uniform1f(this.uRound, 0);
    gl.uniform1f(this.uAlpha, 0.4);
    this.bindAttribs(gl, this.refBuf);
    gl.drawArrays(gl.LINES, 0, this.nRef);
    if (this.nSkin) {
      gl.uniform1f(this.uAlpha, 0.55);
      this.bindAttribs(gl, this.skinBuf);
      gl.drawArrays(gl.LINES, 0, this.nSkin);
    }
    if (this.trails && this.nTrail) {
      gl.uniform1f(this.uAlpha, 0.16);
      this.bindAttribs(gl, this.trailBuf);
      gl.drawArrays(gl.LINES, 0, this.nTrail);
    }
    if (this.nPts) {
      gl.uniform1f(this.uRound, 1);
      gl.uniform1f(this.uAlpha, 0.8);
      gl.uniform1f(this.uPtSize, Math.max(3, H / 110));
      this.bindAttribs(gl, this.ptsBuf);
      gl.drawArrays(gl.POINTS, 0, this.nPts);
    }
  }
}
let active = null;
const PANEL = "#111318";
const BAR_BG = "#1a1c22";
const ACCENT = "#4ab4ff";
const BORDER = "#3a3d46";
const TEXT = "#c8d0e0";
function meshJson(m) {
  return JSON.stringify(meshToDict(m));
}
function toCanvas(src, w, h) {
  if (!src) return null;
  const width = w || src.naturalWidth || src.width || 0;
  const height = h || src.naturalHeight || src.height || 0;
  if (!width || !height) return null;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(src, 0, 0, width, height);
  } catch {
    return null;
  }
  return c;
}
function openColorWarpViewer(opts) {
  if (active) active.destroy();
  let mesh;
  try {
    mesh = meshFromDict(JSON.parse(opts.mesh));
  } catch {
    mesh = meshIdentity(12, 6, wheelColumnHues(12));
  }
  let sourceCanvas = toCanvas(opts.image);
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;background:${PANEL};color:${TEXT};font:11px Inter,system-ui,sans-serif;`;
  const bar = document.createElement("div");
  bar.style.cssText = `display:flex;align-items:center;gap:10px;padding:8px 14px;background:${BAR_BG};border-bottom:1px solid rgba(255,255,255,0.07);flex:0 0 auto`;
  const title = document.createElement("span");
  title.textContent = "😺 Color Warp";
  title.style.cssText = "font-weight:600;font-size:13px";
  const hint = document.createElement("span");
  hint.textContent = "drag = move node · Pin = single node · dbl-click resets · Alt = region mask · Alt+wheel = luma";
  hint.style.cssText = "opacity:0.7;font-size:11px";
  const spacer = document.createElement("span");
  spacer.style.cssText = "flex:1 1 auto";
  const pinBtn = mkToggle("Pin", false);
  const resetBtn = mkBtn("Reset all", TEXT);
  const spokesSel = mkSelect("Spokes", [4, 6, 8, 12, 16, 24, 32], mesh.hue_segments);
  const ringsSel = mkSelect("Rings", [2, 3, 4, 6, 8, 10, 12, 16], mesh.sat_rings);
  const wheelBtn = mkBtn(`Wheel: ${WHEEL_MODES.ryb.label}`, TEXT);
  const radialBtn = mkBtn(`Radial: ${RADIAL_MODES.neutral.label}`, TEXT);
  const scopeBtn = mkToggle("3D", false);
  const trailsBtn = mkToggle("Trails", false);
  const lumaBtn = mkToggle("Luma", false);
  const labelsBtn = mkToggle("Labels", false);
  const saveBtn = mkBtn("Save & close", ACCENT);
  const closeBtn = mkBtn("✕", TEXT);
  closeBtn.style.padding = "4px 9px";
  bar.append(title, hint, spacer, closeBtn);
  const bottomBar = document.createElement("div");
  bottomBar.style.cssText = `display:flex;align-items:center;gap:12px;padding:8px 14px;background:${BAR_BG};border-top:1px solid rgba(255,255,255,0.07);flex:0 0 auto`;
  const barSpacer = document.createElement("span");
  barSpacer.style.cssText = "flex:1 1 auto";
  bottomBar.append(barSpacer, wheelBtn, radialBtn, spokesSel.wrap, ringsSel.wrap, scopeBtn, trailsBtn, lumaBtn, labelsBtn, pinBtn, resetBtn, saveBtn);
  const body = document.createElement("div");
  body.style.cssText = "flex:1 1 auto;min-height:0;display:flex";
  const leftPane = mkPane();
  const rightPane = mkPane();
  leftPane.style.borderRight = `1px solid ${BORDER}`;
  body.append(leftPane, rightPane);
  const LUMA_H = 118;
  const gridCanvas = document.createElement("canvas");
  gridCanvas.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%";
  leftPane.appendChild(gridCanvas);
  const lumaCanvas = document.createElement("canvas");
  lumaCanvas.style.cssText = `position:absolute;left:0;right:0;bottom:0;height:${LUMA_H}px;width:100%;border-top:1px solid ${BORDER};display:none`;
  leftPane.appendChild(lumaCanvas);
  const previewCanvas = document.createElement("canvas");
  previewCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  rightPane.appendChild(previewCanvas);
  const SCOPE_MINI = `position:absolute;left:10px;bottom:10px;width:300px;height:240px;border:1px solid ${BORDER};border-radius:6px;overflow:hidden;display:none;box-shadow:0 2px 10px rgba(0,0,0,0.5);z-index:5;background:#0d0f13`;
  const SCOPE_FULL = "position:absolute;inset:0;overflow:hidden;display:none;z-index:5;background:#0d0f13";
  const scopeBox = document.createElement("div");
  scopeBox.style.cssText = SCOPE_MINI;
  const scopeCanvas = document.createElement("canvas");
  scopeCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  const scopeExpand = document.createElement("button");
  scopeExpand.textContent = "⤢";
  scopeExpand.title = "Expand / restore";
  scopeExpand.style.cssText = `position:absolute;top:6px;right:6px;z-index:2;background:rgba(20,22,28,0.85);border:1px solid ${BORDER};color:${TEXT};border-radius:4px;padding:2px 7px;cursor:pointer;font:12px Inter,system-ui,sans-serif;line-height:1.3`;
  scopeBox.append(scopeCanvas, scopeExpand);
  rightPane.appendChild(scopeBox);
  const tip = document.createElement("div");
  tip.style.cssText = `position:fixed;pointer-events:none;z-index:100001;display:none;background:${BAR_BG};border:1px solid ${BORDER};border-radius:4px;padding:4px 7px;font:11px Inter,system-ui,sans-serif;color:${TEXT};white-space:pre;box-shadow:0 2px 8px rgba(0,0,0,0.4)`;
  const readout = document.createElement("div");
  readout.style.cssText = `position:absolute;top:10px;left:10px;pointer-events:none;display:none;background:rgba(20,22,28,0.92);border:1px solid ${BORDER};border-radius:6px;padding:8px 11px;font:11px Inter,system-ui,sans-serif;color:${TEXT};box-shadow:0 2px 10px rgba(0,0,0,0.5);min-width:120px`;
  rightPane.appendChild(readout);
  host.append(bar, body, bottomBar, tip);
  document.body.appendChild(host);
  const grid = new ColorWarpGrid(gridCanvas);
  const luma = new ColorWarpLumaStrip(lumaCanvas, grid);
  const preview = new ColorWarpPreview(previewCanvas);
  const scope = new ColorWarpScope3D(scopeCanvas);
  grid.cb.onEdit = (json, commit) => {
    var _a;
    try {
      mesh = meshFromDict(JSON.parse(json));
    } catch {
    }
    preview.setMesh(mesh, !commit);
    scope.setMesh(mesh);
    luma.refresh();
    (_a = opts.onChange) == null ? void 0 : _a.call(opts, json);
  };
  grid.cb.onHover = (info, cx, cy) => {
    if (!info) {
      tip.style.display = "none";
      return;
    }
    tip.textContent = `ring ${info.ri} · seg ${info.sj}
dh ${info.dh.toFixed(1)}  ds ${info.ds.toFixed(2)}  dl ${info.dl.toFixed(2)}`;
    tip.style.display = "block";
    tip.style.left = cx + 14 + "px";
    tip.style.top = cy + 14 + "px";
  };
  grid.cb.onGridCursor = (engineHue, sat, alt, inside) => {
    if (alt && inside) preview.setMask(engineHue, sat);
    else preview.clearMask();
  };
  grid.setMesh(mesh);
  preview.setMesh(mesh);
  scope.setMesh(mesh);
  if (sourceCanvas) {
    grid.setSource(sourceCanvas);
    preview.setSource(sourceCanvas);
    scope.setSource(sourceCanvas, null);
  }
  pinBtn.onclick = () => {
    grid.pin = !grid.pin;
    setToggle(pinBtn, grid.pin);
  };
  resetBtn.onclick = () => grid.resetAll();
  spokesSel.sel.onchange = () => grid.setDensity(parseInt(spokesSel.sel.value), void 0);
  ringsSel.sel.onchange = () => grid.setDensity(void 0, parseInt(ringsSel.sel.value));
  let scopeOn = false;
  let scopeFull = false;
  function applyScopeLayout() {
    scopeBox.style.cssText = scopeFull ? SCOPE_FULL : SCOPE_MINI;
    scopeBox.style.display = scopeOn ? "block" : "none";
    scopeExpand.textContent = scopeFull ? "⤡" : "⤢";
    scope.setVisible(scopeOn);
    if (scopeOn) scope.resize();
  }
  scopeBtn.onclick = () => {
    scopeOn = !scopeOn;
    setToggle(scopeBtn, scopeOn);
    applyScopeLayout();
  };
  scopeExpand.onclick = () => {
    scopeFull = !scopeFull;
    applyScopeLayout();
  };
  trailsBtn.onclick = () => {
    scope.trails = !scope.trails;
    setToggle(trailsBtn, scope.trails);
    scope.setTrails(scope.trails);
  };
  let lumaOn = false;
  lumaBtn.onclick = () => {
    lumaOn = !lumaOn;
    setToggle(lumaBtn, lumaOn);
    lumaCanvas.style.display = lumaOn ? "block" : "none";
    gridCanvas.style.height = lumaOn ? `calc(100% - ${LUMA_H}px)` : "100%";
    requestAnimationFrame(render);
  };
  labelsBtn.onclick = () => {
    grid.labels = !grid.labels;
    setToggle(labelsBtn, grid.labels);
    grid.refresh();
  };
  wheelBtn.onclick = () => {
    const order = ["ryb", "rgb", "oklch"];
    const next = order[(order.indexOf(grid.getWheelMode()) + 1) % order.length];
    grid.setWheelMode(next);
    wheelBtn.textContent = `Wheel: ${WHEEL_MODES[next].label}`;
    luma.refresh();
  };
  radialBtn.onclick = () => {
    const order = ["neutral", "linear", "sqrt"];
    const next = order[(order.indexOf(grid.getRadialMode()) + 1) % order.length];
    grid.setRadialMode(next);
    scope.setRadialMode(next);
    radialBtn.textContent = `Radial: ${RADIAL_MODES[next].label}`;
  };
  previewCanvas.addEventListener("pointermove", (e) => {
    const rgb = preview.readPixel(e.clientX, e.clientY);
    if (!rgb) {
      readout.style.display = "none";
      grid.setIndicator(null);
      return;
    }
    const [h, s, l] = srgbToHsl(rgb);
    const R = Math.round(rgb[0] * 255), G = Math.round(rgb[1] * 255), B = Math.round(rgb[2] * 255);
    readout.innerHTML = `<div style="font-size:22px;font-weight:700;color:${ACCENT};line-height:1">${h.toFixed(0)}°</div><div style="opacity:0.75;margin-top:2px">hue</div><div style="margin-top:6px">S ${(s * 100).toFixed(0)}%  L ${(l * 100).toFixed(0)}%</div><div style="opacity:0.75;margin-top:2px">rgb ${R}, ${G}, ${B}</div>`;
    readout.style.display = "block";
    const [engHue, engSat] = srgbToEngine(rgb);
    grid.setIndicator(engHue, Math.min(engSat, 1), `rgb(${R},${G},${B})`);
  });
  previewCanvas.addEventListener("pointerleave", () => {
    readout.style.display = "none";
    grid.setIndicator(null);
  });
  previewCanvas.style.cursor = "crosshair";
  let remoteDrag = null;
  const nodeUnderCursor = (e) => {
    const src = preview.readSourcePixel(e.clientX, e.clientY);
    if (!src) return null;
    const [h, s] = srgbToEngine(src);
    return grid.nodeForEngine(h, Math.min(s, 1));
  };
  previewCanvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const node = nodeUnderCursor(e);
    if (!node) return;
    grid.beginRemoteDrag(node[0], node[1], e.shiftKey);
    remoteDrag = { startX: e.clientX, startY: e.clientY };
    previewCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  previewCanvas.addEventListener("pointermove", (e) => {
    if (remoteDrag) grid.moveRemoteDrag(e.clientX - remoteDrag.startX, e.clientY - remoteDrag.startY);
  });
  const endRemote = (e) => {
    if (!remoteDrag) return;
    remoteDrag = null;
    try {
      previewCanvas.releasePointerCapture(e.pointerId);
    } catch {
    }
    grid.endRemoteDrag();
  };
  previewCanvas.addEventListener("pointerup", endRemote);
  previewCanvas.addEventListener("pointercancel", endRemote);
  previewCanvas.addEventListener("wheel", (e) => {
    if (!e.altKey) return;
    e.preventDefault();
    const node = nodeUnderCursor(e);
    if (node) grid.nudgeLuma(node[0], node[1], e.deltaY);
  }, { passive: false });
  function render() {
    grid.resize();
    luma.resize();
    preview.resize();
    scope.resize();
  }
  const ro = new ResizeObserver(render);
  ro.observe(body);
  requestAnimationFrame(render);
  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    ro.disconnect();
    window.removeEventListener("keydown", onKey, true);
    grid.dispose();
    luma.dispose();
    preview.dispose();
    scope.dispose();
    host.remove();
    if (active && active.destroy === destroy) active = null;
  }
  function closeWith(commit) {
    var _a;
    const json = meshJson(mesh);
    destroy();
    if (commit) (_a = opts.onClose) == null ? void 0 : _a.call(opts, json);
  }
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (grid.clearSelection()) return;
      closeWith(true);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "r") {
      e.stopPropagation();
      grid.resetAll();
    }
  };
  window.addEventListener("keydown", onKey, true);
  host.addEventListener("pointerdown", (e) => {
    if (e.target === host) closeWith(true);
  });
  saveBtn.onclick = () => closeWith(true);
  closeBtn.onclick = () => closeWith(true);
  active = { destroy };
  return {
    setImage(src, w, h, scatter16) {
      const c = toCanvas(src, w, h);
      if (!c) return;
      sourceCanvas = c;
      grid.setSource(c);
      grid.setScatter16(scatter16 ?? null);
      preview.setSource(c);
      scope.setSource(c, scatter16 ?? null);
      render();
    },
    close() {
      closeWith(false);
    }
  };
}
function mkBtn(label, color) {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = `background:#252830;border:1px solid ${BORDER};color:${color};border-radius:4px;padding:4px 12px;cursor:pointer;font:inherit`;
  if (color === ACCENT) {
    b.style.borderColor = ACCENT;
    b.style.fontWeight = "600";
  }
  return b;
}
function mkSelect(label, values, current) {
  const wrap = document.createElement("label");
  wrap.style.cssText = `display:flex;align-items:center;gap:6px;color:${TEXT};opacity:0.9;cursor:pointer`;
  wrap.textContent = label;
  const sel = document.createElement("select");
  sel.style.cssText = `background:#252830;border:1px solid ${BORDER};color:${TEXT};border-radius:4px;padding:3px 6px;font:inherit;cursor:pointer`;
  const vals = values.includes(current) ? values : [...values, current].sort((a, b) => a - b);
  for (const v of vals) {
    const o = document.createElement("option");
    o.value = String(v);
    o.textContent = String(v);
    if (v === current) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("wheel", (e) => {
    e.preventDefault();
    const i = sel.selectedIndex + (e.deltaY < 0 ? 1 : -1);
    if (i < 0 || i >= sel.options.length) return;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event("change"));
  }, { passive: false });
  wrap.appendChild(sel);
  return { wrap, sel };
}
function mkToggle(label, on) {
  const b = mkBtn(label, TEXT);
  b._label = label;
  setToggle(b, on);
  return b;
}
function setToggle(b, on) {
  b.style.color = on ? "#0b0d12" : TEXT;
  b.style.background = on ? ACCENT : "#252830";
  b.style.borderColor = on ? ACCENT : BORDER;
  b.style.fontWeight = on ? "600" : "400";
}
function mkPane() {
  const p2 = document.createElement("div");
  p2.style.cssText = `position:relative;flex:1 1 0;min-width:0;overflow:hidden;background:${PANEL}`;
  return p2;
}
const STYLE_ID = "nkd-modal-styles";
const CSS = `
.nkd-modal-overlay {
  position: fixed; inset: 0; z-index: 100000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.8); backdrop-filter: blur(3px);
  font: 12px system-ui, sans-serif; color: #c8d0e0;
}
/* Framed panel, never edge-to-edge: the graph staying visible around the border
   is what keeps the editor feeling like part of the workflow. */
.nkd-modal-panel {
  display: flex; flex-direction: column;
  background: #111318; color: #c8d0e0;
  border: 1px solid #3a3d46; border-radius: 10px;
  box-shadow: 0 12px 48px rgba(0,0,0,0.7);
  overflow: hidden;
}
.nkd-modal-head {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; background: #1a1c22;
  border-bottom: 1px solid rgba(255,255,255,0.07); font-weight: 500;
}
.nkd-modal-hint { color: rgba(255,255,255,0.40); font-size: 11px; font-weight: 400; }
.nkd-modal-spacer { flex: 1 1 auto; }
.nkd-modal-x {
  background: transparent; border: none; color: #c8d0e0;
  font-size: 16px; cursor: pointer; padding: 2px 8px; border-radius: 4px;
}
.nkd-modal-x:hover { background: rgba(255,77,77,0.25); color: #ff6b6b; }
.nkd-modal-body { position: relative; flex: 1 1 auto; min-height: 0; background: #0b0d12; display: flex; }
.nkd-modal-body > canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.nkd-modal-foot {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 14px; background: #1a1c22;
  border-top: 1px solid rgba(255,255,255,0.07);
}
.nkd-modal-foot-left, .nkd-modal-foot-right { display: flex; align-items: center; gap: 12px; }

/* Shared controls. Vue templates use these class names directly instead of
   re-declaring the same rules in <style scoped>. */
.nkd-modal-btn {
  background: #252830; border: 1px solid #3a3d46; border-radius: 4px;
  color: #c8d0e0; padding: 4px 10px; font-size: 12px; cursor: pointer;
}
.nkd-modal-btn:hover { border-color: #4ab4ff; }
.nkd-modal-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.nkd-modal-btn.on { border-color: #4ab4ff; color: #4ab4ff; background: rgba(74,180,255,0.12); }
.nkd-modal-btn.primary { border-color: #4ab4ff; color: #4ab4ff; font-weight: 500; padding: 5px 14px; }
.nkd-modal-btn.primary:hover { background: rgba(74,180,255,0.15); }
.nkd-modal-lbl { color: rgba(255,255,255,0.55); display: flex; align-items: center; gap: 6px; }
.nkd-modal-rng { width: 80px; accent-color: #4ab4ff; cursor: pointer; touch-action: none; }
.nkd-modal-num {
  color: #c8d0e0; font-variant-numeric: tabular-nums;
  min-width: 52px; text-align: right;
}
.nkd-modal-sel {
  background: #252830; border: 1px solid #3a3d46; border-radius: 4px;
  color: #c8d0e0; padding: 3px 8px; font-size: 12px; cursor: pointer;
}
.nkd-modal-status { color: #4ab4ff; font-variant-numeric: tabular-nums; }
.nkd-modal-status.bad { color: #ff6b6b; }
`;
function ensureNkdModalStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
function div(cls) {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}
function openNkdModal(opts) {
  ensureNkdModalStyles();
  const overlay = div("nkd-modal-overlay");
  const panel = div("nkd-modal-panel");
  panel.style.width = opts.width ?? "92vw";
  panel.style.height = opts.height ?? "92vh";
  panel.style.maxWidth = opts.maxWidth ?? "1800px";
  const head = div("nkd-modal-head");
  const titleEl = document.createElement("span");
  titleEl.textContent = opts.title;
  const hintEl = document.createElement("span");
  hintEl.className = "nkd-modal-hint";
  hintEl.textContent = opts.hint ?? "";
  const xBtn = document.createElement("button");
  xBtn.className = "nkd-modal-x";
  xBtn.textContent = "✕";
  xBtn.title = "Close (Esc)";
  head.append(titleEl, hintEl, div("nkd-modal-spacer"), xBtn);
  const body = div("nkd-modal-body");
  const footer = div("nkd-modal-foot");
  const footerLeft = div("nkd-modal-foot-left");
  const footerRight = div("nkd-modal-foot-right");
  footer.append(footerLeft, div("nkd-modal-spacer"), footerRight);
  panel.append(head, body, footer);
  overlay.append(panel);
  document.body.appendChild(overlay);
  let closed = false;
  function close(reason = "dismiss") {
    var _a;
    if (closed) return;
    closed = true;
    window.removeEventListener("keydown", onKey, true);
    overlay.remove();
    (_a = opts.onClose) == null ? void 0 : _a.call(opts, reason);
  }
  function onKey(e) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    e.preventDefault();
    close("dismiss");
  }
  xBtn.onclick = () => close("dismiss");
  if (opts.closeOnEsc !== false) window.addEventListener("keydown", onKey, true);
  if (opts.closeOnBackdrop !== false) {
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) close("dismiss");
    });
  }
  return {
    overlay,
    panel,
    head,
    body,
    footer,
    footerLeft,
    footerRight,
    setTitle: (t) => {
      titleEl.textContent = t;
    },
    setHint: (h) => {
      hintEl.textContent = h;
    },
    addPrimary(label, onClick) {
      const b = nkdButton(label, () => {
        onClick == null ? void 0 : onClick();
        close("save");
      });
      b.classList.add("primary");
      footerRight.appendChild(b);
      return b;
    },
    close
  };
}
function nkdButton(label, onClick, title) {
  const b = document.createElement("button");
  b.className = "nkd-modal-btn";
  b.textContent = label;
  if (title) b.title = title;
  b.onclick = onClick;
  return b;
}
function nkdToggle(label, initial, onChange, title) {
  let on = initial;
  const b = nkdButton(label, () => {
    on = !on;
    b.classList.toggle("on", on);
    onChange(on);
  }, title);
  b.classList.toggle("on", on);
  return b;
}
const FINE_GAIN = 0.1;
function nkdSlider(label, cfg, onInput, title) {
  const wrap = document.createElement("label");
  wrap.className = "nkd-modal-lbl";
  if (title) wrap.title = title;
  const rng = document.createElement("input");
  rng.type = "range";
  rng.className = "nkd-modal-rng";
  rng.min = String(cfg.min);
  rng.max = String(cfg.max);
  rng.step = "any";
  rng.value = String(cfg.value);
  if (cfg.width) rng.style.width = `${cfg.width}px`;
  const out = cfg.format ? document.createElement("span") : null;
  if (out) out.className = "nkd-modal-num";
  const fine = cfg.fine ?? cfg.step / 10;
  const clamp2 = (v) => Math.max(cfg.min, Math.min(cfg.max, v));
  const quantize = (v, soft) => {
    const q = soft ? fine : cfg.step;
    return Math.round(Math.round(clamp2(v) / q) * q * 1e6) / 1e6;
  };
  const show = (v) => {
    if (out) out.textContent = cfg.format(v);
  };
  const apply2 = (v, soft) => {
    const q = quantize(v, soft);
    rng.value = String(q);
    show(q);
    onInput(q);
  };
  rng.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || rng.disabled) return;
    e.preventDefault();
    rng.focus();
    try {
      rng.setPointerCapture(e.pointerId);
    } catch {
    }
    const rect = rng.getBoundingClientRect();
    const span = cfg.max - cfg.min;
    const width = Math.max(1, rect.width);
    let v = e.shiftKey ? parseFloat(rng.value) : clamp2(cfg.min + (e.clientX - rect.left) / width * span);
    apply2(v, e.shiftKey);
    let prevX = e.clientX;
    const move = (ev) => {
      v = clamp2(v + (ev.clientX - prevX) / width * span * (ev.shiftKey ? FINE_GAIN : 1));
      prevX = ev.clientX;
      apply2(v, ev.shiftKey);
    };
    const up = (ev) => {
      rng.removeEventListener("pointermove", move);
      rng.removeEventListener("pointerup", up);
      rng.removeEventListener("pointercancel", up);
      try {
        rng.releasePointerCapture(ev.pointerId);
      } catch {
      }
    };
    rng.addEventListener("pointermove", move);
    rng.addEventListener("pointerup", up);
    rng.addEventListener("pointercancel", up);
  });
  rng.addEventListener("keydown", (e) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const q = e.shiftKey ? fine : cfg.step;
    apply2(parseFloat(rng.value) + dir * q, e.shiftKey);
  });
  const txt = document.createElement("span");
  txt.className = "nkd-modal-lbl-txt";
  txt.textContent = label;
  wrap.append(txt, rng);
  if (out) wrap.appendChild(out);
  show(cfg.value);
  wrap.sync = (v) => {
    rng.value = String(v);
    show(v);
  };
  wrap.setDisabled = (off) => {
    rng.disabled = off;
    wrap.style.opacity = off ? "0.45" : "";
  };
  return wrap;
}
const FLATTEN_TOL = 1 / 24576;
const MIN_W$1 = 1;
const MAX_W = 10;
const MIN_SPLITS = 3;
const MAX_DEPTH = 14;
const OFFSET_MAX_DEPTH = 7;
const clampW = (v) => Math.max(MIN_W$1, Math.min(MAX_W, Number.isFinite(v) ? v : MIN_W$1));
function segDist(p2, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-24) return Math.hypot(p2[0] - a[0], p2[1] - a[1]);
  let t = ((p2[0] - a[0]) * dx + (p2[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p2[0] - (a[0] + t * dx), p2[1] - (a[1] + t * dy));
}
function adaptive(f, t0, t1, p0, p1, tol, out, us, depth) {
  const tm = (t0 + t1) / 2;
  const pm = f(tm);
  if (depth >= MIN_SPLITS && (segDist(pm, p0, p1) <= tol || depth >= MAX_DEPTH)) {
    out.push(p1);
    us.push(t1);
    return;
  }
  adaptive(f, t0, tm, p0, pm, tol, out, us, depth + 1);
  adaptive(f, tm, t1, pm, p1, tol, out, us, depth + 1);
}
const at = (pts, i, closed) => {
  const n = pts.length;
  if (closed) return pts[(i % n + n) % n];
  return pts[Math.max(0, Math.min(n - 1, i))];
};
function controlPoints(pts, i, closed) {
  const p1 = at(pts, i, closed);
  const p2 = at(pts, i + 1, closed);
  const p0 = at(pts, i - 1, closed);
  const p3 = at(pts, i + 2, closed);
  const c1 = p1.corner ? [p1.x, p1.y] : p1.h ? [p1.x + p1.h[2], p1.y + p1.h[3]] : [p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6];
  const c2 = p2.corner ? [p2.x, p2.y] : p2.h ? [p2.x + p2.h[0], p2.y + p2.h[1]] : [p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6];
  return [c1, c2];
}
function bezierSegments(pts, closed) {
  const segs = [];
  const last = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < last; i++) {
    const [c1, c2] = controlPoints(pts, i, closed);
    const a = at(pts, i, closed);
    const b = at(pts, i + 1, closed);
    segs.push([[a.x, a.y], c1, c2, [b.x, b.y]]);
  }
  return segs;
}
const cubic = (p0, c1, c2, p3) => (t) => {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]
  ];
};
const NURBS_DEGREE = 3;
function clampedKnots(nPts, degree) {
  const order = degree + 1;
  if (nPts <= degree) return new Array(nPts + order).fill(0);
  const knots = [];
  for (let i = 0; i < order; i++) knots.push(0);
  const interior = nPts - degree;
  for (let i = 1; i < interior; i++) knots.push(i / interior);
  for (let i = 0; i < order; i++) knots.push(1);
  return knots;
}
function uniformKnots(nPts, degree) {
  const knots = [];
  for (let i = 0; i < nPts + degree + 1; i++) knots.push(i);
  return knots;
}
function nurbsBasis(knots, nPts, degree, u) {
  u = Math.max(knots[degree], Math.min(knots[nPts], u));
  if (u >= knots[nPts]) u = knots[nPts] - 1e-10;
  const len = knots.length - 1;
  let N = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    if (knots[i] <= u && u < knots[i + 1]) N[i] = 1;
  }
  for (let p2 = 1; p2 <= degree; p2++) {
    const next = new Array(len).fill(0);
    for (let i = 0; i < len - p2; i++) {
      const d1 = knots[i + p2] - knots[i];
      const d2 = knots[i + p2 + 1] - knots[i + 1];
      const c1 = d1 > 0 ? (u - knots[i]) / d1 * N[i] : 0;
      const c2 = d2 > 0 ? (knots[i + p2 + 1] - u) / d2 * N[i + 1] : 0;
      next[i] = c1 + c2;
    }
    N = next;
  }
  return N.slice(0, nPts);
}
function nurbsEvaluate(P, weights, knots, degree, u) {
  const N = nurbsBasis(knots, P.length, degree, u);
  let wx = 0, wy = 0, sum = 0;
  for (let i = 0; i < P.length; i++) {
    const nw = N[i] * weights[i];
    wx += nw * P[i][0];
    wy += nw * P[i][1];
    sum += nw;
  }
  return sum === 0 ? P[0] : [wx / sum, wy / sum];
}
function bsplineSetup(pts, closed) {
  const n = pts.length;
  if (n < 3) return null;
  const expanded = [];
  const src = [];
  pts.forEach((p2, i) => {
    for (let k = 0; k < (p2.corner ? NURBS_DEGREE : 1); k++) {
      expanded.push(p2);
      src.push(i);
    }
  });
  const degree = Math.min(NURBS_DEGREE, closed ? expanded.length : expanded.length - 1);
  if (degree < 1) return null;
  const ctrl = closed ? expanded.concat(expanded.slice(0, degree)) : expanded;
  const srcOf = closed ? src.concat(src.slice(0, degree)) : src;
  return {
    P: ctrl.map((p2) => [p2.x, p2.y]),
    weights: ctrl.map((p2) => clampW(p2.w)),
    knots: closed ? uniformKnots(ctrl.length, degree) : clampedKnots(ctrl.length, degree),
    degree,
    srcOf
  };
}
function greville(b) {
  const out = [];
  for (let j = 0; j < b.P.length; j++) {
    let s = 0;
    for (let k = 1; k <= b.degree; k++) s += b.knots[j + k];
    out.push(s / b.degree);
  }
  return out;
}
function bsplinePolyline(pts, closed, tol, us) {
  const b = bsplineSetup(pts, closed);
  if (!b) return pts.map((p2, i) => {
    us.push(i);
    return [p2.x, p2.y];
  });
  const { P, weights, knots, degree } = b;
  const out = [];
  const ev = (u) => nurbsEvaluate(P, weights, knots, degree, u);
  for (let i = degree; i < P.length; i++) {
    const u0 = knots[i], u1 = knots[i + 1];
    if (!(u1 > u0)) continue;
    const a = ev(u0);
    if (!out.length) {
      out.push(a);
      us.push(u0);
    }
    adaptive(ev, u0, u1, a, ev(u1), tol, out, us, 0);
  }
  return out;
}
function simplify(pts, us, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack2 = [[0, pts.length - 1]];
  while (stack2.length) {
    const [lo, hi] = stack2.pop();
    if (hi - lo < 2) continue;
    let best = -1, bestD = tol;
    for (let i = lo + 1; i < hi; i++) {
      const d = segDist(pts[i], pts[lo], pts[hi]);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) continue;
    keep[best] = 1;
    stack2.push([lo, best], [best, hi]);
  }
  const kept = pts.filter((_, i) => keep[i]);
  const keptU = us.filter((_, i) => keep[i]);
  us.length = 0;
  us.push(...keptU);
  return kept;
}
function dropCollinearWrapped(pts, us, tol) {
  const n = pts.length;
  if (n < 4) return pts;
  const out = [];
  const outU = [];
  for (let i = 0; i < n; i++) {
    const prev = out.length ? out[out.length - 1] : pts[n - 1];
    if (segDist(pts[i], prev, pts[(i + 1) % n]) > tol) {
      out.push(pts[i]);
      outU.push(us[i]);
    }
  }
  if (out.length < 3) return pts;
  us.length = 0;
  us.push(...outU);
  return out;
}
function insertionIndex(pts, type, closed, target, tol, aspect = 1) {
  if (pts.length < 2) return null;
  const sx = (p2) => [p2[0] * aspect, p2[1]];
  const t = sx(target);
  const scan = (ev2, u0, u1, steps) => {
    let bd = Infinity, bu = u0, bp = ev2(u0);
    let prev = ev2(u0), prevU = u0;
    for (let i = 1; i <= steps; i++) {
      const u = u0 + (u1 - u0) * i / steps;
      const cur = ev2(u);
      const a = sx(prev), b2 = sx(cur);
      const dx = b2[0] - a[0], dy = b2[1] - a[1];
      const l2 = dx * dx + dy * dy;
      const s = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((t[0] - a[0]) * dx + (t[1] - a[1]) * dy) / l2));
      const d = Math.hypot(t[0] - (a[0] + s * dx), t[1] - (a[1] + s * dy));
      if (d < bd) {
        bd = d;
        bu = prevU + (u - prevU) * s;
        bp = [prev[0] + (cur[0] - prev[0]) * s, prev[1] + (cur[1] - prev[1]) * s];
      }
      prev = cur;
      prevU = u;
    }
    return { d: bd, u: bu, p: bp };
  };
  if (type !== "bspline") {
    const segs = bezierSegments(pts, closed);
    let best2 = { d: Infinity, i: -1, p: [0, 0] };
    segs.forEach(([p0, c1, c2, p3], i) => {
      const got = scan(cubic(p0, c1, c2, p3), 0, 1, 48);
      if (got.d < best2.d) best2 = { d: got.d, i, p: got.p };
    });
    if (best2.i < 0 || best2.d > tol) return null;
    return { at: Math.max(1, best2.i + 1), point: best2.p };
  }
  const b = bsplineSetup(pts, closed);
  if (!b) return null;
  const { P, weights, knots, degree, srcOf } = b;
  const ev = (u) => nurbsEvaluate(P, weights, knots, degree, u);
  let best = { d: Infinity, u: 0, p: [0, 0] };
  for (let i = degree; i < P.length; i++) {
    if (!(knots[i + 1] > knots[i])) continue;
    const got = scan(ev, knots[i], knots[i + 1], 32);
    if (got.d < best.d) best = got;
  }
  if (best.d > tol) return null;
  const grev = greville(b);
  let j = grev.findIndex((g) => g > best.u);
  if (j < 1) j = 1;
  const n = pts.length;
  const at2 = Math.max(1, Math.min(n, srcOf[j - 1] + 1));
  return { at: at2, point: best.p };
}
function flatten(pts, type, closed, tol = FLATTEN_TOL) {
  return flattenP(pts, type, closed, tol).poly;
}
function flattenP(pts, type, closed, tol = FLATTEN_TOL) {
  const us = [];
  if (pts.length < 2) {
    return { poly: pts.map((p2, i) => {
      us.push(i);
      return [p2.x, p2.y];
    }), us };
  }
  let out;
  if (type === "bspline") {
    out = bsplinePolyline(pts, closed, tol, us);
  } else {
    out = [[pts[0].x, pts[0].y]];
    us.push(0);
    let seg = 0;
    for (const [p0, c1, c2, p3] of bezierSegments(pts, closed)) {
      const local = [];
      adaptive(cubic(p0, c1, c2, p3), 0, 1, p0, p3, tol, out, local, 0);
      for (const t of local) us.push(seg + t);
      seg++;
    }
  }
  out = simplify(out, us, tol);
  if (closed && out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < tol) {
      out.pop();
      us.pop();
    }
    out = dropCollinearWrapped(out, us, tol);
  }
  return { poly: out, us };
}
function attrEvaluator(pts, type, closed, attr) {
  if (type === "bspline") {
    const b = bsplineSetup(pts, closed);
    if (!b) {
      const v2 = attr(pts[0]);
      return () => v2;
    }
    const V = b.srcOf.map((i) => [attr(pts[i]), 0]);
    return (u) => nurbsEvaluate(V, b.weights, b.knots, b.degree, u)[0];
  }
  const n = pts.length;
  const v = (i) => attr(at(pts, i, closed));
  const last = closed ? n : n - 1;
  return (u) => {
    const i = Math.max(0, Math.min(last - 1, Math.floor(u)));
    const t = Math.max(0, Math.min(1, u - i));
    const p1 = at(pts, i, closed), p2 = at(pts, i + 1, closed);
    const a = v(i), d = v(i + 1);
    const c1 = p1.corner ? a : a + (v(i + 1) - v(i - 1)) / 6;
    const c2 = p2.corner ? d : d - (v(i + 2) - v(i)) / 6;
    const w = 1 - t;
    return w * w * w * a + 3 * w * w * t * c1 + 3 * w * t * t * c2 + t * t * t * d;
  };
}
function sampleAttr(pts, type, closed, us, attr) {
  if (!pts.length) return us.map(() => 0);
  return us.map(attrEvaluator(pts, type, closed, attr));
}
function pointEvaluator(pts, type, closed) {
  if (type === "bspline") {
    const b = bsplineSetup(pts, closed);
    if (!b) return () => [pts[0].x, pts[0].y];
    return (u) => nurbsEvaluate(b.P, b.weights, b.knots, b.degree, u);
  }
  const segs = bezierSegments(pts, closed);
  const last = segs.length;
  return (u) => {
    const i = Math.max(0, Math.min(last - 1, Math.floor(u)));
    const t = Math.max(0, Math.min(1, u - i));
    const [p0, c1, c2, p3] = segs[i];
    return cubic(p0, c1, c2, p3)(t);
  };
}
function period(pts, type, closed) {
  if (!closed) return 0;
  if (type !== "bspline") return pts.length;
  const b = bsplineSetup(pts, closed);
  return b ? b.knots[b.P.length] - b.knots[b.degree] : 0;
}
function flattenFeathered(pts, type, closed, tol, offX, offY) {
  const base = flattenP(pts, type, closed, tol);
  const fx = attrEvaluator(pts, type, closed, offX);
  const fy = attrEvaluator(pts, type, closed, offY);
  if (base.poly.length < 2) {
    return { ...base, off: base.us.map((u) => [fx(u), fy(u)]) };
  }
  const pt = pointEvaluator(pts, type, closed);
  const us = [];
  const poly = [];
  const off = [];
  const push = (u, p2, o) => {
    us.push(u);
    poly.push(p2);
    off.push(o);
  };
  const outer = (p2, o) => [p2[0] + o[0], p2[1] + o[1]];
  const bisect = (u0, u1, p0, o0, p1, o1, depth) => {
    if (depth >= OFFSET_MAX_DEPTH) return;
    const um = (u0 + u1) / 2;
    const pm = pt(um);
    const om = [fx(um), fy(um)];
    if (segDist(outer(pm, om), outer(p0, o0), outer(p1, o1)) <= tol) return;
    bisect(u0, um, p0, o0, pm, om, depth + 1);
    push(um, pm, om);
    bisect(um, u1, pm, om, p1, o1, depth + 1);
  };
  let pu = base.us[0];
  let pp = base.poly[0];
  let po = [fx(pu), fy(pu)];
  push(pu, pp, po);
  for (let i = 1; i < base.us.length; i++) {
    const u = base.us[i], p2 = base.poly[i];
    const o = [fx(u), fy(u)];
    bisect(pu, u, pp, po, p2, o, 0);
    push(u, p2, o);
    pu = u;
    pp = p2;
    po = o;
  }
  const span = period(pts, type, closed);
  if (span > 0) {
    const u1 = base.us[0] + span;
    bisect(pu, u1, pp, po, base.poly[0], off[0], 0);
  }
  return { poly, us, off };
}
function rampOffsets(rings) {
  const out = [];
  for (let j = 0; j < rings; j++) {
    const x = (j + 0.5) / rings;
    out.push(0.5 - Math.sin(Math.asin(1 - 2 * x) / 3));
  }
  return out;
}
const RING = { inner: 16, maxWidth: 18, tol: 5 };
const SCRUB_PX = 90;
const FINE$1 = 0.1;
function hitRing(px, py, cx, cy) {
  const d = Math.hypot(px - cx, py - cy);
  return d >= RING.inner - RING.tol && d <= RING.inner + RING.maxWidth + RING.tol;
}
function hitDot(px, py, cx, cy, r = 9) {
  return Math.hypot(px - cx, py - cy) <= r;
}
function drawRing(ctx, cx, cy, value, color, selected, label) {
  const v = Math.max(0, Math.min(1, value));
  const w = 2 + v * (RING.maxWidth - 2);
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = RING.maxWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, RING.inner + RING.maxWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(cx, cy, RING.inner + w / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = selected ? "#ff6b6b" : color;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (selected) {
    const text = label ?? v.toFixed(2);
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    const ty = cy - RING.inner - RING.maxWidth - 6;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = 3;
    ctx.strokeText(text, cx, ty);
    ctx.fillStyle = "#c8d0e0";
    ctx.fillText(text, cx, ty);
  }
  ctx.restore();
}
function startScrub(startY, get, set) {
  let prev = startY;
  return (y, fine) => {
    const delta = (prev - y) / SCRUB_PX * (fine ? FINE$1 : 1);
    prev = y;
    set(Math.max(0, Math.min(1, get() + delta)));
  };
}
const MAX_PINS = 64;
const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  // y is flipped on the way in, not on upload. Clip space puts +1 at the top of
  // the screen while an uploaded image puts its top row at v = 0, so the naive
  // aPos * 0.5 + 0.5 samples the picture upside down. Doing it here rather than
  // with UNPACK_FLIP_Y keeps vUv in the same frame as the pins, which are
  // normalized image coordinates with y running down.
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uImg;
uniform vec4 uPins[${MAX_PINS}];   // x, y, blur (0..1), reach scale
uniform int uCount;
uniform float uMaxBlur;            // pixels at texture resolution
uniform float uPower;              // IDW falloff
uniform vec2 uTexel;
uniform int uField;                // 1 = draw the radius field instead
in vec2 vUv;
out vec4 frag;

void main() {
  // Inverse-distance weighting, the same form the backend solves. Distances are
  // in normalized units on both sides, so a non-square image skews identically.
  // A pin's reach divides its distance, so widening one lets it hold ground the
  // pins around it would otherwise take — including a reach of zero blur.
  float num = 0.0, den = 0.0;
  for (int i = 0; i < ${MAX_PINS}; i++) {
    if (i >= uCount) break;
    vec2 d = (vUv - uPins[i].xy) / max(uPins[i].w, 1e-4);
    float w = pow(dot(d, d) + 1e-9, -uPower * 0.5);
    num += w * uPins[i].z;
    den += w;
  }
  float unit = den > 0.0 ? num / den : 0.0;

  if (uField == 1) {
    frag = vec4(vec3(clamp(unit, 0.0, 1.0)), 1.0);
    return;
  }

  float r = unit * uMaxBlur;
  float lod = log2(max(r, 1.0));
  // A handful of taps around the point, because a straight mip lookup goes
  // visibly blocky once the level is high and that reads as an artefact rather
  // than as blur.
  vec3 c = textureLod(uImg, vUv, lod).rgb * 2.0;
  float o = r * 0.5;
  c += textureLod(uImg, vUv + vec2( o, 0.0) * uTexel, lod).rgb;
  c += textureLod(uImg, vUv + vec2(-o, 0.0) * uTexel, lod).rgb;
  c += textureLod(uImg, vUv + vec2(0.0,  o) * uTexel, lod).rgb;
  c += textureLod(uImg, vUv + vec2(0.0, -o) * uTexel, lod).rgb;
  frag = vec4(c / 6.0, 1.0);
}`;
const NEUTRAL_REACH = 0.25;
class FieldPreview {
  constructor() {
    __publicField(this, "canvas");
    __publicField(this, "gl");
    __publicField(this, "prog", null);
    __publicField(this, "tex", null);
    __publicField(this, "loc", {});
    __publicField(this, "ready", false);
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl2", { premultipliedAlpha: false });
    if (!this.gl) return;
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("[NKD Field Blur] shader:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      this.gl = null;
      return;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[NKD Field Blur] link:", gl.getProgramInfoLog(prog));
      this.gl = null;
      return;
    }
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["uImg", "uPins", "uCount", "uMaxBlur", "uPower", "uTexel", "uField"]) {
      this.loc[n] = gl.getUniformLocation(prog, n);
    }
  }
  get available() {
    return !!this.gl && this.ready;
  }
  /** Upload the backdrop. Mipmaps are the blur, so they are built once here. */
  setImage(src, w, h) {
    const gl = this.gl;
    if (!gl) return;
    this.canvas.width = Math.max(1, w);
    this.canvas.height = Math.max(1, h);
    if (!this.tex) this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch {
      this.ready = false;
      return;
    }
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.ready = true;
  }
  /** Repaint. `field` draws the radius map instead of the blurred image. */
  render(pins, maxBlur, falloff, field) {
    const gl = this.gl;
    if (!gl || !this.ready || !this.prog) return false;
    const n = Math.min(pins.length, MAX_PINS);
    const flat = new Float32Array(MAX_PINS * 4);
    for (let i = 0; i < n; i++) {
      flat[i * 4] = pins[i].x;
      flat[i * 4 + 1] = pins[i].y;
      flat[i * 4 + 2] = pins[i].blur;
      flat[i * 4 + 3] = Math.max(0.01, pins[i].r ?? NEUTRAL_REACH) / NEUTRAL_REACH;
    }
    gl.useProgram(this.prog);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.loc.uImg, 0);
    gl.uniform4fv(this.loc.uPins, flat);
    gl.uniform1i(this.loc.uCount, n);
    gl.uniform1f(this.loc.uMaxBlur, maxBlur);
    gl.uniform1f(this.loc.uPower, falloff);
    gl.uniform2f(this.loc.uTexel, 1 / this.canvas.width, 1 / this.canvas.height);
    gl.uniform1i(this.loc.uField, field ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
  destroy() {
    var _a;
    const gl = this.gl;
    if (!gl) return;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.prog) gl.deleteProgram(this.prog);
    (_a = gl.getExtension("WEBGL_lose_context")) == null ? void 0 : _a.loseContext();
    this.gl = null;
    this.ready = false;
  }
}
const DEFAULT_INFLUENCE = 0.25;
const C = {
  bg: "#0b0d12",
  add: "#4ab4ff",
  sub: "#ff6b6b",
  path: "#4ab4ff",
  idle: "rgba(255,255,255,0.45)",
  pt: "#4ab4ff",
  ptHover: "#ffd166",
  ptActive: "#ff6b6b",
  handle: "rgba(255,209,102,0.85)",
  ptStroke: "rgba(0,0,0,0.65)",
  hull: "rgba(255,255,255,0.28)",
  // The Fusion convention: the softness guide is a second, green, dashed
  // outline, so it never reads as another shape you might have drawn.
  soft: "#7bd94f",
  softDim: "rgba(123,217,79,0.45)",
  marquee: "#4ab4ff"
};
const HIT = 10;
const PT_R = { idle: 4.5, hover: 6, active: 7 };
const HANDLE_HIT = 7;
const CLONE_HIT = 8;
const UNDO_DEPTH$1 = 30;
const MIN_PTS = { shape: 3, path: 2 };
const MARQUEE_MIN = 4;
const RAMP_PX_PER_RING = 1;
const RAMP_RINGS = { min: 2, max: 64 };
const MATTE_MAX_PX = 35e5;
const DRAG_RINGS = 8;
const rampRings = (maxPx) => Math.max(
  RAMP_RINGS.min,
  Math.min(RAMP_RINGS.max, Math.round(maxPx / RAMP_PX_PER_RING))
);
class SplineEditor {
  constructor(opts) {
    __publicField(this, "canvas");
    __publicField(this, "ctx");
    __publicField(this, "ro");
    __publicField(this, "mode");
    __publicField(this, "onEdit");
    __publicField(this, "onState");
    __publicField(this, "image", null);
    __publicField(this, "imgW", 1);
    __publicField(this, "imgH", 1);
    __publicField(this, "shapes", []);
    __publicField(this, "pins", []);
    /** Index of the shape being drawn into / edited. -1 for none. */
    __publicField(this, "active", -1);
    __publicField(this, "selPt", -1);
    /** Box selection, as "shape,point" keys ("pin,i" in pin mode). Moves, deletes
     *  and Ctrl-drags apply to the whole set. Same model as the Color Warp grid. */
    __publicField(this, "sel", /* @__PURE__ */ new Set());
    __publicField(this, "hover", null);
    __publicField(this, "hoverClone", null);
    /** Defaults the toolbar writes and new shapes inherit. */
    __publicField(this, "newType", "bezier");
    __publicField(this, "newOp", "add");
    __publicField(this, "showFill", true);
    /** Draw the vectors at all. Off leaves the backdrop — the matte, the blurred
     *  result — with nothing on top of it, which is the only way to judge an edge
     *  that has a control point sitting on it. Editing still works while hidden. */
    __publicField(this, "showCurves", true);
    __publicField(this, "view", "result");
    /** Backend-rendered result for the blur modes; null until one arrives. */
    __publicField(this, "preview", null);
    /** The node's own settings, so the pin gizmos can show real pixels and the
     *  live shader can match what the graph will do. */
    __publicField(this, "maxBlur", 48);
    __publicField(this, "falloff", 2);
    /** Path Blur's Strength, so a per-point speed can be drawn as the distance
     *  that pixel will actually travel rather than as a bare multiplier. */
    __publicField(this, "strength", 24);
    /** GPU guide for pin mode. Drives the canvas between backend results. */
    __publicField(this, "live", null);
    /** Offscreen matte for shape mode, at screen resolution. `matteKey` is what it
     *  was built from, so it is rebuilt only when that actually changes. */
    __publicField(this, "matte", null);
    __publicField(this, "scratch", null);
    __publicField(this, "matteKey", "");
    /** Bumped whenever any geometry changes, which is what invalidates the cached
     *  flattening below. Every mutation goes through `emit`, so one counter there
     *  covers all of them. */
    __publicField(this, "geomRev", 0);
    __publicField(this, "geomCache", /* @__PURE__ */ new WeakMap());
    __publicField(this, "zoom", 1);
    __publicField(this, "panX", 0);
    __publicField(this, "panY", 0);
    __publicField(this, "fit", 1);
    __publicField(this, "drag", null);
    __publicField(this, "undo", []);
    __publicField(this, "onDown", (e) => {
      var _a, _b;
      const [px, py] = this.eventPos(e);
      this.canvas.setPointerCapture(e.pointerId);
      if (e.button === 1 || e.altKey) {
        this.drag = { kind: "pan", x: px - this.panX, y: py - this.panY };
        return;
      }
      if (e.button !== 0) return;
      if (this.mode === "pin") return this.downPin(e, px, py);
      const hit = this.pick(px, py);
      if (hit && hit.handle < 0 && (e.ctrlKey || e.metaKey)) {
        this.active = hit.s;
        this.selPt = hit.i;
        this.snapshot();
        this.drag = { kind: "radius", s: hit.s, i: hit.i };
        this.emit(true);
        return;
      }
      if (!hit) {
        const clone = this.pickClone(px, py);
        if (clone) {
          this.active = clone.s;
          this.snapshot();
          if (e.shiftKey) {
            this.shapes[clone.s].pts[clone.i].fo = null;
            this.commit();
            return;
          }
          this.drag = { kind: "radius", s: clone.s, i: clone.i };
          this.emit(true);
          return;
        }
      }
      if (!hit && e.shiftKey) {
        this.drag = { kind: "marquee", x0: px, y0: py, x1: px, y1: py };
        this.draw();
        return;
      }
      if (hit && hit.handle < 0 && hit.i === 0 && hit.s === this.active) {
        const s2 = this.shapes[hit.s];
        if (this.mode === "shape" && !s2.closed && s2.pts.length >= MIN_PTS.shape) {
          this.snapshot();
          s2.closed = true;
          this.finishShape();
          return;
        }
      }
      if (hit && hit.handle >= 0) {
        this.snapshot();
        this.drag = { kind: "handle", s: hit.s, i: hit.i, side: hit.handle };
        return;
      }
      if (hit) {
        if (e.shiftKey) {
          this.snapshot();
          const s2 = this.shapes[hit.s];
          s2.pts.splice(hit.i, 1);
          if (s2.pts.length === 0) {
            this.shapes.splice(hit.s, 1);
            this.active = -1;
          }
          this.selPt = -1;
          this.commit();
          return;
        }
        const inSel = this.sel.has(SplineEditor.key(hit.s, hit.i));
        if (!inSel && this.sel.size) this.sel.clear();
        this.active = hit.s;
        this.selPt = hit.i;
        this.snapshot();
        const p2 = this.shapes[hit.s].pts[hit.i];
        const [nx2, ny2] = this.toNorm(px, py);
        this.drag = {
          kind: "pt",
          s: hit.s,
          i: hit.i,
          dx: p2.x - nx2,
          dy: p2.y - ny2,
          group: inSel ? this.targets(hit.s, hit.i) : void 0
        };
        this.emit(true);
        return;
      }
      const ins = this.pickCurve(px, py);
      if (ins) {
        this.snapshot();
        const s2 = this.shapes[ins.s];
        s2.pts.splice(ins.at, 0, {
          x: ins.x,
          y: ins.y,
          h: null,
          corner: false
        });
        this.active = ins.s;
        this.selPt = ins.at;
        const [cnx, cny] = this.toNorm(px, py);
        this.drag = { kind: "pt", s: ins.s, i: ins.at, dx: ins.x - cnx, dy: ins.y - cny };
        this.emit(true);
        return;
      }
      if (this.active >= 0 && ((_a = this.shapes[this.active]) == null ? void 0 : _a.closed)) {
        this.sel.clear();
        this.active = -1;
        this.selPt = -1;
        this.draw();
        (_b = this.onState) == null ? void 0 : _b.call(this);
        return;
      }
      this.sel.clear();
      this.snapshot();
      if (this.active < 0) {
        this.shapes.push(this.newShape());
        this.active = this.shapes.length - 1;
      }
      const [nx, ny] = this.toNorm(px, py);
      const s = this.shapes[this.active];
      s.pts.push({ x: clamp01(nx), y: clamp01(ny), h: null, corner: false });
      this.selPt = s.pts.length - 1;
      this.drag = { kind: "pt", s: this.active, i: this.selPt, dx: 0, dy: 0 };
      this.emit(true);
    });
    __publicField(this, "onMove", (e) => {
      var _a;
      const [px, py] = this.eventPos(e);
      const d = this.drag;
      if (!d) {
        const hit = this.mode === "pin" ? null : this.pick(px, py);
        const clone = hit ? null : this.pickClone(px, py);
        const changed = JSON.stringify(hit) !== JSON.stringify(this.hover) || JSON.stringify(clone) !== JSON.stringify(this.hoverClone);
        this.hover = hit;
        this.hoverClone = clone;
        this.canvas.style.cursor = hit || clone ? "pointer" : "crosshair";
        if (changed) this.draw();
        return;
      }
      if (d.kind === "pan") {
        this.panX = px - d.x;
        this.panY = py - d.y;
        this.draw();
        return;
      }
      if (d.kind === "scrub") {
        d.apply(py, e.shiftKey);
        this.emit(false);
        return;
      }
      if (d.kind === "marquee") {
        d.x1 = px;
        d.y1 = py;
        this.draw();
        return;
      }
      const [nx, ny] = this.toNorm(px, py);
      if (d.kind === "radius") return this.dragRadius(d.s, d.i, nx, ny);
      if (d.kind === "pin") {
        const p2 = this.pins[d.i];
        const nxc = clamp01(nx + d.dx);
        const nyc = clamp01(ny + d.dy);
        if (d.group) {
          const dx = nxc - p2.x, dy = nyc - p2.y;
          for (const [, j] of d.group) {
            if (j === d.i) continue;
            this.pins[j].x = clamp01(this.pins[j].x + dx);
            this.pins[j].y = clamp01(this.pins[j].y + dy);
          }
        }
        p2.x = nxc;
        p2.y = nyc;
        this.emit(false);
        return;
      }
      const s = this.shapes[d.s];
      if (!s) return;
      if (d.kind === "pt") {
        const p2 = s.pts[d.i];
        const nxc = clamp01(nx + d.dx);
        const nyc = clamp01(ny + d.dy);
        if (d.group) {
          const dx = nxc - p2.x, dy = nyc - p2.y;
          for (const [gs, gi] of d.group) {
            if (gs === d.s && gi === d.i) continue;
            const q = (_a = this.shapes[gs]) == null ? void 0 : _a.pts[gi];
            if (!q) continue;
            q.x = clamp01(q.x + dx);
            q.y = clamp01(q.y + dy);
          }
        }
        p2.x = nxc;
        p2.y = nyc;
      } else {
        const p2 = s.pts[d.i];
        this.ensureHandles(s, d.i);
        const hx = nx - p2.x;
        const hy = ny - p2.y;
        p2.h[d.side] = hx;
        p2.h[d.side + 1] = hy;
        if (!e.altKey) {
          const other = d.side === 0 ? 2 : 0;
          p2.h[other] = -hx;
          p2.h[other + 1] = -hy;
        }
      }
      this.emit(false);
    });
    __publicField(this, "onUp", (e) => {
      var _a;
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
      }
      if (d.kind === "marquee") {
        this.finishMarquee(d);
        this.draw();
        (_a = this.onState) == null ? void 0 : _a.call(this);
        return;
      }
      if (d.kind !== "pan") this.commit();
    });
    __publicField(this, "onDblClick", (e) => {
      if (this.mode === "pin") return;
      const [px, py] = this.eventPos(e);
      const hit = this.pick(px, py);
      if (!hit && this.active >= 0) {
        const s = this.shapes[this.active];
        const n = s.pts.length;
        if (n >= 2) {
          const [ax, ay] = this.toScreen(s.pts[n - 1].x, s.pts[n - 1].y);
          const [bx, by] = this.toScreen(s.pts[n - 2].x, s.pts[n - 2].y);
          if (Math.hypot(ax - bx, ay - by) < HIT) s.pts.pop();
        }
        if (this.mode === "shape" && s.pts.length >= MIN_PTS.shape) s.closed = true;
        this.finishShape();
        return;
      }
      if (!hit || hit.handle >= 0) return;
      this.snapshot();
      const p2 = this.shapes[hit.s].pts[hit.i];
      p2.corner = !p2.corner;
      if (p2.corner) p2.h = null;
      this.commit();
    });
    __publicField(this, "onWheel", (e) => {
      e.preventDefault();
      const [px, py] = this.eventPos(e);
      const [nx, ny] = this.toNorm(px, py);
      this.zoom = Math.max(0.2, Math.min(24, this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      this.panX = px - nx * this.viewW;
      this.panY = py - ny * this.viewH;
      this.draw();
    });
    __publicField(this, "onKey", (e) => {
      var _a;
      if (!this.canvas.isConnected) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") {
        const prev = this.undo.pop();
        if (prev != null) {
          e.preventDefault();
          e.stopPropagation();
          const keep = this.undo;
          this.deserialise(prev);
          this.undo = keep;
          this.emit(true);
        }
        return;
      }
      if (e.key === "Escape" && this.sel.size) {
        e.preventDefault();
        e.stopPropagation();
        this.sel.clear();
        this.draw();
        (_a = this.onState) == null ? void 0 : _a.call(this);
        return;
      }
      if (e.key === "Enter") {
        e.stopPropagation();
        this.finishShape();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.stopPropagation();
        this.deleteActive();
        return;
      }
      if (e.key === "f" || e.key === "F") {
        this.fitView();
      }
    });
    this.mode = opts.mode;
    if (opts.mode === "shape") this.newType = "bspline";
    this.onEdit = opts.onEdit;
    this.onState = opts.onState;
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:crosshair";
    this.ctx = this.canvas.getContext("2d");
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
    this.canvas.addEventListener("dblclick", this.onDblClick);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey, true);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
  }
  destroy() {
    this.ro.disconnect();
    window.removeEventListener("keydown", this.onKey, true);
    this.destroyLive();
  }
  /* ── View ──────────────────────────────────────────────────────────────── */
  setImage(img, w, h) {
    this.image = img;
    this.imgW = Math.max(1, w);
    this.imgH = Math.max(1, h);
    this.preview = null;
    this.geomRev++;
    this.matteKey = "";
    if (this.mode === "pin" && img) {
      if (!this.live) this.live = new FieldPreview();
      this.live.setImage(img, this.imgW, this.imgH);
    }
    this.fitView();
  }
  destroyLive() {
    var _a;
    (_a = this.live) == null ? void 0 : _a.destroy();
    this.live = null;
  }
  get aspect() {
    return this.imgW / this.imgH;
  }
  /** The backdrop as a base64 PNG, for the backend preview to work on when it
   *  has no cached frame of its own. Null if there is nothing to send. */
  sourceFrame(maxSide = 640) {
    if (!this.image) return null;
    const scale = Math.min(1, maxSide / Math.max(this.imgW, this.imgH));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(this.imgW * scale));
    c.height = Math.max(1, Math.round(this.imgH * scale));
    try {
      c.getContext("2d").drawImage(this.image, 0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    } catch {
      return null;
    }
  }
  fitView() {
    const { width: cw, height: ch } = this.logicalSize();
    this.fit = Math.min(cw / this.imgW, ch / this.imgH) * 0.96;
    this.zoom = 1;
    this.panX = (cw - this.imgW * this.fit) / 2;
    this.panY = (ch - this.imgH * this.fit) / 2;
    this.draw();
  }
  logicalSize() {
    const r = this.canvas.getBoundingClientRect();
    return { width: Math.max(1, r.width), height: Math.max(1, r.height) };
  }
  resize() {
    const { width, height } = this.logicalSize();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.fit === 1) this.fitView();
    }
    this.draw();
  }
  get viewW() {
    return this.imgW * this.fit * this.zoom;
  }
  get viewH() {
    return this.imgH * this.fit * this.zoom;
  }
  /** Flattening tolerance for *drawing*: a third of a screen pixel at the
   *  current zoom. Serialization uses the fixed fine tolerance instead — the
   *  mask must not get coarser just because the editor happened to be zoomed
   *  out when it was saved. */
  get drawTol() {
    return Math.max(1e-7, 0.33 / Math.max(1, this.viewW));
  }
  toScreen(nx, ny) {
    return [this.panX + nx * this.viewW, this.panY + ny * this.viewH];
  }
  toNorm(sx, sy) {
    return [(sx - this.panX) / this.viewW, (sy - this.panY) / this.viewH];
  }
  eventPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  /* ── Model ─────────────────────────────────────────────────────────────── */
  snapshot() {
    this.undo.push(this.serialise());
    if (this.undo.length > UNDO_DEPTH$1) this.undo.shift();
  }
  newShape() {
    return {
      type: this.newType,
      op: this.newOp,
      // Born open even in mask mode: a shape closes when you click its first
      // point or double-click empty space, so what you see while drawing is the
      // stroke you have actually laid down.
      closed: false,
      feather: 0,
      speed: 1,
      pts: []
    };
  }
  /**
   * The handle offsets a point actually has — its own, or the automatic
   * Catmull-Rom tangent the curve is being drawn with.
   *
   * Without this the handles are invisible until they exist, and they only come
   * to exist by dragging one: you cannot grab what is not drawn. Resolving the
   * implicit tangent means the handles are always there to see and to grab, and
   * touching one just freezes the value that was already in effect.
   */
  handlesOf(s, i) {
    const p2 = s.pts[i];
    if (p2.corner) return null;
    if (p2.h) return p2.h;
    if (s.pts.length < 2) return null;
    const segs = bezierSegments(s.pts, s.closed);
    const n = s.pts.length;
    const outSeg = segs[i];
    const inSeg = segs[(i - 1 + n) % n];
    const ox = outSeg ? outSeg[1][0] - p2.x : 0;
    const oy = outSeg ? outSeg[1][1] - p2.y : 0;
    const ix = inSeg && (s.closed || i > 0) ? inSeg[2][0] - p2.x : -ox;
    const iy = inSeg && (s.closed || i > 0) ? inSeg[2][1] - p2.y : -oy;
    return [ix, iy, ox, oy];
  }
  /** Freeze the implicit tangent so it can be edited. */
  ensureHandles(s, i) {
    const p2 = s.pts[i];
    if (!p2.h) p2.h = this.handlesOf(s, i) ?? [0, 0, 0, 0];
  }
  static key(s, i) {
    return `${s},${i}`;
  }
  /** The points a gesture on (s, i) acts on: the box selection if it is part of
   *  one, otherwise just itself. */
  targets(s, i) {
    if (!this.sel.has(SplineEditor.key(s, i))) return [[s, i]];
    return [...this.sel].map((k) => k.split(",").map(Number));
  }
  /** Distance from a point to the cursor, in image pixels. Normalized units are
   *  anisotropic on a non-square frame; a feather radius must not be. */
  distPx(nx, ny, px, py) {
    return Math.hypot((nx - px) * this.imgW, (ny - py) * this.imgH);
  }
  deleteActive() {
    var _a;
    if (this.sel.size) {
      this.snapshot();
      const byShape = /* @__PURE__ */ new Map();
      for (const k of this.sel) {
        const [s, i] = k.split(",").map(Number);
        (byShape.get(s) ?? byShape.set(s, []).get(s)).push(i);
      }
      for (const [s, idx] of byShape) {
        idx.sort((a, b) => b - a);
        const list = this.mode === "pin" ? this.pins : (_a = this.shapes[s]) == null ? void 0 : _a.pts;
        if (!list) continue;
        for (const i of idx) list.splice(i, 1);
      }
      if (this.mode !== "pin") {
        this.shapes = this.shapes.filter((s) => s.pts.length > 0);
        this.active = Math.min(this.active, this.shapes.length - 1);
      }
      this.sel.clear();
      this.selPt = -1;
      this.commit();
      return;
    }
    if (this.mode === "pin") {
      if (this.selPt < 0) return;
      this.snapshot();
      this.pins.splice(this.selPt, 1);
      this.selPt = -1;
    } else {
      if (this.active < 0) return;
      this.snapshot();
      this.shapes.splice(this.active, 1);
      this.active = Math.min(this.active, this.shapes.length - 1);
      this.selPt = -1;
    }
    this.commit();
  }
  /** Take every feather clone away, so all the edges go back to hard. Scoped to
   *  the box selection when there is one — otherwise the whole drawing. */
  clearFeather() {
    var _a;
    if (this.mode !== "shape") return;
    this.snapshot();
    if (this.sel.size) {
      for (const k of this.sel) {
        const [si, i] = k.split(",").map(Number);
        const p2 = (_a = this.shapes[si]) == null ? void 0 : _a.pts[i];
        if (p2) p2.fo = null;
      }
    } else {
      for (const s of this.shapes) for (const p2 of s.pts) p2.fo = null;
    }
    this.commit();
  }
  /** How many points currently carry a feather clone, for the status bar. */
  get featherCount() {
    if (this.mode !== "shape") return 0;
    let n = 0;
    for (const s of this.shapes) for (const p2 of s.pts) if (p2.fo) n++;
    return n;
  }
  clearAll() {
    this.snapshot();
    this.shapes = [];
    this.pins = [];
    this.active = -1;
    this.selPt = -1;
    this.sel.clear();
    this.commit();
  }
  /** Finish the shape being drawn, so the next click starts a new one. */
  finishShape() {
    if (this.active < 0) return;
    const s = this.shapes[this.active];
    const need = this.mode === "shape" ? MIN_PTS.shape : MIN_PTS.path;
    if (s.pts.length < need) {
      this.shapes.splice(this.active, 1);
    } else if (this.mode === "shape") {
      s.closed = true;
    }
    this.active = -1;
    this.selPt = -1;
    this.commit();
  }
  setActiveProp(key, value) {
    if (this.active < 0) return;
    this.snapshot();
    this.shapes[this.active][key] = value;
    this.commit();
  }
  get activeShape() {
    return this.active >= 0 ? this.shapes[this.active] ?? null : null;
  }
  /* ── Serialization ─────────────────────────────────────────────────────── */
  serialise() {
    const aspect = Number(this.aspect.toFixed(6));
    if (this.mode === "pin") {
      return JSON.stringify({
        v: 1,
        t: 0,
        aspect,
        pins: this.pins.map((p2) => ({
          x: round(p2.x),
          y: round(p2.y),
          blur: round(p2.blur),
          r: round(p2.r)
        }))
      });
    }
    const key = this.mode === "shape" ? "shapes" : "paths";
    const items = this.shapes.filter((s) => s.pts.length >= (this.mode === "shape" ? MIN_PTS.shape : MIN_PTS.path)).map((s) => {
      const closed = this.mode === "shape" ? true : s.closed;
      const { poly, us } = flattenP(s.pts, s.type, closed);
      const base = {
        type: s.type,
        closed,
        pts: s.pts.map((p2) => ({
          x: round(p2.x),
          y: round(p2.y),
          ...p2.h ? { h: p2.h.map(round) } : {},
          ...p2.corner ? { corner: true } : {},
          ...p2.fo ? { fo: [round2(p2.fo[0]), round2(p2.fo[1])] } : {},
          ...p2.sp != null && p2.sp !== 1 ? { sp: round2(p2.sp) } : {}
        })),
        poly: poly.map((q) => [round(q[0]), round(q[1])])
      };
      if (this.mode === "shape") {
        base.op = s.op;
        base.feather = round2(s.feather);
        if (s.pts.some((p2) => p2.fo)) {
          const fx = sampleAttr(s.pts, s.type, closed, us, (p2) => {
            var _a;
            return ((_a = p2.fo) == null ? void 0 : _a[0]) ?? 0;
          });
          const fy = sampleAttr(s.pts, s.type, closed, us, (p2) => {
            var _a;
            return ((_a = p2.fo) == null ? void 0 : _a[1]) ?? 0;
          });
          base.fo = fx.map((v, i) => [round2(v), round2(fy[i])]);
        }
      } else {
        base.speed = round(s.speed);
        if (s.pts.some((p2) => (p2.sp ?? 1) !== 1)) {
          base.sv = sampleAttr(s.pts, s.type, closed, us, (p2) => Math.max(0, p2.sp ?? 1)).map((v) => round2(Math.max(0, v)));
        }
      }
      return base;
    });
    return JSON.stringify({ v: 1, t: 0, aspect, [key]: items });
  }
  deserialise(json) {
    var _a;
    let data;
    try {
      data = JSON.parse(json || "{}");
    } catch {
      return;
    }
    this.active = -1;
    this.selPt = -1;
    this.sel.clear();
    if (this.mode === "pin") {
      const raw = Array.isArray(data == null ? void 0 : data.pins) ? data.pins : [];
      this.pins = raw.map((p2) => ({
        x: clamp01(num(p2 == null ? void 0 : p2.x, 0.5)),
        y: clamp01(num(p2 == null ? void 0 : p2.y, 0.5)),
        blur: clamp01(num(p2 == null ? void 0 : p2.blur, 0.5)),
        // Absent in pins saved before reach existed — the default is what they
        // were rendered with, so old workflows come back identical.
        r: Math.max(0.01, num(p2 == null ? void 0 : p2.r, DEFAULT_INFLUENCE))
      }));
    } else {
      const raw = Array.isArray(data == null ? void 0 : data.shapes) ? data.shapes : Array.isArray(data == null ? void 0 : data.paths) ? data.paths : [];
      this.shapes = raw.map((s) => ({
        type: (s == null ? void 0 : s.type) === "bspline" || (s == null ? void 0 : s.type) === "xspline" ? "bspline" : "bezier",
        op: (s == null ? void 0 : s.op) === "sub" ? "sub" : "add",
        closed: (s == null ? void 0 : s.closed) ?? this.mode === "shape",
        feather: Math.max(0, num(s == null ? void 0 : s.feather, 0)),
        speed: Math.max(0, num(s == null ? void 0 : s.speed, 1)),
        pts: (Array.isArray(s == null ? void 0 : s.pts) ? s.pts : []).map((p2) => ({
          x: num(p2 == null ? void 0 : p2.x, 0),
          y: num(p2 == null ? void 0 : p2.y, 0),
          h: Array.isArray(p2 == null ? void 0 : p2.h) && p2.h.length === 4 ? p2.h.map((v) => num(v, 0)) : null,
          corner: !!(p2 == null ? void 0 : p2.corner),
          w: Math.max(MIN_W$1, Math.min(MAX_W, num(p2 == null ? void 0 : p2.w, MIN_W$1))),
          fo: Array.isArray(p2 == null ? void 0 : p2.fo) && p2.fo.length === 2 ? [num(p2.fo[0], 0), num(p2.fo[1], 0)] : null,
          sp: Math.max(0, num(p2 == null ? void 0 : p2.sp, 1))
        }))
      })).filter((s) => s.pts.length > 0);
    }
    this.geomRev++;
    this.matteKey = "";
    this.draw();
    (_a = this.onState) == null ? void 0 : _a.call(this);
  }
  emit(commit) {
    var _a;
    this.geomRev++;
    if (this.mode === "pin" && this.live) this.preview = null;
    if (commit) this.onEdit(this.serialise());
    this.draw();
    if (commit) (_a = this.onState) == null ? void 0 : _a.call(this);
  }
  /** Rebuild whatever this mode uses as a backdrop and repaint. */
  refreshView() {
    this.matteKey = "";
    this.draw();
  }
  /**
   * The flattened outline and feather offsets of a shape, memoized.
   *
   * The matte builder and the on-canvas guides both want exactly this, and a
   * drag redraws both every frame. Keyed on the edit counter and the tolerance,
   * so a hover or a selection change reuses it and a zoom does not.
   */
  shapeGeom(s) {
    const tol = this.drawTol;
    const hit = this.geomCache.get(s);
    if (hit && hit.rev === this.geomRev && hit.tol === tol) return hit;
    let entry;
    if (this.mode === "shape" && s.pts.some((p2) => p2.fo)) {
      const got = flattenFeathered(
        s.pts,
        s.type,
        s.closed,
        tol,
        (p2) => {
          var _a;
          return (((_a = p2.fo) == null ? void 0 : _a[0]) ?? 0) / this.imgW;
        },
        (p2) => {
          var _a;
          return (((_a = p2.fo) == null ? void 0 : _a[1]) ?? 0) / this.imgH;
        }
      );
      entry = { rev: this.geomRev, tol, ...got };
    } else {
      const { poly, us } = flattenP(s.pts, s.type, s.closed, tol);
      entry = { rev: this.geomRev, tol, poly, us, off: null };
    }
    this.geomCache.set(s, entry);
    return entry;
  }
  /**
   * The backend result no longer matches the settings, so drop it.
   *
   * Needed for anything that changes the render WITHOUT touching the geometry —
   * the sliders. Without it the stale result keeps holding the backdrop and the
   * live shader never gets a look in, so the view only caught up when you
   * happened to nudge a pin.
   */
  invalidatePreview() {
    this.preview = null;
    this.draw();
  }
  commit() {
    this.emit(true);
  }
  /* ── Input ─────────────────────────────────────────────────────────────── */
  pick(px, py) {
    if (this.mode !== "pin" && this.active >= 0 && this.selPt >= 0) {
      const s = this.shapes[this.active];
      const p2 = s == null ? void 0 : s.pts[this.selPt];
      const h = p2 && s.type === "bezier" ? this.handlesOf(s, this.selPt) : null;
      if (h) {
        for (const side of [0, 2]) {
          const [hx, hy] = this.toScreen(p2.x + h[side], p2.y + h[side + 1]);
          if (Math.hypot(px - hx, py - hy) <= HANDLE_HIT) {
            return { s: this.active, i: this.selPt, handle: side };
          }
        }
      }
    }
    const order = this.shapes.map((_, i) => i).sort((a, b) => (b === this.active ? 1 : 0) - (a === this.active ? 1 : 0));
    for (const si of order) {
      const s = this.shapes[si];
      for (let i = 0; i < s.pts.length; i++) {
        const [sx, sy] = this.toScreen(s.pts[i].x, s.pts[i].y);
        if (Math.hypot(px - sx, py - sy) <= HIT) return { s: si, i, handle: -1 };
      }
    }
    return null;
  }
  /** Which finished shape's curve is under the cursor, and where a point goes. */
  pickCurve(px, py) {
    const [nx, ny] = this.toNorm(px, py);
    const aspect = this.viewW / Math.max(1, this.viewH);
    const tol = HIT / Math.max(1, this.viewH);
    for (let si = this.shapes.length - 1; si >= 0; si--) {
      const s = this.shapes[si];
      if (s.pts.length < 2) continue;
      const got = insertionIndex(s.pts, s.type, s.closed, [nx, ny], tol, aspect);
      if (!got) continue;
      if (si === this.active && !s.closed && got.at >= s.pts.length) continue;
      return { s: si, at: got.at, x: got.point[0], y: got.point[1] };
    }
    return null;
  }
  downPin(e, px, py) {
    for (let i = this.pins.length - 1; i >= 0; i--) {
      const [cx, cy] = this.toScreen(this.pins[i].x, this.pins[i].y);
      if (hitDot(px, py, cx, cy)) {
        if (e.ctrlKey || e.metaKey) {
          this.selPt = i;
          this.snapshot();
          this.drag = { kind: "radius", s: 0, i };
          this.emit(true);
          return;
        }
        if (e.shiftKey) {
          this.snapshot();
          this.pins.splice(i, 1);
          this.selPt = -1;
          this.sel.clear();
          this.commit();
          return;
        }
        const inSel = this.sel.has(SplineEditor.key(0, i));
        if (!inSel && this.sel.size) this.sel.clear();
        this.selPt = i;
        this.snapshot();
        const [nx2, ny2] = this.toNorm(px, py);
        this.drag = {
          kind: "pin",
          i,
          dx: this.pins[i].x - nx2,
          dy: this.pins[i].y - ny2,
          group: inSel ? this.targets(0, i) : void 0
        };
        this.emit(true);
        return;
      }
      if (hitRing(px, py, cx, cy) && !e.shiftKey) {
        this.selPt = i;
        this.snapshot();
        const pin = this.pins[i];
        this.drag = {
          kind: "scrub",
          apply: startScrub(py, () => pin.blur, (v) => {
            pin.blur = v;
          })
        };
        this.emit(true);
        return;
      }
    }
    if (e.shiftKey) {
      this.drag = { kind: "marquee", x0: px, y0: py, x1: px, y1: py };
      this.draw();
      return;
    }
    this.sel.clear();
    this.snapshot();
    const [nx, ny] = this.toNorm(px, py);
    this.pins.push({ x: clamp01(nx), y: clamp01(ny), blur: 0, r: DEFAULT_INFLUENCE });
    this.selPt = this.pins.length - 1;
    this.drag = { kind: "pin", i: this.selPt, dx: 0, dy: 0 };
    this.emit(true);
  }
  /**
   * The Ctrl-drag, and the drag of a feather clone once it exists.
   *
   * For a mask the cursor *is* the answer: the clone goes where it is put, so
   * the soft edge reaches exactly there. A box selection moves every clone by
   * the same offset rather than stacking them all on the cursor — the whole
   * point of selecting several is to keep their relationship.
   *
   * The other two modes have nothing to place — a stroke's direction comes from
   * the flow and a pin's reach is a radius — so there the drag is a distance.
   */
  dragRadius(s, i, nx, ny) {
    var _a, _b, _c, _d, _e;
    if (this.mode === "pin") {
      const p22 = this.pins[i];
      const d = Math.hypot(nx - p22.x, ny - p22.y);
      for (const [, j] of this.targets(0, i)) {
        this.pins[j].r = Math.max(0.01, Math.min(4, d));
      }
      this.emit(false);
      return;
    }
    const p2 = (_a = this.shapes[s]) == null ? void 0 : _a.pts[i];
    if (!p2) return;
    if (this.mode === "shape") {
      const want = [(nx - p2.x) * this.imgW, (ny - p2.y) * this.imgH];
      const was = p2.fo ?? [0, 0];
      const dx = want[0] - was[0], dy = want[1] - was[1];
      for (const [ts, ti] of this.targets(s, i)) {
        const q = (_b = this.shapes[ts]) == null ? void 0 : _b.pts[ti];
        if (!q) continue;
        if (ts === s && ti === i) q.fo = want;
        else q.fo = [(((_c = q.fo) == null ? void 0 : _c[0]) ?? 0) + dx, (((_d = q.fo) == null ? void 0 : _d[1]) ?? 0) + dy];
      }
      this.emit(false);
      return;
    }
    const px = this.distPx(nx, ny, p2.x, p2.y);
    for (const [ts, ti] of this.targets(s, i)) {
      const q = (_e = this.shapes[ts]) == null ? void 0 : _e.pts[ti];
      if (q) q.sp = Math.min(8, px / Math.max(1, this.strength));
    }
    this.emit(false);
  }
  /** Select every point inside the marquee. A click-sized rect just clears. */
  finishMarquee(d) {
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1);
    const y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    this.sel.clear();
    if (x1 - x0 < MARQUEE_MIN && y1 - y0 < MARQUEE_MIN) return;
    const inside = (nx, ny) => {
      const [x, y] = this.toScreen(nx, ny);
      return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    };
    if (this.mode === "pin") {
      this.pins.forEach((p2, i) => {
        if (inside(p2.x, p2.y)) this.sel.add(SplineEditor.key(0, i));
      });
    } else {
      this.shapes.forEach((s, si) => s.pts.forEach((p2, i) => {
        if (inside(p2.x, p2.y)) this.sel.add(SplineEditor.key(si, i));
      }));
    }
  }
  /* ── Matte ─────────────────────────────────────────────────────────────── */
  /**
   * Composite the shapes into a real matte, offscreen, at image resolution.
   *
   * Deliberately mirrors `blur_core.rasterize` rather than approximating it:
   * `add` is `lighten` (a max) and `sub` draws the *inverted* coverage with
   * `darken` (a min against 1 - coverage). Per-shape feather is a canvas blur
   * filter applied before compositing, same order as the backend — which is what
   * makes a soft cut-out look right instead of merely dark.
   *
   * Cheap enough to redo on every mouse move, which is why this one preview is
   * genuinely live while the blurs need a round trip.
   */
  /**
   * Rebuild the matte only when something it depends on actually moved.
   *
   * It is drawn in *screen* space, so panning and zooming change it as much as
   * editing does — but a hover, a selection or a cursor change do not, and those
   * are most of the redraws.
   */
  ensureMatte() {
    const key = `${this.geomRev}|${this.panX}|${this.panY}|${this.viewW}|${this.viewH}|${this.canvas.width}|${this.canvas.height}|${this.drag ? 1 : 0}`;
    if (key === this.matteKey) return;
    this.matteKey = key;
    this.buildMatte();
  }
  /**
   * Composite the shapes into a matte at *screen* resolution.
   *
   * Image resolution is the obvious choice and it is the wrong one twice over. A
   * fixed 1024 stretched to a zoomed-in view is visibly blocky — a hard edge
   * survives that upscale looking merely sharp, but a feather gradient turns to
   * stair-steps, which is exactly when it starts to matter. And in the other
   * direction it is wasted work: a 6000 px plate zoomed out to fit is drawn into
   * a fraction of that many pixels either way.
   *
   * One matte pixel per screen pixel is crisp at every zoom AND bounded by the
   * window, so the cost no longer follows the plate size at all.
   */
  buildMatte() {
    if (this.mode !== "shape") return;
    const { width: lw, height: lh } = this.logicalSize();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const q = Math.max(1, Math.min(dpr, Math.sqrt(MATTE_MAX_PX / Math.max(1, lw * lh))));
    const w = Math.max(16, Math.round(lw * q));
    const h = Math.max(16, Math.round(lh * q));
    if (!this.matte) this.matte = document.createElement("canvas");
    const acc = this.matte;
    if (acc.width !== w || acc.height !== h) {
      acc.width = w;
      acc.height = h;
    }
    const a = acc.getContext("2d");
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.globalCompositeOperation = "source-over";
    a.fillStyle = "#000";
    a.fillRect(0, 0, w, h);
    if (!this.scratch) this.scratch = document.createElement("canvas");
    const tmp = this.scratch;
    if (tmp.width !== w || tmp.height !== h) {
      tmp.width = w;
      tmp.height = h;
    }
    const t = tmp.getContext("2d");
    const sx = this.viewW * q, sy = this.viewH * q;
    const ox = this.panX * q, oy = this.panY * q;
    const scale = sx / Math.max(1, this.imgW);
    for (const s of this.shapes) {
      if (s.pts.length < 3 || !s.closed) continue;
      const { poly, off } = this.shapeGeom(s);
      if (poly.length < 3) continue;
      const sub = s.op === "sub";
      const rings = this.featherRings(s, poly, off);
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.filter = "none";
      t.globalCompositeOperation = "source-over";
      t.fillStyle = "#000";
      t.fillRect(0, 0, w, h);
      const k = rings.length;
      const outward = polyArea(rings[k - 1]) >= polyArea(rings[0]);
      const seq = outward ? rings.slice().reverse() : rings;
      const trace = (ring) => {
        t.moveTo(ox + ring[0][0] * sx, oy + ring[0][1] * sy);
        for (let i = 1; i < ring.length; i++) {
          t.lineTo(ox + ring[i][0] * sx, oy + ring[i][1] * sy);
        }
        t.closePath();
      };
      t.globalCompositeOperation = "lighter";
      t.fillStyle = "#fff";
      t.beginPath();
      trace(seq[k - 1]);
      t.fill();
      for (let i = 0; i < k - 1; i++) {
        const level = Math.round(255 * (i + 1) / k);
        t.fillStyle = `rgb(${level},${level},${level})`;
        t.beginPath();
        trace(seq[i]);
        trace(seq[i + 1]);
        t.fill("evenodd");
      }
      t.globalCompositeOperation = "source-over";
      if (sub) {
        t.globalCompositeOperation = "difference";
        t.fillStyle = "#fff";
        t.fillRect(0, 0, w, h);
      }
      a.filter = s.feather > 0 ? `blur(${(s.feather * scale).toFixed(2)}px)` : "none";
      a.globalCompositeOperation = sub ? "darken" : "lighten";
      a.drawImage(tmp, 0, 0);
      a.filter = "none";
    }
    a.globalCompositeOperation = "source-over";
  }
  /**
   * The nested outlines whose average IS the per-point feather gradient.
   *
   * A pixel inside j of them has coverage j/K, and `rampOffsets` places them so
   * that works out to a smoothstep across the band rather than a straight ramp.
   * No distance transform, and nothing that has to be written twice —
   * `blur_core._shape_rings` builds the identical list.
   *
   * With no per-point feather this is one ring, the outline itself, and the fill
   * below is what it was before feathering existed.
   */
  featherRings(s, poly, off) {
    if (!off) return [poly];
    let reach = 0;
    for (let i = 0; i < poly.length; i++) {
      const d = Math.hypot(off[i][0] * this.imgW, off[i][1] * this.imgH);
      if (d > reach) reach = d;
    }
    let k = rampRings(reach * (this.viewW / Math.max(1, this.imgW)));
    if (this.drag) k = Math.min(k, DRAG_RINGS);
    return rampOffsets(k).map((t) => poly.map((p2, i) => [p2[0] + off[i][0] * t, p2[1] + off[i][1] * t]));
  }
  /* ── Drawing ───────────────────────────────────────────────────────────── */
  drawBackdrop() {
    const ctx = this.ctx;
    const box = [this.panX, this.panY, this.viewW, this.viewH];
    if (this.mode === "shape") {
      if (this.view !== "source") this.ensureMatte();
      const { width: lw, height: lh } = this.logicalSize();
      const put = () => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(...box);
        ctx.clip();
        ctx.drawImage(this.matte, 0, 0, lw, lh);
        ctx.restore();
      };
      if (this.view === "matte" && this.matte) {
        put();
        return;
      }
      if (this.image) ctx.drawImage(this.image, ...box);
      if (this.view === "source" || !this.matte) return;
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.55;
      put();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      return;
    }
    if (this.view === "source") {
      if (this.image) ctx.drawImage(this.image, ...box);
      return;
    }
    if (this.mode === "pin" && this.live && (!this.preview || this.view === "field")) {
      const scale = this.live.canvas.width / Math.max(1, this.imgW);
      if (this.live.render(
        this.pins,
        this.maxBlur * scale,
        this.falloff,
        this.view === "field"
      )) {
        ctx.drawImage(this.live.canvas, ...box);
        return;
      }
    }
    const src = this.preview ?? this.image;
    if (src) ctx.drawImage(src, ...box);
  }
  draw() {
    var _a;
    const ctx = this.ctx;
    const { width, height } = this.logicalSize();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = this.zoom < 4;
    this.drawBackdrop();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.panX, this.panY, this.viewW, this.viewH);
    if (!this.showCurves) return;
    if (this.mode === "pin") this.drawPins();
    else this.shapes.forEach((s, si) => this.drawShape(s, si));
    if (((_a = this.drag) == null ? void 0 : _a.kind) === "marquee") {
      const d = this.drag;
      const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
      ctx.save();
      ctx.fillStyle = "rgba(74,180,255,0.10)";
      ctx.fillRect(x, y, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      ctx.strokeStyle = C.marquee;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x, y, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      ctx.restore();
    }
  }
  /**
   * The softness guide: a second outline offset by each point's own feather,
   * dashed, with a tether to the point it belongs to.
   *
   * Fusion's convention, and it is the right one — the value being edited is a
   * distance on the image, so showing it as a distance on the image beats any
   * number in a panel. A point with no feather has no clone to draw.
   */
  drawFeather(s, si) {
    if (this.mode !== "shape" || !s.closed || s.pts.length < 3) return;
    const ctx = this.ctx;
    const { poly, off } = this.shapeGeom(s);
    if (poly.length < 3 || !off) return;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = si === this.active ? C.soft : C.softDim;
    ctx.fillStyle = si === this.active ? C.soft : C.softDim;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const [x0, y0] = this.toScreen(poly[0][0] + off[0][0], poly[0][1] + off[0][1]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < poly.length; i++) {
      const [x, y] = this.toScreen(poly[i][0] + off[i][0], poly[i][1] + off[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    s.pts.forEach((p2, i) => {
      var _a, _b;
      if (!p2.fo) return;
      const [cx, cy] = this.toScreen(p2.x, p2.y);
      const [gx, gy] = this.clonePos(p2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      const hot = ((_a = this.hoverClone) == null ? void 0 : _a.s) === si && ((_b = this.hoverClone) == null ? void 0 : _b.i) === i;
      ctx.beginPath();
      ctx.arc(gx, gy, hot ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.ptStroke;
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = si === this.active ? C.soft : C.softDim;
      ctx.lineWidth = 1.2;
    });
    ctx.restore();
  }
  /** A feather clone's position on screen. */
  clonePos(p2) {
    const fo = p2.fo ?? [0, 0];
    return this.toScreen(p2.x + fo[0] / this.imgW, p2.y + fo[1] / this.imgH);
  }
  /** Which feather clone is under the cursor. They are grabbed directly, with no
   *  modifier — once one exists it is just another point on the canvas. */
  pickClone(px, py) {
    if (this.mode !== "shape") return null;
    const order = this.shapes.map((_, i) => i).sort((a, b) => (b === this.active ? 1 : 0) - (a === this.active ? 1 : 0));
    for (const si of order) {
      const s = this.shapes[si];
      if (!s.closed) continue;
      for (let i = 0; i < s.pts.length; i++) {
        if (!s.pts[i].fo) continue;
        const [gx, gy] = this.clonePos(s.pts[i]);
        if (Math.hypot(px - gx, py - gy) <= CLONE_HIT) return { s: si, i };
      }
    }
    return null;
  }
  /** A stroke point's own speed, drawn as the distance that pixel will travel. */
  drawSpeedGhost(s, si) {
    if (this.mode !== "path" || s.pts.length < 2) return;
    const ctx = this.ctx;
    const poly = flatten(s.pts, s.type, s.closed, this.drawTol);
    if (poly.length < 2) return;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = si === this.active ? C.soft : C.softDim;
    ctx.fillStyle = si === this.active ? C.soft : C.softDim;
    ctx.lineWidth = 1.2;
    s.pts.forEach((p2) => {
      const sp = p2.sp ?? 1;
      if (sp === 1) return;
      let best = 0, bd = Infinity;
      poly.forEach((q, j) => {
        const d = Math.hypot(q[0] - p2.x, q[1] - p2.y);
        if (d < bd) {
          bd = d;
          best = j;
        }
      });
      const nxt = poly[Math.min(poly.length - 1, best + 1)];
      const prv = poly[Math.max(0, best - 1)];
      let tx = (nxt[0] - prv[0]) * this.imgW, ty = (nxt[1] - prv[1]) * this.imgH;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      const travel = sp * this.strength;
      const [cx, cy] = this.toScreen(p2.x, p2.y);
      const [gx, gy] = this.toScreen(
        p2.x + tx * travel / this.imgW,
        p2.y + ty * travel / this.imgH
      );
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gx, gy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
  tracePath(ctx, s) {
    ctx.beginPath();
    if (s.type === "bezier") {
      const segs = bezierSegments(s.pts, s.closed);
      if (!segs.length) return;
      const [x0, y0] = this.toScreen(segs[0][0][0], segs[0][0][1]);
      ctx.moveTo(x0, y0);
      for (const [, c1, c2, p3] of segs) {
        const a = this.toScreen(c1[0], c1[1]);
        const b = this.toScreen(c2[0], c2[1]);
        const c = this.toScreen(p3[0], p3[1]);
        ctx.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
      }
    } else {
      const poly = flatten(s.pts, s.type, s.closed, this.drawTol);
      if (!poly.length) return;
      const [x0, y0] = this.toScreen(poly[0][0], poly[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < poly.length; i++) {
        const [x, y] = this.toScreen(poly[i][0], poly[i][1]);
        ctx.lineTo(x, y);
      }
    }
    if (s.closed) ctx.closePath();
  }
  drawShape(s, si) {
    const ctx = this.ctx;
    const isActive = si === this.active;
    const color = this.mode === "shape" ? s.op === "sub" ? C.sub : C.add : C.path;
    if (s.pts.length >= 2) {
      this.tracePath(ctx, s);
      if (s.closed && this.showFill && s.pts.length >= 3) {
        ctx.fillStyle = s.op === "sub" ? "rgba(255,107,107,0.20)" : "rgba(74,180,255,0.20)";
        ctx.fill();
      }
      ctx.strokeStyle = isActive ? color : C.idle;
      ctx.lineWidth = isActive ? 2 : 1.4;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
      if (!s.closed) this.drawArrow(s, color);
    }
    this.drawFeather(s, si);
    this.drawSpeedGhost(s, si);
    if (s.type === "bspline" && s.pts.length >= 2) {
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = isActive ? C.hull : "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const [x0, y0] = this.toScreen(s.pts[0].x, s.pts[0].y);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < s.pts.length; i++) {
        const [x, y] = this.toScreen(s.pts[i].x, s.pts[i].y);
        ctx.lineTo(x, y);
      }
      if (s.closed) ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    if (isActive && this.selPt >= 0 && s.type === "bezier") {
      const p2 = s.pts[this.selPt];
      const h = p2 ? this.handlesOf(s, this.selPt) : null;
      if (p2 && h) {
        const [cx, cy] = this.toScreen(p2.x, p2.y);
        ctx.strokeStyle = C.handle;
        ctx.fillStyle = C.handle;
        ctx.lineWidth = 1;
        for (const side of [0, 2]) {
          const [hx, hy] = this.toScreen(p2.x + h[side], p2.y + h[side + 1]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(hx, hy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    s.pts.forEach((p2, i) => {
      var _a, _b;
      const [x, y] = this.toScreen(p2.x, p2.y);
      const hovered = ((_a = this.hover) == null ? void 0 : _a.s) === si && ((_b = this.hover) == null ? void 0 : _b.i) === i && this.hover.handle < 0;
      const selected = isActive && i === this.selPt;
      const r = selected ? PT_R.active : hovered ? PT_R.hover : PT_R.idle;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1;
      ctx.beginPath();
      if (p2.corner) {
        ctx.rect(x - r, y - r, r * 2, r * 2);
      } else {
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = selected ? C.ptActive : hovered ? C.ptHover : isActive ? C.pt : C.idle;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = C.ptStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (this.sel.has(SplineEditor.key(si, i))) {
        ctx.strokeStyle = C.marquee;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
  /** Direction marker on an open stroke — which way the blur travels. */
  drawArrow(s, color) {
    const poly = flatten(s.pts, s.type, s.closed);
    if (poly.length < 2) return;
    const a = this.toScreen(poly[poly.length - 2][0], poly[poly.length - 2][1]);
    const b = this.toScreen(poly[poly.length - 1][0], poly[poly.length - 1][1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(b[0], b[1]);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-11, 5);
    ctx.lineTo(-11, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  drawPins() {
    const ctx = this.ctx;
    const px = this.viewW / Math.max(1, this.imgW);
    this.pins.forEach((p2, i) => {
      const [x, y] = this.toScreen(p2.x, p2.y);
      const radius = p2.blur * this.maxBlur;
      const rs = radius * px;
      if (rs > 2) {
        ctx.save();
        ctx.strokeStyle = i === this.selPt ? "rgba(74,180,255,0.55)" : "rgba(74,180,255,0.22)";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, rs, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (p2.r !== DEFAULT_INFLUENCE) {
        ctx.save();
        ctx.strokeStyle = i === this.selPt ? C.soft : C.softDim;
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(x, y, p2.r * this.viewW, p2.r * this.viewH, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      drawRing(ctx, x, y, p2.blur, C.add, i === this.selPt, `${Math.round(radius)} px`);
      if (this.sel.has(SplineEditor.key(0, i))) {
        ctx.save();
        ctx.strokeStyle = C.marquee;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
  }
  /** How many points the marquee is currently holding, for the status bar. */
  get selectionSize() {
    return this.sel.size;
  }
}
const polyArea = (poly) => {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p2 = poly[i], q = poly[(i + 1) % poly.length];
    a += p2[0] * q[1] - q[0] * p2[1];
  }
  return Math.abs(a) / 2;
};
const round = (v) => Math.round(v * 1e5) / 1e5;
const round2 = (v) => Math.round(v * 100) / 100;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const num = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d;
const HINTS = {
  shape: "click to add points · click the first point or double-click empty space to close · click on the curve to insert a point · double-click a point for a corner · ctrl-drag a point to pull out a feather clone, then drag the clone to say how far the edge fades (shift-click it to remove) · shift-drag empty space to box-select · shift-click to delete · click away from a finished shape to deselect it · H hides the curves · alt-drag pans · wheel zooms",
  path: "click to draw a stroke in the direction of movement · Enter finishes it · click on the stroke to insert a point · ctrl-drag a point for its own speed · shift-drag empty space to box-select · H hides the curves · alt-drag pans · wheel zooms",
  pin: "click to drop a pin · drag the ring to set its blur (shift for fine) · ctrl-drag a pin to widen its reach · shift-drag empty space to box-select · shift-click to delete · H hides the pins · alt-drag pans · wheel zooms"
};
function openSplineOverlay(opts) {
  var _a;
  let refreshBar = () => {
  };
  let note = "";
  const editor = new SplineEditor({
    mode: opts.mode,
    onEdit: (json) => {
      opts.onChange(json);
      requestPreview(json);
    },
    onState: () => refreshBar()
  });
  let token = 0;
  let timer;
  let shut = false;
  const post = (json, frame) => {
    var _a2;
    return api.fetchApi("/nkd/spline/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node: opts.nodeId,
        kind: opts.previewKind,
        params: {
          ...((_a2 = opts.previewParams) == null ? void 0 : _a2.call(opts)) ?? {},
          [opts.previewKey]: json,
          ...frame ? { frame } : {}
        }
      })
    });
  };
  function requestPreview(json) {
    if (shut || !opts.previewKind || !opts.previewKey || opts.nodeId == null) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      var _a2;
      const mine = ++token;
      note = "rendering…";
      refreshBar();
      try {
        let res = await post(json);
        if (mine !== token) return;
        if (res.status === 204) {
          const frame = editor.sourceFrame();
          if (!frame) {
            note = "run the graph once to preview";
            return;
          }
          res = await post(json, frame);
          if (mine !== token) return;
        }
        const err = res.headers.get("X-NKD-Error");
        if (err) {
          note = `preview failed: ${err}`;
          return;
        }
        if (!res.ok) {
          note = res.status === 404 ? "preview route missing — restart ComfyUI" : `preview failed (HTTP ${res.status})`;
          return;
        }
        const bitmap = await createImageBitmap(await res.blob());
        if (mine !== token) {
          (_a2 = bitmap.close) == null ? void 0 : _a2.call(bitmap);
          return;
        }
        editor.preview = bitmap;
        note = "";
        editor.draw();
      } catch (e) {
        if (mine === token) note = `preview failed: ${(e == null ? void 0 : e.message) ?? e}`;
      } finally {
        if (mine === token) refreshBar();
      }
    }, 160);
  }
  const modal = openNkdModal({
    title: opts.title,
    hint: HINTS[opts.mode],
    onClose: (reason) => {
      editor.finishShape();
      const json = editor.serialise();
      editor.destroy();
      opts.onClose(json, reason === "save");
    }
  });
  modal.body.appendChild(editor.canvas);
  editor.deserialise(opts.json);
  const settings = ((_a = opts.previewParams) == null ? void 0 : _a.call(opts)) ?? {};
  if (Number.isFinite(Number(settings.max_blur))) editor.maxBlur = Number(settings.max_blur);
  if (Number.isFinite(Number(settings.falloff))) editor.falloff = Number(settings.falloff);
  if (Number.isFinite(Number(settings.strength))) editor.strength = Number(settings.strength);
  editor.setImage(opts.image, opts.imageW, opts.imageH);
  const savedAspect = readAspect(opts.json);
  const status = document.createElement("span");
  status.className = "nkd-modal-status";
  modal.footerLeft.appendChild(status);
  const right = modal.footerRight;
  if (opts.mode !== "pin") {
    const setType = (t) => {
      editor.newType = t;
      if (editor.activeShape) editor.setActiveProp("type", t);
      refreshBar();
    };
    const bezier = nkdButton(
      "Bezier",
      () => setType("bezier"),
      "Points sit on the curve, with pen handles. Best for tracing an exact outline."
    );
    const bspline = nkdButton(
      "B-spline",
      () => setType("bspline"),
      "Smooth with far fewer points and no handles to wrangle — the roto standard. The points steer the curve rather than sitting on it, so it can never overshoot, however close together you put them. Double-click a point for a hard corner."
    );
    right.append(bezier, bspline);
    if (opts.mode === "shape") {
      const setOp = (o) => {
        editor.newOp = o;
        if (editor.activeShape) editor.setActiveProp("op", o);
        refreshBar();
      };
      const add = nkdButton("Add", () => setOp("add"), "This shape adds to the mask.");
      const sub = nkdButton(
        "Subtract",
        () => setOp("sub"),
        "This shape cuts out of the shapes before it — the way to make a hole."
      );
      right.append(add, sub);
      const feather = nkdSlider(
        "Feather",
        {
          min: 0,
          max: 128,
          step: 0.5,
          value: 0,
          width: 220,
          fine: 0.05,
          format: (v) => `${v.toFixed(2)} px`
        },
        (v) => editor.setActiveProp("feather", v),
        "Soften this shape's edge evenly, before it is combined with the others. Hold Shift while dragging for fine control — the radius is continuous, so a fraction of a pixel is a real difference and not a rounding."
      );
      right.appendChild(feather);
      const fill = nkdToggle(
        "Fill",
        true,
        (on) => {
          editor.showFill = on;
          editor.draw();
        },
        "Tint the inside of each shape, so you can tell them apart."
      );
      right.appendChild(fill);
      const noFeather = nkdButton(
        "Clear feather",
        () => editor.clearFeather(),
        "Remove every feather clone and put all the edges back to hard. With points box-selected it only clears those."
      );
      right.appendChild(noFeather);
      refreshBar = () => {
        const soft = editor.featherCount;
        noFeather.textContent = soft ? `Clear feather (${soft})` : "Clear feather";
        noFeather.disabled = soft === 0;
        const s = editor.activeShape;
        bezier.classList.toggle("on", ((s == null ? void 0 : s.type) ?? editor.newType) === "bezier");
        bspline.classList.toggle("on", ((s == null ? void 0 : s.type) ?? editor.newType) === "bspline");
        add.classList.toggle("on", ((s == null ? void 0 : s.op) ?? editor.newOp) === "add");
        sub.classList.toggle("on", ((s == null ? void 0 : s.op) ?? editor.newOp) === "sub");
        feather.setDisabled(!s);
        if (s) feather.sync(s.feather);
        setStatus(`${editor.shapes.length} shape${editor.shapes.length === 1 ? "" : "s"}`);
      };
    } else {
      const speed = nkdSlider(
        "Speed",
        {
          min: 0,
          max: 2,
          step: 0.05,
          value: 1,
          width: 180,
          format: (v) => `x${v.toFixed(2)}`
        },
        (v) => editor.setActiveProp("speed", v),
        "How fast this stroke moves, relative to the others. The node's Strength sets what full speed means in pixels."
      );
      right.appendChild(speed);
      refreshBar = () => {
        const s = editor.activeShape;
        bezier.classList.toggle("on", ((s == null ? void 0 : s.type) ?? editor.newType) === "bezier");
        bspline.classList.toggle("on", ((s == null ? void 0 : s.type) ?? editor.newType) === "bspline");
        speed.setDisabled(!s);
        if (s) speed.sync(s.speed);
        setStatus(`${editor.shapes.length} stroke${editor.shapes.length === 1 ? "" : "s"}`);
      };
    }
    right.appendChild(nkdButton(
      "Finish",
      () => editor.finishShape(),
      "Stop adding to this one; the next click starts a new one. (Enter)"
    ));
    right.appendChild(nkdButton(
      "Delete",
      () => editor.deleteActive(),
      "Delete the selected shape. (Del)"
    ));
  } else {
    const setNumber = (name, v) => {
      var _a2;
      if (name === "max_blur") editor.maxBlur = v;
      else editor.falloff = v;
      (_a2 = opts.onSetting) == null ? void 0 : _a2.call(opts, name, v);
      editor.invalidatePreview();
      requestPreview(editor.serialise());
      refreshBar();
    };
    const maxBlur = nkdSlider(
      "Max Blur",
      {
        min: 0,
        max: 512,
        step: 1,
        value: editor.maxBlur,
        width: 180,
        format: (v) => `${Math.round(v)} px`
      },
      (v) => setNumber("max_blur", v),
      "What a pin turned all the way up means, in pixels."
    );
    const falloff = nkdSlider(
      "Falloff",
      {
        min: 0.5,
        max: 8,
        step: 0.1,
        value: editor.falloff,
        width: 140,
        format: (v) => v.toFixed(2)
      },
      (v) => setNumber("falloff", v),
      "How tightly each pin holds its own area. Raise it to stop a sharp pin from being dragged blurry by the ones around it."
    );
    right.append(maxBlur, falloff);
    refreshBar = () => {
      maxBlur.sync(editor.maxBlur);
      falloff.sync(editor.falloff);
      const n = editor.pins.length;
      setStatus(n ? `${n} pin${n === 1 ? "" : "s"} · up to ${Math.round(editor.maxBlur)} px` : "click to drop a pin");
    };
  }
  const VIEWS = opts.mode === "shape" ? ["result", "matte", "source"] : opts.mode === "pin" ? ["result", "field", "source"] : ["result", "source"];
  const VIEW_LABEL = {
    result: opts.mode === "shape" ? "View: masked" : "View: result",
    matte: "View: matte",
    field: "View: blur field",
    source: "View: original"
  };
  const viewBtn = nkdButton("", () => {
    editor.view = VIEWS[(VIEWS.indexOf(editor.view) + 1) % VIEWS.length];
    editor.refreshView();
    refreshBar();
  }, opts.mode === "shape" ? "Cycle the backdrop: the image with everything outside the mask dimmed, the mask on its own, or the untouched image. (V)" : opts.mode === "pin" ? "Cycle the backdrop: the blurred result, the blur field as a grey map — which is what shows you where the transition actually falls — or the untouched image. (V)" : "Show the rendered result or the untouched image. (V)");
  right.appendChild(viewBtn);
  const curvesBtn = nkdToggle("Curves", true, (on) => {
    editor.showCurves = on;
    editor.draw();
  }, "Show or hide the vectors. Hidden, you get the backdrop with nothing drawn over it — the only way to judge an edge that has a control point sitting on it. Editing still works while they are hidden. (H)");
  right.appendChild(curvesBtn);
  right.appendChild(nkdButton("Clear", () => editor.clearAll(), "Remove everything."));
  right.appendChild(nkdButton("Fit", () => editor.fitView(), "Reset the view. (F)"));
  window.addEventListener("keydown", onViewKey, true);
  function onViewKey(e) {
    if (!editor.canvas.isConnected) return;
    if (e.key === "h" || e.key === "H") {
      curvesBtn.click();
      return;
    }
    if (e.key === "v" || e.key === "V") viewBtn.click();
  }
  function setStatus(text) {
    viewBtn.textContent = VIEW_LABEL[editor.view];
    viewBtn.classList.toggle("on", editor.view !== "source");
    const picked = editor.selectionSize ? ` · ${editor.selectionSize} point${editor.selectionSize === 1 ? "" : "s"} selected` : "";
    const mismatch = savedAspect != null && Math.abs(savedAspect - editor.aspect) > 0.01;
    const warn = mismatch ? ` — drawn at a different aspect ratio (${savedAspect.toFixed(2)} vs ${editor.aspect.toFixed(2)}); shapes are stretched` : "";
    status.textContent = text + picked + warn + (note ? ` — ${note}` : "");
    status.classList.toggle("bad", mismatch || note.startsWith("preview failed"));
  }
  modal.addPrimary("Save & close");
  refreshBar();
  requestAnimationFrame(() => {
    editor.fitView();
    editor.refreshView();
    requestPreview(editor.serialise());
  });
  const origClose = modal.close;
  modal.close = (reason) => {
    window.removeEventListener("keydown", onViewKey, true);
    shut = true;
    clearTimeout(timer);
    token++;
    origClose(reason);
  };
  return {
    setImage(img, w, h) {
      editor.setImage(img, w, h);
      requestPreview(editor.serialise());
      refreshBar();
    },
    close: () => modal.close("dismiss")
  };
}
function readAspect(json) {
  var _a;
  try {
    const a = Number((_a = JSON.parse(json || "{}")) == null ? void 0 : _a.aspect);
    return Number.isFinite(a) && a > 0 ? a : null;
  } catch {
    return null;
  }
}
const STATE_DEFAULTS = {
  rot: [0, 0, 0],
  scale: 0,
  trans: [0, 0],
  ortho: false,
  mirror: false
};
function deserialise(text) {
  const state = { w: {}, p: {}, ...structuredClone(STATE_DEFAULTS) };
  if (!text) return state;
  try {
    const raw = JSON.parse(text);
    for (const [k, v] of Object.entries(raw.w ?? {})) state.w[k] = Number(v);
    for (const [k, v] of Object.entries(raw.p ?? {})) state.p[k] = Number(v);
    for (const k of Object.keys(STATE_DEFAULTS)) {
      if (k in raw) state[k] = raw[k];
    }
  } catch {
  }
  return state;
}
const r5 = (v) => Math.round(v * 1e5) / 1e5;
function serialise(s) {
  const out = { v: 1, w: {} };
  for (const [k, v] of Object.entries(s.w)) if (v) out.w[k] = r5(v);
  const p2 = {};
  for (const [k, v] of Object.entries(s.p)) if (v) p2[k] = r5(v);
  if (Object.keys(p2).length) out.p = p2;
  for (const k of Object.keys(STATE_DEFAULTS)) {
    let v = s[k];
    if (Array.isArray(v)) v = v.map((n) => r5(n));
    if (JSON.stringify(v) !== JSON.stringify(STATE_DEFAULTS[k])) out[k] = v;
  }
  return JSON.stringify(out);
}
const CONTROLS = [
  {
    id: "brow_L",
    kind: "pad",
    anchor: "brow_L",
    side: "L",
    label: "brow",
    yNeg: { axis: "au1_2_L", per: 1 },
    // up = raise
    xPos: { axis: "au4_L", per: 1 },
    // inward (right, for the left brow) = furrow
    mirror: "brow_R"
  },
  {
    id: "brow_R",
    kind: "pad",
    anchor: "brow_R",
    side: "R",
    label: "brow",
    yNeg: { axis: "au1_2_R", per: 1 },
    xNeg: { axis: "au4_R", per: 1 },
    mirror: "brow_L"
  },
  {
    id: "lid_L",
    kind: "slider",
    anchor: "lid_L",
    side: "L",
    label: "eyelid",
    yPos: { axis: "au45_L", per: 1 },
    // down = close
    mirror: "lid_R"
  },
  {
    id: "lid_R",
    kind: "slider",
    anchor: "lid_R",
    side: "R",
    label: "eyelid",
    yPos: { axis: "au45_R", per: 1 },
    mirror: "lid_L"
  },
  // gaze is NOT here: it lives in the eye gizmo in the corner of the viewer,
  // because a floating pad between the eyes overlapped brows and corners.
  // The mouth corners both drive the same central axes — the latent space has
  // no honest left/right smile split (kp14 IS the right corner; the real pair
  // is 5x weaker). Two handles, one gesture: grab whichever corner is closer.
  {
    id: "corner_L",
    kind: "pad",
    anchor: "corner_L",
    side: "C",
    label: "smile · pucker",
    yNeg: { axis: "au12", per: 1 },
    // up = smile, down = frown
    xPos: { axis: "au18", per: 1 },
    // inward = pucker
    xNeg: { axis: "au20", per: 1 }
  },
  // outward = stretch
  {
    id: "corner_R",
    kind: "pad",
    anchor: "corner_R",
    side: "C",
    label: "smile · pucker",
    yNeg: { axis: "au12", per: 1 },
    xNeg: { axis: "au18", per: 1 },
    xPos: { axis: "au20", per: 1 }
  },
  {
    id: "jaw",
    kind: "slider",
    anchor: "jaw",
    side: "C",
    label: "jaw",
    yPos: { axis: "au26", per: 1 }
  }
  // down = open
];
const SIDE_COLOR = { L: "#4a90ff", R: "#ff5c5c", C: "#ffd24a" };
const ACTIVE_COLOR = "#ffffff";
const HANDLE_R = 17;
const FINE = 0.1;
const ROT_MAX = 20;
const UNDO_DEPTH = 30;
function mountFaceRig(host, opts) {
  ensureNkdModalStyles();
  const api2 = opts.apiBase ?? "";
  let state = deserialise(opts.json);
  const axisInfo = /* @__PURE__ */ new Map();
  let anchors = {};
  let outlines = {};
  let frameImg = null;
  const root = document.createElement("div");
  root.className = "nkd-facerig";
  root.style.cssText = "display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box;padding:4px 2px 12px;font:12px system-ui,sans-serif;color:#c8d0e0;";
  const canvasWrap = document.createElement("div");
  canvasWrap.style.cssText = "position:relative;width:100%;";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;touch-action:none;cursor:default;background:#0b0d12;border-radius:6px;";
  canvasWrap.appendChild(canvas);
  if (!document.getElementById("nkd-facerig-styles")) {
    const st = document.createElement("style");
    st.id = "nkd-facerig-styles";
    st.textContent = ".nkd-fr-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(11,13,18,0.45);border-radius:6px;pointer-events:none;}.nkd-fr-loading span{color:rgba(255,255,255,0.6);font-size:11px;}.nkd-fr-dots{display:flex;gap:6px;}.nkd-fr-dots i{width:7px;height:7px;border-radius:50%;background:#4ab4ff;animation:nkd-fr-bounce 1.1s ease-in-out infinite;}.nkd-fr-dots i:nth-child(2){animation-delay:0.18s}.nkd-fr-dots i:nth-child(3){animation-delay:0.36s}@keyframes nkd-fr-bounce{0%,80%,100%{transform:scale(0.7);opacity:0.4}40%{transform:scale(1.15);opacity:1}}";
    document.head.appendChild(st);
  }
  const loading = document.createElement("div");
  loading.className = "nkd-fr-loading";
  loading.style.display = "none";
  loading.innerHTML = "<div class='nkd-fr-dots'><i></i><i></i><i></i></div><span>preparing…</span>";
  canvasWrap.appendChild(loading);
  let loadingTimer = 0;
  function loadingSoon() {
    if (!loadingTimer) {
      loadingTimer = window.setTimeout(() => {
        loading.style.display = "flex";
      }, 300);
    }
  }
  function loadingDone() {
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = 0;
    }
    loading.style.display = "none";
  }
  root.appendChild(canvasWrap);
  const ctx = canvas.getContext("2d");
  const optRow = document.createElement("div");
  optRow.style.cssText = "display:flex;gap:6px;";
  const mirrorBtn = nkdToggle("mirror L ↔ R", state.mirror, (on) => {
    state.mirror = on;
    commit();
  }, "Dragging a paired handle moves its twin too");
  const resetBtn = nkdButton("reset pose", () => {
    pushUndo();
    state = { w: {}, p: {}, ...structuredClone(STATE_DEFAULTS), mirror: state.mirror };
    drawOverlay();
    commit();
  });
  mirrorBtn.style.flex = resetBtn.style.flex = "1 1 0";
  optRow.append(mirrorBtn, resetBtn);
  root.appendChild(optRow);
  const statusRow = document.createElement("div");
  statusRow.style.cssText = "display:flex;gap:8px;min-height:14px;font-size:11px;";
  const status = document.createElement("span");
  status.className = "nkd-modal-status";
  const warn = document.createElement("span");
  warn.className = "nkd-modal-status bad";
  const hint = document.createElement("span");
  hint.style.cssText = "color:rgba(255,255,255,0.3);margin-left:auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
  hint.title = "Shift = fine · Alt = one side · double-click = reset · Ctrl+Z = undo";
  hint.textContent = "Shift fine · Alt one side · dblclick reset · Ctrl+Z";
  statusRow.append(status, warn, hint);
  root.appendChild(statusRow);
  host.appendChild(root);
  const undoStack = [];
  const redoStack = [];
  function pushUndo() {
    undoStack.push(serialise(state));
    if (undoStack.length > UNDO_DEPTH) undoStack.shift();
    redoStack.length = 0;
  }
  function restore(json) {
    const p2 = state.p;
    state = deserialise(json);
    state.p = p2;
    mirrorBtn.classList.toggle("on", state.mirror);
    drawOverlay();
    commit();
  }
  function onKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
    if (!root.matches(":hover")) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) {
      if (redoStack.length) {
        undoStack.push(serialise(state));
        restore(redoStack.pop());
      }
    } else if (undoStack.length) {
      redoStack.push(serialise(state));
      restore(undoStack.pop());
    }
  }
  window.addEventListener("keydown", onKey, true);
  let inflight = false;
  let wanted = null;
  let firstRender = true;
  let sentCrop = null;
  let token = 0;
  function poseChanged() {
    drawOverlay();
    requestRender("drag");
  }
  function commit() {
    var _a;
    (_a = opts.onChange) == null ? void 0 : _a.call(opts, serialise(state));
    requestRender("final");
  }
  function requestRender(quality) {
    wanted = wanted === "final" ? "final" : quality;
    if (inflight) return;
    void pump();
  }
  async function pump() {
    var _a, _b;
    while (wanted) {
      const quality = wanted;
      wanted = null;
      if (opts.hasSource && !opts.hasSource()) {
        frameImg = null;
        anchors = {};
        outlines = {};
        warn.textContent = "";
        status.textContent = "";
        drawAll();
        break;
      }
      inflight = true;
      loadingSoon();
      const t0 = performance.now();
      const my = ++token;
      try {
        const crop = opts.cropFactor();
        const body = {
          node: opts.nodeId,
          rig: serialise(state),
          quality,
          crop_factor: crop,
          src_ratio: opts.srcRatio()
        };
        if (sentCrop !== crop) {
          const f = (_a = opts.frame) == null ? void 0 : _a.call(opts);
          if (f) {
            body.frame = f;
            sentCrop = crop;
          }
        }
        let res = await fetch(api2 + "/nkd/facerig/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        let data = await res.json();
        if (data.needsFrame) {
          const frame = (_b = opts.frame) == null ? void 0 : _b.call(opts);
          if (!frame) {
            warn.textContent = "connect an image, then drag a handle";
            break;
          }
          body.frame = frame;
          sentCrop = crop;
          res = await fetch(api2 + "/nkd/facerig/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          data = await res.json();
        }
        if (data.error) {
          warn.textContent = data.error;
          break;
        }
        if (my !== token) continue;
        warn.textContent = data.warning ?? "";
        if (data.anchors && (quality === "final" || !Object.keys(anchors).length)) {
          anchors = data.anchors;
          outlines = data.outlines ?? {};
        }
        await setFrame(data.image);
        const dt = performance.now() - t0;
        if (firstRender) firstRender = false;
        status.textContent = `${dt.toFixed(0)} ms`;
      } catch (e) {
        warn.textContent = String((e == null ? void 0 : e.message) ?? e);
        break;
      } finally {
        inflight = false;
        loadingDone();
      }
    }
    inflight = false;
    loadingDone();
  }
  function setFrame(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        frameImg = img;
        layout();
        drawAll();
        resolve();
      };
      img.onerror = () => resolve();
      img.src = dataUrl;
    });
  }
  let view = { size: 300, dpr: 1 };
  function layout() {
    const size = Math.max(64, Math.floor(root.clientWidth || host.clientWidth || 300));
    const rectW = canvas.getBoundingClientRect().width;
    const zoom = rectW > 0 ? rectW / size : 1;
    const scale = Math.min(3, Math.max(1, (window.devicePixelRatio || 1) * zoom));
    const px = Math.round(size * scale);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
      canvas.style.height = size + "px";
    }
    view = { size, dpr: scale };
  }
  const GIZMO_R = 30;
  const GIZMO_RING = 11;
  const gizmoCenter = () => {
    const m = GIZMO_R + GIZMO_RING + 10;
    return [view.size - m, view.size - m];
  };
  const GAZE_RX = 32;
  const GAZE_RY = 20;
  const gazeCenter = () => [GAZE_RX + 16, view.size - GAZE_RY - 18];
  const gazeVal = () => [
    (state.w["au61"] ?? 0) - (state.w["au62"] ?? 0),
    // +x = look right
    (state.w["au64"] ?? 0) - (state.w["au63"] ?? 0)
    // +y = look down
  ];
  function gizmoZone(x, y) {
    if (view.size < 200) return null;
    const [gx, gy] = gizmoCenter();
    const d = Math.hypot(x - gx, y - gy);
    if (d <= GIZMO_R) return "sphere";
    if (d <= GIZMO_R + GIZMO_RING + 4) return "ring";
    const [ex, ey] = gazeCenter();
    const nx = (x - ex) / (GAZE_RX + 5), ny = (y - ey) / (GAZE_RY + 6);
    if (nx * nx + ny * ny <= 1) return "gaze";
    return null;
  }
  let gizmoActive = null;
  function drawGazeGizmo() {
    const [ex, ey] = gazeCenter();
    const on = gizmoActive === "gaze";
    ctx.save();
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(11,13,18,0.55)";
    ctx.strokeStyle = on ? ACTIVE_COLOR : "rgba(200,208,224,0.5)";
    ctx.beginPath();
    ctx.moveTo(ex - GAZE_RX, ey);
    ctx.quadraticCurveTo(ex, ey - GAZE_RY * 2, ex + GAZE_RX, ey);
    ctx.quadraticCurveTo(ex, ey + GAZE_RY * 2, ex - GAZE_RX, ey);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const [vx, vy] = gazeVal();
    const ix = ex + vx * (GAZE_RX - 12);
    const iy = ey + vy * (GAZE_RY - 8);
    ctx.strokeStyle = on ? ACTIVE_COLOR : SIDE_COLOR.C;
    ctx.beginPath();
    ctx.arc(ix, iy, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = on ? ACTIVE_COLOR : SIDE_COLOR.C;
    ctx.beginPath();
    ctx.arc(ix, iy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    if (on || vx !== 0 || vy !== 0) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText("gaze", ex - GAZE_RX, ey - GAZE_RY - 8);
    }
    ctx.restore();
  }
  function drawHeadGizmo() {
    const [gx, gy] = gizmoCenter();
    const rollRad = state.rot[2] * Math.PI / 180;
    ctx.save();
    ctx.lineWidth = 1;
    const rr = GIZMO_R + GIZMO_RING / 2 + 2;
    ctx.strokeStyle = gizmoActive === "ring" ? ACTIVE_COLOR : "rgba(200,208,224,0.45)";
    ctx.beginPath();
    ctx.arc(gx, gy, rr, 0, Math.PI * 2);
    ctx.stroke();
    if (state.rot[2] !== 0) {
      ctx.strokeStyle = SIDE_COLOR.C;
      ctx.beginPath();
      ctx.arc(gx, gy, rr, -Math.PI / 2, -Math.PI / 2 + rollRad, rollRad < 0);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.strokeStyle = gizmoActive === "ring" ? ACTIVE_COLOR : SIDE_COLOR.C;
    ctx.beginPath();
    ctx.moveTo(gx + (rr - 6) * Math.sin(rollRad), gy - (rr - 6) * Math.cos(rollRad));
    ctx.lineTo(gx + (rr + 6) * Math.sin(rollRad), gy - (rr + 6) * Math.cos(rollRad));
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(11,13,18,0.55)";
    ctx.beginPath();
    ctx.arc(gx, gy, GIZMO_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gizmoActive === "sphere" ? ACTIVE_COLOR : "rgba(200,208,224,0.5)";
    ctx.stroke();
    ctx.strokeStyle = "rgba(200,208,224,0.18)";
    ctx.beginPath();
    ctx.ellipse(gx, gy, GIZMO_R * 0.55, GIZMO_R, 0, 0, Math.PI * 2);
    ctx.moveTo(gx - GIZMO_R, gy);
    ctx.lineTo(gx + GIZMO_R, gy);
    ctx.stroke();
    const bx = gx + state.rot[1] / ROT_MAX * (GIZMO_R - 7);
    const by = gy + state.rot[0] / ROT_MAX * (GIZMO_R - 7);
    ctx.strokeStyle = gizmoActive === "sphere" ? ACTIVE_COLOR : SIDE_COLOR.C;
    ctx.strokeRect(bx - 4.5, by - 4.5, 9, 9);
    if (gizmoActive || state.rot.some((v) => v !== 0)) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `${state.rot[1].toFixed(0)}° ${state.rot[0].toFixed(0)}° ${state.rot[2].toFixed(0)}°`,
        gx,
        gy - GIZMO_R - GIZMO_RING - 8
      );
      ctx.textAlign = "left";
    }
    ctx.restore();
  }
  const toScreen = (p2) => [p2[0] * view.size, p2[1] * view.size];
  function handleOffset(c) {
    const get = (d) => d ? (state.w[d.axis] ?? 0) / d.per : 0;
    let dx = 0, dy = 0;
    if (c.kind === "pad") {
      dx = get(c.xPos) - get(c.xNeg);
      dy = get(c.yPos) - get(c.yNeg);
    } else {
      dy = get(c.yPos) - get(c.yNeg);
    }
    return [dx * HANDLE_R, dy * HANDLE_R];
  }
  function handleCenter(c) {
    const a = anchors[c.anchor];
    if (!a) return null;
    const [ax, ay] = toScreen(a);
    const [dx, dy] = handleOffset(c);
    return [ax + dx, ay + dy];
  }
  let active2 = null;
  let hover = null;
  const FADE_MS = 100;
  const fadeA = /* @__PURE__ */ new Map();
  let fadeTimer = 0;
  let lastFadeTs = 0;
  const targetAlpha = (c) => active2 === c || !active2 && hover === c ? 1 : 0;
  function stepFade() {
    fadeTimer = 0;
    const now = performance.now();
    const dt = lastFadeTs ? now - lastFadeTs : 16;
    lastFadeTs = now;
    let busy = false;
    for (const c of CONTROLS) {
      const cur = fadeA.get(c.id) ?? 0;
      const tgt = targetAlpha(c);
      if (cur === tgt) continue;
      const step = dt / FADE_MS;
      fadeA.set(c.id, cur < tgt ? Math.min(tgt, cur + step) : Math.max(tgt, cur - step));
      busy = true;
    }
    drawOverlay();
    if (busy) fadeTimer = window.setTimeout(stepFade, 16);
    else lastFadeTs = 0;
  }
  function kickFade() {
    if (!fadeTimer) {
      lastFadeTs = 0;
      fadeTimer = window.setTimeout(stepFade, 0);
    }
  }
  const OUTLINE_FOR = {
    brow_L: ["brow_L"],
    brow_R: ["brow_R"],
    lid_L: ["eye_L"],
    lid_R: ["eye_R"],
    corner_L: ["lips"],
    corner_R: ["lips"],
    jaw: ["lips"]
  };
  function outlineAlpha(name) {
    var _a;
    let a = 0;
    for (const c of CONTROLS) {
      if ((_a = OUTLINE_FOR[c.id]) == null ? void 0 : _a.includes(name)) a = Math.max(a, fadeA.get(c.id) ?? 0);
    }
    return a;
  }
  function drawAll() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.size, view.size);
    if (frameImg) ctx.drawImage(frameImg, 0, 0, view.size, view.size);
    else {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("connect an image", view.size / 2, view.size / 2);
      ctx.textAlign = "left";
    }
    drawOverlay(true);
  }
  function drawOverlay(alreadyCleared = false) {
    if (!alreadyCleared) {
      drawAll();
      return;
    }
    ctx.lineWidth = 1;
    for (const [name, pts] of Object.entries(outlines)) {
      if (!(pts == null ? void 0 : pts.length)) continue;
      const oa = outlineAlpha(name);
      if (oa <= 0.01) continue;
      const side = name.endsWith("_L") ? "L" : name.endsWith("_R") ? "R" : "C";
      ctx.globalAlpha = oa * 0.33;
      ctx.strokeStyle = SIDE_COLOR[side];
      ctx.beginPath();
      pts.forEach((p2, i) => {
        const [x, y] = toScreen(p2);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    for (const c of CONTROLS) {
      const a = anchors[c.anchor];
      if (!a) continue;
      const fa = fadeA.get(c.id) ?? 0;
      if (fa <= 0.01) continue;
      const [ax, ay] = toScreen(a);
      const isActive = active2 === c || !active2 && hover === c;
      const color = isActive ? ACTIVE_COLOR : SIDE_COLOR[c.side];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      if (c.kind === "pad") {
        ctx.globalAlpha = fa * 0.9;
        ctx.beginPath();
        ctx.arc(ax, ay, HANDLE_R, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = fa * 0.9;
        ctx.beginPath();
        ctx.moveTo(ax, ay - HANDLE_R);
        ctx.lineTo(ax, ay + HANDLE_R);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax - 4, ay - HANDLE_R);
        ctx.lineTo(ax + 4, ay - HANDLE_R);
        ctx.moveTo(ax - 4, ay + HANDLE_R);
        ctx.lineTo(ax + 4, ay + HANDLE_R);
        ctx.stroke();
      }
      const [hx, hy] = handleCenter(c);
      ctx.globalAlpha = fa;
      if (c.kind === "pad") {
        ctx.strokeRect(hx - 4.5, hy - 4.5, 9, 9);
      } else {
        ctx.beginPath();
        ctx.moveTo(hx - 5, hy);
        ctx.lineTo(hx + 4, hy - 5);
        ctx.lineTo(hx + 4, hy + 5);
        ctx.closePath();
        ctx.stroke();
      }
      if (isActive) {
        ctx.globalAlpha = fa * 0.8;
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(c.label, ax, ay - HANDLE_R - 6);
        ctx.textAlign = "left";
      }
    }
    ctx.globalAlpha = 1;
    if (frameImg && view.size >= 200) {
      drawHeadGizmo();
      drawGazeGizmo();
    }
  }
  function pick(x, y) {
    let best = null;
    let bestD = 22;
    for (const c of CONTROLS) {
      const hc = handleCenter(c);
      if (!hc) continue;
      const d = Math.hypot(hc[0] - x, hc[1] - y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }
  function clampAxis(name, v) {
    const info = axisInfo.get(name);
    const lo = (info == null ? void 0 : info.lo) ?? -1, hi = (info == null ? void 0 : info.hi) ?? 1;
    return Math.max(lo, Math.min(hi, v));
  }
  function setAxis(name, v, mirrorFrom, noMirror = false) {
    v = clampAxis(name, v);
    if (v) state.w[name] = v;
    else delete state.w[name];
    if (!noMirror && state.mirror && (mirrorFrom == null ? void 0 : mirrorFrom.mirror)) {
      const twin = name.endsWith("_L") ? name.slice(0, -2) + "_R" : name.endsWith("_R") ? name.slice(0, -2) + "_L" : null;
      if (twin && axisInfo.has(twin)) {
        const tv = clampAxis(twin, v);
        if (tv) state.w[twin] = tv;
        else delete state.w[twin];
      }
    }
  }
  const zoomScale = () => {
    const r = canvas.getBoundingClientRect();
    return r.width > 0 ? view.size / r.width : 1;
  };
  const canvasXY = (e) => {
    const r = canvas.getBoundingClientRect();
    const k = r.width > 0 ? view.size / r.width : 1;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  };
  canvas.addEventListener("pointermove", (e) => {
    if (active2 || gizmoActive) return;
    const [x, y] = canvasXY(e);
    const z = frameImg ? gizmoZone(x, y) : null;
    const h = z ? null : pick(x, y);
    if (h !== hover) {
      hover = h;
      kickFade();
    }
    canvas.style.cursor = z || h ? "grab" : "default";
  });
  canvas.addEventListener("pointerleave", () => {
    if (active2 || gizmoActive) return;
    if (hover) {
      hover = null;
      kickFade();
    }
    canvas.style.cursor = "default";
  });
  canvas.addEventListener("dblclick", (e) => {
    const [x, y] = canvasXY(e);
    const z = frameImg ? gizmoZone(x, y) : null;
    if (z) {
      pushUndo();
      if (z === "sphere") {
        state.rot[0] = 0;
        state.rot[1] = 0;
      } else if (z === "ring") state.rot[2] = 0;
      else for (const a of ["au61", "au62", "au63", "au64"]) delete state.w[a];
      poseChanged();
      commit();
      return;
    }
    const c = pick(x, y);
    if (!c) return;
    pushUndo();
    for (const d of [c.xPos, c.xNeg, c.yPos, c.yNeg]) {
      if (!d) continue;
      delete state.w[d.axis];
      if (state.mirror) {
        const twin = d.axis.endsWith("_L") ? d.axis.slice(0, -2) + "_R" : d.axis.endsWith("_R") ? d.axis.slice(0, -2) + "_L" : null;
        if (twin) delete state.w[twin];
      }
    }
    poseChanged();
    commit();
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const [px, py] = canvasXY(e);
    const z = frameImg ? gizmoZone(px, py) : null;
    if (z) {
      startGizmoDrag(e, z, px, py);
      return;
    }
    const c = pick(px, py);
    if (!c) {
      if (!frameImg) requestRender("final");
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
    }
    active2 = c;
    kickFade();
    canvas.style.cursor = "grabbing";
    pushUndo();
    const k = zoomScale();
    let prevX = e.clientX, prevY = e.clientY;
    const move = (ev) => {
      const gain = (ev.shiftKey ? FINE : 1) * k / HANDLE_R;
      const dx = (ev.clientX - prevX) * gain;
      const dy = (ev.clientY - prevY) * gain;
      prevX = ev.clientX;
      prevY = ev.clientY;
      const noMir = ev.altKey;
      const bump = (pos, neg, d = 0) => {
        if (!d) return;
        if (pos && neg) {
          const cur = (state.w[pos.axis] ?? 0) - (state.w[neg.axis] ?? 0);
          const next = cur + d;
          setAxis(pos.axis, Math.max(0, next), c, noMir);
          setAxis(neg.axis, Math.max(0, -next), c, noMir);
        } else if (pos) {
          setAxis(pos.axis, (state.w[pos.axis] ?? 0) + d, c, noMir);
        } else if (neg) {
          setAxis(neg.axis, (state.w[neg.axis] ?? 0) - d, c, noMir);
        }
      };
      if (c.kind === "pad") bump(c.xPos, c.xNeg, dx);
      bump(c.yPos, c.yNeg, dy);
      poseChanged();
    };
    const up = (ev) => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch {
      }
      active2 = null;
      kickFade();
      canvas.style.cursor = "grab";
      commit();
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  });
  function startGizmoDrag(e, zone, px, py) {
    e.preventDefault();
    e.stopPropagation();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
    }
    gizmoActive = zone;
    canvas.style.cursor = "grabbing";
    pushUndo();
    const k = zoomScale();
    const [gx, gy] = gizmoCenter();
    const g = ROT_MAX / (GIZMO_R - 7);
    let prevX = e.clientX, prevY = e.clientY;
    let prevAngle = Math.atan2(px - gx, -(py - gy));
    const drain = (pos, neg, d) => {
      if (!d) return;
      const cur = (state.w[pos] ?? 0) - (state.w[neg] ?? 0);
      const next = Math.max(-1, Math.min(1, cur + d));
      if (next >= 0) {
        state.w[pos] = next;
        delete state.w[neg];
      } else {
        state.w[neg] = -next;
        delete state.w[pos];
      }
      if (!state.w[pos]) delete state.w[pos];
      if (!state.w[neg]) delete state.w[neg];
    };
    const move = (ev) => {
      const fine = ev.shiftKey ? FINE : 1;
      if (zone === "gaze") {
        drain("au61", "au62", (ev.clientX - prevX) * k * fine / (GAZE_RX - 12));
        drain("au64", "au63", (ev.clientY - prevY) * k * fine / (GAZE_RY - 8));
        prevX = ev.clientX;
        prevY = ev.clientY;
      } else if (zone === "sphere") {
        state.rot[1] = Math.max(-ROT_MAX, Math.min(
          ROT_MAX,
          state.rot[1] + (ev.clientX - prevX) * k * g * fine
        ));
        state.rot[0] = Math.max(-ROT_MAX, Math.min(
          ROT_MAX,
          state.rot[0] + (ev.clientY - prevY) * k * g * fine
        ));
        prevX = ev.clientX;
        prevY = ev.clientY;
      } else {
        const [mx, my] = canvasXY(ev);
        const angle = Math.atan2(mx - gx, -(my - gy));
        let d = angle - prevAngle;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        prevAngle = angle;
        state.rot[2] = Math.max(-ROT_MAX, Math.min(
          ROT_MAX,
          state.rot[2] + d * 180 / Math.PI * fine
        ));
      }
      poseChanged();
    };
    const up = (ev) => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch {
      }
      gizmoActive = null;
      canvas.style.cursor = "grab";
      commit();
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }
  function ensureLaidOut(tries = 0) {
    layout();
    if (view.size <= 64 && tries < 20) setTimeout(() => ensureLaidOut(tries + 1), 50);
    else drawAll();
  }
  const ro = new ResizeObserver(() => {
    layout();
    drawAll();
  });
  ro.observe(root);
  let lastRectW = 0;
  const zoomPoll = window.setInterval(() => {
    const w = canvas.getBoundingClientRect().width;
    if (Math.abs(w - lastRectW) > 1) {
      lastRectW = w;
      layout();
      drawAll();
    }
  }, 400);
  ensureLaidOut();
  void fetch(api2 + "/nkd/facerig/library").then(async (r) => {
    const lib = await r.json();
    for (const a of lib.axes ?? []) axisInfo.set(a.name, a);
  }).catch(() => {
  });
  requestRender("final");
  window.__nkdFaceRig = {
    get state() {
      return state;
    },
    get anchors() {
      return anchors;
    },
    canvas,
    handleXY: (id) => handleCenter(CONTROLS.find((c) => c.id === id)),
    serialise: () => serialise(state)
  };
  return {
    root,
    serialise: () => serialise(state),
    retry: () => requestRender("final"),
    refreshSource() {
      sentCrop = null;
      requestRender("final");
    },
    setJson(json) {
      const p2 = state.p;
      state = deserialise(json);
      state.p = p2;
      mirrorBtn.classList.toggle("on", state.mirror);
      drawOverlay();
      requestRender("final");
    },
    destroy() {
      window.removeEventListener("keydown", onKey, true);
      ro.disconnect();
      clearInterval(zoomPoll);
      if (fadeTimer) clearTimeout(fadeTimer);
      root.remove();
    }
  };
}
const PROP = "nkdSchema";
const findW = (node, name) => {
  var _a;
  return (_a = node.widgets) == null ? void 0 : _a.find((w) => w.name === name);
};
function guardWidgetOrder(nodeType, nodeName, version2) {
  const origCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function() {
    const r = origCreated == null ? void 0 : origCreated.apply(this, arguments);
    this.properties = this.properties || {};
    this.properties[PROP] = version2;
    return r;
  };
  const origConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function(info) {
    var _a, _b, _c, _d, _e;
    const r = origConfigure == null ? void 0 : origConfigure.apply(this, arguments);
    const named = info == null ? void 0 : info.widgets_values_named;
    if (named && typeof named === "object" && !Array.isArray(named)) {
      for (const [name, val] of Object.entries(named)) {
        const w = findW(this, name);
        if (w && w.value !== val) {
          w.value = val;
          (_a = w.callback) == null ? void 0 : _a.call(w, val);
        }
      }
    } else if (version2 > 1 && ((_b = info == null ? void 0 : info.properties) == null ? void 0 : _b[PROP]) !== version2 && Array.isArray(info == null ? void 0 : info.widgets_values) && info.widgets_values.length) {
      (_e = (_d = (_c = app.extensionManager) == null ? void 0 : _c.toast) == null ? void 0 : _d.add) == null ? void 0 : _e.call(_d, {
        severity: "warn",
        summary: `😺${nodeName}`,
        detail: `"${this.title ?? nodeName}" was saved before a widget reorder: its values may have loaded into the wrong widgets. Delete and re-add the node, then re-check its settings.`,
        life: 12e3
      });
    }
    return r;
  };
}
function guardPackWidgetOrder(extName, versions) {
  app.registerExtension({
    name: extName,
    async beforeRegisterNodeDef(nodeType, nodeData) {
      const version2 = versions[nodeData == null ? void 0 : nodeData.name];
      if (!version2) return;
      if (nodeType.prototype.__nkdSchemaGuarded) return;
      nodeType.prototype.__nkdSchemaGuarded = true;
      guardWidgetOrder(nodeType, nodeData.name, version2);
    }
  });
}
guardPackWidgetOrder("NKD.BasicTools.SchemaGuard", {
  NKDInpaintCrop: 1,
  NKDInpaintStitch: 1,
  NKDStringSplit: 1,
  NKDPromptVariables: 1,
  NKDGradientMap: 1,
  NKDGradientGenerate: 1,
  NKDFilmGrain: 1,
  NKDNoise: 1,
  NKDFrequencySeparate: 1,
  NKDFrequencyCombine: 1,
  NKDColorWarp: 1,
  NKDMaskOps: 1,
  NKDMaskOpsLean: 1,
  NKDAudioMask: 1,
  NKDAVLatent: 1,
  NKDMaskPainter: 1,
  NKDVectorMask: 1,
  NKDFieldBlur: 1,
  NKDPathBlur: 1,
  NKDFaceRig: 1
});
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
function getLink(node, linkId) {
  var _a;
  if (linkId == null) return null;
  const links = (_a = node.graph) == null ? void 0 : _a.links;
  if (!links) return null;
  return (links instanceof Map ? links.get(linkId) : links[linkId]) ?? null;
}
function resolveDim(node, name, fallback) {
  var _a, _b, _c, _d, _e;
  const slot = (_a = node.inputs) == null ? void 0 : _a.find((i) => i.name === name);
  if (slot && slot.link != null) {
    const link = getLink(node, slot.link);
    const src = link && ((_b = node.graph) == null ? void 0 : _b.getNodeById(link.origin_id));
    if (src) {
      const sw = ((_c = src.widgets) == null ? void 0 : _c.find((w2) => w2.name === name && Number.isFinite(Number(w2.value)))) ?? ((_d = src.widgets) == null ? void 0 : _d.find((w2) => Number.isFinite(Number(w2.value))));
      if (sw) return Number(sw.value);
    }
  }
  const w = (_e = node.widgets) == null ? void 0 : _e.find((w2) => w2.name === name);
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
function viewUrl(f) {
  const q = new URLSearchParams({
    filename: f.filename,
    type: f.type || "input",
    subfolder: f.subfolder || ""
  });
  return api.apiURL ? api.apiURL(`/view?${q}`) : `/view?${q}`;
}
function dbg(...args) {
  if (window.NKD_DEBUG) console.log("[NKD]", ...args);
}
function upstreamImageUrl(node, inputName = "image") {
  var _a, _b, _c, _d, _e, _f;
  const inp = (_a = node.inputs) == null ? void 0 : _a.find((i) => i.name === inputName);
  const link = getLink(node, inp == null ? void 0 : inp.link);
  if (!link) {
    dbg("no link on input", inputName, "of node", node.id, "slot:", inp);
    return "";
  }
  const src = (_b = node.graph) == null ? void 0 : _b.getNodeById(link.origin_id);
  if (!src) {
    dbg("link origin", link.origin_id, "not in graph");
    return "";
  }
  const outs = (_c = app.nodeOutputs) == null ? void 0 : _c[String(src.id)];
  const out = (_d = outs == null ? void 0 : outs.images) == null ? void 0 : _d[0];
  if (out == null ? void 0 : out.filename) {
    dbg("source", src.type, src.id, "→ run output", out);
    return viewUrl(out);
  }
  const w = (_e = src.widgets) == null ? void 0 : _e.find((x) => (x == null ? void 0 : x.name) === "image");
  if (typeof (w == null ? void 0 : w.value) === "string" && w.value) {
    dbg("source", src.type, src.id, "→ input file", w.value);
    return viewUrl({ filename: w.value });
  }
  dbg(
    "source",
    src.type,
    src.id,
    "has no image address (outputs:",
    outs,
    "widgets:",
    (_f = src.widgets) == null ? void 0 : _f.map((x) => x == null ? void 0 : x.name),
    ")"
  );
  return "";
}
const srcImgCache = /* @__PURE__ */ new Map();
function imgFor(url) {
  let img = srcImgCache.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    srcImgCache.set(url, img);
  }
  return img;
}
function findSourceImg(node, inputName = "image") {
  const url = upstreamImageUrl(node, inputName);
  if (!url) return null;
  const img = imgFor(url);
  return img.complete && img.naturalWidth ? img : null;
}
function findSourceImgAsync(node, inputName = "image") {
  const url = upstreamImageUrl(node, inputName);
  if (!url) return Promise.resolve(null);
  const img = imgFor(url);
  if (img.complete) {
    dbg("cached decode", url, img.naturalWidth + "x" + img.naturalHeight);
    return Promise.resolve(img.naturalWidth ? img : null);
  }
  return new Promise((resolve) => {
    img.addEventListener("load", () => {
      dbg("decoded", url, img.naturalWidth + "x" + img.naturalHeight);
      resolve(img);
    }, { once: true });
    img.addEventListener("error", () => {
      dbg("decode FAILED", url);
      resolve(null);
    }, { once: true });
  });
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
      const num2 = (name, def2) => {
        var _a, _b;
        return Number(((_b = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === name)) == null ? void 0 : _b.value) ?? def2);
      };
      const getParams = () => {
        var _a, _b;
        return {
          width: resolveDim(this, "width", 1024),
          height: resolveDim(this, "height", 1024),
          scale: num2("scale", 6),
          detail: num2("detail", 4),
          roughness: num2("roughness", 0.5),
          lacunarity: num2("lacunarity", 2),
          distortion: num2("distortion", 0),
          contrast: num2("contrast", 1),
          brightness: num2("brightness", 0),
          evolution: num2("evolution", 0),
          loop: !!((_b = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === "loop")) == null ? void 0 : _b.value),
          offset_x: num2("offset_x", 0),
          offset_y: num2("offset_y", 0),
          seed: num2("seed", 0)
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
let activeColorWarp = null;
const colorWarpFrames = /* @__PURE__ */ new Map();
function rgbBytesToCanvas(bytes, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  for (let i = 0, j = 0, k = 0; i < w * h; i++, j += 3, k += 4) {
    img.data[k] = bytes[j];
    img.data[k + 1] = bytes[j + 1];
    img.data[k + 2] = bytes[j + 2];
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function b64Bytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function framePayload(d) {
  try {
    const canvas = rgbBytesToCanvas(b64Bytes(d.data), d.width, d.height);
    const s16 = d.scatter16 && d.s16_width && d.s16_height ? { data: new Uint16Array(b64Bytes(d.scatter16).buffer), width: d.s16_width, height: d.s16_height } : void 0;
    return { canvas, w: d.width, h: d.height, s16 };
  } catch (err) {
    dbg("frame decode FAILED", err);
    return null;
  }
}
async function fetchPushedFrame(nodeId) {
  try {
    const res = await api.fetchApi(
      `/nkd/colorwarp/source?node_id=${encodeURIComponent(nodeId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      dbg("no stored frame for node", nodeId, "(", res.status, ")");
      return null;
    }
    const frame = framePayload(await res.json());
    dbg("stored frame for node", nodeId, frame ? `${frame.w}x${frame.h}` : "undecodable");
    return frame;
  } catch (err) {
    dbg("stored-frame fetch failed", err);
    return null;
  }
}
app.registerExtension({
  name: "NKD.ColorWarp",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "NKDColorWarp") return;
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      var _a;
      const result = origCreated == null ? void 0 : origCreated.apply(this, arguments);
      const meshW = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === "mesh");
      if (meshW) {
        meshW.type = "hidden";
        meshW.hidden = true;
        if (meshW.options) meshW.options.hidden = true;
        meshW.computedHeight = 0;
        meshW.computeSize = () => [0, -4];
      }
      const node = this;
      const btn = this.addWidget("button", "🎨 Open Color Warper", null, () => {
        const img = findSourceImg(node, "image");
        const cached = colorWarpFrames.get(String(node.id));
        const meshAtOpen = (meshW == null ? void 0 : meshW.value) ?? "";
        dbg("ColorWarp open — node", node.id, "sync img:", !!img, "cached push:", !!cached);
        const handle = openColorWarpViewer({
          image: img,
          mesh: (meshW == null ? void 0 : meshW.value) || "",
          onChange: (json) => {
            if (meshW) meshW.value = json;
            node.setDirtyCanvas(true, true);
          },
          onClose: (json) => {
            if (json && meshW) meshW.value = json;
            node.setDirtyCanvas(true, true);
            if ((activeColorWarp == null ? void 0 : activeColorWarp.handle) === handle) activeColorWarp = null;
            if (json && json !== meshAtOpen) {
              dbg("ColorWarp mesh changed on close — running node", node.id);
              void queueNode(node);
            }
          }
        });
        activeColorWarp = { nodeId: String(node.id), handle };
        if (!img && cached) handle.setImage(cached.canvas, cached.w, cached.h, cached.s16);
        void (async () => {
          const live = () => (activeColorWarp == null ? void 0 : activeColorWarp.handle) === handle;
          const loaded = await findSourceImgAsync(node, "image");
          if (loaded) {
            dbg(
              "ColorWarp source ready",
              loaded.naturalWidth + "x" + loaded.naturalHeight,
              live() ? "→ setImage" : "(editor already closed)"
            );
            if (live()) handle.setImage(loaded, loaded.naturalWidth, loaded.naturalHeight);
            return;
          }
          if (cached) return;
          const stored = await fetchPushedFrame(String(node.id));
          if (stored) {
            colorWarpFrames.set(String(node.id), stored);
            if (live()) handle.setImage(stored.canvas, stored.w, stored.h, stored.s16);
            return;
          }
          dbg("ColorWarp has no source anywhere — queueing node", node.id);
          void queueNode(node);
        })();
      });
      btn.serialize = false;
      const onSource = (e) => {
        const d = e == null ? void 0 : e.detail;
        dbg(
          "colorwarp-source push for node",
          d == null ? void 0 : d.node,
          "(this node:",
          node.id,
          ")",
          d ? `${d.width}x${d.height}` : "no detail"
        );
        if (!d || String(d.node) !== String(node.id)) return;
        const frame = framePayload(d);
        if (!frame) return;
        colorWarpFrames.set(String(node.id), frame);
        const live = (activeColorWarp == null ? void 0 : activeColorWarp.nodeId) === String(node.id);
        dbg("push decoded", frame.w + "x" + frame.h, live ? "→ setImage" : "(editor not open)");
        if (live) activeColorWarp.handle.setImage(frame.canvas, frame.w, frame.h, frame.s16);
      };
      api.addEventListener("nkd-colorwarp-source", onSource);
      const origRemoved = this.onRemoved;
      this.onRemoved = function() {
        api.removeEventListener("nkd-colorwarp-source", onSource);
        if ((activeColorWarp == null ? void 0 : activeColorWarp.nodeId) === String(node.id)) {
          activeColorWarp.handle.close();
          activeColorWarp = null;
        }
        origRemoved == null ? void 0 : origRemoved.apply(this, arguments);
      };
      return result;
    };
  }
});
const splineFrames = /* @__PURE__ */ new Map();
let openSpline = null;
api.addEventListener("nkd-source", (e) => {
  const d = e == null ? void 0 : e.detail;
  if (!(d == null ? void 0 : d.data)) return;
  try {
    const bin = atob(d.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const canvas = rgbBytesToCanvas(bytes, d.width, d.height);
    const id = String(d.node);
    splineFrames.set(id, { canvas, w: d.width, h: d.height });
    if ((openSpline == null ? void 0 : openSpline.nodeId) === id) openSpline.handle.setImage(canvas, d.width, d.height);
  } catch {
  }
});
function collectUpstream(nodeId, output, into) {
  if (into[nodeId] || !output[nodeId]) return;
  into[nodeId] = output[nodeId];
  for (const value of Object.values(output[nodeId].inputs ?? {})) {
    if (Array.isArray(value)) collectUpstream(String(value[0]), output, into);
  }
}
async function queueNode(node) {
  var _a, _b, _c;
  const origQueue = api.queuePrompt;
  try {
    api.queuePrompt = async function(index, prompt) {
      api.queuePrompt = origQueue;
      if (prompt == null ? void 0 : prompt.output) {
        const filtered = {};
        collectUpstream(String(node.id), prompt.output, filtered);
        dbg(
          "queueNode",
          node.id,
          "→ trimmed prompt to",
          Object.keys(filtered).length,
          "of",
          Object.keys(prompt.output).length,
          "nodes:",
          Object.keys(filtered)
        );
        prompt = { ...prompt, output: filtered };
      } else {
        dbg("queueNode", node.id, "— prompt has no .output, sending whole graph", prompt);
      }
      return origQueue.call(api, index, prompt);
    };
    await app.queuePrompt(0, 1);
    dbg("queueNode", node.id, "submitted");
  } catch (err) {
    api.queuePrompt = origQueue;
    console.error("[NKD Basic Tools] queue failed:", err);
    (_c = (_b = (_a = app.extensionManager) == null ? void 0 : _a.toast) == null ? void 0 : _b.add) == null ? void 0 : _c.call(_b, {
      severity: "error",
      summary: "Queue Failed",
      detail: String(err),
      life: 6e3
    });
  }
}
function widgetValues(node, names) {
  var _a;
  const out = {};
  for (const n of names) {
    const w = (_a = node.widgets) == null ? void 0 : _a.find((x) => x.name === n);
    if (w) out[n] = w.value;
  }
  return out;
}
function registerSplineNode(nodeName, widgetName, mode, title, buttonLabel, preview) {
  app.registerExtension({
    name: `NKD.BasicTools.${nodeName}`,
    async beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData.name !== nodeName) return;
      if (nodeType.prototype[`__nkd_${nodeName}`]) return;
      nodeType.prototype[`__nkd_${nodeName}`] = true;
      const origCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function() {
        var _a;
        const result = origCreated == null ? void 0 : origCreated.apply(this, arguments);
        const node = this;
        const dataW = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === widgetName);
        if (dataW) {
          dataW.type = "hidden";
          dataW.hidden = true;
          if (dataW.options) dataW.options.hidden = true;
          dataW.computedHeight = 0;
          dataW.computeSize = () => [0, -4];
        }
        const btn = this.addWidget("button", buttonLabel, null, () => {
          if (openSpline) openSpline.handle.close();
          const img = findSourceImg(node, "image");
          const cached = splineFrames.get(String(node.id));
          const src = img ? { el: img, w: img.naturalWidth, h: img.naturalHeight } : cached ? { el: cached.canvas, w: cached.w, h: cached.h } : { el: null, w: 1024, h: 1024 };
          const handle = openSplineOverlay({
            mode,
            title,
            image: src.el,
            imageW: src.w,
            imageH: src.h,
            json: (dataW == null ? void 0 : dataW.value) || "",
            nodeId: String(node.id),
            previewKind: preview == null ? void 0 : preview.kind,
            previewKey: widgetName,
            previewParams: preview ? () => widgetValues(node, preview.params) : void 0,
            onSetting: (name, value) => {
              var _a2, _b;
              const w = (_a2 = node.widgets) == null ? void 0 : _a2.find((x) => x.name === name);
              if (!w) return;
              w.value = value;
              (_b = w.callback) == null ? void 0 : _b.call(w, value);
              node.setDirtyCanvas(true, true);
            },
            onChange: (json) => {
              if (dataW) dataW.value = json;
              node.setDirtyCanvas(true, true);
            },
            onClose: (json, save) => {
              if (json && dataW) dataW.value = json;
              node.setDirtyCanvas(true, true);
              if ((openSpline == null ? void 0 : openSpline.handle) === handle) openSpline = null;
              if (save) void queueNode(node);
            }
          });
          openSpline = { nodeId: String(node.id), handle };
          if (!img) {
            void findSourceImgAsync(node, "image").then((loaded) => {
              if (loaded && (openSpline == null ? void 0 : openSpline.handle) === handle) {
                handle.setImage(loaded, loaded.naturalWidth, loaded.naturalHeight);
              }
            });
          }
        });
        btn.serialize = false;
        const origRemoved = this.onRemoved;
        this.onRemoved = function() {
          if ((openSpline == null ? void 0 : openSpline.nodeId) === String(node.id)) {
            openSpline.handle.close();
            openSpline = null;
          }
          splineFrames.delete(String(node.id));
          origRemoved == null ? void 0 : origRemoved.apply(this, arguments);
        };
        return result;
      };
    }
  });
}
registerSplineNode(
  "NKDVectorMask",
  "shapes",
  "shape",
  "😺 Vector Mask",
  "Draw mask shapes"
);
registerSplineNode(
  "NKDPathBlur",
  "paths",
  "path",
  "😺 Path Blur",
  "Draw motion strokes",
  { kind: "path", params: ["strength", "spread"] }
);
registerSplineNode(
  "NKDFieldBlur",
  "pins",
  "pin",
  "😺 Field Blur",
  "Place blur pins",
  { kind: "field", params: ["max_blur", "falloff"] }
);
app.registerExtension({
  name: "NKD.BasicTools.NKDFaceRig",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "NKDFaceRig") return;
    if (nodeType.prototype["__nkd_NKDFaceRig"]) return;
    nodeType.prototype["__nkd_NKDFaceRig"] = true;
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      var _a, _b;
      const result = origCreated == null ? void 0 : origCreated.apply(this, arguments);
      const node = this;
      const dataW = (_a = this.widgets) == null ? void 0 : _a.find((w) => w.name === "rig");
      if (dataW) {
        dataW.type = "hidden";
        dataW.hidden = true;
        if (dataW.options) dataW.options.hidden = true;
        dataW.computedHeight = 0;
        dataW.computeSize = () => [0, -4];
      }
      const container = document.createElement("div");
      container.style.cssText = "width:100%;box-sizing:border-box;overflow:hidden;";
      const rig = mountFaceRig(container, {
        nodeId: String(node.id),
        json: (dataW == null ? void 0 : dataW.value) || "",
        cropFactor: () => Number(widgetValues(node, ["crop_factor"]).crop_factor ?? 2),
        srcRatio: () => Number(widgetValues(node, ["src_ratio"]).src_ratio ?? 1),
        hasSource: () => {
          var _a2, _b2;
          return ((_b2 = (_a2 = node.inputs) == null ? void 0 : _a2.find((i) => i.name === "image")) == null ? void 0 : _b2.link) != null;
        },
        frame: () => {
          const img = findSourceImg(node, "image");
          if (!img) {
            void findSourceImgAsync(node, "image");
            return null;
          }
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img, 0, 0);
          try {
            return c.toDataURL("image/png");
          } catch {
            return null;
          }
        },
        onChange: (json) => {
          if (dataW) dataW.value = json;
          node.setDirtyCanvas(true, true);
        }
      });
      const domW = this.addDOMWidget("face_rig_editor", "FACE_RIG_EDITOR", container, {
        getValue: () => rig.serialise(),
        setValue: (v) => {
          if (dataW) dataW.value = v;
          rig.setJson(v || "");
        },
        serialize: false
        // the `rig` STRING widget is the store
      });
      if (domW) domW.serialize = false;
      sizeDomWidgetToContent(node, domW, container, 300, (w) => w + 70);
      for (const name of ["crop_factor", "src_ratio"]) {
        const w = (_b = this.widgets) == null ? void 0 : _b.find((x) => x.name === name);
        if (!w) continue;
        const orig = w.callback;
        w.callback = function(...args) {
          const r = orig == null ? void 0 : orig.apply(this, args);
          rig.retry();
          return r;
        };
      }
      for (const t of [250, 750, 1500]) {
        setTimeout(() => {
          if (!node.size) return;
          const needed = node.computeSize();
          if (Math.abs(needed[1] - node.size[1]) > 2) {
            node.setSize([node.size[0], needed[1]]);
            node.setDirtyCanvas(true, true);
          }
        }, t);
      }
      const origConn = this.onConnectionsChange;
      this.onConnectionsChange = function() {
        origConn == null ? void 0 : origConn.apply(this, arguments);
        void findSourceImgAsync(node, "image").then(() => rig.retry());
      };
      let lastSrcUrl = upstreamImageUrl(node, "image");
      const srcPoll = window.setInterval(() => {
        const url = upstreamImageUrl(node, "image");
        if (url === lastSrcUrl) return;
        lastSrcUrl = url;
        void findSourceImgAsync(node, "image").then(() => rig.refreshSource());
      }, 500);
      const origConfigure = this.onConfigure;
      this.onConfigure = function() {
        origConfigure == null ? void 0 : origConfigure.apply(this, arguments);
        setTimeout(() => {
          if (dataW == null ? void 0 : dataW.value) rig.setJson(String(dataW.value));
        }, 0);
      };
      const origRemoved = this.onRemoved;
      this.onRemoved = function() {
        clearInterval(srcPoll);
        rig.destroy();
        origRemoved == null ? void 0 : origRemoved.apply(this, arguments);
      };
      return result;
    };
  }
});
console.log("[NKD Basic Tools] spline editors + color warp loaded (window.NKD_DEBUG=true traces how the editors load their image)");
(function() {
  "use strict";
  try {
    if (typeof document != "undefined") {
      var elementStyle = document.createElement("style");
      elementStyle.appendChild(document.createTextNode('.nkd-pv[data-v-e3af9b8a] {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  box-sizing: border-box;\n  padding: 2px;\n}\n.nkd-pv-editor[data-v-e3af9b8a] {\n  height: 150px;\n  min-height: 90px;\n  resize: vertical;\n  overflow-y: auto;\n  background: #111318;\n  border: 1px solid #3a3d46;\n  border-radius: 4px;\n  padding: 8px 10px;\n  color: #c8d0e0;\n  font-size: 13px;\n  line-height: 1.7;\n  white-space: pre-wrap;\n  word-break: break-word;\n  outline: none;\n}\n.nkd-pv-editor[data-v-e3af9b8a]:focus {\n  border-color: #4ab4ff;\n}\n.nkd-pv-editor[data-v-e3af9b8a]:empty::before {\n  content: attr(data-placeholder);\n  color: rgba(255, 255, 255, 0.22);\n  pointer-events: none;\n}\n.nkd-pv-bar[data-v-e3af9b8a] {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  flex: 0 0 auto;\n}\n.nkd-pv-add[data-v-e3af9b8a] {\n  background: #252830;\n  border: 1px solid #3a3d46;\n  border-radius: 4px;\n  color: #c8d0e0;\n  font-size: 11px;\n  padding: 2px 8px;\n  cursor: pointer;\n}\n.nkd-pv-add[data-v-e3af9b8a]:hover {\n  border-color: #4ab4ff;\n  color: #4ab4ff;\n}\n.nkd-pv-add.connected[data-v-e3af9b8a] {\n  color: #4ab4ff;\n}\n\n.nkd-pv-chip {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  background: rgba(74, 180, 255, 0.14);\n  border: 1px solid rgba(74, 180, 255, 0.75);\n  color: #bfe3ff;\n  border-radius: 999px;\n  padding: 0 9px 0 7px;\n  margin: 0 2px;\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.2px;\n  line-height: 17px;\n  vertical-align: text-bottom;\n  user-select: none;\n  cursor: grab;\n  white-space: nowrap;\n  transform: translateY(-1px);\n}\n.nkd-pv-chip:active {\n  cursor: grabbing;\n}\n.nkd-pv-chip::selection,\n.nkd-pv-chip *::selection {\n  background: transparent;\n}\n.nkd-pv-dot {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: #4ab4ff;\n  flex: 0 0 auto;\n}\n.nkd-pv-chip-off {\n  border-style: dashed;\n  border-color: rgba(255, 255, 255, 0.32);\n  color: rgba(255, 255, 255, 0.5);\n  background: rgba(255, 255, 255, 0.05);\n}\n.nkd-pv-chip-off .nkd-pv-dot {\n  background: transparent;\n  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.35);\n}\n.nkd-pv-chip-rand {\n  border-color: rgba(255, 209, 102, 0.85);\n  color: #ffe3a8;\n  background: rgba(255, 209, 102, 0.12);\n}\n.nkd-pv-chip-rand::after {\n  content: "🎲";\n  font-size: 10px;\n  line-height: 1;\n}\n.nkd-pv-chip-rand .nkd-pv-dot {\n  background: #ffd166;\n}\n.nkd-pv-chip-rand.nkd-pv-chip-off .nkd-pv-dot {\n  background: transparent;\n  box-shadow: inset 0 0 0 1.5px rgba(255, 209, 102, 0.5);\n}\n.nkd-pv-chip-cycle {\n  border-color: rgba(102, 224, 170, 0.85);\n  color: #b6f2d8;\n  background: rgba(102, 224, 170, 0.12);\n}\n.nkd-pv-chip-cycle::after {\n  content: "🔁";\n  font-size: 10px;\n  line-height: 1;\n}\n.nkd-pv-chip-cycle .nkd-pv-dot {\n  background: #66e0aa;\n}\n.nkd-pv-chip-cycle.nkd-pv-chip-off .nkd-pv-dot {\n  background: transparent;\n  box-shadow: inset 0 0 0 1.5px rgba(102, 224, 170, 0.5);\n}\n\n.nkd-root[data-v-3d741d05] {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  box-sizing: border-box;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border: 1px solid var(--border-color, #2a2d36);\n  border-radius: 6px;\n  overflow: hidden;\n  font: 11px Inter, sans-serif;\n}\n.nkd-root[data-v-3d741d05], .nkd-root[data-v-3d741d05] *, .nkd-root[data-v-3d741d05] *::before, .nkd-root[data-v-3d741d05] *::after {\n  box-sizing: border-box;\n}\n.nkd-canvas[data-v-3d741d05] {\n  width: 100%;\n  aspect-ratio: 380 / 64;\n  height: auto;\n  display: block;\n  cursor: crosshair;\n  flex: 0 0 auto;\n}\n.nkd-color-input[data-v-3d741d05] {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  opacity: 0;\n  pointer-events: none;\n}\n.nkd-bar[data-v-3d741d05] {\n  flex: 0 0 auto;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border-top: 1px solid var(--border-color, #2a2d36);\n}\n.nkd-row[data-v-3d741d05] {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n.nkd-row--controls[data-v-3d741d05] { padding: 5px 8px 3px;\n}\n.nkd-row--presets[data-v-3d741d05]  { padding: 3px 8px 5px; border-top: 1px solid var(--border-color, rgba(255,255,255,0.06));\n}\n.nkd-spacer[data-v-3d741d05] { flex: 1 1 auto;\n}\n.nkd-hint[data-v-3d741d05] {\n  font-size: 9.5px;\n  color: rgba(255,255,255,0.32);\n  opacity: 0.7;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.nkd-label[data-v-3d741d05] {\n  font-size: 10px;\n  color: var(--descrip-text, rgba(255,255,255,0.45));\n  white-space: nowrap;\n}\n.nkd-select--preset[data-v-3d741d05] { flex: 1 1 auto; min-width: 0; max-width: 240px;\n}\n.nkd-select--interp[data-v-3d741d05] { flex: 0 0 auto; padding: 2px 4px; font-size: 10px;\n}\n.nkd-btn[data-v-3d741d05], .nkd-select[data-v-3d741d05] {\n  background: var(--comfy-input-bg, #252830);\n  border: 1px solid var(--border-color, #3a3d46);\n  color: var(--input-text, rgba(255,255,255,0.65));\n  border-radius: 5px;\n  padding: 2px 8px;\n  font-size: 11px;\n  transition: border-color 0.12s, color 0.12s, background 0.12s;\n  cursor: pointer;\n}\n.nkd-btn[data-v-3d741d05]:hover, .nkd-select[data-v-3d741d05]:hover, .nkd-select[data-v-3d741d05]:focus {\n  border-color: #4ab4ff;\n  color: rgba(255,255,255,0.95);\n}\n.nkd-btn[data-v-3d741d05]:disabled {\n  opacity: 0.35;\n  cursor: not-allowed;\n}\n\n.nkd-root[data-v-f11c2d3f] {\r\n  display: flex;\r\n  flex-direction: column;\r\n  width: 100%;\r\n  box-sizing: border-box;\r\n  background: var(--comfy-menu-bg, #1a1c22);\r\n  border: 1px solid var(--border-color, #2a2d36);\r\n  border-radius: 6px;\r\n  overflow: hidden;\r\n  font: 11px Inter, sans-serif;\n}\n.nkd-root[data-v-f11c2d3f], .nkd-root[data-v-f11c2d3f] *, .nkd-root[data-v-f11c2d3f] *::before, .nkd-root[data-v-f11c2d3f] *::after {\r\n  box-sizing: border-box;\n}\n.nkd-canvas[data-v-f11c2d3f] {\r\n  width: 100%;\r\n  aspect-ratio: 320 / 210;\r\n  height: auto;\r\n  display: block;\r\n  cursor: default;\r\n  flex: 0 0 auto;\n}\n.nkd-bar[data-v-f11c2d3f] {\r\n  flex: 0 0 auto;\r\n  background: var(--comfy-menu-bg, #1a1c22);\r\n  border-top: 1px solid var(--border-color, #2a2d36);\n}\n.nkd-row[data-v-f11c2d3f] {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 6px;\n}\n.nkd-row--controls[data-v-f11c2d3f] { padding: 5px 8px;\n}\n.nkd-spacer[data-v-f11c2d3f] { flex: 1 1 auto;\n}\n.nkd-hint[data-v-f11c2d3f] {\r\n  font-size: 9.5px;\r\n  color: rgba(255,255,255,0.32);\r\n  opacity: 0.7;\r\n  white-space: nowrap;\n}\n.nkd-btn[data-v-f11c2d3f] {\r\n  background: var(--comfy-input-bg, #252830);\r\n  border: 1px solid var(--border-color, #3a3d46);\r\n  color: var(--input-text, rgba(255,255,255,0.65));\r\n  border-radius: 5px;\r\n  padding: 2px 8px;\r\n  font-size: 11px;\r\n  cursor: pointer;\r\n  transition: border-color 0.12s, color 0.12s, background 0.12s;\n}\n.nkd-btn[data-v-f11c2d3f]:hover {\r\n  border-color: #4ab4ff;\r\n  color: rgba(255,255,255,0.95);\n}\r\n\n.nkd-root[data-v-aa41997d] {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  box-sizing: border-box;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border: 1px solid var(--border-color, #2a2d36);\n  border-radius: 6px;\n  overflow: hidden;\n  font: 11px Inter, sans-serif;\n}\n.nkd-root[data-v-aa41997d], .nkd-root[data-v-aa41997d] *, .nkd-root[data-v-aa41997d] *::before, .nkd-root[data-v-aa41997d] *::after {\n  box-sizing: border-box;\n}\n.nkd-canvas[data-v-aa41997d] {\n  width: 100%;\n  height: auto;\n  display: block;\n  flex: 0 0 auto;\n}\n.nkd-bar[data-v-aa41997d] {\n  flex: 0 0 auto;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border-top: 1px solid var(--border-color, #2a2d36);\n}\n.nkd-row[data-v-aa41997d] {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n.nkd-row--controls[data-v-aa41997d] { padding: 5px 8px;\n}\n.nkd-hint[data-v-aa41997d] {\n  font-size: 9.5px;\n  color: rgba(255,255,255,0.32);\n  opacity: 0.7;\n  white-space: nowrap;\n}\n\n.nkd-root[data-v-773b27a5] {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  box-sizing: border-box;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border: 1px solid var(--border-color, #2a2d36);\n  border-radius: 6px;\n  overflow: hidden;\n  font: 11px Inter, sans-serif;\n}\n.nkd-root[data-v-773b27a5], .nkd-root[data-v-773b27a5] *, .nkd-root[data-v-773b27a5] *::before, .nkd-root[data-v-773b27a5] *::after { box-sizing: border-box;\n}\n.nkd-canvas[data-v-773b27a5] { width: 100%; height: auto; display: block; flex: 0 0 auto;\n}\n.nkd-bar[data-v-773b27a5] {\n  flex: 0 0 auto;\n  background: var(--comfy-menu-bg, #1a1c22);\n  border-top: 1px solid var(--border-color, #2a2d36);\n}\n.nkd-row[data-v-773b27a5] { display: flex; align-items: center; gap: 6px;\n}\n.nkd-row--controls[data-v-773b27a5] { padding: 5px 8px;\n}\n.nkd-hint[data-v-773b27a5] { font-size: 9.5px; color: rgba(255,255,255,0.32); opacity: 0.7; white-space: nowrap;\n}\n\n.nkd-root[data-v-cf839f24] {\r\n  display: flex;\r\n  flex-direction: column;\r\n  width: 100%;\r\n  box-sizing: border-box;\r\n  background: var(--comfy-menu-bg, #1a1c22);\r\n  border: 1px solid var(--border-color, #2a2d36);\r\n  border-radius: 6px;\r\n  overflow: hidden;\r\n  font: 11px Inter, sans-serif;\n}\n.nkd-root[data-v-cf839f24], .nkd-root[data-v-cf839f24] *, .nkd-root[data-v-cf839f24] *::before, .nkd-root[data-v-cf839f24] *::after { box-sizing: border-box;\n}\n.nkd-canvas[data-v-cf839f24] { width: 100%; height: auto; display: block; flex: 0 0 auto;\n}\n.nkd-canvas--pan[data-v-cf839f24] { cursor: grab;\n}\n.nkd-canvas--pan[data-v-cf839f24]:active { cursor: grabbing;\n}\n.nkd-spacer[data-v-cf839f24] { flex: 1 1 auto;\n}\n.nkd-btn[data-v-cf839f24] {\r\n  background: var(--comfy-input-bg, #252830);\r\n  border: 1px solid var(--border-color, #3a3d46);\r\n  color: var(--input-text, rgba(255,255,255,0.65));\r\n  border-radius: 5px;\r\n  padding: 1px 7px;\r\n  font-size: 10px;\r\n  cursor: pointer;\r\n  transition: border-color 0.12s, color 0.12s;\n}\n.nkd-btn[data-v-cf839f24]:hover { border-color: #4ab4ff; color: rgba(255,255,255,0.95);\n}\n.nkd-bar[data-v-cf839f24] { flex: 0 0 auto; background: var(--comfy-menu-bg, #1a1c22); border-top: 1px solid var(--border-color, #2a2d36);\n}\n.nkd-row[data-v-cf839f24] { display: flex; align-items: center; gap: 6px;\n}\n.nkd-row--controls[data-v-cf839f24] { padding: 5px 8px;\n}\n.nkd-hint[data-v-cf839f24] { font-size: 9.5px; color: rgba(255,255,255,0.32); opacity: 0.7; white-space: nowrap;\n}\n.nkd-label[data-v-cf839f24] { font-size: 9.5px; color: rgba(255,255,255,0.45); white-space: nowrap;\n}\n.nkd-slider[data-v-cf839f24] {\r\n  flex: 1 1 auto;\r\n  min-width: 40px;\r\n  height: 3px;\r\n  accent-color: #4ab4ff;\r\n  cursor: ew-resize;\n}'));
      document.head.appendChild(elementStyle);
    }
  } catch (e) {
    console.error("vite-plugin-css-injected-by-js", e);
  }
})();
