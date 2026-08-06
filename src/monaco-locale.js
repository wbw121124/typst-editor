import zhCnRaw from '../node_modules/monaco-editor/dev/vs/nls.messages.zh-cn.js?raw';

const match = zhCnRaw.match(
  /globalThis\._VSCODE_NLS_MESSAGES = (\[[\s\S]*\])\s*;\s*globalThis\._VSCODE_NLS_LANGUAGE = "([^"]+)";/
);
if (match) {
  globalThis._VSCODE_NLS_MESSAGES = new Function('return ' + match[1])();
  globalThis._VSCODE_NLS_LANGUAGE = match[2];
}
