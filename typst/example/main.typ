// 欢迎使用 Typst 编辑器！
// 工作区: ./typst/
#import "@preview/cuti:0.4.0": show-cn-fakebold
#show: show-cn-fakebold

#set page(paper: "a4", margin: (x: 2.5cm, y: 2.5cm))
#set text(size: 12pt, lang: "zh", font: ("Roboto", "Noto Sans CJK SC", "Noto Serif CJK SC"))

= Hello, Typst!

你好

This is a live preview editor for *Typst* documents.

== Features

- File management in `./typst/` workspace
- Live preview as you type
- Syntax highlighting via Monaco Editor
- Export to SVG or PDF

== Math Example

$ integral_0^oo e^(-x^2) dif x = sqrt(pi) $

== Table Example

#table(
  columns: 3,
  [Name], [Age], [City],
  [Alice], [30], [New York],
  [Bob], [25], [London],
  [Charlie], [35], [Tokyo],
)


== 有机化学示例

#import "@preview/alchemist:0.2.0": *

// 乙醇 (Ethanol)
乙醇：
#skeletize({
  single(angle: 0.5)
  single(angle: -0.5)
  fragment("OH")
})

// 苯 (Benzene) - 环状结构
苯：
#skeletize({
  cycle(6, {
    double()
    single()
    double()
    single()
    double()
    single()
  })
})

// 乙酸 (Acetic acid)
乙酸：
#skeletize({
  fragment("H")
  single()
  fragment("C")
  branch({
    single(angle: -2)
    fragment("H")
  })
  branch({
    single(angle: 2)
    fragment("H")
  })
  single()
  fragment("C")
  branch({
    double(angle: 1)
    fragment("O")
  })
  branch({
    single(angle: -1)
    fragment("O")
    single()
    fragment("H")
  })
})

// 丙氨酸 (Alanine)
丙氨酸：
#skeletize({
  single(angle: -0.5)
  branch({
    cram-filled-left(angle: -2)
    fragment("NH_2")
  })
  single(angle: 0.5)
  branch({
    double(angle: 2)
    fragment("O")
  })
  single(angle: -0.5)
  fragment("OH")
})

// 谷氨酸钠 (MSG / 味精)
// HOOC-CH(NH₂)-CH₂-CH₂-COO⁻Na⁺
谷氨酸钠：
#skeletize({
  // HO-C(=O) (左侧羧酸)
  fragment("HO")
  single(angle: 0.5)
  branch({
    double(angle: 2)
    fragment("O")
  })
  single(angle: -0.5)
  branch({
    single(angle: -2)
    fragment("NH_2")
  })
  single(angle: 0.5)
  single(angle: -0.5)
  single(angle: 0.5)
  branch({
    double(angle: 2)
    fragment("O")
  })
  single(angle: -0.5)
  fragment("O^-")
  single(stroke: white)
  fragment("Na^+")
})

// 肾上腺素 (Adrenaline / Epinephrine)
肾上腺素：
#skeletize({
  cycle(6, {
    branch({
      single()
      fragment("HO")
    })
    single()
    double()
    cycle(6, {
      single(stroke: transparent)
      single(
        stroke: transparent,
        to: 1
      )
      fragment("HN")
      branch({
        single(angle: -1)
        fragment("CH_3")
      })
      single(from: 1)
      single()
      branch({
        cram-filled-left(angle: 2)
        fragment("OH")
      })
      single()
    })
    single()
    double()
    single()
    branch({
      single()
      fragment("HO")
    })
    double()
  })
})
