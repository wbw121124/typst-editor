// 简历模板
#set page(paper: "a4", margin: (x: 2cm, y: 2cm))
#set text(size: 11pt, lang: "zh", font: ("Noto Sans CJK SC", "Roboto"))
#set par(justify: false)

#align(center)[
  #text(size: 20pt, weight: "bold")[姓名]
  #v(0.3em)
  #text(size: 10pt, fill: gray)[电话 | 邮箱 | 城市]
]

#v(0.5em)
#line(length: 100%)

== 教育背景
- 学校名称, 专业, 学历 (年份)

== 工作经历
- 公司名称, 职位 (年份)
  - 工作内容与成果

== 技能
- 技能一, 技能二, 技能三
