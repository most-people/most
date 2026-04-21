name: 问题咨询

description: 关于项目的问题

title: "[问题] "
labels: ["question"]
body:

- type: markdown
  attributes:
  value: |
  感谢你提问！我们会尽快回答。

- type: textarea
  id: question
  attributes:
  label: 你的问题
  description: 你想知道什么？
  placeholder: 详细描述你的问题...
  validations:
  required: true

- type: textarea
  id: context
  attributes:
  label: 其他上下文
  description: 可能帮助我们回答你问题的任何其他上下文。
  placeholder: 在此添加任何其他上下文...

- type: dropdown
  id: version
  attributes:
  label: 版本
  description: 你使用的是哪个版本的 MostBox？
  options: - latest (npm) - master (开发版)
