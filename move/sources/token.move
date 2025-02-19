module healthdb::token {
    use aptos_framework::fungible_asset::{Self, MintRef, TransferRef, BurnRef, Metadata};
    use aptos_framework::object::{Self, Object};
    use aptos_framework::primary_fungible_store;
    use std::error;
    use std::signer;
    use std::string::utf8;
    use std::option;

    // Unauthorized. Only executable by admin.
    const ENOT_ADMIN: u64 = 1;

    const SYMBOL: vector<u8> = b"HEALTH";

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct Asset has key {
        mint_ref: MintRef,
        transfer_ref: TransferRef,
        burn_ref: BurnRef,
    }

    fun init_module(admin: &signer) {
        let constructor_ref = &object::create_named_object(admin, SYMBOL);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            constructor_ref,
            option::none(),
            utf8(b"HealthDB"),
            utf8(SYMBOL),
            9,
            utf8(b"https://   "),
            utf8(b"https://github.com/lithdew/healthdb"),
        );

        let mint_ref = fungible_asset::generate_mint_ref(constructor_ref);
        let burn_ref = fungible_asset::generate_burn_ref(constructor_ref);
        let transfer_ref = fungible_asset::generate_transfer_ref(constructor_ref);
        let metadata_object_signer = object::generate_signer(constructor_ref);

        move_to(
            &metadata_object_signer,
            Asset { mint_ref, transfer_ref, burn_ref }
        );
    }

    #[view]
    public fun get_metadata(): Object<Metadata> {
        let address = object::create_object_address(&@healthdb, SYMBOL);
        object::address_to_object<Metadata>(address)
    }

    public entry fun mint(admin: &signer, to: address, amount: u64) acquires Asset {
        let metadata = get_metadata();
        assert!(object::is_owner(metadata, signer::address_of(admin)), error::permission_denied(ENOT_ADMIN));
        let asset = borrow_global<Asset>(object::object_address(&metadata));

        let wallet = primary_fungible_store::ensure_primary_store_exists(to, metadata);

        let tokens = fungible_asset::mint(&asset.mint_ref, amount);
        fungible_asset::deposit_with_ref(&asset.transfer_ref, wallet, tokens);
    }

    public entry fun burn(admin: &signer, user: address, amount: u64) acquires Asset {
        let metadata = get_metadata();
        assert!(object::is_owner(metadata, signer::address_of(admin)), error::permission_denied(ENOT_ADMIN));
        let asset = borrow_global<Asset>(object::object_address(&metadata));

        let wallet = primary_fungible_store::primary_store(user, metadata);
        fungible_asset::burn_from(&asset.burn_ref, wallet, amount);
    }

    #[test(admin = @healthdb)]
    fun test_my_sanity(admin: &signer) acquires Asset {
        init_module(admin);

        mint(admin, signer::address_of(admin), 100_000_000_000);

        let metadata = get_metadata();
        assert!(primary_fungible_store::balance(signer::address_of(admin), metadata) == 100_000_000_000);

        burn(admin, signer::address_of(admin), 100_000_000_000);
        assert!(primary_fungible_store::balance(signer::address_of(admin), metadata) == 0);
    }
}