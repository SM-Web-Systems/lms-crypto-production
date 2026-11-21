# Testnet Account Funding Specification

**Date:** 2026-08-19
**Status:** BLOCKED — Requires dedicated keypair and approval

## Problem Statement

A testnet minter account must be funded with testnet XLM to deploy a contract and execute test mints.

## Funding Source

Stellar testnet uses Friendbot: `https://friendbot.stellar.org?addr=<PUBLIC_KEY>`
- Free, unlimited testnet XLM.
- No production value.
- Network may be reset periodically.

## Requirements

1. Generate a dedicated testnet-only Stellar keypair.
2. Fund via Friendbot (10,000 testnet XLM per request).
3. Store the testnet secret key separately from production.
4. Never use the production minter secret on testnet.
5. Never use the testnet secret on production.

## Explicit Approvals Required

1. Generate testnet keypair — REQUIRES APPROVAL.
2. Fund via Friendbot — REQUIRES APPROVAL.
