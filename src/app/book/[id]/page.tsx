import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PageFlipReader } from '@/components/reader/PageFlipReader'
export const metadata: Metadata = { title: 'Leitor' }
export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Suspense><PageFlipReader bookId={id} /></Suspense>
}
