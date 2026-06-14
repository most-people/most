import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Crepe } from '@milkdown/crepe'
import { linkAttr } from '@milkdown/kit/preset/commonmark'
import { replaceAll } from '@milkdown/utils'
import { useI18n } from '~/lib/i18n'

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
  const { locale, t } = useI18n()
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
          text: t('milkdown.placeholder'),
        },
        [Crepe.Feature.ImageBlock]: {
          inlineUploadButton: t('milkdown.image.upload'),
          inlineUploadPlaceholderText: t('milkdown.image.placeholder'),
          blockUploadButton: t('milkdown.image.upload'),
          blockUploadPlaceholderText: t('milkdown.image.placeholder'),
          blockCaptionPlaceholderText: t('milkdown.image.captionPlaceholder'),
        },
        [Crepe.Feature.BlockEdit]: {
          textGroup: {
            label: t('milkdown.group.basic'),
            text: { label: t('milkdown.block.text') },
            h1: { label: t('milkdown.block.h1') },
            h2: { label: t('milkdown.block.h2') },
            h3: { label: t('milkdown.block.h3') },
            h4: { label: t('milkdown.block.h4') },
            h5: { label: t('milkdown.block.h5') },
            h6: { label: t('milkdown.block.h6') },
            quote: { label: t('milkdown.block.quote') },
            divider: { label: t('milkdown.block.divider') },
          },
          listGroup: {
            label: t('milkdown.group.list'),
            bulletList: { label: t('milkdown.block.bulletList') },
            orderedList: { label: t('milkdown.block.orderedList') },
            taskList: { label: t('milkdown.block.taskList') },
          },
          advancedGroup: {
            label: t('milkdown.group.advanced'),
            image: { label: t('milkdown.block.image') },
            codeBlock: { label: t('milkdown.block.codeBlock') },
            table: { label: t('milkdown.block.table') },
            math: { label: t('milkdown.block.math') },
          },
        },
      },
    })

    crepe.editor.config(ctx => {
      ctx.set(linkAttr.key, () => ({
        rel: 'noopener noreferrer',
        target: '_blank',
      }))
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
  }, [locale, t])

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
