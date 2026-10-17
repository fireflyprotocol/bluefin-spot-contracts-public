# Bluefin Spot v17 — Frontier-AI Security Review (Claude Opus 5.5)

## Review details

| | |
|---|---|
| Model | Claude Opus 5.5 (`claude-opus-5-5`), Anthropic |
| Date | 2026-10-16 |
| Run by | Bluefin security team |
| Timing | After deployment. v17 has been live on mainnet since 2025-12-10. |
| Scope | The v16 → v17 upgrade: every production-code change, reviewed together with the code that calls it and the code it calls |

## Release

| | |
|---|---|
| Package (v17) | `0xd075338d105482f1527cbfd363d6413558f184dec36d9138a70261e87f486e9c` |
| Upgrade transaction | `CShZDVqJQrXm4SYiCgDe49kKnFzadwhFV5viqHLgRfaX` (2025-12-10 17:56:41 UTC) |
| Target commit | [`2ba80c8076bef236b21d567f26f7014aebab0b6b`](https://github.com/fireflyprotocol/bluefin-spot-contracts-public/commit/2ba80c8076bef236b21d567f26f7014aebab0b6b) |
| Baseline (v16) | Package `0x5d029d551d589105a9589e47ef75ffaa43e6d9d1d844745867db2a56e18f65e1`, commit `f72fdb3d4c2ee08f87ef348cc6200857b4146252` (private development repository) |

Both commits were rebuilt and match the on-chain bytecode byte-for-byte: v17 with Sui CLI `mainnet-v1.61.2`, v16 with `mainnet-v1.54.2`.

## Changes reviewed

On-chain, 4 of the 18 modules changed. The other source differences are licence headers, lint attributes and test-only code, and the bytecode of those modules is unchanged.

- `clmm_math::compute_swap_step` now returns early when `current_sqrt_price == target_sqrt_price`.
- `gateway::route_swap` no longer asserts `in_amount == amount` (exact-in) or `out_amount == amount` (exact-out).
- `oracle` has new public read-only getters.
- `config::VERSION` went from 8 to 9.

## Results

No security issues found.

| ID | Severity | Title |
|---|---|---|
| AI-01 | Informational | `route_swap` now allows partial fills, so exact-out callers can receive less than they asked for |

### AI-01 — `route_swap` partial fills

**Where:** `sources/gateway.move`, `route_swap`

When a swap reaches `sqrt_price_max_limit` before the full amount is used, `route_swap` now succeeds where it used to abort.

- **Exact-in:** the caller pays only `in_amount`, any unspent input is returned, and `out_amount >= amount_limit` is still enforced.
- **Exact-out:** the caller can receive less than `amount`. The only check left is `in_amount <= amount_limit`, and the caller's `sqrt_price_max_limit` bounds the execution price.

**Recommendation:** integrators that need an exact output amount should check the returned coin values or set a tight price limit.
