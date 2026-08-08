// Math.sumPrecise polyfill — pdf.js 6.3.49 requires this API (Chrome 130+),
// older browsers crash font decoding without it, causing wrong fonts in PDF preview.
// This shim runs in the PDF.js worker thread (loaded via worker-src).
if (typeof Math.sumPrecise !== "function") {
  Math.sumPrecise = function (items) {
    let sum = 0.0, c = 0.0;
    for (const x of items) {
      const y = x - c;
      const t = sum + y;
      c = t - sum - y;
      sum = t;
    }
    return sum;
  };
}

// Uint8Array.prototype.toHex polyfill — pdf.js 6.3.49 relies on this ES2025 API
// (Chromium 131+). Older Chromium (e.g. Electron 33) crashes fingerprinting with
// "hashOriginal.toHex is not a function" without it.
if (typeof Uint8Array.prototype.toHex !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    value: function toHex() {
      let s = "";
      for (let i = 0; i < this.length; i++) s += this[i].toString(16).padStart(2, "0");
      return s;
    },
    writable: true,
    configurable: true,
  });
}

await import("/pdf.js-element/pdf.worker.mjs");
