import { NextResponse, NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  const PUBLIC_PATHS = [
    '/login', '/signup', '/auth/callback',
    '/favicon.ico', '/robots.txt', '/sitemap.xml'
  ]
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|avif|css|js|txt|woff2?)$/)
  ) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/admin')) {
    const access = req.cookies.get('sb-access-token')?.value
    const refresh = req.cookies.get('sb-refresh-token')?.value
    if (!access || !refresh) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      const redirect = pathname + (search || '')
      url.searchParams.set('redirect', redirect)
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|api|static|.*\..*).*)'],
}
