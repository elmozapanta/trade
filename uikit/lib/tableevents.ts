"use strict";

// License: MIT

import { BaseTable } from "./basetable";
/* eslint-disable no-unused-vars */
import { SelectionRange } from "./selection";
import { Column } from "./column";
/* eslint-enable no-unused-vars */
import {debounce} from "./util";
import {Row} from "./row";
import {APOOL} from "./animationpool";
import {COLS, ROWCACHE, VISIBLE} from "./tablesymbols";
import {ContextMenu, MenuItem} from "./contextmenu";
// eslint-disable-next-line no-unused-vars
import { TableConfig } from "./config";

var RESIZE_DEBOUNCE = 500;
var SCROLL_DEBOUNCE = 250;

export class TableEvents extends BaseTable {
  private oldVisibleTop: number;

  constructor(elem: any, config: TableConfig | null, version?: number) {
    super(elem, config, version);
    var {selection} = this;
    selection.on("selection-added", this.selectionAdded.bind(this));
    selection.on("selection-deleted", this.selectionDeleted.bind(this));
    selection.on("selection-toggled", this.selectionToggled.bind(this));
    selection.on("selection-cleared", this.selectionCleared.bind(this));

    /* Hook up some events */
    addEventListener(
      "resize", debounce(this.resized.bind(this), RESIZE_DEBOUNCE));

    var {body, table, selectionGrippy} = this;
    body.addEventListener("change", this.changed.bind(this), false);
    body.addEventListener("click", this.clicked.bind(this), true);
    body.addEventListener("click", this.preventMouse.bind(this), false);
    body.addEventListener("dblclick", this.dblclicked.bind(this), true);
    body.addEventListener("dblclick", this.prevent.bind(this), true);
    body.addEventListener("mousedown", this.preventMouse.bind(this), true);
    body.addEventListener("mouseup", this.preventMouse.bind(this), true);
    body.addEventListener(
      "scroll", debounce(this.scrolled.bind(this), SCROLL_DEBOUNCE), {
        passive: true
      });
    body.addEventListener("contextmenu", this.contextmenu.bind(this), true);

    table.addEventListener("keypress", this.keypressed.bind(this), true);
    table.addEventListener("keydown", this.keypressed.bind(this), true);

    selectionGrippy.addEventListener("click", this.grippyClicked.bind(this));
  }

  selectionAdded(range: SelectionRange) {
    for (var rowid of range) {
      var row = this.getRow(rowid);
      if (!row) {
        continue;
      }
      row.selected(true);
    }
    this.emit("selection-changed", this);
  }

  selectionDeleted(range: SelectionRange) {
    for (var rowid of range) {
      var row = this.getRow(rowid);
      if (!row) {
        continue;
      }
      row.selected(false);
    }
    this.emit("selection-changed", this);
  }

  selectionToggled(range: SelectionRange) {
    for (var rowid of range) {
      var row = this.getRow(rowid);
      if (!row) {
        continue;
      }
      row.selected(this.selection.contains(rowid));
    }
    this.emit("selection-changed");
  }

  selectionCleared() {
    for (var row of this[VISIBLE].values()) {
      row.selected(false);
    }
    for (var row of this[ROWCACHE].values()) {
      row.selected(false);
    }
    this.emit("selection-changed");
  }

  preventMouse(evt: MouseEvent) {
    if (evt.shiftKey || evt.metaKey || evt.ctrlKey) {
      evt.preventDefault();
    }
  }

  prevent(evt: Event) {
    evt.preventDefault();
    return false;
  }

  reemit(evt: Event) {
    if (this.emit(evt.type, this, evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    }
    return true;
  }

  dblclicked(evt: MouseEvent) {
    if (this.isCheckClick(evt)) {
      return null;
    }
    return this.reemit(evt);
  }

  _findRow(evt: Event) {
    let t = evt.target as HTMLElement;
    while (t) {
      if (t.localName === "td") {
        break;
      }
      if (!t.parentElement) {
        break;
      }
      t = t.parentElement;
    }
    var row = Row.getRowFor(t);
    return row;
  }

  clicked(evt: MouseEvent) {
    if (this.isCheckClick(evt)) {
      return null;
    }
    var row = this._findRow(evt);
    if (!row) {
      return null;
    }
    if (!this.singleSelect) {
      this.selectTo(row.rowid, evt);
    }
    else {
      this.moveTo(row.rowid, evt);
    }

    evt.preventDefault();
    evt.stopPropagation();
    return false;
  }

  grippyClicked(evt: MouseEvent) {
    var cols = this[COLS].cols.filter((col: Column) => col.canHide);
    if (!cols.length) {
      return undefined;
    }

    evt.preventDefault();
    evt.stopPropagation();

    var ctx = new ContextMenu();
    for (var col of cols) {
      var id = `grippy-menu-${col.elem.id}`;
      var item = new MenuItem(
        ctx,
        id,
        col.spanElem.textContent || "",
        {autoHide: "false"});
      ctx.add(item);
      item.iconElem.textContent = col.visible ? "✓" : " ";
      ctx.on(id, async () => {
        col.visible = !col.visible;
        item.iconElem.textContent = col.visible ? "✓" : " ";
        this[COLS].computeVisible();
        await this[COLS].reflow();
        this.invalidate();
        APOOL.schedule(this, this.emit, "config-changed", this);
      });
    }
    ctx.on("dismissed", () => {
      ctx.destroy();
    });
    ctx.show(evt);
    return false;
  }

  contextmenu(evt: MouseEvent) {
    var row = this._findRow(evt);
    if (row && !this.selection.contains(row.rowid)) {
      if (!this.singleSelect) {
        this.selectTo(row.rowid, evt);
      }
      else {
        this.moveTo(row.rowid, evt);
      }
    }
    return this.reemit(evt);
  }

  keypressed(evt: KeyboardEvent) {
    if (this.emit(`${evt.key}-keypress`, this, evt)) {
      evt.preventDefault();
      return null;
    }
    switch (evt.key) {
    case "ArrowUp":
      this.navigateUp(evt);
      break;

    case "ArrowDown":
      this.navigateDown(evt);
      break;

    case "Home":
      this.navigateTop(evt);
      break;

    case "End":
      this.navigateBottom(evt);
      break;

    case "PageUp":
      this.navigatePageUp(evt);
      break;

    case "PageDown":
      this.navigatePageDown(evt);
      break;

    case " ":
      this.toggleCurrent();
      break;
    default:
      return null;
    }
    evt.preventDefault();
    return false;
  }

  changed(evt: Event) {
    var t = evt.target as HTMLElement;
    if (t.classList.contains("virtualtable-check-box")) {
      var p1 = t.parentElement;
      var p2 = p1 && p1.parentElement;
      var cell = p2 && p2.parentElement;
      if (!cell) {
        return;
      }
      var row = Row.getRowFor(cell);
      var {col} = cell.dataset;
      if (!row || !col) {
        return;
      }
      row.processCheckEvent(parseInt(col, 10), evt);
    }
  }

  resized() {
    this[COLS].resized();
    this[VISIBLE];
    this.setWidths();
    this.update();
    APOOL.schedule(this, this.emit, "resized", this);
    APOOL.schedule(this, this.emit, "config-changed", this);
  }

  scrolled() {
    if (this.visibleTop === this.oldVisibleTop) {
      return;
    }
    this.oldVisibleTop = this.visibleTop;
    this.update();
  }
}
