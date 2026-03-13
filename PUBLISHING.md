# Publishing Guide

This guide explains how to publish a new version of @eazo/node-sdk to NPM.

## Prerequisites

1. **NPM Account**: You need an NPM account with publish permissions for the `@eazo` scope
2. **NPM Token**: Create an automation token in your NPM account:
   - Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Click "Generate New Token"
   - Select "Automation" type
   - Copy the token

3. **GitHub Secret**: Add the NPM token to GitHub:
   - Go to your repository settings
   - Navigate to "Secrets and variables" → "Actions"
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Paste your NPM automation token

## Publishing Process

### Automatic Publishing (Recommended)

The package is automatically published when you push a git tag:

```bash
# Create and push a tag
git tag 0.0.1
git push origin 0.0.1

# Or with v prefix
git tag v1.0.0
git push origin v1.0.0

# Or with V prefix
git tag V1.0.0
git push origin V1.0.0
```

The CI will:
1. ✅ Extract version from tag (removes v/V prefix)
2. ✅ Install dependencies
3. ✅ Run tests
4. ✅ Build TypeScript
5. ✅ Update package.json version
6. ✅ Publish to NPM
7. ✅ Create GitHub Release

### Supported Tag Formats

All these formats work:
- `0.0.1` → publishes as `0.0.1`
- `v0.0.1` → publishes as `0.0.1`
- `V0.0.1` → publishes as `0.0.1`
- `1.2.3` → publishes as `1.2.3`
- `v1.2.3` → publishes as `1.2.3`

### Manual Publishing

If you need to publish manually:

```bash
cd nodejs

# Update version in package.json
npm version 1.0.0 --no-git-tag-version

# Login to NPM (first time only)
npm login

# Build and test
npm run build
npm test

# Publish
npm publish --access public
```

## Version Guidelines

Follow [Semantic Versioning](https://semver.org/):

- **Major version** (1.0.0 → 2.0.0): Breaking changes
- **Minor version** (1.0.0 → 1.1.0): New features, backward compatible
- **Patch version** (1.0.0 → 1.0.1): Bug fixes, backward compatible

## Pre-release Checklist

Before creating a release tag:

- [ ] Update version in `package.json` (optional, CI will do it)
- [ ] Update `CHANGELOG.md` with changes
- [ ] Run tests locally: `npm test`
- [ ] Build locally: `npm run build`
- [ ] Update documentation if needed
- [ ] Commit all changes

## Troubleshooting

### CI fails with "npm ERR! 403 Forbidden"

**Solution**: Check that:
1. `NPM_TOKEN` secret is set correctly in GitHub
2. Your NPM account has permissions for `@eazo` scope
3. The token hasn't expired

### CI fails with "tag already exists"

**Solution**: Delete the remote tag and recreate:
```bash
git tag -d 1.0.0
git push origin :refs/tags/1.0.0
git tag 1.0.0
git push origin 1.0.0
```

### Package already published

**Solution**: NPM doesn't allow republishing the same version. Increment the version:
```bash
git tag 1.0.1
git push origin 1.0.1
```

## Post-publish

After successful publishing:

1. ✅ Verify on NPM: https://www.npmjs.com/package/@eazo/node-sdk
2. ✅ Test installation: `npm install @eazo/node-sdk@latest`
3. ✅ Check GitHub Release was created
4. ✅ Update documentation if needed
5. ✅ Announce the release (if major version)

## CI Workflow File

The workflow is defined in `.github/workflows/publish.yml`. It:
- Triggers on any tag push
- Extracts version from tag name
- Runs tests before publishing
- Publishes to NPM with public access
- Creates a GitHub Release

For more details, see the workflow file.
