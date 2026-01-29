import { ExternalLink } from 'lucide-react';
import { Button } from './button';

interface TransactionLinkProps {
    hash?: string | null;
    network?: 'testnet' | 'public';
    label?: string;
    variant?: 'link' | 'default' | 'outline' | 'ghost';
    className?: string;
}

export function TransactionLink({
    hash,
    network = 'testnet',
    label = 'View on Explorer',
    variant = 'link',
    className
}: TransactionLinkProps) {
    if (!hash) return null;

    const baseUrl = network === 'testnet'
        ? 'https://stellar.expert/explorer/testnet/tx/'
        : 'https://stellar.expert/explorer/public/tx/';

    return (
        <Button
            variant={variant}
            size="sm"
            className={className}
            asChild
        >
            <a
                href={`${baseUrl}${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1"
            >
                {label}
                <ExternalLink className="w-3 h-3" />
            </a>
        </Button>
    );
}
