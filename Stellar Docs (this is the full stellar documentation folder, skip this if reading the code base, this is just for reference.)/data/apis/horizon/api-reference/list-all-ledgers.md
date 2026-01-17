# List All Ledgers

```
GET

## /ledgers
```

This endpoint lists all ledgers and can be used in streaming mode. Streaming mode allows you to listen for new ledgers as they close. If called in streaming mode, Horizon will start at the earliest known ledger unless a cursor is set, in which case it will start from that cursor. By setting the cursor value to now, you can stream ledgers since your request time.

## Request[](#request "Direct link to Request")

## Responses[](#responses "Direct link to Responses")

* 200

Success