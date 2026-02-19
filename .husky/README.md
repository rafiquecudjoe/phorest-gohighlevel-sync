# Pre-Push Git Hooks

This project uses [Husky](https://typicode.github.io/husky/) to run automated checks before pushing code to the repository.

## What Happens Before Push?

When you run `git push`, the following automated checks will run:

### 1. **Code Formatting** 📝
- Runs `npm run format` (Prettier)
- Automatically formats all TypeScript files in `src/` and `test/` directories
- If formatting changes are detected:
  - All formatted files are staged automatically
  - A commit is created with message: `style: auto-format code with prettier [pre-push]`
  - The commit is added to your push

### 2. **Test Suite** 🧪
- Runs `npm run test` (Jest)
- Executes all 264 tests across 14 test suites
- **Push is blocked if any test fails**
- You must fix failing tests before pushing

## Setup

The pre-push hook is automatically configured when you:
1. Clone the repository
2. Run `npm install` or `pnpm install`

The `prepare` script in `package.json` ensures Husky is initialized.

## Manual Setup

If hooks aren't working, you can manually set up:

```bash
# Install Husky
pnpm add -D husky

# Initialize Husky
npx husky init

# Make pre-push hook executable (if needed)
chmod +x .husky/pre-push
```

## Bypassing Hooks (Not Recommended)

In emergency situations, you can skip the pre-push hook:

```bash
git push --no-verify
```

**⚠️ Warning:** Only use `--no-verify` in exceptional circumstances. Always ensure:
- Code is properly formatted
- All tests pass before pushing

## Hook Behavior

### ✅ Success Flow
```
🔍 Running pre-push checks...
📝 Running prettier format...
✅ No formatting changes needed
🧪 Running tests...
✅ All tests passed!
🚀 Proceeding with push...
```

### 📦 Auto-Commit Flow
```
🔍 Running pre-push checks...
📝 Running prettier format...
📦 Formatting created changes. Auto-committing...
✅ Formatted changes committed
🧪 Running tests...
✅ All tests passed!
🚀 Proceeding with push...
```

### ❌ Failure Flow
```
🔍 Running pre-push checks...
📝 Running prettier format...
✅ No formatting changes needed
🧪 Running tests...
❌ Tests failed! Push aborted.
Please fix the failing tests before pushing.
```

## Benefits

✅ **Consistent Code Style:** All pushed code is automatically formatted  
✅ **Quality Assurance:** Broken code never reaches the repository  
✅ **Zero Manual Effort:** Formatting happens automatically  
✅ **Team Efficiency:** Reduces review time and formatting discussions  
✅ **CI/CD Reliability:** Prevents failed builds in CI pipeline  

## Troubleshooting

### Hook Not Running?

1. Check if Husky is installed:
   ```bash
   ls -la .husky/
   ```

2. Verify hook is executable:
   ```bash
   ls -l .husky/pre-push
   ```
   Should show: `-rwxr-xr-x` (executable)

3. Re-initialize Husky:
   ```bash
   npm run prepare
   ```

### Tests Taking Too Long?

The test suite runs with `--testTimeout=100000` and `--runInBand` flags, which may take 30-60 seconds. This is expected behavior for comprehensive integration tests.

### Formatting Creates Unwanted Changes?

1. Review your Prettier configuration in the project
2. Ensure your editor uses the same Prettier version
3. Consider running `npm run format` before committing

## Files

- `.husky/pre-push` - Pre-push hook script
- `package.json` - Contains `prepare` script for Husky initialization
- `.prettierrc` or similar - Prettier configuration

## Related Scripts

```bash
npm run format          # Format code manually
npm run test            # Run tests manually
npm run lint            # Run ESLint with auto-fix
```

---

**Note:** This setup ensures code quality and consistency across the entire team. All developers must have these hooks enabled.
