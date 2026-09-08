import { POST as resolveImages } from '../../catalog/image-resolve/route';
export const dynamic = 'force-dynamic';
// Legacy entry point uses the same authenticated resolver and publication policy.
export async function POST(req: Request) { return resolveImages(req); }
export async function GET() { return Response.json({ agent: 'Image-Verification-Agent', status: 'not_tested', provider: 'searxng+local-ai-vision', batchLimit: 5 }); }
