import { searchFiles } from './file-api.js';
import { openFile } from './editor-core.js';
import { showToast } from './preview.js';
import { session } from './state.js';

let searchTimer = null;
let searchSeq = 0;

export function setupSearchPanel() {
  const input = document.getElementById('search-input');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    searchTimer = setTimeout(() => {
      runSearch(q);
    }, 300);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimer);
      runSearch(input.value.trim());
    }
    if (e.key === 'Escape') {
      input.blur();
    }
  });
}

async function runSearch(q) {
  const resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;
  if (!q) {
    resultsEl.innerHTML = '<div class="search-empty">输入关键字搜索工作区 (.typ)</div>';
    return;
  }
  const seq = ++searchSeq;
  resultsEl.innerHTML = '<div class="search-empty">搜索中...</div>';
  try {
    const results = await searchFiles(q);
    if (seq !== searchSeq) return;
    if (!results || results.length === 0) {
      resultsEl.innerHTML = '<div class="search-empty">无结果</div>';
      return;
    }
    resultsEl.innerHTML = '';
    for (const r of results) {
      const el = document.createElement('div');
      el.className = 'search-result';
      const loc = document.createElement('div');
      loc.className = 'search-loc';
      loc.textContent = `${r.path}:${r.line}:${r.col}`;
      const preview = document.createElement('div');
      preview.className = 'search-preview';
      preview.textContent = r.preview || '';
      el.appendChild(loc);
      el.appendChild(preview);
      el.addEventListener('click', async () => {
        await openFile(r.path);
        if (session.editor) {
          const pos = { lineNumber: r.line, column: Math.max(1, r.col) };
          session.editor.revealPositionInCenter(pos);
          session.editor.setPosition(pos);
          session.editor.focus();
        }
      });
      resultsEl.appendChild(el);
    }
  } catch (err) {
    if (seq !== searchSeq) return;
    resultsEl.innerHTML = `<div class="search-empty">搜索失败: ${err.message}</div>`;
    showToast(`搜索失败: ${err.message}`);
  }
}

export function focusSearch() {
  const input = document.getElementById('search-input');
  if (input) {
    const panel = document.getElementById('panel-search');
    if (panel) {
      document.querySelectorAll('.sidebar-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.panel === 'search');
      });
      document.querySelectorAll('.sidebar-panel').forEach((p) => {
        p.classList.toggle('active', p.id === 'panel-search');
      });
    }
    input.focus();
    input.select();
  }
}
