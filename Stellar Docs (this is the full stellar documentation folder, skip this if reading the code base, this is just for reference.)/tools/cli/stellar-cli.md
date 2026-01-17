# Stellar CLI Manual

This document contains the help content for the `stellar` command-line program.

## `stellar`[](#stellar "Direct link to stellar")

Work seamlessly with Stellar accounts, contracts, and assets from the command line.

* Generate and manage keys and accounts
* Build, deploy, and interact with contracts
* Deploy asset contracts
* Stream events
* Start local testnets
* Decode, encode XDR
* More!

For additional information see:

* Stellar Docs: <https://developers.stellar.org>
* Smart Contract Docs: <../build/smart-contracts/overview>
* CLI Docs: <../tools/developer-tools/cli/stellar-cli>

To get started generate a new identity:

stellar keys generate alice

Use keys with the `--source` flag in other commands.

Commands that work with contracts are organized under the `contract` subcommand. List them:

stellar contract --help

Use contracts like a CLI:

stellar contract invoke --id CCR6QKTWZQYW6YUJ7UP7XXZRLWQPFRV6SWBLQS4ZQOSAF4BOUD77OTE2 --source alice --network testnet -- --help

Anything after the `--` double dash (the "slop") is parsed as arguments to the contract-specific CLI, generated on-the-fly from the contract schema. For the hello world example, with a function called `hello` that takes one string argument `to`, here's how you invoke it:

stellar contract invoke --id CCR6QKTWZQYW6YUJ7UP7XXZRLWQPFRV6SWBLQS4ZQOSAF4BOUD77OTE2 --source alice --network testnet -- hello --to world

**Usage:** `stellar [OPTIONS] <COMMAND>`

###### **Subcommands:**[](#subcommands "Direct link to subcommands")

* `contract`  Tools for smart contract developers
* `doctor`  Diagnose and troubleshoot CLI and network issues
* `events`  Watch the network for contract events
* `env`  Prints the environment variables
* `keys`  Create and manage identities including keys and addresses
* `network`  Configure connection to networks
* `container`  Start local networks in containers
* `config`  Manage CLI configuration
* `snapshot`  Download a snapshot of a ledger from an archive
* `tx`  Sign, Simulate, and Send transactions
* `xdr`  Decode and encode XDR
* `strkey`  Decode and encode strkey
* `completion`  Print shell completion code for the specified shell
* `cache`  Cache for transactions and contract specs
* `version`  Print version information
* `plugin`  The subcommand for CLI plugins
* `ledger`  Fetch ledger information
* `fee-stats`   ï¸ Deprecated, use `fees stats` instead. Fetch network feestats
* `fees`  Fetch network feestats and configure CLI fee settings

###### **Options:**[](#options "Direct link to options")

* `--list`   ï¸ Deprecated, use `stellar plugin ls`. List installed plugins. E.g. `stellar-hello`

###### **Options (Global):**[](#options-global "Direct link to options-global")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings
* `-f`, `--filter-logs <FILTER_LOGS>`  Filter logs output. To turn on `stellar_cli::log::footprint=debug` or off `=off`. Can also use env var `RUST_LOG`
* `-q`, `--quiet`  Do not write logs to stderr including `INFO`
* `-v`, `--verbose`  Log DEBUG events
* `--very-verbose` [alias: `vv`]  Log DEBUG and TRACE events
* `--no-cache`  Do not cache your simulations and transactions

## `stellar contract`[](#stellar-contract "Direct link to stellar-contract")

Tools for smart contract developers

**Usage:** `stellar contract <COMMAND>`

###### **Subcommands:**[](#subcommands-1 "Direct link to subcommands-1")

* `asset`  Utilities to deploy a Stellar Asset Contract or get its id
* `alias`  Utilities to manage contract aliases
* `bindings`  Generate code client bindings for a contract
* `build`  Build a contract from source
* `extend`  Extend the time to live ledger of a contract-data ledger entry
* `deploy`  Deploy a wasm contract
* `fetch`  Fetch a contract's Wasm binary
* `id`  Generate the contract id for a given contract or asset
* `info`  Access info about contracts
* `init`  Initialize a Soroban contract project
* `inspect`   ï¸ Deprecated, use `contract info`. Inspect a WASM file listing contract functions, meta, etc
* `upload`  Install a WASM file to the ledger without creating a contract instance
* `install`   ï¸ Deprecated, use `contract upload`. Install a WASM file to the ledger without creating a contract instance
* `invoke`  Invoke a contract function
* `optimize`   ï¸ Deprecated, use `build --optimize`. Optimize a WASM file
* `read`  Print the current value of a contract-data ledger entry
* `restore`  Restore an evicted value for a contract-data legder entry

## `stellar contract asset`[](#stellar-contract-asset "Direct link to stellar-contract-asset")

Utilities to deploy a Stellar Asset Contract or get its id

**Usage:** `stellar contract asset <COMMAND>`

###### **Subcommands:**[](#subcommands-2 "Direct link to subcommands-2")

* `id`  Get Id of builtin Soroban Asset Contract. Deprecated, use `stellar contract id asset` instead
* `deploy`  Deploy builtin Soroban Asset Contract

## `stellar contract asset id`[](#stellar-contract-asset-id "Direct link to stellar-contract-asset-id")

Get Id of builtin Soroban Asset Contract. Deprecated, use `stellar contract id asset` instead

**Usage:** `stellar contract asset id [OPTIONS] --asset <ASSET>`

###### **Options:**[](#options-1 "Direct link to options-1")

* `--asset <ASSET>`  ID of the Stellar classic asset to wrap, e.g. "native", "USDC:G...5", "USDC:alias"

###### **Options (Global):**[](#options-global-1 "Direct link to options-global-1")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc "Direct link to options-rpc")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract asset deploy`[](#stellar-contract-asset-deploy "Direct link to stellar-contract-asset-deploy")

Deploy builtin Soroban Asset Contract

**Usage:** `stellar contract asset deploy [OPTIONS] --asset <ASSET> --source-account <SOURCE_ACCOUNT>`

###### **Options:**[](#options-2 "Direct link to options-2")

* `--asset <ASSET>`  ID of the Stellar classic asset to wrap, e.g. "USDC:G...5"
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--alias <ALIAS>`  The alias that will be used to save the assets's id. Whenever used, `--alias` will always overwrite the existing contract id configuration without asking for confirmation
* `--build-only`  Build the transaction and only write the base64 xdr to stdout

###### **Options (Global):**[](#options-global-2 "Direct link to options-global-2")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-1 "Direct link to options-rpc-1")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config
* `--resource-fee <RESOURCE_FEE>`  Set the fee for smart contract resource consumption, in stroops. 1 stroop = 0.0000001 xlm. Overrides the simulated resource fee
* `--instructions <INSTRUCTIONS>`   ï¸ Deprecated, use `--instruction-leeway` to increase instructions. Number of instructions to allocate for the transaction
* `--instruction-leeway <INSTRUCTION_LEEWAY>`  Allow this many extra instructions when budgeting resources with transaction simulation
* `--cost`  Output the cost execution to stderr

## `stellar contract alias`[](#stellar-contract-alias "Direct link to stellar-contract-alias")

Utilities to manage contract aliases

**Usage:** `stellar contract alias <COMMAND>`

###### **Subcommands:**[](#subcommands-3 "Direct link to subcommands-3")

* `remove`  Remove contract alias
* `add`  Add contract alias
* `show`  Show the contract id associated with a given alias
* `ls`  List all aliases

## `stellar contract alias remove`[](#stellar-contract-alias-remove "Direct link to stellar-contract-alias-remove")

Remove contract alias

**Usage:** `stellar contract alias remove [OPTIONS] <ALIAS>`

###### **Arguments:**[](#arguments "Direct link to arguments")

* `<ALIAS>`  The contract alias that will be removed

###### **Options (Global):**[](#options-global-3 "Direct link to options-global-3")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-2 "Direct link to options-rpc-2")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract alias add`[](#stellar-contract-alias-add "Direct link to stellar-contract-alias-add")

Add contract alias

**Usage:** `stellar contract alias add [OPTIONS] --id <CONTRACT_ID> <ALIAS>`

###### **Arguments:**[](#arguments-1 "Direct link to arguments-1")

* `<ALIAS>`  The contract alias that will be used

###### **Options:**[](#options-3 "Direct link to options-3")

* `--overwrite`  Overwrite the contract alias if it already exists
* `--id <CONTRACT_ID>`  The contract id that will be associated with the alias

###### **Options (Global):**[](#options-global-4 "Direct link to options-global-4")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-3 "Direct link to options-rpc-3")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract alias show`[](#stellar-contract-alias-show "Direct link to stellar-contract-alias-show")

Show the contract id associated with a given alias

**Usage:** `stellar contract alias show [OPTIONS] <ALIAS>`

###### **Arguments:**[](#arguments-2 "Direct link to arguments-2")

* `<ALIAS>`  The contract alias that will be displayed

###### **Options (Global):**[](#options-global-5 "Direct link to options-global-5")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-4 "Direct link to options-rpc-4")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract alias ls`[](#stellar-contract-alias-ls "Direct link to stellar-contract-alias-ls")

List all aliases

**Usage:** `stellar contract alias ls [OPTIONS]`

###### **Options (Global):**[](#options-global-6 "Direct link to options-global-6")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar contract bindings`[](#stellar-contract-bindings "Direct link to stellar-contract-bindings")

Generate code client bindings for a contract

**Usage:** `stellar contract bindings <COMMAND>`

###### **Subcommands:**[](#subcommands-4 "Direct link to subcommands-4")

* `json`  Generate Json Bindings
* `rust`  Generate Rust bindings
* `typescript`  Generate a TypeScript / JavaScript package
* `python`  Generate Python bindings
* `java`  Generate Java bindings
* `flutter`  Generate Flutter bindings
* `swift`  Generate Swift bindings
* `php`  Generate PHP bindings

## `stellar contract bindings json`[](#stellar-contract-bindings-json "Direct link to stellar-contract-bindings-json")

Generate Json Bindings

**Usage:** `stellar contract bindings json --wasm <WASM>`

###### **Options:**[](#options-4 "Direct link to options-4")

* `--wasm <WASM>`  Path to wasm binary

## `stellar contract bindings rust`[](#stellar-contract-bindings-rust "Direct link to stellar-contract-bindings-rust")

Generate Rust bindings

**Usage:** `stellar contract bindings rust --wasm <WASM>`

###### **Options:**[](#options-5 "Direct link to options-5")

* `--wasm <WASM>`  Path to wasm binary

## `stellar contract bindings typescript`[](#stellar-contract-bindings-typescript "Direct link to stellar-contract-bindings-typescript")

Generate a TypeScript / JavaScript package

**Usage:** `stellar contract bindings typescript [OPTIONS] --output-dir <OUTPUT_DIR> <--wasm <WASM>|--wasm-hash <WASM_HASH>|--contract-id <CONTRACT_ID>>`

###### **Options:**[](#options-6 "Direct link to options-6")

* `--wasm <WASM>`  Wasm file path on local filesystem. Provide this OR `--wasm-hash` OR `--contract-id`
* `--wasm-hash <WASM_HASH>`  Hash of Wasm blob on a network. Provide this OR `--wasm` OR `--contract-id`
* `--contract-id <CONTRACT_ID>` [alias: `id`]  Contract ID/alias on a network. Provide this OR `--wasm-hash` OR `--wasm`
* `--output-dir <OUTPUT_DIR>`  Where to place generated project
* `--overwrite`  Whether to overwrite output directory if it already exists

###### **Options (Global):**[](#options-global-7 "Direct link to options-global-7")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-5 "Direct link to options-rpc-5")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract bindings python`[](#stellar-contract-bindings-python "Direct link to stellar-contract-bindings-python")

Generate Python bindings

**Usage:** `stellar contract bindings python`

## `stellar contract bindings java`[](#stellar-contract-bindings-java "Direct link to stellar-contract-bindings-java")

Generate Java bindings

**Usage:** `stellar contract bindings java`

## `stellar contract bindings flutter`[](#stellar-contract-bindings-flutter "Direct link to stellar-contract-bindings-flutter")

Generate Flutter bindings

**Usage:** `stellar contract bindings flutter`

## `stellar contract bindings swift`[](#stellar-contract-bindings-swift "Direct link to stellar-contract-bindings-swift")

Generate Swift bindings

**Usage:** `stellar contract bindings swift`

## `stellar contract bindings php`[](#stellar-contract-bindings-php "Direct link to stellar-contract-bindings-php")

Generate PHP bindings

**Usage:** `stellar contract bindings php`

## `stellar contract build`[](#stellar-contract-build "Direct link to stellar-contract-build")

Build a contract from source

Builds all crates that are referenced by the cargo manifest (Cargo.toml) that have cdylib as their crate-type. Crates are built for the wasm32 target. Unless configured otherwise, crates are built with their default features and with their release profile.

In workspaces builds all crates unless a package name is specified, or the command is executed from the sub-directory of a workspace crate.

To view the commands that will be executed, without executing them, use the --print-commands-only option.

**Usage:** `stellar contract build [OPTIONS]`

###### **Features:**[](#features "Direct link to features")

* `--features <FEATURES>`  Build with the list of features activated, space or comma separated
* `--all-features`  Build with the all features activated
* `--no-default-features`  Build with the default feature not activated

###### **Metadata:**[](#metadata "Direct link to metadata")

* `--meta <META>`  Add key-value to contract meta (adds the meta to the `contractmetav0` custom section)

###### **Options:**[](#options-7 "Direct link to options-7")

* `--manifest-path <MANIFEST_PATH>`  Path to Cargo.toml
* `--package <PACKAGE>`  Package to build

  If omitted, all packages that build for crate-type cdylib are built.
* `--profile <PROFILE>`  Build with the specified profile

  Default value: `release`
* `--out-dir <OUT_DIR>`  Directory to copy wasm files to

  If provided, wasm files can be found in the cargo target directory, and the specified directory.

  If ommitted, wasm files are written only to the cargo target directory.
* `--optimize`  Optimize the generated wasm

###### **Other:**[](#other "Direct link to other")

* `--print-commands-only`  Print commands to build without executing them

## `stellar contract extend`[](#stellar-contract-extend "Direct link to stellar-contract-extend")

Extend the time to live ledger of a contract-data ledger entry.

If no keys are specified the contract itself is extended.

**Usage:** `stellar contract extend [OPTIONS] --ledgers-to-extend <LEDGERS_TO_EXTEND> --source-account <SOURCE_ACCOUNT>`

###### **Options:**[](#options-8 "Direct link to options-8")

* `--ledgers-to-extend <LEDGERS_TO_EXTEND>`  Number of ledgers to extend the entries
* `--ttl-ledger-only`  Only print the new Time To Live ledger
* `--id <CONTRACT_ID>`  Contract ID to which owns the data entries. If no keys provided the Contract's instance will be extended
* `--key <KEY>`  Storage key (symbols only)
* `--key-xdr <KEY_XDR>`  Storage key (base64-encoded XDR)
* `--wasm <WASM>`  Path to Wasm file of contract code to extend
* `--wasm-hash <WASM_HASH>`  Path to Wasm file of contract code to extend
* `--durability <DURABILITY>`  Storage entry durability

  Default value: `persistent`

  Possible values:

  + `persistent`: Persistent
  + `temporary`: Temporary
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout

###### **Options (Global):**[](#options-global-8 "Direct link to options-global-8")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-6 "Direct link to options-rpc-6")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config
* `--resource-fee <RESOURCE_FEE>`  Set the fee for smart contract resource consumption, in stroops. 1 stroop = 0.0000001 xlm. Overrides the simulated resource fee
* `--instructions <INSTRUCTIONS>`   ï¸ Deprecated, use `--instruction-leeway` to increase instructions. Number of instructions to allocate for the transaction
* `--instruction-leeway <INSTRUCTION_LEEWAY>`  Allow this many extra instructions when budgeting resources with transaction simulation
* `--cost`  Output the cost execution to stderr

## `stellar contract deploy`[](#stellar-contract-deploy "Direct link to stellar-contract-deploy")

Deploy a wasm contract

**Usage:** `stellar contract deploy [OPTIONS] --source-account <SOURCE_ACCOUNT> <--wasm <WASM>|--wasm-hash <WASM_HASH>> [-- <CONTRACT_CONSTRUCTOR_ARGS>...]`

###### **Arguments:**[](#arguments-3 "Direct link to arguments-3")

* `<CONTRACT_CONSTRUCTOR_ARGS>`  If provided, will be passed to the contract's `__constructor` function with provided arguments for that function as `--arg-name value`

###### **Options:**[](#options-9 "Direct link to options-9")

* `--wasm <WASM>`  WASM file to deploy
* `--wasm-hash <WASM_HASH>`  Hash of the already installed/deployed WASM file
* `--salt <SALT>`  Custom salt 32-byte salt for the token id
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `-i`, `--ignore-checks`  Whether to ignore safety checks when deploying contracts

  Default value: `false`
* `--alias <ALIAS>`  The alias that will be used to save the contract's id. Whenever used, `--alias` will always overwrite the existing contract id configuration without asking for confirmation
* `--build-only`  Build the transaction and only write the base64 xdr to stdout

###### **Options (Global):**[](#options-global-9 "Direct link to options-global-9")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-7 "Direct link to options-rpc-7")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config
* `--resource-fee <RESOURCE_FEE>`  Set the fee for smart contract resource consumption, in stroops. 1 stroop = 0.0000001 xlm. Overrides the simulated resource fee
* `--instructions <INSTRUCTIONS>`   ï¸ Deprecated, use `--instruction-leeway` to increase instructions. Number of instructions to allocate for the transaction
* `--instruction-leeway <INSTRUCTION_LEEWAY>`  Allow this many extra instructions when budgeting resources with transaction simulation
* `--cost`  Output the cost execution to stderr

## `stellar contract fetch`[](#stellar-contract-fetch "Direct link to stellar-contract-fetch")

Fetch a contract's Wasm binary

**Usage:** `stellar contract fetch [OPTIONS]`

###### **Options:**[](#options-10 "Direct link to options-10")

* `--id <CONTRACT_ID>`  Contract ID to fetch
* `--wasm-hash <WASM_HASH>`  Wasm to fetch
* `-o`, `--out-file <OUT_FILE>`  Where to write output otherwise stdout is used

###### **Options (Global):**[](#options-global-10 "Direct link to options-global-10")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-8 "Direct link to options-rpc-8")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract id`[](#stellar-contract-id "Direct link to stellar-contract-id")

Generate the contract id for a given contract or asset

**Usage:** `stellar contract id <COMMAND>`

###### **Subcommands:**[](#subcommands-5 "Direct link to subcommands-5")

* `asset`  Deploy builtin Soroban Asset Contract
* `wasm`  Deploy normal Wasm Contract

## `stellar contract id asset`[](#stellar-contract-id-asset "Direct link to stellar-contract-id-asset")

Deploy builtin Soroban Asset Contract

**Usage:** `stellar contract id asset [OPTIONS] --asset <ASSET>`

###### **Options:**[](#options-11 "Direct link to options-11")

* `--asset <ASSET>`  ID of the Stellar classic asset to wrap, e.g. "native", "USDC:G...5", "USDC:alias"

###### **Options (Global):**[](#options-global-11 "Direct link to options-global-11")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-9 "Direct link to options-rpc-9")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract id wasm`[](#stellar-contract-id-wasm "Direct link to stellar-contract-id-wasm")

Deploy normal Wasm Contract

**Usage:** `stellar contract id wasm [OPTIONS] --salt <SALT> --source-account <SOURCE_ACCOUNT>`

###### **Options:**[](#options-12 "Direct link to options-12")

* `--salt <SALT>`  ID of the Soroban contract
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided

###### **Options (Global):**[](#options-global-12 "Direct link to options-global-12")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-10 "Direct link to options-rpc-10")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract info`[](#stellar-contract-info "Direct link to stellar-contract-info")

Access info about contracts

**Usage:** `stellar contract info <COMMAND>`

###### **Subcommands:**[](#subcommands-6 "Direct link to subcommands-6")

* `interface`  Output the interface of a contract
* `meta`  Output the metadata stored in a contract
* `env-meta`  Output the env required metadata stored in a contract
* `build`  Output the contract build information, if available

## `stellar contract info interface`[](#stellar-contract-info-interface "Direct link to stellar-contract-info-interface")

Output the interface of a contract.

A contract's interface describes the functions, parameters, and types that the contract makes accessible to be called.

The data outputted by this command is a stream of `SCSpecEntry` XDR values. See the type definitions in [stellar-xdr](https://github.com/stellar/stellar-xdr). [See also XDR data format](../learn/encyclopedia/data-format/xdr).

Outputs no data when no data is present in the contract.

**Usage:** `stellar contract info interface [OPTIONS] <--wasm <WASM>|--wasm-hash <WASM_HASH>|--contract-id <CONTRACT_ID>>`

###### **Options:**[](#options-13 "Direct link to options-13")

* `--wasm <WASM>`  Wasm file path on local filesystem. Provide this OR `--wasm-hash` OR `--contract-id`
* `--wasm-hash <WASM_HASH>`  Hash of Wasm blob on a network. Provide this OR `--wasm` OR `--contract-id`
* `--contract-id <CONTRACT_ID>` [alias: `id`]  Contract ID/alias on a network. Provide this OR `--wasm-hash` OR `--wasm`
* `--output <OUTPUT>`  Format of the output

  Default value: `rust`

  Possible values:

  + `rust`: Rust code output of the contract interface
  + `xdr-base64`: XDR output of the info entry
  + `json`: JSON output of the info entry (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of the info entry

###### **Options (Global):**[](#options-global-13 "Direct link to options-global-13")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-11 "Direct link to options-rpc-11")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract info meta`[](#stellar-contract-info-meta "Direct link to stellar-contract-info-meta")

Output the metadata stored in a contract.

A contract's meta is a series of key-value pairs that the contract developer can set with any values to provided metadata about the contract. The meta also contains some information like the version of Rust SDK, and Rust compiler version.

The data outputted by this command is a stream of `SCMetaEntry` XDR values. See the type definitions in [stellar-xdr](https://github.com/stellar/stellar-xdr). [See also XDR data format](../learn/encyclopedia/data-format/xdr).

Outputs no data when no data is present in the contract.

**Usage:** `stellar contract info meta [OPTIONS] <--wasm <WASM>|--wasm-hash <WASM_HASH>|--contract-id <CONTRACT_ID>>`

###### **Options:**[](#options-14 "Direct link to options-14")

* `--wasm <WASM>`  Wasm file path on local filesystem. Provide this OR `--wasm-hash` OR `--contract-id`
* `--wasm-hash <WASM_HASH>`  Hash of Wasm blob on a network. Provide this OR `--wasm` OR `--contract-id`
* `--contract-id <CONTRACT_ID>` [alias: `id`]  Contract ID/alias on a network. Provide this OR `--wasm-hash` OR `--wasm`
* `--output <OUTPUT>`  Format of the output

  Default value: `text`

  Possible values:

  + `text`: Text output of the meta info entry
  + `xdr-base64`: XDR output of the info entry
  + `json`: JSON output of the info entry (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of the info entry

###### **Options (Global):**[](#options-global-14 "Direct link to options-global-14")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-12 "Direct link to options-rpc-12")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract info env-meta`[](#stellar-contract-info-env-meta "Direct link to stellar-contract-info-env-meta")

Output the env required metadata stored in a contract.

Env-meta is information stored in all contracts, in the `contractenvmetav0` WASM custom section, about the environment that the contract was built for. Env-meta allows the Soroban Env to know whether the contract is compatibility with the network in its current configuration.

The data outputted by this command is a stream of `SCEnvMetaEntry` XDR values. See the type definitions in [stellar-xdr](https://github.com/stellar/stellar-xdr). [See also XDR data format](../learn/encyclopedia/data-format/xdr).

Outputs no data when no data is present in the contract.

**Usage:** `stellar contract info env-meta [OPTIONS] <--wasm <WASM>|--wasm-hash <WASM_HASH>|--contract-id <CONTRACT_ID>>`

###### **Options:**[](#options-15 "Direct link to options-15")

* `--wasm <WASM>`  Wasm file path on local filesystem. Provide this OR `--wasm-hash` OR `--contract-id`
* `--wasm-hash <WASM_HASH>`  Hash of Wasm blob on a network. Provide this OR `--wasm` OR `--contract-id`
* `--contract-id <CONTRACT_ID>` [alias: `id`]  Contract ID/alias on a network. Provide this OR `--wasm-hash` OR `--wasm`
* `--output <OUTPUT>`  Format of the output

  Default value: `text`

  Possible values:

  + `text`: Text output of the meta info entry
  + `xdr-base64`: XDR output of the info entry
  + `json`: JSON output of the info entry (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of the info entry

###### **Options (Global):**[](#options-global-15 "Direct link to options-global-15")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-13 "Direct link to options-rpc-13")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract info build`[](#stellar-contract-info-build "Direct link to stellar-contract-info-build")

Output the contract build information, if available.

If the contract has a meta entry like `source_repo=github:user/repo`, this command will try to fetch the attestation information for the WASM file.

**Usage:** `stellar contract info build [OPTIONS] <--wasm <WASM>|--wasm-hash <WASM_HASH>|--contract-id <CONTRACT_ID>>`

###### **Options:**[](#options-16 "Direct link to options-16")

* `--wasm <WASM>`  Wasm file path on local filesystem. Provide this OR `--wasm-hash` OR `--contract-id`
* `--wasm-hash <WASM_HASH>`  Hash of Wasm blob on a network. Provide this OR `--wasm` OR `--contract-id`
* `--contract-id <CONTRACT_ID>` [alias: `id`]  Contract ID/alias on a network. Provide this OR `--wasm-hash` OR `--wasm`

###### **Options (Global):**[](#options-global-16 "Direct link to options-global-16")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-14 "Direct link to options-rpc-14")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract init`[](#stellar-contract-init "Direct link to stellar-contract-init")

Initialize a Soroban contract project.

This command will create a Cargo workspace project and add a sample Stellar contract. The name of the contract can be specified by `--name`. It can be run multiple times with different names in order to generate multiple contracts, and files won't be overwritten unless `--overwrite` is passed.

**Usage:** `stellar contract init [OPTIONS] <PROJECT_PATH>`

###### **Arguments:**[](#arguments-4 "Direct link to arguments-4")

* `<PROJECT_PATH>`

###### **Options:**[](#options-17 "Direct link to options-17")

* `--name <NAME>`  An optional flag to specify a new contract's name.

  Default value: `hello-world`
* `--overwrite`  Overwrite all existing files.

## `stellar contract inspect`[](#stellar-contract-inspect "Direct link to stellar-contract-inspect")

 ï¸ Deprecated, use `contract info`. Inspect a WASM file listing contract functions, meta, etc

**Usage:** `stellar contract inspect [OPTIONS] --wasm <WASM>`

###### **Options:**[](#options-18 "Direct link to options-18")

* `--wasm <WASM>`  Path to wasm binary
* `--output <OUTPUT>`  Output just XDR in base64

  Default value: `docs`

  Possible values:

  + `xdr-base64`: XDR of array of contract spec entries
  + `xdr-base64-array`: Array of xdr of contract spec entries
  + `docs`: Pretty print of contract spec entries

###### **Options (Global):**[](#options-global-17 "Direct link to options-global-17")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar contract upload`[](#stellar-contract-upload "Direct link to stellar-contract-upload")

Install a WASM file to the ledger without creating a contract instance

**Usage:** `stellar contract upload [OPTIONS] --source-account <SOURCE_ACCOUNT> --wasm <WASM>`

###### **Options:**[](#options-19 "Direct link to options-19")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--wasm <WASM>`  Path to wasm binary
* `-i`, `--ignore-checks`  Whether to ignore safety checks when deploying contracts

  Default value: `false`
* `--build-only`  Build the transaction and only write the base64 xdr to stdout

###### **Options (Global):**[](#options-global-18 "Direct link to options-global-18")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-15 "Direct link to options-rpc-15")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config
* `--resource-fee <RESOURCE_FEE>`  Set the fee for smart contract resource consumption, in stroops. 1 stroop = 0.0000001 xlm. Overrides the simulated resource fee
* `--instructions <INSTRUCTIONS>`   ï¸ Deprecated, use `--instruction-leeway` to increase instructions. Number of instructions to allocate for the transaction
* `--instruction-leeway <INSTRUCTION_LEEWAY>`  Allow this many extra instructions when budgeting resources with transaction simulation
* `--cost`  Output the cost execution to stderr

## `stellar contract install`[](#stellar-contract-install "Direct link to stellar-contract-install")

 ï¸ Deprecated, use `contract upload`. Install a WASM file to the ledger without creating a contract instance

**Usage:** `stellar contract install [OPTIONS] --source-account <SOURCE_ACCOUNT> --wasm <WASM>`

###### **Options:**[](#options-20 "Direct link to options-20")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--wasm <WASM>`  Path to wasm binary
* `-i`, `--ignore-checks`  Whether to ignore safety checks when deploying contracts

  Default value: `false`
* `--build-only`  Build the transaction and only write the base64 xdr to stdout

###### **Options (Global):**[](#options-global-19 "Direct link to options-global-19")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-16 "Direct link to options-rpc-16")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config
* `--resource-fee <RESOURCE_FEE>`  Set the fee for smart contract resource consumption, in stroops. 1 stroop = 0.0000001 xlm. Overrides the simulated resource fee
* `--instructions <INSTRUCTIONS>`   ï¸ Deprecated, use `--instruction-leeway` to increase instructions. Number of instructions to allocate for the transaction
* `--instruction-leeway <INSTRUCTION_LEEWAY>`  Allow this many extra instructions when budgeting resources with transaction simulation
* `--cost`  Output the cost execution to stderr

## `stellar contract invoke`[](#stellar-contract-invoke "Direct link to stellar-contract-invoke")

Invoke a contract function

Generates an "implicit CLI" for the specified contract on-the-fly using the contract's schema, which gets embedded into every Soroban contract. The "slop" in this command, everything after the `--`, gets passed to this implicit CLI. Get in-depth help for a given contract:

stellar contract invoke ... -- --help

**Usage:** `stellar contract invoke [OPTIONS] --id <CONTRACT_ID> --source-account <SOURCE_ACCOUNT> [-- <CONTRACT_FN_AND_ARGS>...]`

###### **Arguments:**[](#arguments-5 "Direct link to arguments-5")

* `<CONTRACT_FN_AND_ARGS>`  Function name as subcommand, then arguments for that function as `--arg-name value`

###### **Options:**[](#options-21 "Direct link to options-21")

* `--id <CONTRACT_ID>`  Contract ID to invoke
* `--is-view`   ï¸ Deprecated, use `--send=no`. View the result simulating and do not sign and submit transaction
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--send <SEND>`  Whether or not to send a transaction

  Default value: `default`

  Possible values:

  + `default`: Send transaction if simulation indicates there are ledger writes, published events, or auth required, otherwise return simulation result
  + `no`: Do not send transaction, return simulation result
  + `yes`: Always send transaction
* `--build-only`  Build the transaction and only write the base64 xdr to stdout

###### **Options (Global):**[](#options-global-20 "Direct link to options-global-20")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-17 "Direct link to options-rpc-17")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config
* `--resource-fee <RESOURCE_FEE>`  Set the fee for smart contract resource consumption, in stroops. 1 stroop = 0.0000001 xlm. Overrides the simulated resource fee
* `--instructions <INSTRUCTIONS>`   ï¸ Deprecated, use `--instruction-leeway` to increase instructions. Number of instructions to allocate for the transaction
* `--instruction-leeway <INSTRUCTION_LEEWAY>`  Allow this many extra instructions when budgeting resources with transaction simulation
* `--cost`  Output the cost execution to stderr

## `stellar contract optimize`[](#stellar-contract-optimize "Direct link to stellar-contract-optimize")

 ï¸ Deprecated, use `build --optimize`. Optimize a WASM file

**Usage:** `stellar contract optimize [OPTIONS] --wasm <WASM>...`

###### **Options:**[](#options-22 "Direct link to options-22")

* `--wasm <WASM>`  Path to one or more wasm binaries
* `--wasm-out <WASM_OUT>`  Path to write the optimized WASM file to (defaults to same location as --wasm with .optimized.wasm suffix)

## `stellar contract read`[](#stellar-contract-read "Direct link to stellar-contract-read")

Print the current value of a contract-data ledger entry

**Usage:** `stellar contract read [OPTIONS]`

###### **Options:**[](#options-23 "Direct link to options-23")

* `--output <OUTPUT>`  Type of output to generate

  Default value: `string`

  Possible values:

  + `string`: String
  + `json`: Json
  + `xdr`: XDR
* `--id <CONTRACT_ID>`  Contract ID to which owns the data entries. If no keys provided the Contract's instance will be extended
* `--key <KEY>`  Storage key (symbols only)
* `--key-xdr <KEY_XDR>`  Storage key (base64-encoded XDR)
* `--wasm <WASM>`  Path to Wasm file of contract code to extend
* `--wasm-hash <WASM_HASH>`  Path to Wasm file of contract code to extend
* `--durability <DURABILITY>`  Storage entry durability

  Default value: `persistent`

  Possible values:

  + `persistent`: Persistent
  + `temporary`: Temporary

###### **Options (Global):**[](#options-global-21 "Direct link to options-global-21")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-18 "Direct link to options-rpc-18")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar contract restore`[](#stellar-contract-restore "Direct link to stellar-contract-restore")

Restore an evicted value for a contract-data legder entry.

If no keys are specificed the contract itself is restored.

**Usage:** `stellar contract restore [OPTIONS] --source-account <SOURCE_ACCOUNT>`

###### **Options:**[](#options-24 "Direct link to options-24")

* `--id <CONTRACT_ID>`  Contract ID to which owns the data entries. If no keys provided the Contract's instance will be extended
* `--key <KEY>`  Storage key (symbols only)
* `--key-xdr <KEY_XDR>`  Storage key (base64-encoded XDR)
* `--wasm <WASM>`  Path to Wasm file of contract code to extend
* `--wasm-hash <WASM_HASH>`  Path to Wasm file of contract code to extend
* `--durability <DURABILITY>`  Storage entry durability

  Default value: `persistent`

  Possible values:

  + `persistent`: Persistent
  + `temporary`: Temporary
* `--ledgers-to-extend <LEDGERS_TO_EXTEND>`  Number of ledgers to extend the entry
* `--ttl-ledger-only`  Only print the new Time To Live ledger
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout

###### **Options (Global):**[](#options-global-22 "Direct link to options-global-22")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-19 "Direct link to options-rpc-19")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config
* `--resource-fee <RESOURCE_FEE>`  Set the fee for smart contract resource consumption, in stroops. 1 stroop = 0.0000001 xlm. Overrides the simulated resource fee
* `--instructions <INSTRUCTIONS>`   ï¸ Deprecated, use `--instruction-leeway` to increase instructions. Number of instructions to allocate for the transaction
* `--instruction-leeway <INSTRUCTION_LEEWAY>`  Allow this many extra instructions when budgeting resources with transaction simulation
* `--cost`  Output the cost execution to stderr

## `stellar doctor`[](#stellar-doctor "Direct link to stellar-doctor")

Diagnose and troubleshoot CLI and network issues

**Usage:** `stellar doctor [OPTIONS]`

###### **Options (Global):**[](#options-global-23 "Direct link to options-global-23")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar events`[](#stellar-events "Direct link to stellar-events")

Watch the network for contract events

**Usage:** `stellar events [OPTIONS]`

###### **FILTERS:**[](#filters "Direct link to filters")

* `--id <CONTRACT_IDS>`  A set of (up to 5) contract IDs to filter events on. This parameter can be passed multiple times, e.g. `--id C123.. --id C456..`, or passed with multiple parameters, e.g. `--id C123 C456`.

  Though the specification supports multiple filter objects (i.e. combinations of type, IDs, and topics), only one set can be specified on the command-line today, though that set can have multiple IDs/topics.
* `--topic <TOPIC_FILTERS>`  A set of (up to 5) topic filters to filter event topics on. A single topic filter can contain 1-4 different segments, separated by commas. An asterisk (`*` character) indicates a wildcard segment.

  In addition to up to 4 possible topic filter segments, the "**" wildcard can also be added, and will allow for a flexible number of topics in the returned events. The "**" wildcard must be the last segment in a query.

  If the "\*\*" wildcard is not included, only events with the exact number of topics as the given filter will be returned.

  **Example:** topic filter with two segments: `--topic "AAAABQAAAAdDT1VOVEVSAA==,*"`

  **Example:** two topic filters with one and two segments each: `--topic "AAAABQAAAAdDT1VOVEVSAA==" --topic '*,*'`

  **Example:** topic filter with four segments and the "**" wildcard: --topic "AAAABQAAAAdDT1VOVEVSAA==,*,*,\*,**"

  Note that all of these topic filters are combined with the contract IDs into a single filter (i.e. combination of type, IDs, and topics).
* `--type <EVENT_TYPE>`  Specifies which type of contract events to display

  Default value: `all`

  Possible values: `all`, `contract`, `system`

###### **Options:**[](#options-25 "Direct link to options-25")

* `--start-ledger <START_LEDGER>`  The first ledger sequence number in the range to pull events <../learn/encyclopedia/network-configuration/ledger-headers#ledger-sequence>
* `--cursor <CURSOR>`  The cursor corresponding to the start of the event range
* `--output <OUTPUT>`  Output formatting options for event stream

  Default value: `pretty`

  Possible values:

  + `pretty`: Colorful, human-oriented console output
  + `plain`: Human-oriented console output without colors
  + `json`: JSON formatted console output
* `-c`, `--count <COUNT>`  The maximum number of events to display (defer to the server-defined limit)

  Default value: `10`

###### **Options (Global):**[](#options-global-24 "Direct link to options-global-24")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-20 "Direct link to options-rpc-20")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar env`[](#stellar-env "Direct link to stellar-env")

Prints the environment variables

Prints to stdout in a format that can be used as .env file. Environment variables have precedence over defaults.

Pass a name to get the value of a single environment variable.

If there are no environment variables in use, prints the defaults.

**Usage:** `stellar env [OPTIONS] [NAME]`

###### **Arguments:**[](#arguments-6 "Direct link to arguments-6")

* `<NAME>`  Env variable name to get the value of.

  E.g.: $ stellar env STELLAR\_ACCOUNT

###### **Options (Global):**[](#options-global-25 "Direct link to options-global-25")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar keys`[](#stellar-keys "Direct link to stellar-keys")

Create and manage identities including keys and addresses

**Usage:** `stellar keys <COMMAND>`

###### **Subcommands:**[](#subcommands-7 "Direct link to subcommands-7")

* `add`  Add a new identity (keypair, ledger, OS specific secure store)
* `public-key`  Given an identity return its address (public key)
* `fund`  Fund an identity on a test network
* `generate`  Generate a new identity using a 24-word seed phrase The seed phrase can be stored in a config file (default) or in an OS-specific secure store
* `ls`  List identities
* `rm`  Remove an identity
* `secret`  Output an identity's secret key
* `use`  Set the default identity that will be used on all commands. This allows you to skip `--source-account` or setting a environment variable, while reusing this value in all commands that require it
* `unset`  Unset the default key identity defined previously with `keys use <identity>`

## `stellar keys add`[](#stellar-keys-add "Direct link to stellar-keys-add")

Add a new identity (keypair, ledger, OS specific secure store)

**Usage:** `stellar keys add [OPTIONS] <NAME>`

###### **Arguments:**[](#arguments-7 "Direct link to arguments-7")

* `<NAME>`  Name of identity

###### **Options:**[](#options-26 "Direct link to options-26")

* `--secret-key`   ï¸ Deprecated, use `--secure-store`. Enter secret (S) key when prompted
* `--seed-phrase`   ï¸ Deprecated, use `--secure-store`. Enter key using 12-24 word seed phrase
* `--secure-store`  Save the new key in your OS's credential secure store.

  On Mac this uses Keychain, on Windows it is Secure Store Service, and on \*nix platforms it uses a combination of the kernel keyutils and DBus-based Secret Service.

  This only supports seed phrases for now.
* `--public-key <PUBLIC_KEY>`  Add a public key, ed25519, or muxed account, e.g. G1.., M2..
* `--overwrite`  Overwrite existing identity if it already exists

###### **Options (Global):**[](#options-global-26 "Direct link to options-global-26")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar keys public-key`[](#stellar-keys-public-key "Direct link to stellar-keys-public-key")

Given an identity return its address (public key)

**Usage:** `stellar keys public-key [OPTIONS] <NAME>`

**Command Alias:** `address`

###### **Arguments:**[](#arguments-8 "Direct link to arguments-8")

* `<NAME>`  Name of identity to lookup, default test identity used if not provided

###### **Options:**[](#options-27 "Direct link to options-27")

* `--hd-path <HD_PATH>`  If identity is a seed phrase use this hd path, default is 0

###### **Options (Global):**[](#options-global-27 "Direct link to options-global-27")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar keys fund`[](#stellar-keys-fund "Direct link to stellar-keys-fund")

Fund an identity on a test network

**Usage:** `stellar keys fund [OPTIONS] <NAME>`

###### **Arguments:**[](#arguments-9 "Direct link to arguments-9")

* `<NAME>`  Name of identity to lookup, default test identity used if not provided

###### **Options:**[](#options-28 "Direct link to options-28")

* `--hd-path <HD_PATH>`  If identity is a seed phrase use this hd path, default is 0

###### **Options (Global):**[](#options-global-28 "Direct link to options-global-28")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-21 "Direct link to options-rpc-21")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar keys generate`[](#stellar-keys-generate "Direct link to stellar-keys-generate")

Generate a new identity using a 24-word seed phrase The seed phrase can be stored in a config file (default) or in an OS-specific secure store

**Usage:** `stellar keys generate [OPTIONS] <NAME>`

###### **Arguments:**[](#arguments-10 "Direct link to arguments-10")

* `<NAME>`  Name of identity

###### **Options:**[](#options-29 "Direct link to options-29")

* `--seed <SEED>`  Optional seed to use when generating seed phrase. Random otherwise
* `-s`, `--as-secret`  Output the generated identity as a secret key
* `--secure-store`  Save the new key in your OS's credential secure store.

  On Mac this uses Keychain, on Windows it is Secure Store Service, and on \*nix platforms it uses a combination of the kernel keyutils and DBus-based Secret Service.
* `--hd-path <HD_PATH>`  When generating a secret key, which `hd_path` should be used from the original `seed_phrase`
* `--fund`  Fund generated key pair

  Default value: `false`
* `--overwrite`  Overwrite existing identity if it already exists

###### **Options (Global):**[](#options-global-29 "Direct link to options-global-29")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-22 "Direct link to options-rpc-22")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar keys ls`[](#stellar-keys-ls "Direct link to stellar-keys-ls")

List identities

**Usage:** `stellar keys ls [OPTIONS]`

###### **Options:**[](#options-30 "Direct link to options-30")

* `-l`, `--long`

###### **Options (Global):**[](#options-global-30 "Direct link to options-global-30")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar keys rm`[](#stellar-keys-rm "Direct link to stellar-keys-rm")

Remove an identity

**Usage:** `stellar keys rm [OPTIONS] <NAME>`

###### **Arguments:**[](#arguments-11 "Direct link to arguments-11")

* `<NAME>`  Identity to remove

###### **Options (Global):**[](#options-global-31 "Direct link to options-global-31")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar keys secret`[](#stellar-keys-secret "Direct link to stellar-keys-secret")

Output an identity's secret key

**Usage:** `stellar keys secret [OPTIONS] <NAME>`

###### **Arguments:**[](#arguments-12 "Direct link to arguments-12")

* `<NAME>`  Name of identity to lookup, default is test identity

###### **Options:**[](#options-31 "Direct link to options-31")

* `--phrase`  Output seed phrase instead of private key
* `--hd-path <HD_PATH>`  If identity is a seed phrase use this hd path, default is 0

###### **Options (Global):**[](#options-global-32 "Direct link to options-global-32")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar keys use`[](#stellar-keys-use "Direct link to stellar-keys-use")

Set the default identity that will be used on all commands. This allows you to skip `--source-account` or setting a environment variable, while reusing this value in all commands that require it

**Usage:** `stellar keys use [OPTIONS] <NAME>`

###### **Arguments:**[](#arguments-13 "Direct link to arguments-13")

* `<NAME>`  Set the default network name

###### **Options (Global):**[](#options-global-33 "Direct link to options-global-33")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar keys unset`[](#stellar-keys-unset "Direct link to stellar-keys-unset")

Unset the default key identity defined previously with `keys use <identity>`

**Usage:** `stellar keys unset [OPTIONS]`

###### **Options (Global):**[](#options-global-34 "Direct link to options-global-34")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar network`[](#stellar-network "Direct link to stellar-network")

Configure connection to networks

**Usage:** `stellar network <COMMAND>`

###### **Subcommands:**[](#subcommands-8 "Direct link to subcommands-8")

* `add`  Add a new network
* `rm`  Remove a network
* `ls`  List networks
* `use`  Set the default network that will be used on all commands. This allows you to skip `--network` or setting a environment variable, while reusing this value in all commands that require it
* `health`  Fetch the health of the configured RPC
* `info`  Checks the health of the configured RPC
* `settings`  Fetch the network's config settings
* `unset`  Unset the default network defined previously with `network use <network>`

## `stellar network add`[](#stellar-network-add "Direct link to stellar-network-add")

Add a new network

**Usage:** `stellar network add [OPTIONS] --rpc-url <RPC_URL> --network-passphrase <NETWORK_PASSPHRASE> <NAME>`

###### **Arguments:**[](#arguments-14 "Direct link to arguments-14")

* `<NAME>`  Name of network

###### **Options (Global):**[](#options-global-35 "Direct link to options-global-35")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-23 "Direct link to options-rpc-23")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  Optional header to include in requests to the RPC, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server

## `stellar network rm`[](#stellar-network-rm "Direct link to stellar-network-rm")

Remove a network

**Usage:** `stellar network rm [OPTIONS] <NAME>`

###### **Arguments:**[](#arguments-15 "Direct link to arguments-15")

* `<NAME>`  Network to remove

###### **Options (Global):**[](#options-global-36 "Direct link to options-global-36")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar network ls`[](#stellar-network-ls "Direct link to stellar-network-ls")

List networks

**Usage:** `stellar network ls [OPTIONS]`

###### **Options:**[](#options-32 "Direct link to options-32")

* `-l`, `--long`  Get more info about the networks

###### **Options (Global):**[](#options-global-37 "Direct link to options-global-37")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar network use`[](#stellar-network-use "Direct link to stellar-network-use")

Set the default network that will be used on all commands. This allows you to skip `--network` or setting a environment variable, while reusing this value in all commands that require it

**Usage:** `stellar network use [OPTIONS] <NAME>`

###### **Arguments:**[](#arguments-16 "Direct link to arguments-16")

* `<NAME>`  Set the default network name

###### **Options (Global):**[](#options-global-38 "Direct link to options-global-38")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar network health`[](#stellar-network-health "Direct link to stellar-network-health")

Fetch the health of the configured RPC

**Usage:** `stellar network health [OPTIONS]`

###### **Options:**[](#options-33 "Direct link to options-33")

* `--output <OUTPUT>`  Format of the output

  Default value: `text`

  Possible values:

  + `text`: Text output of network health status
  + `json`: JSON result of the RPC request
  + `json-formatted`: Formatted (multiline) JSON output of the RPC request

###### **Options (Global):**[](#options-global-39 "Direct link to options-global-39")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-24 "Direct link to options-rpc-24")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar network info`[](#stellar-network-info "Direct link to stellar-network-info")

Checks the health of the configured RPC

**Usage:** `stellar network info [OPTIONS]`

###### **Options:**[](#options-34 "Direct link to options-34")

* `--output <OUTPUT>`  Format of the output

  Default value: `text`

  Possible values:

  + `text`: Text output of network info
  + `json`: JSON result of the RPC request
  + `json-formatted`: Formatted (multiline) JSON output of the RPC request

###### **Options (Global):**[](#options-global-40 "Direct link to options-global-40")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-25 "Direct link to options-rpc-25")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar network settings`[](#stellar-network-settings "Direct link to stellar-network-settings")

Fetch the network's config settings

**Usage:** `stellar network settings [OPTIONS]`

###### **Options:**[](#options-35 "Direct link to options-35")

* `--internal`  Include internal config settings that are not upgradeable and are internally maintained by the network
* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `xdr`: XDR (`ConfigUpgradeSet` type)
  + `json`: JSON, XDR-JSON of the `ConfigUpgradeSet` XDR type
  + `json-formatted`: JSON formatted, XDR-JSON of the `ConfigUpgradeSet` XDR type

###### **Options (Global):**[](#options-global-41 "Direct link to options-global-41")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-26 "Direct link to options-rpc-26")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar network unset`[](#stellar-network-unset "Direct link to stellar-network-unset")

Unset the default network defined previously with `network use <network>`

**Usage:** `stellar network unset [OPTIONS]`

###### **Options (Global):**[](#options-global-42 "Direct link to options-global-42")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar container`[](#stellar-container "Direct link to stellar-container")

Start local networks in containers

**Usage:** `stellar container <COMMAND>`

###### **Subcommands:**[](#subcommands-9 "Direct link to subcommands-9")

* `logs`  Get logs from a running network container
* `start`  Start a container running a Stellar node, RPC, API, and friendbot (faucet)
* `stop`  Stop a network container started with `stellar container start`

## `stellar container logs`[](#stellar-container-logs "Direct link to stellar-container-logs")

Get logs from a running network container

**Usage:** `stellar container logs [OPTIONS] [NAME]`

###### **Arguments:**[](#arguments-17 "Direct link to arguments-17")

* `<NAME>`  Container to get logs from

  Default value: `local`

###### **Options:**[](#options-36 "Direct link to options-36")

* `-d`, `--docker-host <DOCKER_HOST>`  Optional argument to override the default docker host. This is useful when you are using a non-standard docker host path for your Docker-compatible container runtime, e.g. Docker Desktop defaults to $HOME/.docker/run/docker.sock instead of /var/run/docker.sock

## `stellar container start`[](#stellar-container-start "Direct link to stellar-container-start")

Start a container running a Stellar node, RPC, API, and friendbot (faucet).

`stellar container start NETWORK [OPTIONS]`

By default, when starting a testnet container, without any optional arguments, it will run the equivalent of the following docker command:

`docker run --rm -p 8000:8000 --name stellar stellar/quickstart:testing --testnet --enable rpc,horizon`

**Usage:** `stellar container start [OPTIONS] [NETWORK]`

###### **Arguments:**[](#arguments-18 "Direct link to arguments-18")

* `<NETWORK>`  Network to start. Default is `local`

  Possible values: `local`, `testnet`, `futurenet`, `pubnet`

###### **Options:**[](#options-37 "Direct link to options-37")

* `-d`, `--docker-host <DOCKER_HOST>`  Optional argument to override the default docker host. This is useful when you are using a non-standard docker host path for your Docker-compatible container runtime, e.g. Docker Desktop defaults to $HOME/.docker/run/docker.sock instead of /var/run/docker.sock
* `--name <NAME>`  Optional argument to specify the container name
* `-l`, `--limits <LIMITS>`  Optional argument to specify the limits for the local network only
* `-p`, `--ports-mapping <PORTS_MAPPING>`  Argument to specify the `HOST_PORT:CONTAINER_PORT` mapping

  Default value: `8000:8000`
* `-t`, `--image-tag-override <IMAGE_TAG_OVERRIDE>`  Optional argument to override the default docker image tag for the given network
* `--protocol-version <PROTOCOL_VERSION>`  Optional argument to specify the protocol version for the local network only

## `stellar container stop`[](#stellar-container-stop "Direct link to stellar-container-stop")

Stop a network container started with `stellar container start`

**Usage:** `stellar container stop [OPTIONS] [NAME]`

###### **Arguments:**[](#arguments-19 "Direct link to arguments-19")

* `<NAME>`  Container to stop

  Default value: `local`

###### **Options:**[](#options-38 "Direct link to options-38")

* `-d`, `--docker-host <DOCKER_HOST>`  Optional argument to override the default docker host. This is useful when you are using a non-standard docker host path for your Docker-compatible container runtime, e.g. Docker Desktop defaults to $HOME/.docker/run/docker.sock instead of /var/run/docker.sock

## `stellar config`[](#stellar-config "Direct link to stellar-config")

Manage CLI configuration

**Usage:** `stellar config <COMMAND>`

###### **Subcommands:**[](#subcommands-10 "Direct link to subcommands-10")

* `migrate`  Migrate the local configuration to the global directory
* `dir`  Show the global configuration directory

## `stellar config migrate`[](#stellar-config-migrate "Direct link to stellar-config-migrate")

Migrate the local configuration to the global directory

**Usage:** `stellar config migrate [OPTIONS]`

###### **Options (Global):**[](#options-global-43 "Direct link to options-global-43")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar config dir`[](#stellar-config-dir "Direct link to stellar-config-dir")

Show the global configuration directory.

The location will depend on how your system is configured.

* It looks up for `XDG_CONFIG_HOME` environment variable. If it's set, `$XDG_CONFIG_HOME/stellar` will be used. - If not set, it defaults to `$HOME/.config`. - Can be overridden by `--config-dir` flag.

**Usage:** `stellar config dir [OPTIONS]`

###### **Options (Global):**[](#options-global-44 "Direct link to options-global-44")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar snapshot`[](#stellar-snapshot "Direct link to stellar-snapshot")

Download a snapshot of a ledger from an archive

**Usage:** `stellar snapshot <COMMAND>`

###### **Subcommands:**[](#subcommands-11 "Direct link to subcommands-11")

* `create`  Create a ledger snapshot using a history archive
* `merge`  Merge multiple ledger snapshots into a single snapshot file

## `stellar snapshot create`[](#stellar-snapshot-create "Direct link to stellar-snapshot-create")

Create a ledger snapshot using a history archive.

Filters (address, wasm-hash) specify what ledger entries to include.

Account addresses include the account, and trustlines.

Contract addresses include the related wasm, contract data.

If a contract is a Stellar asset contract, it includes the asset issuer's account and trust lines, but does not include all the trust lines of other accounts holding the asset. To include them specify the addresses of relevant accounts.

Any invalid contract id passed as `--address` will be ignored.

**Usage:** `stellar snapshot create [OPTIONS]`

###### **Filter Options:**[](#filter-options "Direct link to filter-options")

* `--address <ADDRESS>`  Account or contract address/alias to include in the snapshot
* `--wasm-hash <WASM_HASHES>`  WASM hashes to include in the snapshot

###### **Options:**[](#options-39 "Direct link to options-39")

* `--ledger <LEDGER>`  The ledger sequence number to snapshot. Defaults to latest history archived ledger
* `--output <OUTPUT>`  Format of the out file

  Default value: `json`

  Possible values: `json`
* `--out <OUT>`  Out path that the snapshot is written to

  Default value: `snapshot.json`

###### **Options (Archive):**[](#options-archive "Direct link to options-archive")

* `--archive-url <ARCHIVE_URL>`  Archive URL

###### **Options (Global):**[](#options-global-45 "Direct link to options-global-45")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-27 "Direct link to options-rpc-27")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar snapshot merge`[](#stellar-snapshot-merge "Direct link to stellar-snapshot-merge")

Merge multiple ledger snapshots into a single snapshot file.

When the same ledger key appears in multiple snapshots, the entry from the last snapshot in the argument list takes precedence. Metadata (protocol\_version, sequence\_number, timestamp, etc.) is taken from the last snapshot.

Example: stellar snapshot merge A.json B.json --out merged.json

This allows combining snapshots from different contract deployments or manually edited snapshots without regenerating from scratch.

**Usage:** `stellar snapshot merge [OPTIONS] <SNAPSHOTS> <SNAPSHOTS>...`

###### **Arguments:**[](#arguments-20 "Direct link to arguments-20")

* `<SNAPSHOTS>`  Snapshot files to merge (at least 2 required)

###### **Options:**[](#options-40 "Direct link to options-40")

* `-o`, `--out <OUT>`  Output path for the merged snapshot

  Default value: `snapshot.json`

## `stellar tx`[](#stellar-tx "Direct link to stellar-tx")

Sign, Simulate, and Send transactions

**Usage:** `stellar tx <COMMAND>`

###### **Subcommands:**[](#subcommands-12 "Direct link to subcommands-12")

* `update`  Update the transaction
* `edit`  Edit a transaction envelope from stdin. This command respects the environment variables `STELLAR_EDITOR`, `EDITOR` and `VISUAL`, in that order
* `hash`  Calculate the hash of a transaction envelope
* `new`  Create a new transaction
* `operation`  Manipulate the operations in a transaction, including adding new operations
* `send`  Send a transaction envelope to the network
* `sign`  Sign a transaction envelope appending the signature to the envelope
* `simulate`  Simulate a transaction envelope from stdin
* `fetch`  Fetch a transaction from the network by hash If no subcommand is passed in, the transaction envelope will be returned
* `decode`  Decode a transaction envelope from XDR to JSON
* `encode`  Encode a transaction envelope from JSON to XDR

## `stellar tx update`[](#stellar-tx-update "Direct link to stellar-tx-update")

Update the transaction

**Usage:** `stellar tx update <COMMAND>`

###### **Subcommands:**[](#subcommands-13 "Direct link to subcommands-13")

* `sequence-number`  Edit the sequence number on a transaction

## `stellar tx update sequence-number`[](#stellar-tx-update-sequence-number "Direct link to stellar-tx-update-sequence-number")

Edit the sequence number on a transaction

**Usage:** `stellar tx update sequence-number <COMMAND>`

**Command Alias:** `seq-num`

###### **Subcommands:**[](#subcommands-14 "Direct link to subcommands-14")

* `next`  Fetch the source account's seq-num and increment for the given tx

## `stellar tx update sequence-number next`[](#stellar-tx-update-sequence-number-next "Direct link to stellar-tx-update-sequence-number-next")

Fetch the source account's seq-num and increment for the given tx

**Usage:** `stellar tx update sequence-number next [OPTIONS]`

###### **Options (Global):**[](#options-global-46 "Direct link to options-global-46")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-28 "Direct link to options-rpc-28")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx edit`[](#stellar-tx-edit "Direct link to stellar-tx-edit")

Edit a transaction envelope from stdin. This command respects the environment variables `STELLAR_EDITOR`, `EDITOR` and `VISUAL`, in that order.

Example: Start a new edit session

$ stellar tx edit

Example: Pipe an XDR transaction envelope

$ stellar tx new manage-data --data-name hello --build-only | stellar tx edit

**Usage:** `stellar tx edit`

## `stellar tx hash`[](#stellar-tx-hash "Direct link to stellar-tx-hash")

Calculate the hash of a transaction envelope

**Usage:** `stellar tx hash [OPTIONS] [TX_XDR]`

###### **Arguments:**[](#arguments-21 "Direct link to arguments-21")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options (RPC):**[](#options-rpc-29 "Direct link to options-rpc-29")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new`[](#stellar-tx-new "Direct link to stellar-tx-new")

Create a new transaction

**Usage:** `stellar tx new <COMMAND>`

###### **Subcommands:**[](#subcommands-15 "Direct link to subcommands-15")

* `account-merge`  Transfer XLM balance to another account and remove source account
* `begin-sponsoring-future-reserves`  Begin sponsoring future reserves for another account
* `bump-sequence`  Bump sequence number to invalidate older transactions
* `change-trust`  Create, update, or delete a trustline
* `claim-claimable-balance`  Claim a claimable balance by its balance ID
* `clawback`  Clawback an asset from an account
* `clawback-claimable-balance`  Clawback a claimable balance by its balance ID
* `create-account`  Create and fund a new account
* `create-claimable-balance`  Create a claimable balance that can be claimed by specified accounts
* `create-passive-sell-offer`  Create a passive sell offer on the Stellar DEX
* `end-sponsoring-future-reserves`  End sponsoring future reserves
* `liquidity-pool-deposit`  Deposit assets into a liquidity pool
* `liquidity-pool-withdraw`  Withdraw assets from a liquidity pool
* `manage-buy-offer`  Create, update, or delete a buy offer
* `manage-data`  Set, modify, or delete account data entries
* `manage-sell-offer`  Create, update, or delete a sell offer
* `path-payment-strict-send`  Send a payment with a different asset using path finding, specifying the send amount
* `path-payment-strict-receive`  Send a payment with a different asset using path finding, specifying the receive amount
* `payment`  Send asset to destination account
* `revoke-sponsorship`  Revoke sponsorship of a ledger entry or signer
* `set-options`  Set account options like flags, signers, and home domain
* `set-trustline-flags`  Configure authorization and trustline flags for an asset

## `stellar tx new account-merge`[](#stellar-tx-new-account-merge "Direct link to stellar-tx-new-account-merge")

Transfer XLM balance to another account and remove source account

**Usage:** `stellar tx new account-merge [OPTIONS] --source-account <SOURCE_ACCOUNT> --account <ACCOUNT>`

###### **Options:**[](#options-41 "Direct link to options-41")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--account <ACCOUNT>`  Muxed Account to merge with, e.g. `GBX...`, 'MBX...'

###### **Options (Global):**[](#options-global-47 "Direct link to options-global-47")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-30 "Direct link to options-rpc-30")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new begin-sponsoring-future-reserves`[](#stellar-tx-new-begin-sponsoring-future-reserves "Direct link to stellar-tx-new-begin-sponsoring-future-reserves")

Begin sponsoring future reserves for another account

**Usage:** `stellar tx new begin-sponsoring-future-reserves [OPTIONS] --source-account <SOURCE_ACCOUNT> --sponsored-id <SPONSORED_ID>`

###### **Options:**[](#options-42 "Direct link to options-42")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--sponsored-id <SPONSORED_ID>`  Account that will be sponsored

###### **Options (Global):**[](#options-global-48 "Direct link to options-global-48")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-31 "Direct link to options-rpc-31")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new bump-sequence`[](#stellar-tx-new-bump-sequence "Direct link to stellar-tx-new-bump-sequence")

Bump sequence number to invalidate older transactions

**Usage:** `stellar tx new bump-sequence [OPTIONS] --source-account <SOURCE_ACCOUNT> --bump-to <BUMP_TO>`

###### **Options:**[](#options-43 "Direct link to options-43")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--bump-to <BUMP_TO>`  Sequence number to bump to

###### **Options (Global):**[](#options-global-49 "Direct link to options-global-49")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-32 "Direct link to options-rpc-32")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new change-trust`[](#stellar-tx-new-change-trust "Direct link to stellar-tx-new-change-trust")

Create, update, or delete a trustline

**Usage:** `stellar tx new change-trust [OPTIONS] --source-account <SOURCE_ACCOUNT> --line <LINE>`

###### **Options:**[](#options-44 "Direct link to options-44")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--line <LINE>`
* `--limit <LIMIT>`  Limit for the trust line, 0 to remove the trust line

  Default value: `9223372036854775807`

###### **Options (Global):**[](#options-global-50 "Direct link to options-global-50")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-33 "Direct link to options-rpc-33")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new claim-claimable-balance`[](#stellar-tx-new-claim-claimable-balance "Direct link to stellar-tx-new-claim-claimable-balance")

Claim a claimable balance by its balance ID

**Usage:** `stellar tx new claim-claimable-balance [OPTIONS] --source-account <SOURCE_ACCOUNT> --balance-id <BALANCE_ID>`

###### **Options:**[](#options-45 "Direct link to options-45")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--balance-id <BALANCE_ID>`  Balance ID of the claimable balance to claim (64-character hex string)

###### **Options (Global):**[](#options-global-51 "Direct link to options-global-51")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-34 "Direct link to options-rpc-34")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new clawback`[](#stellar-tx-new-clawback "Direct link to stellar-tx-new-clawback")

Clawback an asset from an account

**Usage:** `stellar tx new clawback [OPTIONS] --source-account <SOURCE_ACCOUNT> --from <FROM> --asset <ASSET> --amount <AMOUNT>`

###### **Options:**[](#options-46 "Direct link to options-46")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--from <FROM>`  Account to clawback assets from, e.g. `GBX...`
* `--asset <ASSET>`  Asset to clawback
* `--amount <AMOUNT>`  Amount of the asset to clawback, in stroops. 1 stroop = 0.0000001 of the asset

###### **Options (Global):**[](#options-global-52 "Direct link to options-global-52")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-35 "Direct link to options-rpc-35")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new clawback-claimable-balance`[](#stellar-tx-new-clawback-claimable-balance "Direct link to stellar-tx-new-clawback-claimable-balance")

Clawback a claimable balance by its balance ID

**Usage:** `stellar tx new clawback-claimable-balance [OPTIONS] --source-account <SOURCE_ACCOUNT> --balance-id <BALANCE_ID>`

###### **Options:**[](#options-47 "Direct link to options-47")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--balance-id <BALANCE_ID>`  Balance ID of the claimable balance to clawback. Accepts multiple formats: - API format with type prefix (72 chars): 000000006f2179b31311fa8064760b48942c8e166702ba0b8fbe7358c4fd570421840461 - Direct hash format (64 chars): 6f2179b31311fa8064760b48942c8e166702ba0b8fbe7358c4fd570421840461 - Address format (base32): BAAMLBZI42AD52HKGIZOU7WFVZM6BPEJCLPL44QU2AT6TY3P57I5QDNYIA

###### **Options (Global):**[](#options-global-53 "Direct link to options-global-53")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-36 "Direct link to options-rpc-36")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new create-account`[](#stellar-tx-new-create-account "Direct link to stellar-tx-new-create-account")

Create and fund a new account

**Usage:** `stellar tx new create-account [OPTIONS] --source-account <SOURCE_ACCOUNT> --destination <DESTINATION>`

###### **Options:**[](#options-48 "Direct link to options-48")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--destination <DESTINATION>`  Account Id to create, e.g. `GBX...`
* `--starting-balance <STARTING_BALANCE>`  Initial balance in stroops of the account, default 1 XLM

  Default value: `10_000_000`

###### **Options (Global):**[](#options-global-54 "Direct link to options-global-54")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-37 "Direct link to options-rpc-37")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new create-claimable-balance`[](#stellar-tx-new-create-claimable-balance "Direct link to stellar-tx-new-create-claimable-balance")

Create a claimable balance that can be claimed by specified accounts

**Usage:** `stellar tx new create-claimable-balance [OPTIONS] --source-account <SOURCE_ACCOUNT> --amount <AMOUNT>`

###### **Options:**[](#options-49 "Direct link to options-49")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--asset <ASSET>`  Asset to be held in the ClaimableBalanceEntry

  Default value: `native`
* `--amount <AMOUNT>`  Amount of asset to store in the entry, in stroops. 1 stroop = 0.0000001 of the asset
* `--claimant <CLAIMANTS>`  Claimants of the claimable balance. Format: account\_id or account\_id:predicate\_json Can be specified multiple times for multiple claimants.

  Examples:

  + `--claimant alice (unconditional)` - `--claimant 'bob:{"before_absolute_time":"1735689599"}'` - `--claimant 'charlie:{"and":[{"before_absolute_time":"1735689599"},{"before_relative_time":"3600"}]}'`

###### **Options (Global):**[](#options-global-55 "Direct link to options-global-55")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-38 "Direct link to options-rpc-38")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new create-passive-sell-offer`[](#stellar-tx-new-create-passive-sell-offer "Direct link to stellar-tx-new-create-passive-sell-offer")

Create a passive sell offer on the Stellar DEX

**Usage:** `stellar tx new create-passive-sell-offer [OPTIONS] --source-account <SOURCE_ACCOUNT> --selling <SELLING> --buying <BUYING> --amount <AMOUNT> --price <PRICE>`

###### **Options:**[](#options-50 "Direct link to options-50")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--selling <SELLING>`  Asset to sell
* `--buying <BUYING>`  Asset to buy
* `--amount <AMOUNT>`  Amount of selling asset to offer, in stroops. 1 stroop = 0.0000001 of the asset (e.g. 1 XLM = `10_000_000` stroops)
* `--price <PRICE>`  Price of 1 unit of selling asset in terms of buying asset as "numerator:denominator" (e.g., "1:2" means 0.5)

###### **Options (Global):**[](#options-global-56 "Direct link to options-global-56")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-39 "Direct link to options-rpc-39")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new end-sponsoring-future-reserves`[](#stellar-tx-new-end-sponsoring-future-reserves "Direct link to stellar-tx-new-end-sponsoring-future-reserves")

End sponsoring future reserves

**Usage:** `stellar tx new end-sponsoring-future-reserves [OPTIONS] --source-account <SOURCE_ACCOUNT>`

###### **Options:**[](#options-51 "Direct link to options-51")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout

###### **Options (Global):**[](#options-global-57 "Direct link to options-global-57")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-40 "Direct link to options-rpc-40")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new liquidity-pool-deposit`[](#stellar-tx-new-liquidity-pool-deposit "Direct link to stellar-tx-new-liquidity-pool-deposit")

Deposit assets into a liquidity pool

**Usage:** `stellar tx new liquidity-pool-deposit [OPTIONS] --source-account <SOURCE_ACCOUNT> --liquidity-pool-id <LIQUIDITY_POOL_ID> --max-amount-a <MAX_AMOUNT_A> --max-amount-b <MAX_AMOUNT_B>`

###### **Options:**[](#options-52 "Direct link to options-52")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--liquidity-pool-id <LIQUIDITY_POOL_ID>`  Liquidity pool ID to deposit to
* `--max-amount-a <MAX_AMOUNT_A>`  Maximum amount of the first asset to deposit, in stroops
* `--max-amount-b <MAX_AMOUNT_B>`  Maximum amount of the second asset to deposit, in stroops
* `--min-price <MIN_PRICE>`  Minimum price for the first asset in terms of the second asset as "numerator:denominator" (e.g., "1:2" means 0.5)

  Default value: `1:1`
* `--max-price <MAX_PRICE>`  Maximum price for the first asset in terms of the second asset as "numerator:denominator" (e.g., "1:2" means 0.5)

  Default value: `1:1`

###### **Options (Global):**[](#options-global-58 "Direct link to options-global-58")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-41 "Direct link to options-rpc-41")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new liquidity-pool-withdraw`[](#stellar-tx-new-liquidity-pool-withdraw "Direct link to stellar-tx-new-liquidity-pool-withdraw")

Withdraw assets from a liquidity pool

**Usage:** `stellar tx new liquidity-pool-withdraw [OPTIONS] --source-account <SOURCE_ACCOUNT> --liquidity-pool-id <LIQUIDITY_POOL_ID> --amount <AMOUNT> --min-amount-a <MIN_AMOUNT_A> --min-amount-b <MIN_AMOUNT_B>`

###### **Options:**[](#options-53 "Direct link to options-53")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--liquidity-pool-id <LIQUIDITY_POOL_ID>`  Liquidity pool ID to withdraw from
* `--amount <AMOUNT>`  Amount of pool shares to withdraw, in stroops
* `--min-amount-a <MIN_AMOUNT_A>`  Minimum amount of the first asset to receive, in stroops
* `--min-amount-b <MIN_AMOUNT_B>`  Minimum amount of the second asset to receive, in stroops

###### **Options (Global):**[](#options-global-59 "Direct link to options-global-59")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-42 "Direct link to options-rpc-42")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new manage-buy-offer`[](#stellar-tx-new-manage-buy-offer "Direct link to stellar-tx-new-manage-buy-offer")

Create, update, or delete a buy offer

**Usage:** `stellar tx new manage-buy-offer [OPTIONS] --source-account <SOURCE_ACCOUNT> --selling <SELLING> --buying <BUYING> --amount <AMOUNT> --price <PRICE>`

###### **Options:**[](#options-54 "Direct link to options-54")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--selling <SELLING>`  Asset to sell
* `--buying <BUYING>`  Asset to buy
* `--amount <AMOUNT>`  Amount of buying asset to purchase, in stroops. 1 stroop = 0.0000001 of the asset (e.g. 1 XLM = `10_000_000` stroops). Use `0` to remove the offer
* `--price <PRICE>`  Price of 1 unit of buying asset in terms of selling asset as "numerator:denominator" (e.g., "1:2" means 0.5)
* `--offer-id <OFFER_ID>`  Offer ID. If 0, will create new offer. Otherwise, will update existing offer

  Default value: `0`

###### **Options (Global):**[](#options-global-60 "Direct link to options-global-60")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-43 "Direct link to options-rpc-43")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new manage-data`[](#stellar-tx-new-manage-data "Direct link to stellar-tx-new-manage-data")

Set, modify, or delete account data entries

**Usage:** `stellar tx new manage-data [OPTIONS] --source-account <SOURCE_ACCOUNT> --data-name <DATA_NAME>`

###### **Options:**[](#options-55 "Direct link to options-55")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--data-name <DATA_NAME>`  String up to 64 bytes long. If this is a new Name it will add the given name/value pair to the account. If this Name is already present then the associated value will be modified
* `--data-value <DATA_VALUE>`  Up to 64 bytes long hex string If not present then the existing Name will be deleted. If present then this value will be set in the `DataEntry`

###### **Options (Global):**[](#options-global-61 "Direct link to options-global-61")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-44 "Direct link to options-rpc-44")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new manage-sell-offer`[](#stellar-tx-new-manage-sell-offer "Direct link to stellar-tx-new-manage-sell-offer")

Create, update, or delete a sell offer

**Usage:** `stellar tx new manage-sell-offer [OPTIONS] --source-account <SOURCE_ACCOUNT> --selling <SELLING> --buying <BUYING> --amount <AMOUNT> --price <PRICE>`

###### **Options:**[](#options-56 "Direct link to options-56")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--selling <SELLING>`  Asset to sell
* `--buying <BUYING>`  Asset to buy
* `--amount <AMOUNT>`  Amount of selling asset to offer, in stroops. 1 stroop = 0.0000001 of the asset (e.g. 1 XLM = `10_000_000` stroops). Use `0` to remove the offer
* `--price <PRICE>`  Price of 1 unit of selling asset in terms of buying asset as "numerator:denominator" (e.g., "1:2" means 0.5)
* `--offer-id <OFFER_ID>`  Offer ID. If 0, will create new offer. Otherwise, will update existing offer

  Default value: `0`

###### **Options (Global):**[](#options-global-62 "Direct link to options-global-62")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-45 "Direct link to options-rpc-45")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new path-payment-strict-send`[](#stellar-tx-new-path-payment-strict-send "Direct link to stellar-tx-new-path-payment-strict-send")

Send a payment with a different asset using path finding, specifying the send amount

**Usage:** `stellar tx new path-payment-strict-send [OPTIONS] --source-account <SOURCE_ACCOUNT> --send-asset <SEND_ASSET> --send-amount <SEND_AMOUNT> --destination <DESTINATION> --dest-asset <DEST_ASSET> --dest-min <DEST_MIN>`

###### **Options:**[](#options-57 "Direct link to options-57")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--send-asset <SEND_ASSET>`  Asset to send (pay with)
* `--send-amount <SEND_AMOUNT>`  Amount of send asset to deduct from sender's account, in stroops. 1 stroop = 0.0000001 of the asset (e.g. 1 XLM = `10_000_000` stroops)
* `--destination <DESTINATION>`  Account that receives the payment
* `--dest-asset <DEST_ASSET>`  Asset that the destination will receive
* `--dest-min <DEST_MIN>`  Minimum amount of destination asset that the destination account can receive. The operation will fail if this amount cannot be met
* `--path <PATH>`  List of intermediate assets for the payment path, comma-separated (up to 5 assets). Each asset should be in the format 'code:issuer' or 'native' for XLM

###### **Options (Global):**[](#options-global-63 "Direct link to options-global-63")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-46 "Direct link to options-rpc-46")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new path-payment-strict-receive`[](#stellar-tx-new-path-payment-strict-receive "Direct link to stellar-tx-new-path-payment-strict-receive")

Send a payment with a different asset using path finding, specifying the receive amount

**Usage:** `stellar tx new path-payment-strict-receive [OPTIONS] --source-account <SOURCE_ACCOUNT> --send-asset <SEND_ASSET> --send-max <SEND_MAX> --destination <DESTINATION> --dest-asset <DEST_ASSET> --dest-amount <DEST_AMOUNT>`

###### **Options:**[](#options-58 "Direct link to options-58")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--send-asset <SEND_ASSET>`  Asset to send (pay with)
* `--send-max <SEND_MAX>`  Maximum amount of send asset to deduct from sender's account, in stroops. 1 stroop = 0.0000001 of the asset (e.g. 1 XLM = `10_000_000` stroops)
* `--destination <DESTINATION>`  Account that receives the payment
* `--dest-asset <DEST_ASSET>`  Asset that the destination will receive
* `--dest-amount <DEST_AMOUNT>`  Exact amount of destination asset that the destination account will receive, in stroops. 1 stroop = 0.0000001 of the asset
* `--path <PATH>`  List of intermediate assets for the payment path, comma-separated (up to 5 assets). Each asset should be in the format 'code:issuer' or 'native' for XLM

###### **Options (Global):**[](#options-global-64 "Direct link to options-global-64")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-47 "Direct link to options-rpc-47")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new payment`[](#stellar-tx-new-payment "Direct link to stellar-tx-new-payment")

Send asset to destination account

**Usage:** `stellar tx new payment [OPTIONS] --source-account <SOURCE_ACCOUNT> --destination <DESTINATION> --amount <AMOUNT>`

###### **Options:**[](#options-59 "Direct link to options-59")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--destination <DESTINATION>`  Account to send to, e.g. `GBX...`
* `--asset <ASSET>`  Asset to send, default native, e.i. XLM

  Default value: `native`
* `--amount <AMOUNT>`  Amount of the aforementioned asset to send, in stroops. 1 stroop = 0.0000001 of the asset (e.g. 1 XLM = `10_000_000` stroops)

###### **Options (Global):**[](#options-global-65 "Direct link to options-global-65")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-48 "Direct link to options-rpc-48")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new revoke-sponsorship`[](#stellar-tx-new-revoke-sponsorship "Direct link to stellar-tx-new-revoke-sponsorship")

Revoke sponsorship of a ledger entry or signer

**Usage:** `stellar tx new revoke-sponsorship [OPTIONS] --source-account <SOURCE_ACCOUNT> --account-id <ACCOUNT_ID>`

###### **Options:**[](#options-60 "Direct link to options-60")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--account-id <ACCOUNT_ID>`  Account ID (required for all sponsorship types)
* `--asset <ASSET>`  Asset for trustline sponsorship (format: CODE:ISSUER)
* `--data-name <DATA_NAME>`  Data name for data entry sponsorship
* `--offer-id <OFFER_ID>`  Offer ID for offer sponsorship
* `--liquidity-pool-id <LIQUIDITY_POOL_ID>`  Pool ID for liquidity pool sponsorship. Accepts multiple formats: - API format with type prefix (72 chars): 000000006f2179b31311fa8064760b48942c8e166702ba0b8fbe7358c4fd570421840461 - Direct hash format (64 chars): 6f2179b31311fa8064760b48942c8e166702ba0b8fbe7358c4fd570421840461 - Address format (base32): LAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
* `--claimable-balance-id <CLAIMABLE_BALANCE_ID>`  Claimable balance ID for claimable balance sponsorship. Accepts multiple formats: - API format with type prefix (72 chars): 000000006f2179b31311fa8064760b48942c8e166702ba0b8fbe7358c4fd570421840461 - Direct hash format (64 chars): 6f2179b31311fa8064760b48942c8e166702ba0b8fbe7358c4fd570421840461 - Address format (base32): BAAMLBZI42AD52HKGIZOU7WFVZM6BPEJCLPL44QU2AT6TY3P57I5QDNYIA
* `--signer-key <SIGNER_KEY>`  Signer key for signer sponsorship

###### **Options (Global):**[](#options-global-66 "Direct link to options-global-66")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-49 "Direct link to options-rpc-49")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new set-options`[](#stellar-tx-new-set-options "Direct link to stellar-tx-new-set-options")

Set account options like flags, signers, and home domain

**Usage:** `stellar tx new set-options [OPTIONS] --source-account <SOURCE_ACCOUNT>`

###### **Options:**[](#options-61 "Direct link to options-61")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--inflation-dest <INFLATION_DEST>`  Account of the inflation destination
* `--master-weight <MASTER_WEIGHT>`  A number from 0-255 (inclusive) representing the weight of the master key. If the weight of the master key is updated to 0, it is effectively disabled
* `--low-threshold <LOW_THRESHOLD>`  A number from 0-255 (inclusive) representing the threshold this account sets on all operations it performs that have a low threshold. <../learn/encyclopedia/security/signatures-multisig#multisig>
* `--med-threshold <MED_THRESHOLD>`  A number from 0-255 (inclusive) representing the threshold this account sets on all operations it performs that have a medium threshold. <../learn/encyclopedia/security/signatures-multisig#multisig>
* `--high-threshold <HIGH_THRESHOLD>`  A number from 0-255 (inclusive) representing the threshold this account sets on all operations it performs that have a high threshold. <../learn/encyclopedia/security/signatures-multisig#multisig>
* `--home-domain <HOME_DOMAIN>`  Sets the home domain of an account. See <../learn/encyclopedia/network-configuration/federation>
* `--signer <SIGNER>`  Add, update, or remove a signer from an account
* `--signer-weight <SIGNER_WEIGHT>`  Signer weight is a number from 0-255 (inclusive). The signer is deleted if the weight is 0
* `--set-required`  When enabled, an issuer must approve an account before that account can hold its asset. <../tokens/control-asset-access#authorization-required-0x1>
* `--set-revocable`  When enabled, an issuer can revoke an existing trustline's authorization, thereby freezing the asset held by an account. <../tokens/control-asset-access#authorization-revocable-0x2>
* `--set-clawback-enabled`  Enables the issuing account to take back (burning) all of the asset. <../tokens/control-asset-access#clawback-enabled-0x8>
* `--set-immutable`  With this setting, none of the other authorization flags (`AUTH_REQUIRED_FLAG`, `AUTH_REVOCABLE_FLAG`) can be set, and the issuing account can't be merged. <../tokens/control-asset-access#authorization-immutable-0x4>
* `--clear-required`
* `--clear-revocable`
* `--clear-immutable`
* `--clear-clawback-enabled`

###### **Options (Global):**[](#options-global-67 "Direct link to options-global-67")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-50 "Direct link to options-rpc-50")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx new set-trustline-flags`[](#stellar-tx-new-set-trustline-flags "Direct link to stellar-tx-new-set-trustline-flags")

Configure authorization and trustline flags for an asset

**Usage:** `stellar tx new set-trustline-flags [OPTIONS] --source-account <SOURCE_ACCOUNT> --trustor <TRUSTOR> --asset <ASSET>`

###### **Options:**[](#options-62 "Direct link to options-62")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--trustor <TRUSTOR>`  Account to set trustline flags for, e.g. `GBX...`, or alias, or muxed account, `M123...``
* `--asset <ASSET>`  Asset to set trustline flags for
* `--set-authorize`  Signifies complete authorization allowing an account to transact freely with the asset to make and receive payments and place orders
* `--set-authorize-to-maintain-liabilities`  Denotes limited authorization that allows an account to maintain current orders but not to otherwise transact with the asset
* `--set-trustline-clawback-enabled`  Enables the issuing account to take back (burning) all of the asset. See our section on Clawbacks: <../learn/encyclopedia/transactions-specialized/clawbacks>
* `--clear-authorize`
* `--clear-authorize-to-maintain-liabilities`
* `--clear-trustline-clawback-enabled`

###### **Options (Global):**[](#options-global-68 "Direct link to options-global-68")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-51 "Direct link to options-rpc-51")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation`[](#stellar-tx-operation "Direct link to stellar-tx-operation")

Manipulate the operations in a transaction, including adding new operations

**Usage:** `stellar tx operation <COMMAND>`

**Command Alias:** `op`

###### **Subcommands:**[](#subcommands-16 "Direct link to subcommands-16")

* `add`  Add Operation to a transaction

## `stellar tx operation add`[](#stellar-tx-operation-add "Direct link to stellar-tx-operation-add")

Add Operation to a transaction

**Usage:** `stellar tx operation add <COMMAND>`

###### **Subcommands:**[](#subcommands-17 "Direct link to subcommands-17")

* `account-merge`  Transfer XLM balance to another account and remove source account
* `begin-sponsoring-future-reserves`  Begin sponsoring future reserves for another account
* `bump-sequence`  Bump sequence number to invalidate older transactions
* `change-trust`  Create, update, or delete a trustline
* `claim-claimable-balance`  Claim a claimable balance by its balance ID
* `clawback`  Clawback an asset from an account
* `clawback-claimable-balance`  Clawback a claimable balance by its balance ID
* `create-account`  Create and fund a new account
* `create-claimable-balance`  Create a claimable balance that can be claimed by specified accounts
* `create-passive-sell-offer`  Create a passive sell offer on the Stellar DEX
* `end-sponsoring-future-reserves`  End sponsoring future reserves
* `liquidity-pool-deposit`  Deposit assets into a liquidity pool
* `liquidity-pool-withdraw`  Withdraw assets from a liquidity pool
* `manage-buy-offer`  Create, update, or delete a buy offer
* `manage-data`  Set, modify, or delete account data entries
* `manage-sell-offer`  Create, update, or delete a sell offer
* `path-payment-strict-receive`  Send a payment with a different asset using path finding, specifying the receive amount
* `path-payment-strict-send`  Send a payment with a different asset using path finding, specifying the send amount
* `payment`  Send asset to destination account
* `revoke-sponsorship`  Revoke sponsorship of a ledger entry or signer
* `set-options`  Set account options like flags, signers, and home domain
* `set-trustline-flags`  Configure authorization and trustline flags for an asset

## `stellar tx operation add account-merge`[](#stellar-tx-operation-add-account-merge "Direct link to stellar-tx-operation-add-account-merge")

Transfer XLM balance to another account and remove source account

**Usage:** `stellar tx operation add account-merge [OPTIONS] --source-account <SOURCE_ACCOUNT> --account <ACCOUNT> [TX_XDR]`

###### **Arguments:**[](#arguments-22 "Direct link to arguments-22")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-63 "Direct link to options-63")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--account <ACCOUNT>`  Muxed Account to merge with, e.g. `GBX...`, 'MBX...'

###### **Options (Global):**[](#options-global-69 "Direct link to options-global-69")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-52 "Direct link to options-rpc-52")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add begin-sponsoring-future-reserves`[](#stellar-tx-operation-add-begin-sponsoring-future-reserves "Direct link to stellar-tx-operation-add-begin-sponsoring-future-reserves")

Begin sponsoring future reserves for another account

**Usage:** `stellar tx operation add begin-sponsoring-future-reserves [OPTIONS] --source-account <SOURCE_ACCOUNT> --sponsored-id <SPONSORED_ID> [TX_XDR]`

###### **Arguments:**[](#arguments-23 "Direct link to arguments-23")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-64 "Direct link to options-64")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--sponsored-id <SPONSORED_ID>`  Account that will be sponsored

###### **Options (Global):**[](#options-global-70 "Direct link to options-global-70")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-53 "Direct link to options-rpc-53")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add bump-sequence`[](#stellar-tx-operation-add-bump-sequence "Direct link to stellar-tx-operation-add-bump-sequence")

Bump sequence number to invalidate older transactions

**Usage:** `stellar tx operation add bump-sequence [OPTIONS] --source-account <SOURCE_ACCOUNT> --bump-to <BUMP_TO> [TX_XDR]`

###### **Arguments:**[](#arguments-24 "Direct link to arguments-24")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-65 "Direct link to options-65")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--bump-to <BUMP_TO>`  Sequence number to bump to

###### **Options (Global):**[](#options-global-71 "Direct link to options-global-71")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-54 "Direct link to options-rpc-54")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add change-trust`[](#stellar-tx-operation-add-change-trust "Direct link to stellar-tx-operation-add-change-trust")

Create, update, or delete a trustline

**Usage:** `stellar tx operation add change-trust [OPTIONS] --source-account <SOURCE_ACCOUNT> --line <LINE> [TX_XDR]`

###### **Arguments:**[](#arguments-25 "Direct link to arguments-25")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-66 "Direct link to options-66")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--line <LINE>`
* `--limit <LIMIT>`  Limit for the trust line, 0 to remove the trust line

  Default value: `9223372036854775807`

###### **Options (Global):**[](#options-global-72 "Direct link to options-global-72")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-55 "Direct link to options-rpc-55")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add claim-claimable-balance`[](#stellar-tx-operation-add-claim-claimable-balance "Direct link to stellar-tx-operation-add-claim-claimable-balance")

Claim a claimable balance by its balance ID

**Usage:** `stellar tx operation add claim-claimable-balance [OPTIONS] --source-account <SOURCE_ACCOUNT> --balance-id <BALANCE_ID> [TX_XDR]`

###### **Arguments:**[](#arguments-26 "Direct link to arguments-26")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-67 "Direct link to options-67")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--balance-id <BALANCE_ID>`  Balance ID of the claimable balance to claim (64-character hex string)

###### **Options (Global):**[](#options-global-73 "Direct link to options-global-73")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-56 "Direct link to options-rpc-56")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add clawback`[](#stellar-tx-operation-add-clawback "Direct link to stellar-tx-operation-add-clawback")

Clawback an asset from an account

**Usage:** `stellar tx operation add clawback [OPTIONS] --source-account <SOURCE_ACCOUNT> --from <FROM> --asset <ASSET> --amount <AMOUNT> [TX_XDR]`

###### **Arguments:**[](#arguments-27 "Direct link to arguments-27")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-68 "Direct link to options-68")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--from <FROM>`  Account to clawback assets from, e.g. `GBX...`
* `--asset <ASSET>`  Asset to clawback
* `--amount <AMOUNT>`  Amount of the asset to clawback, in stroops. 1 stroop = 0.0000001 of the asset

###### **Options (Global):**[](#options-global-74 "Direct link to options-global-74")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-57 "Direct link to options-rpc-57")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add clawback-claimable-balance`[](#stellar-tx-operation-add-clawback-claimable-balance "Direct link to stellar-tx-operation-add-clawback-claimable-balance")

Clawback a claimable balance by its balance ID

**Usage:** `stellar tx operation add clawback-claimable-balance [OPTIONS] --source-account <SOURCE_ACCOUNT> --balance-id <BALANCE_ID> [TX_XDR]`

###### **Arguments:**[](#arguments-28 "Direct link to arguments-28")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-69 "Direct link to options-69")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--balance-id <BALANCE_ID>`  Balance ID of the claimable balance to clawback. Accepts multiple formats: - API format with type prefix (72 chars): 000000006f2179b31311fa8064760b48942c8e166702ba0b8fbe7358c4fd570421840461 - Direct hash format (64 chars): 6f2179b31311fa8064760b48942c8e166702ba0b8fbe7358c4fd570421840461 - Address format (base32): BAAMLBZI42AD52HKGIZOU7WFVZM6BPEJCLPL44QU2AT6TY3P57I5QDNYIA

###### **Options (Global):**[](#options-global-75 "Direct link to options-global-75")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-58 "Direct link to options-rpc-58")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add create-account`[](#stellar-tx-operation-add-create-account "Direct link to stellar-tx-operation-add-create-account")

Create and fund a new account

**Usage:** `stellar tx operation add create-account [OPTIONS] --source-account <SOURCE_ACCOUNT> --destination <DESTINATION> [TX_XDR]`

###### **Arguments:**[](#arguments-29 "Direct link to arguments-29")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-70 "Direct link to options-70")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--destination <DESTINATION>`  Account Id to create, e.g. `GBX...`
* `--starting-balance <STARTING_BALANCE>`  Initial balance in stroops of the account, default 1 XLM

  Default value: `10_000_000`

###### **Options (Global):**[](#options-global-76 "Direct link to options-global-76")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-59 "Direct link to options-rpc-59")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add create-claimable-balance`[](#stellar-tx-operation-add-create-claimable-balance "Direct link to stellar-tx-operation-add-create-claimable-balance")

Create a claimable balance that can be claimed by specified accounts

**Usage:** `stellar tx operation add create-claimable-balance [OPTIONS] --source-account <SOURCE_ACCOUNT> --amount <AMOUNT> [TX_XDR]`

###### **Arguments:**[](#arguments-30 "Direct link to arguments-30")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-71 "Direct link to options-71")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--asset <ASSET>`  Asset to be held in the ClaimableBalanceEntry

  Default value: `native`
* `--amount <AMOUNT>`  Amount of asset to store in the entry, in stroops. 1 stroop = 0.0000001 of the asset
* `--claimant <CLAIMANTS>`  Claimants of the claimable balance. Format: account\_id or account\_id:predicate\_json Can be specified multiple times for multiple claimants.

  Examples:

  + `--claimant alice (unconditional)` - `--claimant 'bob:{"before_absolute_time":"1735689599"}'` - `--claimant 'charlie:{"and":[{"before_absolute_time":"1735689599"},{"before_relative_time":"3600"}]}'`

###### **Options (Global):**[](#options-global-77 "Direct link to options-global-77")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-60 "Direct link to options-rpc-60")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add create-passive-sell-offer`[](#stellar-tx-operation-add-create-passive-sell-offer "Direct link to stellar-tx-operation-add-create-passive-sell-offer")

Create a passive sell offer on the Stellar DEX

**Usage:** `stellar tx operation add create-passive-sell-offer [OPTIONS] --source-account <SOURCE_ACCOUNT> --selling <SELLING> --buying <BUYING> --amount <AMOUNT> --price <PRICE> [TX_XDR]`

###### **Arguments:**[](#arguments-31 "Direct link to arguments-31")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-72 "Direct link to options-72")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--selling <SELLING>`  Asset to sell
* `--buying <BUYING>`  Asset to buy
* `--amount <AMOUNT>`  Amount of selling asset to offer, in stroops. 1 stroop = 0.0000001 of the asset (e.g. 1 XLM = `10_000_000` stroops)
* `--price <PRICE>`  Price of 1 unit of selling asset in terms of buying asset as "numerator:denominator" (e.g., "1:2" means 0.5)

###### **Options (Global):**[](#options-global-78 "Direct link to options-global-78")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-61 "Direct link to options-rpc-61")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add end-sponsoring-future-reserves`[](#stellar-tx-operation-add-end-sponsoring-future-reserves "Direct link to stellar-tx-operation-add-end-sponsoring-future-reserves")

End sponsoring future reserves

**Usage:** `stellar tx operation add end-sponsoring-future-reserves [OPTIONS] --source-account <SOURCE_ACCOUNT> [TX_XDR]`

###### **Arguments:**[](#arguments-32 "Direct link to arguments-32")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-73 "Direct link to options-73")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout

###### **Options (Global):**[](#options-global-79 "Direct link to options-global-79")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-62 "Direct link to options-rpc-62")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add liquidity-pool-deposit`[](#stellar-tx-operation-add-liquidity-pool-deposit "Direct link to stellar-tx-operation-add-liquidity-pool-deposit")

Deposit assets into a liquidity pool

**Usage:** `stellar tx operation add liquidity-pool-deposit [OPTIONS] --source-account <SOURCE_ACCOUNT> --liquidity-pool-id <LIQUIDITY_POOL_ID> --max-amount-a <MAX_AMOUNT_A> --max-amount-b <MAX_AMOUNT_B> [TX_XDR]`

###### **Arguments:**[](#arguments-33 "Direct link to arguments-33")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-74 "Direct link to options-74")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--liquidity-pool-id <LIQUIDITY_POOL_ID>`  Liquidity pool ID to deposit to
* `--max-amount-a <MAX_AMOUNT_A>`  Maximum amount of the first asset to deposit, in stroops
* `--max-amount-b <MAX_AMOUNT_B>`  Maximum amount of the second asset to deposit, in stroops
* `--min-price <MIN_PRICE>`  Minimum price for the first asset in terms of the second asset as "numerator:denominator" (e.g., "1:2" means 0.5)

  Default value: `1:1`
* `--max-price <MAX_PRICE>`  Maximum price for the first asset in terms of the second asset as "numerator:denominator" (e.g., "1:2" means 0.5)

  Default value: `1:1`

###### **Options (Global):**[](#options-global-80 "Direct link to options-global-80")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-63 "Direct link to options-rpc-63")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add liquidity-pool-withdraw`[](#stellar-tx-operation-add-liquidity-pool-withdraw "Direct link to stellar-tx-operation-add-liquidity-pool-withdraw")

Withdraw assets from a liquidity pool

**Usage:** `stellar tx operation add liquidity-pool-withdraw [OPTIONS] --source-account <SOURCE_ACCOUNT> --liquidity-pool-id <LIQUIDITY_POOL_ID> --amount <AMOUNT> --min-amount-a <MIN_AMOUNT_A> --min-amount-b <MIN_AMOUNT_B> [TX_XDR]`

###### **Arguments:**[](#arguments-34 "Direct link to arguments-34")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-75 "Direct link to options-75")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--liquidity-pool-id <LIQUIDITY_POOL_ID>`  Liquidity pool ID to withdraw from
* `--amount <AMOUNT>`  Amount of pool shares to withdraw, in stroops
* `--min-amount-a <MIN_AMOUNT_A>`  Minimum amount of the first asset to receive, in stroops
* `--min-amount-b <MIN_AMOUNT_B>`  Minimum amount of the second asset to receive, in stroops

###### **Options (Global):**[](#options-global-81 "Direct link to options-global-81")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-64 "Direct link to options-rpc-64")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add manage-buy-offer`[](#stellar-tx-operation-add-manage-buy-offer "Direct link to stellar-tx-operation-add-manage-buy-offer")

Create, update, or delete a buy offer

**Usage:** `stellar tx operation add manage-buy-offer [OPTIONS] --source-account <SOURCE_ACCOUNT> --selling <SELLING> --buying <BUYING> --amount <AMOUNT> --price <PRICE> [TX_XDR]`

###### **Arguments:**[](#arguments-35 "Direct link to arguments-35")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-76 "Direct link to options-76")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--selling <SELLING>`  Asset to sell
* `--buying <BUYING>`  Asset to buy
* `--amount <AMOUNT>`  Amount of buying asset to purchase, in stroops. 1 stroop = 0.0000001 of the asset (e.g. 1 XLM = `10_000_000` stroops). Use `0` to remove the offer
* `--price <PRICE>`  Price of 1 unit of buying asset in terms of selling asset as "numerator:denominator" (e.g., "1:2" means 0.5)
* `--offer-id <OFFER_ID>`  Offer ID. If 0, will create new offer. Otherwise, will update existing offer

  Default value: `0`

###### **Options (Global):**[](#options-global-82 "Direct link to options-global-82")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-65 "Direct link to options-rpc-65")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add manage-data`[](#stellar-tx-operation-add-manage-data "Direct link to stellar-tx-operation-add-manage-data")

Set, modify, or delete account data entries

**Usage:** `stellar tx operation add manage-data [OPTIONS] --source-account <SOURCE_ACCOUNT> --data-name <DATA_NAME> [TX_XDR]`

###### **Arguments:**[](#arguments-36 "Direct link to arguments-36")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-77 "Direct link to options-77")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--data-name <DATA_NAME>`  String up to 64 bytes long. If this is a new Name it will add the given name/value pair to the account. If this Name is already present then the associated value will be modified
* `--data-value <DATA_VALUE>`  Up to 64 bytes long hex string If not present then the existing Name will be deleted. If present then this value will be set in the `DataEntry`

###### **Options (Global):**[](#options-global-83 "Direct link to options-global-83")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-66 "Direct link to options-rpc-66")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add manage-sell-offer`[](#stellar-tx-operation-add-manage-sell-offer "Direct link to stellar-tx-operation-add-manage-sell-offer")

Create, update, or delete a sell offer

**Usage:** `stellar tx operation add manage-sell-offer [OPTIONS] --source-account <SOURCE_ACCOUNT> --selling <SELLING> --buying <BUYING> --amount <AMOUNT> --price <PRICE> [TX_XDR]`

###### **Arguments:**[](#arguments-37 "Direct link to arguments-37")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-78 "Direct link to options-78")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--selling <SELLING>`  Asset to sell
* `--buying <BUYING>`  Asset to buy
* `--amount <AMOUNT>`  Amount of selling asset to offer, in stroops. 1 stroop = 0.0000001 of the asset (e.g. 1 XLM = `10_000_000` stroops). Use `0` to remove the offer
* `--price <PRICE>`  Price of 1 unit of selling asset in terms of buying asset as "numerator:denominator" (e.g., "1:2" means 0.5)
* `--offer-id <OFFER_ID>`  Offer ID. If 0, will create new offer. Otherwise, will update existing offer

  Default value: `0`

###### **Options (Global):**[](#options-global-84 "Direct link to options-global-84")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-67 "Direct link to options-rpc-67")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add path-payment-strict-receive`[](#stellar-tx-operation-add-path-payment-strict-receive "Direct link to stellar-tx-operation-add-path-payment-strict-receive")

Send a payment with a different asset using path finding, specifying the receive amount

**Usage:** `stellar tx operation add path-payment-strict-receive [OPTIONS] --source-account <SOURCE_ACCOUNT> --send-asset <SEND_ASSET> --send-max <SEND_MAX> --destination <DESTINATION> --dest-asset <DEST_ASSET> --dest-amount <DEST_AMOUNT> [TX_XDR]`

###### **Arguments:**[](#arguments-38 "Direct link to arguments-38")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-79 "Direct link to options-79")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--send-asset <SEND_ASSET>`  Asset to send (pay with)
* `--send-max <SEND_MAX>`  Maximum amount of send asset to deduct from sender's account, in stroops. 1 stroop = 0.0000001 of the asset (e.g. 1 XLM = `10_000_000` stroops)
* `--destination <DESTINATION>`  Account that receives the payment
* `--dest-asset <DEST_ASSET>`  Asset that the destination will receive
* `--dest-amount <DEST_AMOUNT>`  Exact amount of destination asset that the destination account will receive, in stroops. 1 stroop = 0.0000001 of the asset
* `--path <PATH>`  List of intermediate assets for the payment path, comma-separated (up to 5 assets). Each asset should be in the format 'code:issuer' or 'native' for XLM

###### **Options (Global):**[](#options-global-85 "Direct link to options-global-85")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-68 "Direct link to options-rpc-68")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add path-payment-strict-send`[](#stellar-tx-operation-add-path-payment-strict-send "Direct link to stellar-tx-operation-add-path-payment-strict-send")

Send a payment with a different asset using path finding, specifying the send amount

**Usage:** `stellar tx operation add path-payment-strict-send [OPTIONS] --source-account <SOURCE_ACCOUNT> --send-asset <SEND_ASSET> --send-amount <SEND_AMOUNT> --destination <DESTINATION> --dest-asset <DEST_ASSET> --dest-min <DEST_MIN> [TX_XDR]`

###### **Arguments:**[](#arguments-39 "Direct link to arguments-39")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-80 "Direct link to options-80")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--send-asset <SEND_ASSET>`  Asset to send (pay with)
* `--send-amount <SEND_AMOUNT>`  Amount of send asset to deduct from sender's account, in stroops. 1 stroop = 0.0000001 of the asset (e.g. 1 XLM = `10_000_000` stroops)
* `--destination <DESTINATION>`  Account that receives the payment
* `--dest-asset <DEST_ASSET>`  Asset that the destination will receive
* `--dest-min <DEST_MIN>`  Minimum amount of destination asset that the destination account can receive. The operation will fail if this amount cannot be met
* `--path <PATH>`  List of intermediate assets for the payment path, comma-separated (up to 5 assets). Each asset should be in the format 'code:issuer' or 'native' for XLM

###### **Options (Global):**[](#options-global-86 "Direct link to options-global-86")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-69 "Direct link to options-rpc-69")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add payment`[](#stellar-tx-operation-add-payment "Direct link to stellar-tx-operation-add-payment")

Send asset to destination account

**Usage:** `stellar tx operation add payment [OPTIONS] --source-account <SOURCE_ACCOUNT> --destination <DESTINATION> --amount <AMOUNT> [TX_XDR]`

###### **Arguments:**[](#arguments-40 "Direct link to arguments-40")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-81 "Direct link to options-81")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--destination <DESTINATION>`  Account to send to, e.g. `GBX...`
* `--asset <ASSET>`  Asset to send, default native, e.i. XLM

  Default value: `native`
* `--amount <AMOUNT>`  Amount of the aforementioned asset to send, in stroops. 1 stroop = 0.0000001 of the asset (e.g. 1 XLM = `10_000_000` stroops)

###### **Options (Global):**[](#options-global-87 "Direct link to options-global-87")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-70 "Direct link to options-rpc-70")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add revoke-sponsorship`[](#stellar-tx-operation-add-revoke-sponsorship "Direct link to stellar-tx-operation-add-revoke-sponsorship")

Revoke sponsorship of a ledger entry or signer

**Usage:** `stellar tx operation add revoke-sponsorship [OPTIONS] --source-account <SOURCE_ACCOUNT> --account-id <ACCOUNT_ID> [TX_XDR]`

###### **Arguments:**[](#arguments-41 "Direct link to arguments-41")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-82 "Direct link to options-82")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--account-id <ACCOUNT_ID>`  Account ID (required for all sponsorship types)
* `--asset <ASSET>`  Asset for trustline sponsorship (format: CODE:ISSUER)
* `--data-name <DATA_NAME>`  Data name for data entry sponsorship
* `--offer-id <OFFER_ID>`  Offer ID for offer sponsorship
* `--liquidity-pool-id <LIQUIDITY_POOL_ID>`  Pool ID for liquidity pool sponsorship. Accepts multiple formats: - API format with type prefix (72 chars): 000000006f2179b31311fa8064760b48942c8e166702ba0b8fbe7358c4fd570421840461 - Direct hash format (64 chars): 6f2179b31311fa8064760b48942c8e166702ba0b8fbe7358c4fd570421840461 - Address format (base32): LAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
* `--claimable-balance-id <CLAIMABLE_BALANCE_ID>`  Claimable balance ID for claimable balance sponsorship. Accepts multiple formats: - API format with type prefix (72 chars): 000000006f2179b31311fa8064760b48942c8e166702ba0b8fbe7358c4fd570421840461 - Direct hash format (64 chars): 6f2179b31311fa8064760b48942c8e166702ba0b8fbe7358c4fd570421840461 - Address format (base32): BAAMLBZI42AD52HKGIZOU7WFVZM6BPEJCLPL44QU2AT6TY3P57I5QDNYIA
* `--signer-key <SIGNER_KEY>`  Signer key for signer sponsorship

###### **Options (Global):**[](#options-global-88 "Direct link to options-global-88")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-71 "Direct link to options-rpc-71")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add set-options`[](#stellar-tx-operation-add-set-options "Direct link to stellar-tx-operation-add-set-options")

Set account options like flags, signers, and home domain

**Usage:** `stellar tx operation add set-options [OPTIONS] --source-account <SOURCE_ACCOUNT> [TX_XDR]`

###### **Arguments:**[](#arguments-42 "Direct link to arguments-42")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-83 "Direct link to options-83")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--inflation-dest <INFLATION_DEST>`  Account of the inflation destination
* `--master-weight <MASTER_WEIGHT>`  A number from 0-255 (inclusive) representing the weight of the master key. If the weight of the master key is updated to 0, it is effectively disabled
* `--low-threshold <LOW_THRESHOLD>`  A number from 0-255 (inclusive) representing the threshold this account sets on all operations it performs that have a low threshold. <../learn/encyclopedia/security/signatures-multisig#multisig>
* `--med-threshold <MED_THRESHOLD>`  A number from 0-255 (inclusive) representing the threshold this account sets on all operations it performs that have a medium threshold. <../learn/encyclopedia/security/signatures-multisig#multisig>
* `--high-threshold <HIGH_THRESHOLD>`  A number from 0-255 (inclusive) representing the threshold this account sets on all operations it performs that have a high threshold. <../learn/encyclopedia/security/signatures-multisig#multisig>
* `--home-domain <HOME_DOMAIN>`  Sets the home domain of an account. See <../learn/encyclopedia/network-configuration/federation>
* `--signer <SIGNER>`  Add, update, or remove a signer from an account
* `--signer-weight <SIGNER_WEIGHT>`  Signer weight is a number from 0-255 (inclusive). The signer is deleted if the weight is 0
* `--set-required`  When enabled, an issuer must approve an account before that account can hold its asset. <../tokens/control-asset-access#authorization-required-0x1>
* `--set-revocable`  When enabled, an issuer can revoke an existing trustline's authorization, thereby freezing the asset held by an account. <../tokens/control-asset-access#authorization-revocable-0x2>
* `--set-clawback-enabled`  Enables the issuing account to take back (burning) all of the asset. <../tokens/control-asset-access#clawback-enabled-0x8>
* `--set-immutable`  With this setting, none of the other authorization flags (`AUTH_REQUIRED_FLAG`, `AUTH_REVOCABLE_FLAG`) can be set, and the issuing account can't be merged. <../tokens/control-asset-access#authorization-immutable-0x4>
* `--clear-required`
* `--clear-revocable`
* `--clear-immutable`
* `--clear-clawback-enabled`

###### **Options (Global):**[](#options-global-89 "Direct link to options-global-89")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-72 "Direct link to options-rpc-72")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx operation add set-trustline-flags`[](#stellar-tx-operation-add-set-trustline-flags "Direct link to stellar-tx-operation-add-set-trustline-flags")

Configure authorization and trustline flags for an asset

**Usage:** `stellar tx operation add set-trustline-flags [OPTIONS] --source-account <SOURCE_ACCOUNT> --trustor <TRUSTOR> --asset <ASSET> [TX_XDR]`

###### **Arguments:**[](#arguments-43 "Direct link to arguments-43")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-84 "Direct link to options-84")

* `--operation-source-account <OPERATION_SOURCE_ACCOUNT>` [alias: `op-source`]  Source account used for the operation
* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--build-only`  Build the transaction and only write the base64 xdr to stdout
* `--trustor <TRUSTOR>`  Account to set trustline flags for, e.g. `GBX...`, or alias, or muxed account, `M123...``
* `--asset <ASSET>`  Asset to set trustline flags for
* `--set-authorize`  Signifies complete authorization allowing an account to transact freely with the asset to make and receive payments and place orders
* `--set-authorize-to-maintain-liabilities`  Denotes limited authorization that allows an account to maintain current orders but not to otherwise transact with the asset
* `--set-trustline-clawback-enabled`  Enables the issuing account to take back (burning) all of the asset. See our section on Clawbacks: <../learn/encyclopedia/transactions-specialized/clawbacks>
* `--clear-authorize`
* `--clear-authorize-to-maintain-liabilities`
* `--clear-trustline-clawback-enabled`

###### **Options (Global):**[](#options-global-90 "Direct link to options-global-90")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-73 "Direct link to options-rpc-73")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx send`[](#stellar-tx-send "Direct link to stellar-tx-send")

Send a transaction envelope to the network

**Usage:** `stellar tx send [OPTIONS] [TX_XDR]`

###### **Arguments:**[](#arguments-44 "Direct link to arguments-44")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options (Global):**[](#options-global-91 "Direct link to options-global-91")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-74 "Direct link to options-rpc-74")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx sign`[](#stellar-tx-sign "Direct link to stellar-tx-sign")

Sign a transaction envelope appending the signature to the envelope

**Usage:** `stellar tx sign [OPTIONS] [TX_XDR]`

###### **Arguments:**[](#arguments-45 "Direct link to arguments-45")

* `<TX_XDR>`  Base-64 transaction envelope XDR, or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-85 "Direct link to options-85")

* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet

###### **Options (Global):**[](#options-global-92 "Direct link to options-global-92")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-75 "Direct link to options-rpc-75")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx simulate`[](#stellar-tx-simulate "Direct link to stellar-tx-simulate")

Simulate a transaction envelope from stdin

**Usage:** `stellar tx simulate [OPTIONS] --source-account <SOURCE_ACCOUNT> [TX_XDR]`

###### **Arguments:**[](#arguments-46 "Direct link to arguments-46")

* `<TX_XDR>`  Base-64 transaction envelope XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-86 "Direct link to options-86")

* `-s`, `--source-account <SOURCE_ACCOUNT>` [alias: `source`]  Account that where transaction originates from. Alias `source`. Can be an identity (--source alice), a public key (--source GDKW...), a muxed account (--source MDA¦), a secret key (--source SC36¦), or a seed phrase (--source "kite urban¦"). If `--build-only` was NOT provided, this key will also be used to sign the final transaction. In that case, trying to sign with public key will fail
* `--sign-with-key <SIGN_WITH_KEY>`  Sign with a local key or key saved in OS secure storage. Can be an identity (--sign-with-key alice), a secret key (--sign-with-key SC36¦), or a seed phrase (--sign-with-key "kite urban¦"). If using seed phrase, `--hd-path` defaults to the `0` path
* `--hd-path <HD_PATH>`  If using a seed phrase to sign, sets which hierarchical deterministic path to use, e.g. `m/44'/148'/{hd_path}`. Example: `--hd-path 1`. Default: `0`
* `--sign-with-lab`  Sign with <https://lab.stellar.org>
* `--sign-with-ledger`  Sign with a ledger wallet
* `--fee <FEE>`   ï¸ Deprecated, use `--inclusion-fee`. Fee amount for transaction, in stroops. 1 stroop = 0.0000001 xlm
* `--inclusion-fee <INCLUSION_FEE>`  Maximum fee amount for transaction inclusion, in stroops. 1 stroop = 0.0000001 xlm. Defaults to 100 if no arg, env, or config value is provided
* `--instruction-leeway <INSTRUCTION_LEEWAY>`  Allow this many extra instructions when budgeting resources during transaction simulation

###### **Options (Global):**[](#options-global-93 "Direct link to options-global-93")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-76 "Direct link to options-rpc-76")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx fetch`[](#stellar-tx-fetch "Direct link to stellar-tx-fetch")

Fetch a transaction from the network by hash If no subcommand is passed in, the transaction envelope will be returned

**Usage:** `stellar tx fetch [OPTIONS] fetch <COMMAND>`

###### **Subcommands:**[](#subcommands-18 "Direct link to subcommands-18")

* `result`  Fetch the transaction result
* `meta`  Fetch the transaction meta
* `fee`  Fetch the transaction fee information
* `events`  Fetch the transaction events

###### **Options:**[](#options-87 "Direct link to options-87")

* `--hash <HASH>`  Hash of transaction to fetch
* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `json`: JSON output with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output with parsed XDRs
  + `xdr`: Original RPC output (containing XDRs)

###### **Options (RPC):**[](#options-rpc-77 "Direct link to options-rpc-77")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx fetch result`[](#stellar-tx-fetch-result "Direct link to stellar-tx-fetch-result")

Fetch the transaction result

**Usage:** `stellar tx fetch result [OPTIONS] --hash <HASH>`

###### **Options:**[](#options-88 "Direct link to options-88")

* `--hash <HASH>`  Transaction hash to fetch
* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `json`: JSON output with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output with parsed XDRs
  + `xdr`: Original RPC output (containing XDRs)

###### **Options (RPC):**[](#options-rpc-78 "Direct link to options-rpc-78")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx fetch meta`[](#stellar-tx-fetch-meta "Direct link to stellar-tx-fetch-meta")

Fetch the transaction meta

**Usage:** `stellar tx fetch meta [OPTIONS] --hash <HASH>`

###### **Options:**[](#options-89 "Direct link to options-89")

* `--hash <HASH>`  Transaction hash to fetch
* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `json`: JSON output with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output with parsed XDRs
  + `xdr`: Original RPC output (containing XDRs)

###### **Options (RPC):**[](#options-rpc-79 "Direct link to options-rpc-79")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx fetch fee`[](#stellar-tx-fetch-fee "Direct link to stellar-tx-fetch-fee")

Fetch the transaction fee information

**Usage:** `stellar tx fetch fee [OPTIONS] --hash <HASH>`

###### **Options:**[](#options-90 "Direct link to options-90")

* `--hash <HASH>`  Transaction hash to fetch
* `--output <OUTPUT>`  Output format for fee command

  Default value: `table`

  Possible values:

  + `json`: JSON output of the ledger entry with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of the ledger entry with parsed XDRs
  + `table`: Formatted in a table comparing fee types

###### **Options (RPC):**[](#options-rpc-80 "Direct link to options-rpc-80")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx fetch events`[](#stellar-tx-fetch-events "Direct link to stellar-tx-fetch-events")

Fetch the transaction events

**Usage:** `stellar tx fetch events [OPTIONS] --hash <HASH>`

###### **Options:**[](#options-91 "Direct link to options-91")

* `--hash <HASH>`  Transaction hash to fetch
* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `json`: JSON output of the events with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of events with parsed XDRs
  + `text`: Human readable event output with parsed XDRs

###### **Options (RPC):**[](#options-rpc-81 "Direct link to options-rpc-81")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar tx decode`[](#stellar-tx-decode "Direct link to stellar-tx-decode")

Decode a transaction envelope from XDR to JSON

**Usage:** `stellar tx decode [OPTIONS] [INPUT]...`

###### **Arguments:**[](#arguments-47 "Direct link to arguments-47")

* `<INPUT>`  XDR or files containing XDR to decode, or stdin if empty

###### **Options:**[](#options-92 "Direct link to options-92")

* `--input <INPUT_FORMAT>`

  Default value: `single-base64`

  Possible values: `single-base64`, `single`
* `--output <OUTPUT_FORMAT>`

  Default value: `json`

  Possible values: `json`, `json-formatted`

## `stellar tx encode`[](#stellar-tx-encode "Direct link to stellar-tx-encode")

Encode a transaction envelope from JSON to XDR

**Usage:** `stellar tx encode [OPTIONS] [INPUT]...`

###### **Arguments:**[](#arguments-48 "Direct link to arguments-48")

* `<INPUT>`  XDR or files containing XDR to decode, or stdin if empty

###### **Options:**[](#options-93 "Direct link to options-93")

* `--input <INPUT_FORMAT>`

  Default value: `json`

  Possible values: `json`
* `--output <OUTPUT_FORMAT>`

  Default value: `single-base64`

  Possible values: `single-base64`, `single`

## `stellar xdr`[](#stellar-xdr "Direct link to stellar-xdr")

Decode and encode XDR

**Usage:** `stellar xdr [CHANNEL] <COMMAND>`

###### **Subcommands:**[](#subcommands-19 "Direct link to subcommands-19")

* `types`  View information about types
* `guess`  Guess the XDR type
* `decode`  Decode XDR
* `encode`  Encode XDR
* `compare`  Compare two XDR values with each other
* `generate`  Generate XDR values
* `version`  Print version information

###### **Arguments:**[](#arguments-49 "Direct link to arguments-49")

* `<CHANNEL>`  Channel of XDR to operate on

  Default value: `+curr`

  Possible values: `+curr`, `+next`

## `stellar xdr types`[](#stellar-xdr-types "Direct link to stellar-xdr-types")

View information about types

**Usage:** `stellar xdr types <COMMAND>`

###### **Subcommands:**[](#subcommands-20 "Direct link to subcommands-20")

* `list` 
* `schema` 
* `schema-files`  Generate JSON schema files for the XDR types, writing a file for each type to the out directory

## `stellar xdr types list`[](#stellar-xdr-types-list "Direct link to stellar-xdr-types-list")

**Usage:** `stellar xdr types list [OPTIONS]`

###### **Options:**[](#options-94 "Direct link to options-94")

* `--output <OUTPUT>`

  Default value: `plain`

  Possible values: `plain`, `json`, `json-formatted`

## `stellar xdr types schema`[](#stellar-xdr-types-schema "Direct link to stellar-xdr-types-schema")

**Usage:** `stellar xdr types schema [OPTIONS] --type <TYPE>`

###### **Options:**[](#options-95 "Direct link to options-95")

* `--type <TYPE>`  XDR type to decode
* `--output <OUTPUT>`

  Default value: `json-schema-draft201909`

  Possible values: `json-schema-draft201909`

## `stellar xdr types schema-files`[](#stellar-xdr-types-schema-files "Direct link to stellar-xdr-types-schema-files")

Generate JSON schema files for the XDR types, writing a file for each type to the out directory

**Usage:** `stellar xdr types schema-files [OPTIONS] --out-dir <OUT_DIR>`

###### **Options:**[](#options-96 "Direct link to options-96")

* `--out-dir <OUT_DIR>`
* `--output <OUTPUT>`

  Default value: `json-schema-draft201909`

  Possible values: `json-schema-draft201909`

## `stellar xdr guess`[](#stellar-xdr-guess "Direct link to stellar-xdr-guess")

Guess the XDR type.

Prints a list of types that the XDR values can be decoded into.

**Usage:** `stellar xdr guess [OPTIONS] [INPUT]`

###### **Arguments:**[](#arguments-50 "Direct link to arguments-50")

* `<INPUT>`  XDR or file containing XDR to decode, or stdin if empty

###### **Options:**[](#options-97 "Direct link to options-97")

* `--input <INPUT_FORMAT>`

  Default value: `single-base64`

  Possible values: `single`, `single-base64`, `stream`, `stream-base64`, `stream-framed`
* `--output <OUTPUT_FORMAT>`

  Default value: `list`

  Possible values: `list`
* `--certainty <CERTAINTY>`  Certainty as an arbitrary value

  Default value: `2`

## `stellar xdr decode`[](#stellar-xdr-decode "Direct link to stellar-xdr-decode")

Decode XDR

**Usage:** `stellar xdr decode [OPTIONS] --type <TYPE> [INPUT]...`

###### **Arguments:**[](#arguments-51 "Direct link to arguments-51")

* `<INPUT>`  XDR or files containing XDR to decode, or stdin if empty

###### **Options:**[](#options-98 "Direct link to options-98")

* `--type <TYPE>`  XDR type to decode
* `--input <INPUT_FORMAT>`

  Default value: `stream-base64`

  Possible values: `single`, `single-base64`, `stream`, `stream-base64`, `stream-framed`
* `--output <OUTPUT_FORMAT>`

  Default value: `json`

  Possible values: `json`, `json-formatted`, `text`, `rust-debug`, `rust-debug-formatted`

## `stellar xdr encode`[](#stellar-xdr-encode "Direct link to stellar-xdr-encode")

Encode XDR

**Usage:** `stellar xdr encode [OPTIONS] --type <TYPE> [INPUT]...`

###### **Arguments:**[](#arguments-52 "Direct link to arguments-52")

* `<INPUT>`  XDR or files containing XDR to decode, or stdin if empty

###### **Options:**[](#options-99 "Direct link to options-99")

* `--type <TYPE>`  XDR type to encode
* `--input <INPUT_FORMAT>`

  Default value: `json`

  Possible values: `json`
* `--output <OUTPUT_FORMAT>`

  Default value: `single-base64`

  Possible values: `single`, `single-base64`, `stream`

## `stellar xdr compare`[](#stellar-xdr-compare "Direct link to stellar-xdr-compare")

Compare two XDR values with each other

Outputs: `-1` when the left XDR value is less than the right XDR value, `0` when the left XDR value is equal to the right XDR value, `1` when the left XDR value is greater than the right XDR value

**Usage:** `stellar xdr compare [OPTIONS] --type <TYPE> <LEFT> <RIGHT>`

###### **Arguments:**[](#arguments-53 "Direct link to arguments-53")

* `<LEFT>`  XDR file to decode and compare with the right value
* `<RIGHT>`  XDR file to decode and compare with the left value

###### **Options:**[](#options-100 "Direct link to options-100")

* `--type <TYPE>`  XDR type of both inputs
* `--input <INPUT>`

  Default value: `single-base64`

  Possible values: `single`, `single-base64`

## `stellar xdr generate`[](#stellar-xdr-generate "Direct link to stellar-xdr-generate")

Generate XDR values

**Usage:** `stellar xdr generate <COMMAND>`

###### **Subcommands:**[](#subcommands-21 "Direct link to subcommands-21")

* `default`  Generate default XDR values
* `arbitrary`  Generate arbitrary XDR values

## `stellar xdr generate default`[](#stellar-xdr-generate-default "Direct link to stellar-xdr-generate-default")

Generate default XDR values

**Usage:** `stellar xdr generate default [OPTIONS] --type <TYPE>`

###### **Options:**[](#options-101 "Direct link to options-101")

* `--type <TYPE>`  XDR type to generate
* `--output <OUTPUT_FORMAT>`

  Default value: `single-base64`

  Possible values: `single`, `single-base64`, `json`, `json-formatted`, `text`

## `stellar xdr generate arbitrary`[](#stellar-xdr-generate-arbitrary "Direct link to stellar-xdr-generate-arbitrary")

Generate arbitrary XDR values

**Usage:** `stellar xdr generate arbitrary [OPTIONS] --type <TYPE>`

###### **Options:**[](#options-102 "Direct link to options-102")

* `--type <TYPE>`  XDR type to generate
* `--output <OUTPUT_FORMAT>`

  Default value: `single-base64`

  Possible values: `single`, `single-base64`, `json`, `json-formatted`, `text`

## `stellar xdr version`[](#stellar-xdr-version "Direct link to stellar-xdr-version")

Print version information

**Usage:** `stellar xdr version`

## `stellar strkey`[](#stellar-strkey "Direct link to stellar-strkey")

Decode and encode strkey

**Usage:** `stellar strkey <COMMAND>`

###### **Subcommands:**[](#subcommands-22 "Direct link to subcommands-22")

* `decode`  Decode strkey
* `encode`  Encode strkey
* `zero`  Generate the zero strkey
* `version`  Print version information

## `stellar strkey decode`[](#stellar-strkey-decode "Direct link to stellar-strkey-decode")

Decode strkey

**Usage:** `stellar strkey decode <STRKEY>`

###### **Arguments:**[](#arguments-54 "Direct link to arguments-54")

* `<STRKEY>`  Strkey to decode

## `stellar strkey encode`[](#stellar-strkey-encode "Direct link to stellar-strkey-encode")

Encode strkey

**Usage:** `stellar strkey encode <JSON>`

###### **Arguments:**[](#arguments-55 "Direct link to arguments-55")

* `<JSON>`  JSON for Strkey to encode

## `stellar strkey zero`[](#stellar-strkey-zero "Direct link to stellar-strkey-zero")

Generate the zero strkey

**Usage:** `stellar strkey zero [OPTIONS] <STRKEY>`

###### **Arguments:**[](#arguments-56 "Direct link to arguments-56")

* `<STRKEY>`  Strkey type to generate the zero value for

  Possible values: `public_key_ed25519`, `pre_auth_tx`, `hash_x`, `muxed_account_ed25519`, `signed_payload_ed25519`, `contract`, `liquidity_pool`, `claimable_balance_v0`

###### **Options:**[](#options-103 "Direct link to options-103")

* `--output <OUTPUT>`  Output format

  Default value: `strkey`

  Possible values: `strkey`, `json`

## `stellar strkey version`[](#stellar-strkey-version "Direct link to stellar-strkey-version")

Print version information

**Usage:** `stellar strkey version`

## `stellar completion`[](#stellar-completion "Direct link to stellar-completion")

Print shell completion code for the specified shell

Ensure the completion package for your shell is installed, e.g. bash-completion for bash.

To enable autocomplete in the current bash shell, run: `source <(stellar completion --shell bash)`

To enable autocomplete permanently, run: `echo "source <(stellar completion --shell bash)" >> ~/.bashrc`

**Usage:** `stellar completion --shell <SHELL>`

###### **Options:**[](#options-104 "Direct link to options-104")

* `--shell <SHELL>`  The shell type

  Possible values: `bash`, `elvish`, `fish`, `powershell`, `zsh`

## `stellar cache`[](#stellar-cache "Direct link to stellar-cache")

Cache for transactions and contract specs

**Usage:** `stellar cache <COMMAND>`

###### **Subcommands:**[](#subcommands-23 "Direct link to subcommands-23")

* `clean`  Delete the cache
* `path`  Show the location of the cache
* `actionlog`  Access details about cached actions like transactions, and simulations. (Experimental. May see breaking changes at any time.)

## `stellar cache clean`[](#stellar-cache-clean "Direct link to stellar-cache-clean")

Delete the cache

**Usage:** `stellar cache clean`

## `stellar cache path`[](#stellar-cache-path "Direct link to stellar-cache-path")

Show the location of the cache

**Usage:** `stellar cache path`

## `stellar cache actionlog`[](#stellar-cache-actionlog "Direct link to stellar-cache-actionlog")

Access details about cached actions like transactions, and simulations. (Experimental. May see breaking changes at any time.)

**Usage:** `stellar cache actionlog <COMMAND>`

###### **Subcommands:**[](#subcommands-24 "Direct link to subcommands-24")

* `ls`  List cached actions (transactions, simulations)
* `read`  Read cached action

## `stellar cache actionlog ls`[](#stellar-cache-actionlog-ls "Direct link to stellar-cache-actionlog-ls")

List cached actions (transactions, simulations)

**Usage:** `stellar cache actionlog ls [OPTIONS]`

###### **Options:**[](#options-105 "Direct link to options-105")

* `-l`, `--long`

###### **Options (Global):**[](#options-global-94 "Direct link to options-global-94")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

## `stellar cache actionlog read`[](#stellar-cache-actionlog-read "Direct link to stellar-cache-actionlog-read")

Read cached action

**Usage:** `stellar cache actionlog read --id <ID>`

###### **Options:**[](#options-106 "Direct link to options-106")

* `--id <ID>`  ID of the cache entry

## `stellar version`[](#stellar-version "Direct link to stellar-version")

Print version information

**Usage:** `stellar version [OPTIONS]`

###### **Options:**[](#options-107 "Direct link to options-107")

* `--only-version`  Print only the version
* `--only-version-major`  Print only the major version

## `stellar plugin`[](#stellar-plugin "Direct link to stellar-plugin")

The subcommand for CLI plugins

**Usage:** `stellar plugin <COMMAND>`

###### **Subcommands:**[](#subcommands-25 "Direct link to subcommands-25")

* `search`  Search for CLI plugins using GitHub
* `ls`  List installed plugins

## `stellar plugin search`[](#stellar-plugin-search "Direct link to stellar-plugin-search")

Search for CLI plugins using GitHub

**Usage:** `stellar plugin search`

## `stellar plugin ls`[](#stellar-plugin-ls "Direct link to stellar-plugin-ls")

List installed plugins

**Usage:** `stellar plugin ls`

## `stellar ledger`[](#stellar-ledger "Direct link to stellar-ledger")

Fetch ledger information

**Usage:** `stellar ledger <COMMAND>`

###### **Subcommands:**[](#subcommands-26 "Direct link to subcommands-26")

* `entry`  Work with ledger entries
* `latest`  Get the latest ledger sequence and information from the network
* `fetch` 

## `stellar ledger entry`[](#stellar-ledger-entry "Direct link to stellar-ledger-entry")

Work with ledger entries

**Usage:** `stellar ledger entry <COMMAND>`

###### **Subcommands:**[](#subcommands-27 "Direct link to subcommands-27")

* `fetch`  Fetch ledger entries. This command supports all types of ledger entries supported by the RPC. Read more about the RPC command here: <../data/apis/rpc/api-reference/methods/getLedgerEntries#types-of-ledgerkeys>

## `stellar ledger entry fetch`[](#stellar-ledger-entry-fetch "Direct link to stellar-ledger-entry-fetch")

Fetch ledger entries. This command supports all types of ledger entries supported by the RPC. Read more about the RPC command here: <../data/apis/rpc/api-reference/methods/getLedgerEntries#types-of-ledgerkeys>

**Usage:** `stellar ledger entry fetch <COMMAND>`

###### **Subcommands:**[](#subcommands-28 "Direct link to subcommands-28")

* `account`  Fetch account entry by public key or alias
* `contract-data`  Fetch contract ledger entry by address or alias and storage key
* `claimable-balance`  Fetch a claimable balance ledger entry by id
* `liquidity-pool`  Fetch a liquidity pool ledger entry by id
* `contract-code`  Fetch a Contract's WASM bytecode by WASM hash
* `trustline`  Fetch a trustline by account and asset
* `data`  Fetch key-value data entries attached to an account (see manageDataOp)
* `offer`  Fetch an offer by account and offer id

## `stellar ledger entry fetch account`[](#stellar-ledger-entry-fetch-account "Direct link to stellar-ledger-entry-fetch-account")

Fetch account entry by public key or alias

**Usage:** `stellar ledger entry fetch account [OPTIONS] --account <ACCOUNT>`

###### **Options:**[](#options-108 "Direct link to options-108")

* `--account <ACCOUNT>`  Account alias or address to lookup
* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `json`: JSON output of the ledger entry with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of the ledger entry with parsed XDRs
  + `xdr`: Original RPC output (containing XDRs)
* `--hd-path <HD_PATH>`  If identity is a seed phrase use this hd path, default is 0

###### **Options (Global):**[](#options-global-95 "Direct link to options-global-95")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-82 "Direct link to options-rpc-82")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar ledger entry fetch contract-data`[](#stellar-ledger-entry-fetch-contract-data "Direct link to stellar-ledger-entry-fetch-contract-data")

Fetch contract ledger entry by address or alias and storage key

**Usage:** `stellar ledger entry fetch contract-data [OPTIONS] --contract <CONTRACT>`

###### **Options:**[](#options-109 "Direct link to options-109")

* `--contract <CONTRACT>`  Contract alias or address to fetch
* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `json`: JSON output of the ledger entry with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of the ledger entry with parsed XDRs
  + `xdr`: Original RPC output (containing XDRs)
* `--durability <DURABILITY>`  Storage entry durability

  Default value: `persistent`

  Possible values:

  + `persistent`: Persistent
  + `temporary`: Temporary
* `--key <KEY>`  Storage key (symbols only)
* `--key-xdr <KEY_XDR>`  Storage key (base64-encoded XDR)
* `--instance`  If the contract instance ledger entry should be included in the output

###### **Options (Global):**[](#options-global-96 "Direct link to options-global-96")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-83 "Direct link to options-rpc-83")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar ledger entry fetch claimable-balance`[](#stellar-ledger-entry-fetch-claimable-balance "Direct link to stellar-ledger-entry-fetch-claimable-balance")

Fetch a claimable balance ledger entry by id

**Usage:** `stellar ledger entry fetch claimable-balance [OPTIONS]`

###### **Options:**[](#options-110 "Direct link to options-110")

* `--id <ID>`  Claimable Balance Ids to fetch an entry for
* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `json`: JSON output of the ledger entry with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of the ledger entry with parsed XDRs
  + `xdr`: Original RPC output (containing XDRs)

###### **Options (Global):**[](#options-global-97 "Direct link to options-global-97")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-84 "Direct link to options-rpc-84")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar ledger entry fetch liquidity-pool`[](#stellar-ledger-entry-fetch-liquidity-pool "Direct link to stellar-ledger-entry-fetch-liquidity-pool")

Fetch a liquidity pool ledger entry by id

**Usage:** `stellar ledger entry fetch liquidity-pool [OPTIONS]`

###### **Options:**[](#options-111 "Direct link to options-111")

* `--id <ID>`  Liquidity pool ids
* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `json`: JSON output of the ledger entry with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of the ledger entry with parsed XDRs
  + `xdr`: Original RPC output (containing XDRs)

###### **Options (Global):**[](#options-global-98 "Direct link to options-global-98")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-85 "Direct link to options-rpc-85")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar ledger entry fetch contract-code`[](#stellar-ledger-entry-fetch-contract-code "Direct link to stellar-ledger-entry-fetch-contract-code")

Fetch a Contract's WASM bytecode by WASM hash

**Usage:** `stellar ledger entry fetch contract-code [OPTIONS]`

###### **Options:**[](#options-112 "Direct link to options-112")

* `--wasm-hash <WASM_HASH>`  Get WASM bytecode by hash
* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `json`: JSON output of the ledger entry with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of the ledger entry with parsed XDRs
  + `xdr`: Original RPC output (containing XDRs)

###### **Options (Global):**[](#options-global-99 "Direct link to options-global-99")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-86 "Direct link to options-rpc-86")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar ledger entry fetch trustline`[](#stellar-ledger-entry-fetch-trustline "Direct link to stellar-ledger-entry-fetch-trustline")

Fetch a trustline by account and asset

**Usage:** `stellar ledger entry fetch trustline [OPTIONS] --account <ACCOUNT> --asset <ASSET>`

###### **Options:**[](#options-113 "Direct link to options-113")

* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `json`: JSON output of the ledger entry with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of the ledger entry with parsed XDRs
  + `xdr`: Original RPC output (containing XDRs)
* `--account <ACCOUNT>`  Account alias or address to lookup
* `--asset <ASSET>`  Assets to get trustline info for
* `--hd-path <HD_PATH>`  If account is a seed phrase use this hd path, default is 0

###### **Options (Global):**[](#options-global-100 "Direct link to options-global-100")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-87 "Direct link to options-rpc-87")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar ledger entry fetch data`[](#stellar-ledger-entry-fetch-data "Direct link to stellar-ledger-entry-fetch-data")

Fetch key-value data entries attached to an account (see manageDataOp)

**Usage:** `stellar ledger entry fetch data [OPTIONS] --account <ACCOUNT> --data-name <DATA_NAME>`

###### **Options:**[](#options-114 "Direct link to options-114")

* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `json`: JSON output of the ledger entry with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of the ledger entry with parsed XDRs
  + `xdr`: Original RPC output (containing XDRs)
* `--account <ACCOUNT>`  Account alias or address to lookup
* `--data-name <DATA_NAME>`  Fetch key-value data entries attached to an account (see manageDataOp)
* `--hd-path <HD_PATH>`  If identity is a seed phrase use this hd path, default is 0

###### **Options (Global):**[](#options-global-101 "Direct link to options-global-101")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-88 "Direct link to options-rpc-88")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar ledger entry fetch offer`[](#stellar-ledger-entry-fetch-offer "Direct link to stellar-ledger-entry-fetch-offer")

Fetch an offer by account and offer id

**Usage:** `stellar ledger entry fetch offer [OPTIONS] --account <ACCOUNT> --offer <OFFER>`

###### **Options:**[](#options-115 "Direct link to options-115")

* `--output <OUTPUT>`  Format of the output

  Default value: `json`

  Possible values:

  + `json`: JSON output of the ledger entry with parsed XDRs (one line, not formatted)
  + `json-formatted`: Formatted (multiline) JSON output of the ledger entry with parsed XDRs
  + `xdr`: Original RPC output (containing XDRs)
* `--account <ACCOUNT>`  Account alias or address to lookup
* `--offer <OFFER>`  ID of an offer made on the Stellar DEX
* `--hd-path <HD_PATH>`  If identity is a seed phrase use this hd path, default is 0

###### **Options (Global):**[](#options-global-102 "Direct link to options-global-102")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-89 "Direct link to options-rpc-89")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar ledger latest`[](#stellar-ledger-latest "Direct link to stellar-ledger-latest")

Get the latest ledger sequence and information from the network

**Usage:** `stellar ledger latest [OPTIONS]`

###### **Options:**[](#options-116 "Direct link to options-116")

* `--output <OUTPUT>`  Format of the output

  Default value: `text`

  Possible values:

  + `text`: Text output of network info
  + `json`: JSON result of the RPC request
  + `json-formatted`: Formatted (multiline) JSON output of the RPC request

###### **Options (RPC):**[](#options-rpc-90 "Direct link to options-rpc-90")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar ledger fetch`[](#stellar-ledger-fetch "Direct link to stellar-ledger-fetch")

**Usage:** `stellar ledger fetch [OPTIONS] <SEQ>`

###### **Arguments:**[](#arguments-57 "Direct link to arguments-57")

* `<SEQ>`  Ledger Sequence to start fetch (inclusive)

###### **Options:**[](#options-117 "Direct link to options-117")

* `--limit <LIMIT>`  Number of ledgers to fetch

  Default value: `1`
* `--output <OUTPUT>`  Format of the output

  Default value: `text`

  Possible values:

  + `text`: Text output of network info
  + `json`: JSON result of the RPC request
  + `json-formatted`: Formatted (multiline) JSON output of the RPC request
* `--xdr-format <XDR_FORMAT>`  Format of the xdr in the output

  Default value: `json`

  Possible values:

  + `json`: XDR fields will be fetched as json and accessible via the headerJson and metadataJson fields
  + `xdr`: XDR fields will be fetched as xdr and accessible via the headerXdr and metadataXdr fields

###### **Options (RPC):**[](#options-rpc-91 "Direct link to options-rpc-91")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar fee-stats`[](#stellar-fee-stats "Direct link to stellar-fee-stats")

 ï¸ Deprecated, use `fees stats` instead. Fetch network feestats

**Usage:** `stellar fee-stats [OPTIONS]`

###### **Options:**[](#options-118 "Direct link to options-118")

* `--output <OUTPUT>`  Format of the output

  Default value: `text`

  Possible values:

  + `text`: Text output of network info
  + `json`: JSON result of the RPC request
  + `json-formatted`: Formatted (multiline) JSON output of the RPC request

###### **Options (RPC):**[](#options-rpc-92 "Direct link to options-rpc-92")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar fees`[](#stellar-fees "Direct link to stellar-fees")

Fetch network feestats and configure CLI fee settings

**Usage:** `stellar fees <COMMAND>`

###### **Subcommands:**[](#subcommands-29 "Direct link to subcommands-29")

* `stats`  Fetch the feestats from the network
* `use`  Set the default inclusion fee settings for the CLI
* `unset`  Remove the default inclusion fee settings for the CLI

## `stellar fees stats`[](#stellar-fees-stats "Direct link to stellar-fees-stats")

Fetch the feestats from the network

**Usage:** `stellar fees stats [OPTIONS]`

###### **Options:**[](#options-119 "Direct link to options-119")

* `--output <OUTPUT>`  Format of the output

  Default value: `text`

  Possible values:

  + `text`: Text output of network info
  + `json`: JSON result of the RPC request
  + `json-formatted`: Formatted (multiline) JSON output of the RPC request

###### **Options (RPC):**[](#options-rpc-93 "Direct link to options-rpc-93")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar fees use`[](#stellar-fees-use "Direct link to stellar-fees-use")

Set the default inclusion fee settings for the CLI

**Usage:** `stellar fees use [OPTIONS] <--amount <AMOUNT>|--fee-metric <FEE_METRIC>>`

###### **Options:**[](#options-120 "Direct link to options-120")

* `--amount <AMOUNT>`  Set the default inclusion fee amount, in stroops. 1 stroop = 0.0000001 xlm
* `--fee-metric <FEE_METRIC>`  Set the default inclusion fee based on a metric from the network's fee stats

  Possible values: `max`, `min`, `mode`, `p10`, `p20`, `p30`, `p40`, `p50`, `p60`, `p70`, `p80`, `p90`, `p95`, `p99`

###### **Options (Global):**[](#options-global-103 "Direct link to options-global-103")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings

###### **Options (RPC):**[](#options-rpc-94 "Direct link to options-rpc-94")

* `--rpc-url <RPC_URL>`  RPC server endpoint
* `--rpc-header <RPC_HEADERS>`  RPC Header(s) to include in requests to the RPC provider, example: "X-API-Key: abc123". Multiple headers can be added by passing the option multiple times
* `--network-passphrase <NETWORK_PASSPHRASE>`  Network passphrase to sign the transaction sent to the rpc server
* `-n`, `--network <NETWORK>`  Name of network to use from config

## `stellar fees unset`[](#stellar-fees-unset "Direct link to stellar-fees-unset")

Remove the default inclusion fee settings for the CLI

**Usage:** `stellar fees unset [OPTIONS]`

###### **Options (Global):**[](#options-global-104 "Direct link to options-global-104")

* `--global`   ï¸ Deprecated: global config is always on
* `--config-dir <CONFIG_DIR>`  Location of config directory. By default, it uses `$XDG_CONFIG_HOME/stellar` if set, falling back to `~/.config/stellar` otherwise. Contains configuration files, aliases, and other persistent settings