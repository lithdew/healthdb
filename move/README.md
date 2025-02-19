```bash
aptos init --network testnet
aptos move test --named-addresses healthdb=default
aptos move compile --named-addresses healthdb=default
aptos move publish --named-addresses healthdb=default
```

Published on Aptos testnet under address `0x3f29e3c1990daec326eb7a210cb7b30fe1369d5c3a44b27870c782508fea93e1`:

```
Transaction submitted: https://explorer.aptoslabs.com/txn/0xef016c8dd1fdd82213468c98fbffed2c731e2f564d79c295652d5c934aa05336?network=testnet
{
  "Result": {
    "transaction_hash": "0xef016c8dd1fdd82213468c98fbffed2c731e2f564d79c295652d5c934aa05336",
    "gas_used": 3439,
    "gas_unit_price": 100,
    "sender": "3f29e3c1990daec326eb7a210cb7b30fe1369d5c3a44b27870c782508fea93e1",
    "sequence_number": 0,
    "success": true,
    "timestamp_us": 1739955009465960,
    "version": 6628315393,
    "vm_status": "Executed successfully"
  }
}
```