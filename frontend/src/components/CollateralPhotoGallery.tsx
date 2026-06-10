import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CollateralPhoto } from '@/types';

interface CollateralPhotoGalleryProps {
    photos: CollateralPhoto[];
    offerName?: string;
}

/**
 * Read-only gallery for collateral asset photos.
 * Thumbnail grid → click opens a lightbox with prev/next navigation.
 * Renders nothing when the offer has no photos.
 */
export function CollateralPhotoGallery({ photos, offerName }: CollateralPhotoGalleryProps) {
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    if (!photos || photos.length === 0) return null;

    const current = lightboxIndex !== null ? photos[lightboxIndex] : null;

    const step = (direction: -1 | 1) => {
        setLightboxIndex(i => (i === null ? i : (i + direction + photos.length) % photos.length));
    };

    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo, index) => (
                    <button
                        key={photo.hash}
                        type="button"
                        onClick={() => setLightboxIndex(index)}
                        className="relative group rounded-lg overflow-hidden border border-white/10 bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary/50"
                        aria-label={photo.caption || `Asset photo ${index + 1}`}
                    >
                        <img
                            src={photo.url}
                            alt={photo.caption || `${offerName || 'Asset'} photo ${index + 1}`}
                            className="w-full h-32 object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                        />
                        {photo.caption && (
                            <span className="absolute inset-x-0 bottom-0 px-2 py-1 bg-black/60 text-[11px] text-white/90 truncate text-left">
                                {photo.caption}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            <Dialog open={lightboxIndex !== null} onOpenChange={(open) => !open && setLightboxIndex(null)}>
                <DialogContent
                    className="max-w-4xl bg-black/95 border-white/10 p-4"
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowRight') step(1);
                        if (e.key === 'ArrowLeft') step(-1);
                    }}
                >
                    <DialogTitle className="sr-only">
                        {current?.caption || `${offerName || 'Asset'} photo ${lightboxIndex !== null ? lightboxIndex + 1 : ''}`}
                    </DialogTitle>
                    {current && (
                        <div className="relative">
                            <img
                                src={current.url}
                                alt={current.caption || `${offerName || 'Asset'} photo`}
                                className="w-full max-h-[70vh] object-contain rounded-md"
                            />
                            {photos.length > 1 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => step(-1)}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white/90 hover:bg-black/80 transition-colors"
                                        aria-label="Previous photo"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => step(1)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white/90 hover:bg-black/80 transition-colors"
                                        aria-label="Next photo"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </>
                            )}
                            <div className="mt-3 flex items-center justify-between text-xs text-white/70">
                                <span className="truncate">{current.caption || current.fileName || ''}</span>
                                {photos.length > 1 && lightboxIndex !== null && (
                                    <span className="shrink-0 ml-3 font-mono">{lightboxIndex + 1} / {photos.length}</span>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
