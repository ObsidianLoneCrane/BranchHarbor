import { highlightSource } from '../lib/syntax'

addEventListener('message', (event: MessageEvent<{ path: string; text: string }>) => {
  postMessage(highlightSource(event.data.path, event.data.text))
})
