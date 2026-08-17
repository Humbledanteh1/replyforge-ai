# Planned application modules

This directory is reserved for the first implementation of ReplyForge AI. The application should keep the core domain independent from model providers, message channels, and billing providers.

A possible starting layout is:

```text
src/
├── domain/          # Workspace, template, deployment, conversation, and reply decisions
├── agent/           # Context assembly, intent classification, drafting, and escalation
├── knowledge/       # Ingestion, chunking, retrieval, and source attribution
├── channels/        # Web chat, email, and other provider adapters
├── evaluation/      # Conversation fixtures, quality checks, and regression tests
├── services/        # Application use cases and orchestration
└── shared/          # Configuration, logging, errors, and common types
```

The first implementation should preserve these boundaries even if the initial deployment is a single service. Separating interfaces early will make it easier to support additional model providers and communication channels later.
