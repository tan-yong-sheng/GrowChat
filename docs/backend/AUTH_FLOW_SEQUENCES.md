# GrowChat Authentication - Sequence Diagrams

## 1. Registration Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend as Frontend<br/>(auth.js)
    participant Backend as Backend<br/>(auth.js router)
    participant DB as Database
    participant KV as KV Store
    participant Email as Email Service

    User->>Frontend: Fill registration form
    User->>Frontend: Click "Sign up"
    Frontend->>Backend: POST /api/auth/register<br/>{email, name, password}
    
    Backend->>Backend: Rate limit check
    Backend->>Backend: Validate inputs
    Backend->>DB: Check if email exists
    DB-->>Backend: Not found ✓
    
    Backend->>Backend: Hash password (PBKDF2)
    Backend->>DB: Create user record
    DB-->>Backend: User created
    
    Backend->>DB: Check if first user
    DB-->>Backend: Yes, first user
    Backend->>DB: Bind admin role
    DB-->>Backend: Role bound
    
    Backend->>Backend: Create JWT access token
    Backend->>KV: Create refresh token<br/>(two-key pattern)
    KV-->>Backend: Token stored
    
    Backend-->>Frontend: 201 {user, access_token,<br/>refresh_token, expires_in}
    
    Frontend->>Frontend: setAuthState(data)
    Frontend->>Frontend: localStorage.setItem('growchat_auth', data)
    Frontend->>User: Redirect to /
```

---

## 2. Login Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend as Frontend<br/>(auth.js)
    participant Backend as Backend<br/>(auth.js router)
    participant DB as Database
    participant KV as KV Store

    User->>Frontend: Enter email & password
    User->>Frontend: Click "Sign in"
    Frontend->>Backend: POST /api/auth/login<br/>{email, password}
    
    Backend->>Backend: Rate limit check
    Backend->>Backend: Validate inputs
    Backend->>DB: Find user by email
    DB-->>Backend: User found
    
    Backend->>DB: Load primary_role
    DB-->>Backend: Role loaded
    
    Backend->>Backend: Verify password<br/>(constant-time)
    Backend->>Backend: Check account_status
    
    alt Account not active
        Backend-->>Frontend: 403 {error: 'pending_account'}
        Frontend->>User: Show "Account pending approval"
    else Account active
        Backend->>DB: Touch last_active_at
        Backend->>Backend: Create JWT access token
        Backend->>KV: Create refresh token
        KV-->>Backend: Token stored
        
        Backend-->>Frontend: 200 {user, access_token,<br/>refresh_token, expires_in}
        Frontend->>Frontend: setAuthState(data)
        Frontend->>User: Redirect to /
    end
```

---

## 3. Token Refresh Flow

```mermaid
sequenceDiagram
    participant Frontend as Frontend<br/>(request.js)
    participant Backend as Backend<br/>(auth.js router)
    participant DB as Database
    participant KV as KV Store

    Frontend->>Frontend: Check if access_token expired
    
    alt Token expired
        Frontend->>Frontend: Get refresh_token from localStorage
        Frontend->>Backend: POST /api/auth/refresh<br/>{refresh_token}
        
        Backend->>Backend: Hash refresh_token
        Backend->>KV: Delete refresh:{hash}<br/>(gate key)
        KV-->>Backend: Gate deleted
        
        Backend->>KV: Read refresh-data:{hash}
        KV-->>Backend: Session data {userId, expiresAt}
        
        Backend->>Backend: Verify not expired
        Backend->>DB: Find user by userId
        DB-->>Backend: User found
        
        Backend->>DB: Load primary_role
        Backend->>DB: Check account_status
        
        alt Account not active
            Backend-->>Frontend: 403 {error: 'pending_account'}
            Frontend->>Frontend: clearAuthState()
            Frontend->>Frontend: Redirect to /auth.html
        else Account active
            Backend->>DB: Touch last_active_at
            Backend->>Backend: Create new JWT access token
            Backend->>KV: Create new refresh token
            KV-->>Backend: Token stored
            
            Backend-->>Frontend: 200 {user, access_token,<br/>refresh_token, expires_in}
            Frontend->>Frontend: setAuthState(data)
            Frontend->>Frontend: Retry original request
        end
    else Token still valid
        Frontend->>Frontend: Use existing token
    end
```

---

## 4. Automatic Token Refresh on 401/403

```mermaid
sequenceDiagram
    participant Frontend as Frontend<br/>(request.js)
    participant Backend as Backend<br/>(API endpoint)
    participant AuthBackend as Backend<br/>(auth.js router)
    participant KV as KV Store

    Frontend->>Frontend: apiFetch(path, options)
    Frontend->>Frontend: Add Authorization header
    Frontend->>Backend: Fetch request
    
    Backend-->>Frontend: 401 or 403 response
    
    Frontend->>Frontend: Check if refresh_token exists
    
    alt Refresh token exists
        Frontend->>AuthBackend: POST /api/auth/refresh
        AuthBackend->>KV: Consume refresh token
        KV-->>AuthBackend: New tokens
        
        AuthBackend-->>Frontend: 200 {access_token, refresh_token}
        Frontend->>Frontend: setAuthState(data)
        Frontend->>Frontend: Update Authorization header
        Frontend->>Backend: Retry original request
        Backend-->>Frontend: Success response
    else No refresh token
        Frontend->>Frontend: clearAuthState()
        Frontend->>Frontend: Redirect to /auth.html
    end
```

---

## 5. Password Reset - Request Phase

```mermaid
sequenceDiagram
    participant User
    participant Frontend as Frontend<br/>(auth.js modal)
    participant Backend as Backend<br/>(auth.js router)
    participant DB as Database
    participant Email as Email Service

    User->>Frontend: Click "Forgot password?"
    Frontend->>Frontend: Open modal
    User->>Frontend: Enter email
    User->>Frontend: Click "Send reset link"
    
    Frontend->>Backend: POST /api/auth/forgot-password<br/>{email}
    
    Backend->>Backend: Rate limit check
    Backend->>DB: Find user by email
    
    alt Email not found
        Backend-->>Frontend: 200 {message: 'Check your email...'}
        Note over Backend: (Always success for security)
    else Email found
        Backend->>Backend: Generate 32-byte random token
        Backend->>Backend: Hash token (SHA-256)
        Backend->>DB: Insert password_reset_tokens<br/>(token_hash, expires_at)
        DB-->>Backend: Record inserted
        
        Backend->>Email: Send email with reset link<br/>(/auth/reset-password?token={plaintext})
        Email-->>Backend: Email sent
        
        Backend-->>Frontend: 200 {message: 'Check your email...'}
    end
    
    Frontend->>Frontend: Show success message
    Frontend->>User: Close modal after 2s
```

---

## 6. Password Reset - Completion Phase

```mermaid
sequenceDiagram
    participant User
    participant Frontend as Frontend<br/>(auth.js modal)
    participant Backend as Backend<br/>(auth.js router)
    participant DB as Database
    participant KV as KV Store

    User->>User: Click link in email
    User->>Frontend: /auth/reset-password?token=...
    
    Frontend->>Frontend: Extract token from URL
    Frontend->>Frontend: Open reset password modal
    User->>Frontend: Enter new password
    User->>Frontend: Click "Reset password"
    
    Frontend->>Backend: POST /api/auth/reset-password<br/>{token, password}
    
    Backend->>Backend: Rate limit check
    Backend->>Backend: Hash token (SHA-256)
    Backend->>DB: Find password_reset_tokens<br/>by token_hash
    
    alt Token not found or expired
        Backend-->>Frontend: 400 {error: 'Invalid or expired reset token'}
        Frontend->>User: Show error
    else Token valid
        Backend->>Backend: Hash new password (PBKDF2)
        Backend->>DB: Update users.password_hash
        DB-->>Backend: Updated
        
        Backend->>DB: Delete password_reset_tokens<br/>(single-use)
        DB-->>Backend: Deleted
        
        Backend->>KV: Delete all refresh tokens<br/>for user
        KV-->>Backend: Deleted
        
        Backend-->>Frontend: 200 {message: 'Password reset successful...'}
        Frontend->>Frontend: Show success message
        Frontend->>User: Redirect to /auth.html after 2s
    end
```

---

## 7. Logout Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend as Frontend<br/>(app.js)
    participant Backend as Backend<br/>(auth.js router)
    participant KV as KV Store

    User->>Frontend: Click "Logout"
    Frontend->>Frontend: Get refresh_token from localStorage
    Frontend->>Backend: POST /api/auth/logout<br/>{refresh_token}
    
    Backend->>Backend: Hash refresh_token
    Backend->>KV: Delete refresh:{hash}
    KV-->>Backend: Deleted
    Backend->>KV: Delete refresh-data:{hash}
    KV-->>Backend: Deleted
    
    Backend-->>Frontend: 200 {ok: true}
    
    Frontend->>Frontend: clearAuthState()
    Frontend->>Frontend: localStorage.removeItem('growchat_auth')
    Frontend->>Frontend: Redirect to /auth.html
    Frontend->>User: Show login page
```

---

## 8. Two-Key Refresh Token Pattern (Race Prevention)

```mermaid
sequenceDiagram
    participant Client1 as Client 1
    participant Client2 as Client 2
    participant Backend as Backend
    participant KV as KV Store

    Note over Client1,KV: Concurrent refresh attempts

    Client1->>Backend: POST /api/auth/refresh {token}
    Client2->>Backend: POST /api/auth/refresh {token}
    
    par Client1 path
        Backend->>Backend: Hash token
        Backend->>KV: DELETE refresh:{hash}
        KV-->>Backend: Deleted ✓
        Backend->>KV: GET refresh-data:{hash}
        KV-->>Backend: Data found ✓
        Backend->>Backend: Create new tokens
        Backend-->>Client1: 200 {new tokens}
    and Client2 path
        Backend->>Backend: Hash token
        Backend->>KV: DELETE refresh:{hash}
        KV-->>Backend: Already deleted ✗
        Backend->>KV: GET refresh-data:{hash}
        KV-->>Backend: Data found (but gate gone)
        Backend->>Backend: Reject (gate missing)
        Backend-->>Client2: 401 {error: 'Invalid refresh token'}
    end
    
    Note over Client1,KV: Only one client succeeds
```

---

## 9. Account Status Check on Every Auth Event

```mermaid
graph TD
    A["Login / Refresh / Register"] --> B["Load user from DB"]
    B --> C["Load primary_role from user_roles"]
    C --> D["Check account_status"]
    D --> E{Status === 'active'?}
    E -->|Yes| F["Proceed with auth"]
    E -->|No| G["Return 403 pending_account"]
    F --> H["Create tokens"]
    H --> I["Return success"]
    G --> J["Return error"]
    
    style E fill:#ff9999
    style F fill:#99ff99
    style G fill:#ff9999
```

---

## 10. Password Hashing: PBKDF2 Process

```mermaid
graph LR
    A["Plain password"] --> B["Generate 16-byte salt"]
    B --> C["PBKDF2-SHA256<br/>100,000 iterations"]
    C --> D["256-bit derived key"]
    D --> E["Format: pbkdf2:salt:hash"]
    E --> F["Store in DB"]
    
    style C fill:#ffcc99
    style F fill:#99ccff
```

---

## 11. JWT Structure

```
Header.Payload.Signature

Header:
{
  "alg": "HS256",
  "typ": "JWT"
}

Payload:
{
  "sub": "user-id",
  "email": "user@example.com",
  "primary_role": "admin",
  "name": "User Name",
  "iat": 1234567890,
  "exp": 1234568790
}

Signature:
HMAC-SHA256(
  base64url(header) + "." + base64url(payload),
  JWT_SECRET
)
```

---

## 12. KV Storage Keys

```
Refresh Token Storage (SESSIONS namespace):

refresh:{hash}
├─ Value: '1' (gate key)
├─ TTL: 7 days
└─ Purpose: Prevent concurrent reuse

refresh-data:{hash}
├─ Value: { userId, expiresAt }
├─ TTL: 7 days
└─ Purpose: Session data (read-only after gate deleted)

Client Session ID (sessionStorage):

growchat_client_session_id
├─ Value: '{timestamp}-{uuid}'
├─ Scope: Per tab
└─ Purpose: Track client sessions
```
