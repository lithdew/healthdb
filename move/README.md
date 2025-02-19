```bash
aptos init --network testnet
aptos move test --named-addresses healthdb=default
aptos move compile --named-addresses healthdb=default
aptos move publish --named-addresses healthdb=default
```

Published on Aptos testnet under address `0xb37472066d5c19a3815b265357bb1b3e1d7825685c05b22c08707ecbac6b1a64`:

```
Transaction submitted: https://explorer.aptoslabs.com/txn/0x34b54ebcfe3af964e2edbdd40a2660d4d7b12e445b405c1be7fd2257f854dcae?network=testnet
{
  "Result": {
    "transaction_hash": "0x34b54ebcfe3af964e2edbdd40a2660d4d7b12e445b405c1be7fd2257f854dcae",
    "gas_used": 3524,
    "gas_unit_price": 100,
    "sender": "b37472066d5c19a3815b265357bb1b3e1d7825685c05b22c08707ecbac6b1a64",
    "sequence_number": 0,
    "success": true,
    "timestamp_us": 1739957921956451,
    "version": 6628364678,
    "vm_status": "Executed successfully"
  }
}
```
