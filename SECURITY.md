# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the latest major version.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please report it privately to the maintainers. Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond as soon as possible and work with you to resolve the issue.

## Security Best Practices

When deploying Obelisk Skiller:

- **Never commit** `.env`, `.env.local`, or any file containing secrets
- Use strong, randomly generated values for `XP_API_KEY`, `XP_SIGNING_SECRET`, and `JWT_SECRET`
- Store `PRIVATE_SERVER_WALLET` only in secure secret managers (e.g., Railway, Vercel)
- Rotate credentials if they may have been exposed
- Use environment-specific RPC URLs and avoid sharing API keys
