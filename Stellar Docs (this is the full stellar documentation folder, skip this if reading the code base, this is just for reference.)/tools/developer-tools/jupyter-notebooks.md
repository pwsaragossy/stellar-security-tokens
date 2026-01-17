# Jupyter Notebooks

Jupyter Notebooks are a document format that can include code, text, and other rich output. And with the appropriate setup they support Soroban Rust contracts.

To use Soroban contracts in a Jupyter Notebook, the following setup is required. The following setup uses Visual Studio Code, but any Jupyter client and server can be used.

> **Caution:** Rust support in Jupyter Notebooks is experimental. You might run into bugs, or unexpected behavior.

## Getting Started[](#getting-started "Direct link to Getting Started")

1. Install [Visual Studio Code](https://code.visualstudio.com) (VSCode)
2. Install the [Jupyter Notebook extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) in VSCode
3. Install the `evcxr` Rust Jupyter kernel with:

   ```
   cargo install --locked evcxr_jupyter  
   evcxr_jupyter --install
   ```
4. Run the `Create: New Jupyter Notebook` command in VSCode
5. Click the `Select Kernel` button in the top right
6. Select `Jupyter Kernel...`
7. Select `Rust` by searching for Rust
8. Enter on the first line an import of the `soroban-sdk` dependency with the `testutils` feature enabled.

   ```
   :dep soroban-sdk = { version = "22.0.7", features = ["testutils"] }
   ```
9. Enter a contract. For example:

   ```
   use soroban_sdk::{contract, contractimpl};  
     
   #[contract]  
   pub struct Contract;  
     
   #[contractimpl]  
   impl Contract {  
       pub fn add(x: u32, y: u32) -> u32 {  
           x+y  
       }  
   }
   ```
10. Enter some code to create a Soroban environment, register the contract, and invoke it.

```
use soroban_sdk::{Env};  
  
let env = Env::default();  
let id = env.register(Contract, ());  
let client: ContractClient = ContractClient::new(&env, &id);  
client.add(&1, &2)
```

11. Click the play button to run the code.

Congratulations you have a Jupyter Notebook with contract code that should look something like the screenshot below, ready for hacking and experimenting.

## Screenshot[](#screenshot "Direct link to Screenshot")

![A running Jupyter notebook](/assets/images/jupyter-notebooks-7491393fd8baeb1caf289dbf42af9c7f.png)

## Community[](#community "Direct link to Community")

Have ideas for how to improve Soroban contracts in Jupyter Notebooks? Join the community on [Discord](https://discord.com/channels/897514728459468821/1263811925813366794).