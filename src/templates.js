import { writeFile } from './file-api.js';
import { openFile } from './editor-core.js';
import { session } from './state.js';
import { showToast } from './preview.js';
import { showPrompt } from './ui.js';

export async function openTemplateMenu() {
  const modal = document.getElementById('template-modal');
  if (!modal) return;
  const list = document.getElementById('template-list');
  if (!list) return;
  list.innerHTML = '<div class="template-empty">加载中...</div>';
  modal.classList.remove('hidden');
  try {
    const res = await fetch('/templates/index.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const templates = await res.json();
    list.innerHTML = '';
    for (const t of templates) {
      const el = document.createElement('div');
      el.className = 'template-item';
      const name = document.createElement('div');
      name.className = 'template-name';
      name.textContent = t.name;
      const desc = document.createElement('div');
      desc.className = 'template-desc';
      desc.textContent = t.description;
      el.appendChild(name);
      el.appendChild(desc);
      el.addEventListener('click', async () => {
        await createFromTemplate(t);
        closeTemplateMenu();
      });
      list.appendChild(el);
    }
  } catch (err) {
    list.innerHTML = `<div class="template-empty">加载模板失败: ${err.message}</div>`;
  }
}

export function closeTemplateMenu() {
  const modal = document.getElementById('template-modal');
  if (modal) modal.classList.add('hidden');
}

async function createFromTemplate(t) {
  try {
    const res = await fetch(t.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const content = await res.text();
    const fileName = t.filename || 'untitled.typ';
    let name = await showPrompt(`从模板创建文件 (${t.name})`, fileName);
    if (!name) return;
    if (!name.endsWith('.typ')) name += '.typ';
    await writeFile(name, content);
    session.fileCache[name] = content;
    await openFile(name);
    showToast(`已从模板创建 ${name}`);
  } catch (err) {
    showToast(`创建失败: ${err.message}`);
  }
}

export function setupTemplateUI() {
  const btn = document.getElementById('btn-templates');
  if (btn) btn.addEventListener('click', openTemplateMenu);
  const closeBtn = document.getElementById('template-close');
  if (closeBtn) closeBtn.addEventListener('click', closeTemplateMenu);
  const modal = document.getElementById('template-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeTemplateMenu();
    });
  }
}
