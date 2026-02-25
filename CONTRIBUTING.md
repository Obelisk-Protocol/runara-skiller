# Contributing to Obelisk Skiller

Thank you for your interest in contributing! This document provides guidelines for contributing to the Obelisk Skiller backend service.

## Development Setup

1. **Clone the repository** and navigate to the `skiller` directory
2. **Install dependencies**: `npm install`
3. **Copy environment template**: `cp env.example .env`
4. **Configure `.env`** with your own values (see README for required variables)
5. **Apply database migrations** in order from the `migrations/` folder
6. **Start development server**: `npm run dev`

## Code Standards

- **TypeScript**: Use strict types, avoid `any`
- **Formatting**: Follow project ESLint/Prettier configuration
- **Commits**: Use clear, descriptive commit messages

## Pull Request Process

1. Fork the repository and create a feature branch
2. Make your changes with tests where applicable
3. Run `npm run lint` and `npm run build` to verify
4. Submit a pull request with a clear description of changes
5. Ensure CI passes (if configured)

## Reporting Issues

- Use the issue tracker for bugs and feature requests
- Include steps to reproduce for bug reports
- Check existing issues before creating new ones

## Security

- **Never** commit secrets, API keys, or private keys
- Report security vulnerabilities privately to the maintainers
- The `env.example` file shows required variables—use your own values

## Questions?

Open an issue for general questions or discussion.
