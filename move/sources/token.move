module healthdb::token {
    use aptos_framework::fungible_asset::{
        Self,
        MintRef,
        TransferRef,
        BurnRef,
        MutateMetadataRef,
        Metadata
    };
    use aptos_framework::account::{Self};
    use aptos_framework::object::{Self, Object};
    use aptos_framework::primary_fungible_store;
    use std::error;
    use std::signer;
    use std::string::utf8;
    use std::option;

    #[test_only]
    use aptos_std::ed25519;

    // Unauthorized. Only executable by admin.
    const ENOT_ADMIN: u64 = 1;
    // Invalid amount.
    const EINVALID_AMOUNT: u64 = 2;

    const SYMBOL: vector<u8> = b"HEALTH";

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct Asset has key {
        mint_ref: MintRef,
        transfer_ref: TransferRef,
        burn_ref: BurnRef,
        mutate_metadata_ref: MutateMetadataRef
    }

    struct Receipt has key {
        body: ReceiptBody,
        signature: vector<u8>
    }

    struct ReceiptBody has store, drop, copy {
        from: address,
        to: address,
        amount: u64
    }

    fun init_module(admin: &signer) {
        let constructor_ref = &object::create_named_object(admin, SYMBOL);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            constructor_ref,
            option::none(),
            utf8(b"HealthDB"),
            utf8(SYMBOL),
            9,
            utf8(
                b"https://raw.githubusercontent.com/lithdew/healthdb/refs/heads/main/assets/logo.svg"
            ),
            utf8(b"https://github.com/lithdew/healthdb")
        );

        let mint_ref = fungible_asset::generate_mint_ref(constructor_ref);
        let burn_ref = fungible_asset::generate_burn_ref(constructor_ref);
        let transfer_ref = fungible_asset::generate_transfer_ref(constructor_ref);
        let mutate_metadata_ref =
            fungible_asset::generate_mutate_metadata_ref(constructor_ref);
        let metadata_object_signer = object::generate_signer(constructor_ref);

        move_to(
            &metadata_object_signer,
            Asset { mint_ref, transfer_ref, burn_ref, mutate_metadata_ref }
        );
    }

    #[view]
    public fun get_metadata(): Object<Metadata> {
        let address = object::create_object_address(&@healthdb, SYMBOL);
        object::address_to_object<Metadata>(address)
    }

    #[view]
    public fun get_receipt(signature_bytes: vector<u8>): Object<Receipt> {
        let address = object::create_object_address(&@healthdb, signature_bytes);
        object::address_to_object<Receipt>(address)
    }

    public entry fun acknowledge_receipt(
        user: &signer,
        from: address,
        from_scheme: u8,
        from_public_key: vector<u8>,
        recipient_address: address,
        signature_bytes: vector<u8>,
        amount: u64
    ) acquires Asset {
        assert!(amount > 0, error::invalid_argument(EINVALID_AMOUNT));

        let metadata = get_metadata();
        let asset = &Asset[object::object_address(&metadata)];

        let from_wallet = primary_fungible_store::primary_store(from, metadata);
        let to_wallet =
            primary_fungible_store::ensure_primary_store_exists(
                recipient_address, metadata
            );

        let body = ReceiptBody { from: from, to: recipient_address, amount };

        account::verify_signed_message(
            from,
            from_scheme,
            from_public_key,
            signature_bytes,
            body
        );

        let receipt = Receipt { body, signature: signature_bytes };

        let constructor_ref = &object::create_named_object(user, signature_bytes);
        let object_signer = object::generate_signer(constructor_ref);
        move_to(&object_signer, receipt);

        fungible_asset::transfer_with_ref(
            &asset.transfer_ref,
            from_wallet,
            to_wallet,
            amount
        );
    }

    public entry fun mint(admin: &signer, to: address, amount: u64) acquires Asset {
        let metadata = get_metadata();
        assert!(
            object::is_owner(metadata, signer::address_of(admin)),
            error::permission_denied(ENOT_ADMIN)
        );
        let asset = &Asset[object::object_address(&metadata)];

        let wallet = primary_fungible_store::ensure_primary_store_exists(to, metadata);

        let tokens = fungible_asset::mint(&asset.mint_ref, amount);
        fungible_asset::deposit_with_ref(&asset.transfer_ref, wallet, tokens);
    }

    public entry fun burn(admin: &signer, user: address, amount: u64) acquires Asset {
        let metadata = get_metadata();
        assert!(
            object::is_owner(metadata, signer::address_of(admin)),
            error::permission_denied(ENOT_ADMIN)
        );
        let asset = &Asset[object::object_address(&metadata)];

        let wallet = primary_fungible_store::primary_store(user, metadata);
        fungible_asset::burn_from(&asset.burn_ref, wallet, amount);
    }

    #[test(admin = @healthdb)]
    fun test_my_sanity(admin: &signer) acquires Asset {
        init_module(admin);

        mint(admin, signer::address_of(admin), 100_000_000_000);

        let metadata = get_metadata();
        assert!(
            primary_fungible_store::balance(signer::address_of(admin), metadata)
                == 100_000_000_000
        );

        burn(admin, signer::address_of(admin), 100_000_000_000);
        assert!(
            primary_fungible_store::balance(signer::address_of(admin), metadata) == 0
        );
    }

    #[test(admin = @healthdb)]
    fun test_receipt_works(admin: &signer) acquires Asset, Receipt {
        init_module(admin);

        let (user_sk, user_pk) = ed25519::generate_keys();
        let user_public_key = ed25519::validated_public_key_to_bytes(&user_pk);
        let user = account::create_account_from_ed25519_public_key(user_public_key);

        mint(admin, signer::address_of(&user), 100_000_000_000);

        let user_scheme = 0; // account::ED25519_SCHEME

        let body = ReceiptBody {
            from: signer::address_of(&user),
            to: signer::address_of(admin),
            amount: 10_000_000_000
        };

        let signature = ed25519::sign_struct(&user_sk, body);

        acknowledge_receipt(
            admin,
            signer::address_of(&user),
            user_scheme,
            user_public_key,
            signer::address_of(admin),
            ed25519::signature_to_bytes(&signature),
            10_000_000_000
        );

        let metadata = get_metadata();
        assert!(
            primary_fungible_store::balance(signer::address_of(&user), metadata)
                == 90_000_000_000
        );
        assert!(
            primary_fungible_store::balance(signer::address_of(admin), metadata)
                == 10_000_000_000
        );

        let receipt_address =
            object::create_object_address(
                &@healthdb, ed25519::signature_to_bytes(&signature)
            );
        let receipt_object = object::address_to_object<Receipt>(receipt_address);
        let receipt = &Receipt[object::object_address(&receipt_object)];
        assert!(receipt.body.from == signer::address_of(&user));
        assert!(receipt.body.to == signer::address_of(admin));
        assert!(receipt.body.amount == 10_000_000_000);
    }

    #[test(admin = @healthdb)]
    #[expected_failure(abort_code = 0x80001, location = std::object)]
    fun test_receipt_cannot_be_double_spent(admin: &signer) acquires Asset {
        init_module(admin);

        let (user_sk, user_pk) = ed25519::generate_keys();
        let user_public_key = ed25519::validated_public_key_to_bytes(&user_pk);
        let user = account::create_account_from_ed25519_public_key(user_public_key);

        mint(admin, signer::address_of(&user), 100_000_000_000);

        let user_scheme = 0; // account::ED25519_SCHEME

        let body = ReceiptBody {
            from: signer::address_of(&user),
            to: signer::address_of(admin),
            amount: 10_000_000_000
        };

        let signature = ed25519::sign_struct(&user_sk, body);

        acknowledge_receipt(
            admin,
            signer::address_of(&user),
            user_scheme,
            user_public_key,
            signer::address_of(admin),
            ed25519::signature_to_bytes(&signature),
            10_000_000_000
        );

        acknowledge_receipt(
            admin,
            signer::address_of(&user),
            user_scheme,
            user_public_key,
            signer::address_of(admin),
            ed25519::signature_to_bytes(&signature),
            10_000_000_000
        );
    }
}
