'use client'
import { supabase } from './supabase'

export async function getMyRoles(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('user_roles')
    .select('roles:role_id(code)')
    .eq('user_id', user.id)

  if (error || !data) return []
  // data: [{ roles: { code: 'admin' }}, ...]
  return data.map(r => (r as any).roles?.code).filter(Boolean)
}
