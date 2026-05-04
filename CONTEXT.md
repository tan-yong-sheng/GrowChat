# GrowChat Authorization Context

GrowChat authorization decides whether a signed-in user may access admin, settings, model, connection, MCP server, or other restricted actions. This context names the domain terms for access decisions so architecture reviews use one shared language.

## Language

**Role**:
A user’s coarse access class, such as `admin` or `member`.
_Avoid_: permission, policy, access level

**Policy**:
The canonical rule set that decides whether an action is allowed for a user.
_Avoid_: guard, check, rule

**Role policy**:
The canonical rule set for coarse role checks such as `admin` vs `member`.
_Avoid_: admin helper, RBAC helper

**Router guard**:
A thin request adapter that asks policy whether the current request may proceed.
_Avoid_: controller auth, middleware policy

**ACL**:
A resource-scoped allow/deny rule tied to a principal and action.
_Avoid_: permission matrix, access list

## Relationships

- A **Role** may satisfy a **Role policy** directly for coarse access
- A **Role policy** and an **ACL** both refine **Policy** at different seams
- A **Router guard** delegates to **Policy** instead of embedding decision logic

## Example dialogue

> **Dev:** "Should the **Router guard** check the **Role** itself?"
> **Domain expert:** "It can ask **Policy**, but it should not own the decision."

## Flagged ambiguities

- "permission" can mean either coarse **Role** access or resource-scoped **ACL** access — resolved: use **Role** for coarse access and **ACL** for resource-specific rules.
