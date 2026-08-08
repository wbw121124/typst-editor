export async function fetchFiles() {
  const res = await fetch('/api/files');
  if (!res.ok) throw new Error(`获取文件列表失败 (${res.status})`);
  return res.json();
}

export async function fetchFile(filePath) {
  const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
  if (res.status === 404) throw new Error(`文件不存在: ${filePath}`);
  if (!res.ok) throw new Error(`读取文件失败 (${res.status}): ${filePath}`);
  return res.json();
}

export async function writeFile(filePath, content) {
  const res = await fetch('/api/file', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, content }),
  });
  if (!res.ok) {
    let msg = `保存失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg += `: ${data.error}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function deleteFileApi(filePath) {
  const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
  if (!res.ok) {
    let msg = `删除失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg += `: ${data.error}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function moveFileApi(from, to) {
  const res = await fetch('/api/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) {
    let msg = `移动/重命名失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg += `: ${data.error}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function createDirApi(dirPath) {
  const res = await fetch('/api/dir', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath }),
  });
  if (!res.ok) {
    let msg = `创建目录失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg += `: ${data.error}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function deleteDirApi(dirPath) {
  const res = await fetch(`/api/dir?path=${encodeURIComponent(dirPath)}`, { method: 'DELETE' });
  if (!res.ok) {
    let msg = `删除目录失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg += `: ${data.error}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function searchFiles(query) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`搜索失败 (${res.status})`);
  return res.json();
}

export async function fetchHistory(filePath) {
  const res = await fetch(`/api/history?path=${encodeURIComponent(filePath)}`);
  if (!res.ok) throw new Error(`获取历史失败 (${res.status})`);
  return res.json();
}

export async function fetchHistorySnapshot(id) {
  const res = await fetch(`/api/history/snapshot?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`读取历史快照失败 (${res.status})`);
  return res.json();
}

export async function saveHistorySnapshot(filePath, content) {
  const res = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });
  if (!res.ok) {
    let msg = `保存历史快照失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg += `: ${data.error}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function deleteHistorySnapshot(id) {
  const res = await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除历史快照失败 (${res.status})`);
  return res.json();
}

export async function fetchDraft(filePath) {
  const res = await fetch(`/api/draft?path=${encodeURIComponent(filePath)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`读取草稿失败 (${res.status})`);
  return res.json();
}

export async function saveDraft(filePath, content) {
  const res = await fetch('/api/draft', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });
  if (!res.ok) throw new Error(`保存草稿失败 (${res.status})`);
  return res.json();
}

export async function deleteDraft(filePath) {
  const res = await fetch(`/api/draft?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除草稿失败 (${res.status})`);
  return res.json();
}

export async function fileExists(filePath) {
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
    return res.status !== 404;
  } catch {
    // 网络/服务器异常时保守处理：视为存在，避免覆盖已有文件
    return true;
  }
}
