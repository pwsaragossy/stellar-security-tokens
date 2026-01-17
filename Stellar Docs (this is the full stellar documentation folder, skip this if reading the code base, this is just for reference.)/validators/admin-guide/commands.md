# Commands

Stellar Core can be controlled using a robust CLI.

> **Info:** We will cover a selection of the *essential* commands and syntax here, but the **very best resource** for utilizing the `stellar-core` command line is located in the [stellar-core GitHub repo](https://github.com/stellar/stellar-core/blob/master/docs/software/commands.md).

Additionally, while the commands on this page are *CLI* commands, there is an additional set of [*HTTP* endpoint commands](https://github.com/stellar/stellar-core/blob/master/docs/software/commands.md#http-commands) that provide further administrative control over a running core node.

## Get `--help` Anywhere[](#get---help-anywhere "Direct link to get---help-anywhere")

The `--help` (aliases: `-h` or `-?`) option can be specified at *any place* in the command line. It will show you the help message for the relevant command. Some example useage is as follows:

```
sudo -u stellar stellar-core --conf /etc/stellar/stellar-core.cfg --help  
sudo -u stellar stellar-core --conf /etc/stellar/stellar-core.cfg run --help  
sudo -u stellar stellar-core --conf /etc/stellar/stellar-core.cfg --help new-db  
sudo -u stellar stellar-core --conf /etc/stellar/stellar-core.cfg catchup --help
```

## Essential Commands[](#essential-commands "Direct link to Essential Commands")

For all stellar-core commands, options can *only* by placed after the command.

### `new-db`[](#new-db "Direct link to new-db")

The **`new-db`** command creates or restores the local database to the genesis ledger.

#### `new-db` Options[](#new-db-options "Direct link to new-db-options")

* `--minimal-for-in-memory-mode`: Reset the special database used only for in-memory mode. (see the `--in-memory` flag in [`run` options](#run-options))

### `run`[](#run "Direct link to run")

The **`run`** command will run the `stellar-core` node.

#### `run` Options[](#run-options "Direct link to run-options")

* `--disable-bucket-gc`: Keeps all, even old, buckets on disk.
* `--metadata-output-stream <STREAM>`: Filename or file-descriptor number `fd:N` to stream metadata to.
* `--wait-for-consensus`: Wait to hear from the network before voting, for validating nodes only.

Certain features, such as `in-memory` mode options, have been deprecated, so they aren't listed here.

### `catchup`[](#catchup "Direct link to catchup")

The **`catchup`** command will execute a catchup from history archives without connecting to the network.

#### `catchup` Options[](#catchup-options "Direct link to catchup-options")

* `<DESTINATION_LEDGER/LEDGER_COUNT>`: (required) Destination ledger is any valid number or `current` and ledger count is any valid number or `max`.
* `--archive <ARCHIVE-NAME>`: Archive name to be used for catchup. Use `any` to select randomly.
* `--trusted-checkpoint-hashes <FILE-NAME>`: Get destination ledger hash from trusted output of `verify-checkpoints`.
* `--output-file <FILE-NAME>`: Output file.
* `--disable-bucket-gc`: Keeps all, even old, buckets on disk.
* `--extra-verification`: Verify all files from the archive for the catchup range.
* `--trusted-hash <HASH>`: Hash of the ledger to catchup to.
* `--force-untrusted-catchup`: Force unverified catchup.
* `--metadata-output-stream <STREAM>`: Filename or file-descriptor number `fd:N` to stream metadata to.
* `--force-back`: Force ledger state to a previous state, preserving older historical data.

> **Info:** To reiterate, this page covers a selection of the *essential* commands, but we've only scratched the surface. The **very best, most comprehensive resource** for utilizing the `stellar-core` command line is located in the [stellar-core GitHub repo](https://github.com/stellar/stellar-core/blob/master/docs/software/commands.md).