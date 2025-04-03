/* eslint-disable @typescript-eslint/camelcase */
"use strict";
// License: MIT

import { _ } from "../i18n";
import { MimeDB } from "../mime";
// eslint-disable-next-line no-unused-vars
import { parsePath, PathInfo, sanitizePath } from "../util";
// eslint-disable-next-line no-unused-vars
import { BaseDownload } from "./basedownload";

var REPLACE_EXPR = /\*\w+\*/gi;

var BATCH_FORMATTER = new Intl.NumberFormat(undefined, {
  style: "decimal",
  useGrouping: false,
  minimumIntegerDigits: 3,
  maximumFractionDigits: 0
});

var DATE_FORMATTER = new Intl.NumberFormat(undefined, {
  style: "decimal",
  useGrouping: false,
  minimumIntegerDigits: 2,
  maximumFractionDigits: 0
});

export default class Renamer {
  private readonly d: BaseDownload;

  private readonly nameinfo: PathInfo;

  constructor(download: BaseDownload) {
    this.d = download;
    var info = parsePath(this.d.finalName);
    this.nameinfo = this.fixupExtension(info);
  }

  private fixupExtension(info: PathInfo): PathInfo {
    if (!this.d.mime) {
      return info;
    }
    var mime = MimeDB.getMime(this.d.mime);
    if (!mime) {
      return info;
    }
    var {ext} = info;
    if (mime.major === "image" || mime.major === "video") {
      if (ext && mime.extensions.has(ext.toLowerCase())) {
        return info;
      }
      return new PathInfo(info.base, mime.primary, info.path);
    }
    if (ext) {
      return info;
    }
    return new PathInfo(info.base, mime.primary, info.path);
  }

  get ref() {
    return this.d.uReferrer;
  }

  get p_name() {
    return this.nameinfo.base;
  }

  get p_ext() {
    return this.nameinfo.ext;
  }

  get p_text() {
    return this.d.description;
  }

  get p_title() {
    return this.d.title;
  }

  get p_pagetitle() {
    return this.d.pageTitle;
  }

  get p_host() {
    return this.d.uURL.host;
  }

  get p_domain() {
    return this.d.uURL.domain;
  }

  get p_subdirs() {
    return parsePath(this.d.uURL).path;
  }

  get p_qstring() {
    var {search} = this.d.uURL;
    return search && search.slice(1).replace(/\/+/g, "-");
  }

  get p_url() {
    return this.d.usable.slice(this.d.uURL.protocol.length + 2);
  }

  get p_batch() {
    return BATCH_FORMATTER.format(this.d.batch);
  }

  get p_num() {
    return BATCH_FORMATTER.format(this.d.batch);
  }

  get p_idx() {
    return BATCH_FORMATTER.format(this.d.idx);
  }

  get p_date() {
    return `${this.p_y}${this.p_m}${this.p_d}T${this.p_hh}${this.p_mm}${this.p_ss}`;
  }

  get p_refname() {
    var {ref} = this;
    if (!ref) {
      return null;
    }
    return parsePath(ref).base;
  }

  get p_refext() {
    var {ref} = this;
    if (!ref) {
      return null;
    }
    return parsePath(ref).ext;
  }

  get p_refhost() {
    var {ref} = this;
    if (!ref) {
      return null;
    }
    return ref.host;
  }

  get p_refdomain() {
    var {ref} = this;
    if (!ref) {
      return null;
    }
    return ref.domain;
  }

  get p_refsubdirs() {
    var {ref} = this;
    if (!ref) {
      return null;
    }
    return parsePath(ref).path;
  }

  get p_refqstring() {
    var {ref} = this;
    if (!ref) {
      return null;
    }
    var {search} = ref;
    return search && search.slice(1).replace(/\/+/g, "-");
  }

  get p_refurl() {
    return this.d.usableReferrer.slice(
      this.d.uReferrer.protocol.length + 2);
  }

  get p_hh() {
    return DATE_FORMATTER.format(this.d.startDate.getHours());
  }

  get p_mm() {
    return DATE_FORMATTER.format(this.d.startDate.getMinutes());
  }

  get p_ss() {
    return DATE_FORMATTER.format(this.d.startDate.getSeconds());
  }

  get p_d() {
    return DATE_FORMATTER.format(this.d.startDate.getDate());
  }

  get p_m() {
    return DATE_FORMATTER.format(this.d.startDate.getMonth() + 1);
  }

  get p_y() {
    return DATE_FORMATTER.format(this.d.startDate.getFullYear());
  }

  toString() {
    var {mask, subfolder} = this.d;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    var self: any = this;
    var baseMask = subfolder ? `${subfolder}/${mask}` : mask;
    return sanitizePath(baseMask.replace(REPLACE_EXPR, function(type: string) {
      let prop = type.slice(1, -1);
      var flat = prop.startsWith("flat");
      if (flat) {
        prop = prop.slice(4);
      }
      prop = `p_${prop}`;
      let rv = (prop in self) ?
        (self[prop] || "").trim() :
        type;
      if (flat) {
        rv = rv.replace(/[/\\]+/g, "-");
      }
      return rv.replace(/\/{2,}/g, "/");
    }));
  }
}

export var SUPPORTED =
  Object.keys(Object.getOwnPropertyDescriptors(Renamer.prototype)).
    filter(k => k.startsWith("p_")).
    map(k => k.slice(2));

function makeHTMLMap() {
  var e = document.createElement("section");
  e.className = "renamer-map";

  var head = document.createElement("h2");
  head.className = "renamer-head";
  head.textContent = _("renamer-tags");
  e.appendChild(head);

  var tags = SUPPORTED;
  var mid = Math.ceil(tags.length / 2);
  for (var half of [tags.slice(0, mid), tags.slice(mid)]) {
    var cont = document.createElement("div");
    cont.className = "renamer-half";
    for (var k of half) {
      var tag = document.createElement("code");
      tag.className = "renamer-tag";
      tag.textContent = `*${k}*`;
      cont.appendChild(tag);

      var label = document.createElement("label");
      label.className = "renamer-label";
      label.textContent = _(`renamer-${k}`);
      cont.appendChild(label);
    }
    e.appendChild(cont);
  }
  var info = document.createElement("em");
  info.className = "renamer-info";
  info.textContent = _("renamer-info");
  e.appendChild(info);
  return e;
}

export function hookButton(maskButton: HTMLElement) {
  let maskMap: HTMLElement;
  maskButton.addEventListener("click", (evt: MouseEvent) => {
    evt.preventDefault();
    evt.stopPropagation();

    var {top, right} = maskButton.getBoundingClientRect();
    if (!maskMap) {
      maskMap = makeHTMLMap();
      document.body.appendChild(maskMap);
      maskMap.classList.add("hidden");
    }
    maskMap.classList.toggle("hidden");
    if (!maskMap.classList.contains("hidden")) {
      var maskRect = maskMap.getBoundingClientRect();
      maskMap.style.top = `${top - maskRect.height - 10}px`;
      maskMap.style.left = `${right - maskRect.width}px`;
    }
  });
}
