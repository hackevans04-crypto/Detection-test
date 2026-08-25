import { redirect } from 'next/navigation'

export default async function LegacyPracticeRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/instrumentos/${id}/evaluacion`)
}
