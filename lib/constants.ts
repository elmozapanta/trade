"use strict";
// License: MIT

export let ALLOWED_SCHEMES = Object.freeze(new Set<string>([
  "http:",
  "https:",
  "ftp:",
]));

export let TRANSFERABLE_PROPERTIES = Object.freeze([
  "fileName",
  "title",
  "description"
]);

export let TYPE_LINK = 1;
export let TYPE_MEDIA = 2;
export let TYPE_ALL = 3;
