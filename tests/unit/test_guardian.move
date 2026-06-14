#[test_only]
module bluefin_spot::test_guardian {
    use sui::test_scenario;
    use sui::clock::{Clock};
    use sui::balance;
    use sui::coin;

    use bluefin_spot::admin::{Self, AdminCap, ProtocolFeeCap};
    use bluefin_spot::config::{GlobalConfig};
    use bluefin_spot::pool::{Self, Pool};
    use bluefin_spot::guardian::{Self, GuardianCap};
    use bluefin_spot::test_utils::{Self, BLUE, USDC};

    const NEW_GUARDIAN: address = @0xCAFE;

    //===========================================================//
    //                Init / Read Accessors                      //
    //===========================================================//

    #[test]
    fun pre_init_is_initialized_returns_false() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);

        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            assert!(!guardian::is_initialized(&protocol_config), 1);
            test_scenario::return_shared(protocol_config);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun init_guardian_mints_cap_and_seeds_state() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());

        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let cap = test_scenario::take_from_address<GuardianCap>(&scenario, test_utils::admin_address());
            assert!(guardian::is_initialized(&protocol_config), 1);
            assert!(guardian::guardian(&protocol_config) == test_utils::admin_address(), 2);
            assert!(object::id(&cap) == guardian::active_guardian_cap_id(&protocol_config), 3);
            assert!(!guardian::is_paused(&protocol_config), 4);
            test_scenario::return_to_address<GuardianCap>(test_utils::admin_address(), cap);
            test_scenario::return_shared(protocol_config);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1047, location = bluefin_spot::guardian)]
    fun init_guardian_twice_reverts() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1048, location = bluefin_spot::guardian)]
    fun init_guardian_to_zero_address_reverts() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, @0x0);
        test_scenario::end(scenario);
    }

    //===========================================================//
    //                       Pause / Unpause                     //
    //===========================================================//

    #[test]
    fun cap_holder_can_pause_and_unpause_protocol() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());

        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let mut protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let cap = test_scenario::take_from_address<GuardianCap>(&scenario, test_utils::admin_address());
            let clock = test_scenario::take_shared<Clock>(&scenario);
            guardian::pause_protocol(&mut protocol_config, &cap, &clock);
            assert!(guardian::is_paused(&protocol_config), 1);
            guardian::unpause_protocol(&mut protocol_config, &cap, &clock);
            assert!(!guardian::is_paused(&protocol_config), 2);
            test_scenario::return_to_address<GuardianCap>(test_utils::admin_address(), cap);
            test_scenario::return_shared(protocol_config);
            test_scenario::return_shared(clock);
        };
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1044, location = bluefin_spot::guardian)]
    fun stale_cap_cannot_pause_protocol_after_rotation() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());
        // ADMIN holds cap_v1. Rotation mints cap_v2 for NEW_GUARDIAN.
        set_guardian_as_admin(&mut scenario, NEW_GUARDIAN);

        // ADMIN still has cap_v1; it's now a paperweight.
        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let mut protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let stale_cap = test_scenario::take_from_address<GuardianCap>(&scenario, test_utils::admin_address());
            let clock = test_scenario::take_shared<Clock>(&scenario);
            guardian::pause_protocol(&mut protocol_config, &stale_cap, &clock);
            test_scenario::return_to_address<GuardianCap>(test_utils::admin_address(), stale_cap);
            test_scenario::return_shared(protocol_config);
            test_scenario::return_shared(clock);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun cap_holder_can_pause_and_unpause_pool() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());

        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let cap = test_scenario::take_from_address<GuardianCap>(&scenario, test_utils::admin_address());
            let mut pool = test_scenario::take_shared<Pool<BLUE, USDC>>(&scenario);
            admin::pause_pool<BLUE, USDC>(&protocol_config, &mut pool, &cap);
            assert!(pool::is_pool_paused(&pool), 1);
            admin::unpause_pool<BLUE, USDC>(&protocol_config, &mut pool, &cap);
            assert!(!pool::is_pool_paused(&pool), 2);
            test_scenario::return_to_address<GuardianCap>(test_utils::admin_address(), cap);
            test_scenario::return_shared(protocol_config);
            test_scenario::return_shared(pool);
        };
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1044, location = bluefin_spot::guardian)]
    fun stale_cap_cannot_pause_pool_after_rotation() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());
        set_guardian_as_admin(&mut scenario, NEW_GUARDIAN);

        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let stale_cap = test_scenario::take_from_address<GuardianCap>(&scenario, test_utils::admin_address());
            let mut pool = test_scenario::take_shared<Pool<BLUE, USDC>>(&scenario);
            admin::pause_pool<BLUE, USDC>(&protocol_config, &mut pool, &stale_cap);
            test_scenario::return_to_address<GuardianCap>(test_utils::admin_address(), stale_cap);
            test_scenario::return_shared(protocol_config);
            test_scenario::return_shared(pool);
        };
        test_scenario::end(scenario);
    }

    //===========================================================//
    //                  Rotation (immediate)                     //
    //===========================================================//

    #[test]
    fun admin_can_set_guardian() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());

        // Capture the cap_id before rotation.
        let old_cap_id = {
            test_scenario::next_tx(&mut scenario, test_utils::admin_address());
            let protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let id = guardian::active_guardian_cap_id(&protocol_config);
            test_scenario::return_shared(protocol_config);
            id
        };

        set_guardian_as_admin(&mut scenario, NEW_GUARDIAN);

        // NEW_GUARDIAN now holds a fresh cap whose id matches the active one.
        test_scenario::next_tx(&mut scenario, NEW_GUARDIAN);
        {
            let protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let new_cap = test_scenario::take_from_address<GuardianCap>(&scenario, NEW_GUARDIAN);
            assert!(guardian::guardian(&protocol_config) == NEW_GUARDIAN, 1);
            assert!(guardian::active_guardian_cap_id(&protocol_config) != old_cap_id, 2);
            assert!(object::id(&new_cap) == guardian::active_guardian_cap_id(&protocol_config), 3);
            test_scenario::return_to_address<GuardianCap>(NEW_GUARDIAN, new_cap);
            test_scenario::return_shared(protocol_config);
        };
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1045, location = bluefin_spot::guardian)]
    fun set_guardian_to_same_address_reverts() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());
        set_guardian_as_admin(&mut scenario, test_utils::admin_address());
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1048, location = bluefin_spot::guardian)]
    fun set_guardian_to_zero_address_reverts() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());
        set_guardian_as_admin(&mut scenario, @0x0);
        test_scenario::end(scenario);
    }

    #[test]
    fun new_guardian_can_pause_with_fresh_cap() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());
        set_guardian_as_admin(&mut scenario, NEW_GUARDIAN);

        test_scenario::next_tx(&mut scenario, NEW_GUARDIAN);
        {
            let mut protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let cap = test_scenario::take_from_address<GuardianCap>(&scenario, NEW_GUARDIAN);
            let clock = test_scenario::take_shared<Clock>(&scenario);
            guardian::pause_protocol(&mut protocol_config, &cap, &clock);
            assert!(guardian::is_paused(&protocol_config), 1);
            test_scenario::return_to_address<GuardianCap>(NEW_GUARDIAN, cap);
            test_scenario::return_shared(protocol_config);
            test_scenario::return_shared(clock);
        };
        test_scenario::end(scenario);
    }

    //===========================================================//
    //         Misuse: guardian-gated entries before init        //
    //===========================================================//

    #[test]
    #[expected_failure(abort_code = 1046, location = bluefin_spot::guardian)]
    fun guardian_getter_before_init_reverts() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);

        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let _ = guardian::guardian(&protocol_config);
            test_scenario::return_shared(protocol_config);
        };
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1046, location = bluefin_spot::guardian)]
    fun set_guardian_before_init_reverts() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        set_guardian_as_admin(&mut scenario, NEW_GUARDIAN);
        test_scenario::end(scenario);
    }

    //===========================================================//
    //         Paused protocol blocks fund-moving entries        //
    //===========================================================//

    #[test]
    #[expected_failure(abort_code = 1043, location = bluefin_spot::guardian)]
    fun paused_protocol_blocks_swap() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());
        pause_protocol_as_admin(&mut scenario);

        test_scenario::next_tx(&mut scenario, test_utils::bob_address());
        {
            let mut pool = test_scenario::take_shared<Pool<BLUE, USDC>>(&scenario);
            let clock = test_scenario::take_shared<Clock>(&scenario);
            let protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);

            let bal_a = balance::create_for_testing<BLUE>(100_000_000);
            let bal_b = balance::create_for_testing<USDC>(0);
            let (bal_in, bal_out) = pool::swap<BLUE, USDC>(
                &clock,
                &protocol_config,
                &mut pool,
                bal_a,
                bal_b,
                true,
                true,
                100_000_000,
                0,
                test_utils::blue_usdc_sqrt_price() - 100_000,
            );
            balance::destroy_for_testing(bal_in);
            balance::destroy_for_testing(bal_out);
            test_scenario::return_shared(clock);
            test_scenario::return_shared(pool);
            test_scenario::return_shared(protocol_config);
        };
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1043, location = bluefin_spot::guardian)]
    fun paused_protocol_blocks_claim_protocol_fee() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());
        pause_protocol_as_admin(&mut scenario);

        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let fee_cap = test_scenario::take_from_address<ProtocolFeeCap>(&scenario, test_utils::admin_address());
            let protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let mut pool = test_scenario::take_shared<Pool<BLUE, USDC>>(&scenario);
            admin::claim_protocol_fee<BLUE, USDC>(
                &fee_cap,
                &protocol_config,
                &mut pool,
                0,
                0,
                test_utils::admin_address(),
                test_scenario::ctx(&mut scenario),
            );
            test_scenario::return_to_address<ProtocolFeeCap>(test_utils::admin_address(), fee_cap);
            test_scenario::return_shared(protocol_config);
            test_scenario::return_shared(pool);
        };
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1043, location = bluefin_spot::guardian)]
    fun paused_protocol_blocks_claim_pool_creation_fee() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());
        pause_protocol_as_admin(&mut scenario);

        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let fee_cap = test_scenario::take_from_address<ProtocolFeeCap>(&scenario, test_utils::admin_address());
            let mut protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            admin::claim_pool_creation_fee<USDC>(
                &fee_cap,
                &mut protocol_config,
                1,
                test_utils::admin_address(),
                test_scenario::ctx(&mut scenario),
            );
            test_scenario::return_to_address<ProtocolFeeCap>(test_utils::admin_address(), fee_cap);
            test_scenario::return_shared(protocol_config);
        };
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1043, location = bluefin_spot::guardian)]
    fun paused_protocol_blocks_initialize_pool_reward() {
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());
        pause_protocol_as_admin(&mut scenario);

        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let mut protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let mut pool = test_scenario::take_shared<Pool<BLUE, USDC>>(&scenario);
            let clock = test_scenario::take_shared<Clock>(&scenario);
            let reward_coin = coin::mint_for_testing<USDC>(1_000, test_scenario::ctx(&mut scenario));
            admin::initialize_pool_reward<BLUE, USDC, USDC>(
                &mut protocol_config,
                &mut pool,
                test_utils::start_time() / 1000 + 3600,
                86_400,
                reward_coin,
                std::string::utf8(b"USDC"),
                6,
                1_000,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            test_scenario::return_shared(protocol_config);
            test_scenario::return_shared(pool);
            test_scenario::return_shared(clock);
        };
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1043, location = bluefin_spot::guardian)]
    fun paused_protocol_blocks_add_seconds_to_reward_emission() {
        // Seed a reward emission BEFORE pausing, otherwise add_seconds fails for
        // a different reason (no reward to extend).
        let mut scenario = test_scenario::begin(test_utils::admin_address());
        test_utils::create_pool_in_test_scenario(&mut scenario);
        init_guardian_as_admin(&mut scenario, test_utils::admin_address());

        // whitelist admin as reward manager so initialize_pool_reward can land
        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let admin_cap = test_scenario::take_from_address<AdminCap>(&scenario, test_utils::admin_address());
            let mut protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            admin::add_reward_manager(&admin_cap, &mut protocol_config, test_utils::admin_address());
            test_scenario::return_to_address<AdminCap>(test_utils::admin_address(), admin_cap);
            test_scenario::return_shared(protocol_config);
        };

        // seed a reward emission
        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let mut protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let mut pool = test_scenario::take_shared<Pool<BLUE, USDC>>(&scenario);
            let clock = test_scenario::take_shared<Clock>(&scenario);
            let reward_coin = coin::mint_for_testing<USDC>(1_000, test_scenario::ctx(&mut scenario));
            admin::initialize_pool_reward<BLUE, USDC, USDC>(
                &mut protocol_config,
                &mut pool,
                test_utils::start_time() / 1000 + 3600,
                86_400,
                reward_coin,
                std::string::utf8(b"USDC"),
                6,
                1_000,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            test_scenario::return_shared(protocol_config);
            test_scenario::return_shared(pool);
            test_scenario::return_shared(clock);
        };

        pause_protocol_as_admin(&mut scenario);

        // now try add_seconds — should revert with EProtocolPaused
        test_scenario::next_tx(&mut scenario, test_utils::admin_address());
        {
            let mut protocol_config = test_scenario::take_shared<GlobalConfig>(&scenario);
            let mut pool = test_scenario::take_shared<Pool<BLUE, USDC>>(&scenario);
            let clock = test_scenario::take_shared<Clock>(&scenario);
            admin::add_seconds_to_reward_emission<BLUE, USDC, USDC>(
                &mut protocol_config,
                &mut pool,
                3600,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            test_scenario::return_shared(protocol_config);
            test_scenario::return_shared(pool);
            test_scenario::return_shared(clock);
        };
        test_scenario::end(scenario);
    }

    //===========================================================//
    //                       Helpers                             //
    //===========================================================//

    fun init_guardian_as_admin(scenario: &mut test_scenario::Scenario, initial: address) {
        test_scenario::next_tx(scenario, test_utils::admin_address());
        {
            let admin_cap = test_scenario::take_from_address<AdminCap>(scenario, test_utils::admin_address());
            let mut protocol_config = test_scenario::take_shared<GlobalConfig>(scenario);
            admin::init_guardian(&admin_cap, &mut protocol_config, initial, test_scenario::ctx(scenario));
            test_scenario::return_to_address<AdminCap>(test_utils::admin_address(), admin_cap);
            test_scenario::return_shared(protocol_config);
        };
    }

    fun set_guardian_as_admin(scenario: &mut test_scenario::Scenario, target: address) {
        test_scenario::next_tx(scenario, test_utils::admin_address());
        {
            let admin_cap = test_scenario::take_from_address<AdminCap>(scenario, test_utils::admin_address());
            let mut protocol_config = test_scenario::take_shared<GlobalConfig>(scenario);
            admin::set_guardian(&admin_cap, &mut protocol_config, target, test_scenario::ctx(scenario));
            test_scenario::return_to_address<AdminCap>(test_utils::admin_address(), admin_cap);
            test_scenario::return_shared(protocol_config);
        };
    }

    fun pause_protocol_as_admin(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, test_utils::admin_address());
        {
            let mut protocol_config = test_scenario::take_shared<GlobalConfig>(scenario);
            let cap = test_scenario::take_from_address<GuardianCap>(scenario, test_utils::admin_address());
            let clock = test_scenario::take_shared<Clock>(scenario);
            guardian::pause_protocol(&mut protocol_config, &cap, &clock);
            test_scenario::return_to_address<GuardianCap>(test_utils::admin_address(), cap);
            test_scenario::return_shared(protocol_config);
            test_scenario::return_shared(clock);
        };
    }
}
