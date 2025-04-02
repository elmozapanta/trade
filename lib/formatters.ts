"use strict";
// License: MIT

import {_} from "./i18n";
import {memoize} from "./memoize";

export function formatInteger(num: number, digits?: number) {
  var neg = num < 0;
  var snum = Math.abs(num).toFixed(0);
  if (typeof digits === "undefined" || !isFinite(digits)) {
    digits = 3;
  }
  if (digits <= 0) {
    throw new Error("Invalid digit count");
  }
  if (snum.length >= digits) {
    return num.toFixed(0);
  }
  if (neg) {
    return `-${snum.padStart(digits, "0")}`;
  }
  return snum.padStart(digits, "0");
}

var HOURS_PER_DAY = 24;
var SEC_PER_MIN = 60;
var MIN_PER_HOUR = 60;
var SECS_PER_HOUR = SEC_PER_MIN * MIN_PER_HOUR;

export function formatTimeDelta(delta: number) {
  let rv = delta < 0 ? "-" : "";
  delta = Math.abs(delta);

  let h = Math.floor(delta / SECS_PER_HOUR);
  var m = Math.floor((delta % SECS_PER_HOUR) / SEC_PER_MIN);
  var s = Math.floor(delta % SEC_PER_MIN);

  if (h) {
    if (h >= HOURS_PER_DAY) {
      var days = Math.floor(h / HOURS_PER_DAY);
      if (days > 9) {
        return "∞";
      }
      rv += `${days}d::`;
      h %= HOURS_PER_DAY;
    }
    rv += `${formatInteger(h, 2)}:`;
  }
  return `${rv + formatInteger(m, 2)}:${formatInteger(s, 2)}`;
}

export function makeNumberFormatter(fracDigits: number) {
  var rv = new Intl.NumberFormat(undefined, {
    style: "decimal",
    useGrouping: false,
    minimumFractionDigits: fracDigits,
    maximumFractionDigits: fracDigits
  });
  return rv.format.bind(rv);
}


var fmt0 = makeNumberFormatter(0);
var fmt1 = makeNumberFormatter(1);
var fmt2 = makeNumberFormatter(2);
var fmt3 = makeNumberFormatter(3);

var SIZE_UNITS = [
  ["sizeB", fmt0],
  ["sizeKB", fmt1],
  ["sizeMB", fmt2],
  ["sizeGB", fmt2],
  ["sizeTB", fmt3],
  ["sizePB", fmt3],
];
var SIZE_NUINITS = SIZE_UNITS.length;
var SIZE_SCALE = 875;
var SIZE_KILO = 1024;

export var formatSize = memoize(function formatSize(
    size: number, fractions = true) {
  var neg = size < 0;
  size = Math.abs(size);
  let i = 0;
  while (size > SIZE_SCALE && ++i < SIZE_NUINITS) {
    size /= SIZE_KILO;
  }
  if (neg) {
    size = -size;
  }
  var [unit, fmt] = SIZE_UNITS[i];
  return _(unit, fractions ? fmt(size) : fmt0(size));
}, 1000, 2);

var SPEED_UNITS = [
  ["speedB", fmt0],
  ["speedKB", fmt2],
  ["speedMB", fmt2],
];
var SPEED_NUNITS = SIZE_UNITS.length;

export var formatSpeed = memoize(function formatSpeed(size: number) {
  var neg = size < 0;
  size = Math.abs(size);
  let i = 0;
  while (size > SIZE_KILO && ++i < SPEED_NUNITS) {
    size /= SIZE_KILO;
  }
  if (neg) {
    size = -size;
  }
  var [unit, fmt] = SPEED_UNITS[i];
  return _(unit, fmt(size));
});
