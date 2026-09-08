import { aiModels } from './provider';
const BAD = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten|dummyimage)/i;
export const MIN_IMAGES = 4;
export const MAX_IMAGES = 8;
export function minimumImageConfidence() {
  const configured = Number(process.env.IMAGE_VERIFY_MIN_CONFIDENCE ?? 0.75);
  return Number.isFinite(configured) ? Math.max(0.75, Math.min(1, configured)) : 0.75;
}
export function isVerifiedMedia(row: { imageUrl: string; verificationStatus: unknown; verificationConfidence: unknown; verificationProvider: unknown; verificationModel: unknown; verifiedAt: unknown }) {
  const confidence = Number(row.verificationConfidence);
  return row.verificationStatus === 'AI_VISION_VERIFIED' && row.verificationProvider === 'local-ai'
    && row.verificationModel === aiModels().vision && !!row.verifiedAt
    && /^https:\/\//i.test(row.imageUrl) && !BAD.test(row.imageUrl)
    && Number.isFinite(confidence) && confidence >= minimumImageConfidence() && confidence <= 1;
}
