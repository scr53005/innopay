# Claude Code Conventions

This document contains coding conventions and guidelines for the Innopay project. These conventions help maintain consistency across the codebase and ensure smooth collaboration between human developers and AI assistants.

---

## 📊 Database Conventions

### Table and Column Naming

**Convention**: Use `snake_case` for all database table names and column names, NOT `camelCase`.

**Rationale**:
- PostgreSQL is case-insensitive and normalizes identifiers to lowercase
- `snake_case` is the SQL standard and most PostgreSQL convention
- Avoids confusion and quoting issues in raw SQL queries
- Consistent with PostgreSQL ecosystem tools and conventions

**Examples**:

✅ **CORRECT** (snake_case):
```prisma
model account_credential_session {
  id                String   @id @default(cuid())
  account_name      String
  master_password   String
  euro_balance      Float?
  created_at        DateTime @default(now())
  expires_at        DateTime
}

model outstanding_debt {
  id              Int      @id @default(autoincrement())
  from_account    String
  to_account      String
  hbd_amount      Float
  created_at      DateTime @default(now())
}
```

❌ **INCORRECT** (camelCase):
```prisma
model accountCredentialSession {
  id              String   @id @default(cuid())
  accountName     String
  masterPassword  String
  euroBalance     Float?
  createdAt       DateTime @default(now())
  expiresAt       DateTime
}
```

**TypeScript/JavaScript Code**:
- Prisma Client automatically converts `snake_case` database names to `camelCase` in TypeScript
- Use the generated camelCase names in application code
- Only use snake_case when writing raw SQL queries

**Example**:
```typescript
// ✅ TypeScript code (Prisma Client - camelCase)
const session = await prisma.account_credential_session.create({
  data: {
    accountName: 'test-account',
    masterPassword: 'password123',
    euroBalance: 15.00,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000)
  }
});

// ✅ Raw SQL (snake_case)
const result = await prisma.$queryRaw`
  SELECT account_name, euro_balance
  FROM account_credential_session
  WHERE created_at > NOW() - INTERVAL '1 hour'
`;
```

---

## 🔄 State Management

### React Query Usage

**Convention**: Prefer React Query (TanStack Query) for server state management over local useState for data that comes from APIs or blockchain.

**When to use React Query**:
- Fetching data from external APIs (Hive-Engine, blockchain RPCs)
- Data that can become stale and needs refreshing
- Data shared across multiple components
- Data that benefits from caching

**When to use useState**:
- Pure UI state (modals, dropdowns, form inputs)
- Component-local state that doesn't come from a server
- Temporary state that doesn't need persistence

---

## 📝 Code Style

### TypeScript

**Convention**: Use TypeScript for all new code. Avoid `any` types when possible.

### Comments

**Convention**: Write comments that explain *why*, not *what*.
- The code itself should be clear about *what* it does
- Comments should explain business logic, architectural decisions, or non-obvious choices

**Example**:
```typescript
// ❌ Bad comment (explains what)
// Increment the counter by 1
counter++;

// ✅ Good comment (explains why)
// Add 1 cent to account for Stripe rounding in EUR->USD conversion
amountInCents++;
```

---

## 🏗️ Architecture

### File Organization

**Convention**: Keep related functionality together.

**Structure**:
```
app/
  api/           # API routes
  components/    # Shared UI components
  providers/     # React context providers
hooks/           # Custom React hooks
lib/             # Utility functions and shared logic
prisma/          # Database schema and migrations
services/        # Business logic and external service integrations
```

---

## 🔐 Security

### Environment Variables

**Convention**: Never commit secrets to git. All sensitive data must be in `.env` files.

**Required env vars checklist**:
- Database credentials
- API keys (Stripe, Resend, etc.)
- Private keys (blockchain)
- Webhook secrets

---

## 📚 Documentation

### Code Documentation

**Convention**: Update documentation when changing behavior.

**Files to update**:
- `PROJECT-OVERVIEW.md` - High-level architecture and status
- `FLOWS.md` - Payment flow details
- `CLAUDE.md` - This file (conventions)
- Inline code comments for complex logic

---

**Last Updated**: 2026-01-09
**Maintainer**: Development Team

**Note**: This document is a living document. Add new conventions as the project evolves.
