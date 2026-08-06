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

await import("/pdf.js-element/pdf.worker.mjs");
