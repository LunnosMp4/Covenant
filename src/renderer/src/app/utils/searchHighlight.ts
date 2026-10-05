function getSearchHighlightRegistry(): { set(name: string, highlight: unknown): void; delete(name: string): void } | undefined {
  return (CSS as unknown as { highlights?: { set(name: string, highlight: unknown): void; delete(name: string): void } })
    .highlights
}

export function clearSearchHighlight(): void {
  getSearchHighlightRegistry()?.delete('chat-search')
}

export function applySearchHighlight(container: HTMLElement, query: string): void {
  const registry = getSearchHighlightRegistry()
  const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight

  if (!registry || !HighlightCtor) {
    clearSearchHighlight()
    return
  }

  const lowerQuery = query.toLowerCase()
  const ranges: Range[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    const value = node.nodeValue ?? ''
    if (value) {
      const lowerValue = value.toLowerCase()
      let index = lowerValue.indexOf(lowerQuery)
      while (index !== -1) {
        try {
          const range = document.createRange()
          range.setStart(node, index)
          range.setEnd(node, index + lowerQuery.length)
          ranges.push(range)
        } catch {
          break
        }
        index = lowerValue.indexOf(lowerQuery, index + lowerQuery.length)
      }
    }
    node = walker.nextNode()
  }

  if (ranges.length === 0) {
    registry.delete('chat-search')
    return
  }

  registry.set('chat-search', new HighlightCtor(...ranges))
}
