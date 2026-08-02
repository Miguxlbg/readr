import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ReaderFontId, ReaderTheme } from '@/lib/types'

export type ReaderAnimation = 'real-page' | 'slide' | 'fade'
export type ReaderViewMode = 'pages' | 'scroll'

interface ReaderState {
  currentPage: number
  theme: ReaderTheme
  fontSize: number
  fontFamily: ReaderFontId
  margin: number
  lineSpacing: number
  brightness: number
  pageGap: number
  viewMode: ReaderViewMode
  renderQuality: 'battery' | 'smooth'
  animation: ReaderAnimation
  showThumbnails: boolean
  showChapters: boolean
  showBookmarks: boolean
  searchQuery: string
  setPage: (page: number) => void
  setTheme: (theme: ReaderTheme) => void
  setFontSize: (size: number) => void
  setFontFamily: (font: ReaderFontId) => void
  setMargin: (margin: number) => void
  setLineSpacing: (spacing: number) => void
  setBrightness: (brightness: number) => void
  setPageGap: (pageGap: number) => void
  setViewMode: (viewMode: ReaderViewMode) => void
  setRenderQuality: (renderQuality: 'battery' | 'smooth') => void
  setAnimation: (animation: ReaderAnimation) => void
  setShowThumbnails: (showThumbnails: boolean) => void
  setShowChapters: (showChapters: boolean) => void
  setShowBookmarks: (showBookmarks: boolean) => void
  setSearchQuery: (searchQuery: string) => void
}

export const useReaderStore = create<ReaderState>()(persist((set) => ({
  currentPage: 0,
  theme: 'light',
  fontSize: 18,
  fontFamily: 'source-serif',
  margin: 38,
  lineSpacing: 1.68,
  brightness: 100,
  pageGap: 18,
  viewMode: 'pages',
  renderQuality: 'smooth',
  animation: 'real-page',
  showThumbnails: false,
  showChapters: false,
  showBookmarks: false,
  searchQuery: '',
  setPage: (currentPage) => set({ currentPage }),
  setTheme: (theme) => set({ theme }),
  setFontSize: (fontSize) => set({ fontSize }),
  setFontFamily: (fontFamily) => set({ fontFamily }),
  setMargin: (margin) => set({ margin }),
  setLineSpacing: (lineSpacing) => set({ lineSpacing }),
  setBrightness: (brightness) => set({ brightness }),
  setPageGap: (pageGap) => set({ pageGap }),
  setViewMode: (viewMode) => set({ viewMode }),
  setRenderQuality: (renderQuality) => set({ renderQuality }),
  setAnimation: (animation) => set({ animation }),
  setShowThumbnails: (showThumbnails) => set({ showThumbnails }),
  setShowChapters: (showChapters) => set({ showChapters }),
  setShowBookmarks: (showBookmarks) => set({ showBookmarks }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}), {
  name: 'readr-reader-preferences',
  version: 2,
  migrate: (persisted: any) => ({
    ...persisted,
    fontFamily: persisted?.fontFamily === 'sans' ? 'inter' : persisted?.fontFamily === 'serif' ? 'source-serif' : persisted?.fontFamily || 'source-serif',
  }),
  partialize: (state) => ({
    theme: state.theme,
    fontSize: state.fontSize,
    fontFamily: state.fontFamily,
    margin: state.margin,
    lineSpacing: state.lineSpacing,
    brightness: state.brightness,
    pageGap: state.pageGap,
    viewMode: state.viewMode,
    renderQuality: state.renderQuality,
    animation: state.animation,
  }),
}))
