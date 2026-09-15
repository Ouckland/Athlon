# Athlon — Collaboration

Athlon is being built by two developers.

## Responsibilities

### Backend

Owner: Backend developer

Responsible for:

* Django
* Database
* Models
* API
* Authentication
* Permissions
* Match engine
* Fantasy engine
* WebSockets
* Backend deployment

### Frontend

Owner: Frontend developer

Responsible for:

* React
* PWA
* UI
* Routing
* Frontend state
* API integration
* WebSocket client
* Frontend deployment

### Shared

Both developers work on:

* Product decisions
* API contracts
* Bug fixing
* Testing
* Code review

---

# Git Workflow

Never push directly to `main`.

Create a feature branch:

```text
feat/backend-matches
feat/backend-fantasy
feat/frontend-live-match
feat/frontend-fantasy
```

Then:

```text
git add .
git commit
git push
```

Open a Pull Request.

Review before merging.

---

# Commits

Keep commits small and clear.

Good:

```text
feat: add match event model
feat: add live match endpoint
fix: prevent duplicate match events
feat: add fantasy scoring service
```

Avoid:

```text
update stuff
changes
final
fixed everything
```

---

# Working Together

Before starting a feature:

1. Agree on what it should do.
2. Define the API if frontend/backend interact.
3. Create the task.
4. Build separately.
5. Test together.

---

# Important Rule

Do not make large architectural changes without discussing them first.

If something feels wrong:

```text
Stop
 ↓
Discuss
 ↓
Decide
 ↓
Document
 ↓
Build
```

---

# AI Usage

AI can generate code, but developers own the code.

Before accepting generated code:

* Understand what it does.
* Check existing architecture.
* Run tests.
* Check security.
* Check edge cases.

Do not let AI independently redesign the project.

---

# Communication

Use a simple task format:

```text
TASK:
Add live match event creation.

OWNER:
Backend

DEPENDENCY:
Match API

DONE WHEN:
Scout can create a goal and connected clients receive it.
```
