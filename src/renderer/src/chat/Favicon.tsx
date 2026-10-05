import { useEffect, useState } from 'react'

const faviconCache = new Map<string, Promise<string>>()

function loadFavicon(url: string): Promise<string> {
  const cached = faviconCache.get(url)
  if (cached) return cached

  const promise = (window.api?.getFavicon(url) ?? Promise.resolve('')).catch(() => '')
  faviconCache.set(url, promise)
  return promise
}

export function Favicon({ url, className }: { url: string; className?: string }): JSX.Element | null {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let active = true
    setSrc('')
    void loadFavicon(url).then((dataUrl) => {
      if (active && dataUrl) setSrc(dataUrl)
    })
    return () => {
      active = false
    }
  }, [url])

  if (!src) return null
  return <img src={src} alt="" className={className} />
}