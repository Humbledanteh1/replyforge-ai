# Contributing to ReplyForge AI

Thank you for helping shape ReplyForge AI. This project is still establishing its foundations, so contributions that improve clarity, safety, and maintainability are especially valuable.

## Before you begin

Please read the [README](README.md) and [product brief](docs/product-brief.md) before proposing a change. An issue is usually the best place to discuss a substantial feature, architecture change, integration, or change to the product direction.

## Contribution principles

Keep client workspaces isolated, keep secrets out of the repository, and prefer explicit interfaces over hidden behavior. Agent behavior should be testable with representative conversations, and any change that affects replies should consider unsupported claims, escalation, human approval, and observability.

Avoid adding provider-specific behavior to the core domain unless there is a clear abstraction boundary. A channel adapter or model provider should be replaceable without rewriting the client workspace and reply-decision logic.

## Pull requests

A pull request should explain the problem, the proposed solution, and any trade-offs. Include tests or evaluation examples when changing agent behavior. Document configuration changes and update the relevant product or API documentation when the public behavior changes.

Please keep pull requests focused. Smaller, reviewable changes are easier to validate and safer to merge.

## Reporting issues

Use the issue templates when available. Do not include API keys, customer data, private conversations, credentials, or other sensitive information in issues or pull requests. For security concerns, contact the repository owner privately rather than opening a public issue.

## Commit messages

Use concise, descriptive commit messages that explain the change. For example:

```text
feat: add client business profile schema
fix: prevent cross-workspace knowledge retrieval
 docs: clarify escalation states
```
