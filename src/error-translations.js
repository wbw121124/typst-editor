// Typst 编译错误消息中文翻译（正则规则匹配）
// 规则顺序：特例在前，通用在后；第一条匹配生效。
// 未匹配的消息原样返回。

const RULES = [
  // ===== 包 / 文件 / 模块加载 =====
  [/^package not found \(searched for `?([^`)]+)`?\)$/, (m) => `找不到包（已搜索：\`${m[1]}\`）`],
  [/^failed to load file \(access denied\)$/, () => '无法加载文件（访问被拒绝，可能超出了工作区根目录）'],
  [/^failed to load file \(not found\)$/, () => '无法加载文件（文件不存在）'],
  [/^failed to load file \(unknown file type\)$/, () => '无法加载文件（未知的文件类型）'],
  [/^failed to load file \(path is a directory\)$/, () => '无法加载文件（路径是一个目录）'],
  [/^failed to load file \(cyclic import\)$/, () => '无法加载文件（存在循环引用）'],
  [/^failed to load file \(([^)]+)\)$/, (m) => `无法加载文件（${m[1]}）`],
  [/^failed to access file \(([^)]+)\)$/, (m) => `无法访问文件（${m[1]}）`],
  [/^cannot find module `([^`]+)`$/, (m) => `找不到模块：\`${m[1]}\``],
  [/^unresolved import(?: of `?([^`]+)`?|: `?([^`]+)`?)?$/, (m) => {
    const name = m[1] || m[2];
    return name ? `无法解析的导入：\`${name}\`` : '无法解析的导入';
  }],
  [/^ambiguous module name: `?([^`]+)`?$/, (m) => `模块名存在歧义：\`${m[1]}\``],
  [/^cyclic module imports$/, () => '模块存在循环引用'],

  // ===== 语法错误 =====
  [/^unclosed code block$/, () => '代码块未闭合（缺少结尾）'],
  [/^unclosed string$/, () => '字符串未闭合（缺少引号）'],
  [/^unclosed comment$/, () => '注释未闭合（缺少结束标记）'],
  [/^unclosed delimiter `([^`]+)`$/, (m) => `定界符 \`${m[1]}\` 未闭合`],
  [/^unclosed delimiter$/, () => '定界符未闭合'],
  [/^unclosed block$/, () => '代码块未闭合'],
  [/^unexpected end of file$/, () => '文件意外结束（可能缺少闭合符号）'],
  [/^unexpected token: `([^`]+)`$/, (m) => `意外的记号：\`${m[1]}\``],
  [/^expected token: `([^`]+)`$/, (m) => `期望记号：\`${m[1]}\``],
  [/^unexpected opening bracket$/, () => '意外的左方括号 ['],
  [/^unexpected closing bracket$/, () => '意外的右方括号 ]'],
  [/^unexpected float$/, () => '意外的浮点数'],
  [/^unexpected number$/, () => '意外的数字'],
  [/^unexpected `([^`]+)`$/, (m) => `意外出现：\`${m[1]}\``],
  [/^expected `([^`]+)`, found `([^`]+)`$/, (m) => `期望 \`${m[1]}\`，但找到 \`${m[2]}\``],
  [/^expected closing `([^`]+)`$/, (m) => `期望闭合的 \`${m[1]}\``],
  [/^expected `([^`]+)`$/, (m) => `期望：\`${m[1]}\``],
  [/^expected comma, found `([^`]+)`$/, (m) => `期望逗号，但找到 \`${m[1]}\``],
  [/^expected comma$/, () => '期望逗号'],
  [/^expected semicolon or line break, found `?([^`]+)`?$/, (m) => `期望分号或换行符，但找到 \`${m[1]}\``],
  [/^expected semicolon or line break$/, () => '期望分号或换行符'],
  [/^expected pattern$/, () => '期望匹配模式'],
  [/^expected identifier$/, () => '期望标识符'],
  [/^expected block$/, () => '期望代码块'],
  [/^expected expression$/, () => '期望表达式'],
  [/^expected string, dictionary, location, or label, found `?([^`]+)`?$/, (m) => `期望字符串、字典、位置或标签，但找到 \`${m[1]}\``],
  [/^the character `?([^`]+)`? is not valid in code$/, (m) => `字符 \`${m[1]}\` 在代码中无效`],
  [/^missing comma$/, () => '缺少逗号'],
  [/^missing `([^`]+)`$/, (m) => `缺少：\`${m[1]}\``],
  [/^mismatched delimiters `([^`]+)` and `([^`]+)`$/, (m) => `定界符 \`${m[1]}\` 与 \`${m[2]}\` 不匹配`],
  [/^invalid number$/, () => '无效的数字'],
  [/^invalid number suffix: `?([^`]+)`?$/, (m) => `无效的数字后缀：\`${m[1]}\``],
  [/^unexpected comma$/, () => '意外的逗号'],
  [/^unexpected comma, found `?([^`]+)`?$/, (m) => `意外的逗号，但找到 \`${m[1]}\``],

  // ===== 变量 / 函数 / 常量 =====
  [/^unknown variable: `?([^`]+)`?$/, (m) => `未知变量：\`${m[1]}\``],
  [/^unknown function: `?([^`]+)`?$/, (m) => `未知函数：\`${m[1]}\``],
  [/^unknown constant: `?([^`]+)`?$/, (m) => `未知常量：\`${m[1]}\``],
  [/^undefined variable: `?([^`]+)`?$/, (m) => `未定义的变量：\`${m[1]}\``],
  [/^shadowed variable: `?([^`]+)`?$/, (m) => `变量 \`${m[1]}\` 被遮蔽（重复定义）`],
  [/^unknown `([^`]+)`: `([^`]+)`$/, (m) => `未知的 \`${m[1]}\`：\`${m[2]}\``],

  // ===== 参数 =====
  [/^unexpected argument: `?([^`]+)`?$/, (m) => `意外的参数：\`${m[1]}\``],
  [/^unexpected parameter: `?([^`]+)`?$/, (m) => `意外的参数：\`${m[1]}\``],
  [/^missing required argument: `?([^`]+)`?$/, (m) => `缺少必需参数：\`${m[1]}\``],
  [/^missing required parameter: `?([^`]+)`?$/, (m) => `缺少必需参数：\`${m[1]}\``],
  [/^too many positional arguments$/, () => '位置参数过多'],
  [/^too many named arguments$/, () => '命名参数过多'],
  [/^too many arguments$/, () => '参数过多'],
  [/^too few arguments$/, () => '参数不足'],

  // ===== 类型 =====
  [/^type mismatch: expected `?([^`]+)`?, found `?([^`]+)`?$/, (m) => `类型不匹配：期望 \`${m[1]}\`，但找到 \`${m[2]}\``],
  [/^cannot convert `?([^`]+)`? to `?([^`]+)`?$/, (m) => `无法将 \`${m[1]}\` 转换为 \`${m[2]}\``],
  [/^cannot convert to `?([^`]+)`?$/, (m) => `无法转换为：\`${m[1]}\``],
  [/^cannot index into `?([^`]+)`? with `?([^`]+)`?$/, (m) => `无法用 \`${m[2]}\` 索引 \`${m[1]}\``],
  [/^cannot index into `?([^`]+)`?$/, (m) => `无法索引：\`${m[1]}\``],
  [/^cannot call value of type `?([^`]+)`?$/, (m) => `无法调用类型为 \`${m[1]}\` 的值`],
  [/^cannot use value of type `?([^`]+)`? here$/, (m) => `此处无法使用类型为 \`${m[1]}\` 的值`],
  [/^cannot access field `?([^`]+)`? on type `?([^`]+)`?$/, (m) => `无法访问类型 \`${m[2]}\` 的字段 \`${m[1]}\``],
  [/^type `?([^`]+)`? does not have field `?([^`]+)`?$/, (m) => `类型 \`${m[1]}\` 没有字段 \`${m[2]}\``],
  [/^field `?([^`]+)`? does not exist$/, (m) => `字段 \`${m[1]}\` 不存在`],

  // ===== 其他 =====
  [/^deprecated: `?([^`]+)`?$/, (m) => `已弃用：\`${m[1]}\``],
  [/^syntax error$/, () => '语法错误'],
];

/**
 * 翻译一条 hint 消息（`hints:` 后面的内容）。
 * @param {string} hint
 * @returns {string}
 */
export function translateHint(hint) {
  if (typeof hint !== 'string') return hint;
  const trimmed = hint.trim();
  if (/^try using a backslash escape: (.+)$/.test(trimmed)) {
    return '尝试使用反斜杠转义：' + trimmed.replace(/^try using a backslash escape: /, '');
  }
  if (/^try adding a `?([^`]+)`?/.test(trimmed)) {
    return '尝试添加：' + trimmed.replace(/^try adding a /, '');
  }
  if (/^try closing the `?([^`]+)`?/.test(trimmed)) {
    return '尝试闭合：' + trimmed.replace(/^try closing the /, '');
  }
  return hint;
}

/**
 * 翻译一条 Typst 错误消息；未匹配时原样返回。
 * 消息中的 `, hints: ...` 后缀会被拆分翻译后拼接回来。
 * @param {string} message
 * @returns {string}
 */
export function translateMessage(message) {
  if (typeof message !== 'string') return message;
  const trimmed = message.trim();

  let body = trimmed;
  let hintText = null;
  const hintMatch = /,\s*hints:\s*(.+)$/.exec(trimmed);
  if (hintMatch) {
    body = trimmed.slice(0, hintMatch.index);
    hintText = hintMatch[1]
      .split('|')
      .map((h) => translateHint(h))
      .join('；');
  }

  for (const [re, fn] of RULES) {
    const m = re.exec(body);
    if (m) {
      const translated = fn(m);
      return hintText ? `${translated}（提示：${hintText}）` : translated;
    }
  }
  return message;
}
