# Install the Stellar CLI

### Stellar CLI[](#stellar-cli "Direct link to Stellar CLI")

There are a few ways to install the latest released version of Stellar CLI.

Install with script (macOS, Linux):

```
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh
```

Install with Homebrew (macOS, Linux):

```
brew install stellar-cli
```

Install with winget (Windows):

```
winget install --id Stellar.StellarCLI
```

Install with cargo from source ([github.com/stellar/stellar-cli](https://github.com/stellar/stellar-cli)):

```
cargo install --locked stellar-cli
```

> **Note:** Installing from source requires Rust and C build systems.

To install Rust, see:

* <https://www.rust-lang.org/tools/install>

To install a C build system on Debian/Ubuntu, use:

```
sudo apt update && sudo apt install -y build-essential
```

Install in your GitHub action (this is a preferred option of installing cli in your GitHub actions)

```
uses: stellar/stellar-[email protected]
```

> **Note:** You can also use the third-party tool [SVM (Stellar Version Manager)](https://www.npmjs.com/package/svm-cli), a version manager for Stellar CLI that allows you to install and switch between different versions of stellar-cli.

## Set up Autocomplete[](#set-up-autocomplete "Direct link to Set up Autocomplete")

The Stellar CLI supports some autocompletion. To set up, run the following commands:

```
stellar completion --shell <SHELL>
```

Possible SHELL values are `bash`, `elvish`, `fish`, `powershell`, `zsh`, etc.

To enable autocomplete in the current bash shell, run:

```
source <(stellar completion --shell bash)
```

To enable autocomplete permanently, run:

```
echo "source <(stellar completion --shell bash)" >> ~/.bashrc
```

## Stellar CLI Cookbook[](#stellar-cli-cookbook "Direct link to Stellar CLI Cookbook")

To understand how to get the most of the Stellar CLI, see the [Stellar CLI Cookbook](/docs/tools/cli/cookbook.md) for recipes and a collection of resources to teach you how to use the CLI. Examples of recipes included in the CLI cookbook include: send payments, manage contract lifecycle, extend contract instance/storage/wasm, and more.

## Video Tutorials[](#video-tutorials "Direct link to Video Tutorials")

* Video Tutorial on `network container`, `keys`, and `contract init` from the [2024-06-27 developers meeting](/meetings/2024/06/27)
* Video Tutorial on `alias` and `snapshot` from the [2024-09-12 developers meeting](/meetings/2024/09/12)