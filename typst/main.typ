// 欢迎使用 Typst 编辑器！
// 工作区: ./typst/
#import "@preview/cuti:0.4.0": show-cn-fakebold
#show: show-cn-fakebold

#set page(paper: "a4", margin: (x: 2.5cm, y: 2.5cm))
#set text(size: 12pt, lang: "zh", font: (
  "Roboto",
  "Noto Sans CJK SC",
  "Noto Serif CJK SC",
))
#show link: set text(fill: blue, weight: 700)
#show link: underline

= Hello, Typst!

你好！#link("https://github.com/wbw121124/")[wbw121124]

This is a live preview editor for *Typst* documents.

== Features

- File management in `./typst/` workspace
- Live preview as you type
- Syntax highlighting via Monaco Editor
- Export to SVG or PDF

== Math Example

#let a = include("physica.typ")
#a

$ integral_0^oo e^(-x^2) dif x = sqrt(pi) $

#import "@preview/zero:0.6.1": format-table, num, zi

Physicists estimate a number of #num[1e80] particles in the observable universe.

#figure({
  show: format-table(none, auto)
  table(
    columns: 2,
    [1], [1.2],
    [2], [2],
    [3], [300],
  )
})

#let Js = zi.declare("J s")
Plancks constant is roughly #Js[6.626e-34].

== Table Example

#table(
  columns: 3,
  [Name], [Age], [City],
  [Alice], [30], [New York],
  [Bob], [25], [London],
  [Charlie], [35], [Tokyo],
)

== Fira Code 代码块示例

#show raw: set text(font: "Fira Code")

#rect(```rust
fn main() {
    let msg = "Hello, Typst!";
    println!("{msg}");
}
```,stroke: 0.5pt,radius: 5pt)

#let code-block(content) = {
  // 阴影层
  place(
    dx: 3pt, dy: 3pt,
    rect(
      content,
      fill: luma(200), // 阴影颜色
      stroke: none,
      radius: 5pt,
    )
  )
  // 内容层
  rect(
    content,
    stroke: 0.5pt,
    radius: 5pt,
    fill: white,
  )
}

#show raw: set text(font: "Fira Code")

#code-block(```rust
fn main() {
    let msg = "Hello, Typst!";
    println!("{msg}");
}
```)

Fira Code 支持代码连字（ligatures），如行内代码 `->`、`=>`、`!=` 和 `fn(x) => x * 2`。


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
        to: 1,
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

// Style 1
#import "@preview/physica:0.9.8": *

$ curl (grad f), tensor(T, -mu, +nu), pdv(f, x, y, [1,2]) $
// Style 2
#import "@preview/physica:0.9.8": curl, grad, pdv, tensor

$ curl (grad f), tensor(T, -mu, +nu), pdv(f, x, y, [1,2]) $
// Style 3
#import "@preview/physica:0.9.8"

$
  physica.curl (physica.grad f), physica.tensor(T, -mu, +nu), physica.pdv(f, x, y, [1,2])
$

#import "@preview/quill:0.8.0" as quill: tequila as tq

#quill.quantum-circuit(
  ..tq.build(
    tq.h(0),
    tq.cx(0, 1),
    tq.cx(0, 2),
  ),
  quill.gategroup(x: 2, y: 0, 3, 2),
)
