import type { Metadata } from 'next'
import { BookEditor } from '@/components/editor/BookEditor'
export const metadata: Metadata = { title: 'Editar livro' }
export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <BookEditor bookId={id} />
}
