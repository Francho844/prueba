import * as React from 'react'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={['rounded-2xl border bg-white shadow-sm', className].filter(Boolean).join(' ')} {...props} />
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={['p-6', className].filter(Boolean).join(' ')} {...props} />
}
