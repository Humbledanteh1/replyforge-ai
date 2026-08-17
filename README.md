# ReplyForge AI

> Build once. Configure for any business. Let an AI agent handle every client reply with the right context, tone, and next step.

ReplyForge AI is a configurable platform for creating **rentable AI client-reply agents**. A creator defines the agent’s capabilities and guardrails, while each client supplies a plain-language description of their business, customers, offers, and communication preferences. The agent then uses that business context to draft or deliver helpful replies across supported channels.

## The idea

Most businesses answer the same categories of questions every day: product details, pricing, availability, order updates, policies, recommendations, and follow-ups. ReplyForge AI turns that repetitive work into a reusable service.

The platform is designed around a simple handoff:

| Who | What they provide | What they get |
| --- | --- | --- |
| **Creator** | A reusable agent configuration, personality, tools, and safety rules | A productized AI agent that can be rented to multiple clients |
| **Client** | A description of their business, offers, customers, and preferred tone | An agent that understands their business and handles routine replies |
| **Customer** | A question or request through a supported channel | A clear, on-brand response and an appropriate next step |

## Product principles

**Business-first configuration.** Clients should not need to understand prompts, vector databases, or model settings. They describe their business in everyday language, and the platform turns that context into an operational agent profile.

**Human control where it matters.** Agents should be able to answer routine questions confidently while escalating sensitive, ambiguous, or high-impact conversations to a human.

**Reusable by design.** A creator’s agent should be deployable across many client workspaces without mixing their data, identity, policies, or conversation history.

**Clear before clever.** The best reply is useful, accurate, and easy for a customer to act on. The system should prefer an honest escalation over an invented answer.

## Planned capabilities

- Guided client onboarding for business context, products, policies, FAQs, and tone.
- Reusable agent templates created and maintained by independent creators.
- Workspace isolation for creator, client, and conversation data.
- Reply drafting with approval mode and optional automatic sending.
- Knowledge ingestion from documents, URLs, FAQs, and structured business data.
- Guardrails for unsupported claims, sensitive topics, refunds, complaints, and escalation.
- Conversation review, quality feedback, and agent improvement workflows.
- Usage metering and rental-ready workspace management.
- Channel adapters for web chat, email, social messaging, and other supported providers.

## Example workflow

```text
Creator publishes an agent template
              ↓
Client describes their business and connects knowledge
              ↓
ReplyForge creates a client-specific agent profile
              ↓
Customer sends a question
              ↓
Agent retrieves relevant context and drafts a reply
              ↓
Agent sends, requests approval, or escalates to a human
```

## Repository structure

```text
replyforge-ai/
├── .github/
│   └── ISSUE_TEMPLATE/       # Structured contribution and product feedback templates
├── docs/
│   ├── agent-system-prompt.md # Core prompt, response contract, and runtime invariants
│   ├── architecture.md        # Multi-tenant architecture and request lifecycle
│   └── product-brief.md        # Product scope, personas, and first-release direction
├── examples/
│   └── sample-agent-profile.json
├── src/
│   └── README.md             # Planned application modules
├── .gitignore
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

## First-release direction

The first release should focus on a reliable core loop rather than a large number of integrations:

1. A creator publishes a reusable agent template.
2. A client completes guided business onboarding.
3. The system generates a client-specific knowledge and instruction profile.
4. A customer message is classified as answerable, unclear, sensitive, or requiring escalation.
5. The agent drafts a grounded response and records the reasoning context used for quality review.

The initial implementation can begin with a web chat or draft-only email workflow. Additional channels should be added after the core experience demonstrates strong accuracy, safe escalation, and clear client value.

## Implementation blueprint

The first implementation blueprint is documented in [docs/agent-system-prompt.md](docs/agent-system-prompt.md) and [docs/architecture.md](docs/architecture.md). Together they define the prompt layers, structured response contract, tenant boundaries, request lifecycle, policy gates, human review path, and recommended modular-monolith starting point.

## Project status

ReplyForge AI is in the **concept and foundation** stage. This repository currently contains the product brief and initial conventions. Application code, persistence, authentication, model providers, channel integrations, and billing workflows will be added incrementally.

## Contributing

Contributions are welcome. Before opening a pull request, please read [CONTRIBUTING.md](CONTRIBUTING.md) and review the product direction in [docs/product-brief.md](docs/product-brief.md). Early contributions should prioritize clear interfaces, tenant isolation, observability, safe defaults, and testable agent behavior.

## License

This project is released under the MIT License. See [LICENSE](LICENSE) for details.

## Roadmap

| Stage | Focus | Outcome |
| --- | --- | --- |
| 01 | Foundation | Repository conventions, domain model, and agent configuration format |
| 02 | Client onboarding | Guided business profile and knowledge setup |
| 03 | Reply engine | Grounded drafting, confidence signals, and escalation rules |
| 04 | Creator marketplace | Reusable templates, client workspaces, and rental controls |
| 05 | Channel expansion | Email, web chat, and provider integrations |
| 06 | Operations | Analytics, quality review, billing, and production hardening |

## Name

**ReplyForge** represents the core promise of the product: forge a reliable reply experience once, then adapt it to each business that uses it.
