# Security Policy

## Supported Versions

AGENTS.md Doctor is pre-1.0 and moves quickly. Security fixes are applied to
the latest main branch first.

## Reporting a Vulnerability

Please report vulnerabilities privately before public disclosure.

Preferred channel:

- Use GitHub private vulnerability reporting for this repository if available.

Fallback channel (when private vulnerability reporting is not available):

- Contact the maintainer before opening a public issue.
- Until private vulnerability reporting is enabled, do not include secrets,
  exploit details, private keys, or credential material in public issues.

Include:

1. What behavior is unsafe.
2. Steps to reproduce.
3. Expected safe behavior.
4. Actual behavior and impact.

Do not open public issues for vulnerabilities involving secrets, credential
leakage, command execution, or repository data exposure.

## Security Boundaries

Current design goals:

- Never execute commands found inside `AGENTS.md`.
- Never upload repository contents.
- Keep file reads constrained to the repository root.
- Treat findings as analysis output, not execution instructions.
