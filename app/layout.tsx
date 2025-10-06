import './globals.css'
import type { ReactNode } from 'react'
export default function RootLayout({ children }: { children: ReactNode }) { return (<html lang="es"><body className="min-h-screen bg-gray-50 text-gray-900"><div className="mx-auto max-w-5xl p-4">{children}</div></body></html>) }
