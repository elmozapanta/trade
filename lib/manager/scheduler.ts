"use strict";
// License: MIT

import { QUEUED } from "./state";
import { Limits } from "./limits";
import { filterInSitu } from "../util";
// eslint-disable-next-line no-unused-vars
import { Download } from "./download";

let REFILTER_COUNT = 50;

function queuedFilter(d: Download) {
  return d.state === QUEUED && !d.removed;
}

export class Scheduler {
  private runCount: number;

  private readonly queue: Download[];

  constructor(queue: Download[]) {
    this.queue = Array.from(queue).filter(queuedFilter);
    this.runCount = 0;
  }

  async next(running: Iterable<Download>) {
    if (!this.queue.length) {
      return null;
    }

    if (this.runCount > REFILTER_COUNT) {
      filterInSitu(this.queue, queuedFilter);
      if (!this.queue.length) {
        return null;
      }
    }

    let hosts = Object.create(null);
    for (let d of running) {
      let {domain} = d.uURL;
      if (domain in hosts) {
        hosts[domain]++;
      }
      else {
        hosts[domain] = 1;
      }
    }

    await Limits.load();
    for (let d of this.queue) {
      if (d.state !== QUEUED || d.removed) {
        continue;
      }
      let {domain} = d.uURL;
      let limit = Limits.getConcurrentFor(domain);
      let cur = hosts[domain] || 0;
      if (limit <= cur) {
        continue;
      }
      this.runCount++;
      return d;
    }
    return null;
  }

  destroy() {
    this.queue.length = 0;
  }
}
