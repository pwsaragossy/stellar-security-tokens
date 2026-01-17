# Providers

Multiple infrastructure providers have made Stellar RPC services available, and offer plans ranging from free to dedicated instances. These providers can be used for development, testing, and production.

These providers allow access to the Futurenet, Testnet and Mainnet network.

| Provider | Futurenet | Testnet | Mainnet | Dedicated Nodes | RPC Archive |
| --- | --- | --- | --- | --- | --- |
| [Blockdaemon](https://www.blockdaemon.com/apply/soroban) |  |  |  |  |  |
| [Validation Cloud](https://app.validationcloud.io/) |  |  |  |  |  |
| [QuickNode](https://www.quicknode.com/docs/stellar) |  |  |  |  |  |
| [NowNodes](https://nownodes.io/nodes/stellar-xlm) |  |  |  |  |  |
| [Gateway\*](https://gateway.fm/public-rpc/) |  |  |  |  |  |
| [Ankr](https://www.ankr.com/rpc/advanced-api/) |  |  |  |  |  |
| [Infstones](https://infstones.com/) |  |  |  |  |  |
| [Obsrvr\*](https://www.withObsrvr.com/) |  |  |  |  |  |
| [Nodies](https://nodies.org) |  |  |  |  |  |
| [OnFinality\*](https://onfinality.io/networks/stellar) |  |  |  |  |  |
| [Lightsail Network - Quasar\*](https://quasar.lightsail.network/) |  |  |  |  |  |
| [Uniblock](https://www.uniblock.dev/) |  |  |  |  |  |
| [Exaion](https://crypto.exaion.com) |  |  |  |  |  |

\**RPC Archive is a new option for those looking to retrieve full ledger history. Currently only the [getLedgers](/docs/data/apis/rpc/api-reference/methods/getLedgers.md) RPC method supports this feature. You can choose one of the providers above, or create your own getLedgers archive by following [these steps](/docs/data/apis/rpc/admin-guide/data-lake-integration.md).*

*The "Dedicated Nodes" column represents providers who host full nodes as a service.*

### Publicly Accessible APIs[](#publicly-accessible-apis "Direct link to Publicly Accessible APIs")

| Provider | Network | URL |
| --- | --- | --- |
| [Liquify](https://www.liquify.io/) | Futurenet | RPC: `https://stellar.liquify.com/api=41EEWAH79Y5OCGI7/futurenet` |
|  | Testnet | RPC: `https://stellar.liquify.com/api=41EEWAH79Y5OCGI7/testnet` |
|  | Mainnet | RPC: `https://stellar-mainnet.liquify.com/api=41EEWAH79Y5OCGI7/mainnet` |
| [Gateway](https://gateway.fm/) | Testnet | RPC: `https://soroban-rpc.testnet.stellar.gateway.fm` |
|  | Mainnet | RPC: `https://soroban-rpc.mainnet.stellar.gateway.fm` |
| [sorobanrpc.com](https://sorobanrpc.com/) | Mainnet | RPC: `https://mainnet.sorobanrpc.com` |
| [Nodies](https://nodies.org) | Testnet | RPC: `https://stellar-soroban-testnet-public.nodies.app` |
|  | Mainnet | RPC: `https://stellar-soroban-public.nodies.app` |
| [SDF](http://www.stellar.org) | Futurenet | RPC: `https://rpc-futurenet.stellar.org` |
| [OnFinality](https://onfinality.io/networks/stellar) | Mainnet | RPC: `https://stellar.api.onfinality.io/public` |
| [Lightsail Network - Quasar](https://quasar.lightsail.network/) | Mainnet | RPC `https://rpc.lightsail.network/` |
|  | Mainnet | Full Archive RPC: `https://archive-rpc.lightsail.network/` |