import { DetailRow, DetailSection } from '../shared';

export function InvestorDetail({ raw }: { raw: any }) {
    return (
        <>
            <DetailSection title="Basic Info">
                <div className="grid grid-cols-2 gap-4">
                    <DetailRow label="Name" value={raw.name} />
                    <DetailRow label="Email" value={raw.email} />
                    <DetailRow label="Document" value={raw.document} />
                    <DetailRow label="KYC Status" value={raw.kyc_status} />
                </div>
            </DetailSection>
            <DetailSection title="Wallet">
                <DetailRow
                    label="Smart Wallet"
                    value={
                        raw.stellarContractId ? (
                            <code className="text-xs text-emerald-400 bg-black/30 px-2 py-1 rounded break-all">
                                {raw.stellarContractId}
                            </code>
                        ) : (
                            <span className="text-zinc-500">Not created yet</span>
                        )
                    }
                />
            </DetailSection>
            <DetailSection title="Timeline">
                <DetailRow label="Applied" value={new Date(raw.created_at).toLocaleString()} />
                {raw.last_login && (
                    <DetailRow label="Last Login" value={new Date(raw.last_login).toLocaleString()} />
                )}
            </DetailSection>
        </>
    );
}
