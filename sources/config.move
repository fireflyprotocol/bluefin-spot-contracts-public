/*
  Copyright (c) 2025 Bluefin Labs Inc.
  Proprietary Smart Contract License – All Rights Reserved.

  This source code is provided for transparency and verification only.
  Use, modification, reproduction, or redeployment of this code 
  requires prior written permission from the Bluefin Labs Inc.
*/

module bluefin_spot::config {
    use sui::table::{Self};
    use sui::dynamic_field;
    use sui::clock::{Self, Clock};

    use integer_mate::i32::{I32};
    use bluefin_spot::tick_math;
    use bluefin_spot::utils;
    use bluefin_spot::constants;
    use bluefin_spot::events;

    // local modules
    use bluefin_spot::errors;

    // friend modules

    //===========================================================//
    //                         Constants                         //
    //===========================================================//


    /// Tracks the current version of the package. Every time a breaking change is pushed, 
    /// increment the version on the new package, making any old version of the package 
    /// unable to be used
    const VERSION: u64 = 9;

    /// The protocol's config
    public struct GlobalConfig has key, store {
        id: UID,
        min_tick: I32,
        max_tick: I32,
        version: u64,
        reward_managers: vector<address>
    }

    /// Per-window cap state for the REWARDS_MANAGER role (BET-3885).
    /// Stored as a dynamic field on `GlobalConfig.id` so the existing
    /// shared object's struct layout is unchanged (Sui upgrade compat).
    /// Absent on a fresh package upgrade until the admin first calls
    /// `update_emission_caps`; while absent, the cap is treated as
    /// disabled (no enforcement, no window tracking).
    public struct RewardEmissionCaps has store, drop {
        max_emission_delta_per_window: u64,
        max_duration_extension_per_window: u64,
        emission_window_seconds: u64,
        window_start_ts: u64,
        window_delta_sum: u64,
        window_duration_sum: u64,
    }

    //===========================================================//
    //                     Friend Functions                      //
    //===========================================================//

    // removes a reward manager from global config. Only Admin can invoke this.
    public(package) fun remove_reward_manager(config: &mut GlobalConfig, manager: address){

        assert!(verify_reward_manager(config, manager), errors::reward_manager_not_found());

        let mut index = 0;
        let len = vector::length(&config.reward_managers);
        while (index < len) {
            if (*(vector::borrow(&config.reward_managers, index)) == manager ) {
                vector::remove(&mut config.reward_managers, index);
                break
            };
            index = index + 1;
        } 
    }

    // Adds a reward manager in global config. Only Admin can invoke this.
    public(package) fun set_reward_manager(config: &mut GlobalConfig, manager: address){
        // if provided manager is not already whitelisted only then add it
        assert!(!verify_reward_manager(config, manager), errors::already_a_reward_manger());
        vector::push_back<address>(&mut config.reward_managers, manager);
    }

    // Increases the version of the protocol supported. Only admin can invoke this.
    // Returns the old version and new version 
    public(package) fun increase_version(config: &mut GlobalConfig): (u64, u64) {
        // ensures that config version is never increased beyond VERSION
        assert!(config.version < VERSION, errors::verion_cant_be_increased());

        let old_version = config.version;        
        config.version = config.version + 1; // can only move ahead 1 step
        (old_version, config.version)

    }


    public(package) fun get_config_id(config: &mut GlobalConfig): &mut UID {
        &mut config.id
    }

    /// Install or update the reward-emission caps (BET-3885).
    /// Only callable by `admin` (friend). The caller is responsible for
    /// gating this behind `AdminCap`. Mutation resets the window state
    /// so we don't carry stale sums across a cap change.
    public(package) fun set_emission_caps(
        config: &mut GlobalConfig,
        max_emission_delta_per_window: u64,
        max_duration_extension_per_window: u64,
        emission_window_seconds: u64,
        clock: &Clock,
    ) {
        assert!(emission_window_seconds > 0, errors::invalid_emission_window());

        let now = clock::timestamp_ms(clock) / 1000;
        let new_caps = RewardEmissionCaps {
            max_emission_delta_per_window,
            max_duration_extension_per_window,
            emission_window_seconds,
            window_start_ts: now,
            window_delta_sum: 0,
            window_duration_sum: 0,
        };

        let key = constants::emission_caps_dynamic_key();
        if (dynamic_field::exists_(&config.id, key)) {
            let _old: RewardEmissionCaps = dynamic_field::remove(&mut config.id, key);
        };
        dynamic_field::add(&mut config.id, key, new_caps);

        events::emit_emission_caps_updated_event(
            max_emission_delta_per_window,
            max_duration_extension_per_window,
            emission_window_seconds,
        );
    }

    /// Enforces the per-window reward-delta cap and bumps the running
    /// total. No-op when the caps dynamic field is absent (pre-config
    /// upgrade state). Called from `pool::update_pool_reward_emission`
    /// when a positive reward balance is being deposited.
    public(package) fun enforce_emission_delta_cap(
        config: &mut GlobalConfig,
        clock: &Clock,
        delta: u64,
    ) {
        let key = constants::emission_caps_dynamic_key();
        if (!dynamic_field::exists_(&config.id, key)) { return };

        let caps: &mut RewardEmissionCaps = dynamic_field::borrow_mut(&mut config.id, key);
        roll_window_if_expired(caps, clock);

        // Overflow-safe: invariant `caps.window_delta_sum <= caps.max_emission_delta_per_window`
        // is maintained by the assert below, so the subtraction is always >= 0.
        assert!(
            caps.max_emission_delta_per_window - caps.window_delta_sum >= delta,
            errors::cap_exceeded()
        );
        caps.window_delta_sum = caps.window_delta_sum + delta;
    }

    /// Enforces the per-window duration-extension cap and bumps the
    /// running total. No-op when the caps dynamic field is absent.
    /// Called from `pool::update_pool_reward_emission` when the deposited
    /// balance is zero (i.e. invoked via `add_seconds_to_reward_emission`).
    public(package) fun enforce_duration_extension_cap(
        config: &mut GlobalConfig,
        clock: &Clock,
        seconds: u64,
    ) {
        let key = constants::emission_caps_dynamic_key();
        if (!dynamic_field::exists_(&config.id, key)) { return };

        let caps: &mut RewardEmissionCaps = dynamic_field::borrow_mut(&mut config.id, key);
        roll_window_if_expired(caps, clock);

        assert!(
            caps.max_duration_extension_per_window - caps.window_duration_sum >= seconds,
            errors::cap_exceeded()
        );
        caps.window_duration_sum = caps.window_duration_sum + seconds;
    }

    /// Fixed-window reset: `window_start_ts` rolls forward on the first
    /// call after expiry, not continuously. Accepts a small slack at
    /// window boundaries in exchange for trivial state.
    fun roll_window_if_expired(caps: &mut RewardEmissionCaps, clock: &Clock) {
        let now = clock::timestamp_ms(clock) / 1000;
        if (now - caps.window_start_ts > caps.emission_window_seconds) {
            caps.window_start_ts = now;
            caps.window_delta_sum = 0;
            caps.window_duration_sum = 0;
        };
    }

    /// Read-only accessor for `GlobalConfig`'s `UID`, used by the guardian
    /// module to read dynamic fields without taking a mutable reference.
    public(package) fun id(config: &GlobalConfig): &UID {
        &config.id
    }

    //===========================================================//
    //                      Initialization                       //
    //===========================================================//

    fun init(ctx: &mut TxContext) {
      
        let config = GlobalConfig {
            id: object::new(ctx),
            min_tick: tick_math::min_tick(), 
            max_tick: tick_math::max_tick(),
            version: VERSION,
            reward_managers: vector::empty<address>()
        };

        transfer::share_object(config);
    }


    //===========================================================//
    //                      Public Methods                       //
    //===========================================================//

    /// Returns the min/max tick allowed
    public fun get_tick_range(config: &GlobalConfig): (I32, I32){
        (config.min_tick, config.max_tick)
    }

    /// Assets if the config version matches the protocol version
    public fun verify_version(config: &GlobalConfig) {
        assert!(config.version == VERSION, errors::version_mismatch())
    }

    /// checks if the given address is the whitelisted rewards manager
    public fun verify_reward_manager(config: &GlobalConfig, manager: address) : bool
    {

        let mut i = 0;
        while (i < vector::length<address>(&config.reward_managers)) {
            let addr = vector::borrow<address>(&config.reward_managers, i);
            if (*addr == manager) {
                return true
            };
            i = i + 1;
        };
        return false
    }

    public fun get_pool_creation_fee_amount<CoinTypeFee>(protocol_config: &GlobalConfig): (bool, u64) {

        let uid = &protocol_config.id;
        let key = constants::pool_creation_fee_dynamic_key();
        let fee_coin_type = utils::get_type_string<CoinTypeFee>();

        if(!dynamic_field::exists_(uid, key)){
            return (false, 0)   
        };

        // get the fee table
        let fee_table = dynamic_field::borrow(uid, key);

        if(!table::contains(fee_table, fee_coin_type)){
            return (false, 0)
        };

        let fee_amount = *table::borrow(fee_table, fee_coin_type);

        return (true, fee_amount)

    }

    #[test_only]
    public fun create_config(ctx: &mut TxContext): GlobalConfig {
    
        let config = GlobalConfig {
            id: object::new(ctx),
            min_tick: tick_math::min_tick(), 
            max_tick: tick_math::max_tick(),
            version: VERSION,
            reward_managers: vector::empty<address>()
        };

        config
    }

    #[test_only]
    public fun increase_supported_version(config: &mut GlobalConfig): (u64, u64) {
        increase_version(config)
    }

    #[test_only]
    public fun get_supported_version(config: &GlobalConfig): u64 {
        config.version
    }

    #[test_only]
    public fun init_test(ctx: &mut TxContext) {
        init(ctx);
    }

    #[test_only]
    public fun set_version(config: &mut GlobalConfig, version: u64){
        config.version = version
    }

    // Additional test-only helper functions
    #[test_only]
    public fun get_reward_managers(config: &GlobalConfig): &vector<address> {
        &config.reward_managers
    }

    #[test_only]
    public fun get_min_tick(config: &GlobalConfig): I32 {
        config.min_tick
    }

    #[test_only]
    public fun get_max_tick(config: &GlobalConfig): I32 {
        config.max_tick
    }

    #[test_only]
    public fun get_version(config: &GlobalConfig): u64 {
        config.version
    }

    #[test_only]
    public fun get_id(config: &GlobalConfig): &UID {
        &config.id
    }

    #[test_only]
    public fun destroy_config_for_testing(config: GlobalConfig) {
        let GlobalConfig { id, min_tick: _, max_tick: _, version: _, reward_managers: _ } = config;
        object::delete(id);
    }

    #[test_only]
    public fun emission_caps_exist(config: &GlobalConfig): bool {
        dynamic_field::exists_(&config.id, constants::emission_caps_dynamic_key())
    }

    #[test_only]
    public fun get_window_delta_sum(config: &GlobalConfig): u64 {
        let caps: &RewardEmissionCaps = dynamic_field::borrow(
            &config.id, constants::emission_caps_dynamic_key()
        );
        caps.window_delta_sum
    }

    #[test_only]
    public fun get_window_duration_sum(config: &GlobalConfig): u64 {
        let caps: &RewardEmissionCaps = dynamic_field::borrow(
            &config.id, constants::emission_caps_dynamic_key()
        );
        caps.window_duration_sum
    }

    #[test_only]
    public fun get_window_start_ts(config: &GlobalConfig): u64 {
        let caps: &RewardEmissionCaps = dynamic_field::borrow(
            &config.id, constants::emission_caps_dynamic_key()
        );
        caps.window_start_ts
    }
}