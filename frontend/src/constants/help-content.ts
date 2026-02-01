/**
 * Centralized Help Content for Admin Pages
 * 
 * Each entry contains detailed explanations covering:
 * - Purpose: What the feature is for
 * - How it works: Technical explanation
 * - How to use: Step-by-step guidance
 * - Important notes: Edge cases, warnings, limitations
 */

export const HELP_CONTENT = {
    // ========================================
    // USER MANAGEMENT PAGE
    // ========================================
    userManagement: {
        kycStatus: {
            title: "KYC Status",
            content: `**Purpose:** Indicates the compliance verification stage for each investor.

**How it works:** When an investor registers, they submit identity documents (government ID, proof of residence). The platform admin reviews these documents to verify authenticity and compliance with securities regulations. The status transitions from "pending" (awaiting review) → "approved" (documents verified) or "rejected" (documents invalid/insufficient).

**How to use:** Click on a pending investor to review their submitted documents. Verify identity matches government records, documents are current (not expired), and information is consistent. Approve if all criteria are met, or reject with a reason if documents are insufficient.

**Important notes:** Rejected investors can re-submit updated documents. KYC approval is required before investors can participate in any token offerings. This process ensures regulatory compliance with know-your-customer (KYC) and anti-money laundering (AML) laws.`,
        },
        approveButton: {
            title: "Approve Investor",
            content: `**Purpose:** Activates an investor account after successful KYC verification, allowing them to invest in security tokens.

**How it works:** Approval performs three critical actions: (1) updates the investor's status to "approved" in the database, (2) sponsors their Stellar smart wallet trustlines using platform reserves (eliminating XLM requirements for the investor), and (3) enables access to active token offerings.

**How to use:** Review the investor's KYC documents first. If verified, click "Approve" to instantly activate their account. The system automatically handles wallet sponsorship in the background. The investor will receive a notification and can immediately view available offerings.

**Important notes:** Approval is irreversible without manual admin intervention. Ensure KYC documents are thoroughly verified before approving. Wallet sponsorship uses platform XLM reserves, so monitor Treasury balance to ensure sufficient funds for ongoing sponsorships.`,
        },
        rejectButton: {
            title: "Reject Investor",
            content: `**Purpose:** Denies an investor application when KYC documents fail verification requirements.

**How it works:** Rejection updates the investor status to "rejected" and prevents access to any token offerings. The investor is notified via email with the rejection reason. They can re-submit updated documents by creating a new application or contacting support.

**How to use:** Select a pending investor, review their documents, and if they fail verification (expired ID, mismatched information, fraudulent documents), click "Reject" and provide a clear reason (e.g., "Government ID expired - please submit current ID").

**Important notes:** Provide specific, actionable feedback so investors can correct issues. Rejection is not permanent - investors can reapply with corrected documents. Track rejection reasons for compliance auditing and pattern detection (e.g., repeated fraud attempts).`,
        },
        sponsorTrustline: {
            title: "Sponsor Trustline",
            content: `**Purpose:** Manually sponsor a Stellar trustline for an investor's wallet, enabling them to hold specific security tokens without needing XLM reserves.

**How it works:** Stellar requires accounts to establish "trustlines" before holding non-native assets (security tokens). Normally, investors need 0.5 XLM per trustline as base reserve. Sponsorship transfers this reserve obligation to the platform, providing a 100% XLM-free investor experience. The platform's sponsor account pays the reserve using its XLM treasury.

**How to use:** Select an investor and the specific token trustline to sponsor. Click "Sponsor Trustline" to execute the Stellar transaction. The investor's wallet can now hold this token without any XLM balance.

**Important notes:** Sponsorship is typically automatic during approval, but this manual option handles edge cases (e.g., new tokens added after investor approval). Each sponsorship costs ~0.5 XLM from Treasury reserves. Monitor Treasury balance to ensure adequate XLM for ongoing operations.`,
        },
        walletAddress: {
            title: "Wallet Address",
            content: `**Purpose:** Displays the investor's Stellar blockchain wallet address for receiving security tokens and USDC.

**How it works:** The platform uses Stellar smart wallets (Contract addresses starting with "C...") instead of classic Stellar accounts (starting with "G..."). Smart wallets provide enhanced security features like multi-signature support and passkey authentication. Each investor gets a unique, non-custodial wallet address that they control via passkeys (biometric authentication).

**How to use:** Copy the wallet address to verify on Stellar Expert blockchain explorer. Use this address for manual token distributions or USDC top-ups. Investors use this address when depositing USDC from exchanges.

**Important notes:** Contract addresses (C...) are NOT directly compatible with all exchanges. Investors must use the platform's deposit relay system to transfer USDC from exchanges to their smart wallet. Never send tokens to an investor who hasn't established the required trustline first - the transaction will fail.`,
        },
        viewDetailsModal: {
            title: "Investor Details",
            content: `**Purpose:** Provides a comprehensive view of an investor's profile, wallet balances, transaction history, and investment portfolio.

**How it works:** Aggregates real-time data from multiple sources: investor profile (name, email, KYC status), wallet balances (XLM and USDC fetched from Stellar RPC), transaction history (on-chain + platform database), and active investments (tokens held with current valuations).

**How to use:** Click "View Details" on any investor to open the modal. Review balances to ensure sufficient USDC for pending investments. Check transaction history to debug failed payments or investigate suspicious activity. Export data for compliance reporting.

**Important notes:** Balances are fetched in real-time and may have slight delays during high network congestion. Transaction history only shows platform-mediated transactions (investments, distributions) - not direct peer-to-peer transfers outside the platform.`,
        },
    },

    // ========================================
    // COMPANIES PAGE
    // ========================================
    companies: {
        companyStatus: {
            title: "Company Status",
            content: `**Purpose:** Tracks the lifecycle stage of a company registration and their authorization to issue security tokens.

**How it works:** Status progression: "pending" (application submitted, awaiting admin review) → "approved" (KYC verified, wallet sponsored) → "active" (has issued at least one token offering) → "suspended" (temporarily restricted due to compliance issues) → "rejected" (application denied).

**How to use:** Review pending companies by verifying legal registration (CNPJ validity), corporate documents, and authorized representatives. Approve to unlock token issuance capabilities. Suspend if compliance violations are detected (requires manual investigation).

**Important notes:** Only "approved" and "active" companies can create token offerings. "Suspended" companies cannot issue new offerings but existing token obligations remain valid. Rejection requires documented justification for legal compliance.`,
        },
        approveCompany: {
            title: "Approve Company",
            content: `**Purpose:** Authorizes a company to issue security tokens on the platform after verifying their legal compliance and corporate documentation.

**How it works:** Approval performs: (1) KYC verification of the company's legal entity (CNPJ validation, corporate registry check), (2) review of submitted legal documents (articles of incorporation, authorized signer identification), (3) creation and sponsorship of the company's issuer Stellar wallet, (4) activation of token issuance privileges.

**How to use:** Review submitted documents: verify CNPJ is active and matches legal name, confirm authorized representative has signing authority, check that corporate structure allows security token issuance. Click "Approve" to grant access to the token creation dashboard.

**Important notes:** Approval grants significant privileges - companies can create unlimited token offerings once approved. Ensure thorough document verification to prevent fraud. The issuer wallet is automatically created and sponsored (uses platform XLM reserves). Companies cannot be "unapproved" once activated - use "Suspend" for compliance violations.`,
        },
        walletSponsorship: {
            title: "Wallet Sponsorship",
            content: `**Purpose:** Creates and sponsors a Stellar issuer wallet for approved companies, eliminating their need for XLM reserves.

**How it works:** Sponsorship creates a Stellar account for the company's token issuance operations and sponsors all base reserves (2 XLM for account creation + reserves for trustlines and data entries). The platform's sponsor account pays these reserves from Treasury XLM. Company wallets are multisig-enabled for security.

**How to use:** Sponsorship is automatic during company approval. For manual sponsorship (e.g., re-sponsoring after wallet issues), select the company and click "Sponsor Wallet". Verify wallet creation on Stellar Expert using the displayed wallet address.

**Important notes:** Each company wallet costs ~2-5 XLM from Treasury reserves depending on initial configuration. Monitor Treasury XLM balance for ongoing sponsorship sustainability. Wallet addresses are permanent and cannot be changed once created - ensure proper security controls are in place.`,
        },
        activeOffersCount: {
            title: "Active Offers",
            content: `**Purpose:** Displays the number of token offerings currently accepting investor participation from this company.

**How it works:** Counts offers in "active" status (approved by admin and currently raising capital). Does not include draft, pending approval, completed, or cancelled offers. Updates in real-time as offers transition through lifecycle stages.

**How to use:** Click the count to filter the Offers page to this company's active offerings. Use this metric to monitor company activity and ensure they're not exceeding operational capacity. High active offer counts may indicate need for additional compliance oversight.

**Important notes:** "Active" means the offer is open for investment, not that it's currently receiving investments. Zero active offers doesn't mean a company is inactive - they may have completed offerings with ongoing token obligations (distributions, compliance reporting).`,
        },
        totalInvestments: {
            title: "Total Investments",
            content: `**Purpose:** Aggregates all USDC raised by this company across all token offerings (historical and active).

**How it works:** Sums confirmed investor payments from all time. Includes completed offerings (fully raised) and active offerings (in-progress). Excludes pending/unconfirmed payments and refunded investments. Denominated in USDC.

**How to use:** Use this metric to assess company scale and platform contribution. Compare against total issued tokens to calculate average token price across offerings. High investment totals may require enhanced compliance monitoring.

**Important notes:** This is gross investments received, not net after fees. Platform fees are deducted separately. Does not reflect current secondary market valuations - only primary issuance amounts. Historical metric only - does not decrease if investors later sell tokens.`,
        },
        cnpjField: {
            title: "CNPJ (Brazilian Tax ID)",
            content: `**Purpose:** Unique federal tax identification number required for all Brazilian corporate entities issuing securities.

**How it works:** CNPJ (Cadastro Nacional da Pessoa Jurídica) is validated against Brazilian federal registry to confirm the company is legally registered and in good standing. Format: XX.XXX.XXX/XXXX-XX (14 digits). The platform validates format and optionally checks active status via external APIs.

**How to use:** During company approval, verify the CNPJ matches the legal entity name exactly. Cross-reference with RFB (Receita Federal do Brasil) public databases to confirm active status and authorized signers.

**Important notes:** CNPJ must be active and in good tax standing for securities issuance. Suspended or cancelled CNPJs cannot issue tokens. Changes to corporate structure (mergers, name changes) may change CNPJ - require document updates for any modifications.`,
        },
    },

    // ========================================
    // TOKENS PAGE
    // ========================================
    tokens: {
        tokenStatus: {
            title: "Token Status (Locked/Unlocked)",
            content: `**Purpose:** Controls whether token holders can freely transfer tokens to other addresses (tradability).

**How it works:** Stellar's authorization framework has two states: "locked" (AUTH_REQUIRED + AUTH_REVOCABLE enabled, platform must pre-approve all transfers) and "unlocked" (authorization checks removed, free peer-to-peer transfers). Locked tokens can only be held by platform-approved trustlines. Unlocked tokens trade freely like any Stellar asset.

**How to use:** Keep tokens LOCKED during initial distribution to maintain investor registry and compliance controls. UNLOCK after distribution complete if secondary market trading is permitted by the offering terms. Locked status appears as 🔒, unlocked as 🔓.

**Important notes:** Unlocking is IRREVERSIBLE - once unlocked, tokens can be freely transferred and platform loses regulatory oversight. Coordinate with legal counsel before unlocking. Most security tokens remain locked to maintain compliance with investor accreditation requirements.`,
        },
        unlockButton: {
            title: "Unlock Token",
            content: `**Purpose:** Permanently removes transfer restrictions from a security token, enabling free secondary market trading.

**How it works:** Disables Stellar authorization flags (AUTH_REQUIRED and AUTH_REVOCABLE) on the token's issuer account. Once executed, the token behaves like any standard Stellar asset - anyone can establish trustlines and transfer without platform approval. Platform cannot reverse this or re-impose restrictions.

**How to use:** ONLY use after: (1) confirming with legal counsel that secondary trading is permitted, (2) completing initial token distribution to all investors, (3) implementing off-platform compliance monitoring if required. Click "Unlock" → confirm warning → irreversible transaction executes.

**Important notes:** ⚠️ THIS CANNOT BE UNDONE. Platform loses ability to enforce transfer restrictions, maintain investor registry, or comply with certain securities regulations. Most security tokens should remain locked. Only unlock if offering terms explicitly permit open secondary market trading.`,
        },
        supplyVsCirculating: {
            title: "Supply vs Circulating",
            content: `**Purpose:** Differentiates between total tokens created and tokens actually distributed to investors.

**How it works:** TOTAL SUPPLY = tokens minted by the issuer (maximum that can ever exist per offering terms). CIRCULATING SUPPLY = tokens distributed to investor wallets (actually in investor hands). The difference represents tokens held by the Distributor wallet awaiting assignment. For example, 1,000,000 total / 650,000 circulating = 350,000 tokens pending distribution.

**How to use:** Monitor circulating supply to track distribution progress. If total supply decreases, issuer may have burned unallocated tokens. If circulating exceeds 90% of total, offering is nearing full subscription.

**Important notes:** Circulating supply only counts investor wallets, not distributor reserves. Tokens held by company (for employee allocations, reserves) count as circulating. Secondary market transfers don't affect these numbers - they track primary issuance only.`,
        },
        issuerCompany: {
            title: "Issuer Company",
            content: `**Purpose:** Identifies which approved company created and is legally responsible for this security token.

**How it works:** Links the token to the company's profile, including their legal entity (CNPJ), authorized representatives, and issuer wallet address. This establishes legal accountability for token obligations (distributions, compliance reporting, investor communications).

**How to use:** Click the company name to view full company details, including all their issued tokens and total investments raised. Use this to identify which company to contact for token-specific inquiries or compliance issues.

**Important notes:** Issuer cannot be changed after token creation - legal ownership is permanent. If company undergoes merger/acquisition, legal entity must be updated but issuer wallet address remains the same. Multiple tokens from the same issuer share the same company wallet.`,
        },
        stellarAssetCode: {
            title: "Stellar Asset Code",
            content: `**Purpose:** The unique 12-character identifier for this token on the Stellar blockchain.

**How it works:** Asset codes are alphanumeric (A-Z, 0-9) identifiers up to 12 characters. Combined with the issuer wallet address, this creates a globally unique Stellar asset. Format: ASSETCODE:ISSUERADDRESS. Examples: "REAL001:GDIQ..." or "PROPTOKEN:CAAA...".

**How to use:** Use the asset code to search for this token on Stellar Expert blockchain explorer. Share with investors for wallet setup. Use in Stellar SDK calls for programmatic interaction.

**Important notes:** Asset codes are case-sensitive and permanent. "REAL001" and "real001" are different assets. Keep codes human-readable for investor clarity. Duplicate asset codes from different issuers are DIFFERENT tokens - always verify the issuer address.`,
        },
        distributionControls: {
            title: "Distribution Controls",
            content: `**Purpose:** Manages the allocation and transfer of tokens from the distributor wallet to investor wallets.

**How it works:** After tokens are minted, they're held in the platform's Distributor wallet. Admins manually trigger distribution batches to assign tokens to investors who've completed payments. Distribution verifies: (1) investor has paid required USDC, (2) investor trustline is sponsored and authorized, (3) distribution amount matches investment / token price.

**How to use:** Review pending investments in the Offers page. Click "Distribute Tokens" to allocate tokens to all confirmed investors. System automatically calculates token quantities based on USDC received / token price. Verify balances on Stellar Expert after batch completes.

**Important notes:** Distribution is irreversible - tokens cannot be recalled after transfer (unless clawback is enabled and executed separately). Always verify payment confirmation before distributing. Batch distributions save XLM fees compared to individual transfers.`,
        },
    },

    // ========================================
    // OFFERS PAGE
    // ========================================
    offers: {
        offerStatus: {
            title: "Offer Status Flow",
            content: `**Purpose:** Tracks the lifecycle stage of a token offering from creation through completion.

**How it works:** Status progression: "draft" (company creating, not submitted) → "pending" (submitted, awaiting admin review) → "approved" (admin verified legal documents and compliance) → "active" (open for investor participation) → "completed" (fully raised or deadline reached).

**How to use:** Review pending offers by checking legal documents, token economics, and compliance requirements. Approve to make the offering visible to approved investors. Monitor active offers for subscription progress.

**Important notes:** Only "active" offers accept investor funds. "P ending" offers are invisible to investors until admin approval. "Completed" offers cannot accept new investments but token obligations (distributions, compliance) persist indefinitely.`,
        },
        approveOffer: {
            title: "Approve Offer",
            content: `**Purpose:** Authorizes a token offering to go live after verifying legal compliance and documentation.

**How it works:** Approval checklist: (1) verify legal documents are uploaded to IPFS and accessible, (2) confirm token economics (price, supply, minimum investment) are reasonable, (3) check CNPJ and company status are active, (4) validate offering terms comply with securities regulations. Approval transitions offer to "active" status, making it visible to all approved investors.

**How to use:** Open pending offer details. Download and review legal documents (prospectus, terms of service, subscription agreement). Verify IPFS hashes match uploaded documents. Check token parameters for errors. If all criteria met, click "Approve" to activate the offering.

**Important notes:** Approval has legal implications - you're certifying the offering meets platform compliance standards. Thoroughreview is mandatory. Once approved, offering terms cannot be modified without creating a new offer version. Consult legal counsel for complex offerings.`,
        },
        legalDocuments: {
            title: "Legal Documents (IPFS)",
            content: `**Purpose:** Immutable storage of offering legal documents on IPFS for investor access and regulatory compliance.

**How it works:** Companies upload legal documents (prospectus, subscription agreements, risk disclosures) when creating an offer. Platform stores files on Pinata (IPFS provider), generating permanent content-addressable hashes. These IPFS hashes are embedded in the Stellar TOML file and displayed on Stellar Expert, ensuring immutability and public accessibility.

**How to use:** Verify IPFS links work by clicking to preview documents. Check file integrity by comparing hash displayed vs returned document. Confirm documents match offering description and comply with securities requirements.

**Important notes:** IPFS storage is permanent and immutable - documents cannot be edited after upload. Hash changes = different document. Ensure correct version is uploaded before approval. Investors rely on these documents for investment decisions - accuracy is critical.`,
        },
        amountToRaise: {
            title: "Amount to Raise",
            content: `**Purpose:** Target capital the company intends to raise through this token offering, denominated in USDC.

**How it works:** Amount to raise = token price × total supply. For example, $1/token × 1,000,000 tokens = $1,000,000 to raise. Investors purchase tokens with USDC until the target is reached or offering deadline passes. Tracks progress as percentage  (e.g., "$450,000 / $1,000,000 (45%)").

**How to use:** Verify amount to raise matches offering economics and company valuation. Ensure it's achievable based on investor base size. Monitor progress in real-time on the dashboard.

**Important notes:** Amount is a target, not a hard cap (unless specified in offering terms). Some offerings close early when fully subscribed, others run to deadline regardless of progress. Partial raises are valid - companies can issue tokens for whatever capital was raised.`,
        },
    },

    // ========================================
    // TRANSACTIONS PAGE
    // ========================================
    transactions: {
        transactionTypes: {
            title: "Transaction Types",
            content: `**Purpose:** Categorizes blockchain transactions by their platform function.

**How it works:** Transaction types include: (1) INVESTMENT - investor sends USDC to purchase tokens, (2) DISTRIBUTION - platform sends tokens to investor after payment confirmation, (3) SPONSORSHIP - platform sponsors reserves for wallets/trustlines, (4) FEE COLLECTION - platform collects issuance or trading fees. Each type has different validation and monitoring requirements.

**How to use:** Filter transactions by type to audit specific workflows. Investigate failed investments to refund investors. Monitor fee collections for revenue tracking.

**Important notes:** Investment transactions require manual distribution approval. Distribution transactions are irreversible once confirmed. Sponsorship transactions debit platform XLM reserves - monitor Treasury to prevent depletion.`,
        },
        transactionStatus: {
            title: "Transaction Status",
            content: `**Purpose:** Indicates whether a Stellar blockchain transaction succeeded, failed, or is pending confirmation.

**How it works:** Status values: "pending" (submitted to Stellar network, awaiting ledger confirmation), "confirmed" (included in a ledger, immutable), "failed" (rejected by network due to insufficient balance, invalid operations, or network errors). Pending transactions typically confirm within 5-10 seconds.

**How to use:** Monitor pending transactions for delays (>30 seconds indicates network congestion or node issues). Investigate failed transactions to identify root cause (insufficient XLM, invalid trustline, etc.). Retry failed transactions after resolving the underlying issue.

**Important notes:** Confirmed transactions are permanent and cannot be reversed (except via clawback if enabled). Failed transactions do not debit funds - safe to retry. Pending status >1 minute may indicate Horizon/RPC connectivity issues - check platform infrastructure.`,
        },
        blockchainExplorer: {
            title: "Blockchain Explorer Link",
            content: `**Purpose:** Provides direct link to Stellar Expert to independently verify transaction details on the public blockchain.

**How it works:** Each transaction displays a link to its Stellar Expert page, showing full transaction details: operations performed, fees paid, accounts involved, ledger number, timestamp, and signature verification. This enables transparent audit trail independent of platform database.

**How to use:** Click "View on Explorer" to open Stellar Expert in new tab. Verify transaction hash matches platform record. Check all operations executed correctly. Use for investor disputes or compliance audits.

**Important notes:** Stellar Expert is the authoritative source of truth - if platform database conflicts with blockchain, blockchain is correct. Explorer shows ALL operations in a transaction, including sponsorships and authorizations not visible in platform UI.`,
        },
    },

    // ========================================
    // WALLETS PAGE
    // ========================================
    wallets: {
        treasuryWallet: {
            title: "Treasury Wallet",
            content: `**Purpose:** Platform's main XLM holding account used for sponsoring user wallets and covering network fees.

**How it works:** Treasury holds the platform's XLM reserves. Every wallet sponsorship, trustline sponsorship, and fee payment debits XLM from Treasury. Requires maintaining minimum balance for ongoing operations (recommend: 10,000+ XLM for sustainable operations). Multisig-secured for maximum security.

**How to use:** Monitor Treasury XLM balance daily. Refill when balance drops below operational threshold (e.g., <5,000 XLM). Track daily burn rate to forecast refill schedule. Export transaction history for accounting.

**Important notes:** Depletion halts all new account creations and sponsorships - investors cannot onboard. Set up balance alerts to prevent service disruption. Secure private keys with hardware wallet or multisig. Public accountability - balance is visible on Stellar Expert.`,
        },
        distributorWallet: {
            title: "Distributor Wallet",
            content: `**Purpose:** Platform wallet that holds freshly minted security tokens before distribution to investors.

**How it works:** After a company creates a token offering, all minted tokens are transferred to the Distributor wallet. As investors complete payments, admins trigger distribution batches that transfer tokens from Distributor to investor wallets. Acts as intermediary between issuer and investors.

**How to use:** Check Distributor token balances to see available supply for each offering. Compare against pending investments to ensure sufficient tokens. Monitor for discrepancies between minted supply and Distributor holdings.

**Important notes:** Distributor should ONLY hold tokens awaiting distribution, not permanent reserves. Zero balance after distribution completion is normal. If Distributor runs out during active offering, issuer must mint additional tokens or offering is oversold.`,
        },
        feeCollectorWallet: {
            title: "Fee Collector Wallet",
            content: `**Purpose:** Platform wallet that receives all USDC fees from token issuances and secondary market trades.

**How it works:** When companies issue tokens or tokens trade on secondary markets, configured platform fees are automatically sent to Fee Collector. Fees accumulate here until withdrawn for operating expenses or revenue distribution. Tracks total platform revenue in USDC.

**How to use:** Monitor Fee Collector balance to track platform revenue. Export transaction history for financial reporting and tax compliance. Withdraw fees periodically for operational costs.

**Important notes:** Fee collection is automatic and immutable once configured. Missing fees indicate configuration errors or bypassed workflows. Fee Collector balance = gross revenue before operating expenses - use for P&L calculations.`,
        },
        xlmVsUsdc: {
            title: "XLM vs USDC Balances",
            content: `**Purpose:** Differentiates between Stellar's native currency (XLM) used for network fees and stablecoin (USDC) used for investments.

**How it works:** XLM is the native blockchain currency required for all Stellar transactions (fees, reserves, sponsorships). USDC is a US dollar-pegged stablecoin used for investor payments and token purchases. Platform needs both: XLM for operations, USDC for fee revenue. They are NOT interchangeable.

**How to use:** Monitor XLM balances in Treasury/Distributor for operational capacity. Monitor USDC balances in Fee Collector for revenue. Convert USDC to XLM on Stellar DEX when Treasury needs refilling.

**Important notes:** XLM is volatile (price fluctuates). USDC is stable ($1 ≈ 1 USDC). Never confuse the two in transactions - sending XLM when USDC expected will fail. Maintain minimum XLM reserves even if USDC revenue is high.`,
        },
    },

    // ========================================
    // FEE CONFIG PAGE
    // ========================================
    feeConfig: {
        issuanceFees: {
            title: "Issuance Fees",
            content: `**Purpose:** Platform fee charged to companies when they create a new token offering.

**How it works:** Flat fee (e.g., $100 USDC) or percentage of capital raised (e.g., 3% of total raise). Charged to company's wallet when offer transitions from "pending" to "approved". Revenue goes to Fee Collector wallet. Covers platform costs for compliance review, infrastructure, and ongoing support.

**How to use:** Set fees based on platform operating costs and competitive analysis. Higher fees for complex offerings requiring more admin oversight. Apply fee rules globally or per-company tier (e.g., discount for high-volume issuers).

**Important notes:** Fee changes apply to NEW offerings only - existing offerings retain original fee structure. Ensure company has sufficient USDC balance before approval or transaction fails. Document fee changes for accounting and investor transparency.`,
        },
        transactionFees: {
            title: "Transaction Fees",
            content: `**Purpose:** Platform fee on secondary market token transfers between investors.

**How it works:** Percentage-based fee (e.g., 0.5%) charged on token sale price when investors trade tokens peer-to-peer. Automatically deducted from seller's USDC proceeds and sent to Fee Collector. Only applies if secondary trading is enabled (unlocked tokens).

**How to use:** Configure fee percentage based on market competitiveness and revenue goals. Higher fees may discourage trading. Test fee calculations before going live to avoid investor disputes.

**Important notes:** Secondary trade fees require unlocked tokens - locked tokens cannot be freely traded. Fee enforcement requires platform-mediated trades - fully decentralized P2P trades bypass fees. Balance revenue goals against market liquidity.`,
        },
    },

    // ========================================
    // DASHBOARD PAGE
    // ========================================
    dashboard: {
        totalPlatformValue: {
            title: "Total Platform Value (AUM)",
            content: `**Purpose:** Aggregates total assets under management (AUM) across all active token offerings.

**How it works:** Calculation: sum of (token supply × current price) for all active tokens. Represents total market capitalization of all security tokens on the platform. Updates in real-time as new tokens are issued or prices change.

**How to use:** Track platform growth over time. Use for investor presentations and fundraising. Compare against competitive platforms. Monitor for sudden drops indicating potential security issues.

**Important notes:** AUM = market cap at current prices, not realized proceeds. Includes illiquid locked tokens that may not be tradable. Does not subtract platform fees - represents gross investor value.`,
        },
        activeUsers: {
            title: "Active Users",
            content: `**Purpose:** Counts investors and companies with recent platform activity.

**How it works:** "Active" defined as: logged in within last 30 days OR completed a transaction within last 90 days OR has active investments. Differentiates between active investors (holding tokens) and dormant accounts (registered but inactive).

**How to use:** Monitor user engagement trends. Declining active users indicates churn or reduced interest. Segment by investor vs company to identify where growth is needed.

**Important notes:** Metric excludes pending/rejected accounts - only approved users count. Spike after marketing campaigns normal. Use alongside investment volume to gauge quality of engagement.`,
        },
        totalRevenue: {
            title: "Total Platform Revenue",
            content: `**Purpose:** Aggregates all issuance and transaction fees collected by the platform.

**How it works:** Sum of all USDC fees transferred to the Fee Collector wallet. Includes primary issuance fees and secondary market trade fees.

**How to use:** Monitor this to track platform profitability and revenue targets.

**Important notes:** This is gross revenue before operating costs.`,
        },
        totalInvested: {
            title: "Total Capital Invested",
            content: `**Purpose:** Total amount of USDC investors have committed to token offerings on the platform.

**How it works:** Sum of all confirmed investment transactions across all active and completed offerings.

**How to use:** Benchmark platform growth and market adoption.`,
        },
        successRate: {
            title: "Investment Success Rate",
            content: `**Purpose:** Percentage of investment attempts that successfully result in token distribution.

**How it works:** (Confirmed Distributions / Total Investment Attempts) × 100.

**How to use:** Monitor for friction in the investment funnel (e.g., payment failures).`,
        },
        avgProcessingTime: {
            title: "Average Processing Time",
            content: `**Purpose:** Average time from payment confirmation to token distribution.

**How it works:** Tracks the duration between USDC receipt and the execution of the token distribution transaction.

**How to use:** Ensure platform efficiency and investor satisfaction. Target: < 1 minute.`,
        },
    },
    // ========================================
    // ASSET COMPLIANCE PAGE
    // ========================================
    assetCompliance: {
        freezeAccount: {
            title: "Freeze Account",
            content: `**Purpose:** Temporarily restricts an investor's ability to transfer or receive specific security tokens.

**How it works:** Sets the "Authorized" flag to false on the investor's Stellar trustline. This utilizes the 'Authorization Revocable' flag on the asset.

**How to use:** Use in cases of suspected fraud, regulatory inquiry, or KYC expiration.

**Important notes:** Tokens remain in the wallet but cannot be moved.`,
        },
        clawback: {
            title: "Token Clawback",
            content: `**Purpose:** Legally retrieves tokens from an investor's wallet and returns them to the issuer.

**How it works:** Executes a 'Clawback' operation on Stellar, which burns tokens from a source account and re-mints them to the issuer.

**How to use:** Used for recovering stolen tokens, correcting accidental transfers, or legal forfeitures.

**Important notes:** This is a powerful administrative tool and should only be used under legal mandate or strict platform policy.`,
        },
        finalityOfOwnership: {
            title: "Finality of Ownership",
            content: `**Purpose:** Permanently disables the platform's ability to claw back tokens from a specific investor.

**How it works:** Clears the 'Clawback Enabled' flag on the specific trustline. This process is irreversible.

**How to use:** Provides the investor with absolute finality of ownership, often requested by institutional investors.`,
        },
    },
    // ========================================
    // EMERGENCY CONTROLS
    // ========================================
    emergencyControls: {
        platformPause: {
            title: "Platform-Wide Pause",
            content: `**Purpose:** Instantly halts all token transfers and investment activities across the entire platform.

**How it works:** Triggers a global circuit breaker that blocks all distribution and secondary market transactions in the platform API.

**How to use:** ONLY use in extreme emergencies like a smart contract exploit or large-scale security breach.`,
        },
    },
    // ========================================
    // WALLETS ADDITIONS
    // ========================================
    walletsAdditions: {
        systemWalletsOverview: {
            title: "System Wallets Overview",
            content: `**Purpose:** Provides a management interface for the core platform wallets that power the ecosystem.

**How it works:** Monitors real-time balances and transaction history for the Treasury (XLM), Issuer (Minter), and Distributor (Staging) wallets.

**How to use:** Use this view to ensure all system accounts are properly funded and operational.`,
        },
        assetField: {
            title: "Asset Selection",
            content: `**Purpose:** Specifies which currency or security token is being transferred.

**How it works:** Transfers can be made in XLM (native), USDC (stablecoin), or specific security tokens issued on the platform.

**How to use:** Carefully select the correct asset before proposing a transfer.`,
        },
    },
    // ========================================
    // FEE CONFIG ADDITIONS
    // ========================================
    feeConfigAdditions: {
        systemFeeOverview: {
            title: "System Fee Configuration",
            content: `**Purpose:** Defines the various fees collected by the platform for its services.

**How it works:** Fees are automatically calculated and deducted during specific events (issuance, distribution, trading).

**How to use:** Adjust these parameters to align with business models and operational costs.`,
        },
        investmentFee: {
            title: "Investment Fee",
            content: `**Purpose:** Fee charged to companies for each successful investment received.

**How it works:** Percentage-based fee deducted from the capital raised.`,
        },
        dividendFee: {
            title: "Dividend Fee",
            content: `**Purpose:** Fee charged for processing dividend distributions to investors.

**How it works:** Deducted from the total dividend pool before distribution.`,
        },
        blockchainFee: {
            title: "Blockchain Fixed Fee",
            content: `**Purpose:** A small fixed fee to cover the network's processing costs and sponsorships.

**How it works:** Charged per transaction to maintain the platform's XLM reserves.`,
        },
    },
    // ========================================
    // DEFAULT CASES PAGE
    // ========================================
    defaultCases: {
        collateralDistribution: {
            title: "Collateral Distribution",
            content: `**Purpose:** Liquidates company collateral and distributes it to affected investors in case of a default.

**How it works:** Proposes a transaction that retrieves collateral (tokens/stablecoins) from the escrow and sends proportional amounts to all investors based on their holdings at the time of default.

**How to use:** Review the investor distribution list for accuracy. Click "Distribute Collateral" to initiate the multi-signature process. All investors will receive their share once the transaction is signed.`,
        },
    },
    // ========================================
    // TREASURY PAGE
    // ========================================
    treasury: {
        institutionalTreasury: {
            title: "Institutional Treasury",
            content: `**Purpose:** Central management of platform-level financial assets and operational funding.

**How it works:** Shows the real-time balances of the platform's foundation wallets. Segregates USDC (Revenue) from XLM (Gas/Reserves).

**How to use:** Monitor for operational sustainability. Propose withdrawals for platform expenses (OpEx) or refill operational reserves.`,
        },
        sorobanDurability: {
            title: "Soroban State Durability (TTL)",
            content: `**Purpose:** Manage the storage rent and lifetime of Soroban smart contracts and persistent data.

**How it works:** Contracts on Soroban have a "Time To Live" (TTL). If not extended, they become archived. The platform automatically monitors and extends TTL for all issued security tokens.

**How to use:** Use this view to monitor the automated maintenance cycles and ensure no contracts are approaching expiration.`,
        },
        opexWithdrawal: {
            title: "OpEx Withdrawal Proposal",
            content: `**Purpose:** Mechanism for moving funds out of the Institutional Treasury for operational expenses.

**How it works:** Creates a multi-signature transaction proposal. Funds are only moved after the required number of administrators approve the transaction.

**How to use:** Enter the destination Stellar address, amount, and a clear description for audit purposes.`,
        },
    },
    // ========================================
    // SETTINGS PAGE
    // ========================================
    adminSettings: {
        passkeyRegistration: {
            title: "Passkey Security",
            content: `**Purpose:** Adds a hardware-secured, biometric layer of security to your admin account.

**How it works:** Uses the WebAuthn standard to create a cryptographic pair on your device (MacBook, Phone, or Security Key). Your private key never leaves the device.

**How to use:** Click "Register Passkey" and follow your browser's prompts for Touch ID, Face ID, or PIN. Once registered, you can log in without typing a password.`,
        },
    },
} as const;

// Type helper for autocomplete
export type HelpContentKey = keyof typeof HELP_CONTENT;
