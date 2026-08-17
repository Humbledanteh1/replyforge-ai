# ReplyForge AI Product Brief

## Overview

ReplyForge AI is a multi-tenant platform for creators who build reusable AI agents and rent them to businesses. A client should be able to explain their business without learning prompt engineering, then receive a configured reply agent that understands their offer, audience, policies, and preferred communication style.

The first product experience is intentionally narrow: help a business respond to routine client questions accurately, consistently, and with an easy path to human escalation.

## Personas

| Persona | Primary need | Success signal |
| --- | --- | --- |
| Creator | Build and reuse a high-quality reply agent for multiple businesses | A template can be configured, tested, and deployed without duplicating its core logic |
| Client | Make the agent understand a specific business quickly | The client can complete onboarding and review the agent’s behavior without technical setup |
| Customer | Receive a useful answer to a real question | The answer is relevant, honest, on-brand, and gives a clear next step |
| Operator | Monitor quality, safety, and usage | Failures, escalations, and workspace boundaries are observable and reviewable |

## Core workflow

### Creator setup

The creator defines the reusable agent template. This includes the role, tone, supported tasks, escalation categories, response format, tool permissions, and quality criteria. The creator should be able to test the template against example conversations before making it available to clients.

### Client onboarding

The client completes a guided business profile. The profile may include the business description, products or services, target customers, operating hours, pricing rules, policies, frequently asked questions, brand voice, contact details, and examples of excellent replies.

The platform should show the client what the agent understood and allow corrections before the agent handles real conversations.

### Reply handling

When a message arrives, the system identifies the likely intent, retrieves relevant client context, applies the creator’s instructions and the client’s policies, and produces a response. Each response should carry a confidence or review state such as `ready`, `needs_review`, or `escalate`.

### Feedback loop

Clients and creators should be able to mark replies as helpful, incorrect, incomplete, off-brand, or unsafe. Feedback should improve the client workspace without changing the shared creator template unless the creator explicitly publishes an update.

## Initial domain model

| Entity | Purpose | Important boundary |
| --- | --- | --- |
| `Creator` | Owns reusable agent templates | Can manage templates and client relationships |
| `AgentTemplate` | Reusable behavior and configuration | Must not contain client-specific private data |
| `ClientWorkspace` | Isolated business environment | Owns business context, knowledge, and settings |
| `AgentDeployment` | Connects a template to a client workspace | Captures version and deployment status |
| `KnowledgeSource` | Stores a document, URL, FAQ, or structured source | Belongs to one client workspace |
| `Conversation` | Groups messages for a customer interaction | Belongs to one client workspace |
| `ReplyDecision` | Records answer, confidence, sources, and escalation state | Must be reviewable for quality and safety |
| `ChannelConnection` | Connects a workspace to a message provider | Credentials must be isolated and protected |

## First-release scope

The first release should include creator template configuration, client onboarding, a business profile, a small knowledge base, a draft-only reply workflow, response review, basic escalation, and an evaluation set built from sample conversations.

The first release should not attempt to solve every channel, provide autonomous actions with financial impact, or promise universal support for every business type. Those capabilities can follow once the core reply quality and safety loop is measurable.

## Safety and quality requirements

The agent must not invent product details, availability, pricing, policies, delivery commitments, or business claims that are absent from the client’s approved context. When information is missing or contradictory, it should ask a clarifying question or escalate.

Sensitive conversations—including legal threats, safety concerns, self-harm disclosures, harassment, identity verification, payment disputes, and highly emotional complaints—should receive a controlled response and a human review path rather than unrestricted automation.

Every workspace must be isolated. A client’s knowledge, conversations, credentials, and feedback must never be available to another client or to a shared creator template by accident.

The system should preserve enough structured context to explain why a reply was produced, which approved sources informed it, which rules were applied, and whether the reply was sent automatically or approved by a person.

## Product metrics

| Area | Initial metric |
| --- | --- |
| Helpfulness | Percentage of reviewed replies marked helpful or complete |
| Grounding | Percentage of replies supported by approved client context |
| Safety | Rate of unsafe or unsupported replies found in evaluation |
| Efficiency | Median time from inbound message to approved reply |
| Adoption | Percentage of onboarded clients who activate a deployment |
| Retention | Repeat usage of an agent across the client’s active period |

## Open questions

- Which channel should be the first production integration: web chat, email, or a shared inbox?
- Should creators charge per workspace, per conversation, or through a subscription split?
- What level of tool use should be available in the first release?
- How should template updates be reviewed before they reach existing client deployments?
- Which business categories should be supported first to keep the initial evaluation set focused?
