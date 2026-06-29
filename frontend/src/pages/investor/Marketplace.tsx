import { useNavigate } from "react-router-dom";
import { useOffers } from "@/hooks/useOffers";
import { OfferingShowcase } from "@/components/invest/OfferingShowcase";
import { authStorage } from "@/utils/authStorage";

export function Marketplace() {
    const { offers, loading, error } = useOffers();
    const navigate = useNavigate();
    const isGuest = !authStorage.isAuthenticated('investor');
    const user = authStorage.getUser<{ kycStatus?: string }>('investor') || {};

    return (
        <OfferingShowcase
            offers={offers}
            loading={loading}
            error={error}
            kycPending={user.kycStatus === 'pending'}
            // Guests can browse the deal page; "Review & invest" sends them to login.
            onInvest={(id) => navigate(isGuest ? '/login' : `/market/${id}`)}
        />
    );
}
