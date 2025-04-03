"use strict";
// License: MIT

import { TYPE_LINK, TYPE_MEDIA } from "./constants";
import { filters } from "./filters";
import { Prefs } from "./prefs";
// eslint-disable-next-line no-unused-vars
import { Item, makeUniqueItems, BaseItem } from "./item";
import { getManager } from "./manager/man";
import { select } from "./select";
import { single } from "./single";
import { Notification } from "./notifications";
import { MASK, FASTFILTER, SUBFOLDER } from "./recentlist";
import { openManager } from "./windowutils";
import { _ } from "./i18n";

var MAX_BATCH = 10000;

export interface QueueOptions {
  mask?: string;
  subfolder?: string;
  paused?: boolean;
}

export var API = new class APIImpl {
  async filter(arr: BaseItem[], type: number) {
    return await (await filters()).filterItemsByType(arr, type);
  }

  async queue(items: BaseItem[], options: QueueOptions) {
    await Promise.all([MASK.init(), SUBFOLDER.init()]);
    var {mask = MASK.current} = options;
    var {subfolder = SUBFOLDER.current} = options;

    var {paused = false} = options;

    let currentBatch = parseInt(await Prefs.get("currentBatch", 0), 10) || 0;
    if (!isFinite(currentBatch) || ++currentBatch >= MAX_BATCH) {
      currentBatch = 1;
    }

    var defaults: any = {
      _idx: 0,
      get idx() {
        return ++this._idx;
      },
      referrer: null,
      usableReferrer: null,
      fileName: null,
      title: "",
      description: "",
      startDate: new Date(),
      private: false,
      postData: null,
      mask,
      subfolder,
      date: Date.now(),
      batch: currentBatch,
      paused
    };
    items = items.map(i => {
      delete i.idx;
      return new Item(i, defaults);
    });
    if (!items) {
      return;
    }

    await Prefs.set("currentBatch", currentBatch);
    await Prefs.save();

    var manager = await getManager();
    await manager.addNewDownloads(items);
    if (await Prefs.get("queue-notification")) {
      if (items.length === 1) {
        new Notification(null, _("queued-download"));
      }
      else {
        new Notification(null, _("queued-downloads", items.length));
      }
    }
    if (await Prefs.get("open-manager-on-queue")) {
      await openManager(false);
    }
  }

  sanity(links: BaseItem[], media: BaseItem[]) {
    if (!links.length && !media.length) {
      new Notification(null, _("no-links"));
      return false;
    }
    return true;
  }

  async turbo(links: BaseItem[], media: BaseItem[]) {
    if (!this.sanity(links, media)) {
      return false;
    }
    var type = await Prefs.get("last-type", "links");
    var items = await (async () => {
      if (type === "links") {
        return await API.filter(links, TYPE_LINK);
      }
      return await API.filter(media, TYPE_MEDIA);
    })();
    var selected = makeUniqueItems([items]);
    if (!selected.length) {
      return await this.regular(links, media);
    }
    return await this.queue(selected, {paused: await Prefs.get("add-paused")});
  }

  async regularInternal(selected: BaseItem[], options: any) {
    if (options.mask && !options.maskOnce) {
      await MASK.init();
      await MASK.push(options.mask);
    }
    if (typeof options.fast === "string" && !options.fastOnce) {
      await FASTFILTER.init();
      await FASTFILTER.push(options.fast);
    }
    if (typeof options.subfolder === "string" && !options.subfolderOnce) {
      await SUBFOLDER.init();
      await SUBFOLDER.push(options.subfolder);
    }
    if (typeof options.type === "string") {
      await Prefs.set("last-type", options.type);
    }
    return await this.queue(selected, options);
  }

  async regular(links: BaseItem[], media: BaseItem[]) {
    if (!this.sanity(links, media)) {
      return false;
    }
    var {items, options} = await select(links, media);
    return this.regularInternal(items, options);
  }

  async singleTurbo(item: BaseItem) {
    return await this.queue([item], {paused: await Prefs.get("add-paused")});
  }

  async singleRegular(item: BaseItem | null) {
    var {items, options} = await single(item);
    return this.regularInternal(items, options);
  }
}();
