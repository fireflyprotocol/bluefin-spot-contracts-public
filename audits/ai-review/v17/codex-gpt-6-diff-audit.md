# Bluefin Spot v17 — retrospective AI diff security review

| Item | Value |
|---|---|
| Reviewer | OpenAI Codex (GPT-6) |
| Review date | 2026-10-16 UTC |
| Timing | Retrospective. The v17 mainnet upgrade occurred on 2025-12-10; this review cannot establish that an AI review happened before that upgrade. |
| Scope | Production changes from Spot v16 to v17, including their immediate callers and affected swap accounting. This is a diff review, not a full-package audit. |
| v16 source baseline used | Private `fireflyprotocol/bluefin-spot-contracts` commit [`f72fdb3d4c2ee08f87ef348cc6200857b4146252`](https://github.com/fireflyprotocol/bluefin-spot-contracts/commit/f72fdb3d4c2ee08f87ef348cc6200857b4146252); its on-chain byte match is not archived here. |
| v17 source target | Private commit [`d4d1608e44e3349d7e7352352a4950733868110a`](https://github.com/fireflyprotocol/bluefin-spot-contracts/commit/d4d1608e44e3349d7e7352352a4950733868110a), whose 18 `sources/**/*.move` Git blobs exactly match public commit [`2ba80c8076bef236b21d567f26f7014aebab0b6b`](https://github.com/fireflyprotocol/bluefin-spot-contracts-public/commit/2ba80c8076bef236b21d567f26f7014aebab0b6b). Current public `main` has the same 18 source blobs. |
| Mainnet packages | v16 `0x5d029d551d589105a9589e47ef75ffaa43e6d9d1d844745867db2a56e18f65e1` → v17 `0xd075338d105482f1527cbfd363d6413558f184dec36d9138a70261e87f486e9c` |
| Upgrade transaction | `CShZDVqJQrXm4SYiCgDe49kKnFzadwhFV5viqHLgRfaX` |

## Evidence and method

I reviewed the [private source comparison](https://github.com/fireflyprotocol/bluefin-spot-contracts/compare/f72fdb3d4c2ee08f87ef348cc6200857b4146252...d4d1608e44e3349d7e7352352a4950733868110a) and traced every production change through its direct callers. The comparison contains three commits and touches all 18 source files, largely through licence headers, lint attributes, and test-only code. Four modules contain production changes: `clmm_math`, `gateway`, `oracle`, and `config`. The local v16 and v17 compiled artifacts also differ in exactly those four modules.

The archived v17 build and upgrade-transaction data in this workspace match byte-for-byte for all 18 modules. The upgrade transaction identifies the v16 package as its `currentPackage`. A local v16 build is sourced from all 18 files at `f72fdb3`, but I found no archived comparison of that build against the v16 on-chain bytecode. Therefore the v16 **source-to-chain** match remains unverified in this review. Contract `config::VERSION` changes from 8 to 9; this internal counter is distinct from the mainnet package versions v16 and v17.

This was a static review. I did not run Move tests, fuzzing, or a mainnet transaction simulation: the Sui CLI is unavailable in this environment. I checked the existing unit tests as coverage evidence, not as a substitute for executing them.

## Result

No Critical, High, or Medium issue was identified in the changed production code. One conditional integration risk was identified.

| ID | Severity | Status | Finding |
|---|---|---|---|
| S17-D01 | Low | Confirmed behavior; downstream impact depends on integration | `route_swap` can complete an exact-output request with less output than requested. |

### S17-D01 — exact-output route swaps can partially fill

**Changed code.** In v16, `gateway::route_swap` asserted both `in_amount == amount` for exact-input calls and `out_amount == amount` for exact-output calls. V17 removes those assertions. In the exact-output branch of [`sources/gateway.move:425–429`](../../../sources/gateway.move#L425), the check is now only:

```move
assert!(in_amount <= amount_limit, errors::slippage_exceeds());
```

The removed v16 check was `assert!(out_amount == amount, 1)`.

**Execution path.** [`pool::swap_in_pool`](../../../sources/pool.move#L1567) stops when its `sqrt_price_max_limit` is reached even if `amount_specified_remaining > 0` (line 1603). [`pool::flash_swap`](../../../sources/pool.move#L817) computes actual exact-output fill as `amount_specified - amount_specified_remaining` (lines 846–850). `route_swap` then pays the actual input and returns the actual output coins (lines 431–449). A partially filled exact-output call therefore succeeds whenever that input is at most `amount_limit`.

**Scenario and impact.** A router requests 100 units of output with `amount_limit = 100` units of input and supplies a price limit that stops the swap early. If the pool fills only 10 output for 20 input, the call succeeds: `20 <= 100`, although the realized input/output ratio is 2 rather than the ratio of 1 that the router may infer from `amount_limit / amount`. A caller or downstream integration that assumes the requested 100 units were received can underdeliver or accept an execution price outside its intended bound. The concrete 100/20/10 values illustrate the condition; they are not a reproduced mainnet transaction. A downstream exact-balance check would abort the transaction.

**Preconditions.** The caller uses `by_amount_in = false`; the price limit is reached before the requested output is filled; and the caller relies on the old full-fill behavior or on `amount_limit / amount` without checking the returned output. I did not identify a live router with those assumptions, so no direct loss exploit is established. `gateway::swap_assets` already allowed partial exact-output fills before v17, but this behavior is newly introduced to `route_swap`.

**Recommendation.** Restore a full-fill assertion for exact-output `route_swap` calls, or explicitly support partial fills and require the calling route to check final output and its effective input/output bound. Add a regression test that reaches the price limit with output remaining. The current exact-output route test in [`tests/unit/test_gateway.move:1078`](../../../tests/unit/test_gateway.move#L1078) burns both returned coins without asserting their values.

For exact-input route calls, a partial fill returns unused input and the `out_amount >= amount_limit` check remains; I found no analogous minimum-output bypass in that mode.

## Other production changes checked

| Module | v16 → v17 change | Assessment |
|---|---|---|
| [`clmm_math`](../../../sources/maths/clmm_math.move#L319) | `compute_swap_step` returns `(0, 0, target_sqrt_price, 0)` when current and target prices are equal, as it already did for zero liquidity. | The caller's swap loop then exits at the price limit or crosses the reached tick and advances the tick index. I found no zero-amount payout, fee, or unbounded equal-price loop caused by this change. |
| [`oracle`](../../../sources/oracle.move#L251) | Eight public getters expose observation-manager or observation values. | All take immutable references and return values; no mutation or authority is added. |
| [`config`](../../../sources/config.move#L40) | Internal `VERSION` increases from 8 to 9. | `verify_version` checks equality (line 123); the AdminCap-gated upgrade path increments the stored version through `admin::update_supported_version`. The live config object's current value was not queried in this review. |

Other changed source files add licence text, lint allowances, whitespace, or `#[test]` / `#[test_only]` code. They add no production behavior in the reviewed diff. This result does not assess pre-existing issues elsewhere in the package, older package versions, external routers, or dependency implementations.
