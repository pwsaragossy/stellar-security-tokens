# README Etherfuse Ramp Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `README.md` to highlight on-ramp, off-ramp, Pix, USDC, and Etherfuse capabilities.

**Architecture:** This is a documentation-only change. The README should describe platform capabilities without inventing unverified API behavior or changing runtime code.

**Tech Stack:** Markdown, existing repository docs, Node/React/Stellar/Soroban context.

---

## File Structure

- Modify: `README.md` - primary public project overview and quick-start documentation.
- Create: `docs/superpowers/plans/2026-05-16-readme-etherfuse-ramp.md` - this implementation plan.

### Task 1: Refresh README Feature Positioning

**Files:**
- Modify: `README.md`

- [x] **Step 1: Inspect current README**

Run: `sed -n '1,260p' README.md`

Expected: current README shows general Stellar tokenization features, fee system, setup, docs, and tests, but does not prominently mention Etherfuse ramp flows.

- [x] **Step 2: Add ramp-focused overview**

Update the introductory paragraph and feature list to mention tokenized real-world assets, Passkeys, Stellar/Soroban, Etherfuse USDC, Pix on-ramp, and Pix off-ramp.

- [x] **Step 3: Add a dedicated ramp section**

Add a `## On-ramp, Off-ramp, Pix e USDC` section that explains:

- on-ramp: Pix deposit converted into USDC through Etherfuse-supported flows;
- off-ramp: USDC withdrawal converted back to BRL/Pix where configured;
- investor wallet flow: Passkey/Freighter wallet usage;
- operational dependency: credentials, webhooks, treasury liquidity, and reconciliation.

- [x] **Step 4: Verify Markdown**

Run: `sed -n '1,280p' README.md`

Expected: README remains valid Markdown, concise, and specific to this repository.

- [x] **Step 5: Commit**

```bash
git add README.md docs/superpowers/plans/2026-05-16-readme-etherfuse-ramp.md
git commit -m "docs: highlight etherfuse ramp flows"
```
