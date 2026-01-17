# Horizon API Reference

How Horizon is structured.

[## ðï¸ Response Format

Horizon delivers responses as JSON objects formatted according to HAL. The HAL format makes Horizon more explorable, paginates responses, and connects parent and child resources. Consuming this format is simple using one of the many open source libraries available for most major programming languages.](/docs/data/apis/horizon/api-reference/structure/response-format.md)

[## ðï¸ Streaming

Horizon provides a streaming mechanism for receiving events in near real time. Instead of repeatedly sending requests to Horizon for batch updates, a connection is established between a client and Horizon with updates to an endpoint response streaming as new ledgers close and updates occur.](/docs/data/apis/horizon/api-reference/structure/streaming.md)

[## ðï¸ Rate Limiting

Horizon rate limits on a per-IP-address basis. It can be configured via the option PERHOURRATE\_LIMIT and defaults to 3600 requests per hour. It is recommended that operators of Horizon tune this value based on their individual infrastructural capabilities and usage needs.](/docs/data/apis/horizon/api-reference/structure/rate-limiting.md)

[## ðï¸ XDR

In the Stellar network, transactions are encoded using a standardized protocol called External Data Representation (XDR).](/docs/data/apis/horizon/api-reference/structure/xdr.md)

[## ðï¸ Consistency

For endpoints which serve data which can change from ledger to ledger (for example an account balance), Horizon includes a Latest-Ledger HTTP header in its response. The value of the Latest-Ledger HTTP header is the sequence number of the latest ledger known to Horizon at the time the request was processed. Horizon will guarantee that all the data included in the response is consistent with that ledger. This mechanism prevents race conditions where a request is processed at the boundary of two ledgers and ensures that the response is consistent with the ledger included in the Latest-Ledger HTTP header.](/docs/data/apis/horizon/api-reference/structure/consistency.md)

[## ðï¸ Pagination

1 item](/docs/data/apis/horizon/api-reference/structure/pagination.md)