# ADR 0012: English for code and documentation, Spanish UI via i18n

Status: Accepted, 2026-10-18

## Context

The users are Spanish speakers in Bolivia. The codebase should be readable by any future collaborator or tool, and business vocabulary needs a stable mapping between the two languages.

## Decision

- Code, identifiers, commits, issues, pull requests, documentation and ADRs are in English.
- The UI is in Spanish, served through i18next with a single `es` locale in v1. No hardcoded user-facing strings in components.
- `01-domain.md` holds the glossary mapping English code terms to Spanish business terms. New concepts enter the glossary before they enter code.
- Error codes from `DomainError` are stable English identifiers; the web translates them.

## Consequences

- Adding a language later touches message files only.
- Conversations with the client stay in Spanish using the glossary terms; conversations in the repository stay in English.
- Test fixtures may contain Spanish text when they mimic user input.

## Alternatives considered

- Spanish identifiers: isolates the codebase from the ecosystem and produces mixed-language code.
- Hardcoded Spanish strings: cheap now, expensive to retrofit.
