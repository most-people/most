import {
  forwardRef,
  type MouseEvent,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Crepe } from '@milkdown/crepe'
import { linkAttr } from '@milkdown/kit/preset/commonmark'
import { replaceAll } from '@milkdown/utils'
import { useI18n } from '~/lib/i18n'

type ResolvedWikiNoteLink = {
  label: string
  href: string
}

interface MilkdownEditorProps {
  content: string
  readOnly?: boolean
  onChange?: (markdown: string) => void
  onInternalNoteLinkOpen?: (href: string) => void
  resolveWikiNoteLink?: (body: string) => ResolvedWikiNoteLink | null
  className?: string
}

export interface MilkdownEditorRef {
  setMarkdown: (markdown: string) => void
  getMarkdown: () => string
}

function enhanceWikiNoteLinks(
  root: HTMLElement,
  resolveWikiNoteLink: (body: string) => ResolvedWikiNoteLink | null
) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let nextNode = walker.nextNode()

  while (nextNode) {
    if (nextNode instanceof Text && nextNode.nodeValue?.includes('[[')) {
      const parent = nextNode.parentElement
      if (!parent?.closest('a, code, pre')) {
        textNodes.push(nextNode)
      }
    }
    nextNode = walker.nextNode()
  }

  for (const textNode of textNodes) {
    replaceWikiNoteLinkText(textNode, resolveWikiNoteLink)
  }
}

function replaceWikiNoteLinkText(
  textNode: Text,
  resolveWikiNoteLink: (body: string) => ResolvedWikiNoteLink | null
) {
  const text = textNode.nodeValue || ''
  const wikiLinkPattern = /\[\[([^\]\n]+?)\]\]/g
  const fragment = document.createDocumentFragment()
  let didReplace = false
  let lastIndex = 0
  let match = wikiLinkPattern.exec(text)

  while (match) {
    const [source, body] = match
    const link = resolveWikiNoteLink(body)

    if (link) {
      if (match.index > lastIndex) {
        fragment.append(
          document.createTextNode(text.slice(lastIndex, match.index))
        )
      }

      const anchor = document.createElement('a')
      anchor.href = link.href
      anchor.textContent = link.label
      anchor.rel = 'noopener noreferrer'
      anchor.target = '_blank'
      anchor.setAttribute('data-note-wiki-link', 'true')
      fragment.append(anchor)

      lastIndex = match.index + source.length
      didReplace = true
    }

    match = wikiLinkPattern.exec(text)
  }

  if (!didReplace) return
  if (lastIndex < text.length) {
    fragment.append(document.createTextNode(text.slice(lastIndex)))
  }
  textNode.parentNode?.replaceChild(fragment, textNode)
}

export const MilkdownEditor = forwardRef<
  MilkdownEditorRef,
  MilkdownEditorProps
>(
  (
    {
      content,
      readOnly,
      onChange,
      onInternalNoteLinkOpen,
      resolveWikiNoteLink,
      className,
    },
    ref
  ) => {
    const { locale, t } = useI18n()
    const rootRef = useRef<HTMLDivElement>(null)
    const crepeRef = useRef<Crepe | null>(null)
    const onChangeRef = useRef(onChange)
    const onInternalNoteLinkOpenRef = useRef(onInternalNoteLinkOpen)
    const [isReady, setIsReady] = useState(false)

    useEffect(() => {
      onChangeRef.current = onChange
    }, [onChange])

    useEffect(() => {
      onInternalNoteLinkOpenRef.current = onInternalNoteLinkOpen
    }, [onInternalNoteLinkOpen])

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

    useEffect(() => {
      if (!readOnly || !isReady || !resolveWikiNoteLink || !rootRef.current) {
        return
      }

      const root = rootRef.current
      let frame = 0
      const scheduleEnhance = () => {
        if (frame) return
        frame = window.requestAnimationFrame(() => {
          frame = 0
          enhanceWikiNoteLinks(root, resolveWikiNoteLink)
        })
      }
      const observer = new MutationObserver(scheduleEnhance)

      scheduleEnhance()
      observer.observe(root, {
        childList: true,
        characterData: true,
        subtree: true,
      })

      return () => {
        observer.disconnect()
        if (frame) window.cancelAnimationFrame(frame)
      }
    }, [content, isReady, readOnly, resolveWikiNoteLink])

    function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
      if (!readOnly || !onInternalNoteLinkOpenRef.current) return
      if (!(event.target instanceof HTMLElement)) return

      const link = event.target.closest('a[href]')
      if (!link || !rootRef.current?.contains(link)) return

      const href = link.getAttribute('href') || ''
      let url: URL
      try {
        url = new URL(href, window.location.origin)
      } catch {
        return
      }

      if (url.origin !== window.location.origin || url.pathname !== '/note/') {
        return
      }

      event.preventDefault()
      onInternalNoteLinkOpenRef.current(`${url.pathname}${url.search}`)
    }

    return (
      <div
        ref={rootRef}
        className={className || 'milkdown-editor'}
        onClickCapture={handleClickCapture}
      />
    )
  }
)

MilkdownEditor.displayName = 'MilkdownEditor'
