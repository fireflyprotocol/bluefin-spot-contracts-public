# Bluefin Spot v17 — Test Coverage

| | |
|---|---|
| Release | v17, package `0xd075338d105482f1527cbfd363d6413558f184dec36d9138a70261e87f486e9c` |
| Source | commit [`2ba80c8`](https://github.com/fireflyprotocol/bluefin-spot-contracts-public/commit/2ba80c8076bef236b21d567f26f7014aebab0b6b) |
| Toolchain | Sui CLI `mainnet-v1.61.2`, with the `Sui` dependency pinned to `6c229fe6c04fb21ec98751c798e57e9a00e028e2`. This is the toolchain that reproduces the deployed bytecode. |
| Tests | 673 Move unit tests (`tests/unit/` and in-module `#[test]` functions). All pass. |
| Generated | 2026-10-17 |

## Coverage (production code)

| File | Lines | Line coverage | Branches | Branch coverage |
|---|---:|---:|---:|---:|
| `sources/admin.move` | 151 / 153 | 98.69% | 66 / 79 | 83.54% |
| `sources/bit_math.move` | 54 / 54 | 100.00% | 61 / 61 | 100.00% |
| `sources/config.move` | 50 / 50 | 100.00% | 30 / 31 | 96.77% |
| `sources/constants.move` | 32 / 32 | 100.00% | 0 / 0 | n/a |
| `sources/errors.move` | 84 / 84 | 100.00% | 0 / 0 | n/a |
| `sources/events.move` | 240 / 240 | 100.00% | 0 / 0 | n/a |
| `sources/gateway.move` | 169 / 173 | 97.69% | 68 / 73 | 93.15% |
| `sources/handlers/i128H.move` | 42 / 42 | 100.00% | 4 / 4 | 100.00% |
| `sources/handlers/i32H.move` | 36 / 36 | 100.00% | 0 / 0 | n/a |
| `sources/handlers/i64H.move` | 36 / 36 | 100.00% | 0 / 0 | n/a |
| `sources/maths/clmm_math.move` | 190 / 196 | 96.94% | 146 / 152 | 96.05% |
| `sources/maths/tick_math.move` | 150 / 150 | 100.00% | 163 / 163 | 100.00% |
| `sources/oracle.move` | 117 / 136 | 86.03% | 60 / 66 | 90.91% |
| `sources/pool.move` | 867 / 1045 | 82.97% | 271 / 425 | 63.76% |
| `sources/position.move` | 148 / 154 | 96.10% | 38 / 52 | 73.08% |
| `sources/tick_bitmap.move` | 41 / 41 | 100.00% | 30 / 32 | 93.75% |
| `sources/tick.move` | 117 / 117 | 100.00% | 45 / 46 | 97.83% |
| `sources/utils.move` | 48 / 48 | 100.00% | 33 / 35 | 94.29% |
| **Total** | **2572 / 2787** | **92.29%** | **1015 / 1219** | **83.26%** |

Uncovered production lines are listed in [`uncovered-lines.md`](uncovered-lines.md).

### How these numbers were produced

```sh
sui move test --coverage --trace
sui move coverage lcov                       # writes lcov.info
sui move coverage source --module <module>   # per-module covered/uncovered source
```

- **Lines.** A line is covered if `lcov.info` records a hit on it. It is uncovered if `sui move coverage source` marks code on it as uncovered and it has no hit.
- **Branches.** Branches come from the LCOV `BRDA` records.
- **Production code only.** Lines inside `#[test]` and `#[test_only]` items are excluded. `sources/maths/clmm_math.move`, for example, contains in-module test functions.
- **Raw data.** [`lcov.info`](lcov.info) is the CLI output limited to this package's `sources/`. Its own totals include test code, so they differ slightly from the table above.
- **Out of scope.** The TypeScript integration tests in `tests/*.test.ts` are not included.

## Authorization checks → tests

A negative test counts only if it is `#[expected_failure]` with the abort code and location of the check itself. Test names are `file::function`.

| Check | Location | Positive test | Negative test |
|---|---|---|---|
| `AdminCap` / `ProtocolFeeCap` required (13 functions: cap transfers, protocol and creation fee claims, reward manager add and remove, pause, version, protocol fee share, observation cardinality, creation fee, reward reserves, icon URL) | `admin.move` | `test_admin::should_transfer_admin_cap`; `test_admin::should_transfer_protocol_fee_cap`; `test_admin::should_claim_protocol_fee_via_admin_cap`; `test_admin::should_be_able_to_claim_pool_creation_fee`; `test_admin::should_be_able_to_add_reward_manager`; `test_admin::should_be_able_to_remove_reward_manager`; `test_admin::should_be_able_to_update_pool_pause_status`; `test_admin::should_be_able_to_update_supported_version`; `test_admin::should_be_able_to_update_protocol_fee_share`; `test_admin::should_be_able_to_increase_observation_cardinality_next`; `test_admin::should_be_able_to_set_pool_creation_fee`; `test_admin::should_be_able_to_add_reserve_to_pool_rewards`; `test_admin::should_be_able_to_set_pool_icon_url` | n/a ¹ |
| Pool manager only: `set_manager` (1023) | `pool.move:set_manager`, `admin.move:set_pool_manager` | `test_pool::test_pool_manager_operations`; `test_admin::should_be_able_to_set_pool_manager` | MISSING |
| Reward manager or pool manager: `initialize_pool_reward` (1023) | `admin.move` | `test_admin::should_be_able_to_add_rewards_to_pool` | `test_admin::should_not_be_able_to_add_rewards_to_pool_due_to_not_invalid_manager` |
| Reward manager or pool manager: `update_pool_reward_emission` (1023) | `admin.move` | `test_admin::should_be_able_to_update_pool_reward_emission` | `test_admin::should_notbe_able_to_update_pool_reward_emission_due_to_invalid_manager` |
| Reward manager or pool manager: `add_seconds_to_reward_emission` (1023) | `admin.move` | `test_admin::should_be_able_to_add_seconds_to_rewards_emission` | `test_admin::should_not_be_able_to_add_seconds_to_rewards_emission_due_to_invalid_manager` |
| BPOINT rewards restricted to reward managers (1023) | `admin.move`: the three reward functions above | MISSING ² | MISSING ² |
| Position belongs to the pool (1019) | `pool.move`: `add_liquidity`, `add_liquidity_with_fixed_amount`, `remove_liquidity`, `close_position_v2`, `collect_fee`, `collect_reward` | `test_pool::test_provide_liquidity`, `test_pool::test_add_liquidity_with_fixed_amount_coin_a`, `test_pool::test_remove_liquidity`, `test_pool::test_close_position`, `test_pool::test_collect_fee` | MISSING |

¹ The capability is a Move object with only the `key` ability. A caller that does not own it cannot construct the argument, so there is no runtime abort path to test.

² The BPOINT coin type is hard-coded to its mainnet address and cannot be instantiated in unit tests.

## Invariants → tests

| Invariant | Location | Positive test | Negative test |
|---|---|---|---|
| Version gate (1001) | `config::verify_version`, called by 25 entry points | `test_config::test_verify_version_success` | `test_config::test_verify_version_failure` (calls the check directly) |
| Version bump bounded (1005) | `config::increase_version` | `test_admin::should_be_able_to_update_supported_version` | `test_admin::should_not_be_able_to_update_supported_version_due_to_max_version_reched` |
| Pool paused: swap (1012) | `pool::swap` | `test_pool::test_perform_swap` | `test_pool::test_swap_when_pool_paused` |
| Pool paused: liquidity, flash swap, collect (1012) | `pool.move` (6 functions) | `test_pool::test_provide_liquidity` and others | MISSING |
| Flash swap in progress blocks other operations (1006) | `pool.move` (7 functions) | `test_pool::test_flash_swap_and_repay` | MISSING |
| Flash swap repayment: in progress (1007), same pool (1011), exact amount, direction | `pool::repay_flash_swap` | `test_pool::test_flash_swap_and_repay`; `test_gateway::should_be_able_to_do_flash_swap_from_b_to_a` | MISSING |
| Swap slippage (1010) | `pool::swap` | `test_pool::test_perform_swap`; `test_pool::test_swap_exact_output` | MISSING |
| Flash swap slippage, exact-in (1010) | `gateway::flash_swap` | `test_gateway::should_be_able_to_flash_swap_a_to_b` | `test_gateway::should_fail_to_do_flash_swap_from_a_to_b_as_slippage_exceeds`; `test_gateway::should_fail_to_do_flash_swap_from_b_to_a_as_slippage_exceeds` |
| Flash swap slippage, exact-out (1010) | `gateway::flash_swap` | `test_gateway::should_be_able_to_flash_swap_by_amount_out` | MISSING ³ |
| Route swap slippage (1010) | `gateway::route_swap` | `test_gateway::should_be_able_to_perform_a_route_swap_a_to_b`; `test_gateway::should_be_able_to_perform_a_route_swap_a_to_b_by_amount_out` | `test_gateway::should_fail_to_perform_a_route_swap_a_to_b_as_slippage_exceeds`; `test_gateway::should_fail_to_perform_a_route_swap_a_to_b_by_amount_out_as_slippage_exceeds` |
| Add liquidity slippage (1010) | `gateway::provide_liquidity` | `test_gateway::should_be_able_to_provide_liquidity_via_gateway` | `test_gateway::should_fail_to_provide_liquidity_as_coin_a_is_not_enough`; `test_gateway::should_fail_to_provide_liquidity_as_coin_b_is_not_enough` |
| Fixed-amount add slippage (1010) | `gateway::provide_liquidity_with_fixed_amount` | `test_gateway::should_be_able_to_provide_liquidity_via_gateway_with_fixed_amount` | `test_gateway::should_be_able_to_provide_liquidity_via_gateway_with_fixed_amount_as_coin_a_exceeds_slippage`; `test_gateway::should_be_able_to_provide_liquidity_via_gateway_with_fixed_amount_as_coin_b_exceeds_slippage` |
| Remove liquidity slippage (1010) | `gateway::remove_liquidity` | `test_gateway::should_be_able_to_remove_liquidity` | `test_gateway::should_fail_to_remove_liquidity_as_coin_a_exceeds_slippage`; `test_gateway::should_fail_to_remove_liquidity_as_coin_b_exceeds_slippage` |
| Swap price limit (1009) | `pool::swap_in_pool` | `test_pool::test_perform_swap`; `test_pool::test_swap_b2a` | `test_pool::test_swap_with_invalid_price_limit_a2b`; `test_pool::test_swap_with_invalid_price_limit_b2a` |
| Quote price limit (1009) | `pool::calculate_swap_results` | `test_pool::test_calculate_swap_results` | MISSING |
| Valid tick range on open (1002) | `pool::open_position` | `test_pool::test_open_position` | `test_pool::test_open_position_with_invalid_ticks` (lower > upper only) |
| Tick and sqrt-price domain (1, 2) | `tick_math` | `test_math::test_get_sqrt_price_at_tick_large_values`; `test_math::test_get_tick_at_sqrt_price_boundary_values` | `test_math::test_get_sqrt_price_at_tick_above_max`, `test_math::test_get_sqrt_price_at_tick_below_min`, `test_math::test_get_tick_at_sqrt_price_above_max`, `test_math::test_get_tick_at_sqrt_price_below_min` |
| Tick spacing cap (1026) | `pool::create_pool_internal` | `test_pool::test_create_pool_with_different_tick_spacing` | `test_pool::test_create_pool_with_invalid_tick_spacing` |
| Fee rate cap (1027) | `pool::create_pool_internal` | `test_pool::test_create_pool` | `test_pool::test_create_pool_with_invalid_fee_rate` |
| Protocol fee share cap (1025) | `admin::update_protocol_fee_share` | `test_admin::should_be_able_to_update_protocol_fee_share` | `test_admin::should_not_be_able_to_update_protocol_fee_share_with_invalid_fee_share` |
| Observation cardinality cap (1028) | `admin::increase_observation_cardinality_next` | `test_admin::should_be_able_to_increase_observation_cardinality_next` | `test_admin::should_be_able_to_increase_observation_cardinality_next_with_invalid_cardinality` |
| Reward start time in the future (1020) | `admin::initialize_pool_reward` | `test_admin::should_be_able_to_add_rewards_to_pool` | `test_admin::should_not_be_able_to_add_rewards_to_pool_due_to_invalid_start_time` |
| Reward end time after last update (1022) | `pool::update_pool_reward_emission` | `test_admin::should_be_able_to_update_pool_reward_emission` | MISSING |
| Reward amount equals the coin value (1037) | `admin::initialize_pool_reward`, `admin::update_pool_reward_emission` | `test_admin::should_be_able_to_add_rewards_to_pool`; `test_admin::should_be_able_to_update_pool_reward_emission` | `test_admin::should_not_be_able_to_add_rewards_to_pool_due_to_invalid_amount`; `test_admin::should_notbe_able_to_update_pool_reward_emission_due_to_invalid_amount` |
| Reward type registered (1021) | `pool::find_reward_info_index` | `test_admin::should_be_able_to_add_reserve_to_pool_rewards` | MISSING |
| Close only an empty position: liquidity (1018) | `pool::close_position_v2` | `test_pool::test_close_position` | `test_pool::test_close_position_with_liquidity` |
| Close only an empty position: unclaimed fees (1035) | `pool::close_position_v2` | `test_pool::test_close_position_after_removing_liquidity` | MISSING |
| Liquidity add: coins cover the required amounts (1003, 1004) | `pool::add_liquidity`, `utils::deposit_balance` | `test_pool::test_provide_liquidity`; `test_pool::test_add_liquidity_with_fixed_amount_coin_a` | 1004: `test_gateway::should_be_able_to_provide_liquidity_via_gateway_with_fixed_amount_as_insufficient_coin_amount_is_provided`; 1003: MISSING |
| Remove at most the position's liquidity (1015) | `utils::add_delta` | `test_pool::test_remove_liquidity` | `test_utils::test_add_delta_negative_delta_exceeds_liquidity` (calls the helper directly) |
| Non-zero amount: swap (1029) | `pool::swap` | `test_pool::test_perform_swap` | `test_pool::test_swap_zero_amount` |
| Non-zero amount: flash swap, liquidity add and remove (1029) | `pool.move` | `test_pool::test_flash_swap_and_repay` and others | MISSING |
| Protocol fee claim at most the accrued amount (1003) | `admin::claim_protocol_fee` | `test_admin::should_claim_protocol_fee_via_admin_cap` | `test_admin::should_not_be_able_to_claim_protocol_fee_via_admin_cap_due_to_invalid_coin_a_amount`; `test_admin::should_not_be_able_to_claim_protocol_fee_via_admin_cap_due_to_invalid_coin_b_amount` |
| Creation fee claim: supported coin (1038), at most the accrued amount (1003), non-zero (1029) | `admin::claim_pool_creation_fee` | `test_admin::should_be_able_to_claim_pool_creation_fee` | `test_admin::should_not_be_able_to_claim_pool_creation_fee_with_unsupported_coin`; `test_admin::should_not_be_able_to_claim_pool_creation_fee_with_amount_greater_than_collected_fee`; `test_admin::should_not_be_able_to_claim_pool_creation_fee_with_amount_zero` |
| Pool creation fee: supported coin (1038), exact amount (1039) | `pool::charge_pool_creation_fee` | `test_pool::test_create_pool` | `test_pool::should_fail_pool_creation_as_fee_creation_coin_no_supported`; `test_pool::should_fail_pool_creation_as_fee_creation_amount_incorrect` |
| Distinct coin types (1013) | `pool::create_pool_internal` | `test_pool::test_create_pool` | `test_pool::test_create_pool_with_same_coin_types` |
| Initial price below the maximum (1030) | `pool::create_pool_internal` | `test_pool::test_create_pool` | `test_pool::test_create_pool_at_max_sqrt_price` |
| Reward manager add and remove: no duplicate (1032), must exist (1031) | `config.move` | `test_admin::should_be_able_to_add_reward_manager`; `test_admin::should_be_able_to_remove_reward_manager` | `test_config::test_set_reward_manager_duplicate`; `test_config::test_remove_reward_manager_not_found` |
| Deprecated entry points abort (1036) | `gateway::create_pool`, `pool::new`, `pool::close_position` | n/a | `test_gateway::should_fail_to_create_pool_using_deprecated_method`; `test_pool::test_deprecated_new_function`; `pool::close_position`: MISSING |

³ `test_gateway::should_fail_to_do_flash_swap_by_amount_out_as_slippage_exceeds` has no `#[expected_failure]` attribute, so it does not exercise the check.

## Gaps

These checks have no negative test that reaches them through the production entry point:
- pool manager authorization
- position-belongs-to-pool
- pause on non-swap operations
- the flash-swap lock and repayment checks
- `pool::swap` slippage
- exact-out flash swap slippage
- the quote price limit
- reward end time
- reward type registered
- unclaimed fees on close
- liquidity-add coin sufficiency (1003)
- non-zero amounts on flash swap and liquidity operations

The BPOINT restriction cannot be tested in unit tests as written.
