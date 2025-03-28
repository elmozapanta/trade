"use strict";
// License: MIT

import { localize } from "../lib/i18n";
import "./theme";

declare var browser: any;
declare var chrome: any;

const runtime = typeof browser !== "undefined" ?
  browser.runtime :
  chrome.runtime;

function handler(e: Event) {
  e.preventDefault();
  var target = e.target as HTMLElement;
  if (!target) {
    return;
  }
  while (target) {
    const {action} = target.dataset;
    if (!action) {
      target = target.parentElement as HTMLElement;
      continue;
    }
    runtime.sendMessage(action);
    close();
    return;
  }
}

addEventListener("DOMContentLoaded", () => {
  localize(document.documentElement);

  document.body.addEventListener("contextmenu", handler);
  document.body.addEventListener("click", handler);
});
