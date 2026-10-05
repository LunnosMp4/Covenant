import { useEffect, useRef, useState, type RefObject } from 'react'
import type { AttachedImage } from '../types'

export function useAttachments(): {
  attachedImages: AttachedImage[]
  setAttachedImages: React.Dispatch<React.SetStateAction<AttachedImage[]>>
  showImagePanel: boolean
  setShowImagePanel: React.Dispatch<React.SetStateAction<boolean>>
  imagePanelRef: RefObject<HTMLDivElement>
  imageButtonRef: RefObject<HTMLButtonElement>
} {
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [showImagePanel, setShowImagePanel] = useState(false)
  const imagePanelRef = useRef<HTMLDivElement>(null)
  const imageButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!showImagePanel) return

    const handleClickOutsideImagePanel = (event: MouseEvent) => {
      const target = event.target as Node
      if (imagePanelRef.current?.contains(target)) return
      if (imageButtonRef.current?.contains(target)) return
      setShowImagePanel(false)
    }

    document.addEventListener('mousedown', handleClickOutsideImagePanel)
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideImagePanel)
    }
  }, [showImagePanel])

  return {
    attachedImages,
    setAttachedImages,
    showImagePanel,
    setShowImagePanel,
    imagePanelRef,
    imageButtonRef
  }
}
