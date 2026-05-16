<<<<<<< HEAD
# LLM & Models Flow

This diagram illustrates how models are discovered, merged with user-overrides, authorized, and presented to the client.

```mermaid
sequenceDiagram
    participant Client
    participant Router as Models API (/api/models)
    participant RBAC as Authorization Middleware
    participant Config as Admin Config (Connections)
    participant UserPrefs as User Preferences (Overrides)
    participant Upstream as External LLM APIs

    Client->>Router: GET /api/models
    
    Router->>Config: Fetch all workspace connections
    Router->>Upstream: GET /v1/models (Parallel for each connection)
    Upstream-->>Router: Raw Model Lists
    
    Router->>UserPrefs: Fetch personal user connections & hidden overrides
    Router->>Router: Merge & Deduplicate (Personal > Workspace)
    
    Router->>RBAC: Filter by ACLs (remove explicitly denied models)
    RBAC-->>Router: Authorized Model List
    
    Router-->>Client: Clean JSON Model Registry
```
=======
# LLM & Models Flow

This diagram illustrates how models are discovered, merged with user-overrides, authorized, and presented to the client.

```mermaid
sequenceDiagram
    participant Client
    participant Router as Models API (/api/models)
    participant RBAC as Authorization Middleware
    participant Config as Admin Config (Connections)
    participant UserPrefs as User Preferences (Overrides)
    participant Upstream as External LLM APIs

    Client->>Router: GET /api/models
    
    Router->>Config: Fetch all workspace connections
    Router->>Upstream: GET /v1/models (Parallel for each connection)
    Upstream-->>Router: Raw Model Lists
    
    Router->>UserPrefs: Fetch personal user connections & hidden overrides
    Router->>Router: Merge & Deduplicate (Personal > Workspace)
    
    Router->>RBAC: Filter by ACLs (remove explicitly denied models)
    RBAC-->>Router: Authorized Model List
    
    Router-->>Client: Clean JSON Model Registry
```
>>>>>>> feature/short-term-tasks
