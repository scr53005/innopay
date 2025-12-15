# PRISMA CLIENT REGENERATION - STEPS TO FIX

**Problem**: TypeScript errors in `app/api/verify/check-code/route.ts` - `email_verification` table doesn't exist in Prisma client types.

**Cause**: Windows file locking prevents Prisma from updating the generated client while VS Code or dev server is running.

---

## 🔧 SOLUTION:

### Step 1: Close Everything
1. **Stop dev server** (Ctrl+C in terminal)
2. **Close VS Code completely**
3. **Open Task Manager** (Ctrl+Shift+Esc)
4. **End all Node.js processes**

### Step 2: Wait & Delete (Optional)
```bash
# Wait 10 seconds for Windows to release file locks

# Try to delete .prisma folder (optional - may still be locked)
rm -rf node_modules/.prisma

# If "permission denied", that's OK - proceed to next step
```

### Step 3: Regenerate Prisma Client
```bash
npx prisma generate
```

**Expected output:**
```
✔ Generated Prisma Client (6.x.x) to ./node_modules/@prisma/client in XXXms
```

### Step 4: Start Dev Server
```bash
npm run dev
```

### Step 5: Verify It Worked
1. Open VS Code
2. Open `app/api/verify/check-code/route.ts`
3. TypeScript errors should be GONE
4. `prisma.email_verification` should now have autocomplete

---

## 🔄 IF STEP 3 FAILS:

### Option A: Restart Computer
1. Restart Windows
2. After restart, run:
   ```bash
   npx prisma generate
   npm run dev
   ```

### Option B: Use PowerShell as Admin
1. Right-click PowerShell → "Run as Administrator"
2. Navigate to innopay folder:
   ```powershell
   cd C:\Users\Sorin\Documents\GitHub\innopay
   ```
3. Run:
   ```powershell
   npx prisma generate
   npm run dev
   ```

---

## ✅ VERIFICATION CHECKLIST:

After `npx prisma generate`:
- [ ] No errors in terminal
- [ ] Message shows "Generated Prisma Client"
- [ ] File exists: `node_modules/@prisma/client/index.d.ts`
- [ ] File exists: `node_modules/.prisma/client/query_engine-windows.dll.node`
- [ ] VS Code shows no TypeScript errors in verify routes
- [ ] Dev server starts without errors

---

## 📝 CONTEXT (for when you reopen):

**What was implemented:**
- Email verification system with 6-digit codes
- Multilingual email templates (EN/FR/DE/LB)
- 3-step UI flow: Email → Code → Account Selection
- Temporal account filtering (complex logic)
- Resend integration for email delivery

**Database changes:**
- New table: `email_verification` (snake_case columns)
- Migration: `20251129170507_add_email_verification_table`
- Already applied to PostgreSQL successfully

**Files to check after fix:**
- `app/api/verify/request-code/route.ts` ✅
- `app/api/verify/check-code/route.ts` ⚠️ (has TypeScript errors)
- `app/api/verify/get-credentials/route.ts` ✅
- `app/user/page.tsx` ✅

**Environment variables needed:**
- `RESEND_API_KEY` (in .env.local)
- `RESEND_FROM_EMAIL=noreply@verify.innopay.lu`

**Testing after fix:**
1. Go to: http://192.168.178.55:3000/user
2. Click "Importer un compte"
3. Enter: scr53005@gmail.com
4. Should send verification email
5. Enter 6-digit code
6. Should return account(s)

---

**Date**: 2025-11-29
**Next session**: Continue with end-to-end testing after Prisma client regeneration
