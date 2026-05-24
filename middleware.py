from fastapi import Request, HTTPException, status
from fastapi.responses import RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware
from urllib.parse import urlparse

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # List of paths that don't require authentication
        public_paths = [
            '/',
            '/login',
            '/register',
            '/reset-password',
            '/static',
            '/api/v1/auth/token',
            '/api/v1/auth/password-reset',
        ]
        
        # Check if current path is public
        current_path = request.url.path
        is_public = any(current_path.startswith(path) for path in public_paths)
        
        # API routes have their own auth, so skip for API calls
        is_api = current_path.startswith('/api/')
        
        if not is_public and not is_api:
            # Check for auth token
            auth_header = request.headers.get('authorization')
            token = None
            
            if auth_header and auth_header.startswith('Bearer '):
                token = auth_header[7:]
            else:
                # Try to get token from cookies (for web)
                token = request.cookies.get('family_token')
            
            if not token:
                # Redirect to login for web pages
                if current_path.endswith('.html') or not current_path.startswith('/api/'):
                    return RedirectResponse(url='/login')
                else:
                    # For API calls, return 401
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Not authenticated"
                    )
        
        response = await call_next(request)
        return response
