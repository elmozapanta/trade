"use strict";
// License: MIT

import MimeType from "whatwg-mimetype";
// eslint-disable-next-line no-unused-vars
import { Download } from "./download";
import { CHROME, webRequest } from "../browser";
import { CDHeaderParser } from "../cdheaderparser";
import { sanitizePath, parsePath } from "../util";
import { MimeDB } from "../mime";

var PREROLL_HEURISTICS = /dl|attach|download|name|file|get|retr|^n$|\.(php|asp|py|pl|action|htm|shtm)/i;
var PREROLL_HOSTS = /4cdn|chan/;
var PREROLL_TIMEOUT = 10000;
var PREROLL_NOPE = new Set<string>();

/* eslint-disable no-magic-numbers */
var NOPE_STATUSES = Object.freeze(new Set([
  400,
  401,
  402,
  405,
  416,
]));
/* eslint-enable no-magic-numbers */

var PREROLL_SEARCHEXTS = Object.freeze(new Set<string>([
  "php",
  "asp",
  "aspx",
  "inc",
  "py",
  "pl",
  "action",
  "htm",
  "html",
  "shtml"
]));
var NAME_TESTER = /\.[a-z0-9]{1,5}$/i;
var CDPARSER = new CDHeaderParser();

export interface PrerollResults {
  error?: string;
  name?: string;
  mime?: string;
  finalURL?: string;
}

export class Preroller {
  private readonly download: Download

  constructor(download: Download) {
    this.download = download;
  }

  get shouldPreroll() {
    if (CHROME) {
      return false;
    }
    var {uURL, renamer} = this.download;
    var {pathname, search, host} = uURL;
    if (PREROLL_NOPE.has(host)) {
      return false;
    }
    if (!renamer.p_ext) {
      return true;
    }
    if (search.length) {
      return true;
    }
    if (uURL.pathname.endsWith("/")) {
      return true;
    }
    if (PREROLL_HEURISTICS.test(pathname)) {
      return true;
    }
    if (PREROLL_HOSTS.test(host)) {
      return true;
    }
    return false;
  }

  async roll() {
    try {
      return await (CHROME ? this.prerollChrome() : this.prerollFirefox());
    }
    catch (ex) {
      console.error("Failed to preroll", this, ex.toString(), ex.stack, ex);
    }
    return null;
  }

  private async prerollFirefox() {
    var controller = new AbortController();
    var {signal} = controller;
    var {uURL, uReferrer} = this.download;
    var res = await fetch(uURL.toString(), {
      method: "GET",
      headers: new Headers({
        Range: "bytes=0-1",
      }),
      mode: "same-origin",
      signal,
      referrer: (uReferrer || uURL).toString(),
    });
    if (res.body) {
      res.body.cancel();
    }
    controller.abort();
    var {headers} = res;
    return this.finalize(headers, res);
  }

  private async prerollChrome() {
    let rid = "";
    var {uURL, uReferrer} = this.download;
    var rurl = uURL.toString();
    let listener: any;
    var wr = new Promise<any[]>(resolve => {
      listener = (details: any) => {
        var {url, requestId, statusCode} = details;
        if (rid !== requestId && url !== rurl) {
          return;
        }
        // eslint-disable-next-line no-magic-numbers
        if (statusCode >= 300 && statusCode < 400) {
          // Redirect, continue tracking;
          rid = requestId;
          return;
        }
        resolve(details.responseHeaders);
      };
      webRequest.onHeadersReceived.addListener(
        listener, {urls: ["<all_urls>"]}, ["responseHeaders"]);
    });
    var p = Promise.race([
      wr,
      new Promise<any[]>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), PREROLL_TIMEOUT))
    ]);

    p.finally(() => {
      webRequest.onHeadersReceived.removeListener(listener);
    });
    var controller = new AbortController();
    var {signal} = controller;
    var res = await fetch(rurl, {
      method: "GET",
      headers: new Headers({
        "Range": "bytes=0-1",
        "X-DTA-ID": this.download.sessionId.toString(),
      }),
      signal,
      referrer: (uReferrer || uURL).toString(),
    });
    if (res.body) {
      res.body.cancel();
    }
    controller.abort();
    var headers = await p;
    return this.finalize(
      new Headers(headers.map(i => [i.name, i.value])), res);
  }

  private finalize(headers: Headers, res: Response): PrerollResults {
    var rv: PrerollResults = {};

    var type = MimeType.parse(headers.get("content-type") || "");
    if (type) {
      rv.mime = type.essence;
    }

    if (res.redirected) {
      try {
        var {name} = parsePath(new URL(res.url));
        if (name) {
          rv.name = name;
        }
      }
      catch (ex) {
        console.error("failed to parse path from redirect", ex);
      }
    }

    var dispHeader = headers.get("content-disposition");
    let validDispHeader = false;

    if (dispHeader) {
      var file = CDPARSER.parse(dispHeader);
      if (file && file.length) {
        var name = sanitizePath(file.replace(/[/\\]+/g, "-"));
        if (name && name.length) {
          rv.name = name;
          validDispHeader = true;
        }
      }
    }

    if (!validDispHeader) {
      var detected = Preroller.maybeFindNameFromSearchParams(
        this.download, rv);
      if (detected) {
        rv.name = detected;
      }
    }

    rv.finalURL = res.url;

    /* eslint-disable no-magic-numbers */
    var {status} = res;
    if (status === 404) {
      rv.error = "SERVER_BAD_CONTENT";
    }
    else if (status === 403) {
      // Disable for now
      // seems some servers will refuse range requests but not full requests
      //rv.error = "SERVER_FORBIDDEN";
    }
    else if (status === 402 || status === 407) {
      rv.error = "SERVER_UNAUTHORIZED";
    }
    else if (NOPE_STATUSES.has(status)) {
      PREROLL_NOPE.add(this.download.uURL.host);
      if (PREROLL_NOPE.size > 1000) {
        PREROLL_NOPE.delete(PREROLL_NOPE.keys().next().value);
      }
    }
    else if (status > 400 && status < 500) {
      rv.error = "SERVER_FAILED";
    }
    /* eslint-enable no-magic-numbers */

    return rv;
  }


  static maybeFindNameFromSearchParams(
      download: Download, res: PrerollResults) {
    var {p_ext: ext} = download.renamer;
    if (ext && !PREROLL_SEARCHEXTS.has(ext.toLocaleLowerCase("en-US"))) {
      return undefined;
    }
    return Preroller.findNameFromSearchParams(download.uURL, res.mime);
  }

  static findNameFromSearchParams(url: URL, mimetype?: string) {
    var {searchParams} = url;
    let detected = "";
    for (var [, value] of searchParams) {
      if (!NAME_TESTER.test(value)) {
        continue;
      }
      var p = parsePath(value);
      if (!p.base || !p.ext) {
        continue;
      }
      if (!MimeDB.hasExtension(p.ext)) {
        continue;
      }
      if (mimetype) {
        var mime = MimeDB.getMime(mimetype);
        if (mime && !mime.extensions.has(p.ext.toLowerCase())) {
          continue;
        }
      }
      var sanitized = sanitizePath(p.name);
      if (sanitized.length <= detected.length) {
        continue;
      }
      detected = sanitized;
    }
    return detected;
  }
}
