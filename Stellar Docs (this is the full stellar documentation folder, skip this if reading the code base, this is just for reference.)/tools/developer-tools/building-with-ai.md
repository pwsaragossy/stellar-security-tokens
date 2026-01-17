# Building with AI

Stellar provides resources to help AI assistants and Large Language Models (LLMs) understand our documentation, making it easier for you to get accurate answers about Stellar development.

## Using llms.txt[](#using-llmstxt "Direct link to Using llms.txt")

[`llms.txt`](https://developers.stellar.org/llms.txt) is a standardized way to provide documentation context to AI systems. This file contains a structured overview of Stellar's developer documentation optimized for LLM consumption.

When you ask an AI assistant about Stellar, it can reference this file to:

* Understand the structure of our documentation
* Find relevant pages for your questions
* Provide more accurate, up-to-date answers

## Using with AI assistants[](#using-with-ai-assistants "Direct link to Using with AI assistants")

### ChatGPT, Claude, and other LLMs[](#chatgpt-claude-and-other-llms "Direct link to ChatGPT, Claude, and other LLMs")

You can paste the contents of `llms.txt` into your conversation to give the AI context about Stellar:

```
Please read this documentation overview and help me with Stellar development:  
[paste contents of https://developers.stellar.org/llms.txt]
```

### AI-powered coding assistants[](#ai-powered-coding-assistants "Direct link to AI-powered coding assistants")

Tools like GitHub Copilot, Cursor, Claude or Gemini can benefit from having `llms.txt` in your project context when working on Stellar-related code.

#### Cursor[](#cursor "Direct link to Cursor")

You can provide Cursor with Stellar development context in two ways:

**Option 1: Using Cursor Settings**

1. Open **Cursor Settings** (the gear icon in the sidebar)
2. Navigate to **Rules** (under the **Features** section)
3. Click **Add Rule**
4. Add your Stellar development guidelines and save

**Option 2: Using a `.cursorrules` file**

Create a `.cursorrules` file in your project root:

.cursorrules

```
When developing on Stellar, refer to the official documentation at https://developers.stellar.org  
  
For comprehensive documentation context, fetch and reference: https://developers.stellar.org/llms.txt  
  
Key resources:  
- Smart Contracts: ../build/smart-contracts  
- Stellar CLI: ../tools/cli  
- SDKs: ../tools/sdks
```

The Settings approach applies rules globally across all projects, while `.cursorrules` files are project-specific.

#### ChatGPT[](#chatgpt "Direct link to ChatGPT")

ChatGPT offers two ways to provide persistent context:

* **Custom Instructions**: Go to Settings  Personalization  Custom Instructions to add information about yourself and how you'd like ChatGPT to respond. You can include that you're a Stellar developer and prefer references to official documentation.
* **Custom GPTs**: Create a custom GPT with Stellar documentation context built in. You can configure it to reference `llms.txt` and provide specialized Stellar development assistance.

#### Claude[](#claude "Direct link to Claude")

Claude provides context customization through:

* **Projects**: Create a project and add custom instructions along with knowledge files. You can upload relevant documentation or add instructions to always reference the Stellar docs.
* **Memory**: Claude can remember details from past conversations. You can ask Claude to remember that you're working on Stellar development, and it will retain this context across sessions.

#### Gemini[](#gemini "Direct link to Gemini")

Google's Gemini offers context customization through:

* **Gems**: Create custom Gems (specialized AI assistants) with specific instructions for Stellar development. Go to the Gems section in Gemini and create a new Gem with your Stellar context and guidelines.
* **Saved Info**: In Gemini settings, you can add saved information about yourself, including that you're a Stellar developer, which Gemini will reference in future conversations.

### Custom AI applications[](#custom-ai-applications "Direct link to Custom AI applications")

If you're building an AI application that answers questions about Stellar, you can fetch and include `llms.txt` in your prompt context:

```
const response = await fetch("https://developers.stellar.org/llms.txt");  
const stellarContext = await response.text();  
  
// Include stellarContext in your LLM prompt
```

## Stella: Your Stellar AI Assistant[](#stella-your-stellar-ai-assistant "Direct link to Stella: Your Stellar AI Assistant")

In addition to `llms.txt`, Stellar provides [Stella](../tools/developer-tools/ai-bot), an AI assistant specifically trained on Stellar documentation, code examples, and community knowledge.

Stella can help you with:

* Smart contract development questions
* Understanding Stellar concepts
* Debugging and troubleshooting
* Finding relevant documentation

You can chat with Stella right here by clicking the yellow icon at the bottom of this page, or join the `#stella-help` channel in the [Stellar Developer Discord](https://discord.gg/stellardev).

## Additional resources[](#additional-resources "Direct link to Additional resources")

* [Stella AI Bot](../tools/developer-tools/ai-bot) - Stellar's built-in AI assistant
* [Stellar Developer Discord](https://discord.gg/stellardev) - Ask questions in #stella-help