// app/admin/page.tsx (SERVER)
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminHomePage from './AdminHome'

function hasSupabaseAuthCookieServer() {
  const all = cookies().getAll()
  const anyAuth = all.some(c => /^sb-.*-auth-token$/.test(c.name))
  const legacy =
    !!cookies().get('sb-access-token')?.value ||
    !!cookies().get('sb-refresh-token')?.value ||
    !!cookies().get('supabase-auth-token')?.value
  return anyAuth || legacy
}

export default async function AdminPage() {
  if (!hasSupabaseAuthCookieServer()) {
    redirect('/login?redirect=/admin')
  }
  return <AdminHomePage />
}
