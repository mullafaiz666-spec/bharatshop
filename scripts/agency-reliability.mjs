import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

const DOMAINS = [
  ['accessibility', /\b(accessibility|wcag|screen reader|section 508)\b/i, /accessibility|wcag|508/i],
  ['security', /\b(security|authentication|authorization|vulnerability|permissions)\b/i, /security|authentication|penetration/i],
  ['commerce', /\b(cart|checkout|storefront|ecommerce|e-commerce|payment|catalog)\b/i, /commerce|backend|full.?stack|software|quality assurance|qa engineer/i],
  ['fashion', /\b(fashion|streetwear|garment|clothing)\b/i, /fashion|apparel|clothing|design/i],
  ['marketing', /\b(marketing|campaign|seo|advertising)\b/i, /marketing|seo|advertis/i],
  ['engineering', /\b(code|repository|typescript|javascript|api|software|unit test|integration test)\b/i, /software|backend|frontend|full.?stack|quality assurance|qa engineer/i],
];
const STOP = new Set('local qa smoke test calculate multiplied explain check answer keep each specialist report final under words not access external services perform actions please task output using with from this that'.split(' '));
export function selectSpecialists(agents, task) {
  const domains = DOMAINS.filter(([,pattern]) => pattern.test(task));
  const tokens = [...new Set(task.toLowerCase().match(/[a-z]{4,}/g) || [])].filter(x => !STOP.has(x));
  const ranked = agents.map(agent => {
    const identity = [agent.slug, agent.shortSlug, agent.name, agent.division].filter(Boolean).join(' ');
    const words = new Set((identity+' '+(agent.description || '')).toLowerCase().match(/[a-z]+/g) || []);
    const domainScore = domains.reduce((sum, [, , matcher]) => sum + (matcher.test(identity) ? 20 : 0), 0);
    const matches = tokens.filter(t => words.has(t)).length;
    // A named domain must match identity, not incidental prose in a long description.
    return { agent, score: domains.length ? (domainScore ? domainScore + Math.min(matches,5) : 0) : (matches >= 2 ? matches : 0) };
  }).filter(x => x.score > 0).sort((a,b) => b.score-a.score || String(a.agent.slug).localeCompare(String(b.agent.slug)));
  return ranked.slice(0,2).map(x=>x.agent);
}

export function arithmeticCheck(task) {
  // Deliberately narrow: one exact integer multiplication, never eval or free-form math.
  const matches = [...task.matchAll(/\b(?:calculate|what is)\s+(-?\d+)\s*(?:multiplied by|times|\*|×)\s*(-?\d+)\b/gi)];
  if (matches.length !== 1 || /\b(?:then|plus|minus|divided|percent|modulo|squared)\b/i.test(task)) return null;
  const [ , left, right ] = matches[0];
  const a=Number(left), b=Number(right), result=a*b;
  if (![a,b,result].every(Number.isSafeInteger)) return null;
  return { text: `${a} × ${b} = ${result}. Check: ${a} × (${b-1} + 1) = ${a*(b-1)} + ${a} = ${result}.`,
    execution: 'COMPLETED', validation: { status:'PASS', scope:'exact integer multiplication only', expected:result },
    selectedAgents:[], method:'deterministic arithmetic; no specialist inference claimed' };
}

export function validateDraft(text) {
  if (!String(text || '').trim()) return { status:'FAIL', scope:'output sanity', reason:'Empty answer' };
  if (/\b(?:wait,|no,\s*(?:use|simpler)|ignore my previous calculation)/i.test(text)) {
    return { status:'FAIL', scope:'output sanity', reason:'Unresolved self-correction in the final answer' };
  }
  return { status:'NEEDS_REVIEW', scope:'general model draft', reason:'No deterministic task-specific validator is available. Model agreement is not proof.' };
}

export function inspectFeature(root, feature) {
  if (!['cart','checkout','products','auth'].includes(feature)) throw new Error('Supported source checks: cart, checkout, products, auth.');
  const names = {cart:/cart/i, checkout:/checkout/i, products:/products?|catalog/i, auth:/auth|login|signin/i};
  const listing=execFileSync('git',['ls-files','-z','--','src','app','pages','components','lib','tests','test'],{cwd:root,encoding:'utf8',timeout:10000,maxBuffer:2000000});
  const candidates=listing.split('\0').filter(file=>file && names[feature].test(file) && /\.(?:[cm]?[jt]sx?)$/.test(file));
  const evidence=[]; const skipped=[]; const realRoot=realpathSync(root);
  for(const file of candidates.slice(0,80)) {
    try {
      const full=realpathSync(resolve(root,file));
      if(!full.startsWith(realRoot+sep)) {skipped.push({file,reason:'outside project'});continue;}
      const bytes=readFileSync(full);
      if(bytes.length>256000){skipped.push({file,reason:'size limit'});continue;}
      const lines=bytes.toString('utf8').split(/\r?\n/);
      const observations=[];
      lines.forEach((line,index)=>{
        for(const [label,pattern] of [
          ['HTTP handler declaration',/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/],
          ['browser storage reference',/\b(?:localStorage|sessionStorage)\b/],
          ['test declaration',/\b(?:test|it|describe)\s*\(/],
          ['authentication reference',/\b(?:getSession|auth|authenticate|requireAuth)\s*\(/],
        ]) if(pattern.test(line))observations.push({line:index+1,label});
      });
      evidence.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),lines:lines.length,observations:observations.slice(0,30)});
    }catch{skipped.push({file,reason:'unreadable'});}
  }
  return { execution:'COMPLETED', method:'fixed read-only tracked-source inspection', selectedAgents:[],
    validation:{status:'NEEDS_REVIEW',scope:'static source inventory only',reason:'Runtime behavior, authentication enforcement and test outcomes have not been verified.'},
    feature, candidateCount:candidates.length,truncated:candidates.length>80,evidence,skipped,
    text: evidence.length ? `Inspected ${evidence.length} tracked ${feature} source/test files. File hashes and line-numbered observations are in the saved report. This is source evidence, not a working-feature certification.` : `No readable tracked files matched ${feature}. Feature behavior is NOT VERIFIED.` };
}
