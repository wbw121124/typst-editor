export function registerTypstLanguage(monaco) {
  monaco.languages.register({ id: 'typst' });
  monaco.languages.setLanguageConfiguration('typst', {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: '`', close: '`' },
      { open: '$', close: '$' },
      { open: '/*', close: '*/' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: '`', close: '`' },
      { open: '*', close: '*' },
      { open: '_', close: '_' },
      { open: '$', close: '$' },
    ],
    folding: {
      markers: {
        start: /^\s*(=|==|===|====|=====|======)\s/,
        end: /^\s*(=|==|===|====|=====|======)\s/,
      },
    },
    wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\<\>\/\?\s]+)/g,
  });
}

export function registerTypstSnippets(monaco) {
  monaco.languages.registerCompletionItemProvider('typst', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };

      const snippets = [
        // 页面与文档
        { label: 'page', insertText: '#set page(paper: "${1:a4}", margin: (x: ${2:2.5cm}, y: ${3:2.5cm}))\n${0}', detail: '设置页面' },
        { label: 'text', insertText: '#set text(size: ${1:12pt}, lang: "${2:zh}", font: ("${3:Roboto}", "${4:Noto Sans CJK SC}"))\n${0}', detail: '设置文本样式' },
        { label: 'align', insertText: '#align(${1:center}, ${0})', detail: '对齐' },
        { label: 'colbreak', insertText: '#colbreak()', detail: '分栏换页' },

        // 标题
        { label: 'h1', insertText: '= ${1:标题}\n${0}', detail: '一级标题' },
        { label: 'h2', insertText: '== ${1:标题}\n${0}', detail: '二级标题' },
        { label: 'h3', insertText: '=== ${1:标题}\n${0}', detail: '三级标题' },
        { label: 'h4', insertText: '==== ${1:标题}\n${0}', detail: '四级标题' },

        // 文本格式
        { label: 'bold', insertText: '*${1:粗体}*\n${0}', detail: '粗体' },
        { label: 'italic', insertText: '_${1:斜体}_\n${0}', detail: '斜体' },
        { label: 'code', insertText: '`${1:代码}`\n${0}', detail: '行内代码' },
        { label: 'link', insertText: 'https://${1:url}', detail: '链接' },
        { label: 'ref', insertText: '@${1:label}', detail: '引用' },
        { label: 'label', insertText: '<${1:label}>', detail: '标签' },

        // 列表
        { label: 'ul', insertText: '- ${1:项目}\n${0}', detail: '无序列表' },
        { label: 'ol', insertText: '+ ${1:项目}\n${0}', detail: '有序列表' },
        { label: 'task', insertText: '- [${1:${2| ,x,|}}] ${3:任务}\n${0}', detail: '任务列表' },

        // 表格
        { label: 'table', insertText: '#table(\n  columns: ${1:3},\n  [${2:表头1}], [${3:表头2}], [${4:表头3}],\n  [${5:内容1}], [${6:内容2}], [${7:内容3}],\n)${0}', detail: '表格' },
        { label: 'table3', insertText: '#table(\n  columns: (auto, 1fr, auto),\n  [${1:名称}], [${2:描述}], [${3:值}],\n  [${4:}], [${5:}], [${6:}],\n)${0}', detail: '三列表格' },

        // 数学公式
        { label: 'math', insertText: '$ ${1:formula} $\n${0}', detail: '行内数学公式' },
        { label: 'mathblock', insertText: '$ ${1:\n  formula\n} $\n${0}', detail: '块级数学公式' },
        { label: 'frac', insertText: 'frac(${1:分子}, ${2:分母})', detail: '分数' },
        { label: 'sqrt', insertText: 'sqrt(${1:x})', detail: '平方根' },
        { label: 'sum', insertText: 'sum(${1:0}^{${2:n}}) ${3:x_n}', detail: '求和' },
        { label: 'prod', insertText: 'prod(${1:0}^{${2:n}}) ${3:x_n}', detail: '求积' },
        { label: 'int', insertText: 'int_${1:0}^{${2:oo}} ${3:f(x)} dif x', detail: '积分' },
        { label: 'vec', insertText: 'vec(${1:x}, ${2:y})', detail: '向量' },
        { label: 'mat', insertText: 'mat(${1:a}, ${2:b}; ${3:c}, ${4:d})', detail: '矩阵' },

        // 图片与引用
        { label: 'image', insertText: '#image("${1:path}", width: ${2:80%})\n${0}', detail: '图片' },
        { label: 'figure', insertText: '#figure(\n  image("${1:path}", width: ${2:80%}),\n  caption: [${3:图片描述}],\n  kind: image,\n  supplement: "图",\n)<${4:fig}>\n${0}', detail: '带编号图片' },
        { label: 'caption', insertText: '#figure(\n  ${1:内容},\n  caption: [${2:描述}],\n)${0}', detail: '带标题图形' },

        // 代码块
        { label: 'codeblock', insertText: '```${1:python}\n${2:# 代码}\n```\n${0}', detail: '代码块' },

        // 脚注与注释
        { label: 'footnote', insertText: '#footnote[${1:脚注内容}]${0}', detail: '脚注' },
        { label: 'heading', insertText: '#heading(level: ${1:1})[${2:标题}]', detail: '标题函数' },

        // 引用与导入
        { label: 'import', insertText: '#import "${1:module}": ${2:item}\n${0}', detail: '导入模块' },
        { label: 'include', insertText: '#include "${1:file.typ}"\n${0}', detail: '包含文件' },

        // Typst 设置
        { label: 'setpage', insertText: '#set page(\n  paper: "${1:a4}",\n  margin: (x: ${2:2.5cm}, y: ${3:2.5cm}),\n  numbering: "${4:1}",\n)${0}', detail: '设置页面属性' },
        { label: 'setpar', insertText: '#set par(${1:justify: true, leading: ${2:0.78em}})\n${0}', detail: '设置段落' },
        { label: 'showrule', insertText: '#show ${1:heading}: set text(${2:font: "serif"})\n${0}', detail: '显示规则' },

        // 网格布局
        { label: 'grid', insertText: '#grid(\n  columns: ${1:3},\n  gutter: ${2:1fr},\n  [${3:A}], [${4:B}], [${5:C}],\n)${0}', detail: '网格布局' },
        { label: 'columns', insertText: '#columns(${1:2})[\n  ${0}\n]', detail: '分栏布局' },

        // 字体样式
        { label: 'highlight', insertText: '#highlight[${1:高亮文本}]${0}', detail: '高亮' },
        { label: 'strike', insertText: '#strikethrough[${1:删除线文本}]${0}', detail: '删除线' },
        { label: 'underline', insertText: '#underline[${1:下划线文本}]${0}', detail: '下划线' },

        // 数学
        { label: 'lr', insertText: 'lr(${1:(}[${2:公式}]${3:)})', detail: '自动括号' },
        { label: 'cancel', insertText: '#cancel[${1:公式}]${0}', detail: '删除线公式' },
        { label: 'overbrace', insertText: '#overbrace(${1:公式})[${2:说明}]${0}', detail: '上花括号' },
        { label: 'underbrace', insertText: '#underbrace(${1:公式})[${2:说明}]${0}', detail: '下花括号' },

        // 化学式
        { label: 'chem', insertText: '#chem("${1:H2O}")\n${0}', detail: '化学式' },

        // 文档模板
        { label: 'doc', insertText: '#set page(paper: "a4", margin: (x: 2.5cm, y: 2.5cm))\n#set text(size: 12pt, lang: "zh")\n#set par(justify: true, leading: 0.78em)\n\n= ${1:标题}\n\n${0}\n', detail: '文档模板' },
        { label: 'slide', insertText: '#set page(paper: "presentation-16-9", margin: 0cm)\n#set text(size: 24pt)\n\n#align(center + horizon)[\n  ${1:标题}\n]\n\n${0}\n', detail: '幻灯片模板' },
        { label: 'article', insertText: '#set page(paper: "a4", margin: (x: 2.5cm, y: 2.5cm))\n#set text(size: 12pt, lang: "zh", font: ("Noto Serif CJK SC"))\n#set par(justify: true, leading: 0.78em)\n#set heading(numbering: "1.")\n\n= ${1:引言}\n\n${0}\n', detail: '文章模板' },

        // alchemist 化学绘图
        { label: 'bond-single', insertText: 'single()', detail: '单键 (alchemist)' },
        { label: 'bond-double', insertText: 'double()', detail: '双键 (alchemist)' },
        { label: 'fragment', insertText: 'fragment("${1:OH}")', detail: '化学片段 (alchemist)' },
        { label: 'cycle', insertText: 'cycle(${1:6}, {\n  ${0}\n})', detail: '环状结构 (alchemist)' },
        { label: 'branch', insertText: 'branch({\n  ${0}\n})', detail: '支链 (alchemist)' },
        { label: 'skeletize', insertText: '#skeletize({\n  ${0}\n})', detail: '化学骨架 (alchemist)' },

        // 文档结构
        { label: 'outline', insertText: '#outline(title: [目录], depth: ${1:2})\n${0}', detail: '目录' },
        { label: 'bibliography', insertText: '#bibliography("${1:refs.bib}", title: [参考文献])\n${0}', detail: '参考文献' },
        { label: 'abstract', insertText: '#abstract[\n  ${1:摘要内容}\n]\n${0}', detail: '摘要' },
        { label: 'appendix', insertText: '#appendix[\n  ${1:附录内容}\n]\n${0}', detail: '附录' },
        { label: 'pagebreak', insertText: '#pagebreak()\n${0}', detail: '分页' },
        { label: 'figure2', insertText: '#figure(\n  ${1:内容},\n  caption: [${2:说明}],\n  kind: ${3:table},\n)${0}', detail: '带编号图表' },
        { label: 'equation', insertText: '$ ${1:公式} $ <eq-${2:name}>\n#ref(<eq-${2:name}>, supplement: [公式])\n${0}', detail: '编号公式' },

        // 页眉页脚
        { label: 'header', insertText: '#set page(header: [${1:页眉}], footer: [${2:页码}], numbering: "${3:1}")\n${0}', detail: '页眉页脚' },

        // 引用样式
        { label: 'quote', insertText: '#quote[${1:引用内容}]\n${0}', detail: '引用块' },
        { label: 'cite', insertText: '#cite("${1:key}", form: ${2:prose})\n${0}', detail: '引用文献' },
        { label: 'ref2', insertText: '#ref(<${1:label}>, supplement: [${2:图}], form: ${3:full})\n${0}', detail: '带说明引用' },

        // 布局
        { label: 'block', insertText: '#block(inset: ${1:1em}, radius: ${2:5pt})[\n  ${0}\n]', detail: '块容器' },
        { label: 'vspace', insertText: '#v(${1:1em})', detail: '垂直间距' },
        { label: 'hspace', insertText: '#h(${1:1em})', detail: '水平间距' },
        { label: 'place', insertText: '#place(${1:top + right})[${2:内容}]', detail: '绝对定位' },
        { label: 'padding', insertText: '#pad(x: ${1:1em}, y: ${2:1em})[${3:内容}]', detail: '内边距' },
        { label: 'box', insertText: '#box(fill: ${1:none}, stroke: ${2:none})[${3:内容}]', detail: '盒子' },

        // 文本
        { label: 'smallcaps', insertText: '#smallcaps[${1:文本}]', detail: '小型大写' },
        { label: 'superscript', insertText: '#super[${1:上标}]', detail: '上标' },
        { label: 'subscript', insertText: '#sub[${1:下标}]', detail: '下标' },
        { label: 'textsize', insertText: '#text(size: ${1:14pt})[${2:文本}]', detail: '指定字号' },
        { label: 'textcolor', insertText: '#text(fill: ${1:red})[${2:文本}]', detail: '指定颜色' },
        { label: 'link2', insertText: '#link("${1:https://example.com}")[${2:链接文字}]', detail: '链接文字' },
      ];

      return {
        suggestions: snippets.map(s => ({
          ...s,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })),
      };
    },
  });
}
