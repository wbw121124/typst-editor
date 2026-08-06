#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DOWNLOAD_DIR = path.join(__dirname, '..', 'packages', '@preview');
const INDEX_URL = 'https://packages.typst.org/preview/index.json';
const CDN_URL = 'https://packages.typst.org/preview/';

// --all 时下载每个包的全部历史版本，默认只下载最新版
const ALL_VERSIONS = process.argv.includes('--all');

// 目标包列表（传递依赖会自动解析并补全）
const TARGET_PACKAGES = [
  // 绘图/图表
  'cetz', 'fletcher', 'lilaq', 'quill',
  // 化学/物理
  'alchemist', 'physica',
  // 幻灯片
  'touying', 'polylux',
  // 学术工具
  'equate', 'glossarium', 'hydra', 'unify', 'showybox',
  // 表格/排版
  'pavemat', 'zebraw', 'zero',
  // 随机数/工具
  'suiji', 'tidy', 'wordometer',
  // 甘特图/时间线
  'timeliney',
  // 盒子/装饰
  'umbra', 'frame-it',
  // 中文
  'easy-pinyin', 'kouhu',
  // 其他
  'pinit', 'meander', 'lovelace', 'drafting',
  'wrap-it', 'stack-pointer', 'syntree',
  // 模板默认内容依赖
  'cuti',
  // 常用伴生包（历史上已在镜像中）
  'bulb', 'cheq', 'codly',
];

function log(color, text) {
  console.log(`\x1b[${color}m${text}\x1b[0m`);
}

function compareVersions(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function readTarStr(buf, start, length) {
  let end = start;
  while (end < start + length && buf[end]) end++;
  return buf.subarray(start, end).toString('utf8');
}

// 从 tar.gz 二进制中提取 typst.toml 内容
function readTypstToml(buffer) {
  let data;
  try {
    data = zlib.gunzipSync(buffer);
  } catch {
    return null;
  }
  let offset = 0;
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    const name = readTarStr(header, 0, 100);
    if (!name) break;
    const size = parseInt(readTarStr(header, 124, 12).trim() || '0', 8);
    if (name === 'typst.toml' || name.endsWith('/typst.toml')) {
      return data.subarray(offset + 512, offset + 512 + size).toString('utf8');
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}

// 解析 typst.toml 的 [dependencies] 段，仅取版本为字符串的包依赖
function parseDependencies(toml) {
  const result = {};
  if (!toml) return result;
  const match = toml.match(/^\[dependencies\]\s*$/m);
  if (!match) return result;
  const rest = toml.slice(match.index + match[0].length);
  const nextSection = rest.search(/^\s*\[/m);
  const body = nextSection === -1 ? rest : rest.slice(0, nextSection);
  const lineRe = /^\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"\s*$/gm;
  let line;
  while ((line = lineRe.exec(body))) {
    result[line[1]] = line[2];
  }
  return result;
}

async function fetchIndex() {
  console.log('=== 正在下载官方索引文件... ===');
  try {
    const res = await fetch(INDEX_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    log('32', '[INFO] 索引下载完成，正在解析...');
    return data;
  } catch (err) {
    log('31', `[ERROR] 索引下载失败: ${err.message}`);
    process.exit(1);
  }
}

async function downloadFile(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
  return buffer;
}

function collectVersions(allPackages, pkgName) {
  return [
    ...new Set(
      allPackages
        .filter((p) => p.name === pkgName)
        .map((p) => p.version)
    ),
  ].sort(compareVersions);
}

async function main() {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  const allPackages = await fetchIndex();
  let totalDownloaded = 0;
  let totalSkipped = 0;
  const seen = new Set();
  const queue = [...TARGET_PACKAGES];

  while (queue.length > 0) {
    const pkgName = queue.shift();
    if (seen.has(pkgName)) continue;
    seen.add(pkgName);

    const versions = collectVersions(allPackages, pkgName);
    if (versions.length === 0) {
      log('33', `[WARN] 索引中未找到包: ${pkgName}`);
      continue;
    }

    const latest = versions[versions.length - 1];
    const chosen = ALL_VERSIONS ? versions : [latest];
    console.log(`\n[INFO] 处理包: ${pkgName} (${chosen.length}/${versions.length} 个版本)`);

    for (const ver of chosen) {
      const fileName = `${pkgName}-${ver}.tar.gz`;
      const filePath = path.join(DOWNLOAD_DIR, fileName);

      let buffer = null;
      if (fs.existsSync(filePath)) {
        totalSkipped++;
      } else {
        const cdnUrl = CDN_URL + fileName;
        try {
          buffer = await downloadFile(cdnUrl, filePath);
          totalDownloaded++;
          log('32', `  [INFO] ${fileName}`);
        } catch (err) {
          log('31', `  [WARN] 下载失败: ${fileName} (${err.message})`);
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      // 仅解析最新版的依赖并递归补全
      if (ver === latest) {
        if (!buffer) {
          try {
            buffer = fs.readFileSync(filePath);
          } catch {
            continue;
          }
        }
        const deps = parseDependencies(readTypstToml(buffer));
        for (const depName of Object.keys(deps)) {
          if (!seen.has(depName)) queue.push(depName);
        }
      }
    }
  }

  console.log('\n[SUCCEED] 全部完成！');
  console.log(`[NEW] 新下载: ${totalDownloaded}`);
  console.log(`[SKIPED] 已跳过: ${totalSkipped}`);
  console.log(`[SAVED] 保存位置: ${DOWNLOAD_DIR}`);
}

main();
