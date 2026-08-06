export async function fetchFiles() {
  const res = await fetch('/api/files');
  return res.json();
}

export async function fetchFile(filePath) {
  const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
  return res.json();
}

export async function writeFile(filePath, content) {
  await fetch('/api/file', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, content }),
  });
}

export async function deleteFileApi(filePath) {
  await fetch(`/api/file?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
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
