/**
 * Import brokers from Eraser's broker database into BrokerBane.
 *
 * Usage: node scripts/import-eraser-brokers.cjs
 *
 * Downloads Eraser's brokers.yaml, deduplicates against our existing database,
 * and appends new email-capable brokers.
 */
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const OUR_FILE = path.join(__dirname, '..', 'data', 'brokers.yaml');
const ERASER_FILE = '/tmp/eraser-brokers.yaml';

// Load our database
const ours = yaml.load(fs.readFileSync(OUR_FILE, 'utf-8'));
const ourIds = new Set(ours.brokers.map(b => b.id));
const ourDomains = new Set(ours.brokers.map(b => b.domain));

// Load Eraser database
const eraser = yaml.load(fs.readFileSync(ERASER_FILE, 'utf-8'));

// Map Eraser categories to ours
function mapCategory(cat) {
  const map = {
    'people-search': 'people_search',
    'background-check': 'background_check',
    'marketing': 'marketing_data',
  };
  return map[cat] || 'data_broker';
}

// Normalize ID: lowercase, replace spaces/special chars with underscore
function normalizeId(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

let imported = 0;
let skipped = 0;
let noEmail = 0;

for (const b of eraser.brokers) {
  // Must have email for email-based removal
  if (!b.email) { noEmail++; continue; }
  if (!b.website) continue;

  // Extract domain
  let domain;
  try {
    domain = new URL(b.website).hostname.replace('www.', '');
  } catch {
    continue;
  }

  // Deduplicate by ID and domain
  const id = normalizeId(b.id || b.name);
  if (ourIds.has(id) || ourDomains.has(domain)) {
    skipped++;
    continue;
  }

  // Determine removal method
  const hasOptOut = Boolean(b.opt_out_url);
  const removalMethod = hasOptOut ? 'hybrid' : 'email';

  // Build our broker entry
  const entry = {
    id,
    name: b.name,
    domain,
    email: b.email,
    region: b.region === 'global' ? 'us' : b.region,
    category: mapCategory(b.category),
    removal_method: removalMethod,
    requires_captcha: false,
    requires_email_confirm: false,
    requires_id_upload: false,
    difficulty: 'medium',
    tier: 3,
    public_directory: b.category === 'people-search',
    verify_before_send: false,
  };

  // Add opt_out_url if available
  if (b.opt_out_url) {
    entry.opt_out_url = b.opt_out_url;
  }

  // Track and add
  ourIds.add(id);
  ourDomains.add(domain);
  ours.brokers.push(entry);
  imported++;
}

// Update metadata
ours.updated = new Date().toISOString().split('T')[0];

// Write back
fs.writeFileSync(OUR_FILE, yaml.dump(ours, {
  lineWidth: -1,
  noRefs: true,
  quotingType: '"',
  forceQuotes: false,
}));

console.log(`Import complete:`);
console.log(`  Imported: ${imported} new brokers`);
console.log(`  Skipped:  ${skipped} (already exist)`);
console.log(`  No email: ${noEmail} (skipped)`);
console.log(`  Total:    ${ours.brokers.length} brokers in database`);
