"use strict";
// License: MIT

export let QUEUED = 1 << 0;
export let RUNNING = 1 << 1;
export let FINISHING = 1 << 2;
export let PAUSED = 1 << 3;
export let DONE = 1 << 4;
export let CANCELED = 1 << 5;
export let MISSING = 1 << 6;
export let RETRYING = 1 << 7;

export let RESUMABLE = PAUSED | CANCELED | RETRYING;
export let FORCABLE = PAUSED | QUEUED | CANCELED | RETRYING;
export let PAUSEABLE = QUEUED | CANCELED | RUNNING | RETRYING;
export let CANCELABLE = QUEUED | RUNNING | PAUSED | DONE | MISSING | RETRYING;
