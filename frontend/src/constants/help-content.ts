/**
 * Centralized Help Content for Admin Pages
 *
 * Guidelines:
 * - Max 2-3 sentences per tooltip
 * - Never restate the title
 * - Lead with consequence or calculation, not definition
 * - For destructive actions: state what CAN'T be undone
 */

export const HELP_CONTENT = {
    // ========================================
    // USER MANAGEMENT PAGE
    // ========================================
    userManagement: {
        kycStatus: {
            title: "KYC Status",
            content: `Review submitted identity documents (government ID, proof of residence). Approve to grant access to token offerings, or reject with a specific reason so the investor can resubmit. Rejected investors can reapply with corrected documents.`,
        },
        approveButton: {
            title: "Approve Investor",
            content: `Activates the account, sponsors their smart wallet trustlines (costs ~0.5 XLM from Treasury), and unlocks access to all active offerings. The investor is notified immediately. Cannot be reversed without manual admin intervention.`,
        },
        rejectButton: {
            title: "Reject Investor",
            content: `Blocks access to all offerings and notifies the investor via email. Always provide a specific reason (e.g. "ID expired") so they can fix and reapply. Not permanent — they can submit a new application.`,
        },
        sponsorTrustline: {
            title: "Sponsor Trustline",
            content: `Pays ~0.5 XLM from Treasury so the investor can hold a specific token without needing their own XLM. Usually automatic during approval — use this for tokens added after the investor was already approved.`,
        },
        walletAddress: {
            title: "Wallet Address",
            content: `This is a Soroban smart wallet (starts with "C..."), not a classic Stellar address. Investors control it via passkeys. Note: not all exchanges support sending directly to contract addresses — use the platform's deposit relay instead.`,
        },
        viewDetailsModal: {
            title: "Investor Details",
            content: `Real-time view of wallet balances (from Stellar RPC), transaction history, and active investments. Balances may have slight delays during network congestion. Only shows platform-mediated transactions, not direct P2P transfers.`,
        },
    },

    // ========================================
    // COMPANIES PAGE
    // ========================================
    companies: {
        companyStatus: {
            title: "Company Status",
            content: `Pending → Approved → Active (issued at least one token). Suspended companies can't create new offerings but existing token obligations remain valid. Only "approved" or "active" companies can issue tokens.`,
        },
        approveCompany: {
            title: "Approve Company",
            content: `Verifies their legal entity, creates and sponsors their issuer wallet (costs ~2-5 XLM from Treasury), and unlocks token issuance. Once active, a company cannot be "unapproved" — use Suspend for compliance issues.`,
        },
        walletSponsorship: {
            title: "Wallet Sponsorship",
            content: `Creates the company's Stellar issuer wallet and sponsors all base reserves. Automatic during approval. Manual sponsorship is only needed to fix wallet issues. Wallet addresses are permanent and can't be changed.`,
        },
        activeOffersCount: {
            title: "Active Offers",
            content: `Number of offerings currently open for investment. Doesn't include drafts, completed, or cancelled offers. Zero doesn't mean inactive — they may have completed offerings with ongoing obligations.`,
        },
        totalInvestments: {
            title: "Total Investments",
            content: `All-time gross USDC raised across every offering (active + completed). Platform fees are deducted separately. This number only goes up — it doesn't decrease when investors sell tokens on secondary markets.`,
        },
        cnpjField: {
            title: "CNPJ (Brazilian Tax ID)",
            content: `14-digit federal tax ID (XX.XXX.XXX/XXXX-XX). Cross-reference with Receita Federal to confirm active status before approving. A suspended or cancelled CNPJ cannot issue tokens.`,
        },
    },

    // ========================================
    // TOKENS PAGE
    // ========================================
    tokens: {
        tokenStatus: {
            title: "Token Status (Locked/Unlocked)",
            content: `Locked (🔒): only platform-approved wallets can hold or transfer tokens. Unlocked (🔓): anyone can trade freely. ⚠️ Unlocking is IRREVERSIBLE — the platform permanently loses transfer control. Coordinate with legal counsel first.`,
        },
        unlockButton: {
            title: "Unlock Token",
            content: `⚠️ THIS CANNOT BE UNDONE. Removes all transfer restrictions — anyone can send and receive this token without platform approval. Only use after distribution is complete AND offering terms explicitly permit open secondary trading.`,
        },
        supplyVsCirculating: {
            title: "Supply vs Circulating",
            content: `Total Supply = all tokens minted. Circulating = tokens already in investor wallets. The difference sits in the Distributor wallet awaiting assignment. If circulating exceeds 90% of total, the offering is nearly fully subscribed.`,
        },
        issuerCompany: {
            title: "Issuer Company",
            content: `The company legally responsible for this token. Click to view their full profile. Cannot be changed after creation — legal ownership is permanent. Multiple tokens from the same issuer share one company wallet.`,
        },
        stellarAssetCode: {
            title: "Stellar Asset Code",
            content: `Up to 12 characters (A-Z, 0-9), case-sensitive. Combined with the issuer address, it creates a unique Stellar asset. "REAL001" and "real001" are different tokens. Permanent — cannot be renamed after creation.`,
        },
        distributionControls: {
            title: "Distribution Controls",
            content: `Transfers tokens from the Distributor wallet to investors who've completed payment. Calculates quantities automatically (USDC paid ÷ token price). ⚠️ Irreversible — tokens can't be recalled after distribution (use clawback separately if needed).`,
        },
    },

    // ========================================
    // OFFERS PAGE
    // ========================================
    offers: {
        offerStatus: {
            title: "Offer Status Flow",
            content: `Draft → Pending (submitted for review) → Approved → Active (accepting investments) → Completed. Only "active" offers are visible to investors and accept funds. Completed offers can't accept new investments but token obligations persist.`,
        },
        approveOffer: {
            title: "Approve Offer",
            content: `Makes the offering live and visible to all approved investors. Before approving: verify IPFS documents are accessible, token economics are correct, and CNPJ is active. Once approved, offering terms can't be modified — would need a new offer.`,
        },
        legalDocuments: {
            title: "Legal Documents (IPFS)",
            content: `Documents are stored permanently on IPFS — they can't be edited or deleted after upload. Verify links work and content matches the offering description before approving. These hashes are also published in the Stellar TOML for public verification.`,
        },
        amountToRaise: {
            title: "Amount to Raise",
            content: `Target capital = token price × total supply. This is a target, not necessarily a hard cap. Some offerings close early when fully subscribed; others run to deadline. Partial raises are valid — companies receive whatever capital was raised.`,
        },
    },

    // ========================================
    // TRANSACTIONS PAGE
    // ========================================
    transactions: {
        transactionTypes: {
            title: "Transaction Types",
            content: `Investment = investor sends USDC. Distribution = platform sends tokens after payment. Sponsorship = platform sponsors wallets/trustlines (debits Treasury XLM). Fee Collection = platform collects service fees. Distributions are irreversible once confirmed.`,
        },
        transactionStatus: {
            title: "Transaction Status",
            content: `Pending = submitted, awaiting ledger confirmation (usually 5-10 seconds). Confirmed = permanent and immutable. Failed = rejected by network (insufficient balance, invalid trustline, etc.) — safe to retry. If pending > 1 minute, check Horizon/RPC connectivity.`,
        },
        blockchainExplorer: {
            title: "Blockchain Explorer Link",
            content: `Opens Stellar Expert to independently verify this transaction on-chain. If the platform database conflicts with the blockchain, the blockchain is the source of truth. Explorer shows all operations including sponsorships not visible in this UI.`,
        },
    },

    // ========================================
    // WALLETS PAGE
    // ========================================
    wallets: {
        treasuryWallet: {
            title: "Treasury Wallet",
            content: `Holds the platform's XLM reserves for sponsoring wallets and paying network fees. If it runs out, no new investors can onboard. Monitor daily and refill when below your operational threshold. Balance is publicly visible on Stellar Expert.`,
        },
        distributorWallet: {
            title: "Distributor Wallet",
            content: `Staging area for freshly minted tokens before they're distributed to investors. Should only hold tokens awaiting distribution — zero balance after a completed offering is normal. If it runs out during an active offering, the issuer needs to mint more tokens.`,
        },
        feeCollectorWallet: {
            title: "Fee Collector Wallet",
            content: `Receives all platform fees (issuance + trades) in USDC automatically. This balance = gross platform revenue before operating costs. Missing fees may indicate a configuration error or bypassed workflow.`,
        },
        xlmVsUsdc: {
            title: "XLM vs USDC Balances",
            content: `XLM = native currency for network fees and sponsorships (volatile price). USDC = stablecoin for investments and revenue ($1 ≈ 1 USDC). They are NOT interchangeable — sending the wrong one will fail. Keep Treasury funded with XLM even if USDC revenue is high.`,
        },
    },

    // ========================================
    // FEE CONFIG PAGE
    // ========================================
    feeConfig: {
        issuanceFees: {
            title: "Issuance Fees",
            content: `Charged to the company when their offering is approved. Can be flat (e.g. $100 USDC) or percentage-based. Changes only apply to NEW offerings — existing offerings keep their original fee. Make sure the company has enough USDC before approving or the transaction fails.`,
        },
        transactionFees: {
            title: "Transaction Fees",
            content: `Percentage deducted from the seller's USDC proceeds on secondary market trades. Only applies to unlocked tokens. Note: fully decentralized P2P transfers outside the platform bypass this fee entirely.`,
        },
    },

    // ========================================
    // DASHBOARD PAGE
    // ========================================
    dashboard: {
        totalPlatformValue: {
            title: "Total Platform Value (AUM)",
            content: `Sum of (token supply × current price) across all active tokens. This is market cap at current prices, not realized proceeds. Includes locked/illiquid tokens.`,
        },
        activeUsers: {
            title: "Active Users",
            content: `Approved users who logged in within 30 days, completed a transaction within 90 days, or hold active investments. Excludes pending/rejected accounts.`,
        },
        totalRevenue: {
            title: "Total Platform Revenue",
            content: `Sum of all USDC fees in the Fee Collector wallet — issuance fees + trading fees. This is gross revenue before operating costs (XLM sponsorships, infrastructure, etc.).`,
        },
        totalInvested: {
            title: "Total Capital Invested",
            content: `All confirmed USDC invested across every offering, all time. Only counts completed transactions — excludes pending or failed payments.`,
        },
        successRate: {
            title: "Investment Success Rate",
            content: `Confirmed distributions ÷ total investment attempts × 100. A low rate means investors are hitting friction (payment failures, insufficient balance, expired offers). Target: > 95%.`,
        },
        avgProcessingTime: {
            title: "Average Processing Time",
            content: `Time between USDC payment confirmation and token arriving in the investor's wallet. Includes admin approval delay if distributions aren't automatic. Target: < 1 minute for automated flows.`,
        },
    },

    // ========================================
    // ASSET COMPLIANCE PAGE
    // ========================================
    assetCompliance: {
        freezeAccount: {
            title: "Freeze Account",
            content: `Blocks all transfers for this investor's tokens — they can't send, receive, or trade. Tokens stay in their wallet but are locked in place. Reversible — unfreeze anytime to restore full access. Use for suspected fraud, regulatory holds, or KYC expiration.`,
        },
        clawback: {
            title: "Token Clawback",
            content: `⚠️ Removes tokens from the investor's wallet permanently and returns them to the issuer. The investor loses the tokens with no automatic refund. Use only under legal mandate — stolen token recovery, court orders, or regulatory enforcement.`,
        },
        finalityOfOwnership: {
            title: "Finality of Ownership",
            content: `⚠️ IRREVERSIBLE. Permanently removes the platform's ability to clawback tokens from this investor. Once granted, their ownership is absolute — no admin action can reclaim those tokens. Often requested by institutional investors.`,
        },
    },

    // ========================================
    // EMERGENCY CONTROLS
    // ========================================
    emergencyControls: {
        platformPause: {
            title: "Platform-Wide Pause",
            content: `🚨 Instantly halts ALL token transfers and investments across the entire platform. Use only for critical emergencies — security breaches, smart contract exploits, or regulatory stop orders. Reactivation requires manual admin action.`,
        },
    },

    // ========================================
    // WALLETS ADDITIONS
    // ========================================
    walletsAdditions: {
        systemWalletsOverview: {
            title: "System Wallets Overview",
            content: `Real-time balances of Treasury (XLM reserves), Issuer (token minting), and Distributor (token staging) wallets. All three must be funded for the platform to operate.`,
        },
        assetField: {
            title: "Asset Selection",
            content: `Choose XLM (native), USDC (stablecoin), or a specific token for the transfer. Double-check the asset before submitting — sending the wrong one can't be automatically reversed.`,
        },
    },

    // ========================================
    // FEE CONFIG ADDITIONS
    // ========================================
    feeConfigAdditions: {
        systemFeeOverview: {
            title: "System Fee Configuration",
            content: `All fees below are automatically deducted during their respective events (issuance, distribution, trading). Changes take effect immediately for new transactions but don't affect past ones.`,
        },
        investmentFee: {
            title: "Investment Fee (Legacy)",
            content: `Platform fees are now set per-offer during offer approval and enforced on-chain by the Soroban sale contract. This config key is no longer used.`,
        },
        dividendFee: {
            title: "Dividend Fee",
            content: `Deducted from the total dividend pool before distribution to investors. The investor receives dividends minus this fee. Revenue goes to the Fee Collector wallet.`,
        },
        blockchainFee: {
            title: "Blockchain Fixed Fee",
            content: `Small fixed amount per transaction to cover Stellar network fees and sponsorship costs. Keeps the Treasury funded. Adjust based on current XLM burn rate.`,
        },
    },

    // ========================================
    // DEFAULT CASES PAGE
    // ========================================
    defaultCases: {
        collateralDistribution: {
            title: "Collateral Distribution",
            content: `Retrieves collateral from escrow and distributes it proportionally to all affected investors based on their token holdings at the time of default. Requires multi-signature approval. Once signed, all investors receive their share automatically.`,
        },
    },

    // ========================================
    // TREASURY PAGE
    // ========================================
    treasury: {
        institutionalTreasury: {
            title: "Institutional Treasury",
            content: `Central view of platform finances — USDC revenue separated from XLM operational reserves. Use to monitor sustainability and propose withdrawals for operating expenses.`,
        },
        sorobanDurability: {
            title: "Soroban State Durability (TTL)",
            content: `Smart contracts on Soroban expire if their TTL isn't extended. The platform monitors and extends TTL automatically for all issued tokens. Check here if any contracts are approaching expiration — archived contracts can't process transactions.`,
        },
        opexWithdrawal: {
            title: "OpEx Withdrawal Proposal",
            content: `Creates a multi-signature transaction to move funds from Treasury for operating expenses. Requires multiple admins to approve before funds are released. Always include a description for audit purposes.`,
        },
    },

    // ========================================
    // SETTINGS PAGE
    // ========================================
    adminSettings: {
        passkeyRegistration: {
            title: "Passkey Security",
            content: `Registers a biometric key (Touch ID, Face ID, or security key) on your device. Your private key never leaves the device — the server only stores a public reference. Once registered, you can log in without typing a password.`,
        },
    },
} as const;

// Type helper for autocomplete
export type HelpContentKey = keyof typeof HELP_CONTENT;
