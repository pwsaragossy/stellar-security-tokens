# Data Format

[## ðï¸ XDR

Stellar stores and communicates ledger data, transactions, results, history, and messages in a binary format called External Data Representation (XDR). XDR is defined in [RFC4506]. XDR is optimized for network performance but not human readable. The Stellar SDKs convert XDRs into friendlier formats.](/docs/learn/fundamentals/data-format/xdr.md)

[## ðï¸ XDR-JSON

The XDR-JSON schema is defined by the stellar-xdr crate and provides a round-trippable means for converting Stellar [XDR] values to JSON and converting that JSON back to the identical XDR.](/docs/learn/fundamentals/data-format/xdr-json.md)