export const ABI = {
  "address": "0x3f29e3c1990daec326eb7a210cb7b30fe1369d5c3a44b27870c782508fea93e1",
  "name": "token",
  "friends": [],
  "exposed_functions": [
    {
      "name": "burn",
      "visibility": "public",
      "is_entry": true,
      "is_view": false,
      "generic_type_params": [],
      "params": [
        "&signer",
        "address",
        "u64"
      ],
      "return": []
    },
    {
      "name": "mint",
      "visibility": "public",
      "is_entry": true,
      "is_view": false,
      "generic_type_params": [],
      "params": [
        "&signer",
        "address",
        "u64"
      ],
      "return": []
    },
    {
      "name": "acknowledge_receipt",
      "visibility": "public",
      "is_entry": true,
      "is_view": false,
      "generic_type_params": [],
      "params": [
        "&signer",
        "address",
        "u8",
        "vector<u8>",
        "address",
        "vector<u8>",
        "u64"
      ],
      "return": []
    },
    {
      "name": "get_metadata",
      "visibility": "public",
      "is_entry": false,
      "is_view": true,
      "generic_type_params": [],
      "params": [],
      "return": [
        "0x1::object::Object<0x1::fungible_asset::Metadata>"
      ]
    },
    {
      "name": "get_receipt",
      "visibility": "public",
      "is_entry": false,
      "is_view": true,
      "generic_type_params": [],
      "params": [
        "vector<u8>"
      ],
      "return": [
        "0x1::object::Object<0x3f29e3c1990daec326eb7a210cb7b30fe1369d5c3a44b27870c782508fea93e1::token::Receipt>"
      ]
    }
  ],
  "structs": [
    {
      "name": "Asset",
      "is_native": false,
      "is_event": false,
      "abilities": [
        "key"
      ],
      "generic_type_params": [],
      "fields": [
        {
          "name": "mint_ref",
          "type": "0x1::fungible_asset::MintRef"
        },
        {
          "name": "transfer_ref",
          "type": "0x1::fungible_asset::TransferRef"
        },
        {
          "name": "burn_ref",
          "type": "0x1::fungible_asset::BurnRef"
        },
        {
          "name": "mutate_metadata_ref",
          "type": "0x1::fungible_asset::MutateMetadataRef"
        }
      ]
    },
    {
      "name": "Receipt",
      "is_native": false,
      "is_event": false,
      "abilities": [
        "key"
      ],
      "generic_type_params": [],
      "fields": [
        {
          "name": "body",
          "type": "0x3f29e3c1990daec326eb7a210cb7b30fe1369d5c3a44b27870c782508fea93e1::token::ReceiptBody"
        },
        {
          "name": "signature",
          "type": "vector<u8>"
        }
      ]
    },
    {
      "name": "ReceiptBody",
      "is_native": false,
      "is_event": false,
      "abilities": [
        "copy",
        "drop",
        "store"
      ],
      "generic_type_params": [],
      "fields": [
        {
          "name": "from",
          "type": "address"
        },
        {
          "name": "to",
          "type": "address"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ]
} as const