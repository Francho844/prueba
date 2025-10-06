import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = new Set([
  '/', '/login', '/signup', '/auth/callback',
  '/favicon.ico', '/robots.txt', '/sitemap.xml'
])

// Protege lo que necesites:
const PROTECTED_PREFIXES = ['/admin', '/teacher', '/estudiante']

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|avif|css|js|txt|woff2?)$/)
  ) {
    return NextResponse.next()
  }

  if (PROTECTED_PREFIXES.some(p => pathname.startsWith(p))) {
    const access = req.cookies.get('sb-access-token')?.value
    if (!access) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', pathname + (search || ''))
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next|static|.*\\..*).*)'],
}
