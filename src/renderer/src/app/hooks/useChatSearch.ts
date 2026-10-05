import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from 'react'
import type { ChatConversation } from '../../../../shared/chat/chat'
import type { ActivePopup } from '../../launcher/ModulePopup'
import { buildSearchMatches, normalizeMessageOrder, type SearchGroup, type SearchMatch } from '../utils/chat'
import { applySearchHighlight, clearSearchHighlight } from '../utils/searchHighlight'

interface UseChatSearchOptions {
  conversations: ChatConversation[]
  activeConversation: ChatConversation | null
  setActiveConversation: Dispatch<SetStateAction<ChatConversation | null>>
  isChatOpen: boolean
  chatScrollRef: RefObject<HTMLDivElement>
  setIsChatOpen: Dispatch<SetStateAction<boolean>>
  setIsHistoryOpen: Dispatch<SetStateAction<boolean>>
  setActivePopup: Dispatch<SetStateAction<ActivePopup | null>>
}

export function useChatSearch({
  conversations,
  activeConversation,
  setActiveConversation,
  isChatOpen,
  chatScrollRef,
  setIsChatOpen,
  setIsHistoryOpen,
  setActivePopup
}: UseChatSearchOptions) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const searchMatches = useMemo(
    () => buildSearchMatches(conversations, activeConversation, searchQuery),
    [conversations, activeConversation, searchQuery]
  )

  const searchGroups = useMemo<SearchGroup[]>(() => {
    const groups: SearchGroup[] = []
    for (const match of searchMatches) {
      const last = groups[groups.length - 1]
      if (last && last.conversationId === match.conversationId) {
        last.matches.push(match)
      } else {
        groups.push({
          conversationId: match.conversationId,
          conversationTitle: match.conversationTitle,
          matches: [match]
        })
      }
    }
    return groups
  }, [searchMatches])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setActiveSearchMatchIndex(0)
  }, [])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    window.setTimeout(() => searchInputRef.current?.focus(), 40)
  }, [])

  const toggleSearch = useCallback(() => {
    if (searchOpen) {
      closeSearch()
    } else {
      openSearch()
    }
  }, [searchOpen, openSearch, closeSearch])

  const navigateToSearchMatch = useCallback(
    (match: SearchMatch) => {
      if (match.conversationId !== activeConversation?.id) {
        const conversation = conversations.find((item) => item.id === match.conversationId)
        if (conversation) {
          setActiveConversation(conversation)
        }
      }
      setIsChatOpen(true)
      setIsHistoryOpen(false)
      setActivePopup(null)
      window.setTimeout(() => {
        const scrollElement = chatScrollRef.current
        const messageElement = scrollElement?.querySelector(`[data-message-id="${match.messageId}"]`)
        if (messageElement) {
          messageElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      }, 80)
    },
    [activeConversation, conversations, chatScrollRef, setActiveConversation, setIsChatOpen, setIsHistoryOpen, setActivePopup]
  )

  const goToSearchMatch = useCallback(
    (index: number) => {
      if (searchMatches.length === 0) return
      const clamped = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length
      setActiveSearchMatchIndex(clamped)
      navigateToSearchMatch(searchMatches[clamped])
    },
    [searchMatches, navigateToSearchMatch]
  )

  const goToNextSearchMatch = useCallback(() => {
    goToSearchMatch(activeSearchMatchIndex + 1)
  }, [goToSearchMatch, activeSearchMatchIndex])

  const goToPreviousSearchMatch = useCallback(() => {
    goToSearchMatch(activeSearchMatchIndex - 1)
  }, [goToSearchMatch, activeSearchMatchIndex])

  const selectSearchMatch = useCallback(
    (match: SearchMatch) => {
      const index = searchMatches.indexOf(match)
      if (index === -1) return
      goToSearchMatch(index)
    },
    [searchMatches, goToSearchMatch]
  )

  const selectSearchGroup = useCallback(
    (conversationId: string) => {
      const index = searchMatches.findIndex((match) => match.conversationId === conversationId)
      if (index === -1) return
      goToSearchMatch(index)
    },
    [searchMatches, goToSearchMatch]
  )

  useEffect(() => {
    const trimmedQuery = searchQuery.trim()
    const scrollElement = chatScrollRef.current

    if (!trimmedQuery || !scrollElement || !isChatOpen) {
      clearSearchHighlight()
      return
    }

    const timer = window.setTimeout(() => {
      applySearchHighlight(scrollElement, trimmedQuery)
    }, 0)

    return () => {
      window.clearTimeout(timer)
      clearSearchHighlight()
    }
  }, [searchQuery, activeConversation, isChatOpen, chatScrollRef])

  return {
    searchOpen,
    searchQuery,
    setSearchQuery,
    activeSearchMatchIndex,
    setActiveSearchMatchIndex,
    searchMatches,
    searchGroups,
    searchInputRef,
    closeSearch,
    openSearch,
    toggleSearch,
    goToNextSearchMatch,
    goToPreviousSearchMatch,
    selectSearchMatch,
    selectSearchGroup
  }
}
