export function parseRange(rangeStr) {
  const m = /^(.+):(\d+):(\d+)(?:-(\d+):(\d+))?$/.exec(rangeStr || '');
  if (!m) return null;
  return {
    path: m[1],
    line: Number(m[2]),
    col: Number(m[3]),
    endLine: m[4] ? Number(m[4]) : null,
    endCol: m[5] ? Number(m[5]) : null,
  };
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
