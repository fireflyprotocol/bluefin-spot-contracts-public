/*
  Copyright (c) 2025 Bluefin Labs Inc.
  Proprietary Smart Contract License – All Rights Reserved.

  This source code is provided for transparency and verification only.
  Use, modification, reproduction, or redeployment of this code
  requires prior written permission from the Bluefin Labs Inc.
*/

module bluefin_spot::guardian {
    use sui::dynamic_field;
    use sui::clock::Clock;

    use bluefin_spot::config::{Self, GlobalConfig};
    use bluefin_spot::errors;
    use bluefin_spot::events;


    //===========================================================//
    //                       Keys / Structs                      //
    //===========================================================//

    /// Typed dynamic-field key under which the GuardianState is attached
    /// to the shared GlobalConfig.
    public struct GuardianKey has copy, drop, store {}

    /// Capability object held by the guardian. Presented to pause / unpause
    /// to prove the caller is currently authorised. Rotation invalidates
    /// the previous cap by ID; the old cap stays in its prior holder's
    /// address as an inert paperweight.
    public struct GuardianCap has key {
        id: UID,
    }

    /// Persisted as a dynamic field on `GlobalConfig.id` rather than a field
    /// on `GlobalConfig` itself, because the live contract's struct layout
    /// is frozen by Sui's package upgrade compatibility rules.
    ///
    /// `active_guardian_cap_id` is the single source of truth for which cap
    /// is currently authorised. Any `GuardianCap` whose `object::id` does not
    /// match this value is stale and cannot pause/unpause.
    public struct GuardianState has store {
        /// Address holding the active cap (mirror of cap recipient — kept for
        /// off-chain ergonomics so monitoring can query without resolving
        /// the cap object's owner via the indexer).
        guardian: address,
        /// ID of the currently-authorised GuardianCap.
        active_guardian_cap_id: ID,
        /// Whether the protocol is currently paused. While true, every
        /// fund-moving entry on the protocol reverts.
        protocol_paused: bool,
    }

    //===========================================================//
    //                       Initialisation                      //
    //===========================================================//

    /// Mints the initial GuardianCap, transfers it to `initial_guardian`, and
    /// attaches the seed `GuardianState` to `GlobalConfig` as a dynamic field.
    /// Called once from the AdminCap-gated `admin::init_guardian` entry.
    public(package) fun init_state(
        config: &mut GlobalConfig,
        initial_guardian: address,
        ctx: &mut TxContext,
    ) {
        assert!(initial_guardian != @0x0, errors::zero_guardian_address());
        let uid = config::get_config_id(config);
        assert!(!dynamic_field::exists_(uid, GuardianKey {}), errors::guardian_already_initialized());
        let cap = GuardianCap { id: object::new(ctx) };
        let cap_id = object::id(&cap);
        transfer::transfer(cap, initial_guardian);
        dynamic_field::add(uid, GuardianKey {}, GuardianState {
            guardian: initial_guardian,
            active_guardian_cap_id: cap_id,
            protocol_paused: false,
        });
        events::emit_guardian_initialized_event(initial_guardian, cap_id);
    }

    //===========================================================//
    //                      Pause Assertions                     //
    //===========================================================//

    /// Aborts if the protocol is paused. Called at the entry of every
    /// fund-moving admin/protocol-level path.
    ///
    /// **Tolerant of an uninitialised guardian state.** This is intentional:
    /// the post-upgrade `init_guardian` call lives in a separate tx, so the
    /// pause check must not break any path during the upgrade transition.
    /// Once `init_guardian` has been called, the check enforces pause normally.
    ///
    /// **Operational risk:** if `init_guardian` is skipped after the upgrade,
    /// the protocol has no pause capability. The deploy runbook must call
    /// `init_guardian` in the tx immediately after the upgrade.
    public fun assert_not_paused(config: &GlobalConfig) {
        let uid = config::id(config);
        if (!dynamic_field::exists_(uid, GuardianKey {})) {
            return
        };
        let state = dynamic_field::borrow<GuardianKey, GuardianState>(uid, GuardianKey {});
        assert!(!state.protocol_paused, errors::protocol_paused());
    }

    //===========================================================//
    //                       Read Accessors                      //
    //===========================================================//

    public fun guardian(config: &GlobalConfig): address {
        borrow_state(config).guardian
    }

    public fun active_guardian_cap_id(config: &GlobalConfig): ID {
        borrow_state(config).active_guardian_cap_id
    }

    public fun is_paused(config: &GlobalConfig): bool {
        borrow_state(config).protocol_paused
    }

    public fun is_initialized(config: &GlobalConfig): bool {
        dynamic_field::exists_(config::id(config), GuardianKey {})
    }

    //===========================================================//
    //                    Borrow Helpers (priv)                  //
    //===========================================================//

    fun borrow_state(config: &GlobalConfig): &GuardianState {
        let uid = config::id(config);
        assert!(dynamic_field::exists_(uid, GuardianKey {}), errors::guardian_not_initialized());
        dynamic_field::borrow<GuardianKey, GuardianState>(uid, GuardianKey {})
    }

    fun borrow_state_mut(config: &mut GlobalConfig): &mut GuardianState {
        let uid = config::get_config_id(config);
        assert!(dynamic_field::exists_(uid, GuardianKey {}), errors::guardian_not_initialized());
        dynamic_field::borrow_mut<GuardianKey, GuardianState>(uid, GuardianKey {})
    }

    /// Asserts the cap is currently authorised (its ID matches the active one).
    /// Move's type system already enforces that the caller possesses a cap;
    /// this additional check rejects stale caps from before a rotation.
    fun assert_cap_active(state: &GuardianState, cap: &GuardianCap) {
        assert!(object::id(cap) == state.active_guardian_cap_id, errors::not_guardian());
    }

    //===========================================================//
    //                  Admin-Gated Rotation                     //
    //===========================================================//

    /// Rotates the guardian by minting a fresh `GuardianCap`, transferring it
    /// to `new_guardian`, and invalidating the previous cap (its ID no longer
    /// matches `active_guardian_cap_id`). The old cap object stays in its
    /// prior holder's address as an inert paperweight.
    ///
    /// Immediate (no timelock). A 24h timelock will be layered on in a
    /// follow-up that timelocks selected AdminCap actions through a generic
    /// primitive.
    public(package) fun set_guardian(
        config: &mut GlobalConfig,
        new_guardian: address,
        ctx: &mut TxContext,
    ) {
        assert!(new_guardian != @0x0, errors::zero_guardian_address());
        let state = borrow_state_mut(config);
        assert!(new_guardian != state.guardian, errors::rotation_to_same_guardian());
        let old_guardian = state.guardian;
        let old_cap_id = state.active_guardian_cap_id;
        let cap = GuardianCap { id: object::new(ctx) };
        let new_cap_id = object::id(&cap);
        transfer::transfer(cap, new_guardian);
        state.guardian = new_guardian;
        state.active_guardian_cap_id = new_cap_id;
        events::emit_guardian_rotated_event(old_guardian, new_guardian, old_cap_id, new_cap_id);
    }

    //===========================================================//
    //                Guardian-Gated Pause Controls              //
    //===========================================================//

    /// Pauses the protocol. Caller must present a `GuardianCap` whose ID
    /// matches the active one tracked in `GuardianState`.
    /// While paused, every fund-moving entry on the protocol reverts.
    public fun pause_protocol(config: &mut GlobalConfig, cap: &GuardianCap, clock: &Clock) {
        config::verify_version(config);
        let state = borrow_state_mut(config);
        assert_cap_active(state, cap);
        state.protocol_paused = true;
        events::emit_protocol_paused_event(state.guardian, sui::clock::timestamp_ms(clock));
    }

    /// Unpauses the protocol. Caller must present the active `GuardianCap`.
    public fun unpause_protocol(config: &mut GlobalConfig, cap: &GuardianCap, clock: &Clock) {
        config::verify_version(config);
        let state = borrow_state_mut(config);
        assert_cap_active(state, cap);
        state.protocol_paused = false;
        events::emit_protocol_unpaused_event(state.guardian, sui::clock::timestamp_ms(clock));
    }

    /// Asserts the cap is currently authorised. Public re-export of the
    /// internal check; used by `admin::pause_pool` / `unpause_pool`.
    public fun assert_is_guardian(config: &GlobalConfig, cap: &GuardianCap) {
        assert_cap_active(borrow_state(config), cap);
    }
}
