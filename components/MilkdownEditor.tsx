'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Crepe } from '@milkdown/crepe'
import { replaceAll } from '@milkdown/utils'

interface MilkdownEditorProps {
  content: string
  readOnly?: boolean
  onChange?: (markdown: string) => void
  className?: string
}

export interface MilkdownEditorRef {
  setMarkdown: (markdown: string) => void
  getMarkdown: () => string
}

export const MilkdownEditor = forwardRef<
  MilkdownEditorRef,
  MilkdownEditorProps
>(({ content, readOnly, onChange, className }, ref) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const onChangeRef = useRef(onChange)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useImperativeHandle(ref, () => ({
    setMarkdown: markdown => {
      if (crepeRef.current && isReady) {
        crepeRef.current.editor.action(replaceAll(markdown))
      }
    },
    getMarkdown: () => crepeRef.current?.getMarkdown() || '',
  }))

  useEffect(() => {
    if (!rootRef.current) return

    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: content,
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: '输入 / 以使用命令...',
        },
        [Crepe.Feature.ImageBlock]: {
          inlineUploadButton: '上传图片',
          inlineUploadPlaceholderText: '或粘贴图片链接...',
          blockUploadButton: '上传图片',
          blockUploadPlaceholderText: '或粘贴图片链接...',
          blockCaptionPlaceholderText: '添加标题...',
        },
        [Crepe.Feature.BlockEdit]: {
          textGroup: {
            label: '基础',
            text: { label: '文本' },
            h1: { label: '一级标题' },
            h2: { label: '二级标题' },
            h3: { label: '三级标题' },
            h4: { label: '四级标题' },
            h5: { label: '五级标题' },
            h6: { label: '六级标题' },
            quote: { label: '引用' },
            divider: { label: '分割线' },
          },
          listGroup: {
            label: '列表',
            bulletList: { label: '无序列表' },
            orderedList: { label: '有序列表' },
            taskList: { label: '任务列表' },
          },
          advancedGroup: {
            label: '高级',
            image: { label: '图片' },
            codeBlock: { label: '代码块' },
            table: { label: '表格' },
            math: { label: '数学公式' },
          },
        },
      },
    })

    crepe.on(listener => {
      listener.markdownUpdated((_ctx, markdown, previousMarkdown) => {
        if (onChangeRef.current && markdown !== previousMarkdown) {
          onChangeRef.current(markdown)
        }
      })
    })

    let destroyed = false
    crepe.create().then(() => {
      if (destroyed) {
        crepe.destroy()
        return
      }

      crepeRef.current = crepe
      crepe.setReadonly(!!readOnly)
      setIsReady(true)
    })

    return () => {
      destroyed = true
      if (crepeRef.current) {
        crepeRef.current.destroy()
        crepeRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (crepeRef.current && isReady) {
      crepeRef.current.setReadonly(!!readOnly)
    }
  }, [readOnly, isReady])

  useEffect(() => {
    if (crepeRef.current && isReady) {
      const currentMarkdown = crepeRef.current.getMarkdown()
      if (content !== currentMarkdown) {
        crepeRef.current.editor.action(replaceAll(content))
      }
    }
  }, [content, isReady])

  return <div ref={rootRef} className={className || 'milkdown-editor'} />
})

MilkdownEditor.displayName = 'MilkdownEditor'
