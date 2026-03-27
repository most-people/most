import { createRoot } from 'react-dom/client'
import App from './app.jsx'

const root = createRoot(document.getElementById('root'))
root.render(<App />)

// Init theme after mount
if (window.lucide) window.lucide.createIcons()

// Re-init lucide icons after each render
const origRender = root.render
root.render = (el) => {
  const result = origRender(el)
  requestAnimationFrame(() => {
    if (window.lucide) window.lucide.createIcons()
  })
  return result
}
