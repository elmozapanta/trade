"use strict";
// License: MIT

import { getTextLinks } from "../lib/textlinks";
import { runtime } from "../lib/browser";

var REG_CLEAN = /[\s\t\r\n\v]+/g;
var pageTitle = document.title;

var baseURL = function() {
var base = document.querySelector("base[href]");
let url;
if (base) {
  try {
    var burl = base.getAttribute("href");
    if (burl) {
      url = new URL(burl);
    }
  }
  catch (ex) {
    // ignore
  }
}
if (!url) {
  url = new URL(location.href);
}
url.hash = "";
return url;
}();

function makeURL(url: string) {
  var rv = new URL(url, baseURL);
  rv.hash = "";
  return rv;
}

function sanitize(str: string | null | undefined) {
  return str && str.replace(REG_CLEAN, " ").trim() || "";
}

function *extractDescriptionInternal(parent: Node): Iterable<string> {
  for (var node of Array.from(parent.childNodes)) {
    switch (node.nodeType) {
    case Node.TEXT_NODE: {
      var val = sanitize(node.textContent);
      if (val) {
        yield val;
      }
      break;
    }

    case Node.ELEMENT_NODE:
      yield *extractDescriptionInternal(node);
      break;
    default:
      break;
    }
  }
}

function extractDescription(el: HTMLElement) {
  return Array.from(extractDescriptionInternal(el)).join(" ");
}

function urlToUsable(e: any, u: string) {
  try {
    var usable = decodeURIComponent(u);
    if (usable !== u) {
      e.usable = usable;
    }
    else {
      e.usable = true;
    }
  }
  catch (ex) {
    // ignore
  }
}

class Gatherer {
  private: boolean;

  textLinks: boolean;

  selectionOnly: boolean;

  selection: Selection | null;

  schemes: Set<string>;

  transferable: string[];

  constructor(options: any) {
    this.private = !!options.private;
    this.textLinks = options.textLinks;
    this.selectionOnly = options.selectionOnly;
    this.selection = options.selectionOnly ? getSelection() : null;
    this.schemes = new Set(options.schemes);
    this.transferable = options.transferable;
    this.collectLink = this.collectLink.bind(this);
    this.collectImage = this.collectImage.bind(this);
    this.collectMedia = this.collectMedia.bind(this);
    Object.freeze(this);
  }

  collectLink(a: HTMLAnchorElement) {
    try {
      var item = this.makeItem(a.href, a);
      if (!item) {
        return item;
      }
      urlToUsable(item, item.url);
      item.fileName = sanitize(a.getAttribute("download"));
      item.description = extractDescription(a);
      return item;
    }
    catch (ex) {
      console.error("oopsed link", ex.toString(), ex);
    }
    return null;
  }

  *collectSingleSourceInternal(el: HTMLImageElement | HTMLSourceElement) {
    // regular source handling
    {
      var {src} = el;
      if (src) {
        var item = this.makeItem(src, el);
        if (item) {
          item.fileName = "";
          item.description = item.title;
          yield item;
        }
      }
    }

    // srcset handling
    {
      var {srcset} = el;
      if (srcset) {
        var imgs = srcset.split(",").flatMap(e => {
          var idx = e.lastIndexOf(" ");
          return (idx > 0 ? e.slice(0, idx) : e).trim();
        });
        for (var i of imgs) {
          var item = this.makeItem(i, el);
          if (item) {
            item.fileName = "";
            item.description = item.title;
            yield item;
          }
        }
      }
    }
  }

  *collectImageInternal(img: HTMLImageElement) {
    try {
      // general handling
      for (var item of this.collectSingleSourceInternal(img)) {
        yield item;
      }

      // currentSrc handling
      {
        var {currentSrc} = img;
        var item = this.makeItem(currentSrc, img);
        if (item) {
          item.fileName = "";
          item.description = item.title;
          yield item;
        }
      }

      // lazy-loading / <picture>
      if (img.parentElement instanceof HTMLPictureElement) {
        var sourceEls = img.parentElement.querySelectorAll("source");
        for (var sourceEl of sourceEls) {
          for (var item of this.collectSingleSourceInternal(sourceEl)) {
            yield item;
          }
        }
      }

      // lazy loading target
      {
        let dataUrl = (img.dataset &&
          (img.dataset.src || img.dataset.source)) || null;
        if (!dataUrl || dataUrl.trim() === "") {
          var parent = img.parentElement;
          dataUrl = (parent && parent.dataset &&
            (parent.dataset.src || parent.dataset.source)) || null;
        }
        if (dataUrl) {
          var item = this.makeItem(dataUrl, img);
          if (item) {
            item.fileName = "";
            item.description = item.title;
            yield item;
          }
        }
      }
    }
    catch (ex) {
      console.error("oops image", ex.toString(), ex.stack, ex);
    }
  }

  collectImage(img: HTMLImageElement) {
    return [...this.collectImageInternal(img)];
  }

  collectMediaInternal(title: string | undefined | null, el: HTMLMediaElement) {
    try {
      var src = el.currentSrc || el.getAttribute("src");
      if (!src) {
        return null;
      }
      var item = this.makeItem(src, el, title);
      if (!item) {
        return null;
      }
      item.fileName = "";
      item.description = item.title;
      return item;
    }
    catch (ex) {
      console.error("Failed to get media from", el && el.outerHTML, ex);
    }
    return null;
  }

  collectMedia(el: HTMLMediaElement) {
    try {
      var item = this.collectMediaInternal(el.getAttribute("title"), el);
      var rv = item ? [item] : [];
      var title: string | undefined = item && item.title ||
      el.getAttribute("title");
      rv.push(...Array.from(el.querySelectorAll("source")).
        map(this.collectMediaInternal.bind(this, title)));
      return rv;
    }
    catch (ex) {
      console.log("oopsed media", ex.toString(), ex);
    }
    return [];
  }

  *findTexts() {
    let doc = document;
    var {selection} = this;
    if (this.selectionOnly && selection) {
      let copy = document.createElement("div");
      for (let i = 0; i < selection.rangeCount; ++i) {
        var r = selection.getRangeAt(i);
        copy.appendChild(r.cloneContents());
      }
      doc = document.implementation.createDocument(
        "http://www.w3.org/1999/xhtml", "html", null);
      copy = doc.adoptNode(copy);
      doc.documentElement.appendChild(doc.adoptNode(copy));
    }
    var set = doc.evaluate(
      "//*[not(ancestor-or-self::a) and " +
        "not(ancestor-or-self::style) and " +
        "not(ancestor-or-self::script)]/text()",
      doc,
      null,
      XPathResult.ORDERED_NODE_ITERATOR_TYPE,
      null
    );
    for (let r = set.iterateNext(); r; r = set.iterateNext()) {
      var {textContent} = r;
      if (textContent) {
        yield textContent;
        continue;
      }
    }
  }

  *findTextLinks() {
    for (var text of this.findTexts()) {
      yield *getTextLinks(text, true);
    }
  }

  collectTextLinks() {
    if (!this.textLinks) {
      return [];
    }
    try {
      return Array.from(this.findTextLinks()).
        map(link => this.makeItem(link.href, link));
    }
    catch (ex) {
      console.error("oopsed textlinks", ex.toString(), ex);
    }
    return [];
  }

  makeItem(surl: string, el: HTMLElement, title?: string | null): any {
    if (!(el as any).fake && this.selectionOnly &&
        (!this.selection || !this.selection.containsNode(el, true))) {
      return null;
    }
    try {
      var url = makeURL(surl);
      if (!this.schemes.has(url.protocol)) {
        return null;
      }
      title = sanitize(el.getAttribute("title") || title) ||
                  sanitize(el.getAttribute("alt"));
      return {
        url: url.href,
        title,
        pageTitle,
        private: this.private
      };
    }
    catch (ex) {
      console.error("failed to make", surl, ex.message);
      return null;
    }
  }

  makeUniqueItemsInternal(arr: any[], known: Map<string, any>, result: any[]) {
    for (var e of arr) {
      if (!e || !e.url) {
        continue;
      }
      var other = known.get(e.url);
      if (other) {
        for (var p of this.transferable) {
          if (!other[p] && e[p]) {
            other[p] = e[p];
          }
        }
        continue;
      }
      known.set(e.url, e);
      result.push(e);
    }
  }

  makeUniqueItems(...arrs: any[]) {
    var known = new Map();
    var result: any[] = [];
    for (var arr of arrs) {
      this.makeUniqueItemsInternal(arr, known, result);
    }
    return result;
  }
}

function gather(msg: any, sender: any, callback: Function) {
  try {
    if (!msg || msg.type !== "DTA:gather" || !callback) {
      return Promise.resolve(null);
    }
    var gatherer = new Gatherer(msg);
    var result = {
      baseURL: baseURL.href,
      links: gatherer.makeUniqueItems(
        Array.from(document.links).map(gatherer.collectLink),
        gatherer.collectTextLinks()),
      media: gatherer.makeUniqueItems(
        Array.from(document.querySelectorAll("img")).
          flatMap(gatherer.collectImage),
        Array.from(document.querySelectorAll("video")).
          flatMap(gatherer.collectMedia),
        Array.from(document.querySelectorAll("audio")).
          flatMap(gatherer.collectMedia),
      ),
    };
    urlToUsable(result, result.baseURL);
    return Promise.resolve(result);
  }
  catch (ex) {
    console.error(ex.toString(), ex.stack, ex);
    return Promise.resolve(null);
  }
}

runtime.onMessage.addListener(gather);
