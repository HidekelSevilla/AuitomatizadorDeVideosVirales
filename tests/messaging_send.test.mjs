import assert from "node:assert/strict";

let calls = 0;
globalThis.chrome = {
  runtime: {
    lastError: null,
    sendMessage(_message, callback) {
      calls++;
      if (calls === 1) {
        this.lastError = { message: "Receiving end does not exist" };
        callback(undefined);
        this.lastError = null;
        return;
      }
      callback({ ok: true, attempt: calls });
    },
  },
};

const { send } = await import("../lib/messaging.js");
const recovered = await send({ type: "cmd:pause" });
assert.deepEqual(recovered, { ok: true, attempt: 2 });
assert.equal(calls, 2, "debe reintentar cuando el worker aun no tenia receptor");

calls = 0;
chrome.runtime.sendMessage = function (_message, callback) {
  calls++;
  this.lastError = { message: "The message port closed before a response was received" };
  callback(undefined);
  this.lastError = null;
};
const ambiguous = await send({ type: "cmd:run_all" });
assert.equal(ambiguous, null);
assert.equal(calls, 1, "no debe duplicar comandos si pudieron haberse entregado");

console.log("OK: mensajeria recupera worker ausente sin duplicar comandos ambiguos");
