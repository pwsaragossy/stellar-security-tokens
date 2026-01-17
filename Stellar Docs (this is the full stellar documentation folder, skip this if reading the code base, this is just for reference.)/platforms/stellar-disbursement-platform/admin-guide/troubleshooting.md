# Troubleshooting

This guide helps you diagnose and resolve common issues with the Stellar Disbursement Platform (SDP).

## Quick Reference[](#quick-reference "Direct link to Quick Reference")

| Symptom | Likely Cause | Jump to |
| --- | --- | --- |
| Payment stuck in "Pending" | TSS issue, missing accounts, or insufficient funds | [Pending Payments](#payment-stuck-in-pending) |
| "Resource Missing" in logs | Account doesn't exist on network | [Pending Payments](#payment-stuck-in-pending) |
| Payment failed with `op_no_trust` | Receiver missing trustline for asset | [Operation Errors](#payment-failed-operation-error) |
| Payment failed with `op_underfunded` | Distribution account low on funds | [Operation Errors](#payment-failed-operation-error) |
| Payment failed with `op_no_destination` | Receiver account doesn't exist | [Operation Errors](#payment-failed-operation-error) |
| Receiver didn't get invitation | Scheduler config or messaging provider issue | [Invitation Issues](#receiver-not-receiving-invitation) |
| Receiver didn't get OTP | Mismatched contact info or provider issue | [OTP Issues](#receiver-not-receiving-otp) |
| Channel account errors after testnet reset | Channel accounts were wiped | [Recreating Channel Accounts](#recreating-channel-accounts) |
| Payments processing slowly | Not enough channel accounts | [Slow Payments](#slow-payments-due-to-insufficient-channel-accounts) |

---

## Payments[](#payments "Direct link to Payments")

### Payment Stuck in "Pending"[](#payment-stuck-in-pending "Direct link to Payment Stuck in \"Pending\"")

Payments can get stuck in "Pending" status for several reasons. Work through these checks in order.

#### 1. Check TSS Service Health[](#1-check-tss-service-health "Direct link to 1. Check TSS Service Health")

The Transaction Submission Service (TSS) must be running and reachable.

```
# Check TSS container status  
docker ps | grep tss  
  
# View recent TSS logs  
docker logs --tail 100 <tss-container-name>
```

If TSS is down or unreachable, restart it and monitor the logs for errors.

#### 2. Verify Distribution Account Funds[](#2-verify-distribution-account-funds "Direct link to 2. Verify Distribution Account Funds")

The distribution account must have sufficient XLM to cover the payment amount plus transaction fees.

Use [Stellar Expert](https://stellar.expert/explorer/public/) or the Stellar CLI to check the balance.

#### 3. Validate Channel Accounts[](#3-validate-channel-accounts "Direct link to 3. Validate Channel Accounts")

Channel accounts may become invalid after testnet resets. Look for errors like this in your logs:

Example error: "Resource Missing"

```
time="2025-12-19T18:43:37.017Z" level=error msg="[DRY_RUN Crash Reporter] unexpected TSS error: preparing bundle for processing: building transaction: horizon response error: getting account detail: horizon error: \"Resource Missing\" - check horizon.Error.Problem for more information" app_version=6.0.1 asset=XLM channel_account=GBKEVxxxx ...
```

**Diagnosis:** This error means either the **destination account** or the **channel account** doesn't exist on the network. Check both using [Stellar Expert](https://stellar.expert/explorer/public/).

**Solution:**

* Destination Account Missing
* Channel Accounts Missing

The receiver's account hasn't been created on the Stellar network. The account must be funded with the minimum balance (currently 1 XLM on mainnet) before it can receive payments.

Channel accounts may disappear after testnet resets. See [Recreating Channel Accounts](#recreating-channel-accounts) below.

---

### Payment Failed with Operation Error[](#payment-failed-operation-error "Direct link to Payment Failed with Operation Error")

When a payment fails, the Status History shows a Horizon error with operation codes that explain why the transaction was rejected.

![Payment Failed Error](/assets/images/SDP45-631b4dcc55e36c5fc84c8cd5aec1749c.png)

#### Reading the Error[](#reading-the-error "Direct link to Reading the Error")

Look for the `operation codes` at the end of the error message:

```
Extras=transaction: tx_fee_bump_inner_failed - inner transaction: tx_failed - operation codes: [ op_no_trust ]
```

The operation code (e.g., `op_no_trust`) tells you exactly what went wrong.

#### Common Operation Codes[](#common-operation-codes "Direct link to Common Operation Codes")

| Code | Meaning | Solution |
| --- | --- | --- |
| `op_no_trust` | Receiver hasn't established a trustline for this asset | Receiver must add a trustline for the asset (e.g., EURC) before they can receive it |
| `op_underfunded` | Source account doesn't have enough of the asset | Fund the distribution account with more of the asset |
| `op_no_destination` | Destination account doesn't exist | Receiver must create and fund their Stellar account first |

Trustlines explained

On Stellar, accounts must explicitly "trust" an asset before receiving it. This is a security featureit prevents spam tokens. The receiver needs to add a trustline for the specific asset (like EURC) using their wallet or a Stellar tool.

#### Example: `op_no_trust`[](#example-op_no_trust "Direct link to example-op_no_trust")

Full error message

```
horizon response error: StatusCode=400, Type=https://stellar.org/horizon-errors/transaction_failed,  
Title=Transaction Failed, Detail=The transaction failed when submitted to the stellar network.  
The `extras.result_codes` field on this response contains further details.  
Descriptions of each code can be found at: ../data/apis/horizon/api-reference/errors/http-status-codes/horizon-specific/transaction-failed/,  
Extras=transaction: tx_fee_bump_inner_failed - inner transaction: tx_failed - operation codes: [ op_no_trust ]
```

**Diagnosis:** The receiver account exists but hasn't added a trustline for the asset you're trying to send (in this case, EURC).

**Solution:** The receiver must add a trustline for the asset before the payment can succeed. Once they've done so, use the **Retry** button in the dashboard to resubmit the payment.

For a complete list of operation result codes, see the [Stellar documentation](../data/apis/horizon/api-reference/errors/result-codes/operation-specific/payment).

---

### Slow Payments Due to Insufficient Channel Accounts[](#slow-payments-due-to-insufficient-channel-accounts "Direct link to Slow Payments Due to Insufficient Channel Accounts")

If payments are processing slower than expected, you may not have enough channel accounts. Channel accounts allow the SDP to submit multiple transactions in parallel. Without enough of them, transactions queue up and process sequentially.

#### Symptoms[](#symptoms "Direct link to Symptoms")

* Large disbursements take longer than expected to complete
* Payments sit in "Pending" status longer than usual before being submitted

#### 1. Check Current Channel Account Count[](#1-check-current-channel-account-count "Direct link to 1. Check Current Channel Account Count")

View how many channel accounts are currently configured:

```
./stellar-disbursement-platform channel-accounts view
```

#### 2. Add More Channel Accounts[](#2-add-more-channel-accounts "Direct link to 2. Add More Channel Accounts")

Use the `ensure` command to increase the number of channel accounts. This command is idempotentit only creates new accounts if you have fewer than the specified number:

```
# Ensure you have at least 10 channel accounts  
./stellar-disbursement-platform channel-accounts ensure 10
```

How many channel accounts do you need?

The optimal number depends on your disbursement volume:

* **Low volume** (< 100 payments/day): 25 accounts
* **Normal volume** (> 100 payments/day): 510 accounts

Start with a conservative number and increase if you notice slow processing times.

#### 3. Verify TSS Configuration[](#3-verify-tss-configuration "Direct link to 3. Verify TSS Configuration")

The TSS service also has a configuration for how many channel accounts it should utilize. Check that your `--num-channel-accounts` flag (or `NUM_CHANNEL_ACCOUNTS` environment variable) matches or is less than the number of accounts you created:

```
# In your TSS configuration  
--num-channel-accounts=10
```

If this value is higher than the actual number of channel accounts available, TSS will only use what exists.

---

## Receiver Communications[](#receiver-communications "Direct link to Receiver Communications")

Issues with invitations, OTPs, and other messages sent to receivers.

### Receiver Not Receiving the Invitation[](#receiver-not-receiving-invitation "Direct link to Receiver Not Receiving the Invitation")

When you trigger a disbursement targeting an unregistered receiver (via email, SMS, or WhatsApp), they should receive an invitation link to register. If they haven't received it, work through these checks.

#### 1. Verify Scheduler Configuration[](#1-verify-scheduler-configuration "Direct link to 1. Verify Scheduler Configuration")

The invitation job runs on a schedule controlled by an environment variable:

```
SCHEDULER_RECEIVER_INVITATION_JOB_SECONDS=30
```

**Check:** Is this set to a reasonable interval (1060 seconds)? If it's set too high or missing, invitations may be significantly delayed.

#### 2. Check SDP Logs for Submission Failures[](#check-logs-submission-failures "Direct link to 2. Check SDP Logs for Submission Failures")

The SDP logs will show whether the message was sent and if the messaging provider accepted or rejected it.

```
# Look for messaging-related entries  
docker logs <sdp-container-name> 2>&1 | grep -iE "invitation|otp|message"
```

**Common provider issues:**

| Provider | Typical Failure | What to Check |
| --- | --- | --- |
| AWS SES | Rate limiting, sandbox mode | Are you in production mode? Check sending limits in AWS console |
| Twilio (SMS) | Geofencing, unverified numbers | Is the destination country enabled? Is your sender ID verified? |
| Twilio (WhatsApp) | Template not approved, 24h window | Is your message template approved? Are you outside the 24h conversation window? |

> **Tip:** If you're testing, check spam/junk folders firstespecially for email invitations.

#### 3. Verify Receiver Contact Info[](#3-verify-receiver-contact-info "Direct link to 3. Verify Receiver Contact Info")

Double-check that the receiver's contact information (email, phone number) in the disbursement file is:

* Correctly formatted (e.g., phone numbers include country code)
* Valid and reachable
* Not a duplicate that was already processed

---

### Receiver Not Receiving OTP During Registration[](#receiver-not-receiving-otp "Direct link to Receiver Not Receiving OTP During Registration")

During registration, receivers enter the contact details (phone number or email) that the payer used when submitting the disbursement. The SDP sends an OTP to verify ownership of that contact method.

#### 1. Check for Mismatched Contact Info (Most Common)[](#1-check-for-mismatched-contact-info-most-common "Direct link to 1. Check for Mismatched Contact Info (Most Common)")

The most frequent cause is the receiver entering a different email or phone number than what the payer submittedoften without realizing it.

**How to verify:** Check the `receiver_registration_attempts` table, which logs attempts from contacts that couldn't be matched to any receiver in the system.

```
SELECT * FROM sdp_<tenant_name>.receiver_registration_attempts  
ORDER BY created_at DESC  
LIMIT 20;
```

If you see the receiver's attempted contact info here, it means:

* They entered something different from what's on file
* You may need to coordinate with the receiver to confirm which contact info is correct
* If the payer made an error, you may need to update the receiver's contact info or create a new disbursement

#### 2. Check for Provider Issues[](#2-check-for-provider-issues "Direct link to 2. Check for Provider Issues")

If the contact info matches but the OTP still isn't arriving, the issue is likely with the messaging provider. See [Check SDP Logs for Submission Failures](#check-logs-submission-failures) above for common provider issues and how to diagnose them.

---

## Channel Accounts[](#channel-accounts "Direct link to Channel Accounts")

### Recreating Channel Accounts[](#recreating-channel-accounts "Direct link to Recreating Channel Accounts")

After a testnet reset, your channel accounts no longer exist on-chain but are still referenced in the database. You need to clean up invalid accounts and create new ones.

Run these commands inside the TSS container:

```
# Step 1: Remove invalid accounts from the database  
./stellar-disbursement-platform channel-account verify --delete-invalid-accounts  
  
# Step 2: Create new channel accounts (adjust the count as needed)  
./stellar-disbursement-platform channel-account ensure 10
```

> **Tip:** The `ensure` command is idempotentit only creates accounts if you have fewer than the specified number. Running `ensure 10` when you already have 10 valid accounts does nothing.

---

## Still Stuck?[](#still-stuck "Direct link to Still Stuck?")

If you've worked through the relevant sections and the issue persists:

1. **Collect logs** from all relevant services (SDP, TSS, Anchor Platform)
2. **Note the exact error message** and when it started occurring
3. **Check for recent changes** to configuration, environment, or network (e.g., testnet reset)

Contact us either by opening an issue on our [Backend GitHub repository](https://github.com/stellar/stellar-disbursement-platform-backend/issues) or [Frontend GitHub repository](https://github.com/stellar/stellar-disbursement-platform-frontend/issues) with the details above and the version of SDP you're running. We'll help you troubleshoot further! We're also available on Discord in the [#bulk-disbursements](https://discord.com/channels/897514728459468821/1310800776331006002) channel.