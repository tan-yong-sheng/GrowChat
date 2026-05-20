# GrowChat Developer Wiki 📚

Welcome to the GrowChat knowledge graph. This documentation is structured as an interconnected wiki, designed to map the system from high-level user flows down to low-level database state machines.

## 🎨 Frontend & UX (The UI Knowledge Graph)
The `ui-ux` directory maps the exact interaction behaviors, components, and visual states of the application.

*   **[Navigation & IA](ui-ux/ia/navigation-structure.md)**: What pages exist and how they are structured.
*   **[User Flows](ui-ux/user-flows/)**: The happy paths for users.
    *   [Authentication Flow](ui-ux/user-flows/00-authentication.md)
    *   [Main Chat Interface](ui-ux/user-flows/01-main-chat-interface.md)
    *   [Account Settings Drawer](ui-ux/user-flows/02-account-settings-drawer.md)
    *   [Admin Workspace](ui-ux/user-flows/03-admin-workspace.md)
*   **[UI Components](ui-ux/components/)**: Reusable interface elements and their strict visual rules.
    *   [Chat Components](ui-ux/components/chat-components.md)
    *   [Auth Modals](ui-ux/components/auth-modals.md)
    *   [Workspace Components](ui-ux/components/workspace-components.md)
*   **[State Machines](ui-ux/states/)**: Explicit UI states (Idle -> Loading -> Error) for hunting edge-case bugs.
    *   [Auth States](ui-ux/states/auth.states.md)
    *   [Chat States](ui-ux/states/chat.states.md)
    *   [Account Drawer States](ui-ux/states/account-drawer.states.md)
    *   [Admin Workspace States](ui-ux/states/admin-workspace.states.md)

## ⚙️ Backend & Architecture (The System Graph)
The `backend` directory maps APIs, background jobs, database schemas, and data flows.

*   **[APIs](backend/apis/)**: HTTP Endpoint contracts, internal side-effects, and dependencies.
    *   [Authentication APIs](backend/apis/auth.md)
    *   [Chat & Realtime APIs](backend/apis/chat.md)
    *   [Admin & Settings APIs](backend/apis/admin.md)
    *   [Model Management APIs](backend/apis/models.md)
    *   [User & Profile APIs](backend/apis/users.md)
    *   [File Upload APIs](backend/apis/files.md)
*   **[System Flows](backend/flows/)**: End-to-end sequence diagrams mapping requests through the system.
    *   [Chat Streaming & SSE](backend/flows/chat-streaming.flow.md)
    *   [Model Discovery & Merging](backend/flows/model-discovery.flow.md)
    *   [User Login & Auth](backend/flows/user-login.flow.md)
* [Google OAuth 2.0](backend/flows/google-oauth.flow.md)
    *   [RBAC Authorization Engine](backend/flows/rbac-authorization.flow.md)
*   **[Data Models](backend/data-models/)**: Database schemas and their implicit relationships.
    *   [Users & Sessions](backend/data-models/user.md)
    *   [Chats & Messages](backend/data-models/chat.md)
    *   [Admin Configurations & ACLs](backend/data-models/admin-settings.md)
*   **[Events](backend/events/)**: Realtime SSE event payloads.
    *   [MessageQueueDO Realtime Events](backend/events/realtime.md)
*   **[Backend States](backend/states/)**: Implicit state machines mapped in the database.
    *   [User Account States](backend/states/user.states.md)
    *   [Chat Message States](backend/states/chat-message.states.md)
*   **Other Subsystems**:
    *   [Architecture Decisions](backend/architecture/)
    *   [Background Jobs](backend/jobs/)
    *   [External Integrations](backend/integrations/)
    *   [Infrastructure & Deployments](backend/infra/)
    *   [Auth & Identity Flow Details](backend/auth/)

## 🐞 Bug Hunting & Standards
*   **[DESIGN.md](../DESIGN.md)**: The ultimate source of truth for the Apple-style, low-density aesthetic language used throughout GrowChat.
*   **[UI/UX Bug Tracker](ui-ux/BUGS.md)**: A running checklist of visual deviations and unhandled edge cases discovered during mapping.

---
*Tip: When debugging a feature, start by finding its Flow diagram, trace the API endpoint, check the relevant UI State Machine, and verify the Data Model expectations.*
