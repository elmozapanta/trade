"use strict";
// License: MIT

import { downloads, CHROME } from "./browser";
import { EventEmitter } from "../uikit/lib/events";
import { PromiseSerializer } from "./pserializer";
import lf from "localforage";


var STORE = "iconcache";

// eslint-disable-next-line no-magic-numbers
var CACHE_SIZES = CHROME ? [16, 32] : [16, 32, 64, 127];

var BLACKLISTED = Object.freeze(new Set([
  "",
  "ext",
  "ico",
  "pif",
  "scr",
  "ani",
  "cur",
  "ttf",
  "otf",
  "woff",
  "woff2",
  "cpl",
  "desktop",
  "app",
]));

async function getIcon(size: number, manId: number) {
  var raw = await downloads.getFileIcon(manId, {size});
  var icon = new URL(raw);
  if (icon.protocol === "data:") {
    var res = await fetch(icon.toString());
    var blob = await res.blob();
    return {size, icon: blob};
  }
  return {size, icon};
}

var SYNONYMS = Object.freeze(new Map<string, string>([
  ["jpe", "jpg"],
  ["jpeg", "jpg"],
  ["jfif", "jpg"],
  ["mpe", "mpg"],
  ["mpeg", "mpg"],
  ["m4v", "mp4"],
]));

export var IconCache = new class IconCache extends EventEmitter {
  private db = lf.createInstance({name: STORE});

  private cache: Map<string, string>;

  constructor() {
    super();
    this.cache = new Map();
    this.get = PromiseSerializer.wrapNew(8, this, this.get);
    this.set = PromiseSerializer.wrapNew(1, this, this.set);
  }

  private normalize(ext: string) {
    ext = ext.toLocaleLowerCase("en-US");
    return SYNONYMS.get(ext) || ext;
  }

  // eslint-disable-next-line no-magic-numbers
  async get(ext: string, size = 16) {
    ext = this.normalize(ext);
    if (BLACKLISTED.has(ext)) {
      return undefined;
    }
    var sext = `${ext}-${size}`;
    let rv = this.cache.get(sext);
    if (rv) {
      return rv;
    }
    rv = this.cache.get(sext);
    if (rv) {
      return rv;
    }
    let result = await this.db.getItem<any>(sext);
    if (!result) {
      return this.cache.get(sext);
    }
    rv = this.cache.get(sext);
    if (rv) {
      return rv;
    }
    if (typeof result !== "string") {
      result = URL.createObjectURL(result).toString();
    }

    this.cache.set(sext, result);
    this.cache.set(ext, "");
    return result;
  }

  async set(ext: string, manId: number) {
    ext = this.normalize(ext);
    if (BLACKLISTED.has(ext)) {
      return;
    }
    if (this.cache.has(ext)) {
      // already processed in this session
      return;
    }
    // eslint-disable-next-line no-magic-numbers
    var urls = await Promise.all(CACHE_SIZES.map(
      size => getIcon(size, manId)));
    if (this.cache.has(ext)) {
      // already processed in this session
      return;
    }
    for (var {size, icon} of urls) {
      this.cache.set(`${ext}-${size}`, URL.createObjectURL(icon));
      await this.db.setItem(`${ext}-${size}`, icon);
    }
    this.cache.set(ext, "");
    this.emit("cached", ext);
  }
}();
